import { randomBytes } from 'node:crypto';
import {
  DomainError,
  type InitiateCollectionInput,
  type InitiateCollectionResult,
  type PaymentProvider,
  type ProviderCapabilities,
  type ProviderPaymentSnapshot,
  type ProviderPayoutStatus,
  type ReconciliationLine,
  type VerifiedWebhookEvent,
} from '@waka/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/client.js';
import { mockPspTransactions } from '../db/schema.js';
import { hmacSha256, safeEqual } from '../common/crypto.js';
import { doualaDayStart } from '../common/http.js';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const WebhookEventSchema = z
  .object({
    eventId: z.string().min(4).max(200),
    type: z.enum(['collection.succeeded', 'collection.failed', 'payout.succeeded', 'payout.failed', 'refund.succeeded', 'refund.failed']),
    providerRef: z.string().min(4).max(200),
    amountXaf: z.number().int(),
    currency: z.string(),
    occurredAt: z.string(),
  })
  .strict();

/** Signe un corps brut à la manière du PSP simulé : `t=<unix>,v1=<hmac_sha256(secret, t.body)>`. */
export function signMockWebhook(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${rawBody}`)}`;
}

/**
 * PSP SIMULÉ — aucune valeur réelle ne circule. Son état « côté prestataire » est conservé en base
 * (table mock_psp_transactions) pour survivre aux redémarrages et permettre le rapprochement.
 * Refuse catégoriquement de s'instancier en production.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';
  readonly mode = 'MOCK' as const;
  readonly capabilities: ProviderCapabilities = Object.freeze({
    conditionalHold: true,
    marketplacePayouts: true,
    partialRefund: true,
    fullRefund: true,
    signedWebhooks: true,
    statusQueryApi: true,
    reconciliationReport: true,
    channels: ['MTN_MOMO', 'ORANGE_MONEY'] as const,
  });

  constructor(
    private readonly database: Database,
    private readonly config: Pick<AppConfig, 'isProduction' | 'mockPspWebhookSecret' | 'mockPspMerchantRef'>,
  ) {
    if (config.isProduction || process.env.NODE_ENV === 'production') {
      throw new Error('Le PSP MOCK ne peut pas être chargé en production (NODE_ENV=production).');
    }
  }

  get merchantRef(): string {
    return this.config.mockPspMerchantRef;
  }

  private newRef(prefix: string): string {
    return `MOCK-${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private async createTx(kind: 'COLLECTION' | 'PAYOUT' | 'REFUND', idempotencyKey: string, amount: number, relatedRef: string | null, payerMasked: string | null, status: 'PENDING' | 'PROCESSING') {
    const db = this.database.db;
    await db
      .insert(mockPspTransactions)
      .values({ ref: this.newRef(kind.slice(0, 3)), kind, idempotencyKey, amount, currency: 'XAF', merchantRef: this.merchantRef, status, relatedRef, payerMasked })
      .onConflictDoNothing({ target: mockPspTransactions.idempotencyKey });
    const [row] = await db.select().from(mockPspTransactions).where(eq(mockPspTransactions.idempotencyKey, idempotencyKey));
    if (!row) throw new Error('PSP mock : transaction introuvable après création');
    return row;
  }

  async initiateCollection(input: InitiateCollectionInput): Promise<InitiateCollectionResult> {
    const masked = `${input.payerMsisdn.slice(0, 4)} •••• ${input.payerMsisdn.slice(-2)}`;
    const row = await this.createTx('COLLECTION', input.idempotencyKey, input.amountXaf, null, masked, 'PENDING');
    return {
      providerRef: row.ref,
      status: row.status === 'PROCESSING' ? 'PENDING' : (row.status as 'PENDING' | 'SUCCEEDED' | 'FAILED'),
      customerInstruction: 'Validez la demande de paiement sur votre téléphone (simulation MOCK — aucun débit réel).',
    };
  }

  async getPaymentStatus(providerRef: string): Promise<ProviderPaymentSnapshot> {
    const [row] = await this.database.db.select().from(mockPspTransactions).where(and(eq(mockPspTransactions.ref, providerRef), eq(mockPspTransactions.kind, 'COLLECTION')));
    if (!row) return { providerRef, status: 'UNKNOWN', amountXaf: 0, currency: 'XAF', merchantRef: '' };
    const status = row.status === 'SUCCEEDED' ? 'SUCCEEDED' : row.status === 'FAILED' ? 'FAILED' : 'PENDING';
    return { providerRef, status, amountXaf: row.amount, currency: row.currency, merchantRef: row.merchantRef };
  }

  async requestRelease(input: { paymentProviderRef: string; payoutId: string; idempotencyKey: string; amountXaf: number; beneficiaryRef: string }) {
    const row = await this.createTx('PAYOUT', input.idempotencyKey, input.amountXaf, input.paymentProviderRef, null, 'PROCESSING');
    return { payoutRef: row.ref, status: mapDisbursement(row.status) };
  }

  async requestRefund(input: { paymentProviderRef: string; refundId: string; idempotencyKey: string; amountXaf: number; reason: string }) {
    const row = await this.createTx('REFUND', input.idempotencyKey, input.amountXaf, input.paymentProviderRef, null, 'PROCESSING');
    return { refundRef: row.ref, status: mapDisbursement(row.status) };
  }

  /** Statut d'un décaissement (versement OU remboursement) — même API dans le simulateur. */
  async getPayoutStatus(payoutRef: string) {
    const [row] = await this.database.db.select().from(mockPspTransactions).where(and(eq(mockPspTransactions.ref, payoutRef), inArray(mockPspTransactions.kind, ['PAYOUT', 'REFUND'])));
    return { payoutRef, status: row ? mapDisbursement(row.status) : ('UNKNOWN' as const) };
  }

  async reconcile(day: string): Promise<readonly ReconciliationLine[]> {
    const start = doualaDayStart(day);
    const end = new Date(start.getTime() + 86_400_000);
    const list = await this.database.db
      .select()
      .from(mockPspTransactions)
      .where(and(eq(mockPspTransactions.status, 'SUCCEEDED'), sql`${mockPspTransactions.completedAt} >= ${start} AND ${mockPspTransactions.completedAt} < ${end}`));
    return list.map((r) => ({ providerRef: r.ref, kind: r.kind as ReconciliationLine['kind'], amountXaf: r.amount, status: 'SUCCEEDED' as const }));
  }

  verifyWebhook(rawBody: string, headers: Readonly<Record<string, string | undefined>>): VerifiedWebhookEvent {
    const header = headers[MOCK_SIGNATURE_HEADER];
    const invalid = (why: string) => new DomainError('INVALID_SIGNATURE', 'Signature de webhook invalide.', { reason: why });
    if (!header) throw invalid('missing');
    const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
    const t = Number(parts.t);
    const v1 = parts.v1;
    if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) throw invalid('malformed');
    if (Math.abs(Math.floor(Date.now() / 1000) - t) > WEBHOOK_TOLERANCE_SECONDS) throw invalid('timestamp');
    const expected = hmacSha256(this.config.mockPspWebhookSecret, `${t}.${rawBody}`);
    if (!safeEqual(expected, v1)) throw invalid('mismatch');
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw invalid('body');
    }
    const parsed = WebhookEventSchema.safeParse(json);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Événement PSP mal formé.');
    return parsed.data;
  }

  // ─── Simulateur (dev uniquement) ────────────────────────────────────────────
  /** Fait aboutir une transaction côté « prestataire » et produit le webhook signé correspondant. */
  async complete(ref: string, outcome: 'SUCCEEDED' | 'FAILED'): Promise<{ rawBody: string; headers: Record<string, string>; event: VerifiedWebhookEvent } | null> {
    const db = this.database.db;
    await db
      .update(mockPspTransactions)
      .set({ status: outcome, completedAt: new Date() })
      .where(and(eq(mockPspTransactions.ref, ref), inArray(mockPspTransactions.status, ['PENDING', 'PROCESSING'])));
    const [row] = await db.select().from(mockPspTransactions).where(eq(mockPspTransactions.ref, ref));
    if (!row) return null;
    if (row.status !== 'SUCCEEDED' && row.status !== 'FAILED') return null;
    const prefix = row.kind === 'COLLECTION' ? 'collection' : row.kind === 'PAYOUT' ? 'payout' : 'refund';
    const event: VerifiedWebhookEvent = {
      eventId: `evt_${row.ref}_${row.status.toLowerCase()}`,
      type: `${prefix}.${row.status === 'SUCCEEDED' ? 'succeeded' : 'failed'}` as VerifiedWebhookEvent['type'],
      providerRef: row.ref,
      amountXaf: row.amount,
      currency: row.currency,
      occurredAt: (row.completedAt ?? new Date()).toISOString(),
    };
    const rawBody = JSON.stringify(event);
    return { rawBody, event, headers: { [MOCK_SIGNATURE_HEADER]: signMockWebhook(this.config.mockPspWebhookSecret, rawBody), 'content-type': 'application/json' } };
  }

  async findTransaction(ref: string) {
    const [row] = await this.database.db.select().from(mockPspTransactions).where(eq(mockPspTransactions.ref, ref));
    return row ?? null;
  }
}

function mapDisbursement(status: string): ProviderPayoutStatus {
  if (status === 'SUCCEEDED') return 'SUCCEEDED';
  if (status === 'FAILED') return 'FAILED';
  return 'PROCESSING';
}

/**
 * Adaptateurs réels (MTN MoMo, Orange Money) : volontairement NON implémentés.
 * Aucun endpoint, identifiant ou comportement n'est inventé : chaque appel est bloqué tant que
 * le contrat PSP (séquestre conditionnel, versements marketplace, webhooks signés) n'est pas signé.
 */
export class ContractBlockedProvider implements PaymentProvider {
  readonly mode = 'SANDBOX' as const;
  readonly capabilities: ProviderCapabilities = Object.freeze({
    conditionalHold: false,
    marketplacePayouts: false,
    partialRefund: false,
    fullRefund: false,
    signedWebhooks: false,
    statusQueryApi: false,
    reconciliationReport: false,
    channels: [] as const,
  });
  constructor(readonly id: 'mtn_momo' | 'orange_money') {}
  private blocked(): never {
    throw new DomainError('BLOCKED_BY_PROVIDER_CONTRACT', `Le prestataire ${this.id} n'est pas encore contractualisé : opération indisponible.`);
  }
  async initiateCollection(): Promise<InitiateCollectionResult> {
    return this.blocked();
  }
  async getPaymentStatus(): Promise<ProviderPaymentSnapshot> {
    return this.blocked();
  }
  async requestRelease(): Promise<{ payoutRef: string; status: ProviderPayoutStatus }> {
    return this.blocked();
  }
  async requestRefund(): Promise<{ refundRef: string; status: ProviderPayoutStatus }> {
    return this.blocked();
  }
  async getPayoutStatus(): Promise<{ payoutRef: string; status: ProviderPayoutStatus }> {
    return this.blocked();
  }
  async reconcile(): Promise<readonly ReconciliationLine[]> {
    return this.blocked();
  }
  verifyWebhook(): VerifiedWebhookEvent {
    return this.blocked();
  }
}

export interface ProviderRegistry {
  active: PaymentProvider;
  byId: Map<string, PaymentProvider>;
  mock: MockPaymentProvider | null;
}

export function createProviderRegistry(database: Database, config: AppConfig): ProviderRegistry {
  const byId = new Map<string, PaymentProvider>();
  byId.set('mtn_momo', new ContractBlockedProvider('mtn_momo'));
  byId.set('orange_money', new ContractBlockedProvider('orange_money'));
  let mock: MockPaymentProvider | null = null;
  if (config.paymentProvider === 'mock') {
    mock = new MockPaymentProvider(database, config);
    byId.set('mock', mock);
  }
  const active = byId.get(config.paymentProvider);
  if (!active) throw new Error(`Prestataire de paiement inconnu : ${config.paymentProvider}`);
  return { active, byId, mock };
}
