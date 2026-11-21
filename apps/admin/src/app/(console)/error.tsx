'use client';

import { Card, ErrorState } from '@/components/ui';

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <ErrorState error={Object.assign(new Error(error.message || 'Erreur inattendue de l’interface.'), { requestId: error.digest ?? null, code: 'UI_ERROR' })} onRetry={reset} title="Cet écran a rencontré une erreur" />
    </Card>
  );
}
