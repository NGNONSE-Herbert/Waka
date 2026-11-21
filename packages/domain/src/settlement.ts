import { DomainError } from './errors.js';
import type { BookingState, PaymentState } from './state-machines.js';

/**
 * Règles de libération et d'allocation. Fonctions pures : l'API les appelle DANS la transaction
 * qui a verrouillé le paiement (SELECT … FOR UPDATE), puis persiste le résultat.
 */

export interface ReleaseContext {
  readonly bookingState: BookingState;
  readonly paymentState: PaymentState;
  readonly hasOpenDispute: boolean;
  readonly passengerConfirmed: boolean;
  readonly payoutAlreadyRequested: boolean;
}

export type ReleaseDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'DISPUTE_OPEN' | 'NOT_CONFIRMED_BY_PASSENGER' | 'ALREADY_REQUESTED' | 'PAYMENT_NOT_HELD' | 'TRIP_NOT_ARRIVED' };

/**
 * Invariant §5.10 : le clic « conducteur arrivé » n'autorise jamais seul la libération.
 * Il faut la confirmation explicite du passager ET aucun litige ouvert ET un paiement détenu par le PSP.
 */
export function evaluateRelease(ctx: ReleaseContext): ReleaseDecision {
  if (ctx.hasOpenDispute || ctx.paymentState === 'FROZEN_DISPUTE') return { allowed: false, reason: 'DISPUTE_OPEN' };
  if (ctx.payoutAlreadyRequested) return { allowed: false, reason: 'ALREADY_REQUESTED' };
  if (ctx.paymentState !== 'PSP_CONFIRMED_HELD' && ctx.paymentState !== 'RELEASE_ELIGIBLE') {
    return { allowed: false, reason: 'PAYMENT_NOT_HELD' };
  }
  if (!['ARRIVAL_REPORTED', 'IN_PROGRESS', 'CHECKED_IN'].includes(ctx.bookingState)) {
    return { allowed: false, reason: 'TRIP_NOT_ARRIVED' };
  }
  if (!ctx.passengerConfirmed) return { allowed: false, reason: 'NOT_CONFIRMED_BY_PASSENGER' };
  return { allowed: true };
}

/**
 * Politique de non-réponse du passager. Par défaut : DÉSACTIVÉE (MANUAL_REVIEW).
 * Une libération automatique n'est possible que si juriste + PSP l'ont validée (flag + version).
 */
export interface NoResponsePolicy {
  readonly version: string;
  readonly autoReleaseEnabled: boolean;
  readonly windowHours: number;
  readonly legallyValidatedRef: string | null;
}

export const DEFAULT_NO_RESPONSE_POLICY: NoResponsePolicy = Object.freeze({
  version: 'noresp-2026-11-v0',
  autoReleaseEnabled: false,
  windowHours: 48,
  legallyValidatedRef: null,
});

export function noResponseOutcome(
  policy: NoResponsePolicy,
  arrivalReportedAt: Date,
  now: Date,
  hasOpenDispute: boolean,
): 'WAIT' | 'MANUAL_REVIEW' | 'AUTO_RELEASE_ELIGIBLE' {
  if (hasOpenDispute) return 'WAIT';
  const elapsedH = (now.getTime() - arrivalReportedAt.getTime()) / 3_600_000;
  if (elapsedH < policy.windowHours) return 'WAIT';
  if (policy.autoReleaseEnabled && policy.legallyValidatedRef) return 'AUTO_RELEASE_ELIGIBLE';
  return 'MANUAL_REVIEW';
}

/** Situation financière d'une réservation (tout en XAF entiers). */
export interface FundsPosition {
  readonly captured: number;     // total confirmé par le PSP
  readonly driverAmount: number; // part conducteur du snapshot
  readonly serviceFee: number;   // frais du snapshot
  readonly refunded: number;     // remboursements CONFIRMÉS ou EN COURS
  readonly released: number;     // versements CONFIRMÉS ou EN COURS
}

export interface Allocation {
  /** Montant rendu au passager */
  readonly refundToPassenger: number;
  /** Montant versé au conducteur */
  readonly releaseToDriver: number;
}

export interface AllocationBreakdown extends Allocation {
  readonly refundFromDriverShare: number;
  readonly refundFromFee: number;
  readonly feeRetained: number;
}

/**
 * Valide une allocation (décision de litige ou règlement normal) :
 * - aucun montant négatif ; aucun remboursement au-delà de ce qui a été payé ;
 * - la plateforme ne garde jamais une part conducteur : ce qui n'est pas versé au conducteur est remboursé ;
 * - rien ne peut être alloué deux fois (prend en compte refunded/released déjà engagés).
 */
export function validateAllocation(pos: FundsPosition, alloc: Allocation): AllocationBreakdown {
  const { refundToPassenger: r, releaseToDriver: p } = alloc;
  for (const v of [r, p]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new DomainError('INVALID_AMOUNT', 'Montant d’allocation invalide');
  }
  if (pos.captured !== pos.driverAmount + pos.serviceFee) {
    throw new DomainError('AMOUNT_MISMATCH', 'Montant capturé incohérent avec le snapshot');
  }
  if (pos.refunded > 0 || pos.released > 0) {
    throw new DomainError('ALREADY_EXECUTED', 'Une allocation a déjà été engagée pour cette réservation');
  }
  if (r + p > pos.captured) throw new DomainError('ALLOCATION_EXCEEDED', 'Allocation supérieure au montant payé');
  if (p > pos.driverAmount) throw new DomainError('ALLOCATION_EXCEEDED', 'Versement supérieur à la part conducteur');
  const driverNotReleased = pos.driverAmount - p;
  if (r < driverNotReleased) {
    throw new DomainError('ALLOCATION_EXCEEDED', 'La part conducteur non versée doit être remboursée au passager');
  }
  const refundFromDriverShare = driverNotReleased;
  const refundFromFee = r - refundFromDriverShare;
  if (refundFromFee > pos.serviceFee) throw new DomainError('ALLOCATION_EXCEEDED', 'Remboursement supérieur au payé');
  return Object.freeze({
    refundToPassenger: r,
    releaseToDriver: p,
    refundFromDriverShare,
    refundFromFee,
    feeRetained: pos.serviceFee - refundFromFee,
  });
}

/** Seuil au-delà duquel une décision exige une seconde approbation (paramétrable). */
export const DOUBLE_APPROVAL_THRESHOLD_XAF = 0; // MVP : toute décision financière de litige est approuvée par une 2e personne

export function requiresSecondApproval(alloc: Allocation, sensitive: boolean): boolean {
  return sensitive || alloc.refundToPassenger + alloc.releaseToDriver > DOUBLE_APPROVAL_THRESHOLD_XAF;
}
