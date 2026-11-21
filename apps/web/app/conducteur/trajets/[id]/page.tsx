import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getI18n } from '@/lib/i18n/server';
import { TripManage } from '@/components/driver/TripManage';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.driver.tripManageTitle, robots: { index: false } };
}

export default async function TripManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <TripManage tripId={id} />
    </Suspense>
  );
}
