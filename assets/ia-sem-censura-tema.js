// Tema da página "IA sem censura" antes da primeira pintura: o mesmo do resto do site
// (assets/theme.js: claro das 05:00 às 19:00, escuro à noite, ou a escolha de quem visita).
// Esta página usa data-theme="dark" explícito (data-tema-explicito no <html>).
(function () {
  var t = window.TrustioTema ? window.TrustioTema.atual() : "dark";
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  document.documentElement.classList.add("js");
  // ".js" esconde as seções até o script da página revelá-las. Se esse script não carregar ou
  // quebrar antes de assumir (marca "js-pronto"), tira o ".js" no load e o conteúdo aparece.
  window.addEventListener("load", function () {
    var h = document.documentElement;
    if (!h.classList.contains("js-pronto")) h.classList.remove("js");
  });
})();
