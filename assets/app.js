"use strict";

document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const header = document.querySelector("[data-header], .site-header");
// Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
const EN = /^en\b/i.test(document.documentElement.lang);
const T = (pt, en) => (EN ? en : pt);
const menuButton = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-nav");

// Menu do celular: a ação principal do cabeçalho e "Entrar" abrem a lista; idioma e tema
// fecham a lista (no celular eles saem do cabeçalho para caber o botão de criar conta).
// Montado aqui para valer em todas as páginas sem repetir HTML; classes próprias, para não
// duplicar os controles .theme-toggle e .lang-switch.
(function montarAcoesDoMenu() {
  if (!mobileMenu || mobileMenu.querySelector(".drawer-acoes")) return;
  const cta = document.querySelector(".site-header .header-cta");
  const login = document.querySelector(".site-header .header-login");
  const lang = document.querySelector(".site-header .lang-switch");
  const tema = document.querySelector(".site-header .theme-toggle");
  const link = (classe, href, texto) => {
    const a = document.createElement("a");
    a.className = classe;
    a.href = href;
    a.textContent = texto;
    return a;
  };
  const acoes = document.createElement("div");
  acoes.className = "drawer-acoes";
  if (cta) acoes.append(link("button button-primary drawer-cta", cta.getAttribute("href"), cta.textContent.trim()));
  if (login) acoes.append(link("button button-ghost drawer-login", login.getAttribute("href"), login.textContent.trim()));
  if (acoes.children.length) mobileMenu.prepend(acoes);
  const util = document.createElement("div");
  util.className = "drawer-util";
  if (lang) {
    const destinoIngles = (lang.getAttribute("hreflang") || "").startsWith("en");
    const a = link("drawer-lang", lang.getAttribute("href"), destinoIngles ? "English" : "Português");
    a.hreflang = lang.getAttribute("hreflang") || "";
    util.append(a);
  }
  if (tema) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "drawer-theme";
    b.textContent = T("Alternar tema claro/escuro", "Switch light/dark theme");
    b.addEventListener("click", () => tema.click());
    util.append(b);
  }
  if (util.children.length) mobileMenu.append(util);
})();

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
  if (!menuButton || !mobileMenu) return;
  if (menuIntervalId) {
    clearInterval(menuIntervalId);
    menuIntervalId = null;
  }
  const wasOpen = menuButton.getAttribute("aria-expanded") === "true" || !mobileMenu.hidden;
  contentBehindMenu().forEach((el) => {
    el.inert = false;
    el.removeAttribute("inert");
  });
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", T("Abrir menu", "Open menu"));
  mobileMenu.hidden = true;
  mobileMenu.classList.remove("is-open");
  header?.classList.remove("menu-active");
  document.body.classList.remove("menu-open");
  if (wasOpen && returnFocus) menuButton.focus();
}

function toggleMenu() {
  if (!menuButton || !mobileMenu) return;
  const open = menuButton.getAttribute("aria-expanded") === "true";
  if (open) {
    closeMenu(true);
    return;
  }

  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", T("Fechar menu", "Close menu"));
  mobileMenu.hidden = false;
  mobileMenu.classList.add("is-open");
  header?.classList.add("menu-active");
  document.body.classList.add("menu-open");
  contentBehindMenu().forEach((el) => {
    el.inert = true;
    el.setAttribute("inert", "");
  });
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
  if (event.key === "Escape") {
    closeMenu(true);
    return;
  }
  // Foco preso no menu aberto também em navegadores sem suporte a inert.
  if (event.key === "Tab" && mobileMenu && (!mobileMenu.hidden || mobileMenu.classList.contains("is-open"))) {
    const focusables = mobileMenu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!mobileMenu.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
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

// E-mail da conta Trustio aberta neste navegador (sessão do Supabase no localStorage), ou null.
// A liberação do plano pago acha a conta pelo e-mail do pagamento: pagar com outro e-mail
// deixava a compra sem dono.
function emailDaConta() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (!/^sb-[a-z0-9]+-auth-token$/.test(chave || "")) continue;
      const sessao = JSON.parse(localStorage.getItem(chave) || "null");
      const email = sessao?.user?.email || sessao?.currentSession?.user?.email;
      if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
    }
  } catch { /* sem localStorage ou sessão ilegível: segue sem e-mail */ }
  return null;
}
// Onde a página mostra "você vai pagar como <e-mail>" (planos.html): só com a conta aberta.
{
  const email = emailDaConta();
  document.querySelectorAll("[data-conta-email]").forEach((el) => {
    const alvo = el.querySelector("b");
    if (!email || !alvo) return;
    alvo.textContent = email;
    el.hidden = false;
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest?.('a[href^="https://buy.stripe.com/"]');
  if (!link) return;
  const ref = refGuardado();
  const email = emailDaConta();
  if (!ref && !email) return;
  const url = new URL(link.href);
  if (ref) {
    url.searchParams.set("client_reference_id", ref);
    url.searchParams.set("prefilled_promo_code", ref);
  }
  if (email) {
    // Planos pessoais: o e-mail fica travado no checkout (é ele que liga o pagamento à conta).
    // Planos de empresa: só vem preenchido, porque a empresa pode pagar com outro e-mail.
    const pessoal = Boolean(link.closest("#pessoal, [data-pagamento-pessoal]"));
    url.searchParams.delete(pessoal ? "prefilled_email" : "locked_prefilled_email");
    url.searchParams.set(pessoal ? "locked_prefilled_email" : "prefilled_email", email);
  }
  link.href = url.toString();
}, true);
