// sw.js — Stratégie "Cache First" avec mise à jour en tâche de fond (Stale While Revalidate).
// L'application fonctionne 100% hors-ligne une fois installée.
// Le cache est invalidé et recréé à chaque incrément de version (CACHE_NAME).

const CACHE_NAME = "m3d-cache-v20"; // v20 : Refonte UI/UX Phase A — design tokens, typographie Inter unifiée, thème

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
  "./js/app.js",
  // Icônes PWA
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // Bibliothèques et polices externes
  "https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
];

self.addEventListener("install", (event) => {
  // Mise en cache tolérante aux pannes : chaque ressource est mise en cache individuellement
  // pour éviter qu'un échec réseau isolé (ex. blocage CDN/Google Fonts) n'interrompe l'installation.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

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

self.addEventListener("fetch", (event) => {
  // Ignore les requêtes non-GET et les protocoles tiers (ex. chrome-extension://)
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
