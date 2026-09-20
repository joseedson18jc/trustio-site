/* assets/chat.js — área do cliente (/app/).
   Sessão via Supabase Auth; mensagens via função "chat" (streaming SSE).
   Nenhuma chave secreta aqui: a chave do modelo fica no servidor. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;

  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var shell = $(".chat-shell");
  var thread = $("[data-thread]");
  var welcome = $("[data-welcome]");
  var composer = $("[data-composer]");
  var input = $("#prompt");
  var sendBtn = $("[data-send]");
  var notice = $("[data-notice]");
  var paywall = $("[data-paywall]");
  var convList = $("[data-conversations]");
  var convEmpty = $("[data-conv-empty]");
  var convTitle = $("[data-conv-title]");
  var deleteBtn = $("[data-delete]");
  var gate = $("[data-gate]");

  var state = { user: null, lead: null, limit: 0, conversationId: null, conversations: [], sending: false, threadInner: null, isAdmin: false };

  // ---------------------------------------------------------------- utilidades
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // Renderização mínima e segura de Markdown (blocos de código, inline, negrito, listas, títulos).
  function render(md) {
    var out = [], parts = String(md).split(/```/);
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        var code = parts[i].replace(/^[a-z0-9_-]*\n/i, "");
        out.push("<pre><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>");
        continue;
      }
      var blocks = parts[i].split(/\n{2,}/);
      blocks.forEach(function (b) {
        b = b.trim(); if (!b) return;
        var lines = b.split("\n");
        if (lines.every(function (l) { return /^\s*[-*•]\s+/.test(l); })) {
          out.push("<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-*•]\s+/, "")) + "</li>"; }).join("") + "</ul>"); return;
        }
        if (lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); })) {
          out.push("<ol>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*\d+[.)]\s+/, "")) + "</li>"; }).join("") + "</ol>"); return;
        }
        if (/^#{1,3}\s+/.test(b)) { out.push("<h3>" + inline(b.replace(/^#{1,3}\s+/, "")) + "</h3>"); return; }
        out.push("<p>" + lines.map(inline).join("<br>") + "</p>");
      });
    }
    return out.join("");
  }
  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  }

  function showNotice(html) { notice.innerHTML = html; notice.hidden = !html; }
  function initials(name, email) {
    var base = (name || email || "?").trim();
    var p = base.split(/\s+/);
    return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : base.slice(0, 2)).toUpperCase();
  }
  function gateShow(title, text, opts) {
    gate.hidden = false;
    $("[data-gate-title]").textContent = title;
    $("[data-gate-text]").textContent = text;
    $("[data-recovery-form]").hidden = !(opts && opts.recovery);
    $("[data-gate-actions]").hidden = !(opts && opts.actions);
  }
  function gateHide() { gate.hidden = true; }

  // ---------------------------------------------------------------- sessão
  var recoveryMode = /[?&]recovery=1/.test(location.search) || /type=recovery/.test(location.hash);

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === "PASSWORD_RECOVERY") { recoveryMode = true; showRecovery(); }
    if (event === "SIGNED_OUT") { location.replace(CFG.loginPath); }
  });

  function showRecovery() {
    gateShow("Defina uma nova senha", "Depois disso você entra direto no chat.", { recovery: true });
    var form = $("[data-recovery-form]");
    form.onsubmit = function (e) {
      e.preventDefault();
      var pwd = $("#nova-senha").value;
      if (pwd.length < 8) return;
      form.querySelector("button").disabled = true;
      sb.auth.updateUser({ password: pwd }).then(function (r) {
        if (r.error) throw r.error;
        recoveryMode = false;
        history.replaceState(null, "", location.pathname);
        boot();
      }).catch(function () { form.querySelector("button").disabled = false; $("[data-gate-text]").textContent = "Não foi possível salvar. Tente novamente."; });
    };
  }

  function boot() {
    gateShow("Entrando…", "Um instante.");
    sb.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) {
        // Pode ser o retorno do link de e-mail: o supabase-js processa o hash de forma assíncrona.
        return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return sb.auth.getSession(); }).then(function (r2) {
          var s2 = r2.data && r2.data.session;
          if (!s2) { gateShow("Você não está conectado", "Entre ou crie sua conta para usar o chat.", { actions: true }); return null; }
          return s2;
        });
      }
      return session;
    }).then(function (session) {
      if (!session) return;
      if (recoveryMode) { showRecovery(); return; }
      state.user = session.user;
      if (location.hash) history.replaceState(null, "", location.pathname);
      return Promise.all([loadLead(), loadLimit(), loadConversations(), loadAdmin()]).then(function () {
        gateHide();
        shell.dataset.state = "ready";
        renderMe();
        renderOnboard(!(state.lead && state.lead.onboarding_seen_at));
        if (!state.user.email_confirmed_at) {
          showNotice("Seu e-mail ainda não foi confirmado. Abra o link que enviamos para começar a conversar. <button type=\"button\" data-resend-confirm>Reenviar link</button>");
        }
        input.focus();
      });
    }).catch(function (err) {
      console.error(err);
      gateShow("Algo deu errado", "Recarregue a página ou entre novamente.", { actions: true });
    });
  }

  function loadLead() {
    return sb.from("crm_leads").select("nome,email,telefone,tipo,status,plano,mensagens_usadas,onboarding_seen_at,whatsapp_numero,whatsapp_trial_status,whatsapp_trial_requested_at,whatsapp_trial_started_at,whatsapp_trial_ends_at").eq("user_id", state.user.id).maybeSingle()
      .then(function (r) { state.lead = r.data || null; });
  }
  function loadLimit() {
    return sb.rpc("free_message_limit").then(function (r) { state.limit = Number(r.data) || 0; }).catch(function () { state.limit = 0; });
  }
  function loadAdmin() {
    return sb.from("admins").select("user_id").eq("user_id", state.user.id).maybeSingle()
      .then(function (r) { state.isAdmin = !!(r.data); $("[data-admin-link]").hidden = !state.isAdmin; });
  }

  function renderMe() {
    var meta = state.user.user_metadata || {};
    var name = (state.lead && state.lead.nome) || meta.nome || state.user.email;
    $("[data-me-name]").textContent = name;
    $("[data-me-av]").textContent = initials(name, state.user.email);
    var status = state.lead ? state.lead.status : "novo";
    var plan = state.lead && state.lead.plano;
    var label = status === "assinante" ? ("Assinante" + (plan ? " · " + plan : "")) : status === "trial_esgotado" ? "Teste encerrado" : "Teste grátis";
    $("[data-me-plan]").textContent = label;
    renderQuota(status, state.lead ? state.lead.mensagens_usadas : 0);
    renderOnboardQuota();
  }

  function renderQuota(status, used) {
    var q = $("[data-quota]");
    if (status === "assinante" || !state.limit) { q.hidden = true; paywall.hidden = true; return; }
    q.hidden = false;
    var left = Math.max(0, state.limit - used);
    $("[data-quota-bar]").style.width = Math.min(100, (used / state.limit) * 100) + "%";
    $("[data-quota-text]").textContent = left + " de " + state.limit + " perguntas grátis restantes";
    var locked = left <= 0;
    paywall.hidden = !locked;
    input.disabled = locked; sendBtn.disabled = locked;
  }

  // ---------------------------------------------------------------- widgets de boas-vindas
  function fmtDate(d) { var x = new Date(d); return x.toLocaleDateString("pt-BR") + " às " + x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function fmtPhone(n) {
    var d = String(n || "").replace(/\D/g, "");
    if (d.length === 13 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 3) + " " + d.slice(3, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return n || "";
  }

  function renderOnboard(first) {
    var ob = $("[data-onboard]");
    if (!ob) return;
    welcome.dataset.mode = first ? "first" : "returning";
    ob.hidden = false;
    renderOnboardQuota();
    renderWhatsapp();
  }

  function renderOnboardQuota() {
    var status = state.lead ? state.lead.status : "novo";
    var used = state.lead ? Number(state.lead.mensagens_usadas || 0) : 0;
    var limitEl = $("[data-ob-limit]"), bar = $("[data-ob-bar]"), txt = $("[data-ob-quota]");
    if (!limitEl) return;
    if (status === "assinante" || !state.limit) {
      limitEl.textContent = "∞"; bar.style.width = "100%";
      txt.textContent = status === "assinante" ? "Plano ativo: sem limite de prompts." : "Sem limite de prompts neste ambiente.";
      return;
    }
    limitEl.textContent = state.limit;
    var left = Math.max(0, state.limit - used);
    bar.style.width = Math.min(100, (used / state.limit) * 100) + "%";
    txt.textContent = used === 0 ? "Você ainda não usou nenhum." : left === 0 ? "Você usou todos. Escolha um plano para continuar." : "Você usou " + used + ". Restam " + left + ".";
  }

  function renderWhatsapp() {
    var form = $("[data-wa-form]"), st = $("[data-wa-status]"), num = $("#wa-num");
    if (!form) return;
    var l = state.lead || {};
    var status = l.whatsapp_trial_status || "nao_solicitado";
    if (status === "nao_solicitado") {
      form.hidden = false; st.hidden = true;
      if (!num.value) num.value = fmtPhone(l.whatsapp_numero || l.telefone || "");
      return;
    }
    form.hidden = true; st.hidden = false; st.className = "";
    if (status === "solicitado") {
      st.classList.add("is-ok");
      st.textContent = "Pedido recebido" + (l.whatsapp_trial_requested_at ? " em " + fmtDate(l.whatsapp_trial_requested_at) : "") + ". Vamos ativar e chamar você no " + fmtPhone(l.whatsapp_numero) + ".";
    } else if (status === "ativo") {
      var ends = l.whatsapp_trial_ends_at ? new Date(l.whatsapp_trial_ends_at) : null;
      var hours = ends ? Math.max(0, Math.round((ends - Date.now()) / 36e5)) : null;
      st.classList.add("is-ok");
      st.textContent = "Agente ativo no " + fmtPhone(l.whatsapp_numero) + (ends ? " até " + fmtDate(ends) + (hours !== null ? " (faltam " + (hours >= 48 ? Math.round(hours / 24) + " dias" : hours + " h") + ")" : "") : "") + ".";
    } else {
      st.textContent = "Seus 3 dias no WhatsApp terminaram. Para continuar com o agente, escolha um plano.";
    }
  }

  var waForm = $("[data-wa-form]");
  if (waForm) waForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("[data-wa-submit]"), st = $("[data-wa-status]"), num = $("#wa-num").value;
    if (num.replace(/\D/g, "").length < 10) { st.hidden = false; st.className = "is-error"; st.textContent = "Digite o número com DDD."; return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    sb.rpc("request_whatsapp_trial", { p_numero: num }).then(function (r) {
      if (r.error) throw r.error;
      var d = r.data || {};
      if (!d.ok) throw new Error(d.error || "erro");
      if (state.lead) { state.lead.whatsapp_trial_status = d.status; state.lead.whatsapp_numero = d.numero; state.lead.whatsapp_trial_requested_at = d.requested_at; state.lead.whatsapp_trial_started_at = d.started_at; state.lead.whatsapp_trial_ends_at = d.ends_at; }
      renderWhatsapp();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = "Quero os 3 dias";
      st.hidden = false; st.className = "is-error";
      st.textContent = String(err.message || "").indexOf("numero_invalido") >= 0 ? "Número inválido. Use DDD + número." : "Não foi possível registrar agora. Tente de novo.";
    });
  });

  var obStart = $("[data-ob-start]");
  if (obStart) obStart.addEventListener("click", function () {
    welcome.dataset.mode = "returning";
    if (state.lead && !state.lead.onboarding_seen_at) {
      state.lead.onboarding_seen_at = new Date().toISOString();
      sb.rpc("mark_onboarding_seen").then(function () {});
    }
    input.focus();
  });

  var obOpen = $("[data-ob-open]");
  if (obOpen) obOpen.addEventListener("click", function () {
    if (state.sending) return;
    resetThread();
    renderOnboard(true);
    thread.scrollTop = 0;
    closeSide();
  });

  // ---------------------------------------------------------------- conversas
  function loadConversations() {
    return sb.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(100)
      .then(function (r) { state.conversations = r.data || []; renderConversations(); });
  }

  function renderConversations() {
    convList.querySelectorAll(".conv-item").forEach(function (n) { n.remove(); });
    convEmpty.hidden = state.conversations.length > 0;
    state.conversations.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "conv-item"; b.textContent = c.title || "Conversa";
      b.dataset.id = c.id;
      if (c.id === state.conversationId) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { openConversation(c.id); closeSide(); });
      convList.appendChild(b);
    });
  }

  function ensureThreadInner() {
    if (!state.threadInner) {
      welcome.hidden = true;
      state.threadInner = document.createElement("div");
      state.threadInner.className = "thread-inner";
      thread.appendChild(state.threadInner);
    }
    return state.threadInner;
  }

  function resetThread() {
    if (state.threadInner) { state.threadInner.remove(); state.threadInner = null; }
    welcome.hidden = false;
    state.conversationId = null;
    convTitle.textContent = "Nova conversa";
    deleteBtn.hidden = true;
    renderConversations();
  }

  function openConversation(id) {
    if (state.sending) return;
    state.conversationId = id;
    var c = state.conversations.filter(function (x) { return x.id === id; })[0];
    convTitle.textContent = c ? c.title : "Conversa";
    deleteBtn.hidden = false;
    if (state.threadInner) { state.threadInner.remove(); state.threadInner = null; }
    var inner = ensureThreadInner();
    inner.innerHTML = "<p class=\"msg-meta\">Carregando…</p>";
    renderConversations();
    sb.from("messages").select("role,content,created_at").eq("conversation_id", id).order("created_at", { ascending: true })
      .then(function (r) {
        // O usuário pode ter trocado de conversa enquanto esta carregava: só renderiza se ainda for a ativa.
        if (state.conversationId !== id || state.threadInner !== inner) return;
        inner.innerHTML = "";
        (r.data || []).forEach(function (m) { appendMessage(m.role, m.content); });
        scrollBottom();
      });
  }

  function appendMessage(role, content) {
    var inner = ensureThreadInner();
    var el = document.createElement("article");
    el.className = "msg msg-" + role;
    el.innerHTML = "<span class=\"msg-av\" aria-hidden=\"true\">" + (role === "user" ? "VC" : "T") + "</span><div class=\"msg-body\"></div>";
    var body = el.querySelector(".msg-body");
    if (role === "user") body.innerHTML = "<p>" + esc(content).replace(/\n/g, "<br>") + "</p>"; else body.innerHTML = render(content);
    inner.appendChild(el);
    return el;
  }

  function scrollBottom() { thread.scrollTop = thread.scrollHeight; }

  // ---------------------------------------------------------------- envio
  function send(text) {
    text = String(text || "").trim();
    if (!text || state.sending) return;
    if (!state.user.email_confirmed_at) { showNotice("Confirme seu e-mail antes de conversar. <button type=\"button\" data-resend-confirm>Reenviar link</button>"); return; }
    state.sending = true;
    showNotice("");
    input.value = ""; autosize();
    sendBtn.disabled = true; input.disabled = true;
    appendMessage("user", text);
    var pending = appendMessage("assistant", "");
    pending.classList.add("msg-pending");
    var body = pending.querySelector(".msg-body");
    var full = "";
    scrollBottom();
    thread.setAttribute("aria-busy", "true");

    sb.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) throw new Error("sem_sessao");
      return fetch(CFG.chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + session.access_token, "apikey": CFG.key },
        body: JSON.stringify({ conversation_id: state.conversationId, message: text })
      });
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) { var e = new Error(d.error || ("http_" + res.status)); e.data = d; e.status = res.status; throw e; });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return reader.read().then(function (step) {
          if (step.done) return;
          buf += dec.decode(step.value, { stream: true });
          var events = buf.split("\n\n"); buf = events.pop();
          events.forEach(function (ev) {
            var line = ev.split("\n").filter(function (l) { return l.indexOf("data:") === 0; })[0];
            if (!line) return;
            var d; try { d = JSON.parse(line.slice(5)); } catch (e) { return; }
            if (d.conversation_id && !state.conversationId) { state.conversationId = d.conversation_id; }
            if (d.delta) { full += d.delta; body.innerHTML = render(full); scrollBottom(); }
            if (d.error) showNotice("A resposta foi interrompida. Tente enviar de novo.");
            if (d.done) afterDone(d);
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      var code = err && err.message;
      if (code === "trial_esgotado") { pending.remove(); if (state.lead) { state.lead.status = "trial_esgotado"; state.lead.mensagens_usadas = state.limit; } renderMe(); }
      else if (code === "email_nao_confirmado") { pending.remove(); showNotice("Confirme seu e-mail antes de conversar. <button type=\"button\" data-resend-confirm>Reenviar link</button>"); }
      else if (code === "modelo_nao_configurado") { pending.remove(); showNotice("O modelo ainda não foi ativado neste ambiente. A equipe Trustio precisa configurar a chave do provedor. Sua mensagem não foi contada."); }
      else if (code === "modelo_indisponivel") { pending.remove(); showNotice("O modelo não respondeu agora. Tente novamente em instantes."); }
      else if (code === "sem_sessao" || (err && err.status === 401)) { location.replace(CFG.loginPath); }
      else { pending.remove(); showNotice("Não foi possível enviar. Verifique a conexão e tente de novo."); console.error(err); }
    }).then(function () {
      pending.classList.remove("msg-pending");
      if (!body.innerHTML && pending.parentNode) pending.remove();
      state.sending = false;
      thread.setAttribute("aria-busy", "false");
      if (!(state.lead && state.lead.status === "trial_esgotado")) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
    });
  }

  function afterDone(d) {
    if (state.lead) {
      state.lead.mensagens_usadas = (state.lead.mensagens_usadas || 0) + 1;
      if (state.lead.status !== "assinante") state.lead.status = (d.remaining === 0) ? "trial_esgotado" : "ativo";
    }
    if (typeof d.limit === "number" && d.limit > 0) state.limit = d.limit;
    renderMe();
    var known = state.conversations.some(function (c) { return c.id === d.conversation_id; });
    if (!known) loadConversations().then(function () {
      var c = state.conversations.filter(function (x) { return x.id === d.conversation_id; })[0];
      if (c) convTitle.textContent = c.title;
      deleteBtn.hidden = false;
    }); else {
      state.conversations.sort(function (a, b) { return a.id === d.conversation_id ? -1 : b.id === d.conversation_id ? 1 : 0; });
      renderConversations();
    }
  }

  // ---------------------------------------------------------------- UI
  composer.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(220, input.scrollHeight) + "px"; }
  input.addEventListener("input", autosize);

  document.querySelectorAll("[data-starter]").forEach(function (b) {
    b.addEventListener("click", function () { input.value = b.textContent; autosize(); send(input.value); });
  });

  $("[data-new]").addEventListener("click", function () { if (!state.sending) { resetThread(); input.focus(); closeSide(); } });

  deleteBtn.addEventListener("click", function () {
    if (!state.conversationId || state.sending) return;
    if (!confirm("Apagar esta conversa? Isso não pode ser desfeito.")) return;
    var id = state.conversationId;
    sb.from("conversations").delete().eq("id", id).then(function () {
      state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
      resetThread();
    });
  });

  $("[data-logout]").addEventListener("click", function () { sb.auth.signOut(); });

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-resend-confirm]");
    if (!t) return;
    t.disabled = true;
    sb.auth.resend({ type: "signup", email: state.user.email, options: { emailRedirectTo: location.origin + CFG.appPath } })
      .then(function () { showNotice("Novo link enviado para " + esc(state.user.email) + "."); });
  });

  function openSide() { shell.dataset.side = "open"; }
  function closeSide() { delete shell.dataset.side; }
  $("[data-side-open]").addEventListener("click", openSide);
  $("[data-side-close]").addEventListener("click", closeSide);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSide(); });

  // Tema (mesma chave do site).
  var toggle = $(".theme-toggle");
  function applyTheme(t) {
    if (t === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    toggle.setAttribute("aria-pressed", t === "light" ? "true" : "false");
    try { localStorage.setItem("trustio-theme", t); } catch (e) { /* sem storage */ }
  }
  toggle.addEventListener("click", function () { applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"); });
  toggle.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "light" ? "true" : "false");

  boot();
})();
