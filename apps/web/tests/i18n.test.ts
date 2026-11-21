import { describe, expect, it } from 'vitest';
import frSource from '../lib/i18n/fr';
import en from '../lib/i18n/en';
import { dictionaries, errorMessage } from '../lib/i18n';
import { fmt, frTypo } from '../lib/i18n/typo';

type Tree = { [k: string]: string | string[] | Tree };

function keys(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' && !Array.isArray(v) ? keys(v as Tree, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
function leaves(obj: Tree): string[] {
  return Object.values(obj).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : leaves(v as Tree)));
}
function placeholders(s: string) {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
function get(obj: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Tree)?.[k], obj);
}

describe('i18n — complétude', () => {
  const frKeys = keys(frSource as unknown as Tree);
  const enKeys = keys(en as unknown as Tree);

  it('chaque clé FR existe en EN', () => {
    expect(frKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
  it('aucune clé EN orpheline', () => {
    expect(enKeys.filter((k) => !frKeys.includes(k))).toEqual([]);
  });
  it('aucune valeur vide', () => {
    expect(leaves(frSource as unknown as Tree).filter((s) => !s.trim())).toEqual([]);
    expect(leaves(en as unknown as Tree).filter((s) => !s.trim())).toEqual([]);
  });
  it('mêmes placeholders {x} dans les deux langues', () => {
    for (const k of frKeys) {
      const a = get(frSource as unknown as Tree, k);
      const b = get(en as unknown as Tree, k);
      if (typeof a === 'string' && typeof b === 'string') expect([k, placeholders(b)]).toEqual([k, placeholders(a)]);
    }
  });
  it('les libellés de paiement FR sont exactement ceux du domaine', () => {
    expect(dictionaries.fr.paymentState.PSP_PENDING).toBe('Paiement en cours de vérification');
    expect(dictionaries.fr.paymentState.RELEASE_REQUESTED).toBe('Versement demandé');
    expect(dictionaries.fr.paymentState.PAID).toBe('Versement confirmé');
    expect(dictionaries.fr.paymentState.FROZEN_DISPUTE).toBe('Litige en cours : règlement suspendu');
  });
});

describe('typographie française', () => {
  it('apostrophes typographiques et espaces insécables', () => {
    expect(frTypo("Vous allez où ?")).toBe('Vous allez où ?');
    expect(frTypo("l'arrivée : ok")).toBe('l’arrivée : ok');
    expect(frTypo('« Démo »')).toBe('« Démo »');
    expect(frTypo('5 500 FCFA')).toBe('5 500 FCFA');
  });
  it('le dictionnaire FR compilé ne contient ni apostrophe droite ni espace sécable avant ? ! ; :', () => {
    const all = leaves(dictionaries.fr as unknown as Tree);
    expect(all.filter((s) => s.includes("'"))).toEqual([]);
    expect(all.filter((s) => / [?!;:](\s|$)/.test(s))).toEqual([]);
  });
  it('interpolation', () => {
    expect(fmt('Bonjour {name}, {n} place(s)', { name: 'Aïcha', n: 2 })).toBe('Bonjour Aïcha, 2 place(s)');
    expect(fmt('{missing}')).toBe('{missing}');
  });
  it('codes d’erreur traduits, repli générique', () => {
    expect(errorMessage(dictionaries.fr, 'SEATS_UNAVAILABLE')).toMatch(/places/);
    expect(errorMessage(dictionaries.en, 'NOPE')).toBe(dictionaries.en.errors.unknown);
  });
});
