import { MessageThreadOutput, NotificationsOutput } from '@waka/contracts';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rows } from '../src/db/client.js';
import { bookingMessages } from '../src/db/schema.js';
import { type Agent, confirmedBooking, DEMO_PHONES, H, login, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let aicha: Agent;
let serge: Agent;
let junior: Agent;

beforeAll(async () => {
  ctx = await setup();
  aicha = await login(ctx, DEMO_PHONES.aicha);
  serge = await login(ctx, DEMO_PHONES.serge);
  junior = await login(ctx, DEMO_PHONES.junior);
});
afterAll(async () => ctx?.close());

async function freshTrip(): Promise<string> {
  const [t] = await rows<{ id: string }>(
    ctx.database.db,
    sql`INSERT INTO trips (driver_id, vehicle_id, origin_city, destination_city, departure_at, meeting_point, dropoff_point, seats_total, seats_available, seat_price, luggage)
        SELECT u.id, v.id, 'DLA', 'YDE', now() + interval '1 day', 'Carrefour Ndokoti', 'Mvan', 3, 3, 5000, 'SMALL'
        FROM users u JOIN vehicles v ON v.owner_id = u.id WHERE u.phone_e164 = ${DEMO_PHONES.serge} LIMIT 1 RETURNING id`,
  );
  return t!.id;
}

describe('messagerie de réservation', () => {
  it('passager et conducteur échangent ; chacun voit ses propres messages marqués', async () => {
    const { bookingId } = await confirmedBooking(ctx, aicha, await freshTrip());
    const sent = await aicha.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: 'Je suis devant la station.' });
    expect(sent.status).toBe(201);
    expect((await serge.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: 'J’arrive dans 5 minutes.' })).status).toBe(201);

    const a = MessageThreadOutput.parse((await aicha.get(`/v1/bookings/${bookingId}/messages`)).body);
    const s = MessageThreadOutput.parse((await serge.get(`/v1/bookings/${bookingId}/messages`)).body);
    expect(a.items.map((m) => m.mine)).toEqual([true, false]);
    expect(s.items.map((m) => m.mine)).toEqual([false, true]);
    expect(a.canSend).toBe(true);
    expect(JSON.stringify(a)).not.toContain('+237');
  });

  it('un tiers ne peut ni lire ni écrire', async () => {
    const { bookingId } = await confirmedBooking(ctx, aicha, await freshTrip());
    expect((await junior.get(`/v1/bookings/${bookingId}/messages`)).status).toBe(404);
    expect((await junior.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: 'Bonjour' })).status).toBe(404);
  });

  it('refuse lien, numéro et paiement hors plateforme, sans stocker le texte', async () => {
    const { bookingId } = await confirmedBooking(ctx, aicha, await freshTrip());
    for (const [text, reason] of [
      ['Voir https://exemple.test', 'LINK'],
      ['Appelle le 690000001', 'PHONE'],
      ['Paie-moi en cash', 'OFF_PLATFORM_PAYMENT'],
    ] as const) {
      const r = await serge.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('MESSAGE_BLOCKED');
      expect(r.body.error.details.reason).toBe(reason);
    }
    expect(await ctx.database.db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, bookingId))).toHaveLength(0);
  });

  it('exige l’en-tête anti-CSRF et refuse un message vide', async () => {
    const { bookingId } = await confirmedBooking(ctx, aicha, await freshTrip());
    expect((await aicha.post(`/v1/bookings/${bookingId}/messages`).send({ text: 'Bonjour' })).status).toBe(403);
    expect((await aicha.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: '   ' })).status).toBe(400);
  });

  it('ferme l’envoi après annulation, le fil reste lisible', async () => {
    const { bookingId } = await confirmedBooking(ctx, aicha, await freshTrip());
    await aicha.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: 'Je dois peut-être annuler.' });
    expect((await aicha.post(`/v1/bookings/${bookingId}/cancel`).set(H).send({})).status).toBe(200);
    expect((await aicha.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: 'Encore là ?' })).status).toBe(409);
    const t = MessageThreadOutput.parse((await aicha.get(`/v1/bookings/${bookingId}/messages`)).body);
    expect(t.canSend).toBe(false);
    expect(t.items).toHaveLength(1);
  });
});

describe('notifications', () => {
  it('liste ses seules notifications et les marque lues', async () => {
    const { bookingId } = await confirmedBooking(ctx, aicha, await freshTrip());
    await aicha.post(`/v1/bookings/${bookingId}/messages`).set(H).send({ text: 'Bonjour Serge' });
    await ctx.waka.worker.drain();

    const before = NotificationsOutput.parse((await serge.get('/v1/me/notifications')).body);
    const received = before.items.find((n) => n.template === 'message.new' && n.bookingId === bookingId);
    expect(received?.text).toContain('nouveau message');
    expect(before.unread).toBeGreaterThan(0);

    const other = NotificationsOutput.parse((await junior.get('/v1/me/notifications')).body);
    expect(other.items.some((n) => n.bookingId === bookingId)).toBe(false);

    expect((await serge.post('/v1/me/notifications/read').set(H).send({})).status).toBe(200);
    expect(NotificationsOutput.parse((await serge.get('/v1/me/notifications')).body).unread).toBe(0);
  });

  it('exige une session', async () => {
    const anonymous = (await import('supertest')).default(ctx.http);
    expect((await anonymous.get('/v1/me/notifications')).status).toBe(401);
  });
});
