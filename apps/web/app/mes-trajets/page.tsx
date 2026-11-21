import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { MyTrips } from '@/components/booking/MyTrips';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.myTrips.title, robots: { index: false } };
}

export default function MyTripsPage() {
  return <MyTrips />;
}
