# Waka Mobile (Expo)

Application Android en Expo SDK 58, design **Canopée**, en français et en anglais. Elle utilise la vraie API Waka. Les paiements restent **MOCK** : aucun argent réel.

## Installation (une seule fois)

1. Sur le téléphone, installez **Expo Go** depuis le Play Store.
2. Activez le débogage USB : *Paramètres > À propos du téléphone*, touchez 7 fois *Numéro de build*, puis *Options pour les développeurs > Débogage USB*.
3. Sur le PC, téléchargez [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) et décompressez le dossier `platform-tools` dans `C:\Users\<vous>\platform-tools`.
4. À la racine du dépôt : `pnpm install`, puis `pnpm build`.

## Lancer l'app

Terminal 1, à la racine du dépôt :

```powershell
pnpm --filter @waka/api start
```

Terminal 2, téléphone branché en USB :

```powershell
pnpm --filter @waka/mobile usb
```

Au premier branchement, acceptez « Autoriser le débogage USB » sur le téléphone. Expo Go s'ouvre ensuite sur l'app. Chaque modification du code se recharge seule.

## Comptes de démonstration

L'écran de connexion les propose directement. Le code SMS s'affiche à l'écran.

| Numéro | Rôle |
|---|---|
| `690 000 001` | Aïcha, passagère |
| `690 000 004` | Junior, passager |
| `677 000 002` | Serge, conducteur vérifié |
| `650 000 003` | Nadège, conducteur non vérifié |

Un nouveau conducteur reste « en vérification » jusqu'à la validation de son dossier et de son véhicule dans la console admin (`http://localhost:3001`).

## Pourquoi l'USB

Le pare-feu de ce PC bloque les connexions entrantes, donc le mode Wi-Fi d'Expo ne peut pas fonctionner. L'USB passe par `adb reverse`. Metro relaie aussi `/api/*` vers `localhost:4000` (voir `metro.config.js`), le téléphone n'a donc besoin que du port 8081.

Si l'USB est interdit sur ce poste, `npx expo start --tunnel` reste possible depuis `apps/mobile`. Le serveur de développement et l'API de démo sont alors accessibles depuis Internet le temps de la session.

## Écrans

| Parcours | Contenu |
|---|---|
| Passager | Recherche, résultats, trajet, connexion OTP, paiement MOCK, billet, annulation, arrivée, avis |
| Demande de voyage | Publication, correspondances avec score expliqué, retrait |
| Conducteur | Dossier, véhicules, publication, passagers, code d'embarquement, départ, arrivée, annulation, revenus |
| Litiges | Signalement, consignes d'urgence, suivi, éléments, décision, recours |
| Échanges | Messagerie par réservation avec filtre antifraude, notifications |
| Compte | Profil, langue FR/EN, pages légales, sécurité et paiement protégé |

## Limites

- Les notifications sont consultables dans l'app. Il n'y a pas encore de notification push : elle demande un build natif et un compte de service.
- La pièce d'identité reste une référence fictive tant que le stockage privé chiffré n'est pas branché.
- En anglais, certains textes produits par l'API restent en français (motif de correspondance, politique d'annulation, historique d'un litige).
