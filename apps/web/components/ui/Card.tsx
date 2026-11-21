import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('rounded-3xl bg-white shadow-card ring-1 ring-line/70', className)} />;
}

type Tone = 'green' | 'amber' | 'night' | 'neutral' | 'danger' | 'demo';
const tones: Record<Tone, string> = {
  green: 'bg-green-50 text-green-700 ring-green-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  night: 'bg-night-900 text-ivory ring-night-700',
  neutral: 'bg-sand text-night-800 ring-line',
  danger: 'bg-danger-50 text-danger ring-danger-100',
  demo: 'bg-amber-50 text-amber-800 ring-amber-300',
};

export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />;
}

export function Avatar({ name, className, tone = 'green' }: { name: string; className?: string; tone?: 'green' | 'amber' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-2xl font-display font-extrabold',
        tone === 'green' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800',
        className ?? 'h-11 w-11 text-sm',
      )}
    >
      {initials(name)}
    </span>
  );
}
