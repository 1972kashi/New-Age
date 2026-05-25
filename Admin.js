 const TOTAL = 6;
  let showBadge = true;
  let activeCard = 0;
  let searchQuery = '';
  let savedSearchQuery = '';
  let savedCars = [];
  let editingSavedIndex = null;

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

  function fetchSavedCars() {
    try { return JSON.parse(localStorage.getItem('uploadedCars') || '[]'); } catch (e) { return []; }
  }

  function saveStoredCars(cars) {
    localStorage.setItem('uploadedCars', JSON.stringify(cars));
  }

  function loadSavedCars() {
    savedCars = fetchSavedCars();
    renderSavedCars();
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
    showToast('Editing saved car #' + (index + 1) + '. Save to Storage to update.');
  }

  function deleteSavedCar(index) {
    if (index < 0 || index >= savedCars.length) return;
    savedCars.splice(index, 1);
    saveStoredCars(savedCars);
    if (editingSavedIndex === index) {
      editingSavedIndex = null;
      clearForm();
    }
    renderSavedCars();
    showToast('Saved car deleted');
  }

  function saveToStorage() {
    const car = getFormVals();
    if (!car.name && !car.img && !car.price) {
      return showToast('Fill in a car name, image, or price before saving.');
    }
    if (editingSavedIndex !== null && editingSavedIndex >= 0) {
      savedCars[editingSavedIndex] = car;
      showToast('Saved car updated');
      editingSavedIndex = null;
    } else {
      savedCars.push(car);
      showToast('Saved car added');
    }
    saveStoredCars(savedCars);
    renderSavedCars();
  }

  function setSearch(value) {
    searchQuery = value.trim().toLowerCase();
    renderGrid();
  }

  function clearForm() {
    ['f-name','f-miles','f-year','f-price','f-img'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-trans').value = '';
    document.getElementById('f-fuel').value  = '';
    document.getElementById('f-link').value  = 'car-detail.html';
    setBadge(true);
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
      return;
    }

    grid.innerHTML = visible.map(({ c, i }) => {
      const isActive = i === activeCard;
      const imgHtml = c.img
        ? `<img src="${c.img}" alt="${c.name || 'Car'}">`
        : `<div class="car-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17H3a2 2 0 01-2-2v-4l2.5-6h13l2.5 6V15a2 2 0 01-2 2h-2m-9 0a2 2 0 104 0m5 0a2 2 0 104 0"/></svg><span>No image</span></div>`;
      const badge = c.badge ? '<span class="verified-badge">Verified</span>' : '';
      return `
        <div class="car-card${isActive ? ' editing' : ''}" onclick="selectCard(${i})">
          <div class="car-img-wrap">
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

  function uploadCards() {
    const toSave = cards.filter(c => (c.name && c.name.trim()) || (c.img && c.img.trim()) || (c.price && c.price.trim()));
    if (!toSave.length) return showToast('No cards to upload');
    const existing = fetchSavedCars();
    const merged = existing.concat(toSave);
    saveStoredCars(merged);
    loadSavedCars();
    showToast('Cards uploaded locally!');
  }

  if (ensureAdminSession()) {
    loadSavedCars();
    renderGrid();
  }