import { DomainError } from './errors.js';

/**
 * Machine d'états déclarative : toute transition non listée est refusée.
 * Les transitions sont des données (auditables, testées exhaustivement).
 */
export interface StateMachine<S extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly terminal: readonly S[];
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  can(from: S, to: S): boolean;
  assert(from: S, to: S): void;
  next(from: S): readonly S[];
}

function machine<S extends string>(name: string, transitions: Record<S, readonly S[]>, terminal: readonly S[]): StateMachine<S> {
  const states = Object.keys(transitions) as S[];
  for (const [from, targets] of Object.entries(transitions) as [S, readonly S[]][]) {
    for (const t of targets) {
      if (!(t in transitions)) throw new Error(`[${name}] cible inconnue ${from} -> ${t}`);
    }
  }
  for (const t of terminal) {
    if ((transitions[t] ?? []).length > 0) throw new Error(`[${name}] état terminal ${t} avec sorties`);
  }
  const frozen = Object.freeze({ ...transitions });
  return Object.freeze({
    name,
    states: Object.freeze(states),
    terminal: Object.freeze([...terminal]),
    transitions: frozen,
    can: (from: S, to: S) => (frozen[from] ?? []).includes(to),
    next: (from: S) => frozen[from] ?? [],
    assert(from: S, to: S) {
      if (!(frozen[from] ?? []).includes(to)) {
        throw new DomainError('INVALID_TRANSITION', `[${name}] transition interdite ${from} → ${to}`, { machine: name, from, to });
      }
    },
  });
}

// ─── Réservation ───────────────────────────────────────────────────────────────
export const BOOKING_STATES = [
  'DRAFT', 'SEAT_HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS',
  'ARRIVAL_REPORTED', 'COMPLETED', 'DISPUTED', 'CANCELLED',
] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export const bookingMachine = machine<BookingState>(
  'booking',
  {
    DRAFT: ['SEAT_HELD', 'CANCELLED'],
    SEAT_HELD: ['PAYMENT_PENDING', 'CANCELLED'], // CANCELLED = expiration du hold ou abandon
    PAYMENT_PENDING: ['CONFIRMED', 'CANCELLED'], // CONFIRMED uniquement sur preuve PSP serveur
    CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'DISPUTED'],
    CHECKED_IN: ['IN_PROGRESS', 'DISPUTED'],
    IN_PROGRESS: ['ARRIVAL_REPORTED', 'DISPUTED'],
    ARRIVAL_REPORTED: ['COMPLETED', 'DISPUTED'],
    DISPUTED: ['COMPLETED', 'CANCELLED'], // issue fixée par la décision de litige
    COMPLETED: [],
    CANCELLED: [],
  },
  ['COMPLETED', 'CANCELLED'],
);

// ─── Paiement ──────────────────────────────────────────────────────────────────
export const PAYMENT_STATES = [
  'CREATED', 'PSP_PENDING', 'PSP_CONFIRMED_HELD', 'RELEASE_ELIGIBLE', 'RELEASE_REQUESTED',
  'PAYOUT_PROCESSING', 'PAID', 'FAILED', 'FROZEN_DISPUTE', 'REFUND_PENDING',
  'PARTIALLY_REFUNDED', 'REFUNDED', 'MANUAL_REVIEW',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const paymentMachine = machine<PaymentState>(
  'payment',
  {
    CREATED: ['PSP_PENDING', 'FAILED'],
    PSP_PENDING: ['PSP_CONFIRMED_HELD', 'FAILED', 'MANUAL_REVIEW'],
    PSP_CONFIRMED_HELD: ['RELEASE_ELIGIBLE', 'FROZEN_DISPUTE', 'REFUND_PENDING', 'MANUAL_REVIEW'],
    RELEASE_ELIGIBLE: ['RELEASE_REQUESTED', 'FROZEN_DISPUTE', 'MANUAL_REVIEW'],
    RELEASE_REQUESTED: ['PAYOUT_PROCESSING', 'MANUAL_REVIEW'],
    PAYOUT_PROCESSING: ['PAID', 'MANUAL_REVIEW'],
    FROZEN_DISPUTE: ['RELEASE_ELIGIBLE', 'REFUND_PENDING', 'MANUAL_REVIEW'],
    REFUND_PENDING: ['REFUNDED', 'PARTIALLY_REFUNDED', 'MANUAL_REVIEW'],
    // Remboursement partiel : le reliquat suit ensuite le chemin de reversement.
    PARTIALLY_REFUNDED: ['RELEASE_REQUESTED', 'MANUAL_REVIEW'],
    MANUAL_REVIEW: ['PSP_CONFIRMED_HELD', 'RELEASE_ELIGIBLE', 'FROZEN_DISPUTE', 'REFUND_PENDING', 'FAILED'],
    PAID: [],
    REFUNDED: [],
    FAILED: [],
  },
  ['PAID', 'REFUNDED', 'FAILED'],
);

// ─── Litige ────────────────────────────────────────────────────────────────────
export const DISPUTE_STATES = [
  'OPENED', 'TRIAGED', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'DECISION_PROPOSED', 'APPROVED',
  'EXECUTION_PENDING', 'RESOLVED', 'APPEALED', 'CLOSED',
] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

export const disputeMachine = machine<DisputeState>(
  'dispute',
  {
    OPENED: ['TRIAGED'],
    TRIAGED: ['EVIDENCE_REQUESTED', 'UNDER_REVIEW'],
    EVIDENCE_REQUESTED: ['UNDER_REVIEW'],
    UNDER_REVIEW: ['EVIDENCE_REQUESTED', 'DECISION_PROPOSED'],
    DECISION_PROPOSED: ['APPROVED', 'UNDER_REVIEW'], // rejet de la proposition => retour en revue
    APPROVED: ['EXECUTION_PENDING'],
    EXECUTION_PENDING: ['RESOLVED'], // seulement après preuve d'exécution PSP
    RESOLVED: ['APPEALED', 'CLOSED'],
    APPEALED: ['UNDER_REVIEW'],
    CLOSED: [],
  },
  ['CLOSED'],
);

/** Libellés UX FR exacts (cahier §3) — ne jamais confondre « demandé » et « effectué ». */
export const PAYMENT_STATE_LABEL_FR: Record<PaymentState, string> = {
  CREATED: 'Paiement en préparation',
  PSP_PENDING: 'Paiement en cours de vérification',
  PSP_CONFIRMED_HELD: 'Fonds gérés par notre partenaire de paiement',
  RELEASE_ELIGIBLE: 'Versement possible après confirmation',
  RELEASE_REQUESTED: 'Versement demandé',
  PAYOUT_PROCESSING: 'Versement en cours chez le partenaire',
  PAID: 'Versement confirmé',
  FAILED: 'Paiement échoué',
  FROZEN_DISPUTE: 'Litige en cours : règlement suspendu',
  REFUND_PENDING: 'Remboursement demandé',
  PARTIALLY_REFUNDED: 'Remboursement partiel confirmé',
  REFUNDED: 'Remboursement confirmé',
  MANUAL_REVIEW: 'Vérification manuelle en cours',
};
