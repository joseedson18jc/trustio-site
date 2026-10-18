/* assets/crm-prospeccao.js — aba Prospecção do CRM (/crm/prospeccao.html).
   Lê e edita crm_prospects (criadores e mídia) e crm_prospect_modelos; as políticas RLS
   (is_staff()) garantem que só a equipe enxerga. O banco preenche a data do primeiro contato
   quando o status vira "enviado", grava o histórico (crm_prospect_eventos) e recusa status fora
   do funil de cada segmento. Origem: planilha "Trustio Outreach Tracker" (17/10/2026). */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  var SITE = "https://trustio.com.br";
  var FUNIL = {
    creator: ["a_contatar", "enviado", "respondeu", "testando", "ativado", "publicou", "primeira_venda", "recusou", "sem_resposta"],
    midia: ["a_contatar", "enviado", "respondeu", "fechado", "publicou", "recusou", "sem_resposta"]
  };
  var STATUS_LABEL = {
    a_contatar: "A contatar", enviado: "Enviado", respondeu: "Respondeu", testando: "Testando", ativado: "Ativado",
    publicou: "Publicou", primeira_venda: "Primeira venda", fechado: "Fechado", recusou: "Recusou", sem_resposta: "Sem resposta"
  };
  var STATUS_ORDEM = ["a_contatar", "enviado", "respondeu", "testando", "ativado", "fechado", "publicou", "primeira_venda", "recusou", "sem_resposta"];
  var RESPONDEU_OU_ALEM = ["respondeu", "testando", "ativado", "fechado", "publicou", "primeira_venda"];
  var GANHOS = ["ativado", "fechado", "publicou", "primeira_venda"];
  var CADENCIA = { creator: [3, 7, 14], midia: [5] };
  var PRIO_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" };
  var TIPO_LABEL = { email: "E-mail", whatsapp: "WhatsApp", dm: "DM", form: "Formulário", telefone: "Telefone", outro: "Outro" };
  var ETAPA_LABEL = { primeiro: "1º contato", followup_1: "Follow-up 1", followup_2: "Follow-up 2", followup_3: "Follow-up 3" };
  var CAMPO_LABEL = { criado: "Criado", status: "Status", prioridade: "Prioridade", primeiro_contato: "Primeiro contato", followups_feitos: "Follow-ups feitos", afiliado_id: "Afiliado vinculado", contato: "Contato" };
  var PAPEL_LABEL = { admin: "Admin", colaborador: "Colaborador" };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var shell = $(".crm-shell"), rows = $("[data-rows]"), empty = $("[data-empty]"), gate = $("[data-gate]");
  var state = { prospects: [], modelos: [], afiliados: [], q: "", seg: "", st: "", meuNome: "" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function gateShow(t, p, actions) { gate.hidden = false; $("[data-gate-title]").textContent = t; $("[data-gate-text]").textContent = p; $("[data-gate-actions]").hidden = !actions; }
  function hojeISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function somaDias(iso, n) { var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function dataBR(iso) { if (!iso) return ""; var p = String(iso).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0].slice(2); }
  function numero(n) { return Number(n).toLocaleString("pt-BR"); }

  var toastEl = $("[data-toast]"), toastT = 0;
  function toast(msg, tipo) {
    toastEl.textContent = msg;
    toastEl.className = "toast is-on" + (tipo === "erro" ? " is-error" : "");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.className = "toast"; }, tipo === "erro" ? 7000 : 3200);
  }

  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace(CFG.loginPath); });
  $("[data-logout]").addEventListener("click", function () { sb.auth.signOut(); });

  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) { gateShow("Você não está conectado", "Entre com uma conta da equipe.", true); return; }
    return sb.rpc("meu_papel").then(function (a) {
      var papel = a.data;
      if (papel !== "admin" && papel !== "colaborador") { gateShow("Sem acesso ao CRM", "O CRM é só para a equipe (admin ou colaborador).", true); return; }
      shell.dataset.papel = papel;
      $("[data-eu]").textContent = PAPEL_LABEL[papel];
      gate.hidden = true;
      // Nome de quem assina as mensagens ({seu nome}): o cadastro da própria pessoa no CRM.
      sb.from("crm_leads").select("nome").eq("user_id", s.user.id).maybeSingle().then(function (m) {
        if (m.data && m.data.nome) state.meuNome = String(m.data.nome).trim().split(/\s+/).slice(0, 2).join(" ");
      });
      return Promise.all([load(), loadModelos(), loadAfiliados()]).then(function () { shell.dataset.state = "ready"; });
    });
  });

  function load() {
    var btn = $("[data-refresh]"); btn.disabled = true;
    return sb.from("crm_prospects").select("*").order("segmento").order("ordem", { ascending: true, nullsFirst: false }).order("created_at").limit(5000).then(function (r) {
      btn.disabled = false;
      if (r.error) { $("[data-load-error]").hidden = false; $("[data-load-error-msg]").textContent = r.error.message || "erro desconhecido"; return; }
      $("[data-load-error]").hidden = true;
      state.prospects = r.data || [];
      $("[data-updated]").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      render();
    });
  }
  function loadModelos() {
    return sb.from("crm_prospect_modelos").select("*").order("ordem").then(function (r) {
      if (r.error) { toast("Modelos: " + r.error.message, "erro"); return; }
      state.modelos = r.data || [];
      renderModelos(); render();
    });
  }
  function loadAfiliados() {
    return sb.from("afiliados").select("id,nome,codigo,cupom,status").order("nome").limit(2000).then(function (r) {
      if (!r.error) { state.afiliados = r.data || []; render(); }
    });
  }

  // ── follow-up: cadência da planilha (criadores D+3/7/14, mídia D+5) ──
  function followup(p) {
    var cad = CADENCIA[p.segmento] || [];
    if (p.status !== "enviado" || !p.primeiro_contato) return null;
    var feitos = p.followups_feitos || 0;
    if (feitos >= cad.length) return { fim: true, total: cad.length };
    var quando = somaDias(String(p.primeiro_contato).slice(0, 10), cad[feitos]);
    return { n: feitos + 1, total: cad.length, quando: quando, vencido: quando <= hojeISO(), dias: cad[feitos] };
  }

  function filtrados() {
    var q = state.q.toLowerCase().trim();
    return state.prospects.filter(function (p) {
      if (state.seg && p.segmento !== state.seg) return false;
      if (state.st === "_vencidos") { var f = followup(p); if (!f || !f.vencido) return false; }
      else if (state.st && p.status !== state.st) return false;
      if (!q) return true;
      return [p.nome, p.handle, p.plataforma, p.categoria, p.nicho, p.contato, p.gancho, p.motivo, p.notas].join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }

  function stats() {
    var L = state.prospects.filter(function (p) { return !state.seg || p.segmento === state.seg; });
    var contatados = L.filter(function (p) { return p.status !== "a_contatar"; }).length;
    var resp = L.filter(function (p) { return RESPONDEU_OU_ALEM.indexOf(p.status) >= 0; }).length;
    $("[data-pr-stat=vencidos]").textContent = L.filter(function (p) { var f = followup(p); return f && f.vencido; }).length;
    $("[data-pr-stat=acontatar]").textContent = L.filter(function (p) { return p.status === "a_contatar"; }).length;
    $("[data-pr-stat=enviados]").textContent = contatados;
    $("[data-pr-stat=responderam]").textContent = resp;
    $("[data-pr-stat=ganhos]").textContent = L.filter(function (p) { return GANHOS.indexOf(p.status) >= 0; }).length;
    $("[data-pr-stat=taxa]").textContent = contatados ? Math.round(resp / contatados * 100) + "%" : "—";
    ["", "creator", "midia"].forEach(function (s) {
      $("[data-pr-segn=\"" + s + "\"]").textContent = state.prospects.filter(function (p) { return !s || p.segmento === s; }).length;
    });
    // Filtros de status com contagem (só os que existem no segmento escolhido).
    var permitidos = state.seg ? FUNIL[state.seg] : STATUS_ORDEM;
    var venc = L.filter(function (p) { var f = followup(p); return f && f.vencido; }).length;
    var html = "<button type=\"button\" data-pr-st=\"\" aria-pressed=\"" + (!state.st) + "\">Todos os status</button>" +
      "<button type=\"button\" data-pr-st=\"_vencidos\" aria-pressed=\"" + (state.st === "_vencidos") + "\">Follow-up vencido <span>" + venc + "</span></button>";
    STATUS_ORDEM.forEach(function (s) {
      if (permitidos.indexOf(s) < 0) return;
      var n = L.filter(function (p) { return p.status === s; }).length;
      html += "<button type=\"button\" data-pr-st=\"" + s + "\" aria-pressed=\"" + (state.st === s) + "\">" + STATUS_LABEL[s] + " <span>" + n + "</span></button>";
    });
    $("[data-pr-sts]").innerHTML = html;
  }

  // ── contato: e-mail, WhatsApp e endereço para abrir ──
  function emailDe(p) { var m = String(p.contato || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m ? m[0] : ""; }
  function waDe(p) {
    var m = String(p.contato || "").match(/\(?\d{2}\)?[\s.]*9?[\s.]*\d{4}[\s.-]?\d{4}/);
    if (!m) return "";
    var d = m[0].replace(/\D/g, "");
    return d.length === 10 || d.length === 11 ? "55" + d : "";
  }
  function slug(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }
  function linkConvite(p) {
    return SITE + "/afiliados.html?utm_source=" + encodeURIComponent(slug(p.handle || p.nome)) + "&utm_medium=outreach&utm_campaign=" + (p.segmento === "creator" ? "criadores" : "midia");
  }

  function contatoCell(p) {
    var em = emailDe(p), wa = waDe(p), acoes = [];
    if (em) acoes.push("<a href=\"mailto:" + esc(em) + "\">E-mail</a>");
    if (wa) acoes.push("<a href=\"https://wa.me/" + esc(wa) + "\" target=\"_blank\" rel=\"noopener\">WhatsApp</a>");
    if (p.url) acoes.push("<a href=\"" + esc(p.url) + "\" target=\"_blank\" rel=\"noopener\">Perfil</a>");
    return "<td class=\"pr-contato\"><small>" + esc(TIPO_LABEL[p.contato_tipo] || p.contato_tipo) + "</small>" +
      "<input type=\"text\" data-field=\"contato\" value=\"" + esc(p.contato) + "\" maxlength=\"300\" aria-label=\"Contato de " + esc(p.nome) + "\">" +
      (acoes.length ? "<small class=\"pr-acoes\">" + acoes.join(" · ") + "</small>" : "") +
      "<small><button type=\"button\" class=\"btn btn-ghost\" data-copy=\"" + esc(linkConvite(p)) + "\" title=\"Link para a página de afiliados com UTM deste prospect\">Copiar link com UTM</button></small></td>";
  }

  function followupCell(p) {
    var f = followup(p), html = "<td class=\"pr-fu\"><label><small>Primeiro contato</small><input type=\"date\" data-field=\"primeiro_contato\" value=\"" + esc(p.primeiro_contato ? String(p.primeiro_contato).slice(0, 10) : "") + "\" aria-label=\"Primeiro contato com " + esc(p.nome) + "\"></label>";
    if (f && f.fim) html += "<small class=\"pr-badge\">Cadência concluída (" + f.total + " toques) — sem resposta?</small><button type=\"button\" class=\"btn btn-ghost\" data-sem-resposta>Marcar sem resposta</button>";
    else if (f) html += "<small class=\"pr-badge" + (f.vencido ? " pr-venc" : "") + "\">Follow-up " + f.n + "/" + f.total + " (D+" + f.dias + "): " + dataBR(f.quando) + (f.vencido ? " · vencido" : "") + "</small><button type=\"button\" class=\"btn " + (f.vencido ? "btn-primary" : "btn-ghost") + "\" data-toque>Toque feito</button>";
    else if (p.status === "a_contatar") html += "<button type=\"button\" class=\"btn btn-ghost\" data-enviado>Marcar enviado hoje</button>";
    if (p.ultimo_contato) html += "<small>Último toque: " + dataBR(p.ultimo_contato) + "</small>";
    return html + "</td>";
  }

  function modelosPara(p) {
    return state.modelos.filter(function (m) {
      if (m.segmento !== "ambos" && m.segmento !== p.segmento) return false;
      if (p.segmento === "midia" && m.etapa === "primeiro") {
        var jornalista = /jornal/i.test(p.categoria || "");
        return jornalista ? /jornal/i.test(m.nome) : !/jornal/i.test(m.nome);
      }
      if (p.segmento === "midia" && (m.etapa === "followup_2" || m.etapa === "followup_3")) return false;
      return true;
    });
  }
  function modeloSugerido(p) {
    var f = followup(p), etapa = p.status === "a_contatar" ? "primeiro" : f && !f.fim ? "followup_" + f.n : "";
    var L = modelosPara(p).filter(function (m) { return m.etapa === etapa; });
    if (etapa === "primeiro" && p.segmento === "creator") {
      var porEmail = L.filter(function (m) { return /e-mail/i.test(m.nome); })[0], porDm = L.filter(function (m) { return !/e-mail/i.test(m.nome); })[0];
      return p.contato_tipo === "email" ? porEmail || porDm : porDm || porEmail;
    }
    return L[0];
  }

  function linha(p) {
    var st = (FUNIL[p.segmento] || []).map(function (s) { return "<option value=\"" + s + "\"" + (p.status === s ? " selected" : "") + ">" + STATUS_LABEL[s] + "</option>"; }).join("");
    var pr = "<option value=\"\">—</option>" + ["alta", "media", "baixa"].map(function (s) { return "<option value=\"" + s + "\"" + (p.prioridade === s ? " selected" : "") + ">" + PRIO_LABEL[s] + "</option>"; }).join("");
    var sug = modeloSugerido(p);
    var mods = modelosPara(p).map(function (m) { return "<option value=\"" + esc(m.id) + "\"" + (sug && sug.id === m.id ? " selected" : "") + ">" + esc(ETAPA_LABEL[m.etapa] + " · " + m.nome) + "</option>"; }).join("");
    var aud = p.seguidores ? numero(p.seguidores) + " seguidores" : (p.audiencia || "");
    var af = p.segmento === "creator"
      ? "<small><select data-field=\"afiliado_id\" aria-label=\"Afiliado vinculado a " + esc(p.nome) + "\"><option value=\"\">Vincular afiliado…</option>" +
        state.afiliados.map(function (a) { return "<option value=\"" + esc(a.id) + "\"" + (p.afiliado_id === a.id ? " selected" : "") + ">" + esc(a.nome + " · " + (a.cupom || a.codigo) + " (" + a.status + ")") + "</option>"; }).join("") + "</select></small>"
      : "";
    return "<tr data-id=\"" + esc(p.id) + "\" class=\"pr-" + esc(p.segmento) + "\">" +
      "<td class=\"who\"><b>" + esc(p.nome) + "</b>" +
        "<small>" + esc([p.segmento === "creator" ? "Criador" : (p.categoria || "Mídia"), p.handle, p.plataforma].filter(Boolean).join(" · ")) + "</small>" +
        af + "<small><button type=\"button\" class=\"btn btn-ghost\" data-hist>Histórico</button></small></td>" +
      "<td><span class=\"num\">" + esc(aud) + "</span>" + (p.nicho ? "<small>" + esc(p.nicho) + "</small>" : "") + "</td>" +
      contatoCell(p) +
      "<td class=\"pr-hook\">" + (p.gancho ? "<span>" + esc(p.gancho) + "</span>" : "") + (p.motivo ? "<small>" + esc(p.motivo) + "</small>" : "") + "</td>" +
      "<td><select data-field=\"prioridade\" aria-label=\"Prioridade de " + esc(p.nome) + "\">" + pr + "</select></td>" +
      "<td><select data-field=\"status\" aria-label=\"Status de " + esc(p.nome) + "\">" + st + "</select></td>" +
      followupCell(p) +
      "<td class=\"pr-msg\">" + (mods ? "<select data-modelo aria-label=\"Modelo de mensagem para " + esc(p.nome) + "\">" + mods + "</select><button type=\"button\" class=\"btn btn-primary\" data-usar>Copiar e abrir</button>" : "<small>Sem modelo</small>") + "</td>" +
      "<td><textarea data-field=\"notas\" rows=\"2\" aria-label=\"Notas de " + esc(p.nome) + "\">" + esc(p.notas) + "</textarea></td>" +
      "</tr>";
  }

  function render() {
    var L = filtrados();
    rows.innerHTML = L.map(linha).join("");
    empty.hidden = L.length > 0;
    empty.textContent = state.prospects.length ? "Nenhum prospect com esses filtros." : "Nenhum prospect ainda.";
    $("[data-shown]").textContent = L.length === 1 ? "1 prospect" : L.length + " prospects";
    stats();
  }

  function porId(id) { return state.prospects.filter(function (x) { return x.id === id; })[0]; }
  function atualizar(id, patch, ok) {
    return sb.from("crm_prospects").update(patch).eq("id", id).select("*").single().then(function (r) {
      if (r.error) {
        var msg = /status_do_funil/.test(r.error.message) ? "Esse status não existe no funil deste segmento." : /followups_do_segmento/.test(r.error.message) ? "A mídia tem um só follow-up (D+5)." : r.error.message;
        toast("Não foi possível salvar: " + msg, "erro"); render(); return null;
      }
      state.prospects = state.prospects.map(function (x) { return x.id === id ? r.data : x; });
      render(); toast(ok || "Salvo."); return r.data;
    });
  }

  function salvar(el) {
    var tr = el.closest("tr"), id = tr && tr.dataset.id, campo = el.dataset.field, p = porId(id);
    if (!p) return;
    var valor = campo === "notas" ? el.value : el.value.trim();
    var atual = p[campo] == null ? "" : String(p[campo]).slice(0, campo === "primeiro_contato" ? 10 : undefined);
    if (atual === valor) return;
    var patch = {}; patch[campo] = valor || null;
    atualizar(id, patch, campo === "status" && valor === "enviado" ? "Enviado — follow-ups contando a partir do primeiro contato." : "Salvo.");
  }

  // ── mensagens: preenche o modelo, copia e abre o canal ──
  function partesNome(p) {
    var nome = String(p.nome || ""), par = nome.match(/\(([^)]+)\)/);
    var pessoa = par ? par[1] : (p.segmento === "midia" && !/jornal/i.test(p.categoria || "") ? "" : nome);
    var primeiro = pessoa.trim().split(/\s+/)[0] || "";
    return { primeiro: primeiro, veiculo: par ? nome.slice(0, par.index).trim() : nome };
  }
  function preencher(texto, p) {
    var n = partesNome(p);
    var out = texto.replace(/\{nome\}/g, n.primeiro || "{nome}")
      .replace(/\{NOME\}/g, n.primeiro ? n.primeiro.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() : "{NOME}")
      .replace(/\{newsletter\}/g, n.veiculo)
      .replace(/\{seu nome\}/g, state.meuNome || "{seu nome}");
    return { texto: out, faltam: (out.match(/\{[^}]+\}/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }) };
  }
  function usarModelo(btn) {
    var tr = btn.closest("tr"), p = porId(tr.dataset.id), sel = tr.querySelector("[data-modelo]");
    var m = state.modelos.filter(function (x) { return x.id === sel.value; })[0];
    if (!p || !m) return;
    var r = preencher(m.texto, p), assunto = "", corpo = r.texto;
    var linha1 = corpo.match(/^Assunto:\s*(.+)\n+/);
    if (linha1) { assunto = linha1[1].trim(); corpo = corpo.slice(linha1[0].length); }
    var em = emailDe(p), wa = waDe(p), destino = null;
    if (em && (p.contato_tipo === "email" || /e-?mail/i.test(m.canal || ""))) destino = "mailto:" + em + "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo);
    else if (wa) destino = "https://wa.me/" + wa + "?text=" + encodeURIComponent(corpo);
    else if (p.url) destino = p.url;
    var aviso = r.faltam.length ? " Personalize antes de enviar: " + r.faltam.join(", ") + (p.gancho ? " (gancho: " + p.gancho + ")" : "") + "." : "";
    navigator.clipboard.writeText((assunto ? "Assunto: " + assunto + "\n\n" : "") + corpo).then(function () {
      toast("Mensagem copiada." + aviso, r.faltam.length ? "erro" : "");
    }, function () { toast("Não consegui copiar; o texto está no modelo abaixo.", "erro"); });
    if (destino) window.open(destino, destino.indexOf("mailto:") === 0 ? "_self" : "_blank", "noopener");
  }

  function historico(id) {
    var p = porId(id); if (!p) return;
    $("[data-pr-hist-titulo]").textContent = "Histórico · " + p.nome;
    var lista = $("[data-pr-hist-lista]"); lista.innerHTML = "<li>Carregando…</li>";
    $("[data-pr-hist]").showModal();
    sb.from("crm_prospect_eventos").select("*").eq("prospect_id", id).order("em", { ascending: false }).limit(200).then(function (r) {
      if (r.error) { lista.innerHTML = "<li>" + esc(r.error.message) + "</li>"; return; }
      var nomeAf = function (v) { var a = state.afiliados.filter(function (x) { return x.id === v; })[0]; return a ? a.nome : v; };
      var fmt = function (campo, v) { if (v == null || v === "") return "—"; if (campo === "status") return STATUS_LABEL[v] || v; if (campo === "prioridade") return PRIO_LABEL[v] || v; if (campo === "afiliado_id") return nomeAf(v); if (campo === "primeiro_contato") return dataBR(v); return v; };
      lista.innerHTML = (r.data || []).map(function (e) {
        return "<li><span class=\"date\">" + esc(new Date(e.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) + "</span> <b>" + esc(CAMPO_LABEL[e.campo] || e.campo) + "</b>" +
          (e.campo === "criado" ? " <small>(" + esc(e.para) + ")</small>" : ": " + esc(fmt(e.campo, e.de)) + " → " + esc(fmt(e.campo, e.para))) + "</li>";
      }).join("") || "<li>Sem eventos.</li>";
    });
  }

  function renderModelos() {
    $("[data-pr-modelos]").innerHTML = state.modelos.map(function (m) {
      return "<div class=\"pr-modelo\" data-mid=\"" + esc(m.id) + "\"><b>" + esc(m.nome) + "</b><small>" + esc(ETAPA_LABEL[m.etapa] + " · " + (m.canal || "") + " · " + (m.segmento === "ambos" ? "criadores e mídia" : m.segmento === "creator" ? "criadores" : "mídia")) + "</small>" +
        "<textarea data-modelo-texto rows=\"6\" maxlength=\"4000\" aria-label=\"Texto do modelo " + esc(m.nome) + "\">" + esc(m.texto) + "</textarea></div>";
    }).join("");
  }

  rows.addEventListener("change", function (e) { if (e.target.dataset.field) salvar(e.target); });
  rows.addEventListener("click", function (e) {
    var tr = e.target.closest("tr"), id = tr && tr.dataset.id, p = id && porId(id);
    if (e.target.closest("[data-usar]")) { usarModelo(e.target.closest("[data-usar]")); return; }
    if (e.target.closest("[data-hist]")) { historico(id); return; }
    if (e.target.closest("[data-enviado]") && p) { atualizar(id, { status: "enviado" }, "Enviado hoje — o primeiro follow-up já tem data."); return; }
    if (e.target.closest("[data-toque]") && p) { atualizar(id, { followups_feitos: (p.followups_feitos || 0) + 1 }, "Toque registrado."); return; }
    if (e.target.closest("[data-sem-resposta]") && p) { atualizar(id, { status: "sem_resposta" }, "Marcado como sem resposta."); return; }
    var b = e.target.closest("[data-copy]");
    if (b) navigator.clipboard.writeText(b.dataset.copy).then(function () { toast("Link com UTM copiado."); }, function () { toast(b.dataset.copy); });
  });
  $("[data-pr-modelos]").addEventListener("change", function (e) {
    var ta = e.target.closest("[data-modelo-texto]"); if (!ta) return;
    var id = ta.closest("[data-mid]").dataset.mid, m = state.modelos.filter(function (x) { return x.id === id; })[0];
    if (!m || m.texto === ta.value) return;
    if (!ta.value.trim()) { ta.value = m.texto; toast("O modelo não pode ficar vazio.", "erro"); return; }
    sb.from("crm_prospect_modelos").update({ texto: ta.value }).eq("id", id).select("*").single().then(function (r) {
      if (r.error) { ta.value = m.texto; toast("Não foi possível salvar o modelo: " + r.error.message, "erro"); return; }
      state.modelos = state.modelos.map(function (x) { return x.id === id ? r.data : x; });
      toast("Modelo salvo para toda a equipe.");
    });
  });
  $("[data-pr-novo]").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, dados = {};
    ["segmento", "nome", "handle", "plataforma", "url", "audiencia", "contato", "contato_tipo", "prioridade", "gancho", "motivo"].forEach(function (k) { var v = f.elements[k].value.trim(); if (v) dados[k] = v; });
    if (dados.segmento === "midia") { dados.categoria = dados.plataforma || null; }
    sb.from("crm_prospects").insert(dados).select("*").single().then(function (r) {
      if (r.error) { toast(/duplicate|unique/i.test(r.error.message) ? "Já existe um prospect com esse nome neste segmento." : "Não foi possível adicionar: " + r.error.message, "erro"); return; }
      state.prospects.push(r.data); f.reset(); f.closest("details").open = false; render();
      toast("Prospect adicionado.");
    });
  });
  $("[data-pr-segs]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-pr-seg]"); if (!b) return;
    state.seg = b.dataset.prSeg; state.st = state.st === "_vencidos" ? state.st : "";
    [].forEach.call(document.querySelectorAll("[data-pr-seg]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    render();
  });
  $("[data-pr-sts]").addEventListener("click", function (e) { var b = e.target.closest("[data-pr-st]"); if (!b) return; state.st = b.dataset.prSt; render(); });
  $("[data-pr-search]").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("[data-refresh]").addEventListener("click", function () { load(); loadModelos(); loadAfiliados(); });
  $("[data-retry]").addEventListener("click", load);
})();
