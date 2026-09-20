/* assets/conta.js — cadastro, login e recuperação de senha (páginas cadastro.html e entrar.html).
   Fluxo: cadastro → e-mail de confirmação → link abre /app/ já autenticado. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;

  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  var appUrl = location.origin + CFG.appPath;

  function status(form, text, kind) {
    var note = form.querySelector("[data-status]");
    if (!note) return;
    note.textContent = text || "";
    note.classList.toggle("is-error", kind === "error");
    note.classList.toggle("is-ok", kind === "ok");
  }

  function busy(form, on, label) {
    var btn = form.querySelector("[data-submit]");
    if (!btn) return;
    if (on) { btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.disabled = true; btn.textContent = label || "Enviando…"; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  }

  function humanError(err) {
    var m = String((err && err.message) || "").toLowerCase();
    if (m.indexOf("invalid login") >= 0) return "E-mail ou senha incorretos.";
    if (m.indexOf("email not confirmed") >= 0) return "Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo abaixo.";
    if (m.indexOf("already registered") >= 0 || m.indexOf("already been registered") >= 0) return "Esse e-mail já tem conta. Entre ou recupere a senha.";
    if (m.indexOf("password") >= 0 && m.indexOf("least") >= 0) return "A senha precisa ter pelo menos 8 caracteres.";
    if (m.indexOf("rate limit") >= 0 || m.indexOf("too many") >= 0) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (m.indexOf("failed to fetch") >= 0 || m.indexOf("network") >= 0) return "Sem conexão com o servidor. Verifique a internet e tente novamente.";
    return "Não foi possível concluir agora. Tente novamente em instantes.";
  }

  // Já logado? Vai direto para o chat.
  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session && document.body.dataset.redirectIfLogged !== "false") {
      location.replace(appUrl);
    }
  });

  // ---------------------------------------------------------------- cadastro
  var signup = document.getElementById("cadastro-form");
  if (signup) {
    var tipoInputs = signup.querySelectorAll("[data-tipo]");
    var b2b = signup.querySelector("[data-when='b2b']");
    function syncTipo() {
      var v = signup.querySelector("[data-tipo]:checked");
      var isB2b = v && v.dataset.tipo === "b2b";
      if (b2b) { b2b.hidden = !isB2b; b2b.querySelectorAll("[data-req-b2b]").forEach(function (el) { el.required = !!isB2b; }); }
    }
    tipoInputs.forEach(function (i) { i.addEventListener("change", syncTipo); });
    syncTipo();

    signup.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!signup.reportValidity()) return;
      var f = new FormData(signup);
      if (f.get("_honey")) return;
      var email = String(f.get("email") || "").trim().toLowerCase();
      var senha = String(f.get("senha") || "");
      if (senha.length < 8) { status(signup, "A senha precisa ter pelo menos 8 caracteres.", "error"); return; }
      var tipoEl = signup.querySelector("[data-tipo]:checked");
      busy(signup, true, "Criando conta…");
      status(signup, "");
      sb.auth.signUp({
        email: email,
        password: senha,
        options: {
          emailRedirectTo: appUrl,
          data: {
            nome: String(f.get("nome") || "").trim(),
            telefone: String(f.get("telefone") || "").trim(),
            tipo: tipoEl ? tipoEl.dataset.tipo : "b2c",
            empresa: String(f.get("empresa") || "").trim(),
            segmento: String(f.get("segmento") || "").trim(),
            origem: "cadastro.html"
          }
        }
      }).then(function (r) {
        if (r.error) throw r.error;
        var user = r.data && r.data.user;
        if (r.data && r.data.session) { location.replace(appUrl); return; }
        // identities vazio = e-mail já cadastrado (o Supabase não revela isso, por segurança).
        var exists = user && Array.isArray(user.identities) && user.identities.length === 0;
        signup.querySelectorAll("input:not([type=hidden]), select, fieldset").forEach(function (el) { el.disabled = true; });
        var done = signup.querySelector("[data-done]");
        if (done) {
          done.hidden = false;
          done.querySelector("[data-done-email]").textContent = email;
        }
        busy(signup, true, exists ? "Verifique seu e-mail" : "Conta criada ✓");
        status(signup, exists
          ? "Se esse e-mail ainda não tiver conta, você recebe o link de confirmação. Se já tiver, entre com a sua senha."
          : "Enviamos um link de confirmação. Abra o e-mail e clique para entrar direto no chat.", "ok");
      }).catch(function (err) {
        busy(signup, false);
        status(signup, humanError(err), "error");
      });
    });
  }

  // ---------------------------------------------------------------- login
  var login = document.getElementById("entrar-form");
  if (login) {
    var resend = login.querySelector("[data-resend]");
    login.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!login.reportValidity()) return;
      var f = new FormData(login);
      var email = String(f.get("email") || "").trim().toLowerCase();
      busy(login, true, "Entrando…");
      status(login, "");
      sb.auth.signInWithPassword({ email: email, password: String(f.get("senha") || "") })
        .then(function (r) {
          if (r.error) throw r.error;
          location.replace(appUrl);
        })
        .catch(function (err) {
          busy(login, false);
          var msg = humanError(err);
          status(login, msg, "error");
          if (resend) resend.hidden = String(err.message || "").toLowerCase().indexOf("not confirmed") < 0;
        });
    });

    if (resend) resend.addEventListener("click", function () {
      var email = String(new FormData(login).get("email") || "").trim().toLowerCase();
      if (!email) return;
      resend.disabled = true;
      sb.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: appUrl } })
        .then(function (r) { if (r.error) throw r.error; status(login, "Novo link enviado para " + email + ".", "ok"); })
        .catch(function (err) { status(login, humanError(err), "error"); resend.disabled = false; });
    });
  }

  // ---------------------------------------------------------------- esqueci a senha
  var forgot = document.getElementById("recuperar-form");
  if (forgot) {
    forgot.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!forgot.reportValidity()) return;
      var email = String(new FormData(forgot).get("email") || "").trim().toLowerCase();
      busy(forgot, true);
      sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl + "?recovery=1" })
        .then(function (r) {
          if (r.error) throw r.error;
          busy(forgot, true, "Link enviado ✓");
          status(forgot, "Se houver conta com esse e-mail, você recebe um link para criar uma nova senha.", "ok");
        })
        .catch(function (err) { busy(forgot, false); status(forgot, humanError(err), "error"); });
    });
  }

  // Alternância entre "entrar" e "recuperar" na mesma página.
  document.querySelectorAll("[data-show]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var target = a.dataset.show;
      document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.dataset.panel !== target; });
      var first = document.querySelector("[data-panel='" + target + "'] input");
      if (first) first.focus();
    });
  });
})();
