import { cn } from '@/lib/cn';

/**
 * Pictogramme Waka : deux sièges stylisés reliés par une route sinueuse (ligne médiane ambre).
 * Création originale, géométrique. `tone` adapte les couleurs au fond.
 */
export function LogoMark({ className, tone = 'light', title }: { className?: string; tone?: 'light' | 'dark'; title?: string }) {
  const seat = tone === 'dark' ? '#F8FAF8' : '#142436';
  const bg = tone === 'dark' ? '#0E8F83' : '#E8F6F4';
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="48" height="48" rx="14" fill={bg} />
      {/* route */}
      <path d="M15 27.5c8 0 7.5-9 18-9" fill="none" stroke={tone === 'dark' ? '#142436' : '#0E8F83'} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M15 27.5c8 0 7.5-9 18-9" fill="none" stroke="#F5B942" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.2 2.8" />
      {/* siège gauche (dossier + assise) */}
      <path d="M8.5 15.5a2.5 2.5 0 0 1 5 0v9h3.5a2.5 2.5 0 0 1 0 5h-6a2.5 2.5 0 0 1-2.5-2.5z" fill={seat} />
      {/* siège droit (miroir) */}
      <path d="M39.5 32.5a2.5 2.5 0 0 1-5 0v-9H31a2.5 2.5 0 0 1 0-5h6a2.5 2.5 0 0 1 2.5 2.5z" fill={seat} />
    </svg>
  );
}

export function Logo({ className, tone = 'light', compact = false }: { className?: string; tone?: 'light' | 'dark'; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="h-9 w-9 shrink-0" tone={tone} />
      {!compact && (
        <span className={cn('font-display text-[1.6rem] font-extrabold leading-none tracking-[-0.04em]', tone === 'dark' ? 'text-ivory' : 'text-night-900')}>
          waka<span className="text-amber-400">.</span>
        </span>
      )}
    </span>
  );
}
