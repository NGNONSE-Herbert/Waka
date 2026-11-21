import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { type Database, type DbOrTx, rows } from '../db/client.js';
import { outboxJobs } from '../db/schema.js';
import type { JsonLogger } from '../common/logger.js';
import { CONFIG, DATABASE, LOGGER } from '../common/tokens.js';

export interface EnqueueOptions {
  runAt?: Date;
  /** Clé de déduplication : un même travail n'est enfilé qu'une fois. */
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * File de travaux asynchrones. L'implémentation MVP est une outbox transactionnelle Postgres :
 * un travail enfilé dans la même transaction que l'effet métier n'est jamais perdu ni orphelin.
 * Une implémentation BullMQ/Redis pourra être branchée derrière la même interface.
 */
export interface JobQueue {
  enqueue(dbx: DbOrTx, type: string, payload: Record<string, unknown>, opts?: EnqueueOptions): Promise<void>;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class OutboxQueue implements JobQueue {
  async enqueue(dbx: DbOrTx, type: string, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<void> {
    await dbx
      .insert(outboxJobs)
      .values({ type, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey ?? null, maxAttempts: opts.maxAttempts ?? 5 })
      .onConflictDoNothing({ target: outboxJobs.dedupeKey });
  }
}

/**
 * Travailleur en processus : sondage périodique, reprise bornée avec backoff exponentiel,
 * passage en DEAD (lettre morte) après `max_attempts`. Les tâches périodiques (balayage des
 * holds expirés) s'exécutent à chaque tick.
 */
@Injectable()
export class OutboxWorker implements OnApplicationShutdown {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly periodic: Array<{ name: string; fn: (now: Date) => Promise<void> }> = [];
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: JsonLogger,
  ) {}

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }
  registerPeriodic(name: string, fn: (now: Date) => Promise<void>): void {
    this.periodic.push({ name, fn });
  }

  start(): void {
    if (this.timer || !this.config.outboxWorker) return;
    this.timer = setInterval(() => {
      if (!this.running && !this.stopped) {
        this.running = this.tick()
          .then(() => undefined)
          .catch((e: unknown) => this.logger.errorFields('outbox.tick_failed', { err: (e as Error).message }))
          .finally(() => (this.running = null));
      }
    }, this.config.outboxPollMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** Un passage : tâches périodiques puis travaux échus. Renvoie le nombre de travaux traités. */
  async tick(now = new Date()): Promise<number> {
    for (const p of this.periodic) {
      try {
        await p.fn(now);
      } catch (e) {
        this.logger.errorFields('Tâche périodique en échec', { task: p.name, err: (e as Error).message });
      }
    }
    const db = this.database.db;
    const claimed = await db.transaction(async (tx) =>
      rows<{ id: number; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }>(
        tx,
        sql`UPDATE outbox_jobs SET status = 'PROCESSING', locked_at = now()
            WHERE id IN (
              SELECT id FROM outbox_jobs
              WHERE (status = 'PENDING' AND run_at <= ${now})
                 OR (status = 'PROCESSING' AND locked_at < now() - interval '5 minutes')
              ORDER BY run_at, id LIMIT 25 FOR UPDATE SKIP LOCKED)
            RETURNING id::int AS id, type, payload, attempts, max_attempts`,
      ),
    );
    for (const job of claimed) {
      const handler = this.handlers.get(job.type);
      try {
        if (!handler) throw new Error(`Aucun gestionnaire pour ${job.type}`);
        await handler(job.payload);
        await db.execute(sql`UPDATE outbox_jobs SET status = 'DONE', done_at = now(), attempts = attempts + 1, locked_at = NULL WHERE id = ${job.id}`);
      } catch (e) {
        const attempts = job.attempts + 1;
        const dead = attempts >= job.max_attempts;
        const backoffMs = Math.min(60_000, 1000 * 2 ** attempts);
        await db.execute(sql`UPDATE outbox_jobs SET attempts = ${attempts}, status = ${dead ? 'DEAD' : 'PENDING'},
            last_error = ${String((e as Error).message).slice(0, 500)}, locked_at = NULL,
            run_at = ${new Date(now.getTime() + backoffMs)} WHERE id = ${job.id}`);
        this.logger.warnFields('Travail outbox en échec', { jobId: job.id, type: job.type, attempts, dead, err: (e as Error).message });
      }
    }
    return claimed.length;
  }

  /** Traite tous les travaux échus à `now` jusqu'à épuisement (tests, démo). */
  async drain(now?: Date, maxRounds = 20): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      // Les travaux créés pendant le passage précédent (horodatés « maintenant ») sont aussi échus.
      const at = new Date(Math.max(now?.getTime() ?? 0, Date.now()));
      const n = await this.tick(at);
      if (n === 0) return;
    }
  }
}
