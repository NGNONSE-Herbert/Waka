# Sécurité — modèle de menace et contrôles

> Version de travail 0.1 — 21 novembre 2026. Référentiels : OWASP ASVS 5.0.0 (<https://asvs.owasp.org/>) et OWASP API Security Top 10 2023 (<https://owasp.org/projects/api-security-project>). Les intitulés de chapitres ASVS cités ci-dessous sont des repères : la correspondance exacte (numéros d'exigences) est à figer lors de l'audit, sur la version publiée du standard.

## Résumé exécutif

- Les actifs critiques sont : **les instructions financières** (libération, remboursement), **l'intégrité du ledger**, **les pièces d'identité KYC**, **les comptes** (OTP, staff) et **la sécurité physique** des voyageurs.
- Principe directeur : **le client n'est jamais source de vérité**. Prix, places, statuts PSP, vérification, commission et destination de versement sont décidés côté serveur ; les schémas d'entrée les rejettent.
- Défenses structurantes : autorisation par objet sur chaque route (RBAC + ABAC), MFA staff, séparation des tâches (proposant ≠ approbateur, superadmin sans droit financier), webhooks signés **puis** réinterrogation du PSP, idempotence à tous les étages, ledger append-only, journal d'audit chaîné par hachage.
- Aucune mise en production avec argent réel sans : SAST, SCA, scan de secrets, DAST, **pentest indépendant**, et plan de réponse aux incidents testé.

## 1. Actifs et frontières de confiance

| Actif | Sensibilité | Où il vit |
|---|---|---|
| Fonds des passagers | Critique | **Chez le PSP uniquement** ; Waka ne détient que des instructions et un registre |
| Ledger, décisions, versements | Critique | Postgres, tables append-only |
| Documents KYC (CNI, permis, assurance) | Critique (données personnelles) | Stockage privé chiffré |
| Sessions, OTP, TOTP staff | Élevée | Postgres (hachés), cookies `HttpOnly` |
| Numéros MoMo / Orange Money | Élevée | Postgres, masqués dans les logs (`maskPhone`) |
| Localisation, messages | Élevée | Postgres, accès limité aux participants |
| Secrets (clés PSP, HMAC, base) | Critique | Gestionnaire de secrets, jamais dans le dépôt |

Frontières : navigateur ↔ proxy Next.js ↔ API ; PSP ↔ endpoint webhook ; console admin ↔ API (`/v1/admin/*`) ; API ↔ stockage KYC.

## 2. Modèle de menace (STRIDE)

S = usurpation, T = altération, R = répudiation, I = divulgation, D = déni de service, E = élévation de privilèges.

Chapitres ASVS 5.0 utilisés comme repères (numérotation à reconfirmer sur la version publiée) :

| Repère utilisé | Chapitre ASVS 5.0 |
|---|---|
| Validation, Logique métier | V2 — Validation and Business Logic |
| API | V4 — API and Web Service |
| Fichiers | V5 — File Handling |
| Authentification | V6 — Authentication |
| Gestion de session | V7 — Session Management |
| Autorisation | V8 — Authorization |
| Chiffrement | V11 — Cryptography |
| Communications sécurisées | V12 — Secure Communication |
| Configuration | V13 — Configuration |
| Données | V14 — Data Protection |
| Journalisation | V16 — Security Logging and Error Handling |

| # | Menace | STRIDE | Scénario | Mitigations | ASVS 5.0 | API Top 10 2023 |
|---|---|---|---|---|---|---|
| M1 | Faux conducteur | S, E | Un fraudeur publie des trajets fictifs pour encaisser | KYC avec revue humaine (`kyc:review`, MFA) ; aucun auto-marquage « vérifié » ; publication bloquée tant que conducteur et véhicule ne sont pas approuvés ; versement uniquement après confirmation passager ; bénéficiaire de versement validé par le PSP | Authentification, Autorisation, Logique métier | API5, API6 |
| M2 | Prise de compte par OTP / SIM swap | S | Vol de l'OTP ou duplication de la carte SIM | OTP à 6 chiffres, expiration courte, tentatives limitées par défi, rate limit par numéro/IP/appareil ; révocation des sessions ; signaux opérateur anti-SIM-swap **si disponibles** (à vérifier auprès des opérateurs) ; re-vérification avant changement du numéro de versement | Authentification, Gestion de session | API2, API4 |
| M3 | Détournement du numéro MoMo de versement | T, E | Un attaquant remplace le numéro bénéficiaire du conducteur | Destination de versement **jamais** acceptée dans un payload client ; changement soumis à re-vérification, délai de carence et notification à l'ancien numéro ; référence bénéficiaire gérée côté PSP | Logique métier, Autorisation | API3, API6 |
| M4 | Webhooks forgés ou rejoués | S, T | Faux « paiement réussi » envoyé à l'API | Signature HMAC sur le **corps brut**, horodatage avec fenêtre, `UNIQUE(provider, provider_event_id)`, puis **réinterrogation** `getPaymentStatus` et contrôle montant/devise/marchand ; anomalie ⇒ `MANUAL_REVIEW` | Communications sécurisées, Validation, Logique métier | API8, API10 |
| M5 | Double versement / double remboursement | T | Double clic, rejeu, course entre workers | Verrou `FOR UPDATE` sur le paiement ; `evaluateRelease` (`ALREADY_REQUESTED`) ; `validateAllocation` (`ALREADY_EXECUTED`) ; `payouts.booking_id` unique et trigger `refunds_within_payment` ; clés d'idempotence PSP ; journaux ledger à clé unique | Logique métier | API6 |
| M6 | Usurpation de rôle admin | E | Accès à `/v1/admin/*` sans droit, ou élévation | Console séparée, cookie distinct `waka_admin`, mot de passe + TOTP, MFA récente pour actions sensibles, moindre privilège (`ROLE_PERMISSIONS`), aucun rôle attribuable via l'API publique, audit de chaque accès | Authentification, Autorisation | API5 |
| M7 | Manipulation de prix | T | Le client envoie un montant ou une commission modifiée | Aucun schéma d'entrée n'accepte de montant ; prix calculé par `quote()` depuis le trajet + politique versionnée ; snapshot immuable ; contrôle montant à la confirmation PSP | Validation, Logique métier | API3, API6 |
| M8 | Survente de places | T | Réservations concurrentes sur la dernière place | Transaction + `SELECT … FOR UPDATE` sur le trajet ; `CHECK (seats_available >= 0)` ; holds expirants ; test de concurrence obligatoire | Logique métier | API6 |
| M9 | Documents KYC falsifiés | S | Faux permis ou fausse assurance | Revue humaine, contrôle des dates d'expiration à la date du trajet, vérification partenaire si disponible, signalement et suspension ; impossibilité pour le client de se déclarer vérifié | Logique métier, Fichiers | API3 |
| M10 | Harcèlement | — (sûreté) | Messages abusifs, comportement dangereux | Coordonnées non divulguées par défaut, messagerie limitée aux participants, signalement, catégorie de litige `THEFT_ASSAULT_HARASSMENT` priorité SAFETY, suspension, coopération avec les autorités sur réquisition | Autorisation, Journalisation | API1 |
| M11 | No-show concerté (collusion) | T, R | Conducteur et passager complices simulent un trajet pour blanchir ou abuser des frais | PIN d'embarquement + horodatages à deux sources, détection de motifs (mêmes paires, trajets jamais embarqués), plafonds, revue manuelle, signalement au PSP (AML/CFT relève du PSP) | Logique métier, Journalisation | API6 |
| M12 | Fraude à l'annulation | T | Annulations tardives répétées pour obtenir des remboursements | Heure serveur, politique acceptée au paiement et versionnée, sanctions sur récidive, revue des cas limites | Logique métier | API6 |
| M13 | Exfiltration des pièces KYC | I | Vol de documents via URL devinable ou accès abusif | Stockage privé chiffré, références opaques, URLs signées très courtes émises après contrôle d'accès, journalisation de chaque consultation, aucune pièce dans les logs | Données, Fichiers, Chiffrement | API1, API3 |
| M14 | Fraude interne (insider) | E, T, R | Un membre du staff s'attribue un remboursement ou modifie le ledger | Proposant ≠ approbateur (`assertDistinctApprover`), superadmin sans droit financier, personne n'a de permission « payer le conducteur », ledger sans écriture directe depuis l'UI, triggers append-only, audit chaîné, alertes sur comportement anormal | Autorisation, Journalisation | API5 |
| M15 | Accès à la réservation d'autrui (BOLA/IDOR) | I, T | Modifier l'identifiant dans l'URL | Contrôle de propriété dans chaque service (`booking.passengerId === actor`), ABAC litiges (`canViewDispute`), tests BOLA systématiques | Autorisation | API1 |
| M16 | Abus de ressources / SMS bombing | D | Spam d'OTP, scraping des trajets | Rate limit, plafonds par numéro, pagination bornée (`limit ≤ 50`), WAF | Configuration | API4 |
| M17 | Répudiation d'une décision | R | Un agent nie avoir validé | Audit chaîné avec acteur, action, avant/après, motif, IP, horodatage | Journalisation | — |

## 3. Correspondance OWASP API Security Top 10 2023

| Risque | Contrôle Waka | Vérification |
|---|---|---|
| API1 — Broken Object Level Authorization | Propriété vérifiée dans chaque service ; ABAC litiges | Tests BOLA par route (autre utilisateur ⇒ 403/404) |
| API2 — Broken Authentication | OTP limité, sessions opaques hachées, MFA staff | Tests de force brute, expiration, révocation |
| API3 — Broken Object Property Level Authorization | Zod `.strict()`, aucun champ sensible en entrée, sorties filtrées (téléphones masqués) | Tests de mass-assignment et de fuite de propriétés |
| API4 — Unrestricted Resource Consumption | Rate limit, pagination bornée, tailles de fichiers | Tests de charge et de quotas |
| API5 — Broken Function Level Authorization | `requirePermission` + MFA ; routes admin séparées | Matrice rôle × route testée |
| API6 — Unrestricted Access to Sensitive Business Flows | Idempotence, verrous, holds, plafonds, double approbation | Tests de concurrence et de rejeu |
| API7 — Server Side Request Forgery | Aucune URL fournie par l'utilisateur n'est récupérée par le serveur ; sorties réseau limitées au PSP et aux fournisseurs listés | Revue de code, egress filtré en production |
| API8 — Security Misconfiguration | En-têtes de sécurité, CORS fermé (même origine), OpenAPI désactivé en production, MOCK refusé en production | Scan de configuration, DAST |
| API9 — Improper Inventory Management | Catalogue `ROUTES` unique, versionnement `/v1`, environnements isolés | Test qui compare routes exposées et catalogue |
| API10 — Unsafe Consumption of APIs | Webhook vérifié puis réinterrogation du PSP ; montant, devise, marchand contrôlés ; timeouts | Tests de webhook forgé, de mauvais montant, de PSP indisponible |

## 4. Contrôles de sécurité

### 4.1 Identité et sessions
- OTP 6 chiffres, expiration courte, tentatives limitées ; code renvoyé dans `devCode` **hors production uniquement**.
- Cookies opaques `waka_session` / `waka_admin` : `HttpOnly`, `SameSite=Lax`, `Secure` en production ; seul le SHA-256 du jeton est stocké.
- Staff : mot de passe robuste + TOTP ; MFA récente exigée pour `dispute:propose_decision`, `dispute:approve_decision`, `finance:reconcile`, `finance:export`, `payout:approve_exception`, `policy:manage`, `kyc:review`.

### 4.2 Autorisation (matrice de `packages/domain/src/rbac.ts`)

| Permission | Passager | Conducteur | Support | Litiges | Finance | Superadmin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `trip:publish` | | ✔ | | | | |
| `booking:create` | ✔ | ✔ | | | | |
| `dispute:open` | ✔ | ✔ | | | | |
| `admin:access` | | | ✔ | ✔ | ✔ | ✔ |
| `kyc:review` | | | | ✔ | | ✔ |
| `dispute:view_assigned` | | | ✔ | | | |
| `dispute:view_all` | | | | ✔ | | ✔ |
| `dispute:request_evidence` | | | ✔ | ✔ | | |
| `dispute:propose_decision` | | | | ✔ | | |
| `dispute:approve_decision` | | | | ✔ | ✔ | |
| `finance:view` / `reconcile` / `export` | | | | | ✔ | |
| `payout:approve_exception` | | | | | ✔ | |
| `audit:view` / `policy:manage` | | | | | | ✔ |

`trip:publish` est en plus conditionné à l'éligibilité réelle (conducteur et véhicule approuvés, documents valides à la date du trajet). Aucune permission « payer le conducteur » n'existe.

### 4.3 Protection du transport et du navigateur
- HTTPS/TLS partout, HSTS, CSP restrictive, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- Proxy même-origine : CORS non nécessaire ; anti-CSRF par en-tête `X-Waka-Request: 1` sur toute mutation, en complément de `SameSite`.

### 4.4 Paiements
- Webhooks : signature sur corps brut, horodatage, unicité de l'événement, **réinterrogation** du PSP, contrôle montant/devise/marchand, transaction verrouillée. Détail : [`PAYMENT_FLOWS.md`](./PAYMENT_FLOWS.md).
- Idempotence HTTP et PSP ; ledger append-only ; rapprochement quotidien ; double approbation pour toute décision financière de litige (MVP : seuil 0 FCFA).

### 4.5 Données et fichiers
- Chiffrement en transit et au repos ; secrets hors dépôt, rotation ; isolation staging/prod.
- Fichiers : contrôle MIME réel, taille maximale, antivirus, stockage privé, URLs signées courtes, purge programmée.
- Minimisation : téléphones masqués pour les tiers, suivi de localisation opt-in et limité au trajet, aucune pièce d'identité dans les URLs ou les logs.

### 4.6 Journalisation et audit
- Logs structurés JSON avec `requestId`, sans secrets, OTP, PIN ni documents.
- Journal d'audit append-only chaîné par hachage pour toute action staff et tout événement financier ; vérification périodique de la chaîne.

## 5. Réponse aux incidents (esquisse)

| Phase | Actions |
|---|---|
| Préparation | Astreinte nommée, contacts PSP/hébergeur/juriste, playbooks (webhooks forgés, fuite KYC, prise de compte, écart de rapprochement, incident de sûreté) |
| Détection | Alertes : échecs de signature webhook, anomalies de montant, écart de rapprochement, pics d'OTP, accès KYC inhabituels, rupture de chaîne d'audit |
| Confinement | Interrupteurs : gel global des libérations, désactivation des paiements, révocation des sessions staff, rotation des secrets |
| Éradication / reprise | Correctif, restauration testée, contre-écritures si nécessaire (jamais de modification d'écriture) |
| Notification | PSP, utilisateurs concernés, autorité de protection des données selon la Loi n°2024/017 — délais et autorité compétente **à vérifier** avec le juriste |
| Retour d'expérience | Revue sans blâme sous 5 jours ouvrés, actions suivies |

## 6. Portes de sécurité avant production

| Porte | Outil indicatif | Critère |
|---|---|---|
| SAST | CodeQL, Semgrep ou équivalent | 0 vulnérabilité haute/critique ouverte |
| SCA | `pnpm audit`, Dependabot/Renovate ou équivalent | 0 dépendance critique non traitée |
| Scan de secrets | gitleaks ou équivalent, en pré-commit et CI | 0 secret détecté |
| Tests de sécurité API | Suite d'intégration BOLA, webhooks, rejeu, mass-assignment | 100 % des routes couvertes par la matrice d'autorisation |
| DAST | OWASP ZAP ou équivalent sur staging | 0 haute/critique |
| Pentest indépendant | Prestataire externe, périmètre web + admin + API + flux PSP | Rapport reçu, constats critiques/hauts corrigés et re-testés |
| Revue d'architecture paiement | Avec le PSP | Validation écrite |
| Exercice d'incident | Simulation webhook forgé + fuite KYC | Réalisé et documenté |

Tant que ces portes ne sont pas franchies, la plateforme n'est **pas** autorisée à traiter de l'argent réel.
