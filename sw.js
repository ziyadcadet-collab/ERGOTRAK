const CACHE_NAME = 'ergotrack-pro-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Une requête réseau en échec (offline, proxy, hôte injoignable) doit toujours se résoudre
// rapidement plutôt que de laisser respondWith() en attente indéfiniment — sur un réseau de
// terrain dégradé, un CDN qui ne répond pas ne doit jamais bloquer le chargement de la page.
function fetchWithTimeout(input, options, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(input, options).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate';
  const isSameOrigin = new URL(req.url).origin === self.location.origin;

  if (isNavigation || isSameOrigin) {
    // App shell : réseau d'abord (pour avoir les mises à jour), repli sur le cache hors-ligne.
    // Important : on refetch par URL (pas avec `req` directement) car un Request de mode
    // "navigate" ne peut pas être repassé à fetch() — cela bloque la navigation indéfiniment.
    event.respondWith(
      fetchWithTimeout(req.url, { headers: req.headers, credentials: 'same-origin' }, 6000)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Ressources externes (Chart.js, Google Fonts) : cache d'abord, puis réseau (avec timeout),
  // pour que l'app reste utilisable hors-ligne après un premier chargement réussi.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetchWithTimeout(req, undefined, 6000)
        .then((res) => {
          // Les requêtes cross-origin en mode no-cors (ex: <script src> vers un CDN sans
          // l'attribut crossorigin) renvoient une réponse "opaque" : status 0, res.ok toujours
          // false, impossible à inspecter. On la met quand même en cache (c'est le seul moyen
          // de rendre Chart.js/Google Fonts disponibles hors-ligne) ; pour une réponse non
          // opaque, on ne cache que si elle est effectivement valide.
          if (res && (res.type === 'opaque' || res.ok)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
    })
  );
});
