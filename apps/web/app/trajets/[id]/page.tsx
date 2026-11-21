import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Briefcase, CalendarDays, CarFront, ListChecks, ShieldCheck, Snowflake, Undo2 } from 'lucide-react';
import type { TripDetail } from '@waka/contracts';
import { getI18n } from '@/lib/i18n/server';
import { fmt } from '@/lib/i18n';
import { serverGet } from '@/lib/api-server';
import { duration, longDate } from '@/lib/format';
import { DriverChip, PriceLines, RouteLine } from '@/components/trip/TripBits';
import { BookingPanel } from '@/components/booking/BookingPanel';
import { Badge, Card } from '@/components/ui/Card';
import { ServerError } from '@/components/ui/ServerError';
import { EmptyRoad } from '@/components/brand/Illustrations';
import { ButtonLink } from '@/components/ui/Button';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const r = await serverGet<TripDetail>(`/v1/trips/${encodeURIComponent(id)}`);
  const { t } = await getI18n();
  return { title: r.ok ? `${r.data.origin.name} → ${r.data.destination.name}` : t.trip.detailTitle };
}

export default async function TripPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp, { t, locale }] = await Promise.all([params, searchParams, getI18n()]);
  const r = await serverGet<TripDetail>(`/v1/trips/${encodeURIComponent(id)}`);

  if (!r.ok) {
    if (r.status === 404) {
      return (
        <div className="container-w flex flex-col items-center py-20 text-center">
          <EmptyRoad className="h-32 w-52" />
          <h1 className="mt-4 text-2xl font-extrabold">{t.trip.notFoundTitle}</h1>
          <p className="mt-2 text-ink">{t.trip.notFoundBody}</p>
          <ButtonLink href="/recherche" className="mt-6">
            {t.nav.findTrip}
          </ButtonLink>
        </div>
      );
    }
    return (
      <div className="container-w py-12">
        <ServerError code={r.code} requestId={r.requestId} />
      </div>
    );
  }

  const trip = r.data;
  const initialSeats = Math.min(Math.max(1, Number(sp.seats) || 1), Math.max(1, Math.min(4, trip.seatsAvailable)));
  const bookable = trip.status === 'PUBLISHED' && trip.seatsAvailable > 0 && new Date(trip.departureAt).getTime() > Date.now();

  return (
    <div className="pb-28 md:pb-0">
      {/* bandeau */}
      <section className="relative isolate overflow-hidden bg-night-900 pb-24 pt-6 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-w">
          <Link href="/recherche" className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-night-200 hover:text-amber-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.common.back}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="night" className="bg-white/10 ring-white/15">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="first-letter:uppercase">{longDate(trip.departureAt, locale)}</span>
            </Badge>
            <Badge tone={trip.status === 'PUBLISHED' ? 'green' : 'amber'}>{t.trip.status[trip.status]}</Badge>
            {trip.driver.isDemo && <Badge tone="demo">{t.common.demo}</Badge>}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold sm:text-5xl">
            {trip.origin.name} <span className="text-amber-400">→</span> {trip.destination.name}
          </h1>
          <p className="mt-2 text-night-200">
            {trip.estimatedDurationMin ? fmt(t.trip.durationEstimate, { d: duration(trip.estimatedDurationMin) }) + ` (${t.common.estimate})` : t.trip.durationUnknown}
          </p>
        </div>
      </section>

      <div className="container-w relative z-10 -mt-16 grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="space-y-6">
          <Card className="p-6">
            <RouteLine trip={trip} t={t} locale={locale} size="lg" />
          </Card>

          <Card className="p-6">
            <h2 className="eyebrow text-green-700">{t.trip.driver}</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <DriverChip driver={trip.driver} t={t} />
              <p className={`flex items-center gap-1.5 text-sm font-semibold ${trip.driver.verified ? 'text-green-700' : 'text-amber-800'}`}>
                {trip.driver.verified ? <BadgeCheck className="h-4 w-4" aria-hidden="true" /> : null}
                {trip.driver.verified ? t.trip.driverVerified : t.trip.driverNotVerified}
              </p>
            </div>
            <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sand text-night-800">
                  <CarFront className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs text-ink">{t.trip.vehicle}</p>
                  <p className="text-sm font-semibold">{trip.vehicle.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sand text-night-800">
                  <Snowflake className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs text-ink">{t.common.airConditioning}</p>
                  <p className="text-sm font-semibold">{trip.vehicle.airConditioning ? t.common.yes : t.common.no}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sand text-night-800">
                  <Briefcase className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs text-ink">{t.common.luggage}</p>
                  <p className="text-sm font-semibold">{t.luggage[trip.vehicle.luggage]}</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-display font-extrabold">
                <ListChecks className="h-5 w-5 text-green-600" aria-hidden="true" />
                {t.trip.rules}
              </h2>
              {trip.rules.length ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {trip.rules.map((rule) => (
                    <li key={rule} className="rounded-full bg-sand px-3 py-1.5 text-sm font-medium text-night-800">
                      {rule}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink">{t.trip.noRules}</p>
              )}
            </Card>
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-display font-extrabold">
                <Undo2 className="h-5 w-5 text-green-600" aria-hidden="true" />
                {t.trip.cancellation}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink">{trip.cancellationPolicySummary}</p>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="font-display font-extrabold">{t.trip.priceTitle}</h2>
            <PriceLines price={trip.quoteForOneSeat} t={t} locale={locale} className="mt-2" />
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-green-50 p-3 text-sm text-green-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
              {t.trip.protectedLine}
            </p>
          </Card>
        </div>

        <BookingPanel trip={trip} initialSeats={initialSeats} bookable={bookable} />
      </div>
    </div>
  );
}
