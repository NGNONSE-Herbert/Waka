/**
 * Matching MVP — transparent, versionné, explicable (cahier §9.1).
 * score = 0.40·time_fit + 0.25·pickup_fit + 0.20·reliability + 0.10·budget_fit + 0.05·preferences_fit
 * Aucune caractéristique sensible. Un nouveau conducteur sans avis reçoit une fiabilité neutre (0,6), pas 0.
 */
export const MATCHING_VERSION = 'match-2026-11-v1';

export const MATCH_WEIGHTS = Object.freeze({ time: 0.4, pickup: 0.25, reliability: 0.2, budget: 0.1, preferences: 0.05 });

export interface MatchTrip {
  readonly id: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly departureAt: Date;
  readonly seatsAvailable: number;
  readonly seatPrice: number; // contribution conducteur par place
  readonly totalPerSeat: number; // prix total par place (frais inclus) — ce que le passager compare
  readonly meetingPoint: string;
  readonly driverEligible: boolean;
  readonly status: string;
  readonly driverCompletedTrips: number;
  readonly driverRating: number | null; // 1..5
  readonly driverCancellationRate: number; // 0..1
  readonly luggageAllowed: boolean;
  readonly airConditioning: boolean;
}

export interface MatchRequest {
  readonly originCity: string;
  readonly destinationCity: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly seats: number;
  readonly maxBudgetPerSeat: number | null; // total par place, frais inclus
  readonly preferredPickup: string | null;
  readonly needsLuggage: boolean;
  readonly wantsAirConditioning: boolean;
}

export interface MatchExplanation {
  readonly factor: 'time' | 'pickup' | 'reliability' | 'budget' | 'preferences';
  readonly score: number;
  readonly weight: number;
  readonly reason: string;
}

export interface MatchResult {
  readonly tripId: string;
  readonly score: number; // 0..100
  readonly version: string;
  readonly explanations: readonly MatchExplanation[];
}

export type Exclusion = 'CORRIDOR' | 'STATUS' | 'DRIVER' | 'CAPACITY' | 'WINDOW' | 'BUDGET' | 'LUGGAGE';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Filtres obligatoires. Retourne la raison d'exclusion, ou null si éligible. */
export function exclusionReason(t: MatchTrip, r: MatchRequest, graceMinutes = 120): Exclusion | null {
  if (norm(t.originCity) !== norm(r.originCity) || norm(t.destinationCity) !== norm(r.destinationCity)) return 'CORRIDOR';
  if (t.status !== 'PUBLISHED') return 'STATUS';
  if (!t.driverEligible) return 'DRIVER';
  if (t.seatsAvailable < r.seats) return 'CAPACITY';
  const grace = graceMinutes * 60_000;
  if (t.departureAt.getTime() < r.windowStart.getTime() - grace || t.departureAt.getTime() > r.windowEnd.getTime() + grace) return 'WINDOW';
  if (r.maxBudgetPerSeat !== null && t.totalPerSeat > r.maxBudgetPerSeat * 1.2) return 'BUDGET';
  if (r.needsLuggage && !t.luggageAllowed) return 'LUGGAGE';
  return null;
}

function timeFit(t: MatchTrip, r: MatchRequest): [number, string] {
  const dep = t.departureAt.getTime();
  if (dep >= r.windowStart.getTime() && dep <= r.windowEnd.getTime()) return [1, 'Départ dans votre créneau'];
  const gapMin = Math.min(Math.abs(dep - r.windowStart.getTime()), Math.abs(dep - r.windowEnd.getTime())) / 60_000;
  return [clamp01(1 - gapMin / 120), `Départ à ${Math.round(gapMin)} min de votre créneau`];
}

function pickupFit(t: MatchTrip, r: MatchRequest): [number, string] {
  if (!r.preferredPickup) return [0.7, 'Pas de point de départ préféré indiqué'];
  const a = norm(t.meetingPoint);
  const b = norm(r.preferredPickup);
  if (a.includes(b) || b.includes(a)) return [1, `Rendez-vous à ${t.meetingPoint}, comme souhaité`];
  const wa = new Set(a.split(/[\s,-]+/).filter((w) => w.length > 2));
  const overlap = b.split(/[\s,-]+/).filter((w) => wa.has(w)).length;
  return overlap > 0 ? [0.6, `Rendez-vous proche : ${t.meetingPoint}`] : [0.3, `Rendez-vous différent : ${t.meetingPoint}`];
}

function reliability(t: MatchTrip): [number, string] {
  if (t.driverCompletedTrips < 3 || t.driverRating === null) {
    return [0.6, 'Nouveau conducteur vérifié — pas encore assez d’historique'];
  }
  const rating = (t.driverRating - 1) / 4;
  const score = clamp01(0.7 * rating + 0.3 * (1 - t.driverCancellationRate));
  return [score, `${t.driverCompletedTrips} trajets réalisés, note ${t.driverRating.toFixed(1)}/5`];
}

function budgetFit(t: MatchTrip, r: MatchRequest): [number, string] {
  if (r.maxBudgetPerSeat === null) return [0.8, 'Pas de budget indiqué'];
  if (t.totalPerSeat <= r.maxBudgetPerSeat) return [1, 'Dans votre budget, frais inclus'];
  const over = (t.totalPerSeat - r.maxBudgetPerSeat) / r.maxBudgetPerSeat;
  return [clamp01(1 - over * 5), `${Math.round(over * 100)} % au-dessus de votre budget`];
}

function preferencesFit(t: MatchTrip, r: MatchRequest): [number, string] {
  if (!r.wantsAirConditioning) return [1, 'Préférences respectées'];
  return t.airConditioning ? [1, 'Climatisation annoncée'] : [0, 'Climatisation non annoncée'];
}

export function scoreMatch(t: MatchTrip, r: MatchRequest): MatchResult {
  const parts: [MatchExplanation['factor'], number, [number, string]][] = [
    ['time', MATCH_WEIGHTS.time, timeFit(t, r)],
    ['pickup', MATCH_WEIGHTS.pickup, pickupFit(t, r)],
    ['reliability', MATCH_WEIGHTS.reliability, reliability(t)],
    ['budget', MATCH_WEIGHTS.budget, budgetFit(t, r)],
    ['preferences', MATCH_WEIGHTS.preferences, preferencesFit(t, r)],
  ];
  const explanations = parts.map(([factor, weight, [score, reason]]) => ({ factor, weight, score: Math.round(score * 100) / 100, reason }));
  const total = parts.reduce((s, [, w, [score]]) => s + w * score, 0);
  return { tripId: t.id, score: Math.round(total * 100), version: MATCHING_VERSION, explanations };
}

export function rankMatches(trips: readonly MatchTrip[], r: MatchRequest): MatchResult[] {
  return trips
    .filter((t) => exclusionReason(t, r) === null)
    .map((t) => scoreMatch(t, r))
    .sort((a, b) => b.score - a.score || a.tripId.localeCompare(b.tripId));
}
