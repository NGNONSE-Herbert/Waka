'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Landmark, Lock, Send } from 'lucide-react';
import { api, type Earnings as EarningsData } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { amountOnly, dateTime, money } from '@/lib/format';
import { RequireAuth } from '@/components/session/SessionProvider';
import { Badge } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

export function Earnings() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<EarningsData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    api.driver.earnings().then(setData).catch(setError);
  }, []);
  useEffect(load, [load]);

  const buckets = data
    ? [
        { label: t.driver.bucketHeld, hint: t.driver.bucketHeldHint, v: data.heldByPartner, icon: Landmark, cls: 'bg-night-900 text-ivory', accent: 'text-amber-400' },
        { label: t.driver.bucketRequested, hint: t.driver.bucketRequestedHint, v: data.releaseRequested, icon: Send, cls: 'bg-white ring-1 ring-line', accent: 'text-night-900' },
        { label: t.driver.bucketPaid, hint: t.driver.bucketPaidHint, v: data.paid, icon: CheckCircle2, cls: 'bg-green-600 text-white', accent: 'text-white' },
        { label: t.driver.bucketFrozen, hint: t.driver.bucketFrozenHint, v: data.frozenByDispute, icon: Lock, cls: 'bg-amber-50 ring-1 ring-amber-200', accent: 'text-amber-800' },
      ]
    : [];

  return (
    <div className="container-w max-w-5xl py-8">
      <Link href="/conducteur" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t.driver.title}
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold">{t.driver.earningsTitle}</h1>
      <p className="mt-2 max-w-2xl text-ink">{t.driver.earningsSubtitle}</p>

      {error ? (
        <ErrorState className="mt-6" error={error} onRetry={load} />
      ) : !data ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-40 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {buckets.map((b) => (
              <li key={b.label} className={cn('flex flex-col rounded-3xl p-5 shadow-card', b.cls)}>
                <b.icon className={cn('h-6 w-6', b.accent)} aria-hidden="true" />
                <p className="mt-4 text-sm font-semibold">{b.label}</p>
                <p className="mt-1 font-display leading-none">
                  <span className="tabular text-3xl font-extrabold">{amountOnly(b.v, locale)}</span>
                  <span className="ml-1 text-sm font-bold">FCFA</span>
                </p>
                <p className="mt-3 text-xs opacity-80">{b.hint}</p>
              </li>
            ))}
          </ul>

          <section className="mt-10" aria-labelledby="hist">
            <h2 id="hist" className="text-xl font-extrabold">
              {t.driver.history}
            </h2>
            {data.items.length === 0 ? (
              <EmptyState className="mt-4" title={t.driver.noEarnings} illustration={false} />
            ) : (
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-3xl bg-white ring-1 ring-line">
                {data.items.map((it) => (
                  <li key={it.bookingId + it.updatedAt} className="flex flex-wrap items-center gap-3 p-4 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{it.tripLabel}</p>
                      <p className="text-xs text-ink">{dateTime(it.updatedAt, locale)}</p>
                    </div>
                    <Badge tone={it.paymentState === 'PAID' ? 'green' : it.paymentState === 'FROZEN_DISPUTE' ? 'amber' : 'neutral'}>
                      {(t.paymentState as Record<string, string>)[it.paymentState] ?? it.label}
                    </Badge>
                    <p className="tabular w-28 text-right font-display font-extrabold">{money(it.amount, locale)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
