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

// Request deduplication to prevent duplicate simultaneous requests
const PENDING_REQUESTS = new Map();

function createRequestKey(request) {
  return `${request.method}:${request.url}`;
}

async function deduplicatedFetch(request) {
  const key = createRequestKey(request);
  if (PENDING_REQUESTS.has(key)) {
    console.log('[SW] Deduplicating request:', key);
    return PENDING_REQUESTS.get(key);
  }
  
  const fetchPromise = fetch(request, { cache: 'no-store' });
  PENDING_REQUESTS.set(key, fetchPromise);
  
  try {
    const res = await fetchPromise;
    return res;
  } finally {
    PENDING_REQUESTS.delete(key);
  }
}

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

  // API requests: network-first with cache fallback, add request deduplication
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      deduplicatedFetch(event.request)
        .then(res => {
          // Cache successful responses and add cache headers
          if (res && res.status === 200) {
            const copy = res.clone();
            const headers = new Headers(copy.headers);
            headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
            const cachedRes = new Response(copy.body, {
              status: copy.status,
              statusText: copy.statusText,
              headers: headers
            });
            caches.open(API_CACHE_NAME).then(cache => cache.put(event.request, cachedRes));
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
            // No cache either; return cached fallback or error response
            return caches.match('/index.html').then(fallback => fallback || new Response(
              JSON.stringify({ error: 'Server unavailable', items: [] }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            ));
          });
        })
    );

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
