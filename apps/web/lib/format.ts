import { formatXaf } from '@waka/domain';
import type { Locale } from './i18n/config';

const TZ = 'Africa/Douala';
const NBSP = ' ';

/** « 5 500 FCFA » — séparateur de milliers et espace avant FCFA insécables. */
export function money(amount: number, locale: Locale = 'fr'): string {
  return formatXaf(amount, locale).replace(/[\s ]/g, NBSP);
}

/** Montant sans devise, pour mise en page « grand chiffre + petite devise ». */
export function amountOnly(amount: number, locale: Locale = 'fr'): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 0 })
    .format(amount)
    .replace(/[\s ]/g, NBSP);
}

const loc = (l: Locale) => (l === 'fr' ? 'fr-FR' : 'en-GB');

/** « 08:00 » (fuseau Africa/Douala). */
export function time(iso: string, locale: Locale = 'fr'): string {
  return new Intl.DateTimeFormat(loc(locale), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso));
}

/** « sam. 28 nov. » */
export function shortDate(iso: string, locale: Locale = 'fr'): string {
  return new Intl.DateTimeFormat(loc(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso));
}

/** « samedi 28 novembre » */
export function longDate(iso: string, locale: Locale = 'fr'): string {
  return new Intl.DateTimeFormat(loc(locale), { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(iso));
}

/** « sam. 28 nov. · 08:00 » (format de docs/CONVENTIONS.md). */
export function dateTime(iso: string, locale: Locale = 'fr'): string {
  return `${shortDate(iso, locale)} · ${time(iso, locale)}`;
}

/** « 3 h 30 » / « 45 min » */
export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}${NBSP}min`;
  return m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${String(m).padStart(2, '0')}`;
}

export function addMinutes(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString();
}

/** Date du jour à Douala au format AAAA-MM-JJ (valeur d’un <input type=date>). */
export function todayInDouala(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts; // en-CA => AAAA-MM-JJ
}

/** Construit un ISO avec décalage +01:00 (Douala, sans heure d’été) depuis une date et une heure locales. */
export function doualaIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+01:00`;
}

/** Heure décimale (0–24) d’un ISO à Douala, pour les filtres. */
export function hourOf(iso: string): number {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).formatToParts(d);
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return (h % 24) + m / 60;
}

/** Saisie progressive d’un numéro camerounais : « 690 000 001 ». */
export function formatCmLocal(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^(00)?237/, '').slice(0, 9);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(' ');
}

export function cmE164(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^(00)?237/, '');
  return `+237${d}`;
}

export function isCmMobile(raw: string): boolean {
  return /^6\d{8}$/.test(raw.replace(/\D/g, '').replace(/^(00)?237/, ''));
}

export function initials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'W';
}

export function remaining(targetIso: string, now = Date.now()): { total: number; m: number; s: number } {
  const total = Math.max(0, new Date(targetIso).getTime() - now);
  return { total, m: Math.floor(total / 60_000), s: Math.floor((total % 60_000) / 1000) };
}
