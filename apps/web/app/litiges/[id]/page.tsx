import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { DisputeView } from '@/components/booking/DisputeView';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dispute.newTitle, robots: { index: false } };
}

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DisputeView disputeId={id} />;
}
