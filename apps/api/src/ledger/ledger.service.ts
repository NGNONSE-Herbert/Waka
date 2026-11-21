import { Injectable } from '@nestjs/common';
import { assertBalanced, type JournalDraft, LEDGER_ACCOUNTS, type LedgerAccount } from '@waka/domain';
import { sql } from 'drizzle-orm';
import { type DbOrTx, rows, type Tx } from '../db/client.js';
import { ledgerJournals, ledgerLines } from '../db/schema.js';

/**
 * Écriture au grand livre. SEUL point d'écriture : appelé exclusivement par les traitements
 * déclenchés par une preuve PSP (webhook re-vérifié). Aucune route HTTP n'y donne accès.
 * Idempotent : la clé métier unique (ex. `collection:<ref>`) empêche tout doublon.
 */
@Injectable()
export class LedgerService {
  async post(tx: Tx, draft: JournalDraft, providerRef: string | null = null): Promise<boolean> {
    assertBalanced(draft.lines);
    const inserted = await tx
      .insert(ledgerJournals)
      .values({ kind: draft.kind, bookingId: draft.bookingId, idempotencyKey: draft.idempotencyKey, providerRef, memo: draft.memo })
      .onConflictDoNothing({ target: ledgerJournals.idempotencyKey })
      .returning({ id: ledgerJournals.id });
    const journal = inserted[0];
    if (!journal) return false;
    await tx.insert(ledgerLines).values(draft.lines.map((l) => ({ journalId: journal.id, account: l.account, debit: l.debit, credit: l.credit })));
    return true;
  }

  /** Soldes (débit − crédit) par compte. */
  async balances(dbx: DbOrTx): Promise<Record<LedgerAccount, number>> {
    const r = await rows<{ account: LedgerAccount; balance: number }>(
      dbx,
      sql`SELECT account, (COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))::int AS balance FROM ledger_lines GROUP BY account`,
    );
    const out = Object.fromEntries(LEDGER_ACCOUNTS.map((a) => [a, 0])) as Record<LedgerAccount, number>;
    for (const x of r) out[x.account] = Number(x.balance);
    return out;
  }
}
