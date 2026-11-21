import { DomainError } from './errors.js';

/** Rôles (cahier §3). Un compte peut cumuler PASSENGER et DRIVER ; les rôles staff sont séparés. */
export const ROLES = ['PASSENGER', 'DRIVER', 'SUPPORT_AGENT', 'DISPUTE_MANAGER', 'FINANCE', 'SUPERADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = ['SUPPORT_AGENT', 'DISPUTE_MANAGER', 'FINANCE', 'SUPERADMIN'];

export const PERMISSIONS = [
  'trip:publish',
  'booking:create',
  'dispute:open',
  'admin:access',
  'kyc:review',
  'dispute:view_assigned',
  'dispute:view_all',
  'dispute:request_evidence',
  'dispute:propose_decision',
  'dispute:approve_decision',
  'finance:view',
  'finance:reconcile',
  'finance:export',
  'payout:approve_exception',
  'audit:view',
  'policy:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Moindre privilège. Remarques :
 * - SUPPORT_AGENT ne peut NI proposer NI approuver une décision financière.
 * - SUPERADMIN n'a PAS de droit financier implicite (séparation des tâches) : il paramètre, il ne paie pas.
 * - Personne ne possède de permission « payer le conducteur » : un versement ne naît que de la politique.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  PASSENGER: ['booking:create', 'dispute:open'],
  DRIVER: ['trip:publish', 'booking:create', 'dispute:open'],
  SUPPORT_AGENT: ['admin:access', 'dispute:view_assigned', 'dispute:request_evidence'],
  DISPUTE_MANAGER: ['admin:access', 'dispute:view_all', 'dispute:request_evidence', 'dispute:propose_decision', 'dispute:approve_decision', 'kyc:review'],
  FINANCE: ['admin:access', 'finance:view', 'finance:reconcile', 'finance:export', 'payout:approve_exception', 'dispute:approve_decision'],
  SUPERADMIN: ['admin:access', 'audit:view', 'policy:manage', 'kyc:review', 'dispute:view_all'],
});

export interface Actor {
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly mfaVerified?: boolean;
}

export function hasPermission(actor: Actor, perm: Permission): boolean {
  return actor.roles.some((r) => ROLE_PERMISSIONS[r].includes(perm));
}

/** Les permissions sensibles exigent une MFA récente côté staff. */
const MFA_REQUIRED: readonly Permission[] = [
  'dispute:propose_decision', 'dispute:approve_decision', 'finance:reconcile', 'finance:export', 'payout:approve_exception', 'policy:manage', 'kyc:review',
];

export function requirePermission(actor: Actor, perm: Permission): void {
  if (!hasPermission(actor, perm)) throw new DomainError('FORBIDDEN', `Permission manquante : ${perm}`);
  if (MFA_REQUIRED.includes(perm) && !actor.mfaVerified) throw new DomainError('FORBIDDEN', `MFA requise pour ${perm}`);
}

/** ABAC : un agent support n'accède qu'aux dossiers qui lui sont attribués. */
export function canViewDispute(actor: Actor, dispute: { assignedTo: string | null; openerId: string; counterpartyId: string }): boolean {
  if (actor.userId === dispute.openerId || actor.userId === dispute.counterpartyId) return true;
  if (hasPermission(actor, 'dispute:view_all')) return true;
  if (hasPermission(actor, 'dispute:view_assigned')) return dispute.assignedTo === actor.userId;
  return false;
}

/** Séparation des tâches : l'approbateur doit être différent du proposant. */
export function assertDistinctApprover(proposerId: string, approverId: string): void {
  if (proposerId === approverId) {
    throw new DomainError('SEPARATION_OF_DUTIES', 'Une décision doit être approuvée par une autre personne que son auteur');
  }
}
