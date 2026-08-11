// listings-sync.js
// Load uploaded cards from localStorage and append them to the index and listings pages
(function(){
  const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);
  const LISTING_FETCH_LIMIT = 12;
  let lastPreloadTime = 0;
  let fetchUploadedCarsPromise = null;
  let cachedUploadedCars = null;
  let bootstrapListingsPromise = null;
  let bootstrapListingsHasRun = false;
  
  async function fetchUploadedCars(){
    if (cachedUploadedCars) return cachedUploadedCars;
    if (fetchUploadedCarsPromise) return fetchUploadedCarsPromise;
    fetchUploadedCarsPromise = (async () => {
      try {
        const res = await fetch(API_BASE + `/api/cars?limit=${LISTING_FETCH_LIMIT}`);
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
          if (window.offlineSync?.cacheCars && items.length) {
            await window.offlineSync.cacheCars(items, { suppressNotify: true });
            // Preload images in background only if enough time has passed (throttle to once per minute)
            if (window.offlineSync?.preloadImages && Date.now() - lastPreloadTime > 60000) {
              lastPreloadTime = Date.now();
              // Schedule preload after a short delay to avoid competing with render
              setTimeout(() => window.offlineSync.preloadImages(items).catch(() => {}), 2000);
            }
          }
          return items;
        }
      } catch (e) {
        // API is unavailable; fall back to cached uploads.
      }

      try {
        if (window.offlineSync?.getCachedCars) {
          const cached = await window.offlineSync.getCachedCars();
          if (Array.isArray(cached) && cached.length) {
            // Don't preload from cache (already cached)
            return cached;
          }
        }
      } catch (e) {
        // Cached cars unavailable.
      }

      // Try to load static data fallbacks (db.json then db.sample.json)
      const dbFiles = ['db.json', 'db.sample.json'];
      for (const dbFile of dbFiles) {
        try {
          const res = await fetch(dbFile);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.cars) && data.cars.length) {
              const cars = data.cars.slice().reverse().slice(0, 100);
              if (dbFile === 'db.sample.json') {
                console.info('[Listings] Using sample data (server/cache unavailable)');
              }
              return cars;
            }
          }
        } catch (e) {
          // Continue to next fallback
        }
      }

      // No data available
      return [];
    })();

    try {
      const result = await fetchUploadedCarsPromise;
      cachedUploadedCars = result;
      return result;
    } finally {
      fetchUploadedCarsPromise = null;
    }
  }

  function getCarKey(c){
    if (!c) return '';
    if (typeof c === 'string') {
      try {
        return getCarKey(JSON.parse(c));
      } catch (e) {
        return c;
      }
    }
    if (typeof c === 'object') {
      const source = c.dataset?.car ? JSON.parse(c.dataset.car) : c;
      return source?.id || source?.link || source?.name || `${source?.price || ''}-${source?.year || ''}-${source?.img || ''}`;
    }
    return String(c);
  }

  function createIndexCard(c, pageNum){
    const div = document.createElement('div');
    div.className = 'car-card';
    if(pageNum) div.setAttribute('data-page', pageNum);
    div.dataset.car = JSON.stringify({ id: c.id, link: c.link, name: c.name, price: c.price, year: c.year, img: c.img });
    const imgSrc = normalizeImagePath(c.img);
    const carLink = c.link || (c.id ? `car-detail.html?id=${c.id}` : 'car-detail.html');
    
    div.innerHTML = `
      <div class="car-img-wrap">
        <img src="${imgSrc}" 
             alt="${c.name || 'Car'}"
             onerror="this.src='Pic/Car 3.svg'" 
             style="width:100%; height:100%; object-fit:cover;"/>
        ${c.badge ? '<span class="verified-badge">Verified</span>' : ''}
      </div>
      <div class="car-body">
        <div class="car-name">${c.name || 'Unnamed Car'}</div>
        <div class="car-meta">
          <div class="car-meta-item"><span class="car-meta-icon"><img src="Pic/Milage.svg"></span> ${c.miles || '—'}</div>
          <div class="car-meta-item"><span class="car-meta-icon"><img src="Pic/Transmission.svg"></span> ${c.trans || '—'}</div>
          <div class="car-meta-item"><span class="car-meta-icon"><img src="Pic/Calender.svg"></span> ${c.year || '—'}</div>
          <div class="car-meta-item"><span class="car-meta-icon"><img src="Pic/Fuel.svg"></span> ${c.fuel || '—'}</div>
        </div>
        <div class="car-footer">
          <div class="car-price"><small>KSH</small> ${c.price || '—'}</div>
          <a href="${carLink}" class="btn-details">More Details</a>
        </div>
      </div>`;
    return div;
  }

  function normalizeImagePath(imgPath) {
    // Handle relative paths - encode spaces and ensure proper format
    if (!imgPath) return 'Pic/Car 3.svg';
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;
    // For local paths, encode spaces and ensure forward slashes
    return encodeURI(imgPath).replace(/\%20/g, '%20');
  }

  function createListingsCard(c){
    const div = document.createElement('div');
    div.className = 'car-card';
    div.dataset.car = JSON.stringify({ id: c.id, link: c.link, name: c.name, price: c.price, year: c.year, img: c.img });
    const imgSrc = normalizeImagePath(c.img);
    const carLink = c.link || (c.id ? `car-detail.html?id=${c.id}` : 'car-detail.html');
    
    div.innerHTML = `
      <div class="card-img-wrap">
        <img src="${imgSrc}" 
             alt="${c.name || 'Car'}"
             onerror="this.src='Pic/Car 3.svg'" 
             style="width:100%; height:100%; object-fit:cover;"/>
        ${c.badge ? '<span class="verified-pill">Verified</span>' : ''}
      </div>
      <div class="card-body">
        <div class="card-name">${c.name || 'Unnamed Car'}</div>
        <div class="card-meta">
          <div class="meta-item"><img src="Pic/Milage.svg"> ${c.miles || '—'}</div>
          <div class="meta-item"><img src="Pic/Transmission.svg"> ${c.trans || '—'}</div>
          <div class="meta-item"><img src="Pic/Fuel.svg"> ${c.fuel || '—'}</div>
          <div class="meta-item"><img src="Pic/Calender.svg"> ${c.year || '—'}</div>
        </div>
        <div class="card-footer">
          <div class="card-price"><small>USD</small> ${c.price || '—'}</div>
          <a href="${carLink}" class="btn btn-gold btn-sm">More Details</a>
        </div>
      </div>`;
    return div;
  }

  async function loadUploadedCardsForIndex(){
    const cars = await fetchUploadedCars();
    if(!cars.length) return;
    const grid = document.querySelector('.section .grid.grid-3');
    if(!grid) return;
    // determine current max data-page
    const pageEls = Array.from(document.querySelectorAll('.car-card[data-page]'));
    const maxPage = pageEls.length ? Math.max(...pageEls.map(el=>parseInt(el.getAttribute('data-page')||0))) : 0;
    const pagination = document.querySelector('.pagination');
    const existingCards = Array.from(grid.querySelectorAll('.car-card'));
    let addedCount = 0;
    cars.forEach((c,i)=>{
      const key = getCarKey(c);
      const alreadyExists = existingCards.some(card => getCarKey(card) === key);
      if (alreadyExists) return;
      const pageNum = maxPage + i + 1;
      const card = createIndexCard(c, pageNum);
      grid.appendChild(card);
      addedCount += 1;
      // add page button if pagination exists
      if(pagination){
        const btn = document.createElement('div');
        btn.className = 'page-btn';
        btn.setAttribute('data-page', String(pageNum));
        btn.textContent = String(pageNum);
        pagination.insertBefore(btn, pagination.querySelector('[data-prev]') || null);
      }
    });
    if(addedCount && window.refreshHomePagination) {
      window.refreshHomePagination();
    }
  }

  async function loadUploadedCardsForListings(){
    const cars = await fetchUploadedCars();
    if(!cars.length) return;
    const container = document.querySelector('.listings-section .container');
    if(!container) return;
    const existingCards = Array.from(container.querySelectorAll('.car-card'));
    const existingKeys = new Set(existingCards.map(card => getCarKey(card)));
    let row = container.querySelector('.g-3.row-gap:last-of-type');
    if(!row) row = container.querySelector('.g-3') || null;
    if(!row){
      row = document.createElement('div');
      row.className = 'g-3 row-gap';
      const pagination = container.querySelector('.pagination');
      container.insertBefore(row, pagination);
    }
    let addedCount = 0;
    cars.forEach(c=>{
      const key = getCarKey(c);
      if (existingKeys.has(key)) return;
      const card = createListingsCard(c);
      row.appendChild(card);
      existingKeys.add(key);
      addedCount += 1;
    });
    const titleSpan = container.querySelector('.listings-title span');
    if(titleSpan){
      const n = parseInt(titleSpan.textContent.replace(/\D/g,'')) || 0;
      titleSpan.textContent = `(${n + addedCount})`;
    }
    if(addedCount && window.refreshListingPagination) {
      window.refreshListingPagination();
    }
  }

  async function bootstrapListings(){
    if (bootstrapListingsHasRun) return;
    if (bootstrapListingsPromise) return bootstrapListingsPromise;
    bootstrapListingsPromise = (async () => {
      bootstrapListingsHasRun = true;
      try {
        await loadUploadedCardsForIndex();
        await loadUploadedCardsForListings();
      } catch (err) {
        console.warn('Could not bootstrap listings', err);
      }
    })();

    try {
      return await bootstrapListingsPromise;
    } finally {
      bootstrapListingsPromise = null;
    }
  }

  window.addEventListener('na-cars-cache-updated', () => {
    if (bootstrapListingsHasRun) return;
    bootstrapListings();
  });

  // auto-run on pages
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{
      bootstrapListings();
    });
  } else {
    bootstrapListings();
  }
})();
