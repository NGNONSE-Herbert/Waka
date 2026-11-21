'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Me } from '@waka/contracts';
import { api, isApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { Spinner } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';

type Status = 'loading' | 'authenticated' | 'anonymous' | 'error';
interface SessionCtx {
  me: Me | null;
  status: Status;
  error: unknown;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx>({
  me: null,
  status: 'loading',
  error: null,
  refresh: async () => null,
  signOut: async () => {},
});

/** Session côté client : `GET /v1/me` (cookie httpOnly géré par l’API). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api.auth.me();
      setMe(m);
      setStatus('authenticated');
      setError(null);
      return m;
    } catch (e) {
      setMe(null);
      if (isApiError(e) && (e.status === 401 || e.status === 403)) {
        setStatus('anonymous');
        setError(null);
      } else {
        setStatus('error');
        setError(e);
      }
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* déconnexion locale quoi qu’il arrive */
    }
    setMe(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ me, status, error, refresh, signOut }), [me, status, error, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** URL de connexion avec retour à la page courante après OTP. */
export function loginHref(next: string) {
  return `/connexion?next=${encodeURIComponent(next)}`;
}

/** Garde : redirige vers /connexion?next=… si non connecté. */
export function RequireAuth({ children, fallback }: { children: (me: Me) => ReactNode; fallback?: ReactNode }) {
  const { me, status, error, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  useEffect(() => {
    if (status === 'anonymous') {
      const qs = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(loginHref(pathname + qs));
    }
  }, [status, router, pathname]);

  if (status === 'authenticated' && me) return <>{children(me)}</>;
  if (status === 'error') return <ErrorState error={error} onRetry={() => void refresh()} />;
  return (
    fallback ?? (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-ink" role="status">
        <Spinner className="h-5 w-5 text-green-600" />
        {t.common.loading}
      </div>
    )
  );
}
