/* assets/conta.js — cadastro, login e recuperação de senha (páginas cadastro.html e entrar.html).
   Fluxo: cadastro → e-mail de confirmação → link abre /app/ já autenticado. */
(function () {
  "use strict";
  // Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
  var EN = /^en\b/i.test(document.documentElement.lang);
  var T = function (pt, en) { return EN ? en : pt; };
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;

  // Lido antes do createClient, que apaga o fragmento: um link de "esqueci a senha" desviado para
  // cá pelo porteiro precisa abrir o formulário de nova senha no /app/.
  var emRecuperacao = /type=recovery/.test(location.hash);

  // detectSessionInUrl: esta página recebe o #access_token de duas origens — a volta do Google, e
  // links de e-mail que apontavam para /app/ e foram desviados para cá pelo porteiro (gate/),
  // que mantém o fragmento no redirect.
  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  CFG.sincronizarCookie(sb);
  var appUrl = location.origin + CFG.appPath;
  // ?next= vem do porteiro: depois de entrar, volta para a página que foi pedida.
  var proximo = CFG.destinoSeguro(new URLSearchParams(location.search).get("next"), "");
  var destino = location.origin + (emRecuperacao ? CFG.appPath + "?recovery=1" : (proximo || CFG.appPath));

  // Disjuntor: se o porteiro recusar a sessão que o navegador tem, entrar → /app → entrar giraria
  // para sempre. Duas idas em 20 s sem ficar lá = sessão inválida: sai e explica, em vez de girar.
  var VOLTAS = CFG.chaveVoltas, JANELA_VOLTAS_MS = 20000, MAX_VOLTAS = 2;
  var indo = false;
  function voltasRecentes() {
    try {
      return JSON.parse(sessionStorage.getItem(VOLTAS) || "[]")
        .filter(function (t) { return Date.now() - t < JANELA_VOLTAS_MS; });
    } catch (e) { return []; }
  }
  // O cookie precisa existir antes da navegação, senão o porteiro devolve a pessoa para cá.
  function irParaDestino(sessao) {
    if (indo) return;
    var voltas = voltasRecentes();
    if (voltas.length >= MAX_VOLTAS) {
      try { sessionStorage.removeItem(VOLTAS); } catch (e) { /* sem sessionStorage: segue sem disjuntor */ }
      sb.auth.signOut(); // SIGNED_OUT apaga o cookie (sincronizarCookie)
      var aviso = document.querySelector("[data-oauth-status]") || document.querySelector("form [data-status]");
      if (aviso) {
        aviso.textContent = T("Sua sessão não pôde ser validada. Entre de novo, por favor.", "We couldn't validate your session. Please sign in again.");
        aviso.classList.add("is-error");
      }
      return;
    }
    try { sessionStorage.setItem(VOLTAS, JSON.stringify(voltas.concat(Date.now()))); } catch (e) { /* idem */ }
    indo = true;
    CFG.gravarCookie(sessao);
    location.replace(destino);
  }
  // O supabase-js processa o #access_token de forma assíncrona: o getSession abaixo pode chegar
  // antes. SIGNED_IN cobre esse caso (e a volta do Google); `indo` evita navegar duas vezes.
  sb.auth.onAuthStateChange(function (evento, sessao) {
    if ((evento === "SIGNED_IN" || evento === "PASSWORD_RECOVERY") && sessao && document.body.dataset.redirectIfLogged !== "false") {
      irParaDestino(sessao);
    }
  });
  // Os botões chegam desabilitados no HTML: sem este script (bloqueado ou com erro), o formulário
  // não envia nada — muito menos a senha na URL.
  document.querySelectorAll("#entrar-form [data-submit], #recuperar-form [data-submit], #cadastro-form [data-submit], [data-oauth]")
    .forEach(function (b) { b.disabled = false; });

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
    if (on) { btn.dataset.label = btn.dataset.label || btn.innerHTML; btn.disabled = true; btn.textContent = label || T("Enviando…", "Sending…"); }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  }

  function humanError(err) {
    var m = String((err && err.message) || "").toLowerCase();
    if (m.indexOf("invalid login") >= 0) return T("E-mail ou senha incorretos.", "Incorrect email or password.");
    if (m.indexOf("email not confirmed") >= 0) return T("Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo abaixo.", "Your email isn't confirmed yet. Open the link we sent, or request a new one below.");
    if (m.indexOf("already registered") >= 0 || m.indexOf("already been registered") >= 0) return T("Esse e-mail já tem conta. Entre ou recupere a senha.", "That email already has an account. Sign in or reset your password.");
    if (m.indexOf("password") >= 0 && m.indexOf("least") >= 0) return T("A senha precisa ter pelo menos 8 caracteres.", "Your password needs at least 8 characters.");
    if (m.indexOf("rate limit") >= 0 || m.indexOf("too many") >= 0) return T("Muitas tentativas. Aguarde alguns minutos e tente de novo.", "Too many attempts. Wait a few minutes and try again.");
    if (m.indexOf("failed to fetch") >= 0 || m.indexOf("network") >= 0) return T("Sem conexão com o servidor. Verifique a internet e tente novamente.", "Can't reach the server. Check your connection and try again.");
    return T("Não foi possível concluir agora. Tente novamente em instantes.", "We couldn't finish that right now. Try again in a moment.");
  }

  // Já logado (inclusive acabando de voltar do Google ou de um link de e-mail)? Vai para o destino.
  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session && document.body.dataset.redirectIfLogged !== "false") {
      irParaDestino(r.data.session);
    }
  });

  // ---------------------------------------------------------------- Google
  // O Google devolve para esta mesma página (com o ?next= original); o getSession acima
  // termina o trabalho. Erro ou cancelamento chega como #error_description=… na volta.
  var oauthStatus = document.querySelector("[data-oauth-status]");
  var erroOauth = new URLSearchParams(location.hash.slice(1)).get("error_description");
  if (erroOauth && oauthStatus) {
    oauthStatus.textContent = T("Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.", "We couldn't sign you in with Google. Try again, or use email and password.");
    oauthStatus.classList.add("is-error");
    history.replaceState(null, "", location.pathname + location.search);
  }
  document.querySelectorAll("[data-oauth='google']").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.disabled = true;
      var volta = location.origin + CFG.loginPath + (proximo ? "?next=" + encodeURIComponent(proximo) : "");
      sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: volta } })
        .then(function (r) { if (r.error) throw r.error; })
        .catch(function (err) {
          btn.disabled = false;
          if (oauthStatus) { oauthStatus.textContent = humanError(err); oauthStatus.classList.add("is-error"); }
        });
    });
  });

  // Código do afiliado que trouxe esta pessoa, se ela chegou por um link `?ref=`. A fonte
  // é o cookie `trustio_ref` que o assets/app.js grava (90 dias, último clique vence, como
  // afiliados.html promete) — e o `?ref=` desta visita ganha dele, por ser o clique mais
  // recente. Aqui o código entra nos metadados da conta, que é onde a equipe consegue vê-lo
  // para creditar a comissão. Sem isto, a conta nasce sem vínculo com quem a trouxe.
  // Nunca lança: um cadastro não pode cair por causa de leitura de cookie.
  function indicacaoDeOrigem() {
    try {
      var daUrl = new URLSearchParams(location.search).get("ref");
      if (daUrl && /^[A-Z]{1,8}\d{3}$/.test(daUrl.trim().toUpperCase())) return daUrl.trim().toUpperCase();
      var m = /(?:^|;\s*)trustio_ref=([^;]*)/.exec(document.cookie || "");
      var doCookie = m && decodeURIComponent(m[1]).trim().toUpperCase();
      return doCookie && /^[A-Z]{1,8}\d{3}$/.test(doCookie) ? doCookie : "";
    } catch (e) {
      return "";
    }
  }

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
      if (senha.length < 8) { status(signup, T("A senha precisa ter pelo menos 8 caracteres.", "Your password needs at least 8 characters."), "error"); return; }
      var tipoEl = signup.querySelector("[data-tipo]:checked");
      busy(signup, true, T("Criando conta…", "Creating account…"));
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
            origem: EN ? "en/cadastro.html" : "cadastro.html",
            indicacao: indicacaoDeOrigem()
          }
        }
      }).then(function (r) {
        if (r.error) throw r.error;
        if (window.TRUSTIO_FUNIL) window.TRUSTIO_FUNIL.inicio();
        if (r.data && r.data.session) { irParaDestino(r.data.session); return; }
        // Mesma resposta para e-mail novo e para e-mail que já tem conta (o Supabase devolve
        // identities vazio nesse caso, sem erro): dizer "já tem conta" num formulário público
        // revelaria quem é cliente. Então nunca "conta criada" — a página diz o que vale nos
        // dois casos e sempre oferece entrar ou recuperar a senha.
        // A caixa "Falta só confirmar" fica escondida: ela afirma que um e-mail foi enviado, o
        // que não vale para quem já tem conta. A mensagem abaixo diz o que vale nos dois casos.
        signup.querySelectorAll("input:not([type=hidden]), select, fieldset").forEach(function (el) { el.disabled = true; });
        busy(signup, true, T("Confira seu e-mail", "Check your email"));
        status(signup, T("Se esse e-mail ainda não tiver conta, enviamos o link de confirmação. Se já tiver, é só entrar: ", "If that email doesn't have an account yet, we sent the confirmation link. If it does, just sign in: "), "ok");
        var note = signup.querySelector("[data-status]");
        if (note) {
          var entrar = document.createElement("a");
          entrar.href = CFG.loginPath;
          entrar.textContent = T("entrar ou recuperar a senha", "sign in or reset your password");
          note.appendChild(entrar);
          note.appendChild(document.createTextNode("."));
        }
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
      busy(login, true, T("Entrando…", "Signing in…"));
      status(login, "");
      sb.auth.signInWithPassword({ email: email, password: String(f.get("senha") || "") })
        .then(function (r) {
          if (r.error) throw r.error;
          irParaDestino(r.data.session);
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
        .then(function (r) { if (r.error) throw r.error; status(login, T("Novo link enviado para ", "New link sent to ") + email + ".", "ok"); })
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
          busy(forgot, true, T("Link enviado ✓", "Link sent ✓"));
          status(forgot, T("Se houver conta com esse e-mail, você recebe um link para criar uma nova senha.", "If there's an account with that email, you'll get a link to set a new password."), "ok");
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
