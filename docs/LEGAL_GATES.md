# Portes légales et opérationnelles — check-list GO/NO-GO production

> Version de travail 0.1 — 21 novembre 2026. **Ce document n'est pas un avis juridique.** Il liste les validations à obtenir, par écrit, de professionnels habilités (juriste local, PSP, assureur, fiscaliste, auditeur) avant toute mise en production avec argent réel. Les seuls textes cités sont ceux identifiés dans le cahier des charges ; tout point non confirmé est marqué « à vérifier » avec la source primaire à consulter.

## Résumé exécutif

- **Décision actuelle : NO-GO** pour tout paiement réel. Tous les éléments sont au statut « À obtenir ».
- Quatre portes sont structurantes : **(1)** PSP habilité capable de retenue conditionnelle multi-bénéficiaires, **(2)** qualification juridique du covoiturage (partage de frais vs transport rémunéré), **(3)** assurance couvrant les passagers, **(4)** conformité données personnelles (Loi n°2024/017).
- Règle de décision : **un seul élément bloquant non obtenu ⇒ NO-GO**. Les éléments non bloquants doivent être obtenus avant la date indiquée (pilote, publicité, extension).
- La qualification réelle du service dépend de l'activité concrète, non de l'étiquette « simple intermédiaire ».

## 1. Sources primaires

| Réf. | Source | URL |
|---|---|---|
| S1 | BEAC — Règlement n°04/18/CEMAC/UMAC/COBAC du 21 décembre 2018 relatif aux services de paiement, notamment art. 48–54 (fonds des clients, réconciliation, compte de cantonnement) | <https://www.beac.int/wp-content/uploads/2019/07/REGLEMENT-N-04-18-CEMAC-UMAC-COBAC-du-21-d%C3%A9cembre-2018.pdf> |
| S2 | MINFI / DGTCFM — Établissements financiers et établissements de paiement agréés au Cameroun | <https://dgtcfm.cm/les-etablissements-financiers-agrees-aucameroun/> |
| S3 | Présidence de la République — Loi n°2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel | <https://www.prc.cm/fr/actualites/actes/lois/7588> |
| S4 | Loi n°2001/015 du 23 juillet 2001 régissant les professions de transporteur routier et auxiliaire (texte de référence ; intitulé officiel à vérifier) | <https://www.camerlex.com/la-profession-de-transport-routier-4174/> |
| S5 | Orange Developer — Orange Money Web Payment (Cameroun listé, conditions marchands) | <https://developer.orange.com/apis/om-webpay> |
| S6 | OWASP ASVS 5.0.0 | <https://asvs.owasp.org/> |
| S7 | OWASP API Security Top 10 | <https://owasp.org/projects/api-security-project> |

Ces sources ont été relevées le 21 novembre 2026 ; vérifier les mises à jour, textes d'application et versions consolidées. Pour S4, la version officielle (Journal officiel) et les textes d'application actualisés sont **à vérifier** auprès du Ministère des Transports.

## 2. Check-list GO/NO-GO

Légende statut : **À obtenir** → En cours → Obtenu (avec lien vers la preuve archivée).

### 2.1 Paiements

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| P1 | Statut d'agrément du PSP vérifié (établissement de paiement ou autre statut habilitant) et entité contractante exacte | Resp. paiements + juriste | Extrait de la liste S2 daté + attestation du PSP + avis du juriste au regard de S1 | À obtenir | **Oui** |
| P2 | Contrat PSP signé couvrant le modèle de place de marché multi-bénéficiaires | Direction + juriste | Contrat signé, annexes techniques | À obtenir | **Oui** |
| P3 | Capacité de **retenue conditionnelle** et de libération sur instruction, durée maximale | Resp. paiements | Clause contractuelle + démonstration en sandbox | À obtenir | **Oui** |
| P4 | Cantonnement des fonds clients chez le PSP (S1, art. 48–54 — portée à confirmer par le juriste) | Juriste + PSP | Attestation du PSP sur le compte de cantonnement | À obtenir | **Oui** |
| P5 | Remboursements intégral et partiel, délais | Resp. paiements | Clause + test sandbox | À obtenir | **Oui** |
| P6 | Webhooks signés, API d'interrogation de statut, relevés de rapprochement | CTO | Documentation PSP + tests de contrat passants | À obtenir | **Oui** |
| P7 | Grille de frais PSP par canal et imputation | Finance | Annexe tarifaire signée | À obtenir | **Oui** |
| P8 | Répartition des responsabilités KYC/KYB et AML/CFT (passager, conducteur, startup) | Compliance + PSP | Matrice RACI signée | À obtenir | **Oui** |
| P9 | Conditions marchands Orange Money / MTN MoMo applicables via le PSP (S5 pour Orange ; MTN **à vérifier**) | Resp. paiements | Confirmation écrite du PSP ou de l'opérateur | À obtenir | **Oui** |
| P10 | Statut et traitement des fonds non réclamés, réclamations, contestations opérateur | Juriste + PSP | Procédure écrite | À obtenir | Non (avant pilote) |

### 2.2 Transport et assurance

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| T1 | Qualification du covoiturage de particuliers : partage de frais vs transport routier rémunéré au regard de S4 et des textes d'application | Juriste transport | Avis juridique écrit ; le cas échéant, position du Ministère des Transports | À obtenir | **Oui** |
| T2 | Plafond de contribution compatible avec un partage de frais (si la qualification l'exige) | Juriste + produit | Règle chiffrée validée, intégrée à la politique de prix | À obtenir | **Oui** |
| T3 | Obligations du conducteur et du véhicule (permis, carte grise, visite technique, capacité homologuée) | Juriste transport + ops | Liste des pièces exigées validée | À obtenir | **Oui** |
| T4 | Assurance : couverture des passagers transportés par un particulier dans ce cadre | Direction + courtier/assureur | Attestation ou avis écrit de l'assureur | À obtenir | **Oui** |
| T5 | Assurance responsabilité civile de la plateforme | Direction + courtier | Police signée | À obtenir | Non (avant pilote) |
| T6 | Règles pour les mineurs (voyage accompagné uniquement) | Juriste | Clause CGU validée | À obtenir | Non (avant pilote) |

### 2.3 Données personnelles (Loi n°2024/017, S3)

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| D1 | Registre des traitements (finalités, bases légales, catégories, durées, destinataires) | DPO pressenti + juriste | Registre daté | À obtenir | **Oui** |
| D2 | Obligation de désigner un délégué à la protection des données | Juriste | Avis écrit — **à vérifier** dans S3 et ses textes d'application | À obtenir | **Oui** |
| D3 | Formalités auprès de l'autorité de contrôle (déclaration, autorisation pour données sensibles / pièces d'identité) | Juriste | Récépissé ou avis d'exemption — **à vérifier** dans S3 | À obtenir | **Oui** |
| D4 | Transferts hors du Cameroun (hébergement cloud, sous-traitants SMS, monitoring) | Juriste + CTO | Cartographie des flux + fondement de transfert validé | À obtenir | **Oui** |
| D5 | Politique de confidentialité et consentements versionnés | Juriste + produit | Texte publié, versions archivées | À obtenir | **Oui** |
| D6 | Durées de conservation (KYC, litiges, données financières) et purge | Juriste + CTO | Tableau validé, job de purge testé | À obtenir | **Oui** |
| D7 | Procédure de droits (accès, rectification, suppression, export) et limites liées aux obligations de conservation | Juriste + support | Procédure + test de bout en bout | À obtenir | Non (avant pilote) |
| D8 | Procédure de notification de violation de données (autorité, délais) | Juriste + RSSI | Procédure écrite — délais **à vérifier** dans S3 | À obtenir | **Oui** |

### 2.4 Consommation, commerce électronique, fiscalité

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| C1 | CGU et CGV (rôle d'intermédiaire, responsabilités, prix total, frais) | Juriste | Textes validés et versionnés | À obtenir | **Oui** |
| C2 | Information précontractuelle et affichage du prix total avant paiement | Juriste + produit | Revue des écrans de paiement | À obtenir | **Oui** |
| C3 | Matrice d'annulation et de remboursement | Produit + juriste + PSP | Matrice signée par les trois parties | À obtenir | **Oui** |
| C4 | Droit de rétractation éventuel et obligations e-commerce applicables | Juriste | Avis écrit — textes applicables **à vérifier** | À obtenir | **Oui** |
| C5 | TVA et fiscalité sur les frais de service ; facturation ; statut fiscal des contributions conducteurs | Fiscaliste | Avis écrit + modèle de reçu | À obtenir | **Oui** |
| C6 | Politique de litiges publiée, voies de recours, juridiction compétente et droit applicable | Juriste | Politique publiée + clause CGU | À obtenir | **Oui** |
| C7 | Politique de modération des avis et des messages | Juriste + ops | Politique publiée | À obtenir | Non (avant pilote) |

### 2.5 KYC et lutte contre la fraude

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| K1 | Pièces exigées et contrôles pour les conducteurs (identité, permis, véhicule, assurance) | Compliance + juriste | Procédure de revue validée | À obtenir | **Oui** |
| K2 | Prestataire de vérification d'identité éventuel (contrat, localisation des données) | Compliance | Contrat + DPA | À obtenir | Non (avant pilote) |
| K3 | Règles de suspension, sanctions et signalement aux autorités | Juriste + ops | Procédure écrite | À obtenir | Non (avant pilote) |

### 2.6 Opérations, sûreté, marque

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| O1 | Support joignable aux horaires publiés ; procédure de sûreté 24/7 (astreinte) | Ops + juriste | Planning d'astreinte + procédure | À obtenir | **Oui** |
| O2 | Numéros d'urgence vérifiés auprès d'une source officielle | Ops | Capture datée de la source officielle | À obtenir | **Oui** |
| O3 | Dépôt de marque « Waka » auprès de l'OAPI (recherche d'antériorité puis dépôt) | Direction + conseil en propriété industrielle | Rapport d'antériorité + récépissé de dépôt | À obtenir | Non (avant publicité) |
| O4 | Noms de domaine et comptes de réseaux sociaux | Direction | Preuves d'enregistrement | À obtenir | Non (avant publicité) |
| O5 | Contrats sous-traitants (hébergeur, SMS, monitoring) avec clauses de sécurité et de données | Direction + juriste | Contrats signés | À obtenir | **Oui** |

### 2.7 Sécurité et continuité

| # | Élément | Responsable | Preuve exigée | Statut | Bloquant |
|---|---|---|---|---|:-:|
| S-1 | Audit de sécurité / pentest indépendant (web, admin, API, flux PSP) | CTO | Rapport + re-test des constats critiques/hauts | À obtenir | **Oui** |
| S-2 | SAST, SCA, scan de secrets, DAST sans constat critique ouvert | CTO | Rapports CI datés | À obtenir | **Oui** |
| S-3 | Plan de réponse aux incidents testé (exercice) | RSSI | Compte rendu d'exercice | À obtenir | **Oui** |
| S-4 | Sauvegardes chiffrées et **test de restauration** réussi (RPO 24 h / RTO 4 h cibles) | DevOps | Procès-verbal de restauration | À obtenir | **Oui** |
| S-5 | Rapprochement sans écart sur la campagne de tests sandbox PSP | Finance | Rapport de rapprochement | À obtenir | **Oui** |
| S-6 | MFA effective pour 100 % des comptes staff, revue des accès | RSSI | Export de revue des accès | À obtenir | **Oui** |

## 3. Procédure de décision

1. Chaque responsable dépose la preuve (document signé, rapport, capture datée) dans un espace d'archivage à accès restreint et met à jour le statut.
2. Revue GO/NO-GO par la direction, le CTO, le responsable paiements et le juriste ; compte rendu signé.
3. Tout élément bloquant au statut autre que « Obtenu » ⇒ **NO-GO**. Pas de dérogation orale.
4. En cas de réponse négative du PSP sur la retenue conditionnelle (P3) : le pilote peut se dérouler **sans paiement intégré** (mise en relation seule), sans jamais évoquer de « paiement protégé ».
5. Revue de la check-list à chaque changement de PSP, de corridor, de modèle de prix ou de texte applicable.
