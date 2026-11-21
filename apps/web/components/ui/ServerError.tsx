'use client';
import { useRouter } from 'next/navigation';
import { ErrorState } from './States';

/** Erreur issue d’un chargement serveur, avec bouton « Réessayer » (router.refresh). */
export function ServerError({ code, requestId, className }: { code: string; requestId: string | null; className?: string }) {
  const router = useRouter();
  return <ErrorState code={code} requestId={requestId} onRetry={() => router.refresh()} className={className} />;
}
