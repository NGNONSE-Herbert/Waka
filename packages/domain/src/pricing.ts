import { DomainError } from './errors.js';
import { type Xaf, xaf } from './money.js';

/**
 * Politique de frais versionnée. Une réservation stocke un SNAPSHOT (version + montants) :
 * changer la politique n'altère jamais une réservation existante.
 * Les valeurs par défaut reprennent l'exemple NON CONTRACTUEL du cahier des charges (§6.2).
 */
export interface FeePolicy {
  readonly version: string;
  /** Frais de service fixes par place (XAF). */
  readonly serviceFeePerSeat: number;
  /** Frais proportionnels en points de base (100 bp = 1 %). Arrondi au FCFA supérieur. */
  readonly serviceFeeRateBp: number;
  readonly minFeePerSeat: number;
  readonly maxFeePerSeat: number;
  readonly minSeatPrice: number;
  readonly maxSeatPrice: number;
  readonly maxSeatsPerBooking: number;
}

export const DEFAULT_FEE_POLICY: FeePolicy = Object.freeze({
  version: 'fees-2026-11-v1',
  serviceFeePerSeat: 500,
  serviceFeeRateBp: 0,
  minFeePerSeat: 0,
  maxFeePerSeat: 2_000,
  minSeatPrice: 500,
  maxSeatPrice: 50_000,
  maxSeatsPerBooking: 4,
});

export interface PriceQuote {
  readonly policyVersion: string;
  readonly seats: number;
  readonly seatPrice: Xaf;
  /** Part destinée au conducteur (conditionnelle) */
  readonly driverAmount: Xaf;
  /** Frais de service plateforme */
  readonly serviceFee: Xaf;
  /** Total réglé par le passager via le PSP */
  readonly total: Xaf;
}

export function feePerSeat(seatPrice: number, policy: FeePolicy): number {
  const proportional = Math.ceil((seatPrice * policy.serviceFeeRateBp) / 10_000);
  const raw = policy.serviceFeePerSeat + proportional;
  return Math.min(policy.maxFeePerSeat, Math.max(policy.minFeePerSeat, raw));
}

export function validateSeatPrice(seatPrice: number, policy: FeePolicy = DEFAULT_FEE_POLICY): Xaf {
  const p = xaf(seatPrice);
  if (p < policy.minSeatPrice || p > policy.maxSeatPrice) {
    throw new DomainError('INVALID_AMOUNT', `Contribution par place hors bornes (${policy.minSeatPrice}–${policy.maxSeatPrice} FCFA)`, {
      min: policy.minSeatPrice,
      max: policy.maxSeatPrice,
    });
  }
  if (p % 50 !== 0) {
    throw new DomainError('INVALID_AMOUNT', 'La contribution doit être un multiple de 50 FCFA');
  }
  return p;
}

/** Calcul serveur unique du prix. Le client n'envoie jamais de montant. */
export function quote(seatPrice: number, seats: number, policy: FeePolicy = DEFAULT_FEE_POLICY): PriceQuote {
  const price = validateSeatPrice(seatPrice, policy);
  if (!Number.isInteger(seats) || seats < 1 || seats > policy.maxSeatsPerBooking) {
    throw new DomainError('VALIDATION_ERROR', `Nombre de places invalide (1–${policy.maxSeatsPerBooking})`);
  }
  const driverAmount = xaf(price * seats);
  const serviceFee = xaf(feePerSeat(price, policy) * seats, { allowZero: true });
  const total = xaf(driverAmount + serviceFee);
  return Object.freeze({ policyVersion: policy.version, seats, seatPrice: price, driverAmount, serviceFee, total });
}
