# Guide de la Base de Données — M3D Gestion

Ce document explique comment l'application stocke ses données sans serveur, en utilisant uniquement les capacités de votre navigateur.

---

## 1. Introduction à IndexedDB et Dexie.js

M3D Gestion est une application **Offline-First**. Cela signifie que toutes les informations (membres, cotisations, activités) ne sont pas stockées sur un serveur distant, mais directement sur votre appareil, dans une base de données appelée **IndexedDB**.

### Pourquoi IndexedDB ?
- **Capacité** : Contrairement au `localStorage` (limité à 5 Mo), IndexedDB peut stocker plusieurs gigaoctets de données.
- **Performance** : Elle supporte les index, permettant de rechercher un membre parmi des milliers quasi instantanément.
- **Fiabilité** : Elle gère les transactions (soit tout est enregistré, soit rien ne l'est), évitant de corrompre les données en cas de coupure.

### Le rôle de Dexie.js
IndexedDB est puissante mais son utilisation directe est très complexe. Nous utilisons **Dexie.js (v3.2.4)**, une bibliothèque "wrapper" qui simplifie les échanges :
- Elle transforme les requêtes complexes en fonctions simples (`db.membres.add(...)`).
- Elle gère les promesses (`async`/`await`) pour ne pas bloquer l'interface pendant les calculs.
- Elle facilite les **migrations** (le passage d'une version de la base à une autre).

---

## 2. Le Concept d'Event Sourcing

C'est le choix technique le plus important de M3D Gestion.

**Règle d'or** : L'application ne stocke **JAMAIS** de totaux ou de soldes calculés.
- On ne stocke pas : `membre.solde_cotisation = 5000`.
- On stocke : chaque petit événement (Paiement le 01/01, Prêt le 05/01, Remboursement le 10/01).

**Pourquoi ?**
1. **Traçabilité** : On sait exactement comment on est arrivé à un montant.
2. **Inaltérabilité** : Une erreur de calcul dans une ancienne version peut être corrigée simplement en recalculant tout l'historique avec la nouvelle règle.
3. **Audit** : Le trésorier peut justifier chaque franc CFA.

---

## 3. Schéma des Tables (v9)

La base `m3d_db` contient 15 tables. Voici leur rôle et leurs relations.

### 3.1 Gestion des Membres
- `membres` : Annuaire (Nom, prénom, fonction, statut, photo base64).
- `sessions` : Les années ou périodes budgétaires.

### 3.2 Cotisations Dominicales
- `dimanches` : Chaque dimanche de collecte.
- `anniversaires_du_jour` : Membres fêtés lors d'un dimanche.
- `paiements` : Qui a payé (ou pas) pour un dimanche donné.

### 3.3 Activités et Événements
- `listes` : Les événements (Sortie, Réunion, Voyage).
- `liste_membres` : Qui participe à quelle activité.
- `liste_frais` : Les différents frais d'une activité (Transport, Participation, etc.).
- `liste_paiements` : Historique chronologique des paiements pour une activité.

### 3.4 Finances et Prêts
- `caisse_mouvements` : Entrées/sorties manuelles de la caisse commune.
- `remboursements` : Suivi des dettes remboursées (avec nom figé).
- `prets_membres` : Prêts entre membres (un membre avance pour un autre).
- `dons` : Dons ponctuels ou liés à une activité (Nouveauté v9).

### 3.5 Système
- `parametres` : Mot de passe admin (hashé), nom de l'organisation.
- `activity_log` : Journal technique des actions.

---

## 4. Relations entre les données

Bien que ce ne soit pas une base SQL, les tables communiquent via des identifiants (IDs) :

```text
MEMBRE (M-XXXXX)
  │
  ├───< id_membre >─── PAIEMENT (Cotisation)
  │
  ├───< id_membre >─── LISTE_MEMBRES (Participation)
  │
  ├───< id_membre >─── DONS
  │
  └───< id_membre >─── PRETS_MEMBRES (Débiteur ou Prêteur)
```

---

## 5. Cycle de Vie : Ouverture et Versions

### 5.1 Ouverture explicite (`ouvrirBase`)
Dans `js/db.js`, la fonction `ouvrirBase()` est critique. Elle s'assure que :
1. La base est ouverte avant toute tentative de lecture.
2. Si un autre onglet bloque la mise à jour, l'utilisateur est prévenu (timeout de 10s).
3. La version du code correspond à la version des données.

### 5.2 Migrations (Le passage d'une version à l'autre)
Quand nous ajoutons une fonctionnalité (ex: la table `dons` en version 9), nous créons une migration.

**Règles de migration :**
- **Idempotence** : Si on lance la migration deux fois, elle ne doit rien casser.
- **Additivité** : On ajoute des tables ou des champs, on ne supprime jamais les anciens pour ne pas perdre l'historique des utilisateurs.

---

## 6. Sécurité des données

- **Non-chiffrement** : Les données dans IndexedDB sont stockées en clair sur le disque de l'appareil.
- **Mot de passe** : Il n'est pas stocké en clair. On stocke un "Hash" (une empreinte numérique). Quand vous tapez votre mot de passe, l'application compare les empreintes.
- **Sauvegarde** : Puisque tout est local, si vous perdez votre appareil ou effacez les données du navigateur, vous perdez tout. **Faites des sauvegardes JSON régulières via l'onglet Système.**

---

## 7. Maintenance pour les Développeurs

Si vous ajoutez une table dans `js/db.js` :
1. Incrémentez `SCHEMA_VERSION`.
2. Ajoutez la définition de la table dans `db.version(N).stores({...})`.
3. **CRITIQUE** : Ajoutez le nom de la table dans `TABLES_APPLICATION` (`js/modules/systeme.js`) pour qu'elle soit incluse dans les sauvegardes.
