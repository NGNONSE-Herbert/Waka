import { isDomainError, validateAllocation, type AllocationBreakdown, type FundsPosition } from '@waka/domain';
import { fcfa } from './format';

/**
 * Aperçu CLIENT d'une répartition de décision de litige. Le serveur reste seule source de vérité :
 * il revalide l'allocation dans la transaction qui verrouille le paiement.
 */
export type SplitPreview =
  | { ok: true; breakdown: AllocationBreakdown; rows: { label: string; value: string; emphasis?: boolean }[] }
  | { ok: false; error: string };

/** Parse une saisie FCFA : entiers positifs, espaces tolérés (« 5 500 »). */
export function parseFcfaInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '');
  if (cleaned === '') return null;
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

const FR_ERRORS: Record<string, string> = {
  INVALID_AMOUNT: 'Montants invalides : saisissez des entiers positifs en FCFA.',
  AMOUNT_MISMATCH: 'Le montant encaissé ne correspond pas au snapshot de prix : décision impossible, signalez une anomalie.',
  ALREADY_EXECUTED: 'Un remboursement ou un versement a déjà été engagé pour cette réservation : aucune nouvelle allocation possible.',
};

export function previewSplit(pos: FundsPosition | null, refundRaw: string, releaseRaw: string): SplitPreview {
  if (!pos) return { ok: false, error: 'Position financière de la réservation indisponible : aperçu impossible (le serveur validera).' };
  const r = parseFcfaInput(refundRaw);
  const p = parseFcfaInput(releaseRaw);
  if (r === null || p === null) return { ok: false, error: 'Renseignez les deux montants (0 accepté).' };
  if (Number.isNaN(r) || Number.isNaN(p)) return { ok: false, error: 'Montants invalides : chiffres uniquement, sans décimales.' };
  try {
    const b = validateAllocation(pos, { refundToPassenger: r, releaseToDriver: p });
    return {
      ok: true,
      breakdown: b,
      rows: [
        { label: 'Remboursé au passager', value: fcfa(b.refundToPassenger), emphasis: true },
        { label: '· dont prélevé sur la part conducteur', value: fcfa(b.refundFromDriverShare) },
        { label: '· dont prélevé sur les frais de service', value: fcfa(b.refundFromFee) },
        { label: 'Versé au conducteur', value: fcfa(b.releaseToDriver), emphasis: true },
        { label: 'Frais de service conservés', value: fcfa(b.feeRetained) },
      ],
    };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: FR_ERRORS[e.code] ?? `${e.message}.` };
    return { ok: false, error: 'Répartition invalide.' };
  }
}

/** Raccourcis de saisie (le gestionnaire reste responsable du choix). */
export function presets(pos: FundsPosition): { label: string; refund: number; release: number }[] {
  return [
    { label: 'Remboursement intégral', refund: pos.captured, release: 0 },
    { label: 'Remboursement hors frais', refund: pos.driverAmount, release: 0 },
    { label: 'Versement intégral au conducteur', refund: 0, release: pos.driverAmount },
  ];
}
