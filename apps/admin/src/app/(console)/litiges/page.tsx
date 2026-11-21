'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Scale } from 'lucide-react';
import { DISPUTE_STATES } from '@waka/domain';
import { useApi } from '@/lib/use-api';
import { adminPath } from '@/lib/api';
import { list } from '@/lib/normalize';
import { dateTime, fcfa, shortId } from '@/lib/format';
import { CATEGORY_LABEL, DISPUTE_STATE_LABEL, PRIORITY_LABEL, normalizeDisputeListItem, sortDisputes, type DisputeListItem } from '@/lib/models';
import { RequireScreen, useSession } from '@/components/session';
import { DisputeStateBadge, PriorityBadge, SlaChip } from '@/components/status';
import { Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, Select, TableWrap, cn, td, th, tr } from '@/components/ui';

const CLOSED_STATES = new Set(['RESOLVED', 'CLOSED']);

export default function DisputesPage() {
  return (
    <RequireScreen screen="disputes">
      <DisputesInner />
    </RequireScreen>
  );
}

function DisputesInner() {
  const { me } = useSession();
  const router = useRouter();
  const [state, setState] = useState<string>('OPEN');
  const [priority, setPriority] = useState<string>('');
  const [assigned, setAssigned] = useState<'all' | 'me' | 'none'>('all');

  // Les filtres sont transmis à l'API (si elle les gère) ET réappliqués côté client.
  const path = adminPath('disputes', undefined, {
    state: state && state !== 'OPEN' ? state : undefined,
    priority: priority || undefined,
    assignedTo: assigned === 'me' ? me.id : assigned === 'none' ? 'none' : undefined,
  });
  const { data, error, loading, reload } = useApi<unknown>(path);

  const items = useMemo(() => {
    const all = list(data, 'disputes').map(normalizeDisputeListItem).filter((d): d is DisputeListItem => d !== null);
    const filtered = all.filter((d) => {
      if (state === 'OPEN' && d.rawState && CLOSED_STATES.has(d.rawState)) return false;
      if (state && state !== 'OPEN' && d.rawState !== state) return false;
      if (priority && d.priority !== priority) return false;
      if (assigned === 'me' && d.assignee?.id !== me.id) return false;
      if (assigned === 'none' && d.assignee) return false;
      return true;
    });
    return sortDisputes(filtered);
  }, [data, state, priority, assigned, me.id]);

  const safety = items.filter((i) => i.priority === 'SAFETY').length;

  return (
    <>
      <PageHeader
        eyebrow="Litiges"
        title="File des litiges"
        description="Instruction contradictoire : chaque partie est entendue, la décision est motivée puis approuvée par une seconde personne. Waka arbitre au sens contractuel, pas judiciaire."
      />
      <Card>
        <CardHeader
          title={<>Dossiers <span className="tnum text-ink">({items.length})</span></>}
          subtitle={safety ? <span className="font-medium text-danger">{safety} dossier(s) sécurité en tête de file</span> : 'Tri : priorité (sécurité d’abord) puis échéance'}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="f-state">État</label>
              <Select id="f-state" value={state} onChange={(e) => setState(e.target.value)} className="w-auto">
                <option value="OPEN">En cours (non résolus)</option>
                <option value="">Tous les états</option>
                {DISPUTE_STATES.map((s) => <option key={s} value={s}>{DISPUTE_STATE_LABEL[s]}</option>)}
              </Select>
              <label className="sr-only" htmlFor="f-prio">Priorité</label>
              <Select id="f-prio" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-auto">
                <option value="">Toutes priorités</option>
                {(['SAFETY', 'HIGH', 'NORMAL'] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
              <label className="sr-only" htmlFor="f-assigned">Attribution</label>
              <Select id="f-assigned" value={assigned} onChange={(e) => setAssigned(e.target.value as 'all' | 'me' | 'none')} className="w-auto">
                <option value="all">Toutes attributions</option>
                <option value="me">Attribués à moi</option>
                <option value="none">Non attribués</option>
              </Select>
            </div>
          }
        />
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {loading && data === undefined ? <LoadingBlock rows={6} /> : null}
        {!loading && !error && items.length === 0 ? <EmptyState title="Aucun litige pour ces filtres" icon={<Scale className="size-5" />} /> : null}
        {items.length > 0 ? (
          <TableWrap label="Liste des litiges">
            <table className="data-table w-full min-w-[880px]">
              <thead>
                <tr>
                  <th scope="col" className={th}>Priorité</th>
                  <th scope="col" className={th}>Dossier</th>
                  <th scope="col" className={th}>État</th>
                  <th scope="col" className={th}>SLA</th>
                  <th scope="col" className={th}>Attribué à</th>
                  <th scope="col" className={cn(th, 'text-right')}>Montant</th>
                  <th scope="col" className={th}>Ouvert</th>
                  <th scope="col" className={th}><span className="sr-only">Ouvrir</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr
                    key={d.id}
                    className={cn(tr, 'cursor-pointer', d.priority === 'SAFETY' && 'bg-danger-soft/40')}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) router.push(`/litiges/${d.id}`); }}
                  >
                    <td className={td}><PriorityBadge priority={d.priority} /></td>
                    <td className={td}>
                      <Link href={`/litiges/${d.id}`} className="font-medium text-text hover:text-brand-strong hover:underline">
                        {CATEGORY_LABEL[d.category] ?? d.category}
                      </Link>
                      <p className="font-mono text-[11.5px] text-ink">#{shortId(d.id)}{d.tripLabel ? <span className="font-sans"> · {d.tripLabel}</span> : null}</p>
                    </td>
                    <td className={td}><DisputeStateBadge state={d.state} raw={d.rawState} /></td>
                    <td className={td}><SlaChip dueAt={d.dueAt} closed={d.rawState ? CLOSED_STATES.has(d.rawState) : false} /></td>
                    <td className={td}>{d.assignee ? (d.assignee.id === me.id ? <span className="font-medium">Moi</span> : d.assignee.name) : <span className="text-ink-soft">Non attribué</span>}</td>
                    <td className={cn(td, 'tnum text-right')}>{fcfa(d.amount)}</td>
                    <td className={cn(td, 'text-ink')}>{dateTime(d.openedAt)}</td>
                    <td className={cn(td, 'text-right')}><ChevronRight aria-hidden className="ml-auto size-4 text-ink-soft" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </Card>
    </>
  );
}
