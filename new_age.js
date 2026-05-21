// Car Loan Calculator Logic
document.addEventListener('DOMContentLoaded', function () {

  // Grab inputs
  const purchasePriceInput = document.querySelectorAll('.calc-input')[0];
  const downPaymentInput   = document.querySelectorAll('.calc-input')[1];
  const loanTenureSelect   = document.querySelector('.select-input');
  const interestRateInput  = document.querySelectorAll('.calc-input')[3];

  // Grab result elements
  const resultAmount   = document.querySelector('.result-amount');
  const loanAmountEl   = document.querySelectorAll('.result-row strong')[0];
  const totalInterestEl = document.querySelectorAll('.result-row strong')[1];
  const totalPaymentEl = document.querySelectorAll('.result-row strong')[2];

  // Grab buttons
  const calculateBtn = document.querySelectorAll('.calc-btn-row .btn')[0];
  const resetBtn     = document.querySelectorAll('.calc-btn-row .btn')[1];

  // Helper: parse a number string (removes commas)
  function parseNumber(val) {
    return parseFloat(val.replace(/,/g, '')) || 0;
  }

  // Helper: format number with commas
  function formatNumber(num) {
    return num.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // Calculate button click
  calculateBtn.addEventListener('click', function () {
    const purchasePrice = parseNumber(purchasePriceInput.value);
    const downPayment   = parseNumber(downPaymentInput.value);
    const tenureText    = loanTenureSelect.value;
    const annualRate    = parseNumber(interestRateInput.value);

    // Validate inputs
    if (!purchasePrice || tenureText === 'Loan Tenure' || !annualRate) {
      alert('Please fill in all fields correctly.');
      return;
    }

    // Determine if down payment is a percentage or a fixed amount
    let downPaymentAmount = downPayment;
    if (downPaymentInput.value.includes('%') || downPayment <= 100) {
      // Treat as percentage
      downPaymentAmount = (downPayment / 100) * purchasePrice;
    }

    const loanAmount   = purchasePrice - downPaymentAmount;
    const months       = parseInt(tenureText);         // e.g. "12 months" → 12
    const monthlyRate  = annualRate / 100 / 12;

    // Monthly payment formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    let monthlyPayment;
    if (monthlyRate === 0) {
      monthlyPayment = loanAmount / months;
    } else {
      const factor = Math.pow(1 + monthlyRate, months);
      monthlyPayment = loanAmount * (monthlyRate * factor) / (factor - 1);
    }

    const totalPayment  = monthlyPayment * months;
    const totalInterest = totalPayment - loanAmount;

    // Update the UI
    resultAmount.innerHTML   = `<small>KES </small>${formatNumber(Math.round(monthlyPayment))}`;
    loanAmountEl.textContent  = `KES ${formatNumber(Math.round(loanAmount))}`;
    totalInterestEl.textContent = `KES ${formatNumber(Math.round(totalInterest))}`;
    totalPaymentEl.textContent  = `KES ${formatNumber(Math.round(totalPayment))}`;
  });

  // Reset button click
  resetBtn.addEventListener('click', function () {
    purchasePriceInput.value = '';
    downPaymentInput.value   = '';
    loanTenureSelect.value   = 'Loan Tenure';
    interestRateInput.value  = '';

    resultAmount.innerHTML      = `<small>KES </small>0`;
    loanAmountEl.textContent    = 'KES 0';
    totalInterestEl.textContent = 'KES 0';
    totalPaymentEl.textContent  = 'KES 0';
  });
});

/*Scroll Reveal*/
const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("reveal");
      revealObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

function triggerScrollReveal() {
  document
    .querySelectorAll(
      ".feature-car-card, .search-bar-section, .section, .car-card, " +
      ".grid grid-3, .source-banner, .calculator-section, .why-section"
    )
    .forEach((el) => {
      el.classList.remove("reveal");
      revealObserver.observe(el);
    });
}

const CARDS_PER_PAGE = 6; // how many cards per page
let cards = [];
let pageBtns = [];
let prevBtn = null;
let nextBtn = null;
let pagination = null;
let totalPages = 5;
let currentPage = 1;
let searchInput = null;
let searchQuery = '';

function getFilteredCards() {
  return cards.filter(card => {
    if (!searchQuery) return true;
    return card.textContent.toLowerCase().includes(searchQuery);
  });
}

function buildHomePagination() {
  if (!pagination) return;
  const existingPageBtns = Array.from(pagination.querySelectorAll('[data-page]'));
  existingPageBtns.forEach(btn => btn.remove());

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('div');
    btn.className = 'page-btn';
    btn.dataset.page = String(i);
    btn.textContent = String(i);
    btn.onclick = () => showPage(i);
    pagination.insertBefore(btn, nextBtn || null);
  }

  pageBtns = Array.from(pagination.querySelectorAll('[data-page]'));
  if (prevBtn) prevBtn.onclick = () => showPage(currentPage - 1);
  if (nextBtn) nextBtn.onclick = () => showPage(currentPage + 1);
}

function setSearch(value) {
  searchQuery = (value || '').trim().toLowerCase();
  currentPage = 1;
  updateHomeView();
}

function updateHomeView() {
  const filtered = getFilteredCards();
  totalPages = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
  buildHomePagination();
  showPage(currentPage);
}

function showPage(page) {
  const filtered = getFilteredCards();
  totalPages = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
  currentPage = Math.max(1, Math.min(page, totalPages));
  const grid = document.querySelector('.section .grid.grid-3');

  cards.forEach(card => card.classList.add('hidden'));
  filtered.forEach((card, index) => {
    const cardPage = Math.floor(index / CARDS_PER_PAGE) + 1;
    if (cardPage === currentPage) {
      card.classList.remove('hidden');
    }
  });

  const noResults = document.querySelector('.no-results');
  if (!filtered.length) {
    if (!noResults && grid) {
      const msg = document.createElement('div');
      msg.className = 'no-results';
      msg.textContent = 'No cars match your search.';
      grid.parentNode.insertBefore(msg, grid.nextSibling);
    }
  } else if (noResults) {
    noResults.remove();
  }

  pageBtns.forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.page) === currentPage);
  });

  document.querySelector('.grid-3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initHomePagination() {
  cards = [...document.querySelectorAll('.section .grid.grid-3 .car-card')];
  pagination = document.querySelector('.pagination');
  prevBtn = document.querySelector('.page-btn[data-prev]');
  nextBtn = document.querySelector('.page-btn[data-next]');
  searchInput = document.querySelector('.search-bar-section .search-input');

  if (searchInput && !searchInput.dataset.homeSearchAttached) {
    searchInput.addEventListener('input', e => setSearch(e.target.value));
    searchInput.dataset.homeSearchAttached = 'true';
  }

  updateHomeView();
}

window.refreshHomePagination = initHomePagination;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePagination);
} else {
  initHomePagination();
}
