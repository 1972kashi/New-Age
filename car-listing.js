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
  return listingCards.filter(card => {
    if (!listingSearchQuery) return true;
    return card.textContent.toLowerCase().includes(listingSearchQuery);
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

  const filtered = getFilteredListingCards();
  listingTotalPages = Math.max(1, Math.ceil(filtered.length / LISTING_CARDS_PER_PAGE));
  if (listingCurrentPage > listingTotalPages) listingCurrentPage = listingTotalPages;
  buildListingPagination();
  showListingPage(listingCurrentPage);
}

window.refreshListingPagination = initListingPagination;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initListingPagination);
} else {
  initListingPagination();
}

/*Scroll Reveal*/
const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -30px 0px" };
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.remove("reveal-left", "reveal-right", "reveal-top");
      // Trigger reflow to restart animation
      void entry.target.offsetWidth;
      entry.target.classList.add(entry.target.dataset.reveal || "reveal-bottom");
      revealObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

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
    
    revealObserver.observe(el);
  });
}