/* assets/chat.js — área do cliente (/app/).
   Sessão via Supabase Auth; mensagens via função "chat" (streaming SSE).
   Nenhuma chave secreta aqui: a chave do modelo fica no servidor. */
(function () {
  "use strict";
  // Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
  var EN = /^en\b/i.test(document.documentElement.lang);
  var T = function (pt, en) { return EN ? en : pt; };
  var LOCAL = EN ? "en-US" : "pt-BR";
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

  var state = { user: null, lead: null, limit: 0, conversationId: null, conversations: [], sending: false, threadInner: null, isAdmin: false, fechado: false, sessaoCheia: false, placeholderPadrao: "", escolhas: 0 };

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
    gateShow(T("Defina uma nova senha", "Set a new password"), T("Depois disso você entra direto no seu portal.", "After that, you go straight into your portal."), { recovery: true });
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
      }).catch(function () { form.querySelector("button").disabled = false; $("[data-gate-text]").textContent = T("Não foi possível salvar. Tente novamente.", "We couldn't save that. Try again."); });
    };
  }

  function boot() {
    state.placeholderPadrao = input.getAttribute("placeholder") || "";
    gateShow(T("Entrando…", "Signing in…"), T("Um instante.", "One moment."));
    sb.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) {
        // Pode ser o retorno do link de e-mail: o supabase-js processa o hash de forma assíncrona.
        return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return sb.auth.getSession(); }).then(function (r2) {
          var s2 = r2.data && r2.data.session;
          if (!s2) { gateShow(T("Você não está conectado", "You're not signed in"), T("Entre ou crie sua conta para usar o chat.", "Sign in or create an account to use the chat."), { actions: true }); return null; }
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
        restaurarSessao();
        if (!state.user.email_confirmed_at) {
          showNotice(T("Seu e-mail ainda não foi confirmado. Abra o link que enviamos para começar a conversar. ", "Your email isn't confirmed yet. Open the link we sent to start chatting. ") + "<button type=\"button\" data-resend-confirm>" + T("Reenviar link", "Resend link") + "</button>");
        } else {
          // Sem chave do provedor o chat não responde a ninguém. Melhor dizer agora
          // do que deixar a pessoa escrever uma pergunta para receber um erro depois.
          verificarAbertura(session.access_token);
        }
        input.focus();
      });
    }).catch(function (err) {
      console.error(err);
      gateShow(T("Algo deu errado", "Something went wrong"), T("Recarregue a página ou entre novamente.", "Reload the page or sign in again."), { actions: true });
    });
  }

  // Pergunta à função se esta conta já pode conversar. Nenhum segredo volta daqui.
  function verificarAbertura(token) {
    fetch(CFG.chatEndpoint, { method: "GET", headers: { "Authorization": "Bearer " + token, "apikey": CFG.key } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) {
        if (!d || d.chat_aberto) { fechar(false); return; }
        fechar(true, d);
      })
      // Sem resposta agora não presumimos nada: o servidor recusa o envio se ainda estiver fechado.
      .catch(function () { /* o envio mostra o motivo certo depois */ });
  }

  // "1º de outubro", "23 de setembro" — a mesma forma que o resto do site usa.
  function dataCurta(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d)) return null;
    var dia = d.getDate();
    if (EN) return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return (dia === 1 ? "1º" : String(dia)) + " de " + d.toLocaleDateString("pt-BR", { month: "long" });
  }

  // Estado, não um disable pontual: enquanto state.fechado for verdadeiro nada envia,
  // nem pelo formulário, nem pelo Enter, nem pelos botões de sugestão.
  function fechar(fechado, d) {
    state.fechado = !!fechado;
    if (!state.fechado) {
      input.placeholder = state.placeholderPadrao || input.placeholder;
      if (!(state.lead && state.lead.status === "trial_esgotado")) { input.disabled = false; sendBtn.disabled = false; }
      return;
    }
    d = d || {};
    var abre = dataCurta(d.abre_em) || T("1º de outubro", "October 1");
    // Só pré-assinante vê a data antecipada, e o servidor só o mantém fechado antes dela.
    var antes = dataCurta(d.antecipado_em);
    input.disabled = true; sendBtn.disabled = true;
    input.placeholder = T("O chat abre em ", "The chat opens on ") + abre;
    showNotice(
      d.motivo === "sem_modelo"
        ? T("<b>O chat está em manutenção.</b> Sua conta está pronta e suas perguntas grátis continuam intactas; assim que o modelo voltar, esta tela libera sozinha.", "<b>The chat is under maintenance.</b> Your account is ready and your free questions are untouched; as soon as the model is back, this screen unlocks on its own.")
        : T("<b>Sua conta está pronta — o chat ainda não abriu.</b> O acesso começa em <b>", "<b>Your account is ready — the chat hasn't opened yet.</b> Access starts on <b>") + esc(abre) + "</b>" +
          (d.pre_assinante
            ? (antes ? T(", e a sua pré-assinatura entra em <b>", ", and your pre-subscription gets you in on <b>") + esc(antes) + "</b>." : ".")
            : T("; quem assina um plano tem a conta liberada em até 1 dia útil após a confirmação do pagamento.", "; if you subscribe to a plan, your account is released within 1 business day after payment is confirmed.")) +
          T(" Você não precisa fazer mais nada: na data, esta tela abre sozinha e suas 5 perguntas grátis continuam intactas. ", " You don't need to do anything else: on that date, this screen opens on its own and your 5 free questions stay intact. ") +
          (d.pre_assinante ? "" : "<a href=\"../planos.html#pessoal\">" + T("Ver como entrar antes", "See how to get in sooner") + "</a>"));
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
    var label = status === "assinante" ? (T("Assinante", "Subscriber") + (plan ? " · " + plan : "")) : status === "trial_esgotado" ? T("Teste encerrado", "Trial ended") : T("Teste grátis", "Free trial");
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
    $("[data-quota-text]").textContent = EN ? left + " of " + state.limit + " free questions left" : left + " de " + state.limit + " perguntas grátis restantes";
    var locked = left <= 0;
    paywall.hidden = !locked;
    input.disabled = locked; sendBtn.disabled = locked;
  }

  // ---------------------------------------------------------------- widgets de boas-vindas
  function fmtDate(d) { var x = new Date(d); return x.toLocaleDateString(LOCAL) + T(" às ", " at ") + x.toLocaleTimeString(LOCAL, { hour: "2-digit", minute: "2-digit" }); }
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
      txt.textContent = status === "assinante" ? T("Plano ativo: sem limite de prompts.", "Plan active: no prompt limit.") : T("Sem limite de prompts neste ambiente.", "No prompt limit in this environment.");
      return;
    }
    limitEl.textContent = state.limit;
    var left = Math.max(0, state.limit - used);
    bar.style.width = Math.min(100, (used / state.limit) * 100) + "%";
    txt.textContent = used === 0 ? T("Você ainda não usou nenhum.", "You haven't used any yet.") : left === 0 ? T("Você usou todos. Escolha um plano para continuar.", "You've used them all. Choose a plan to continue.") : EN ? "You've used " + used + ". " + left + " left." : "Você usou " + used + ". Restam " + left + ".";
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
      st.textContent = T("Pedido recebido", "Request received") + (l.whatsapp_trial_requested_at ? T(" em ", " on ") + fmtDate(l.whatsapp_trial_requested_at) : "") + T(". Vamos ativar e chamar você no ", ". We'll turn it on and message you at ") + fmtPhone(l.whatsapp_numero) + ".";
    } else if (status === "ativo") {
      var ends = l.whatsapp_trial_ends_at ? new Date(l.whatsapp_trial_ends_at) : null;
      var hours = ends ? Math.max(0, Math.round((ends - Date.now()) / 36e5)) : null;
      st.classList.add("is-ok");
      st.textContent = T("Agente ativo no ", "Agent active on ") + fmtPhone(l.whatsapp_numero) + (ends ? T(" até ", " until ") + fmtDate(ends) + (hours !== null ? T(" (faltam ", " (") + (hours >= 48 ? Math.round(hours / 24) + T(" dias", " days") : hours + " h") + T(")", " left)") : "") : "") + ".";
    } else {
      st.textContent = T("Seus 3 dias no WhatsApp terminaram. Para continuar com o agente, escolha um plano.", "Your 3 days on WhatsApp are over. To keep the agent, choose a plan.");
    }
  }

  var waForm = $("[data-wa-form]");
  if (waForm) waForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("[data-wa-submit]"), st = $("[data-wa-status]"), num = $("#wa-num").value;
    if (num.replace(/\D/g, "").length < 10) { st.hidden = false; st.className = "is-error"; st.textContent = T("Digite o número com DDD.", "Enter the number with the area code."); return; }
    btn.disabled = true; btn.textContent = T("Enviando…", "Sending…");
    sb.rpc("request_whatsapp_trial", { p_numero: num }).then(function (r) {
      if (r.error) throw r.error;
      var d = r.data || {};
      if (!d.ok) throw new Error(d.error || "erro");
      if (state.lead) { state.lead.whatsapp_trial_status = d.status; state.lead.whatsapp_numero = d.numero; state.lead.whatsapp_trial_requested_at = d.requested_at; state.lead.whatsapp_trial_started_at = d.started_at; state.lead.whatsapp_trial_ends_at = d.ends_at; }
      renderWhatsapp();
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = T("Quero os 3 dias", "I want the 3 days");
      st.hidden = false; st.className = "is-error";
      st.textContent = String(err.message || "").indexOf("numero_invalido") >= 0 ? T("Número inválido. Use DDD + número.", "Invalid number. Use area code + number.") : T("Não foi possível registrar agora. Tente de novo.", "We couldn't register that right now. Try again.");
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
  // Sessão da aba: ao recarregar, a conversa continua se começou há menos de 2 horas;
  // depois disso, a aba começa uma sessão nova. Uma aba nova sempre começa do zero
  // (sessionStorage não passa de uma aba para outra).
  var CHAVE_SESSAO = "trustio-conversa-da-aba", JANELA_SESSAO_MS = 2 * 60 * 60 * 1000;
  function lembrarConversa(id) { try { if (id) sessionStorage.setItem(CHAVE_SESSAO, id); else sessionStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* sem storage */ } }
  function restaurarSessao() {
    var id = null;
    try { id = sessionStorage.getItem(CHAVE_SESSAO); } catch (e) { return; }
    if (!id) return;
    // Se a pessoa abrir ou começar outra conversa enquanto a busca corre, a escolha dela vale.
    var escolha = state.escolhas;
    // Busca a conversa guardada direto, e não na lista lateral (que traz só as 100 mais recentes).
    sb.from("conversations").select("id,title,created_at").eq("id", id).maybeSingle().then(function (r) {
      if (state.escolhas !== escolha || state.conversationId || state.sending) return;
      var c = r.data, inicio = c && Date.parse(c.created_at);
      if (!(inicio && Date.now() - inicio < JANELA_SESSAO_MS)) { lembrarConversa(null); return; }
      if (!state.conversations.some(function (x) { return x.id === id; })) state.conversations.unshift(c);
      openConversation(id);
    });
  }

  function loadConversations() {
    return sb.from("conversations").select("id,title,created_at,updated_at").order("updated_at", { ascending: false }).limit(100)
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

  // Trocar de conversa (ou começar outra) sai da sessão que encheu o contexto.
  function sairDaSessaoCheia() {
    if (!state.sessaoCheia) return;
    state.sessaoCheia = false;
    showNotice("");
    if (!state.fechado && !(state.lead && state.lead.status === "trial_esgotado")) { input.disabled = false; sendBtn.disabled = false; }
  }

  function resetThread() {
    state.escolhas++;
    sairDaSessaoCheia();
    if (state.threadInner) { state.threadInner.remove(); state.threadInner = null; }
    welcome.hidden = false;
    state.conversationId = null;
    lembrarConversa(null);
    convTitle.textContent = T("Nova conversa", "New conversation");
    deleteBtn.hidden = true;
    renderConversations();
  }

  function openConversation(id) {
    if (state.sending) return;
    state.escolhas++;
    sairDaSessaoCheia();
    state.conversationId = id;
    lembrarConversa(id);
    var c = state.conversations.filter(function (x) { return x.id === id; })[0];
    convTitle.textContent = c ? c.title : "Conversa";
    deleteBtn.hidden = false;
    if (state.threadInner) { state.threadInner.remove(); state.threadInner = null; }
    var inner = ensureThreadInner();
    inner.innerHTML = "<p class=\"msg-meta\">" + T("Carregando…", "Loading…") + "</p>";
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

  // A conversa encheu o contexto do modelo: não dá para continuar nela. Uma aba nova
  // começa uma conversa nova (sem conversation_id), com o contexto vazio.
  function sessaoCheia(janela) {
    state.sessaoCheia = true;
    var n = janela ? Number(janela).toLocaleString(LOCAL) : "";
    showNotice(n
      ? T("Esta sessão chegou ao limite de " + n + " tokens de contexto. Para continuar, feche esta aba e abra outra.", "This session reached its " + n + "-token context limit. To continue, close this tab and open a new one.")
      : T("Esta sessão chegou ao limite de contexto do modelo. Para continuar, feche esta aba e abra outra.", "This session reached the model's context limit. To continue, close this tab and open a new one."));
    input.disabled = true; sendBtn.disabled = true;
  }

  // ---------------------------------------------------------------- envio
  function send(text) {
    text = String(text || "").trim();
    if (!text || state.sending || state.sessaoCheia) return;
    if (state.fechado) { input.value = ""; autosize(); return; }
    if (!state.user.email_confirmed_at) { showNotice(T("Confirme seu e-mail antes de conversar. ", "Confirm your email before chatting. ") + "<button type=\"button\" data-resend-confirm>" + T("Reenviar link", "Resend link") + "</button>"); return; }
    state.sending = true;
    // Mandar mensagem também é escolher: a retomada pendente não troca mais de conversa.
    state.escolhas++;
    showNotice("");
    input.value = ""; autosize();
    sendBtn.disabled = true; input.disabled = true;
    appendMessage("user", text);
    var pending = appendMessage("assistant", "");
    pending.classList.add("msg-pending");
    var body = pending.querySelector(".msg-body");
    var full = "", avisado = false;

    // Raciocínio do modelo (à parte, recolhível) e progresso da resposta. O tamanho
    // final não é conhecido de antemão: a porcentagem é contra o teto de tokens que a
    // função informa ("limite", só quando há teto configurado) e vai a 100% ao terminar.
    // A contagem é a do modelo ("n"); sem ela, um por trecho recebido.
    var col = document.createElement("div");
    col.className = "msg-col";
    pending.replaceChild(col, body);
    var think = document.createElement("details");
    think.className = "msg-think"; think.hidden = true; think.open = true;
    think.innerHTML = "<summary></summary><div class=\"msg-think-text\"></div>";
    var thinkSum = think.querySelector("summary"), thinkText = think.querySelector(".msg-think-text");
    var prog = document.createElement("div");
    prog.className = "msg-progress";
    prog.setAttribute("role", "progressbar"); prog.setAttribute("aria-valuemin", "0"); prog.setAttribute("aria-valuemax", "100"); prog.setAttribute("aria-valuenow", "0");
    prog.innerHTML = "<span class=\"msg-progress-bar\"><span></span></span><small></small>";
    var progFill = prog.querySelector(".msg-progress-bar span"), progTxt = prog.querySelector("small");
    col.appendChild(think); col.appendChild(body); col.appendChild(prog);
    var limite = 0, tokens = 0, tokensPensando = 0, inicio = Date.now(), interrompida = false;
    function contar(d) { tokens = typeof d.n === "number" && d.n >= tokens ? d.n : tokens + 1; }
    function mostrarProgresso() {
      var fase = full ? T("Escrevendo…", "Writing…") : T("Pensando…", "Thinking…");
      if (limite) {
        var p = Math.min(99, Math.floor(tokens / limite * 100));
        progFill.style.width = p + "%";
        prog.setAttribute("aria-valuenow", String(p));
        progTxt.textContent = fase + " " + p + "% · " + tokens + T(" de até ", " of up to ") + limite + " tokens";
      } else {
        prog.classList.add("is-open");
        prog.removeAttribute("aria-valuenow");
        progTxt.textContent = fase + " " + tokens + " tokens";
      }
      thinkSum.textContent = T("Raciocínio", "Reasoning") + " · " + tokensPensando + " tokens";
    }
    mostrarProgresso();
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
            if (d.conversation_id && !state.conversationId) { state.conversationId = d.conversation_id; lembrarConversa(d.conversation_id); }
            if (d.limite) { limite = Number(d.limite) || 0; prog.classList.remove("is-open"); mostrarProgresso(); }
            if (d.raciocinio) {
              contar(d);
              // Tokens só do raciocínio ("nr", da função); sem ele, o total até a resposta começar.
              tokensPensando = typeof d.nr === "number" ? d.nr : (full ? tokensPensando : tokens);
              if (think.hidden) think.hidden = false;
              var noFim = thinkText.scrollTop + thinkText.clientHeight >= thinkText.scrollHeight - 8;
              thinkText.textContent += d.raciocinio;
              if (noFim) thinkText.scrollTop = thinkText.scrollHeight;
              mostrarProgresso(); scrollBottom();
            }
            if (d.delta) {
              // Primeiro trecho da resposta: o raciocínio recolhe e a resposta fica em foco.
              if (!full && !think.hidden) think.open = false;
              contar(d); full += d.delta; body.innerHTML = render(full); mostrarProgresso(); scrollBottom();
            }
            if (!d.delta && !d.raciocinio && typeof d.n === "number" && !d.done) { contar(d); mostrarProgresso(); }
            if (d.error) {
              avisado = true;
              if (d.error === "stream_interrompido") interrompida = true;
              if (!full) body.textContent = "";
              showNotice(d.error === "resposta_vazia"
                ? T("O modelo não devolveu resposta desta vez, e a mensagem não foi descontada. Tente enviar de novo.", "The model didn't return an answer this time, and the message wasn't counted. Try sending again.")
                : T("A resposta foi interrompida. Tente enviar de novo.", "The answer was cut off. Try sending again."));
            }
            if (d.done) {
              if (typeof d.n === "number") contar(d);
              if (typeof d.nr === "number" && !think.hidden) { tokensPensando = d.nr; thinkSum.textContent = T("Raciocínio", "Reasoning") + " · " + tokensPensando + " tokens"; }
              var seg = ((Date.now() - inicio) / 1000).toFixed(1);
              progFill.style.width = "100%"; prog.setAttribute("aria-valuenow", "100");
              prog.classList.add("is-done");
              progTxt.textContent = (interrompida
                ? T("Interrompida", "Interrupted")
                : d.fim === "length"
                  ? T("Resposta cortada no limite", "Answer cut off at the limit")
                  : T("Concluída", "Done")) + " · " + tokens + " tokens · " + (EN ? seg : seg.replace(".", ",")) + " s"
                + (d.contexto && d.janela ? T(" · sessão ", " · session ") + Math.min(100, Math.round(d.contexto / d.janela * 100)) + "%" : "");
              // Sessão cheia é o contexto do modelo quase todo usado (a próxima mensagem não
              // caberia), não a resposta ter batido no teto de tokens por resposta.
              if (d.contexto && d.janela && d.contexto >= d.janela * 0.95) sessaoCheia(d.janela);
              afterDone(d);
            }
          });
          return pump();
        });
      }
      return pump().then(function () {
        // Fluxo terminou sem texto e sem aviso do servidor: não some calado.
        if (!full && !avisado) {
          body.textContent = "";
          showNotice(T("A resposta não chegou. Recarregue a conversa em instantes; se ela terminar no servidor, aparece no histórico.", "The answer didn't arrive. Reload the conversation in a moment; if it finishes on the server, it shows up in the history."));
        }
      });
    }).catch(function (err) {
      var code = err && err.message;
      if (code === "trial_esgotado") { pending.remove(); if (state.lead) { state.lead.status = "trial_esgotado"; state.lead.mensagens_usadas = state.limit; } renderMe(); }
      else if (code === "email_nao_confirmado") { pending.remove(); showNotice(T("Confirme seu e-mail antes de conversar. ", "Confirm your email before chatting. ") + "<button type=\"button\" data-resend-confirm>" + T("Reenviar link", "Resend link") + "</button>"); }
      else if (code === "chat_ainda_fechado") { pending.remove(); fechar(true, (err && err.data) || {}); }
      else if (code === "modelo_nao_configurado") { pending.remove(); fechar(true, { motivo: "sem_modelo" }); }
      else if (code === "contexto_cheio") { pending.remove(); sessaoCheia((err && err.data && err.data.janela) || 0); }
      else if (code === "modelo_indisponivel") { pending.remove(); showNotice(T("O modelo não respondeu agora. Tente novamente em instantes.", "The model didn't respond just now. Try again in a moment.")); }
      else if (code === "sem_sessao" || (err && err.status === 401)) { location.replace(CFG.loginPath); }
      else { pending.remove(); showNotice(T("Não foi possível enviar. Verifique a conexão e tente de novo.", "We couldn't send that. Check your connection and try again.")); console.error(err); }
    }).then(function () {
      pending.classList.remove("msg-pending");
      if (!prog.classList.contains("is-done")) prog.remove();
      if (!body.innerHTML && pending.parentNode) pending.remove();
      state.sending = false;
      thread.setAttribute("aria-busy", "false");
      if (!state.fechado && !state.sessaoCheia && !(state.lead && state.lead.status === "trial_esgotado")) { input.disabled = false; sendBtn.disabled = false; input.focus(); }
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
    if (!confirm(T("Apagar esta conversa? Isso não pode ser desfeito.", "Delete this conversation? This can't be undone."))) return;
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
      .then(function () { showNotice(T("Novo link enviado para ", "New link sent to ") + esc(state.user.email) + "."); });
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
