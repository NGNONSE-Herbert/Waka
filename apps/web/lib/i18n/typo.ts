/**
 * Typographie française automatique appliquée au dictionnaire FR :
 * - apostrophe droite ' → apostrophe typographique ’
 * - espace insécable (U+00A0) avant « : » et espace fine insécable (U+202F) avant ; ? !
 * - espaces insécables à l’intérieur des guillemets « »
 */
export const NBSP = ' ';
export const NNBSP = ' ';

export function frTypo(input: string): string {
  return input
    .replace(/'/g, '’')
    .replace(/ :(?=\s|$)/g, `${NBSP}:`)
    .replace(/ ([;?!])/g, `${NNBSP}$1`)
    .replace(/« /g, `«${NBSP}`)
    .replace(/ »/g, `${NBSP}»`)
    .replace(/ FCFA/g, `${NBSP}FCFA`)
    .replace(/(\d) (h|min|km)\b/g, `$1${NBSP}$2`);
}

type Deep<T> = { [K in keyof T]: T[K] extends string ? string : Deep<T[K]> };

export function mapStrings<T extends object>(obj: T, fn: (s: string) => string): Deep<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] =
      typeof v === 'string'
        ? fn(v)
        : Array.isArray(v)
          ? v.map((x: unknown) => (typeof x === 'string' ? fn(x) : x))
          : mapStrings(v as object, fn);
  }
  return out as Deep<T>;
}

/** Interpolation simple : fmt('Bonjour {name}', { name: 'Aïcha' }). */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
