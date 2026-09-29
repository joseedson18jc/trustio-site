/* Tema claro/escuro, aplicado antes da primeira pintura (carregado de forma síncrona no <head>,
   antes de styles.css), sem flash.
   Padrão: segue o horário local de quem visita — claro das 05:00 às 19:00, escuro das 19:01 às
   04:59 — e troca sozinho na hora certa, mesmo com a página aberta.
   Escolha manual:
   - o botão de tema (sol/lua) vale até a próxima troca de horário; depois volta ao automático;
   - em "Minha conta", no chat, Claro ou Escuro fixam o tema ("sempre") e Automático volta ao
     horário.
   localStorage: "trustio-theme" (light/dark) e "trustio-theme-ate" (fim da escolha, em ms, ou
   "sempre"). Escolha antiga sem prazo (de antes do tema por horário) não vale mais.
   As páginas usam window.TrustioTema e ouvem o evento "trustio:tema" para atualizar os botões. */
(function () {
  var CHAVE = "trustio-theme", ATE = "trustio-theme-ate";
  var DIA_INI = 5 * 60, DIA_FIM = 19 * 60; // 05:00 a 19:00, inclusive
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
  function escolha() {
    var t = ler(CHAVE), ate = ler(ATE);
    if (t !== "light" && t !== "dark") return null;
    if (ate === "sempre" || Number(ate) > Date.now()) return t;
    return null;
  }
  function atual() { return escolha() || doHorario(); }
  function modo() { var ate = ler(ATE); return escolha() ? (ate === "sempre" ? "fixo" : "temporario") : "automatico"; }
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
    var ate = ler(ATE), fim = escolha() && ate !== "sempre" ? Number(ate) : proximaTroca();
    if (escolha() && ate === "sempre") return;
    // setTimeout não passa de ~24 dias; a troca mais distante está a menos de 1 dia.
    timer = setTimeout(function () {
      var t = atual();
      if ((document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark") !== t) {
        aplicar(t);
        try { document.dispatchEvent(new CustomEvent("trustio:tema", { detail: t })); } catch (e) { /* navegador antigo */ }
      }
      agendar();
    }, Math.max(1000, fim - Date.now() + 500));
  }
  window.TrustioTema = {
    atual: atual,
    modo: modo,
    doHorario: doHorario,
    // Botão de tema: vale até a próxima troca de horário. fixo: vale sempre (Minha conta).
    escolher: function (t, fixo) { gravar(CHAVE, t); gravar(ATE, fixo ? "sempre" : String(proximaTroca())); aplicar(t); agendar(); },
    automatico: function () { gravar(CHAVE, null); gravar(ATE, null); var t = doHorario(); aplicar(t); agendar(); return t; },
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
