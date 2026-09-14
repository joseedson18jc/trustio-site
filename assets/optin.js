// assets/optin.js — envia o formulário da lista de espera para o Worker (double opt-in)
(function () {
  "use strict";
  var ENDPOINT = "https://api.trustio.com.br/signup";

  var form = document.getElementById("espera-form");
  if (!form) return;

  var btn = form.querySelector("[data-submit]");
  var note = document.createElement("p");
  note.className = "lead-legal";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");
  form.appendChild(note);

  var sending = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    if (!form.reportValidity()) return;
    sending = true;

    var original = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
    note.textContent = "";

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = v; });

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) throw new Error(res.data.error || "erro");
        form.reset();
        if (btn) btn.textContent = "Inscrição enviada ✓";
        note.textContent = "Tudo certo! Enviamos um link de confirmação para o seu e-mail. Confirme para garantir sua vaga na lista.";
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        note.textContent = "Não foi possível enviar agora. Tente novamente em instantes.";
      })
      .then(function () { sending = false; });
  });
})();
