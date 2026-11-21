type ClassValue = string | false | null | undefined | 0;
/** Concatène des classes conditionnelles (sans dépendance). */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
