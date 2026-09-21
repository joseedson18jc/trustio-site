/* assets/admin.js — painel mestre (/admin/).
   Só administradores enxergam dados: as políticas RLS no banco garantem isso,
   independentemente desta página. Nenhum segredo trafega aqui. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var shell = $(".crm-shell"), gate = $("[data-gate]");
  var conf = {};   // app_settings em memória

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(d) { if (!d) return "—"; var x = new Date(d); return x.toLocaleDateString("pt-BR") + " " + x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function aviso(chave, texto, tipo) {
    var el = $("[data-status='" + chave + "']"); if (!el) return;
    el.textContent = texto || ""; el.className = "admin-status" + (tipo ? " is-" + tipo : "");
    if (tipo === "ok") setTimeout(function () { if (el.textContent === texto) { el.textContent = ""; el.className = "admin-status"; } }, 4000);
  }
  function gateShow(t, p, acoes) { gate.hidden = false; $("[data-gate-title]").textContent = t; $("[data-gate-text]").textContent = p; $("[data-gate-actions]").hidden = !acoes; }

  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace(CFG.loginPath); });
  $("[data-logout]").addEventListener("click", function () { sb.auth.signOut(); });

  // ---------------------------------------------------------------- entrada
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) { gateShow("Você não está conectado", "Entre com a conta mestre para abrir o painel.", true); return; }
    $("[data-eu]").textContent = s.user.email;
    return sb.from("admins").select("user_id").eq("user_id", s.user.id).maybeSingle().then(function (a) {
      if (!a.data) { gateShow("Sem acesso ao painel", "Esta conta não é administradora.", true); return; }
      gate.hidden = true;
      return Promise.all([carregarConfig(), carregarResumo()]).then(function () {
        shell.dataset.state = "ready";
        verificarSaude();
      });
    });
  }).catch(function (e) { console.error(e); gateShow("Algo deu errado", "Recarregue a página ou entre novamente.", true); });

  // ---------------------------------------------------------------- configurações
  function carregarConfig() {
    return sb.from("app_settings").select("key,value").then(function (r) {
      (r.data || []).forEach(function (linha) { conf[linha.key] = linha.value; });
      $$("[data-set]").forEach(function (el) {
        var v = conf[el.dataset.set];
        el.value = (v === null || v === undefined) ? "" : (typeof v === "string" ? v : (typeof v === "number" ? v : JSON.stringify(v)));
      });
      var canais = Array.isArray(conf.hermes_canais) ? conf.hermes_canais : [];
      $$("[data-canal]").forEach(function (c) { c.checked = canais.indexOf(c.value) >= 0; });
      $("[data-model]").value = typeof conf.modelo_rotulo === "string" ? conf.modelo_rotulo : "—";
      pintarHermes();
    });
  }

  function pintarHermes() {
    var st = $("#h-status").value || "rascunho";
    var rotulo = { rascunho: "Rascunho", ativo: "Ativo", pausado: "Pausado" }[st] || st;
    var tag = $("[data-hermes-tag]");
    tag.textContent = rotulo;
    tag.dataset.estado = st;
  }
  $("#h-status").addEventListener("change", pintarHermes);

  function salvar(chaves, rotulo) {
    var linhas = chaves.map(function (k) {
      var el = $("[data-set='" + k + "']");
      var v;
      if (k === "free_message_limit" || k === "hermes_trial_dias") v = Math.max(0, parseInt(el.value, 10) || 0);
      else v = String(el.value);
      return { key: k, value: v, updated_at: new Date().toISOString() };
    });
    if (chaves.indexOf("hermes_status") >= 0) {
      linhas.push({ key: "hermes_canais", value: $$("[data-canal]").filter(function (c) { return c.checked; }).map(function (c) { return c.value; }), updated_at: new Date().toISOString() });
    }
    aviso(rotulo, "Salvando…");
    return sb.from("app_settings").upsert(linhas).then(function (r) {
      if (r.error) throw r.error;
      linhas.forEach(function (l) { conf[l.key] = l.value; });
      aviso(rotulo, "Salvo.", "ok");
      if (rotulo === "hermes") { pintarHermes(); verificarSaude(); }
    }).catch(function (e) { aviso(rotulo, "Não foi possível salvar: " + (e.message || e), "erro"); });
  }

  $("[data-save='chat']").addEventListener("click", function () { salvar(["system_prompt", "free_message_limit"], "chat"); });
  $("[data-save='hermes']").addEventListener("click", function () { salvar(["hermes_status", "hermes_trial_dias", "hermes_numero", "hermes_telegram", "hermes_prompt"], "hermes"); });

  // ---------------------------------------------------------------- resumo e fila
  function carregarResumo() {
    return sb.rpc("admin_overview").then(function (r) {
      if (r.error) throw r.error;
      var d = r.data || {};
      ["leads", "confirmados", "assinantes", "wa_pendentes", "wa_ativos", "mensagens"].forEach(function (k) {
        var el = $("[data-stat='" + k + "']"); if (el) el.textContent = d[k] == null ? "—" : d[k];
      });
      var ul = $("[data-admins]");
      ul.innerHTML = (d.admins || []).map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") || "<li>nenhum</li>";
      pintarFila(d.pendentes || []);
      return d;
    });
  }

  function pintarFila(itens) {
    var box = $("[data-fila]");
    $("[data-fila-tag]").textContent = itens.length ? itens.length + " pendente" + (itens.length > 1 ? "s" : "") : "em dia";
    if (!itens.length) { box.innerHTML = '<p class="admin-vazio">Nenhum pedido no momento.</p>'; return; }
    box.innerHTML = itens.map(function (p) {
      return '<div class="fila-item" data-id="' + esc(p.id) + '">' +
        "<b>" + esc(p.nome || p.email) + "</b>" +
        '<span class="num">' + esc(p.numero || "sem número") + "</span>" +
        '<span class="quando">pedido em ' + fmt(p.pedido_em) + "</span>" +
        '<button class="btn btn-primary" type="button" data-ativar>Ativar no número</button>' +
      "</div>";
    }).join("");
  }

  $("[data-fila]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ativar]"); if (!b) return;
    var id = b.closest(".fila-item").dataset.id;
    var dias = Math.max(1, parseInt($("#h-dias").value, 10) || 3);
    b.disabled = true; b.textContent = "Ativando…";
    sb.rpc("activate_whatsapp_trial", { p_lead_id: id, p_days: dias }).then(function (r) {
      if (r.error) throw r.error;
      return carregarResumo();
    }).catch(function (err) {
      b.disabled = false; b.textContent = "Ativar no número";
      alert("Não foi possível ativar: " + (err.message || err));
    });
  });

  // ---------------------------------------------------------------- trocar senha
  $("[data-senha]").addEventListener("click", function () {
    var campo = $("#nova-senha"), senha = campo.value;
    if (senha.length < 8) { aviso("senha", "Use pelo menos 8 caracteres.", "erro"); return; }
    this.disabled = true; aviso("senha", "Trocando…");
    var btn = this;
    sb.auth.updateUser({ password: senha }).then(function (r) {
      if (r.error) throw r.error;
      campo.value = ""; btn.disabled = false;
      aviso("senha", "Senha trocada.", "ok");
    }).catch(function (e) { btn.disabled = false; aviso("senha", e.message || "Não foi possível trocar.", "erro"); });
  });

  // ---------------------------------------------------------------- saúde
  function marcar(nome, estado, texto) {
    var li = $("[data-check='" + nome + "']"); if (!li) return;
    li.dataset.estado = estado; li.querySelector("span").textContent = texto;
  }

  function verificarSaude() {
    marcar("banco", "ok", "conectado, permissões de administrador ativas");

    var st = $("#h-status").value, num = String($("#h-num").value || "").trim();
    if (st === "ativo" && num) marcar("hermes", "ok", "ativo, falando de " + num);
    else if (st === "ativo") marcar("hermes", "alerta", "ativo, mas sem número oficial cadastrado");
    else marcar("hermes", "alerta", st === "pausado" ? "pausado" : "em rascunho, ainda não atende");

    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) return;
      return fetch(CFG.chatEndpoint, { method: "GET", headers: { "Authorization": "Bearer " + s.access_token, "apikey": CFG.key } })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { ok: res.ok, status: res.status, d: d }; }); })
        .then(function (r2) {
          if (!r2.ok) { marcar("funcao", "alerta", "responde, mas devolveu " + r2.status); marcar("modelo", "alerta", "não foi possível verificar"); return; }
          marcar("funcao", "ok", "no ar");
          if (r2.d.modelo_configurado) marcar("modelo", "ok", (r2.d.modelo || "modelo") + " · pronto para responder");
          else marcar("modelo", "erro", "sem chave do provedor: o chat avisa e não consome cota");
        });
    }).catch(function () {
      marcar("funcao", "erro", "sem resposta"); marcar("modelo", "erro", "não foi possível verificar");
    });
  }
  $("[data-recheck]").addEventListener("click", function () { carregarResumo(); verificarSaude(); });

  // ---------------------------------------------------------------- tema
  var toggle = $(".theme-toggle");
  toggle.addEventListener("click", function () {
    var claro = document.documentElement.getAttribute("data-theme") !== "light";
    if (claro) document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    toggle.setAttribute("aria-pressed", claro ? "true" : "false");
    try { localStorage.setItem("trustio-theme", claro ? "light" : "dark"); } catch (e) { /* sem storage */ }
  });
  toggle.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "light" ? "true" : "false");
})();
