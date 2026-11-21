# Manques bloquants avant tout paiement réel

> Version de travail 0.1 — 21 novembre 2026. Liste honnête, sans atténuation, de ce qui empêche aujourd'hui Waka de traiter de l'argent réel. Le détail des preuves attendues figure dans [`LEGAL_GATES.md`](./LEGAL_GATES.md).

## Résumé exécutif

Le logiciel peut démontrer l'ensemble des parcours **en mode MOCK** (PSP simulé, SMS simulés, données fictives). Il **ne doit pas être mis en production** et ne doit traiter aucun paiement réel tant que les douze points ci-dessous ne sont pas levés. Les plus structurants sont le **contrat PSP** (sans retenue conditionnelle, le modèle « payer puis libérer » n'existe pas), la **qualification transport** et l'**assurance**.

## Tableau des manques

| # | Manque | Pourquoi c'est bloquant | Comment débloquer | Responsable |
|---|---|---|---|---|
| 1 | **Agrément et contrat PSP** | Sans PSP habilité et contractuellement engagé, Waka encaisserait lui-même des fonds de clients, ce qui n'est ni son métier ni, a priori, permis sans agrément (Règlement n°04/18/CEMAC/UMAC/COBAC — portée à confirmer par un juriste) | Vérifier le statut du PSP sur la liste DGTCFM/MINFI ; poser les 19 questions de [`PAYMENT_FLOWS.md`](./PAYMENT_FLOWS.md) §13 ; signer un contrat couvrant place de marché, retenue conditionnelle, remboursements, webhooks signés, relevés | Direction + resp. paiements + juriste |
| 2 | **Capacité de retenue conditionnelle et de versement multi-bénéficiaires** | C'est le cœur de la promesse : si le PSP ne sait pas retenir puis libérer sur instruction, toute mention de « paiement protégé » serait trompeuse | Démonstration en sandbox ; à défaut, lancer le pilote en mise en relation seule, ou adapter le modèle (ex. paiement direct au conducteur via le PSP) sans promesse de séquestre | Resp. paiements |
| 3 | **Identité du marchand et des bénéficiaires** | Le PSP doit connaître l'entité légale de Waka (KYB) et chaque conducteur bénéficiaire (KYC) ; sans cela, aucun versement n'est possible ni licite | Constituer le dossier KYB ; définir avec le PSP le parcours KYC conducteur et la référence bénéficiaire (`beneficiaryRef`) ; matrice AML/CFT signée | Direction + compliance |
| 4 | **Adaptateur PSP réel** | Les adaptateurs MTN MoMo et Orange Money sont `BLOCKED_BY_PROVIDER_CONTRACT` : aucun endpoint, identifiant ni format de signature n'a été inventé | Après contrat : documentation officielle, sandbox, tests de contrat sur l'interface `PaymentProvider`, certification PSP | CTO |
| 5 | **Qualification juridique du transport** | Si le service était qualifié de transport routier rémunéré (Loi n°2001/015), les conducteurs particuliers pourraient être en infraction et la plateforme engagée | Avis écrit d'un juriste transport ; le cas échéant, position du Ministère des Transports ; plafond de contribution « partage de frais » intégré à la politique de prix | Juriste transport |
| 6 | **Assurance des passagers** | Un accident sans couverture adaptée exposerait passagers, conducteurs et plateforme | Avis écrit d'un assureur sur la couverture d'un particulier transportant des passagers dans ce cadre ; RC de la plateforme | Direction + courtier |
| 7 | **Protection des données (Loi n°2024/017)** | Waka traite des pièces d'identité, numéros et déplacements : registre, base légale, formalités, transferts et durées sont des prérequis | Registre des traitements, avis sur le DPO et les formalités, cartographie des transferts (hébergement, SMS), politique de confidentialité, durées de conservation | Juriste + CTO |
| 8 | **Politique de remboursement et matrice d'annulation** | Le code applique une matrice versionnée, mais son contenu n'est validé ni juridiquement ni par le PSP ; un remboursement contesté sans base contractuelle est indéfendable | Valider la matrice (produit + juriste + PSP), l'intégrer aux CGV, la faire accepter au paiement | Produit + juriste |
| 9 | **Politique de litiges, juridiction et droit applicable** | Les décisions de Waka sont contractuelles ; sans politique publiée et clause de juridiction, elles n'ont pas de base opposable | Publier la politique de litiges, la fenêtre de recours, la juridiction compétente ; relecture juridique de [`DISPUTES.md`](./DISPUTES.md) | Juriste |
| 10 | **Disponibilité du support et procédure de sûreté** | Retenir de l'argent et gérer des incidents de sécurité implique d'être joignable ; un dossier SAFETY sans réponse est inacceptable | Horaires publiés, astreinte 24/7 pour la sûreté et l'argent, numéros d'urgence vérifiés, formation des agents | Ops |
| 11 | **Audit de sécurité indépendant** | Les contrôles décrits dans [`SECURITY.md`](./SECURITY.md) n'ont pas été éprouvés par un tiers | SAST, SCA, DAST sans constat critique ; pentest indépendant web + admin + API + flux PSP ; correction et re-test | CTO |
| 12 | **Exploitation : sauvegardes, restauration, réponse aux incidents** | Sans restauration testée ni plan d'incident, une panne ou une fuite peut devenir irréversible | Test de restauration (RPO 24 h / RTO 4 h cibles), exercice d'incident, astreinte, alertes financières actives | DevOps + RSSI |

## Points non bloquants mais à traiter avant pilote ou publicité

| Point | Échéance |
|---|---|
| Fiscalité des frais de service (TVA) et modèle de reçu | Avant facturation réelle (bloquant pour l'argent réel, voir LEGAL_GATES C5) |
| Dépôt de marque « Waka » (OAPI), domaine, réseaux sociaux | Avant publicité |
| Règle de libération sur silence du passager (désactivée, ADR-007) | Avant pilote si la charge de revue manuelle l'exige |
| Point de modélisation `PARTIALLY_REFUNDED` sans reliquat conducteur ([`PAYMENT_FLOWS.md`](./PAYMENT_FLOWS.md) §3) | Avant phase « Argent sécurisé » |
| Modélisation des frais PSP dans le ledger (compte proposé `psp_fees_expense`) | Dès réception de la grille tarifaire PSP |

## Ce que Waka s'interdit en attendant

- Présenter le mode MOCK comme un paiement réel, ou toute démonstration comme un service en production.
- Promettre un « séquestre », un « escrow » ou une « garantie » de remboursement.
- Encaisser des fonds sur un compte de la startup, même temporairement.
- Publier des avis, statistiques ou profils fictifs sans badge « Démo ».
