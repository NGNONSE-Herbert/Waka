/*
 * Waka — service worker minimal.
 * Met en cache UNIQUEMENT la coquille de l’application et les ressources statiques.
 * Ne met JAMAIS en cache les réponses d’API (/api/*) : aucune donnée de réservation ou de paiement
 * ne peut être servie périmée. Hors connexion, les navigations retombent sur /hors-ligne.
 */
const VERSION = 'waka-shell-v2';
const SHELL = ['/hors-ligne', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Jamais d’interception des appels API (paiements, réservations, session…).
  if (url.pathname.startsWith('/api/')) return;

  // Ressources statiques versionnées : cache d’abord.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:woff2?|svg|png|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations : réseau d’abord, page hors ligne en secours (aucune page dynamique n’est mise en cache).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/hors-ligne').then((r) => r || Response.error())));
  }
});
