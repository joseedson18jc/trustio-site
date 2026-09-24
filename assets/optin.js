// assets/optin.js — envia o formulário da lista de espera para o Worker (double opt-in)
(function () {
  "use strict";
  // Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
  var EN = /^en\b/i.test(document.documentElement.lang);
  var T = function (pt, en) { return EN ? en : pt; };
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
    if (btn) { btn.disabled = true; btn.textContent = T("Enviando…", "Sending…"); }
    note.textContent = "";

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = v; });
    // normalizacao: formularios sem todos os campos (ex.: planos.html usa whatsapp e nao tem nome)
    if (!payload.nome) payload.nome = String(payload.email || "").split("@")[0] || "Assinante";
    if (!payload.telefone && payload.whatsapp) payload.telefone = payload.whatsapp;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) throw new Error(res.data.error || "erro");
        form.reset();
        if (btn) btn.textContent = T("Inscrição enviada ✓", "You're signed up ✓");
        note.textContent = T("Tudo certo! Enviamos um link de confirmação para o seu e-mail. Confirme para garantir sua vaga na lista.", "All set! We sent a confirmation link to your email. Confirm it to secure your spot on the list.");
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        note.textContent = T("Não foi possível enviar agora. Tente novamente em instantes.", "We couldn't send that right now. Try again in a moment.");
      })
      .then(function () { sending = false; });
  });
})();
