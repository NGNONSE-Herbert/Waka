import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp, type WakaApp } from '../src/app.js';
import { CURRENT_TERMS_VERSION } from '../src/auth/auth.service.js';
import { type AppConfig, loadConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';
import { DEMO_PHONES, DEMO_STAFF_PASSWORD, seed } from '../src/db/seed.js';
import { signMockWebhook } from '../src/payments/providers.js';

export { DEMO_PHONES, DEMO_STAFF_PASSWORD };
export type Agent = InstanceType<typeof TestAgent>;

export const TEST_SECRET = 'test-mock-psp-webhook-secret-0123456789';

/**
 * Application complète sur une base Postgres réelle :
 * - par défaut PGlite en mémoire (une base neuve par fichier de test) ;
 * - si TEST_DATABASE_URL est défini, un vrai Postgres (pool de connexions) dans un schéma dédié jetable.
 */
export interface TestCtx {
  waka: WakaApp;
  database: Database;
  config: AppConfig;
  http: Parameters<typeof request>[0];
  close(): Promise<void>;
}

export async function setup(env: Record<string, string> = {}, overrides: Partial<AppConfig> = {}): Promise<TestCtx> {
  const config = loadConfig(
    {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      OUTBOX_WORKER: 'false',
      PGLITE_DIR: 'memory://',
      MOCK_PSP_WEBHOOK_SECRET: TEST_SECRET,
      APP_SECRET: 'test-app-secret-0123456789abcdef0123456789',
      MOCK_PAYOUT_DELAY_MS: '0',
      OTP_MAX_PER_IP: '100000',
      OTP_MAX_PER_PHONE: '1000',
      ...env,
    },
    overrides,
  );
  const url = process.env.TEST_DATABASE_URL;
  let schema: string | null = null;
  let database: Database;
  if (url) {
    schema = `waka_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    database = await createDatabase({ databaseUrl: url, searchPath: schema, poolMax: 20 });
  } else {
    database = await createDatabase({ pgliteDir: 'memory://' });
  }
  await migrate(database);
  await seed(database, config);
  const waka = await createApp(config, database);
  return {
    waka,
    database,
    config,
    http: waka.app.getHttpServer(),
    close: async () => {
      await waka.close();
      await database.close();
      if (url && schema) {
        const admin = new pg.Client({ connectionString: url });
        await admin.connect();
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      }
    },
  };
}

export const H = { 'X-Waka-Request': '1' };

/** Connexion OTP complète (devCode) ; renvoie un agent portant le cookie de session. */
export async function login(ctx: TestCtx, phone: string, displayName?: string): Promise<Agent> {
  const agent = request.agent(ctx.http);
  const s = await agent.post('/v1/auth/otp/start').set(H).send({ phone });
  if (s.status !== 200) throw new Error(`otp/start ${s.status} ${JSON.stringify(s.body)}`);
  const v = await agent
    .post('/v1/auth/otp/verify')
    .set(H)
    .send({ challengeId: s.body.challengeId, code: s.body.devCode, acceptedTermsVersion: CURRENT_TERMS_VERSION, ...(displayName ? { displayName } : {}) });
  if (v.status !== 200) throw new Error(`otp/verify ${v.status} ${JSON.stringify(v.body)}`);
  return agent;
}

/** Connexion staff : mot de passe puis TOTP (devTotp renvoyé hors production). */
export async function adminLogin(ctx: TestCtx, email: string): Promise<Agent> {
  const agent = request.agent(ctx.http);
  const l = await agent.post('/v1/admin/auth/login').set(H).send({ email, password: DEMO_STAFF_PASSWORD });
  if (l.status !== 200) throw new Error(`admin login ${l.status} ${JSON.stringify(l.body)}`);
  const m = await agent.post('/v1/admin/auth/mfa').set(H).send({ challengeId: l.body.challengeId, totp: l.body.devTotp });
  if (m.status !== 200) throw new Error(`admin mfa ${m.status} ${JSON.stringify(m.body)}`);
  return agent;
}

export async function firstTrip(ctx: TestCtx, from = 'DLA', to = 'YDE', minSeats = 1): Promise<{ id: string; seatsAvailable: number; seatPrice: number; totalPerSeat: number }> {
  const r = await request(ctx.http).get(`/v1/trips?from=${from}&to=${to}&seats=${minSeats}&limit=50`);
  const t = (r.body.items as Array<{ id: string; seatsAvailable: number; seatPrice: number; totalPerSeat: number; driver: { displayName: string } }>).find((x) => x.seatsAvailable >= minSeats);
  if (!t) throw new Error('aucun trajet');
  return t;
}

/** Réserve puis initie le paiement ; renvoie booking id et providerRef MOCK. */
export async function bookAndPay(ctx: TestCtx, agent: Agent, tripId: string, seats = 1) {
  const b = await agent.post('/v1/bookings').set(H).set('Idempotency-Key', randomUUID()).send({ tripId, seats });
  if (b.status !== 201) throw new Error(`booking ${b.status} ${JSON.stringify(b.body)}`);
  const p = await agent.post(`/v1/bookings/${b.body.id}/payments`).set(H).set('Idempotency-Key', randomUUID()).send({ channel: 'MTN_MOMO', payerPhone: '+237 690 000 001' });
  if (p.status !== 201) throw new Error(`payment ${p.status} ${JSON.stringify(p.body)}`);
  return { bookingId: b.body.id as string, providerRef: p.body.mockProviderRef as string, payment: p.body };
}

/** Webhook signé comme le PSP simulé. */
export function signedWebhook(ctx: TestCtx, event: Record<string, unknown>, opts: { secret?: string; timestamp?: number } = {}) {
  const raw = JSON.stringify(event);
  const sig = signMockWebhook(opts.secret ?? ctx.config.mockPspWebhookSecret, raw, opts.timestamp);
  return request(ctx.http).post('/v1/webhooks/payments/mock').set('content-type', 'application/json').set('x-mock-signature', sig).send(raw);
}

export async function confirmedBooking(ctx: TestCtx, agent: Agent, tripId: string, seats = 1) {
  const r = await bookAndPay(ctx, agent, tripId, seats);
  const c = await agent.post(`/v1/dev/mock-psp/${r.providerRef}/complete`).set(H).send({ outcome: 'SUCCEEDED' });
  if (c.status !== 200) throw new Error(`mock complete ${c.status} ${JSON.stringify(c.body)}`);
  return r;
}
