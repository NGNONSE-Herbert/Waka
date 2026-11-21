# API Waka — référence

> Source de vérité : `packages/contracts/src/index.ts` (schémas Zod, `ROUTES`). OpenAPI interactif : `http://localhost:4000/docs` (hors production). Ce tableau est généré depuis `ROUTES`.

## Règles transverses

| Règle | Détail |
|---|---|
| Préfixe | `/v1` — via le proxy même-origine `/api/v1/*` des apps web et admin |
| Authentification | Cookie opaque `waka_session` (utilisateurs) / `waka_admin` (staff, MFA TOTP) |
| Anti-CSRF | En-tête `X-Waka-Request: 1` obligatoire sur toute requête mutante (sauf webhooks) |
| Idempotence | En-tête `Idempotency-Key` (UUID) obligatoire sur `POST /v1/bookings` et `POST /v1/bookings/:id/payments` |
| Entrées | Schémas Zod `.strict()` : aucun montant, statut, commission ou destination de versement n'est accepté du client |
| Erreurs | `{ error: { code, message, requestId, details? } }` — 400 VALIDATION_ERROR, 401 INVALID_SIGNATURE, 403 FORBIDDEN, 404 NOT_FOUND, 409 INVALID_TRANSITION / SEATS_UNAVAILABLE / ALREADY_EXECUTED, 429 RATE_LIMITED, 503 BLOCKED_BY_PROVIDER_CONTRACT |
| Listes | `{ items, nextCursor }` |

## Routes

| Clé | Méthode & chemin | Accès |
|---|---|---|
| `auth.otpStart` | `POST /v1/auth/otp/start` | Public (limité) |
| `auth.otpVerify` | `POST /v1/auth/otp/verify` | Public (limité) |
| `auth.logout` | `POST /v1/auth/logout` | Utilisateur connecté (contrôle de propriété) |
| `auth.me` | `GET /v1/me` | Utilisateur connecté (contrôle de propriété) |
| `cities` | `GET /v1/cities` | Public (limité) |
| `trips.search` | `GET /v1/trips` | Public (limité) |
| `trips.detail` | `GET /v1/trips/:id` | Public (limité) |
| `trips.create` | `POST /v1/trips` | Utilisateur connecté (contrôle de propriété) |
| `trips.cancel` | `POST /v1/trips/:id/cancel` | Utilisateur connecté (contrôle de propriété) |
| `trips.mine` | `GET /v1/me/trips` | Utilisateur connecté (contrôle de propriété) |
| `trips.start` | `POST /v1/trips/:id/start` | Utilisateur connecté (contrôle de propriété) |
| `trips.arrival` | `POST /v1/trips/:id/arrival` | Utilisateur connecté (contrôle de propriété) |
| `trips.bookings` | `GET /v1/trips/:id/bookings` | Public (limité) |
| `driver.onboarding` | `POST /v1/driver/onboarding` | Utilisateur connecté (contrôle de propriété) |
| `driver.vehicles` | `POST /v1/driver/vehicles` | Utilisateur connecté (contrôle de propriété) |
| `driver.earnings` | `GET /v1/driver/earnings` | Utilisateur connecté (contrôle de propriété) |
| `requests.create` | `POST /v1/travel-requests` | Utilisateur connecté (contrôle de propriété) |
| `requests.mine` | `GET /v1/me/travel-requests` | Utilisateur connecté (contrôle de propriété) |
| `requests.matches` | `GET /v1/travel-requests/:id/matches` | Utilisateur connecté (contrôle de propriété) |
| `requests.cancel` | `DELETE /v1/travel-requests/:id` | Utilisateur connecté (contrôle de propriété) |
| `bookings.create` | `POST /v1/bookings` | Utilisateur connecté (contrôle de propriété) |
| `bookings.mine` | `GET /v1/me/bookings` | Utilisateur connecté (contrôle de propriété) |
| `bookings.detail` | `GET /v1/bookings/:id` | Utilisateur connecté (contrôle de propriété) |
| `bookings.pay` | `POST /v1/bookings/:id/payments` | Utilisateur connecté (contrôle de propriété) |
| `bookings.cancel` | `POST /v1/bookings/:id/cancel` | Utilisateur connecté (contrôle de propriété) |
| `bookings.checkIn` | `POST /v1/bookings/:id/check-in` | Utilisateur connecté (contrôle de propriété) |
| `bookings.confirm` | `POST /v1/bookings/:id/confirm-completion` | Utilisateur connecté (contrôle de propriété) |
| `bookings.dispute` | `POST /v1/bookings/:id/disputes` | Utilisateur connecté (contrôle de propriété) |
| `bookings.review` | `POST /v1/bookings/:id/reviews` | Utilisateur connecté (contrôle de propriété) |
| `disputes.detail` | `GET /v1/disputes/:id` | Utilisateur connecté (contrôle de propriété) |
| `disputes.evidence` | `POST /v1/disputes/:id/evidence` | Utilisateur connecté (contrôle de propriété) |
| `disputes.appeal` | `POST /v1/disputes/:id/appeal` | Utilisateur connecté (contrôle de propriété) |
| `webhooks.payments` | `POST /v1/webhooks/payments/:provider` | PSP — signature HMAC obligatoire |
| `dev.mockPspComplete` | `POST /v1/dev/mock-psp/:providerRef/complete` | Développement uniquement (absent en production) |
| `admin.login` | `POST /v1/admin/auth/login` | Staff (session admin + MFA + permission) |
| `admin.mfa` | `POST /v1/admin/auth/mfa` | Staff (session admin + MFA + permission) |
| `admin.me` | `GET /v1/admin/me` | Staff (session admin + MFA + permission) |
| `admin.logout` | `POST /v1/admin/auth/logout` | Staff (session admin + MFA + permission) |
| `admin.dashboard` | `GET /v1/admin/dashboard` | Staff (session admin + MFA + permission) |
| `admin.kycQueue` | `GET /v1/admin/kyc` | Staff (session admin + MFA + permission) |
| `admin.kycDecision` | `POST /v1/admin/kyc/drivers/:id/decision` | Staff (session admin + MFA + permission) |
| `admin.vehicleDecision` | `POST /v1/admin/kyc/vehicles/:id/decision` | Staff (session admin + MFA + permission) |
| `admin.disputes` | `GET /v1/admin/disputes` | Staff (session admin + MFA + permission) |
| `admin.dispute` | `GET /v1/admin/disputes/:id` | Staff (session admin + MFA + permission) |
| `admin.assign` | `POST /v1/admin/disputes/:id/assign` | Staff (session admin + MFA + permission) |
| `admin.triage` | `POST /v1/admin/disputes/:id/triage` | Staff (session admin + MFA + permission) |
| `admin.requestEvidence` | `POST /v1/admin/disputes/:id/request-evidence` | Staff (session admin + MFA + permission) |
| `admin.review` | `POST /v1/admin/disputes/:id/start-review` | Staff (session admin + MFA + permission) |
| `admin.propose` | `POST /v1/admin/disputes/:id/decision` | Staff (session admin + MFA + permission) |
| `admin.approve` | `POST /v1/admin/disputes/:id/approve` | Staff (session admin + MFA + permission) |
| `admin.reject` | `POST /v1/admin/disputes/:id/reject` | Staff (session admin + MFA + permission) |
| `admin.close` | `POST /v1/admin/disputes/:id/close` | Staff (session admin + MFA + permission) |
| `admin.payments` | `GET /v1/admin/payments` | Staff (session admin + MFA + permission) |
| `admin.ledger` | `GET /v1/admin/finance/ledger` | Staff (session admin + MFA + permission) |
| `admin.reconciliation` | `GET /v1/admin/finance/reconciliation` | Staff (session admin + MFA + permission) |
| `admin.runReconciliation` | `POST /v1/admin/finance/reconciliation/run` | Staff (session admin + MFA + permission) |
| `admin.audit` | `GET /v1/admin/audit` | Staff (session admin + MFA + permission) |
| `admin.policies` | `GET /v1/admin/policies` | Staff (session admin + MFA + permission) |
| `admin.staff` | `GET /v1/admin/staff` | Staff (session admin + MFA + permission) |

## Exemple de bout en bout

`node apps/api/scripts/e2e-flow.mjs http://localhost:4000` : OTP → réservation → paiement MOCK → webhook signé → `CONFIRMED`.
