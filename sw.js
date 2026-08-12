// =====================
// VERIFYSTAY - Service Worker
// Caches the static app shell so it opens instantly and works offline.
// Firebase/Firestore calls always go over the network (never cached) —
// offline mode just means the pages themselves still open; live data
// (listings, login, etc.) still needs a connection.
// =====================

const CACHE_NAME = 'verifystay-v1';

const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'login.html',
    'dashboard.html',
    'feed.html',
    'post-property.html',
    'property-details.html',
    'dispute.html',
    'profile.html',
    'style.css',
    'app.js',
    'firebase-config.js',
    'login.js',
    'dashboard.js',
    'feed.js',
    'post-property.js',
    'property-details.js',
    'dispute.js',
    'profile.js',
    'manifest.json',
    'icon-192.png',
    'icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((name) => name !== CACHE_NAME)
                     .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never intercept Firebase/Google/Leaflet network calls — those must
    // always go live, not be served from cache.
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).catch(() => cached);
        })
    );
});
