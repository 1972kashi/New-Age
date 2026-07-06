/* ─────────────────────────────────────────────────────────────────
   car-detail.js  —  Scroll Reveal
   Logic mirrors new_age.js exactly:
     • Same IntersectionObserver options (threshold 0.1, rootMargin)
     • Same class-removal → reflow → class-add pattern
     • Directions assigned per element class, just like new_age.js
     • Each element animates once then is unobserved
   Targets the exact classes in car-detail.html (no data-reveal attrs)
───────────────────────────────────────────────────────────────── */

/* Observer handled by reveal-common.js — use window.reveal.observe(el) */

const DETAIL_IMAGE_API_BASE = 'http://localhost:8000';

function normalizeDetailImageSrc(value) {
  if (!value) return '';
  if (typeof value !== 'string') return '';
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${DETAIL_IMAGE_API_BASE}${value}`;
  }
  return `${DETAIL_IMAGE_API_BASE}/${value.replace(/^\.\//, '').replace(/^\//, '')}`;
}

function collectDetailImageSources(car) {
  const sources = [];
  if (Array.isArray(car?.images)) {
    car.images.filter(Boolean).forEach((item) => sources.push(item));
  }
  if (Array.isArray(car?.photos)) {
    car.photos.filter(Boolean).forEach((item) => sources.push(item));
  }
  if (typeof car?.images === 'string' && car.images.trim()) {
    car.images.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => sources.push(item));
  }
  if (car?.img) {
    sources.push(car.img);
  }

  const uniqueSources = sources.filter((value, index, arr) => value && arr.indexOf(value) === index);
  return uniqueSources.length ? uniqueSources : ['Pic/Car 3.svg'];
}

window.renderDetailGallery = function(car) {
  const galleryGrid = document.querySelector('.gallery-grid');
  if (!galleryGrid) return;

  const photoCells = galleryGrid.querySelectorAll('.photo');
  if (!photoCells.length) return;

  const imageSources = collectDetailImageSources(car);
  const totalImages = imageSources.length;

  photoCells.forEach((photoEl, index) => {
    photoEl.innerHTML = '';

    if (index < totalImages) {
      const img = document.createElement('img');
      img.src = normalizeDetailImageSrc(imageSources[index]);
      img.alt = `Car photo ${index + 1}`;
      photoEl.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      photoEl.appendChild(placeholder);
    }

    const extraCount = totalImages - photoCells.length;
    if (index === photoCells.length - 1 && extraCount > 0) {
      const overlayText = document.createElement('div');
      overlayText.className = 'overlay-text';
      overlayText.textContent = `+${extraCount} PHOTOS`;
      photoEl.appendChild(overlayText);
    }
  });
};

/* ── Assign directions by class name, then register with observer ──
   Mirrors how new_age.js maps element classes → directions:
     .hero-left        → reveal-left
     .featured-car-card→ reveal-right
     .car-card / .why-card → reveal-bottom
     .source-banner    → reveal-scale
   Applied here to car-detail.html's actual classes:
     .breadcrumb       → reveal-top    (header-like, drops in from above)
     .gallery-section  → reveal-bottom (whole section rises up)
     .photo (col 1,4)  → reveal-left   (left column slides from left)
     .photo (col 2,5)  → reveal-bottom (centre rises up)
     .photo (col 3,6)  → reveal-right  (right column slides from right)
     detail-grid > div (left panel) → reveal-left  (info/specs panel)
     .enquiry-card     → reveal-right  (form is right-side panel)
     .footer-brand     → reveal-left
     .footer-links-grid→ reveal-bottom
     .footer-newsletter→ reveal-right
     .footer-bottom    → reveal-bottom
── */
function triggerScrollReveal() {

  /* ── Breadcrumb ── */
  document.querySelectorAll(".breadcrumb").forEach((el) => {
    el.dataset.reveal = "reveal-top";
    window.reveal && window.reveal.observe(el);
  });

  /* ── Gallery section wrapper ── */
  document.querySelectorAll(".gallery-section").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    window.reveal && window.reveal.observe(el);
  });

  /* ── Individual photos — cascade left / bottom / right across columns ──
     The gallery-grid is a 3-column grid, so:
       index 0,3 → col 1 → reveal-left
       index 1,4 → col 2 → reveal-bottom
       index 2,5 → col 3 → reveal-right
     --photo-index CSS custom property drives the 0.1s per-photo delay.       */
  const photos = document.querySelectorAll(".gallery-grid .photo");
  const colDirections = ["reveal-left", "reveal-bottom", "reveal-right"];
  photos.forEach((photo, i) => {
    photo.dataset.reveal = colDirections[i % 3];
    photo.style.setProperty("--photo-index", String(i));
    window.reveal && window.reveal.observe(photo);
  });

  /* ── Detail grid children (left info panel + enquiry card) ── */
  const detailChildren = document.querySelectorAll(".detail-grid > div");
  detailChildren.forEach((el, i) => {
    el.dataset.reveal = i === 0 ? "reveal-left" : "reveal-right";
    window.reveal && window.reveal.observe(el);
  });

  /* ── Enquiry card (also a direct child of detail-grid, covered above,
     but guard in case markup changes) ── */
  document.querySelectorAll(".enquiry-card").forEach((el) => {
    if (!el.dataset.reveal) {
      el.dataset.reveal = "reveal-right";
        window.reveal && window.reveal.observe(el);
    }
  });

  /* ── Footer sections ── */
  document.querySelectorAll(".footer-brand").forEach((el) => {
    el.dataset.reveal = "reveal-left";
    window.reveal && window.reveal.observe(el);
  });

  document.querySelectorAll(".footer-links-grid").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    window.reveal && window.reveal.observe(el);
  });

  /* Footer columns stagger — each .footer-col is a sibling so the
     nth-child CSS stagger in car-detail.css handles the delay automatically */
  document.querySelectorAll(".footer-col").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    window.reveal && window.reveal.observe(el);
  });

  document.querySelectorAll(".footer-newsletter").forEach((el) => {
    el.dataset.reveal = "reveal-right";
      window.reveal && window.reveal.observe(el);
  });

  document.querySelectorAll(".footer-bottom").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
      window.reveal && window.reveal.observe(el);
  });
}

function collectEnquiryDetails() {
  const name = document.querySelector('.enq-fields .enq-input[placeholder="*Your Name"]')?.value?.trim() || '';
  const email = document.querySelector('.enq-fields .enq-input[placeholder="*Email Address"]')?.value?.trim() || '';
  const phone = document.querySelector('.phone-input')?.value?.trim() || '';
  const carName = document.getElementById('breadcrumbName')?.textContent?.trim() || 'this vehicle';
  const defaultMessage = `Hello, I'm interested in ${carName}. Please send me more details.`;
  const message = document.querySelector('.enq-msg')?.value?.trim() || defaultMessage;
  return { name, email, phone, message, carName };
}

async function sendEnquiryEmail() {
  const { name, email, phone, message, carName } = collectEnquiryDetails();
  if (!name || !email) {
    alert('Please enter your name and email before sending an enquiry.');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, carName, message })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || result.message || 'Failed to send enquiry');
    }
    alert(result.message || 'Your enquiry has been sent.');
  } catch (err) {
    const subject = encodeURIComponent(`Enquiry for ${carName}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nCar: ${carName}\n\nMessage:\n${message}`);
    window.location.href = `mailto:jacksonmurithi47@gmail.com?subject=${subject}&body=${body}`;
  }
}

function openWhatsApp() {
  const { name, email, phone, message } = collectEnquiryDetails();
  const text = encodeURIComponent(`Hello New Age Automotive, I am ${name}. Email: ${email}. Phone: ${phone}. Message: ${message}`);
  window.open(`https://wa.me/+254724105521?text=${text}`, '_blank', 'noopener,noreferrer');
}

/* ── Init on DOM ready — same pattern as new_age.js ── */
document.addEventListener("DOMContentLoaded", () => {
  triggerScrollReveal();

  const enquiryBtn = document.getElementById('send-enquiry-btn');
  const whatsappBtn = document.getElementById('whatsapp-btn');
  if (enquiryBtn) enquiryBtn.addEventListener('click', sendEnquiryEmail);
  if (whatsappBtn) whatsappBtn.addEventListener('click', openWhatsApp);
});