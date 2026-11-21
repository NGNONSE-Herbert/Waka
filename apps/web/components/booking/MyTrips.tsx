'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowRight, CarFront, ChevronRight, Plus, Search, Sparkles } from 'lucide-react';
import type { BookingOutput, Me } from '@waka/contracts';
import { api, type TravelRequest } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { dateTime, shortDate, time } from '@/lib/format';
import { cityName, FALLBACK_CITIES } from '@/lib/cities';
import { RequireAuth } from '@/components/session/SessionProvider';
import { Badge } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

const PAST_STATES: BookingOutput['state'][] = ['COMPLETED', 'CANCELLED'];

export function MyTrips() {
  return <RequireAuth>{(me) => <Inner me={me} />}</RequireAuth>;
}

function Inner({ me }: { me: Me }) {
  const { t } = useI18n();
  const [bookings, setBookings] = useState<BookingOutput[] | null>(null);
  const [requests, setRequests] = useState<TravelRequest[] | null>(null);
  const [bErr, setBErr] = useState<unknown>(null);
  const [rErr, setRErr] = useState<unknown>(null);

  const load = useCallback(() => {
    setBErr(null);
    setRErr(null);
    api.bookings
      .mine()
      .then(setBookings)
      .catch((e) => setBErr(e));
    api.requests
      .mine()
      .then(setRequests)
      .catch((e) => setRErr(e));
  }, []);
  useEffect(load, [load]);

  const now = Date.now();
  const upcoming = (bookings ?? [])
    .filter(
      (b) =>
        !PAST_STATES.includes(b.state) &&
        // Actions encore attendues (confirmation d’arrivée, litige…) : on garde le billet « à venir ».
        (new Date(b.trip.departureAt).getTime() > now - 12 * 3600_000 || ['IN_PROGRESS', 'ARRIVAL_REPORTED', 'DISPUTED'].includes(b.state)),
    )
    .sort((a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt));
  const past = (bookings ?? []).filter((b) => !upcoming.includes(b)).sort((a, b) => b.trip.departureAt.localeCompare(a.trip.departureAt));

  const tab = 'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold text-ink transition data-[state=active]:bg-white data-[state=active]:text-night-900 data-[state=active]:shadow-sm';

  return (
    <div className="container-w max-w-4xl py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">{t.myTrips.title}</h1>
        <ButtonLink href="/recherche" variant="secondary" size="sm">
          <Search className="h-4 w-4" aria-hidden="true" />
          {t.myTrips.findTrip}
        </ButtonLink>
      </div>

      <Tabs.Root defaultValue="upcoming" className="mt-6">
        <Tabs.List className="flex gap-1 rounded-2xl bg-sand p-1" aria-label={t.myTrips.title}>
          <Tabs.Trigger value="upcoming" className={tab}>
            {t.myTrips.upcoming}
            {upcoming.length > 0 && <span className="rounded-full bg-amber-400 px-2 text-xs text-night-900">{upcoming.length}</span>}
          </Tabs.Trigger>
          <Tabs.Trigger value="past" className={tab}>
            {t.myTrips.past}
          </Tabs.Trigger>
          <Tabs.Trigger value="requests" className={tab}>
            {t.myTrips.requests}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="upcoming" className="mt-6 outline-none">
          {bErr ? (
            <ErrorState error={bErr} onRetry={load} />
          ) : !bookings ? (
            <ListSkeleton />
          ) : upcoming.length === 0 ? (
            <EmptyState
              title={t.myTrips.emptyUpcoming}
              body={t.myTrips.emptyUpcomingBody}
              action={<ButtonLink href="/recherche">{t.myTrips.findTrip}</ButtonLink>}
            />
          ) : (
            <ul className="grid gap-3">
              {upcoming.map((b) => (
                <BookingRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </Tabs.Content>

        <Tabs.Content value="past" className="mt-6 outline-none">
          {bErr ? (
            <ErrorState error={bErr} onRetry={load} />
          ) : !bookings ? (
            <ListSkeleton />
          ) : past.length === 0 ? (
            <EmptyState title={t.myTrips.emptyPast} illustration={false} />
          ) : (
            <ul className="grid gap-3">
              {past.map((b) => (
                <BookingRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </Tabs.Content>

        <Tabs.Content value="requests" className="mt-6 outline-none">
          {rErr ? (
            <ErrorState error={rErr} onRetry={load} />
          ) : !requests ? (
            <ListSkeleton />
          ) : requests.length === 0 ? (
            <EmptyState
              title={t.myTrips.emptyRequests}
              body={t.myTrips.emptyRequestsBody}
              action={
                <ButtonLink href="/demande">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t.myTrips.newRequest}
                </ButtonLink>
              }
            />
          ) : (
            <>
              <ul className="grid gap-3">
                {requests.map((r) => (
                  <RequestRow key={r.id} r={r} />
                ))}
              </ul>
              <ButtonLink href="/demande" variant="secondary" className="mt-4">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t.myTrips.newRequest}
              </ButtonLink>
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>

      {me.driverStatus !== 'NONE' && (
        <Link
          href="/conducteur"
          className="mt-10 flex items-center gap-4 rounded-[2rem] bg-night-900 p-6 text-ivory transition hover:bg-night-800"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-night-900">
            <CarFront className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-extrabold">{t.myTrips.driverSection}</span>
            <span className="text-sm text-night-200">{t.myTrips.driverSectionBody}</span>
          </span>
          <ArrowRight className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function BookingRow({ b }: { b: BookingOutput }) {
  const { t, locale } = useI18n();
  const needsPay = b.state === 'SEAT_HELD' || b.state === 'PAYMENT_PENDING';
  return (
    <li>
      <Link
        href={needsPay ? `/reservations/${b.id}/paiement` : `/reservations/${b.id}`}
        className={cn('flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5', b.state === 'CANCELLED' && 'opacity-70')}
      >
        <div className="grid w-16 shrink-0 place-items-center rounded-2xl bg-night-900 py-2 text-center text-ivory">
          <span className="text-[0.65rem] font-bold uppercase text-amber-300">{shortDate(b.trip.departureAt, locale).replace(/\.$/, '')}</span>
          <span className="tabular font-display text-lg font-extrabold">{time(b.trip.departureAt, locale)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-extrabold">
            {b.trip.origin.name} → {b.trip.destination.name}
          </p>
          <p className="truncate text-sm text-ink">{b.trip.meetingPoint}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={b.state === 'CANCELLED' ? 'danger' : needsPay || b.state === 'DISPUTED' ? 'amber' : 'green'}>{t.ticket.states[b.state]}</Badge>
            {b.payment && b.state !== 'CANCELLED' && <Badge tone="neutral">{t.paymentState[b.payment.state]}</Badge>}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
      </Link>
    </li>
  );
}

function RequestRow({ r }: { r: TravelRequest }) {
  const { t, locale } = useI18n();
  return (
    <li>
      <Link href={`/demandes/${r.id}`} className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70 transition hover:shadow-lift">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-green-50 text-green-700">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-extrabold">
            {cityName(FALLBACK_CITIES, r.originCity)} → {cityName(FALLBACK_CITIES, r.destinationCity)}
          </p>
          <p className="text-sm text-ink">
            {dateTime(r.windowStart, locale)} – {time(r.windowEnd, locale)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={r.status === 'ACTIVE' ? 'green' : 'neutral'}>{t.myTrips.requestStatus[r.status]}</Badge>
            <Badge tone="amber">{fmt(t.myTrips.matches, { n: r.matchCount })}</Badge>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3" role="status" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-28 rounded-3xl" />
      ))}
    </div>
  );
}
