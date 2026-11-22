'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  Flag,
  Landmark,
  MapPin,
  Scale,
  Star,
  Undo2,
  Users,
} from 'lucide-react';
import type { BookingOutput } from '@waka/contracts';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { addMinutes, longDate, time } from '@/lib/format';
import { RequireAuth } from '@/components/session/SessionProvider';
import { Avatar, Badge } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog, Sheet } from '@/components/ui/Dialog';
import { ErrorState, Notice } from '@/components/ui/States';
import { Textarea } from '@/components/ui/Field';
import { PriceLines } from '@/components/trip/TripBits';
import { DisputeForm } from './DisputeForm';
import { BOOKING_PROGRESS } from './BookingCommon';
import { cn } from '@/lib/cn';

export function TicketView({ bookingId }: { bookingId: string }) {
  return <RequireAuth>{() => <TicketInner bookingId={bookingId} />}</RequireAuth>;
}

function TicketInner({ bookingId }: { bookingId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [b, setB] = useState<BookingOutput | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<null | 'cancel' | 'confirm' | 'dispute'>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setB(await api.bookings.detail(bookingId));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [bookingId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Politique d’annulation détaillée (chargée à l’ouverture du dialogue).
  useEffect(() => {
    if (dialog !== 'cancel' || !b || policy) return;
    api.trips
      .detail(b.trip.id)
      .then((d) => setPolicy(d.cancellationPolicySummary))
      .catch(() => {});
  }, [dialog, b, policy]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setActing(true);
    setActionError(null);
    try {
      await fn();
      setDialog(null);
      setFlash(msg);
      await load();
    } catch (e) {
      setActionError(e);
    } finally {
      setActing(false);
    }
  };

  if (!b) {
    return (
      <div className="container-w max-w-3xl py-10">
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <div className="skeleton h-[32rem] rounded-[2rem]" role="status" aria-busy="true" />}
      </div>
    );
  }

  const trip = b.trip;
  const progress = BOOKING_PROGRESS[b.state];
  const isPassenger = b.role === 'PASSENGER';
  const canPay = isPassenger && (b.state === 'SEAT_HELD' || b.state === 'PAYMENT_PENDING');
  const canCancel = isPassenger && (b.state === 'SEAT_HELD' || b.state === 'CONFIRMED');
  const canConfirm = isPassenger && (b.state === 'ARRIVAL_REPORTED' || b.state === 'IN_PROGRESS') && !b.passengerConfirmedAt;
  const canDispute = !b.dispute && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'COMPLETED'].includes(b.state);
  const arrival = trip.estimatedDurationMin ? addMinutes(trip.departureAt, trip.estimatedDurationMin) : null;
  const steps = [t.ticket.steps.booked, t.ticket.steps.paid, t.ticket.steps.boarded, t.ticket.steps.onRoad, t.ticket.steps.arrived, t.ticket.steps.done];

  return (
    <div className="relative isolate">
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-night-900" aria-hidden="true">
        <div className="pattern-ndop h-full w-full opacity-60" />
      </div>
      <div className="container-w max-w-5xl py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-ivory">
          <h1 className="text-3xl font-extrabold">{t.ticket.title}</h1>
          <Badge tone={b.state === 'CANCELLED' ? 'danger' : b.state === 'DISPUTED' ? 'amber' : 'green'} data-testid="booking-state" data-state={b.state}>
            {t.ticket.states[b.state]}
          </Badge>
        </div>

        {flash && (
          <Notice className="mb-6" icon={<CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden="true" />}>
            {flash}
          </Notice>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          {/* ─── CARTE D’EMBARQUEMENT ─── */}
          <article className="overflow-hidden rounded-[2rem] bg-white shadow-lift ring-1 ring-line" aria-label={t.ticket.boardingPass}>
            <div className="relative bg-gradient-to-br from-night-800 to-night-900 p-6 text-ivory sm:p-8">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-amber-300">{t.ticket.boardingPass}</p>
                <p className="font-mono text-xs text-night-300">
                  {t.ticket.reference} {b.id.slice(-8).toUpperCase()}
                </p>
              </div>
              <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div>
                  <p className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{trip.origin.code}</p>
                  <p className="text-sm text-night-200">{trip.origin.name}</p>
                  <p className="tabular mt-2 font-display text-2xl font-extrabold text-amber-400">{time(trip.departureAt, locale)}</p>
                </div>
                <svg viewBox="0 0 120 40" className="h-10 w-20 sm:w-32" aria-hidden="true">
                  <path d="M4 30 C 40 30 60 8 116 10" fill="none" stroke="#375674" strokeWidth="6" strokeLinecap="round" />
                  <path d="M4 30 C 40 30 60 8 116 10" fill="none" stroke="#D9F27B" strokeWidth="1.5" strokeDasharray="3 5" />
                  <circle cx="4" cy="30" r="4" fill="#1F7A4C" />
                  <circle cx="116" cy="10" r="4" fill="#D9F27B" />
                </svg>
                <div className="text-right">
                  <p className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{trip.destination.code}</p>
                  <p className="text-sm text-night-200">{trip.destination.name}</p>
                  <p className="tabular mt-2 font-display text-2xl font-extrabold text-night-200">{arrival ? `~${time(arrival, locale)}` : '—'}</p>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-night-300">{t.common.date}</dt>
                  <dd className="flex items-center gap-1.5 font-semibold first-letter:uppercase">
                    <CalendarDays className="h-4 w-4 text-amber-400" aria-hidden="true" />
                    {longDate(trip.departureAt, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-night-300">{t.ticket.seats}</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    <Users className="h-4 w-4 text-amber-400" aria-hidden="true" />
                    {b.seats}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-xs text-night-300">{t.trip.meetingPoint}</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    <MapPin className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                    {trip.meetingPoint}
                  </dd>
                </div>
              </dl>
            </div>

            {/* dentelure */}
            <div className="relative h-0" aria-hidden="true">
              <span className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-ivory" />
              <span className="absolute -right-4 -top-4 h-8 w-8 rounded-full bg-ivory" />
              <span className="absolute left-6 right-6 top-0 border-t-2 border-dashed border-line" />
            </div>

            <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={trip.driver.displayName} className="h-12 w-12 text-sm" />
                <div className="min-w-0">
                  <p className="text-xs text-ink">{isPassenger ? t.trip.driver : t.ticket.passenger}</p>
                  <p className="flex items-center gap-1.5 truncate font-semibold">
                    {isPassenger ? trip.driver.displayName : (b.passenger?.displayName ?? '—')}
                    {isPassenger && trip.driver.verified && <BadgeCheck className="h-4 w-4 text-green-600" aria-label={t.common.verified} />}
                    {trip.driver.isDemo && <Badge tone="demo">{t.common.demo}</Badge>}
                  </p>
                  <p className="truncate text-sm text-ink">{trip.vehicle.label}</p>
                </div>
              </div>

              <div className="rounded-3xl bg-amber-50 px-6 py-4 text-center ring-1 ring-amber-200">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">{t.ticket.pin}</p>
                {b.boardingPin ? (
                  <>
                    <p className="tabular font-display text-5xl font-extrabold tracking-[0.25em] text-night-900" data-testid="boarding-pin">
                      {b.boardingPin}
                    </p>
                    <p className="mt-1 max-w-[14rem] text-xs text-amber-800">{t.ticket.pinHelp}</p>
                  </>
                ) : (
                  <p className="mt-2 max-w-[14rem] text-xs text-amber-800">{t.ticket.pinHidden}</p>
                )}
              </div>
            </div>

            <div className="border-t border-line px-6 py-5 sm:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <Landmark className="h-5 w-5 text-green-600" aria-hidden="true" />
                <span className="text-sm text-ink">{t.ticket.paymentStatus}</span>
                <Badge tone={b.payment?.state === 'FROZEN_DISPUTE' || b.payment?.state === 'FAILED' ? 'amber' : 'green'} data-testid="payment-state">
                  {b.payment ? t.paymentState[b.payment.state] : t.ticket.awaitingPayment}
                </Badge>
              </div>
            </div>

            {/* frise des états */}
            {b.state !== 'CANCELLED' && (
              <div className="border-t border-line px-6 py-6 sm:px-8">
                <h2 className="text-sm font-bold text-night-900">{t.ticket.timeline}</h2>
                <ol className="mt-4 grid grid-cols-6 gap-1">
                  {steps.map((s, i) => {
                    const done = i <= progress;
                    const current = i === progress + 1;
                    return (
                      <li key={s} className="flex flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                        <div className="flex w-full items-center">
                          <span className={cn('h-0.5 flex-1', i === 0 ? 'opacity-0' : done || current ? 'bg-green-500' : 'bg-line')} />
                          <span
                            className={cn(
                              'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold',
                              done && 'bg-green-600 text-white',
                              current && 'bg-amber-400 text-night-900 ring-4 ring-amber-100',
                              !done && !current && 'bg-sand text-ink',
                            )}
                          >
                            {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                          </span>
                          <span className={cn('h-0.5 flex-1', i === steps.length - 1 ? 'opacity-0' : done ? 'bg-green-500' : 'bg-line')} />
                        </div>
                        <span className={cn('mt-2 hidden text-xs leading-tight sm:block', current ? 'font-bold text-night-900' : 'text-ink')}>{s}</span>
                        <span className="sr-only sm:hidden">{s}</span>
                      </li>
                    );
                  })}
                </ol>
                {/* Sur mobile, les 6 libellés ne tiennent pas : on affiche l’étape suivante en clair. */}
                <p className="mt-3 text-center text-sm font-semibold text-night-900 sm:hidden" aria-hidden="true">
                  {steps[Math.min(progress + 1, steps.length - 1)]} · {Math.min(progress + 2, steps.length)}/{steps.length}
                </p>
              </div>
            )}
          </article>

          {/* ─── ACTIONS ─── */}
          <aside className="space-y-4" aria-label={t.ticket.actions}>
            {b.dispute && (
              <Link
                href={`/litiges/${b.dispute.id}`}
                className="flex items-start gap-3 rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200 transition hover:ring-amber-400"
              >
                <Scale className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden="true" />
                <span>
                  <span className="block font-display font-extrabold text-night-900">{t.ticket.disputeOngoing}</span>
                  <span className="text-sm text-amber-800">
                    {t.dispute.states[b.dispute.state]} · {t.ticket.seeDispute} →
                  </span>
                </span>
              </Link>
            )}
            {b.state === 'ARRIVAL_REPORTED' && isPassenger && !b.passengerConfirmedAt && (
              <Notice tone="green">{t.ticket.arrivalReportedHint}</Notice>
            )}
            <div className="space-y-3 rounded-3xl bg-white p-5 shadow-card ring-1 ring-line">
              {canPay && (
                <ButtonLink href={`/reservations/${b.id}/paiement`} variant="amber" className="w-full">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  {t.ticket.payNow}
                </ButtonLink>
              )}
              {canConfirm && (
                <Button className="h-auto w-full py-3 text-left leading-snug" onClick={() => setDialog('confirm')}>
                  <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {t.ticket.confirmArrival}
                </Button>
              )}
              {canDispute && (
                <Button variant="secondary" className="w-full" onClick={() => setDialog('dispute')}>
                  <Flag className="h-4 w-4 text-danger" aria-hidden="true" />
                  {t.ticket.report}
                </Button>
              )}
              {canCancel && (
                <Button variant="ghost" className="w-full text-danger hover:bg-danger-50" onClick={() => setDialog('cancel')}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  {t.ticket.cancel}
                </Button>
              )}
              <ButtonLink href={`/trajets/${trip.id}`} variant="ghost" className="w-full">
                {t.trip.detailTitle} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </ButtonLink>
            </div>
            <div className="rounded-3xl bg-white p-5 ring-1 ring-line">
              <PriceLines price={b.price} t={t} locale={locale} />
            </div>
            {actionError && !dialog ? <ErrorState compact error={actionError} /> : null}
          </aside>
        </div>

        {b.state === 'COMPLETED' && b.canReview && isPassenger && <ReviewForm bookingId={b.id} onDone={() => void load()} />}
      </div>

      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => setDialog(o ? 'cancel' : null)}
        title={t.ticket.cancelTitle}
        icon={<Undo2 className="h-5 w-5" aria-hidden="true" />}
        body={
          <>
            {policy && <p className="mb-3 rounded-2xl bg-sand p-3 text-sm text-night-900">{policy}</p>}
            <p>{t.ticket.cancelBody}</p>
          </>
        }
        confirmLabel={t.ticket.cancelConfirm}
        tone="danger"
        loading={acting}
        onConfirm={() => void act(() => api.bookings.cancel(b.id), t.ticket.cancelled)}
      >
        {actionError ? <ErrorState compact className="mt-4" error={actionError} /> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'confirm'}
        onOpenChange={(o) => setDialog(o ? 'confirm' : null)}
        title={t.ticket.confirmArrivalTitle}
        icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
        body={t.ticket.confirmArrivalBody}
        confirmLabel={t.ticket.confirmArrivalCta}
        loading={acting}
        onConfirm={() => void act(() => api.bookings.confirm(b.id), t.ticket.confirmed)}
      >
        {actionError ? <ErrorState compact className="mt-4" error={actionError} /> : null}
      </ConfirmDialog>

      <Sheet open={dialog === 'dispute'} onOpenChange={(o) => setDialog(o ? 'dispute' : null)} title={t.dispute.newTitle} icon={<Flag className="h-5 w-5" aria-hidden="true" />} wide>
        <DisputeForm bookingId={b.id} onOpened={(d) => router.push(`/litiges/${d.id}`)} />
      </Sheet>
    </div>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  if (done) return <Notice className="mt-6">{t.ticket.reviewThanks}</Notice>;

  return (
    <section className="mt-6 rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line sm:p-8" aria-labelledby="review-title">
      <h2 id="review-title" className="text-xl font-extrabold">
        {t.ticket.reviewTitle}
      </h2>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">{t.ticket.reviewRating}</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              aria-label={fmt(t.ticket.reviewStar, { n })}
              onClick={() => setRating(n)}
              className="grid h-12 w-12 place-items-center rounded-2xl transition hover:bg-amber-50"
            >
              <Star className={cn('h-8 w-8 transition', n <= rating ? 'fill-amber-400 text-amber-500' : 'text-night-200')} aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor="rv-comment" className="mt-4 block text-sm font-semibold">
        {t.ticket.reviewComment}
      </label>
      <Textarea id="rv-comment" className="mt-1.5" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error ? <ErrorState compact className="mt-4" error={error} /> : null}
      <Button
        className="mt-4"
        disabled={rating === 0}
        loading={sending}
        onClick={async () => {
          setSending(true);
          setError(null);
          try {
            await api.bookings.review(bookingId, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
            setDone(true);
            onDone();
          } catch (e) {
            setError(e);
          } finally {
            setSending(false);
          }
        }}
      >
        {t.ticket.reviewSubmit}
      </Button>
    </section>
  );
}
