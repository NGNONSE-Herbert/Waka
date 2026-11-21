'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Minus, Plus, ShieldCheck, Timer } from 'lucide-react';
import type { TripDetail } from '@waka/contracts';
import { api, newIdempotencyKey } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { amountOnly, money } from '@/lib/format';
import { useSession, loginHref } from '@/components/session/SessionProvider';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { PriceLines } from '@/components/trip/TripBits';

/** Sélection des places + « Réserver » → POST /v1/bookings (Idempotency-Key stable par action). */
export function BookingPanel({ trip, initialSeats, bookable }: { trip: TripDetail; initialSeats: number; bookable: boolean }) {
  const { t, locale } = useI18n();
  const { me, status } = useSession();
  const router = useRouter();
  const maxSeats = Math.max(1, Math.min(4, trip.seatsAvailable));
  const [seats, setSeats] = useState(initialSeats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Une clé par « intention » (trajet + nb de places) : un nouvel essai réutilise la même clé.
  const keyRef = useRef<{ seats: number; key: string } | null>(null);

  const q = trip.quoteForOneSeat;
  const preview = {
    seats,
    seatPrice: q.seatPrice,
    driverAmount: q.driverAmount * seats,
    serviceFee: q.serviceFee * seats,
    total: q.total * seats,
    policyVersion: q.policyVersion,
  };

  const book = async () => {
    if (!keyRef.current || keyRef.current.seats !== seats) keyRef.current = { seats, key: newIdempotencyKey() };
    setLoading(true);
    setError(null);
    try {
      const booking = await api.bookings.create({ tripId: trip.id, seats }, keyRef.current.key);
      router.push(`/reservations/${booking.id}/paiement`);
    } catch (e) {
      setError(e);
      setLoading(false);
    }
  };

  const next = `/trajets/${trip.id}?seats=${seats}`;
  const cta =
    !bookable ? (
      <Button disabled className="w-full" size="lg">
        {t.trip.notBookable}
      </Button>
    ) : status !== 'authenticated' || !me ? (
      <ButtonLink href={loginHref(next)} size="lg" className="w-full" aria-disabled={status === 'loading' || undefined}>
        <Lock className="h-4 w-4" aria-hidden="true" />
        {t.trip.loginToBook}
      </ButtonLink>
    ) : (
      <Button size="lg" className="w-full" onClick={book} loading={loading}>
        {loading ? t.trip.booking : fmt(t.trip.bookFor, { amount: money(preview.total, locale) })}
      </Button>
    );

  return (
    <>
      <aside className="lg:sticky lg:top-24" aria-label={t.trip.book}>
        <div className="rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line">
          <p className="text-xs font-bold uppercase tracking-wider text-ink">{t.trip.youPay}</p>
          <p className="mt-1 font-display leading-none text-night-900">
            <span className="tabular text-5xl font-extrabold tracking-tight">{amountOnly(preview.total, locale)}</span>
            <span className="ml-1.5 text-lg font-bold">FCFA</span>
          </p>
          <p className="mt-1 text-sm text-ink">
            {fmt(t.common.seatsCount, { n: seats })} · {t.common.feesIncluded}
          </p>

          <div className="mt-6">
            <p id="seats-label" className="text-sm font-semibold text-night-900">
              {t.trip.seatsSelect}
            </p>
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-sand p-1.5" role="group" aria-labelledby="seats-label">
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-xl bg-white text-night-900 shadow-sm disabled:opacity-40"
                onClick={() => setSeats((s) => Math.max(1, s - 1))}
                disabled={seats <= 1 || !bookable}
                aria-label="−1"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <output className="tabular font-display text-2xl font-extrabold" aria-live="polite">
                {seats}
              </output>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-xl bg-white text-night-900 shadow-sm disabled:opacity-40"
                onClick={() => setSeats((s) => Math.min(maxSeats, s + 1))}
                disabled={seats >= maxSeats || !bookable}
                aria-label="+1"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink">{fmt(t.trip.seatsAvailable, { n: trip.seatsAvailable })}</p>
          </div>

          <PriceLines price={preview} t={t} locale={locale} className="mt-4" />
          <p className="mt-1 text-xs text-ink">{t.trip.priceNote}</p>

          <div className="mt-5 hidden md:block">{cta}</div>
          {error ? <ErrorState compact className="mt-4" error={error} onRetry={me ? book : undefined} /> : null}

          <ul className="mt-5 space-y-2 text-xs text-ink">
            <li className="flex items-start gap-2">
              <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
              {t.trip.holdInfo}
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
              {t.trip.protectedLine}
            </li>
          </ul>
        </div>
      </aside>

      {/* barre d’action mobile, au-dessus de la navigation basse */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <p className="tabular font-display text-xl font-extrabold leading-none">{money(preview.total, locale)}</p>
            <p className="text-[0.7rem] text-ink">{fmt(t.common.seatsCount, { n: seats })}</p>
          </div>
          <div className="min-w-0 flex-1">{cta}</div>
        </div>
      </div>
    </>
  );
}
