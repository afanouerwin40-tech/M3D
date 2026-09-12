# M3D — Gestion Paroissiale & Trésorerie Jeunesse

Application web progressive (PWA) conçue pour la gestion administrative, financière, événementielle et pastorale de l'association de jeunesse **M3D**.

L'application fonctionne à 100% en local et hors-ligne grâce à une architecture *No-Build* moderne reposant sur les standards du Web et la persistance locale IndexedDB.

---

## Présentation

**M3D Gestion** a été conçue pour répondre aux défis logistiques et financiers rencontrés lors de l'administration hebdomadaire d'un groupe paroissial de jeunes :
- Suivi rigoureux des cotisations dominicales obligatoires (200 FCFA par dimanche).
- Transparence totale de la caisse (entrées de cotisations, sorties de dépenses justifiées, solde net en temps réel).
- Gestion complète de l'annuaire des jeunes (coordonnées, rôles pastoraux, anniversaires avec alertes).
- Organisation d'activités et sorties d'envergure (camps, retraites, agapes) avec gestion de frais multiples modulaires et paiements échelonnés.
- Résilience absolue sur le terrain : fonctionne instantanément sur smartphone ou tablette même en l'absence totale de réseau Internet.

---

## Fonctionnalités

Toutes les fonctionnalités décrites ci-dessous sont **intégralement implémentées** dans le code du projet :

### 1. Tableau de Bord & Accueil
- Affichage des indicateurs de performance clés (KPI) : effectif total, solde de caisse, total des cotisations perçues, volume des dettes en cours.
- Alerte des anniversaires du mois et du jour pour la fraternité.
- Résumé rapide du dernier dimanche de culte.

### 2. Gestion Complète des Membres
- Répertoire complet avec recherche instantanée par nom ou téléphone.
- Fiches individuelles détaillées : nom, téléphone, rôle/responsabilité (Président, Trésorier, Secrétaire, Membre...), statut actif/inactif, date de naissance.
- Gestion des photos de profil : capture via l'appareil photo ou sélection de fichier, avec redimensionnement et compression JPEG automatique côté client via Canvas HTML5.
- Historique financier individuel complet pour chaque membre.

### 3. Dimanches & Cotisations
- Sélection rapide du dimanche concerné (avec calendrier de navigation).
- Pointage des présences et des cotisations en un geste.
- Prise en compte du barème hebdomadaire (200 FCFA).
- Enregistrement des avances et régularisations d'arriérés.

### 4. Dettes & Relances
- Calcul automatique de la balance financière pour chaque membre (cotisations attendues vs cotisations réellement payées).
- Liste ordonnée des membres ayant des impayés avec code couleur visuel.
- Génération de messages de relance prêts à l'envoi pour messageries instantanées.

### 5. Activités & Événements Multi-Frais
- Création d'événements spéciaux (retraites spirituelles, sorties loisir, formations).
- **Frais multiples modulaires** : définition de plusieurs frais indépendants par activité (ex. transport, hébergement, repas, t-shirt) avec possibilité pour chaque participant de choisir les options qui le concernent.
- **Historique chronologique inaltérable des encaissements** : enregistrement daté des acomptes avec mode de versement et commentaires.
- **Statuts de paiement dynamiques** : calcul automatique (Non payé, Partiel, Payé, Surpayé) selon le cumul des acomptes reçus.
- Clôture et réouverture des activités, export au format PDF pour impression des listes de pointage.

### 6. Journal des Dépenses & Caisse
- Saisie des dépenses engagées pour le compte de la communauté (achats de matériel, collations, secours).
- Catégorisation des dépenses et déduction immédiate du solde global de caisse.

### 7. Sauvegarde, Restauration & Sécurité
- Exportation intégrale de la base de données au format JSON en un clic.
- Restauration fiable avec validation structurelle complète de toutes les tables.
- Protection par mot de passe administrateur pour toutes les opérations destructives ou sensibles.
- Verrouillage automatique de la session après 30 minutes d'inactivité.

### 8. Ergonomie & Design
- Thème clair et thème sombre (Dark Mode) avec persistance du choix.
- Interface adaptée aux écrans tactiles mobiles avec barre de navigation inférieure et fiches *bottom-sheet*.
- Support optimisé des grands écrans d'ordinateur (desktop >900px) et des feuilles de style d'impression papier (`@media print`).

---

## Technologies

L'application a été délibérément conçue sans dépendance à un framework lourd (React, Angular, Vue) afin de maximiser sa pérennité, sa rapidité d'exécution et sa facilité de maintenance :

- **HTML5 Sémantique** : Structure conforme aux standards W3C (`<header>`, `<main>`, `<nav>`), balisage accessible ARIA.
- **CSS3 Modulaire** : Architecture ITCSS, variables CSS natives (Design Tokens), flexbox, grid, animations fluides et `@media print`.
- **JavaScript Vanilla (ES6+)** : Découpage fonctionnel strict, pas d'étape de compilation ni de transpileur.
- **Dexie.js 3.2.4** (via CDN sécurisé) : Enveloppe minimaliste et performante pour l'API standard **IndexedDB**.
- **Service Worker API** : Cache First avec stratégie *Stale While Revalidate* pour une autonomie totale hors-ligne.
- **Web App Manifest** : Métadonnées PWA pour installation native sur Android, iOS, Windows et macOS.

---

## Architecture

Le projet est organisé selon une architecture modulaire à séparation stricte des responsabilités :

```text
M3D/
├── index.html               # Page unique de l'application (SPA)
├── manifest.webmanifest     # Configuration PWA (icônes, thème, mode standalone)
├── sw.js                    # Service Worker v17 (gestion du cache et offline)
│
├── css/
│   ├── style.css            # Faisceau d'importation unifié (@import)
│   ├── variables.css        # Variables et tokens CSS (couleurs, ombres, rayons)
│   ├── base.css             # Reset, règles de base, animations
│   ├── layout.css           # Mise en page (topbar, navigation, conteneurs)
│   ├── components.css       # Composants (cartes, formulaires, badges, tableaux)
│   └── responsive.css       # Adaptations desktop, tablettes et impression
│
├── js/
│   ├── config.js            # Constantes métier immuables et dictionnaires
│   ├── utils.js             # Fonctions utilitaires pures (dates, monnaie, sécurité XSS)
│   ├── db.js                # Définition du schéma Dexie et requêtes IndexedDB
│   ├── state.js             # Gestion de l'état (thème, session pastorale, verrouillage)
│   ├── ui.js                # Contrôleurs UI réutilisables (modales, toasts, sheets)
│   └── app.js               # Contrôleur principal et rendu des vues
│
├── icons/
│   ├── icon-192.png         # Icône PWA standard (192x192)
│   └── icon-512.png         # Icône PWA haute résolution (512x512)
│
└── docs/
    ├── ARCHITECTURE.md      # Documentation détaillée de l'architecture logicielle
    ├── DEVELOPMENT.md       # Guide pour développeurs et contributeurs
    └── CHANGELOG.md         # Historique des versions et évolutions
```

---

## Installation

Le projet ne nécessite aucune étape de `npm install` ni de compilation de code.

1. **Cloner le dépôt GitHub** :
   ```bash
   git clone https://github.com/afanouerwin40-tech/M3D.git
   cd M3D
   ```

2. **C'est tout !** L'application est prête à être exécutée.

---

## Utilisation

### En local sur ordinateur
Vous pouvez directement double-cliquer sur le fichier `index.html` pour l'ouvrir dans n'importe quel navigateur Web.

Pour activer toutes les fonctionnalités PWA (notamment le Service Worker et l'installation hors-ligne), servez le répertoire via un serveur HTTP local :

```bash
# Exemple avec Python
python -m http.server 8080

# Ou avec Node.js
npx serve .
```
Puis accédez à `http://localhost:8080` dans votre navigateur.

### En production
Déployez simplement les fichiers statiques sur n'importe quel hébergeur web supportant le protocole HTTPS (obligatoire pour les PWA) :
- GitHub Pages
- Cloudflare Pages
- Netlify / Vercel
- Serveur Apache / Nginx traditionnel

---

## PWA (Progressive Web App)

M3D est une PWA certifiée :
- **Installation sur smartphone / tablette** :
  - Sur **Android (Chrome)** : Cliquez sur le menu (trois points) > *Installer l'application* ou *Ajouter à l'écran d'accueil*.
  - Sur **iOS (Safari)** : Appuyez sur le bouton de partage > *Sur l'écran d'accueil*.
- **Fonctionnement hors-ligne** : Dès la première visite, l'intégralité des assets (HTML, CSS, JS, polices, icônes) est mise en cache localement. Vous pouvez couper toute connexion Internet : l'application continuera de fonctionner sans aucune interruption.
- **Mises à jour transparentes** : Lorsqu'une nouvelle version est déployée en ligne, le Service Worker la télécharge en arrière-plan et l'applique lors de la prochaine ouverture.

---

## Compatibilité

L'application a été testée et validée sur les navigateurs et environnements suivants :

| Navigateur / OS | Version minimale | Statut |
| :--- | :--- | :--- |
| **Google Chrome / Chromium** (Desktop & Mobile) | 80+ | Pleinement supporté |
| **Mozilla Firefox** (Desktop & Mobile) | 78+ | Pleinement supporté |
| **Apple Safari** (macOS) | 13.1+ | Pleinement supporté |
| **Apple Safari iOS / iPadOS** | 13.4+ | Pleinement supporté (avec métadonnées plein écran) |
| **Microsoft Edge** | 80+ | Pleinement supporté |

---

## Développement

Consultez le guide détaillé [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) pour découvrir les règles de contribution, les conventions d'architecture et les protocoles de tests manuels.

Consultez [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour une explication approfondie du modèle de données et des flux d'information.

---

## Contribution

Les contributions pour améliorer la gestion de la jeunesse M3D sont les bienvenues :

1. Forkez le projet sur GitHub.
2. Créez une branche thématique dédiée (`git checkout -b feature/amelioration-x`).
3. Effectuez vos modifications en veillant à préserver la règle **Zéro dépendance de build** et l'absence d'erreurs console.
4. Testez le rendu sur mobile et sur desktop.
5. Ouvrez une Pull Request claire et documentée.

---

## Licence

Ce projet est un logiciel propriétaire conçu pour la gestion interne de l'association **Jeunesse M3D**. Tous droits réservés.
