/* assets/crm.js — painel interno de leads (/crm/). Só usuários na tabela `admins` enxergam dados:
   as políticas RLS no banco garantem isso, independentemente desta página. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var shell = $(".crm-shell"), rows = $("[data-rows]"), empty = $("[data-empty]"), gate = $("[data-gate]");
  var STATUS = ["novo", "email_confirmado", "ativo", "trial_esgotado", "assinante", "cancelado"];
  var LABEL = { novo: "Novo", email_confirmado: "E-mail confirmado", ativo: "Ativo", trial_esgotado: "Teste esgotado", assinante: "Assinante", cancelado: "Cancelado" };
  var WA = ["nao_solicitado", "solicitado", "ativo", "encerrado"];
  var WA_LABEL = { nao_solicitado: "Não pediu", solicitado: "Pedido", ativo: "Ativo", encerrado: "Encerrado" };
  // Ordem do funil, para ordenar por status do mais novo ao mais avançado.
  var STATUS_ORDEM = { novo: 0, email_confirmado: 1, ativo: 2, trial_esgotado: 3, assinante: 4, cancelado: 5 };

  var PREF = "trustio-crm-ocultar-testes";
  var state = { leads: [], filter: "", q: "", sort: { key: "created_at", dir: -1 }, ocultarTestes: lerPref(), carregadoEm: null };

  function lerPref() { try { return localStorage.getItem(PREF) !== "0"; } catch (e) { return true; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(d) { if (!d) return "—"; var x = new Date(d); return x.toLocaleDateString("pt-BR") + " " + x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function gateShow(t, p, actions) { gate.hidden = false; $("[data-gate-title]").textContent = t; $("[data-gate-text]").textContent = p; $("[data-gate-actions]").hidden = !actions; }

  // Endereços usados em testes automáticos e manuais: somem da lista (e dos números) por padrão.
  function ehTeste(l) {
    var e = String(l.email || "").toLowerCase(), local = e.split("@")[0];
    return /@resend\.dev$/.test(e) || /^(test|teste)[-+._]/.test(local);
  }
  // O último sinal de vida é o mais recente entre o login e a última mensagem no chat.
  function ultimoAcesso(l) {
    var a = l.last_seen_at ? Date.parse(l.last_seen_at) : 0, b = l.ultima_mensagem ? Date.parse(l.ultima_mensagem) : 0;
    var m = Math.max(a || 0, b || 0);
    return m ? new Date(m).toISOString() : null;
  }
  // Telefone brasileiro: só dígitos, com ou sem 55. Válido = DDD + 8 ou 9 dígitos.
  function telefone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    var ok = d.length === 10 || d.length === 11;
    var txt = ok ? "(" + d.slice(0, 2) + ") " + (d.length === 11 ? d.slice(2, 7) + "-" + d.slice(7) : d.slice(2, 6) + "-" + d.slice(6)) : String(raw).trim();
    return { ok: ok, txt: txt, wa: ok ? "https://wa.me/55" + d : null };
  }
  function telHtml(raw) {
    var t = telefone(raw); if (!t) return "";
    if (!t.ok) return "<span class=\"tel bad\" title=\"Número fora do formato DDD + 8 ou 9 dígitos\">" + esc(t.txt) + " · inválido</span>";
    return "<a class=\"tel\" href=\"" + t.wa + "\" target=\"_blank\" rel=\"noopener\" title=\"Abrir no WhatsApp\">" + esc(t.txt) + "</a>";
  }

  // ------------------------------------------------------------- aviso (no lugar de alert)
  var toastEl = $("[data-toast]"), toastT = 0;
  function toast(msg, tipo) {
    toastEl.textContent = msg;
    toastEl.className = "toast is-on" + (tipo === "erro" ? " is-error" : "");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.className = "toast"; }, tipo === "erro" ? 6000 : 2200);
  }

  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace(CFG.loginPath); });
  $("[data-logout]").addEventListener("click", function () { sb.auth.signOut(); });

  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) { gateShow("Você não está conectado", "Entre com uma conta de administrador.", true); return; }
    return sb.from("admins").select("user_id").eq("user_id", s.user.id).maybeSingle().then(function (a) {
      if (!a.data) { gateShow("Sem acesso ao CRM", "Esta conta não é administradora. Peça para incluir seu usuário na tabela admins.", true); return; }
      gate.hidden = true;
      $("[data-hide-tests]").checked = state.ocultarTestes;
      return Promise.all([loadLeads(), loadLimit()]).then(function () { shell.dataset.state = "ready"; });
    });
  });

  function loadLeads() {
    var btn = $("[data-refresh]"); btn.disabled = true;
    return sb.from("crm_overview").select("*").order("created_at", { ascending: false }).limit(2000).then(function (r) {
      btn.disabled = false;
      // Falha de leitura não pode parecer "nenhum lead".
      if (r.error) { $("[data-load-error]").hidden = false; $("[data-load-error-msg]").textContent = r.error.message || "erro desconhecido"; return; }
      $("[data-load-error]").hidden = true;
      state.leads = r.data || []; state.carregadoEm = new Date();
      $("[data-updated]").textContent = "Atualizado às " + state.carregadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      render();
    });
  }
  function loadLimit() {
    return sb.from("app_settings").select("value").eq("key", "free_message_limit").maybeSingle().then(function (r) {
      $("[data-limit]").value = r.data ? Number(r.data.value) : 0;
    });
  }

  function base() { return state.ocultarTestes ? state.leads.filter(function (l) { return !ehTeste(l); }) : state.leads; }
  function passaFiltro(l, f) {
    if (!f) return true;
    if (f.indexOf("wa:") === 0) return (l.whatsapp_trial_status || "nao_solicitado") === f.slice(3);
    return l.status === f;
  }

  function render() { renderStats(); renderFilters(); renderRows(); }

  function renderStats() {
    var L = base(), n = function (f) { return L.filter(f).length; };
    var total = L.length, conf = n(function (l) { return !!l.confirmed_at; });
    var set = function (k, v) { $("[data-stat='" + k + "']").textContent = v; };
    set("total", total);
    set("confirmados", conf);
    set("taxa", total ? Math.round(conf / total * 100) + "% do total" : "—");
    set("ativos", n(function (l) { return l.status === "ativo"; }));
    set("esgotados", n(function (l) { return l.status === "trial_esgotado"; }));
    set("assinantes", n(function (l) { return l.status === "assinante"; }));
    set("wa", n(function (l) { return l.whatsapp_trial_status === "solicitado"; }));
    set("b2b", n(function (l) { return l.tipo === "b2b"; }));
    var ocultos = state.leads.length - L.length;
    $("[data-tests-count]").textContent = ocultos ? "(" + ocultos + ")" : "";
  }

  function renderFilters() {
    var L = base();
    $("[data-filters]").querySelectorAll("[data-filter]").forEach(function (b) {
      var f = b.dataset.filter, c = b.querySelector("span") || b.appendChild(document.createElement("span"));
      c.textContent = L.filter(function (l) { return passaFiltro(l, f); }).length;
      b.setAttribute("aria-pressed", f === state.filter ? "true" : "false");
    });
    document.querySelectorAll("[data-stat-filter]").forEach(function (s) {
      s.classList.toggle("is-on", s.dataset.statFilter === state.filter);
    });
  }

  function valorOrdem(l, k) {
    if (k === "nome") return String(l.nome || l.email || "").toLowerCase();
    if (k === "status") return STATUS_ORDEM[l.status] == null ? 9 : STATUS_ORDEM[l.status];
    if (k === "uso") return Number(l.mensagens_usadas || 0) * 1000 + Number(l.conversas || 0);
    if (k === "ultimo") { var u = ultimoAcesso(l); return u ? Date.parse(u) : 0; }
    return l[k] ? Date.parse(l[k]) : 0;
  }

  function visible() {
    var q = state.q.toLowerCase(), k = state.sort.key, dir = state.sort.dir;
    return base().filter(function (l) {
      if (!passaFiltro(l, state.filter)) return false;
      if (!q) return true;
      return [l.nome, l.email, l.empresa, l.telefone, l.whatsapp_numero, l.segmento, l.origem, l.plano, l.notas].join(" ").toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      var x = valorOrdem(a, k), y = valorOrdem(b, k);
      return x < y ? -dir : x > y ? dir : 0;
    });
  }

  function renderRows() {
    var list = visible();
    empty.hidden = list.length > 0;
    $("[data-shown]").textContent = list.length === 1 ? "1 lead" : list.length + " leads";
    rows.innerHTML = list.map(function (l) {
      var tel = telHtml(l.telefone);
      return "<tr data-id=\"" + esc(l.id) + "\">" +
        "<td class=\"who\"><button type=\"button\" class=\"lead-open\" data-open>" + esc(l.nome || "Sem nome") + "</button>" +
          "<span class=\"chip " + esc(l.tipo) + "\">" + (l.tipo === "b2b" ? "Empresa" : "Pessoa") + "</span>" + (ehTeste(l) ? "<span class=\"chip teste\">Teste</span>" : "") +
          "<a class=\"mail\" href=\"mailto:" + esc(l.email) + "\">" + esc(l.email) + "</a>" +
          (tel ? tel : "") +
          (l.empresa || l.segmento ? "<small>" + esc([l.empresa, l.segmento].filter(Boolean).join(" · ")) + "</small>" : "") +
        "</td>" +
        "<td><select class=\"status-sel st-" + esc(l.status) + "\" data-field=\"status\" aria-label=\"Status de " + esc(l.nome || l.email) + "\">" + STATUS.map(function (s) { return "<option value=\"" + s + "\"" + (s === l.status ? " selected" : "") + ">" + LABEL[s] + "</option>"; }).join("") + "</select>" +
          (l.confirmed_at ? "" : "<small class=\"hint\">e-mail não confirmado</small>") + "</td>" +
        "<td><input type=\"text\" data-field=\"plano\" value=\"" + esc(l.plano || "") + "\" placeholder=\"—\" aria-label=\"Plano\"></td>" +
        "<td class=\"num\"><b>" + Number(l.mensagens_usadas || 0) + "</b> msg<small>" + Number(l.conversas || 0) + " conversa" + (Number(l.conversas) === 1 ? "" : "s") + "</small></td>" +
        "<td><div class=\"wa\">" + waCell(l) + "</div></td>" +
        "<td class=\"date\">" + fmt(l.created_at) + "<small>" + esc(l.origem || "") + "</small></td>" +
        "<td class=\"date\">" + fmt(ultimoAcesso(l)) + "</td>" +
        "<td><textarea data-field=\"notas\" rows=\"1\" aria-label=\"Notas\" placeholder=\"Anotações internas\">" + esc(l.notas || "") + "</textarea></td>" +
      "</tr>";
    }).join("");
    document.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.setAttribute("aria-sort", th.dataset.sort === state.sort.key ? (state.sort.dir > 0 ? "ascending" : "descending") : "none");
    });
  }

  function waCell(l) {
    var s = l.whatsapp_trial_status || "nao_solicitado";
    var sel = "<select data-field=\"whatsapp_trial_status\" aria-label=\"Teste WhatsApp\">" + WA.map(function (k) { return "<option value=\"" + k + "\"" + (k === s ? " selected" : "") + ">" + WA_LABEL[k] + "</option>"; }).join("") + "</select>";
    var num = l.whatsapp_numero ? telHtml(l.whatsapp_numero) : "";
    var extra = "";
    if (s === "solicitado") extra = "<button type=\"button\" class=\"wa-go\" data-wa-activate>Ativar 3 dias</button>";
    if (s === "ativo" && l.whatsapp_trial_ends_at) extra = "<small>até " + fmt(l.whatsapp_trial_ends_at) + "</small>";
    return sel + num + extra;
  }

  function lead(id) { return state.leads.filter(function (l) { return l.id === id; })[0]; }

  rows.addEventListener("click", function (e) {
    var o = e.target.closest("[data-open]"); if (o) { abrirDetalhe(o.closest("tr").dataset.id); return; }
    var b = e.target.closest("[data-wa-activate]"); if (!b) return;
    var id = b.closest("tr").dataset.id; b.disabled = true; b.textContent = "Ativando…";
    sb.rpc("activate_whatsapp_trial", { p_lead_id: id, p_days: 3 }).then(function (r) {
      if (r.error) { toast("Não foi possível ativar: " + r.error.message, "erro"); b.disabled = false; b.textContent = "Ativar 3 dias"; return; }
      toast("Teste de 3 dias no WhatsApp ativado.");
      return loadLeads();
    });
  });

  rows.addEventListener("change", function (e) {
    var el = e.target.closest("[data-field]"); if (!el) return;
    var tr = el.closest("tr"), id = tr.dataset.id, field = el.dataset.field, patch = {};
    patch[field] = el.value.trim ? (el.value.trim() || null) : el.value;
    el.classList.add("saving");
    sb.from("crm_leads").update(patch).eq("id", id).select("id,status,plano,notas,whatsapp_trial_status,whatsapp_trial_ends_at").single().then(function (r) {
      el.classList.remove("saving");
      if (r.error) { toast("Não foi possível salvar: " + r.error.message, "erro"); return; }
      var l = lead(id); if (l) Object.assign(l, r.data);
      el.classList.add("saved"); setTimeout(function () { el.classList.remove("saved"); }, 1200);
      // Status e WhatsApp mudam contagens, filtro e cor da linha; texto livre não precisa redesenhar.
      if (field === "status" || field === "whatsapp_trial_status") render(); else renderStats();
      toast("Salvo.");
    });
  });

  $("[data-filters]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-filter]"); if (!b) return;
    state.filter = b.dataset.filter; renderFilters(); renderRows();
  });
  document.querySelectorAll("[data-stat-filter]").forEach(function (s) {
    s.addEventListener("click", function () {
      state.filter = state.filter === s.dataset.statFilter ? "" : s.dataset.statFilter;
      renderFilters(); renderRows();
    });
  });
  $("[data-search]").addEventListener("input", function (e) { state.q = e.target.value.trim(); renderRows(); });
  $("[data-hide-tests]").addEventListener("change", function (e) {
    state.ocultarTestes = e.target.checked;
    try { localStorage.setItem(PREF, state.ocultarTestes ? "1" : "0"); } catch (err) { /* sem storage */ }
    render();
  });
  $("[data-refresh]").addEventListener("click", function () { loadLeads(); });
  $("[data-retry]").addEventListener("click", function () { loadLeads(); });
  document.querySelectorAll("th[data-sort] button").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.parentNode.dataset.sort;
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === "nome" || k === "status" ? 1 : -1 };
      renderRows();
    });
  });

  $("[data-limit]").addEventListener("change", function (e) {
    var v = Math.max(0, parseInt(e.target.value, 10) || 0); e.target.value = v;
    sb.from("app_settings").upsert({ key: "free_message_limit", value: v, updated_at: new Date().toISOString() }).then(function (r) {
      if (r.error) { toast("Não foi possível salvar: " + r.error.message, "erro"); return; }
      e.target.classList.add("saved"); setTimeout(function () { e.target.classList.remove("saved"); }, 1200);
      toast(v ? "Limite de perguntas grátis: " + v + "." : "Perguntas grátis sem limite.");
    });
  });

  // ------------------------------------------------------------- detalhe do lead
  var dlg = $("[data-detail]");
  function abrirDetalhe(id) {
    var l = lead(id); if (!l) return;
    var tel = telefone(l.telefone), wa = telefone(l.whatsapp_numero);
    var linhas = [
      ["E-mail", "<a href=\"mailto:" + esc(l.email) + "\">" + esc(l.email) + "</a>"],
      ["Telefone", l.telefone ? telHtml(l.telefone) : "—"],
      ["Tipo", l.tipo === "b2b" ? "Empresa" : "Pessoa"],
      ["Empresa", esc(l.empresa || "—")],
      ["Segmento", esc(l.segmento || "—")],
      ["Origem", esc(l.origem || "—")],
      ["Status", LABEL[l.status] || esc(l.status)],
      ["Plano", esc(l.plano || "—")],
      ["Uso", Number(l.mensagens_usadas || 0) + " mensagens · " + Number(l.conversas || 0) + " conversas"],
      ["Cadastro", fmt(l.created_at)],
      ["E-mail confirmado", fmt(l.confirmed_at)],
      ["Último acesso", fmt(ultimoAcesso(l))],
      ["WhatsApp", WA_LABEL[l.whatsapp_trial_status || "nao_solicitado"] + (l.whatsapp_numero ? " · " + telHtml(l.whatsapp_numero) : "")],
      ["Pedido do teste", fmt(l.whatsapp_trial_requested_at)],
      ["Teste até", fmt(l.whatsapp_trial_ends_at)],
      ["Conta no chat", l.user_id ? "sim" : "não (só lista de espera)"],
      ["Notas", esc(l.notas || "—")]
    ];
    $("[data-detail-title]").textContent = l.nome || l.email;
    $("[data-detail-body]").innerHTML = linhas.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("");
    var zap = wa && wa.ok ? wa : (tel && tel.ok ? tel : null);
    var zapBtn = $("[data-detail-wa]");
    zapBtn.hidden = !zap; if (zap) zapBtn.href = zap.wa;
    $("[data-detail-mail]").href = "mailto:" + l.email;
    $("[data-detail-copy]").dataset.email = l.email;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("[data-detail-close]").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  $("[data-detail-copy]").addEventListener("click", function (e) {
    var v = e.currentTarget.dataset.email;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast("E-mail copiado."); }, function () { toast("Não foi possível copiar.", "erro"); });
  });

  $("[data-export]").addEventListener("click", function () {
    var cols = ["nome", "email", "telefone", "tipo", "empresa", "segmento", "origem", "status", "plano", "mensagens_usadas", "conversas", "whatsapp_numero", "whatsapp_trial_status", "whatsapp_trial_requested_at", "whatsapp_trial_ends_at", "created_at", "confirmed_at", "last_seen_at", "notas"];
    // Valores vindos do cadastro público: neutraliza prefixos que planilhas interpretam como fórmula.
    var cell = function (v) {
      v = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    };
    var lista = visible();
    var csv = [cols.join(";")].concat(lista.map(function (l) {
      return cols.map(function (c) { return cell(l[c]); }).join(";");
    })).join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "trustio-leads-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast(lista.length + " leads exportados (filtro e busca atuais).");
  });

  var toggle = $(".theme-toggle");
  toggle.addEventListener("click", function () {
    var light = document.documentElement.getAttribute("data-theme") !== "light";
    if (light) document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    toggle.setAttribute("aria-pressed", light ? "true" : "false");
    try { localStorage.setItem("trustio-theme", light ? "light" : "dark"); } catch (e) { /* sem storage */ }
  });
  toggle.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "light" ? "true" : "false");
})();
