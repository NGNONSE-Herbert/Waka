'use client';

import Link from 'next/link';
import { forwardRef, useId } from 'react';
import { AlertTriangle, Info, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ApiRequestError } from '@/lib/api';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Boutons ───────────────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'night';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-strong text-white hover:bg-brand-deep shadow-sm',
  secondary: 'bg-surface text-text border border-line-strong hover:bg-muted',
  ghost: 'text-ink hover:bg-muted hover:text-text',
  danger: 'bg-surface text-danger border border-danger/40 hover:bg-danger-soft',
  night: 'bg-night text-white hover:bg-night-800',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <RefreshCw aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
});

// ─── Badges ────────────────────────────────────────────────────────────────────
export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'night';
const TONE: Record<Tone, string> = {
  neutral: 'bg-muted text-ink ring-line-strong/60',
  green: 'bg-brand-soft text-brand-deep ring-brand/25',
  amber: 'bg-amber-soft text-amber-ink ring-amber/40',
  red: 'bg-danger-soft text-danger ring-danger/25',
  blue: 'bg-info-soft text-info ring-info/20',
  violet: 'bg-violet-soft text-violet ring-violet/20',
  night: 'bg-night text-white ring-night',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  const c: Record<Tone, string> = { neutral: 'bg-ink-soft', green: 'bg-brand', amber: 'bg-amber', red: 'bg-danger', blue: 'bg-info', violet: 'bg-violet', night: 'bg-night' };
  return <span aria-hidden className={cn('inline-block size-1.5 rounded-full', c[tone])} />;
}

// ─── Surfaces ──────────────────────────────────────────────────────────────────
export function Card({ children, className, as: As = 'section', ...rest }: { children: React.ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('min-w-0 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(20,36,54,0.04)]', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, subtitle, actions, id }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({ title, eyebrow, description, actions }: { title: string; eyebrow?: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-strong">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-bold leading-tight text-text sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Notice({ tone = 'blue', title, children, icon }: { tone?: 'blue' | 'amber' | 'red' | 'green' | 'neutral'; title?: React.ReactNode; children?: React.ReactNode; icon?: React.ReactNode }) {
  const styles = {
    blue: 'border-info/20 bg-info-soft text-[#173f6e]',
    amber: 'border-amber/50 bg-amber-soft text-amber-ink',
    red: 'border-danger/25 bg-danger-soft text-danger',
    green: 'border-brand/25 bg-brand-soft text-brand-deep',
    neutral: 'border-line bg-muted text-ink',
  }[tone];
  const Icon = tone === 'red' ? ShieldAlert : tone === 'amber' ? AlertTriangle : Info;
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed', styles)}>
      <span aria-hidden className="mt-0.5 shrink-0">{icon ?? <Icon className="size-4" />}</span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
      </div>
    </div>
  );
}

// ─── États ─────────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4', className)} />;
}

export function LoadingBlock({ rows = 5, label = 'Chargement…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-5', i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6')} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title }: { error: ApiRequestError | Error; onRetry?: () => void; title?: string }) {
  const e = error as Partial<ApiRequestError>;
  if (e.status === 403) return <ForbiddenPanel detail={error.message} requestId={e.requestId ?? null} />;
  return (
    <div role="alert" className="m-4 rounded-lg border border-danger/25 bg-danger-soft/60 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger">{title ?? 'Impossible de charger les données'}</p>
          <p className="mt-1 text-sm text-text">{error.message}</p>
          <p className="mt-2 font-mono text-[12px] text-ink">
            {e.code ? <>code <span className="text-text">{e.code}</span></> : null}
            {e.status ? <> · HTTP {e.status}</> : null}
            {' · '}requestId <span className="select-all text-text">{e.requestId ?? 'non fourni'}</span>
          </p>
        </div>
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden className="size-3.5" /> Réessayer
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ForbiddenPanel({ detail, requestId, permission }: { detail?: string; requestId?: string | null; permission?: string }) {
  return (
    <div role="alert" className="m-4 flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-amber-soft text-amber-ink"><Lock aria-hidden className="size-5" /></span>
      <h2 className="mt-4 text-lg font-semibold">Accès non autorisé</h2>
      <p className="mt-1 max-w-md text-sm text-ink">
        Votre rôle ne dispose pas de la permission requise{permission ? <> (<code className="font-mono text-text">{permission}</code>)</> : null}.
        Les droits suivent le principe du moindre privilège ; demandez une habilitation à un super-admin si nécessaire.
      </p>
      {detail ? <p className="mt-2 text-[13px] text-ink">Détail API : {detail}</p> : null}
      {requestId ? <p className="mt-1 font-mono text-[12px] text-ink">requestId {requestId}</p> : null}
      <Link href="/" className="mt-5 text-sm font-medium text-brand-strong underline-offset-2 hover:underline">Retour au cockpit</Link>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon ? <span className="mb-3 grid size-10 place-items-center rounded-full bg-muted text-ink">{icon}</span> : null}
      <p className="font-medium text-text">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-ink">{children}</div> : null}
    </div>
  );
}

// ─── Formulaires ───────────────────────────────────────────────────────────────
const fieldBase = 'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-text placeholder:text-ink-soft focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:bg-muted aria-[invalid=true]:border-danger';

export function Field({ label, hint, error, children, required }: { label: string; hint?: React.ReactNode; error?: string | null; required?: boolean; children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-text">
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? <p id={hintId} className="text-[12px] text-ink">{hint}</p> : null}
      {error ? <p id={errId} className="text-[12px] font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2 leading-relaxed', className)} {...p} />;
});

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, 'h-9 pr-8', className)} {...p} />;
}

export function KeyValue({ items, cols = 2 }: { items: { k: string; v: React.ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 3 ? 'sm:grid-cols-3' : cols === 2 ? 'sm:grid-cols-2' : '')}>
      {items.map((it) => (
        <div key={it.k} className="min-w-0">
          <dt className="text-[12px] font-medium uppercase tracking-wide text-ink-soft">{it.k}</dt>
          <dd className="mt-0.5 truncate text-sm text-text">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tableau accessible : défilement horizontal au clavier (tabindex), en-têtes collants. */
export function TableWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto">
      {children}
    </div>
  );
}

export const th = 'whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-ink';
export const td = 'whitespace-nowrap px-3 py-2.5 align-middle text-[13px] text-text';
export const tr = 'border-t border-line hover:bg-ivory focus-within:bg-ivory';
