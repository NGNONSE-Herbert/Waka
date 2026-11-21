import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { DriverHome } from '@/components/driver/DriverHome';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.driver.title };
}

export default function DriverPage() {
  return <DriverHome />;
}
