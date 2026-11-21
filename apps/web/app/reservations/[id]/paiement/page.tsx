import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { PaymentFlow } from '@/components/booking/PaymentFlow';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.payment.title, robots: { index: false } };
}

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentFlow bookingId={id} />;
}
