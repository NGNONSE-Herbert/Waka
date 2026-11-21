import type { DisputeState, FundsPosition, PaymentState, Role } from '@waka/domain';
import { DISPUTE_STATES, PAYMENT_STATE_LABEL_FR, PAYMENT_STATES, ROLES } from '@waka/domain';
import { arr, bool, isObj, list, num, obj, personName, str, type Obj } from './normalize';

/** Modèles locaux (tolérants) des sorties admin. */

export type Priority = 'SAFETY' | 'HIGH' | 'NORMAL';
export const PRIORITY_ORDER: Record<Priority, number> = { SAFETY: 0, HIGH: 1, NORMAL: 2 };
export const PRIORITY_LABEL: Record<Priority, string> = { SAFETY: 'Sécurité', HIGH: 'Haute', NORMAL: 'Normale' };

export const DISPUTE_STATE_LABEL: Record<DisputeState, string> = {
  OPENED: 'Ouvert',
  TRIAGED: 'Trié',
  EVIDENCE_REQUESTED: 'Pièces demandées',
  UNDER_REVIEW: 'En instruction',
  DECISION_PROPOSED: 'Décision proposée',
  APPROVED: 'Décision approuvée',
  EXECUTION_PENDING: 'Exécution PSP en attente',
  RESOLVED: 'Résolu',
  APPEALED: 'Recours',
  CLOSED: 'Clôturé',
};

export const CATEGORY_LABEL: Record<string, string> = {
  DRIVER_NO_SHOW: 'Conducteur absent',
  PASSENGER_NO_SHOW: 'Passager absent',
  WRONG_IDENTITY_OR_VEHICLE: 'Identité ou véhicule non conforme',
  CANCELLATION: 'Annulation',
  PAYMENT_ISSUE: 'Problème de paiement',
  EXCESSIVE_DELAY: 'Retard excessif',
  DROPOFF_NOT_RESPECTED: 'Dépose non respectée',
  TRIP_QUALITY: 'Qualité du trajet',
  LUGGAGE: 'Bagages',
  DANGEROUS_BEHAVIOUR: 'Comportement dangereux',
  THEFT_ASSAULT_HARASSMENT: 'Vol, agression ou harcèlement',
  ACCIDENT: 'Accident',
  PAYOUT_ISSUE: 'Problème de versement',
};

export const BOOKING_STATE_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  SEAT_HELD: 'Place retenue',
  PAYMENT_PENDING: 'Paiement en attente',
  CONFIRMED: 'Confirmée',
  CHECKED_IN: 'Embarqué',
  IN_PROGRESS: 'En route',
  ARRIVAL_REPORTED: 'Arrivée signalée',
  COMPLETED: 'Terminée',
  DISPUTED: 'En litige',
  CANCELLED: 'Annulée',
};

export const ROLE_LABEL: Record<Role, string> = {
  PASSENGER: 'Passager',
  DRIVER: 'Conducteur',
  SUPPORT_AGENT: 'Support',
  DISPUTE_MANAGER: 'Gestion des litiges',
  FINANCE: 'Finance',
  SUPERADMIN: 'Super-admin',
};

export const ACTOR_LABEL: Record<string, string> = {
  PASSENGER: 'Passager',
  DRIVER: 'Conducteur',
  WAKA_TEAM: 'Équipe Waka',
  SYSTEM: 'Système',
  PSP: 'Partenaire PSP',
};

export function asPriority(v: unknown): Priority {
  return v === 'SAFETY' || v === 'HIGH' ? v : 'NORMAL';
}
export function asDisputeState(v: unknown): DisputeState | null {
  return typeof v === 'string' && (DISPUTE_STATES as readonly string[]).includes(v) ? (v as DisputeState) : null;
}
export function asPaymentState(v: unknown): PaymentState | null {
  return typeof v === 'string' && (PAYMENT_STATES as readonly string[]).includes(v) ? (v as PaymentState) : null;
}
export function paymentLabel(state: string | null, apiLabel?: string | null): string {
  const s = asPaymentState(state);
  if (s) return PAYMENT_STATE_LABEL_FR[s];
  return apiLabel ?? state ?? '—';
}

// ─── Session staff ─────────────────────────────────────────────────────────────
export interface StaffMe {
  id: string;
  email: string | null;
  displayName: string;
  roles: Role[];
  mfaVerified: boolean;
  environment: string | null;
}

export function toRoles(v: unknown): Role[] {
  return arr(v).filter((r): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r));
}

export function normalizeMe(raw: unknown): StaffMe | null {
  const o = obj(raw, 'staff', 'user', 'me') ?? obj(raw);
  if (!o) return null;
  const id = str(o, 'id', 'userId', 'staffId');
  if (!id) return null;
  const roles = toRoles(o.roles ?? (isObj(raw) ? raw.roles : undefined));
  const mfa = bool(o, 'mfaVerified', 'mfa.verified', 'mfa') ?? bool(raw, 'mfaVerified', 'session.mfaVerified') ?? false;
  return {
    id,
    email: str(o, 'email'),
    displayName: str(o, 'displayName', 'name', 'fullName', 'email') ?? 'Agent',
    roles,
    mfaVerified: mfa,
    environment: str(raw, 'environment', 'env', 'providerMode') ?? str(o, 'environment'),
  };
}

// ─── Litiges ───────────────────────────────────────────────────────────────────
export interface PersonRef {
  id: string | null;
  name: string;
}

function personRef(v: unknown, idFallback?: unknown): PersonRef | null {
  if (v === null || v === undefined) {
    return typeof idFallback === 'string' && idFallback ? { id: idFallback, name: idFallback } : null;
  }
  if (typeof v === 'string') return { id: v, name: v };
  const name = personName(v);
  const id = str(v, 'id', 'userId', 'staffId');
  if (!name && !id) return null;
  return { id, name: name ?? id ?? '—' };
}

export interface DisputeListItem {
  id: string;
  bookingId: string | null;
  state: DisputeState | null;
  rawState: string | null;
  category: string;
  priority: Priority;
  openedAt: string | null;
  dueAt: string | null;
  assignee: PersonRef | null;
  tripLabel: string | null;
  amount: number | null;
}

export function tripLabelOf(o: unknown): string | null {
  const direct = str(o, 'tripLabel', 'trip.label', 'booking.tripLabel');
  if (direct) return direct;
  const trip = obj(o, 'trip', 'booking.trip');
  if (!trip) return null;
  const from = str(trip, 'origin.name', 'originName', 'origin.code', 'originCity', 'from');
  const to = str(trip, 'destination.name', 'destinationName', 'destination.code', 'destinationCity', 'to');
  return from && to ? `${from} → ${to}` : null;
}

export function normalizeDisputeListItem(raw: unknown): DisputeListItem | null {
  const id = str(raw, 'id');
  if (!id) return null;
  const o = raw as Obj;
  return {
    id,
    bookingId: str(o, 'bookingId', 'booking.id'),
    state: asDisputeState(o.state),
    rawState: str(o, 'state'),
    category: str(o, 'category') ?? '—',
    priority: asPriority(o.priority),
    openedAt: str(o, 'openedAt', 'createdAt'),
    dueAt: str(o, 'dueAt', 'slaDueAt'),
    assignee: personRef(o.assignee ?? o.assignedTo ?? null, o.assigneeId ?? o.assignedToId),
    tripLabel: tripLabelOf(o) ?? str(o, 'route'),
    amount: num(o, 'amount', 'payment.amount', 'booking.price.total', 'total'),
  };
}

export function sortDisputes(items: DisputeListItem[]): DisputeListItem[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const da = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const db = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export interface TimelineEntry {
  at: string | null;
  actor: string;
  label: string;
}
export interface EvidenceItem {
  id: string;
  from: string;
  text: string;
  at: string | null;
  attachmentRef: string | null;
}
export type ExecutionStatus = 'NOT_STARTED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';

export interface DecisionView {
  id: string | null;
  state: 'PROPOSED' | 'APPROVED' | 'REJECTED' | string;
  refundToPassenger: number;
  releaseToDriver: number;
  reason: string;
  sensitive: boolean | null;
  proposedBy: PersonRef | null;
  proposedAt: string | null;
  reviewedBy: PersonRef | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  execution: ExecutionStatus;
  executionDetail: string | null;
}

export interface LedgerLineView {
  account: string;
  debit: number;
  credit: number;
}
export interface JournalView {
  id: string;
  kind: string;
  memo: string | null;
  bookingId: string | null;
  at: string | null;
  lines: LedgerLineView[];
}

export interface DisputeDetail extends DisputeListItem {
  description: string | null;
  requestedOutcome: string | null;
  openedBy: string | null;
  urgentSafety: boolean | null;
  fundsStatus: string | null;
  passenger: PersonRef & { phone: string | null } | null;
  driver: PersonRef & { phone: string | null } | null;
  booking: {
    id: string | null;
    state: string | null;
    seats: number | null;
    departureAt: string | null;
    meetingPoint: string | null;
    dropoffPoint: string | null;
    checkedInAt: string | null;
    arrivalReportedAt: string | null;
    passengerConfirmedAt: string | null;
  } | null;
  payment: { id: string | null; state: string | null; label: string; amount: number | null; channel: string | null; providerMode: string | null; providerRef: string | null } | null;
  funds: FundsPosition | null;
  journals: JournalView[];
  timeline: TimelineEntry[];
  evidence: EvidenceItem[];
  decision: DecisionView | null;
  pendingEvidenceRequest: { from: string | null; dueAt: string | null; message: string | null } | null;
  /** Historique des propositions (plus récente d'abord). */
  decisions: DecisionView[];
  executionItems: { kind: 'REFUND' | 'PAYOUT'; amount: number | null; status: string; providerRef: string | null }[];
  /** Actions autorisées calculées par le SERVEUR (prioritaires sur le calcul local), ou null si absent. */
  allowedActions: string[] | null;
  safetyGuidance: string | null;
  appealDeadline: string | null;
}

function party(v: unknown): (PersonRef & { phone: string | null }) | null {
  const p = personRef(v);
  if (!p) return null;
  return { ...p, phone: str(v, 'maskedPhone', 'phoneMasked', 'phone') };
}

export function normalizeExecution(v: unknown): ExecutionStatus {
  const s = (typeof v === 'string' ? v : str(v, 'status', 'state'))?.toUpperCase() ?? null;
  if (!s) return 'NOT_STARTED';
  if (['CONFIRMED', 'SUCCEEDED', 'EXECUTED', 'DONE', 'PAID', 'REFUNDED', 'COMPLETED'].includes(s)) return 'CONFIRMED';
  if (['PENDING', 'PROCESSING', 'REQUESTED', 'IN_PROGRESS', 'EXECUTION_PENDING', 'REFUND_PENDING', 'PAYOUT_PROCESSING'].includes(s)) return 'PENDING';
  if (['FAILED', 'ERROR', 'REJECTED'].includes(s)) return 'FAILED';
  if (['NONE', 'NOT_STARTED'].includes(s)) return 'NOT_STARTED';
  return 'UNKNOWN';
}

export function normalizeDecision(raw: unknown, disputeState: DisputeState | null, disputeExecution?: unknown): DecisionView | null {
  const o = obj(raw);
  if (!o) return null;
  const state = str(o, 'state', 'status') ?? 'PROPOSED';
  // L'exécution PSP ne concerne que la décision approuvée.
  let execution = normalizeExecution(o.execution ?? o.executionStatus ?? o.pspExecution ?? o.pspStatus ?? (state === 'APPROVED' ? disputeExecution : null));
  // À défaut d'information explicite, l'état du litige renseigne l'exécution PSP.
  if (execution === 'NOT_STARTED' && disputeState === 'EXECUTION_PENDING') execution = 'PENDING';
  if (execution === 'NOT_STARTED' && (disputeState === 'RESOLVED' || disputeState === 'CLOSED') && state === 'APPROVED') execution = 'CONFIRMED';
  return {
    id: str(o, 'id'),
    state,
    refundToPassenger: num(o, 'refundToPassenger') ?? 0,
    releaseToDriver: num(o, 'releaseToDriver') ?? 0,
    reason: str(o, 'reason', 'motivation') ?? '',
    sensitive: bool(o, 'sensitive'),
    proposedBy: personRef(o.proposedBy ?? o.proposer ?? null, o.proposedById ?? o.proposerId),
    proposedAt: str(o, 'proposedAt', 'createdAt'),
    reviewedBy: personRef(o.approvedBy ?? o.reviewedBy ?? o.rejectedBy ?? o.approver ?? null, o.approvedById ?? o.reviewedById ?? o.rejectedById),
    reviewedAt: str(o, 'approvedAt', 'reviewedAt', 'rejectedAt', 'decidedAt'),
    rejectionReason: str(o, 'rejectionReason', 'rejectReason'),
    execution,
    executionDetail: str(o, 'execution.detail', 'execution.providerRef', 'executionDetail'),
  };
}

export function normalizeJournal(raw: unknown, i: number): JournalView {
  return {
    id: str(raw, 'id', 'idempotencyKey') ?? `j-${i}`,
    kind: str(raw, 'kind', 'type') ?? '—',
    memo: str(raw, 'memo', 'description'),
    bookingId: str(raw, 'bookingId'),
    at: str(raw, 'createdAt', 'at', 'postedAt'),
    lines: arr(raw, 'lines', 'entries').map((l) => ({
      account: str(l, 'account', 'accountCode') ?? '—',
      debit: num(l, 'debit') ?? 0,
      credit: num(l, 'credit') ?? 0,
    })),
  };
}

export function fundsFrom(o: Obj): FundsPosition | null {
  const f = obj(o, 'funds', 'fundsPosition', 'position');
  if (f) {
    const driverAmount = num(f, 'driverAmount');
    const serviceFee = num(f, 'serviceFee');
    if (driverAmount !== null && serviceFee !== null) {
      return {
        captured: num(f, 'captured') ?? driverAmount + serviceFee,
        driverAmount,
        serviceFee,
        refunded: num(f, 'refunded') ?? 0,
        released: num(f, 'released') ?? 0,
      };
    }
  }
  const price = obj(o, 'booking.price', 'price', 'priceSnapshot', 'booking.priceSnapshot') ?? (num(o, 'booking.driverAmount') !== null ? obj(o, 'booking') : null);
  if (price) {
    const driverAmount = num(price, 'driverAmount');
    const serviceFee = num(price, 'serviceFee');
    if (driverAmount !== null && serviceFee !== null) {
      return {
        captured: num(o, 'payment.capturedAmount') ?? num(price, 'total') ?? driverAmount + serviceFee,
        driverAmount,
        serviceFee,
        refunded: num(o, 'payment.refunded', 'refunded') ?? 0,
        released: num(o, 'payment.released', 'released') ?? 0,
      };
    }
  }
  return null;
}

export function normalizeDisputeDetail(raw: unknown): DisputeDetail | null {
  const root = obj(raw, 'dispute') ?? obj(raw);
  if (!root) return null;
  // Certaines API renvoient { dispute, booking, payment, ledger } côte à côte.
  const o: Obj = isObj(raw) && isObj(raw.dispute) ? { ...raw, ...raw.dispute } : root;
  const base = normalizeDisputeListItem(o);
  if (!base) return null;
  const booking = obj(o, 'booking');
  const payment = obj(o, 'payment', 'booking.payment');
  const parties = obj(o, 'parties');
  const participants = obj(o, 'participants');
  const ledgerSrc = o.ledger ?? o.journals ?? (booking ? booking.journals : undefined);
  const evReq = obj(o, 'evidenceRequest', 'pendingEvidenceRequest');
  // Contrat : `decisions` (plus récente d'abord) + `execution` au niveau du litige.
  const decisions = arr(o, 'decisions')
    .map((d) => normalizeDecision(d, base.state, o.execution))
    .filter((d): d is DecisionView => d !== null)
    .sort((a, b) => (b.proposedAt ?? '').localeCompare(a.proposedAt ?? ''));
  const execItems = [
    ...arr(o, 'execution.refunds').map((r) => ({ kind: 'REFUND' as const, amount: num(r, 'amount'), status: str(r, 'status') ?? '—', providerRef: str(r, 'providerRef') })),
    ...arr(o, 'execution.payouts').map((r) => ({ kind: 'PAYOUT' as const, amount: num(r, 'amount'), status: str(r, 'status') ?? '—', providerRef: str(r, 'providerRef') })),
  ];
  return {
    ...base,
    bookingId: base.bookingId ?? str(booking, 'id'),
    description: str(o, 'description'),
    requestedOutcome: str(o, 'requestedOutcome'),
    openedBy: str(o, 'openedBy', 'openerRole', 'opener.role'),
    urgentSafety: bool(o, 'urgentSafety'),
    fundsStatus: str(o, 'fundsStatus'),
    passenger: party(parties?.passenger ?? participants?.passenger ?? o.passenger ?? booking?.passenger ?? null),
    driver: party(parties?.driver ?? participants?.driver ?? o.driver ?? obj(booking, 'trip.driver') ?? null),
    tripLabel: base.tripLabel ?? str(booking, 'route'),
    booking: booking
      ? {
          id: str(booking, 'id'),
          state: str(booking, 'state'),
          seats: num(booking, 'seats'),
          departureAt: str(booking, 'trip.departureAt', 'departureAt'),
          meetingPoint: str(booking, 'trip.meetingPoint', 'meetingPoint'),
          dropoffPoint: str(booking, 'trip.dropoffPoint', 'dropoffPoint'),
          checkedInAt: str(booking, 'checkedInAt'),
          arrivalReportedAt: str(booking, 'arrivalReportedAt', 'trip.arrivalReportedAt'),
          passengerConfirmedAt: str(booking, 'passengerConfirmedAt'),
        }
      : null,
    payment: payment
      ? {
          id: str(payment, 'id'),
          state: str(payment, 'state'),
          label: paymentLabel(str(payment, 'state'), str(payment, 'stateLabel')),
          amount: num(payment, 'amount'),
          channel: str(payment, 'channel'),
          providerMode: str(payment, 'providerMode', 'mode'),
          providerRef: str(payment, 'providerRef', 'pspRef'),
        }
      : null,
    funds: withExecuted(fundsFrom(o), execItems),
    journals: list(ledgerSrc, 'journals').map(normalizeJournal),
    timeline: arr(o, 'timeline', 'events').map((t) => ({
      at: str(t, 'at', 'createdAt'),
      actor: str(t, 'actor', 'actorKind', 'actorRole') ?? 'SYSTEM',
      label: str(t, 'label', 'message', 'action') ?? '—',
    })),
    evidence: arr(o, 'evidence').map((e, i) => ({
      id: str(e, 'id') ?? `e-${i}`,
      from: str(e, 'from', 'fromKind', 'authorRole') ?? 'WAKA_TEAM',
      text: str(e, 'text', 'content') ?? '',
      at: str(e, 'at', 'createdAt'),
      attachmentRef: str(e, 'attachmentRef'),
    })),
    decision: decisions[0] ?? normalizeDecision(o.decision ?? o.currentDecision ?? null, base.state, o.execution),
    decisions,
    executionItems: execItems,
    allowedActions: Array.isArray(o.allowedActions) ? o.allowedActions.filter((x): x is string => typeof x === 'string') : null,
    safetyGuidance: str(o, 'safetyGuidance'),
    appealDeadline: str(o, 'appealDeadline'),
    pendingEvidenceRequest: evReq ? { from: str(evReq, 'from'), dueAt: str(evReq, 'dueAt'), message: str(evReq, 'message') } : null,
  };
}

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  roles: Role[];
}
export function normalizeStaff(raw: unknown): StaffMember[] {
  return list(raw, 'staff')
    .map((s) => {
      const id = str(s, 'id', 'userId');
      if (!id) return null;
      return { id, name: personName(s) ?? id, email: str(s, 'email'), roles: toRoles((s as Obj).roles) };
    })
    .filter((s): s is StaffMember => s !== null);
}

/** Engagements déjà en cours ou confirmés (hors échecs) : ils empêchent toute nouvelle allocation. */
function withExecuted(f: FundsPosition | null, items: { kind: 'REFUND' | 'PAYOUT'; amount: number | null; status: string }[]): FundsPosition | null {
  if (!f || items.length === 0) return f;
  const live = items.filter((i) => i.status !== 'FAILED');
  const refunded = live.filter((i) => i.kind === 'REFUND').reduce((s, i) => s + (i.amount ?? 0), 0);
  const released = live.filter((i) => i.kind === 'PAYOUT').reduce((s, i) => s + (i.amount ?? 0), 0);
  return { ...f, refunded: Math.max(f.refunded, refunded), released: Math.max(f.released, released) };
}
