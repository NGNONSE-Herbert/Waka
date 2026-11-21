/**
 * Client HTTP typé (navigateur) — passe TOUJOURS par le proxy même-origine `/api/*` (cf. next.config.ts).
 * - cookies de session httpOnly : `credentials: 'same-origin'`
 * - en-tête anti-CSRF `X-Waka-Request: 1` sur toute requête mutante
 * - `Idempotency-Key` fourni par l’appelant (stable pour une même action utilisateur)
 * - erreurs normalisées `{ error: { code, message, requestId } }` → ApiError
 */
import {
  CSRF_HEADER,
  IDEMPOTENCY_HEADER,
  type BookingOutput,
  type City,
  type DisputeOutput,
  type MatchOutput,
  type Me,
  type PaymentOutput,
  type TripDetail,
  type TripSummary,
} from '@waka/contracts';
import type { z } from 'zod';
import type {
  CreateTravelRequestInput,
  CreateTripInput,
  DriverEarningsOutput,
  DriverOnboardingInput,
  EvidenceInput,
  InitiatePaymentInput,
  OpenDisputeInput,
  OtpStartOutput,
  OtpVerifyInput,
  ReviewInput,
  TravelRequestOutput,
  VehicleInput,
} from '@waka/contracts';

export type TravelRequest = z.infer<typeof TravelRequestOutput>;
export type Earnings = z.infer<typeof DriverEarningsOutput>;
export type OtpStart = z.infer<typeof OtpStartOutput>;
export type Page<T> = { items: T[]; nextCursor: string | null };

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: string, message: string, status: number, requestId: string | null, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
  get isNetwork() {
    return this.code === 'NETWORK_ERROR';
  }
  get isAuth() {
    return this.status === 401;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface RequestOptions {
  method?: Method;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined | null>;
}

const BASE = '/api';

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers[CSRF_HEADER] = '1';
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey;

  let url = `${BASE}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError('NETWORK_ERROR', 'Network request failed', 0, null);
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
    // Proxy injoignable (API arrêtée) : Next renvoie 500/502 sans corps JSON.
    const code = err?.code ?? (res.status >= 500 && !json ? 'API_UNAVAILABLE' : `HTTP_${res.status}`);
    throw new ApiError(code, err?.message ?? res.statusText, res.status, err?.requestId ?? requestId, err?.details);
  }
  return json as T;
}

/** Certaines listes peuvent être renvoyées nues ou paginées : on normalise. */
export function asList<T>(v: T[] | { items: T[] } | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : (v.items ?? []);
}

export const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

type In<S extends z.ZodTypeAny> = z.input<S>;

/** Points d’entrée — miroir de `ROUTES` (packages/contracts). */
export const api = {
  auth: {
    otpStart: (phone: string) => request<OtpStart>('/v1/auth/otp/start', { method: 'POST', body: { phone } }),
    otpVerify: (body: In<typeof OtpVerifyInput>) => request<unknown>('/v1/auth/otp/verify', { method: 'POST', body }),
    logout: () => request<unknown>('/v1/auth/logout', { method: 'POST' }),
    me: () => request<Me>('/v1/me'),
  },
  cities: async () => asList(await request<City[] | { items: City[] }>('/v1/cities')),
  trips: {
    search: (q: { from?: string; to?: string; date?: string; seats?: number; cursor?: string; limit?: number }) =>
      request<Page<TripSummary>>('/v1/trips', { query: q }),
    detail: (id: string) => request<TripDetail>(`/v1/trips/${encodeURIComponent(id)}`),
    create: (body: In<typeof CreateTripInput>) => request<TripSummary>('/v1/trips', { method: 'POST', body }),
    cancel: (id: string) => request<unknown>(`/v1/trips/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} }),
    mine: async () => asList(await request<TripSummary[] | Page<TripSummary>>('/v1/me/trips')),
    start: (id: string) => request<unknown>(`/v1/trips/${encodeURIComponent(id)}/start`, { method: 'POST', body: {} }),
    arrival: (id: string) => request<unknown>(`/v1/trips/${encodeURIComponent(id)}/arrival`, { method: 'POST', body: {} }),
    bookings: async (id: string) => asList(await request<BookingOutput[] | Page<BookingOutput>>(`/v1/trips/${encodeURIComponent(id)}/bookings`)),
  },
  driver: {
    onboarding: (body: In<typeof DriverOnboardingInput>) => request<unknown>('/v1/driver/onboarding', { method: 'POST', body }),
    vehicle: (body: In<typeof VehicleInput>) => request<unknown>('/v1/driver/vehicles', { method: 'POST', body }),
    earnings: () => request<Earnings>('/v1/driver/earnings'),
  },
  requests: {
    create: (body: In<typeof CreateTravelRequestInput>) => request<TravelRequest>('/v1/travel-requests', { method: 'POST', body }),
    mine: async () => asList(await request<TravelRequest[] | Page<TravelRequest>>('/v1/me/travel-requests')),
    matches: async (id: string) => asList(await request<MatchOutput[] | Page<MatchOutput>>(`/v1/travel-requests/${encodeURIComponent(id)}/matches`)),
    cancel: (id: string) => request<unknown>(`/v1/travel-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  bookings: {
    create: (body: { tripId: string; seats: number }, idempotencyKey: string) =>
      request<BookingOutput>('/v1/bookings', { method: 'POST', body, idempotencyKey }),
    mine: async () => asList(await request<BookingOutput[] | Page<BookingOutput>>('/v1/me/bookings')),
    detail: (id: string, signal?: AbortSignal) => request<BookingOutput>(`/v1/bookings/${encodeURIComponent(id)}`, { signal }),
    pay: (id: string, body: In<typeof InitiatePaymentInput>, idempotencyKey: string) =>
      request<PaymentOutput | BookingOutput>(`/v1/bookings/${encodeURIComponent(id)}/payments`, { method: 'POST', body, idempotencyKey }),
    cancel: (id: string) => request<BookingOutput>(`/v1/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} }),
    checkIn: (id: string, pin: string) => request<BookingOutput>(`/v1/bookings/${encodeURIComponent(id)}/check-in`, { method: 'POST', body: { pin } }),
    confirm: (id: string) => request<BookingOutput>(`/v1/bookings/${encodeURIComponent(id)}/confirm-completion`, { method: 'POST', body: {} }),
    dispute: (id: string, body: In<typeof OpenDisputeInput>) => request<DisputeOutput>(`/v1/bookings/${encodeURIComponent(id)}/disputes`, { method: 'POST', body }),
    review: (id: string, body: In<typeof ReviewInput>) => request<unknown>(`/v1/bookings/${encodeURIComponent(id)}/reviews`, { method: 'POST', body }),
  },
  disputes: {
    detail: (id: string) => request<DisputeOutput>(`/v1/disputes/${encodeURIComponent(id)}`),
    evidence: (id: string, body: In<typeof EvidenceInput>) => request<unknown>(`/v1/disputes/${encodeURIComponent(id)}/evidence`, { method: 'POST', body }),
    appeal: (id: string) => request<unknown>(`/v1/disputes/${encodeURIComponent(id)}/appeal`, { method: 'POST', body: {} }),
  },
  dev: {
    mockComplete: (providerRef: string, outcome: 'SUCCEEDED' | 'FAILED') =>
      request<unknown>(`/v1/dev/mock-psp/${encodeURIComponent(providerRef)}/complete`, { method: 'POST', body: { outcome } }),
  },
};
