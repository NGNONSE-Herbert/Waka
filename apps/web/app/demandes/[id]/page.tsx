import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { Matches } from '@/components/request/Matches';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.request.matchesTitle, robots: { index: false } };
}

export default async function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Matches requestId={id} />;
}
