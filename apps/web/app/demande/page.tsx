import type { Metadata } from 'next';
import type { City } from '@waka/contracts';
import { getI18n } from '@/lib/i18n/server';
import { serverGet } from '@/lib/api-server';
import { FALLBACK_CITIES } from '@/lib/cities';
import { RequestForm } from '@/components/request/RequestForm';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.request.title };
}

export default async function RequestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [sp, { t }, r] = await Promise.all([searchParams, getI18n(), serverGet<City[] | { items: City[] }>('/v1/cities', { revalidate: 300, withCookies: false })]);
  const cities = r.ok ? (Array.isArray(r.data) ? r.data : r.data.items) : FALLBACK_CITIES;
  return (
    <>
      <section className="relative isolate overflow-hidden bg-night-900 pb-24 pt-10 text-ivory">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-green-500/25 blur-3xl" aria-hidden="true" />
        <div className="container-w max-w-3xl">
          <h1 className="text-4xl font-extrabold sm:text-5xl">{t.request.title}</h1>
          <p className="mt-3 max-w-2xl text-lg text-night-200">{t.request.subtitle}</p>
        </div>
      </section>
      <div className="container-w relative z-10 -mt-16 max-w-3xl pb-12">
        <RequestForm
          cities={cities}
          initial={{ from: sp.from, to: sp.to, date: sp.date, seats: Number(sp.seats) || 1 }}
        />
      </div>
    </>
  );
}
