'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Delete, Flag, KeyRound, MapPinned, Play, UserCheck, Users, XCircle } from 'lucide-react';
import type { BookingOutput, TripDetail } from '@waka/contracts';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { dateTime, money } from '@/lib/format';
import { RequireAuth } from '@/components/session/SessionProvider';
import { RouteLine } from '@/components/trip/TripBits';
import { Avatar, Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Sheet } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { cn } from '@/lib/cn';

export function TripManage({ tripId }: { tripId: string }) {
  return <RequireAuth>{() => <Inner tripId={tripId} />}</RequireAuth>;
}

function Inner({ tripId }: { tripId: string }) {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [bookings, setBookings] = useState<BookingOutput[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(params.get('published') ? t.driver.published : null);
  const [dialog, setDialog] = useState<null | 'start' | 'arrival' | 'cancel'>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [checkIn, setCheckIn] = useState<BookingOutput | null>(null);

  const load = useCallback(async () => {
    try {
      const [tr, bk] = await Promise.all([api.trips.detail(tripId), api.trips.bookings(tripId)]);
      setTrip(tr);
      setBookings(bk);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [tripId]);
  useEffect(() => {
    void load();
  }, [load]);

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

  if (!trip || !bookings) {
    return (
      <div className="container-w max-w-5xl py-10">
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <div className="skeleton h-96 rounded-[2rem]" role="status" aria-busy="true" />}
      </div>
    );
  }

  const active = bookings.filter((b) => b.state !== 'CANCELLED' && b.state !== 'SEAT_HELD' && b.state !== 'PAYMENT_PENDING' && b.state !== 'DRAFT');
  const canStart = trip.status === 'PUBLISHED' || trip.status === 'FULL';
  const canArrive = trip.status === 'DEPARTED';
  const canCancel = (trip.status === 'PUBLISHED' || trip.status === 'FULL') && new Date(trip.departureAt).getTime() > Date.now();

  return (
    <div className="container-w max-w-5xl py-8">
      <Link href="/conducteur" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t.driver.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t.driver.tripManageTitle}</h1>
        <Badge tone={trip.status === 'CANCELLED' ? 'danger' : 'green'}>{t.trip.status[trip.status]}</Badge>
      </div>
      {flash && (
        <Notice className="mt-4" icon={<CheckCircle2 className="h-5 w-5 text-green-700" aria-hidden="true" />}>
          {flash}
        </Notice>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line">
            <p className="text-sm font-semibold text-ink first-letter:uppercase">{dateTime(trip.departureAt, locale)}</p>
            <div className="mt-4">
              <RouteLine trip={trip} t={t} locale={locale} size="lg" />
            </div>
          </div>

          <section className="rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line" aria-labelledby="pax">
            <h2 id="pax" className="flex items-center gap-2 text-xl font-extrabold">
              <Users className="h-5 w-5 text-green-600" aria-hidden="true" />
              {t.driver.passengers}
              <span className="text-sm font-semibold text-ink">({fmt(t.driver.bookingsCount, { n: active.length })})</span>
            </h2>
            {active.length === 0 ? (
              <EmptyState className="mt-4 ring-0" illustration={false} title={t.driver.noPassengers} />
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {active.map((b) => {
                  const name = b.passenger?.displayName ?? '—';
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 py-4">
                      <Avatar name={name} tone="amber" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{name}</p>
                        <p className="text-xs text-ink">
                          {fmt(t.common.seatsCount, { n: b.seats })} · {money(b.price.driverAmount, locale)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge tone={b.state === 'CHECKED_IN' || b.state === 'COMPLETED' ? 'green' : b.state === 'DISPUTED' ? 'amber' : 'neutral'}>{t.ticket.states[b.state]}</Badge>
                          {b.payment && <Badge tone="neutral">{t.paymentState[b.payment.state]}</Badge>}
                        </div>
                      </div>
                      {b.state === 'CONFIRMED' && (
                        <Button size="sm" onClick={() => setCheckIn(b)}>
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                          {t.driver.checkIn}
                        </Button>
                      )}
                      {b.state === 'CHECKED_IN' && <UserCheck className="h-6 w-6 text-green-600" aria-label={t.ticket.states.CHECKED_IN} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24">
          <div className="space-y-3 rounded-[2rem] bg-white p-5 shadow-card ring-1 ring-line">
            {canStart && (
              <Button size="lg" className="w-full" onClick={() => setDialog('start')}>
                <Play className="h-5 w-5" aria-hidden="true" />
                {t.driver.startTrip}
              </Button>
            )}
            {canArrive && (
              <Button size="lg" variant="amber" className="w-full" onClick={() => setDialog('arrival')}>
                <MapPinned className="h-5 w-5" aria-hidden="true" />
                {t.driver.reportArrival}
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" className="w-full text-danger hover:bg-danger-50" onClick={() => setDialog('cancel')}>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                {t.driver.cancelTrip}
              </Button>
            )}
            {!canStart && !canArrive && !canCancel && <p className="text-sm text-ink">{t.trip.status[trip.status]}</p>}
          </div>
          <div className="flex items-start gap-3 rounded-3xl bg-amber-50 p-5 text-sm text-amber-800 ring-1 ring-amber-200">
            <Flag className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {t.driver.arrivalBody}
          </div>
          {actionError && !dialog ? <ErrorState compact error={actionError} /> : null}
        </aside>
      </div>

      <ConfirmDialog
        open={dialog === 'start'}
        onOpenChange={(o) => setDialog(o ? 'start' : null)}
        title={t.driver.startTitle}
        body={t.driver.startBody}
        confirmLabel={t.driver.startTrip}
        loading={acting}
        onConfirm={() => void act(() => api.trips.start(trip.id), t.driver.started)}
      >
        {actionError ? <ErrorState compact className="mt-4" error={actionError} /> : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'arrival'}
        onOpenChange={(o) => setDialog(o ? 'arrival' : null)}
        title={t.driver.arrivalTitle}
        body={t.driver.arrivalBody}
        confirmLabel={t.driver.reportArrival}
        tone="amber"
        loading={acting}
        onConfirm={() => void act(() => api.trips.arrival(trip.id), t.driver.arrivalDone)}
      >
        {actionError ? <ErrorState compact className="mt-4" error={actionError} /> : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => setDialog(o ? 'cancel' : null)}
        title={t.driver.cancelTripTitle}
        body={t.driver.cancelTripBody}
        confirmLabel={t.driver.cancelTrip}
        tone="danger"
        loading={acting}
        onConfirm={() => void act(() => api.trips.cancel(trip.id), t.trip.status.CANCELLED)}
      >
        {actionError ? <ErrorState compact className="mt-4" error={actionError} /> : null}
      </ConfirmDialog>

      {checkIn && (
        <CheckInSheet
          booking={checkIn}
          onClose={() => setCheckIn(null)}
          onDone={async (name) => {
            setCheckIn(null);
            setFlash(fmt(t.driver.checkInDone, { name }));
            await load();
          }}
        />
      )}
    </div>
  );
}

/** Saisie du code d’embarquement à 4 chiffres — grand pavé numérique. */
function CheckInSheet({ booking, onClose, onDone }: { booking: BookingOutput; onClose: () => void; onDone: (name: string) => void }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const name = booking.passenger?.displayName ?? '—';

  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));
  const validate = async () => {
    setSending(true);
    setError(null);
    try {
      await api.bookings.checkIn(booking.id, pin);
      onDone(name);
    } catch (e) {
      setError(e);
      setPin('');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const key = 'grid h-16 place-items-center rounded-2xl bg-white font-display text-2xl font-extrabold text-night-900 ring-1 ring-line transition active:scale-95 active:bg-green-50 hover:bg-ivory';
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={fmt(t.driver.checkInTitle, { name })} icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}>
      <p className="text-sm text-ink">{t.driver.checkInHelp}</p>
      <div className="mt-5 flex justify-center gap-3" aria-live="polite" aria-label={`${pin.length}/4`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'tabular grid h-16 w-14 place-items-center rounded-2xl font-display text-3xl font-extrabold ring-2 transition',
              pin[i] ? 'bg-night-900 text-amber-400 ring-night-900' : 'bg-white text-night-200 ring-line',
              i === pin.length && 'ring-green-500',
            )}
          >
            {pin[i] ?? '•'}
          </span>
        ))}
      </div>
      <div className="mx-auto mt-6 grid max-w-xs grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={cn(key, 'text-sm')} onClick={() => setPin('')}>
          {t.driver.checkInClear}
        </button>
        <button type="button" className={key} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className={key} onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t.driver.checkInDelete}>
          <Delete className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      {error ? <ErrorState compact className="mt-4" error={error} /> : null}
      <Button size="lg" className="mt-6 w-full" disabled={pin.length !== 4} loading={sending} onClick={validate}>
        <UserCheck className="h-5 w-5" aria-hidden="true" />
        {t.driver.checkInValidate}
      </Button>
    </Sheet>
  );
}
