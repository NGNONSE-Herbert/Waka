# Naming — trouver le nom de la plateforme de covoiturage

> **Contexte.** Le portefeuille existant compte **Bedones** (nom inventé, court, propriétaire) et **Mboa Fashion** (racine camerounaise « Mboa » + fonction). « KÔVO » était un nom de travail. Ce document propose des noms de la même famille, les évalue et recommande un choix.
> **Avertissement.** Aucune disponibilité n'est garantie : chaque nom doit être vérifié à l'**OAPI** (Organisation Africaine de la Propriété Intellectuelle, qui couvre le Cameroun), classes 9, 39 et 42, et pour le domaine `.cm` (ANTIC), le `.com` et les réseaux sociaux, avant toute communication.

## 1. Ce que le nom doit porter

| Critère | Pourquoi c'est important ici |
|---|---|
| **Ancrage camerounais** | Le marché compte déjà Drivo, Mboa Covoiturage, CovoiCam : un nom importé sonnerait comme une copie de BlaBlaCar. |
| **Les deux Cameroun** | Il doit fonctionner en zone francophone **et** anglophone (NW/SW), donc idéalement en pidgin ou en camfranglais, compris partout. |
| **Neutralité** | Pas de mot rattaché à une seule ethnie ou région (exemple écarté : *Sawa*, qui désigne les peuples côtiers). |
| **Prononçable en un souffle** | Deux syllabes, se dit au téléphone, s'écrit sans hésitation sur un clavier Android. |
| **Protégeable** | Un nom distinctif se dépose ; un nom descriptif (« Covoit Cameroun ») ne se défend pas. |
| **Cohérence de portefeuille** | Il doit sonner à côté de Bedones et de Mboa Fashion. |

## 2. Les propositions

### Famille A — noms inventés ou d'usage, courts et protégeables (esprit « Bedones »)

| Nom | Sens et histoire | Forces | Risques |
|---|---|---|---|
| **Waka** ★ | En pidgin camerounais, *waka* veut dire marcher, voyager, faire la route (« I di waka go Yaoundé »). Le mot fait aussi écho à *Zangaléwa*, le tube des Golden Sounds (groupe camerounais) repris dans le monde entier. | Compris des deux côtés du Moungo, deux syllabes, joyeux, verbe d'action (« On waka ensemble »), fonctionne en FR et en EN. | Mot courant, donc il faudra probablement déposer une forme distinctive (logo + « waka », voire *Wakaa* ou *waka.cm*). Vérifier les homonymes dans les transports en Afrique. |
| **Tara** | En camfranglais, *mon tara* veut dire mon pote, mon compagnon. Le covoiturage, c'est voyager entre taras. | Chaleureux, humain, très local, se retient tout de suite. | Prénom et nom de marque très répandus dans le monde : protection plus difficile, référencement plus difficile. |
| **Wakali** | Construit sur *waka* avec une finale douce, comme Bedones l'est sur sa racine. | Totalement propriétaire, domaine probablement plus libre, même univers de sens. | Doit être expliqué au début, perd le sens immédiat de *waka*. |
| **Taraway** | *Tara* et *way* : la route des taras. | Bilingue, raconte le produit. | Plus long, et le côté anglais affaiblit l'ancrage. |

### Famille B — l'ombrelle « Mboa » (esprit « Mboa Fashion »)

| Nom | Sens | Forces | Risques |
|---|---|---|---|
| **Mboa Waka** | « Voyager au pays » | Rattache le produit à la famille Mboa Fashion et joue sur la marque ombrelle. | **Le concurrent s'appelle « Mboa Covoiturage »** : il y a un vrai risque de confusion et d'opposition, dans la même catégorie. À ne retenir que si l'ombrelle Mboa est déjà protégée. |
| **Mboa Road** | « La route du pays » | Clair, bilingue. | Même risque de confusion, et un nom descriptif. |

### Famille C — rattachement à Bedones

| Nom | Quand le choisir |
|---|---|
| **Bedones Go** / **Bedones Route** | Seulement si Bedones est une marque ombrelle de groupe déjà connue du public. Sinon, le nom n'apporte ni le sens du voyage ni l'ancrage. |

### Famille D — descriptif et local (solution de repli)

| Nom | Commentaire |
|---|---|
| **Route237** / **Covoit237** | « 237 » est l'indicatif du Cameroun, que tout le monde reconnaît. Très clair, mais faible à défendre et peu émotionnel. Utile comme nom de domaine secondaire ou comme hashtag. |

### Noms écartés (et pourquoi)

- **Sawa** : connotation ethnique et régionale.
- **Njangi** : la tontine évoque la confiance, mais aussi l'épargne collective. Le risque est de faire croire que la plateforme collecte des fonds, ce que le modèle de paiement interdit justement.
- **Benskin** : désigne la moto-taxi, donc un autre métier.
- **Kamer Go** : sympathique, mais « Kamer » est déjà très utilisé par des médias et des boutiques.

## 3. Recommandation

**Waka**, avec la signature **« On waka ensemble. »** (EN : *Let's waka together.*)

1. C'est le seul candidat qui dit à la fois *voyager* et *Cameroun*, et qui est compris en zone francophone comme en zone anglophone. C'est un vrai atout d'unité nationale pour un service interurbain.
2. C'est un verbe : on dit « je waka avec X ». La marque peut entrer dans le langage courant.
3. Il est court, sonore et facile à mettre en image. Le logo (deux sièges reliés par une route) se lit tout de suite.
4. Il s'accorde avec Bedones (court et inventé) sans entrer en collision avec la catégorie « Mboa Covoiturage ».

**Plan B** si Waka n'est pas disponible à l'OAPI : **Wakali**, puis **Tara**.

## 4. Les vérifications à faire, dans l'ordre

1. Recherche d'antériorité à l'OAPI (classes 9, 39 et 42), avec l'aide d'un conseil en propriété industrielle de Yaoundé.
2. Domaines : `waka.cm` (ANTIC), `waka.app`, `wakacm.com` ; pseudos sur Facebook, WhatsApp Business, TikTok et Instagram.
3. Test oral auprès de 10 personnes à Douala, 10 à Yaoundé et 10 à Buéa ou Bamenda : comprennent-ils le nom, le retiennent-ils, que leur évoque-t-il ?
4. Dépôt de la marque, mot et logo.

## 5. Changer de nom dans le code

Le nom est centralisé dans `packages/domain/src/brand.ts` (`BRAND`). Le logo SVG et les dictionnaires FR/EN des applications web le reprennent. Pour renommer : changez `BRAND`, le logo, puis cherchez « Waka » dans `apps/*/` pour les textes éditoriaux.
