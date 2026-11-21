# Waka Contrôle — `apps/admin`

Console staff séparée de Waka (covoiturage interurbain, Cameroun). Next.js App Router · TypeScript strict · Tailwind v4 · Radix Dialog · lucide-react · Manrope/Inter.

> Environnement **MOCK / SANDBOX — aucun flux réel**. La console n’initie aucun débit : il n’existe pas de bouton « payer le conducteur ».

## Lancer

```bash
pnpm install                      # depuis la racine
pnpm --filter @waka/admin dev     # http://localhost:3001 (API attendue sur http://localhost:4000)
pnpm --filter @waka/admin build && pnpm --filter @waka/admin start
pnpm --filter @waka/admin typecheck   # = lint (tsc --noEmit)
pnpm --filter @waka/admin test        # vitest : aperçu de répartition, masquage par rôle, CSV, formats
```

`API_URL` (défaut `http://localhost:4000`) : `next.config.ts` réécrit `/api/:path*` → `${API_URL}/:path*`. Le navigateur ne parle jamais au port 4000 ; le cookie `waka_admin` (HttpOnly) est posé par l’API via ce proxy. Toutes les requêtes mutantes portent `X-Waka-Request: 1`. Les chemins viennent de `ROUTES.admin` (`@waka/contracts`), jamais codés en dur.

Comptes de démo : `support@`, `litiges@`, `litiges2@`, `finance@`, `admin@waka.test` — mot de passe `Waka-Demo-2026!` ; hors production la réponse de login contient `devTotp`, affiché dans une bannière **DEV**.

## Écrans

| Route | Contenu | Permission (masquage UI) |
|---|---|---|
| `/login` | e-mail + mot de passe → TOTP 6 chiffres, bannière DEV, avis de sécurité, motifs d’expiration | — |
| `/` | Cockpit : trajets à venir, réservations par état, détenu PSP vs frais acquis (volume ≠ CA), litiges par priorité, KYC, rapprochement/anomalies — graphiques SVG + tables alternatives | `admin:access` |
| `/kyc` | File conducteurs/véhicules, tiroir de détail non sensible (plaque masquée, échéances expirées/proches), décision avec motif obligatoire | `kyc:review` |
| `/litiges` | File triée priorité (SÉCURITÉ d’abord) puis échéance, filtres état/priorité/attribution, puces SLA | `dispute:view_all` ou `view_assigned` |
| `/litiges/[id]` | En-tête + stepper d’états, parties masquées, faits de réservation, paiement + grand livre, chronologie, éléments contradictoires, actions selon état ET rôle, proposition avec aperçu `validateAllocation`, approbation bloquée pour le proposant, décision et exécution PSP affichées séparément | idem + `propose`/`approve` |
| `/finances/paiements` | Table filtrable par état (libellés exacts `PAYMENT_STATE_LABEL_FR`), export CSV | `finance:view` |
| `/finances/rapprochement` | Dernière exécution par jour, totaux PSP vs grand livre, écarts, « Lancer » (FINANCE), export CSV | `finance:view` / `finance:reconcile` |
| `/finances/grand-livre?bookingId=` | Journaux en lecture seule, totaux débit/crédit, contrôle d’équilibre | `finance:view` |
| `/audit` | Journal immuable, empreinte courte, contrôle local de chaînage + indicateur serveur | `audit:view` |
| `/politiques` | Frais, non-réponse (auto-libération désactivée sans référence juridique), matrice d’annulation « à valider juridiquement » | `admin:access` |

Le masquage par rôle (`src/lib/permissions.ts`, basé sur `ROLE_PERMISSIONS` du domaine) est un confort : l’API reste seule juge (RBAC/ABAC, MFA, séparation des tâches).

## Formes de réponse

Les sorties admin sont désormais décrites dans `@waka/contracts` (`AdminDashboardOutput`, `AdminDisputeDetail`, `KycQueueOutput`, `AdminPaymentsOutput`, `LedgerOutput`, `AuditOutput`, `PoliciesOutput`…). `src/lib/normalize.ts` et `src/lib/models.ts` les lisent de façon **tolérante** (valeurs absentes → « — ») : toute divergence se corrige à un seul endroit.

Points d’intégration avec l’API réelle (vérifiés en exécution) :
- `allowedActions` du détail de litige fait foi pour l’affichage des actions ; le calcul local (rôle + machine d’états) ne sert que de repli. Séparation des tâches et MFA restent expliquées côté UI.
- Décision affichée = `decisions[0]` (la plus récente) ; exécution PSP = `execution` (statut + remboursements/versements), affichée séparément.
- `GET /finance/reconciliation` renvoie le rapport d’**un** jour (`?day=`) : la console interroge les 7 derniers jours pour « dernière exécution par jour ».
- `GET /finance/ledger` ne filtre pas par réservation : le filtre `?bookingId=` est appliqué côté client.
- L’audit ne renvoie que `actorId` : les noms du personnel sont résolus via `GET /staff`.
- FINANCE (`dispute:approve_decision`) voit la file des litiges, comme côté API.

## Stub de développement (facultatif)

`pnpm --filter @waka/admin dev:stub` lance `scripts/stub-api.mjs` (port 4010, **données fictives en mémoire**, refuse `NODE_ENV=production`) + la console pointée dessus. Il a servi avant la disponibilité des contrôleurs admin ; ses formes sont antérieures aux contrats (la console les accepte grâce à la lecture tolérante). Préférez l’API réelle.

## Captures (1440 px, API réelle, données de seed)

`screenshots/01-login-totp.png`, `02-cockpit.png`, `03-litiges-file.png`, `04-proposition-apercu.png`, `05-litige-detail-approuve.png`, `06-rapprochement.png`, `07-audit.png`.

## Structure

```
src/app/login            connexion + MFA
src/app/(console)/…      écrans (layout client : session + shell)
src/components           ui, status, charts (SVG), drawer, shell, session
src/lib                  api (fetch + CSRF + 401), normalize/models, permissions, split, csv, format
test/helpers.test.ts     tests vitest
```
