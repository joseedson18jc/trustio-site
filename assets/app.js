"use strict";

document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-nav");

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 20);
}

function closeMenu() {
  if (!menuButton || !mobileMenu || !header) return;
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Abrir menu");
  mobileMenu.hidden = true;
  header.classList.remove("menu-active");
  document.body.classList.remove("menu-open");
}

function toggleMenu() {
  if (!menuButton || !mobileMenu || !header) return;
  const open = menuButton.getAttribute("aria-expanded") === "true";
  if (open) {
    closeMenu();
    return;
  }

  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", "Fechar menu");
  mobileMenu.hidden = false;
  header.classList.add("menu-active");
  document.body.classList.add("menu-open");
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
menuButton?.addEventListener("click", toggleMenu);
mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
window.addEventListener("resize", () => {
  if (window.innerWidth > 1060) closeMenu();
});

const inPageLinks = Array.from(document.querySelectorAll('.desktop-nav a[href^="#"], .mobile-nav a[href^="#"]'));
const linkedSections = inPageLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter((section, index, sections) => section && sections.indexOf(section) === index);

function updateActiveNavigation() {
  if (!linkedSections.length) return;
  const marker = window.scrollY + Math.min(window.innerHeight * 0.38, 320);
  let activeId = "";
  linkedSections.forEach((section) => {
    if (section.offsetTop <= marker) activeId = section.id;
  });
  inPageLinks.forEach((link) => {
    const isActive = Boolean(activeId) && link.getAttribute("href") === `#${activeId}`;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

updateActiveNavigation();
window.addEventListener("scroll", updateActiveNavigation, { passive: true });
window.addEventListener("resize", updateActiveNavigation);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.1 });

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const year = String(new Date().getFullYear());
document.querySelectorAll("[data-year]").forEach((item) => {
  item.textContent = year;
});

let pointerTicking = false;
window.addEventListener("pointermove", (event) => {
  if (pointerTicking || reducedMotion.matches) return;
  pointerTicking = true;
  window.requestAnimationFrame(() => {
    document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`);
    document.documentElement.style.setProperty("--hero-shift-x", `${((event.clientX / window.innerWidth) - 0.5) * -14}px`);
    document.documentElement.style.setProperty("--hero-shift-y", `${((event.clientY / window.innerHeight) - 0.5) * -10}px`);
    pointerTicking = false;
  });
}, { passive: true });

const progressBar = document.querySelector("[data-reading-progress]");
function updateReadingProgress() {
  if (!progressBar) return;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
  progressBar.style.transform = `scaleX(${ratio})`;
}

if (progressBar) {
  updateReadingProgress();
  window.addEventListener("scroll", updateReadingProgress, { passive: true });
  window.addEventListener("resize", updateReadingProgress);
}

class TrustioDotField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.parent = canvas.parentElement;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.animationFrame = 0;
    this.startTime = performance.now();
    this.pointer = { x: 0, y: 0, active: false, lastMove: 0 };
    this.isManifesto = document.body.classList.contains("manifesto-page") || Boolean(canvas.closest(".hero-field"));
    this.visible = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.parent);
    this.bindEvents();
    this.resize();
    this.draw(this.startTime);
  }

  bindEvents() {
    this.parent.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.pointer.active = true;
      this.pointer.lastMove = performance.now();
    }, { passive: true });

    this.parent.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });

    document.addEventListener("visibilitychange", () => {
      this.visible = !document.hidden;
      if (this.visible && !this.animationFrame && !reducedMotion.matches) {
        this.animationFrame = window.requestAnimationFrame((time) => this.draw(time));
      }
    });
  }

  resize() {
    const rect = this.parent.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(time) {
    this.animationFrame = 0;
    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    if (!ctx || width <= 1 || height <= 1) return;

    ctx.clearRect(0, 0, width, height);
    const step = this.isManifesto ? Math.max(30, width / 45) : Math.max(24, width / 22);
    const elapsed = time - this.startTime;
    const recentlyMoved = time - this.pointer.lastMove < 1400;
    const pointerActive = this.pointer.active && recentlyMoved;
    const sourceX = pointerActive
      ? this.pointer.x
      : width * (0.52 + Math.sin(elapsed * 0.00022) * 0.28);
    const sourceY = pointerActive
      ? this.pointer.y
      : height * (0.48 + Math.cos(elapsed * 0.00031) * 0.12);
    const cycle = 4000;
    const waveWidth = this.isManifesto ? 170 : 115;
    const maxDistance = Math.hypot(width, height);
    const waveRadius = reducedMotion.matches ? maxDistance * 0.34 : ((elapsed * 0.13) % (maxDistance + waveWidth));

    for (let y = step * 0.5; y < height; y += step) {
      for (let x = step * 0.5; x < width; x += step) {
        const distance = Math.hypot(x - sourceX, y - sourceY);
        const waveDistance = Math.abs(distance - waveRadius);
        const wave = Math.max(0, 1 - waveDistance / waveWidth);
        const shimmer = reducedMotion.matches
          ? 0
          : Math.max(0, Math.sin((elapsed + x * 12 + y * 8) / cycle * Math.PI * 2) - 0.74) * 0.16;
        const alpha = (this.isManifesto ? 0.13 : 0.2) + wave * 0.72 + shimmer;
        const radius = (this.isManifesto ? 1.15 : 1.35) + wave * 1.7;

        ctx.beginPath();
        ctx.fillStyle = wave > 0.28
          ? `rgba(94, 167, 255, ${Math.min(0.92, alpha)})`
          : `rgba(76, 91, 115, ${Math.min(0.42, alpha)})`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (wave > 0.72) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(94, 167, 255, ${(wave - 0.72) * 0.16})`;
          ctx.arc(x, y, radius * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (!reducedMotion.matches && this.visible) {
      this.animationFrame = window.requestAnimationFrame((nextTime) => this.draw(nextTime));
    }
  }
}

document.querySelectorAll("#network-canvas").forEach((canvas) => {
  if (canvas instanceof HTMLCanvasElement) new TrustioDotField(canvas);
});

reducedMotion.addEventListener?.("change", () => window.location.reload());
