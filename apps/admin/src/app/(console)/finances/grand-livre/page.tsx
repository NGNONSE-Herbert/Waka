'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, CheckCircle2, Lock, Search, XCircle } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { adminPath } from '@/lib/api';
import { list, obj } from '@/lib/normalize';
import { dateTimeFull, fcfa, int, shortId } from '@/lib/format';
import { normalizeJournal, type JournalView } from '@/lib/models';
import { RequireScreen } from '@/components/session';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, LoadingBlock, Notice, PageHeader, TableWrap, cn, td, th } from '@/components/ui';

const KIND_LABEL: Record<string, string> = {
  COLLECTION_CONFIRMED: 'Encaissement confirmé PSP',
  FEE_RECOGNIZED: 'Frais de service acquis',
  PAYOUT_CONFIRMED: 'Versement confirmé PSP',
  REFUND_CONFIRMED: 'Remboursement confirmé PSP',
  REVERSAL: 'Contre-passation',
  RECONCILIATION_ADJUSTMENT: 'Ajustement de rapprochement',
};

const ACCOUNT_LABEL: Record<string, string> = {
  psp_held: 'Fonds détenus par le PSP',
  driver_payable: 'Dû conducteur (conditionnel)',
  platform_fee_deferred: 'Frais différés',
  platform_fee_revenue: 'Frais acquis',
  adjustments: 'Écarts à investiguer',
};

export default function LedgerPage() {
  return (
    <RequireScreen screen="finance">
      <Suspense fallback={<Card><LoadingBlock /></Card>}><LedgerInner /></Suspense>
    </RequireScreen>
  );
}

function LedgerInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const bookingId = sp.get('bookingId') ?? '';
  const [q, setQ] = useState(bookingId);
  const { data, error, loading, reload } = useApi<unknown>(adminPath('ledger', undefined, { bookingId: bookingId || undefined }));
  // L'API renvoie le grand livre global : le filtre par réservation est appliqué ici (lecture seule).
  const journals = useMemo(() => list(data, 'journals').map(normalizeJournal).filter((j) => !bookingId || j.bookingId === bookingId), [data, bookingId]);
  const serverBalances = useMemo(() => {
    const b = obj(data, 'balances');
    return b ? Object.entries(b).filter((e): e is [string, number] => typeof e[1] === 'number') : null;
  }, [data]);
  const allBalanced = journals.every(isBalanced);

  return (
    <>
      <PageHeader
        eyebrow="Finances"
        title="Grand livre"
        description="Registre de rapprochement en partie double, append-only. Les fonds réels sont détenus par le PSP habilité."
      />
      <div className="mb-4">
        <Notice tone="neutral" icon={<Lock className="size-4" />} title="Lecture seule">
          Aucune écriture ne peut être créée, modifiée ou supprimée depuis la console. Une correction se fait uniquement par contre-passation générée côté serveur.
        </Notice>
      </div>
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); router.replace(q.trim() ? `/finances/grand-livre?bookingId=${encodeURIComponent(q.trim())}` : '/finances/grand-livre'); }}
        >
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="booking-q" className="mb-1.5 block text-[13px] font-medium">Identifiant de réservation</label>
            <Input id="booking-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="UUID de la réservation (vide = derniers journaux)" className="font-mono" />
          </div>
          <Button type="submit" variant="night"><Search aria-hidden className="size-4" /> Afficher</Button>
        </form>
      </Card>

      {error ? <Card><ErrorState error={error} onRetry={reload} /></Card> : null}
      {loading && data === undefined ? <Card><LoadingBlock /></Card> : null}
      {!loading && !error && journals.length === 0 ? <Card><EmptyState title="Aucun journal" icon={<BookOpen className="size-5" />}>{bookingId ? 'Aucune écriture pour cette réservation.' : 'Le grand livre est vide.'}</EmptyState></Card> : null}

      {journals.length ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink">{int(journals.length)} journal(aux){bookingId ? <> pour la réservation <span className="font-mono text-text">#{shortId(bookingId)}</span></> : null}</span>
            {allBalanced ? <Badge tone="green" icon={<CheckCircle2 aria-hidden className="size-3" />}>Tous équilibrés (Σ débit = Σ crédit)</Badge> : <Badge tone="red" icon={<XCircle aria-hidden className="size-3" />}>Journal déséquilibré détecté — signaler immédiatement</Badge>}
          </div>
          {!bookingId && serverBalances ? <ServerBalances rows={serverBalances} /> : <BalancesCard journals={journals} />}
          <div className="mt-4 space-y-3">
            {journals.map((j) => <JournalCard key={j.id} j={j} />)}
          </div>
        </>
      ) : null}
    </>
  );
}

function isBalanced(j: JournalView): boolean {
  const d = j.lines.reduce((s, l) => s + l.debit, 0);
  const c = j.lines.reduce((s, l) => s + l.credit, 0);
  return d === c && j.lines.length >= 2;
}

function BalancesCard({ journals }: { journals: JournalView[] }) {
  const bal: Record<string, { d: number; c: number }> = {};
  for (const j of journals) for (const l of j.lines) {
    bal[l.account] ??= { d: 0, c: 0 };
    bal[l.account]!.d += l.debit;
    bal[l.account]!.c += l.credit;
  }
  return (
    <Card>
      <CardHeader title="Soldes par compte" subtitle="Solde = débit − crédit, sur les journaux affichés." />
      <TableWrap label="Soldes par compte">
        <table className="w-full min-w-[560px]">
          <thead className="bg-muted"><tr><th scope="col" className={th}>Compte</th><th scope="col" className={cn(th, 'text-right')}>Débit</th><th scope="col" className={cn(th, 'text-right')}>Crédit</th><th scope="col" className={cn(th, 'text-right')}>Solde</th></tr></thead>
          <tbody>
            {Object.entries(bal).map(([acc, v]) => (
              <tr key={acc} className="border-t border-line">
                <td className={td}><span className="font-mono text-[12.5px]">{acc}</span> <span className="text-[12px] text-ink">{ACCOUNT_LABEL[acc] ?? ''}</span></td>
                <td className={cn(td, 'tnum text-right')}>{fcfa(v.d)}</td>
                <td className={cn(td, 'tnum text-right')}>{fcfa(v.c)}</td>
                <td className={cn(td, 'tnum text-right font-semibold')}>{fcfa(v.d - v.c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function JournalCard({ j }: { j: JournalView }) {
  const d = j.lines.reduce((s, l) => s + l.debit, 0);
  const c = j.lines.reduce((s, l) => s + l.credit, 0);
  const ok = isBalanced(j);
  return (
    <Card as="article" aria-label={`Journal ${KIND_LABEL[j.kind] ?? j.kind}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <p className="text-[14px] font-semibold">{KIND_LABEL[j.kind] ?? j.kind}</p>
          <p className="text-[12px] text-ink">{j.memo ?? ''} · <span className="tnum">{dateTimeFull(j.at)}</span> · <span className="font-mono">#{shortId(j.id)}</span>{j.bookingId ? <> · résa <span className="font-mono">#{shortId(j.bookingId)}</span></> : null}</p>
        </div>
        {ok ? <Badge tone="green">Équilibré</Badge> : <Badge tone="red">Déséquilibré</Badge>}
      </div>
      <TableWrap label="Lignes du journal">
        <table className="w-full min-w-[520px]">
          <thead><tr><th scope="col" className={th}>Compte</th><th scope="col" className={cn(th, 'text-right')}>Débit</th><th scope="col" className={cn(th, 'text-right')}>Crédit</th></tr></thead>
          <tbody>
            {j.lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className={cn(td, l.credit > 0 && 'pl-8')}><span className="font-mono text-[12.5px]">{l.account}</span></td>
                <td className={cn(td, 'tnum text-right')}>{l.debit ? fcfa(l.debit) : ''}</td>
                <td className={cn(td, 'tnum text-right')}>{l.credit ? fcfa(l.credit) : ''}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-strong bg-ivory">
              <th scope="row" className={cn(td, 'text-left font-semibold')}>Total</th>
              <td className={cn(td, 'tnum text-right font-semibold')}>{fcfa(d)}</td>
              <td className={cn(td, 'tnum text-right font-semibold')}>{fcfa(c)}</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function ServerBalances({ rows }: { rows: [string, number][] }) {
  return (
    <Card>
      <CardHeader title="Soldes globaux par compte" subtitle="Calculés par le serveur sur l’ensemble du grand livre." />
      <dl className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">
        {rows.map(([acc, v]) => (
          <div key={acc} className="bg-surface px-4 py-3">
            <dt className="font-mono text-[12px] text-ink">{acc}</dt>
            <dd className="tnum mt-0.5 font-display text-lg font-bold">{fcfa(v)}</dd>
            <dd className="text-[11.5px] text-ink">{ACCOUNT_LABEL[acc] ?? ''}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
