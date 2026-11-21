'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/** Panneau latéral accessible (piège de focus, Échap, retour du focus) — Radix Dialog. */
export function Drawer({ open, onOpenChange, title, description, children, footer }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-night/40" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-surface shadow-2xl focus:outline-none"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg font-bold text-text">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-[13px] text-ink">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-ink hover:bg-muted" aria-label="Fermer">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-line bg-ivory px-5 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Boîte de dialogue modale centrée (formulaires d'action). */
export function Modal({ open, onOpenChange, title, description, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-night/40" />
        <Dialog.Content {...(description ? {} : { 'aria-describedby': undefined })} className="fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[calc(100vw-2rem)] max-w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg font-bold text-text">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-[13px] text-ink">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-ink hover:bg-muted" aria-label="Fermer">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
