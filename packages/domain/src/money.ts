import { DomainError } from './errors.js';

/** Le franc CFA (XAF) n'a pas de subdivision utilisée : tous les montants sont des entiers. */
export const CURRENCY = 'XAF' as const;
export type Currency = typeof CURRENCY;

/** Montant XAF entier, strictement validé. Le type « branded » empêche de passer un number brut par erreur. */
export type Xaf = number & { readonly __brand: 'XAF' };

export const MAX_XAF = 10_000_000; // garde-fou métier : aucun montant unitaire au-delà de 10 M FCFA

export function xaf(value: number, opts: { allowZero?: boolean } = {}): Xaf {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('INVALID_AMOUNT', `Montant XAF non entier : ${value}`);
  }
  if (value < 0 || (!opts.allowZero && value === 0)) {
    throw new DomainError('INVALID_AMOUNT', `Montant XAF invalide : ${value}`);
  }
  if (value > MAX_XAF) {
    throw new DomainError('INVALID_AMOUNT', `Montant XAF hors plafond : ${value}`);
  }
  return value as Xaf;
}

export function assertCurrency(currency: string): asserts currency is Currency {
  if (currency !== CURRENCY) {
    throw new DomainError('CURRENCY_MISMATCH', `Devise attendue XAF, reçue ${currency}`);
  }
}

/** Affichage FR : « 5 500 FCFA » (espace insécable fine). */
export function formatXaf(amount: number, locale: 'fr' | 'en' = 'fr'): string {
  const n = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 0 }).format(amount);
  return `${n} FCFA`;
}
