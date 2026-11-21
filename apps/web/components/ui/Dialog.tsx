'use client';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { Button } from './Button';
import { cn } from '@/lib/cn';

/** Dialogue de confirmation accessible (Radix) — feuille en bas sur mobile, centré sur desktop. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  loading,
  tone = 'primary',
  children,
  icon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  tone?: 'primary' | 'danger' | 'amber';
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} icon={icon}>
      <div className="text-[0.95rem] leading-relaxed text-ink">{body}</div>
      {children}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <RD.Close asChild>
          <Button variant="secondary">{t.common.cancel}</Button>
        </RD.Close>
        <Button variant={tone} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  icon,
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-night-950/60 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
        <RD.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] bg-ivory p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-lift outline-none',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[2rem]',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
            'data-[state=open]:animate-[fade-up_0.25s_ease-out]',
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-night-200 sm:hidden" aria-hidden="true" />
          <div className="mb-3 flex items-start gap-3">
            {icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800">{icon}</span>}
            <RD.Title className="flex-1 pt-1.5 font-display text-xl font-extrabold text-night-900">{title}</RD.Title>
            <RD.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-ink hover:bg-sand" aria-label={t.common.close}>
              <X className="h-5 w-5" aria-hidden="true" />
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
