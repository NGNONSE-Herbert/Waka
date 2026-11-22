# Waka — covoiturage interurbain au Cameroun

> **On waka ensemble.** Le bon trajet. Les bonnes personnes. Un paiement encadré.
>
> MVP « prêt pour un pilote en mode simulé ». **Ce projet n'est PAS prêt pour la production** : aucun paiement réel n'est possible tant que les points de [`docs/MANQUES_BLOQUANTS.md`](docs/MANQUES_BLOQUANTS.md) et [`docs/LEGAL_GATES.md`](docs/LEGAL_GATES.md) ne sont pas levés (PSP agréé sous contrat, transport, assurance, données personnelles, audit de sécurité). « Waka » est un nom de travail, voir [`docs/NAMING.md`](docs/NAMING.md).

Une place de marché à double entrée :
- le **conducteur** publie un trajet qu'il fait déjà (places, horaire, contribution) ;
- le **passager** réserve, ou publie une demande et reçoit des correspondances expliquées.

Le passager paie par MTN MoMo ou Orange Money à un **prestataire de paiement agréé**, qui conserve les fonds. Waka ne les détient jamais. Après le trajet, le passager confirme l'arrivée et le versement au conducteur est demandé. S'il signale un problème, le règlement est suspendu et un dossier contradictoire est ouvert, instruit dans une console séparée avec double approbation.

## Démarrage rapide (sans Docker)

Prérequis : Node ≥ 22 et pnpm 10.

```bash
pnpm install
pnpm build                          # domain, contracts, api, web, admin
pnpm --filter @waka/api start       # API      → http://localhost:4000   (docs OpenAPI : /docs)
pnpm --filter @waka/web start       # Web      → http://localhost:3000
pnpm --filter @waka/admin start     # Console  → http://localhost:3001
```

Au premier démarrage, l'API crée sa base **PostgreSQL embarquée (PGlite)** dans `apps/api/.pglite`, applique les migrations et charge les données de démonstration. Pour repartir de zéro, arrêtez l'API puis supprimez ce dossier. Pour un vrai PostgreSQL : `docker compose up -d`, puis `DATABASE_URL=postgres://waka:waka_dev_only@localhost:5432/waka`.

Pour le développement en rechargement à chaud : `pnpm dev`.

### Parcours de démonstration (5 minutes)

1. **Web, `http://localhost:3000`** : recherchez Douala → Yaoundé, ouvrez un trajet et cliquez sur « Réserver ».
2. Connectez-vous avec **`690 000 001`**. En mode démo, le code SMS s'affiche à l'écran.
3. Au paiement, choisissez MoMo ou Orange Money. Le **simulateur de téléphone MOCK** apparaît ; cliquez sur « Valider ».
4. Après le webhook signé, la page passe à « Réservation confirmée » et affiche le billet avec son **code d'embarquement**.
5. Connectez-vous ensuite en conducteur **`677 000 002`** (espace Conducteur) : saisissez le PIN, démarrez le trajet puis signalez l'arrivée. Signaler l'arrivée ne déclenche aucun versement.
6. Revenez en passager. Cliquez sur « Confirmer l'arrivée et autoriser le versement », ou sur « Signaler un problème ».
7. **Console, `http://localhost:3001`** : connectez-vous avec `litiges@waka.test` / `Waka-Demo-2026!` (le code TOTP s'affiche en mode démo). Instruisez le litige et proposez une répartition. **Approuvez-la avec `litiges2@waka.test`** : la personne qui propose ne peut pas approuver. Enfin, `finance@waka.test` lance le rapprochement, qui révèle un écart volontairement placé dans les données.

Tous les comptes sont listés dans [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md). Toutes les données sont fictives et marquées « Démo ».

## Architecture

Le projet est un monolithe modulaire dans un monorepo `pnpm` + Turborepo, en TypeScript strict. Le détail est dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
packages/domain      Cœur métier pur et testé : prix, machines d'états, grand livre, libération,
                     allocations de litige, matching, RBAC, interface PaymentProvider
packages/contracts   Schémas Zod partagés et catalogue des routes (API ⇄ web ⇄ admin)
apps/api             NestJS + Drizzle (PGlite / PostgreSQL), outbox transactionnelle, PSP MOCK signé
apps/web             Next.js App Router + Tailwind : passagers & conducteurs, PWA, FR/EN
apps/admin           Next.js : console « Waka Contrôle » (KYC, litiges, finances, audit) — MFA
docs/                PRD, architecture, sécurité, flux de paiement, litiges, décisions, API,
                     déploiement, portes juridiques, plan de test, manques bloquants, naming
```

## Commandes

| Commande | Effet |
|---|---|
| `pnpm lint` / `pnpm typecheck` | Vérifications statiques de tous les paquets |
| `pnpm test` | Tests unitaires et d'intégration (domaine, API sur PGlite, web, admin) |
| `pnpm build` | Build de production de tous les paquets |
| `pnpm --filter @waka/web test:e2e` | Parcours Playwright recherche → paiement MOCK → billet (API requise) |
| `node apps/api/scripts/e2e-flow.mjs http://localhost:4000` | Parcours API OTP → réservation → webhook → `CONFIRMED` |
| `TEST_DATABASE_URL=postgres://… pnpm --filter @waka/api test` | Tests de concurrence sur un vrai PostgreSQL multi-connexions |

**Dernière exécution (21/11/2026) : 20 tâches Turborepo réussies sur 20. 120 tests passent : domaine 30, API 57, web 17, admin 16.** Le parcours Playwright est passé contre l'API réelle.

## État des fonctions

| Fonction | Implémenté | Testé | Mock | Bloqué | Prochaine action |
|---|---|---|---|---|---|
| OTP +237, sessions, consentement CGU | ✅ | ✅ | SMS simulé | Fournisseur SMS | Contractualiser un agrégateur SMS |
| KYC conducteur et véhicule, revue humaine | ✅ | ✅ | Documents fictifs | Stockage chiffré et antivirus | Brancher un S3 privé, un antivirus et un prestataire KYC |
| Publication de trajet (conducteur vérifié seulement, assurance valide) | ✅ | ✅ | — | — | Récurrence (P1) |
| Recherche paginée sur la base | ✅ | ✅ | — | — | Carte et points de rendez-vous géolocalisés (P1) |
| Demande passager et matching expliqué (versionné) | ✅ | ✅ | Alertes simulées | — | Notifications push et SMS réelles |
| Réservation atomique, zéro surréservation | ✅ | ✅ (8 requêtes concurrentes) | — | — | Faire tourner la CI sur un vrai PostgreSQL |
| Paiement, webhooks signés, anti-rejeu, re-vérification | ✅ | ✅ | **PSP MOCK** | **`BLOCKED_BY_PROVIDER_CONTRACT`** | Choisir un PSP agréé, obtenir sa sandbox, écrire les tests de contrat |
| Grand livre en partie double, append-only | ✅ | ✅ | — | — | Compte de frais PSP réels après contrat |
| PIN d'embarquement, démarrage, arrivée | ✅ | ✅ | — | — | Tests utilisateurs terrain |
| Confirmation passager → un seul versement | ✅ | ✅ | Versement simulé | PSP | Idem paiement |
| Litiges : preuves, décision, double approbation, recours | ✅ | ✅ | Exécution PSP simulée | Politique validée par un juriste | Valider la matrice d'annulation et la juridiction |
| Rapprochement PSP ↔ grand livre | ✅ | ✅ | Relevé simulé | Format du relevé PSP | Adapter au format réel |
| Console admin : RBAC, MFA, audit chaîné | ✅ | ✅ | TOTP affiché en démo | — | Clés matérielles (WebAuthn) pour la finance |
| PWA, FR/EN, mobile 360 px | ✅ | Partiel | — | — | Audit d'accessibilité automatisé et tests sur Android d'entrée de gamme |
| Messagerie antifraude (FR-19) | ✅ API et mobile | ✅ | — | — | Ajouter la messagerie au site web |
| Application mobile Expo (`apps/mobile`) | ✅ | Parcours vérifiés | PSP MOCK | Notifications push | Tests sur plusieurs appareils Android |

## Limites connues (honnêtes)

- **Aucun paiement réel.** Les adaptateurs MTN MoMo et Orange Money renvoient volontairement `BLOCKED_BY_PROVIDER_CONTRACT`. Aucun endpoint, identifiant ou signature de fournisseur n'a été inventé.
- **Concurrence :** PGlite sérialise les connexions. Le test « dernière place » est probant sur la logique SQL (décrément conditionnel et contrainte `CHECK`), mais la preuve sous vraie concurrence demande `TEST_DATABASE_URL` (prévu en CI).
- **Pas de Redis :** une outbox transactionnelle et un worker en processus remplacent BullMQ (ADR-004). Les rate limits hors OTP sont en mémoire, ce qui suppose une seule instance.
- **Libération automatique** en l'absence de réponse du passager : **désactivée** tant qu'aucune référence de validation juridique n'est saisie (ADR-007).
- **Fin de parcours :** les parcours conducteur, litige côté utilisateur et anglais compilent et sont couverts par les tests de l'API, mais n'ont pas été vérifiés écran par écran par un humain.
- **Remboursement partiel :** après un remboursement partiel où le conducteur reçoit 0 FCFA, le paiement reste en `PARTIALLY_REFUNDED`, ce qui sert d'état final de fait. Il faut décider s'il faut un état terminal dédié.

Captures d'écran : `apps/web/screenshots/` (390 et 1440 px) et `apps/admin/screenshots/`.
