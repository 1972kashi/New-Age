/* ════════════════════════════════════════
   ACCORDION TOGGLE LOGIC
════════════════════════════════════════ */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item  = btn.closest('.faq-item');
    const panel = item.querySelector('.faq-panel');
    const isOpen = item.classList.contains('active');

    // Close all other open items (single-open accordion behaviour)
    document.querySelectorAll('.faq-item.active').forEach(openItem => {
      if (openItem !== item) {
        openItem.classList.remove('active');
        openItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        const openPanel = openItem.querySelector('.faq-panel');
        // collapse animation
        openPanel.style.maxHeight = null;
        // hide after transition to avoid layout jump
        setTimeout(() => { try { openPanel.style.display = 'none'; } catch(e) {} }, 360);
      }
    });

    // Toggle current item
    if (isOpen) {
      item.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
      // collapse
      panel.style.maxHeight = null;
      setTimeout(() => { try { panel.style.display = 'none'; } catch(e) {} }, 360);
    } else {
      item.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
      // ensure panel is visible before measuring
      try { panel.style.display = 'block'; } catch(e) {}
      // force a reflow then set maxHeight for transition
      const h = panel.scrollHeight;
      panel.style.maxHeight = h + 'px';
    }
  });
});

/* ════════════════════════════════════════
   CATEGORY FILTER
════════════════════════════════════════ */
const categoryBtns = document.querySelectorAll('.category-btn');
const faqItems     = document.querySelectorAll('.faq-item');
const faqSearchInput  = document.getElementById('faqSearch');
const noResults    = document.getElementById('noResults');

let activeCategory = 'all';

categoryBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    categoryBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    applyFilters();
  });
});

/* ════════════════════════════════════════
   LIVE SEARCH FILTER
════════════════════════════════════════ */
faqSearchInput && faqSearchInput.addEventListener('input', applyFilters);

function applyFilters() {
  const query = (faqSearchInput && faqSearchInput.value || '').trim().toLowerCase();
  let visibleCount = 0;

  faqItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    const matchesCategory = activeCategory === 'all' || item.dataset.category === activeCategory;
    const matchesSearch   = query === '' || text.includes(query);
    const show = matchesCategory && matchesSearch;

    item.classList.toggle('hidden', !show);
    if (show) visibleCount++;

    // Collapse hidden items so they don't stay "open" invisibly
    if (!show && item.classList.contains('active')) {
      item.classList.remove('active');
      item.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      item.querySelector('.faq-panel').style.maxHeight = null;
    }
  });

  noResults.classList.toggle('show', visibleCount === 0);
}