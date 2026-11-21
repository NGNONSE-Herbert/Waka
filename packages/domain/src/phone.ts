import { DomainError } from './errors.js';

/**
 * Numéros camerounais au format E.164 : +237 suivi de 9 chiffres.
 * Mobile : commence par 6. (Les plages par opérateur évoluent : NE PAS en déduire l'opérateur
 * pour un paiement — c'est l'utilisateur qui choisit MTN MoMo ou Orange Money. À vérifier auprès de l'ART.)
 */
export function normalizeCmPhone(input: string): string {
  const digits = input.replace(/[\s().-]/g, '');
  let local: string;
  if (/^\+237\d{9}$/.test(digits)) local = digits.slice(4);
  else if (/^00237\d{9}$/.test(digits)) local = digits.slice(5);
  else if (/^237\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^\d{9}$/.test(digits)) local = digits;
  else throw new DomainError('VALIDATION_ERROR', 'Numéro camerounais invalide (format attendu : +237 6XX XX XX XX)');
  if (!local.startsWith('6')) throw new DomainError('VALIDATION_ERROR', 'Un numéro mobile camerounais commence par 6');
  return `+237${local}`;
}

/** Masquage pour logs et écrans tiers : +237 6•• •• •• 42 */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 4)} ${e164.slice(4, 5)}•• •• •• ${e164.slice(-2)}`;
}
