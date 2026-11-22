/**
 * Client de l'API Waka. Le serveur reste seule source de vérité pour les prix, places et statuts.
 * Les appels passent par le relais /api de Metro (voir metro.config.js) ; la session est un cookie HttpOnly.
 */
import type {
  BookingOutput,
  City,
  CreateTripInput,
  DisputeOutput,
  MatchOutput,
  Me,
  MessageOutput,
  MessageThreadOutput,
  NotificationsOutput,
  PaymentOutput,
  TripDetail,
  TripSummary,
} from '@waka/contracts';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { currentI18n } from './i18n';

export type { BookingOutput as Booking, City, DisputeOutput as Dispute, MatchOutput as Match, Me, MessageOutput as ChatMessage, MessageThreadOutput as Thread, NotificationsOutput as NotificationList, PaymentOutput as Payment, TripDetail, TripSummary };
export type PaymentChannel = 'MTN_MOMO' | 'ORANGE_MONEY';
export type DisputeCategory = DisputeOutput['category'];
export type DisputeRequest = { category: DisputeCategory; description: string; requestedOutcome: 'FULL_REFUND' | 'PARTIAL_REFUND' | 'RELEASE' | 'OTHER'; urgentSafety: boolean };
export type TravelRequest = {
  id: string;
  originCity: string;
  destinationCity: string;
  windowStart: string;
  windowEnd: string;
  seats: number;
  maxBudgetPerSeat: number | null;
  preferredPickup: string | null;
  status: 'ACTIVE' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';
  matchCount: number;
};
export type Earnings = {
  currency: 'XAF';
  heldByPartner: number;
  releaseRequested: number;
  paid: number;
  frozenByDispute: number;
  items: { bookingId: string; tripLabel: string; amount: number; paymentState: string; label: string; updatedAt: string }[];
};
export type DriverTrip = TripSummary & { seatsTotal: number };

/** Doit correspondre à CURRENT_TERMS_VERSION côté API. */
export const TERMS_VERSION = 'cgu-2026-11-v1';

function baseUrl() {
  if (Platform.OS === 'web') return '/api';
  const host = Constants.expoConfig?.hostUri?.split('/')[0] ?? '127.0.0.1:8081';
  // Une adresse sans port est un tunnel Expo, servi en HTTPS.
  const scheme = host.includes(':') ? 'http' : 'https';
  return `${scheme}://${host}/api`;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isAuth() {
    return this.status === 401;
  }
}

export const errorMessage = (e: unknown) => {
  const { t, m, locale } = currentI18n();
  if (!(e instanceof ApiError)) return t.errors.unknown;
  if (e.code === 'MESSAGE_BLOCKED') {
    const reason = e.details?.reason;
    if (reason === 'LINK') return m.blockedLINK;
    if (reason === 'PHONE') return m.blockedPHONE;
    if (reason === 'OFF_PLATFORM_PAYMENT') return m.blockedOFF_PLATFORM_PAYMENT;
  }
  // Les refus métier précis (permis expiré, code incorrect…) ne sont rédigés qu'en français par l'API.
  if (e.code === 'VALIDATION_ERROR' && locale === 'fr' && e.message && e.message !== 'Données invalides.') return e.message;
  const codes = t.errors.codes as Record<string, string>;
  return codes[e.code] ?? t.errors.unknown;
};

type Options = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; idempotencyKey?: string; query?: Record<string, string | number | undefined> };

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-Waka-Request'] = '1';
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const qs = Object.entries(opts.query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Network request failed', 0);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
    throw new ApiError(err?.code ?? (res.status >= 500 ? 'API_UNAVAILABLE' : `HTTP_${res.status}`), err?.message ?? 'Erreur serveur', res.status, err?.details);
  }
  return json as T;
}

const list = <T>(v: T[] | { items: T[] } | null) => (Array.isArray(v) ? v : (v?.items ?? []));
const id = encodeURIComponent;
const post = <T>(path: string, body: unknown = {}, idempotencyKey?: string) => request<T>(path, { method: 'POST', body, ...(idempotencyKey ? { idempotencyKey } : {}) });

export const newKey = () => randomUUID();

export const api = {
  me: () => request<Me>('/v1/me'),
  otpStart: (phone: string) => post<{ challengeId: string; maskedPhone: string; devCode?: string }>('/v1/auth/otp/start', { phone }),
  otpVerify: (challengeId: string, code: string, displayName?: string) =>
    post<{ user: Me; isNewUser: boolean }>('/v1/auth/otp/verify', { challengeId, code, acceptedTermsVersion: TERMS_VERSION, ...(displayName ? { displayName } : {}) }),
  logout: () => request<unknown>('/v1/auth/logout', { method: 'POST' }),

  cities: async () => list(await request<City[] | { items: City[] }>('/v1/cities')),
  search: (q: { from: string; to: string; date?: string; seats: number; cursor?: string }) => request<{ items: TripSummary[]; nextCursor: string | null }>('/v1/trips', { query: q }),
  trip: (tripId: string) => request<TripDetail>(`/v1/trips/${id(tripId)}`),

  myBookings: async () => list(await request<BookingOutput[] | { items: BookingOutput[] }>('/v1/me/bookings')),
  booking: (bookingId: string) => request<BookingOutput>(`/v1/bookings/${id(bookingId)}`),
  book: (tripId: string, seatCount: number, key: string) => post<BookingOutput>('/v1/bookings', { tripId, seats: seatCount }, key),
  pay: (bookingId: string, channel: PaymentChannel, payerPhone: string, key: string) => post<PaymentOutput | BookingOutput>(`/v1/bookings/${id(bookingId)}/payments`, { channel, payerPhone }, key),
  /** Simulateur du PSP : l'API le refuse hors développement. */
  mockComplete: (providerRef: string, outcome: 'SUCCEEDED' | 'FAILED') => post<unknown>(`/v1/dev/mock-psp/${id(providerRef)}/complete`, { outcome }),
  cancelBooking: (bookingId: string) => post<BookingOutput>(`/v1/bookings/${id(bookingId)}/cancel`),
  confirmArrival: (bookingId: string) => post<BookingOutput>(`/v1/bookings/${id(bookingId)}/confirm-completion`),
  review: (bookingId: string, rating: number, comment?: string) => post<unknown>(`/v1/bookings/${id(bookingId)}/reviews`, { rating, ...(comment ? { comment } : {}) }),

  openDispute: (bookingId: string, body: DisputeRequest) => post<DisputeOutput>(`/v1/bookings/${id(bookingId)}/disputes`, body),
  dispute: (disputeId: string) => request<DisputeOutput>(`/v1/disputes/${id(disputeId)}`),
  addEvidence: (disputeId: string, text: string) => post<unknown>(`/v1/disputes/${id(disputeId)}/evidence`, { text }),
  appeal: (disputeId: string) => post<unknown>(`/v1/disputes/${id(disputeId)}/appeal`),

  thread: (bookingId: string) => request<MessageThreadOutput>(`/v1/bookings/${id(bookingId)}/messages`),
  sendMessage: (bookingId: string, text: string) => post<MessageOutput>(`/v1/bookings/${id(bookingId)}/messages`, { text }),
  notifications: () => request<NotificationsOutput>('/v1/me/notifications'),
  markNotificationsRead: () => post<unknown>('/v1/me/notifications/read'),

  onboarding: (body: { fullName: string; licenseNumber: string; licenseExpiry: string; idDocumentType: 'CNI' | 'PASSPORT' | 'RESIDENCE_PERMIT'; idDocumentUploadRef: string; declaresPrivateCarpoolOnly: true }) =>
    post<Me>('/v1/driver/onboarding', body),
  addVehicle: (body: { make: string; model: string; color: string; plate: string; year: number; seatsTotal: number; insuranceExpiry: string; inspectionExpiry: string }) => post<unknown>('/v1/driver/vehicles', body),
  earnings: () => request<Earnings>('/v1/driver/earnings'),
  myTrips: async () => list(await request<DriverTrip[] | { items: DriverTrip[] }>('/v1/me/trips')),
  createTrip: (body: CreateTripInput) => post<TripSummary>('/v1/trips', body),
  tripBookings: async (tripId: string) => list(await request<BookingOutput[] | { items: BookingOutput[] }>(`/v1/trips/${id(tripId)}/bookings`)),
  startTrip: (tripId: string) => post<unknown>(`/v1/trips/${id(tripId)}/start`),
  reportArrival: (tripId: string) => post<unknown>(`/v1/trips/${id(tripId)}/arrival`),
  cancelTrip: (tripId: string) => post<unknown>(`/v1/trips/${id(tripId)}/cancel`),
  checkIn: (bookingId: string, pin: string) => post<BookingOutput>(`/v1/bookings/${id(bookingId)}/check-in`, { pin }),

  createRequest: (body: {
    originCity: string;
    destinationCity: string;
    windowStart: string;
    windowEnd: string;
    seats: number;
    maxBudgetPerSeat: number | null;
    preferredPickup: string | null;
    needsLuggage: boolean;
    wantsAirConditioning: boolean;
    notifyOnNewMatch: boolean;
  }) => post<TravelRequest>('/v1/travel-requests', body),
  myRequests: async () => list(await request<TravelRequest[] | { items: TravelRequest[] }>('/v1/me/travel-requests')),
  matches: async (requestId: string) => list(await request<MatchOutput[] | { items: MatchOutput[] }>(`/v1/travel-requests/${id(requestId)}/matches`)),
  cancelRequest: (requestId: string) => request<unknown>(`/v1/travel-requests/${id(requestId)}`, { method: 'DELETE' }),
};
