(function(){
  const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);

  const params = new URLSearchParams(window.location.search);
  let carId = params.get('id');
  if (!carId) {
    const match = window.location.pathname.match(/\/car-detail\/(?<id>[^\/\?#]+)/);
    if (match && match.groups && match.groups.id) {
      carId = decodeURIComponent(match.groups.id);
    }
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value || '—';
  }

  function setImageSources(src, images) {
    const galleryGrid = document.querySelector('.gallery-grid');
    if (!galleryGrid) return;

    const imgArray = Array.isArray(images) && images.length > 0 ? images : (src ? [src] : ['Pic/Car 3.svg']);
    const photoElements = galleryGrid.querySelectorAll('.photo');
    const totalImages = imgArray.length;

    const normalizeImageSrc = (value) => {
      if (!value) return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
        return trimmed;
      }
      const cleaned = trimmed.replace(/^\.\//, '');
      try {
        const baseUrl = API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`;
        return new URL(cleaned, baseUrl).href;
      } catch (err) {
        return encodeURI(`${API_BASE}/${cleaned.replace(/^\//, '')}`);
      }
    };

    photoElements.forEach((photoEl, index) => {
      photoEl.innerHTML = '';
      if (index < totalImages) {
        const img = document.createElement('img');
        img.src = normalizeImageSrc(imgArray[index]);
        img.alt = `Car photo ${index + 1}`;
        photoEl.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        photoEl.appendChild(placeholder);
      }

      const extraCount = totalImages - photoElements.length;
      if (index === photoElements.length - 1 && extraCount > 0) {
        const overlayText = document.createElement('div');
        overlayText.className = 'overlay-text';
        overlayText.textContent = `+${extraCount} PHOTOS`;
        photoEl.appendChild(overlayText);
      }
    });
  }

  function setLinkText(name) {
    const breadcrumb = document.getElementById('breadcrumbName');
    if (breadcrumb) breadcrumb.textContent = name || 'Car Details';
  }

  async function fetchStaticCarDetail() {
    const feedFiles = ['public-cars.json', 'db.json', 'db.sample.json'];
    for (const feedFile of feedFiles) {
      try {
        const response = await fetch(feedFile);
        if (!response.ok) continue;
        const data = await response.json();
        if (!data || typeof data !== 'object') continue;

        const carDetails = Array.isArray(data.carDetails) ? data.carDetails : [];
        const cars = Array.isArray(data.cars) ? data.cars : [];

        const matchById = (entry) => entry && (entry.id === carId || entry.carId === carId);
        const matchByLink = (entry) => entry && typeof entry.link === 'string' && entry.link.endsWith(`?id=${carId}`);

        let found = carDetails.find(matchById) || cars.find(matchById);
        if (!found) {
          found = carDetails.find(matchByLink) || cars.find(matchByLink);
        }

        if (found) {
          return normalizeDetailObject(found);
        }
      } catch (error) {
        // continue to next fallback file
      }
    }
    return null;
  }

  function normalizeDetailObject(car) {
    if (!car || typeof car !== 'object') return car;
    const normalized = { ...car };
    if (!normalized.name) {
      normalized.name = normalized.title || [normalized.make, normalized.model, normalized.year].filter(Boolean).join(' ') || normalized.name || null;
    }
    if (!Array.isArray(normalized.images)) {
      normalized.images = Array.isArray(normalized.photos)
        ? normalized.photos
        : normalized.img
          ? [normalized.img]
          : normalized.image
            ? [normalized.image]
            : [];
    }
    if (!normalized.img && Array.isArray(normalized.images) && normalized.images.length) {
      normalized.img = normalized.images[0];
    }
    if (!normalized.miles && normalized.mileage) {
      normalized.miles = normalized.mileage;
    }
    if (!normalized.trans && normalized.transmission) {
      normalized.trans = normalized.transmission;
    }
    return normalized;
  }

  async function loadCarDetail() {
    if (!carId) {
      setText('breadcrumbName', 'Vehicle Details');
      setText('priceValue', '—');
      setText('descriptionText', 'No car selected. Use a listing card to open a car detail page.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/car-details/${encodeURIComponent(carId)}`);
      if (response.ok) {
        const car = await response.json();
        renderCar(car);
        return;
      }
      throw new Error('Car detail not found');
    } catch (error) {
      console.warn('API unavailable, falling back to static feed:', error);
      const car = await fetchStaticCarDetail();
      if (car) {
        renderCar(car);
        return;
      }
      console.error(error);
      setText('breadcrumbName', 'Vehicle Not Found');
      setText('priceValue', '—');
      setText('descriptionText', 'This vehicle could not be loaded.');
    }
  }

  function renderCar(car) {
    const title = car.name || 'Vehicle Details';
    document.title = `${title} – New Age Automotive`;
    setLinkText(title);
    setText('priceValue', car.price ? car.price.toString() : '—');
    setText('descriptionText', car.description || 'No description available.');
    setText('detailYear', car.year);
    setText('detailModel', car.model || extractModelFromName(car.name));
    setText('detailCondition', car.condition);
    setText('detailTransmission', car.trans);
    setText('detailEngine', car.engine);
    setText('detailMileage', car.miles ? `${car.miles} Miles` : '—');
    setText('detailFuel', car.fuel);
    setText('detailDrive', car.drive || '—');
    setText('detailColor', car.color);
    setText('detailBody', car.bodyType);
    setText('detailLocation', car.location);
    setText('detailMake', car.make || extractMakeFromName(car.name));
    setText('detailDriveAlt', car.drive || '—');
    
    // Prefill enquiry message with the selected car name
    const enquiryTextarea = document.querySelector('.enq-msg');
    const carName = car.name || 'this vehicle';
    if (enquiryTextarea) {
      const currentText = enquiryTextarea.value.trim();
      const defaultText = `Hello, I'm interested in ${carName}. Please send me more details.`;
      if (!currentText || currentText.startsWith('Hello, I\'m interested in') || currentText === 'Interested in this vehicle.') {
        enquiryTextarea.value = defaultText;
      }
    }

    // Handle images - prefer the shared gallery renderer used by car-detail.js
    if (window.renderDetailGallery) {
      window.renderDetailGallery(car);
    } else {
      const imageArray = Array.isArray(car.images) ? car.images : (car.img ? [car.img] : []);
      setImageSources(car.img, imageArray);
    }
  }

  function extractMakeFromName(name) {
    if (!name) return '';
    return name.trim().split(' ')[0];
  }

  function extractModelFromName(name) {
    if (!name) return '';
    const pieces = name.trim().split(' ');
    return pieces.length > 1 ? pieces.slice(1).join(' ') : '';
  }

  loadCarDetail();
})();