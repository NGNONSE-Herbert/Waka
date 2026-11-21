import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { BookingOutput, TripSummary } from '@waka/contracts';
import { DEFAULT_FEE_POLICY, DomainError, evaluateRelease, hasPermission, quote, validateAllocation } from '@waka/domain';
import { and, desc, eq, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type { AppConfig } from '../config.js';
import { type Database, rows, type Tx } from '../db/client.js';
import { bookings, disputes, payments, payouts, reviews, trips } from '../db/schema.js';
import { AuditService } from '../common/audit.service.js';
import { safeEqual, sha256 } from '../common/crypto.js';
import { HttpError } from '../common/errors.js';
import { type AuthUser, RateLimiter } from '../common/http.js';
import { CONFIG, DATABASE } from '../common/tokens.js';
import { toTripSummary, ViewsService } from '../common/views.service.js';
import { NotificationsService } from '../outbox/notifications.service.js';
import { OutboxQueue, OutboxWorker } from '../outbox/outbox.js';
import { PaymentsService } from '../payments/payments.service.js';
import { type BookingRow, cancelBooking, lockBooking, lockPaymentByBooking, setBookingState, setPaymentState, walkPayment } from './booking-ops.js';

const PIN_MAX_ATTEMPTS = 5;
const OPEN_DISPUTE_STATES = ['OPENED', 'TRIAGED', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'DECISION_PROPOSED', 'APPROVED', 'EXECUTION_PENDING', 'APPEALED'];

function pgErrorCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
}

@Injectable()
export class BookingsService implements OnModuleInit {
  readonly limiter = new RateLimiter();

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(ViewsService) private readonly views: ViewsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(OutboxQueue) private readonly queue: OutboxQueue,
    @Inject(OutboxWorker) private readonly worker: OutboxWorker,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.database.db;
  }

  onModuleInit(): void {
    this.worker.register('booking.expire_hold', async (p) => {
      await this.expireHold(String(p.bookingId), new Date());
    });
    this.worker.registerPeriodic('hold-expiry-sweep', async (now) => {
      await this.sweepExpiredHolds(now);
    });
  }

  // ─── Création (hold atomique) ───────────────────────────────────────────────
  async create(user: AuthUser, input: { tripId: string; seats: number }, idemKey: string): Promise<{ status: number; body: BookingOutput }> {
    if (!hasPermission({ userId: user.id, roles: user.roles }, 'booking:create')) throw new DomainError('FORBIDDEN', 'Permission manquante : booking:create');
    this.limiter.hit(`booking:${user.id}`, 30, 60_000);
    const replay = await this.findByIdempotencyKey(user.id, idemKey, input);
    if (replay) return { status: 200, body: replay };
    if (!/^[0-9a-f-]{36}$/i.test(input.tripId)) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');

    let bookingId: string;
    try {
      bookingId = await this.db.transaction(async (tx) => {
        const [trip] = await tx.select().from(trips).where(eq(trips.id, input.tripId));
        if (!trip) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
        if (trip.driverId === user.id) throw new DomainError('FORBIDDEN', 'Vous ne pouvez pas réserver votre propre trajet.');
        if (trip.status !== 'PUBLISHED' || trip.departureAt.getTime() <= Date.now()) {
          throw new DomainError('SEATS_UNAVAILABLE', 'Ce trajet n’est plus réservable.');
        }
        const q = quote(trip.seatPrice, input.seats, DEFAULT_FEE_POLICY); // prix 100 % serveur
        // Décrément atomique : jamais de survente, même sous concurrence (CHECK seats_available >= 0 en filet).
        const decremented = await rows<{ id: string }>(
          tx,
          sql`UPDATE trips SET seats_available = seats_available - ${input.seats}, version = version + 1
              WHERE id = ${trip.id} AND seats_available >= ${input.seats} AND status = 'PUBLISHED' AND departure_at > now()
              RETURNING id`,
        );
        if (decremented.length === 0) throw new DomainError('SEATS_UNAVAILABLE', 'Plus assez de places disponibles sur ce trajet.');
        const holdExpiresAt = new Date(Date.now() + this.config.holdTtlSeconds * 1000);
        const [b] = await tx
          .insert(bookings)
          .values({
            tripId: trip.id,
            passengerId: user.id,
            seats: input.seats,
            seatPrice: q.seatPrice,
            driverAmount: q.driverAmount,
            serviceFee: q.serviceFee,
            total: q.total,
            policyVersion: q.policyVersion,
            state: 'DRAFT',
            idempotencyKey: idemKey,
          })
          .returning();
        await setBookingState(tx, b!, 'SEAT_HELD', { holdExpiresAt });
        await this.queue.enqueue(tx, 'booking.expire_hold', { bookingId: b!.id }, { runAt: holdExpiresAt, dedupeKey: `hold:${b!.id}` });
        return b!.id;
      });
    } catch (e) {
      if (pgErrorCode(e) === '23505') {
        // Course entre deux requêtes portant la même clé : la seconde renvoie la réservation de la première.
        const again = await this.findByIdempotencyKey(user.id, idemKey, input);
        if (again) return { status: 200, body: again };
      }
      throw e;
    }
    return { status: 201, body: await this.views.bookingOutput(bookingId, user.id) };
  }

  private async findByIdempotencyKey(userId: string, key: string, input: { tripId: string; seats: number }): Promise<BookingOutput | null> {
    const [b] = await this.db.select().from(bookings).where(and(eq(bookings.passengerId, userId), eq(bookings.idempotencyKey, key)));
    if (!b) return null;
    if (b.tripId !== input.tripId || b.seats !== input.seats) {
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Cette clé d’idempotence a déjà servi pour une autre réservation.');
    }
    return this.views.bookingOutput(b.id, userId);
  }

  // ─── Expiration des holds ───────────────────────────────────────────────────
  async expireHold(bookingId: string, now: Date): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!b || !['SEAT_HELD', 'PAYMENT_PENDING'].includes(b.state) || !b.holdExpiresAt || b.holdExpiresAt > now) return false;
      await cancelBooking(tx, b, 'HOLD_EXPIRED', { restoreSeats: true });
      const [t] = await tx.select({ o: trips.originCity, d: trips.destinationCity }).from(trips).where(eq(trips.id, b.tripId));
      await this.notifications.notify(tx, b.passengerId, 'booking.hold_expired', { route: t ? `${t.o} → ${t.d}` : '' }, `hold-expired:${b.id}`);
      return true;
    });
  }

  async sweepExpiredHolds(now: Date): Promise<number> {
    const due = await this.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(inArray(bookings.state, ['SEAT_HELD', 'PAYMENT_PENDING']), lte(bookings.holdExpiresAt, now)))
      .limit(200);
    let n = 0;
    for (const d of due) if (await this.expireHold(d.id, now)) n++;
    return n;
  }

  // ─── Lecture (contrôle d'accès objet : participant uniquement, sinon 404) ──
  async loadForParticipant(bookingId: string, userId: string): Promise<{ booking: BookingRow; driverId: string }> {
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
    const [r] = await this.db.select({ booking: bookings, driverId: trips.driverId }).from(bookings).innerJoin(trips, eq(trips.id, bookings.tripId)).where(eq(bookings.id, bookingId));
    if (!r || (r.booking.passengerId !== userId && r.driverId !== userId)) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
    // Le conducteur ne voit pas les réservations non abouties (brouillon/hold).
    if (r.booking.passengerId !== userId && ['DRAFT', 'SEAT_HELD', 'PAYMENT_PENDING'].includes(r.booking.state)) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
    return r;
  }

  async detail(bookingId: string, userId: string): Promise<BookingOutput> {
    await this.loadForParticipant(bookingId, userId);
    return this.views.bookingOutput(bookingId, userId);
  }

  async mine(userId: string) {
    const list = await this.db.select({ id: bookings.id }).from(bookings).where(eq(bookings.passengerId, userId)).orderBy(desc(bookings.createdAt)).limit(100);
    const items = [];
    for (const b of list) items.push(await this.views.bookingOutput(b.id, userId));
    return { items, nextCursor: null };
  }

  // ─── Annulation par le passager ─────────────────────────────────────────────
  async cancelByPassenger(bookingId: string, user: AuthUser, reason?: string): Promise<BookingOutput> {
    const { booking, driverId } = await this.loadForParticipant(bookingId, user.id);
    if (booking.passengerId !== user.id) {
      throw new DomainError('FORBIDDEN', driverId === user.id ? 'Le conducteur annule le trajet entier, pas une réservation.' : 'Action non autorisée.');
    }
    let refundId: string | null = null;
    await this.db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (!b) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
      if (b.state === 'SEAT_HELD' || b.state === 'PAYMENT_PENDING') {
        await cancelBooking(tx, b, reason ?? 'PASSENGER_CANCELLED', { restoreSeats: true });
        return;
      }
      if (b.state !== 'CONFIRMED') throw new DomainError('INVALID_TRANSITION', 'Cette réservation ne peut plus être annulée.');
      const p = await lockPaymentByBooking(tx, b.id);
      if (!p || p.state !== 'PSP_CONFIRMED_HELD') throw new DomainError('INVALID_TRANSITION', 'Paiement non détenu : annulation impossible en l’état.');
      const [trip] = await tx.select().from(trips).where(eq(trips.id, b.tripId));
      const early = trip ? trip.departureAt.getTime() - Date.now() >= 24 * 3_600_000 : true;
      // Politique d'annulation : allocation validée par le domaine (rien n'est gardé de la part conducteur).
      const alloc = validateAllocation(
        { captured: p.amount, driverAmount: b.driverAmount, serviceFee: b.serviceFee, refunded: 0, released: 0 },
        { refundToPassenger: early ? b.total : b.driverAmount, releaseToDriver: 0 },
      );
      await setPaymentState(tx, p, 'REFUND_PENDING');
      refundId = await this.payments.createRefundTx(tx, p, alloc.refundToPassenger, alloc.refundFromDriverShare, alloc.refundFromFee, early ? 'PASSENGER_CANCELLED_EARLY' : 'PASSENGER_CANCELLED_LATE', null);
      await cancelBooking(tx, b, reason ?? 'PASSENGER_CANCELLED', { restoreSeats: true });
      await this.notifications.notify(tx, driverId, 'booking.cancelled', { route: trip ? `${trip.originCity} → ${trip.destinationCity}` : '', detail: 'Un passager a annulé.' });
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'booking.cancel', entityType: 'booking', entityId: b.id, before: { state: b.state }, after: { state: 'CANCELLED', refund: alloc.refundToPassenger } }, tx);
    });
    if (refundId) await this.payments.executeRefund(refundId);
    return this.views.bookingOutput(bookingId, user.id);
  }

  // ─── Embarquement par PIN (conducteur du trajet uniquement) ────────────────
  async checkIn(bookingId: string, user: AuthUser, pin: string): Promise<BookingOutput> {
    const { booking, driverId } = await this.loadForParticipant(bookingId, user.id);
    if (driverId !== user.id) throw new DomainError('FORBIDDEN', 'Seul le conducteur du trajet valide l’embarquement.');
    const result = await this.db.transaction(async (tx) => {
      const b = await lockBooking(tx, booking.id);
      if (!b) return { error: new DomainError('NOT_FOUND', 'Réservation introuvable.') };
      if (b.state !== 'CONFIRMED') return { error: new DomainError('INVALID_TRANSITION', 'Embarquement possible uniquement pour une réservation confirmée.') };
      if (b.pinAttempts >= PIN_MAX_ATTEMPTS) return { error: new DomainError('FORBIDDEN', 'Code verrouillé après trop d’essais. Contactez le support.', { locked: true }) };
      const [trip] = await tx.select().from(trips).where(eq(trips.id, b.tripId)).for('update');
      if (!trip || !['PUBLISHED', 'DEPARTED'].includes(trip.status)) return { error: new DomainError('INVALID_TRANSITION', 'Trajet non actif.') };
      if (!b.boardingPinHash || !safeEqual(sha256(`${b.id}:${pin}`), b.boardingPinHash)) {
        const attempts = b.pinAttempts + 1;
        await tx.update(bookings).set({ pinAttempts: attempts, updatedAt: new Date() }).where(eq(bookings.id, b.id));
        const remaining = PIN_MAX_ATTEMPTS - attempts;
        return {
          error: remaining <= 0
            ? new DomainError('FORBIDDEN', 'Code verrouillé après trop d’essais. Contactez le support.', { locked: true })
            : new DomainError('VALIDATION_ERROR', 'Code d’embarquement incorrect.', { remainingAttempts: remaining }),
        };
      }
      let cur = await setBookingState(tx, b, 'CHECKED_IN', { checkedInAt: new Date() });
      if (trip.status === 'DEPARTED') cur = await setBookingState(tx, cur, 'IN_PROGRESS');
      return { ok: cur.id };
    });
    if ('error' in result) throw result.error;
    return this.views.bookingOutput(booking.id, user.id);
  }

  // ─── Confirmation passager ⇒ demande de versement (une seule fois) ──────────
  async confirmCompletion(bookingId: string, user: AuthUser): Promise<BookingOutput> {
    const { booking, driverId } = await this.loadForParticipant(bookingId, user.id);
    if (booking.passengerId !== user.id) throw new DomainError('FORBIDDEN', 'Seul le passager peut confirmer le trajet.');
    const payoutId = await this.db.transaction(async (tx) => {
      const b = await lockBooking(tx, booking.id);
      if (!b) throw new DomainError('NOT_FOUND', 'Réservation introuvable.');
      const p = await lockPaymentByBooking(tx, b.id);
      if (!p) throw new DomainError('INVALID_TRANSITION', 'Aucun paiement confirmé pour cette réservation.');
      const [existing] = await tx.select({ id: payouts.id }).from(payouts).where(eq(payouts.bookingId, b.id));
      const [openDispute] = await tx.select({ id: disputes.id }).from(disputes).where(and(eq(disputes.bookingId, b.id), inArray(disputes.state, OPEN_DISPUTE_STATES)));
      const decision = evaluateRelease({
        bookingState: b.state as never,
        paymentState: p.state as never,
        hasOpenDispute: !!openDispute,
        passengerConfirmed: true, // confirmation explicite en cours
        payoutAlreadyRequested: !!existing,
      });
      if (!decision.allowed) {
        if (decision.reason === 'ALREADY_REQUESTED') return null; // double clic : idempotent
        if (decision.reason === 'DISPUTE_OPEN') throw new DomainError('DISPUTE_BLOCKS_RELEASE', 'Un litige est en cours : le versement est suspendu.');
        throw new DomainError('INVALID_TRANSITION', 'Confirmation impossible à ce stade du trajet.', { reason: decision.reason });
      }
      await tx.update(bookings).set({ passengerConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, b.id));
      await walkPayment(tx, p, ['RELEASE_ELIGIBLE', 'RELEASE_REQUESTED']);
      const [po] = await tx
        .insert(payouts)
        .values({ bookingId: b.id, paymentId: p.id, beneficiaryUserId: driverId, amount: b.driverAmount, reason: 'COMPLETION' })
        .returning({ id: payouts.id });
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'booking.confirm_completion', entityType: 'booking', entityId: b.id, after: { payment: 'RELEASE_REQUESTED', payoutId: po!.id } }, tx);
      return po!.id;
    });
    if (payoutId) {
      try {
        await this.payments.executePayout(payoutId);
      } catch {
        // Reprise automatique planifiée par executePayout (outbox) ; la demande reste enregistrée.
      }
    }
    return this.views.bookingOutput(booking.id, user.id);
  }

  // ─── Cycle de vie du trajet (conducteur) ────────────────────────────────────
  private async lockOwnTrip(tx: Tx, tripId: string, userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    const [t] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
    if (!t || t.driverId !== userId) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    return t;
  }

  async startTrip(tripId: string, user: AuthUser) {
    await this.db.transaction(async (tx) => {
      const t = await this.lockOwnTrip(tx, tripId, user.id);
      if (t.status !== 'PUBLISHED') throw new DomainError('INVALID_TRANSITION', 'Ce trajet ne peut pas démarrer.');
      await tx.update(trips).set({ status: 'DEPARTED', departedAt: new Date(), version: t.version + 1 }).where(eq(trips.id, t.id));
      const list = await tx.select().from(bookings).where(eq(bookings.tripId, t.id)).for('update');
      for (const b of list) {
        if (b.state === 'CHECKED_IN') await setBookingState(tx, b, 'IN_PROGRESS');
        else if (b.state === 'SEAT_HELD' || b.state === 'PAYMENT_PENDING') await cancelBooking(tx, b, 'TRIP_DEPARTED', { restoreSeats: false });
        // CONFIRMED non embarqué : reste CONFIRMED (absence éventuelle traitée par litige).
      }
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'trip.start', entityType: 'trip', entityId: t.id, before: { status: t.status }, after: { status: 'DEPARTED' } }, tx);
    });
    return this.tripWithBookings(tripId, user.id);
  }

  /** Arrivée déclarée : n'autorise JAMAIS à elle seule la libération des fonds. */
  async reportArrival(tripId: string, user: AuthUser) {
    await this.db.transaction(async (tx) => {
      const t = await this.lockOwnTrip(tx, tripId, user.id);
      if (t.status !== 'DEPARTED') throw new DomainError('INVALID_TRANSITION', 'Le trajet doit avoir démarré.');
      await tx.update(trips).set({ status: 'ARRIVED', arrivedAt: new Date(), version: t.version + 1 }).where(eq(trips.id, t.id));
      const list = await tx.select().from(bookings).where(and(eq(bookings.tripId, t.id), eq(bookings.state, 'IN_PROGRESS'))).for('update');
      for (const b of list) await setBookingState(tx, b, 'ARRIVAL_REPORTED', { arrivalReportedAt: new Date() });
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'trip.arrival', entityType: 'trip', entityId: t.id, before: { status: t.status }, after: { status: 'ARRIVED' } }, tx);
    });
    return this.tripWithBookings(tripId, user.id);
  }

  async cancelTrip(tripId: string, user: AuthUser, reason?: string) {
    const refundIds: string[] = [];
    await this.db.transaction(async (tx) => {
      const t = await this.lockOwnTrip(tx, tripId, user.id);
      if (t.status !== 'PUBLISHED') throw new DomainError('INVALID_TRANSITION', 'Seul un trajet non démarré peut être annulé.');
      await tx.update(trips).set({ status: 'CANCELLED', cancelledAt: new Date(), version: t.version + 1 }).where(eq(trips.id, t.id));
      const list = await tx.select().from(bookings).where(and(eq(bookings.tripId, t.id), notInArray(bookings.state, ['CANCELLED', 'COMPLETED']))).for('update');
      for (const b of list) {
        if (b.state === 'CONFIRMED') {
          const p = await lockPaymentByBooking(tx, b.id);
          if (p && p.state === 'PSP_CONFIRMED_HELD') {
            await setPaymentState(tx, p, 'REFUND_PENDING');
            refundIds.push(await this.payments.createRefundTx(tx, p, b.total, b.driverAmount, b.serviceFee, 'DRIVER_CANCELLED_TRIP', null));
          }
        }
        if (['DRAFT', 'SEAT_HELD', 'PAYMENT_PENDING', 'CONFIRMED'].includes(b.state)) {
          await cancelBooking(tx, b, 'DRIVER_CANCELLED_TRIP', { restoreSeats: false });
          await this.notifications.notify(tx, b.passengerId, 'booking.cancelled', { route: `${t.originCity} → ${t.destinationCity}`, detail: reason ? `Motif : ${reason}` : 'Le conducteur a annulé le trajet ; remboursement intégral.' });
        }
      }
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'trip.cancel', entityType: 'trip', entityId: t.id, before: { status: t.status }, after: { status: 'CANCELLED' }, reason: reason ?? null }, tx);
    });
    for (const id of refundIds) await this.payments.executeRefund(id).catch(() => undefined);
    return this.tripWithBookings(tripId, user.id);
  }

  async tripBookings(tripId: string, userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    const [t] = await this.db.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, tripId));
    if (!t || t.driverId !== userId) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    const list = await this.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tripId, tripId), notInArray(bookings.state, ['DRAFT', 'SEAT_HELD', 'PAYMENT_PENDING'])))
      .orderBy(bookings.createdAt);
    const items: BookingOutput[] = [];
    for (const b of list) items.push(await this.views.bookingOutput(b.id, userId));
    return { items, nextCursor: null };
  }

  private async tripWithBookings(tripId: string, userId: string): Promise<{ trip: TripSummary; bookings: BookingOutput[] }> {
    const [row] = await this.views.tripRows(this.db, sql`t.id = ${tripId}`);
    if (!row) throw new DomainError('NOT_FOUND', 'Trajet introuvable.');
    const { items } = await this.tripBookings(tripId, userId);
    return { trip: toTripSummary(row, quote(row.seat_price, 1).total), bookings: items };
  }

  // ─── Avis (après trajet accompli) ───────────────────────────────────────────
  async review(bookingId: string, user: AuthUser, input: { rating: number; comment?: string | undefined }) {
    const { booking, driverId } = await this.loadForParticipant(bookingId, user.id);
    const reviewable = booking.state === 'COMPLETED' || (booking.passengerConfirmedAt !== null && booking.state !== 'CANCELLED');
    if (!reviewable) throw new DomainError('INVALID_TRANSITION', 'Un avis est possible une fois le trajet accompli.');
    const subjectId = booking.passengerId === user.id ? driverId : booking.passengerId;
    const inserted = await this.db
      .insert(reviews)
      .values({ bookingId: booking.id, authorId: user.id, subjectId, rating: input.rating, comment: input.comment ?? null })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) throw new DomainError('ALREADY_EXECUTED', 'Vous avez déjà laissé un avis pour ce trajet.');
    const r = inserted[0];
    return { id: r.id, bookingId: r.bookingId, rating: r.rating, comment: r.comment, createdAt: r.createdAt.toISOString() };
  }

  /** Utilisé par les tests et l'admin : réservation + paiement bruts. */
  async raw(bookingId: string) {
    const [b] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId));
    const [p] = await this.db.select().from(payments).where(eq(payments.bookingId, bookingId));
    return { booking: b, payment: p };
  }
}
