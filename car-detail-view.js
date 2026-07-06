(function(){
  const API_PORT = 8000;
  const API_BASE = `http://localhost:${API_PORT}`;  // API now served by FastAPI (port 8000)

  const params = new URLSearchParams(window.location.search);
  const carId = params.get('id');

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
      if (value.startsWith('http://') || value.startsWith('https://')) return value;
      if (value.startsWith('/')) return `${API_BASE}${value}`;
      return `${API_BASE}/${value}`;
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

  async function loadCarDetail() {
    if (!carId) {
      setText('breadcrumbName', 'Vehicle Details');
      setText('priceValue', '—');
      setText('descriptionText', 'No car selected. Use a listing card to open a car detail page.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/car-details/${encodeURIComponent(carId)}`);
      if (!response.ok) {
        throw new Error('Car detail not found');
      }
      const car = await response.json();
      renderCar(car);
    } catch (error) {
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