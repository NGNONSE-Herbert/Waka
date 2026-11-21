# Registre des décisions d'architecture (ADR)

> Version de travail 0.1 — 21 novembre 2026. Chaque décision indique son contexte, la décision, ses conséquences et le signal qui doit déclencher sa révision. Toute dérogation aux conventions (`docs/CONVENTIONS.md`) est consignée ici.

## Résumé exécutif

| ADR | Décision | Statut | Écart vs cahier des charges |
|---|---|---|---|
| 001 | Monolithe modulaire NestJS | Acceptée | Conforme (§10.2) |
| 002 | Monorepo pnpm + Turborepo | Acceptée | Conforme |
| 003 | Drizzle ORM + PGlite (dev/test), PostgreSQL (prod) | Acceptée | **Écart** : Prisma suggéré |
| 004 | Outbox transactionnelle + worker en processus avant BullMQ | Acceptée | **Écart temporaire** : Redis/BullMQ suggéré |
| 005 | Sessions cookie opaques + proxy même-origine + en-tête CSRF | Acceptée | Conforme (§13.2) |
| 006 | PSP MOCK strictement dev ; adaptateurs réels `BLOCKED_BY_PROVIDER_CONTRACT` | Acceptée | Conforme (prompt §2) |
| 007 | Libération automatique sur silence du passager désactivée par défaut | Acceptée | Conforme (§6.4, prudence) |
| 008 | PIN d'embarquement à 4 chiffres avec limite de tentatives | Acceptée | Précision du §4.1 |
| 009 | Nom de travail « Waka » | Acceptée (provisoire) | Remplace KÔVO |
| 010 | PostGIS reporté en P2 ; matching ville à ville au MVP | Acceptée | **Écart temporaire** : PostGIS suggéré |

---

## ADR-001 — Monolithe modulaire

- **Contexte.** Le cœur du produit enchaîne réservation, paiement, ledger et litige, avec des invariants d'atomicité (zéro survente, aucun double versement). L'équipe pilote est réduite ; la plateforme doit être auditable par un PSP et un pentesteur.
- **Décision.** Une seule API NestJS découpée en modules (Auth, Users, Drivers, Vehicles, Trips, Requests, Matching, Bookings, Payments, Ledger, Disputes, Notifications, Reviews, Admin, Audit). Les règles pures vivent dans `packages/domain`, les contrats dans `packages/contracts`.
- **Conséquences.** Transactions Postgres locales pour les flux critiques ; un seul artefact à déployer et à auditer ; discipline nécessaire sur les frontières (pas d'accès direct aux tables d'un autre module hors services exposés).
- **Révision si.** Un module a des besoins de mise à l'échelle ou de cycle de déploiement nettement différents (ex. notifications à fort volume), ou l'équipe dépasse ~3 squads.

## ADR-002 — Monorepo pnpm + Turborepo

- **Contexte.** Trois applications (api, web, admin) partagent types, schémas et règles métier ; les contrats doivent rester synchronisés.
- **Décision.** Monorepo `pnpm` (workspaces, `packageManager: pnpm@10.13.1`) orchestré par Turborepo (`build`, `lint`, `typecheck`, `test`, `test:e2e`), Node ≥ 22, TypeScript strict.
- **Conséquences.** Une modification de `packages/contracts` casse la compilation de tout consommateur incohérent ; cache de build ; une seule CI.
- **Révision si.** Les temps de CI deviennent prohibitifs ou une application doit être confiée à une équipe externe avec un dépôt séparé.

## ADR-003 — Drizzle ORM + PGlite en dev/test, PostgreSQL en production

- **Contexte.** Le cahier suggère Prisma « ou équivalent ». Les flux critiques exigent du SQL explicite (`SELECT … FOR UPDATE`, `SKIP LOCKED`, `CHECK`, triggers append-only). Les postes de développement ne disposent pas tous de Docker.
- **Décision.** Drizzle ORM (SQL typé, proche du SQL réel, migrations SQL lisibles). En dev et en tests : **PGlite**, un vrai moteur Postgres compilé en WebAssembly, embarqué dans le processus — aucun service à installer. Lorsque `DATABASE_URL` est défini : pilote `node-postgres` vers un PostgreSQL standard (staging, production, CI de concurrence).
- **Justification vs Prisma.** (1) Postgres réel sans Docker, donc mêmes contraintes, triggers et types qu'en production ; (2) verrous et requêtes SQL explicites sans contournement par du SQL brut non typé ; (3) migrations SQL relisibles par un auditeur.
- **Conséquences.** PGlite **sérialise** les connexions : il ne prouve pas l'absence de course sous vraie concurrence. Les tests de concurrence doivent aussi tourner sur un Postgres réel (`TEST_DATABASE_URL`) en CI (voir [`TEST_PLAN.md`](./TEST_PLAN.md)). PGlite n'est jamais utilisé en production.
- **Révision si.** Une limitation PGlite bloque une fonctionnalité nécessaire (ex. extension PostGIS en dev), ou Drizzle ne couvre pas un besoin de migration.

## ADR-004 — Outbox transactionnelle + worker en processus avant BullMQ

- **Contexte.** Les effets de bord (SMS, appels PSP, expiration des holds, rapprochement) doivent être fiables et cohérents avec la base. Redis ajoute un service à opérer et une seconde source d'état.
- **Décision.** Table `outbox_jobs` écrite dans la **même transaction** que le changement métier ; worker intégré au processus API qui réclame des lots, applique un backoff borné et met en quarantaine après N échecs. Gestionnaires idempotents.
- **Conséquences.** Aucune perte d'événement en cas de crash entre commit et envoi ; débit limité au processus API ; en multi-instance, la réclamation doit utiliser `FOR UPDATE SKIP LOCKED` (Postgres réel).
- **Révision si.** Plus d'une instance d'API en production avec latence de traitement dégradée, besoin de planification fine, ou volume soutenu d'événements. Migration vers Redis + BullMQ en conservant l'outbox comme source.

## ADR-005 — Sessions cookie opaques, proxy même-origine, en-tête CSRF

- **Contexte.** Applications web avec utilisateurs sur Android bas/milieu de gamme ; risque de vol de jeton (XSS) et de CSRF ; besoin de révocation immédiate (SIM swap, staff).
- **Décision.** Jeton aléatoire opaque dans un cookie `HttpOnly` (`waka_session` utilisateurs, `waka_admin` staff), `SameSite=Lax`, `Secure` en production ; seul le SHA-256 du jeton est stocké. Web et admin appellent l'API via un **proxy même-origine** (`/api/:path*` → `API_URL`), le navigateur ne parle jamais au port 4000. Toute mutation exige `X-Waka-Request: 1` (sinon `403`), sauf `/v1/webhooks/*` authentifiés par signature.
- **Conséquences.** Pas de JWT exposé à JavaScript ; révocation simple ; pas de CORS à configurer ; chaque requête nécessite une lecture de session (acceptable au MVP).
- **Révision si.** Applications natives (FR-24) nécessitant un autre mécanisme (jetons liés à l'appareil), ou besoin de SSO staff.

## ADR-006 — PSP MOCK strictement dev ; adaptateurs réels bloqués

- **Contexte.** Aucun contrat PSP n'est signé ; aucune documentation contractuelle d'API MTN MoMo / Orange Money pour ce cas d'usage n'est disponible. Inventer des endpoints ou des signatures serait trompeur et dangereux.
- **Décision.** Interface `PaymentProvider` à capacités déclarées. Adaptateur `MOCK` (webhooks signés HMAC, simulateur de téléphone étiqueté MOCK, endpoint `POST /v1/dev/mock-psp/:providerRef/complete`) disponible **uniquement hors production** : l'API refuse de démarrer avec `PAYMENT_PROVIDER=mock` et `NODE_ENV=production`. Les adaptateurs MTN et Orange existent sous forme de stubs qui lèvent `BLOCKED_BY_PROVIDER_CONTRACT`.
- **Conséquences.** Tous les flux sont testables de bout en bout sans argent réel ; aucune démonstration ne peut laisser croire à un paiement réel ; l'intégration réelle demandera tests de contrat et certification PSP.
- **Révision si.** Contrat signé et sandbox fournie : écrire l'adaptateur `SANDBOX`, tests de contrat, puis `LIVE` après les portes de [`LEGAL_GATES.md`](./LEGAL_GATES.md).

## ADR-007 — Libération automatique sur silence du passager désactivée par défaut

- **Contexte.** Le cahier évoque une fenêtre (exemple : 48 h) après laquelle une libération « peut être envisagée » si le PSP l'autorise, si le contrat l'annonce et si les preuves sont suffisantes. Libérer sur silence engage la responsabilité de la plateforme et dépend du droit applicable.
- **Décision.** `DEFAULT_NO_RESPONSE_POLICY = { autoReleaseEnabled: false, windowHours: 48, legallyValidatedRef: null }`. Après la fenêtre, `noResponseOutcome` renvoie `MANUAL_REVIEW`. L'activation exige **à la fois** le drapeau et une référence de validation juridique ; un litige ouvert renvoie toujours `WAIT`.
- **Conséquences.** Charge de revue manuelle au pilote ; le conducteur n'est pas laissé sans recours (revue tracée, SLA). Politique versionnée (`noresp-2026-11-v0`).
- **Révision si.** Avis écrit du juriste + accord PSP + CGU mises à jour ; ou volume de revues manuelles incompatible avec le SLA.

## ADR-008 — PIN d'embarquement à 4 chiffres avec limite de tentatives

- **Contexte.** Il faut une preuve d'embarquement à deux sources, utilisable sans réseau fiable ni appareil photo performant (QR plus fragile sur Android bas de gamme).
- **Décision.** Le passager reçoit un PIN à 4 chiffres unique par réservation, visible uniquement une fois la réservation `CONFIRMED`. Le conducteur le saisit (`POST /v1/bookings/:id/check-in`, schéma `^\d{4}$`). Le PIN est stocké haché ; le nombre de tentatives est limité à 5 par réservation (`CHECK (pin_attempts BETWEEN 0 AND 5)`), puis l'embarquement est verrouillé et orienté vers le support. Le PIN n'est jamais réutilisable.
- **Conséquences.** 10 000 combinaisons : la sécurité repose sur la limite de tentatives et sur l'authentification du conducteur participant ; le PIN n'est pas une preuve irréfutable et reste contestable en litige.
- **Révision si.** Fraude observée à l'embarquement, ou passage à des applications natives permettant un QR signé hors ligne.

## ADR-009 — Nom de travail « Waka »

- **Contexte.** « KÔVO » était un nom de projet fictif. « Waka » (marcher, se déplacer, dans l'usage camerounais) est court, mémorisable et prononçable en français et en anglais.
- **Décision.** Nom de travail « Waka », source unique `packages/domain/src/brand.ts`, mention « nom de travail, marque non déposée » dans les mentions légales. Promesse prudente : « Le bon trajet. Les bonnes personnes. Un paiement encadré. »
- **Conséquences.** Renommer = modifier `brand.ts` et le logo. Aucune communication publique avant vérification OAPI, domaine et réseaux sociaux.
- **Révision si.** Antériorité de marque, nom de domaine indisponible, connotation négative identifiée lors des tests utilisateurs.

## ADR-010 — PostGIS reporté en P2

- **Contexte.** Le MVP relie des villes à des villes avec des points de rendez-vous connus. Le matching sur itinéraire (détour, ordre sur la polyline) exige PostGIS, un service d'itinéraires sous contrat et un budget de requêtes cartographiques.
- **Décision.** Matching ville à ville (`exclusionReason` + `scoreMatch`, version `match-2026-11-v1`) sur des codes de ville fermés (DLA, YDE, KRI, BFS, LIM, BUE, EDE, BAM) ; points de rendez-vous en référentiel. Pas de PostGIS au MVP.
- **Conséquences.** Les passagers « sur la route » (ex. Edéa sur DLA → YDE) ne sont pas proposés automatiquement ; durées affichées comme estimations indicatives. Aucune distance codée en dur n'est présentée comme exacte.
- **Révision si.** FR-23 priorisé, demande mesurée de points intermédiaires, contrat cartographique conclu.
