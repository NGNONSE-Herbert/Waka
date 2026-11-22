import { cn } from '@/lib/cn';

/** Pictogramme Waka (design Canopée) : deux points reliés par une route. `tone` adapte les couleurs au fond. */
export function LogoMark({ className, tone = 'light', title }: { className?: string; tone?: 'light' | 'dark'; title?: string }) {
  const bg = tone === 'dark' ? '#D9F27B' : '#0B1F17';
  const fg = tone === 'dark' ? '#0B1F17' : '#D9F27B';
  return (
    <svg viewBox="0 0 38 38" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <circle cx="19" cy="19" r="19" fill={bg} />
      <path d="M11 26 C11 16 27 22 27 12" stroke={fg} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="11" cy="26" r="3.4" fill={fg} />
      <circle cx="27" cy="12" r="3.4" fill={fg} />
    </svg>
  );
}

export function Logo({ className, tone = 'light', compact = false }: { className?: string; tone?: 'light' | 'dark'; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-[38px] w-[38px] shrink-0" tone={tone} />
      {!compact && (
        <span className={cn('font-display text-[1.75rem] font-extrabold leading-none tracking-[-0.03em]', tone === 'dark' ? 'text-white' : 'text-night-950')}>waka</span>
      )}
    </span>
  );
}
