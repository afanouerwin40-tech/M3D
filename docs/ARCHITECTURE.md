# Architecture du Projet M3D

Version : 1.9.0  
Date : 2026-09-29  
Schéma DB : v9  
Service Worker : v39

---

## 1. Vue d'ensemble

Le projet est une PWA Vanilla JavaScript, sans build, sans framework, 100 % hors ligne. L'architecture est volontairement plate : un seul point d'entrée (`index.html`), un chargement séquentiel de scripts, un seul orchestrateur (`app.js`), des modules par domaine, et une seule base locale (`IndexedDB` via Dexie).

Le choix de Vanilla (sans React / Vue) est un choix de pérénité : le code est directement lisible, il ne dépend pas d'un framework qui peut disparaître, et il fonctionne sans serveur npm/yarn. Le projet est pensé pour durer au-delà des modes techniques.

---

## 2. Ordre de chargement

Le fichier `index.html` charge les scripts dans cet ordre. Cet ordre n'est pas négociable : il garantit que chaque fichier trouve ses dépendances définies au moment où il est chargé.

```text
1.  Dexie.js (CDN)     → wrapper IndexedDB
2.  config.js          → constantes métier (MOIS_NOMS, FONCTIONS, ...)
3.  utils.js           → fonctions pures (fmt, fmtDate, esc, uid, ...)
4.  db.js              → couche données (Dexie, schéma v9, migrations)
5.  state.js           → état global (currentTab, activeSessionId, ...)
6.  ui.js              → composants UI (modales, toasts, confirmations)
7.  modules/accueil.js → tableau de bord
8.  modules/membres.js → annuaire
9.  modules/cotisations.js → collectes hebdomadaires
10. modules/finances.js → caisse, dettes, prêts
11. modules/activites.js → activités, calendrier, frais
12. modules/dons.js → dons
13. modules/recherche.js → recherche globale
14. modules/graphiques.js → graphiques Canvas
15. modules/exports.js → points d'entrée exports PDF / JSON
16. services/pdf/socle.js → fondations impression (dépend de exports.js)
17. services/pdf/composants.js → briques de tableau (dépend de socle.js)
18. services/pdf/rapports.js → 5 rapports (dépend des deux précédents)
19. modules/systeme.js → système, sauvegarde, paramètres
20. app.js             → orchestrateur (tous les modules)
```

Le Service Worker (`sw.js`) est enregistré dans `app.js` via `navigator.serviceWorker.register()`. Il ne dépend d'aucun module en particulier, mais il doit connaître la liste des fichiers à mettre en cache (`ASSETS[]`). Toute modification d'un fichier doit être accompagnée d'une mise à jour de cette liste et du `CACHE_NAME`.

Le terme `CACHE_NAME = "m3d-cache-v39"` est la version du cache du navigateur : après chaque modification des fichiers, il doit être incrémenté (`v40`, `v41`, ...) pour que le navigateur serve la nouvelle version et non l'ancienne en cache.

---

## 3. Séparation des responsabilités

Chaque fichier a un rôle unique et documenté :

- `config.js` : aucune logique, uniquement des constantes (noms des mois, fonctions possibles, catégories de dépense).
- `utils.js` : fonctions pures, sans effet de bord (pas d'accès au DOM, pas d'accès à la base).
- `db.js` : seul fichier qui touche `IndexedDB` directement. Tout accès aux données passe par lui.
- `state.js` : seul fichier qui modifie l'état global (`currentTab`, `activeSessionId`, `currentTheme`, ...).
- `ui.js` : composants réutilisables, indépendants des données.
- `modules/*` : logique métier par domaine. Aucune logique métier dans `app.js`.
- `services/pdf/*` : production de documents. Ne lit jamais `IndexedDB` directement (pas besoin : les données sont passées en paramètre).
- `app.js` : orchestration uniquement. Aucune logique métier lourde.

Le principe de **séparation** signifie que si un fichier change, il ne doit affecter que son propre domaine. Par exemple, une modification du calendrier dans `activites.js` ne doit pas toucher `app.js`, sauf si le nom de la fonction appelée change.

Le terme **dépendance** signifie : le fichier A a besoin du fichier B au chargement. Si B n'est pas chargé, A ne peut pas fonctionner. C'est pourquoi l'ordre dans `index.html` est fixe.

---

## 4. Les modules (détail par domaine)

Chaque module suit le même modèle :

1. Un bloc `@file` en haut du fichier (nom, rôle, entrées, sorties, choix de conception) ;
2. Des fonctions documentées (`@param`, `@returns`, `@sideEffect`, `@why`) ;
3. Un objet `window.<module>Module` publié en bas du fichier, pour que `app.js` puisse l'utiliser sans connaître le nom des fonctions internes.

Le modèle `window.accueilModule = { ... }` est le mécanisme d'export du projet (sans module `export` puisque le projet n'utilise pas un bundler). Chaque module publie un objet unique, dont le nom est le nom du fichier précédé du nom du module. Cela évite les collisions de noms dans le navigateur.

Le terme **injection de dépendances** signifie : au lieu d'appeler directement `openARelancerSheet`, la fonction `construireAuJourdhuiItems` la reçoit en paramètre. Cela permet de tester la fonction sans le navigateur, en passant des fonctions factices.

---

## 5. Base de données

Le nom de la base (`m3d_db`) ne doit jamais changer : le changer ferait perdre toutes les données des utilisateurs. Le schéma (`SCHEMA_VERSION = 9`) est la version du code qui correspond au contenu de la base.

Chaque table a un nom (clé primaire, index) et un rôle. Les 15 tables sont définies dans `CLAUDE.md` (§8) et dans `docs/BASE_DE_DONNEES.md`.

Le terme **index** désigne un champ sur lequel on peut filtrer rapidement (par exemple, `id_dimanche` dans `paiements`). Sans index, chaque recherche parcourrait toute la table.

Le terme **migration** désigne le code qui transforme la base d'une version ancienne (`v8`) vers une nouvelle (`v9`). Une migration doit être idempotente (elle vérifie si déjà appliquée) et ne doit jamais supprimer une table historique.

---

## 6. Authentification

Le mot de passe administrateur est stocké sous forme de hash SHA-256 avec un sel (`salt`). Quand l'utilisateur tape son mot de passe, le logiciel calcule le hash du mot combiné au sel et le compare au hash stocké. Le mot de passe en clair n'est jamais enregistré.

Le flux d'authentification est documenté dans `CLAUDE.md` (§10) : saisie du mot de passe → validation (`verifyAdminPassword`) → création de la session (`setSessionAuthed`) → verrouillage automatique après 30 minutes (`verrouillerSiExpire`).

Le terme **session** désigne ici deux choses : le `sessionStorage` (la zone de stockage du navigateur qui se vide à la fermeture de l'onglet) et la variable `sessionId` (l'identifiant de la session annuelle active dans la base, stocké dans `parametres`).

---

## 7. PWA et Service Worker

Le Service Worker (`sw.js`) met en cache tous les fichiers de l'application (`ASSETS[]`). Après le premier chargement, l'application fonctionne sans connexion : le navigateur sert la copie en cache (`Cache First`) et met à jour en arrière-plan (`Stale While Revalidate`).

Le terme **Stale While Revalidate** signifie : le navigateur sert la copie en cache immédiatement, et en même temps demande au serveur (ou au cache) s'il y a une nouvelle version. L'utilisateur voit la page tout de suite, et la mise à jour arrive en arrière-plan.

Le terme **`skipWaiting`** est une option du Service Worker qui force l'activation immédiate du nouveau worker (plutôt que d'attendre que tous les onglets soient fermés). C'est nécessaire pour que la nouvelle version du cache soit active tout de suite.

Le terme **`clients.claim`** signifie que le Service Worker prend le contrôle de la page immédiatement, même si elle avait déjà été chargée avant l'activation du worker.

---

## 8. PDF et impression

Le pipeline PDF est : données → préparation (`rapports.js`) → mise en page (`socle.js`) → brique de tableau (`composants.js`) → fenêtre d'impression (`exports.js` → `openPrintableWindow()`).

Le document imprimé est du HTML injecté dans une fenêtre (`window.open()`), pas un PDF natif. Le navigateur imprime cet HTML avec le style `PDF_COULEURS` (palette terracotta). C'est un choix délibéré : le navigateur sait déjà imprimer, et cela évite d'ajouter une bibliothèque PDF lourde.

Le terme **`esc()`** (échappement) est la protection contre le XSS : avant d'injecter un nom, un titre, ou un commentaire dans le HTML, on remplace `<` par `&lt;`, `>` par `&gt;`, `"` par `&quot;`, `&` par `&amp;`. C'est obligatoire, même dans le `<title>` du document imprimé.

Le terme **`openPrintableWindow`** est le seul point d'ouverture d'une fenêtre d'impression. Il est défini dans `exports.js` et appelé par `services/pdf/socle.js`. Ce n'est pas un hasard : cela garantit que tout document imprimé passe par le même mécanisme.

---

## 9. Tests

Le projet a 111 assertions (26 + 29 + 22 + 34), sans aucune dépendance npm. Les tests tournent à la main (`node tools/test-*.js`). Ils simulent la base (`Dexie` simulé), le DOM (`jsdom`), et les modules (chargés dans l'ordre via le module `vm` de Node).

Le fichier `verify-globals.js` compare la liste des 118 identifiants attendus (`identifiants-attendus.txt`) avec ce qui est réellement accessible après le chargement de tous les scripts. Si un identifiant est ajouté ou supprimé, le fichier de référence doit être mis à jour.

Le terme **`vm`** (Virtual Machine) est le module Node qui exécute du code dans un contexte isolé. C'est ce qui permet de simuler le chargement du navigateur sans l'ouvrir.

---

## 10. Décisions techniques clés

- **Vanilla JS** : pas de build, pas de dépendance à un framework, le code est directement lisible et durable.
- **IndexedDB via Dexie** : standard Web, capacité de plusieurs Go, transactions ACID, requêtes avec index.
- **Event Sourcing** : aucun total stocké, tout recalculé depuis l'historique, cohérence garantie.
- **No Build** : pas de `package.json`, pas d'installateur. Les fichiers sont chargés directement dans le navigateur.
- **Pas de `.gitignore`** : les sauvegardes JSON exportées par l'application sont des données réelles et ne doivent pas être ignorées par Git (le dépôt doit les conserver, même si elles sont des données et non du code).

Le terme **ACID** (Atomic, Consistent, Isolated, Durable) décrit les garanties d'une transaction de base de données : soit tout est fait, soit rien n'est fait ; la base reste cohérente même si plusieurs utilisateurs la lisent en même temps ; et les données sont conservées même après une coupure de courant.

---

*Document mis à jour dans le cadre de la documentation pédagogique du projet M3D, v1.9.0, 2026-09-29.*
