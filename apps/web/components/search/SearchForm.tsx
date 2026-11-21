'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ArrowRight, CalendarDays, MapPin, Navigation, Search, Users } from 'lucide-react';
import type { City } from '@waka/contracts';
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
  const idp = variant === 'hero' ? 'h' : 'c';

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

  return (
    <form onSubmit={submit} role="search" aria-label={t.search.title} noValidate>
      <div
        className={cn(
          'grid gap-2.5',
          variant === 'hero'
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_0.8fr_0.55fr_auto] lg:items-center'
            : 'grid-cols-2 md:grid-cols-[1fr_auto_1fr_0.8fr_0.55fr_auto] md:items-center',
        )}
      >
        <Labeled id={`${idp}-from`} label={t.common.from} icon={<Navigation className="h-4.5 w-4.5" aria-hidden="true" />} className={variant === 'compact' ? 'col-span-2 md:col-span-1' : ''}>
          <select id={`${idp}-from`} className={ctl} value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${idp}-err` : undefined}>
            <option value="">{t.search.anyCity}</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Labeled>

        <div className={cn('relative flex justify-center', variant === 'hero' ? 'sm:hidden lg:flex' : 'col-span-2 -my-4 md:col-span-1 md:my-0')}>
          <button
            type="button"
            onClick={swap}
            aria-label={t.common.swap}
            className={cn(
              'z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-green-700 shadow-card ring-1 ring-line transition duration-300 hover:bg-green-50',
              variant === 'hero' && '-my-4 lg:my-0',
            )}
          >
            <ArrowLeftRight className={cn('h-4.5 w-4.5 rotate-90 transition-transform duration-500 lg:rotate-0', spin && 'rotate-[270deg] lg:rotate-180')} aria-hidden="true" />
          </button>
        </div>

        <Labeled id={`${idp}-to`} label={t.common.to} icon={<MapPin className="h-4.5 w-4.5" aria-hidden="true" />} className={variant === 'compact' ? 'col-span-2 md:col-span-1' : ''}>
          <select id={`${idp}-to`} className={ctl} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${idp}-err` : undefined}>
            <option value="">{t.search.anyCity}</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Labeled>

        <Labeled id={`${idp}-date`} label={t.common.date} icon={<CalendarDays className="h-4.5 w-4.5" aria-hidden="true" />}>
          <input id={`${idp}-date`} type="date" className={cn(ctl, 'pr-2')} value={date} min={todayInDouala()} onChange={(e) => setDate(e.target.value)} />
        </Labeled>

        <Labeled id={`${idp}-seats`} label={t.search.seatsLabel} icon={<Users className="h-4.5 w-4.5" aria-hidden="true" />}>
          <select id={`${idp}-seats`} className={ctl} value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Labeled>

        <Button
          type="submit"
          variant={variant === 'hero' ? 'amber' : 'primary'}
          size="lg"
          className={cn('min-h-14 w-full', variant === 'hero' ? 'sm:col-span-2 lg:col-span-1 lg:w-auto' : 'col-span-2 md:col-span-1 md:w-auto')}
        >
          {variant === 'hero' ? <Search className="h-5 w-5" aria-hidden="true" /> : null}
          {variant === 'hero' ? t.landing.searchCta : t.search.submit}
          {variant === 'hero' ? <ArrowRight className="h-5 w-5 lg:hidden" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
        </Button>
      </div>
      {error && (
        <p id={`${idp}-err`} role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
