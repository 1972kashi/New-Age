// Minimal offline sync helper using IndexedDB
(function(){
  const DB = 'na_offline_db';
  const VERSION = 1;
  const STORE_QUEUE = 'outbox';
  const STORE_CACHE = 'cars';

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_CACHE)) db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, value){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const s = tx.objectStore(storeName);
      const r = s.put(value);
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAll(storeName){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const s = tx.objectStore(storeName);
      const r = s.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  async function deleteKey(storeName, key){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const s = tx.objectStore(storeName);
      const r = s.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function uuid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  function normalizeCarForCache(car){
    if (!car || typeof car !== 'object') return null;
    const normalized = { ...car };
    if (!normalized.name && normalized.title) normalized.name = normalized.title;
    if (!normalized.link && normalized.id) normalized.link = `car-detail.html?id=${normalized.id}`;
    normalized.cachedAt = new Date().toISOString();
    return normalized;
  }

  function notifyCarsCacheUpdated(payload){
    try {
      window.dispatchEvent(new CustomEvent('na-cars-cache-updated', { detail: payload }));
    } catch (e) {
      console.warn('offline sync event dispatch failed', e);
    }
  }

  function isSameCar(left, right){
    if (!left || !right) return false;
    if (left.id && right.id && left.id === right.id) return true;
    if (left.link && right.link && left.link === right.link) return true;
    return Boolean(left.name && right.name && left.name === right.name && left.price === right.price);
  }

  async function saveCarToCache(car){
    const normalized = normalizeCarForCache(car);
    if (!normalized) return [];

    const existing = await getCachedCars();
    const list = Array.isArray(existing) ? existing : [];
    const deduped = [normalized, ...list.filter(item => !isSameCar(item, normalized))];
    const payload = deduped.slice(0, 200);
    await put(STORE_CACHE, { key: 'cars', payload, updatedAt: new Date().toISOString() });
    notifyCarsCacheUpdated(payload);
    return payload;
  }

  async function queuePost(path, body, options = {}){
    const id = uuid();
    const record = {
      id,
      path,
      body,
      createdAt: new Date().toISOString(),
      method: options.method || 'POST',
      headers: options.headers || { 'Content-Type': 'application/json' },
      cachePayload: options.cachePayload || null
    };

    if (record.cachePayload) {
      await saveCarToCache(record.cachePayload);
    }

    await put(STORE_QUEUE, record);
    return id;
  }

  async function flushQueue(apiBase){
    const items = await getAll(STORE_QUEUE);
    for (const it of items){
      try{
        const res = await fetch(apiBase + it.path, {
          method: it.method || 'POST',
          headers: it.headers || { 'Content-Type': 'application/json' },
          body: it.body ? (typeof it.body === 'string' ? it.body : JSON.stringify(it.body)) : undefined
        });
        if (res.ok){
          await deleteKey(STORE_QUEUE, it.id);
        } else {
          console.warn('flushQueue: failed item', it, await res.text());
          return false;
        }
      } catch(err){
        console.warn('flushQueue network error', err);
        return false;
      }
    }
    return true;
  }

  async function cacheCars(data){
    const payload = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    const normalized = payload.map(normalizeCarForCache).filter(Boolean);
    await put(STORE_CACHE, { key: 'cars', payload: normalized, updatedAt: new Date().toISOString() });
    notifyCarsCacheUpdated(normalized);
    return normalized;
  }

  async function getCachedCars(){
    const all = await getAll(STORE_CACHE);
    const rec = all.find(r => r.key === 'cars');
    const payload = rec ? rec.payload : [];
    return Array.isArray(payload) ? payload : [];
  }

  async function preloadImages(cars) {
    /**
     * Preload images from car listings into the browser's cache.
     * This runs in the background and helps images load faster offline.
     * Throttled to avoid rate limit issues.
     */
    if (!Array.isArray(cars) || !('caches' in window)) return;

    const imageSources = [];
    cars.slice(0, 20).forEach(car => {  // Limit to first 20 cars to reduce requests
      if (car.img) imageSources.push(car.img);
      if (car.image) imageSources.push(car.image);
      // Skip array of images to reduce request volume
    });

    const cache = await caches.open('new-age-images-v1').catch(() => null);
    if (!cache) return;

    // Preload sequentially with delay to avoid rate limiting
    for (let i = 0; i < imageSources.length; i++) {
      const src = imageSources[i];
      if (!src) continue;
      
      // Check cache first before attempting fetch
      const cachedRes = await cache.match(src).catch(() => null);
      if (cachedRes) continue; // Already cached, skip
      
      try {
        const url = src.startsWith('http') ? src : window.location.origin + '/' + src;
        const res = await fetch(url, { mode: 'no-cors', cache: 'force-cache' }).catch(() => null);
        if (res) {
          await cache.put(url, res).catch(() => {});
        }
        // Small delay between fetches to spread out requests
        if (i < imageSources.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (e) {
        // Silently ignore image preload failures
      }
    }
  }

  function initAutoSync(apiBase){
    window.addEventListener('online', () => {
      flushQueue(apiBase).then(ok => { if (ok) console.log('outbox flushed'); });
    });
  }

  window.offlineSync = {
    queuePost,
    flushQueue,
    cacheCars,
    getCachedCars,
    saveCarToCache,
    initAutoSync,
    preloadImages
  };
})();
