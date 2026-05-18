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

const CARDS_PER_PAGE = 3; // how many cards per page
const cards = [...document.querySelectorAll('.car-card')];
const pageBtns = [...document.querySelectorAll('.page-btn[data-page]')];
const prevBtn = document.querySelector('.page-btn[data-prev]');
const nextBtn = document.querySelector('.page-btn[data-next]');

const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);
let currentPage = 1;

function showPage(page) {
  // Clamp page within bounds
  currentPage = Math.max(1, Math.min(page, totalPages));

  // Show/hide cards
  cards.forEach((card, i) => {
    const cardPage = Math.floor(i / CARDS_PER_PAGE) + 1;
    if (cardPage === currentPage) {
      card.classList.remove('hidden');
      // Restart animation
      card.classList.remove('fade-in');
      void card.offsetWidth; // force reflow
      card.classList.add('fade-in');
    } else {
      card.classList.add('hidden');
      card.classList.remove('fade-in');
    }
  });

  // Update active button
  pageBtns.forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.page) === currentPage);
  });

  // Scroll to the grid top smoothly
  document.querySelector('.grid-3').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Page number buttons
pageBtns.forEach(btn => {
  btn.addEventListener('click', () => showPage(Number(btn.dataset.page)));
});

// Prev / Next
prevBtn?.addEventListener('click', () => showPage(currentPage - 1));
nextBtn?.addEventListener('click', () => showPage(currentPage + 1));

// Init
showPage(1);
