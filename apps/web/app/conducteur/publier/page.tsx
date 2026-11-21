import type { Metadata } from 'next';
import type { City } from '@waka/contracts';
import { getI18n } from '@/lib/i18n/server';
import { serverGet } from '@/lib/api-server';
import { FALLBACK_CITIES } from '@/lib/cities';
import { PublishTrip } from '@/components/driver/PublishTrip';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.driver.publishTitle };
}

export default async function PublishPage() {
  const r = await serverGet<City[] | { items: City[] }>('/v1/cities', { revalidate: 300, withCookies: false });
  const cities = r.ok ? (Array.isArray(r.data) ? r.data : r.data.items) : FALLBACK_CITIES;
  return <PublishTrip cities={cities} />;
}
