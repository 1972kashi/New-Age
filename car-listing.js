// car-listing.js
// Pagination logic for car-listings page
const LISTING_CARDS_PER_PAGE = 12;
let listingCards = [];
let pageBtns = [];
let prevListingBtn = null;
let nextListingBtn = null;
let listingTotalPages = 1;
let listingCurrentPage = 1;
let listingSearchInput = null;
let listingSearchQuery = '';
let listingSearchAttached = false;

function getFilteredListingCards() {
  // Advanced filters
  const minBudget = Number((document.getElementById('minBudget') && document.getElementById('minBudget').value) || 0) || 0;
  const maxBudget = Number((document.getElementById('maxBudget') && document.getElementById('maxBudget').value) || 0) || 0;
  const modelFilter = (document.getElementById('filterModel') && document.getElementById('filterModel').value || '').trim().toLowerCase();
  const yearFilter = (document.getElementById('filterYear') && document.getElementById('filterYear').value || '').trim().toLowerCase();

  return listingCards.filter(card => {
    const text = (card.textContent || '').toLowerCase();
    // Basic search query match
    if (listingSearchQuery && !text.includes(listingSearchQuery)) return false;

    // Model filter (matches any text)
    if (modelFilter && !text.includes(modelFilter)) return false;
    // Year filter
    if (yearFilter && !text.includes(yearFilter)) return false;

    // Price filter: attempt to extract numbers from text
    if (minBudget || maxBudget) {
      const m = text.match(/\d{1,3}(?:[\,\s]\d{3})*(?:\d*)/g);
      let price = 0;
      if (m && m.length) {
        // choose largest number as price candidate
        price = Math.max(...m.map(s => Number(s.replace(/[,\s]/g, ''))));
      }
      if (minBudget && price < minBudget) return false;
      if (maxBudget && price > maxBudget) return false;
    }

    return true;
  });
}

function showListingPage(page) {
  const filtered = getFilteredListingCards();
  listingTotalPages = Math.max(1, Math.ceil(filtered.length / LISTING_CARDS_PER_PAGE));
  listingCurrentPage = Math.max(1, Math.min(page, listingTotalPages));

  listingCards.forEach(card => card.classList.add('hidden'));
  filtered.forEach((card, index) => {
    const cardPage = Math.floor(index / LISTING_CARDS_PER_PAGE) + 1;
    if (cardPage === listingCurrentPage) {
      card.classList.remove('hidden');
    }
  });

  const noResults = document.querySelector('.no-results');
  const container = document.querySelector('.listings-section .container');
  if (!filtered.length && container) {
    if (!noResults) {
      const msg = document.createElement('div');
      msg.className = 'no-results';
      msg.textContent = 'No cars match your search.';
      container.appendChild(msg);
    }
  } else if (noResults) {
    noResults.remove();
  }

  pageBtns.forEach(btn => {
    btn.classList.toggle('active', Number(btn.textContent.trim()) === listingCurrentPage);
  });
}

function buildListingPagination() {
  const pagination = document.querySelector('.pagination');
  if (!pagination) return;

  const allBtns = [...pagination.querySelectorAll('.pg-btn')];
  prevListingBtn = allBtns.find(btn => btn.textContent.trim() === '‹');
  nextListingBtn = allBtns.find(btn => btn.textContent.trim() === '›');

  // Remove existing numeric buttons and recreate them
  allBtns.forEach(btn => {
    const text = btn.textContent.trim();
    if (text !== '‹' && text !== '›') btn.remove();
  });

  for (let i = 1; i <= listingTotalPages; i++) {
    const btn = document.createElement('div');
    btn.className = 'pg-btn';
    btn.textContent = i;
    pagination.insertBefore(btn, nextListingBtn || null);
  }

  pageBtns = [...pagination.querySelectorAll('.pg-btn')].filter(btn => btn.textContent.trim() !== '‹' && btn.textContent.trim() !== '›');
  pageBtns.forEach(btn => {
    btn.onclick = () => showListingPage(Number(btn.textContent.trim()));
  });

  if (prevListingBtn) prevListingBtn.onclick = () => showListingPage(listingCurrentPage - 1);
  if (nextListingBtn) nextListingBtn.onclick = () => showListingPage(listingCurrentPage + 1);
}

function initListingPagination() {
  listingCards = [...document.querySelectorAll('.listings-section .container .car-card')];
  listingSearchInput = document.querySelector('.hero-banner .search-input');
  if (listingSearchInput && !listingSearchAttached) {
    listingSearchInput.addEventListener('input', e => {
      listingSearchQuery = (e.target.value || '').trim().toLowerCase();
      listingCurrentPage = 1;
      initListingPagination();
    });
    listingSearchAttached = true;
  }

  // Search button
  const searchBtn = document.querySelector('.hero-banner .btn-gold');
  if (searchBtn) searchBtn.onclick = () => {
    if (listingSearchInput) {
      listingSearchQuery = (listingSearchInput.value || '').trim().toLowerCase();
      listingCurrentPage = 1;
      initListingPagination();
    }
  };

  // Pop-tag clicks (popular searches)
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('pop-tag')) {
      const q = (t.textContent || '').trim();
      if (listingSearchInput) {
        listingSearchInput.value = q;
        listingSearchQuery = q.toLowerCase();
        listingCurrentPage = 1;
        initListingPagination();
      }
    }
  });

  // Filter toggle
  const filterBtn = document.querySelector('.btn-filter');
  const adv = document.querySelector('.advanced-filters');
  if (filterBtn && adv) {
    filterBtn.onclick = () => {
      const shown = adv.style.display !== 'none';
      adv.style.display = shown ? 'none' : 'block';
      filterBtn.textContent = shown ? 'Show More Filters ▽' : 'Hide Filters △';
    };
  }

  // Apply filters button
  const applyBtn = document.querySelector('.apply-filters');
  if (applyBtn) applyBtn.onclick = () => {
    listingSearchQuery = (listingSearchInput && listingSearchInput.value || '').trim().toLowerCase();
    listingCurrentPage = 1;
    initListingPagination();
  };

  // Populate model datalist from cards
  try {
    const modelSet = new Set();
    listingCards.forEach(card => {
      const txt = (card.querySelector('.card-name') || card.querySelector('.car-name'))?.textContent || '';
      const parts = txt.split(' ');
      if (parts.length > 1) modelSet.add(parts.slice(1).join(' '));
    });
    const dl = document.getElementById('detailModel');
    if (dl) {
      modelSet.forEach(m => {
        const opt = document.createElement('option'); opt.value = m; dl.appendChild(opt);
      });
    }
  } catch (e) {}

  // Read URL params to prefill filters (q, min, max, model, year)
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q && listingSearchInput) {
      listingSearchInput.value = q;
      listingSearchQuery = q.toLowerCase();
    }
    const min = params.get('min');
    const max = params.get('max');
    const model = params.get('model');
    const year = params.get('year');
    if (min && document.getElementById('minBudget')) document.getElementById('minBudget').value = min;
    if (max && document.getElementById('maxBudget')) document.getElementById('maxBudget').value = max;
    if (model && document.getElementById('filterModel')) document.getElementById('filterModel').value = model;
    if (year && document.getElementById('filterYear')) document.getElementById('filterYear').value = year;
  } catch (e) {}

  const filtered = getFilteredListingCards();
  listingTotalPages = Math.max(1, Math.ceil(filtered.length / LISTING_CARDS_PER_PAGE));
  if (listingCurrentPage > listingTotalPages) listingCurrentPage = listingTotalPages;
  buildListingPagination();
  showListingPage(listingCurrentPage);
}

window.refreshListingPagination = initListingPagination;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { initListingPagination(); triggerScrollReveal(); });
} else {
  initListingPagination();
  triggerScrollReveal();
}

/* Scroll reveal uses shared reveal-common.js: window.reveal.observe(el) */

function triggerScrollReveal() {
  // Select elements that should have scroll reveal
  const revealSelectors = [
    ".listings-section",
    "g-3 row-gap",
    "g-3",
    "pagination"
  ];

  document.querySelectorAll(revealSelectors.join(", ")).forEach((el) => {
    // Set reveal type based on element position or class
    if (!el.dataset.reveal) {
      if (el.classList.contains("listings-title")) {
        el.dataset.reveal = "reveal-left";
      } else if (el.classList.contains("g-3 row-gap")) {
        el.dataset.reveal = "reveal-right";
      } else if (el.classList.contains("g-3 row-gap")) {
        el.dataset.reveal = "reveal-bottom";
      } 
      else if (el.classList.contains("g-3")) {
        el.dataset.reveal = "reveal-bottom";
      } else if (el.classList.contains("pagination")) {
        el.dataset.reveal = "reveal-scale";
      } else {
        el.dataset.reveal = "reveal-bottom";
      }
    }
    
    window.reveal && window.reveal.observe(el);
  });
}