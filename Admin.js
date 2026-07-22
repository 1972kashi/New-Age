 function normalizeAdminImageSrc(value) {
    if (!value || typeof value !== 'string') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:')) {
      return value;
    }
    if (value.startsWith('/')) {
      return `${API_BASE}${value}`;
    }
    return `${API_BASE}/${value.replace(/^\.\//, '').replace(/^\//, '')}`;
  }

 const TOTAL = 6;
  const PENDING_CARDS_KEY = 'naa_pending_car_cards';
  let showBadge = true;
  const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);
  let activeCard = 0;
  let searchQuery = '';
  let savedSearchQuery = '';
  let savedCars = [];
  let editingSavedIndex = null;
  let editingSavedId = null;
  let liveDashboardData = { cars: [], stats: {}, users: [], updatedAt: null };
  let liveRefreshTimer = null;

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      maximumFractionDigits: 0
    }).format(value);
  }

  function getDashboardEntries() {
    const saved = Array.isArray(savedCars) ? savedCars : [];
    const drafts = cards.filter(c => (c.name && c.name.trim()) || (c.img && c.img.trim()) || (c.price && c.price.trim()));
    const seen = new Set();
    const entries = [];

    [...saved, ...drafts].forEach((entry) => {
      const key = `${entry.name || ''}-${entry.price || ''}-${entry.img || ''}-${entry.fuel || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push(entry);
    });

    return entries;
  }

  function parsePrice(value) {
    if (!value && value !== 0) return 0;
    const normalized = String(value).replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getViewCount(car) {
    const candidates = [car?.views, car?.viewCount, car?.view_count, car?.viewsCount];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || candidate === '') continue;
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  function getSoldCount(cars) {
    return cars.filter((car) => {
      const status = String(car?.status || car?.saleStatus || '').toLowerCase();
      const sold = car?.sold === true || car?.isSold === true || car?.available === false;
      return sold || status === 'sold' || status === 'reserved';
    }).length;
  }

  function renderDashboard() {
    const statsHost = document.getElementById('dashboard-stats');
    const salesHost = document.getElementById('sales-bars');
    const viewedHost = document.getElementById('viewed-list');
    const fuelHost = document.getElementById('fuel-list');

    if (!statsHost || !salesHost || !viewedHost || !fuelHost) return;

    const entries = getDashboardEntries();
    const totalCars = entries.length;
    const soldCars = getSoldCount(entries);
    const pendingListings = Math.max(totalCars - soldCars, 0);
    const newUsers = Array.isArray(liveDashboardData.users) ? liveDashboardData.users.length : 0;
    const revenue = entries
      .filter((car) => {
        const status = String(car?.status || car?.saleStatus || '').toLowerCase();
        return car?.sold === true || car?.isSold === true || car?.available === false || status === 'sold' || status === 'reserved';
      })
      .reduce((sum, car) => sum + parsePrice(car?.price), 0);
    const views = entries.reduce((sum, car) => sum + getViewCount(car), 0);
    const fuelStats = liveDashboardData.stats?.by_fuel || {};

    statsHost.innerHTML = [
      { label: 'Total Cars', value: totalCars || 0, note: 'Active listings online' },
      { label: 'Cars Sold', value: soldCars, note: 'From live listing status' },
      { label: 'Pending Listings', value: pendingListings, note: 'Awaiting review' },
      { label: 'New Users', value: newUsers || 0, note: 'Registered accounts' },
      { label: 'Revenue', value: formatCurrency(revenue), note: 'Sold inventory value' },
      { label: 'Views', value: views.toLocaleString(), note: 'Live view count' }
    ].map(stat => `
      <div class="stat-card">
        <span>${stat.label}</span>
        <strong>${stat.value}</strong>
        <small>${stat.note}</small>
      </div>
    `).join('');

    const salesSeries = Array.from({ length: 6 }, (_, index) => {
      const monthCars = entries.filter((car) => {
        const createdAt = car?.createdAt || car?.created_at;
        if (!createdAt) return false;
        const date = new Date(createdAt);
        if (Number.isNaN(date.getTime())) return false;
        const monthIndex = date.getMonth();
        return monthIndex === (new Date().getMonth() - (5 - index) + 12) % 12;
      });
      return monthCars.length;
    });
    const salesMax = Math.max(...salesSeries, 1);
    salesHost.innerHTML = salesSeries.map((value, index) => {
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][index];
      const height = Math.max(18, Math.round((value / salesMax) * 100));
      return `
        <div class="sales-bar-wrap">
          <div class="sales-bar" style="height:${height}%"></div>
          <span>${month}</span>
        </div>
      `;
    }).join('');

    const viewedCars = entries
      .slice()
      .sort((a, b) => getViewCount(b) - getViewCount(a))
      .slice(0, 4)
      .map((car) => {
        const name = car.name || 'Draft Listing';
        const count = getViewCount(car);
        return `
          <div class="rank-item">
            <div class="label"><span class="rank-dot"></span><span>${name}</span></div>
            <strong>${count ? count.toLocaleString() : '0'} views</strong>
          </div>
        `;
      });

    viewedHost.innerHTML = viewedCars.length ? viewedCars.join('') : '<div class="rank-item"><span>No listings yet</span></div>';

    const fuelItems = Object.entries(fuelStats)
      .sort((a, b) => b[1] - a[1])
      .map(([fuel, count]) => `
        <div class="fuel-item">
          <span>${fuel || 'Unknown'}</span>
          <strong>${count}</strong>
        </div>
      `);

    fuelHost.innerHTML = fuelItems.length ? fuelItems.join('') : '<div class="fuel-item"><span>No fuel data</span></div>';
  }

  function ensureAdminSession(){
    const session = JSON.parse(localStorage.getItem('naa_session')||'null');
    if(!session||session.role!=='admin'){
      window.location.href='login.html';
      return false;
    }
    return true;
  }

  const cards = Array.from({ length: TOTAL }, (_, i) => ({
    name: '', miles: '', fuel: '', trans: '', year: '',
    price: '', link: 'car-detail.html', img: '', badge: true
  }));

  function getPendingCards() {
    try {
      const raw = localStorage.getItem(PENDING_CARDS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function savePendingCards(queue) {
    localStorage.setItem(PENDING_CARDS_KEY, JSON.stringify(queue));
  }

  function queueCardsForDetails(cardsToQueue) {
    const queue = getPendingCards();
    cardsToQueue.forEach((card) => {
      const normalized = {
        ...card,
        id: card.id || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        queuedAt: new Date().toISOString()
      };
      const duplicateIndex = queue.findIndex((item) => item.name === normalized.name && item.img === normalized.img && item.price === normalized.price);
      if (duplicateIndex >= 0) {
        queue[duplicateIndex] = normalized;
      } else {
        queue.push(normalized);
      }
    });
    savePendingCards(queue);
    return queue;
  }

  function setBadge(val) {
    showBadge = val;
    document.getElementById('btn-yes').className = 'badge-btn' + (val ? ' active-yes' : '');
    document.getElementById('btn-no').className  = 'badge-btn' + (!val ? ' active-no' : '');
    liveUpdate();
  }

  function getFormVals() {
    return {
      name:  document.getElementById('f-name').value,
      miles: document.getElementById('f-miles').value,
      fuel:  document.getElementById('f-fuel').value,
      trans: document.getElementById('f-trans').value,
      year:  document.getElementById('f-year').value,
      price: document.getElementById('f-price').value,
      link:  document.getElementById('f-link').value || '#',
      img:   document.getElementById('f-img').value,
      badge: showBadge,
    };
  }
  
  function liveUpdate() {
    Object.assign(cards[activeCard], getFormVals());
    renderGrid();
    renderDashboard();
  }

  function loadCard() {
    activeCard = parseInt(document.getElementById('card-select').value);
    const c = cards[activeCard];
    document.getElementById('f-name').value  = c.name;
    document.getElementById('f-miles').value = c.miles;
    document.getElementById('f-fuel').value  = c.fuel;
    document.getElementById('f-trans').value = c.trans;
    document.getElementById('f-year').value  = c.year;
    document.getElementById('f-price').value = c.price;
    document.getElementById('f-link').value  = c.link;
    document.getElementById('f-img').value   = c.img;
    setBadge(c.badge);
    renderGrid();
  }

  function saveCard() {
    Object.assign(cards[activeCard], getFormVals());
    renderGrid();
    showToast('Card ' + (activeCard + 1) + ' saved!');
  }

  function deleteCard() {
    cards[activeCard] = {
      name: '', miles: '', fuel: '', trans: '', year: '',
      price: '', link: 'car-detail.html', img: '', badge: true
    };
    clearForm();
    renderGrid();
    showToast('Card ' + (activeCard + 1) + ' deleted');
  }

  function getAuthHeaders() {
    const token = localStorage.getItem('naa_token') || localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchSavedCars() {
    try {
      const res = await fetch(API_BASE + '/api/cars?limit=100', { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  async function fetchDashboardMetrics() {
    try {
      const [carsRes, statsRes, usersRes] = await Promise.all([
        fetch(API_BASE + '/api/cars?limit=100', { headers: getAuthHeaders() }),
        fetch(API_BASE + '/admin/stats', { headers: getAuthHeaders() }),
        fetch(API_BASE + '/admin/users', { headers: getAuthHeaders() })
      ]);

      if (!carsRes.ok || !statsRes.ok || !usersRes.ok) {
        return null;
      }

      const carsData = await carsRes.json();
      const statsData = await statsRes.json();
      const usersData = await usersRes.json();

      return {
        cars: Array.isArray(carsData.items) ? carsData.items : Array.isArray(carsData) ? carsData : [],
        stats: statsData || {},
        users: Array.isArray(usersData) ? usersData : []
      };
    } catch (e) {
      return null;
    }
  }

  async function loadSavedCars() {
    const metrics = await fetchDashboardMetrics();
    if (metrics) {
      savedCars = metrics.cars;
      liveDashboardData = {
        cars: metrics.cars,
        stats: metrics.stats,
        users: metrics.users,
        updatedAt: new Date().toISOString()
      };
    } else {
      savedCars = await fetchSavedCars();
    }
    renderSavedCars();
    renderDashboard();
  }

  function setSavedSearch(value) {
    savedSearchQuery = (value || '').trim().toLowerCase();
    renderSavedCars();
  }

  function renderSavedCars() {
    const list = document.getElementById('saved-cars-list');
    const entries = savedCars
      .map((car, index) => ({ car, index }))
      .filter(({ car }) => {
        if (!savedSearchQuery) return true;
        const target = [car.name, car.miles, car.fuel, car.trans, car.year, car.price, car.link, car.img]
          .filter(Boolean).join(' ').toLowerCase();
        return target.includes(savedSearchQuery);
      });

    if (!entries.length) {
      list.innerHTML = '<div class="saved-empty">No saved cars found.</div>';
      return;
    }

    list.innerHTML = entries.map(({ car, index }) => `
      <div class="saved-card">
        <div class="saved-card-info">
          <div class="saved-card-title">${car.name || 'Unnamed Car'}</div>
          <div class="saved-card-meta">${car.year || 'Year'} · ${car.trans || 'Trans'} · ${car.fuel || 'Fuel'} · KSH ${car.price || '—'}</div>
          <div class="saved-card-path">${car.link || 'car-detail.html'}</div>
        </div>
        <div class="saved-card-actions">
          <button class="saved-btn edit" onclick="editSavedCar(${index})">Edit</button>
          <button class="saved-btn delete" onclick="deleteSavedCar(${index})">Delete</button>
        </div>
      </div>`).join('');
  }

  function editSavedCar(index) {
    const car = savedCars[index];
    if (!car) return;
    document.getElementById('f-name').value = car.name;
    document.getElementById('f-miles').value = car.miles;
    document.getElementById('f-fuel').value = car.fuel;
    document.getElementById('f-trans').value = car.trans;
    document.getElementById('f-year').value = car.year;
    document.getElementById('f-price').value = car.price;
    document.getElementById('f-link').value = car.link;
    document.getElementById('f-img').value = car.img;
    setBadge(car.badge);
    editingSavedIndex = index;
    editingSavedId = car.id || null;
    showToast('Editing saved car #' + (index + 1) + '. Save to database to update.');
  }

  async function deleteSavedCar(index) {
    if (index < 0 || index >= savedCars.length) return;
    const car = savedCars[index];
    if (car && car.id) {
      await fetch(API_BASE + '/api/cars/' + encodeURIComponent(car.id), { method: 'DELETE', headers: getAuthHeaders() });
    }
    savedCars.splice(index, 1);
    if (editingSavedIndex === index) {
      editingSavedIndex = null;
      editingSavedId = null;
      clearForm();
    }
    renderSavedCars();
    showToast('Saved car deleted');
  }

  async function saveToStorage() {
    const car = getFormVals();
    if (!car.name && !car.img && !car.price) {
      return showToast('Fill in a car name, image, or price before sending it for editing.');
    }

    queueCardsForDetails([{ ...car, source: 'admin-upload' }]);
    editingSavedIndex = null;
    editingSavedId = null;
    showToast('Card sent to the details upload queue');
    renderDashboard();
  }

  function setSearch(value) {
    searchQuery = value.trim().toLowerCase();
    renderGrid();
  }

  function clearForm() {
    ['f-name','f-miles','f-year','f-price','f-img','f-img-path'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const preview = document.getElementById('imagePreview');
    if (preview) preview.innerHTML = '';
    document.getElementById('f-trans').value = '';
    document.getElementById('f-fuel').value  = '';
    document.getElementById('f-link').value  = 'car-detail.html';
    setBadge(true);
    editingSavedIndex = null;
    editingSavedId = null;
    liveUpdate();
  }

  function renderGrid() {
    const grid = document.getElementById('cards-grid');
    const entries = cards.map((c, i) => ({ c, i }));
    const visible = entries.filter(({ c }) => {
      if (!searchQuery) return true;
      const target = [c.name, c.miles, c.fuel, c.trans, c.year, c.price, c.link, c.img]
        .filter(Boolean)
        .join(' ').toLowerCase();
      return target.includes(searchQuery);
    });

    if (!visible.length) {
      grid.innerHTML = '<div class="no-results">No cars match your search.</div>';
      renderDashboard();
      return;
    }

    grid.innerHTML = visible.map(({ c, i }) => {
      const isActive = i === activeCard;
      const imgHtml = c.img
        ? `<img src="${normalizeAdminImageSrc(c.img)}" alt="${c.name || 'Car'}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.onerror=null; this.src='Pic/Car 3.svg';">`
        : `<div class="car-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17H3a2 2 0 01-2-2v-4l2.5-6h13l2.5 6V15a2 2 0 01-2 2h-2m-9 0a2 2 0 104 0m5 0a2 2 0 104 0"/></svg><span>No image</span></div>`;
      const badge = c.badge ? '<span class="verified-badge">Verified</span>' : '';
      return `
        <div class="car-card${isActive ? ' editing' : ''}" onclick="selectCard(${i})">
          <div class="car-img-wrap" style="position:relative; overflow:hidden; height:180px; width:100%;">
            ${imgHtml}
            <span class="card-number">Card ${i+1}</span>
            ${badge}
          </div>
          <div class="car-body">
            <div class="car-name">${c.name || 'Car name...'}</div>
            <div class="car-meta">
              <div class="car-meta-item"><img src="Pic/Milage.svg"> ${c.miles || '—'} mi</div>
              <div class="car-meta-item"><img src="Pic/Transmission.svg"> ${c.trans || '—'}</div>
              <div class="car-meta-item"><img src="Pic/Calender.svg"> ${c.year || '—'}</div>
              <div class="car-meta-item"><img src="Pic/Fuel.svg"> ${c.fuel || '—'}</div>
            </div>
            <div class="car-footer">
              <div class="car-price"><small>KSH</small> ${c.price || '—'}</div>
              <span class="btn-details">More Details</span>
            </div>
          </div>
        </div>`;
    }).join('');
    renderDashboard();
  }

  function selectCard(i) {
    document.getElementById('card-select').value = i;
    activeCard = i;
    loadCard();
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  async function uploadCards() {
    const toSave = cards.filter(c => (c.name && c.name.trim()) || (c.img && c.img.trim()) || (c.price && c.price.trim()));
    if (!toSave.length) return showToast('No cards to queue');

    queueCardsForDetails(toSave.map(c => ({ ...c, source: 'admin-upload' })));
    renderDashboard();
    showToast(`${toSave.length} card(s) queued for editing in the details page`);
  }

  if (ensureAdminSession()) {
    loadSavedCars();
    renderGrid();
    initAdminImageDrop();
    if (liveRefreshTimer) clearInterval(liveRefreshTimer);
    liveRefreshTimer = setInterval(() => {
      loadSavedCars();
    }, 15000);
  }

  function logout(){
  localStorage.removeItem('naa_session');
  window.location.href='login.html';
}

  /**
   * Initialize admin image drag-and-drop
   */
  function initAdminImageDrop() {
    const dropZone = document.getElementById('adminDropZone');
    const fileInput = document.getElementById('adminFileInput');
    const preview = document.getElementById('adminImagePreview');
    const imgField = document.getElementById('f-img');
    
    if (!dropZone || !fileInput) return;

    let selectedFile = null;

    // Disable drag-and-drop and direct file uploads.
    // Use the `f-img` text input as the source of truth for image paths
    // (local blob/data URLs or server paths). Hide the file input UI.
    try {
      if (dropZone) {
        dropZone.style.opacity = '0.6';
        dropZone.style.pointerEvents = 'none';
      }
      if (fileInput) {
        fileInput.style.display = 'none';
        fileInput.disabled = true;
      }
    } catch (e) {}

    // Listen to manual image-path input changes and update preview accordingly
    if (imgField) {
      imgField.addEventListener('input', () => {
        const val = (imgField.value || '').trim();
        const targetCardIndex = activeCard;
        cards[targetCardIndex].img = val;
        if (targetCardIndex === activeCard) {
          if (!val) {
            preview.innerHTML = '';
          } else {
            preview.innerHTML = `
              <div style="position:relative; display:inline-block;">
                <img src="${normalizeAdminImageSrc(val)}" alt="preview" style="height:60px; width:60px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="window.editAdminImage(this)" title="Click to edit image">
                <button type="button" style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%; background:#dc2626; color:white; border:none; cursor:pointer; font-weight:bold; padding:0; font-size:14px;" onclick="clearAdminImage()">✕</button>
              </div>
            `;
          }
        }
        renderGrid();
        renderDashboard();
      });
    }

    async function processImageFile(file) {
      if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file');
        return;
      }

      selectedFile = file;
      
      // Show preview with blob URL (temporary)
      const url = URL.createObjectURL(file);
      preview.innerHTML = `
        <div style="position:relative; display:inline-block;">
          <img src="${url}" alt="preview" style="height:60px; width:60px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="window.editAdminImage(this)" title="Click to edit image">
          <button type="button" style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%; background:#dc2626; color:white; border:none; cursor:pointer; font-weight:bold; padding:0; font-size:14px;" onclick="clearAdminImage()">✕</button>
        </div>
      `;

      // Use local blob URL as the image path (no server upload)
      try {
        const targetCardIndex = activeCard;
        // Remember the blob URL as the card image so grid previews work
        cards[targetCardIndex].img = url;

        if (targetCardIndex === activeCard) {
          imgField.value = url;
          preview.innerHTML = `
            <div style="position:relative; display:inline-block;">
              <img src="${url}" alt="preview" style="height:60px; width:60px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="window.editAdminImage(this)" title="Click to edit image">
              <button type="button" style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%; background:#dc2626; color:white; border:none; cursor:pointer; font-weight:bold; padding:0; font-size:14px;" onclick="clearAdminImage()">✕</button>
            </div>
          `;
        }

        renderGrid();
        renderDashboard();
        showToast('✓ Image selected (local path)', 'var(--accent2)');
        // Do not revoke the blob URL while it's in use by the UI
      } catch (err) {
        console.error('Image handling error:', err);
        showToast('Error processing image: ' + (err.message || ''), 'var(--danger)');
        URL.revokeObjectURL(url);
      }
    }
  }

  window.clearAdminImage = function() {
    document.getElementById('adminImagePreview').innerHTML = '';
    document.getElementById('f-img').value = '';
    document.getElementById('adminFileInput').value = '';
    liveUpdate();
    showToast('Image removed');
  }

  window.editAdminImage = async function(imgElement) {
    const fileInput = document.getElementById('adminFileInput');
    if (!fileInput.files || !fileInput.files[0]) return;

    try {
      const result = await showImageEditorModal(fileInput.files[0], {
        targetWidth: 529,
        targetHeight: 319
      });

      // Use edited dataUrl as local image path (no server upload)
      try {
        const targetCardIndex = activeCard;
        cards[targetCardIndex].img = result.dataUrl;
        if (targetCardIndex === activeCard) {
          document.getElementById('f-img').value = result.dataUrl;
          imgElement.src = result.dataUrl;
          imgElement.onerror = () => { imgElement.src = 'Pic/Car 3.svg'; };
        }
        renderGrid();
        renderDashboard();
        showToast('✓ Image edited (local path)', 'var(--accent2)');
      } catch (err) {
        console.error('Processing edited image error:', err);
        showToast('Error processing edited image: ' + (err.message || ''), 'var(--danger)');
      }
    } catch (err) {
      if (err.message !== 'User cancelled') {
        console.error('Image edit error:', err);
        showToast('Error editing image: ' + err.message, 'var(--danger)');
      }
    }
  }