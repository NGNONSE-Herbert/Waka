import { DomainError } from './errors.js';

/**
 * Contrat d'un prestataire de services de paiement (PSP) habilité.
 * AUCUN identifiant, endpoint ou comportement d'un PSP réel n'est inventé ici.
 * Chaque adaptateur DÉCLARE ses capacités ; appeler une capacité absente lève FeatureNotSupported.
 */
export type PaymentChannel = 'MTN_MOMO' | 'ORANGE_MONEY';

export interface ProviderCapabilities {
  readonly conditionalHold: boolean;     // retenue conditionnelle contractuelle
  readonly marketplacePayouts: boolean;  // versement à des bénéficiaires tiers
  readonly partialRefund: boolean;
  readonly fullRefund: boolean;
  readonly signedWebhooks: boolean;
  readonly statusQueryApi: boolean;
  readonly reconciliationReport: boolean;
  readonly channels: readonly PaymentChannel[];
}

export type ProviderPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
export type ProviderPayoutStatus = 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface InitiateCollectionInput {
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly amountXaf: number;
  readonly currency: 'XAF';
  readonly channel: PaymentChannel;
  readonly payerMsisdn: string; // +2376XXXXXXXX
  readonly description: string;
}

export interface InitiateCollectionResult {
  readonly providerRef: string;
  readonly status: ProviderPaymentStatus;
  /** Instruction affichée à l'utilisateur (ex. valider sur son téléphone). */
  readonly customerInstruction: string;
}

export interface ProviderPaymentSnapshot {
  readonly providerRef: string;
  readonly status: ProviderPaymentStatus;
  readonly amountXaf: number;
  readonly currency: string;
  readonly merchantRef: string;
}

export interface VerifiedWebhookEvent {
  readonly eventId: string;
  readonly type: 'collection.succeeded' | 'collection.failed' | 'payout.succeeded' | 'payout.failed' | 'refund.succeeded' | 'refund.failed';
  readonly providerRef: string;
  readonly amountXaf: number;
  readonly currency: string;
  readonly occurredAt: string;
}

export interface ReconciliationLine {
  readonly providerRef: string;
  readonly kind: 'COLLECTION' | 'PAYOUT' | 'REFUND';
  readonly amountXaf: number;
  readonly status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
}

export interface PaymentProvider {
  readonly id: string;
  /** 'MOCK' ne doit JAMAIS être actif en production (vérifié au démarrage). */
  readonly mode: 'MOCK' | 'SANDBOX' | 'LIVE';
  readonly capabilities: ProviderCapabilities;
  initiateCollection(input: InitiateCollectionInput): Promise<InitiateCollectionResult>;
  getPaymentStatus(providerRef: string): Promise<ProviderPaymentSnapshot>;
  requestRelease(input: { paymentProviderRef: string; payoutId: string; idempotencyKey: string; amountXaf: number; beneficiaryRef: string }): Promise<{ payoutRef: string; status: ProviderPayoutStatus }>;
  requestRefund(input: { paymentProviderRef: string; refundId: string; idempotencyKey: string; amountXaf: number; reason: string }): Promise<{ refundRef: string; status: ProviderPayoutStatus }>;
  getPayoutStatus(payoutRef: string): Promise<{ payoutRef: string; status: ProviderPayoutStatus }>;
  reconcile(day: string): Promise<readonly ReconciliationLine[]>;
  /** Vérifie la signature sur le CORPS BRUT + horodatage. Lève INVALID_SIGNATURE sinon. */
  verifyWebhook(rawBody: string, headers: Readonly<Record<string, string | undefined>>): VerifiedWebhookEvent;
}

export class FeatureNotSupported extends DomainError {
  constructor(provider: string, feature: string) {
    super('FEATURE_NOT_SUPPORTED', `Le fournisseur ${provider} ne déclare pas la capacité « ${feature} »`, { provider, feature });
  }
}

export function requireCapability(p: PaymentProvider, cap: keyof Omit<ProviderCapabilities, 'channels'>): void {
  if (!p.capabilities[cap]) throw new FeatureNotSupported(p.id, cap);
}

/**
 * Vérification « ceinture et bretelles » d'une confirmation : statut, montant, devise et marchand
 * doivent correspondre EXACTEMENT, sinon MANUAL_REVIEW (jamais CONFIRMED).
 */
export function checkCollectionMatches(
  expected: { amountXaf: number; merchantRef: string },
  snap: ProviderPaymentSnapshot,
): 'CONFIRMED' | 'PENDING' | 'FAILED' | 'ANOMALY' {
  if (snap.status === 'FAILED') return 'FAILED';
  if (snap.status !== 'SUCCEEDED') return 'PENDING';
  if (snap.currency !== 'XAF' || snap.amountXaf !== expected.amountXaf || snap.merchantRef !== expected.merchantRef) return 'ANOMALY';
  return 'CONFIRMED';
}
