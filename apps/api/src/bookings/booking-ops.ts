/**
 * Opérations transactionnelles élémentaires partagées (réservations, paiements).
 * Toutes s'exécutent DANS une transaction existante, sur des lignes verrouillées (FOR UPDATE),
 * et passent systématiquement par les machines d'états du domaine.
 */
import { bookingMachine, type BookingState, DomainError, paymentMachine, type PaymentState } from '@waka/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { bookings, payments } from '../db/schema.js';

export type BookingRow = typeof bookings.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

export async function lockBooking(tx: Tx, bookingId: string): Promise<BookingRow | undefined> {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for('update');
  return b;
}

export async function lockPaymentByBooking(tx: Tx, bookingId: string): Promise<PaymentRow | undefined> {
  const [p] = await tx.select().from(payments).where(eq(payments.bookingId, bookingId)).for('update');
  return p;
}

export async function lockPayment(tx: Tx, paymentId: string): Promise<PaymentRow | undefined> {
  const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
  return p;
}

/** Transition de réservation contrôlée par la machine d'états (+ garde optimiste sur l'état courant). */
export async function setBookingState(tx: Tx, b: BookingRow, to: BookingState, extra: Partial<BookingRow> = {}): Promise<BookingRow> {
  bookingMachine.assert(b.state as BookingState, to);
  const [u] = await tx
    .update(bookings)
    .set({ ...extra, state: to, updatedAt: new Date() })
    .where(and(eq(bookings.id, b.id), eq(bookings.state, b.state)))
    .returning();
  if (!u) throw new DomainError('INVALID_TRANSITION', 'La réservation a changé entre-temps ; réessayez.');
  return u;
}

export async function setPaymentState(tx: Tx, p: PaymentRow, to: PaymentState, extra: Partial<PaymentRow> = {}): Promise<PaymentRow> {
  paymentMachine.assert(p.state as PaymentState, to);
  const [u] = await tx
    .update(payments)
    .set({ ...extra, state: to, updatedAt: new Date() })
    .where(and(eq(payments.id, p.id), eq(payments.state, p.state)))
    .returning();
  if (!u) throw new DomainError('INVALID_TRANSITION', 'Le paiement a changé entre-temps ; réessayez.');
  return u;
}

/** Enchaîne plusieurs transitions de paiement autorisées (ex. FROZEN_DISPUTE → RELEASE_ELIGIBLE → RELEASE_REQUESTED). */
/** Le chemin reprend après l'état courant s'il y figure (ex. ARRIVAL_REPORTED → COMPLETED). */
const remaining = <S extends string>(current: string, path: S[]): S[] => {
  const i = path.indexOf(current as S);
  return i >= 0 ? path.slice(i + 1) : path;
};
export async function walkPayment(tx: Tx, p: PaymentRow, path: PaymentState[]): Promise<PaymentRow> {
  let cur = p;
  for (const s of remaining(cur.state, path)) cur = await setPaymentState(tx, cur, s);
  return cur;
}
export async function walkBooking(tx: Tx, b: BookingRow, path: BookingState[]): Promise<BookingRow> {
  let cur = b;
  for (const s of remaining(cur.state, path)) cur = await setBookingState(tx, cur, s);
  return cur;
}

/**
 * Restitue les places d'une réservation au trajet, une seule fois (drapeau seats_released,
 * posé sous verrou de la réservation). Le CHECK SQL interdit tout dépassement de seats_total.
 */
export async function releaseSeats(tx: Tx, b: BookingRow): Promise<BookingRow> {
  if (b.seatsReleased) return b;
  await tx.execute(sql`UPDATE trips SET seats_available = seats_available + ${b.seats}, version = version + 1
                       WHERE id = ${b.tripId} AND seats_available + ${b.seats} <= seats_total`);
  const [u] = await tx.update(bookings).set({ seatsReleased: true }).where(eq(bookings.id, b.id)).returning();
  return u ?? b;
}

/** Annule une réservation (transition contrôlée) et, si demandé, restitue ses places. */
export async function cancelBooking(tx: Tx, b: BookingRow, reason: string, opts: { restoreSeats: boolean }): Promise<BookingRow> {
  let cur = await setBookingState(tx, b, 'CANCELLED', { cancelReason: reason, holdExpiresAt: null });
  if (opts.restoreSeats) cur = await releaseSeats(tx, cur);
  return cur;
}
