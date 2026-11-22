/** Formats FR/EN au fuseau Africa/Douala (UTC+1, sans heure d'été), sans dépendre d'Intl sur Android. */
export type FormatLocale = 'fr' | 'en';

const OFFSET_MS = 60 * 60 * 1000;
const WORDS = {
  fr: {
    days: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    daysShort: ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'],
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    monthsShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    seat: 'place',
    seats: 'places',
  },
  en: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    seat: 'seat',
    seats: 'seats',
  },
} as const;

let locale: FormatLocale = 'fr';
export const setFormatLocale = (l: FormatLocale) => {
  locale = l;
};
const w = () => WORDS[locale];

const local = (v: string | number | Date) => new Date(new Date(v).getTime() + OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, '0');
/** Une date « YYYY-MM-DD » est lue à midi pour rester sur le bon jour. */
const fromKey = (key: string) => new Date(`${key}T12:00:00Z`);

export const dateKey = (v: string | number | Date = Date.now()) => local(v).toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => new Date(fromKey(key).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const time = (v: string) => {
  const d = local(v);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const addMinutes = (v: string, minutes: number) => new Date(new Date(v).getTime() + minutes * 60_000).toISOString();
/** Instant ISO d'une date et d'une heure locales à Douala. */
export const doualaIso = (day: string, hhmm: string) => `${day}T${hhmm}:00+01:00`;

export const dayShort = (key: string) => {
  const d = fromKey(key);
  const day = w().daysShort[d.getUTCDay()];
  const month = w().monthsShort[d.getUTCMonth()];
  return locale === 'en' ? `${day} ${d.getUTCDate()} ${month}` : `${day} ${d.getUTCDate()} ${month}`;
};
export const dayLong = (key: string) => {
  const d = fromKey(key);
  return `${w().days[d.getUTCDay()]} ${d.getUTCDate()} ${w().months[d.getUTCMonth()]}`;
};
export const dayParts = (key: string) => {
  const d = fromKey(key);
  return { name: w().daysShort[d.getUTCDay()] ?? '', num: String(d.getUTCDate()) };
};
export const dateTime = (v: string) => `${dayShort(dateKey(v))} · ${time(v)}`;

export const amount = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const money = (n: number) => `${amount(n)} FCFA`;
export const seats = (n: number) => `${n} ${n > 1 ? w().seats : w().seat}`;

export const duration = (min: number | null) => {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `≈ ${h} h ${pad(m)}` : `≈ ${h} h`;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Saisie guidée JJ/MM/AAAA. */
export const maskDate = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

/** « 28/11/2027 » → « 2027-11-28 », ou null si la date n'existe pas. */
export const parseDate = (v: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const key = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key ? key : null;
};

export const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
export const nextDays = (count: number) => Array.from({ length: count }, (_, i) => addDays(dateKey(), i));
