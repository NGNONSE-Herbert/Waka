'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, Wallet } from 'lucide-react';
import { PAYMENT_STATES, PAYMENT_STATE_LABEL_FR } from '@waka/domain';
import { useApi } from '@/lib/use-api';
import { adminPath } from '@/lib/api';
import { arr, list, num, str } from '@/lib/normalize';
import { dateTime, fcfa, shortId } from '@/lib/format';
import { paymentLabel, tripLabelOf } from '@/lib/models';
import { can } from '@/lib/permissions';
import { toCsv, downloadCsv } from '@/lib/csv';
import { RequireScreen, useSession } from '@/components/session';
import { PaymentStateBadge } from '@/components/status';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, Select, TableWrap, cn, td, th, tr } from '@/components/ui';

interface PaymentRow {
  id: string;
  bookingId: string | null;
  state: string | null;
  apiLabel: string | null;
  amount: number | null;
  channel: string | null;
  mode: string | null;
  providerRef: string | null;
  trip: string | null;
  payer: string | null;
  updatedAt: string | null;
}

function normalize(raw: unknown): PaymentRow[] {
  return list(raw, 'payments')
    .map((p) => {
      const id = str(p, 'id');
      if (!id) return null;
      return {
        id,
        bookingId: str(p, 'bookingId', 'booking.id'),
        state: str(p, 'state'),
        apiLabel: str(p, 'stateLabel'),
        amount: num(p, 'amount'),
        channel: str(p, 'channel'),
        mode: str(p, 'providerMode', 'mode', 'provider'),
        providerRef: str(p, 'providerRef', 'pspRef'),
        trip: tripLabelOf(p) ?? str(p, 'route'),
        payer: str(p, 'payerPhoneMasked'),
        updatedAt: str(p, 'updatedAt', 'createdAt'),
      };
    })
    .filter((x): x is PaymentRow => x !== null);
}

const CHANNEL: Record<string, string> = { MTN_MOMO: 'MTN MoMo', ORANGE_MONEY: 'Orange Money' };

export default function PaymentsPage() {
  return <RequireScreen screen="finance"><PaymentsInner /></RequireScreen>;
}

function PaymentsInner() {
  const { me } = useSession();
  const [state, setState] = useState('');
  const { data, error, loading, reload } = useApi<unknown>(adminPath('payments', undefined, { state: state || undefined }));
  const rows = useMemo(() => normalize(data).filter((r) => !state || r.state === state), [data, state]);
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const anomalies = useMemo(() => arr(data, 'anomalies').map((a, i) => ({
    id: str(a, 'id') ?? String(i), kind: str(a, 'kind') ?? '—', status: str(a, 'status') ?? '—', bookingId: str(a, 'bookingId'), paymentId: str(a, 'paymentId'), at: str(a, 'createdAt'),
  })), [data]);
  const openAnomalies = anomalies.filter((a) => a.status !== 'RESOLVED' && a.status !== 'CLOSED');

  function exportCsv() {
    downloadCsv(
      `waka-paiements-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(['id', 'reservation', 'etat', 'libelle', 'montant_xaf', 'canal', 'mode', 'ref_psp', 'maj'], rows.map((r) => [r.id, r.bookingId, r.state, paymentLabel(r.state, r.apiLabel), r.amount, r.channel, r.mode, r.providerRef, r.updatedAt])),
    );
  }

  return (
    <>
      <PageHeader eyebrow="Finances" title="Paiements" description="États PSP tels que confirmés côté serveur. « Demandé » n’est jamais « confirmé »." />
      {openAnomalies.length ? (
        <Card className="mb-4">
          <CardHeader title={<>Anomalies ouvertes <span className="tnum text-ink">({openAnomalies.length})</span></>} subtitle="Écarts ou incohérences PSP détectés par le serveur : investigation requise." />
          <ul className="divide-y divide-line">
            {openAnomalies.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px]">
                <span className="flex items-center gap-2"><Badge tone="red">{a.kind}</Badge>{a.bookingId ? <span className="text-ink">Résa <span className="font-mono">#{shortId(a.bookingId)}</span></span> : null}{a.paymentId ? <span className="text-ink">· paiement <span className="font-mono">#{shortId(a.paymentId)}</span></span> : null}</span>
                <span className="text-ink">{a.status} · {dateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <CardHeader
          title={<>Paiements <span className="tnum text-ink">({rows.length})</span></>}
          subtitle={<>Volume affiché : <span className="tnum font-medium text-text">{fcfa(total)}</span> — volume ≠ chiffre d’affaires</>}
          actions={
            <>
              <label htmlFor="pay-state" className="sr-only">Filtrer par état</label>
              <Select id="pay-state" value={state} onChange={(e) => setState(e.target.value)} className="w-auto max-w-[19rem]">
                <option value="">Tous les états</option>
                {PAYMENT_STATES.map((s) => <option key={s} value={s}>{PAYMENT_STATE_LABEL_FR[s]}</option>)}
              </Select>
              {can(me.roles, 'finance:export') ? <Button size="sm" onClick={exportCsv} disabled={!rows.length}><Download aria-hidden className="size-3.5" /> CSV</Button> : null}
            </>
          }
        />
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {loading && data === undefined ? <LoadingBlock rows={6} /> : null}
        {!loading && !error && rows.length === 0 ? <EmptyState title="Aucun paiement pour ce filtre" icon={<Wallet className="size-5" />} /> : null}
        {rows.length ? (
          <TableWrap label="Liste des paiements">
            <table className="data-table w-full min-w-[900px]">
              <thead>
                <tr>
                  <th scope="col" className={th}>Paiement</th>
                  <th scope="col" className={th}>État</th>
                  <th scope="col" className={cn(th, 'text-right')}>Montant</th>
                  <th scope="col" className={th}>Canal</th>
                  <th scope="col" className={th}>Réf. PSP</th>
                  <th scope="col" className={th}>Mis à jour</th>
                  <th scope="col" className={th}><span className="sr-only">Grand livre</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={tr}>
                    <td className={td}>
                      <p className="font-mono text-[12.5px]">#{shortId(r.id)}</p>
                      <p className="text-[12px] text-ink">Résa <span className="font-mono">#{shortId(r.bookingId)}</span>{r.trip ? ` · ${r.trip}` : ''}{r.payer ? <> · <span className="font-mono">{r.payer}</span></> : null}</p>
                    </td>
                    <td className={td}><PaymentStateBadge state={r.state} apiLabel={r.apiLabel} showCode /></td>
                    <td className={cn(td, 'tnum text-right font-medium')}>{fcfa(r.amount)}</td>
                    <td className={td}>{r.channel ? CHANNEL[r.channel] ?? r.channel : '—'} {r.mode ? <Badge tone="amber" className="ml-1">{r.mode}</Badge> : null}</td>
                    <td className={cn(td, 'font-mono text-[12px] text-ink')}>{r.providerRef ?? '—'}</td>
                    <td className={cn(td, 'text-ink')}>{dateTime(r.updatedAt)}</td>
                    <td className={cn(td, 'text-right')}>
                      {r.bookingId ? <Link className="text-[12.5px] font-medium text-brand-strong hover:underline" href={`/finances/grand-livre?bookingId=${encodeURIComponent(r.bookingId)}`}>Journaux</Link> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </Card>
      <div className="mt-4"><Notice tone="neutral">Aucune action de versement n’existe dans la console : les versements naissent uniquement de la politique de règlement ou d’une décision de litige approuvée.</Notice></div>
    </>
  );
}
