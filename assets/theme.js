/* Tema claro/escuro, aplicado antes da primeira pintura (carregado de forma síncrona no <head>,
   antes de styles.css), sem flash.
   Padrão: escuro, para todo mundo e a qualquer hora (a cor da marca é o #05070B). O site não troca
   de tema sozinho no meio da visita.
   Escolha manual:
   - o botão de tema (sol/lua) e "Minha conta", no chat, guardam Claro ou Escuro até a pessoa trocar;
   - "Automático", em "Minha conta", é opt-in: claro das 05:00 às 19:00, escuro à noite, trocando na
     hora certa com a página aberta.
   localStorage: "trustio-theme" (light/dark/auto) e "trustio-theme-ate" (legado do tema por horário:
   uma escolha antiga com prazo passa a valer sem prazo, porque foi um clique de quem visita).
   As páginas usam window.TrustioTema e ouvem o evento "trustio:tema" para atualizar os botões. */
(function () {
  var CHAVE = "trustio-theme", ATE = "trustio-theme-ate", PADRAO = "dark";
  var DIA_INI = 5 * 60, DIA_FIM = 19 * 60; // 05:00 a 19:00, inclusive (só no modo Automático)
  function minutos(d) { return d.getHours() * 60 + d.getMinutes(); }
  function doHorario(d) { var m = minutos(d || new Date()); return m >= DIA_INI && m <= DIA_FIM ? "light" : "dark"; }
  function proximaTroca(d) {
    var x = new Date(d || new Date()), m = minutos(x);
    if (m < DIA_INI) x.setHours(5, 0, 0, 0);
    else if (m <= DIA_FIM) x.setHours(19, 1, 0, 0);
    else { x.setDate(x.getDate() + 1); x.setHours(5, 0, 0, 0); }
    return x.getTime();
  }
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sem storage */ } }
  function guardado() { var t = ler(CHAVE); return t === "light" || t === "dark" || t === "auto" ? t : null; }
  function modo() { var t = guardado(); return t === "auto" ? "automatico" : t ? "fixo" : "padrao"; }
  function atual() { var t = guardado(); return t === "auto" ? doHorario() : t || PADRAO; }
  function aplicar(t) {
    var r = document.documentElement;
    // A página "IA sem censura" usa data-theme="dark" explícito; o resto do site, sem atributo.
    if (t === "light") r.setAttribute("data-theme", "light");
    else if (r.hasAttribute("data-tema-explicito")) r.setAttribute("data-theme", "dark");
    else r.removeAttribute("data-theme");
  }
  var timer = 0;
  function agendar() {
    clearTimeout(timer);
    if (modo() !== "automatico") return;
    // setTimeout não passa de ~24 dias; a troca mais distante está a menos de 1 dia.
    timer = setTimeout(function () {
      var t = atual();
      if ((document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark") !== t) {
        aplicar(t);
        try { document.dispatchEvent(new CustomEvent("trustio:tema", { detail: t })); } catch (e) { /* navegador antigo */ }
      }
      agendar();
    }, Math.max(1000, proximaTroca() - Date.now() + 500));
  }
  if (ler(ATE) !== null) gravar(ATE, null); // legado: a escolha guardada vale sem prazo
  window.TrustioTema = {
    atual: atual,
    modo: modo,
    doHorario: doHorario,
    // Claro ou Escuro, guardado até a pessoa trocar (botão do cabeçalho ou Minha conta).
    escolher: function (t) { gravar(CHAVE, t === "light" ? "light" : "dark"); aplicar(t); agendar(); },
    // Opt-in de Minha conta: segue o horário.
    automatico: function () { gravar(CHAVE, "auto"); var t = doHorario(); aplicar(t); agendar(); return t; },
    aplicar: aplicar
  };
  aplicar(atual());
  agendar();
})();

/* Bandeira de idioma: leva junto a busca e a âncora da página (?lista=pre&plano=anual,
   ?tipo=b2b, #empresas), para a troca de idioma não perder o estado. O href fixo
   continua valendo sem JavaScript. */
(function () {
  function levarEstado(e) {
    var a = e.target && e.target.closest ? e.target.closest("a.lang-switch") : null;
    // Sempre recalcula: sem busca nem âncora agora, o link volta ao endereço limpo.
    if (!a) return;
    a.href = a.getAttribute("href").split(/[?#]/)[0] + location.search + location.hash;
  }
  document.addEventListener("click", levarEstado);
  document.addEventListener("auxclick", levarEstado); // botão do meio: nova aba
})();
