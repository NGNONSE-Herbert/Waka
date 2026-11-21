'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Download, GitCompareArrows, Play } from 'lucide-react';
import { adminPath, apiFetch, callAdmin, ApiRequestError } from '@/lib/api';
import { arr, isObj, list, num, obj, str } from '@/lib/normalize';
import { dateOnly, dateTime, fcfa } from '@/lib/format';
import { can } from '@/lib/permissions';
import { downloadCsv, toCsv } from '@/lib/csv';
import { RequireScreen, useSession } from '@/components/session';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, LoadingBlock, Notice, PageHeader, TableWrap, cn, td, th, tr } from '@/components/ui';

interface Totals { collections: number | null; payouts: number | null; refunds: number | null }
interface Discrepancy { providerRef: string; kind: string; providerAmount: number | null; ledgerAmount: number | null; issue: string }
interface Run { id: string; day: string; ranAt: string | null; status: string; provider: Totals; ledger: Totals; discrepancies: Discrepancy[] }

function totals(v: unknown): Totals {
  return { collections: num(v, 'collections'), payouts: num(v, 'payouts'), refunds: num(v, 'refunds') };
}

function toRun(v: unknown, i: number): Run | null {
  const day = str(v, 'day', 'date');
  if (!day) return null;
  return {
    id: str(v, 'id') ?? `${day}-${i}`,
    day,
    ranAt: str(v, 'ranAt', 'createdAt'),
    status: str(v, 'status') ?? 'NOT_RUN',
    provider: totals(obj(v, 'providerTotals', 'provider')),
    ledger: totals(obj(v, 'ledgerTotals', 'ledger')),
    discrepancies: arr(v, 'discrepancies').map((d) => ({
      providerRef: str(d, 'providerRef') ?? '—',
      kind: str(d, 'kind') ?? '—',
      providerAmount: num(d, 'providerAmount'),
      ledgerAmount: num(d, 'ledgerAmount'),
      issue: str(d, 'issue') ?? '—',
    })),
  };
}

/** Accepte un rapport unique, une liste, ou `{ runs | items | latest }`. Garde la dernière exécution par jour. */
function normalizeRuns(raw: unknown): Run[] {
  const many = list(raw, 'runs', 'history');
  const src = many.length ? many : isObj(raw) && (isObj(raw.latest) || isObj(raw.report)) ? [raw.latest ?? raw.report] : isObj(raw) ? [raw] : [];
  const byDay = new Map<string, Run>();
  src.map(toRun).forEach((r) => {
    if (!r) return;
    const prev = byDay.get(r.day);
    if (!prev || (r.ranAt ?? '') > (prev.ranAt ?? '')) byDay.set(r.day, r);
  });
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

function StatusBadge({ s }: { s: string }) {
  if (s === 'MATCHED') return <Badge tone="green" icon={<CheckCircle2 aria-hidden className="size-3" />}>Concordant</Badge>;
  if (s === 'DISCREPANCY') return <Badge tone="red" icon={<AlertTriangle aria-hidden className="size-3" />}>Écart</Badge>;
  if (s === 'NOT_RUN') return <Badge icon={<CircleDashed aria-hidden className="size-3" />}>Non lancé</Badge>;
  return <Badge>{s}</Badge>;
}

function doualaDay(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const yesterdayDouala = () => doualaDay(1);
const HISTORY_DAYS = 7;

/** L'API renvoie le rapport (dernière exécution) d'UN jour via ?day= : on interroge les 7 derniers jours. */
function useRuns() {
  const [tick, setTick] = useState(0);
  const [st, setSt] = useState<{ runs: Run[] | null; error: ApiRequestError | null; loading: boolean }>({ runs: null, error: null, loading: true });
  useEffect(() => {
    const ctrl = new AbortController();
    setSt((p) => ({ ...p, loading: true, error: null }));
    const days = Array.from({ length: HISTORY_DAYS }, (_, i) => doualaDay(i));
    Promise.all(days.map((d) => apiFetch(adminPath('reconciliation', undefined, { day: d }), { signal: ctrl.signal })))
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const flat = res.flatMap((r) => { const l = list(r, 'runs', 'history'); return l.length ? l : [r]; });
        setSt({ runs: normalizeRuns(flat), error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setSt({ runs: null, error: e instanceof ApiRequestError ? e : new ApiRequestError(0, 'CLIENT_ERROR', String(e), null), loading: false });
      });
    return () => ctrl.abort();
  }, [tick]);
  return { ...st, reload: () => setTick((t) => t + 1) };
}

export default function ReconciliationPage() {
  return <RequireScreen screen="finance"><RecoInner /></RequireScreen>;
}

function RecoInner() {
  const { me } = useSession();
  const { runs: loaded, error, loading, reload } = useRuns();
  const runs = loaded ?? [];
  const data = loaded ?? undefined;
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const run = runs.find((r) => r.day === selectedDay) ?? runs.find((r) => r.ranAt) ?? runs[0] ?? null;
  const canRun = can(me.roles, 'finance:reconcile');
  const [day, setDay] = useState(yesterdayDouala());
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<ApiRequestError | null>(null);

  async function launch() {
    setBusy(true);
    setRunErr(null);
    try {
      await callAdmin('runReconciliation', { body: { day } });
      setSelectedDay(day);
      reload();
    } catch (e) {
      setRunErr(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'CLIENT_ERROR', String(e), null));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!run) return;
    downloadCsv(
      `waka-rapprochement-${run.day}.csv`,
      toCsv(['jour', 'ref_psp', 'type', 'montant_psp_xaf', 'montant_grand_livre_xaf', 'ecart_xaf', 'probleme'], run.discrepancies.map((d) => [run.day, d.providerRef, d.kind, d.providerAmount, d.ledgerAmount, d.providerAmount !== null && d.ledgerAmount !== null ? d.providerAmount - d.ledgerAmount : null, d.issue])),
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Finances"
        title="Rapprochement PSP ↔ grand livre"
        description="Comparaison quotidienne du relevé du partenaire PSP et du registre interne. Tout écart déclenche une alerte et une investigation."
        actions={
          canRun ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="reco-day" className="mb-1 block text-[12px] font-medium text-ink">Journée</label>
                <Input id="reco-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-10 w-40" max={new Date().toISOString().slice(0, 10)} />
              </div>
              <Button variant="primary" onClick={() => void launch()} loading={busy} disabled={!me.mfaVerified} title={!me.mfaVerified ? 'MFA requise' : undefined}>
                <Play aria-hidden className="size-4" /> Lancer le rapprochement
              </Button>
            </div>
          ) : <Badge>Lancement réservé au rôle Finance</Badge>
        }
      />
      {runErr ? <Card className="mb-4"><ErrorState error={runErr} title="Le rapprochement n’a pas pu être lancé" /></Card> : null}
      {error ? <Card><ErrorState error={error} onRetry={reload} /></Card> : null}
      {loading && data === undefined ? <Card><LoadingBlock /></Card> : null}
      {!loading && !error && runs.length === 0 ? <Card><EmptyState title="Aucune exécution" icon={<GitCompareArrows className="size-5" />}>Lancez un premier rapprochement.</EmptyState></Card> : null}

      {run ? (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Dernière exécution par jour" subtitle={`${HISTORY_DAYS} derniers jours (heure de Douala)`} />
            <ul className="max-h-[480px] overflow-y-auto p-2">
              {runs.map((r) => (
                <li key={r.day}>
                  <button
                    type="button"
                    aria-pressed={r.day === run.day}
                    onClick={() => setSelectedDay(r.day)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left', r.day === run.day ? 'bg-muted ring-1 ring-line-strong' : 'hover:bg-ivory')}
                  >
                    <span>
                      <span className="block text-[13.5px] font-medium">{dateOnly(r.day)}</span>
                      <span className="block text-[11.5px] text-ink">{r.ranAt ? `Lancé ${dateTime(r.ranAt)}` : 'Jamais lancé'}</span>
                    </span>
                    <StatusBadge s={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader title={<>Journée du {dateOnly(run.day)}</>} subtitle={run.ranAt ? `Exécuté ${dateTime(run.ranAt)}` : undefined} actions={<StatusBadge s={run.status} />} />
              <TableWrap label="Totaux PSP et grand livre">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-muted"><tr><th scope="col" className={th}>Flux</th><th scope="col" className={cn(th, 'text-right')}>Relevé PSP</th><th scope="col" className={cn(th, 'text-right')}>Grand livre</th><th scope="col" className={cn(th, 'text-right')}>Écart</th></tr></thead>
                  <tbody>
                    {([['collections', 'Encaissements'], ['payouts', 'Versements'], ['refunds', 'Remboursements']] as const).map(([k, l]) => {
                      const p = run.provider[k];
                      const g = run.ledger[k];
                      const diff = p !== null && g !== null ? p - g : null;
                      return (
                        <tr key={k} className="border-t border-line">
                          <th scope="row" className={cn(td, 'text-left font-medium')}>{l}</th>
                          <td className={cn(td, 'tnum text-right')}>{fcfa(p)}</td>
                          <td className={cn(td, 'tnum text-right')}>{fcfa(g)}</td>
                          <td className={cn(td, 'tnum text-right font-semibold', diff ? 'text-danger' : 'text-brand-deep')}>{diff === null ? '—' : diff === 0 ? '0' : fcfa(diff)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </Card>

            <Card>
              <CardHeader
                title={<>Écarts <span className="tnum text-ink">({run.discrepancies.length})</span></>}
                subtitle="Export : tableau affiché, généré dans le navigateur."
                actions={<Button size="sm" onClick={exportCsv} disabled={!run.discrepancies.length}><Download aria-hidden className="size-3.5" /> Exporter CSV</Button>}
              />
              {run.discrepancies.length === 0 ? (
                <EmptyState title="Aucun écart" icon={<CheckCircle2 className="size-5 text-brand-strong" />}>Relevé PSP et grand livre concordent pour cette journée.</EmptyState>
              ) : (
                <TableWrap label="Écarts de rapprochement">
                  <table className="data-table w-full min-w-[720px]">
                    <thead><tr><th scope="col" className={th}>Réf. PSP</th><th scope="col" className={th}>Type</th><th scope="col" className={cn(th, 'text-right')}>PSP</th><th scope="col" className={cn(th, 'text-right')}>Grand livre</th><th scope="col" className={th}>Problème</th></tr></thead>
                    <tbody>
                      {run.discrepancies.map((d, i) => (
                        <tr key={`${d.providerRef}-${i}`} className={tr}>
                          <td className={cn(td, 'font-mono text-[12px]')}>{d.providerRef}</td>
                          <td className={td}>{d.kind}</td>
                          <td className={cn(td, 'tnum text-right')}>{fcfa(d.providerAmount)}</td>
                          <td className={cn(td, 'tnum text-right')}>{fcfa(d.ledgerAmount)}</td>
                          <td className={cn(td, 'whitespace-normal! min-w-[14rem] text-danger')}>{d.issue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
            {run.status === 'DISCREPANCY' ? <Notice tone="red" title="Investigation obligatoire">Les libérations concernées restent bloquées selon la politique. Aucune correction manuelle : contre-passation ou ajustement tracé uniquement.</Notice> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
