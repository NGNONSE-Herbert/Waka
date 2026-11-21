# @waka/api

API REST Waka (NestJS 12, ESM) — `/v1`, OpenAPI sur `/docs` (hors production). Paiements **MOCK uniquement**.

## Démarrage

```bash
pnpm install                       # depuis la racine
pnpm --filter @waka/api build
pnpm --filter @waka/api start      # http://localhost:4000 (migrations + seed auto si base vide)
pnpm --filter @waka/api dev        # tsc --watch + node --watch
pnpm --filter @waka/api test       # vitest + supertest sur PGlite en mémoire
pnpm --filter @waka/api db:migrate | db:seed
node apps/api/scripts/e2e-flow.mjs http://localhost:4000   # OTP → réservation → paiement → webhook → CONFIRMED
```

Variables : voir `.env.example`. Repartir de zéro : arrêter l'API puis supprimer `apps/api/.pglite`.
Un seul processus à la fois peut ouvrir un dossier PGlite.

## Choix techniques

- **Base** : Drizzle ORM. PGlite (Postgres WASM embarqué) par défaut, `node-postgres` si `DATABASE_URL`.
  Les migrations SQL versionnées (`migrations/*.sql`, appliquées au démarrage et en test) portent les invariants :
  CHECK (places, montants, XAF), UNIQUE (paiement/réservation, événement PSP, versement par réservation,
  clé d'idempotence du grand livre), index partiel « un litige non clos par réservation », triggers
  **append-only** (grand livre, audit), contrainte différée d'équilibre débit = crédit, somme des remboursements ≤ payé.
- **ESM** : l'API est un paquet ESM compilé par `tsc` (métadonnées de décorateurs) ; vitest utilise SWC (`unplugin-swc`).
- **Outbox transactionnelle** (`src/outbox`) derrière l'interface `JobQueue` : les travaux (notifications SMS simulées,
  expiration des holds, exécution des versements/remboursements, reprise de webhooks, complétion du PSP simulé)
  sont insérés dans la même transaction que l'effet métier. Un travailleur en processus les exécute (reprises bornées
  avec backoff, état `DEAD` après `max_attempts`). **BullMQ/Redis** pourra être branché en implémentant `JobQueue`
  (enqueue) et en remplaçant `OutboxWorker` — en conservant l'outbox comme source pour garantir l'atomicité.
- **Rate limits** en mémoire (une instance) sauf OTP (comptage en base). Multi-instance ⇒ Redis.

## Paiement MOCK

`POST /v1/bookings/:id/payments` ⇒ `PSP_PENDING` + `mockProviderRef`. Le simulateur
`POST /v1/dev/mock-psp/:providerRef/complete {outcome}` fait aboutir la transaction côté « PSP » et livre un webhook
signé (`x-mock-signature: t=<unix>,v1=<hmac>` sur `${t}.${rawBody}`, tolérance 300 s) au même traitement que
`POST /v1/webhooks/payments/mock`. Le traitement : signature → événement unique → **re-interrogation du PSP** →
contrôle montant/devise/marchand → transition sous verrou → grand livre → outbox. Les versements/remboursements
sont confirmés automatiquement après `MOCK_PAYOUT_DELAY_MS` (ou via le simulateur avec leur référence).
Les adaptateurs MTN MoMo / Orange Money lèvent `BLOCKED_BY_PROVIDER_CONTRACT` (503) : aucun endpoint inventé.

## Tests contre un vrai Postgres

`TEST_DATABASE_URL=postgres://… pnpm --filter @waka/api test` : chaque fichier crée un schéma jetable et utilise
un **pool** de connexions — le test de concurrence « dernière place » s'exécute alors avec de vraies transactions
parallèles (PGlite, lui, sérialise les connexions).

## Démo

Comptes : voir `docs/CONVENTIONS.md`. Rapprochement : un écart délibéré (`MOCK-COL-0RPHAN000001`, encaissement
présent chez le PSP simulé mais absent du grand livre) existe à J-1 — `POST /v1/admin/finance/reconciliation/run {"day":"<J-1>"}`.

## Notes pour les équipes web/admin

- Listes : `{ items, nextCursor }` (`/me/bookings`, `/me/trips`, `/me/travel-requests`, `/travel-requests/:id/matches`,
  `/trips/:id/bookings`, `/admin/disputes`, `/admin/staff`).
- `POST /v1/auth/otp/verify` ⇒ `{ user: Me, isNewUser }` ; `acceptedTermsVersion` doit valoir `cgu-2026-11-v1`.
- `POST /trips/:id/start|arrival|cancel` ⇒ `{ trip, bookings }`.
- `POST /bookings` : 201 (créée) ou 200 (rejeu de la même `Idempotency-Key`).
- Codes HTTP : 400 VALIDATION_ERROR / IDEMPOTENCY_KEY_REQUIRED, 401 UNAUTHENTICATED / INVALID_SIGNATURE,
  403 FORBIDDEN / DRIVER_NOT_ELIGIBLE / VEHICLE_NOT_ELIGIBLE / SEPARATION_OF_DUTIES, 404, 409 (transitions, places,
  ALREADY_EXECUTED, DISPUTE_BLOCKS_RELEASE, HOLD_EXPIRED, IDEMPOTENCY_CONFLICT), 413, 422 (montants/allocation), 429, 503.
- Les formes de sortie admin sont typées dans `@waka/contracts` (`AdminDashboardOutput`, `AdminDisputeDetail`, …).
