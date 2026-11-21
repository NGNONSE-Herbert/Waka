'use client';
import { useEffect } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TechDetails } from '@/components/ui/States';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-w flex max-w-xl flex-col items-center py-20 text-center" role="alert">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-danger-50 text-danger">
        <AlertTriangle className="h-9 w-9" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold">{t.errors.title}</h1>
      <p className="mt-3 text-ink">{t.errors.body}</p>
      {error.digest && <TechDetails code="RENDER_ERROR" requestId={error.digest} />}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t.common.retry}
        </Button>
        <ButtonLink href="/" variant="secondary">
          <Home className="h-4 w-4" aria-hidden="true" />
          {t.errors.home}
        </ButtonLink>
      </div>
    </div>
  );
}
