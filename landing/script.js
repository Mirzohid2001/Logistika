const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".mobile-menu");
const productSection = document.querySelector(".product-showcase");
const productTabs = [...document.querySelectorAll(".product-tab")];
const screenDescriptions = [...document.querySelectorAll(".screen-description")];
const productScreens = [...document.querySelectorAll(".mock-screen")];
const cursorGlow = document.querySelector(".cursor-glow");
const heroVisual = document.querySelector(".hero-visual");

const setHeaderState = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 18);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

const closeMenu = () => {
  if (!menuButton || !navigation) return;

  menuButton.setAttribute("aria-expanded", "false");
  menuButton.querySelector(".sr-only").textContent = "Открыть меню";
  navigation.classList.remove("is-open");
  navigation.setAttribute("aria-hidden", "true");
  document.body.classList.remove("menu-open");
};

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.querySelector(".sr-only").textContent = isOpen ? "Открыть меню" : "Закрыть меню";
  navigation?.classList.toggle("is-open", !isOpen);
  navigation?.setAttribute("aria-hidden", String(isOpen));
  document.body.classList.toggle("menu-open", !isOpen);
});

navigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) closeMenu();
});

const screenOrder = productTabs.map((tab) => tab.dataset.screenTarget);
let selectedScreen = screenOrder[0];
let rotationTimer;

const selectProductScreen = (screenName, moveFocus = false) => {
  if (!screenOrder.includes(screenName)) return;

  selectedScreen = screenName;

  productTabs.forEach((tab) => {
    const isActive = tab.dataset.screenTarget === screenName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;

    if (isActive && moveFocus) tab.focus();
  });

  screenDescriptions.forEach((description) => {
    const isActive = description.dataset.screenCopy === screenName;
    description.classList.toggle("is-active", isActive);
    description.setAttribute("aria-hidden", String(!isActive));
  });

  productScreens.forEach((screen) => {
    const isActive = screen.dataset.screen === screenName;
    screen.classList.toggle("is-active", isActive);
    screen.setAttribute("aria-hidden", String(!isActive));
  });
};

const stopScreenRotation = () => window.clearInterval(rotationTimer);

const startScreenRotation = () => {
  stopScreenRotation();
  if (prefersReducedMotion.matches || screenOrder.length < 2) return;

  rotationTimer = window.setInterval(() => {
    const currentIndex = screenOrder.indexOf(selectedScreen);
    const nextScreen = screenOrder[(currentIndex + 1) % screenOrder.length];
    selectProductScreen(nextScreen);
  }, 6500);
};

productTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    selectProductScreen(tab.dataset.screenTarget);
    startScreenRotation();
  });

  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    let nextIndex = index;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % productTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + productTabs.length) % productTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = productTabs.length - 1;

    selectProductScreen(productTabs[nextIndex].dataset.screenTarget, true);
    startScreenRotation();
  });
});

productSection?.addEventListener("mouseenter", stopScreenRotation);
productSection?.addEventListener("mouseleave", startScreenRotation);
productSection?.addEventListener("focusin", stopScreenRotation);
productSection?.addEventListener("focusout", (event) => {
  if (!productSection.contains(event.relatedTarget)) startScreenRotation();
});
prefersReducedMotion.addEventListener("change", startScreenRotation);

selectProductScreen(selectedScreen);
startScreenRotation();

const revealItems = [...document.querySelectorAll(".reveal")];

if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -7%" },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

const counters = [...document.querySelectorAll("[data-count]")];

const animateCounter = (element) => {
  const target = Number(element.dataset.count);
  const suffix = element.dataset.suffix ?? "";

  if (!Number.isFinite(target)) return;

  if (prefersReducedMotion.matches) {
    element.textContent = `${target}${suffix}`;
    return;
  }

  const duration = 1250;
  const startTime = performance.now();

  const update = (currentTime) => {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * easedProgress);
    element.textContent = `${value}${suffix}`;

    if (progress < 1) requestAnimationFrame(update);
  };

  requestAnimationFrame(update);
};

if (!("IntersectionObserver" in window)) {
  counters.forEach(animateCounter);
} else {
  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        animateCounter(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.65 },
  );

  counters.forEach((counter) => counterObserver.observe(counter));
}

if (cursorGlow && window.matchMedia("(pointer: fine)").matches) {
  window.addEventListener(
    "pointermove",
    (event) => {
      cursorGlow.style.setProperty("--cursor-x", `${event.clientX}px`);
      cursorGlow.style.setProperty("--cursor-y", `${event.clientY}px`);
    },
    { passive: true },
  );
}

if (heroVisual && !prefersReducedMotion.matches && window.matchMedia("(pointer: fine)").matches) {
  heroVisual.addEventListener("pointermove", (event) => {
    const bounds = heroVisual.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;
    heroVisual.style.setProperty("--hero-rotate-x", `${relativeY * -2.5}deg`);
    heroVisual.style.setProperty("--hero-rotate-y", `${relativeX * 3.5}deg`);
  });

  heroVisual.addEventListener("pointerleave", () => {
    heroVisual.style.setProperty("--hero-rotate-x", "0deg");
    heroVisual.style.setProperty("--hero-rotate-y", "0deg");
  });
}

document.querySelectorAll("[data-year]").forEach((item) => {
  item.textContent = String(new Date().getFullYear());
});
