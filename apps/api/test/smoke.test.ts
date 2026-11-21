import { ROUTES } from '@waka/contracts';
import { getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rows } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import { H, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx?.close());

describe('socle', () => {
  it('GET /v1/health vérifie la base', async () => {
    const r = await request(ctx.http).get('/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', db: 'up', provider: { id: 'mock', mode: 'MOCK' } });
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  it('expose la documentation OpenAPI hors production', async () => {
    const r = await request(ctx.http).get('/docs-json');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.paths)).toContain('/v1/trips');
  });

  it('en-têtes de sécurité (helmet) et CORS restreint', async () => {
    const r = await request(ctx.http).get('/v1/health').set('Origin', 'http://localhost:3000');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(r.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(ctx.http).get('/v1/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('anti-CSRF : requête mutante sans X-Waka-Request ⇒ 403', async () => {
    const r = await request(ctx.http).post('/v1/auth/otp/start').send({ phone: '+237690000001' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(r.body.error.requestId).toBeTruthy();
  });

  it('format d’erreur normalisé, JSON invalide et corps trop volumineux', async () => {
    const bad = await request(ctx.http).post('/v1/auth/otp/start').set(H).set('content-type', 'application/json').send('{"phone":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const big = await request(ctx.http).post('/v1/auth/otp/start').set(H).send({ phone: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const unknown = await request(ctx.http).get('/v1/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  it('seed de démonstration : ~25 trajets à venir, 1 trajet à une place, litiges ouvert et résolu, KYC en attente', async () => {
    const r = await rows<{ upcoming: number; one_seat: number; open_d: number; resolved_d: number; pending_kyc: number; non_demo: number }>(
      ctx.database.db,
      sql`SELECT (SELECT COUNT(*) FROM trips WHERE status = 'PUBLISHED' AND departure_at > now())::int AS upcoming,
                 (SELECT COUNT(*) FROM trips WHERE status = 'PUBLISHED' AND seats_available = 1)::int AS one_seat,
                 (SELECT COUNT(*) FROM disputes WHERE state = 'TRIAGED')::int AS open_d,
                 (SELECT COUNT(*) FROM disputes WHERE state = 'RESOLVED')::int AS resolved_d,
                 (SELECT COUNT(*) FROM driver_profiles WHERE kyc_status = 'PENDING_REVIEW')::int AS pending_kyc,
                 (SELECT COUNT(*) FROM users WHERE NOT is_demo OR display_name NOT LIKE '%(démo)')::int AS non_demo`,
    );
    expect(r[0]).toEqual({ upcoming: 25, one_seat: 1, open_d: 1, resolved_d: 1, pending_kyc: 1, non_demo: 0 });
  });

  it('schéma Drizzle cohérent avec les migrations SQL', async () => {
    const cols = await rows<{ table_name: string; column_name: string }>(
      ctx.database.db,
      sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
    );
    const have = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));
    for (const t of Object.values(schema)) {
      if (!is(t, PgTable)) continue;
      for (const c of Object.values(getTableColumns(t))) expect(have, `${getTableName(t)}.${c.name}`).toContain(`${getTableName(t)}.${c.name}`);
    }
  });

  it('toutes les routes du catalogue ROUTES sont implémentées', async () => {
    const flat: string[] = [];
    const walk = (o: unknown) => {
      if (typeof o === 'string') flat.push(o);
      else for (const v of Object.values(o as Record<string, unknown>)) walk(v);
    };
    walk(ROUTES);
    expect(flat.length).toBeGreaterThan(40);
    for (const r of flat) {
      const [method, path] = r.split(' ') as [string, string];
      const url = path.replace(/:provider/g, 'mock').replace(/:providerRef/g, 'MOCK-COL-000000000000').replace(/:[a-zA-Z]+/g, '00000000-0000-4000-8000-000000000000');
      const res = await (request(ctx.http) as unknown as Record<string, (u: string) => request.Test>)[method.toLowerCase()]!(url).set(H).send({});
      expect(res.body?.error?.message, `${r} → ${res.status}`).not.toBe('Route introuvable.');
    }
  });
});
