import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'amber' | 'secondary' | 'ghost' | 'dark' | 'danger' | 'onDark';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-display font-bold tracking-[-0.01em] transition duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-night-900 text-white hover:bg-night-800',
  amber: 'bg-amber-400 text-night-950 hover:bg-amber-500',
  secondary: 'bg-white text-night-950 ring-1 ring-inset ring-green-200 hover:bg-ivory',
  ghost: 'text-green-700 hover:bg-green-50',
  dark: 'bg-night-900 text-ivory hover:bg-night-800',
  danger: 'bg-danger text-white hover:brightness-110',
  onDark: 'bg-white/10 text-ivory ring-1 ring-inset ring-white/20 hover:bg-white/15',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-4 text-sm',
  md: 'min-h-12 px-5 text-[0.95rem]',
  lg: 'min-h-14 px-7 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={buttonClass(variant, size, className)}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link {...props} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
