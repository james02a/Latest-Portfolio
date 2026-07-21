/*
  ============================================================
  PROJECT GALLERY SECTION — behavior
  ------------------------------------------------------------
  - Lightweight, vanilla JS only. No GSAP, no AOS.
  - Uses IntersectionObserver to trigger the fade-up reveal
    defined in project-gallery.css (.pg-reveal / .pg-is-visible).
  - Scoped entirely to elements inside #project-gallery, so it
    won't touch anything else on your page.
  - Safe to include multiple times / alongside other scripts:
    it checks for the section before doing anything.
  ============================================================
*/

(function () {
  "use strict";

  var section = document.getElementById("project-gallery");
  if (!section) return; // section not on this page — do nothing

  var revealEls = section.querySelectorAll(".pg-reveal");

  // Fallback for browsers without IntersectionObserver support:
  // just show everything immediately.
  if (!("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) {
      el.classList.add("pg-is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("pg-is-visible");
          observer.unobserve(entry.target); // animate once, not on every scroll
        }
      });
    },
    {
      root: null,
      rootMargin: "0px 0px -10% 0px", // trigger slightly before full view
      threshold: 0.15,
    }
  );

  revealEls.forEach(function (el) {
    observer.observe(el);
  });
})();
