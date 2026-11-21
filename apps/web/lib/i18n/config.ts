export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'waka_locale';
export const isLocale = (v: unknown): v is Locale => v === 'fr' || v === 'en';
