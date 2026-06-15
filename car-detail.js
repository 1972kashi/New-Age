/* ─────────────────────────────────────────────────────────────────
   car-detail.js  —  Scroll Reveal
   Logic mirrors new_age.js exactly:
     • Same IntersectionObserver options (threshold 0.1, rootMargin)
     • Same class-removal → reflow → class-add pattern
     • Directions assigned per element class, just like new_age.js
     • Each element animates once then is unobserved
   Targets the exact classes in car-detail.html (no data-reveal attrs)
───────────────────────────────────────────────────────────────── */

/* ── Observer — identical options to new_age.js ── */
const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -30px 0px" };

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      /* Strip every reveal class so the animation always starts fresh */
      entry.target.classList.remove(
        "reveal-left", "reveal-right", "reveal-top",
        "reveal-bottom", "reveal-scale"
      );
      /* Force reflow — browser must register the removal before re-adding */
      void entry.target.offsetWidth;
      /* Add the stored direction class (falls back to reveal-bottom) */
      entry.target.classList.add(entry.target.dataset.reveal || "reveal-bottom");
      /* Fire once only */
      revealObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

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
    revealObserver.observe(el);
  });

  /* ── Gallery section wrapper ── */
  document.querySelectorAll(".gallery-section").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    revealObserver.observe(el);
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
    revealObserver.observe(photo);
  });

  /* ── Detail grid children (left info panel + enquiry card) ── */
  const detailChildren = document.querySelectorAll(".detail-grid > div");
  detailChildren.forEach((el, i) => {
    el.dataset.reveal = i === 0 ? "reveal-left" : "reveal-right";
    revealObserver.observe(el);
  });

  /* ── Enquiry card (also a direct child of detail-grid, covered above,
     but guard in case markup changes) ── */
  document.querySelectorAll(".enquiry-card").forEach((el) => {
    if (!el.dataset.reveal) {
      el.dataset.reveal = "reveal-right";
      revealObserver.observe(el);
    }
  });

  /* ── Footer sections ── */
  document.querySelectorAll(".footer-brand").forEach((el) => {
    el.dataset.reveal = "reveal-left";
    revealObserver.observe(el);
  });

  document.querySelectorAll(".footer-links-grid").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    revealObserver.observe(el);
  });

  /* Footer columns stagger — each .footer-col is a sibling so the
     nth-child CSS stagger in car-detail.css handles the delay automatically */
  document.querySelectorAll(".footer-col").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    revealObserver.observe(el);
  });

  document.querySelectorAll(".footer-newsletter").forEach((el) => {
    el.dataset.reveal = "reveal-right";
    revealObserver.observe(el);
  });

  document.querySelectorAll(".footer-bottom").forEach((el) => {
    el.dataset.reveal = "reveal-bottom";
    revealObserver.observe(el);
  });
}

/* ── Init on DOM ready — same pattern as new_age.js ── */
document.addEventListener("DOMContentLoaded", () => {
  triggerScrollReveal();
});