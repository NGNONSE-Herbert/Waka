import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Me } from './api';

type Session = { user: Me | null; ready: boolean; setUser: (u: Me | null) => void; refresh: () => Promise<void>; logout: () => Promise<void> };

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch (e) {
      if (e instanceof ApiError && e.isAuth) setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ user, ready, setUser, refresh, logout }), [user, ready, refresh, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession hors de SessionProvider');
  return v;
}
