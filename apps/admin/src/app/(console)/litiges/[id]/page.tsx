'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { ArrowLeft, Ban, CheckCircle2, ClipboardList, FileSearch, Gavel, Lock, MessageSquareQuote, PlayCircle, ShieldAlert, UserPlus, XCircle } from 'lucide-react';
import type { DisputeState } from '@waka/domain';
import { useApi } from '@/lib/use-api';
import { adminPath } from '@/lib/api';
import { dateTime, fcfa, shortId } from '@/lib/format';
import { ACTOR_LABEL, CATEGORY_LABEL, DISPUTE_STATE_LABEL, normalizeDisputeDetail, type DisputeDetail, type PersonRef } from '@/lib/models';
import { can, disputeActionGates, nextDisputeStates, type ActionGate, type DisputeActionKey } from '@/lib/permissions';
import { RequireScreen, useSession } from '@/components/session';
import { BookingStateBadge, DisputeStateBadge, ExecutionBadge, PaymentStateBadge, PriorityBadge, SlaChip } from '@/components/status';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, KeyValue, LoadingBlock, Notice, Skeleton, cn } from '@/components/ui';
import { ActionDialog } from './actions';

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireScreen screen="disputes">
      <DisputeInner id={id} />
    </RequireScreen>
  );
}

const STEPS: { state: DisputeState; optional?: boolean }[] = [
  { state: 'OPENED' },
  { state: 'TRIAGED' },
  { state: 'EVIDENCE_REQUESTED', optional: true },
  { state: 'UNDER_REVIEW' },
  { state: 'DECISION_PROPOSED' },
  { state: 'APPROVED' },
  { state: 'EXECUTION_PENDING' },
  { state: 'RESOLVED' },
  { state: 'CLOSED' },
];

function who(p: PersonRef | null, meId: string): string {
  if (!p) return '—';
  if (p.id && p.id === meId) return 'vous';
  return p.name;
}

function DisputeInner({ id }: { id: string }) {
  const { me } = useSession();
  const { data, error, loading, reload } = useApi<unknown>(adminPath('dispute', { id }));
  const d = useMemo(() => (data !== undefined ? normalizeDisputeDetail(data) : null), [data]);
  const [action, setAction] = useState<DisputeActionKey | null>(null);

  if (error) return <><BackLink /><Card><ErrorState error={error} onRetry={reload} /></Card></>;
  if (loading && !d) {
    return (
      <>
        <BackLink />
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-16 w-full" />
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]"><Card><LoadingBlock rows={8} /></Card><Card><LoadingBlock rows={6} /></Card></div>
        </div>
      </>
    );
  }
  if (!d) return <><BackLink /><Card><EmptyState title="Réponse inattendue de l’API">Le dossier n’a pas pu être interprété.</EmptyState></Card></>;

  const gates = disputeActionGates({
    roles: me.roles,
    userId: me.id,
    mfaVerified: me.mfaVerified,
    state: d.state,
    assigneeId: d.assignee?.id ?? null,
    decision: d.decision ? { state: d.decision.state, proposedById: d.decision.proposedBy?.id ?? null } : null,
    allowedActions: d.allowedActions,
  });

  return (
    <>
      <BackLink />
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={d.priority} />
          <DisputeStateBadge state={d.state} raw={d.rawState} />
          <SlaChip dueAt={d.dueAt} closed={d.state === 'RESOLVED' || d.state === 'CLOSED'} />
          {d.fundsStatus ? <Badge tone="amber" icon={<Lock aria-hidden className="size-3" />}>Fonds : {d.fundsStatus === 'FROZEN' ? 'gelés' : d.fundsStatus}</Badge> : null}
        </div>
        <h1 className="mt-2 text-[22px] font-bold sm:text-2xl">{CATEGORY_LABEL[d.category] ?? d.category}</h1>
        <p className="mt-1 text-[13px] text-ink">
          Dossier <span className="font-mono text-text">#{shortId(d.id)}</span> · ouvert {dateTime(d.openedAt)}
          {d.openedBy ? <> par {ACTOR_LABEL[d.openedBy]?.toLowerCase() ?? d.openedBy}</> : null}
          {' · '}attribué à <span className="font-medium text-text">{d.assignee ? who(d.assignee, me.id) : 'personne'}</span>
          {d.appealDeadline ? <> · recours possible jusqu’au {dateTime(d.appealDeadline)}</> : null}
        </p>
      </header>

      {d.priority === 'SAFETY' || d.urgentSafety ? (
        <div className="mb-4">
          <Notice tone="red" title="Signalement sécurité" icon={<ShieldAlert className="size-4" />}>
            {d.safetyGuidance ?? 'Traitement prioritaire. En cas de danger immédiat, orienter vers les secours (police 117, pompiers 118) ; la console ne remplace pas une autorité.'}
          </Notice>
        </div>
      ) : null}

      <Stepper state={d.state} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Déclaration initiale" subtitle={d.requestedOutcome ? <>Issue demandée : <span className="font-medium text-text">{OUTCOME[d.requestedOutcome] ?? d.requestedOutcome}</span></> : undefined} />
            <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed">{d.description ?? <span className="text-ink">Non fournie par l’API.</span>}</p>
          </Card>

          <Parties d={d} />
          <Evidence d={d} />
          <Timeline d={d} />
        </div>

        <div className="space-y-4">
          <ActionsPanel gates={gates} onAction={setAction} state={d.state} assignedToMe={d.assignee?.id === me.id} />
          <DecisionPanel d={d} meId={me.id} />
          <MoneyPanel d={d} canFinance={can(me.roles, 'finance:view')} />
        </div>
      </div>

      <ActionDialog action={action} dispute={d} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />
    </>
  );
}

const OUTCOME: Record<string, string> = { FULL_REFUND: 'remboursement intégral', PARTIAL_REFUND: 'remboursement partiel', RELEASE: 'versement au conducteur', OTHER: 'autre' };

function BackLink() {
  return (
    <Link href="/litiges" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:text-text">
      <ArrowLeft aria-hidden className="size-4" /> File des litiges
    </Link>
  );
}

function Stepper({ state }: { state: DisputeState | null }) {
  const effective = state === 'APPEALED' ? 'UNDER_REVIEW' : state;
  const idx = STEPS.findIndex((s) => s.state === effective);
  return (
    <Card className="px-4 py-3">
      <ol aria-label="Progression du litige" className="relative flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const done = idx > i;
          const current = idx === i;
          return (
            <li key={s.state} aria-current={current ? 'step' : undefined} className="flex min-w-[96px] flex-1 flex-col gap-1.5">
              <span className={cn('h-1.5 rounded-full', done ? 'bg-brand' : current ? 'bg-amber' : 'bg-muted')} aria-hidden />
              <span className={cn('text-[11.5px] leading-tight', current ? 'font-semibold text-text' : done ? 'text-text' : 'text-ink-soft')}>
                {DISPUTE_STATE_LABEL[s.state]}
                {s.optional ? <span className="block text-[10.5px] font-normal text-ink-soft">si nécessaire</span> : null}
                <span className="sr-only">{done ? ' (terminé)' : current ? ' (étape actuelle)' : ' (à venir)'}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {state === 'APPEALED' ? <p className="mt-2 text-[12.5px] text-danger">Recours interne en cours : le dossier repasse en instruction.</p> : null}
      <p className="mt-2 text-[12px] text-ink">
        Étapes suivantes autorisées par la machine d’états :{' '}
        {nextDisputeStates(state).length ? nextDisputeStates(state).map((n) => <Badge key={n} className="mr-1">{DISPUTE_STATE_LABEL[n]}</Badge>) : <span>aucune (état terminal)</span>}
      </p>
    </Card>
  );
}

function Parties({ d }: { d: DisputeDetail }) {
  const b = d.booking;
  return (
    <Card>
      <CardHeader title="Parties et réservation" subtitle="Coordonnées masquées — aucun contact direct depuis la console." />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {([['Passager', d.passenger], ['Conducteur', d.driver]] as const).map(([label, p]) => (
          <div key={label} className="rounded-lg border border-line p-3">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ink-soft">{label}</p>
            <p className="mt-0.5 font-medium">{p?.name ?? '—'}</p>
            <p className="font-mono text-[12px] text-ink">{p?.phone ?? 'Téléphone masqué'}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-4">
        <KeyValue
          cols={3}
          items={[
            { k: 'Réservation', v: <span className="font-mono">#{shortId(d.bookingId)}</span> },
            { k: 'État réservation', v: <BookingStateBadge state={b?.state ?? null} /> },
            { k: 'Trajet', v: d.tripLabel ?? '—' },
            { k: 'Départ', v: dateTime(b?.departureAt) },
            { k: 'Places', v: b?.seats ?? '—' },
            { k: 'Rendez-vous', v: b?.meetingPoint ?? '—' },
            { k: 'Embarquement (PIN)', v: b?.checkedInAt ? dateTime(b.checkedInAt) : 'Non enregistré' },
            { k: 'Arrivée signalée', v: b?.arrivalReportedAt ? dateTime(b.arrivalReportedAt) : 'Non' },
            { k: 'Confirmation passager', v: b?.passengerConfirmedAt ? dateTime(b.passengerConfirmedAt) : 'Non' },
          ]}
        />
      </div>
    </Card>
  );
}

function Evidence({ d }: { d: DisputeDetail }) {
  const cols = [
    { key: 'PASSENGER', label: 'Côté passager' },
    { key: 'DRIVER', label: 'Côté conducteur' },
  ];
  const team = d.evidence.filter((e) => e.from !== 'PASSENGER' && e.from !== 'DRIVER');
  return (
    <Card>
      <CardHeader
        title="Éléments contradictoires"
        subtitle="Chaque partie peut répondre ; les pièces jointes restent dans le stockage chiffré."
        actions={d.pendingEvidenceRequest ? <Badge tone="amber">Pièces attendues {d.pendingEvidenceRequest.dueAt ? `avant ${dateTime(d.pendingEvidenceRequest.dueAt)}` : ''}</Badge> : undefined}
      />
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {cols.map((c) => {
          const items = d.evidence.filter((e) => e.from === c.key);
          return (
            <section key={c.key} aria-label={c.label} className="bg-surface p-4">
              <h3 className="mb-2 text-[13px] font-semibold">{c.label} <span className="font-normal text-ink">({items.length})</span></h3>
              {items.length === 0 ? <p className="text-[13px] text-ink">Aucun élément transmis.</p> : null}
              <ul className="space-y-2">
                {items.map((e) => (
                  <li key={e.id} className="rounded-lg bg-ivory p-3 ring-1 ring-line">
                    <p className="text-[11.5px] text-ink">{dateTime(e.at)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{e.text}</p>
                    {e.attachmentRef ? <p className="mt-1.5 text-[12px] text-ink">Pièce jointe : référence privée (stockage chiffré)</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {team.length ? (
        <div className="border-t border-line p-4">
          <h3 className="mb-2 text-[13px] font-semibold">Notes de l’équipe Waka</h3>
          <ul className="space-y-2">{team.map((e) => <li key={e.id} className="text-[13px]"><span className="text-ink">{dateTime(e.at)} — </span>{e.text}</li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}

function Timeline({ d }: { d: DisputeDetail }) {
  const items = [...d.timeline].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  return (
    <Card>
      <CardHeader title="Chronologie" subtitle="Ordre chronologique, heure de Douala." />
      {items.length === 0 ? <p className="p-4 text-sm text-ink">Aucun événement.</p> : (
        <ol className="relative space-y-4 p-4 pl-8 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-px before:bg-line">
          {items.map((t, i) => (
            <li key={i} className="relative">
              <span aria-hidden className={cn('absolute -left-[17px] top-1 size-2.5 rounded-full ring-4 ring-surface', t.actor === 'PSP' ? 'bg-info' : t.actor === 'WAKA_TEAM' ? 'bg-brand' : t.actor === 'SYSTEM' ? 'bg-ink-soft' : 'bg-amber')} />
              <p className="text-[12px] text-ink"><span className="tnum">{dateTime(t.at)}</span> · <span className="font-medium text-text">{ACTOR_LABEL[t.actor] ?? t.actor}</span></p>
              <p className="text-[13.5px]">{t.label}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

const ACTION_META: Record<DisputeActionKey, { label: string; icon: React.ReactNode; variant: 'primary' | 'secondary' | 'danger' }> = {
  assign: { label: 'Attribuer', icon: <UserPlus aria-hidden className="size-4" />, variant: 'secondary' },
  triage: { label: 'Trier le dossier', icon: <ClipboardList aria-hidden className="size-4" />, variant: 'primary' },
  requestEvidence: { label: 'Demander des pièces', icon: <FileSearch aria-hidden className="size-4" />, variant: 'secondary' },
  startReview: { label: 'Démarrer l’instruction', icon: <PlayCircle aria-hidden className="size-4" />, variant: 'primary' },
  propose: { label: 'Proposer une décision', icon: <Gavel aria-hidden className="size-4" />, variant: 'primary' },
  approve: { label: 'Approuver la décision', icon: <CheckCircle2 aria-hidden className="size-4" />, variant: 'primary' },
  reject: { label: 'Rejeter la proposition', icon: <XCircle aria-hidden className="size-4" />, variant: 'danger' },
  close: { label: 'Clôturer le dossier', icon: <Ban aria-hidden className="size-4" />, variant: 'secondary' },
};

function ActionsPanel({ gates, onAction, state, assignedToMe }: { gates: Record<DisputeActionKey, ActionGate>; onAction: (a: DisputeActionKey) => void; state: DisputeState | null; assignedToMe: boolean }) {
  const order: DisputeActionKey[] = ['approve', 'reject', 'propose', 'startReview', 'triage', 'requestEvidence', 'close', 'assign'];
  const visible = order.filter((k) => gates[k].visible);
  return (
    <Card>
      <CardHeader title="Actions" subtitle={state ? `Selon l’état « ${DISPUTE_STATE_LABEL[state]} » et votre rôle` : undefined} />
      <div className="space-y-2 p-4">
        {visible.length === 0 ? <p className="text-[13px] text-ink">Aucune action disponible pour votre rôle à ce stade.</p> : null}
        {visible.map((k) => {
          const g = gates[k];
          const m = ACTION_META[k];
          const reasonId = `reason-${k}`;
          return (
            <div key={k}>
              <Button variant={m.variant} className="w-full justify-start" disabled={!g.enabled} aria-describedby={g.reason ? reasonId : undefined} onClick={() => onAction(k)}>
                {m.icon} {k === 'assign' && !assignedToMe ? 'Attribuer / m’attribuer' : m.label}
              </Button>
              {g.reason ? <p id={reasonId} className="mt-1 flex gap-1.5 text-[12px] text-amber-ink"><Lock aria-hidden className="mt-0.5 size-3 shrink-0" />{g.reason}</p> : null}
            </div>
          );
        })}
        <p className="pt-1 text-[11.5px] leading-relaxed text-ink">
          La console ne déclenche jamais de versement direct : une décision approuvée produit une instruction au PSP, dont l’exécution est suivie séparément.
        </p>
      </div>
    </Card>
  );
}

const DECISION_STATE: Record<string, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  PROPOSED: { label: 'Décision proposée — en attente d’approbation', tone: 'amber' },
  APPROVED: { label: 'Décision approuvée', tone: 'green' },
  REJECTED: { label: 'Proposition rejetée', tone: 'red' },
};

const EXEC_ITEM: Record<string, string> = { PENDING: 'demandé', PROCESSING: 'en cours', REQUESTED: 'demandé', SUCCEEDED: 'confirmé PSP', FAILED: 'échec' };

function DecisionPanel({ d, meId }: { d: DisputeDetail; meId: string }) {
  const dec = d.decision;
  return (
    <Card>
      <CardHeader title="Décision" subtitle="Statut de la décision et exécution PSP sont distincts." />
      {!dec ? (
        <p className="p-4 text-[13px] text-ink">Aucune décision proposée pour l’instant.</p>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex flex-col gap-1.5">
            <Badge tone={DECISION_STATE[dec.state]?.tone ?? 'amber'} className="w-fit">{DECISION_STATE[dec.state]?.label ?? dec.state}</Badge>
            {dec.state === 'APPROVED' ? <ExecutionBadge status={dec.execution} /> : <Badge className="w-fit">Exécution PSP : non démarrée (en attente d’approbation)</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-ivory p-3 ring-1 ring-line">
            <div><dt className="text-[11.5px] text-ink">Remboursement passager</dt><dd className="tnum font-display text-lg font-bold">{fcfa(dec.refundToPassenger)}</dd></div>
            <div><dt className="text-[11.5px] text-ink">Versement conducteur</dt><dd className="tnum font-display text-lg font-bold">{fcfa(dec.releaseToDriver)}</dd></div>
          </dl>
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink"><MessageSquareQuote aria-hidden className="size-3.5" /> Motivation</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{dec.reason || '—'}</p>
          </div>
          <ul className="space-y-1 text-[12.5px] text-ink">
            <li>Proposée par <span className="font-medium text-text">{who(dec.proposedBy, meId)}</span>{dec.proposedAt ? ` · ${dateTime(dec.proposedAt)}` : ''}</li>
            {dec.reviewedBy ? <li>{dec.state === 'REJECTED' ? 'Rejetée' : 'Approuvée'} par <span className="font-medium text-text">{who(dec.reviewedBy, meId)}</span>{dec.reviewedAt ? ` · ${dateTime(dec.reviewedAt)}` : ''}</li> : null}
            {dec.sensitive ? <li><Badge tone="violet">Cas sensible</Badge></li> : null}
            {dec.rejectionReason ? <li>Motif du rejet : <span className="text-text">{dec.rejectionReason}</span></li> : null}
          </ul>
          {d.executionItems.length ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-ink">Instructions PSP</p>
              <ul className="divide-y divide-line rounded-lg text-[12.5px] ring-1 ring-line">
                {d.executionItems.map((x, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span>{x.kind === 'REFUND' ? 'Remboursement' : 'Versement'} <span className="tnum font-medium">{fcfa(x.amount)}</span></span>
                    <span className="flex items-center gap-1.5">
                      {x.providerRef ? <span className="font-mono text-[11px] text-ink">{x.providerRef}</span> : null}
                      <Badge tone={x.status === 'SUCCEEDED' ? 'green' : x.status === 'FAILED' ? 'red' : 'blue'}>{EXEC_ITEM[x.status] ?? x.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.decisions.length > 1 ? (
            <details className="text-[12.5px]">
              <summary className="cursor-pointer font-medium text-ink">Propositions précédentes ({d.decisions.length - 1})</summary>
              <ul className="mt-2 space-y-2">
                {d.decisions.slice(1).map((p, i) => (
                  <li key={p.id ?? i} className="rounded-lg bg-ivory p-2 ring-1 ring-line">
                    <p><Badge tone={DECISION_STATE[p.state]?.tone ?? 'neutral'}>{DECISION_STATE[p.state]?.label ?? p.state}</Badge> <span className="tnum">{fcfa(p.refundToPassenger)} / {fcfa(p.releaseToDriver)}</span></p>
                    <p className="mt-1 text-ink">Par {who(p.proposedBy, meId)}{p.rejectionReason ? ` — rejet : ${p.rejectionReason}` : ''}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function MoneyPanel({ d, canFinance }: { d: DisputeDetail; canFinance: boolean }) {
  const f = d.funds;
  const totals = d.journals.reduce((acc, j) => {
    for (const l of j.lines) acc[l.account] = (acc[l.account] ?? 0) + l.debit - l.credit;
    return acc;
  }, {} as Record<string, number>);
  return (
    <Card>
      <CardHeader title="Paiement et grand livre" />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-ink">État du paiement</span>
          {d.payment ? <PaymentStateBadge state={d.payment.state} apiLabel={d.payment.label} showCode /> : <span className="text-[13px] text-ink">Non fourni</span>}
        </div>
        {d.payment?.providerMode ? <p className="text-[12px] text-ink">Prestataire : <Badge tone="amber">{d.payment.providerMode}</Badge> {d.payment.channel ? `· ${d.payment.channel === 'MTN_MOMO' ? 'MTN MoMo' : d.payment.channel === 'ORANGE_MONEY' ? 'Orange Money' : d.payment.channel}` : ''}</p> : null}
        <dl className="divide-y divide-line rounded-lg ring-1 ring-line">
          {[
            ['Encaissé (confirmé PSP)', f?.captured],
            ['Part conducteur (snapshot)', f?.driverAmount],
            ['Frais de service (snapshot)', f?.serviceFee],
            ['Remboursement engagé (en cours ou confirmé)', f?.refunded],
            ['Versement engagé (en cours ou confirmé)', f?.released],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between px-3 py-1.5 text-[13px]"><dt className="text-ink">{k}</dt><dd className="tnum font-medium">{fcfa(v as number | undefined)}</dd></div>
          ))}
        </dl>
        {d.journals.length ? (
          <div>
            <p className="mb-1 text-[12px] font-medium text-ink">Soldes (débit − crédit) du grand livre pour la réservation · {d.journals.length} journal(aux)</p>
            <ul className="space-y-0.5 font-mono text-[12px]">
              {Object.entries(totals).map(([acc, v]) => <li key={acc} className="flex justify-between"><span>{acc}</span><span className="tnum">{fcfa(v)}</span></li>)}
            </ul>
          </div>
        ) : <p className="text-[12px] text-ink">Écritures du grand livre non incluses dans la réponse.</p>}
        {canFinance && d.bookingId ? (
          <Link href={`/finances/grand-livre?bookingId=${encodeURIComponent(d.bookingId)}`} className="inline-flex text-[13px] font-medium text-brand-strong hover:underline">
            Voir les journaux de la réservation →
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
