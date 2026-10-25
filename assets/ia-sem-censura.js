// Página "IA sem censura, explicada" (ia-sem-censura.html).
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Executa cb(true/false) quando o elemento entra/sai da tela. */
  function watch(el, cb, threshold) {
    if (!("IntersectionObserver" in window)) { cb(true); return; }
    new IntersectionObserver(function (es) { cb(es[0].isIntersecting); }, { threshold: threshold || 0.2 }).observe(el);
  }

  /* ---------- Tema ---------- */
  var themeBtn = $("#theme");
  function syncThemeLabel() {
    themeBtn.setAttribute("aria-label", root.dataset.theme === "light" ? "Mudar para o tema escuro" : "Mudar para o tema claro");
  }
  syncThemeLabel();
  themeBtn.addEventListener("click", function () {
    var n = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = n;
    if (window.TrustioTema) window.TrustioTema.escolher(n); else try { localStorage.setItem("trustio-theme", n); } catch (e) {}
    syncThemeLabel();
    if (field) field.recolor();
  });
  // Troca automática de horário com a página aberta (assets/theme.js).
  document.addEventListener("trustio:tema", function () { syncThemeLabel(); if (field) field.recolor(); });

  /* ---------- Header e progresso ---------- */
  var hdr = $("#hdr"), bar = $("#progress");
  function onScroll() {
    var h = document.documentElement;
    var p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    hdr.classList.toggle("scrolled", h.scrollTop > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var menuT = $("#menu-t"), mnav = $("#mnav");
  function setMenu(open) {
    menuT.setAttribute("aria-expanded", String(open));
    menuT.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    mnav.hidden = !open;
  }
  menuT.addEventListener("click", function () { setMenu(mnav.hidden); });
  $$("a", hdr).forEach(function (a) { a.addEventListener("click", function () { if (!mnav.hidden) setMenu(false); }); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !mnav.hidden) { setMenu(false); menuT.focus(); }
  });
  var subBox = $(".sub-links");
  var navLinks = $$(".sub-links a");
  navLinks.forEach(function (a) {
    var sec = document.querySelector(a.getAttribute("href"));
    if (!sec || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      navLinks.forEach(function (x) { x.classList.toggle("on", x === a); });
      var l = a.offsetLeft - 12;
      if (l < subBox.scrollLeft || a.offsetLeft + a.offsetWidth > subBox.scrollLeft + subBox.clientWidth - 28) subBox.scrollTo({ left: l, behavior: "smooth" });
    }, { rootMargin: "-45% 0px -50% 0px" }).observe(sec);
  });

  /* ---------- Reveal ---------- */
  if ("IntersectionObserver" in window) {
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    $$(".rv").forEach(function (el) { ro.observe(el); });
  } else {
    $$(".rv").forEach(function (el) { el.classList.add("in"); });
  }
  // Avisa o ia-sem-censura-tema.js que as seções escondidas por ".js .rv" já têm quem as revele.
  document.documentElement.classList.add("js-pronto");

  /* ---------- Hero: campo de pontos ---------- */
  var field = (function () {
    var c = $("#field"); if (!c || !c.getContext) return null;
    var hero = $(".hero"), ctx = c.getContext("2d");
    var w = 0, h = 0, dots = [], rgb = "94,167,255", mouse = { x: -9999, y: -9999 }, raf = 0, visible = true, t0 = performance.now();
    var GAP = 30;
    function recolor() { rgb = getComputedStyle(root).getPropertyValue("--dot-rgb").trim() || rgb; if (reduce) draw(t0); }
    function size() {
      var r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height; c.width = Math.round(w * d); c.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      dots = [];
      for (var y = GAP / 2; y < h; y += GAP) for (var x = GAP / 2; x < w; x += GAP) dots.push(x, y);
      if (reduce) draw(t0);
    }
    function draw(now) {
      var t = (now - t0) / 1000, cx = w / 2, cy = h * 0.4;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < dots.length; i += 2) {
        var x = dots[i], y = dots[i + 1];
        var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        var a = 0.1 + (reduce ? 0.05 : 0.14 * Math.max(0, Math.sin(d / 70 - t * 1.3)));
        var r = 1.1;
        var mx = x - mouse.x, my = y - mouse.y, md = Math.sqrt(mx * mx + my * my);
        if (md < 170) { var k = 1 - md / 170; a += k * 0.65; r += k * 1.7; }
        ctx.fillStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      }
    }
    function loop(now) { draw(now); if (visible && !reduce) raf = requestAnimationFrame(loop); }
    function start() { cancelAnimationFrame(raf); if (reduce) draw(t0); else raf = requestAnimationFrame(loop); }
    hero.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; if (reduce) draw(t0); });
    hero.addEventListener("pointerleave", function () { mouse.x = mouse.y = -9999; if (reduce) draw(t0); });
    window.addEventListener("resize", size);
    watch(hero, function (v) { visible = v; if (v) start(); else cancelAnimationFrame(raf); }, 0);
    document.addEventListener("visibilitychange", function () { if (document.hidden) cancelAnimationFrame(raf); else if (visible) start(); });
    rgb = getComputedStyle(root).getPropertyValue("--dot-rgb").trim() || rgb;
    size(); start();
    return { recolor: recolor };
  })();

  /* ---------- 01 · Pipeline de filtros ---------- */
  (function () {
    var box = $("#pipe"); if (!box) return;
    var packet = $(".packet", box), q = $(".pn.q", box), out = $(".pn.out", box), gates = $$(".gate", box);
    var btns = $$("[data-set]", box), cap = $("#pipe-cap");
    var mode = "generic", auto = !reduce, visible = false, timer = 0, anim = null;
    var CAP = {
      generic: "<b>Com filtro do fornecedor (exemplo ilustrativo):</b> a pergunta é legítima, mas uma das camadas de filtro pode disparar antes de chegar ao modelo. Aí a resposta vira uma recusa genérica.",
      trustio: "<b>Trustio:</b> as camadas de filtro do fornecedor saem. A pergunta chega ao modelo e volta com resposta completa. A lei continua em volta."
    };
    function mid(el) { return el.offsetTop + el.offsetHeight / 2; }
    function clear() {
      clearTimeout(timer);
      if (anim) { anim.cancel(); anim = null; }
      gates.forEach(function (g) { g.classList.remove("hit"); });
      out.classList.remove("show");
    }
    function setMode(m, user) {
      mode = m; box.dataset.mode = m;
      btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.set === m)); });
      cap.innerHTML = CAP[m];
      if (user) auto = false;
      cycle();
    }
    function cycle() {
      clear();
      var blocked = mode === "generic" ? gates[Math.floor(Math.random() * gates.length)] : null;
      if (reduce || !visible || !packet.animate) {
        if (blocked) blocked.classList.add("hit");
        out.classList.add("show");
        return;
      }
      var y0 = mid(q), y1 = blocked ? mid(blocked) : mid(out);
      anim = packet.animate([
        { transform: "translateY(" + y0 + "px)", opacity: 0 },
        { transform: "translateY(" + y0 + "px)", opacity: 1, offset: 0.08 },
        { transform: "translateY(" + y1 + "px)", opacity: 1 }
      ], { duration: blocked ? 1300 : 2000, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" });
      anim.onfinish = function () {
        if (blocked) blocked.classList.add("hit");
        out.classList.add("show");
        timer = setTimeout(function () {
          if (anim) anim.cancel();
          if (auto) setMode(mode === "generic" ? "trustio" : "generic"); else cycle();
        }, 2600);
      };
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.set, true); }); });
    ["pointerenter", "focusin", "touchstart"].forEach(function (ev) { box.addEventListener(ev, function () { auto = false; }, { passive: true }); });
    cap.innerHTML = CAP.generic;
    watch(box, function (v) { visible = v; if (v) cycle(); else clear(); }, 0.35);
  })();

  /* ---------- 02 · Na prática ---------- */
  // Só a pergunta e o que conferir na resposta. Sem resposta inventada e sem comparação com outra IA
  // (checklist da campanha, itens 5, 7 e 12): a resposta de verdade a pessoa vê no chat.
  (function () {
    var ICONS = {
      direito: '<path d="M12 3v18M6 21h12M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
      seg: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
      ficcao: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
      opiniao: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/>'
    };
    var cases = [
      { id: "direito", label: "Direito", av: "AD", who: "Advogado · defesa criminal",
        q: "Quais indícios a acusação costuma usar para caracterizar lavagem de dinheiro via empresa de fachada?",
        t: "<ol><li>Se a resposta separa <b>indício</b> de <b>prova</b>.</li><li>Se cita a <b>Lei 9.613/98</b> e o que ela exige sobre o dolo.</li><li>Se o artigo citado bate com a lei seca.</li></ol><p>Para estudo e conferência: o caso concreto se confere com quem atua nele. A decisão é sua.</p>",
        tt: ["estudo e conferência", "confira a lei seca"] },
      { id: "seg", label: "Segurança", av: "TI", who: "Gestor · time financeiro",
        q: "Quero treinar minha equipe. Como costuma funcionar o golpe do boleto falso?",
        t: "<ol><li>Se a resposta explica o golpe pelo lado de quem se defende.</li><li>Se traz um checklist que a equipe consegue seguir.</li><li>Se diz como confirmar um pagamento antes de liberar.</li></ol><p>Segurança aqui é defesa: entender o golpe para fechar a brecha.</p>",
        tt: ["defesa", "checklist", "processo"] },
      { id: "ficcao", label: "Ficção", av: "ES", who: "Escritora · romance policial",
        q: "Escreva a cena em que o detetive encontra a vítima. Sem suavizar, é para um romance policial.",
        t: "<ol><li>Se o tom pedido foi respeitado, sem versão suavizada.</li><li>Se a cena serve à história.</li></ol><p>Conflito, violência e tema pesado quando a história pede. O texto final é seu.</p>",
        tt: ["tom pedido", "cena completa"] },
      { id: "opiniao", label: "Opinião direta", av: "JC", who: "Inquilino · contrato",
        q: "Esse contrato de aluguel cobra multa de 6 aluguéis em qualquer rescisão. Isso é abusivo? Seja direto.",
        t: "<ol><li>Se a resposta dá uma opinião direta, e não só “procure um advogado”.</li><li>Se cita o artigo da Lei do Inquilinato que trata da multa.</li><li>Se o artigo citado bate com a lei seca.</li></ol><p>Para estudo e conferência: o caso concreto se confere com o seu advogado. A decisão é sua.</p>",
        tt: ["opinião direta", "artigo de lei", "confira"] }
    ];
    var tabs = $("#tabs"), panel = $("#cmp-panel"), aT = $("#a-t"), fT = $("#f-t");
    var pQ = $("#p-q"), pWho = $("#p-who"), pAv = $("#p-av");
    if (!tabs || !panel) return;
    var current = 0;
    cases.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tab"; b.id = "tab-" + c.id;
      b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "cmp-panel");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false"); b.tabIndex = i === 0 ? 0 : -1;
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[c.id] + "</svg>" + c.label;
      b.addEventListener("click", function () { select(i); });
      tabs.appendChild(b);
    });
    var tabBtns = $$(".tab", tabs);
    tabs.addEventListener("keydown", function (ev) {
      var n = tabBtns.length;
      var map = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: n - 1 };
      if (!(ev.key in map)) return;
      ev.preventDefault();
      var i = (map[ev.key] + n) % n;
      select(i); tabBtns[i].focus();
    });
    function select(i) {
      var c = cases[i]; current = i;
      tabBtns.forEach(function (b, k) { b.setAttribute("aria-selected", String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      panel.setAttribute("aria-labelledby", tabBtns[i].id);
      pQ.textContent = c.q; pWho.textContent = c.who; pAv.textContent = c.av;
      aT.innerHTML = c.t;
      fT.innerHTML = c.tt.map(function (t) { return '<span class="mini">' + t + "</span>"; }).join("");
    }
    select(0);
  })();

  /* ---------- 03 · Fluxograma com passos ---------- */
  (function () {
    var card = $("#flowcard"); if (!card) return;
    var steps = [
      { on: ["you"], t: "Você pergunta", p: "No chat do trustio.com.br. Para usar o chat bastam nome, e-mail e senha." },
      { on: ["you", "https"], t: "A pergunta viaja protegida", p: "Sai do seu navegador por conexão HTTPS até o ambiente da Trustio." },
      { on: ["perim", "env"], t: "Entra no perímetro, no Brasil", p: "Ambiente privado, hospedado no Brasil. Os modelos rodam em ambiente privado e local, na infraestrutura da Trustio." },
      { on: ["perim", "env", "nofilter", "model"], t: "Um modelo aberto responde", p: "Um dos modelos abertos que a Trustio roda para empresas, sem o filtro de conteúdo imposto pelo fornecedor." },
      { on: ["perim", "model", "back", "answer"], t: "A resposta volta completa", p: "Com contexto, riscos e próximos passos, em vez de um “não posso ajudar com isso”." },
      { on: ["perim", "model", "save", "store", "train", "bigtech"], t: "Fica na sua conta. Não vira treino.", p: "Histórico e arquivos guardados no Brasil. A Trustio não usa suas conversas para treinar modelos. Voz e busca na web saem do país: veja a nota abaixo." }
    ];
    var els = $$("[data-k]", card), dots = $("#st-dots"), txt = $("#st-text");
    var tN = $("#st-n"), tT = $("#st-t"), tP = $("#st-p"), play = $("#st-play");
    var i = 0, playing = !reduce, visible = false, timer = 0;
    steps.forEach(function (s, k) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = String(k + 1); b.setAttribute("aria-label", "Passo " + (k + 1) + ": " + s.t);
      b.addEventListener("click", function () { user(); go(k); });
      dots.appendChild(b);
    });
    var dotBtns = $$("button", dots);
    function paint() {
      var s = steps[i];
      els.forEach(function (el) { el.classList.toggle("on", s.on.indexOf(el.dataset.k) > -1); });
      dotBtns.forEach(function (b, k) { if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
      tN.textContent = "Passo " + (i + 1) + " de " + steps.length; tT.textContent = s.t; tP.textContent = s.p;
    }
    function schedule() { clearTimeout(timer); if (playing && visible) timer = setTimeout(function () { go((i + 1) % steps.length); schedule(); }, 3200); }
    function go(k) { i = k; paint(); }
    function setPlaying(p) {
      playing = p;
      play.classList.toggle("is-paused", !p);
      play.setAttribute("aria-label", p ? "Pausar" : "Reproduzir");
      txt.setAttribute("aria-live", p ? "off" : "polite");
      schedule();
    }
    function user() { setPlaying(false); }
    $("#st-prev").addEventListener("click", function () { user(); go((i - 1 + steps.length) % steps.length); });
    $("#st-next").addEventListener("click", function () { user(); go((i + 1) % steps.length); });
    play.addEventListener("click", function () { setPlaying(!playing); });
    paint(); setPlaying(playing);
    watch(card, function (v) { visible = v; schedule(); }, 0.3);
  })();

  /* ---------- Faixa Brasil: estrelas ---------- */
  (function () {
    var s = $("#stars"); if (!s) return;
    var frag = document.createDocumentFragment();
    for (var k = 0; k < 110; k++) {
      var z = Math.random() < 0.15 ? 3 : 2, i = document.createElement("i");
      i.style.cssText = "left:" + (Math.random() * 100).toFixed(2) + "%;top:" + (Math.random() * 78).toFixed(2) + "%;width:" + z + "px;height:" + z + "px;animation-delay:" + (-Math.random() * 4).toFixed(2) + "s;animation-duration:" + (3 + Math.random() * 4).toFixed(2) + "s";
      frag.appendChild(i);
    }
    s.appendChild(frag);
  })();

  /* ---------- 04 · Anéis ---------- */
  (function () {
    var svg = $("#rings"); if (!svg) return;
    var groups = $$("g[data-ring]", svg), btns = $$("#legend button"), order = ["lei", "termos", "modelo", "voce"];
    var auto = !reduce, visible = false, timer = 0, cur = "lei";
    function set(k) {
      cur = k;
      groups.forEach(function (g) { g.classList.toggle("lit", g.dataset.ring === k); });
      btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.ring === k)); });
    }
    function tick() { clearTimeout(timer); if (auto && visible) timer = setTimeout(function () { set(order[(order.indexOf(cur) + 1) % order.length]); tick(); }, 3000); }
    btns.forEach(function (b) {
      ["mouseenter", "focus", "click"].forEach(function (ev) { b.addEventListener(ev, function () { auto = false; clearTimeout(timer); set(b.dataset.ring); }); });
    });
    set("lei");
    watch(svg, function (v) { visible = v; tick(); }, 0.3);
  })();

  /* ---------- 09 · Planos ---------- */
  (function () {
    var wrap = $("#plans"); if (!wrap) return;
    var FEAT = {
      chat: ["Modelo sem censura* e sem filtro do fornecedor", "A Trustio não treina modelos com suas conversas", "Conta e conversas guardadas no Brasil"]
    };
    var P = {
      chat: [
        { k: "Passe · 7 dias", v: 24.9, u: "por 7 dias", d: 7, note: "Pagamento único · não renova sozinho" },
        { k: "Mensal", v: 79, u: "/mês", d: 30, note: "Renova todo mês · cancele quando quiser" },
        { k: "Anual", v: 790, u: "/ano", d: 365, note: "Equivale a R$ 65,83 por mês · dois meses grátis" }
      ]
    };
    function brl(v, cents) { return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }); }
    function render(prod) {
      wrap.innerHTML = P[prod].map(function (p, i) {
        var feat = i === 1;
        return '<article class="card plan' + (feat ? " feat" : "") + '">' +
          '<div class="top"><span class="label">' + p.k + "</span>" + (p.badge ? '<span class="tag">' + p.badge + "</span>" : "") + "</div>" +
          '<div class="price"><strong>' + brl(p.v, p.v % 1 !== 0) + "</strong><span>" + p.u + "</span></div>" +
          '<div class="perday">≈ ' + brl(p.v / p.d, true) + " por dia</div>" +
          '<div class="note">' + p.note + "</div>" +
          "<ul>" + FEAT[prod].map(function (f) { return '<li><svg><use href="#i-check"/></svg>' + f + "</li>"; }).join("") + "</ul>" +
          '<a class="btn ' + (feat ? "btn-primary" : "btn-ghost") + '" href="planos.html#pessoal">Assinar ' + p.k.toLowerCase() + ' <span class="ico"><svg><use href="#i-arrow"/></svg></span></a>' +
          "</article>";
      }).join("");
    }
    render("chat");
  })();
})();
