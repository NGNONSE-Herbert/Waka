import 'server-only';
import { cookies } from 'next/headers';

/** Appel API côté serveur (Server Components) — direct vers API_URL, en relayant les cookies du visiteur. */
const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; requestId: string | null };

export async function serverGet<T>(path: string, opts: { revalidate?: number; withCookies?: boolean } = {}): Promise<ServerResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.withCookies !== false) {
    const jar = await cookies();
    const c = jar.getAll().map((x) => `${x.name}=${x.value}`).join('; ');
    if (c) headers.Cookie = c;
  }
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers,
      ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: 'no-store' as const }),
      signal: AbortSignal.timeout(8000),
    });
    const requestId = res.headers.get('x-request-id');
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string; requestId?: string } } | null)?.error;
      return { ok: false, status: res.status, code: e?.code ?? `HTTP_${res.status}`, message: e?.message ?? res.statusText, requestId: e?.requestId ?? requestId };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, code: 'API_UNAVAILABLE', message: 'API unreachable', requestId: null };
  }
}
