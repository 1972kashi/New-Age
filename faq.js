const shouldIgnoreChannelError = (message) => message && (
  message.includes('A listener indicated an asynchronous response') ||
  message.includes('message channel closed') ||
  message.includes('Message channel closed')
);

window.addEventListener('unhandledrejection', (event) => {
  const message = event?.reason?.message || '';
  if (shouldIgnoreChannelError(message)) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  const message = event?.error?.message || event?.message || '';
  if (shouldIgnoreChannelError(message)) {
    event.preventDefault();
  }
});

const FAQ_STORAGE_KEY = 'naa_faq_items';
const API_BASE = window.API_BASE || window.getApiBase?.() || (window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin);
const categoryBtns = document.querySelectorAll('.category-btn');
const faqSearchInput = document.getElementById('faqSearch');
const noResults = document.getElementById('noResults');
const accordionList = document.getElementById('accordionList');

let activeCategory = 'all';
let faqItems = [];
let carouselTimer = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFaqItems() {
  try {
    const stored = localStorage.getItem(FAQ_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Could not load FAQ items', err);
    return [];
  }
}

function persistFaqItems(items) {
  const normalized = Array.isArray(items) ? items : [];
  try {
    localStorage.setItem(FAQ_STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('Could not save FAQ items', err);
  }
  return normalized;
}

async function loadFaqItemsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/faq`);
    if (!res.ok) throw new Error('Failed to load FAQ items');
    const items = await res.json();
    const normalized = persistFaqItems(items);
    renderFaqItems(normalized);
    return normalized;
  } catch (err) {
    console.warn('Could not load FAQ items from server, using local fallback:', err);
    const fallback = getFaqItems();
    renderFaqItems(fallback);
    return fallback;
  }
}

function injectFaqStyles() {
  if (document.getElementById('faq-advanced-styles')) return;
  const style = document.createElement('style');
  style.id = 'faq-advanced-styles';
  style.textContent = `
    .faq-carousel-shell {
      position: relative;
      max-height: 560px;
      overflow-y: auto;
      padding-right: 8px;
      scroll-behavior: smooth;
      scroll-snap-type: y proximity;
    }
    .faq-carousel-shell::-webkit-scrollbar { width: 7px; }
    .faq-carousel-shell::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,.18);
      border-radius: 999px;
    }
    .faq-item {
      scroll-snap-align: start;
      transition: transform .25s ease, opacity .25s ease;
    }
    .faq-item.hidden { display: none; }
    .faq-item.active { transform: translateY(0); }
    .category-btn .count { display: none; }
  `;
  document.head.appendChild(style);
}

function ensureCarouselShell() {
  if (!accordionList) return;
  if (accordionList.parentElement?.classList.contains('faq-carousel-shell')) return;

  const shell = document.createElement('div');
  shell.className = 'faq-carousel-shell';
  accordionList.parentNode.insertBefore(shell, accordionList);
  shell.appendChild(accordionList);
}

function bindFaqEvents() {
  document.querySelectorAll('.faq-question').forEach((btn) => {
    btn.onclick = () => {
      const item = btn.closest('.faq-item');
      const panel = item.querySelector('.faq-panel');
      const isOpen = item.classList.contains('active');

      document.querySelectorAll('.faq-item.active').forEach((openItem) => {
        if (openItem !== item) {
          openItem.classList.remove('active');
          openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          const openPanel = openItem.querySelector('.faq-panel');
          openPanel.style.maxHeight = null;
          setTimeout(() => { try { openPanel.style.display = 'none'; } catch (e) {} }, 360);
        }
      });

      if (isOpen) {
        item.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
        panel.style.maxHeight = null;
        setTimeout(() => { try { panel.style.display = 'none'; } catch (e) {} }, 360);
      } else {
        item.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        try { panel.style.display = 'block'; } catch (e) {}
        const h = panel.scrollHeight;
        panel.style.maxHeight = h + 'px';
      }
    };
  });
}

function startFaqCarousel() {
  if (!accordionList) return;
  const shell = accordionList.closest('.faq-carousel-shell');
  if (!shell) return;

  if (carouselTimer) clearInterval(carouselTimer);

  const visibleItems = Array.from(accordionList.querySelectorAll('.faq-item:not(.hidden)'));
  if (!visibleItems.length) return;

  carouselTimer = setInterval(() => {
    const currentTop = shell.scrollTop;
    const nextItem = visibleItems.find((item) => item.offsetTop > currentTop + 80) || visibleItems[0];
    shell.scrollTo({ top: Math.max(0, nextItem.offsetTop - 12), behavior: 'smooth' });
  }, 4200);

  shell.addEventListener('mouseenter', () => {
    if (carouselTimer) clearInterval(carouselTimer);
  }, { once: true });

  shell.addEventListener('mouseleave', () => {
    startFaqCarousel();
  }, { once: true });
}

function renderFaqItems(items) {
  faqItems = Array.isArray(items) ? items : [];
  if (!accordionList) return;

  const dynamicItems = faqItems.filter((item) => item && item.question && item.answer);
  accordionList.querySelectorAll('.faq-item[data-source="dynamic"]').forEach((el) => el.remove());

  if (!dynamicItems.length) {
    if (accordionList.querySelector('.faq-item')) {
      bindFaqEvents();
      applyFilters();
      startFaqCarousel();
      return;
    }

    accordionList.innerHTML = '<li class="faq-item"><div class="faq-panel"><div class="faq-panel-inner">No FAQ entries have been added yet.</div></div></li>';
    if (noResults) noResults.classList.add('show');
    return;
  }

  accordionList.insertAdjacentHTML('beforeend', dynamicItems.map((item) => `
    <li class="faq-item" data-source="dynamic" data-category="${escapeHtml(item.category || 'general')}">
      <button class="faq-question" aria-expanded="false">
        <span class="faq-question-text"><span class="cat-tag">${escapeHtml((item.category || 'General').charAt(0).toUpperCase() + (item.category || 'General').slice(1))}</span>${escapeHtml(item.question)}</span>
        <span class="faq-icon"><svg viewBox="0 0 12 8" fill="none"><path d="M1 1l5 5 5-5" stroke="#fff" stroke-width="2"/></svg></span>
      </button>
      <div class="faq-panel">
        <div class="faq-panel-inner">${escapeHtml(item.answer)}</div>
      </div>
    </li>
  `).join(''));

  bindFaqEvents();
  applyFilters();
  startFaqCarousel();
}

function applyFilters() {
  const query = (faqSearchInput && faqSearchInput.value || '').trim().toLowerCase();
  const items = document.querySelectorAll('.faq-item');
  let visibleCount = 0;

  items.forEach((item) => {
    const text = item.textContent.toLowerCase();
    const matchesCategory = activeCategory === 'all' || item.dataset.category === activeCategory;
    const matchesSearch = query === '' || text.includes(query);
    const show = matchesCategory && matchesSearch;

    item.classList.toggle('hidden', !show);
    if (show) visibleCount++;

    if (!show && item.classList.contains('active')) {
      item.classList.remove('active');
      item.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      item.querySelector('.faq-panel').style.maxHeight = null;
    }
  });

  if (noResults) noResults.classList.toggle('show', visibleCount === 0);
  startFaqCarousel();
}

function initFaqPage() {
  injectFaqStyles();
  ensureCarouselShell();
  document.querySelectorAll('.category-btn .count').forEach((el) => el.remove());

  categoryBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.category;
      applyFilters();
    });
  });

  faqSearchInput && faqSearchInput.addEventListener('input', applyFilters);
  window.addEventListener('faq-data-updated', (event) => {
    renderFaqItems(event.detail || getFaqItems());
  });
  window.addEventListener('storage', (event) => {
    if (event.key === FAQ_STORAGE_KEY) {
      renderFaqItems(getFaqItems());
    }
  });

  renderFaqItems(getFaqItems());
}

initFaqPage();