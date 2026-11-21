import { ArrowRight, BadgeCheck, Briefcase, Clock, MapPin, Snowflake, Star, Users } from 'lucide-react';
import Link from 'next/link';
import type { TripSummary } from '@waka/contracts';
import type { Dict } from '@/lib/i18n';
import { fmt } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/config';
import { addMinutes, amountOnly, duration, shortDate, time } from '@/lib/format';
import { Avatar, Badge } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/** Ligne de trajet verticale : départ ● ─ ─ ● arrivée (estimation). */
export function RouteLine({
  trip,
  t,
  locale,
  size = 'md',
}: {
  trip: Pick<TripSummary, 'departureAt' | 'estimatedDurationMin' | 'origin' | 'destination' | 'meetingPoint' | 'dropoffPoint'>;
  t: Dict;
  locale: Locale;
  size?: 'md' | 'lg';
}) {
  const arrival = trip.estimatedDurationMin ? addMinutes(trip.departureAt, trip.estimatedDurationMin) : null;
  const big = size === 'lg';
  return (
    <div className="grid grid-cols-[auto_auto_1fr] gap-x-3">
      <div className={cn('tabular text-right font-display font-extrabold text-night-900', big ? 'text-xl' : 'text-lg')}>{time(trip.departureAt, locale)}</div>
      <div className="flex flex-col items-center pt-1.5" aria-hidden="true">
        <span className="h-3 w-3 rounded-full border-[3px] border-green-600 bg-white" />
        <span className="my-1 w-0.5 flex-1 bg-[repeating-linear-gradient(to_bottom,#0E8F83_0_4px,transparent_4px_8px)]" />
      </div>
      <div className="min-w-0 pb-4">
        <p className={cn('font-display font-extrabold leading-tight text-night-900', big ? 'text-xl' : 'text-base')}>{trip.origin.name}</p>
        <p className="truncate text-sm text-ink">{trip.meetingPoint}</p>
        {trip.estimatedDurationMin ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />≈ {duration(trip.estimatedDurationMin)} · {t.common.estimate}
          </p>
        ) : null}
      </div>
      <div className={cn('tabular text-right font-display font-bold text-ink', big ? 'text-xl' : 'text-lg')}>
        {arrival ? (
          <span title={t.trip.arrival}>
            <span className="sr-only">{t.trip.arrival} </span>~{time(arrival, locale)}
          </span>
        ) : (
          '—'
        )}
      </div>
      <div className="flex justify-center pt-1.5" aria-hidden="true">
        <span className="h-3 w-3 rounded-full bg-amber-400 ring-[3px] ring-night-900" />
      </div>
      <div className="min-w-0">
        <p className={cn('font-display font-extrabold leading-tight text-night-900', big ? 'text-xl' : 'text-base')}>{trip.destination.name}</p>
        <p className="truncate text-sm text-ink">{trip.dropoffPoint}</p>
      </div>
    </div>
  );
}

export function DriverChip({ driver, t }: { driver: TripSummary['driver']; t: Dict }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={driver.displayName} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-semibold text-night-900">
          <span className="truncate">{driver.displayName}</span>
          {driver.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-green-600" aria-label={t.common.verified} />}
        </p>
        <p className="flex items-center gap-1 text-xs text-ink">
          {driver.rating !== null && driver.completedTrips > 0 ? (
            <>
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
              <span className="font-semibold text-night-800">{driver.rating.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              {fmt(t.common.trips, { n: driver.completedTrips })}
            </>
          ) : (
            <span className="font-semibold text-green-700">{t.common.newDriver}</span>
          )}
        </p>
      </div>
    </div>
  );
}

/** Carte résultat de recherche. Le prix TOTAL par place (frais inclus) est mis en avant. */
export function TripCard({ trip, t, locale, seats = 1, href }: { trip: TripSummary; t: Dict; locale: Locale; seats?: number; href?: string }) {
  const full = trip.seatsAvailable <= 0 || trip.status === 'FULL';
  return (
    <Link
      href={href ?? `/trajets/${trip.id}${seats > 1 ? `?seats=${seats}` : ''}`}
      className={cn(
        'group block rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5',
        full && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-ink">{shortDate(trip.departureAt, locale)}</p>
        <div className="flex flex-wrap justify-end gap-1.5">
          {trip.driver.verified && (
            <Badge tone="green">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t.common.verified}
            </Badge>
          )}
          {trip.driver.isDemo && <Badge tone="demo">{t.common.demo}</Badge>}
        </div>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <RouteLine trip={trip} t={t} locale={locale} />
        <div className="flex items-end justify-between gap-3 border-t border-dashed border-line pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink">{t.search.totalPerSeat}</p>
            <p className="font-display leading-none text-night-900">
              <span className="tabular text-[1.9rem] font-extrabold tracking-tight">{amountOnly(trip.totalPerSeat, locale)}</span>
              <span className="ml-1 text-sm font-bold">FCFA</span>
            </p>
            <p className="mt-0.5 text-xs text-ink">{t.common.feesIncluded}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-green-600 transition group-hover:translate-x-1 sm:ml-auto sm:mt-3" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <DriverChip driver={trip.driver} t={t} />
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge tone={full ? 'danger' : trip.seatsAvailable <= 1 ? 'amber' : 'neutral'}>
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {full ? t.search.full : fmt(t.search.seatsLeft, { n: trip.seatsAvailable })}
          </Badge>
          {trip.vehicle.airConditioning && (
            <Badge tone="neutral" title={t.common.airConditioning}>
              <Snowflake className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t.common.airConditioning}</span>
            </Badge>
          )}
          {trip.vehicle.luggage !== 'NONE' && (
            <Badge tone="neutral" title={t.luggage[trip.vehicle.luggage]}>
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t.luggage[trip.vehicle.luggage]}</span>
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink sm:hidden">
        <MapPin className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
        {fmt(t.search.meetingAt, { place: trip.meetingPoint })}
      </p>
    </Link>
  );
}

export function TripCardSkeleton() {
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line/70" aria-hidden="true">
      <div className="skeleton h-3 w-24" />
      <div className="mt-4 flex justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="skeleton h-5 w-2/3" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-5 w-1/2" />
        </div>
        <div className="skeleton h-12 w-24" />
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <div className="skeleton h-11 w-11 rounded-2xl" />
        <div className="skeleton h-4 w-32" />
      </div>
    </div>
  );
}

export function PriceLines({
  price,
  t,
  locale,
  className,
}: {
  price: { seats: number; seatPrice: number; driverAmount: number; serviceFee: number; total: number; policyVersion: string };
  t: Dict;
  locale: Locale;
  className?: string;
}) {
  const row = 'flex items-baseline justify-between gap-4 py-2';
  const m = (n: number) => `${amountOnly(n, locale)} FCFA`;
  return (
    <dl className={cn('text-sm', className)}>
      <div className={row}>
        <dt className="text-ink">
          {t.trip.contribution} <span className="text-xs">({price.seats} × {m(price.seatPrice)})</span>
        </dt>
        <dd className="tabular font-semibold text-night-900">{m(price.driverAmount)}</dd>
      </div>
      <div className={row}>
        <dt className="text-ink">{t.trip.serviceFee}</dt>
        <dd className="tabular font-semibold text-night-900">{m(price.serviceFee)}</dd>
      </div>
      <div className={cn(row, 'mt-1 border-t border-dashed border-line pt-3')}>
        <dt className="font-display text-base font-extrabold text-night-900">{t.trip.total}</dt>
        <dd className="tabular font-display text-xl font-extrabold text-night-900">{m(price.total)}</dd>
      </div>
      <p className="pt-1 text-xs text-ink">{fmt(t.trip.policyVersion, { v: price.policyVersion })}</p>
    </dl>
  );
}

