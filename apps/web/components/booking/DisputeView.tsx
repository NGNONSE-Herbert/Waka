'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, FileText, Gavel, HeartHandshake, Lock, MessageSquarePlus, Phone, ShieldAlert } from 'lucide-react';
import type { DisputeOutput } from '@waka/contracts';
import { EvidenceInput } from '@waka/contracts';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { dateTime, money } from '@/lib/format';
import { RequireAuth } from '@/components/session/SessionProvider';
import { Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { ErrorState, Notice } from '@/components/ui/States';
import { Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

const STEP_OF: Record<DisputeOutput['state'], number> = {
  OPENED: 0,
  TRIAGED: 1,
  EVIDENCE_REQUESTED: 1,
  UNDER_REVIEW: 1,
  APPEALED: 1,
  DECISION_PROPOSED: 2,
  APPROVED: 2,
  EXECUTION_PENDING: 3,
  RESOLVED: 3,
  CLOSED: 4,
};

export function DisputeView({ disputeId }: { disputeId: string }) {
  return <RequireAuth>{() => <Inner disputeId={disputeId} />}</RequireAuth>;
}

function Inner({ disputeId }: { disputeId: string }) {
  const { t, locale } = useI18n();
  const [d, setD] = useState<DisputeOutput | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [text, setText] = useState('');
  const [textErr, setTextErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api.disputes.detail(disputeId));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [disputeId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!d) {
    return (
      <div className="container-w max-w-4xl py-10">
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <div className="skeleton h-96 rounded-[2rem]" role="status" aria-busy="true" />}
      </div>
    );
  }

  const step = STEP_OF[d.state];
  const steps = [t.dispute.stepOpen, t.dispute.stepReview, t.dispute.stepDecision, t.dispute.stepExecution, t.dispute.stepClosed];
  const canAddEvidence = !['RESOLVED', 'CLOSED', 'EXECUTION_PENDING', 'APPROVED'].includes(d.state);
  const canAppeal = d.state === 'RESOLVED';

  const addEvidence = async () => {
    const parsed = EvidenceInput.safeParse({ text: text.trim() });
    if (!parsed.success) {
      setTextErr(t.dispute.evidencePlaceholder);
      return;
    }
    setTextErr(null);
    setSending(true);
    setSendError(null);
    try {
      await api.disputes.evidence(d.id, parsed.data);
      setText('');
      setFlash(t.dispute.evidenceAdded);
      await load();
    } catch (e) {
      setSendError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container-w max-w-5xl py-8">
      <Link href={`/reservations/${d.bookingId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t.ticket.title}
      </Link>

      {d.priority === 'SAFETY' && (
        <div className="mt-4 rounded-[2rem] bg-danger p-6 text-white shadow-lift" role="alert">
          <div className="flex items-start gap-4">
            <ShieldAlert className="h-8 w-8 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-display text-xl font-extrabold">{t.dispute.safetyTitle}</p>
              <p className="mt-2 text-white/90">{t.dispute.safetyBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['117', '118', '119'].map((n) => (
                  <a key={n} href={`tel:${n}`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 font-display font-extrabold text-danger">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {n}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">{t.dispute.states[d.state]}</Badge>
            <Badge tone={d.priority === 'SAFETY' ? 'danger' : 'neutral'}>{t.dispute.priority[d.priority]}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold">{fmt(t.dispute.title, { ref: d.id.slice(-6).toUpperCase() })}</h1>
          <p className="mt-1 text-ink">{t.dispute.categories[d.category]}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-line">
          <p className="text-ink">{fmt(t.dispute.openedAt, { date: dateTime(d.openedAt, locale) })}</p>
          <p className="mt-1 flex items-center gap-1.5 font-semibold text-night-900">
            <Clock className="h-4 w-4 text-amber-700" aria-hidden="true" />
            {d.dueAt ? fmt(t.dispute.dueAt, { date: dateTime(d.dueAt, locale) }) : t.dispute.noDue}
          </p>
        </div>
      </header>

      <div className="mt-6 flex items-start gap-3 rounded-3xl bg-night-900 p-5 text-ivory">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="font-display font-extrabold text-amber-300">{t.dispute.frozen}</p>
          <p className="mt-1 text-sm text-night-200">{t.dispute.intro}</p>
        </div>
      </div>

      {/* stepper */}
      <nav aria-label={t.dispute.stepperLabel} className="mt-8">
        <ol className="grid grid-cols-5 gap-1">
          {steps.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={s} className="flex flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                <div className="flex w-full items-center">
                  <span className={cn('h-1 flex-1 rounded-full', i === 0 ? 'opacity-0' : done || current ? 'bg-green-500' : 'bg-line')} />
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold',
                      done && 'bg-green-600 text-white',
                      current && 'bg-amber-400 text-night-900 ring-4 ring-amber-100',
                      !done && !current && 'bg-sand text-ink',
                    )}
                  >
                    {done ? <Check className="h-5 w-5" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className={cn('h-1 flex-1 rounded-full', i === steps.length - 1 ? 'opacity-0' : done ? 'bg-green-500' : 'bg-line')} />
                </div>
                <span className={cn('mt-2 text-xs', current ? 'font-bold text-night-900' : 'text-ink')}>{s}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {flash && (
        <Notice className="mt-6" icon={<Check className="h-5 w-5" aria-hidden="true" />}>
          {flash}
        </Notice>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Décision */}
        <section className="rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line lg:col-span-2" aria-labelledby="dec-title">
          <h2 id="dec-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Gavel className="h-5 w-5 text-green-600" aria-hidden="true" />
            {t.dispute.decision}
          </h2>
          {d.decision ? (
            <div className="mt-4">
              <Badge tone={d.decision.state === 'APPROVED' ? 'green' : 'amber'}>{t.dispute.decisionStates[d.decision.state]}</Badge>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-sand p-4">
                  <dt className="text-xs text-ink">{t.dispute.decisionRefund}</dt>
                  <dd className="tabular font-display text-2xl font-extrabold">{money(d.decision.refundToPassenger, locale)}</dd>
                </div>
                <div className="rounded-2xl bg-sand p-4">
                  <dt className="text-xs text-ink">{t.dispute.decisionRelease}</dt>
                  <dd className="tabular font-display text-2xl font-extrabold">{money(d.decision.releaseToDriver, locale)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm font-semibold">{t.dispute.decisionReason}</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{d.decision.reason}</p>
              <p className="mt-4 text-xs text-ink">{t.dispute.decisionExplain}</p>
              {canAppeal && (
                <Button variant="secondary" className="mt-5" onClick={() => setAppealOpen(true)}>
                  {t.dispute.appeal}
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-ink">
              <HeartHandshake className="h-5 w-5 text-green-600" aria-hidden="true" />
              {t.dispute.decisionPending}
            </p>
          )}
        </section>

        {/* Historique */}
        <section className="rounded-[2rem] bg-white p-6 ring-1 ring-line" aria-labelledby="tl-title">
          <h2 id="tl-title" className="font-display text-lg font-extrabold">
            {t.dispute.timeline}
          </h2>
          <ol className="mt-4 space-y-0">
            {d.timeline.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
                {i < d.timeline.length - 1 && <span className="absolute left-[0.6rem] top-6 h-full w-0.5 bg-line" aria-hidden="true" />}
                <span className="relative mt-1 h-5 w-5 shrink-0 rounded-full border-4 border-green-100 bg-green-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-night-900">{ev.label}</p>
                  <p className="text-xs text-ink">
                    {t.dispute.actors[ev.actor]} · {dateTime(ev.at, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Éléments */}
        <section className="rounded-[2rem] bg-white p-6 ring-1 ring-line" aria-labelledby="ev-title">
          <h2 id="ev-title" className="flex items-center gap-2 font-display text-lg font-extrabold">
            <FileText className="h-5 w-5 text-green-600" aria-hidden="true" />
            {t.dispute.evidence}
          </h2>
          {d.evidence.length ? (
            <ul className="mt-4 space-y-3">
              {d.evidence.map((ev) => (
                <li key={ev.id} className={cn('rounded-2xl p-4 text-sm', ev.from === 'WAKA_TEAM' ? 'bg-night-900 text-ivory' : 'bg-sand')}>
                  <p className="whitespace-pre-line">{ev.text}</p>
                  <p className={cn('mt-2 text-xs', ev.from === 'WAKA_TEAM' ? 'text-night-300' : 'text-ink')}>
                    {t.dispute.actors[ev.from]} · {dateTime(ev.at, locale)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink">{t.dispute.noEvidence}</p>
          )}
          {canAddEvidence && (
            <div className="mt-5 border-t border-line pt-5">
              <label htmlFor="ev-text" className="text-sm font-semibold">
                {t.dispute.addEvidence}
              </label>
              <Textarea
                id="ev-text"
                className="mt-1.5"
                value={text}
                maxLength={2000}
                placeholder={t.dispute.evidencePlaceholder}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={textErr ? true : undefined}
                aria-describedby="ev-note"
              />
              <p id="ev-note" className="mt-1.5 text-xs text-amber-800">
                {t.dispute.evidenceNote}
              </p>
              {sendError ? <ErrorState compact className="mt-3" error={sendError} /> : null}
              <Button className="mt-3" onClick={addEvidence} loading={sending} disabled={text.trim().length < 5}>
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                {t.dispute.evidenceSubmit}
              </Button>
            </div>
          )}
        </section>
      </div>

      <p className="mt-8 text-center text-xs text-ink">{t.dispute.notArbitrary}</p>

      <ConfirmDialog
        open={appealOpen}
        onOpenChange={setAppealOpen}
        title={t.dispute.appealTitle}
        body={t.dispute.appealBody}
        confirmLabel={t.dispute.appeal}
        loading={sending}
        onConfirm={async () => {
          setSending(true);
          try {
            await api.disputes.appeal(d.id);
            setAppealOpen(false);
            setFlash(t.dispute.appealDone);
            await load();
          } catch (e) {
            setSendError(e);
            setAppealOpen(false);
          } finally {
            setSending(false);
          }
        }}
      />
    </div>
  );
}
