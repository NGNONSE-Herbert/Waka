# Conventions d'équipe — Waka (monorepo)

> Document de référence partagé par toutes les applications. Toute dérogation est consignée dans `docs/DECISIONS.md`.

## Marque
- Nom de travail : **Waka** (source unique : `packages/domain/src/brand.ts`). Nom non déposé : toujours le présenter comme provisoire dans les mentions légales.
- Signature : « On waka ensemble. » — Promesse : « Le bon trajet. Les bonnes personnes. Un paiement encadré. »
- Palette « confiance chaleureuse » : nuit `#142436`, vert `#0E8F83`, ambre `#F5B942`, ivoire `#F8FAF8`, encre `#52606D`. Typo : Manrope (titres), Inter (texte).
- Logo : pictogramme géométrique de **deux sièges reliés par une route** + mot-symbole « waka » en minuscules.

## Topologie locale
| App | Port | Rôle |
|---|---|---|
| `apps/api` | 4000 | NestJS, REST `/v1`, OpenAPI sur `/docs` (hors production) |
| `apps/web` | 3000 | Next.js App Router — passagers & conducteurs, PWA |
| `apps/admin` | 3001 | Next.js — console staff, séparée |

- Web et admin appellent l'API **via un proxy même-origine** : `next.config` réécrit `/api/:path*` → `${API_URL}/:path*` (`API_URL` par défaut `http://localhost:4000`). Le navigateur ne parle jamais directement au port 4000.
- Cookies de session : `waka_session` (utilisateurs) et `waka_admin` (staff), `HttpOnly`, `SameSite=Lax`, `Secure` en production, opaques (jeton aléatoire, seul son SHA-256 est stocké en base).
- Anti-CSRF : toute requête mutante (POST/PUT/PATCH/DELETE) doit porter l'en-tête `X-Waka-Request: 1`, sinon `403 FORBIDDEN`. Exceptions : `/v1/webhooks/*` (authentifiés par signature).
- Idempotence : `POST /v1/bookings` et `POST /v1/bookings/:id/payments` exigent l'en-tête `Idempotency-Key` (UUID). Même clé + même utilisateur ⇒ même réponse, aucun doublon.
- Erreurs : `{ "error": { "code", "message", "requestId", "details?" } }` ; `X-Request-Id` renvoyé sur chaque réponse.

## Données de démonstration (seed) — clairement fictives
- Tous les profils de démo ont `isDemo = true` et sont affichés avec un badge « Démo ».
- Téléphones (OTP renvoyé dans `devCode` hors production) :
  - `+237 690 000 001` — Passagère démo « Aïcha (démo) »
  - `+237 690 000 004` — Passager démo « Junior (démo) »
  - `+237 677 000 002` — Conducteur **vérifié** « Serge (démo) » avec véhicule approuvé
  - `+237 650 000 003` — Conducteur **non vérifié** « Nadège (démo) » (publication refusée)
- Staff (mot de passe `Waka-Demo-2026!`, MFA TOTP ; hors production la réponse de login contient `devTotp`) :
  - `support@waka.test` (SUPPORT_AGENT), `litiges@waka.test` et `litiges2@waka.test` (DISPUTE_MANAGER), `finance@waka.test` (FINANCE), `admin@waka.test` (SUPERADMIN)
- Villes : DLA Douala, YDE Yaoundé, KRI Kribi, BFS Bafoussam, LIM Limbé, BUE Buéa, EDE Edéa, BAM Bamenda — avec points de rendez-vous réels connus (ex. Douala : Carrefour Ndokoti, Bonabéri – Rond-point, Akwa – Rond-point Deïdo… ; Yaoundé : Mvan, Poste centrale, Carrefour Warda…). Les durées sont des **estimations indicatives** marquées comme telles.
- Trajets générés **relativement à la date du seed** (J+1 à J+10) pour être toujours à venir.

## Paiement MOCK
- `PAYMENT_PROVIDER=mock` interdit si `NODE_ENV=production` (l'API refuse de démarrer).
- Flux : `POST /bookings/:id/payments` → PSP mock renvoie `providerRef` + statut `PENDING` → l'UI affiche « Validez la demande sur votre téléphone » + un **simulateur de téléphone étiqueté MOCK** qui appelle `POST /v1/dev/mock-psp/:providerRef/complete { outcome: 'SUCCEEDED' | 'FAILED' }`.
- Le simulateur fait émettre par le PSP mock un **webhook signé HMAC** vers `POST /v1/webhooks/payments/mock`. L'API vérifie la signature sur le corps brut, l'horodatage, l'unicité de l'événement, puis **réinterroge** le PSP (`getPaymentStatus`) avant toute transition.
- L'UI interroge `GET /v1/bookings/:id` toutes les 2–3 s pendant `PAYMENT_PENDING` ; elle n'affiche « Réservation confirmée » que si l'API renvoie `CONFIRMED`.

## Langue & formats
- Français par défaut, anglais via dictionnaires (`fr.ts`/`en.ts`), aucune chaîne en dur dans les composants partagés.
- Montants : entiers XAF, affichés `5 500 FCFA`. Dates : fuseau `Africa/Douala`, format `sam. 28 nov. · 08:00`.
- Libellés d'états de paiement : `PAYMENT_STATE_LABEL_FR` (domaine) — ne jamais confondre « demandé » et « confirmé ».
