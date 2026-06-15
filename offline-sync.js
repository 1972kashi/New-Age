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

  async function queuePost(path, body){
    const id = uuid();
    await put(STORE_QUEUE, { id, path, body, createdAt: new Date().toISOString() });
    return id;
  }

  async function flushQueue(apiBase){
    const items = await getAll(STORE_QUEUE);
    for (const it of items){
      try{
        const res = await fetch(apiBase + it.path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(it.body)
        });
        if (res.ok){
          await deleteKey(STORE_QUEUE, it.id);
        } else {
          // stop on first failure to avoid spinning
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
    await put(STORE_CACHE, { key: 'cars', payload: data, updatedAt: new Date().toISOString() });
  }

  async function getCachedCars(){
    const all = await getAll(STORE_CACHE);
    const rec = all.find(r => r.key === 'cars');
    return rec ? rec.payload : null;
  }

  function initAutoSync(apiBase){
    window.addEventListener('online', () => {
      console.log('online: attempting flushQueue');
      flushQueue(apiBase).then(ok => { if (ok) console.log('outbox flushed') });
    });
  }

  window.offlineSync = {
    queuePost,
    flushQueue,
    cacheCars,
    getCachedCars,
    initAutoSync
  };
})();
