import { randomUUID } from 'node:crypto';
import { BookingOutput, PaymentOutput } from '@waka/contracts';
import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { rows } from '../src/db/client.js';
import { anomalies, bookings, ledgerJournals, mockPspTransactions, outboxJobs, paymentEvents, payments, refunds, trips } from '../src/db/schema.js';
import { bookAndPay, DEMO_PHONES, firstTrip, H, login, setup, signedWebhook, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx?.close());

const seatsOf = async (tripId: string) => (await ctx.database.db.select({ s: trips.seatsAvailable }).from(trips).where(eq(trips.id, tripId)))[0]!.s;
const bookingRow = async (id: string) => (await ctx.database.db.select().from(bookings).where(eq(bookings.id, id)))[0]!;
const paymentRow = async (bookingId: string) => (await ctx.database.db.select().from(payments).where(eq(payments.bookingId, bookingId)))[0]!;
const journalsFor = async (bookingId: string) => ctx.database.db.select().from(ledgerJournals).where(eq(ledgerJournals.bookingId, bookingId));

/** Crée un trajet frais avec N places (conducteur vérifié Serge). */
async function freshTrip(seats: number, seatPrice = 5000): Promise<string> {
  const [t] = await rows<{ id: string }>(
    ctx.database.db,
    sql`INSERT INTO trips (driver_id, vehicle_id, origin_city, destination_city, departure_at, meeting_point, dropoff_point, seats_total, seats_available, seat_price, luggage)
        SELECT driver_id, vehicle_id, 'DLA', 'YDE', now() + interval '3 days', 'Carrefour Ndokoti', 'Mvan', ${seats}, ${seats}, ${seatPrice}, 'SMALL'
        FROM trips WHERE driver_id = (SELECT id FROM users WHERE phone_e164 = ${DEMO_PHONES.serge}) LIMIT 1 RETURNING id`,
  );
  return t!.id;
}

describe('réservation (hold atomique)', () => {
  it('réserve, décrémente les places, fige le snapshot tarifaire serveur', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(3, 4500);
    const r = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 2 });
    expect(r.status).toBe(201);
    const b = BookingOutput.parse(r.body);
    expect(b.state).toBe('SEAT_HELD');
    expect(b.price).toMatchObject({ seats: 2, seatPrice: 4500, driverAmount: 9000, serviceFee: 1000, total: 10000, policyVersion: 'fees-2026-11-v1' });
    expect(b.holdExpiresAt).toBeTruthy();
    expect(await seatsOf(tripId)).toBe(1);
  });

  it('le client ne peut pas envoyer de montant (schéma strict)', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const r = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 1, total: 1, price: 100 });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    const noKey = await aicha.post('/v1/bookings').set(H).send({ tripId, seats: 1 });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await seatsOf(tripId)).toBe(2);
  });

  it('même Idempotency-Key ⇒ même réservation, aucune place supplémentaire', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(3);
    const key = randomUUID();
    const a = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', key).send({ tripId, seats: 1 });
    const b = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', key).send({ tripId, seats: 1 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(await seatsOf(tripId)).toBe(2);
    const conflict = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', key).send({ tripId, seats: 2 });
    expect(conflict.status).toBe(409);
  });

  it('le conducteur ne peut pas réserver son propre trajet', async () => {
    const serge = await login(ctx, DEMO_PHONES.serge);
    const tripId = await freshTrip(2);
    const r = await serge.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 1 });
    expect(r.status).toBe(403);
  });

  it('CONCURRENCE : N requêtes parallèles pour la dernière place ⇒ une seule réussit', async () => {
    const tripId = await freshTrip(1);
    const N = 8;
    const agents = await Promise.all(Array.from({ length: N }, (_, i) => login(ctx, `+2376910000${String(10 + i)}`, `Concurrent ${i}`)));
    const results = await Promise.all(agents.map((a) => a.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 1 })));
    const ok = results.filter((r) => r.status === 201);
    const ko = results.filter((r) => r.status === 409);
    expect(ok.length).toBe(1);
    expect(ko.length).toBe(N - 1);
    for (const r of ko) expect(r.body.error.code).toBe('SEATS_UNAVAILABLE');
    expect(await seatsOf(tripId)).toBe(0);
    const [{ n }] = (await rows<{ n: number }>(ctx.database.db, sql`SELECT COUNT(*)::int AS n FROM bookings WHERE trip_id = ${tripId}`)) as [{ n: number }];
    expect(n).toBe(1);
    // Filet de sécurité base : seats_available ne peut jamais devenir négatif.
    await expect(ctx.database.db.execute(sql`UPDATE trips SET seats_available = -1 WHERE id = ${tripId}`)).rejects.toThrow();
  });

  it('BOLA : l’utilisateur B ne lit ni n’agit sur la réservation de A (404)', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const junior = await login(ctx, DEMO_PHONES.junior);
    const tripId = await freshTrip(2);
    const r = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 1 });
    const id = r.body.id;
    expect((await junior.get(`/v1/bookings/${id}`)).status).toBe(404);
    expect((await junior.post(`/v1/bookings/${id}/payments`).set(H).set('Idempotency-Key', randomUUID()).send({ channel: 'MTN_MOMO', payerPhone: '690000004' })).status).toBe(404);
    expect((await junior.post(`/v1/bookings/${id}/cancel`).set(H).send({})).status).toBe(404);
    expect((await junior.post(`/v1/bookings/${id}/confirm-completion`).set(H).send({})).status).toBe(404);
    expect((await junior.post(`/v1/bookings/${id}/disputes`).set(H).send({ category: 'TRIP_QUALITY', description: 'x'.repeat(30), requestedOutcome: 'OTHER', urgentSafety: false })).status).toBe(404);
    expect((await request(ctx.http).get(`/v1/bookings/${id}`)).status).toBe(401);
    const mine = await junior.get('/v1/me/bookings');
    expect(mine.body.items.map((b: { id: string }) => b.id)).not.toContain(id);
  });
});

describe('expiration des holds', () => {
  it('le job d’expiration annule SEAT_HELD/PAYMENT_PENDING et restitue les places exactement une fois', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(3);
    const a = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 1 });
    const { bookingId: b2 } = await bookAndPay(ctx, aicha, tripId, 1);
    expect(await seatsOf(tripId)).toBe(1);
    expect((await bookingRow(b2)).state).toBe('PAYMENT_PENDING');
    // Un job d'expiration a été mis en file dans la même transaction que le hold.
    const jobs = await ctx.database.db.select().from(outboxJobs).where(eq(outboxJobs.dedupeKey, `hold:${a.body.id}`));
    expect(jobs).toHaveLength(1);
    await ctx.database.db.execute(sql`UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id IN (${a.body.id}, ${b2})`);
    const svc = ctx.waka.get(BookingsService);
    await ctx.waka.worker.drain(new Date(Date.now() + 3_600_000));
    await svc.sweepExpiredHolds(new Date());
    await svc.expireHold(a.body.id, new Date());
    expect((await bookingRow(a.body.id)).state).toBe('CANCELLED');
    expect((await bookingRow(b2)).state).toBe('CANCELLED');
    expect(await seatsOf(tripId)).toBe(3);
    const pay = await aicha.post(`/v1/bookings/${a.body.id}/payments`).set(H).set('Idempotency-Key', randomUUID()).send({ channel: 'MTN_MOMO', payerPhone: '690000001' });
    expect(pay.status).toBe(409);
    expect(pay.body.error.code).toBe('HOLD_EXPIRED');
  });

  it('un succès PSP arrivé APRÈS expiration ⇒ MANUAL_REVIEW + remboursement, jamais CONFIRMED', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const { bookingId, providerRef } = await bookAndPay(ctx, aicha, tripId, 1);
    await ctx.database.db.execute(sql`UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id = ${bookingId}`);
    await ctx.waka.get(BookingsService).sweepExpiredHolds(new Date());
    expect(await seatsOf(tripId)).toBe(2);
    const c = await aicha.post(`/v1/dev/mock-psp/${providerRef}/complete`).set(H).send({ outcome: 'SUCCEEDED' });
    expect(c.body.outcome).toBe('LATE_CAPTURE');
    expect((await bookingRow(bookingId)).state).toBe('CANCELLED');
    expect((await paymentRow(bookingId)).state).toBe('MANUAL_REVIEW');
    expect(await seatsOf(tripId)).toBe(2);
    const an = await ctx.database.db.select().from(anomalies).where(and(eq(anomalies.bookingId, bookingId), eq(anomalies.kind, 'LATE_CAPTURE_AFTER_EXPIRY')));
    expect(an).toHaveLength(1);
    // Le worker enclenche le remboursement intégral, confirmé ensuite par le PSP simulé.
    await ctx.waka.worker.drain(new Date(Date.now() + 60_000));
    const p = await paymentRow(bookingId);
    expect(p.state).toBe('REFUNDED');
    const rs = await ctx.database.db.select().from(refunds).where(eq(refunds.bookingId, bookingId));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ amount: p.amount, status: 'SUCCEEDED' });
    const kinds = (await journalsFor(bookingId)).map((j) => j.kind).sort();
    expect(kinds).toEqual(['COLLECTION_CONFIRMED', 'REFUND_CONFIRMED']);
  });
});

describe('paiement MOCK & webhooks', () => {
  it('initiation : PSP_PENDING + instruction ; la seule redirection navigateur ne confirme rien', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const { bookingId, payment } = await bookAndPay(ctx, aicha, tripId, 1);
    PaymentOutput.parse(payment);
    expect(payment).toMatchObject({ state: 'PSP_PENDING', providerMode: 'MOCK', amount: 5500, currency: 'XAF' });
    expect(payment.customerInstruction).toContain('téléphone');
    // « Succès » côté navigateur sans webhook : rien ne change.
    const detail = await aicha.get(`/v1/bookings/${bookingId}`);
    expect(detail.body.state).toBe('PAYMENT_PENDING');
    expect(detail.body.boardingPin).toBeNull();
  });

  it('nouvelle tentative réseau avec la même Idempotency-Key ⇒ même paiement, aucun double débit', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const b = await aicha.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats: 1 });
    const key = randomUUID();
    const body = { channel: 'ORANGE_MONEY', payerPhone: '+237 690 000 001' };
    const [p1, p2] = await Promise.all([
      aicha.post(`/v1/bookings/${b.body.id}/payments`).set(H).set('Idempotency-Key', key).send(body),
      aicha.post(`/v1/bookings/${b.body.id}/payments`).set(H).set('Idempotency-Key', key).send(body),
    ]);
    const p3 = await aicha.post(`/v1/bookings/${b.body.id}/payments`).set(H).set('Idempotency-Key', key).send(body);
    expect(p1.body.id).toBe(p2.body.id);
    expect(p3.body.id).toBe(p1.body.id);
    expect(p3.body.mockProviderRef).toBe(p1.body.mockProviderRef);
    const txs = await ctx.database.db.select().from(mockPspTransactions).where(eq(mockPspTransactions.ref, p1.body.mockProviderRef));
    expect(txs).toHaveLength(1);
    const all = await rows<{ n: number }>(ctx.database.db, sql`SELECT COUNT(*)::int AS n FROM mock_psp_transactions WHERE idempotency_key = ${`collection:${p1.body.id}`}`);
    expect(all[0]!.n).toBe(1);
  });

  it('webhook ×3 ⇒ une seule écriture d’encaissement, une seule confirmation, PIN pour le passager seul', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const serge = await login(ctx, DEMO_PHONES.serge);
    const tripId = await freshTrip(2);
    const { bookingId, providerRef } = await bookAndPay(ctx, aicha, tripId, 1);
    await ctx.database.db.update(mockPspTransactions).set({ status: 'SUCCEEDED', completedAt: new Date() }).where(eq(mockPspTransactions.ref, providerRef));
    const event = { eventId: `evt_${providerRef}_x`, type: 'collection.succeeded', providerRef, amountXaf: 5500, currency: 'XAF', occurredAt: new Date().toISOString() };
    const res = [await signedWebhook(ctx, event), await signedWebhook(ctx, event), await signedWebhook(ctx, event)];
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(res[0]!.body.outcome).toBe('CONFIRMED');
    expect(res[1]!.body.duplicate).toBe(true);
    // Même confirmation via un autre événement (id différent) : no-op.
    const other = await signedWebhook(ctx, { ...event, eventId: `evt_${providerRef}_y` });
    expect(other.body.outcome).toBe('NOOP_PSP_CONFIRMED_HELD');
    const js = await journalsFor(bookingId);
    expect(js.filter((j) => j.kind === 'COLLECTION_CONFIRMED')).toHaveLength(1);
    const d = await aicha.get(`/v1/bookings/${bookingId}`);
    expect(d.body.state).toBe('CONFIRMED');
    expect(d.body.payment.state).toBe('PSP_CONFIRMED_HELD');
    expect(d.body.boardingPin).toMatch(/^\d{4}$/);
    const asDriver = await serge.get(`/v1/bookings/${bookingId}`);
    expect(asDriver.body.role).toBe('DRIVER');
    expect(asDriver.body.boardingPin).toBeNull();
    expect((await bookingRow(bookingId)).boardingPinHash).not.toContain(d.body.boardingPin);
    const evs = await ctx.database.db.select().from(paymentEvents).where(eq(paymentEvents.providerRef, providerRef));
    expect(evs).toHaveLength(2);
    expect(evs[0]!.payload).toContain(providerRef);
  });

  it('événements hors ordre : « failed » après « succeeded » ne défait rien (statut relu chez le PSP)', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const { bookingId, providerRef } = await bookAndPay(ctx, aicha, tripId, 1);
    await aicha.post(`/v1/dev/mock-psp/${providerRef}/complete`).set(H).send({ outcome: 'SUCCEEDED' });
    const late = await signedWebhook(ctx, { eventId: `evt_${providerRef}_late_failed`, type: 'collection.failed', providerRef, amountXaf: 5500, currency: 'XAF', occurredAt: new Date().toISOString() });
    expect(late.status).toBe(200);
    expect((await bookingRow(bookingId)).state).toBe('CONFIRMED');
    expect((await paymentRow(bookingId)).state).toBe('PSP_CONFIRMED_HELD');
    // Versement annoncé avant toute demande (référence inconnue) : enregistré, sans effet.
    const ghost = await signedWebhook(ctx, { eventId: 'evt_ghost_payout', type: 'payout.succeeded', providerRef: 'MOCK-PAY-UNKNOWN00001', amountXaf: 5000, currency: 'XAF', occurredAt: new Date().toISOString() });
    expect(ghost.body.outcome).toBe('UNMATCHED');
    // Webhook de versement portant la référence d'un ENCAISSEMENT : aucun effet.
    const crossed = await signedWebhook(ctx, { eventId: 'evt_crossed', type: 'payout.succeeded', providerRef, amountXaf: 5000, currency: 'XAF', occurredAt: new Date().toISOString() });
    expect(crossed.body.outcome).toBe('UNMATCHED');
    expect((await paymentRow(bookingId)).state).toBe('PSP_CONFIRMED_HELD');
  });

  it('échec PSP ⇒ paiement FAILED, réservation annulée, places restituées', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const { bookingId, providerRef } = await bookAndPay(ctx, aicha, tripId, 1);
    expect(await seatsOf(tripId)).toBe(1);
    const r = await aicha.post(`/v1/dev/mock-psp/${providerRef}/complete`).set(H).send({ outcome: 'FAILED' });
    expect(r.body.outcome).toBe('FAILED');
    expect((await paymentRow(bookingId)).state).toBe('FAILED');
    expect((await bookingRow(bookingId)).state).toBe('CANCELLED');
    expect(await seatsOf(tripId)).toBe(2);
    expect(await journalsFor(bookingId)).toHaveLength(0);
  });

  it('montant ou devise non conformes chez le PSP ⇒ MANUAL_REVIEW (anomalie), jamais CONFIRMED', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    for (const tamper of [{ amount: 100 }, { currency: 'EUR' }, { merchantRef: 'AUTRE-MARCHAND' }]) {
      const tripId = await freshTrip(2);
      const { bookingId, providerRef } = await bookAndPay(ctx, aicha, tripId, 1);
      await ctx.database.db.update(mockPspTransactions).set(tamper).where(eq(mockPspTransactions.ref, providerRef));
      const r = await aicha.post(`/v1/dev/mock-psp/${providerRef}/complete`).set(H).send({ outcome: 'SUCCEEDED' });
      expect(r.body.outcome).toBe('ANOMALY');
      expect((await paymentRow(bookingId)).state).toBe('MANUAL_REVIEW');
      expect((await bookingRow(bookingId)).state).toBe('PAYMENT_PENDING');
      expect(await journalsFor(bookingId)).toHaveLength(0);
      expect(await ctx.database.db.select().from(anomalies).where(and(eq(anomalies.bookingId, bookingId), eq(anomalies.kind, 'COLLECTION_MISMATCH')))).toHaveLength(1);
    }
  });

  it('signature invalide, horodatage expiré ou absent ⇒ 401 et aucun changement', async () => {
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const tripId = await freshTrip(2);
    const { bookingId, providerRef } = await bookAndPay(ctx, aicha, tripId, 1);
    await ctx.database.db.update(mockPspTransactions).set({ status: 'SUCCEEDED' }).where(eq(mockPspTransactions.ref, providerRef));
    const event = { eventId: `evt_${providerRef}_forged`, type: 'collection.succeeded', providerRef, amountXaf: 5500, currency: 'XAF', occurredAt: new Date().toISOString() };
    const bad = await signedWebhook(ctx, event, { secret: 'wrong-secret-wrong-secret' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_SIGNATURE');
    const old = await signedWebhook(ctx, event, { timestamp: Math.floor(Date.now() / 1000) - 301 });
    expect(old.status).toBe(401);
    const none = await request(ctx.http).post('/v1/webhooks/payments/mock').set('content-type', 'application/json').send(JSON.stringify(event));
    expect(none.status).toBe(401);
    // Corps altéré après signature.
    const raw = JSON.stringify(event);
    const { signMockWebhook } = await import('../src/payments/providers.js');
    const sig = signMockWebhook(ctx.config.mockPspWebhookSecret, raw);
    const tampered = await request(ctx.http).post('/v1/webhooks/payments/mock').set('content-type', 'application/json').set('x-mock-signature', sig).send(raw.replace('5500', '1'));
    expect(tampered.status).toBe(401);
    expect((await bookingRow(bookingId)).state).toBe('PAYMENT_PENDING');
    expect(await ctx.database.db.select().from(paymentEvents).where(eq(paymentEvents.eventId, event.eventId))).toHaveLength(0);
    expect((await request(ctx.http).post('/v1/webhooks/payments/mtn_momo').set('content-type', 'application/json').send('{}')).status).toBe(503);
  });
});
