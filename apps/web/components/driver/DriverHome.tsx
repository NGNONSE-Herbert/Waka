'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, CarFront, Check, ChevronRight, Hourglass, IdCard, PlusCircle, ShieldOff, Wallet } from 'lucide-react';
import type { Me, TripSummary } from '@waka/contracts';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { money, shortDate, time } from '@/lib/format';
import { RequireAuth, useSession } from '@/components/session/SessionProvider';
import { Badge } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Dialog';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { OnboardingForm, VehicleForm } from './DriverForms';
import { cn } from '@/lib/cn';

export function DriverHome() {
  return <RequireAuth>{(me) => <Inner me={me} />}</RequireAuth>;
}

function Inner({ me }: { me: Me }) {
  const { refresh } = useSession();
  if (me.driverStatus === 'VERIFIED') return <Dashboard me={me} />;
  if (me.driverStatus === 'SUSPENDED') return <Blocked suspended />;
  return <Onboarding me={me} onChange={() => void refresh()} />;
}

function Blocked({ suspended }: { suspended?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="container-w max-w-2xl py-12">
      <EmptyState
        title={suspended ? t.driver.suspendedTitle : t.driver.rejectedTitle}
        body={suspended ? t.driver.suspendedBody : t.driver.rejectedBody}
        action={<ButtonLink href="/securite" variant="secondary">{t.account.help}</ButtonLink>}
      />
    </div>
  );
}

function Onboarding({ me, onChange }: { me: Me; onChange: () => void }) {
  const { t } = useI18n();
  const identityDone = me.driverStatus === 'PENDING_REVIEW';
  const vehicleDone = me.vehicles.length > 0;
  const step = !identityDone ? 0 : !vehicleDone ? 1 : 2;
  const steps = [
    { label: `${t.driver.stepIdentity} & ${t.driver.stepDocuments}`, icon: IdCard },
    { label: t.driver.stepVehicle, icon: CarFront },
    { label: t.driver.stepReview, icon: Hourglass },
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden bg-night-900 pb-24 pt-10 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="container-w max-w-3xl">
          <p className="eyebrow text-amber-300">{t.driver.title}</p>
          <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">{t.driver.onboardingTitle}</h1>
          <p className="mt-3 text-lg text-night-200">{t.driver.onboardingSubtitle}</p>
          <ol className="mt-8 grid grid-cols-3 gap-2">
            {steps.map((s, i) => (
              <li
                key={s.label}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'flex flex-col gap-2 rounded-2xl p-3 text-sm font-semibold ring-1 sm:flex-row sm:items-center',
                  i < step && 'bg-green-600/20 text-green-200 ring-green-500/40',
                  i === step && 'bg-amber-400 text-night-900 ring-amber-400',
                  i > step && 'bg-white/5 text-night-300 ring-white/10',
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-black/10">
                  {i < step ? <Check className="h-4 w-4" aria-hidden="true" /> : <s.icon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="leading-tight">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="container-w relative z-10 -mt-16 max-w-3xl pb-12">
        <div className="rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-8">
          {me.driverStatus === 'REJECTED' && <Blocked />}
          {step === 0 && me.driverStatus !== 'REJECTED' && <OnboardingForm onDone={onChange} />}
          {step === 1 && (
            <>
              <h2 className="mb-5 text-2xl font-extrabold">{t.driver.vehicleTitle}</h2>
              <VehicleForm onDone={onChange} />
            </>
          )}
          {step === 2 && (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="relative grid h-20 w-20 place-items-center rounded-full bg-amber-100 text-amber-800">
                <span className="absolute inset-0 animate-ping rounded-full bg-amber-200/60" aria-hidden="true" />
                <Hourglass className="relative h-9 w-9" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-2xl font-extrabold">{t.driver.reviewTitle}</h2>
              <p className="mt-2 max-w-md text-ink">{t.driver.reviewBody}</p>
              <ul className="mt-6 w-full max-w-sm space-y-2 text-left">
                {me.vehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-2xl bg-sand px-4 py-3 text-sm">
                    <span className="font-semibold">{v.label}</span>
                    <Badge tone={v.reviewStatus === 'APPROVED' ? 'green' : v.reviewStatus === 'REJECTED' ? 'danger' : 'amber'}>{t.driver.vehicleStatus[v.reviewStatus]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Dashboard({ me }: { me: Me }) {
  const { t, locale } = useI18n();
  const { refresh } = useSession();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.trips
      .mine()
      .then((list) => setTrips(list.sort((a, b) => b.departureAt.localeCompare(a.departureAt))))
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-night-900 pb-24 pt-10 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="absolute -right-20 -top-24 -z-10 h-80 w-80 rounded-full bg-green-500/25 blur-3xl" aria-hidden="true" />
        <div className="container-w flex flex-wrap items-end justify-between gap-6">
          <div>
            <Badge tone="green" className="bg-green-500/15 text-green-200 ring-green-400/30">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t.account.driverStatus.VERIFIED}
            </Badge>
            <h1 className="mt-3 text-4xl font-extrabold">{fmt(t.driver.dashboardTitle, { name: me.displayName })}</h1>
            <p className="mt-2 text-night-200">{t.driver.dashboardSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/conducteur/publier" variant="amber" size="lg">
              <PlusCircle className="h-5 w-5" aria-hidden="true" />
              {t.driver.publishCta}
            </ButtonLink>
            <ButtonLink href="/conducteur/revenus" variant="onDark" size="lg">
              <Wallet className="h-5 w-5" aria-hidden="true" />
              {t.driver.earningsCta}
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="container-w relative z-10 -mt-14 grid gap-6 pb-12 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section className="rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-8" aria-labelledby="mytrips">
          <h2 id="mytrips" className="text-xl font-extrabold">
            {t.driver.myTrips}
          </h2>
          {error ? (
            <ErrorState className="mt-4" error={error} onRetry={load} />
          ) : !trips ? (
            <div className="mt-4 space-y-3" role="status" aria-busy="true">
              <div className="skeleton h-20" />
              <div className="skeleton h-20" />
            </div>
          ) : trips.length === 0 ? (
            <EmptyState
              className="mt-4 ring-0"
              title={t.driver.noTrips}
              body={t.driver.noTripsBody}
              action={<ButtonLink href="/conducteur/publier">{t.driver.publishCta}</ButtonLink>}
            />
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <Link href={`/conducteur/trajets/${trip.id}`} className="flex items-center gap-4 rounded-2xl py-4 transition hover:bg-ivory sm:px-2">
                    <div className="grid w-16 shrink-0 place-items-center rounded-2xl bg-green-50 py-2 text-center">
                      <span className="text-[0.65rem] font-bold uppercase text-green-700">{shortDate(trip.departureAt, locale)}</span>
                      <span className="tabular font-display font-extrabold">{time(trip.departureAt, locale)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-extrabold">
                        {trip.origin.name} → {trip.destination.name}
                      </p>
                      <p className="truncate text-sm text-ink">
                        {trip.meetingPoint} · {money(trip.seatPrice, locale)} / {t.common.seat}
                      </p>
                    </div>
                    <Badge tone={trip.status === 'CANCELLED' ? 'danger' : trip.status === 'PUBLISHED' ? 'green' : 'neutral'}>{t.trip.status[trip.status]}</Badge>
                    <ChevronRight className="h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2rem] bg-white p-6 ring-1 ring-line">
            <h2 className="flex items-center gap-2 font-display font-extrabold">
              <CarFront className="h-5 w-5 text-green-600" aria-hidden="true" />
              {t.trip.vehicle}
            </h2>
            <ul className="mt-4 space-y-2">
              {me.vehicles.map((v) => (
                <li key={v.id} className="rounded-2xl bg-sand px-4 py-3 text-sm">
                  <p className="font-semibold">{v.label}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-ink">{fmt(t.common.seatsCount, { n: v.seatsTotal })}</span>
                    <Badge tone={v.reviewStatus === 'APPROVED' ? 'green' : v.reviewStatus === 'REJECTED' ? 'danger' : 'amber'}>{t.driver.vehicleStatus[v.reviewStatus]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAddOpen(true)}>
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              {t.driver.addVehicle}
            </Button>
          </div>
          <div className="flex items-start gap-3 rounded-3xl bg-amber-50 p-5 text-sm text-amber-800 ring-1 ring-amber-200">
            <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            {t.driver.arrivalBody}
          </div>
        </aside>
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen} title={t.driver.addVehicle} wide>
        <VehicleForm
          onDone={() => {
            setAddOpen(false);
            void refresh();
          }}
        />
      </Sheet>
    </>
  );
}
