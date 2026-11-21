import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { TicketView } from '@/components/booking/TicketView';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.ticket.title, robots: { index: false } };
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketView bookingId={id} />;
}
