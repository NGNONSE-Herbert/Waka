import type { Metadata } from 'next';
import { CloudOff, Lock } from 'lucide-react';
import { getI18n } from '@/lib/i18n/server';
import { RetryButton } from '@/components/layout/RetryButton';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.offline.title, robots: { index: false } };
}

export default async function OfflinePage() {
  const { t } = await getI18n();
  return (
    <div className="container-w flex max-w-xl flex-col items-center py-20 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-night-900 text-amber-400">
        <CloudOff className="h-9 w-9" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold">{t.offline.title}</h1>
      <p className="mt-3 leading-relaxed text-ink">{t.offline.body}</p>
      <p className="mt-5 flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-left text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t.offline.payment}
      </p>
      <RetryButton label={t.offline.retry} />
    </div>
  );
}
