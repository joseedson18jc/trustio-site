/* assets/crm.js — painel interno de leads (/crm/). Só usuários na tabela `admins` enxergam dados:
   as políticas RLS no banco garantem isso, independentemente desta página. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var shell = $(".crm-shell"), rows = $("[data-rows]"), empty = $("[data-empty]"), gate = $("[data-gate]");
  var state = { leads: [], filter: "", q: "" };
  var STATUS = ["novo", "email_confirmado", "ativo", "trial_esgotado", "assinante", "cancelado"];
  var LABEL = { novo: "Novo", email_confirmado: "E-mail confirmado", ativo: "Ativo", trial_esgotado: "Teste esgotado", assinante: "Assinante", cancelado: "Cancelado" };
  var WA = ["nao_solicitado", "solicitado", "ativo", "encerrado"];
  var WA_LABEL = { nao_solicitado: "Não pediu", solicitado: "Pedido", ativo: "Ativo", encerrado: "Encerrado" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(d) { if (!d) return "—"; var x = new Date(d); return x.toLocaleDateString("pt-BR") + " " + x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function gateShow(t, p, actions) { gate.hidden = false; $("[data-gate-title]").textContent = t; $("[data-gate-text]").textContent = p; $("[data-gate-actions]").hidden = !actions; }

  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace(CFG.loginPath); });
  $("[data-logout]").addEventListener("click", function () { sb.auth.signOut(); });

  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) { gateShow("Você não está conectado", "Entre com uma conta de administrador.", true); return; }
    return sb.from("admins").select("user_id").eq("user_id", s.user.id).maybeSingle().then(function (a) {
      if (!a.data) { gateShow("Sem acesso ao CRM", "Esta conta não é administradora. Peça para incluir seu usuário na tabela admins.", true); return; }
      gate.hidden = true;
      return Promise.all([loadLeads(), loadLimit()]).then(function () { shell.dataset.state = "ready"; });
    });
  });

  function loadLeads() {
    return sb.from("crm_overview").select("*").order("created_at", { ascending: false }).limit(2000).then(function (r) {
      state.leads = r.data || []; renderStats(); renderRows();
    });
  }
  function loadLimit() {
    return sb.from("app_settings").select("value").eq("key", "free_message_limit").maybeSingle().then(function (r) {
      $("[data-limit]").value = r.data ? Number(r.data.value) : 0;
    });
  }

  function renderStats() {
    var L = state.leads, n = function (f) { return L.filter(f).length; };
    var set = function (k, v) { $("[data-stat='" + k + "']").textContent = v; };
    set("total", L.length);
    set("confirmados", n(function (l) { return !!l.confirmed_at; }));
    set("ativos", n(function (l) { return l.status === "ativo"; }));
    set("esgotados", n(function (l) { return l.status === "trial_esgotado"; }));
    set("assinantes", n(function (l) { return l.status === "assinante"; }));
    set("b2b", n(function (l) { return l.tipo === "b2b"; }));
  }

  function visible() {
    var q = state.q.toLowerCase();
    return state.leads.filter(function (l) {
      if (state.filter && state.filter.indexOf("wa:") === 0) { if (l.whatsapp_trial_status !== state.filter.slice(3)) return false; }
      else if (state.filter && l.status !== state.filter) return false;
      if (!q) return true;
      return [l.nome, l.email, l.empresa, l.telefone, l.segmento].join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderRows() {
    var list = visible();
    empty.hidden = list.length > 0;
    rows.innerHTML = list.map(function (l) {
      return "<tr data-id=\"" + esc(l.id) + "\">" +
        "<td class=\"who\"><b>" + esc(l.nome || "—") + "</b><small>" + esc(l.empresa || l.segmento || l.origem || "") + "</small></td>" +
        "<td class=\"contact\"><a href=\"mailto:" + esc(l.email) + "\">" + esc(l.email) + "</a><br>" + esc(l.telefone || "") + "</td>" +
        "<td><span class=\"chip " + esc(l.tipo) + "\">" + (l.tipo === "b2b" ? "Empresa" : "Pessoa") + "</span></td>" +
        "<td><select data-field=\"status\" aria-label=\"Status\">" + STATUS.map(function (s) { return "<option value=\"" + s + "\"" + (s === l.status ? " selected" : "") + ">" + LABEL[s] + "</option>"; }).join("") + "</select></td>" +
        "<td><input type=\"text\" data-field=\"plano\" value=\"" + esc(l.plano || "") + "\" placeholder=\"Mensal, Anual…\" aria-label=\"Plano\"></td>" +
        "<td class=\"num\">" + Number(l.mensagens_usadas || 0) + " msg · " + Number(l.conversas || 0) + " conv</td>" +
        "<td class=\"wa\">" + waCell(l) + "</td>" +
        "<td class=\"date\">" + fmt(l.created_at) + (l.confirmed_at ? "" : "<br><small>não confirmado</small>") + "</td>" +
        "<td class=\"date\">" + fmt(l.last_seen_at || l.ultima_mensagem) + "</td>" +
        "<td><textarea data-field=\"notas\" rows=\"1\" aria-label=\"Notas\" placeholder=\"Anotações internas\">" + esc(l.notas || "") + "</textarea></td>" +
      "</tr>";
    }).join("");
  }

  function waCell(l) {
    var s = l.whatsapp_trial_status || "nao_solicitado";
    var num = l.whatsapp_numero ? "<small>" + esc(l.whatsapp_numero) + "</small>" : "";
    var sel = "<select data-field=\"whatsapp_trial_status\" aria-label=\"Teste WhatsApp\">" + WA.map(function (k) { return "<option value=\"" + k + "\"" + (k === s ? " selected" : "") + ">" + WA_LABEL[k] + "</option>"; }).join("") + "</select>";
    var extra = "";
    if (s === "solicitado") extra = "<button type=\"button\" class=\"wa-go\" data-wa-activate>Ativar 3 dias</button>";
    if (s === "ativo" && l.whatsapp_trial_ends_at) extra = "<small>até " + fmt(l.whatsapp_trial_ends_at) + "</small>";
    return sel + num + extra;
  }

  rows.addEventListener("click", function (e) {
    var b = e.target.closest("[data-wa-activate]"); if (!b) return;
    var id = b.closest("tr").dataset.id; b.disabled = true;
    sb.rpc("activate_whatsapp_trial", { p_lead_id: id, p_days: 3 }).then(function (r) {
      if (r.error) { alert("Não foi possível ativar: " + r.error.message); b.disabled = false; return; }
      return loadLeads();
    });
  });

  rows.addEventListener("change", function (e) {
    var el = e.target.closest("[data-field]"); if (!el) return;
    var tr = el.closest("tr"), id = tr.dataset.id, patch = {}; patch[el.dataset.field] = el.value || null;
    sb.from("crm_leads").update(patch).eq("id", id).select("id,status,plano,notas,whatsapp_trial_status,whatsapp_trial_ends_at").single().then(function (r) {
      if (r.error) { el.classList.remove("saved"); alert("Não foi possível salvar: " + r.error.message); return; }
      var lead = state.leads.filter(function (l) { return l.id === id; })[0];
      if (lead) Object.assign(lead, r.data);
      el.classList.add("saved"); setTimeout(function () { el.classList.remove("saved"); }, 1200);
      renderStats();
    });
  });

  $("[data-filters]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-filter]"); if (!b) return;
    $("[data-filters]").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    state.filter = b.dataset.filter; renderRows();
  });
  $("[data-search]").addEventListener("input", function (e) { state.q = e.target.value.trim(); renderRows(); });

  $("[data-limit]").addEventListener("change", function (e) {
    var v = Math.max(0, parseInt(e.target.value, 10) || 0);
    sb.from("app_settings").upsert({ key: "free_message_limit", value: v, updated_at: new Date().toISOString() }).then(function (r) {
      if (r.error) alert("Não foi possível salvar: " + r.error.message); else { e.target.classList.add("saved"); setTimeout(function () { e.target.classList.remove("saved"); }, 1200); }
    });
  });

  $("[data-export]").addEventListener("click", function () {
    var cols = ["nome", "email", "telefone", "tipo", "empresa", "segmento", "origem", "status", "plano", "mensagens_usadas", "conversas", "whatsapp_numero", "whatsapp_trial_status", "whatsapp_trial_requested_at", "whatsapp_trial_ends_at", "created_at", "confirmed_at", "last_seen_at", "notas"];
    // Valores vindos do cadastro público: neutraliza prefixos que planilhas interpretam como fórmula.
    var cell = function (v) {
      v = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    };
    var csv = [cols.join(";")].concat(visible().map(function (l) {
      return cols.map(function (c) { return cell(l[c]); }).join(";");
    })).join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "trustio-leads-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
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
