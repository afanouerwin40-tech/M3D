// sw.js — Service Worker de M3D Gestion.
// Stratégie : "Cache First" avec mise à jour en tâche de fond (Stale While Revalidate).
// L'application fonctionne 100% hors-ligne une fois installée.
// Le cache est invalidé et recréé à chaque incrément de version (CACHE_NAME).

//
// QU'EST-CE QU'UN SERVICE WORKER ?
//
// C'est un script que le navigateur exécute en arrière-plan, dans un fil
// d'exécution séparé de celui de la page. Le mot « thread » désigne ici
// simplement une suite d'instructions qui s'exécute en parallèle d'une
// autre : le code du service worker ne bloque donc jamais l'interface.
//
// Son pouvoir particulier est de s'intercepter lui-même, à trois moments :
//
//   1. `install`  — le navigateur vient d'installer le service worker,
//                   au moment où l'application est publiée en ligne.
//   2. `activate` — le service worker devient actif et prend la main.
//   3. `fetch`    — AVANT que la requête ne parte sur le réseau, le service
//                   worker en a connaissance et peut y répondre lui-même.
//
// C'est ce troisième point qui rend la PWA possible. Cacher un fichier
// (« mettre en cache ») consiste à le copier dans un stockage du navigateur
// pour pouvoir le relire plus tard sans réseau.
//
// AVEC QUOI IL COMMUNIQUE :
//   - le Cache Storage API (`caches`), le stockage officiel de fichiers ;
//   - l'API `fetch` du réseau, qu'il intercepte ;
//   - `self`, qui désigne le service worker lui-même (et non la page).
//
// LES DEUX RÈGLES À NE PAS OUBLIER :
//   - CACHE_NAME change à chaque version : c'est le seul mécanisme qui
//     remplace le contenu du cache. L'oublier = les utilisateurs gardent
//     l'ancienne version en cache indéfiniment.
//   - Tout nouveau fichier doit être ajouté à ASSETS[] ci-dessous, sinon il
//     ne sera jamais disponible hors-ligne.
//

const CACHE_NAME = "m3d-cache-v39"; // v39 : services PDF (socle + composants + 5 rapports)

/**
 * Liste exhaustive des ressources à mettre en cache à l'installation.
 *
 * C'est une liste en dur, volontairement : elle documente tout ce dont
 * l'application a besoin pour démarrer sans réseau. Les URL sont relatives
 * au dossier du fichier, ce qui permet à l'application de fonctionner
 * aussi bien depuis un serveur web que depuis un fichier local.
 *
 * Conséquence à retenir : tout nouveau fichier ajouté au projet (un module
 * JS, une feuille de style) DOIT être ajouté ici. S'il ne l'est pas,
 * l'application fonctionnera en ligne et cassera dès la première
 * utilisation hors-ligne — un bug qui ne se voit jamais en développement.
 *
 * @type {string[]}
 */
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  // Feuilles de styles modulaires
  "./css/variables.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/responsive.css",
  "./css/style.css",
  // Scripts JS modulaires
  "./js/config.js",
  "./js/utils.js",
  "./js/db.js",
  "./js/state.js",
  "./js/ui.js",
  "./js/modules/accueil.js",
  "./js/modules/membres.js",
  "./js/modules/cotisations.js",
  "./js/modules/finances.js",
  "./js/modules/activites.js",
  "./js/modules/dons.js",
  "./js/modules/recherche.js",
  "./js/modules/graphiques.js",
  "./js/modules/exports.js",
  "./js/modules/systeme.js",
  "./js/app.js",
  // Icônes PWA
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // Bibliothèques et polices externes
  "https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  // Services PDF
  "./js/services/pdf/socle.js",
  "./js/services/pdf/composants.js",
  "./js/services/pdf/rapports.js",
];

// ---------------------------------------------------------------------------
// ÉVÉNEMENT 1/3 — `install` : remplir le cache avec les ressources listées.
// ---------------------------------------------------------------------------
// `self.addEventListener("install", ...)` enregistre une fonction qui sera
// appelée au moment de l'installation. « Listener » = fonction simplement
// mémorisée, appelée automatiquement quand l'événement se produit.
//
// `event.waitUntil(...)` indique au navigateur de maintenir le service
// worker en vie jusqu'à la fin de la Promesse passée en argument. Sans
// lui, le navigateur pourrait couper l'exécution en cours de route et le
// cache resterait à moitié rempli.
//
// `.then(...)` est le moyen d'enchaîner des Promesses : il attend que la
// précédente soit résolue avant de lancer la suivante. On construit donc
// une chaîne — ouvrir le cache, tout y mettre, puis activer.
//
// `self.skipWaiting()` demande à passer immédiatement à l'état actif,
// sans attendre que tous les onglets ouverts soient fermés. Sans cela, un
// utilisateur qui laisse un onglet ouvert verrait l'application rester
// bloquée sur l'ancienne version jusqu'à la fermeture de tous les onglets.
self.addEventListener("install", (event) => {
  // Mise en cache tolérante aux pannes : chaque ressource est mise en cache individuellement
  // pour éviter qu'un échec réseau isolé (ex. blocage CDN/Google Fonts) n'interrompe l'installation.
  // Le `.catch(() => {})` est un rattrapage silencieux : une ressource
  // indisponible est ignorée, sans faire échouer toute l'installation.
  // C'est indispensable ici, car Google Fonts et le CDN de Dexie sont des
  // ressources externes : si l'un des deux est injoignable au moment du
  // déploiement, on préfère une application qui démarre quand même.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// ÉVÉNEMENT 2/3 — `activate` : supprimer les anciens caches, prendre la main.
// ---------------------------------------------------------------------------
// C'est le seul moment où l'on peut faire le ménage, et il ne faut pas le
// louper : c'est ici que se libère l'espace disque des anciennes versions.
// `caches.keys()` liste les noms de tous les caches du navigateur (le nôtre
// et ceux d'autres applications installées sur le même site). On ne supprime
// que ceux qui ne portent pas le nom courant — d'où le filtre `k !== CACHE_NAME`.
//
// `self.clients.claim()` dit : « passe le contrôle de l'application aux
// onglets déjà ouverts ». Sans cet appel, un onglet ouvert avant
// l'installation du nouveau service worker continuerait d'être servi par
// l'ancien code, incohérent avec le cache nouvellement rempli. `claim` est
// le pendant de `skipWaiting` côté onglets.
//
// Effets de bord : supprime physiquement des caches. Irréversible.
self.addEventListener("activate", (event) => {
  // Purge immédiate de tous les caches antérieurs pour garantir la cohérence des assets
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// ÉVÉNEMENT 3/3 — `fetch` : la stratégie « Cache First + Stale While Revalidate ».
// ---------------------------------------------------------------------------
// C'est le cœur de l'application hors-ligne. À chaque requête (chaque image,
// feuille de style ou script que la page demande), le service worker décide
// quoi répondre, AVANT que la requête n'atteigne le réseau.
//
// Le nom de la stratégie résume exactement ce qui se passe :
//   - « Cache First » : si la ressource est en cache, on la renvoie
//     immédiatement. Aucune attente réseau, l'application s'ouvre à
//     l'instant, y compris sans connexion.
//   - « Stale While Revalidate » (« servir périmé pendant la
//     réactualisation ») : pendant ce temps, on va malgré tout chercher la
//     version fraîche sur le réseau, en arrière-plan, pour la ranger dans
//     le cache. L'utilisateur ne paie pas l'attente ; la prochaine
//     ouverture sera à jour. C'est le compromis assumé de la PWA : la
//     vitesse prime sur l'exactitude immédiate.
//
// Deux subtilités de l'implémentation :
//   - `response.clone()` : un corps de réponse HTTP ne peut être lu qu'une
//     seule fois. On en fait donc une copie à platter avant de la stocker,
//     pour pouvoir servir la réponse d'origine à la page en parallèle.
//   - `return cached || network` : l'opérateur `||` renvoie `cached` s'il
//     est défini, sinon `network`. Le réseau n'est donc jamais attendu
//     quand le cache peut répondre — et si le réseau échoue
//     (`.catch(() => cached)`), on se rabat sur la copie en cache.
self.addEventListener("fetch", (event) => {
  // Ignore les requêtes non-GET et les protocoles tiers (ex. chrome-extension://)
  // Un `return` ici sort de la fonction sans répondre : le navigateur
  // poursuit alors la requête normalement, sans passer par le cache.
  // Seul le HTTP est traité, car c'est le seul protocole que l'application
  // utilise, et surtout le seul que le Cache Storage sait stocker.
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) return;

  // `event.respondWith(...)` dit au navigateur : « je prends en charge
  // cette réponse, ne l'envoie pas sur le réseau toi-même ». C'est
  // obligatoire pour intercepter une requête.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // `const network = fetch(...)` — noter que `fetch(...)` est LANCÉ tout
      // de suite, mais sa Promesse n'est pas encore attendue : c'est ce qui
      // rend la réactualisation « en tâche de fond ».
      const network = fetch(event.request)
        .then((response) => {
          // Seuls les succès (200) sont stockés : une page d'erreur 404 ou
          // 500 ne doit pas polluer le cache.
          if (response && response.status === 200) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Réponse immédiate si possible, sinon on attend le réseau.
      return cached || network;
    }),
  );
});