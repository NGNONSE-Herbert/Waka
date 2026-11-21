/** Mode démo (données fictives, paiements simulés). Désactiver explicitement avec NEXT_PUBLIC_DEMO_MODE=false. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

/** Version des CGU acceptée lors de la connexion et rappelée avant paiement. */
export const TERMS_VERSION = 'cgu-2026-11-v1';
