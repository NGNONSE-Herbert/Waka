import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { Earnings } from '@/components/driver/Earnings';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.driver.earningsTitle, robots: { index: false } };
}

export default function EarningsPage() {
  return <Earnings />;
}
