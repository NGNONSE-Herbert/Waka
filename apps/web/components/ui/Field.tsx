import type { ComponentProps, ReactNode } from 'react';
import { forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export const inputClass =
  'block w-full min-h-12 rounded-2xl border-0 bg-white px-4 text-base text-night-900 ring-1 ring-inset ring-line placeholder:text-ink-soft transition focus:ring-2 focus:ring-green-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger disabled:bg-sand';

/** Champ accessible : libellé, aide et erreur reliés par aria-describedby (voir `describedBy`). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  optionalLabel,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
  optionalLabel?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-night-900">
        <span>{label}</span>
        {optionalLabel && <span className="text-xs font-normal text-ink">{optionalLabel}</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-ink">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Calcule aria-describedby (aide + erreur). */
export function describedBy(id: string, error?: unknown, hint?: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn(inputClass, className)} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<'select'>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} {...props} className={cn(inputClass, 'cursor-pointer appearance-none pr-10', className)}>
        {children}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink" aria-hidden="true">
        <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} className={cn(inputClass, 'min-h-28 py-3', className)} />;
});

/** Case à cocher avec grande zone tactile. */
export const Checkbox = forwardRef<HTMLInputElement, Omit<ComponentProps<'input'>, 'id'> & { id: string; label: ReactNode; error?: string | undefined }>(
  function Checkbox({ label, error, id, className, ...props }, ref) {
    return (
      <div className={className}>
        <div className="flex min-h-11 items-start gap-3 rounded-2xl p-1 text-sm leading-relaxed text-night-800">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md accent-green-600"
            {...props}
          />
          <label htmlFor={id} className="cursor-pointer">
            {label}
          </label>
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="ml-9 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);

/** Interrupteur (case à cocher native, stylée). */
export const Toggle = forwardRef<HTMLInputElement, Omit<ComponentProps<'input'>, 'id'> & { id: string; label: ReactNode; icon?: ReactNode }>(
  function Toggle({ label, icon, id, className, ...props }, ref) {
    return (
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white px-4 ring-1 ring-inset ring-line transition has-[:checked]:ring-2 has-[:checked]:ring-green-500 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber-400 has-[:focus-visible]:outline',
          className,
        )}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-night-900">
          {icon}
          {label}
        </span>
        <input ref={ref} id={id} type="checkbox" className="peer sr-only" {...props} />
        <span
          aria-hidden="true"
          className="relative h-6 w-11 shrink-0 rounded-full bg-night-200 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-green-600 peer-checked:after:translate-x-5"
        />
      </label>
    );
  },
);
