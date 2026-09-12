# Guide de Développement — M3D Gestion

Ce document est destiné aux développeurs et contributeurs souhaitant maintenir ou faire évoluer le projet **M3D Gestion**.

---

## 1. Démarrage Rapide

### Prérequis
- Un navigateur moderne (Chrome, Firefox, Safari, Edge).
- Aucun environnement Node.js, Python ou compilateur n'est requis.

### Lancer l'application localement

#### Méthode 1 : Navigateur direct
Ouvrez simplement le fichier `index.html` dans votre navigateur :
```text
file:///chemin/vers/M3D/index.html
```

#### Méthode 2 : Serveur statique local (Recommandé pour tester le Service Worker et PWA)
Le Service Worker requiert un contexte sécurisé (`http://localhost` ou `https://`). Vous pouvez utiliser n'importe quel serveur HTTP statique :

- **Avec Python 3** :
  ```bash
  python -m http.server 8080
  # Ouvrir http://localhost:8080
  ```

- **Avec Node.js (npx)** :
  ```bash
  npx serve .
  # ou
  npx http-server -p 8080
  ```

- **Avec l'extension VS Code Live Server** :
  Faites un clic-droit sur `index.html` > *Open with Live Server*.

---

## 2. Structure et Règles du Code

### Principes à respecter impérativement :
1. **Ne pas introduire de build tool** : Tout le code doit rester directement compréhensible et exécutable par le navigateur (Vanilla HTML/CSS/JS).
2. **Ordre des dépendances** : Si vous ajoutez un nouveau script ou module, déclarez-le dans `index.html` dans le respect des dépendances, et référencez-le dans `sw.js` (`ASSETS`) en incrémentant la version du cache.
3. **Échappement systématique** : Utilisez la fonction `esc(chaine)` pour toute insertion de variable dans du HTML dynamique afin de prévenir toute faille XSS.
4. **Calculs dynamiques** : Ne stockez jamais en dur des totaux financiers ou des statuts de paiement. Calculez-les toujours dynamiquement à partir des lignes réelles d'historique (`cotisations`, `liste_paiements`).

---

## 3. Organisation des Fichiers

| Répertoire / Fichier | Responsabilité |
| :--- | :--- |
| `index.html` | Coquille sémantique minimale. Contient le `header.topbar`, `main#app-content`, `nav.tabbar` et les scripts. |
| `css/variables.css` | Design Tokens : couleurs HSL/Hex, dimensions, espacements, ombres. |
| `css/base.css` | Reset universel, styles typographiques, scrollbars. |
| `css/layout.css` | Grille principale, topbar, tabbar, bouton d'action flottant. |
| `css/components.css` | Composants graphiques réutilisables (cards, badges, modals, KPI). |
| `css/responsive.css` | Comportement responsive (>900px, petits écrans <360px, print). |
| `js/config.js` | Constantes globales, rôles, icônes SVG, libellés. |
| `js/utils.js` | Fonctions utilitaires pures (dates, monnaie, sécurité XSS, canvas). |
| `js/db.js` | Modèle de données Dexie, migrations de schéma, requêtes IndexedDB. |
| `js/state.js` | Gestionnaire d'état de session, thème clair/sombre, verrouillage. |
| `js/ui.js` | Bottom sheets, fenêtres modales, notifications toast, prompts sécurisés. |
| `js/app.js` | Contrôleur applicatif, écouteurs d'événements, rendu des onglets. |
| `sw.js` | Service Worker PWA, gestion du cache offline. |

---

## 4. Ajout d'une Nouvelle Fonctionnalité

### Exemple : Ajouter une nouvelle table ou propriété
1. Modifiez `js/db.js` en incrémentant le numéro de version de schéma Dexie :
   ```javascript
   db.version(7).stores({
     nouvelle_table: "id, date, statut",
     membres: "id, nom, role, telephone, statut, nouveau_champ"
   });
   ```
2. Mettez à jour les fonctions de sauvegarde et restauration dans `js/app.js` (`TABLES_APPLICATION`) pour que la nouvelle table soit bien incluse dans les exports JSON.
3. Implémentez la logique d'affichage dans la vue appropriée (`js/app.js`).
4. Si de nouveaux styles sont nécessaires, ajoutez-les dans `css/components.css`.

---

## 5. Protocole de Test et Recette

Avant toute soumission de code, effectuez les vérifications suivantes :

### A. Contrôle Console
- Ouvrez les Outils de Développement (F12) > Console.
- Naviguez entre tous les onglets (`Accueil`, `Membres`, `Dimanche`, `Dettes`, `Plus`).
- Aucune erreur rouge (`Uncaught TypeError`, `SyntaxError`) ne doit apparaître.

### B. Contrôle Fonctionnel
- **Membres** : Ajout d'un membre avec photo, édition, suppression avec mot de passe.
- **Dimanche** : Pointage d'un membre avec montant, affichage des totaux de caisse.
- **Activités** : Création d'une sortie avec plusieurs frais, inscription d'un participant, encaissement d'un acompte, vérification du statut (Partiel / Payé).
- **Sauvegarde** : Export du fichier JSON et réimport sur une base vierge pour vérifier l'intégrité de toutes les tables.

### C. Contrôle Responsive
- Testez aux dimensions :
  - Mobile standard : 375px et 390px (iPhone / Pixel)
  - Petit écran : 320px (vérifier l'absence d'overflow horizontal)
  - Tablette : 768px
  - Desktop : 1024px et 1440px (vérifier le centrage et la disposition adaptative)
- Tester le mode sombre et le mode clair.

### D. Contrôle Hors-Ligne
- Dans DevTools > Network, cochez **Offline**.
- Rechargez la page : l'application doit s'afficher immédiatement et conserver toutes ses fonctionnalités de saisie et de consultation.
