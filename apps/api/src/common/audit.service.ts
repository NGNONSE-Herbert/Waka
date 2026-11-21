import { Inject, Injectable } from '@nestjs/common';
import { asc, sql } from 'drizzle-orm';
import type { Database, DbOrTx, Tx } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { canonicalJson, sha256 } from './crypto.js';
import { currentRequestId, requestContext } from './logger.js';
import { DATABASE } from './tokens.js';

export interface AuditEntry {
  actorType: 'STAFF' | 'USER' | 'SYSTEM' | 'PSP';
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

export const GENESIS_HASH = '0'.repeat(64);
const AUDIT_LOCK_KEY = 7_201_337;

const hashOf = (v: unknown): string | null => (v === undefined ? null : sha256(canonicalJson(v)));

/**
 * Journal d'audit append-only (trigger SQL) et chaîné : hash = sha256(prev_hash || json canonique).
 * L'ajout est sérialisé par un verrou consultatif transactionnel pour garantir une chaîne linéaire.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async append(entry: AuditEntry, tx?: Tx): Promise<void> {
    if (tx) return this.appendIn(tx, entry);
    await this.database.db.transaction((t) => this.appendIn(t, entry));
  }

  private async appendIn(tx: Tx, e: AuditEntry): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`);
    const last = await tx.select({ hash: auditLogs.hash }).from(auditLogs).orderBy(sql`${auditLogs.id} DESC`).limit(1);
    const prevHash = last[0]?.hash ?? GENESIS_HASH;
    const at = new Date();
    const record = {
      at: at.toISOString(),
      actorType: e.actorType,
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      beforeHash: hashOf(e.before),
      afterHash: hashOf(e.after),
      ip: e.ip ?? requestContext.getStore()?.ip ?? null,
      reason: e.reason ?? null,
      requestId: currentRequestId() ?? null,
    };
    const hash = sha256(prevHash + canonicalJson(record));
    await tx.insert(auditLogs).values({ ...record, at, prevHash, hash });
  }

  /** Recalcule la chaîne complète ; renvoie l'id de la première entrée corrompue, ou null. */
  async verifyChain(dbx: DbOrTx = this.database.db): Promise<{ valid: boolean; brokenAt: number | null; count: number }> {
    const all = await dbx.select().from(auditLogs).orderBy(asc(auditLogs.id));
    let prev = GENESIS_HASH;
    for (const r of all) {
      const record = {
        at: r.at.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        beforeHash: r.beforeHash,
        afterHash: r.afterHash,
        ip: r.ip,
        reason: r.reason,
        requestId: r.requestId,
      };
      if (r.prevHash !== prev || sha256(prev + canonicalJson(record)) !== r.hash) return { valid: false, brokenAt: r.id, count: all.length };
      prev = r.hash;
    }
    return { valid: true, brokenAt: null, count: all.length };
  }
}
