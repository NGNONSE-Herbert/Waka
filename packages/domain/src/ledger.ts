import { DomainError } from './errors.js';

/**
 * Grand livre en partie double, append-only.
 * IMPORTANT : ce ledger est un REGISTRE DE RAPPROCHEMENT. Les fonds réels sont détenus
 * par le PSP habilité (compte « psp_held »), jamais dans la trésorerie de la startup.
 * Aucune écriture n'est modifiée ou supprimée : on corrige par contre-écriture (reverse()).
 */
export const LEDGER_ACCOUNTS = [
  'psp_held',              // miroir des fonds détenus par le PSP pour le compte des bénéficiaires
  'driver_payable',        // part due au conducteur, conditionnelle
  'platform_fee_deferred', // frais de service encaissés mais non acquis (trajet non accompli)
  'platform_fee_revenue',  // frais de service acquis (trajet accompli ou décision)
  'adjustments',           // écarts constatés lors du rapprochement (investigation obligatoire)
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export type JournalKind =
  | 'COLLECTION_CONFIRMED'
  | 'FEE_RECOGNIZED'
  | 'PAYOUT_CONFIRMED'
  | 'REFUND_CONFIRMED'
  | 'REVERSAL'
  | 'RECONCILIATION_ADJUSTMENT';

export interface LedgerLine {
  readonly account: LedgerAccount;
  readonly debit: number;
  readonly credit: number;
}

export interface JournalDraft {
  readonly kind: JournalKind;
  readonly bookingId: string;
  /** Clé métier unique : empêche d'enregistrer deux fois le même événement économique. */
  readonly idempotencyKey: string;
  readonly memo: string;
  readonly lines: readonly LedgerLine[];
}

export function assertBalanced(lines: readonly LedgerLine[]): void {
  if (lines.length < 2) throw new DomainError('LEDGER_UNBALANCED', 'Un journal comporte au moins deux lignes');
  let d = 0;
  let c = 0;
  for (const l of lines) {
    if (!Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit) || l.debit < 0 || l.credit < 0) {
      throw new DomainError('LEDGER_UNBALANCED', 'Montants de ligne invalides');
    }
    if ((l.debit > 0) === (l.credit > 0)) {
      throw new DomainError('LEDGER_UNBALANCED', 'Chaque ligne est soit un débit, soit un crédit, strictement positif');
    }
    d += l.debit;
    c += l.credit;
  }
  if (d !== c) throw new DomainError('LEDGER_UNBALANCED', `Journal déséquilibré : débit ${d} ≠ crédit ${c}`);
}

function journal(kind: JournalKind, bookingId: string, idempotencyKey: string, memo: string, lines: LedgerLine[]): JournalDraft {
  const filtered = lines.filter((l) => l.debit > 0 || l.credit > 0);
  assertBalanced(filtered);
  return Object.freeze({ kind, bookingId, idempotencyKey, memo, lines: Object.freeze(filtered) });
}

const dr = (account: LedgerAccount, amount: number): LedgerLine => ({ account, debit: amount, credit: 0 });
const cr = (account: LedgerAccount, amount: number): LedgerLine => ({ account, debit: 0, credit: amount });

export const Journals = {
  /** Le PSP a confirmé (côté serveur) l'encaissement du total. */
  collectionConfirmed(bookingId: string, pspRef: string, driverAmount: number, serviceFee: number): JournalDraft {
    return journal('COLLECTION_CONFIRMED', bookingId, `collection:${pspRef}`, 'Encaissement confirmé par le PSP', [
      dr('psp_held', driverAmount + serviceFee),
      cr('driver_payable', driverAmount),
      cr('platform_fee_deferred', serviceFee),
    ]);
  },
  feeRecognized(bookingId: string, amount: number): JournalDraft {
    return journal('FEE_RECOGNIZED', bookingId, `fee:${bookingId}`, 'Frais de service acquis', [
      dr('platform_fee_deferred', amount),
      cr('platform_fee_revenue', amount),
    ]);
  },
  /** Uniquement sur confirmation PSP du décaissement (pas sur la simple demande). */
  payoutConfirmed(bookingId: string, payoutRef: string, amount: number): JournalDraft {
    return journal('PAYOUT_CONFIRMED', bookingId, `payout:${payoutRef}`, 'Versement conducteur confirmé par le PSP', [
      dr('driver_payable', amount),
      cr('psp_held', amount),
    ]);
  },
  /** Remboursement confirmé : imputé sur la part conducteur et/ou les frais différés. */
  refundConfirmed(bookingId: string, refundRef: string, fromDriverShare: number, fromFee: number): JournalDraft {
    return journal('REFUND_CONFIRMED', bookingId, `refund:${refundRef}`, 'Remboursement passager confirmé par le PSP', [
      dr('driver_payable', fromDriverShare),
      dr('platform_fee_deferred', fromFee),
      cr('psp_held', fromDriverShare + fromFee),
    ]);
  },
  /** Contre-écriture : seul moyen de corriger. */
  reverse(original: JournalDraft, reason: string): JournalDraft {
    return journal(
      'REVERSAL',
      original.bookingId,
      `reversal:${original.idempotencyKey}`,
      `Contre-passation : ${reason}`,
      original.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })),
    );
  },
};

/** Soldes (débit − crédit) par compte. */
export function balances(journals: readonly JournalDraft[]): Record<LedgerAccount, number> {
  const out = Object.fromEntries(LEDGER_ACCOUNTS.map((a) => [a, 0])) as Record<LedgerAccount, number>;
  for (const j of journals) for (const l of j.lines) out[l.account] += l.debit - l.credit;
  return out;
}
