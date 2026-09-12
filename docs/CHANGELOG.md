# Journal des Modifications (CHANGELOG) — M3D Gestion

Toutes les modifications notables apportées au projet M3D sont consignées dans ce document.

---

## [17.1.0] - 2026-09-08

### 🎨 Design Sobre & Modeste
- **Palette Visuelle Épurée** : Remplacement des accents indigo vifs par un bleu marine/ardoise classique (`#2563EB` / `#1E40AF`), reposant et adapté à une gestion associative.
- **Cartes KPI Allégées** : Remplacement des gros blocs carrés saturés par des cartes de surface épurées avec indicateurs supérieurs discrets.
- **Badges Pastels** : Badges financiers et temporels avec teintes adoucies et micro-bordures élégantes.
- **Micro-interractions & Ombres** : Réduction des ombres portées pour une interface plus plate, moderne et modeste.

### 🧪 Données de Démonstration & Outils de Test
- **Jeu de Test Intégré (`genererDonneesDemo()`)** : Injection en un clic d'un jeu de données complet et cohérent pour tester instantanément tous les modules :
  - 10 membres représentatifs (Président, Trésorier, Secrétaire, membres actifs et inactifs).
  - 3 dimanches passés de cotisations avec anniversaires fêtés, cotisations à jour, impayés et dettes.
  - Prêts entre membres avec statut en attente.
  - Journal de caisse avec entrées et sorties ventilées par catégorie (Sono, Transport, Nourriture).
  - Activité complète ("Sortie Détente au Lac Togo") avec 3 postes de frais (Participation, Transport, Repas), inscriptions et paiements partiels/totaux.
- **Suppression / Remise à zéro (`reinitialiserToutesDonnees()`)** : Nettoyage en un clic de l'ensemble des données de test pour retrouver une application vierge sans toucher au mot de passe administrateur.
- **Bannière d'Accueil Initiale** : Détection de base vide invitant au chargement des données de test en 1 clic dès l'ouverture.

---

## [17.0.1] - 2026-09-08

### 🐛 Correction de Bug Critique
- **Résolution du Conflit de Portée Globale (SyntaxError)** : Suppression de la double déclaration `const CATEGORIES_DEPENSE` dans `js/db.js` (déjà déclarée et figée dans `js/config.js`), qui empêchait le chargement de `db.js` et provoquait l'échec total du démarrage applicatif.
- **Harmonisation des Utilitaires de Date** : Élimination des fonctions redondantes `isoToDate` et `dateToIso` de `js/db.js` au profit des versions sécurisées sans décalage de fuseau horaire de `js/utils.js`.
- **Incrément de Cache PWA** : Passage en `m3d-cache-v18` dans `sw.js`.

---

## [17.0.0] - 2026-09-07

### 🏗️ Architecture & Modularisation
- **Découpage CSS en 5 modules ITCSS** :
  - `css/variables.css` : Design tokens centralisés (palette Indigo, variables de surfaces et de rayons).
  - `css/base.css` : Reset CSS, typographie `Inter`, barres de défilement stylisées.
  - `css/layout.css` : Conteneur maître, en-tête `header.topbar`, barre de navigation `nav.tabbar` et FAB.
  - `css/components.css` : Cartes, indicateurs KPI, tables, badges, fiches modales bottom-sheet.
  - `css/responsive.css` : Adaptations grand écran (>900px), mobiles étroits (<360px) et styles `@media print`.
  - `css/style.css` : Faisceau d'importation unifié rétrocompatible (`@import`).
- **Modularisation du JavaScript sans outil de build** :
  - `js/config.js` : Centralisation des constantes immuables, statuts, icônes SVG et clés de stockage.
  - `js/utils.js` : Utilitaires purs (sécurisation XSS `esc()`, formatage monétaire et dates FR, compression Canvas JPEG).
  - `js/state.js` : Gestion centralisée de l'état applicatif (thème, session pastorale, verrouillage après 30 min d'inactivité).
  - `js/ui.js` : Gestionnaires d'interface utilisateur partagés (bottom-sheets, toasts, modales de confirmation avec mot de passe).
  - `js/db.js` : Couche d'accès aux données IndexedDB Dexie allégée et documentée en JSDoc.
  - `js/app.js` : Contrôleur applicatif et vues, nettoyé des fonctions utilitaires et sécurisé.

### 🐛 Corrections de Bugs Critiques & Améliorations de Stabilité
- **Correction Critique — Sauvegarde des Activités** : Résolution d'un bogue de perte de données dans `exportBackup()` et `importBackup()` où les tables `liste_frais` et `liste_paiements` (introduites en base v6) étaient omises de la sauvegarde JSON.
- **Résolution de Fuite Mémoire (Event Listeners)** : Suppression de l'accumulation d'écouteurs `click` sur `document` lors de chaque recherche globale de membres.
- **Compatibilité Rétroactive Safari iOS <13.4** : Remplacement des opérateurs Nullish Coalescing (`??`) par des comparaisons strictes dans `db.js` (lignes 276-279) pour éviter les erreurs de parsing sur les anciens appareils mobiles.
- **Génération Sécurisée d'Identifiants** : Remplacement du calcul fragile d'ID basé sur `Date.now()` par `genererIdMembre()` pour éviter les collisions d'identifiants lors de créations rapides.

### 🔒 Sécurité
- **Protection Renforcée contre les Failles XSS** : Échappement HTML strict via `esc()` sur l'ensemble des données dynamiques (noms, motifs, commentaires).
- **Sanitisation des Couleurs Dynamiques** : Validation stricte des styles injectés pour les badges de rôles (`safeColor()`).
- **Ergonomie des Boîtes de Dialogue Sécurisées** : Prise en charge de la touche `Entrée` dans le champ mot de passe de `confirmWithPassword()`.

### ♿ Accessibilité (a11y)
- Passage à une structure HTML5 sémantique : `<header class="topbar">`, `<main id="app-content">`, `<nav class="tabbar">`.
- Ajout des attributs `role="tablist"`, `role="tab"`, `aria-selected` et `aria-label` sur la barre d'onglets.
- Prise en charge de la touche `Échap` (`Escape`) pour fermer instantanément toute bottom-sheet modale ouverte.
- Focus trap et accessibilité au clavier améliorés.

### 📦 PWA & Service Worker
- Passage du Service Worker en version `m3d-cache-v17`.
- Intégration de l'ensemble des nouveaux modules CSS et JS dans la liste de pré-mise en cache.
- Filtrage des requêtes pour ignorer les schémas non-HTTP(s) (évitant les erreurs de Service Worker liées aux extensions Chrome/Edge).

### 📚 Documentation Professionnelle
- Création de `docs/ARCHITECTURE.md` détaillant les flux de données, le modèle IndexedDB et la sécurité.
- Création de `docs/DEVELOPMENT.md` guidant les futurs développeurs pour l'installation, les tests et l'extension du projet.
- Création du présent `docs/CHANGELOG.md`.
- Réécriture complète de `README.md` selon les standards professionnels de l'industrie.

---

## [16.0.0] - 2026-08-20
- Refonte visuelle complète basée sur le Design System moderne : adoption de la police *Inter*, palette Indigo, surfaces sombres et cartes contrastées.
- Optimisation du Service Worker en mode Cache First avec mise à jour en tâche de fond.

---

## [6.0.0] - 2026-08-10
- Refonte intégrale du module "Listes personnalisées" en module "Activités".
- Prise en charge des frais multiples par participant.
- Historique chronologique réel des paiements par activité.
- Calcul dynamique des statuts : Non payé, Partiel, Payé, Surpayé.
- Tableau de bord avec statistiques financières et taux de recouvrement.
- Exportation des états d'activité en PDF.
