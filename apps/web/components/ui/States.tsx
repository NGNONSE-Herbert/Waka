'use client';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw, WifiOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { errorMessage } from '@/lib/i18n';
import { isApiError } from '@/lib/api';
import { EmptyRoad } from '@/components/brand/Illustrations';
import { Button } from './Button';
import { cn } from '@/lib/cn';

export function EmptyState({
  title,
  body,
  action,
  className,
  illustration = true,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  illustration?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-3xl bg-white px-6 py-10 text-center ring-1 ring-line/70', className)}>
      {illustration && <EmptyRoad className="mb-4 h-28 w-44" />}
      <h2 className="text-xl font-extrabold text-night-900">{title}</h2>
      {body && <p className="mt-2 max-w-md text-[0.95rem] leading-relaxed text-ink">{body}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

/** Erreur lisible : message traduit + détails techniques (code, requestId copiable). */
export function ErrorState({
  error,
  code,
  requestId,
  onRetry,
  className,
  compact,
}: {
  error?: unknown;
  code?: string | null;
  requestId?: string | null;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const c = code ?? (isApiError(error) ? error.code : null);
  const rid = requestId ?? (isApiError(error) ? error.requestId : null);
  const network = c === 'NETWORK_ERROR' || c === 'API_UNAVAILABLE';
  const Icon = network ? WifiOff : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'rounded-3xl bg-danger-50 ring-1 ring-danger-100',
        compact ? 'flex items-start gap-3 p-4 text-left' : 'flex flex-col items-center px-6 py-10 text-center',
        className,
      )}
    >
      <span className={cn('grid shrink-0 place-items-center rounded-2xl bg-white text-danger', compact ? 'h-9 w-9' : 'mb-3 h-12 w-12')}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className={cn(compact ? 'min-w-0 flex-1' : 'flex flex-col items-center')}>
        <p className={cn('font-semibold text-night-900', compact ? 'text-sm' : 'text-base')}>{errorMessage(t, c)}</p>
        {(c || rid) && <TechDetails code={c} requestId={rid} />}
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} className={compact ? 'mt-3' : 'mt-5'}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t.common.retry}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TechDetails({ code, requestId }: { code?: string | null; requestId?: string | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <details className="mt-2 text-xs text-ink">
      <summary className="inline-flex min-h-8 cursor-pointer items-center underline decoration-dotted underline-offset-2">{t.common.errorDetails}</summary>
      <div className="mt-1 space-y-1 text-left font-mono">
        {code && <div>code : {code}</div>}
        {requestId && (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {t.common.requestId} : {requestId}
            </span>
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 font-sans font-semibold text-green-700 hover:bg-white"
              onClick={() => {
                void navigator.clipboard?.writeText(requestId).then(() => setCopied(true));
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? t.common.copied : t.common.copy}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

/** Petite notification inline (succès / info). */
export function Notice({ tone = 'green', children, className, icon }: { tone?: 'green' | 'amber' | 'night'; children: ReactNode; className?: string; icon?: ReactNode }) {
  const tones = {
    green: 'bg-green-50 text-green-900 ring-green-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    night: 'bg-night-900 text-ivory ring-night-700',
  };
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed ring-1 ring-inset', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
