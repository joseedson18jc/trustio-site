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

  // Erro escrito embaixo do campo, no idioma da página: o balão nativo segue o idioma do
  // navegador e some sozinho. Sem JS, o formulário continua com a validação do navegador.
  form.noValidate = true;
  var tel = form.querySelector('input[type="tel"]');

  function conferirTelefone() {
    if (!tel) return;
    var digitos = tel.value.replace(/\D/g, "");
    tel.setCustomValidity(tel.value.trim() && (digitos.length < 10 || digitos.length > 13)
      ? T("Confira o telefone: DDD e número, como (11) 9 9999-9999.", "Check the phone number: include the area code, e.g. (11) 9 9999-9999.")
      : "");
  }

  function mensagem(campo) {
    var v = campo.validity;
    if (v.customError) return campo.validationMessage;
    if (v.valueMissing) {
      if (campo.type === "email") return T("Informe seu e-mail.", "Enter your email.");
      if (campo.name === "nome") return T("Informe seu nome.", "Enter your name.");
      if (campo.tagName === "SELECT") return T("Escolha uma opção.", "Choose an option.");
      return T("Preencha este campo.", "Please fill in this field.");
    }
    if (v.typeMismatch && campo.type === "email") return T("Confira o e-mail: ele precisa ter o formato voce@exemplo.com.", "Check the email: it should look like you@example.com.");
    return campo.validationMessage;
  }

  function descrever(campo, id, liga) {
    var ids = (campo.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (x) { return x && x !== id; });
    if (liga) ids.push(id);
    if (ids.length) campo.setAttribute("aria-describedby", ids.join(" "));
    else campo.removeAttribute("aria-describedby");
  }

  function mostrarErro(campo, texto) {
    var id = (campo.id || campo.name) + "-erro";
    var el = document.getElementById(id);
    if (!texto) {
      campo.removeAttribute("aria-invalid");
      if (el) el.remove();
      descrever(campo, id, false);
      return;
    }
    if (!el) {
      el = document.createElement("small");
      el.id = id;
      el.className = "campo-erro";
      (campo.closest("label") || campo).insertAdjacentElement("afterend", el);
    }
    el.textContent = texto;
    campo.setAttribute("aria-invalid", "true");
    descrever(campo, id, true);
  }

  function validar() {
    conferirTelefone();
    var primeiro = null;
    form.querySelectorAll("input:not([type=hidden]):not(.hp), select, textarea").forEach(function (campo) {
      if (!campo.willValidate) return;
      var ok = campo.checkValidity();
      mostrarErro(campo, ok ? "" : mensagem(campo));
      if (!ok && !primeiro) primeiro = campo;
    });
    // Centraliza o campo para o rótulo acima dele não ficar embaixo do cabeçalho fixo.
    if (primeiro) { primeiro.focus({ preventScroll: true }); primeiro.scrollIntoView({ block: "center" }); }
    return !primeiro;
  }

  // Campo já marcado com erro é conferido a cada tecla; e-mail e telefone também ao sair do campo.
  form.addEventListener("input", function (e) {
    var c = e.target;
    if (c === tel) conferirTelefone();
    if (c.getAttribute("aria-invalid") === "true") mostrarErro(c, c.checkValidity() ? "" : mensagem(c));
  });
  form.addEventListener("focusout", function (e) {
    var c = e.target;
    if (!c.matches('input[type="email"], input[type="tel"]') || !c.value.trim()) return;
    if (c === tel) conferirTelefone();
    mostrarErro(c, c.checkValidity() ? "" : mensagem(c));
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    if (!validar()) return;
    sending = true;

    var original = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = T("Enviando…", "Sending…"); }
    note.textContent = "";

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = v; });
    // normalizacao: formularios sem todos os campos (ex.: planos.html usa whatsapp e nao tem nome)
    if (!payload.nome) payload.nome = String(payload.email || "").split("@")[0] || "Assinante";
    if (!payload.telefone && payload.whatsapp) payload.telefone = payload.whatsapp;
    // O worker escreve o e-mail e a página de confirmação no idioma de quem se inscreveu.
    payload.lang = EN ? "en" : "pt";

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) throw new Error(res.data.error || "erro");
        // Quem marcou "Assinar agora" vai para a página com o link de pagamento (lida antes do
        // reset, que devolveria o _next ao valor padrão da lista gratuita).
        var nextInput = form.querySelector("[data-next]");
        var next = nextInput ? nextInput.value : "";
        if (/[?&]lista=pre\b/.test(next) && /^https:\/\/trustio\.com\.br\//.test(next)) {
          if (btn) btn.textContent = T("Abrindo o pagamento…", "Opening checkout…");
          location.assign(next);
          return;
        }
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
