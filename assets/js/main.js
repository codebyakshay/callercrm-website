// Site behaviour. Each feature checks for its elements, so this one file is safe on every page.
// (The "js" class that enables reveal animations is set inline in <head> to avoid a flash.)

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Header: shadow once scrolled; mobile menu toggle.
function initHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = header.querySelector(".nav-toggle");
  if (!toggle) return;
  const setOpen = (open) => {
    header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(!header.classList.contains("nav-open")));
  header.querySelectorAll(".nav-menu a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
}

// Fade/slide elements in as they enter the viewport.
function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-visible");
      io.unobserve(e.target);
    }),
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
  );
  items.forEach((el) => io.observe(el));
}

// Feature cards: glow follows the cursor.
function initCardGlow() {
  document.querySelectorAll(".feature").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}

// Hero phone mockup: live call timer, cycling outcome, highlighted lead.
function initHeroDemo() {
  const timer = document.querySelector("[data-timer]");
  const outcome = document.querySelector("[data-outcome]");
  const leads = document.querySelectorAll(".lead");
  if (!timer) return;

  let seconds = 42;
  const pad = (n) => String(n).padStart(2, "0");
  setInterval(() => {
    seconds = seconds >= 179 ? 1 : seconds + 1;
    timer.textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  }, 1000);

  if (reduceMotion) return;
  const outcomes = ["Interested", "Callback", "Called", "Interested"];
  let i = 0;
  setInterval(() => {
    i = (i + 1) % outcomes.length;
    if (outcome) {
      outcome.classList.add("is-swapping");
      setTimeout(() => {
        outcome.textContent = outcomes[i];
        outcome.classList.remove("is-swapping");
      }, 300);
    }
    leads.forEach((el, idx) => el.classList.toggle("is-active", idx === i % leads.length));
  }, 3200);
}

// Product tour: hovering/focusing a numbered note highlights the matching pin on the mockup.
function initTour() {
  document.querySelectorAll("[data-spot]").forEach((spot) => {
    spot.querySelectorAll("[data-note]").forEach((note) => {
      const pin = spot.querySelector(`[data-pin="${note.dataset.note}"]`);
      if (!pin) return;
      const set = (on) => {
        note.classList.toggle("is-hot", on);
        pin.classList.toggle("is-hot", on);
      };
      note.addEventListener("mouseenter", () => set(true));
      note.addEventListener("mouseleave", () => set(false));
    });
  });
}

// Legal pages: highlight the table-of-contents entry for the section in view.
function initToc() {
  const links = document.querySelectorAll(".toc a[href^='#']");
  if (!links.length || !("IntersectionObserver" in window)) return;
  const byId = new Map([...links].map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.remove("is-active"));
      byId.get(e.target.id)?.classList.add("is-active");
    }),
    { rootMargin: "-20% 0px -70% 0px" },
  );
  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  });
}

function initYear() {
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
}

initHeader();
initReveal();
initCardGlow();
initHeroDemo();
initTour();
initToc();
initYear();
