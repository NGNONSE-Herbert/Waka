/**
 * Lecture TOLÉRANTE des réponses de l'API admin.
 * Les formes de sortie admin ne sont pas toutes typées dans @waka/contracts : on accepte plusieurs
 * noms de champs plausibles et on retombe sur `null` plutôt que de planter. L'UI affiche « — ».
 */
export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function obj(v: unknown, ...keys: string[]): Obj | null {
  if (!isObj(v)) return null;
  if (keys.length === 0) return v;
  for (const k of keys) {
    const x = getPath(v, k);
    if (isObj(x)) return x;
  }
  return null;
}

function getPath(o: Obj, path: string): unknown {
  let cur: unknown = o;
  for (const part of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function str(o: unknown, ...keys: string[]): string | null {
  if (!isObj(o)) return null;
  for (const k of keys) {
    const v = getPath(o, k);
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

export function num(o: unknown, ...keys: string[]): number | null {
  if (!isObj(o)) return null;
  for (const k of keys) {
    const v = getPath(o, k);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

export function bool(o: unknown, ...keys: string[]): boolean | null {
  if (!isObj(o)) return null;
  for (const k of keys) {
    const v = getPath(o, k);
    if (typeof v === 'boolean') return v;
  }
  return null;
}

export function arr(o: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(o)) return o;
  if (!isObj(o)) return [];
  for (const k of keys) {
    const v = getPath(o, k);
    if (Array.isArray(v)) return v;
  }
  return [];
}

/** Liste paginée ou tableau nu : `[...]`, `{ items }`, `{ data }`, `{ results }`. */
export function list(o: unknown, ...extraKeys: string[]): unknown[] {
  return arr(o, ...extraKeys, 'items', 'data', 'results', 'rows');
}

/** `{ a: 1, b: 2 }` ou `[{ key|state|label, count|value }]` → paires. */
export function pairs(v: unknown, keyNames = ['state', 'key', 'label', 'priority', 'name', 'day', 'date'], valNames = ['count', 'value', 'total', 'n', 'amount']): { key: string; value: number }[] {
  if (Array.isArray(v)) {
    return v
      .map((it) => ({ key: str(it, ...keyNames) ?? '?', value: num(it, ...valNames) ?? 0 }))
      .filter((p) => p.key !== '?');
  }
  if (isObj(v)) {
    return Object.entries(v)
      .filter(([, x]) => typeof x === 'number')
      .map(([key, x]) => ({ key, value: x as number }));
  }
  return [];
}

/** Personne affichable : chaîne, ou objet { displayName | name | email }. */
export function personName(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  return str(v, 'displayName', 'name', 'fullName', 'email');
}
