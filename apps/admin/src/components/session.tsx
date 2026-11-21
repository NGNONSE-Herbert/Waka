'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { callAdmin, SESSION_EXPIRED_EVENT, ApiRequestError } from '@/lib/api';
import { normalizeMe, type StaffMe } from '@/lib/models';
import { canSee, SCREEN_PERMS, type ScreenKey } from '@/lib/permissions';
import { ErrorState, ForbiddenPanel, Skeleton } from './ui';

interface SessionValue {
  me: StaffMe;
  logout: () => Promise<void>;
  refresh: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession hors SessionProvider');
  return v;
}

function loginUrl(pathname: string, reason: 'expired' | 'required') {
  const next = pathname && pathname !== '/login' ? `&next=${encodeURIComponent(pathname)}` : '';
  return `/login?reason=${reason}${next}`;
}

export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<StaffMe | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    callAdmin('me', { signal: ctrl.signal, silent401: true })
      .then((raw) => {
        const m = normalizeMe(raw);
        if (!m) throw new ApiRequestError(500, 'UNEXPECTED_SHAPE', 'Réponse /v1/admin/me inattendue (identifiant absent).', null);
        setMe(m);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) {
          router.replace(loginUrl(pathname, 'required'));
          return;
        }
        setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'CLIENT_ERROR', String(e), null));
      });
    return () => ctrl.abort();
    // pathname volontairement exclu : on ne recharge pas la session à chaque navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, router]);

  useEffect(() => {
    const onExpired = () => router.replace(loginUrl(window.location.pathname, 'expired'));
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await callAdmin('logout', { silent401: true });
    } catch {
      // La session est de toute façon abandonnée côté client.
    }
    router.replace('/login?reason=logout');
  }, [router]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const value = useMemo(() => (me ? { me, logout, refresh } : null), [me, logout, refresh]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl pt-24">
        <ErrorState error={error} onRetry={refresh} title="Session indisponible" />
      </div>
    );
  }
  if (!value) {
    return (
      fallback ?? (
        <div role="status" className="grid min-h-dvh place-items-center">
          <span className="sr-only">Vérification de la session…</span>
          <Skeleton className="h-6 w-48" />
        </div>
      )
    );
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Garde d'écran : affiche une page 403 explicite plutôt que des données vides. */
export function RequireScreen({ screen, children }: { screen: ScreenKey; children: React.ReactNode }) {
  const { me } = useSession();
  if (!canSee(me.roles, screen)) return <ForbiddenPanel permission={SCREEN_PERMS[screen].join(' ou ')} />;
  return <>{children}</>;
}
