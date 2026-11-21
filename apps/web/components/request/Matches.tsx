'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BellRing, Info, Trash2 } from 'lucide-react';
import type { MatchOutput } from '@waka/contracts';
import { api, type TravelRequest } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { money, shortDate, time } from '@/lib/format';
import { cityName, FALLBACK_CITIES } from '@/lib/cities';
import { RequireAuth } from '@/components/session/SessionProvider';
import { DriverChip, RouteLine } from '@/components/trip/TripBits';
import { Badge } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Notice } from '@/components/ui/States';
import { cn } from '@/lib/cn';

/** Anneau de score 0–100. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const color = s >= 75 ? '#0B7A70' : s >= 50 ? '#E3A21F' : '#9fb3c7';
  return (
    <div className="relative grid h-20 w-20 shrink-0 place-items-center" role="img" aria-label={label}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#E3E8E4" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - s / 100)}
          style={{ ['--circ' as string]: c, animation: 'ring-fill 1.2s cubic-bezier(.2,.7,.2,1) both' }}
        />
      </svg>
      <span className="tabular font-display text-2xl font-extrabold text-night-900" aria-hidden="true">
        {s}
      </span>
    </div>
  );
}

export function Matches({ requestId }: { requestId: string }) {
  return <RequireAuth>{() => <Inner requestId={requestId} />}</RequireAuth>;
}

function Inner({ requestId }: { requestId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [req, setReq] = useState<TravelRequest | null | undefined>(undefined);
  const [matches, setMatches] = useState<MatchOutput[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mine, m] = await Promise.all([api.requests.mine(), api.requests.matches(requestId)]);
      setReq(mine.find((r) => r.id === requestId) ?? null);
      setMatches(m.sort((a, b) => b.score - a.score));
    } catch (e) {
      setError(e);
    }
  }, [requestId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="container-w max-w-4xl py-10"><ErrorState error={error} onRetry={() => void load()} /></div>;
  if (!matches || req === undefined) {
    return (
      <div className="container-w max-w-4xl space-y-4 py-10" role="status" aria-busy="true">
        <div className="skeleton h-28 rounded-[2rem]" />
        <div className="skeleton h-64 rounded-[2rem]" />
        <div className="skeleton h-64 rounded-[2rem]" />
      </div>
    );
  }

  const factorLabel = (f: string) => (t.request.factors as Record<string, string>)[f] ?? f;

  return (
    <div className="container-w max-w-4xl py-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-night-900 p-6 text-ivory sm:p-8">
        <div className="pattern-ndop absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-amber-300">{t.myTrips.requests}</p>
            {req ? (
              <>
                <h1 className="mt-2 text-3xl font-extrabold">
                  {cityName(FALLBACK_CITIES, req.originCity)} → {cityName(FALLBACK_CITIES, req.destinationCity)}
                </h1>
                <p className="mt-1 text-night-200">
                  {shortDate(req.windowStart, locale)} · {time(req.windowStart, locale)}–{time(req.windowEnd, locale)} · {fmt(t.common.seatsCount, { n: req.seats })}
                  {req.maxBudgetPerSeat ? ` · ≤ ${money(req.maxBudgetPerSeat, locale)}` : ''}
                </p>
              </>
            ) : (
              <h1 className="mt-2 text-3xl font-extrabold">{t.request.matchesTitle}</h1>
            )}
          </div>
          {req && <Badge tone={req.status === 'ACTIVE' ? 'green' : 'neutral'}>{t.myTrips.requestStatus[req.status]}</Badge>}
        </div>
        <p className="mt-5 flex items-center gap-2 text-sm text-night-200">
          <BellRing className="h-4 w-4 text-amber-400" aria-hidden="true" />
          {t.request.noAuto}
        </p>
      </section>

      <h2 className="mt-10 text-2xl font-extrabold">{t.request.matchesTitle}</h2>
      <p className="mt-1 text-ink">{t.request.matchesSubtitle}</p>

      {matches.length === 0 ? (
        <EmptyState className="mt-6" title={t.request.noMatchesTitle} body={t.request.noMatchesBody} action={<ButtonLink href="/recherche" variant="secondary">{t.nav.findTrip}</ButtonLink>} />
      ) : (
        <ol className="mt-6 space-y-5">
          {matches.map((m, i) => (
            <li key={m.trip.id} className="animate-fade-up overflow-hidden rounded-[2rem] bg-white shadow-card ring-1 ring-line" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
                <ScoreRing score={m.score} label={`${t.request.score} : ${fmt(t.request.scoreOf, { n: m.score })}`} />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink">{shortDate(m.trip.departureAt, locale)}</p>
                  <div className="mt-2">
                    <RouteLine trip={m.trip} t={t} locale={locale} />
                  </div>
                </div>
                <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="sm:text-right">
                    <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink">{t.search.totalPerSeat}</p>
                    <p className="tabular font-display text-2xl font-extrabold">{money(m.trip.totalPerSeat, locale)}</p>
                  </div>
                  <ButtonLink href={`/trajets/${m.trip.id}?seats=${req?.seats ?? 1}`} size="sm">
                    {t.request.seeTrip} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </ButtonLink>
                </div>
              </div>
              <div className="border-t border-line bg-ivory/60 p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <Info className="h-4 w-4 text-green-600" aria-hidden="true" />
                    {t.request.whyTitle}
                  </h3>
                  <span className="font-mono text-xs text-ink">{fmt(t.request.algoVersion, { v: m.version })}</span>
                </div>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {m.explanations.map((ex) => (
                    <li key={ex.factor} className="rounded-2xl bg-white p-3 ring-1 ring-line/70">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{factorLabel(ex.factor)}</span>
                        <span className="text-xs text-ink">{fmt(t.request.weight, { w: Math.round(ex.weight * 100) })}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand" role="presentation">
                        <div
                          className={cn('h-full rounded-full', ex.score >= 0.75 ? 'bg-green-500' : ex.score >= 0.5 ? 'bg-amber-400' : 'bg-night-300')}
                          style={{ width: `${Math.round(ex.score * 100)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-ink">{ex.reason}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <DriverChip driver={m.trip.driver} t={t} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {req?.status === 'ACTIVE' && (
        <div className="mt-10 text-center">
          <Button variant="ghost" className="text-danger hover:bg-danger-50" onClick={() => setCancelOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t.request.cancelRequest}
          </Button>
        </div>
      )}
      {req === null && <Notice tone="amber" className="mt-6">{t.request.notFound}</Notice>}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t.request.cancelRequest}
        body={t.request.noMatchesBody}
        confirmLabel={t.request.cancelRequest}
        tone="danger"
        loading={cancelling}
        onConfirm={async () => {
          setCancelling(true);
          try {
            await api.requests.cancel(requestId);
            router.push('/mes-trajets');
          } catch (e) {
            setError(e);
          } finally {
            setCancelling(false);
            setCancelOpen(false);
          }
        }}
      />
    </div>
  );
}
