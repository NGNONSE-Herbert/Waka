import { randomUUID } from 'node:crypto';
import { AdminDisputeDetail, DisputeOutput } from '@waka/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rows } from '../src/db/client.js';
import { bookings, ledgerJournals, payments, payouts, refunds } from '../src/db/schema.js';
import { adminLogin, type Agent, confirmedBooking, DEMO_PHONES, H, login, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let aicha: Agent;
let serge: Agent;
beforeAll(async () => {
  ctx = await setup();
  aicha = await login(ctx, DEMO_PHONES.aicha);
  serge = await login(ctx, DEMO_PHONES.serge);
});
afterAll(async () => ctx?.close());

async function freshTrip(seats = 3): Promise<string> {
  const [t] = await rows<{ id: string }>(
    ctx.database.db,
    sql`INSERT INTO trips (driver_id, vehicle_id, origin_city, destination_city, departure_at, meeting_point, dropoff_point, seats_total, seats_available, seat_price, luggage)
        SELECT u.id, v.id, 'DLA', 'YDE', now() + interval '1 day', 'Carrefour Ndokoti', 'Mvan', ${seats}, ${seats}, 5000, 'SMALL'
        FROM users u JOIN vehicles v ON v.owner_id = u.id WHERE u.phone_e164 = ${DEMO_PHONES.serge} LIMIT 1 RETURNING id`,
  );
  return t!.id;
}
const payment = async (bookingId: string) => (await ctx.database.db.select().from(payments).where(eq(payments.bookingId, bookingId)))[0]!;
const booking = async (id: string) => (await ctx.database.db.select().from(bookings).where(eq(bookings.id, id)))[0]!;
const kinds = async (bookingId: string) => (await ctx.database.db.select().from(ledgerJournals).where(eq(ledgerJournals.bookingId, bookingId))).map((j) => j.kind).sort();

/** Réservation confirmée, embarquée, trajet démarré puis arrivée déclarée. */
async function arrivedBooking(): Promise<{ bookingId: string; tripId: string }> {
  const tripId = await freshTrip();
  const { bookingId } = await confirmedBooking(ctx, aicha, tripId);
  const pin = (await aicha.get(`/v1/bookings/${bookingId}`)).body.boardingPin;
  expect((await serge.post(`/v1/bookings/${bookingId}/check-in`).set(H).send({ pin })).status).toBe(200);
  expect((await serge.post(`/v1/trips/${tripId}/start`).set(H).send({})).status).toBe(200);
  expect((await serge.post(`/v1/trips/${tripId}/arrival`).set(H).send({})).status).toBe(200);
  return { bookingId, tripId };
}

describe('cycle de vie du trajet', () => {
  it('embarquement par PIN réservé au conducteur, 5 essais maximum puis verrouillage', async () => {
    const tripId = await freshTrip();
    const { bookingId } = await confirmedBooking(ctx, aicha, tripId);
    const pin = (await aicha.get(`/v1/bookings/${bookingId}`)).body.boardingPin as string;
    expect((await aicha.post(`/v1/bookings/${bookingId}/check-in`).set(H).send({ pin })).status).toBe(403);
    const wrong = pin === '0000' ? '1111' : '0000';
    for (let i = 1; i <= 4; i++) {
      const r = await serge.post(`/v1/bookings/${bookingId}/check-in`).set(H).send({ pin: wrong });
      expect(r.status).toBe(400);
      expect(r.body.error.details.remainingAttempts).toBe(5 - i);
    }
    const fifth = await serge.post(`/v1/bookings/${bookingId}/check-in`).set(H).send({ pin: wrong });
    expect(fifth.status).toBe(403);
    expect(fifth.body.error.details.locked).toBe(true);
    const locked = await serge.post(`/v1/bookings/${bookingId}/check-in`).set(H).send({ pin });
    expect(locked.status).toBe(403);
    expect((await booking(bookingId)).state).toBe('CONFIRMED');
  });

  it('start : CHECKED_IN → IN_PROGRESS, CONFIRMED non embarqué reste CONFIRMED ; arrivée ne libère jamais les fonds', async () => {
    const tripId = await freshTrip();
    const junior = await login(ctx, DEMO_PHONES.junior);
    const a = await confirmedBooking(ctx, aicha, tripId);
    const j = await confirmedBooking(ctx, junior, tripId);
    const pin = (await aicha.get(`/v1/bookings/${a.bookingId}`)).body.boardingPin;
    const ci = await serge.post(`/v1/bookings/${a.bookingId}/check-in`).set(H).send({ pin });
    expect(ci.body.state).toBe('CHECKED_IN');
    expect((await aicha.post(`/v1/trips/${tripId}/start`).set(H).send({})).status).toBe(404);
    const st = await serge.post(`/v1/trips/${tripId}/start`).set(H).send({});
    expect(st.body.trip.status).toBe('DEPARTED');
    expect((await booking(a.bookingId)).state).toBe('IN_PROGRESS');
    expect((await booking(j.bookingId)).state).toBe('CONFIRMED');
    const ar = await serge.post(`/v1/trips/${tripId}/arrival`).set(H).send({});
    expect(ar.body.trip.status).toBe('ARRIVED');
    expect((await booking(a.bookingId)).state).toBe('ARRIVAL_REPORTED');
    expect((await payment(a.bookingId)).state).toBe('PSP_CONFIRMED_HELD');
    expect(await ctx.database.db.select().from(payouts).where(eq(payouts.bookingId, a.bookingId))).toHaveLength(0);
    const list = await serge.get(`/v1/trips/${tripId}/bookings`);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0].passenger.displayName).toBeTruthy();
  });

  it('confirmation passager ⇒ un seul versement (double clic), PAID sur webhook PSP, frais acquis, COMPLETED', async () => {
    const { bookingId } = await arrivedBooking();
    expect((await serge.post(`/v1/bookings/${bookingId}/confirm-completion`).set(H).send({})).status).toBe(403);
    const [c1, c2] = await Promise.all([
      aicha.post(`/v1/bookings/${bookingId}/confirm-completion`).set(H).send({}),
      aicha.post(`/v1/bookings/${bookingId}/confirm-completion`).set(H).send({}),
    ]);
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    const pos = await ctx.database.db.select().from(payouts).where(eq(payouts.bookingId, bookingId));
    expect(pos).toHaveLength(1);
    expect(pos[0]!.status).toBe('PROCESSING');
    expect((await payment(bookingId)).state).toBe('PAYOUT_PROCESSING');
    expect(await kinds(bookingId)).toEqual(['COLLECTION_CONFIRMED']); // une demande n'est pas un versement
    // Le PSP simulé confirme le versement de façon asynchrone (outbox).
    await ctx.waka.worker.drain();
    expect((await payment(bookingId)).state).toBe('PAID');
    expect(await kinds(bookingId)).toEqual(['COLLECTION_CONFIRMED', 'FEE_RECOGNIZED', 'PAYOUT_CONFIRMED']);
    const d = await aicha.get(`/v1/bookings/${bookingId}`);
    expect(d.body.state).toBe('COMPLETED');
    expect(d.body.canReview).toBe(true);
    const again = await aicha.post(`/v1/bookings/${bookingId}/confirm-completion`).set(H).send({});
    expect(again.status).toBe(200); // idempotent
    expect(again.body.state).toBe('COMPLETED');
    expect(await ctx.database.db.select().from(payouts).where(eq(payouts.bookingId, bookingId))).toHaveLength(1);
    const rv = await aicha.post(`/v1/bookings/${bookingId}/reviews`).set(H).send({ rating: 5, comment: 'Très bien' });
    expect(rv.status).toBe(201);
    expect((await aicha.post(`/v1/bookings/${bookingId}/reviews`).set(H).send({ rating: 4 })).status).toBe(409);
    const earn = await serge.get('/v1/driver/earnings');
    expect(earn.body.paid).toBeGreaterThanOrEqual(5000);
  });

  it('annulation passager > 24 h ⇒ remboursement intégral confirmé par PSP, places restituées', async () => {
    const [t] = await rows<{ id: string }>(ctx.database.db, sql`UPDATE trips SET departure_at = now() + interval '3 days' WHERE id = ${await freshTrip(2)} RETURNING id`);
    const { bookingId } = await confirmedBooking(ctx, aicha, t!.id);
    const r = await aicha.post(`/v1/bookings/${bookingId}/cancel`).set(H).send({});
    expect(r.body.state).toBe('CANCELLED');
    await ctx.waka.worker.drain();
    expect((await payment(bookingId)).state).toBe('REFUNDED');
    expect(await kinds(bookingId)).toEqual(['COLLECTION_CONFIRMED', 'REFUND_CONFIRMED']);
  });
});

describe('litiges', () => {
  const openBody = { category: 'EXCESSIVE_DELAY', description: 'Retard de deux heures sans aucune information préalable.', requestedOutcome: 'PARTIAL_REFUND', urgentSafety: false };

  it('un litige ouvert gèle les fonds et bloque le versement', async () => {
    const { bookingId } = await arrivedBooking();
    const d = await aicha.post(`/v1/bookings/${bookingId}/disputes`).set(H).send(openBody);
    expect(d.status).toBe(201);
    const out = DisputeOutput.parse(d.body);
    expect(out.state).toBe('TRIAGED');
    expect(out.fundsStatus).toBe('FROZEN');
    expect(out.safetyGuidance).toBeNull();
    expect((await payment(bookingId)).state).toBe('FROZEN_DISPUTE');
    expect((await booking(bookingId)).state).toBe('DISPUTED');
    const c = await aicha.post(`/v1/bookings/${bookingId}/confirm-completion`).set(H).send({});
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('DISPUTE_BLOCKS_RELEASE');
    expect(await ctx.database.db.select().from(payouts).where(eq(payouts.bookingId, bookingId))).toHaveLength(0);
    expect((await aicha.post(`/v1/bookings/${bookingId}/disputes`).set(H).send(openBody)).status).toBe(409);
    const ev = await serge.post(`/v1/disputes/${d.body.id}/evidence`).set(H).send({ text: 'Contrôle routier prolongé.' });
    expect(ev.body.evidence.at(-1).from).toBe('DRIVER');
    const junior = await login(ctx, DEMO_PHONES.junior);
    expect((await junior.get(`/v1/disputes/${d.body.id}`)).status).toBe(404);
  });

  it('priorité SAFETY + consignes d’urgence (catégorie sensible ou urgence déclarée)', async () => {
    const tripId = await freshTrip();
    const { bookingId } = await confirmedBooking(ctx, aicha, tripId);
    const r = await aicha.post(`/v1/bookings/${bookingId}/disputes`).set(H).send({ ...openBody, category: 'DANGEROUS_BEHAVIOUR', urgentSafety: false });
    expect(r.body.priority).toBe('SAFETY');
    expect(r.body.safetyGuidance).toContain('117');
    expect(r.body.safetyGuidance).toContain('119');
  });

  it('parcours complet : instruction, proposition, double approbation, exécution PSP, RESOLVED, recours', async () => {
    const { bookingId } = await arrivedBooking();
    const opened = await aicha.post(`/v1/bookings/${bookingId}/disputes`).set(H).send(openBody);
    const id = opened.body.id as string;
    const support = await adminLogin(ctx, 'support@waka.test');
    const manager = await adminLogin(ctx, 'litiges@waka.test');
    const manager2 = await adminLogin(ctx, 'litiges2@waka.test');
    const finance = await adminLogin(ctx, 'finance@waka.test');

    // Support : ne voit pas un dossier non attribué.
    expect((await support.get(`/v1/admin/disputes/${id}`)).status).toBe(404);
    expect((await support.get('/v1/admin/disputes')).body.items.map((x: { id: string }) => x.id)).not.toContain(id);
    const staff = await manager.get('/v1/admin/staff');
    const supportId = staff.body.items.find((s: { email: string }) => s.email === 'support@waka.test').id;
    expect((await support.post(`/v1/admin/disputes/${id}/assign`).set(H).send({ assigneeId: supportId })).status).toBe(403);
    expect((await manager.post(`/v1/admin/disputes/${id}/assign`).set(H).send({ assigneeId: supportId })).status).toBe(200);
    const seen = await support.get(`/v1/admin/disputes/${id}`);
    expect(seen.status).toBe(200);
    AdminDisputeDetail.parse(seen.body);

    // Support : peut demander des preuves, ne peut NI proposer NI approuver.
    const re = await support.post(`/v1/admin/disputes/${id}/request-evidence`).set(H).send({ from: 'BOTH', message: 'Merci de fournir vos éléments.', dueInHours: 24 });
    expect(re.body.state).toBe('EVIDENCE_REQUESTED');
    expect(re.body.dueAt).toBeTruthy();
    expect((await support.post(`/v1/admin/disputes/${id}/start-review`).set(H).send({})).body.state).toBe('UNDER_REVIEW');
    const decision = { refundToPassenger: 2000, releaseToDriver: 3000, reason: 'Retard avéré, remboursement partiel de la contribution.', sensitive: false };
    const sp = await support.post(`/v1/admin/disputes/${id}/decision`).set(H).send(decision);
    expect(sp.status).toBe(403);

    // Allocation invalide : remboursement au-delà du payé.
    const over = await manager.post(`/v1/admin/disputes/${id}/decision`).set(H).send({ ...decision, refundToPassenger: 6000, releaseToDriver: 0 });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('ALLOCATION_EXCEEDED');

    // Proposition, rejet par un second responsable ⇒ retour en revue.
    expect((await manager.post(`/v1/admin/disputes/${id}/decision`).set(H).send(decision)).body.state).toBe('DECISION_PROPOSED');
    expect((await manager.post(`/v1/admin/disputes/${id}/approve`).set(H).send({})).body.error.code).toBe('SEPARATION_OF_DUTIES');
    expect((await support.post(`/v1/admin/disputes/${id}/approve`).set(H).send({})).status).toBe(403);
    const rej = await manager2.post(`/v1/admin/disputes/${id}/reject`).set(H).send({ reason: 'Merci de revoir la répartition.' });
    expect(rej.body.state).toBe('UNDER_REVIEW');
    expect(rej.body.decisions[0].state).toBe('REJECTED');

    // Nouvelle proposition, approbation par FINANCE (personne différente).
    expect((await manager.post(`/v1/admin/disputes/${id}/decision`).set(H).send(decision)).status).toBe(200);
    const ap = await finance.post(`/v1/admin/disputes/${id}/approve`).set(H).send({});
    expect(ap.status).toBe(200);
    // Décision approuvée ≠ exécution confirmée : le dossier attend la preuve PSP.
    expect(ap.body.state).toBe('EXECUTION_PENDING');
    expect(ap.body.decisions[0].state).toBe('APPROVED');
    expect(ap.body.execution.status).toBe('PENDING');
    expect((await payment(bookingId)).state).toBe('REFUND_PENDING');
    expect((await aicha.get(`/v1/disputes/${id}`)).body.state).toBe('EXECUTION_PENDING');

    await ctx.waka.worker.drain();
    const done = await manager.get(`/v1/admin/disputes/${id}`);
    expect(done.body.state).toBe('RESOLVED');
    expect(done.body.execution.status).toBe('CONFIRMED');
    expect((await payment(bookingId)).state).toBe('PAID');
    expect((await booking(bookingId)).state).toBe('COMPLETED');
    const rs = await ctx.database.db.select().from(refunds).where(eq(refunds.bookingId, bookingId));
    expect(rs.map((r) => [r.amount, r.status])).toEqual([[2000, 'SUCCEEDED']]);
    const ps = await ctx.database.db.select().from(payouts).where(eq(payouts.bookingId, bookingId));
    expect(ps.map((r) => [r.amount, r.status])).toEqual([[3000, 'SUCCEEDED']]);
    expect(await kinds(bookingId)).toEqual(['COLLECTION_CONFIRMED', 'FEE_RECOGNIZED', 'PAYOUT_CONFIRMED', 'REFUND_CONFIRMED']);
    const pv = await aicha.get(`/v1/disputes/${id}`);
    expect(pv.body.decision).toMatchObject({ refundToPassenger: 2000, releaseToDriver: 3000, state: 'APPROVED' });
    expect(pv.body.timeline.some((t: { actor: string }) => t.actor === 'PSP')).toBe(true);

    // Recours dans les 7 jours ⇒ réexamen ; maintien sans mouvement de fonds.
    const appeal = await serge.post(`/v1/disputes/${id}/appeal`).set(H).send({ reason: 'Je conteste la part remboursée.' });
    expect(appeal.body.state).toBe('UNDER_REVIEW');
    const keep = { refundToPassenger: 0, releaseToDriver: 0, reason: 'Décision maintenue après réexamen du recours.', sensitive: false };
    expect((await manager2.post(`/v1/admin/disputes/${id}/decision`).set(H).send(keep)).status).toBe(200);
    expect((await manager.post(`/v1/admin/disputes/${id}/approve`).set(H).send({})).body.state).toBe('RESOLVED');
    expect((await manager.post(`/v1/admin/disputes/${id}/close`).set(H).send({})).body.state).toBe('CLOSED');
    expect(await ctx.database.db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).toHaveLength(1);
  });

  it('remboursement intégral par décision ⇒ réservation CANCELLED, aucun versement', async () => {
    const { bookingId } = await arrivedBooking();
    const id = (await aicha.post(`/v1/bookings/${bookingId}/disputes`).set(H).send({ ...openBody, category: 'DRIVER_NO_SHOW' })).body.id;
    const manager = await adminLogin(ctx, 'litiges@waka.test');
    const finance = await adminLogin(ctx, 'finance@waka.test');
    await manager.post(`/v1/admin/disputes/${id}/start-review`).set(H).send({});
    await manager.post(`/v1/admin/disputes/${id}/decision`).set(H).send({ refundToPassenger: 5500, releaseToDriver: 0, reason: 'Absence du conducteur établie : remboursement intégral.', sensitive: true });
    await finance.post(`/v1/admin/disputes/${id}/approve`).set(H).send({});
    await ctx.waka.worker.drain();
    expect((await payment(bookingId)).state).toBe('REFUNDED');
    expect((await booking(bookingId)).state).toBe('CANCELLED');
    expect((await manager.get(`/v1/admin/disputes/${id}`)).body.state).toBe('RESOLVED');
    expect(await ctx.database.db.select().from(payouts).where(eq(payouts.bookingId, bookingId))).toHaveLength(0);
  });

  it('litige sur des fonds déjà versés ⇒ revue manuelle, aucune nouvelle allocation possible', async () => {
    const { bookingId } = await arrivedBooking();
    await aicha.post(`/v1/bookings/${bookingId}/confirm-completion`).set(H).send({});
    await ctx.waka.worker.drain();
    expect((await booking(bookingId)).state).toBe('COMPLETED');
    const d = await aicha.post(`/v1/bookings/${bookingId}/disputes`).set(H).send(openBody);
    expect(d.status).toBe(201);
    expect(d.body.fundsStatus).toBe('ALREADY_RELEASED');
    const manager = await adminLogin(ctx, 'litiges@waka.test');
    await manager.post(`/v1/admin/disputes/${d.body.id}/start-review`).set(H).send({});
    const p = await manager.post(`/v1/admin/disputes/${d.body.id}/decision`).set(H).send({ refundToPassenger: 1000, releaseToDriver: 0, reason: 'Tentative de remboursement après versement.', sensitive: false });
    expect(p.status).toBe(409);
    expect(p.body.error.code).toBe('ALREADY_EXECUTED');
  });

  it('aucune route ne permet de « payer le conducteur » ni d’écrire au grand livre', async () => {
    const admin = await adminLogin(ctx, 'admin@waka.test');
    for (const path of ['/v1/admin/payouts', '/v1/admin/finance/ledger', '/v1/admin/payments/x/release', '/v1/payouts']) {
      const r = await admin.post(path).set(H).send({ bookingId: randomUUID(), amount: 1000 });
      expect(r.status).toBe(404);
    }
  });
});
