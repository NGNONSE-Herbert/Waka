import { randomUUID } from 'node:crypto';
import { TripDetail, TripSummary } from '@waka/contracts';
import { quote } from '@waka/domain';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vehicles } from '../src/db/schema.js';
import { DEMO_PHONES, H, login, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx?.close());

const inDays = (n: number, hour = 9) => {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('recherche de trajets', () => {
  it('renvoie des enregistrements seedés en base (DLA → YDE), publiés, à venir, prix serveur frais inclus', async () => {
    const r = await request(ctx.http).get('/v1/trips?from=DLA&to=YDE');
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(5);
    for (const t of r.body.items) {
      TripSummary.parse(t);
      expect(t.origin.code).toBe('DLA');
      expect(t.destination.code).toBe('YDE');
      expect(new Date(t.departureAt).getTime()).toBeGreaterThan(Date.now());
      expect(['PUBLISHED']).toContain(t.status);
      expect(t.totalPerSeat).toBe(quote(t.seatPrice, 1).total);
      expect(t.driver.isDemo).toBe(true);
      expect(t.driver.verified).toBe(true);
    }
    // Les données proviennent bien de la base : une modification SQL est visible.
    const id = r.body.items[0].id;
    await ctx.database.db.execute(sql`UPDATE trips SET meeting_point = 'Point modifié en base' WHERE id = ${id}`);
    const again = await request(ctx.http).get('/v1/trips?from=DLA&to=YDE');
    expect(again.body.items.find((t: { id: string }) => t.id === id).meetingPoint).toBe('Point modifié en base');
  });

  it('pagination par curseur stable, sans doublon ni trou', async () => {
    const all = await request(ctx.http).get('/v1/trips?limit=50');
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const r = await request(ctx.http).get(`/v1/trips?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      expect(r.status).toBe(200);
      ids.push(...r.body.items.map((t: { id: string }) => t.id));
      cursor = r.body.nextCursor;
    } while (cursor);
    expect(ids).toEqual(all.body.items.map((t: { id: string }) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    const deps = all.body.items.map((t: { departureAt: string }) => t.departureAt);
    expect([...deps].sort()).toEqual(deps);
    expect((await request(ctx.http).get('/v1/trips?cursor=garbage')).status).toBe(400);
  });

  it('exclut trajets annulés, passés et sans places suffisantes ; filtre par date', async () => {
    const r = await request(ctx.http).get('/v1/trips?limit=50');
    const target = r.body.items[1];
    await ctx.database.db.execute(sql`UPDATE trips SET status = 'CANCELLED' WHERE id = ${target.id}`);
    const after = await request(ctx.http).get('/v1/trips?limit=50');
    expect(after.body.items.map((t: { id: string }) => t.id)).not.toContain(target.id);
    const four = await request(ctx.http).get('/v1/trips?seats=4&limit=50');
    for (const t of four.body.items) expect(t.seatsAvailable).toBeGreaterThanOrEqual(4);
    const day = new Date(new Date(r.body.items[0].departureAt).getTime() + 3_600_000).toISOString().slice(0, 10);
    const dated = await request(ctx.http).get(`/v1/trips?date=${day}&limit=50`);
    expect(dated.body.items.length).toBeGreaterThan(0);
    for (const t of dated.body.items) expect(new Date(new Date(t.departureAt).getTime() + 3_600_000).toISOString().slice(0, 10)).toBe(day);
  });

  it('détail : règles, politique d’annulation et devis 1 place', async () => {
    const list = await request(ctx.http).get('/v1/trips?from=DLA&to=YDE');
    const r = await request(ctx.http).get(`/v1/trips/${list.body.items[0].id}`);
    expect(r.status).toBe(200);
    const d = TripDetail.parse(r.body);
    expect(d.quoteForOneSeat.total).toBe(d.totalPerSeat);
    expect((await request(ctx.http).get('/v1/trips/not-a-uuid')).status).toBe(404);
    expect((await request(ctx.http).get(`/v1/trips/${randomUUID()}`)).status).toBe(404);
  });

  it('liste des villes avec points de rendez-vous', async () => {
    const r = await request(ctx.http).get('/v1/cities');
    expect(r.body.map((c: { code: string }) => c.code)).toEqual(['DLA', 'YDE', 'KRI', 'BFS', 'LIM', 'BUE', 'EDE', 'BAM']);
    expect(r.body[0].meetingPoints).toContain('Carrefour Ndokoti');
  });
});

describe('publication de trajets', () => {
  const body = (vehicleId: string, extra: Record<string, unknown> = {}) => ({
    vehicleId,
    originCity: 'DLA',
    destinationCity: 'YDE',
    departureAt: inDays(4),
    meetingPoint: 'Carrefour Ndokoti',
    dropoffPoint: 'Mvan',
    seats: 3,
    seatPrice: 5000,
    luggage: 'SMALL',
    airConditioning: true,
    rules: ['Pas de fumée'],
    ...extra,
  });

  it('un conducteur vérifié publie ; le trajet apparaît dans la recherche et dans /me/trips', async () => {
    const serge = await login(ctx, DEMO_PHONES.serge);
    const me = await serge.get('/v1/me');
    expect(me.body.canPublishTrips).toBe(true);
    const v = me.body.vehicles[0];
    const r = await serge.post('/v1/trips').set(H).send(body(v.id, { departureAt: inDays(12) }));
    expect(r.status).toBe(201);
    TripDetail.parse(r.body);
    expect(r.body.totalPerSeat).toBe(5500);
    const mine = await serge.get('/v1/me/trips');
    expect(mine.body.items.map((t: { id: string }) => t.id)).toContain(r.body.id);
    const search = await request(ctx.http).get('/v1/trips?from=DLA&to=YDE&limit=50');
    expect(search.body.items.map((t: { id: string }) => t.id)).toContain(r.body.id);
  });

  it('un conducteur non vérifié reçoit 403 DRIVER_NOT_ELIGIBLE', async () => {
    const nadege = await login(ctx, DEMO_PHONES.nadege);
    const me = await nadege.get('/v1/me');
    expect(me.body.driverStatus).toBe('PENDING_REVIEW');
    expect(me.body.canPublishTrips).toBe(false);
    const r = await nadege.post('/v1/trips').set(H).send(body(me.body.vehicles[0].id));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('DRIVER_NOT_ELIGIBLE');
    const passenger = await login(ctx, DEMO_PHONES.aicha);
    const p = await passenger.post('/v1/trips').set(H).send(body(randomUUID()));
    expect(p.body.error.code).toBe('DRIVER_NOT_ELIGIBLE');
  });

  it('véhicule dont l’assurance ou la visite expire avant le trajet ⇒ VEHICLE_NOT_ELIGIBLE', async () => {
    const serge = await login(ctx, DEMO_PHONES.serge);
    const me = await serge.get('/v1/me');
    const vid = me.body.vehicles[0].id as string;
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await ctx.database.db.update(vehicles).set({ insuranceExpiry: soon }).where(eq(vehicles.id, vid));
    const r = await serge.post('/v1/trips').set(H).send(body(vid, { departureAt: inDays(5) }));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('VEHICLE_NOT_ELIGIBLE');
    await ctx.database.db.update(vehicles).set({ insuranceExpiry: '2099-01-01', inspectionExpiry: soon }).where(eq(vehicles.id, vid));
    const r2 = await serge.post('/v1/trips').set(H).send(body(vid, { departureAt: inDays(5) }));
    expect(r2.body.error.code).toBe('VEHICLE_NOT_ELIGIBLE');
    await ctx.database.db.update(vehicles).set({ inspectionExpiry: '2099-01-01' }).where(eq(vehicles.id, vid));
  });

  it('places ≤ places du véhicule − 1, prix borné, entrée stricte', async () => {
    const serge = await login(ctx, DEMO_PHONES.serge);
    const vid = (await serge.get('/v1/me')).body.vehicles[0].id;
    const tooMany = await serge.post('/v1/trips').set(H).send(body(vid, { seats: 5 }));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.details.max).toBe(4);
    const odd = await serge.post('/v1/trips').set(H).send(body(vid, { seatPrice: 5025 }));
    expect(odd.status).toBe(422);
    const extra = await serge.post('/v1/trips').set(H).send(body(vid, { status: 'PUBLISHED', serviceFee: 0 }));
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe('VALIDATION_ERROR');
    const other = await serge.post('/v1/trips').set(H).send(body(randomUUID()));
    expect(other.status).toBe(404);
  });
});

describe('demandes de trajet & matching', () => {
  it('une demande passager obtient des offres compatibles expliquées', async () => {
    const junior = await login(ctx, DEMO_PHONES.junior);
    const list = await request(ctx.http).get('/v1/trips?from=YDE&to=DLA&limit=50');
    const t = list.body.items[0];
    const start = new Date(new Date(t.departureAt).getTime() - 3_600_000).toISOString();
    const end = new Date(new Date(t.departureAt).getTime() + 3_600_000).toISOString();
    const r = await junior.post('/v1/travel-requests').set(H).send({
      originCity: 'YDE', destinationCity: 'DLA', windowStart: start, windowEnd: end, seats: 1, maxBudgetPerSeat: 8000,
      preferredPickup: null, needsLuggage: false, wantsAirConditioning: false, notifyOnNewMatch: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.matchCount).toBeGreaterThan(0);
    const m = await junior.get(`/v1/travel-requests/${r.body.id}/matches`);
    expect(m.body.items[0].explanations.length).toBe(5);
    expect(m.body.items.map((x: { trip: { id: string } }) => x.trip.id)).toContain(t.id);
    const mine = await junior.get('/v1/me/travel-requests');
    expect(mine.body.items[0].id).toBe(r.body.id);
    const other = await login(ctx, DEMO_PHONES.aicha);
    expect((await other.get(`/v1/travel-requests/${r.body.id}/matches`)).status).toBe(404);
    const del = await junior.delete(`/v1/travel-requests/${r.body.id}`).set(H);
    expect(del.body.status).toBe('CANCELLED');
  });
});
