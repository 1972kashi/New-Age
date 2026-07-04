(function(){
	const API_PORT = 8000;
	const API_BASE = `http://localhost:${API_PORT}`;  // API now served by FastAPI (port 8000)

	let existingCars = [];
	let existingCarDetails = [];
	let selectedDetailId = null;
	let pendingQueue = [];
	let activePendingCard = null;
	const PENDING_CARDS_KEY = 'naa_pending_car_cards';

	window.setNav = function(el) {
		document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
		el.classList.add('active');
	}

	window.updatePreview = function() {
		const getValue = (id) => document.getElementById(id)?.value || '';
		const setText = (id, value) => {
			const el = document.getElementById(id);
			if (el) el.textContent = value;
		};

		const price = getValue('price');
		const desc = getValue('description');
		const make = getValue('make');
		const model = getValue('model');
		const year = getValue('year');
		const engine = getValue('engine');
		const bodyType = getValue('bodyType');
		const condition = getValue('condition');
		const trans = getValue('trans');
		const fuel = getValue('fuel');
		const miles = getValue('miles');
		const drive = getValue('drive');
		const location = getValue('location');
		const color = getValue('color');
		const carName = getValue('carName');

		setText('previewPrice', price ? `KSH ${Number(price.toString().replace(/[^0-9]/g, '')).toLocaleString()}` : 'KSH —');
		setText('previewDesc', desc || 'Vehicle description will appear here...');
		setText('dYear', year || extractYearFromName(carName) || '—');
		setText('dMake', make || extractMakeFromName(carName) || '—');
		setText('dModel', model || extractModelFromName(carName) || '—');
		setText('dCondition', condition || '—');
		setText('dTrans', trans || '—');
		setText('dEngine', engine || '—');
		setText('dMiles', miles || '—');
		setText('dFuel', fuel || '—');
		setText('dBody', bodyType || '—');
		setText('dLocation', location || '—');
		setText('dDrive', drive || '—');
		setText('dColor', color || '—');

		const detailLinkText = document.getElementById('detailLinkText');
		if (detailLinkText) {
			detailLinkText.textContent = selectedDetailId ? `car-detail.html?id=${selectedDetailId}` : 'car-detail.html?id=';
		}
	}

	function extractMakeFromName(name) {
		if (!name) return '';
		return name.trim().split(' ')[0];
	}

	function extractModelFromName(name) {
		if (!name) return '';
		const parts = name.trim().split(' ');
		return parts.length > 1 ? parts.slice(1).join(' ') : '';
	}

	function extractYearFromName(name) {
		if (!name) return '';
		const match = name.match(/\b(19|20)\d{2}\b/);
		return match ? match[0] : '';
	}

	function getPendingQueue() {
		try {
			const raw = localStorage.getItem(PENDING_CARDS_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			return [];
		}
	}

	function savePendingQueue(queue) {
		pendingQueue = queue;
		localStorage.setItem(PENDING_CARDS_KEY, JSON.stringify(queue));
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderPendingQueue() {
		const tbody = document.getElementById('pendingQueueBody');
		if (!tbody) return;
		pendingQueue = getPendingQueue();
		if (!pendingQueue.length) {
			tbody.innerHTML = '<tr><td colspan="6" class="pending-empty">No pending cards yet. Send cards from the upload page to populate this queue.</td></tr>';
			return;
		}
		tbody.innerHTML = pendingQueue.map((card, index) => `
			<tr>
				<td>${escapeHtml(card.name || 'Untitled Car')}</td>
				<td>${escapeHtml(card.price || '—')}</td>
				<td>${escapeHtml(card.fuel || '—')}</td>
				<td>${escapeHtml(card.year || '—')}</td>
				<td>${escapeHtml(card.queuedAt ? new Date(card.queuedAt).toLocaleString() : '—')}</td>
				<td><button class="pending-action-btn" type="button" onclick="loadPendingCard(${index})">Edit</button></td>
			</tr>
		`).join('');
	}

	window.refreshPendingQueue = function() {
		renderPendingQueue();
		showToast('Pending queue refreshed');
	}

	window.loadPendingCard = function(index) {
		const card = pendingQueue[index];
		if (!card) return;
		activePendingCard = card;
		document.getElementById('carName').value = card.name || '';
		document.getElementById('price').value = card.price || '';
		document.getElementById('imgPath').value = card.img || '';
		document.getElementById('year').value = card.year || '';
		document.getElementById('trans').value = card.trans || '';
		document.getElementById('fuel').value = card.fuel || '';
		document.getElementById('miles').value = card.miles || '';
		document.getElementById('make').value = card.make || extractMakeFromName(card.name || '');
		document.getElementById('model').value = card.model || extractModelFromName(card.name || '');
		document.getElementById('bodyType').value = card.bodyType || '';
		document.getElementById('condition').value = card.condition || '';
		document.getElementById('drive').value = card.drive || '';
		document.getElementById('location').value = card.location || '';
		document.getElementById('color').value = card.color || '';
		document.getElementById('description').value = card.description || '';
		updatePreview();
		showToast('Pending car loaded for editing');
	}

	async function loadExistingData() {
		extractExistingCars();
		extractExistingCarDetails();
		renderPendingQueue();
	}

	async function extractExistingCars() {
		try {
			const res = await fetch(`${API_BASE}/api/cars?limit=200`);
			if (!res.ok) return;
			const data = await res.json();
			existingCars = data.items || [];
			updateCarNameList();
		} catch (err) {
			console.warn('Could not load car names', err);
		}
	}

	async function extractExistingCarDetails() {
		try {
			const res = await fetch(`${API_BASE}/api/car-details?limit=200`);
			if (!res.ok) return;
			const data = await res.json();
			existingCarDetails = data.items || [];
			updateCarNameList();
		} catch (err) {
			console.warn('Could not load car details', err);
		}
	}

	function updateCarNameList() {
		const list = document.getElementById('carNameList');
		if (!list) return;
		const names = Array.from(new Set([
			...existingCarDetails.map(car => car.name),
			...existingCars.map(car => car.name)
		].filter(Boolean)));
		list.innerHTML = names.map(name => `<option value="${name}">`).join('');
	}

	window.onCarNameInput = function() {
		const carName = document.getElementById('carName').value.trim();
		if (!carName) {
			selectedDetailId = null;
			updatePreview();
			return;
		}
		const detailMatch = existingCarDetails.find(item => item.name.toLowerCase() === carName.toLowerCase());
		if (detailMatch) {
			selectedDetailId = detailMatch.id;
			populateFormFromDetail(detailMatch);
			updatePreview();
			return;
		}
		const carMatch = existingCars.find(item => item.name.toLowerCase() === carName.toLowerCase());
		if (carMatch) {
			selectedDetailId = null;
			populateFormFromCar(carMatch);
			updatePreview();
			return;
		}
		selectedDetailId = null;
		updatePreview();
	}

	function populateFormFromDetail(detail) {
		document.getElementById('make').value = detail.make || extractMakeFromName(detail.name);
		document.getElementById('model').value = detail.model || extractModelFromName(detail.name);
		document.getElementById('year').value = detail.year || '';
		document.getElementById('engine').value = detail.engine || '';
		document.getElementById('trans').value = detail.trans || '';
		document.getElementById('fuel').value = detail.fuel || '';
		document.getElementById('miles').value = detail.miles || '';
		document.getElementById('bodyType').value = detail.bodyType || '';
		document.getElementById('condition').value = detail.condition || '';
		document.getElementById('drive').value = detail.drive || '';
		document.getElementById('location').value = detail.location || '';
		document.getElementById('color').value = detail.color || '';
		document.getElementById('price').value = detail.price || '';
		document.getElementById('description').value = detail.description || '';
		document.getElementById('imgPath').value = detail.img || '';
		selectedDetailId = detail.id;
	}

	function populateFormFromCar(car) {
		document.getElementById('make').value = extractMakeFromName(car.name);
		document.getElementById('model').value = extractModelFromName(car.name);
		document.getElementById('year').value = car.year || extractYearFromName(car.name) || '';
		document.getElementById('engine').value = car.engine || '';
		document.getElementById('trans').value = car.trans || '';
		document.getElementById('fuel').value = car.fuel || '';
		document.getElementById('miles').value = car.miles || '';
		document.getElementById('price').value = car.price || '';
		document.getElementById('imgPath').value = car.img || '';
	}

	// FILE DROP
	const dropZone = document.getElementById('dropZone');
	const fileInput = document.getElementById('fileInput');
	const previewStrip = document.getElementById('previewStrip');
	let uploadedFiles = [];

	if (dropZone) {
		dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
		dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
		dropZone.addEventListener('drop', e => {
			e.preventDefault();
			dropZone.classList.remove('drag-over');
			handleFiles(e.dataTransfer.files);
		});
	}

	if (fileInput) {
		fileInput.addEventListener('change', () => handleFiles(fileInput.files));
	}

	function handleFiles(files) {
		if (!files || !files.length) return;
		const arr = Array.from(files);
		uploadedFiles = [...uploadedFiles, ...arr];
		if (previewStrip) previewStrip.innerHTML = '';

		uploadedFiles.slice(0, 6).forEach((file, index) => {
			const url = URL.createObjectURL(file);
			const wrapper = document.createElement('div');
			wrapper.style.position = 'relative';
			wrapper.style.display = 'inline-block';
			wrapper.style.marginRight = '8px';
			
			const img = document.createElement('img');
			img.src = url;
			img.className = 'preview-thumb';
			
			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.textContent = '✕';
			removeBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%; background:#dc2626; color:white; border:none; cursor:pointer; font-weight:bold; padding:0;';
			removeBtn.onclick = () => removeImage(index);
			
			wrapper.appendChild(img);
			wrapper.appendChild(removeBtn);
			if (previewStrip) previewStrip.appendChild(wrapper);
		});

		const imageControls = document.getElementById('imageControls');
		if (imageControls) {
			imageControls.style.display = uploadedFiles.length > 0 ? 'block' : 'none';
		}

		updatePhotoGrid(uploadedFiles);
	}

	window.removeImage = function(index) {
		uploadedFiles.splice(index, 1);
		handleFiles([]);
		if (uploadedFiles.length === 0) {
			const imageControls = document.getElementById('imageControls');
			if (imageControls) imageControls.style.display = 'none';
		}
	}

	window.clearAllImages = function() {
		uploadedFiles = [];
		const previewStrip = document.getElementById('previewStrip');
		if (previewStrip) previewStrip.innerHTML = '';
		const imageControls = document.getElementById('imageControls');
		if (imageControls) imageControls.style.display = 'none';
		updatePhotoGrid([]);
	}

	function updatePhotoGrid(files) {
		if (!files || !files.length) return;
		const cells = document.querySelectorAll('.photo-cell');
		files.slice(0, 5).forEach((file, i) => {
			const url = URL.createObjectURL(file);
			if (cells[i]) cells[i].innerHTML = `<img src="${url}" alt="preview">`;
		});
		if (files.length > 5 && cells[5]) {
			const url = URL.createObjectURL(files[5]);
			cells[5].innerHTML = `<img src="${url}" alt="preview" class="preview-dim"><div class="photo-overlay">+${files.length - 5} PHOTOS</div>`;
		}
	}

	window.showToast = function(msg, color = 'var(--accent)') {
		const t = document.getElementById('toast');
		if (!t) return;
		t.textContent = msg;
		t.style.borderColor = color;
		t.style.color = color;
		t.classList.add('show');
		setTimeout(() => t.classList.remove('show'), 2800);
	}

	window.saveDraft = function() { showToast('✓ DRAFT SAVED', 'var(--accent2)'); }

	window.uploadListing = async function() {
		const carName = document.getElementById('carName').value.trim();
		if (!carName) { showToast('⚠ CAR NAME REQUIRED', 'var(--danger)'); return; }

		const detailItem = {
			name: carName,
			make: document.getElementById('make').value.trim(),
			model: document.getElementById('model').value.trim(),
			year: document.getElementById('year').value.trim(),
			engine: document.getElementById('engine').value.trim(),
			trans: document.getElementById('trans').value,
			fuel: document.getElementById('fuel').value,
			miles: document.getElementById('miles').value.trim(),
			bodyType: document.getElementById('bodyType').value,
			condition: document.getElementById('condition').value,
			drive: document.getElementById('drive').value,
			location: document.getElementById('location').value.trim(),
			color: document.getElementById('color').value.trim(),
			price: document.getElementById('price').value.trim(),
			description: document.getElementById('description').value.trim(),
			img: document.getElementById('imgPath').value.trim(),
			images: [],
			badge: true
	};

	try {
		if (uploadedFiles.length > 0) {
			const uploadedImagePaths = await uploadImages(uploadedFiles);
			if (uploadedImagePaths.length) {
				detailItem.images = uploadedImagePaths;
				if (!detailItem.img) {
					detailItem.img = uploadedImagePaths[0];
				}
			}
		}

		let savedDetail;
		const url = selectedDetailId ? `${API_BASE}/api/car-details/${encodeURIComponent(selectedDetailId)}` : `${API_BASE}/api/car-details`;
		const res = await fetch(url, {
			method: selectedDetailId ? 'PUT' : 'POST',
			headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
			body: JSON.stringify(detailItem)
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(text || 'Failed to save car detail');
		}
		savedDetail = await res.json();

			selectedDetailId = savedDetail.id;
			const detailLinkText = document.getElementById('detailLinkText');
			if (detailLinkText) {
				detailLinkText.textContent = `car-detail.html?id=${savedDetail.id}`;
			}

			const carItem = {
				name: savedDetail.name,
				miles: savedDetail.miles,
				fuel: savedDetail.fuel,
				trans: savedDetail.trans,
				year: savedDetail.year,
				price: savedDetail.price,
				img: savedDetail.img,
				badge: true,
				link: `car-detail.html?id=${savedDetail.id}`
			};

			const existingCar = existingCars.find(c => c.link === `car-detail.html?id=${savedDetail.id}`);
			let carRes;
			if (existingCar) {
				carRes = await fetch(`${API_BASE}/api/cars/${encodeURIComponent(existingCar.id)}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(carItem)
				});
			} else {
				carRes = await fetch(`${API_BASE}/api/cars`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(carItem)
				});
			}
			if (!carRes.ok) {
				const text = await carRes.text();
				throw new Error(text || 'Failed to save listing card');
			}

			if (activePendingCard) {
				const remaining = pendingQueue.filter((item) => item.id !== activePendingCard.id);
				savePendingQueue(remaining);
				activePendingCard = null;
				renderPendingQueue();
			}

			showToast('✓ DETAILS UPLOADED', 'var(--accent2)');
			await extractExistingCars();
			await extractExistingCarDetails();
		} catch (err) {
			console.error('uploadListing error', err);
			showToast(`Upload failed: ${err.message || 'Server unreachable'}`, 'var(--danger)');
		}
	}

	window.addEventListener('DOMContentLoaded', () => {
		loadExistingData();
		updatePreview();
	});

	window.addEventListener('storage', (event) => {
		if (event.key === PENDING_CARDS_KEY) {
			renderPendingQueue();
		}
	});
})();

