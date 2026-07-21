const CACHE_NAME = 'new-age-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/new_age.css',
  '/new_age.js',
  '/car-listings.html',
  '/car-detail.html',
  '/offline-sync.js'
];

const API_CACHE_NAME = 'new-age-api-v1';
const IMG_CACHE_NAME = 'new-age-images-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precaching core assets');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW] Cleaning old caches');
      return Promise.all(
        keys
          .filter(k => ![CACHE_NAME, API_CACHE_NAME, IMG_CACHE_NAME].includes(k))
          .map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Check if server is reachable
async function isServerAvailable() {
  try {
    const res = await fetch('/api/health', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
    return res && res.status < 500;
  } catch {
    return false;
  }
}

// Simple runtime caching strategies:
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isLocalRequest = url.origin === self.location.origin;

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          // Cache successful responses
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(API_CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(err => {
          // Network failed, try cache
          return caches.match(event.request).then(cached => {
            if (cached) {
              console.log('[SW] Using cached API response for:', url.pathname);
              return cached;
            }
            // No cache either; return error response
            return new Response(
              JSON.stringify({ error: 'Server unavailable and no cached response available' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Images: cache-first with network fallback
  if (event.request.destination === 'image' || url.pathname.startsWith('/Pic/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          console.log('[SW] Using cached image:', url.pathname);
          return cached;
        }
        // Not in cache, fetch and cache it
        return fetch(event.request, { cache: 'no-store' })
          .then(res => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(IMG_CACHE_NAME).then(cache => cache.put(event.request, copy));
            }
            return res;
          })
          .catch(err => {
            console.log('[SW] Image not cached and fetch failed:', url.pathname);
            // Return a placeholder or cached image if available
            return caches.match('/Pic/placeholder.png') || new Response('', { status: 404 });
          });
      })
    );
    return;
  }

  // HTML pages: network-first with cache fallback
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(err => {
          return caches.match(event.request).then(cached => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // CSS/JS: cache-first with network fallback
  if (event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request, { cache: 'no-store' })
          .then(res => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            }
            return res;
          })
          .catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // Default: try cache, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Return a generic offline page if available
        return caches.match('/index.html');
      });
    })
  );
});
