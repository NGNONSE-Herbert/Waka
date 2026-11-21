'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiRequestError } from './api';

export interface ApiState<T> {
  data: T | undefined;
  error: ApiRequestError | null;
  loading: boolean;
  reload: () => void;
}

/** Récupération simple, annulable, rechargeable. `path` null ⇒ aucune requête. */
export function useApi<T = unknown>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<T>(path, { signal: ctrl.signal })
      .then((d) => {
        if (!ctrl.signal.aborted) setData(d);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, 'CLIENT_ERROR', (e as Error).message, null));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
