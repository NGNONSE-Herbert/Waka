/**
 * Source unique de la marque. Renommer le produit = modifier ce fichier (+ logo SVG dans apps/web/public).
 * « Waka » est une RECOMMANDATION de nom : disponibilité OAPI, domaine .cm et réseaux sociaux à vérifier
 * avant toute communication publique (voir docs/NAMING.md).
 */
export const BRAND = Object.freeze({
  name: 'Waka',
  legalNotice: 'Waka — nom de travail, marque non déposée',
  taglineFr: 'On waka ensemble.',
  taglineEn: 'Let’s waka together.',
  promiseFr: 'Le bon trajet. Les bonnes personnes. Un paiement encadré.',
  promiseEn: 'The right ride. The right people. A supervised payment.',
  colors: Object.freeze({
    night: '#142436',
    green: '#0E8F83',
    amber: '#F5B942',
    ivory: '#F8FAF8',
    ink: '#52606D',
  }),
  country: 'CM',
  currency: 'XAF',
  timezone: 'Africa/Douala',
  phonePrefix: '+237',
});
