import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { PaymentOutput } from '@waka/contracts';
import {
  checkCollectionMatches,
  DomainError,
  Journals,
  maskPhone,
  normalizeCmPhone,
  type PaymentChannel,
  type PaymentProvider,
  type VerifiedWebhookEvent,
} from '@waka/domain';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { type Database, type Tx } from '../db/client.js';
import { anomalies, bookings, disputeEvents, disputes, idempotencyRecords, paymentEvents, payments, payouts, refunds, trips } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import { canonicalJson, randomDigits, Sealer, sha256 } from '../common/crypto.js';
import { HttpError } from '../common/errors.js';
import type { JsonLogger } from '../common/logger.js';
import { CONFIG, DATABASE, LOGGER, PAYMENT_PROVIDERS } from '../common/tokens.js';
import { ViewsService } from '../common/views.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationsService } from '../outbox/notifications.service.js';
import { OutboxQueue, OutboxWorker } from '../outbox/outbox.js';
import { cancelBooking, lockBooking, lockPayment, lockPaymentByBooking, setBookingState, setPaymentState, walkBooking, walkPayment } from '../bookings/booking-ops.js';
import type { ProviderRegistry } from './providers.js';

const PAY_ROUTE = 'POST /v1/bookings/:id/payments';

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly sealer: Sealer;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: JsonLogger,
    @Inject(PAYMENT_PROVIDERS) readonly providers: ProviderRegistry,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(OutboxQueue) private readonly queue: OutboxQueue,
    @Inject(OutboxWorker) private readonly worker: OutboxWorker,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ViewsService) private readonly views: ViewsService,
  ) {
    this.sealer = new Sealer(config.appSecret);
  }

  get provider(): PaymentProvider {
    return this.providers.active;
  }
  private get db() {
    return this.database.db;
  }

  onModuleInit(): void {
    this.worker.register('payment.refund_late_capture', async (p) => this.refundLateCapture(String(p.paymentId)));
    this.worker.register('refund.execute', async (p) => this.executeRefund(String(p.refundId)));
    this.worker.register('payout.execute', async (p) => this.executePayout(String(p.payoutId)));
    this.worker.register('webhook.reprocess', async (p) => this.reprocessEvent(String(p.eventRowId)));
    this.worker.register('mockpsp.complete', async (p) => {
      await this.mockComplete(String(p.ref), p.outcome === 'FAILED' ? 'FAILED' : 'SUCCEEDED');
    });
  }

  // ─── Initiation d'un encaissement ──────────────────────────────────────────
  async initiate(userId: string, bookingId: string, input: { channel: PaymentChannel; payerPhone: string }, idemKey: string): Promise<PaymentOutput> {
    const requestHash = sha256(canonicalJson({ bookingId, ...input }));
    const [prior] = await this.db
      .select()
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.userId, userId), eq(idempotencyRecords.route, PAY_ROUTE), eq(idempotencyRecords.key, idemKey)));
    if (prior) {
      if (prior.requestHash !== requestHash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Cette clé d’idempotence a déjà servi pour une autre requête.');
      // Rejeu : on renvoie l'état COURANT du même paiement (jamais un second encaissement).
      const pid = (prior.responseBody as { id: string }).id;
      const [p] = await this.db.select().from(payments).where(eq(payments.id, pid));
      return p ? this.views.paymentOutput(p) : (prior.responseBody as PaymentOutput);
    }
    const payer = normalizeCmPhone(input.payerPhone);
    const provider = this.provider;
    if (!provider.capabilities.channels.includes(input.channel)) {
      throw new DomainError('BLOCKED_BY_PROVIDER_CONTRACT', 'Ce moyen de paiement n’est pas disponible actuellement.');
    }
    const merchantRef = this.providers.mock?.merchantRef ?? this.config.mockPspMerchantRef;

    const payment = await this.db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!b || b.passengerId !== userId) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
      const existing = await lockPaymentByBooking(tx, b.id);
      if (existing) return existing; // un seul paiement par réservation (UNIQUE booking_id)
      if (b.state === 'CANCELLED') throw new DomainError('HOLD_EXPIRED', 'Le délai de réservation est dépassé ; les places ont été libérées.');
      if (b.state !== 'SEAT_HELD') throw new DomainError('INVALID_TRANSITION', 'Cette réservation ne peut plus être payée.');
      if (b.holdExpiresAt && b.holdExpiresAt.getTime() <= Date.now()) {
        throw new DomainError('HOLD_EXPIRED', 'Le délai de réservation est dépassé. Recommencez votre réservation.');
      }
      const [p] = await tx
        .insert(payments)
        .values({ bookingId: b.id, provider: provider.id, channel: input.channel, payerPhoneMasked: maskPhone(payer), amount: b.total, currency: 'XAF', state: 'CREATED', merchantRef })
        .returning();
      await setBookingState(tx, b, 'PAYMENT_PENDING');
      return p!;
    });

    let current = payment;
    if (!current.providerRef && current.state === 'CREATED') {
      // Appel PSP HORS transaction ; clé d'idempotence stable = id du paiement (aucun double débit en cas de reprise).
      const res = await provider.initiateCollection({
        paymentId: current.id,
        idempotencyKey: `collection:${current.id}`,
        amountXaf: current.amount,
        currency: 'XAF',
        channel: input.channel,
        payerMsisdn: payer,
        description: 'Réservation Waka',
      });
      current = await this.db.transaction(async (tx) => {
        const p = await lockPayment(tx, current.id);
        if (!p) throw new Error('paiement disparu');
        if (p.state !== 'CREATED') return p;
        if (res.status === 'FAILED') {
          const failed = await setPaymentState(tx, p, 'FAILED', { providerRef: res.providerRef });
          const b = await lockBooking(tx, p.bookingId);
          if (b && b.state === 'PAYMENT_PENDING') await cancelBooking(tx, b, 'PAYMENT_FAILED', { restoreSeats: true });
          return failed;
        }
        return setPaymentState(tx, p, 'PSP_PENDING', { providerRef: res.providerRef, customerInstruction: res.customerInstruction });
      });
    }
    const out = this.views.paymentOutput(current);
    await this.db
      .insert(idempotencyRecords)
      .values({ userId, route: PAY_ROUTE, key: idemKey, requestHash, statusCode: 201, responseBody: out })
      .onConflictDoNothing();
    return out;
  }

  // ─── Webhooks ───────────────────────────────────────────────────────────────
  /**
   * 1) signature + horodatage ; 2) enregistrement unique de l'événement (doublon ⇒ no-op) ;
   * 3) re-interrogation du PSP ; 4) transition sous verrou. Les événements hors ordre sont sûrs
   * car l'état est toujours relu chez le prestataire avant toute transition.
   */
  async handleWebhook(providerId: string, rawBody: string, headers: Record<string, string | undefined>): Promise<{ received: true; duplicate: boolean; outcome: string | null }> {
    const provider = this.providers.byId.get(providerId);
    if (!provider) throw new DomainError('NOT_FOUND', 'Prestataire inconnu.');
    const event = provider.verifyWebhook(rawBody, headers);
    const inserted = await this.db
      .insert(paymentEvents)
      .values({ provider: provider.id, eventId: event.eventId, type: event.type, providerRef: event.providerRef, payload: rawBody })
      .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.eventId] })
      .returning({ id: paymentEvents.id });
    let rowId = inserted[0]?.id;
    if (!rowId) {
      const [ex] = await this.db
        .select()
        .from(paymentEvents)
        .where(and(eq(paymentEvents.provider, provider.id), eq(paymentEvents.eventId, event.eventId)));
      if (!ex || ex.processedAt) return { received: true, duplicate: true, outcome: ex?.outcome ?? null };
      rowId = ex.id; // reçu mais jamais traité (échec antérieur) : on retente, le traitement est idempotent
    }
    try {
      const outcome = await this.processEvent(provider, event);
      await this.db.update(paymentEvents).set({ processedAt: new Date(), outcome }).where(eq(paymentEvents.id, rowId));
      this.logger.info('webhook.processed', { provider: provider.id, type: event.type, outcome });
      return { received: true, duplicate: !inserted[0], outcome };
    } catch (e) {
      // Accusé de réception conservé ; reprise asynchrone bornée via l'outbox.
      await this.queue.enqueue(this.db, 'webhook.reprocess', { eventRowId: rowId }, { dedupeKey: `webhook:${rowId}`, runAt: new Date(Date.now() + 2000) });
      this.logger.errorFields('webhook.failed', { provider: provider.id, type: event.type, err: (e as Error).message });
      throw e;
    }
  }

  private async reprocessEvent(eventRowId: string): Promise<void> {
    const [ev] = await this.db.select().from(paymentEvents).where(eq(paymentEvents.id, eventRowId));
    if (!ev || ev.processedAt) return;
    const provider = this.providers.byId.get(ev.provider);
    if (!provider) return;
    const outcome = await this.processEvent(provider, JSON.parse(ev.payload) as VerifiedWebhookEvent);
    await this.db.update(paymentEvents).set({ processedAt: new Date(), outcome }).where(eq(paymentEvents.id, ev.id));
  }

  private async processEvent(provider: PaymentProvider, event: VerifiedWebhookEvent): Promise<string> {
    if (event.type.startsWith('collection.')) return this.onCollection(provider, event.providerRef);
    if (event.type.startsWith('payout.')) return this.onPayout(provider, event.providerRef);
    return this.onRefund(provider, event.providerRef);
  }

  private async onCollection(provider: PaymentProvider, ref: string): Promise<string> {
    const [known] = await this.db.select().from(payments).where(eq(payments.providerRef, ref));
    if (!known) return 'UNMATCHED';
    const snap = await provider.getPaymentStatus(ref);
    const verdict = checkCollectionMatches({ amountXaf: known.amount, merchantRef: known.merchantRef }, snap);
    let lateCapturePaymentId: string | null = null;
    const outcome = await this.db.transaction(async (tx) => {
      const p = await lockPayment(tx, known.id);
      if (!p) return 'UNMATCHED';
      const b = await lockBooking(tx, p.bookingId);
      if (!b) return 'UNMATCHED';
      if (verdict === 'PENDING') return 'PENDING';
      if (p.state !== 'PSP_PENDING') return `NOOP_${p.state}`; // déjà traité ou hors ordre : rien ne change

      if (verdict === 'ANOMALY') {
        await setPaymentState(tx, p, 'MANUAL_REVIEW');
        await tx.insert(anomalies).values({
          kind: 'COLLECTION_MISMATCH',
          paymentId: p.id,
          bookingId: b.id,
          details: { expected: { amount: p.amount, currency: 'XAF', merchantRef: p.merchantRef }, provider: { amount: snap.amountXaf, currency: snap.currency, merchantRef: snap.merchantRef } },
        });
        await this.audit.append({ actorType: 'PSP', actorId: provider.id, action: 'payment.anomaly', entityType: 'payment', entityId: p.id, after: { state: 'MANUAL_REVIEW' } }, tx);
        return 'ANOMALY';
      }
      if (verdict === 'FAILED') {
        await setPaymentState(tx, p, 'FAILED');
        if (b.state === 'PAYMENT_PENDING') {
          await cancelBooking(tx, b, 'PAYMENT_FAILED', { restoreSeats: true });
          await this.notifications.notify(tx, b.passengerId, 'booking.cancelled', { route: await this.routeLabel(tx, b.tripId), detail: 'Le paiement a échoué.' });
        }
        return 'FAILED';
      }
      // CONFIRMED par le PSP : les fonds sont détenus par le partenaire ⇒ écriture d'encaissement.
      await this.ledger.post(tx, Journals.collectionConfirmed(b.id, ref, b.driverAmount, b.serviceFee), ref);
      if (b.state === 'PAYMENT_PENDING' && !b.seatsReleased) {
        await setPaymentState(tx, p, 'PSP_CONFIRMED_HELD', { capturedAt: new Date() });
        const pin = randomDigits(4);
        await setBookingState(tx, b, 'CONFIRMED', { boardingPinHash: sha256(`${b.id}:${pin}`), boardingPinEnc: this.sealer.seal(pin), holdExpiresAt: null });
        const route = await this.routeLabel(tx, b.tripId);
        await this.notifications.notify(tx, b.passengerId, 'booking.confirmed', { route, bookingId: b.id }, `confirmed:${b.id}`);
        const [t] = await tx.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, b.tripId));
        if (t) await this.notifications.notify(tx, t.driverId, 'booking.new_for_driver', { route, bookingId: b.id }, `driver-confirmed:${b.id}`);
        return 'CONFIRMED';
      }
      // Succès PSP arrivé APRÈS expiration (places déjà libérées) : jamais CONFIRMED ⇒ revue + remboursement.
      await setPaymentState(tx, p, 'MANUAL_REVIEW', { capturedAt: new Date() });
      await tx.insert(anomalies).values({ kind: 'LATE_CAPTURE_AFTER_EXPIRY', paymentId: p.id, bookingId: b.id, details: { bookingState: b.state } });
      await this.queue.enqueue(tx, 'payment.refund_late_capture', { paymentId: p.id }, { dedupeKey: `late-capture:${p.id}` });
      lateCapturePaymentId = p.id;
      return 'LATE_CAPTURE';
    });
    if (lateCapturePaymentId) this.logger.warnFields('payment.late_capture', { paymentId: lateCapturePaymentId });
    return outcome;
  }

  private async refundLateCapture(paymentId: string): Promise<void> {
    const refundId = await this.db.transaction(async (tx) => {
      const p = await lockPayment(tx, paymentId);
      if (!p || p.state !== 'MANUAL_REVIEW') return null;
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, p.bookingId));
      if (!b || b.state !== 'CANCELLED') return null;
      await setPaymentState(tx, p, 'REFUND_PENDING');
      const [r] = await tx
        .insert(refunds)
        .values({ bookingId: b.id, paymentId: p.id, amount: p.amount, fromDriverShare: b.driverAmount, fromFee: b.serviceFee, reason: 'LATE_CAPTURE_AFTER_EXPIRY' })
        .returning();
      return r!.id;
    });
    if (refundId) await this.executeRefund(refundId);
  }

  /** Crée une demande de remboursement dans une transaction appelante (somme ≤ capturé, vérifiée sous verrou). */
  async createRefundTx(tx: Tx, p: { id: string; amount: number; bookingId: string }, amount: number, fromDriverShare: number, fromFee: number, reason: string, disputeId: string | null): Promise<string> {
    const locked = await lockPayment(tx, p.id);
    if (!locked) throw new DomainError('NOT_FOUND', 'Paiement introuvable.');
    const [sum] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${refunds.amount}), 0)::int` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, p.id), ne(refunds.status, 'FAILED')));
    if (Number(sum?.total ?? 0) + amount > locked.amount) throw new DomainError('ALLOCATION_EXCEEDED', 'Remboursement supérieur au montant payé.');
    const [r] = await tx.insert(refunds).values({ bookingId: p.bookingId, paymentId: p.id, amount, fromDriverShare, fromFee, reason, disputeId }).returning();
    return r!.id;
  }

  /** Transmet un remboursement au PSP (idempotent : clé = id du remboursement). */
  async executeRefund(refundId: string): Promise<void> {
    const [r] = await this.db.select().from(refunds).where(eq(refunds.id, refundId));
    if (!r || r.status !== 'REQUESTED' || r.providerRef) return;
    const [p] = await this.db.select().from(payments).where(eq(payments.id, r.paymentId));
    if (!p?.providerRef) return;
    let res: { refundRef: string; status: string };
    try {
      res = await this.provider.requestRefund({ paymentProviderRef: p.providerRef, refundId: r.id, idempotencyKey: `refund:${r.id}`, amountXaf: r.amount, reason: r.reason });
    } catch (e) {
      await this.queue.enqueue(this.db, 'refund.execute', { refundId }, { dedupeKey: `refund-exec:${refundId}`, runAt: new Date(Date.now() + 5000) });
      throw e;
    }
    await this.db.update(refunds).set({ providerRef: res.refundRef, status: 'PROCESSING', updatedAt: new Date() }).where(and(eq(refunds.id, r.id), eq(refunds.status, 'REQUESTED')));
    await this.scheduleMockCompletion(res.refundRef);
  }

  /** Transmet un versement au PSP uniquement si le paiement est en RELEASE_REQUESTED (séquencement sûr). */
  async executePayout(payoutId: string): Promise<void> {
    const [po] = await this.db.select().from(payouts).where(eq(payouts.id, payoutId));
    if (!po || po.status !== 'REQUESTED') return;
    const [p] = await this.db.select().from(payments).where(eq(payments.id, po.paymentId));
    if (!p?.providerRef || p.state !== 'RELEASE_REQUESTED') return;
    let res: { payoutRef: string; status: string };
    try {
      res = await this.provider.requestRelease({ paymentProviderRef: p.providerRef, payoutId: po.id, idempotencyKey: `payout:${po.id}`, amountXaf: po.amount, beneficiaryRef: po.beneficiaryUserId });
    } catch (e) {
      await this.queue.enqueue(this.db, 'payout.execute', { payoutId }, { dedupeKey: `payout-exec:${payoutId}`, runAt: new Date(Date.now() + 5000) });
      throw e;
    }
    await this.db.transaction(async (tx) => {
      const lp = await lockPayment(tx, p.id);
      const [lpo] = await tx.select().from(payouts).where(eq(payouts.id, po.id)).for('update');
      if (!lp || !lpo || lpo.status !== 'REQUESTED') return;
      await tx.update(payouts).set({ providerRef: res.payoutRef, status: 'PROCESSING', updatedAt: new Date() }).where(eq(payouts.id, po.id));
      if (lp.state === 'RELEASE_REQUESTED') await setPaymentState(tx, lp, 'PAYOUT_PROCESSING');
    });
    await this.scheduleMockCompletion(res.payoutRef);
  }

  private async scheduleMockCompletion(ref: string): Promise<void> {
    if (this.provider.mode !== 'MOCK') return;
    await this.queue.enqueue(this.db, 'mockpsp.complete', { ref, outcome: 'SUCCEEDED' }, { dedupeKey: `mock-complete:${ref}`, runAt: new Date(Date.now() + this.config.mockPayoutDelayMs) });
  }

  /** Simulateur MOCK : fait aboutir la transaction chez le « PSP » puis livre le webhook signé. */
  async mockComplete(ref: string, outcome: 'SUCCEEDED' | 'FAILED') {
    const mock = this.providers.mock;
    if (!mock) throw new DomainError('NOT_FOUND', 'Simulateur indisponible.');
    const delivery = await mock.complete(ref, outcome);
    if (!delivery) throw new DomainError('NOT_FOUND', 'Transaction simulée introuvable.');
    const res = await this.handleWebhook('mock', delivery.rawBody, delivery.headers);
    return { providerRef: ref, status: delivery.event.type, eventId: delivery.event.eventId, ...res };
  }

  private async onPayout(provider: PaymentProvider, ref: string): Promise<string> {
    const [known] = await this.db.select().from(payouts).where(eq(payouts.providerRef, ref));
    if (!known) return 'UNMATCHED';
    const status = (await provider.getPayoutStatus(ref)).status;
    if (status !== 'SUCCEEDED' && status !== 'FAILED') return 'PENDING';
    return this.db.transaction(async (tx) => {
      const p = await lockPayment(tx, known.paymentId);
      const [po] = await tx.select().from(payouts).where(eq(payouts.id, known.id)).for('update');
      if (!p || !po) return 'UNMATCHED';
      if (po.status === 'SUCCEEDED' || po.status === 'FAILED') return `NOOP_${po.status}`;
      if (status === 'FAILED') {
        await tx.update(payouts).set({ status: 'FAILED', updatedAt: new Date() }).where(eq(payouts.id, po.id));
        if (p.state === 'PAYOUT_PROCESSING' || p.state === 'RELEASE_REQUESTED') await setPaymentState(tx, p, 'MANUAL_REVIEW');
        await tx.insert(anomalies).values({ kind: 'PAYOUT_FAILED', paymentId: p.id, bookingId: po.bookingId, details: { payoutRef: ref } });
        return 'PAYOUT_FAILED';
      }
      await tx.update(payouts).set({ status: 'SUCCEEDED', updatedAt: new Date() }).where(eq(payouts.id, po.id));
      await this.ledger.post(tx, Journals.payoutConfirmed(po.bookingId, ref, po.amount), ref);
      if (p.state === 'RELEASE_REQUESTED' || p.state === 'PAYOUT_PROCESSING') await walkPayment(tx, p, ['PAYOUT_PROCESSING', 'PAID']);
      await this.notifications.notify(tx, po.beneficiaryUserId, 'payout.paid', { amount: po.amount }, `payout:${po.id}`);
      await this.settle(tx, po.bookingId);
      return 'PAYOUT_CONFIRMED';
    });
  }

  private async onRefund(provider: PaymentProvider, ref: string): Promise<string> {
    const [known] = await this.db.select().from(refunds).where(eq(refunds.providerRef, ref));
    if (!known) return 'UNMATCHED';
    const status = (await provider.getPayoutStatus(ref)).status;
    if (status !== 'SUCCEEDED' && status !== 'FAILED') return 'PENDING';
    let payoutToExecute: string | null = null;
    const outcome = await this.db.transaction(async (tx) => {
      const p = await lockPayment(tx, known.paymentId);
      const [r] = await tx.select().from(refunds).where(eq(refunds.id, known.id)).for('update');
      if (!p || !r) return 'UNMATCHED';
      if (r.status === 'SUCCEEDED' || r.status === 'FAILED') return `NOOP_${r.status}`;
      if (status === 'FAILED') {
        await tx.update(refunds).set({ status: 'FAILED', updatedAt: new Date() }).where(eq(refunds.id, r.id));
        if (p.state === 'REFUND_PENDING') await setPaymentState(tx, p, 'MANUAL_REVIEW');
        await tx.insert(anomalies).values({ kind: 'REFUND_FAILED', paymentId: p.id, bookingId: r.bookingId, details: { refundRef: ref } });
        return 'REFUND_FAILED';
      }
      await tx.update(refunds).set({ status: 'SUCCEEDED', updatedAt: new Date() }).where(eq(refunds.id, r.id));
      await this.ledger.post(tx, Journals.refundConfirmed(r.bookingId, ref, r.fromDriverShare, r.fromFee), ref);
      const [sum] = await tx
        .select({ total: sql<number>`COALESCE(SUM(${refunds.amount}), 0)::int` })
        .from(refunds)
        .where(and(eq(refunds.paymentId, p.id), eq(refunds.status, 'SUCCEEDED')));
      const refunded = Number(sum?.total ?? 0);
      let cur = p;
      if (cur.state === 'REFUND_PENDING') cur = await setPaymentState(tx, cur, refunded >= cur.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED');
      // Remboursement partiel d'une décision : le reliquat suit le chemin de versement.
      const [pendingPayout] = await tx.select().from(payouts).where(and(eq(payouts.bookingId, r.bookingId), eq(payouts.status, 'REQUESTED')));
      if (pendingPayout && cur.state === 'PARTIALLY_REFUNDED') {
        await setPaymentState(tx, cur, 'RELEASE_REQUESTED');
        payoutToExecute = pendingPayout.id;
      }
      const [b] = await tx.select({ passengerId: bookings.passengerId }).from(bookings).where(eq(bookings.id, r.bookingId));
      if (b) await this.notifications.notify(tx, b.passengerId, 'refund.confirmed', { amount: r.amount }, `refund:${r.id}`);
      await this.settle(tx, r.bookingId);
      return 'REFUND_CONFIRMED';
    });
    if (payoutToExecute) await this.executePayout(payoutToExecute);
    return outcome;
  }

  /**
   * Clôture financière d'une réservation quand TOUTES les instructions PSP sont confirmées :
   * reconnaissance des frais conservés, litige RESOLVED (uniquement après preuve PSP), réservation finale.
   */
  private async settle(tx: Tx, bookingId: string): Promise<void> {
    const rs = await tx.select().from(refunds).where(eq(refunds.bookingId, bookingId));
    const ps = await tx.select().from(payouts).where(eq(payouts.bookingId, bookingId));
    if ([...rs, ...ps].some((x) => x.status === 'REQUESTED' || x.status === 'PROCESSING')) return;
    if ([...rs, ...ps].some((x) => x.status === 'FAILED')) return; // revue manuelle
    const b = await lockBooking(tx, bookingId);
    if (!b) return;
    const refundedFee = rs.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + r.fromFee, 0);
    const feeRetained = b.serviceFee - refundedFee;
    const paidOut = ps.some((x) => x.status === 'SUCCEEDED');
    if (feeRetained > 0) await this.ledger.post(tx, Journals.feeRecognized(b.id, feeRetained));

    const [d] = await tx.select().from(disputes).where(and(eq(disputes.bookingId, b.id), eq(disputes.state, 'EXECUTION_PENDING'))).for('update');
    if (d) {
      await tx.update(disputes).set({ state: 'RESOLVED', resolvedAt: new Date(), updatedAt: new Date() }).where(eq(disputes.id, d.id));
      await tx.insert(disputeEvents).values({ disputeId: d.id, actorKind: 'PSP', label: 'Exécution confirmée par le partenaire de paiement — litige résolu' });
      await this.audit.append({ actorType: 'SYSTEM', actorId: null, action: 'dispute.resolved', entityType: 'dispute', entityId: d.id, after: { state: 'RESOLVED' } }, tx);
      await this.notifications.notify(tx, d.openerId, 'dispute.resolved', {}, `dispute-resolved-o:${d.id}`);
      await this.notifications.notify(tx, d.counterpartyId, 'dispute.resolved', {}, `dispute-resolved-c:${d.id}`);
    }
    if (b.state === 'DISPUTED') await setBookingState(tx, b, paidOut ? 'COMPLETED' : 'CANCELLED', paidOut ? {} : { cancelReason: 'DISPUTE_DECISION' });
    else if (paidOut && ['CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED'].includes(b.state)) await walkBooking(tx, b, ['IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED']);
  }

  private async routeLabel(tx: Tx, tripId: string): Promise<string> {
    const [t] = await tx.select({ o: trips.originCity, d: trips.destinationCity }).from(trips).where(eq(trips.id, tripId));
    return t ? `${t.o} → ${t.d}` : '';
  }

  /** Utilitaire : remboursements/versements engagés (non échoués) d'un paiement. */
  async committedAmounts(tx: Tx, paymentId: string): Promise<{ refunded: number; released: number }> {
    const [r] = await tx.select({ t: sql<number>`COALESCE(SUM(${refunds.amount}), 0)::int` }).from(refunds).where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, ['REQUESTED', 'PROCESSING', 'SUCCEEDED'])));
    const [o] = await tx.select({ t: sql<number>`COALESCE(SUM(${payouts.amount}), 0)::int` }).from(payouts).where(and(eq(payouts.paymentId, paymentId), inArray(payouts.status, ['REQUESTED', 'PROCESSING', 'SUCCEEDED'])));
    return { refunded: Number(r?.t ?? 0), released: Number(o?.t ?? 0) };
  }
}
