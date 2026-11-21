/** Formats FR — fuseau Africa/Douala, montants entiers XAF « 5 500 FCFA ». */
export const TZ = 'Africa/Douala';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function fcfa(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return `${nf.format(amount)} FCFA`;
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return nf.format(n);
}

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** « sam. 28 nov. · 08:00 » */
export function dateTime(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return '—';
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  return `${day} · ${time}`;
}

export function dateTimeFull(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d);
}

function parseDay(v: string | number | Date | null | undefined) {
  return toDate(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
}

export function dateOnly(v: string | number | Date | null | undefined): string {
  const d = parseDay(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function dayShort(v: string | number | Date | null | undefined): string {
  const d = parseDay(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric' }).format(d);
}

function humanDuration(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

export type SlaTone = 'overdue' | 'soon' | 'ok' | 'none';

/** SLA : « Échéance dans 5 h » / « En retard de 2 h ». `soon` = moins de 12 h. */
export function sla(dueAt: string | null | undefined, now: Date = new Date()): { label: string; tone: SlaTone } {
  const d = toDate(dueAt);
  if (!d) return { label: 'Sans échéance', tone: 'none' };
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return { label: `En retard de ${humanDuration(diff)}`, tone: 'overdue' };
  return { label: `Échéance dans ${humanDuration(diff)}`, tone: diff < 12 * 3_600_000 ? 'soon' : 'ok' };
}

export type ExpiryTone = 'expired' | 'soon' | 'ok' | 'unknown';

/** Expiration de document : expiré, ≤ 30 jours, ou valide. */
export function expiry(dateIso: string | null | undefined, now: Date = new Date()): { label: string; tone: ExpiryTone } {
  const d = toDate(typeof dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? `${dateIso}T23:59:59Z` : dateIso);
  if (!d) return { label: 'Date inconnue', tone: 'unknown' };
  const days = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { label: `Expiré depuis ${Math.abs(days)} j`, tone: 'expired' };
  if (days <= 30) return { label: `Expire dans ${days} j`, tone: 'soon' };
  return { label: 'Valide', tone: 'ok' };
}

/** Masque une plaque : « LT 123 AB » → « LT •••• AB ». Une valeur déjà masquée est conservée. */
export function maskPlate(plate: string | null | undefined): string {
  if (!plate) return '—';
  if (plate.includes('•') || plate.includes('*')) return plate;
  const clean = plate.replace(/\s+/g, ' ').trim();
  if (clean.length <= 4) return '••••';
  return `${clean.slice(0, 2)} •••• ${clean.slice(-2)}`;
}

export function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return '—';
  return id.length > n ? id.slice(0, n) : id;
}
