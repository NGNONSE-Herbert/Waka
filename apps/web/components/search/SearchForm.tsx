'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ArrowRight, CalendarDays, MapPin, Navigation, Search, Users } from 'lucide-react';
import type { City } from '@waka/contracts';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/client';
import { todayInDouala } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface SearchValues {
  from?: string;
  to?: string;
  date?: string;
  seats?: number;
}

const ctl =
  'peer block w-full min-h-14 appearance-none rounded-2xl border-0 bg-ivory pl-11 pr-3 pt-5 pb-1.5 text-[0.98rem] font-semibold text-night-900 ring-1 ring-inset ring-line transition focus:bg-white focus:ring-2 focus:ring-green-500';

function Labeled({ id, label, icon, children, className }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <label htmlFor={id} className="pointer-events-none absolute left-11 top-2 z-10 text-[0.68rem] font-bold uppercase tracking-wider text-ink">
        {label}
      </label>
      <span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-green-600">{icon}</span>
      {children}
    </div>
  );
}

const heroCtl =
  'block h-16 w-full min-w-0 appearance-none rounded-[20px] border-0 bg-ivory px-5 pb-1.5 pt-6 text-lg font-bold text-night-950 ring-1 ring-inset ring-line transition focus:bg-white focus:ring-2 focus:ring-green-500';

function HeroField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="pointer-events-none absolute left-5 top-2.5 z-10 text-[0.8125rem] font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Recherche instantanée : départ ⇄ destination, date, places → /recherche. */
export function SearchForm({ cities, initial, variant = 'hero' }: { cities: City[]; initial?: SearchValues; variant?: 'hero' | 'compact' }) {
  const { t } = useI18n();
  const router = useRouter();
  const [from, setFrom] = useState(initial?.from ?? '');
  const [to, setTo] = useState(initial?.to ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [seats, setSeats] = useState(initial?.seats ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (from && to && from === to) {
      setError(t.search.sameCity);
      return;
    }
    setError(null);
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (date) qs.set('date', date);
    qs.set('seats', String(seats));
    router.push(`/recherche?${qs.toString()}`);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setSpin((s) => !s);
  };

  if (variant === 'hero') {
    return (
      <form onSubmit={submit} role="search" aria-label={t.search.title} noValidate className="flex flex-col gap-4">
        <div className="grid gap-3">
          <div className="relative grid gap-3 sm:grid-cols-2">
            <HeroField id="h-from" label={t.common.from}>
              <select id="h-from" className={heroCtl} value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'h-err' : undefined}>
                <option value="">{t.search.anyCity}</option>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </HeroField>
            <HeroField id="h-to" label={t.common.to}>
              <select id="h-to" className={heroCtl} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'h-err' : undefined}>
                <option value="">{t.search.anyCity}</option>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </HeroField>
            <button
              type="button"
              onClick={swap}
              aria-label={t.common.swap}
              className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-amber-400 text-night-950 transition hover:bg-amber-500 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
            >
              <ArrowLeftRight className={cn('h-[18px] w-[18px] rotate-90 transition-transform duration-500 sm:rotate-0', spin && 'rotate-[270deg] sm:rotate-180')} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <HeroField id="h-date" label={t.common.date}>
              <input id="h-date" type="date" className={heroCtl} value={date} min={todayInDouala()} onChange={(e) => setDate(e.target.value)} />
            </HeroField>
            <HeroField id="h-seats" label={t.search.seatsLabel}>
              <select id="h-seats" className={heroCtl} value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {fmt(n > 1 ? t.landing.seatMany : t.landing.seatOne, { n })}
                  </option>
                ))}
              </select>
            </HeroField>
          </div>
        </div>
        {error && (
          <p id="h-err" role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="flex h-16 items-center justify-between gap-3 rounded-full bg-night-900 pl-7 pr-2.5 font-display text-[1.1875rem] font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-night-800"
        >
          {t.landing.searchCta}
          <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-400 text-night-950">
            <ArrowRight className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </span>
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} role="search" aria-label={t.search.title} noValidate>
      <div
        className="grid grid-cols-2 gap-2.5 md:grid-cols-[1fr_auto_1fr_0.8fr_0.55fr_auto] md:items-center"
      >
        <Labeled id="c-from" label={t.common.from} icon={<Navigation className="h-4.5 w-4.5" aria-hidden="true" />} className="col-span-2 md:col-span-1">
          <select id="c-from" className={ctl} value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'c-err' : undefined}>
            <option value="">{t.search.anyCity}</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Labeled>

        <div className="relative col-span-2 -my-4 flex justify-center md:col-span-1 md:my-0">
          <button
            type="button"
            onClick={swap}
            aria-label={t.common.swap}
            className="z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-green-700 shadow-card ring-1 ring-line transition duration-300 hover:bg-green-50"
          >
            <ArrowLeftRight className={cn('h-4.5 w-4.5 rotate-90 transition-transform duration-500 md:rotate-0', spin && 'rotate-[270deg] md:rotate-180')} aria-hidden="true" />
          </button>
        </div>

        <Labeled id="c-to" label={t.common.to} icon={<MapPin className="h-4.5 w-4.5" aria-hidden="true" />} className="col-span-2 md:col-span-1">
          <select id="c-to" className={ctl} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'c-err' : undefined}>
            <option value="">{t.search.anyCity}</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Labeled>

        <Labeled id="c-date" label={t.common.date} icon={<CalendarDays className="h-4.5 w-4.5" aria-hidden="true" />}>
          <input id="c-date" type="date" className={cn(ctl, 'pr-2')} value={date} min={todayInDouala()} onChange={(e) => setDate(e.target.value)} />
        </Labeled>

        <Labeled id="c-seats" label={t.search.seatsLabel} icon={<Users className="h-4.5 w-4.5" aria-hidden="true" />}>
          <select id="c-seats" className={ctl} value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Labeled>

        <Button type="submit" variant="primary" size="lg" className="col-span-2 min-h-14 w-full md:col-span-1 md:w-auto">
          {t.search.submit}
          <Search className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p id="c-err" role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
