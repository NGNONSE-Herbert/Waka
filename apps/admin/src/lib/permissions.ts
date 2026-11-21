import { disputeMachine, hasPermission, type DisputeState, type Permission, type Role } from '@waka/domain';

/**
 * Masquage d'interface selon le rôle. C'est du CONFORT : l'API reste seule à faire respecter
 * RBAC/ABAC, MFA et séparation des tâches. On ne fait que ne pas proposer ce qui serait refusé.
 */
export function can(roles: readonly Role[], perm: Permission): boolean {
  return hasPermission({ userId: '-', roles }, perm);
}

export function canAny(roles: readonly Role[], perms: readonly Permission[]): boolean {
  return perms.some((p) => can(roles, p));
}

/** Permissions exigeant une MFA récente (miroir de domain/rbac). */
export const MFA_SENSITIVE: readonly Permission[] = [
  'dispute:propose_decision', 'dispute:approve_decision', 'finance:reconcile', 'finance:export', 'payout:approve_exception', 'policy:manage', 'kyc:review',
];

/** Accès aux écrans : au moins une des permissions. */
export const SCREEN_PERMS = {
  cockpit: ['admin:access'],
  kyc: ['kyc:review'],
  // FINANCE (approbateur) consulte les litiges pour pouvoir approuver : miroir de l'API.
  disputes: ['dispute:view_all', 'dispute:view_assigned', 'dispute:approve_decision'],
  finance: ['finance:view'],
  audit: ['audit:view'],
  policies: ['admin:access'],
} as const satisfies Record<string, readonly Permission[]>;

export type ScreenKey = keyof typeof SCREEN_PERMS;

export function canSee(roles: readonly Role[], screen: ScreenKey): boolean {
  return canAny(roles, SCREEN_PERMS[screen]);
}

export type DisputeActionKey = 'assign' | 'triage' | 'requestEvidence' | 'startReview' | 'propose' | 'approve' | 'reject' | 'close';

export interface ActionGate {
  /** L'action existe pour ce rôle dans cet état (sinon : non affichée). */
  visible: boolean;
  /** Affichée mais désactivée, avec une explication. */
  enabled: boolean;
  reason: string | null;
}

export interface DisputeGateContext {
  roles: readonly Role[];
  userId: string;
  mfaVerified: boolean;
  state: DisputeState | null;
  assigneeId: string | null;
  decision: { state: string; proposedById: string | null } | null;
  /** `allowedActions` renvoyé par l'API (noms de routes) : s'il est présent, il fait foi pour la visibilité. */
  allowedActions?: readonly string[] | null;
}

/** Nom d'action côté API (segment de route) pour chaque action de la console. */
export const API_ACTION_NAME: Record<DisputeActionKey, string> = {
  assign: 'assign',
  triage: 'triage',
  requestEvidence: 'request-evidence',
  startReview: 'start-review',
  propose: 'decision',
  approve: 'approve',
  reject: 'reject',
  close: 'close',
};

const ACTION_PERM: Record<DisputeActionKey, Permission> = {
  assign: 'dispute:view_all',
  triage: 'dispute:request_evidence',
  requestEvidence: 'dispute:request_evidence',
  startReview: 'dispute:request_evidence',
  propose: 'dispute:propose_decision',
  approve: 'dispute:approve_decision',
  reject: 'dispute:approve_decision',
  close: 'dispute:propose_decision',
};

/** États depuis lesquels chaque action est possible (déduits de `disputeMachine`). */
const ACTION_TARGET: Partial<Record<DisputeActionKey, DisputeState>> = {
  triage: 'TRIAGED',
  requestEvidence: 'EVIDENCE_REQUESTED',
  startReview: 'UNDER_REVIEW',
  propose: 'DECISION_PROPOSED',
  approve: 'APPROVED',
  reject: 'UNDER_REVIEW',
  close: 'CLOSED',
};

function stateAllows(action: DisputeActionKey, state: DisputeState | null): boolean {
  if (!state) return false;
  if (action === 'assign') return state !== 'CLOSED';
  if (action === 'reject') return state === 'DECISION_PROPOSED';
  // DECISION_PROPOSED → UNDER_REVIEW n'existe que via le rejet de la proposition : pas de « démarrer l'instruction » ici.
  if (action === 'startReview' && state === 'DECISION_PROPOSED') return false;
  const target = ACTION_TARGET[action];
  return target ? disputeMachine.can(state, target) : false;
}

export function disputeActionGates(ctx: DisputeGateContext): Record<DisputeActionKey, ActionGate> {
  const out = {} as Record<DisputeActionKey, ActionGate>;
  for (const key of Object.keys(ACTION_PERM) as DisputeActionKey[]) {
    const perm = ACTION_PERM[key];
    const visible = ctx.allowedActions
      ? ctx.allowedActions.includes(API_ACTION_NAME[key])
      : can(ctx.roles, perm) && stateAllows(key, ctx.state);
    let reason: string | null = null;
    if (visible && MFA_SENSITIVE.includes(perm) && !ctx.mfaVerified) {
      reason = 'MFA requise : reconnectez-vous avec votre code TOTP.';
    }
    if (visible && (key === 'approve' || key === 'reject') && ctx.decision?.proposedById && ctx.decision.proposedById === ctx.userId) {
      reason = 'Séparation des tâches : vous avez proposé cette décision, une autre personne doit l’approuver ou la rejeter.';
    }
    if (visible && (key === 'approve' || key === 'reject') && ctx.decision && ctx.decision.state !== 'PROPOSED') {
      reason = 'Aucune proposition en attente d’approbation.';
    }
    out[key] = { visible, enabled: visible && reason === null, reason };
  }
  return out;
}

/** Étapes suivantes autorisées par la machine d'états (affichage informatif). */
export function nextDisputeStates(state: DisputeState | null): readonly DisputeState[] {
  return state ? disputeMachine.next(state) : [];
}
