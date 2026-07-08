// listings-sync.js
// Load uploaded cards from localStorage and append them to the index and listings pages
(function(){
  const API_PORT = 8000;
  const API_BASE = `http://localhost:${API_PORT}`;  // API now served by FastAPI (port 8000)
  async function fetchUploadedCars(){
    try {
      const res = await fetch(API_BASE + '/api/cars?limit=100');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
        if (window.offlineSync?.cacheCars && items.length) {
          await window.offlineSync.cacheCars(items);
        }
        return items;
      }
    } catch (e) {
      // API is unavailable; fall back to cached uploads.
    }

    try {
      if (window.offlineSync?.getCachedCars) {
        const cached = await window.offlineSync.getCachedCars();
        if (Array.isArray(cached) && cached.length) return cached;
      }
    } catch (e) {
      // Cached cars unavailable.
    }

    try {
      const res = await fetch('db.json');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.cars) ? data.cars.slice().reverse().slice(0, 100) : [];
    } catch (e) {
      return [];
    }
  }

  function createIndexCard(c, pageNum){
    const div = document.createElement('div');
    div.className = 'car-card';
    if(pageNum) div.setAttribute('data-page', pageNum);
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
    cars.forEach((c,i)=>{
      const pageNum = maxPage + i + 1;
      const card = createIndexCard(c, pageNum);
      grid.appendChild(card);
      // add page button if pagination exists
      if(pagination){
        const btn = document.createElement('div');
        btn.className = 'page-btn';
        btn.setAttribute('data-page', String(pageNum));
        btn.textContent = String(pageNum);
        pagination.insertBefore(btn, pagination.querySelector('[data-prev]') || null);
      }
    });
    if(window.refreshHomePagination) {
      window.refreshHomePagination();
    }
  }

  async function loadUploadedCardsForListings(){
    const cars = await fetchUploadedCars();
    if(!cars.length) return;
    const container = document.querySelector('.listings-section .container');
    if(!container) return;
    // append to last .g-3 row or create a new one
    let row = container.querySelector('.g-3.row-gap:last-of-type');
    if(!row) row = container.querySelector('.g-3') || null;
    if(!row){
      row = document.createElement('div');
      row.className = 'g-3 row-gap';
      // insert before pagination
      const pagination = container.querySelector('.pagination');
      container.insertBefore(row, pagination);
    }
    cars.forEach(c=>{
      const card = createListingsCard(c);
      row.appendChild(card);
    });
    // update count in title if exists
    const titleSpan = container.querySelector('.listings-title span');
    if(titleSpan){
      const n = parseInt(titleSpan.textContent.replace(/\D/g,'')) || 0;
      titleSpan.textContent = `(${n + cars.length})`;
    }
    if(window.refreshListingPagination) {
      window.refreshListingPagination();
    }
  }

  // auto-run on pages
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{
      loadUploadedCardsForIndex();
      loadUploadedCardsForListings();
    });
  } else {
    loadUploadedCardsForIndex();
    loadUploadedCardsForListings();
  }
})();
