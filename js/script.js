(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ========================================================================
     1. NAVIGATION
     ===================================================================== */
  const nav = document.getElementById("siteNav");
  const navLinksEl = document.getElementById("navLinks");
  const navLinks = [...document.querySelectorAll(".nav-link")];

  // Solid background after scrolling past the top
  const updateNavBg = () => {
    nav.classList.toggle("scrolled", window.scrollY > 24);
  };

  // --- Mouse-follow slide (desktop only) ---
  let navTargetX = 0;
  let navCurrentX = 0;
  let navRafActive = false;

  const navParallaxEnabled = () =>
    // >1024px matches the hamburger breakpoint: below it the desktop link
    // strip is hidden, so animating it would be wasted work.
    !prefersReducedMotion && !isCoarsePointer && window.innerWidth > 1024;

  const navRaf = () => {
    navCurrentX = lerp(navCurrentX, navTargetX, 0.07); // smooth interpolation
    navLinksEl.style.transform = `translateX(${navCurrentX.toFixed(2)}px)`;
    if (Math.abs(navCurrentX - navTargetX) > 0.1) {
      requestAnimationFrame(navRaf);
    } else {
      navRafActive = false;
    }
  };

  window.addEventListener("mousemove", (e) => {
    if (!navParallaxEnabled()) return;
    const ratio = e.clientX / window.innerWidth - 0.5; // -0.5 → 0.5
    navTargetX = ratio * -56; // slide opposite the cursor, max ±28px
    if (!navRafActive) {
      navRafActive = true;
      requestAnimationFrame(navRaf);
    }
  });

  window.addEventListener("resize", () => {
    if (!navParallaxEnabled()) {
      navTargetX = 0;
      navLinksEl.style.transform = "";
    }
  });

  // --- Active link on scroll (scroll spy) ---
  const sections = navLinks
    .map((l) => document.querySelector(l.getAttribute("href")))
    .filter(Boolean);

  const mobileNavLinks = [...document.querySelectorAll(".mnav__link")];

  const spy = () => {
    const y = window.scrollY + window.innerHeight * 0.35;
    let current = sections[0];
    sections.forEach((s) => {
      if (s.offsetTop <= y) current = s;
    });
    const activeHash = `#${current.id}`;
    // Keep desktop links and the mobile panel's links in sync
    [...navLinks, ...mobileNavLinks].forEach((l) =>
      l.classList.toggle("is-active", l.getAttribute("href") === activeHash)
    );
  };

  /* ========================================================================
     1b. MOBILE NAVIGATION — off-canvas menu (≤1024px)
     ------------------------------------------------------------------------
     - Hamburger toggles the panel; the icon morphs into an X via CSS.
     - Body scroll is locked while open (class on <html> + <body>).
     - Closes on: link click, backdrop tap, Escape, or resizing past 1024px.
     - Focus management: focus moves into the panel on open, is trapped
       (Tab cycles burger → links → CTA → back), and returns to the
       hamburger on close.
     ===================================================================== */
  const burger = document.getElementById("navBurger");
  const mobileNav = document.getElementById("mobileNav");
  const mnavBackdrop = document.getElementById("mnavBackdrop");

  let lastFocused = null;

  const isMenuOpen = () => document.body.classList.contains("mnav-open");

  const focusablesInMenu = () => [
    ...mobileNav.querySelectorAll("a[href], button:not([disabled])"),
  ];

  const openMenu = () => {
    lastFocused = document.activeElement;
    document.body.classList.add("mnav-open");
    document.documentElement.classList.add("mnav-lock");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Close menu");
    mobileNav.setAttribute("aria-hidden", "false");
    // Move focus into the panel once the slide-in has started
    requestAnimationFrame(() => {
      const first = focusablesInMenu()[0];
      if (first) first.focus({ preventScroll: true });
    });
  };

  const closeMenu = ({ restoreFocus = true } = {}) => {
    document.body.classList.remove("mnav-open");
    document.documentElement.classList.remove("mnav-lock");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Open menu");
    mobileNav.setAttribute("aria-hidden", "true");
    if (restoreFocus && lastFocused && lastFocused.focus) {
      lastFocused.focus({ preventScroll: true });
    }
  };

  burger.addEventListener("click", () =>
    isMenuOpen() ? closeMenu() : openMenu()
  );

  mnavBackdrop.addEventListener("click", () => closeMenu());

  // Close when a link inside the panel is chosen. The scroll lock is removed
  // synchronously, so the browser's native smooth anchor scroll (from
  // `scroll-behavior: smooth` on <html>) proceeds unblocked.
  mobileNav.addEventListener("click", (e) => {
    if (e.target.closest("a[href]")) closeMenu({ restoreFocus: false });
  });

  document.addEventListener("keydown", (e) => {
    if (!isMenuOpen()) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }

    // Trap Tab focus inside the open menu (burger + panel form the loop)
    if (e.key === "Tab") {
      const items = [burger, ...focusablesInMenu()];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Leaving the tablet breakpoint closes the menu so no locked state lingers
  const mnavMq = window.matchMedia("(max-width: 1024px)");
  const onMnavMqChange = () => {
    if (!mnavMq.matches && isMenuOpen()) closeMenu({ restoreFocus: false });
  };
  if (mnavMq.addEventListener) {
    mnavMq.addEventListener("change", onMnavMqChange);
  } else {
    mnavMq.addListener(onMnavMqChange); // older Safari fallback
  }

  /* ========================================================================
     HERO BACKGROUND — interactive particle field
     ------------------------------------------------------------------------
     A small canvas layer behind the hero content: dots drift slowly on
     their own, draw faint connecting lines to nearby neighbors, and gently
     get pushed away from the cursor with a connecting line to it too — a
     subtle "the background is alive and aware of you" touch.

     Performance/accessibility guards:
       - Skipped entirely for prefers-reduced-motion, coarse pointers
         (touch), and narrow viewports (mobile) — matches the same gate
         used for the nav parallax effect above.
       - The animation loop only runs while the hero is actually scrolled
         into view (IntersectionObserver) and pauses when the browser tab
         is hidden (visibilitychange) — no wasted frames off-screen.
       - Resize is debounced; particle count scales with hero area so
         density stays visually consistent at any screen size.
     ===================================================================== */
  const heroEl = document.querySelector(".hero");
  const particleCanvas = document.getElementById("heroParticles");

  const particlesEnabled = () =>
    !prefersReducedMotion && !isCoarsePointer && window.innerWidth > 720;

  if (heroEl && particleCanvas) {
    const ctx = particleCanvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const DENSITY = 16000; // px² of hero area per particle (lower = denser)
    const LINK_DIST = 120; // max px between two particles to draw a line
    const POINTER_RADIUS = 150; // px — how far the cursor's influence reaches

    let width = 0;
    let height = 0;
    let particles = [];
    let pointer = { x: 0, y: 0, active: false };
    let rafId = null;
    let running = false;

    const seedParticles = () => {
      const count = clamp(Math.round((width * height) / DENSITY), 20, 90);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.5 + 0.6,
      }));
    };

    const resize = () => {
      const rect = heroEl.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      particleCanvas.width = width * dpr;
      particleCanvas.height = height * dpr;
      particleCanvas.style.width = `${width}px`;
      particleCanvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      // Drift + gentle cursor repulsion
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges so motion never abruptly stops/bounces
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < POINTER_RADIUS) {
            const force = (1 - dist / POINTER_RADIUS) * 0.6;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(236, 236, 230, 0.45)";
        ctx.fill();
      });

      // Connect nearby particles to each other — faint, distance-based
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK_DIST) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(67, 83, 255, ${(1 - dist / LINK_DIST) * 0.3})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Connect nearby particles to the cursor — the "interactive" cue
      if (pointer.active) {
        const reach = LINK_DIST * 1.3;
        particles.forEach((p) => {
          const dist = Math.hypot(p.x - pointer.x, p.y - pointer.y);
          if (dist < reach) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.strokeStyle = `rgba(67, 83, 255, ${(1 - dist / reach) * 0.5})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      }

      rafId = requestAnimationFrame(drawFrame);
    };

    const start = () => {
      if (running || !particlesEnabled()) return;
      running = true;
      rafId = requestAnimationFrame(drawFrame);
    };

    const stop = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      ctx.clearRect(0, 0, width, height);
    };

    const updatePointer = (clientX, clientY) => {
      const rect = heroEl.getBoundingClientRect();
      pointer.x = clientX - rect.left;
      pointer.y = clientY - rect.top;
      pointer.active = true;
    };

    heroEl.addEventListener("mousemove", (e) => {
      if (!particlesEnabled()) return;
      updatePointer(e.clientX, e.clientY);
    });

    heroEl.addEventListener("mouseleave", () => {
      pointer.active = false;
    });

    heroEl.addEventListener(
      "touchmove",
      (e) => {
        if (!particlesEnabled() || !e.touches[0]) return;
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );

    heroEl.addEventListener("touchend", () => {
      pointer.active = false;
    });

    // Only spend cycles animating while the hero is on screen
    const heroVisibility = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && document.visibilityState === "visible") {
            start();
          } else {
            stop();
          }
        });
      },
      { threshold: 0 }
    );
    heroVisibility.observe(heroEl);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stop();
      } else if (heroEl.getBoundingClientRect().bottom > 0) {
        start();
      }
    });

    let particleResizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(particleResizeTimer);
      particleResizeTimer = setTimeout(() => {
        resize();
        if (!particlesEnabled()) stop();
      }, 150); // debounced — resize math is cheap but no need to run every pixel
    });

    resize();
    if (particlesEnabled()) start();
  }

  /* ========================================================================
     2. HERO CAROUSEL
     ===================================================================== */
  const carousel = document.getElementById("carousel");
  const track = document.getElementById("carouselTrack");
  const slides = [...track.children];
  const btnPrev = document.getElementById("carouselPrev");
  const btnNext = document.getElementById("carouselNext");
  const counterIndex = document.getElementById("carouselIndex");
  const counterTotal = document.getElementById("carouselTotal");

  let slideIndex = 0;
  let autoplayTimer = null;
  const AUTOPLAY_MS = 3000;
  const pad = (n) => String(n).padStart(2, "0");

  counterTotal.textContent = pad(slides.length);

  const goTo = (i) => {
    slideIndex = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${slideIndex * 100}%)`;
    slides.forEach((s, idx) =>
      s.classList.toggle("is-active", idx === slideIndex)
    );
    counterIndex.textContent = pad(slideIndex + 1);
  };

  const startAutoplay = () => {
    if (prefersReducedMotion) return;
    stopAutoplay();
    autoplayTimer = setInterval(() => goTo(slideIndex + 1), AUTOPLAY_MS);
  };
  const stopAutoplay = () => {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = null;
  };

  btnPrev.addEventListener("click", () => {
    goTo(slideIndex - 1);
    startAutoplay();
  });
  btnNext.addEventListener("click", () => {
    goTo(slideIndex + 1);
    startAutoplay();
  });

  carousel.addEventListener("mouseenter", stopAutoplay);
  carousel.addEventListener("mouseleave", startAutoplay);

  // --- Swipe support (pointer events) ---
  let dragStartX = null;
  let dragging = false;

  carousel.addEventListener(
    "pointerdown",
    (e) => {
      dragStartX = e.clientX;
      dragging = true;
      stopAutoplay();
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerup",
    (e) => {
      if (!dragging || dragStartX === null) return;
      const delta = e.clientX - dragStartX;
      if (Math.abs(delta) > 44) {
        goTo(slideIndex + (delta < 0 ? 1 : -1));
      }
      dragging = false;
      dragStartX = null;
      startAutoplay();
    },
    { passive: true }
  );

  goTo(0);
  startAutoplay();

  /* ========================================================================
     3. REVEAL-ON-SCROLL (About, Services cards, Contact, etc.)
     ===================================================================== */
  const revealEls = document.querySelectorAll("[data-reveal]");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          entry.target.style.transitionDelay = `${(i % 4) * 70}ms`;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  revealEls.forEach((el) => io.observe(el));

  /* ========================================================================
     4. EXPERIENCE — Framer-style scroll-driven storytelling
     ------------------------------------------------------------------------
     No scroll hijacking, no wheel interception, no per-frame scroll math.
     The sticky positioning is pure CSS (see .exp__media). The only job of
     this script is to know which card is currently "active" and toggle a
     few classes — an IntersectionObserver does that cheaply, only firing
     when a card actually crosses the trigger line, never on every scroll
     tick. This keeps native scrolling (mouse wheel, trackpad, touch,
     scrollbar drag, keyboard Page/Arrow keys) completely intact.
     ===================================================================== */
  const expItems = [...document.querySelectorAll(".exp__item")];
  const expImgs = [...document.querySelectorAll(".exp__img")];
  const expHeads = [...document.querySelectorAll(".exp__head")];
  let expActive = 0;

  // Move every image to a position *relative* to the active index. This is
  // what produces the directional slide: an image with a higher index than
  // the active one sits parked below (is-below); a lower index sits parked
  // above (is-above). Crossing the active index therefore always slides
  // outgoing → up-and-away and incoming → up-into-place, in both scroll
  // directions, with zero extra logic.
  const setExpActive = (i) => {
    if (i === expActive) {
      return;
    }
    expActive = i;

    expItems.forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.index) === i);
    });

    expHeads.forEach((btn, idx) => {
      btn.setAttribute("aria-current", idx === i ? "true" : "false");
    });

    expImgs.forEach((el) => {
      const idx = Number(el.dataset.index);
      el.classList.remove("is-active", "is-above", "is-below");
      el.classList.add(idx === i ? "is-active" : idx < i ? "is-above" : "is-below");
    });
  };

  // A thin horizontal line through the vertical center of the viewport.
  // rootMargin "-50% 0px -50% 0px" collapses the observed area to that
  // line, so `isIntersecting` flips to true exactly when a card's box
  // crosses the center of the screen — a reliable, jank-free way to know
  // which card the user is currently reading, without measuring scroll
  // position by hand on every frame.
  const expObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setExpActive(Number(entry.target.dataset.index));
        }
      });
    },
    { threshold: 0, rootMargin: "-50% 0px -50% 0px" }
  );
  expItems.forEach((el) => expObserver.observe(el));

  // Click/tap a card's heading to jump straight to it. Native scrollIntoView
  // does the smooth scrolling for us (instant if the user prefers reduced
  // motion) and the observer above then confirms the new active state once
  // it settles — no manual scroll animation needed.
  expHeads.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      setExpActive(idx); // snappy visual feedback immediately on click
      expItems[idx].scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
    });
  });

  /* ========================================================================
     5. SERVICES — pinned card grows from small to full viewport
     ===================================================================== */
  const servicesShell = document.getElementById("servicesShell");
  const servicesSection = servicesShell.closest(".services");

  const servicesPinned = () =>
    window.innerWidth > 1024 && !prefersReducedMotion;

  const sizeServices = () => {
    if (servicesPinned()) {
      servicesSection.classList.remove("is-static");
    } else {
      servicesSection.classList.add("is-static");
      servicesShell.style.cssText = ""; // clear scroll-driven variables
    }
  };

  const updateServices = () => {
    if (!servicesPinned()) return;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const rect = servicesSection.getBoundingClientRect();
    const total = servicesSection.offsetHeight - vh;
    const p = clamp(-rect.top / total, 0, 1);

    // Phase 1 (0 → 0.6): the card grows bigger and bigger
    const grow = easeOut(clamp(p / 0.6, 0, 1));
    // Phase 2 (0.55 → 0.95): service cards fade in, intro drifts up
    const reveal = easeOut(clamp((p - 0.55) / 0.4, 0, 1));

    const w = lerp(Math.min(640, vw * 0.92), vw, grow);
    const h = lerp(vh * 0.68, vh, grow);
    const r = lerp(32, 0, grow);

    servicesShell.style.setProperty("--sw", `${w.toFixed(1)}px`);
    servicesShell.style.setProperty("--sh", `${h.toFixed(1)}px`);
    servicesShell.style.setProperty("--sr", `${r.toFixed(1)}px`);
    servicesShell.style.setProperty("--p2", reveal.toFixed(3));
  };

  /* ========================================================================
     6. CONTACT FORM — Web3Forms + validation
     ===================================================================== */
  const form = document.getElementById("contactForm");
  const submitBtn = document.getElementById("formSubmit");
  const successMsg = document.getElementById("formSuccess");
  const errorMsg = document.getElementById("formError");
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateField = (input) => {
    const wrap = input.closest(".form-field");
    let valid = input.value.trim().length > 0;
    if (valid && input.type === "email") valid = emailRe.test(input.value);
    wrap.classList.toggle("invalid", !valid);
    return valid;
  };

  form.querySelectorAll("input[required], textarea[required]").forEach((el) => {
    el.addEventListener("input", () => validateField(el));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    successMsg.classList.remove("show");
    errorMsg.classList.remove("show");

    const fields = [
      ...form.querySelectorAll("input[required], textarea[required]"),
    ];
    const allValid = fields.map(validateField).every(Boolean);
    if (!allValid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json();
      if (data.success) {
        successMsg.classList.add("show");
        form.reset();
      } else {
        errorMsg.classList.add("show");
      }
    } catch {
      errorMsg.classList.add("show");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });

  /* ========================================================================
     7. FOOTER — curtain reveal
     ===================================================================== */
  const footer = document.getElementById("siteFooter");
  const footerInner = document.getElementById("footerInner");
  const siteMain = document.getElementById("siteMain");

  const sizeFooter = () => {
    // Reserve space so the fixed footer is revealed as the page ends
    siteMain.style.marginBottom = `${footer.offsetHeight}px`;
  };

  const updateFooter = () => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    const remaining = scrollable - window.scrollY;
    const p = clamp(1 - remaining / footer.offsetHeight, 0, 1);
    if (prefersReducedMotion) {
      footerInner.style.opacity = 1;
      footerInner.style.transform = "none";
      return;
    }
    footerInner.style.opacity = easeOut(p).toFixed(3);
    footerInner.style.transform = `translateY(${((1 - easeOut(p)) * 12).toFixed(
      2
    )}%)`;
  };

  /* ========================================================================
     ABOUT — curtain reveal beneath the hero (same feel as the footer)
     ===================================================================== */
  const aboutCurtain = document.getElementById("aboutCurtain");
  const aboutGrid = document.getElementById("aboutGrid");
  const heroSection = document.getElementById("home");

  const aboutCurtainEnabled = () =>
    window.innerWidth > 1024 && !prefersReducedMotion;

  const sizeAboutCurtain = () => {
    if (aboutCurtainEnabled()) {
      aboutCurtain.classList.remove("is-static");
    } else {
      aboutCurtain.classList.add("is-static");
      aboutGrid.style.opacity = "";
      aboutGrid.style.transform = "";
    }
  };

  const updateAboutReveal = () => {
    if (!aboutCurtainEnabled()) return;
    const vh = window.innerHeight;
    // How far the hero curtain has lifted: 0 = fully covering, 1 = gone
    const heroBottom = heroSection.getBoundingClientRect().bottom;
    const p = easeOut(clamp(1 - heroBottom / vh, 0, 1));
    aboutGrid.style.opacity = p.toFixed(3);
    aboutGrid.style.transform = `translateY(${((1 - p) * 10).toFixed(2)}%)`;
  };

  /* ========================================================================
     Global scroll / resize loop (single rAF-throttled handler)
     ===================================================================== */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateNavBg();
      spy();
      updateAboutReveal();
      updateServices();
      updateFooter();
      ticking = false;
    });
  };

  const onResize = () => {
    sizeAboutCurtain();
    sizeServices();
    sizeFooter();
    onScroll();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("load", onResize);

  // Initial paint
  sizeAboutCurtain();
  sizeServices();
  sizeFooter();
  updateNavBg();
  spy();
  updateAboutReveal();
  updateServices();
  updateFooter();
})();