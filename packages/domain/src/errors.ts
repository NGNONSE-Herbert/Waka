/**
 * Erreurs métier normalisées. Chaque code est stable et documenté dans docs/API.md.
 * Le message est destiné aux développeurs ; l'UI traduit le code.
 */
export type DomainErrorCode =
  | 'INVALID_TRANSITION'
  | 'INVALID_AMOUNT'
  | 'CURRENCY_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'SEATS_UNAVAILABLE'
  | 'HOLD_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DRIVER_NOT_ELIGIBLE'
  | 'VEHICLE_NOT_ELIGIBLE'
  | 'LEDGER_UNBALANCED'
  | 'ALLOCATION_EXCEEDED'
  | 'ALREADY_EXECUTED'
  | 'DISPUTE_BLOCKS_RELEASE'
  | 'SEPARATION_OF_DUTIES'
  | 'FEATURE_NOT_SUPPORTED'
  | 'BLOCKED_BY_PROVIDER_CONTRACT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INVALID_SIGNATURE'
  | 'REPLAYED_EVENT';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
