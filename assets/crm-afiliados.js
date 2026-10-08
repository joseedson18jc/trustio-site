/* assets/crm-afiliados.js — aba Afiliados do CRM (/crm/afiliados.html). Lê e edita a tabela
   afiliados; as políticas RLS (is_staff()) garantem que só a equipe enxerga, e o gatilho
   guard_afiliado_update impede mudar e-mail, CPF e código ou ativar sem aprovar.
   Aprovar chama o worker (api.trustio.com.br/afiliados/aprovar), que manda o link por e-mail;
   a aba do WhatsApp abre com a mensagem pronta. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  var SITE = "https://trustio.com.br";
  var API = "https://api.trustio.com.br/afiliados/aprovar";
  // "ativo" não aparece como opção: só se chega lá pelo botão Aprovar (vagas e registro).
  var STATUS_EDITAVEIS = ["pendente", "pausado", "recusado", "removido"];
  var STATUS_LABEL = { pendente: "Pendente", ativo: "Ativo", pausado: "Pausado", recusado: "Recusado", removido: "Removido" };
  var ERROS_APROVAR = {
    vagas_esgotadas: "Vagas esgotadas: pause ou remova um afiliado ativo antes de aprovar outro.",
    somente_equipe: "Só a equipe aprova afiliados.",
    sessao_invalida: "Sua sessão expirou. Entre de novo.",
    nao_encontrado: "Afiliado não encontrado. Atualize a lista."
  };
  var PIX_LABEL = { cpf: "CPF", email: "E-mail", telefone: "Telefone", aleatoria: "Aleatória" };
  var PAPEL_LABEL = { admin: "Admin", colaborador: "Colaborador" };
  var SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var shell = $(".crm-shell"), rows = $("[data-rows]"), empty = $("[data-empty]"), gate = $("[data-gate]");
  var state = { afiliados: [], q: "", vagas: null, comissoes: [], comFiltro: "a_pagar" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function gateShow(t, p, actions) { gate.hidden = false; $("[data-gate-title]").textContent = t; $("[data-gate-text]").textContent = p; $("[data-gate-actions]").hidden = !actions; }
  function link(codigo) { return SITE + "/?ref=" + encodeURIComponent(codigo); }
  function cpfFmt(c) { c = String(c || ""); return c.length === 11 ? c.slice(0, 3) + "." + c.slice(3, 6) + "." + c.slice(6, 9) + "-" + c.slice(9) : c; }
  function data(iso) { return iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""; }

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
    return sb.rpc("meu_papel").then(function (a) {
      var papel = a.data;
      if (papel !== "admin" && papel !== "colaborador") { gateShow("Sem acesso ao CRM", "O CRM é só para a equipe (admin ou colaborador).", true); return; }
      shell.dataset.papel = papel;
      $("[data-eu]").textContent = PAPEL_LABEL[papel];
      gate.hidden = true;
      return load().then(function () { return Promise.all([loadVagas(), loadComissoes()]); }).then(function () { shell.dataset.state = "ready"; });
    });
  });

  function load() {
    var btn = $("[data-refresh]"); btn.disabled = true;
    return sb.from("afiliados").select("*").order("created_at", { ascending: false }).limit(2000).then(function (r) {
      btn.disabled = false;
      if (r.error) { $("[data-load-error]").hidden = false; $("[data-load-error-msg]").textContent = r.error.message || "erro desconhecido"; return; }
      $("[data-load-error]").hidden = true;
      state.afiliados = r.data || [];
      $("[data-updated]").textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      render();
    });
  }

  function brl(c) { return "R$ " + (Number(c || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function loadComissoes() {
    return sb.from("comissoes").select("*").order("created_at", { ascending: false }).limit(2000).then(function (r) {
      if (r.error) { toast("Comissões: " + r.error.message, "erro"); return; }
      state.comissoes = r.data || [];
      renderComissoes();
      stats();
    });
  }

  function afiliadoPorId(id) { return state.afiliados.filter(function (a) { return a.id === id; })[0] || {}; }

  function renderComissoes() {
    var L = state.comissoes.filter(function (c) { return !state.comFiltro || c.status === state.comFiltro; });
    $("[data-com-rows]").innerHTML = L.map(function (c) {
      var a = afiliadoPorId(c.afiliado_id);
      var alerta = (c.auto_indicacao ? "<small class=\"af-alerta\">Comprador = afiliado (auto-indicação)</small>" : "") +
        (c.teto_aplicado ? "<small class=\"af-alerta\">Teto aplicado (tabela " + esc(brl(c.valor_tabela)) + ")</small>" : "");
      var acao = c.status === "a_pagar"
        ? "<button type=\"button\" class=\"btn btn-primary\" data-pagar=\"" + esc(c.id) + "\">Marcar como pago</button>"
        : c.status === "pago" ? "Pago " + esc(data(c.pago_em)) + " <button type=\"button\" class=\"btn btn-ghost\" data-desfazer=\"" + esc(c.id) + "\">Desfazer</button>" : "Cancelada";
      return "<tr><td>" + esc(data(c.created_at)) + "</td>" +
        "<td class=\"who\"><b>" + esc(a.nome || "—") + "</b><small>" + esc(a.cupom || a.codigo || "") + "</small></td>" +
        "<td><small>" + esc(PIX_LABEL[a.pix_tipo] || "") + "</small><span class=\"mono\">" + esc(a.pix_chave || "") + "</span>" +
          (a.pix_chave ? "<small><button type=\"button\" class=\"btn btn-ghost\" data-copy=\"" + esc(a.pix_chave) + "\">Copiar Pix</button></small>" : "") + "</td>" +
        "<td>" + esc(brl(c.valor_venda)) + "<small>" + esc(c.comprador_email || "") + "</small></td>" +
        "<td><b>" + esc(brl(c.valor_comissao)) + "</b>" + alerta + "</td>" +
        "<td>" + (c.atribuicao === "cupom" ? "Cupom" : "Link") + "</td>" +
        "<td>" + acao + "</td></tr>";
    }).join("");
    $("[data-com-empty]").hidden = L.length > 0;
  }

  function mudarComissao(id, status) {
    sb.from("comissoes").update({ status: status }).eq("id", id).select("*").single().then(function (r) {
      if (r.error) { toast("Não foi possível salvar: " + r.error.message, "erro"); return; }
      state.comissoes = state.comissoes.map(function (c) { return c.id === id ? r.data : c; });
      renderComissoes(); stats();
      toast(status === "pago" ? "Comissão marcada como paga." : "Comissão voltou para a pagar.");
    });
  }

  function loadVagas() {
    return sb.rpc("vagas_afiliados").then(function (r) { if (!r.error && r.data) { state.vagas = r.data; stats(); } });
  }

  // Sempre 55 + DDD + número (mesma regra do worker e do banco).
  function numeroWa(n) {
    var d = String(n || "").replace(/\D/g, "").replace(/^0+/, "");
    if (d.indexOf("55") === 0 && (d.length === 12 || d.length === 13)) return d;
    return d.length === 10 || d.length === 11 ? "55" + d : d;
  }

  function aprovar(btn) {
    var id = btn.closest("tr").dataset.id;
    var a = state.afiliados.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    // Abre a aba já no clique (pop-up liberado); o endereço do WhatsApp entra quando o servidor responde.
    btn.disabled = true;
    sb.auth.getSession().then(function (r) {
      var token = r.data && r.data.session && r.data.session.access_token;
      return fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ id: id }) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; });
    }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) { toast(ERROS_APROVAR[d.error] || "Não foi possível aprovar: " + (d.error || "erro"), "erro"); return; }
      // WhatsApp automático (Evolution API). Se não saiu, abre a conversa com a mensagem pronta.
      if (!d.whatsapp_enviado) window.open("https://wa.me/" + numeroWa(d.whatsapp) + "?text=" + encodeURIComponent(d.mensagem_whatsapp || ""), "_blank");
      var partes = [d.email_enviado ? "e-mail enviado" : "e-mail NÃO saiu", d.whatsapp_enviado ? "WhatsApp enviado" : "confirme o WhatsApp na aba aberta"];
      if (d.cupom_erro) partes.push("cupom não criado na Stripe (" + d.cupom_erro + ")");
      toast("Aprovado: " + partes.join(" · ") + ".", d.email_enviado && !d.cupom_erro ? "" : "erro");
      return Promise.all([load(), loadVagas()]);
    }).catch(function () { btn.disabled = false; toast("Sem conexão com o servidor. Tente de novo.", "erro"); });
  }

  function filtrados() {
    var q = state.q.toLowerCase().trim();
    if (!q) return state.afiliados;
    var digitos = q.replace(/\D/g, "");
    return state.afiliados.filter(function (a) {
      var texto = [a.nome, a.email, a.codigo, a.canal, a.audiencia, a.notas].join(" ").toLowerCase();
      return texto.indexOf(q) >= 0 || (digitos.length >= 3 && String(a.whatsapp).indexOf(digitos) >= 0) || (digitos.length >= 3 && String(a.cpf).indexOf(digitos) >= 0);
    });
  }

  function stats() {
    var agora = Date.now(), L = state.afiliados;
    var ativos = L.filter(function (a) { return a.status === "ativo"; }).length;
    $("[data-af-stat=total]").textContent = L.length;
    $("[data-af-stat=pendentes]").textContent = L.filter(function (a) { return a.status === "pendente"; }).length;
    $("[data-af-stat=vagas]").textContent = (state.vagas ? state.vagas.ativos : ativos) + "/" + (state.vagas ? state.vagas.vagas : 100);
    $("[data-af-stat=semana]").textContent = L.filter(function (a) { return agora - new Date(a.created_at).getTime() < SEMANA_MS; }).length;
    $("[data-af-stat=apagar]").textContent = brl(state.comissoes.filter(function (c) { return c.status === "a_pagar"; }).reduce(function (s, c) { return s + c.valor_comissao; }, 0));
    $("[data-af-stat=b2b]").textContent = L.filter(function (a) { return a.canal === "Consultoria / B2B"; }).length;
  }

  function linha(a) {
    var lista = a.status === "ativo" ? ["ativo"].concat(STATUS_EDITAVEIS.filter(function (s) { return s !== "pendente"; })) : STATUS_EDITAVEIS;
    var opcoes = lista.map(function (s) { return "<option value=\"" + s + "\"" + (a.status === s ? " selected" : "") + ">" + STATUS_LABEL[s] + "</option>"; }).join("");
    var botao = a.status === "ativo" ? "Reenviar link" : "Aprovar e enviar link";
    return "<tr data-id=\"" + esc(a.id) + "\">" +
      "<td class=\"who\"><b>" + esc(a.nome) + "</b><a class=\"mail\" href=\"mailto:" + esc(a.email) + "\">" + esc(a.email) + "</a>" +
        (a.audiencia ? "<small>" + esc(a.audiencia) + "</small>" : "") + "</td>" +
      "<td><b class=\"mono\">" + esc(a.cupom || a.codigo) + "</b>" + (a.cupom ? "" : "<small>Sem cupom na Stripe ainda</small>") +
        "<small><button type=\"button\" class=\"btn btn-ghost\" data-copy=\"" + esc(link(a.cupom || a.codigo)) + "\">Copiar link</button></small>" +
        "<small>" + (a.link_enviado_em ? "Link enviado " + esc(data(a.link_enviado_em)) : "Link não enviado") + "</small></td>" +
      "<td>" + esc(a.canal) + "</td>" +
      "<td class=\"mono\">" + esc(cpfFmt(a.cpf)) + "</td>" +
      "<td><small>" + esc(PIX_LABEL[a.pix_tipo] || a.pix_tipo) + "</small><input type=\"text\" data-field=\"pix_chave\" value=\"" + esc(a.pix_chave) + "\" aria-label=\"Chave Pix de " + esc(a.nome) + "\" maxlength=\"140\"></td>" +
      "<td><select data-field=\"status\" aria-label=\"Status de " + esc(a.nome) + "\">" + opcoes + "</select></td>" +
      "<td><button type=\"button\" class=\"btn " + (a.status === "ativo" ? "btn-ghost" : "btn-primary") + "\" data-aprovar>" + botao + "</button>" +
        (a.aprovado_em ? "<small>Aprovado " + esc(data(a.aprovado_em)) + "</small>" : "") +
        "<small><a href=\"https://wa.me/" + esc(numeroWa(a.whatsapp)) + "\" target=\"_blank\" rel=\"noopener\">WhatsApp +" + esc(numeroWa(a.whatsapp)) + "</a></small>" +
        "<small><input type=\"text\" data-field=\"whatsapp\" value=\"" + esc(a.whatsapp) + "\" aria-label=\"WhatsApp de " + esc(a.nome) + "\" maxlength=\"20\"></small></td>" +
      "<td>" + esc(data(a.created_at)) + "</td>" +
      "<td><textarea data-field=\"notas\" rows=\"1\" aria-label=\"Notas de " + esc(a.nome) + "\">" + esc(a.notas) + "</textarea></td>" +
      "</tr>";
  }

  function render() {
    var L = filtrados();
    rows.innerHTML = L.map(linha).join("");
    empty.hidden = L.length > 0;
    empty.textContent = state.afiliados.length ? "Nenhum afiliado com essa busca." : "Nenhum afiliado ainda.";
    $("[data-shown]").textContent = L.length === 1 ? "1 afiliado" : L.length + " afiliados";
    stats();
  }

  function salvar(el) {
    var tr = el.closest("tr"), id = tr && tr.dataset.id, campo = el.dataset.field;
    var a = state.afiliados.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var valor = campo === "notas" ? el.value : el.value.trim();
    if (campo === "whatsapp") {
      var w = numeroWa(valor);
      if (!/^55\d{10,11}$/.test(w)) { el.value = a.whatsapp; toast("WhatsApp inválido: use DDD + número.", "erro"); return; }
      valor = w; el.value = w;
    }
    if (campo === "pix_chave" && !valor) { el.value = a.pix_chave; toast("A chave Pix não pode ficar vazia.", "erro"); return; }
    if ((a[campo] || "") === valor) return;
    var patch = {}; patch[campo] = valor || null;
    sb.from("afiliados").update(patch).eq("id", id).select("id," + campo).single().then(function (r) {
      if (r.error) { el.value = a[campo] || ""; toast("Não foi possível salvar: " + r.error.message, "erro"); return; }
      a[campo] = r.data[campo];
      if (campo === "status") { render(); loadVagas(); } else stats();
      toast("Salvo.");
    });
  }

  rows.addEventListener("change", function (e) { if (e.target.dataset.field) salvar(e.target); });
  rows.addEventListener("click", function (e) {
    var ap = e.target.closest("[data-aprovar]"); if (ap) { aprovar(ap); return; }
    var b = e.target.closest("[data-copy]"); if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy).then(function () { toast("Link copiado."); }, function () { toast(b.dataset.copy); });
  });
  $("[data-com-rows]").addEventListener("click", function (e) {
    var pg = e.target.closest("[data-pagar]"); if (pg) { mudarComissao(pg.dataset.pagar, "pago"); return; }
    var df = e.target.closest("[data-desfazer]"); if (df) { mudarComissao(df.dataset.desfazer, "a_pagar"); return; }
    var b = e.target.closest("[data-copy]"); if (b) navigator.clipboard.writeText(b.dataset.copy).then(function () { toast("Copiado."); });
  });
  $("[data-com-filtros]").addEventListener("click", function (e) {
    var f = e.target.closest("[data-com-filtro]"); if (!f) return;
    state.comFiltro = f.dataset.comFiltro;
    [].forEach.call(document.querySelectorAll("[data-com-filtro]"), function (b) { b.setAttribute("aria-pressed", String(b === f)); });
    renderComissoes();
  });
  $("[data-af-search]").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("[data-refresh]").addEventListener("click", function () { load().then(loadComissoes); loadVagas(); });
  $("[data-retry]").addEventListener("click", load);
})();
