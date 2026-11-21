import frSource from './fr';
import en from './en';
import { frTypo, mapStrings, fmt } from './typo';
import type { Locale } from './config';

export type Dict = typeof en;

/** Dictionnaire FR après typographie française (’, espaces insécables). */
const fr = mapStrings(frSource, frTypo) as Dict;

export const dictionaries: Record<Locale, Dict> = { fr, en };
export const getDictionary = (locale: Locale): Dict => dictionaries[locale];

/** Message utilisateur pour un code d’erreur API. */
export function errorMessage(dict: Dict, code: string | undefined | null): string {
  const codes = dict.errors.codes as Record<string, string>;
  return (code && codes[code]) || dict.errors.unknown;
}

export { fmt };
export * from './config';
