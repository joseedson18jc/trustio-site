/* assets/chat.js — área do cliente (/app/).
   Sessão via Supabase Auth; mensagens via função "chat" (streaming SSE).
   Nenhuma chave secreta aqui: a chave do modelo fica no servidor. */
(function () {
  "use strict";
  // /app/#conta abre "Minha conta" assim que a sessão carregar (o hash é limpo logo depois).
  var abrirContaAoEntrar = location.hash === "#conta";
  // Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
  var EN = /^en\b/i.test(document.documentElement.lang);
  var T = function (pt, en) { return EN ? en : pt; };
  var LOCAL = EN ? "en-US" : "pt-BR";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;

  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  CFG.sincronizarCookie(sb);

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
  var baixarBtn = $("[data-baixar]");
  var gate = $("[data-gate]");

  var state = { user: null, lead: null, limit: 0, conversationId: null, conversations: [], sending: false, threadInner: null, isAdmin: false, fechado: false, sessaoCheia: false, placeholderPadrao: "", escolhas: 0,
    // Preferências da conta (tabela preferencias_usuario) e o que vem com elas.
    pref: { estilo: "equilibrado", instrucoes: "", modelo: null, enter_envia: true, fonte: "normal", avatar_em: null },
    modelos: [], avatarUrl: null, filtro: "" };

  // ---------------------------------------------------------------- utilidades
  // Sem cota de perguntas: assinante, ou tipo de usuário admin, colaborador ou cliente
  // (a mesma regra do reserve_chat_message no banco).
  function semCota() {
    var l = state.lead;
    return !!l && (l.status === "assinante" || l.papel === "admin" || l.papel === "colaborador" || l.papel === "cliente");
  }
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
      return Promise.all([loadLead(), loadLimit(), loadConversations(), loadAdmin(), loadPrefs()]).then(function () {
        gateHide();
        shell.dataset.state = "ready";
        renderMe();
        renderOnboard(!(state.lead && state.lead.onboarding_seen_at));
        restaurarSessao();
        if (abrirContaAoEntrar) { abrirContaAoEntrar = false; abrirConta(); }
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
        if (d && Array.isArray(d.modelos)) state.modelos = d.modelos;
        if (!d || d.chat_aberto) { fechar(false); return; }
        fechar(true, d);
      })
      // Sem resposta agora não presumimos nada: o servidor recusa o envio se ainda estiver fechado.
      .catch(function () { /* o envio mostra o motivo certo depois */ });
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
    input.disabled = true; sendBtn.disabled = true;
    input.placeholder = T("Chat temporariamente indisponível", "Chat temporarily unavailable");
    showNotice(T("<b>O chat está temporariamente indisponível.</b> Sua conta e suas perguntas grátis continuam preservadas. Tente novamente em instantes. Se o problema continuar, fale com a equipe pelo contato@trustio.com.br.", "<b>The chat is temporarily unavailable.</b> Your account and free questions are preserved. Try again shortly. If the issue continues, contact our team at contato@trustio.com.br."));
  }

  // Baixar e apagar só aparecem com uma conversa aberta.
  function botoesDaConversa(visiveis) { deleteBtn.hidden = !visiveis; baixarBtn.hidden = !visiveis; }

  function loadLead() {
    return sb.from("crm_leads").select("nome,email,telefone,tipo,status,papel,plano,mensagens_usadas,onboarding_seen_at,whatsapp_numero,whatsapp_trial_status,whatsapp_trial_requested_at,whatsapp_trial_started_at,whatsapp_trial_ends_at").eq("user_id", state.user.id).maybeSingle()
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
    pintarAvatar($("[data-me-av]"), name);
    var status = state.lead ? state.lead.status : "novo";
    var plan = state.lead && state.lead.plano;
    var label = semCota() && status !== "assinante" ? ({ admin: "Admin", colaborador: T("Colaborador", "Team member"), cliente: T("Cliente", "Customer") })[state.lead.papel] + (plan ? " · " + plan : "") : status === "assinante" ? (T("Assinante", "Subscriber") + (plan ? " · " + plan : "")) : status === "trial_esgotado" ? T("Teste encerrado", "Trial ended") : T("Teste grátis", "Free trial");
    $("[data-me-plan]").textContent = label;
    renderQuota(status, state.lead ? state.lead.mensagens_usadas : 0);
    renderOnboardQuota();
  }

  function renderQuota(status, used) {
    var q = $("[data-quota]");
    if (semCota() || !state.limit) { q.hidden = true; paywall.hidden = true; return; }
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
    // A abertura (welcome-hero.js) mostra o mesmo limite de perguntas grátis do widget abaixo.
    var whLimit = $("[data-wh-limit]");
    if (whLimit && state.limit > 0) { whLimit.dataset.whCount = state.limit; whLimit.textContent = state.limit; }
    var status = state.lead ? state.lead.status : "novo";
    var used = state.lead ? Number(state.lead.mensagens_usadas || 0) : 0;
    var limitEl = $("[data-ob-limit]"), bar = $("[data-ob-bar]"), txt = $("[data-ob-quota]");
    if (!limitEl) return;
    if (semCota() || !state.limit) {
      limitEl.textContent = "∞"; bar.style.width = "100%";
      txt.textContent = semCota() ? T("Plano ativo: sem limite de prompts.", "Plan active: no prompt limit.") : T("Sem limite de prompts neste ambiente.", "No prompt limit in this environment.");
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
    return sb.from("conversations").select("id,title,created_at,updated_at").eq("user_id", state.user.id).order("updated_at", { ascending: false }).limit(100)
      .then(function (r) { state.conversations = r.data || []; renderConversations(); });
  }

  function renderConversations() {
    // A lista vai ser refeita: um menu ⋯ aberto apontaria para uma linha que deixa de existir.
    fecharMenuConversa();
    convList.querySelectorAll(".conv-row").forEach(function (n) { n.remove(); });
    var busca = $("[data-conv-busca]");
    busca.hidden = state.conversations.length < 2;
    var termo = normalizar(state.filtro);
    var visiveis = state.conversations.filter(function (c) { return !termo || normalizar(c.title || "").indexOf(termo) >= 0; });
    convEmpty.hidden = visiveis.length > 0;
    convEmpty.textContent = state.conversations.length ? T("Nenhuma conversa com esse termo.", "No conversation matches that.") : T("Nenhuma conversa ainda.", "No conversations yet.");
    visiveis.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "conv-row"; row.dataset.id = c.id;
      var b = document.createElement("button");
      b.type = "button"; b.className = "conv-item"; b.textContent = c.title || T("Conversa", "Conversation");
      if (c.id === state.conversationId) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { openConversation(c.id); closeSide(); });
      var mais = document.createElement("button");
      mais.type = "button"; mais.className = "conv-mais"; mais.textContent = "⋯";
      mais.setAttribute("aria-label", T("Opções da conversa: ", "Conversation options: ") + (c.title || ""));
      mais.setAttribute("aria-haspopup", "menu"); mais.setAttribute("aria-expanded", "false");
      mais.addEventListener("click", function (e) { e.stopPropagation(); abrirMenuConversa(row, c, mais); });
      row.appendChild(b); row.appendChild(mais);
      convList.appendChild(row);
    });
  }
  function normalizar(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

  // Menu ⋯ de cada conversa: renomear, baixar, apagar.
  var menuAberto = null;
  function fecharMenuConversa() {
    if (!menuAberto) return;
    menuAberto.menu.remove();
    menuAberto.botao.setAttribute("aria-expanded", "false");
    menuAberto = null;
  }
  function abrirMenuConversa(row, c, botao) {
    var eraEste = menuAberto && menuAberto.botao === botao;
    fecharMenuConversa();
    if (eraEste) return;
    var menu = document.createElement("div");
    menu.className = "conv-menu"; menu.setAttribute("role", "menu");
    [["renomear", T("Renomear", "Rename")], ["baixar", T("Baixar (.md)", "Download (.md)")], ["apagar", T("Apagar", "Delete")]].forEach(function (op) {
      var item = document.createElement("button");
      item.type = "button"; item.setAttribute("role", "menuitem"); item.dataset.op = op[0]; item.textContent = op[1];
      if (op[0] === "apagar") item.className = "is-perigo";
      item.addEventListener("click", function () {
        fecharMenuConversa();
        if (op[0] === "renomear") renomearConversa(row, c);
        else if (op[0] === "baixar") baixarConversas([c]);
        else apagarConversa(c.id);
      });
      menu.appendChild(item);
    });
    // No body, com posição fixa: dentro da lista (que rola) o menu seria cortado perto do fim.
    document.body.appendChild(menu);
    var r = botao.getBoundingClientRect(), h = menu.offsetHeight;
    menu.style.left = Math.max(8, r.right - menu.offsetWidth) + "px";
    menu.style.top = (r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + "px";
    botao.setAttribute("aria-expanded", "true");
    menuAberto = { menu: menu, botao: botao };
    menu.querySelector("button").focus();
  }
  document.addEventListener("click", function (e) { if (menuAberto && !e.target.closest(".conv-menu")) fecharMenuConversa(); });
  convList.addEventListener("scroll", fecharMenuConversa);
  window.addEventListener("resize", fecharMenuConversa);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menuAberto) { var b = menuAberto.botao; fecharMenuConversa(); b.focus(); } });

  function renomearConversa(row, c) {
    var campo = document.createElement("input");
    campo.className = "conv-renomear"; campo.value = c.title || ""; campo.maxLength = 80;
    campo.setAttribute("aria-label", T("Novo nome da conversa", "New conversation name"));
    row.classList.add("is-editando");
    row.insertBefore(campo, row.firstChild);
    campo.focus(); campo.select();
    var feito = false;
    function concluir(salvar) {
      if (feito) return; feito = true;
      var titulo = campo.value.trim().slice(0, 80);
      row.classList.remove("is-editando"); campo.remove();
      if (!salvar || !titulo || titulo === c.title) return;
      var antigo = c.title;
      c.title = titulo; renderConversations();
      if (c.id === state.conversationId) convTitle.textContent = titulo;
      sb.from("conversations").update({ title: titulo }).eq("id", c.id).then(function (r) {
        if (!r.error) return;
        c.title = antigo; renderConversations();
        if (c.id === state.conversationId) convTitle.textContent = antigo;
        showNotice(T("Não foi possível renomear agora. Tente de novo.", "We couldn't rename it right now. Try again."));
      });
    }
    campo.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); concluir(true); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); concluir(false); }
    });
    campo.addEventListener("blur", function () { concluir(true); });
  }

  function apagarConversa(id) {
    if (state.sending) return;
    if (!confirm(T("Apagar esta conversa? Isso não pode ser desfeito.", "Delete this conversation? This can't be undone."))) return;
    sb.from("conversations").delete().eq("id", id).then(function (r) {
      if (r.error) { showNotice(T("Não foi possível apagar agora. Tente de novo.", "We couldn't delete it right now. Try again.")); return; }
      state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
      if (state.conversationId === id) resetThread(); else renderConversations();
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
    botoesDaConversa(false);
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
    botoesDaConversa(true);
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
    el.innerHTML = "<span class=\"msg-av\" aria-hidden=\"true\">" + (role === "user" ? "" : "T") + "</span><div class=\"msg-body\"></div>";
    if (role === "user") pintarAvatarMensagem(el.querySelector(".msg-av"));
    var body = el.querySelector(".msg-body");
    if (role === "user") body.innerHTML = renderUsuario(content); else body.innerHTML = render(content);
    inner.appendChild(el);
    return el;
  }

  // Mensagem do usuário: texto como veio, e cada anexo (texto extraído por OCR) recolhido.
  var RE_ANEXO = /\n*\[\[anexo: ([^\]\n]*)\]\]\n([\s\S]*?)\n\[\[\/anexo\]\]/g;
  function renderUsuario(content) {
    var html = "", ultimo = 0, m, texto = String(content || "");
    RE_ANEXO.lastIndex = 0;
    function trecho(t) { t = t.trim(); return t ? "<p>" + esc(t).replace(/\n/g, "<br>") + "</p>" : ""; }
    while ((m = RE_ANEXO.exec(texto))) {
      html += trecho(texto.slice(ultimo, m.index));
      html += "<details class=\"msg-anexo\"><summary><span aria-hidden=\"true\">📎</span> " + esc(m[1]) + "</summary><pre>" + esc(m[2]) + "</pre></details>";
      ultimo = RE_ANEXO.lastIndex;
    }
    return html + trecho(texto.slice(ultimo));
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
    if (state.sending || state.sessaoCheia) return;
    if (anexos.some(function (a) { return a.estado === "lendo"; })) {
      showNotice(T("Aguarde terminar a leitura dos anexos.", "Wait for the attachments to finish reading."));
      return;
    }
    // Anexo que não pôde ser lido não some calado do envio: a pessoa decide (tira e manda).
    var ruins = anexos.filter(function (a) { return a.estado === "erro" || a.estado === "vazio"; });
    if (ruins.length) {
      showNotice(esc(T("Remova antes de enviar o que não pôde ser lido: ", "Remove what couldn't be read before sending: ") + ruins.map(function (a) { return a.nome; }).join(", ")));
      return;
    }
    var prontos = anexos.filter(function (a) { return a.estado === "pronto"; });
    if (!text && !prontos.length) return;
    // O que foi digitado e os anexos, para devolver à caixa se o envio for recusado.
    var rascunho = { texto: text, anexos: anexos.slice() };
    // Texto digitado nunca vira bloco de anexo na tela.
    text = semMarcador(text);
    if (!text) text = T("Analise o conteúdo dos anexos.", "Analyze the content of the attachments.");
    if (text.length > LIMITE_MENSAGEM - 1000) {
      showNotice(T("Mensagem longa demais. Divida em partes menores.", "Message too long. Split it into smaller parts."));
      return;
    }
    if (state.fechado) { input.value = ""; autosize(); return; }
    if (!state.user.email_confirmed_at) { showNotice(T("Confirme seu e-mail antes de conversar. ", "Confirm your email before chatting. ") + "<button type=\"button\" data-resend-confirm>" + T("Reenviar link", "Resend link") + "</button>"); return; }
    state.sending = true;
    // Mandar mensagem também é escolher: a retomada pendente não troca mais de conversa.
    state.escolhas++;
    showNotice("");
    input.value = ""; autosize();
    sendBtn.disabled = true; input.disabled = true;
    text += blocosDeAnexo(prontos, LIMITE_MENSAGEM - text.length);
    // As fotos também vão como imagem (cópia reduzida), para o modelo ver o que não é texto.
    var imagens = prontos.filter(function (a) { return a.imagem; }).map(function (a) { return a.imagem; });
    anexos = []; renderAnexos();
    var userEl = appendMessage("user", text);
    // Envio recusado antes de começar: a mensagem sai da conversa e volta para a caixa.
    function devolverRascunho() {
      if (userEl.parentNode) userEl.remove();
      input.value = rascunho.texto; autosize();
      anexos = rascunho.anexos; renderAnexos();
    }
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
        body: JSON.stringify(imagens.length
          ? { conversation_id: state.conversationId, message: text, imagens: imagens }
          : { conversation_id: state.conversationId, message: text })
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
      if (code === "sem_sessao" || (err && err.status === 401)) { location.replace(CFG.loginPath); return; }
      devolverRascunho();
      if (code === "trial_esgotado") { pending.remove(); if (state.lead) { state.lead.status = "trial_esgotado"; state.lead.mensagens_usadas = state.limit; } renderMe(); }
      else if (code === "email_nao_confirmado") { pending.remove(); showNotice(T("Confirme seu e-mail antes de conversar. ", "Confirm your email before chatting. ") + "<button type=\"button\" data-resend-confirm>" + T("Reenviar link", "Resend link") + "</button>"); }
      else if (code === "chat_ainda_fechado") { pending.remove(); fechar(true, (err && err.data) || {}); }
      else if (code === "modelo_nao_configurado") { pending.remove(); fechar(true, { motivo: "sem_modelo" }); }
      else if (code === "contexto_cheio") { pending.remove(); sessaoCheia((err && err.data && err.data.janela) || 0); }
      else if (code === "mensagem_longa") { pending.remove(); showNotice(T("Mensagem longa demais, mesmo com os anexos cortados. Divida em partes menores.", "Message too long, even with the attachments trimmed. Split it into smaller parts.")); }
      else if (code === "modelo_indisponivel") { pending.remove(); showNotice(T("O modelo não respondeu agora. Tente novamente em instantes.", "The model didn't respond just now. Try again in a moment.")); }
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
      if (!semCota()) state.lead.status = (d.remaining === 0) ? "trial_esgotado" : "ativo";
    }
    if (typeof d.limit === "number" && d.limit > 0) state.limit = d.limit;
    renderMe();
    var known = state.conversations.some(function (c) { return c.id === d.conversation_id; });
    if (!known) loadConversations().then(function () {
      var c = state.conversations.filter(function (x) { return x.id === d.conversation_id; })[0];
      if (c) convTitle.textContent = c.title;
      botoesDaConversa(true);
    }); else {
      state.conversations.sort(function (a, b) { return a.id === d.conversation_id ? -1 : b.id === d.conversation_id ? 1 : 0; });
      renderConversations();
    }
  }

  // ---------------------------------------------------------------- anexos (fotos e PDFs, OCR no navegador)
  // Até 3 arquivos por envio. O arquivo não sai do aparelho: assets/ocr.js extrai o texto
  // aqui, e o texto vai junto da mensagem, em blocos [[anexo: …]] … [[/anexo]]; das fotos vai
  // também uma cópia reduzida, para o modelo ver o que não é texto.
  // LIMITE_MENSAGEM acompanha o teto da função chat (40 mil), com folga para os marcadores.
  var MAX_ANEXOS = 3, MAX_BYTES = 10 * 1024 * 1024, MAX_TEXTO_ANEXO = 12000, MAX_TEXTO_TOTAL = 30000, LIMITE_MENSAGEM = 39000;
  // "[[anexo" digitado ou dentro de um documento não pode abrir nem fechar um bloco de anexo:
  // um espaço invisível entre os colchetes desfaz o marcador sem mudar o que se lê.
  function semMarcador(t) { return String(t || "").replace(/\[\[(?=\s*\/?\s*anexo)/gi, "[\u200b["); }
  var anexos = [], seqAnexo = 0;
  var anexosEl = $("[data-anexos]"), fileInput = $("[data-file]"), attachBtn = $("[data-attach]");

  function ehPdf(f) { return f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""); }
  function tipoAceito(f) { return ehPdf(f) || /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type || ""); }

  function adicionarArquivos(lista) {
    var avisos = [];
    Array.prototype.slice.call(lista || []).forEach(function (f) {
      var nome = f.name || T("imagem", "image");
      if (anexos.length >= MAX_ANEXOS) { avisos.push(T("Máximo de 3 arquivos por envio.", "Up to 3 files per message.")); return; }
      if (!tipoAceito(f)) { avisos.push(nome + ": " + T("envie foto (JPG, PNG, WebP) ou PDF.", "send a photo (JPG, PNG, WebP) or a PDF.")); return; }
      if (f.size > MAX_BYTES) { avisos.push(nome + ": " + T("passa de 10 MB.", "is over 10 MB.")); return; }
      var a = { id: ++seqAnexo, file: f, nome: nome, pdf: ehPdf(f), estado: "lendo", progresso: 0 };
      anexos.push(a);
      lerAnexo(a);
    });
    avisos = avisos.filter(function (x, i) { return avisos.indexOf(x) === i; });
    if (avisos.length) showNotice(avisos.map(esc).join("<br>"));
    renderAnexos();
  }

  function lerAnexo(a) {
    if (!window.TrustioOCR) { a.estado = "erro"; renderAnexos(); return; }
    window.TrustioOCR.extrair(a.file, function (p) {
      a.progresso = p;
      var el = anexosEl.querySelector("[data-anexo-id=\"" + a.id + "\"] .anexo-estado");
      if (el) el.textContent = T("lendo ", "reading ") + Math.round(p * 100) + "%";
    }).catch(function (err) {
      // Foto em que o OCR falha ainda pode ir como imagem; PDF que não lê é erro.
      console.error("ocr", err);
      if (a.pdf) throw err;
      return { texto: "", paginas: 1, lidas: 1, ocr: 1 };
    }).then(function (r) {
      // Foto: além do texto, uma cópia reduzida vai para o modelo ver a imagem.
      if (a.pdf) return [r, null];
      return window.TrustioOCR.miniatura(a.file)
        .then(function (url) { return [r, url]; }, function (err) { console.error("miniatura", err); return [r, null]; });
    }).then(function (par) {
      if (anexos.indexOf(a) < 0) return; // removido enquanto lia
      var r = par[0];
      a.texto = r.texto; a.info = r; a.imagem = par[1];
      a.estado = r.texto || a.imagem ? "pronto" : "vazio";
      renderAnexos();
    }).catch(function (err) {
      console.error("ocr", err);
      if (anexos.indexOf(a) < 0) return;
      a.estado = "erro"; renderAnexos();
    });
  }

  function descricaoAnexo(a) {
    if (a.estado === "lendo") return T("lendo ", "reading ") + Math.round((a.progresso || 0) * 100) + "%";
    if (a.estado === "erro") return T("não foi possível ler", "couldn't read it");
    if (a.estado === "vazio") return T("sem texto legível", "no readable text");
    var n = (a.texto || "").length, pags = a.pdf && a.info ? a.info.paginas : 0;
    if (!a.pdf) return n ? T("foto · ", "photo · ") + n.toLocaleString(LOCAL) + T(" caracteres", " characters") : T("foto", "photo");
    return (pags ? pags + (pags === 1 ? T(" página · ", " page · ") : T(" páginas · ", " pages · ")) : "") + n.toLocaleString(LOCAL) + T(" caracteres", " characters");
  }

  function renderAnexos() {
    anexosEl.hidden = !anexos.length;
    anexosEl.innerHTML = anexos.map(function (a) {
      return "<div class=\"anexo-chip is-" + a.estado + "\" data-anexo-id=\"" + a.id + "\">" +
        "<span class=\"anexo-ico\" aria-hidden=\"true\">" + (a.pdf ? "PDF" : "IMG") + "</span>" +
        "<span class=\"anexo-txt\"><b>" + esc(a.nome) + "</b><small class=\"anexo-estado\">" + esc(descricaoAnexo(a)) + "</small></span>" +
        "<button type=\"button\" class=\"anexo-x\" data-anexo-remove aria-label=\"" + esc(T("Remover ", "Remove ") + a.nome) + "\">×</button></div>";
    }).join("");
    // Os botões ficam sobre a caixa de texto; a fileira de anexos acima dela os empurra junto.
    composer.style.setProperty("--anexos-h", (anexos.length ? anexosEl.offsetHeight + 8 : 0) + "px");
    attachBtn.disabled = anexos.length >= MAX_ANEXOS;
    attachBtn.title = anexos.length >= MAX_ANEXOS ? T("Máximo de 3 arquivos por envio", "Up to 3 files per message") : T("Anexar foto ou PDF (até 3)", "Attach a photo or PDF (up to 3)");
  }

  // Blocos que vão para o modelo, com teto por anexo e no total (o contexto do modelo é finito).
  function blocosDeAnexo(lista, orcamento) {
    // Orçamento = o que sobra do limite da mensagem depois do texto digitado; os marcadores
    // e nomes também contam (reserva de 200 por anexo).
    var out = "", usado = 0, teto_total = Math.min(MAX_TEXTO_TOTAL, Math.max(0, (orcamento || MAX_TEXTO_TOTAL) - 200 * lista.length));
    lista.forEach(function (a) {
      var livre = teto_total - usado; if (livre <= 200) return;
      // Foto sem texto: o bloco registra no histórico que houve uma foto (a imagem vai à parte).
      var teto = Math.min(MAX_TEXTO_ANEXO, livre), txt = semMarcador(a.texto) || T("(foto sem texto legível; a imagem só vai ao modelo na mensagem em que foi anexada)", "(photo with no readable text; the image only goes to the model in the message it was attached to)"), cortado = txt.length > teto;
      if (cortado) txt = txt.slice(0, teto);
      usado += txt.length;
      var pags = a.pdf && a.info ? a.info.paginas : 0;
      var titulo = a.nome.replace(/[\[\]\n]/g, " ") + (a.pdf ? "" : T(" · foto", " · photo")) + (pags ? " · " + pags + (pags === 1 ? T(" página", " page") : T(" páginas", " pages")) : "") + (cortado ? T(" · texto cortado", " · text truncated") : "");
      out += "\n\n[[anexo: " + titulo + "]]\n" + txt + "\n[[/anexo]]";
    });
    return out;
  }

  attachBtn.addEventListener("click", function () { if (!attachBtn.disabled) fileInput.click(); });
  fileInput.addEventListener("change", function () { adicionarArquivos(fileInput.files); fileInput.value = ""; });
  anexosEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-anexo-remove]"); if (!b) return;
    var id = Number(b.closest("[data-anexo-id]").dataset.anexoId);
    anexos = anexos.filter(function (a) { return a.id !== id; });
    renderAnexos(); input.focus();
  });
  // Colar uma imagem (print) e arrastar arquivos para a conversa também anexam.
  input.addEventListener("paste", function (e) {
    var cd = e.clipboardData; if (!cd || !cd.files || !cd.files.length) return;
    var aceitos = Array.prototype.filter.call(cd.files, tipoAceito);
    if (!aceitos.length) return; // nada anexável: a colagem segue normal
    // Com texto junto (ex.: trecho de página com imagem), o texto entra na caixa normalmente.
    if (!cd.getData("text/plain")) e.preventDefault();
    adicionarArquivos(aceitos);
  });
  ["dragover", "drop"].forEach(function (ev) {
    composer.addEventListener(ev, function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") < 0) return;
      e.preventDefault();
      if (ev === "drop") adicionarArquivos(e.dataTransfer.files);
    });
  });

  // ---------------------------------------------------------------- UI
  composer.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.isComposing) return;
    // Preferência "Enter envia": ligada, Enter envia e Shift+Enter quebra a linha; desligada,
    // Enter quebra a linha e Ctrl+Enter (⌘+Enter no Mac) envia.
    var envia = state.pref.enter_envia ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (envia) { e.preventDefault(); send(input.value); }
  });
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(220, input.scrollHeight) + "px"; }
  input.addEventListener("input", autosize);

  // Sugestões e templates são rascunhos editáveis, tratados em chat-templates.js.

  $("[data-new]").addEventListener("click", function () { if (!state.sending) { resetThread(); input.focus(); closeSide(); } });

  deleteBtn.addEventListener("click", function () { if (state.conversationId) apagarConversa(state.conversationId); });
  baixarBtn.addEventListener("click", function () {
    var c = state.conversations.filter(function (x) { return x.id === state.conversationId; })[0];
    if (c) baixarConversas([c]);
  });
  $("[data-conv-busca]").addEventListener("input", function (e) { state.filtro = e.target.value; renderConversations(); });

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

  // ---------------------------------------------------------------- minha conta
  // Preferências (tabela preferencias_usuario: só a própria pessoa lê e grava; a função do chat
  // lê estilo, instruções e modelo), foto de perfil (bucket privado "avatares", pasta da conta),
  // exportar e apagar conversas, senha e sessões.
  var PH_ENTER = input.getAttribute("placeholder") || "";
  var PH_CTRL = T("Escreva sua mensagem… (Ctrl+Enter ou ⌘+Enter envia)", "Write your message… (Ctrl+Enter or ⌘+Enter sends)");
  // Cada foto tem nome próprio (derivado de avatar_em): a nova é enviada ao lado da antiga, e a
  // antiga só sai depois que a nova ficou registrada. Uma falha no meio não apaga as duas.
  function caminhoDaFoto(em) { return state.user.id + "/avatar-" + Date.parse(em) + ".jpg"; }
  // Deixa na pasta da conta só o arquivo "manter" (ou nenhum): a foto anterior e qualquer sobra
  // de falha antiga saem. Lista em lotes de 100 até não sobrar nada; erro é repassado.
  function limparPastaDeFotos(manter) {
    var pasta = state.user.id, voltas = 0;
    function lote() {
      return sb.storage.from("avatares").list(pasta, { limit: 100 }).then(function (r) {
        if (r.error) throw r.error;
        var sobras = (r.data || []).map(function (o) { return pasta + "/" + o.name; }).filter(function (c) { return c !== manter; });
        if (!sobras.length) return;
        if (++voltas > 50) throw new Error("limpeza_incompleta");
        return sb.storage.from("avatares").remove(sobras).then(function (x) { if (x.error) throw x.error; return lote(); });
      });
    }
    return lote();
  }
  // Uma operação de foto por vez: duas trocas simultâneas partiriam da mesma foto anterior.
  var fotoOcupada = false;
  function ocuparFoto(sim) {
    fotoOcupada = sim;
    $("[data-foto-trocar]").disabled = sim; $("[data-foto-remover]").disabled = sim;
  }

  function loadPrefs() {
    return sb.from("preferencias_usuario").select("estilo,instrucoes,modelo,enter_envia,fonte,avatar_em").eq("user_id", state.user.id).maybeSingle()
      .then(function (r) {
        if (r.data) Object.keys(r.data).forEach(function (k) { if (r.data[k] !== null || k === "modelo" || k === "avatar_em") state.pref[k] = r.data[k]; });
        aplicarPrefsLocais();
        if (state.pref.avatar_em) carregarAvatar();
      })
      // Sem a tabela (migração ainda não aplicada) o chat segue com o padrão.
      .catch(function () { aplicarPrefsLocais(); });
  }
  function aplicarPrefsLocais() {
    shell.dataset.fonte = state.pref.fonte === "grande" ? "grande" : "normal";
    state.placeholderPadrao = state.pref.enter_envia ? PH_ENTER : PH_CTRL;
    if (!state.fechado && !state.sessaoCheia) input.placeholder = state.placeholderPadrao;
  }
  function salvarPrefs(mudancas) {
    var linha = Object.assign({ user_id: state.user.id }, mudancas);
    return sb.from("preferencias_usuario").upsert(linha, { onConflict: "user_id" }).then(function (r) {
      if (r.error) throw r.error;
      Object.assign(state.pref, mudancas);
      aplicarPrefsLocais();
    });
  }

  // Foto: baixada com a sessão (o bucket é privado) e mostrada por blob: URL, que a CSP aceita.
  function carregarAvatar() {
    return sb.storage.from("avatares").download(caminhoDaFoto(state.pref.avatar_em)).then(function (r) {
      if (r.error || !r.data) return;
      trocarAvatarUrl(URL.createObjectURL(r.data));
    }).catch(function () { /* sem foto: ficam as iniciais */ });
  }
  function trocarAvatarUrl(url) {
    if (state.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
    state.avatarUrl = url;
    pintarTodosAvatares();
  }
  function nomeAtual() {
    var meta = (state.user && state.user.user_metadata) || {};
    return (state.lead && state.lead.nome) || meta.nome || (state.user && state.user.email) || "";
  }
  function pintarAvatar(el, nome) {
    if (!el) return;
    el.textContent = "";
    if (state.avatarUrl) {
      var img = document.createElement("img");
      img.src = state.avatarUrl; img.alt = ""; img.decoding = "async";
      el.appendChild(img); el.classList.add("tem-foto");
    } else {
      el.textContent = initials(nome || nomeAtual(), state.user && state.user.email);
      el.classList.remove("tem-foto");
    }
  }
  function pintarAvatarMensagem(el) {
    if (state.avatarUrl) pintarAvatar(el); else { el.textContent = T("VC", "YOU"); el.classList.remove("tem-foto"); }
  }
  function pintarTodosAvatares() {
    pintarAvatar($("[data-me-av]"));
    pintarAvatar($("[data-conta-av]"));
    document.querySelectorAll(".msg-user .msg-av").forEach(pintarAvatarMensagem);
    // Segue o registro, não a imagem carregada: com registro e arquivo sumido, ainda dá para limpar.
    $("[data-foto-remover]").hidden = !state.pref.avatar_em;
  }

  // Recorta no centro, reduz para 256 px e grava em JPEG (~20 KB), sem metadados da câmera.
  function prepararFoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var lado = Math.min(img.naturalWidth, img.naturalHeight), alvo = 256;
        var c = document.createElement("canvas"); c.width = alvo; c.height = alvo;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, alvo, alvo);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("canvas")); }, "image/jpeg", 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("imagem_invalida")); };
      img.src = url;
    });
  }
  var fotoFile = $("[data-foto-file]"), fotoStatus = $("[data-foto-status]");
  $("[data-foto-trocar]").addEventListener("click", function () { if (!fotoOcupada) fotoFile.click(); });
  fotoFile.addEventListener("change", function () {
    var f = fotoFile.files && fotoFile.files[0]; fotoFile.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) { fotoStatus.textContent = T("Use uma foto JPG, PNG ou WebP.", "Use a JPG, PNG or WebP photo."); return; }
    if (f.size > 15 * 1024 * 1024) { fotoStatus.textContent = T("Foto grande demais (máximo 15 MB).", "Photo too large (15 MB max)."); return; }
    if (fotoOcupada) return;
    ocuparFoto(true);
    fotoStatus.textContent = T("Enviando…", "Uploading…");
    var agora = new Date().toISOString(), novo;
    prepararFoto(f).then(function (blob) {
      novo = caminhoDaFoto(agora);
      return sb.storage.from("avatares").upload(novo, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" }).then(function (r) {
        if (r.error) throw r.error;
        return salvarPrefs({ avatar_em: agora }).then(function () {
          trocarAvatarUrl(URL.createObjectURL(blob));
          // A anterior só sai agora, com a nova já registrada, e ainda dentro da trava: nenhuma
          // outra troca começa antes de a limpeza terminar. Se ela falhar, a próxima troca ou
          // remoção limpa (a pasta inteira é conferida), e a foto nova continua valendo.
          return limparPastaDeFotos(novo).catch(function (err) { console.error("limpeza_fotos", err); });
        }, function (err) {
          // A marca não gravou: sai só o arquivo novo, e a foto anterior continua valendo.
          return sb.storage.from("avatares").remove([novo]).then(function () { throw err; }, function () { throw err; });
        });
      });
    }).then(function () { fotoStatus.textContent = T("Foto atualizada.", "Photo updated."); })
      .catch(function (err) { console.error("foto", err); fotoStatus.textContent = T("Não foi possível enviar a foto. Tente de novo.", "We couldn't upload the photo. Try again."); })
      .then(function () { ocuparFoto(false); });
  });
  $("[data-foto-remover]").addEventListener("click", function () {
    if (!state.pref.avatar_em || fotoOcupada) return;
    ocuparFoto(true);
    fotoStatus.textContent = T("Removendo…", "Removing…");
    // Primeiro saem os arquivos; o registro só é limpo com a pasta vazia. Se algo falhar no
    // caminho, o registro fica e o botão Remover continua lá para tentar de novo.
    limparPastaDeFotos(null).then(function () {
      // Os arquivos já saíram (era o pedido): a tela deixa de mostrar a foto na hora.
      if (state.avatarUrl) URL.revokeObjectURL(state.avatarUrl);
      state.avatarUrl = null; pintarTodosAvatares();
      return salvarPrefs({ avatar_em: null }).then(function () {
        pintarTodosAvatares();
        fotoStatus.textContent = T("Foto removida.", "Photo removed.");
      }, function () {
        // Só o registro ficou para trás: o botão Remover continua para concluir.
        fotoStatus.textContent = T("A foto foi apagada, mas o registro não atualizou. Clique em Remover de novo para concluir.", "The photo was deleted, but the record didn't update. Click Remove again to finish.");
      });
    }).catch(function () { fotoStatus.textContent = T("Não foi possível remover agora. Tente de novo.", "We couldn't remove it right now. Try again."); })
      .then(function () { ocuparFoto(false); });
  });

  // Exportar em Markdown: uma conversa (menu ⋯ ou botão do topo) ou todas (Minha conta).
  function baixarArquivo(nome, texto) {
    var url = URL.createObjectURL(new Blob([texto], { type: "text/markdown;charset=utf-8" }));
    var a = document.createElement("a"); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function conversaEmMarkdown(c, msgs) {
    var linhas = ["# " + (c.title || T("Conversa", "Conversation")), "", "_" + fmtDate(c.created_at) + "_", ""];
    msgs.forEach(function (m) {
      linhas.push("**" + (m.role === "user" ? T("Você", "You") : "Trustio") + "** · " + fmtDate(m.created_at), "", String(m.content || "").trim(), "", "---", "");
    });
    return linhas.join("\n");
  }
  // Busca em páginas de 500: a API do banco corta respostas grandes, e um arquivo exportado
  // não pode sair faltando pedaço sem aviso.
  var PAGINA = 500;
  function emPaginas(consulta) {
    var tudo = [];
    function pagina(de) {
      return consulta().range(de, de + PAGINA - 1).then(function (r) {
        if (r.error) throw r.error;
        var linhas = r.data || [];
        tudo = tudo.concat(linhas);
        return linhas.length < PAGINA ? tudo : pagina(de + PAGINA);
      });
    }
    return pagina(0);
  }
  function mensagensDe(id) {
    return emPaginas(function () {
      return sb.from("messages").select("role,content,created_at").eq("conversation_id", id).order("created_at", { ascending: true }).order("id", { ascending: true });
    });
  }
  // Todas as conversas da conta direto do banco (a barra lateral carrega só as 100 mais recentes).
  function todasAsConversas() {
    return emPaginas(function () {
      return sb.from("conversations").select("id,title,created_at").eq("user_id", state.user.id).order("created_at", { ascending: true }).order("id", { ascending: true });
    });
  }
  function totalDeConversas() {
    return sb.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", state.user.id)
      .then(function (r) { if (r.error) throw r.error; return r.count || 0; });
  }
  function baixarConversas(lista, aoProgresso) {
    var partes = [], i = 0;
    function proxima() {
      if (i >= lista.length) return Promise.resolve();
      var c = lista[i++];
      if (aoProgresso) aoProgresso(i, lista.length);
      return mensagensDe(c.id).then(function (msgs) { partes.push(conversaEmMarkdown(c, msgs)); return proxima(); });
    }
    return proxima().then(function () {
      var dia = new Date().toISOString().slice(0, 10);
      var nome = lista.length === 1
        ? "trustio-" + (normalizar(lista[0].title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "conversa") + ".md"
        : "trustio-conversas-" + dia + ".md";
      baixarArquivo(nome, partes.join("\n\n"));
      return true;
    }).catch(function () { showNotice(T("Não foi possível baixar agora. Tente de novo.", "We couldn't download it right now. Try again.")); return false; });
  }

  // ---- o painel
  var conta = $("[data-conta]");
  var abas = Array.prototype.slice.call(conta.querySelectorAll("[data-tab]"));
  function mostrarAba(nome, focar) {
    abas.forEach(function (b) {
      var ativa = b.dataset.tab === nome;
      b.setAttribute("aria-selected", ativa ? "true" : "false");
      b.tabIndex = ativa ? 0 : -1;
      if (ativa && focar) b.focus();
    });
    conta.querySelectorAll("[data-painel]").forEach(function (p) { p.hidden = p.dataset.painel !== nome; });
  }
  abas.forEach(function (b, i) {
    b.addEventListener("click", function () { mostrarAba(b.dataset.tab); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      mostrarAba(abas[(i + d + abas.length) % abas.length].dataset.tab, true);
    });
  });

  function preencherConta() {
    var l = state.lead || {};
    $("#conta-nome").value = nomeAtual() === state.user.email ? "" : nomeAtual();
    $("#conta-tel").value = fmtPhone(l.telefone || "");
    var telTravado = l.status === "assinante";
    $("#conta-tel").disabled = telTravado; $("[data-tel-travado]").hidden = !telTravado;
    $("#conta-email").value = state.user.email || "";
    $("[data-conta-plano]").textContent = $("[data-me-plan]").textContent;
    var usados = Number(l.mensagens_usadas || 0);
    $("[data-conta-uso]").textContent = semCota() || !state.limit
      ? T("Sem limite de perguntas.", "No question limit.")
      : EN ? Math.max(0, state.limit - usados) + " of " + state.limit + " free questions left" : Math.max(0, state.limit - usados) + " de " + state.limit + " perguntas grátis restantes";
    // Preferências
    var f = $("[data-pref-form]");
    f.querySelectorAll("input[name=estilo]").forEach(function (r) { r.checked = r.value === (state.pref.estilo || "equilibrado"); });
    f.instrucoes.value = state.pref.instrucoes || "";
    $("[data-instr-conta]").textContent = f.instrucoes.value.length;
    var sel = $("[data-modelo-select]");
    sel.innerHTML = "";
    var padrao = document.createElement("option"); padrao.value = ""; padrao.textContent = T("Trustio (padrão)", "Trustio (default)");
    sel.appendChild(padrao);
    state.modelos.forEach(function (m) {
      var o = document.createElement("option"); o.value = m.id; o.textContent = m.rotulo + (m.descricao ? " · " + m.descricao : "");
      sel.appendChild(o);
    });
    sel.value = state.modelos.some(function (m) { return m.id === state.pref.modelo; }) ? state.pref.modelo : "";
    sel.disabled = !state.modelos.length;
    $("[data-modelo-dica]").textContent = state.modelos.length
      ? T("O modelo escolhido vale para as próximas mensagens, em todas as conversas.", "The model you pick applies to your next messages, in every conversation.")
      : T("Por enquanto há um modelo disponível. Quando houver outros, eles aparecem aqui.", "For now there is one model available. When there are others, they'll show up here.");
    // Automático, a não ser que a pessoa tenha fixado Claro ou Escuro aqui.
    var tema = window.TrustioTema && window.TrustioTema.modo() === "fixo" ? window.TrustioTema.atual() : "auto";
    f.querySelectorAll("input[name=tema]").forEach(function (r) { r.checked = r.value === tema; });
    f.querySelectorAll("input[name=fonte]").forEach(function (r) { r.checked = r.value === (state.pref.fonte || "normal"); });
    f.enter_envia.checked = state.pref.enter_envia !== false;
    // Conversas
    function mostrarTotal(n) {
      $("[data-conv-total]").textContent = n === 0 ? T("Nenhuma conversa salva ainda.", "No saved conversations yet.")
        : EN ? n + (n === 1 ? " conversation" : " conversations") + " saved in your account."
        : n + (n === 1 ? " conversa salva" : " conversas salvas") + " na sua conta.";
      $("[data-baixar-todas]").disabled = n === 0; $("[data-apagar-todas]").disabled = n === 0;
    }
    mostrarTotal(state.conversations.length);
    // A barra lateral traz até 100; o número certo vem do banco.
    // Só vale se a lista ainda estiver cheia quando a contagem chegar (um "Apagar tudo" no meio
    // não pode ser desfeito na tela por um número antigo).
    if (state.conversations.length >= 100) totalDeConversas().then(function (n) { if (state.conversations.length >= 100) mostrarTotal(n); }).catch(function () { /* fica o da lista */ });
    conta.querySelectorAll(".conta-status").forEach(function (x) { x.textContent = ""; });
    pintarTodosAvatares();
  }

  function abrirConta() {
    if (!state.user) return;
    preencherConta();
    mostrarAba("perfil");
    closeSide();
    conta.showModal();
  }
  // O cartão do usuário e o link "Minha conta" no rodapé da barra lateral.
  document.querySelectorAll("[data-conta-open]").forEach(function (b) { b.addEventListener("click", abrirConta); });
  $("[data-conta-fechar]").addEventListener("click", function () { conta.close(); });
  // Clique fora do cartão (no fundo escurecido) fecha.
  conta.addEventListener("click", function (e) { if (e.target === conta) conta.close(); });

  $("[data-perfil-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("[data-perfil-status]"), nome = $("#conta-nome").value.trim().slice(0, 80);
    if (!nome) { st.textContent = T("Digite seu nome.", "Enter your name."); return; }
    var mudancas = { nome: nome };
    if (!$("#conta-tel").disabled) mudancas.telefone = $("#conta-tel").value.trim() || null;
    st.textContent = T("Salvando…", "Saving…");
    // Nome no cadastro (o que a equipe vê) e no perfil do login.
    sb.from("crm_leads").update(mudancas).eq("user_id", state.user.id).then(function (r) {
      if (r.error) throw r.error;
      if (state.lead) Object.assign(state.lead, mudancas);
      return sb.auth.updateUser({ data: { nome: nome } });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      if (r && r.data && r.data.user) state.user = r.data.user;
      renderMe(); pintarTodosAvatares();
      st.textContent = T("Perfil salvo.", "Profile saved.");
    }).catch(function () { st.textContent = T("Não foi possível salvar agora. Tente de novo.", "We couldn't save right now. Try again."); });
  });

  var prefForm = $("[data-pref-form]");
  prefForm.instrucoes.addEventListener("input", function () { $("[data-instr-conta]").textContent = prefForm.instrucoes.value.length; });
  // Tema e tamanho do texto mudam na hora; o resto vale ao salvar.
  prefForm.querySelectorAll("input[name=tema]").forEach(function (r) {
    r.addEventListener("change", function () {
      if (!r.checked) return;
      if (r.value === "auto") { if (window.TrustioTema) pintarTema(window.TrustioTema.automatico()); }
      else applyTheme(r.value, true);
    });
  });
  prefForm.querySelectorAll("input[name=fonte]").forEach(function (r) { r.addEventListener("change", function () { if (r.checked) shell.dataset.fonte = r.value; }); });
  prefForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("[data-pref-status]");
    var escolhido = prefForm.querySelector("input[name=estilo]:checked");
    var fonte = prefForm.querySelector("input[name=fonte]:checked");
    st.textContent = T("Salvando…", "Saving…");
    salvarPrefs({
      estilo: escolhido ? escolhido.value : "equilibrado",
      instrucoes: prefForm.instrucoes.value.trim().slice(0, 1500),
      modelo: prefForm.modelo.value || null,
      fonte: fonte ? fonte.value : "normal",
      enter_envia: prefForm.enter_envia.checked
    }).then(function () { st.textContent = T("Preferências salvas. Valem a partir da próxima mensagem.", "Preferences saved. They apply from your next message."); })
      .catch(function () { st.textContent = T("Não foi possível salvar agora. Tente de novo.", "We couldn't save right now. Try again."); });
  });

  $("[data-baixar-todas]").addEventListener("click", function () {
    var st = $("[data-conv-status]"), b = this;
    b.disabled = true;
    st.textContent = T("Preparando…", "Preparing…");
    todasAsConversas().then(function (lista) {
      return baixarConversas(lista, function (i, n) { st.textContent = T("Preparando ", "Preparing ") + i + "/" + n + "…"; });
    }).then(function (ok) {
      st.textContent = ok ? T("Arquivo pronto.", "File ready.") : T("Não foi possível baixar agora. Tente de novo.", "We couldn't download it right now. Try again.");
    }).catch(function () { st.textContent = T("Não foi possível baixar agora. Tente de novo.", "We couldn't download it right now. Try again."); })
      .then(function () { b.disabled = false; });
  });
  $("[data-apagar-todas]").addEventListener("click", function () {
    if (state.sending) return;
    var st = $("[data-conv-status]");
    // A contagem vem do banco, não da barra lateral: é o que a exclusão vai apagar de fato.
    totalDeConversas().then(function (n) {
      if (!n) { st.textContent = T("Nenhuma conversa para apagar.", "No conversations to delete."); return null; }
      if (!confirm(EN ? "Delete all " + n + " conversations? This can't be undone." : "Apagar as " + n + " conversas? Isso não pode ser desfeito.")) return null;
      st.textContent = T("Apagando…", "Deleting…");
      return sb.from("conversations").delete().eq("user_id", state.user.id);
    }).then(function (r) {
      if (r === null) return;
      if (r.error) throw r.error;
      state.conversations = []; resetThread(); preencherConta();
      st.textContent = T("Todas as conversas foram apagadas.", "All conversations were deleted.");
    }).catch(function () { st.textContent = T("Não foi possível apagar agora. Tente de novo.", "We couldn't delete them right now. Try again."); });
  });

  $("[data-senha-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("[data-senha-status]"), a = $("#conta-senha").value, b = $("#conta-senha2").value;
    if (a.length < 8) { st.textContent = T("A senha precisa de pelo menos 8 caracteres.", "The password needs at least 8 characters."); return; }
    if (a !== b) { st.textContent = T("As duas senhas não são iguais.", "The two passwords don't match."); return; }
    st.textContent = T("Salvando…", "Saving…");
    sb.auth.updateUser({ password: a }).then(function (r) {
      if (r.error) throw r.error;
      $("#conta-senha").value = ""; $("#conta-senha2").value = "";
      st.textContent = T("Senha trocada.", "Password changed.");
    }).catch(function (err) {
      var m = String((err && err.message) || "");
      st.textContent = /different from the old|same/i.test(m) ? T("A nova senha precisa ser diferente da atual.", "The new password must differ from the current one.")
        : /weak|short|characters/i.test(m) ? T("Senha fraca demais. Use letras, números e mais caracteres.", "Password too weak. Use letters, numbers and more characters.")
        : T("Não foi possível trocar agora. Tente de novo.", "We couldn't change it right now. Try again.");
    });
  });
  $("[data-sair-outros]").addEventListener("click", function () {
    var st = $("[data-seg-status]");
    st.textContent = T("Encerrando…", "Signing out…");
    sb.auth.signOut({ scope: "others" }).then(function (r) {
      if (r && r.error) throw r.error;
      st.textContent = T("Pronto: os outros aparelhos foram desconectados.", "Done: your other devices were signed out.");
    }).catch(function () { st.textContent = T("Não foi possível agora. Tente de novo.", "That didn't work right now. Try again."); });
  });

  // Tema (mesma chave do site).
  var toggle = $(".theme-toggle");
  // Barra do navegador no celular na cor do fundo do chat (cinza-escuro ou claro).
  var themeColor = document.querySelector('meta[name="theme-color"]');
  function paintThemeColor(t) { if (themeColor) themeColor.setAttribute("content", t === "light" ? "#f4f6fa" : "#1e1f22"); }
  function pintarTema(t) {
    if (t === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    paintThemeColor(t);
    toggle.setAttribute("aria-pressed", t === "light" ? "true" : "false");
  }
  // Botão de tema: vale até a próxima troca de horário. fixo (Minha conta): vale sempre.
  function applyTheme(t, fixo) {
    pintarTema(t);
    if (window.TrustioTema) window.TrustioTema.escolher(t, fixo);
    else try { localStorage.setItem("trustio-theme", t); } catch (e) { /* sem storage */ }
  }
  toggle.addEventListener("click", function () { applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"); });
  // Troca automática de horário (05:00 claro, 19:01 escuro) com o chat aberto.
  document.addEventListener("trustio:tema", function (e) { pintarTema(e.detail); });
  toggle.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "light" ? "true" : "false");
  paintThemeColor(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

  boot();
})();
