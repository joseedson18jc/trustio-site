"use strict";

document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const header = document.querySelector("[data-header]");
// Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
const EN = /^en\b/i.test(document.documentElement.lang);
const T = (pt, en) => (EN ? en : pt);
const menuButton = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-nav");

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 20);
}

// Com o menu aberto, o resto da página fica inerte (o Tab não cai no conteúdo coberto).
const contentBehindMenu = () => document.querySelectorAll("main, footer");

let menuIntervalId = null;
function checkMenuDesktop() {
  if (window.innerWidth >= 1024) {
    closeMenu();
  }
}

function closeMenu(returnFocus = false) {
  if (!menuButton || !mobileMenu || !header) return;
  if (menuIntervalId) {
    clearInterval(menuIntervalId);
    menuIntervalId = null;
  }
  const wasOpen = menuButton.getAttribute("aria-expanded") === "true";
  contentBehindMenu().forEach((el) => {
    el.inert = false;
    el.removeAttribute("inert");
  });
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", T("Abrir menu", "Open menu"));
  mobileMenu.hidden = true;
  header.classList.remove("menu-active");
  document.body.classList.remove("menu-open");
  if (wasOpen && returnFocus) menuButton.focus();
}

function toggleMenu() {
  if (!menuButton || !mobileMenu || !header) return;
  const open = menuButton.getAttribute("aria-expanded") === "true";
  if (open) {
    closeMenu(true);
    return;
  }

  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", T("Fechar menu", "Close menu"));
  mobileMenu.hidden = false;
  header.classList.add("menu-active");
  document.body.classList.add("menu-open");
  contentBehindMenu().forEach((el) => { el.inert = true; });
  mobileMenu.querySelector("a, button")?.focus();
  if (!menuIntervalId) {
    menuIntervalId = setInterval(checkMenuDesktop, 40);
  }
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
menuButton?.addEventListener("click", toggleMenu);
mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu()));
window.addEventListener("resize", () => {
  if (window.innerWidth >= 1024) closeMenu();
});
window.visualViewport?.addEventListener("resize", () => {
  if (window.innerWidth >= 1024) closeMenu();
});
document.addEventListener("focusin", () => {
  if (window.innerWidth >= 1024 && menuButton?.getAttribute("aria-expanded") === "true") {
    closeMenu();
  }
});
const desktopQuery = window.matchMedia("(min-width: 1024px)");
desktopQuery.addEventListener("change", (e) => {
  if (e.matches) closeMenu();
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
  if (event.key === "Escape") closeMenu(true);
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

// Tabelas mais largas que a tela: a classe liga o esmaecido da borda direita enquanto
// ainda houver coluna escondida, e sai quando a rolagem chega ao fim.
document.querySelectorAll(".tablewrap, .vc-wrap").forEach((wrap) => {
  const update = () => wrap.classList.toggle("tem-mais", wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2);
  wrap.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(wrap);
});

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
    // Energia do campo: o scroll "carrega" os LEDs (0..1) e decai sozinho.
    // No celular, sem ponteiro, é o scroll que acende o fundo.
    this.energy = 0;
    this.lastScrollY = window.scrollY || 0;
    this.isManifesto = document.body.classList.contains("manifesto-page") || Boolean(canvas.closest(".hero-field"));
    this.tabVisible = !document.hidden;
    this.inViewport = true;
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
      this.wake();
    }, { passive: true });

    this.parent.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });

    // Scroll vira energia: cada pixel rolado carrega o campo (teto 1), e o
    // decaimento no draw devolve o fade. Rolar rápido = LEDs bem mais vivos.
    window.addEventListener("scroll", () => {
      const y = window.scrollY || 0;
      const delta = Math.abs(y - this.lastScrollY);
      this.lastScrollY = y;
      if (delta > 0) {
        this.energy = Math.min(1, this.energy + delta / 520);
        this.wake();
      }
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      this.tabVisible = !document.hidden;
      this.syncVisibility();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          this.inViewport = entry.isIntersecting;
          this.syncVisibility();
        });
      }, { threshold: 0.02 }).observe(this.parent);
    }

    window.addEventListener("resize", () => this.resize(), { passive: true });
  }

  // Um evento novo (mouse/scroll) religa o loop mesmo que ele estivesse parado.
  wake() {
    if (this.visible && !this.animationFrame && !reducedMotion.matches) {
      this.animationFrame = window.requestAnimationFrame((time) => this.draw(time));
    }
  }

  // Draw only while the tab is active AND the hero is on screen — saves a full-canvas repaint per frame otherwise.
  syncVisibility() {
    this.visible = this.tabVisible && this.inViewport;
    if (this.visible && !this.animationFrame && !reducedMotion.matches) {
      this.animationFrame = window.requestAnimationFrame((time) => this.draw(time));
    }
  }

  resize() {
    const rect = this.parent.getBoundingClientRect();
    const availableWidth = Math.min(rect.width, window.innerWidth);
    this.width = Math.max(1, Math.round(availableWidth));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = "100%";
    this.canvas.style.maxWidth = "100%";
    this.canvas.style.height = "100%";
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(time) {
    this.animationFrame = 0;
    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    if (!ctx || width <= 1 || height <= 1) return;

    // A energia decai ~5% por frame: o brilho do scroll esvai em ~1s.
    this.energy *= 0.95;
    const energy = reducedMotion.matches ? 0 : this.energy;

    ctx.clearRect(0, 0, width, height);
    // Grade mais densa (LED de painel de verdade) e blend aditivo: pontos
    // somados sobre o fundo escuro geram o brilho "neon" moderno.
    const step = this.isManifesto ? Math.max(26, width / 38) : Math.max(22, width / 34);
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
    const waveWidth = this.isManifesto ? 190 : 150;
    const maxDistance = Math.hypot(width, height);
    // O scroll acelera a onda: campo carregado atravessa a tela mais rápido.
    const waveSpeed = 0.13 * (1 + energy * 2.4);
    const waveRadius = reducedMotion.matches ? maxDistance * 0.34 : ((elapsed * waveSpeed) % (maxDistance + waveWidth));
    // Halo persistente ao redor do cursor — LED acende onde o mouse está.
    const haloR = pointerActive ? 230 : 0;
    const near = [];

    ctx.globalCompositeOperation = "lighter";
    for (let y = step * 0.5; y < height; y += step) {
      for (let x = step * 0.5; x < width; x += step) {
        const distance = Math.hypot(x - sourceX, y - sourceY);
        const waveDistance = Math.abs(distance - waveRadius);
        const wave = Math.max(0, 1 - waveDistance / waveWidth);
        const halo = haloR > 0 ? Math.max(0, 1 - Math.hypot(x - this.pointer.x, y - this.pointer.y) / haloR) : 0;
        const shimmer = reducedMotion.matches
          ? 0
          : Math.max(0, Math.sin((elapsed + x * 12 + y * 8) / cycle * Math.PI * 2) - 0.74) * 0.16;
        // base + onda + energia do scroll + halo do cursor + cintilação
        const alpha = Math.min(0.95,
          (this.isManifesto ? 0.14 : 0.22)
          + wave * (0.66 + energy * 0.3)
          + energy * 0.28
          + halo * 0.62
          + shimmer);
        const radius = (this.isManifesto ? 1.1 : 1.25)
          + wave * (1.6 + energy * 0.9)
          + energy * 0.7
          + halo * 1.35;

        // núcleo: azul-sinal com toque de branco quando muito aceso
        const hot = Math.max(wave, halo, energy);
        ctx.beginPath();
        ctx.fillStyle = hot > 0.25
          ? `rgba(${Math.round(94 + hot * 120)}, ${Math.round(167 + hot * 70)}, 255, ${alpha})`
          : `rgba(96, 118, 152, ${Math.min(0.5, alpha)})`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // halo difuso dos LEDs mais acesos (onda no pico, cursor ou scroll)
        if (hot > 0.5) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(94, 167, 255, ${(hot - 0.5) * (0.2 + energy * 0.14)})`;
          ctx.arc(x, y, radius * 4.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // coleciona os acesos perto do cursor para as linhas de constelação
        if (halo > 0.45) near.push({ x, y, b: halo });
      }
    }

    // Constelação: liga os LEDs acesos ao redor do cursor (poucos pontos,
    // custo desprezível) — dá o toque "tech vivo" sem virar árvore de Natal.
    if (near.length > 1 && !reducedMotion.matches) {
      for (let i = 0; i < near.length; i += 1) {
        for (let j = i + 1; j < near.length; j += 1) {
          const d = Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y);
          if (d < step * 2.05) {
            const la = Math.min(0.4, (near[i].b + near[j].b) * 0.22 * (1 - d / (step * 2.05)));
            if (la <= 0.02) continue;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(94, 167, 255, ${la})`;
            ctx.lineWidth = 0.7;
            ctx.moveTo(near[i].x, near[i].y);
            ctx.lineTo(near[j].x, near[j].y);
            ctx.stroke();
          }
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    if (!reducedMotion.matches && this.visible) {
      this.animationFrame = window.requestAnimationFrame((nextTime) => this.draw(nextTime));
    }
  }
}

document.querySelectorAll("#network-canvas").forEach((canvas) => {
  if (canvas instanceof HTMLCanvasElement) new TrustioDotField(canvas);
});

reducedMotion.addEventListener?.("change", () => window.location.reload());

const serverPanel = document.getElementById("server-panel");
if (serverPanel) {
  const rows = 10;
  const cols = 14;
  const unitDelay = 0.1;
  const source = { x: 24, y: 4.5 };
  serverPanel.querySelectorAll("[data-server-grid]").forEach((grid) => {
    const side = grid.dataset.serverGrid;
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const unifiedX = side === "left" ? col : cols + col;
        const distance = Math.hypot(unifiedX - source.x, row - source.y);
        const led = document.createElement("span");
        led.className = "server-led";
        led.style.animationDelay = `${(distance * unitDelay).toFixed(2)}s`;
        fragment.appendChild(led);
      }
    }
    grid.appendChild(fragment);
  });

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => serverPanel.classList.toggle("is-live", entry.isIntersecting));
    }, { threshold: 0.15 }).observe(serverPanel);
  } else if (!reducedMotion.matches) {
    serverPanel.classList.add("is-live");
  }
}

// Contact card: copy the e-mail address without depending on a configured mail client.
document.querySelectorAll(".copy-email[data-copy]").forEach((button) => {
  const row = button.closest(".contact-email-row");
  const status = row?.querySelector("[data-copy-status]");
  const address = row?.querySelector(".contact-email");
  const idleLabel = T("Copiar endereço de e-mail", "Copy e-mail address");
  let resetTimer = 0;

  function setState(state, label, announcement) {
    button.classList.remove("is-copied", "is-failed");
    if (state) button.classList.add(state);
    button.setAttribute("aria-label", label);
    if (status) status.textContent = announcement;
  }

  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      const scratch = document.createElement("textarea");
      scratch.value = value;
      scratch.setAttribute("readonly", "");
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      try { copied = document.execCommand("copy"); } catch { copied = false; }
      scratch.remove();
    }

    window.clearTimeout(resetTimer);
    if (copied) {
      setState("is-copied", T("E-mail copiado", "E-mail copied"), T("Endereço de e-mail copiado.", "E-mail address copied."));
    } else {
      // Nothing we can write to the clipboard: say so, and leave the address selected so a manual copy works.
      setState("is-failed", T("Não foi possível copiar. Selecione o endereço ao lado.", "Couldn't copy. Select the address next to it."), T("Não foi possível copiar automaticamente. O endereço foi selecionado para você copiar.", "Couldn't copy automatically. The address has been selected for you to copy."));
      if (address && window.getSelection) {
        const range = document.createRange();
        range.selectNodeContents(address);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    resetTimer = window.setTimeout(() => setState("", idleLabel, ""), copied ? 2200 : 4000);
  });
});

/* ---------- Tema claro/escuro ---------- */
const THEME_KEY = "trustio-theme";
const THEME_COLORS = { dark: "#05070b", light: "#f4f6fa" };
const themeToggle = document.querySelector(".theme-toggle");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme, persist) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  if (themeColorMeta) themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  if (themeToggle) {
    const isLight = theme === "light";
    themeToggle.setAttribute("aria-pressed", String(isLight));
    themeToggle.setAttribute("aria-label", isLight ? T("Ativar tema escuro", "Switch to dark theme") : T("Ativar tema claro", "Switch to light theme"));
  }
  if (persist) {
    // Escolha pelo botão: vale até a próxima troca de horário (assets/theme.js).
    if (window.TrustioTema) window.TrustioTema.escolher(theme);
    else try { localStorage.setItem(THEME_KEY, theme); } catch (error) { /* sem persistência */ }
  }
}

applyTheme(currentTheme(), false);
themeToggle?.addEventListener("click", () => applyTheme(currentTheme() === "light" ? "dark" : "light", true));
// Troca automática de horário (05:00 claro, 19:01 escuro) com a página aberta.
document.addEventListener("trustio:tema", (e) => applyTheme(e.detail, false));

// Indicação de afiliado: trustio.com.br/?ref=LUISC10 guarda o cupom por 90 dias (cookie de
// primeira parte; último clique vence). No clique para pagar, o link da Stripe ganha
// client_reference_id (atribui a venda no webhook) e prefilled_promo_code (o cupom já vem
// preenchido no checkout, com os 10% de desconto).
const REF_DIAS = 90;
const REF_VALIDO = /^[A-Z]{2,12}\d{2,4}$/;
try {
  const ref = (new URLSearchParams(location.search).get("ref") || "").toUpperCase();
  if (REF_VALIDO.test(ref)) {
    document.cookie = `trustio_ref=${ref}; Max-Age=${REF_DIAS * 24 * 60 * 60}; Path=/; SameSite=Lax; Secure`;
  }
} catch { /* sem cookie, sem atribuição: o site segue normal */ }

function refGuardado() {
  const m = document.cookie.match(/(?:^|;\s*)trustio_ref=([A-Z0-9]+)/);
  return m && REF_VALIDO.test(m[1]) ? m[1] : null;
}

document.addEventListener("click", (event) => {
  const link = event.target.closest?.('a[href^="https://buy.stripe.com/"]');
  const ref = link && refGuardado();
  if (!ref) return;
  const url = new URL(link.href);
  url.searchParams.set("client_reference_id", ref);
  url.searchParams.set("prefilled_promo_code", ref);
  link.href = url.toString();
}, true);
