import type { City, CityCode } from '@waka/contracts';

/**
 * Repli si `GET /v1/cities` est momentanément injoignable : noms des villes du seed (docs/CONVENTIONS.md).
 * Les points de rendez-vous proviennent toujours de l’API ; ce repli n’en liste que quelques-uns connus.
 */
export const FALLBACK_CITIES: City[] = [
  { code: 'DLA', name: 'Douala', meetingPoints: ['Carrefour Ndokoti', 'Bonabéri – Rond-point', 'Akwa – Rond-point Deïdo'] },
  { code: 'YDE', name: 'Yaoundé', meetingPoints: ['Mvan', 'Poste centrale', 'Carrefour Warda'] },
  { code: 'KRI', name: 'Kribi', meetingPoints: [] },
  { code: 'BFS', name: 'Bafoussam', meetingPoints: [] },
  { code: 'LIM', name: 'Limbé', meetingPoints: [] },
  { code: 'BUE', name: 'Buéa', meetingPoints: [] },
  { code: 'EDE', name: 'Edéa', meetingPoints: [] },
  { code: 'BAM', name: 'Bamenda', meetingPoints: [] },
];

export const cityName = (cities: City[], code: string | null | undefined): string =>
  cities.find((c) => c.code === code)?.name ?? FALLBACK_CITIES.find((c) => c.code === code)?.name ?? code ?? '';

/** Corridors mis en avant sur l’accueil. Durées : estimations indicatives (route, trafic). */
export const POPULAR_CORRIDORS: { from: CityCode; to: CityCode; durationMin: number }[] = [
  { from: 'DLA', to: 'YDE', durationMin: 240 },
  { from: 'DLA', to: 'KRI', durationMin: 180 },
  { from: 'DLA', to: 'BFS', durationMin: 300 },
  { from: 'YDE', to: 'BFS', durationMin: 300 },
  { from: 'DLA', to: 'BUE', durationMin: 90 },
];
