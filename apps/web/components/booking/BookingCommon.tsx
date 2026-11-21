'use client';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BookingOutput } from '@waka/contracts';
import { remaining } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Étapes du parcours d’achat : Réservation → Paiement → Billet. */
export function PurchaseSteps({ current, labels, ariaLabel }: { current: 0 | 1 | 2; labels: [string, string, string]; ariaLabel: string }) {
  return (
    <ol className="flex items-center gap-2" aria-label={ariaLabel}>
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold transition',
                done && 'bg-green-600 text-white',
                active && 'bg-amber-400 text-night-900 ring-4 ring-amber-400/25',
                !done && !active && 'bg-white/10 text-night-300 ring-1 ring-white/20',
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn('truncate text-sm font-semibold', active ? 'text-ivory' : 'text-night-300')}>{label}</span>
            {i < labels.length - 1 && <span className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-green-500' : 'bg-white/15')} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Compte à rebours mis à jour chaque seconde. */
export function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? remaining(target, now) : null;
}

/** Ordre des états pour la frise du billet. */
export const BOOKING_PROGRESS: Record<BookingOutput['state'], number> = {
  DRAFT: 0,
  SEAT_HELD: 0,
  PAYMENT_PENDING: 0,
  CONFIRMED: 1,
  CHECKED_IN: 2,
  IN_PROGRESS: 3,
  ARRIVAL_REPORTED: 4,
  COMPLETED: 5,
  DISPUTED: 4,
  CANCELLED: -1,
};
