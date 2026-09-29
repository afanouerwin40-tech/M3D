# Le Système PWA et Offline — M3D Gestion

M3D Gestion est une **Progressive Web App (PWA)**. Ce document explique comment elle parvient à fonctionner sans aucune connexion Internet.

---

## 1. Les trois piliers de la PWA

Une PWA repose sur trois composants qui travaillent ensemble :

1. **Le Manifeste (`manifest.webmanifest`)** : C'est la "carte d'identité" de l'app. Il définit le nom, les icônes et comment l'app doit s'ouvrir (sans la barre d'adresse du navigateur).
2. **Le Service Worker (`sw.js`)** : C'est un script qui tourne en arrière-plan. Il intercepte les requêtes réseau et décide quoi faire.
3. **Le Cache du Navigateur** : C'est là que le Service Worker stocke les fichiers de l'application (HTML, CSS, JS, Images).

---

## 2. Code vs Données : Deux stockages différents

C'est la confusion la plus fréquente chez les débutants.

### A. Le Cache (Stocke le "contenant")
Le Service Worker utilise le **Cache API** pour stocker les fichiers du projet.
- **Quoi ?** `index.html`, `js/app.js`, `css/style.css`, etc.
- **But** : Que l'interface s'affiche même si vous êtes en mode avion.
- **Mise à jour** : Se fait en changeant `CACHE_NAME` dans `sw.js`.

### B. IndexedDB (Stocke le "contenu")
L'application utilise **IndexedDB** pour les données de l'utilisateur.
- **Quoi ?** La liste des membres, les montants des cotisations, les photos.
- **But** : Que vos données soient persistantes et consultables hors ligne.
- **Mise à jour** : Se fait via les formulaires de l'application.

---

## 3. Stratégie du Service Worker

M3D Gestion utilise une stratégie appelée **"Cache First, Stale While Revalidate"**.

1. **Cache First** : Quand vous ouvrez l'app, le Service Worker sert immédiatement les fichiers depuis le cache. C'est pour cela que l'app est instantanée.
2. **Stale While Revalidate** : En parallèle, il demande discrètement au serveur s'il existe une nouvelle version. S'il y en a une, il la télécharge et la met en cache pour la *prochaine* fois.

### Conséquence importante
Si vous modifiez un fichier (ex: `js/utils.js`), le changement ne sera pas visible au premier rechargement. Vous devrez fermer et rouvrir l'application, ou faire un `Ctrl + Shift + R`.

---

## 4. Comment installer l'application ?

L'application n'est pas sur le Play Store ou l'App Store, mais s'installe directement depuis le navigateur :

- **Sur Android (Chrome)** : Menu (trois points) -> "Installer l'application".
- **Sur iPhone (Safari)** : Bouton "Partager" (carré avec flèche) -> "Sur l'écran d'accueil".
- **Sur Ordinateur (Chrome/Edge)** : Icône "Installer" à droite dans la barre d'adresse.

Une fois installée, l'icône apparaît sur votre écran d'accueil et l'app s'ouvre dans sa propre fenêtre, comme une application native.

---

## 5. Maintenance (sw.js)

Si vous ajoutez un nouveau fichier au projet (ex: `js/modules/nouveau.js`) :

1. Vous **DEVEZ** l'ajouter à la liste `ASSETS` dans `sw.js`. Sinon, ce fichier ne sera pas disponible hors ligne.
2. Vous **DEVEZ** incrémenter le numéro de version de `CACHE_NAME` (ex: `m3d-cache-v39` -> `v40`). Cela force le navigateur des utilisateurs à vider l'ancien cache pour prendre le nouveau.

---

## 6. Limites du mode Offline

- **Pas de synchronisation automatique** : Si vous utilisez l'app sur deux téléphones différents, les données ne se synchronisent pas entre elles (sauf si vous faites un export/import manuel).
- **Dépendance au navigateur** : Si vous effacez les "données de site" dans les paramètres de votre navigateur, vous supprimez la base de données IndexedDB. **Faites des sauvegardes !**
