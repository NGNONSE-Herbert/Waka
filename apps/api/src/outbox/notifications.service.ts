import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { maskPhone } from '@waka/domain';
import { eq } from 'drizzle-orm';
import { type Database, type DbOrTx } from '../db/client.js';
import { notifications, users } from '../db/schema.js';
import type { JsonLogger } from '../common/logger.js';
import { DATABASE, LOGGER } from '../common/tokens.js';
import { OutboxQueue, OutboxWorker } from './outbox.js';

const TEMPLATES: Record<string, (p: Record<string, unknown>) => string> = {
  'booking.confirmed': (p) => `Waka : votre réservation est confirmée (${p.route}). Présentez votre code d'embarquement au conducteur.`,
  'booking.new_for_driver': (p) => `Waka : nouvelle réservation confirmée sur votre trajet ${p.route}.`,
  'booking.cancelled': (p) => `Waka : la réservation ${p.route} est annulée. ${p.detail ?? ''}`.trim(),
  'booking.hold_expired': (p) => `Waka : le délai de paiement pour ${p.route} est dépassé ; les places ont été libérées.`,
  'payout.paid': (p) => `Waka : versement de ${p.amount} FCFA confirmé par notre partenaire de paiement.`,
  'refund.confirmed': (p) => `Waka : remboursement de ${p.amount} FCFA confirmé par notre partenaire de paiement.`,
  'dispute.opened': () => 'Waka : un litige a été ouvert sur votre réservation. Vous pouvez déposer vos éléments.',
  'dispute.evidence_requested': (p) => `Waka : l'équipe Waka demande des éléments sur votre litige avant le ${p.dueAt}.`,
  'dispute.resolved': () => 'Waka : votre litige est résolu. Vous disposez de 7 jours pour demander un réexamen.',
  'trip.match': (p) => `Waka : un nouveau trajet correspond à votre demande ${p.route}.`,
};

/** Notifications (SMS simulé) : enfilées dans l'outbox avec l'effet métier, envoyées par le worker. */
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(LOGGER) private readonly logger: JsonLogger,
    @Inject(OutboxQueue) private readonly queue: OutboxQueue,
    @Inject(OutboxWorker) private readonly worker: OutboxWorker,
  ) {}

  onModuleInit(): void {
    this.worker.register('notification.send', (p) => this.deliver(p));
  }

  async notify(dbx: DbOrTx, userId: string, template: keyof typeof TEMPLATES | string, payload: Record<string, unknown> = {}, dedupeKey?: string): Promise<void> {
    await this.queue.enqueue(dbx, 'notification.send', { userId, template, payload }, dedupeKey ? { dedupeKey: `notif:${dedupeKey}` } : {});
  }

  private async deliver(job: Record<string, unknown>): Promise<void> {
    const userId = String(job.userId);
    const template = String(job.template);
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const [u] = await this.database.db.select({ phone: users.phoneE164 }).from(users).where(eq(users.id, userId));
    const text = (TEMPLATES[template] ?? (() => template))(payload);
    await this.database.db.insert(notifications).values({ userId, template, payload: { ...payload, text } });
    this.logger.info('notification.sent', { channel: 'SMS_MOCK', to: u ? maskPhone(u.phone) : null, template });
  }
}
