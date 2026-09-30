/* Abertura do chat (/app/): contagem dos números (easeOutCubic, uma vez, ao entrar na tela) e o
   botão "Começar", que abre a conversa (mesmo caminho do onboarding) ou foca a caixa de mensagem. */
(function () {
  var hero = document.querySelector("[data-wh]");
  if (!hero) return;
  var reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var local = document.documentElement.lang || "pt-BR";

  function formata(v, casas, suf) {
    return v.toLocaleString(local, { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;
  }

  var numeros = Array.prototype.slice.call(hero.querySelectorAll("[data-wh-count]"));
  numeros.forEach(function (el) {
    el.textContent = formata(Number(el.dataset.whCount), Number(el.dataset.whDec), el.dataset.whSuf);
  });

  function conta(el, i) {
    var alvo = Number(el.dataset.whCount), casas = Number(el.dataset.whDec), suf = el.dataset.whSuf;
    var dur = 1500 + i * 80, ini = null;
    el.textContent = formata(0, casas, suf);
    function passo(t) {
      if (ini === null) ini = t;
      var p = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = formata(alvo * e, casas, suf);
      if (p < 1) requestAnimationFrame(passo);
    }
    setTimeout(function () { requestAnimationFrame(passo); }, 480 + i * 90);
  }

  if (!reduz && "IntersectionObserver" in window) {
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        obs.disconnect();
        numeros.forEach(conta);
      });
    }, { threshold: 0.25 });
    var lista = hero.querySelector(".wh-stats");
    if (lista) obs.observe(lista);
  }

  var video = hero.querySelector("video");
  if (video && reduz) { video.removeAttribute("autoplay"); video.pause(); }

  var cta = hero.querySelector("[data-wh-cta]");
  if (cta) cta.addEventListener("click", function () {
    var inicio = document.querySelector("[data-ob-start]");
    if (inicio && inicio.offsetParent !== null) { inicio.click(); return; }
    var prompt = document.getElementById("prompt");
    if (prompt) prompt.focus();
  });
})();
