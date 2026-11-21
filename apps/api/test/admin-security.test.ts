import { randomUUID } from 'node:crypto';
import { AdminDashboardOutput, AdminMeOutput, AuditOutput, KycQueueOutput, LedgerOutput, ReconciliationOutput } from '@waka/contracts';
import { DomainError } from '@waka/domain';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CURRENT_TERMS_VERSION } from '../src/auth/auth.service.js';
import { loadConfig } from '../src/config.js';
import { createDatabase, rows } from '../src/db/client.js';
import { DEMO_ORPHAN_REF } from '../src/db/seed.js';
import { ContractBlockedProvider, MockPaymentProvider } from '../src/payments/providers.js';
import { adminLogin, confirmedBooking, DEMO_PHONES, DEMO_STAFF_PASSWORD, firstTrip, H, login, setup, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => ctx?.close());

describe('authentification staff (mot de passe + TOTP)', () => {
  it('login ⇒ défi MFA (devTotp hors production) ⇒ session waka_admin MFA vérifiée', async () => {
    const agent = request.agent(ctx.http);
    const l = await agent.post('/v1/admin/auth/login').set(H).send({ email: 'finance@waka.test', password: DEMO_STAFF_PASSWORD });
    expect(l.status).toBe(200);
    expect(l.body.mfaRequired).toBe(true);
    expect(l.body.devTotp).toMatch(/^\d{6}$/);
    expect((await agent.get('/v1/admin/me')).status).toBe(401); // pas de session avant MFA
    const bad = await agent.post('/v1/admin/auth/mfa').set(H).send({ challengeId: l.body.challengeId, totp: l.body.devTotp === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(401);
    const m = await agent.post('/v1/admin/auth/mfa').set(H).send({ challengeId: l.body.challengeId, totp: l.body.devTotp });
    expect(m.status).toBe(200);
    expect(m.headers['set-cookie']![0]).toMatch(/waka_admin=.*HttpOnly/);
    const me = AdminMeOutput.parse((await agent.get('/v1/admin/me')).body);
    expect(me.mfaVerified).toBe(true);
    expect(me.permissions).toContain('finance:reconcile');
    // Le défi est à usage unique.
    expect((await agent.post('/v1/admin/auth/mfa').set(H).send({ challengeId: l.body.challengeId, totp: l.body.devTotp })).status).toBe(401);
    expect((await agent.post('/v1/admin/auth/logout').set(H).send({})).status).toBe(200);
    expect((await agent.get('/v1/admin/me')).status).toBe(401);
  });

  it('mauvais mot de passe ⇒ 401 ; session utilisateur ne donne pas accès à l’admin', async () => {
    expect((await request(ctx.http).post('/v1/admin/auth/login').set(H).send({ email: 'finance@waka.test', password: 'mauvais-mdp' })).status).toBe(401);
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    expect((await aicha.get('/v1/admin/dashboard')).status).toBe(401);
  });

  it('moindre privilège : SUPPORT ne voit ni finance, ni KYC, ni audit', async () => {
    const support = await adminLogin(ctx, 'support@waka.test');
    for (const p of ['/v1/admin/payments', '/v1/admin/finance/ledger', '/v1/admin/finance/reconciliation', '/v1/admin/kyc', '/v1/admin/audit']) {
      expect((await support.get(p)).status, p).toBe(403);
    }
    expect((await support.post('/v1/admin/finance/reconciliation/run').set(H).send({})).status).toBe(403);
    const admin = await adminLogin(ctx, 'admin@waka.test');
    expect((await admin.get('/v1/admin/payments')).status).toBe(403); // SUPERADMIN sans droit financier implicite
  });
});

describe('tableau de bord & finance', () => {
  it('dashboard : compteurs depuis la base, fonds détenus distincts des frais acquis', async () => {
    const support = await adminLogin(ctx, 'support@waka.test');
    const r = await support.get('/v1/admin/dashboard');
    const d = AdminDashboardOutput.parse(r.body);
    expect(d.upcomingTrips).toBeGreaterThanOrEqual(25);
    expect(d.openDisputesByPriority.NORMAL).toBeGreaterThanOrEqual(1);
    expect(d.pendingKyc.drivers).toBeGreaterThanOrEqual(1);
    expect(d.funds.heldByPartner).toBeGreaterThan(0);
    expect(d.funds.feesRecognized).toBe(1000); // deux trajets démo accomplis × 500 FCFA
    expect(d.funds.disclaimer).toContain('pas un chiffre d’affaires');
    // Les frais acquis restent chez le PSP tant qu’ils ne sont pas reversés à la plateforme.
    expect(d.funds.heldByPartner).toBe(d.funds.driverPayable + d.funds.feesDeferred + d.funds.feesRecognized);
  });

  it('grand livre : équilibré, append-only (trigger SQL interdit UPDATE/DELETE)', async () => {
    const finance = await adminLogin(ctx, 'finance@waka.test');
    const l = LedgerOutput.parse((await finance.get('/v1/admin/finance/ledger')).body);
    expect(Object.values(l.balances).reduce((a, b) => a + b, 0)).toBe(0);
    for (const j of l.journals) expect(j.lines.reduce((s, x) => s + x.debit - x.credit, 0)).toBe(0);
    await expect(ctx.database.db.execute(sql`UPDATE ledger_lines SET debit = debit + 1 WHERE id = (SELECT MIN(id) FROM ledger_lines)`)).rejects.toThrow();
    await expect(ctx.database.db.execute(sql`DELETE FROM ledger_journals`)).rejects.toThrow();
    // Un journal déséquilibré est refusé à la validation de la transaction (contrainte différée).
    await expect(
      ctx.database.db.transaction(async (tx) => {
        const [j] = await rows<{ id: string }>(tx, sql`INSERT INTO ledger_journals (kind, idempotency_key, memo) VALUES ('REVERSAL', ${randomUUID()}, 'test') RETURNING id`);
        await tx.execute(sql`INSERT INTO ledger_lines (journal_id, account, debit, credit) VALUES (${j!.id}, 'psp_held', 100, 0), (${j!.id}, 'adjustments', 0, 99)`);
      }),
    ).rejects.toThrow();
  });

  it('rapprochement : écart délibéré détecté (MISSING_IN_LEDGER), jour concordant MATCHED, FINANCE uniquement', async () => {
    const finance = await adminLogin(ctx, 'finance@waka.test');
    const manager = await adminLogin(ctx, 'litiges@waka.test');
    const yesterday = new Date(Date.now() + 3_600_000 - 86_400_000).toISOString().slice(0, 10);
    expect((await finance.get(`/v1/admin/finance/reconciliation?day=${yesterday}`)).body.status).toBe('NOT_RUN');
    expect((await manager.post('/v1/admin/finance/reconciliation/run').set(H).send({ day: yesterday })).status).toBe(403);
    const r = await finance.post('/v1/admin/finance/reconciliation/run').set(H).send({ day: yesterday });
    expect(r.status).toBe(200);
    const rec = ReconciliationOutput.parse(r.body);
    expect(rec.status).toBe('DISCREPANCY');
    expect(rec.discrepancies).toContainEqual(expect.objectContaining({ providerRef: DEMO_ORPHAN_REF, issue: 'MISSING_IN_LEDGER', providerAmount: 5500, ledgerAmount: null }));
    expect((await finance.get(`/v1/admin/finance/reconciliation?day=${yesterday}`)).body.status).toBe('DISCREPANCY');

    // Aujourd'hui : un paiement réel du parcours MOCK concorde.
    const aicha = await login(ctx, DEMO_PHONES.aicha);
    const t = await firstTrip(ctx, 'DLA', 'KRI');
    await confirmedBooking(ctx, aicha, t.id);
    const today = await finance.post('/v1/admin/finance/reconciliation/run').set(H).send({});
    expect(today.body.status).toBe('MATCHED');
    expect(today.body.providerTotals.collections).toBe(today.body.ledgerTotals.collections);
    expect(today.body.providerTotals.collections).toBeGreaterThan(0);
    const pay = await finance.get('/v1/admin/payments');
    expect(pay.body.anomalies.some((a: { kind: string }) => a.kind === 'RECONCILIATION_DISCREPANCY')).toBe(true);
    expect(pay.body.items[0].payerPhoneMasked).toContain('•');
  });
});

describe('KYC', () => {
  it('onboarding ⇒ PENDING_REVIEW ; le client ne peut pas se déclarer vérifié ; approbation par kyc:review', async () => {
    const newDriver = await login(ctx, '+237699111222', 'Conducteur Test');
    const self = await newDriver.post('/v1/driver/onboarding').set(H).send({
      fullName: 'Conducteur Test', licenseNumber: 'CM-12345', licenseExpiry: '2030-01-01', idDocumentType: 'CNI',
      idDocumentUploadRef: 'upload-ref-1', declaresPrivateCarpoolOnly: true, kycStatus: 'VERIFIED',
    });
    expect(self.status).toBe(400);
    const ok = await newDriver.post('/v1/driver/onboarding').set(H).send({
      fullName: 'Conducteur Test', licenseNumber: 'CM-12345', licenseExpiry: '2030-01-01', idDocumentType: 'CNI', idDocumentUploadRef: 'upload-ref-1', declaresPrivateCarpoolOnly: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.driverStatus).toBe('PENDING_REVIEW');
    const v = await newDriver.post('/v1/driver/vehicles').set(H).send({ make: 'Toyota', model: 'Yaris', color: 'Verte', plate: 'LT 555 ZZ', year: 2018, seatsTotal: 5, insuranceExpiry: '2030-01-01', inspectionExpiry: '2030-01-01' });
    expect(v.status).toBe(201);
    expect(v.body.reviewStatus).toBe('PENDING');
    expect(v.body.label).not.toContain('555'); // plaque jamais exposée en clair
    const [plate] = await rows<{ n: number }>(ctx.database.db, sql`SELECT COUNT(*)::int AS n FROM vehicles WHERE plate_masked LIKE '%555%' OR plate_hash LIKE '%555ZZ%'`);
    expect(plate!.n).toBe(0);

    const support = await adminLogin(ctx, 'support@waka.test');
    const manager = await adminLogin(ctx, 'litiges@waka.test');
    const me = await newDriver.get('/v1/me');
    expect((await support.post(`/v1/admin/kyc/drivers/${me.body.id}/decision`).set(H).send({ approve: true, reason: 'Documents conformes' })).status).toBe(403);
    const q = KycQueueOutput.parse((await manager.get('/v1/admin/kyc')).body);
    expect(q.drivers.map((d) => d.userId)).toContain(me.body.id);
    expect(JSON.stringify(q)).not.toContain('upload-ref-1'); // référence de pièce d'identité jamais exposée
    expect((await manager.post(`/v1/admin/kyc/drivers/${me.body.id}/decision`).set(H).send({ approve: true, reason: 'Documents conformes' })).body.status).toBe('VERIFIED');
    expect((await manager.post(`/v1/admin/kyc/vehicles/${v.body.id}/decision`).set(H).send({ approve: true, reason: 'Carte grise conforme' })).body.status).toBe('APPROVED');
    expect((await newDriver.get('/v1/me')).body.canPublishTrips).toBe(true);
  });
});

describe('audit', () => {
  it('chaîne de hachage valide, journal append-only, lectures admin auditées', async () => {
    const admin = await adminLogin(ctx, 'admin@waka.test');
    const manager = await adminLogin(ctx, 'litiges@waka.test');
    const list = await manager.get('/v1/admin/disputes');
    await manager.get(`/v1/admin/disputes/${list.body.items[0].id}`);
    const a = AuditOutput.parse((await admin.get('/v1/admin/audit')).body);
    expect(a.chain.valid).toBe(true);
    expect(a.items.some((x) => x.action === 'dispute.view')).toBe(true);
    expect(a.items.some((x) => x.action === 'admin.login')).toBe(true);
    await expect(ctx.database.db.execute(sql`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow();
    await expect(ctx.database.db.execute(sql`DELETE FROM audit_logs`)).rejects.toThrow();
    const pol = await admin.get('/v1/admin/policies');
    expect(pol.body.feePolicy.version).toBe('fees-2026-11-v1');
  });
});

describe('sécurité de l’authentification utilisateur', () => {
  it('OTP : 5 essais maximum, puis le défi est bloqué', async () => {
    const s = await request(ctx.http).post('/v1/auth/otp/start').set(H).send({ phone: '+237 699 333 444' });
    const wrong = s.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const v = await request(ctx.http).post('/v1/auth/otp/verify').set(H).send({ challengeId: s.body.challengeId, code: wrong, acceptedTermsVersion: CURRENT_TERMS_VERSION });
      expect(v.status).toBe(400);
    }
    const last = await request(ctx.http).post('/v1/auth/otp/verify').set(H).send({ challengeId: s.body.challengeId, code: s.body.devCode, acceptedTermsVersion: CURRENT_TERMS_VERSION });
    expect(last.status).toBe(429);
  });

  it('OTP : 3 démarrages / 10 min par numéro et par IP ⇒ 429', async () => {
    const strict = await setup({ OTP_MAX_PER_IP: '3', OTP_MAX_PER_PHONE: '3' });
    try {
      for (let i = 0; i < 3; i++) expect((await request(strict.http).post('/v1/auth/otp/start').set(H).send({ phone: '+237699444555' })).status).toBe(200);
      const r = await request(strict.http).post('/v1/auth/otp/start').set(H).send({ phone: '+237699444555' });
      expect(r.status).toBe(429);
      expect(r.body.error.code).toBe('RATE_LIMITED');
      expect((await request(strict.http).post('/v1/auth/otp/start').set(H).send({ phone: '+237699444556' })).status).toBe(429); // même IP
    } finally {
      await strict.close();
    }
  });

  it('journaux JSON : téléphone masqué, requestId présent', async () => {
    const logs = await setup({ LOG_LEVEL: 'info' });
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
    try {
      await request(logs.http).post('/v1/auth/otp/start').set(H).send({ phone: '+237 699 777 888' });
    } finally {
      spy.mockRestore();
      await logs.close();
    }
    const otp = lines.map((l) => JSON.parse(l)).find((l) => l.msg === 'otp.sent');
    expect(otp.phone).toBe('+237 6•• •• •• 88');
    expect(otp.requestId).toBeTruthy();
    expect(lines.join('')).not.toContain('699777888');
  });

  it('logout révoque la session', async () => {
    const a = await login(ctx, DEMO_PHONES.junior);
    expect((await a.get('/v1/me')).status).toBe(200);
    await a.post('/v1/auth/logout').set(H).send({});
    expect((await a.get('/v1/me')).status).toBe(401);
  });
});

describe('garde-fous prestataire de paiement', () => {
  it('PAYMENT_PROVIDER=mock refusé en production ; le PSP MOCK refuse de se charger', async () => {
    expect(() => loadConfig({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock', MOCK_PSP_WEBHOOK_SECRET: 'x'.repeat(32), APP_SECRET: 'y'.repeat(40) })).toThrow(/interdit en production/);
    expect(() => loadConfig({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'mtn_momo' })).toThrow(/obligatoire en production/);
    const db = await createDatabase({ pgliteDir: 'memory://' });
    expect(() => new MockPaymentProvider(db, { isProduction: true, mockPspWebhookSecret: 'x', mockPspMerchantRef: 'm' })).toThrow(/production/);
    await db.close();
  });

  it('adaptateurs MTN MoMo / Orange Money : bloqués tant que le contrat PSP n’existe pas', async () => {
    for (const id of ['mtn_momo', 'orange_money'] as const) {
      const p = new ContractBlockedProvider(id);
      await expect(p.getPaymentStatus()).rejects.toSatisfy((e: unknown) => e instanceof DomainError && e.code === 'BLOCKED_BY_PROVIDER_CONTRACT');
      expect(() => p.verifyWebhook()).toThrow(DomainError);
    }
  });
});
