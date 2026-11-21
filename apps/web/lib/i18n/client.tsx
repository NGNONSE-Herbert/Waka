'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { getDictionary, type Dict } from './index';
import type { Locale } from './config';

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: 'fr', t: getDictionary('fr') });

/** Les deux dictionnaires sont petits (~15 Ko gzip) ; on ne transmet que la locale. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={{ locale, t: getDictionary(locale) }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
