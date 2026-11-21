import type { Metadata } from 'next';
import type { City, TripSummary } from '@waka/contracts';
import { CITY_CODES } from '@waka/contracts';
import { getI18n } from '@/lib/i18n/server';
import { fmt } from '@/lib/i18n';
import { serverGet } from '@/lib/api-server';
import { FALLBACK_CITIES, cityName } from '@/lib/cities';
import { longDate } from '@/lib/format';
import { SearchForm } from '@/components/search/SearchForm';
import { SearchResults } from '@/components/search/SearchResults';

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isCity = (v: string | undefined): v is (typeof CITY_CODES)[number] => !!v && (CITY_CODES as readonly string[]).includes(v);

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.search.title };
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const from = isCity(one(sp.from)) ? one(sp.from) : undefined;
  const to = isCity(one(sp.to)) ? one(sp.to) : undefined;
  const dateRaw = one(sp.date);
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  const seats = Math.min(4, Math.max(1, Number(one(sp.seats)) || 1));

  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (date) qs.set('date', date);
  qs.set('seats', String(seats));
  qs.set('limit', '10');

  const [{ t, locale }, citiesRes, tripsRes] = await Promise.all([
    getI18n(),
    serverGet<City[] | { items: City[] }>('/v1/cities', { revalidate: 300, withCookies: false }),
    serverGet<{ items: TripSummary[]; nextCursor: string | null }>(`/v1/trips?${qs.toString()}`),
  ]);
  const cities = citiesRes.ok ? (Array.isArray(citiesRes.data) ? citiesRes.data : citiesRes.data.items) : FALLBACK_CITIES;

  const title =
    from || to
      ? fmt(t.search.resultsTitle, { from: from ? cityName(cities, from) : t.search.anyCity, to: to ? cityName(cities, to) : t.search.anyCity })
      : t.search.allTrips;

  return (
    <>
      <div className="sticky top-16 z-30 border-b border-line/70 bg-ivory/95 backdrop-blur-md">
        <div className="container-w py-3">
          <details className="group md:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-white px-4 ring-1 ring-line">
              <span className="min-w-0">
                <span className="block truncate font-display font-extrabold text-night-900">{title}</span>
                <span className="block truncate text-xs text-ink">
                  {date ? longDate(`${date}T12:00:00+01:00`, locale) : t.common.anyDate} · {fmt(t.common.seatsCount, { n: seats })}
                </span>
              </span>
              <span className="shrink-0 rounded-xl bg-green-50 px-3 py-2 text-sm font-bold text-green-700">{t.search.modify}</span>
            </summary>
            <div className="pt-3">
              <SearchForm cities={cities} initial={{ from, to, date, seats }} variant="compact" />
            </div>
          </details>
          <div className="hidden md:block">
            <SearchForm cities={cities} initial={{ from, to, date, seats }} variant="compact" />
          </div>
        </div>
      </div>

      <div className="container-w py-8">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-ink">
          {date ? longDate(`${date}T12:00:00+01:00`, locale) : t.common.anyDate} · {fmt(t.common.seatsCount, { n: seats })}
        </p>
        <SearchResults
          key={qs.toString()}
          initial={tripsRes.ok ? tripsRes.data : null}
          initialError={tripsRes.ok ? null : { code: tripsRes.code, requestId: tripsRes.requestId }}
          query={{ from, to, date, seats }}
        />
      </div>
    </>
  );
}
