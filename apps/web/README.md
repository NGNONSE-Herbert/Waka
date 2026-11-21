# @waka/web — application passagers & conducteurs

Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind CSS v4, Radix (Dialog, Tabs, DropdownMenu), lucide-react, React Hook Form + Zod (schémas partagés `@waka/contracts`). PWA légère.

## Commandes (depuis la racine du monorepo)

| Commande | Rôle |
|---|---|
| `pnpm --filter @waka/web dev` | serveur de dev sur http://localhost:3000 |
| `pnpm --filter @waka/web build` / `start` | build et serveur de production (port 3000) |
| `pnpm --filter @waka/web typecheck` (= `lint`) | `tsc --noEmit` strict |
| `pnpm --filter @waka/web test` | Vitest : formats (FCFA, dates Douala, téléphone), complétude i18n FR/EN, typographie |
| `pnpm --filter @waka/web test:e2e` | Playwright : recherche → détail → OTP (devCode) → réservation → paiement MOCK → billet CONFIRMED. Ignoré si l’API ne répond pas. |
| `pnpm --filter @waka/web screenshots` | captures 390/1440 px dans `screenshots/` (API + web lancés ; `BASE_URL` pour cibler un autre port) |

Prérequis E2E/captures : API en mode MOCK sur le port 4000 (`pnpm --filter @waka/api dev`) et `npx playwright install chromium`.
En local, la limite OTP de l’API (par téléphone / IP, 10 min) peut être relevée : `OTP_MAX_PER_IP=500 OTP_MAX_PER_PHONE=100 pnpm --filter @waka/api dev`.

## Variables d’environnement

- `API_URL` (défaut `http://localhost:4000`) : cible du proxy même-origine `/api/:path*` (next.config.ts) et des appels serveur.
- `NEXT_PUBLIC_DEMO_MODE` (défaut activé) : bandeau « Démo », aide comptes de démonstration. Mettre `false` pour masquer.

## Architecture

- `lib/api.ts` : client typé navigateur (`/api/*`, cookies httpOnly, `X-Waka-Request: 1` sur toute mutation, `Idempotency-Key` stable par action pour réservation et paiement, erreurs `{error:{code,message,requestId}}` → `ApiError`). `lib/api-server.ts` : lectures côté serveur (relais des cookies).
- `lib/i18n/` : `fr.ts` (référence) et `en.ts` (même type, vérifié par tests). La typographie française (’, espaces insécables avant : ; ? ! et dans « 5 500 FCFA ») est appliquée automatiquement. Langue choisie via cookie `waka_locale`.
- Paiement (`components/booking/PaymentFlow.tsx`) : compte à rebours du blocage, transparence des frais + CGU, MTN MoMo / Orange Money (teintes génériques, aucun logo), interrogation toutes les 2,5 s, simulateur de téléphone **uniquement si `providerMode === 'MOCK'`**, succès affiché seulement sur `CONFIRMED` serveur, reprise réseau avec la même clé d’idempotence (sessionStorage).
- PWA : `app/manifest.ts`, icônes générées (`app/icons/[file]`), `public/sw.js` (coquille + statiques uniquement ; **aucune** réponse `/api/*` mise en cache ; repli `/hors-ligne`). Le SW n’est enregistré qu’en production.

## Écrans

`/`, `/recherche`, `/trajets/[id]`, `/connexion`, `/reservations/[id]/paiement`, `/reservations/[id]`, `/mes-trajets`, `/demande`, `/demandes/[id]`, `/conducteur` (inscription ou tableau de bord), `/conducteur/publier`, `/conducteur/trajets/[id]` (embarquement par PIN, départ, arrivée), `/conducteur/revenus`, `/litiges/[id]`, `/compte`, `/cgu`, `/confidentialite`, `/paiement-protege`, `/securite`, `/hors-ligne`, 404, erreur.
