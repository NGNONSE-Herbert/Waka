# Déploiement et exploitation

> Version de travail 0.1 — 21 novembre 2026. Les procédures locales s'appuient sur les fichiers du dépôt (`package.json`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`). Les sections « cible » décrivent l'organisation à mettre en place pour staging et production ; aucune n'est encore opérée. Les objectifs chiffrés sont des **cibles de conception**, pas des garanties.

## Résumé exécutif

- **Local sans Docker** : PGlite (Postgres embarqué) démarre automatiquement si `DATABASE_URL` est vide ; PSP MOCK, SMS mockés.
- **Local avec Docker** (optionnel) : `docker compose up -d` lance PostgreSQL/PostGIS et Redis (Redis réservé à une future migration BullMQ).
- **Trois environnements isolés** (dev, staging, prod) : comptes, bases, secrets et clés PSP distincts ; MOCK interdit en production (l'API refuse de démarrer).
- **Cible** : hébergeur cloud managé, Postgres managé chiffré avec restauration à un instant donné, stockage objet privé, CDN/WAF, gestionnaire de secrets, OpenTelemetry.
- **Continuité** : RPO cible 24 h, RTO cible 4 h au pilote, à confirmer avec le budget et **démontrés par un test de restauration** avant production.

## 1. Environnement local

### 1.1 Prérequis
- Node.js ≥ 22 (la CI utilise Node 24), pnpm 10 (`packageManager: pnpm@10.13.1`).
- Docker : facultatif.

### 1.2 Sans Docker (par défaut)

```bash
pnpm install
cp .env.example .env          # ne jamais committer .env
pnpm --filter @waka/api db:migrate
pnpm db:seed                  # données de démonstration clairement fictives
pnpm dev                      # api :4000, web :3000, admin :3001
```

- Base : PGlite, fichiers locaux dans `apps/api/.pglite`.
- Paiement : `PAYMENT_PROVIDER=mock`, secret `MOCK_PSP_WEBHOOK_SECRET` de développement.
- OTP : code renvoyé dans `devCode` (hors production uniquement). Comptes de démonstration : voir `docs/CONVENTIONS.md`.

### 1.3 Avec Docker (Postgres réel)

```bash
docker compose up -d
# puis dans .env :
# DATABASE_URL=postgres://waka:waka_dev_only@localhost:5432/waka
# TEST_DATABASE_URL=postgres://waka:waka_dev_only@localhost:5432/waka_test
pnpm --filter @waka/api db:migrate
pnpm db:seed
pnpm dev
```

Indispensable pour exécuter les tests de concurrence localement (PGlite sérialise les connexions).

### 1.4 Commandes de qualité

| Commande | Rôle |
|---|---|
| `pnpm lint` | Analyse statique |
| `pnpm typecheck` | TypeScript strict |
| `pnpm test` | Tests unitaires et d'intégration |
| `pnpm test:e2e` | Playwright (web) |
| `pnpm build` | Build de toutes les applications |

## 2. Environnements

| | dev (local) | staging | production |
|---|---|---|---|
| Base | PGlite ou Postgres Docker | Postgres managé dédié | Postgres managé dédié, haute disponibilité |
| PSP | MOCK | SANDBOX du PSP (après contrat) | LIVE (après portes GO) |
| Données | Seed fictif (`isDemo = true`) | Seed fictif ou anonymisé — **jamais de données de production** | Réelles |
| Secrets | `.env` local | Gestionnaire de secrets, projet séparé | Gestionnaire de secrets, projet séparé, accès nominatif |
| OpenAPI `/docs` | Activé | Activé, accès restreint | Désactivé |
| Accès admin | Local | Réseau restreint + MFA | Réseau restreint (VPN/allowlist) + MFA |
| Comptes cloud | — | Compte/projet distinct | Compte/projet distinct, moindre privilège |

Aucun flux réseau ni identifiant partagé entre staging et production.

## 3. Options d'hébergement managé

Comparaison neutre, sans considération tarifaire ; le choix final dépend de la localisation des données (Loi n°2024/017, transferts — voir [`LEGAL_GATES.md`](./LEGAL_GATES.md) D4), de la latence vers le Cameroun et du contrat.

| Option | Atouts | Points d'attention |
|---|---|---|
| Hyperscaler (AWS, Google Cloud, Azure) | Postgres managé avec PITR, KMS, stockage objet, WAF, observabilité intégrés ; certifications étendues | Complexité de configuration ; régions hors Afrique centrale ⇒ transferts de données à encadrer |
| PaaS conteneurs (Render, Railway, Fly.io, Scalingo ou équivalents) | Mise en route rapide, déploiements simples | Contrôles réseau et conformité variables selon l'offre ; vérifier PITR, chiffrement, localisation |
| Vercel (front) + API sur un hébergeur managé | Excellent pour Next.js, CDN intégré | Deux fournisseurs à gérer ; proxy `/api` à configurer vers l'API |
| Hébergeur ou datacenter au Cameroun / en Afrique centrale | Proximité, localisation des données | Vérifier disponibilité de Postgres managé, sauvegardes, SLA, sécurité physique ; offres à évaluer |

## 4. Gestion des secrets

- Aucun secret dans le dépôt (scan gitleaks en CI) ; `.env.example` ne contient que des valeurs de développement explicitement marquées.
- Secrets de staging/production dans un gestionnaire dédié, injectés à l'exécution ; accès nominatif et journalisé.
- Rotation : clés de signature webhook PSP, secrets de session/TOTP, identifiants base — à la demande et après tout départ ou incident.
- Clés de chiffrement des documents KYC gérées par un KMS ; séparation entre opérateurs de la base et détenteurs des clés.

## 5. Migrations

| Règle | Détail |
|---|---|
| Format | Fichiers SQL versionnés dans `apps/api/migrations/` (`0001_init.sql`, …), appliqués par `pnpm --filter @waka/api db:migrate` |
| Ordre de déploiement | Migration **avant** déploiement du code ; migrations rétrocompatibles (expand → migrate → contract) |
| Interdits | Aucune migration ne modifie ou ne supprime des écritures de `ledger_*` ou `audit_logs` ; les triggers append-only ne sont jamais désactivés en production |
| Validation | Exécution sur staging avec un volume représentatif ; sauvegarde vérifiée juste avant la migration en production |
| Seed | Jamais exécuté en production |

## 6. Sauvegardes et restauration

| Élément | Cible |
|---|---|
| Base | Sauvegarde automatique quotidienne chiffrée + restauration à un instant donné (PITR) |
| Stockage KYC | Versionnage + réplication, chiffrement |
| Rétention des sauvegardes | À aligner sur les durées validées par le juriste |
| Copie hors compte | Copie dans un compte/projet séparé, accès restreint |
| **RPO** | 24 h maximum (cible pilote ; PITR permet de viser mieux) |
| **RTO** | 4 h (cible pilote) |
| Test de restauration | Avant la mise en production, puis au moins trimestriel : restauration complète sur un environnement isolé, vérification de la chaîne d'audit et de l'équilibre du ledger, procès-verbal |

Après une restauration, un **rapprochement PSP immédiat** est obligatoire : les événements survenus chez le PSP pendant la fenêtre perdue doivent être réintégrés (réinterrogation des statuts), jamais devinés.

## 7. Observabilité

| Signal | Mise en œuvre cible |
|---|---|
| Traces | OpenTelemetry (HTTP, base, appels PSP), propagation du `requestId` |
| Logs | JSON structurés, niveau configurable (`LOG_LEVEL`), sans secrets, OTP, PIN, numéros complets ni documents |
| Métriques | Latence p95 par route (cible < 500 ms hors PSP et géocodage), taux d'erreur, profondeur de l'outbox, jobs `DEAD` |
| Erreurs | Outil de suivi d'erreurs (Sentry ou équivalent), données personnelles filtrées |
| Disponibilité | Sonde externe ; cible 99,5 % mensuelle au pilote, hors dépendances tierces documentées |

### Alertes prioritaires (astreinte)

| Alerte | Seuil indicatif | Action |
|---|---|---|
| Écart de rapprochement | > 0 FCFA ou rapprochement non exécuté à J+1 | Finance + CTO, blocage des libérations concernées |
| Anomalie de montant/devise/marchand | Toute occurrence | `MANUAL_REVIEW`, enquête |
| Échecs de signature webhook | Pic anormal | Suspicion de forge, playbook sécurité |
| Paiement sans callback | `PSP_PENDING` au-delà du délai fixé avec le PSP | Réinterrogation, contact PSP |
| Outbox en quarantaine | Tout job `DEAD` | Analyse, rejeu manuel idempotent |
| Rupture de chaîne d'audit | Toute occurrence | Incident de sécurité |
| Pic d'OTP / d'échecs de login staff | Seuil à calibrer | Rate limit renforcé, enquête |
| Litige SAFETY ouvert | Toute occurrence | Astreinte sûreté |

## 8. CDN, WAF et réseau

- CDN devant web et admin ; ressources statiques compressées, cache adapté au faible débit.
- WAF : règles OWASP de base, limitation de débit, protection des routes d'authentification.
- Endpoint webhook : chemin dédié, limitation de débit, liste d'adresses IP du PSP si le PSP la fournit (en complément, jamais à la place de la signature).
- Console admin : accès réseau restreint, en-têtes de sécurité stricts, non indexée.
- Sortie réseau de l'API limitée aux destinations nécessaires (PSP, SMS, monitoring).

## 9. Processus de mise en production

1. Branche → revue de code (au moins une approbation, deux pour `packages/domain`, migrations et module Payments).
2. CI verte : lint, typecheck, tests (dont concurrence sur Postgres), build, audit des dépendances, scan de secrets.
3. Déploiement automatique sur staging, tests E2E et DAST.
4. Validation manuelle du responsable produit ; pour tout changement financier, validation du responsable paiements.
5. Migration, puis déploiement production progressif (une instance, puis toutes), surveillance renforcée pendant 1 h.
6. Note de version et entrée dans le journal des changements.

Gel des déploiements pendant un incident ouvert et pendant les fenêtres de forte activité convenues avec les opérations.

## 10. Retour arrière

| Situation | Action |
|---|---|
| Défaut applicatif | Redéployer l'image précédente (images immuables et étiquetées) |
| Migration en cause | Migrations rétrocompatibles ⇒ retour du code sans retour de schéma ; correction par nouvelle migration |
| Incident financier | Interrupteurs : désactiver l'initiation de paiement, geler toutes les libérations ; rapprochement ; corrections par contre-écriture uniquement |
| Données corrompues | Restauration PITR sur environnement isolé, comparaison, puis décision documentée |

Aucune opération manuelle en base de production sans ticket, double validation et trace d'audit.
