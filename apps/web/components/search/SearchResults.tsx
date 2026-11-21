'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, SlidersHorizontal, Snowflake, Sparkles } from 'lucide-react';
import type { TripSummary } from '@waka/contracts';
import { api, type Page } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { hourOf, money } from '@/lib/format';
import { TripCard, TripCardSkeleton } from '@/components/trip/TripBits';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Toggle } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

type Slot = 'any' | 'morning' | 'afternoon' | 'evening';
const PRICE_STEPS = [0, 3000, 5000, 7000, 10000];

export function SearchResults({
  initial,
  initialError,
  query,
}: {
  initial: Page<TripSummary> | null;
  initialError: { code: string; requestId: string | null } | null;
  query: { from?: string; to?: string; date?: string; seats: number };
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<TripSummary[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [slot, setSlot] = useState<Slot>('any');
  const [maxPrice, setMaxPrice] = useState(0);
  const [ac, setAc] = useState(false);
  const [luggage, setLuggage] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(
    () =>
      items.filter((trip) => {
        const h = hourOf(trip.departureAt);
        if (slot === 'morning' && h >= 12) return false;
        if (slot === 'afternoon' && (h < 12 || h >= 18)) return false;
        if (slot === 'evening' && h < 18) return false;
        if (maxPrice && trip.totalPerSeat > maxPrice) return false;
        if (ac && !trip.vehicle.airConditioning) return false;
        if (luggage && trip.vehicle.luggage === 'NONE') return false;
        return true;
      }),
    [items, slot, maxPrice, ac, luggage],
  );
  const activeFilters = (slot !== 'any' ? 1 : 0) + (maxPrice ? 1 : 0) + (ac ? 1 : 0) + (luggage ? 1 : 0);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.trips.search({ ...query, cursor, limit: 10 });
      setItems((prev) => [...prev, ...page.items.filter((x) => !prev.some((p) => p.id === x.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setMoreError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const reset = () => {
    setSlot('any');
    setMaxPrice(0);
    setAc(false);
    setLuggage(false);
  };

  if (initialError) {
    return <ErrorState className="mt-8" code={initialError.code} requestId={initialError.requestId} onRetry={() => router.refresh()} />;
  }

  const requestQs = new URLSearchParams();
  if (query.from) requestQs.set('from', query.from);
  if (query.to) requestQs.set('to', query.to);
  if (query.date) requestQs.set('date', query.date);
  requestQs.set('seats', String(query.seats));

  if (items.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        title={t.search.emptyTitle}
        body={t.search.emptyBody}
        action={
          <>
            <ButtonLink href={`/demande?${requestQs.toString()}`} variant="primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t.search.emptyCta}
            </ButtonLink>
          </>
        }
      />
    );
  }

  const slots: { v: Slot; label: string }[] = [
    { v: 'any', label: t.search.slotAny },
    { v: 'morning', label: t.search.slotMorning },
    { v: 'afternoon', label: t.search.slotAfternoon },
    { v: 'evening', label: t.search.slotEvening },
  ];

  const filters = (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-night-900">{t.search.filterDeparture}</legend>
        <div className="grid gap-2">
          {slots.map((s) => (
            <label
              key={s.v}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line has-[:checked]:bg-green-50 has-[:checked]:font-bold has-[:checked]:text-green-700 has-[:checked]:ring-2 has-[:checked]:ring-green-500"
            >
              <input type="radio" name="slot" value={s.v} checked={slot === s.v} onChange={() => setSlot(s.v)} className="accent-green-600" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-night-900">{t.search.filterMaxPrice}</legend>
        <div className="flex flex-wrap gap-2">
          {PRICE_STEPS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={maxPrice === p}
              onClick={() => setMaxPrice(p)}
              className={cn(
                'min-h-11 rounded-2xl px-3.5 text-sm font-semibold ring-1 ring-inset transition',
                maxPrice === p ? 'bg-night-900 text-ivory ring-night-900' : 'bg-white text-night-800 ring-line hover:ring-night-200',
              )}
            >
              {p === 0 ? t.search.filterMaxPriceAny : `≤ ${money(p, locale)}`}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <Toggle id="f-ac" label={t.search.filterAc} icon={<Snowflake className="h-4 w-4 text-green-600" aria-hidden="true" />} checked={ac} onChange={(e) => setAc(e.target.checked)} />
        <Toggle id="f-lug" label={t.search.filterLuggage} icon={<Briefcase className="h-4 w-4 text-green-600" aria-hidden="true" />} checked={luggage} onChange={(e) => setLuggage(e.target.checked)} />
      </div>
      <p className="text-xs text-ink">{t.search.filterNote}</p>
      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" onClick={reset}>
          {t.search.filtersReset}
        </Button>
      )}
    </div>
  );

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[17rem_1fr]">
      <aside aria-label={t.search.filters}>
        <div className="lg:hidden">
          <Button variant="secondary" className="w-full" aria-expanded={showFilters} aria-controls="filters-panel" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t.search.filters}
            {activeFilters > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1.5 text-xs text-night-900">{activeFilters}</span>}
          </Button>
          <div id="filters-panel" hidden={!showFilters} className="mt-4 rounded-3xl bg-sand p-4">
            {filters}
          </div>
        </div>
        <div className="sticky top-44 hidden lg:block">
          <h2 className="mb-4 flex items-center gap-2 font-display font-extrabold">
            <SlidersHorizontal className="h-4 w-4 text-green-600" aria-hidden="true" />
            {t.search.filters}
          </h2>
          {filters}
        </div>
      </aside>

      <section aria-live="polite">
        <p className="mb-4 text-sm font-semibold text-ink">{fmt(t.search.resultsCount, { n: filtered.length })}</p>
        {filtered.length === 0 ? (
          <EmptyState
            title={t.search.filteredEmpty}
            illustration={false}
            action={
              <Button variant="secondary" onClick={reset}>
                {t.search.filtersReset}
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-4">
            {filtered.map((trip, i) => (
              <li key={trip.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
                <TripCard trip={trip} t={t} locale={locale} seats={query.seats} />
              </li>
            ))}
          </ul>
        )}
        {loadingMore && (
          <div className="mt-4 grid gap-4">
            <TripCardSkeleton />
          </div>
        )}
        {moreError ? <ErrorState compact className="mt-4" error={moreError} onRetry={loadMore} /> : null}
        <div className="mt-6 flex justify-center">
          {cursor ? (
            <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
              {loadingMore ? t.search.loadingMore : t.search.loadMore}
            </Button>
          ) : (
            <p className="text-sm text-ink">{t.search.endOfList}</p>
          )}
        </div>
      </section>
    </div>
  );
}
