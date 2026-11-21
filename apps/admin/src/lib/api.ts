import { CSRF_HEADER, ROUTES } from '@waka/contracts';

/**
 * Client HTTP de la console. Toutes les requêtes passent par le proxy même-origine `/api` → API.
 * - Cookie `waka_admin` (HttpOnly) posé par l'API : jamais lu par le JS.
 * - En-tête anti-CSRF `X-Waka-Request: 1` sur toute requête mutante.
 * - 401 ⇒ événement `waka:session-expired` (le shell redirige vers /login).
 */
export const API_PREFIX = '/api';
export const SESSION_EXPIRED_EVENT = 'waka:session-expired';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, requestId: string | null, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export type AdminRouteKey = keyof typeof ROUTES.admin;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Transforme `'POST /v1/admin/disputes/:id/assign'` + `{ id }` en `{ method, path }`. */
export function resolveRoute(spec: string, params: Record<string, string> = {}): { method: Method; path: string } {
  const [method, rawPath] = spec.split(' ') as [Method, string];
  const path = rawPath.replace(/:([A-Za-z]+)/g, (_m, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`Paramètre de route manquant : ${k}`);
    return encodeURIComponent(v);
  });
  return { method, path };
}

export function buildQuery(query: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function adminRoute(key: AdminRouteKey, params?: Record<string, string>, query?: Record<string, string | undefined | null>) {
  const r = resolveRoute(ROUTES.admin[key], params);
  return { method: r.method, path: r.path + (query ? buildQuery(query) : '') };
}

/** Chemin GET d'une route admin (pour `useApi`). */
export function adminPath(key: AdminRouteKey, params?: Record<string, string>, query?: Record<string, string | undefined | null>): string {
  return adminRoute(key, params, query).path;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
  /** Ne pas déclencher la redirection de session (ex. écran de login). */
  silent401?: boolean;
}

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  const mutating = MUTATING.has(method);
  // Les requêtes mutantes portent toujours un corps JSON (au minimum `{}`) et l'en-tête anti-CSRF.
  const body = opts.body !== undefined ? JSON.stringify(opts.body) : mutating ? '{}' : undefined;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (mutating) headers[CSRF_HEADER] = '1';

  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'API injoignable. Vérifiez que le service est démarré (port 4000).', null);
  }

  const requestId = res.headers.get('x-request-id');
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; requestId?: string; details?: Record<string, unknown> } } | null)?.error;
    const code = err?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : res.status === 403 ? 'FORBIDDEN' : `HTTP_${res.status}`);
    const message = err?.message ?? defaultMessage(res.status);
    const error = new ApiRequestError(res.status, code, message, err?.requestId ?? requestId, err?.details);
    if (res.status === 401 && !opts.silent401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw error;
  }
  return json as T;
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Session expirée ou absente.';
  if (status === 403) return 'Permission insuffisante pour cette action.';
  if (status === 404) return 'Ressource introuvable.';
  if (status === 409) return 'Conflit : l’état a changé entre-temps. Rechargez la page.';
  if (status === 429) return 'Trop de tentatives. Patientez avant de réessayer.';
  if (status >= 500) return 'Erreur serveur. Réessayez ; si le problème persiste, transmettez l’identifiant de requête.';
  return `Erreur HTTP ${status}`;
}

/** Appelle une route admin du catalogue `ROUTES.admin` (source unique des chemins). */
export function callAdmin<T = unknown>(
  key: AdminRouteKey,
  opts: { params?: Record<string, string>; query?: Record<string, string | undefined | null>; body?: unknown; signal?: AbortSignal; silent401?: boolean } = {},
): Promise<T> {
  const { method, path } = adminRoute(key, opts.params, opts.query);
  return apiFetch<T>(path, { method, body: opts.body, signal: opts.signal, silent401: opts.silent401 });
}
