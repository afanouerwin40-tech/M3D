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
3. **Échappement systématique** : Utilisez la fonction `esc(chaine)` pour toute insertion de variable dans du HTML dynamique afin de prévenir toute faille XSS. **Y compris dans la fenêtre d'impression** — c'est le trou qui a survécu jusqu'en v1.9.0.
4. **Calculs dynamiques** : Ne stockez jamais en dur des totaux financiers ou des statuts de paiement. Calculez-les toujours dynamiquement à partir des lignes réelles d'historique (`paiements`, `liste_paiements`).
5. **Pas de dépendance npm** : ni `package.json`, ni installateur. Le projet est « no-build » et le reste, tests compris.

---

## 3. Organisation des Fichiers

| Répertoire / Fichier | Responsabilité |
| :--- | :--- |
| `index.html` | Coquille sémantique minimale. Contient le `header.topbar`, `main#app`, `nav.tabbar` et les scripts. |
| `css/variables.css` | Design Tokens : couleurs, dimensions, espacements, ombres. |
| `css/base.css` | Reset universel, styles typographiques, animations. |
| `css/layout.css` | Grille principale, topbar, tabbar, bouton d'action flottant. |
| `css/components.css` | Composants réutilisables (cards, badges, modals, KPI). |
| `css/responsive.css` | Comportement responsive (>900px, petits écrans, print). |
| `js/config.js` | Constantes de domaine. |
| `js/utils.js` | Fonctions pures (dates, monnaie, `esc()`, canvas). |
| `js/db.js` | Modèle Dexie, migrations, **seul fichier autorisé à toucher IndexedDB**. |
| `js/state.js` | Onglet actif, session, thème, verrouillage. |
| `js/ui.js` | Bottom sheets, toasts, confirmation mot de passe. |
| `js/modules/*.js` | Logique métier par domaine. |
| `js/services/pdf/*.js` | Production des documents imprimables. |
| `js/app.js` | Orchestration : routage des onglets, modales transverses. |
| `tools/*.js` | Harnais de test Node, sans dépendance. |
| `sw.js` | Service Worker PWA, cache offline. |

---

## 4. Tests

```bash
node tools/verify-globals.js     # 118 identifiants globaux attendus
node tools/test-dettes.js        # 26 assertions
node tools/test-donnees-test.js  # 29 assertions
node tools/test-logique.js       # 22 assertions
node tools/test-pdf.js           # 34 assertions
```

**Lancer les cinq avant toute modification du code.** Ils s'exécutent
en quelques secondes et évitent la majorité des régressions.

Comment ça marche : chaque harnais lit `index.html`, exécute les scripts dans
l'ordre de chargement via le module `vm` de Node, avec un DOM simulé et une
base Dexie simulée. Le but est de tester la logique réelle, pas une copie.

### Deux règles qui évitent des heures perdues

1. **Un identifiant global nouveau doit être ajouté à
   `tools/identifiants-attendus.txt`.** `verify-globals.js` le vérifie.
   L'omission passe inaperçue jusqu'à l'appel, en production.
2. **Un rapport PDF nouveau doit avoir un cas dans `tools/test-pdf.js`** —
   au minimum : le cas « aucune donnée », et un nom contenant
   `</title><script>`.

### Ce que les tests ne couvrent pas

Le rendu visuel (mise en page A4, pagination), la mise à jour IndexedDB dans
un vrai navigateur, et la propagation du service worker. Ces trois points
relèvent de la recette manuelle ci-dessous.

---

## 5. Ajouter une Nouvelle Fonctionnalité

### Ajouter une table ou une propriété
1. **Ne dupliquez pas** : vérifiez d'abord. Si une structure existante peut
   être réutilisée (un champ sur un enregistrement, pas une table), faites-le.
2. Modifiez `js/db.js` en incrémentant la version :
   ```javascript
   db.version(10).stores({
     ...toutes les tables v9 inchangées...,
     nouvelle_table: "id, date, statut",
   });
   ```
   La migration doit être **additive, idempotente et non destructive**. Ne
   modifiez jamais une migration déjà déployée.
3.  **Ajoutez la table à `TABLES_APPLICATION` dans
   `js/modules/systeme.js`.** C'est une liste blanche figée : une table
   absente est **silencieusement perdue** dans les sauvegardes JSON.
4. Incrémentez `SCHEMA_VERSION` dans `db.js`.
5. Implémentez la logique d'affichage dans le module concerné.
6. Mettez à jour `CHANGELOG.md` et `CLAUDE.md`.

### Ajouter un rapport PDF
1. Écrivez la composition du rapport dans `js/services/pdf/rapports.js`, en
   utilisant `pdfEntete()`, `pdfTableau()`, `pdfResume()`, `pdfLigneTotal()`.
2. Ne recréez pas de formatage monétaire : `fmt()` fait déjà le travail.
3. Ajoutez le cas de test dans `tools/test-pdf.js`.
4. Ajoutez l'identifiant à `tools/identifiants-attendus.txt`.
5. Si c'est un nouveau fichier, ajoutez-le à `ASSETS[]` dans `sw.js` et
   incrémentez `CACHE_NAME`.

---

## 6. Protocole de Test et Recette

### A. Tests automatisés
Les cinq commandes de la section 4. Aucun échec toléré.

### B. Contrôle Console
- Ouvrez les Outils de Développement (F12) > Console.
- Naviguez entre tous les onglets (`Accueil`, `Membres`, `Dimanche`,
  `Finance`, `Activités`).
- Aucune erreur rouge (`Uncaught TypeError`, `SyntaxError`).

### C. Contrôle Fonctionnel
- **Membres** : ajout avec photo, édition, suppression avec mot de passe.
- **Dimanche** : pointage d'un membre, affichage des totaux de caisse.
- **Activités** : création avec plusieurs frais, inscription d'un participant,
  encaissement d'un acompte, statut (Partiel / Payé).
- **Dons** : saisie d'un don général et d'un don rattaché à une activité ;
  vérifier total et nombre de donateurs.
- **Dettes** : rembourser une dette en tiers, vérifier que l'écran affiche
  montant, date **et le nom figé du rembourseur**.
- **Rapports PDF** : imprimer les cinq rapports et contrôler la mise en page
  A4. **C'est la seule partie que les tests ne peuvent pas vérifier.**
- **Sauvegarde** : export JSON, contrôle que le fichier contient bien la
  table `dons`, réimport sur une base vierge.

### D. Contrôle Responsive
- Mobile standard : 375px et 390px
- Petit écran : 320px (absence d'overflow horizontal)
- Tablette : 768px
- Desktop : 1024px et 1440px
- Thème sombre et thème clair.

### E. Contrôle Hors-Ligne
- DevTools > Application > Service Workers : **désinstaller** le service
  worker avant de tester une modification, puis recharger avec `Ctrl+Shift+R`.
  Sans cela, un ancien fichier peut être servi depuis le cache.
- DevTools > Network, cochez **Offline**, rechargez : l'application doit
  rester pleinement fonctionnelle.

---

## 7. Pièges Connus

| Piège | Symptôme | Solution |
| :--- | :--- | :--- |
| Cache du service worker | Un changement JS n'apparaît pas | `Ctrl+Shift+R`, ou désinstaller le service worker dans DevTools |
| `TABLES_APPLICATION` oublié | La table manque dans la sauvegarde, sans message | L'ajouter dans `js/modules/systeme.js` |
| `identifiants-attendus.txt` non mis à jour | Un appel casse en production, pas en test | Ajouter l'identifiant, relancer `verify-globals.js` |
| `safeColor()` | N'existe plus | Les activités n'ont plus de couleur ; le PDF utilise `PDF_COULEURS` (valeurs en dur) |
| Base bloquée à l'ouverture | « Mise à jour de la base bloquée » | Un autre onglet de l'application est ouvert. Le fermer et recharger |
