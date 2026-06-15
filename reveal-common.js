/* Shared scroll reveal helper
   Exposes `window.reveal.observe(element)` to register elements for reveal
   Respects `prefers-reduced-motion` and keeps a single IntersectionObserver. */
(function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const options = { threshold: 0.1, rootMargin: '0px 0px -30px 0px' };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      // Remove any reveal classes so animation restarts
      ['reveal-left','reveal-right','reveal-top','reveal-bottom','reveal-scale'].forEach(c => entry.target.classList.remove(c));
      // If reduced motion is requested, simply make element visible
      if (prefersReduced) {
        entry.target.style.opacity = '1';
        observer.unobserve(entry.target);
        return;
      }
      // Force reflow then add stored reveal class
      void entry.target.offsetWidth;
      entry.target.classList.add(entry.target.dataset.reveal || 'reveal-bottom');
      observer.unobserve(entry.target);
    });
  }, options);

  window.reveal = {
    observe(el) {
      if (!el) return;
      // If user prefers reduced motion, reveal immediately
      if (prefersReduced) {
        el.style.opacity = '1';
        return;
      }
      observer.observe(el);
    },
    observeSelector(selector, type) {
      document.querySelectorAll(selector).forEach((el, i) => {
        if (!el.dataset.reveal) {
          if (typeof type === 'function') el.dataset.reveal = type(el, i);
          else if (typeof type === 'string') el.dataset.reveal = type;
        }
        this.observe(el);
      });
    }
  };
})();
