'use client';

import { AlertOctagon, Clock, ShieldAlert } from 'lucide-react';
import type { DisputeState } from '@waka/domain';
import { Badge, type Tone } from './ui';
import { BOOKING_STATE_LABEL, DISPUTE_STATE_LABEL, PRIORITY_LABEL, asPaymentState, paymentLabel, type ExecutionStatus, type Priority } from '@/lib/models';
import { sla } from '@/lib/format';

const PAYMENT_TONE: Record<string, Tone> = {
  CREATED: 'neutral',
  PSP_PENDING: 'blue',
  PSP_CONFIRMED_HELD: 'green',
  RELEASE_ELIGIBLE: 'green',
  RELEASE_REQUESTED: 'blue',
  PAYOUT_PROCESSING: 'blue',
  PAID: 'night',
  FAILED: 'red',
  FROZEN_DISPUTE: 'amber',
  REFUND_PENDING: 'violet',
  PARTIALLY_REFUNDED: 'violet',
  REFUNDED: 'violet',
  MANUAL_REVIEW: 'red',
};

/** Libellé EXACT de `PAYMENT_STATE_LABEL_FR` + code technique en sous-texte. */
export function PaymentStateBadge({ state, apiLabel, showCode }: { state: string | null; apiLabel?: string | null; showCode?: boolean }) {
  const s = asPaymentState(state);
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge tone={s ? PAYMENT_TONE[s] ?? 'neutral' : 'neutral'}>{paymentLabel(state, apiLabel)}</Badge>
      {showCode && state ? <span className="font-mono text-[11px] text-ink-soft">{state}</span> : null}
    </span>
  );
}

const DISPUTE_TONE: Record<DisputeState, Tone> = {
  OPENED: 'blue',
  TRIAGED: 'blue',
  EVIDENCE_REQUESTED: 'amber',
  UNDER_REVIEW: 'violet',
  DECISION_PROPOSED: 'amber',
  APPROVED: 'green',
  EXECUTION_PENDING: 'blue',
  RESOLVED: 'green',
  APPEALED: 'red',
  CLOSED: 'neutral',
};

export function DisputeStateBadge({ state, raw }: { state: DisputeState | null; raw?: string | null }) {
  if (!state) return <Badge>{raw ?? '—'}</Badge>;
  return <Badge tone={DISPUTE_TONE[state]}>{DISPUTE_STATE_LABEL[state]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'SAFETY') return <Badge tone="red" icon={<ShieldAlert aria-hidden className="size-3" />}>{PRIORITY_LABEL.SAFETY}</Badge>;
  if (priority === 'HIGH') return <Badge tone="amber">{PRIORITY_LABEL.HIGH}</Badge>;
  return <Badge>{PRIORITY_LABEL.NORMAL}</Badge>;
}

export function SlaChip({ dueAt, closed }: { dueAt: string | null; closed?: boolean }) {
  if (closed) return <span className="text-[12px] text-ink-soft">—</span>;
  const s = sla(dueAt);
  const tone: Tone = s.tone === 'overdue' ? 'red' : s.tone === 'soon' ? 'amber' : 'neutral';
  const Icon = s.tone === 'overdue' ? AlertOctagon : Clock;
  return <Badge tone={tone} icon={<Icon aria-hidden className="size-3" />}>{s.label}</Badge>;
}

export function BookingStateBadge({ state }: { state: string | null }) {
  if (!state) return <Badge>—</Badge>;
  const tone: Tone = state === 'DISPUTED' ? 'amber' : state === 'CANCELLED' ? 'neutral' : state === 'COMPLETED' ? 'night' : state === 'CONFIRMED' ? 'green' : 'blue';
  return <Badge tone={tone}>{BOOKING_STATE_LABEL[state] ?? state}</Badge>;
}

export const EXECUTION_LABEL: Record<ExecutionStatus, string> = {
  NOT_STARTED: 'Non démarrée',
  PENDING: 'En attente de confirmation PSP',
  CONFIRMED: 'Confirmée par le PSP',
  FAILED: 'Échec côté PSP — revue manuelle',
  UNKNOWN: 'Statut inconnu',
};

export function ExecutionBadge({ status }: { status: ExecutionStatus }) {
  const tone: Tone = status === 'CONFIRMED' ? 'green' : status === 'PENDING' ? 'blue' : status === 'FAILED' ? 'red' : 'neutral';
  return <Badge tone={tone}>Exécution PSP : {EXECUTION_LABEL[status].charAt(0).toLowerCase() + EXECUTION_LABEL[status].slice(1)}</Badge>;
}
