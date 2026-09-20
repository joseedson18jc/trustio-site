/* Alternador de tema dos previews (mesma lógica do site, sem depender de app.js). */
(function () {
  var KEY = "trustio-theme";
  var button = document.querySelector(".theme-toggle");
  function apply(theme, persist) {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    if (button) {
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.setAttribute("aria-label", theme === "light" ? "Ativar tema escuro" : "Ativar tema claro");
    }
    if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
  }
  apply(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark", false);
  if (button) button.addEventListener("click", function () {
    apply(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light", true);
  });
})();
