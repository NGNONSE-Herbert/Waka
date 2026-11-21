/**
 * Référentiel villes / points de rendez-vous / durées.
 * Les points de rendez-vous sont des lieux publics connus ; leur libellé exact est À VÉRIFIER
 * sur le terrain avant lancement. Les durées sont des ESTIMATIONS INDICATIVES (trafic, saison).
 */
export const CITIES: ReadonlyArray<{ code: string; name: string; meetingPoints: string[] }> = [
  { code: 'DLA', name: 'Douala', meetingPoints: ['Carrefour Ndokoti', 'Bonabéri – Rond-point', 'Akwa – Rond-point Deïdo', 'Bonamoussadi – Carrefour Kotto', 'Carrefour Village'] },
  { code: 'YDE', name: 'Yaoundé', meetingPoints: ['Mvan', 'Poste centrale', 'Carrefour Warda', 'Biyem-Assi – Carrefour', 'Nsam'] },
  { code: 'KRI', name: 'Kribi', meetingPoints: ['Gare routière de Kribi', 'Centre-ville – Marché', 'Carrefour Mpangou'] },
  { code: 'BFS', name: 'Bafoussam', meetingPoints: ['Marché A', 'Carrefour Tamdja', 'Gare routière de Bafoussam'] },
  { code: 'LIM', name: 'Limbé', meetingPoints: ['Mile 4 Motor Park', 'Down Beach', 'Centre-ville – Half Mile'] },
  { code: 'BUE', name: 'Buéa', meetingPoints: ['Mile 17 Motor Park', 'Molyko', 'Great Soppo'] },
  { code: 'EDE', name: 'Edéa', meetingPoints: ['Centre-ville – Marché', 'Gare routière d’Edéa'] },
  { code: 'BAM', name: 'Bamenda', meetingPoints: ['City Chemist Roundabout', 'Nkwen – Mile 4', 'Commercial Avenue'] },
];

const DURATIONS_MIN: Record<string, number> = {
  'DLA-YDE': 240, 'DLA-KRI': 180, 'DLA-BFS': 300, 'YDE-BFS': 330, 'DLA-LIM': 90, 'DLA-BUE': 90,
  'YDE-KRI': 240, 'DLA-EDE': 75, 'YDE-EDE': 165, 'DLA-BAM': 420, 'BUE-LIM': 30, 'YDE-BAM': 480, 'BFS-BAM': 120,
};

/** Durée indicative du corridor (symétrique), ou null si inconnue. */
export function estimatedDurationMin(from: string, to: string): number | null {
  return DURATIONS_MIN[`${from}-${to}`] ?? DURATIONS_MIN[`${to}-${from}`] ?? null;
}

export const CANCELLATION_POLICY_SUMMARY =
  'Annulation par le passager plus de 24 h avant le départ : remboursement intégral. Moins de 24 h avant : la contribution est remboursée, les frais de service sont conservés. Annulation par le conducteur : remboursement intégral.';
