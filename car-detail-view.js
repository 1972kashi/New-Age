(function(){
  const API_PORT = 3000;
  const API_BASE = (location.protocol === 'file:' || location.port !== API_PORT.toString())
    ? `http://localhost:${API_PORT}`
    : '';

  const params = new URLSearchParams(window.location.search);
  const carId = params.get('id');

  function setText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value || '—';
  }

  function setImageSources(src) {
    const images = document.querySelectorAll('.gallery-grid .photo img');
    if (!images.length) return;
    const imageSrc = src || 'Pic/Car 3.svg';
    images.forEach((img, index) => {
      img.src = imageSrc;
      img.alt = `Car photo ${index + 1}`;
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
    setImageSources(car.img);
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