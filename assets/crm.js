/* assets/crm.js — painel interno de leads (/crm/). Equipe lê o CRM; só admin controla acesso.
   As políticas RLS e as RPCs no banco garantem isso, independentemente desta página. */
(function () {
  "use strict";
  var CFG = window.TRUSTIO_AUTH;
  if (!CFG || !window.supabase) return;
  var sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  CFG.sincronizarCookie(sb);

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var shell = $(".crm-shell"), rows = $("[data-rows]"), empty = $("[data-empty]"), gate = $("[data-gate]");
  var STATUS = ["novo", "email_confirmado", "ativo", "trial_esgotado", "assinante", "cancelado"];
  var LABEL = { novo: "Novo", email_confirmado: "E-mail confirmado", ativo: "Ativo", trial_esgotado: "Teste esgotado", assinante: "Assinante", cancelado: "Cancelado" };
  var WA = ["nao_solicitado", "solicitado", "ativo", "encerrado"];
  var WA_LABEL = { nao_solicitado: "Não pediu", solicitado: "Pedido", ativo: "Ativo", encerrado: "Encerrado" };
  // Ordem do funil, para ordenar por status do mais novo ao mais avançado.
  var STATUS_ORDEM = { novo: 0, email_confirmado: 1, ativo: 2, trial_esgotado: 3, assinante: 4, cancelado: 5 };

  // Tipo de usuário. Só os dois e-mails abaixo podem ser admin; o banco confere de novo
  // (função emails_admin() na migração 20260925200000) e recusa qualquer outro.
  var PAPEIS = ["admin", "colaborador", "teste", "cliente"];
  var PAPEL_LABEL = { admin: "Admin", colaborador: "Colaborador", teste: "Teste grátis", cliente: "Cliente" };
  var EMAILS_ADMIN = ["joseedson18@hotmail.com", "matheuscastrocorrea@gmail.com"];
  var ERROS = {
    admin_restrito: "Só joseedson18@hotmail.com e matheuscastrocorrea@gmail.com podem ser admin.",
    papel_exige_conta: "Admin e colaborador precisam ter conta criada no site.",
    ultimo_admin: "Precisa haver pelo menos um admin.",
    papel_so_admin: "Só um admin muda o tipo de usuário."
  };
  function erroLegivel(err) {
    var m = String((err && err.message) || "");
    for (var k in ERROS) if (m.indexOf(k) >= 0) return ERROS[k];
    return "Não foi possível salvar: " + m;
  }

  var PREF = "trustio-crm-ocultar-testes";
  var eu = { id: null, papel: null };
  var state = { leads: [], filter: "", tag: "", q: "", sort: { key: "created_at", dir: -1 }, ocultarTestes: lerPref(), carregadoEm: null };
  // Gravações a caminho, por "id|campo": { valor, seq }. Só a mais recente de cada campo vale,
  // e um recarregamento da lista reaplica esses valores por cima do que veio do banco.
  var pendentes = {}, seqGravacao = 0, loadPedido = 0;

  function lerPref() { try { return localStorage.getItem(PREF) !== "0"; } catch (e) { return true; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(d) { if (!d) return "—"; var x = new Date(d); return x.toLocaleDateString("pt-BR") + " " + x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function gateShow(t, p, actions) { gate.hidden = false; $("[data-gate-title]").textContent = t; $("[data-gate-text]").textContent = p; $("[data-gate-actions]").hidden = !actions; }

  // Datas locais (AAAA-MM-DD), para o próximo contato: "hoje" é o dia no fuso de quem usa o CRM.
  function diaLocal(d) { var p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function hoje() { return diaLocal(new Date()); }
  function diaCurto(iso) { var x = String(iso || "").split("-"); return x.length === 3 ? x[2] + "/" + x[1] : ""; }
  function retornoPendente(l) { return !!l.proximo_contato && l.proximo_contato <= hoje(); }
  function etiquetasDe(l) { return Array.isArray(l.etiquetas) ? l.etiquetas : []; }

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
  // DDDs em uso no Brasil (Anatel).
  var DDD = "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(" ");
  // Telefone: número com "+" de outro país vale como está; sem "+" (ou com +55) precisa ser
  // brasileiro de verdade — DDD existente, celular com 9 na frente (11 dígitos) ou fixo
  // começando de 2 a 5 (10 dígitos). Fora disso fica marcado como inválido e sem link, para
  // não mandar o admin para o WhatsApp de outra pessoa.
  function telefone(raw) {
    var bruto = String(raw || "").trim(), d = bruto.replace(/\D/g, "");
    if (!d) return null;
    if (bruto.charAt(0) === "+" && d.indexOf("55") !== 0) {
      var intl = d.length >= 8 && d.length <= 15;
      return { ok: intl, txt: "+" + d, wa: intl ? "https://wa.me/" + d : null };
    }
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    var ddd = d.slice(0, 2), resto = d.slice(2);
    var ok = DDD.indexOf(ddd) >= 0 && ((resto.length === 9 && resto.charAt(0) === "9") || (resto.length === 8 && /[2-5]/.test(resto.charAt(0))));
    var txt = ok ? "(" + ddd + ") " + (resto.length === 9 ? resto.slice(0, 5) + "-" + resto.slice(5) : resto.slice(0, 4) + "-" + resto.slice(4)) : bruto;
    return { ok: ok, txt: txt, wa: ok ? "https://wa.me/55" + d : null };
  }
  function telHtml(raw) {
    var t = telefone(raw); if (!t) return "";
    if (!t.ok) return "<span class=\"tel bad\" title=\"Não é um número válido: DDD inexistente, dígitos a mais ou a menos, ou celular sem o 9\">" + esc(t.txt) + " · inválido</span>";
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
    // O CRM é da equipe: admin e colaborador. O banco aplica a mesma regra (is_staff()).
    return sb.rpc("meu_papel").then(function (a) {
      var papel = a.data;
      if (papel !== "admin" && papel !== "colaborador") { gateShow("Sem acesso ao CRM", "O CRM é só para a equipe (admin ou colaborador). Peça a um admin para mudar o seu tipo de usuário.", true); return; }
      eu = { id: s.user.id, papel: papel };
      shell.dataset.papel = papel;
      $("[data-eu]").textContent = PAPEL_LABEL[papel];
      gate.hidden = true;
      $("[data-hide-tests]").checked = state.ocultarTestes;
      iniciarEmails();
      // Configurações e painel mestre são só de admin.
      return Promise.all([loadLeads(), papel === "admin" ? loadLimit() : null]).then(function () { shell.dataset.state = "ready"; });
    });
  });

  function loadLeads() {
    var btn = $("[data-refresh]"); btn.disabled = true;
    var linhas = [], pagina = 1000, pedido = ++loadPedido;
    function proxima(de) {
      return sb.from("crm_overview").select("*").order("created_at", { ascending: false }).order("id").range(de, de + pagina - 1).then(function (r) {
        if (r.error) throw r.error;
        linhas = linhas.concat(r.data || []);
        return (r.data || []).length === pagina ? proxima(de + pagina) : linhas;
      });
    }
    return proxima(0).then(function (dados) {
      if (pedido !== loadPedido) return;
      var r = { data: dados };
      btn.disabled = false;
      // Falha de leitura não pode parecer "nenhum lead".
      if (r.error) { $("[data-load-error]").hidden = false; $("[data-load-error-msg]").textContent = r.error.message || "erro desconhecido"; return; }
      $("[data-load-error]").hidden = true;
      state.leads = r.data || []; state.carregadoEm = new Date();
      Object.keys(pendentes).forEach(function (k) {
        var i = k.indexOf("|"), l = lead(k.slice(0, i)); if (l) l[k.slice(i + 1)] = pendentes[k].valor;
      });
      $("[data-updated]").textContent = "Atualizado às " + state.carregadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      render();
    }).catch(function (e) {
      if (pedido !== loadPedido) return;
      btn.disabled = false; $("[data-load-error]").hidden = false;
      $("[data-load-error-msg]").textContent = e.message || "erro desconhecido";
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
    // Mesmo critério do card: quem confirmou o e-mail, em qualquer etapa depois disso.
    if (f === "conf") return !!l.confirmed_at;
    if (f === "fu") return retornoPendente(l);
    if (f.indexOf("pa:") === 0) return !!l.user_id && (l.papel || "teste") === f.slice(3);
    if (f.indexOf("wa:") === 0) return (l.whatsapp_trial_status || "nao_solicitado") === f.slice(3);
    return l.status === f;
  }

  function render() { renderStats(); renderFilters(); renderRows(); renderVisao(); }

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
    var hj = hoje(), atrasados = n(function (l) { return !!l.proximo_contato && l.proximo_contato < hj; });
    set("retornos", n(retornoPendente));
    set("atrasados", atrasados ? atrasados + " atrasado" + (atrasados === 1 ? "" : "s") : "");
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
      var segmento = $("[data-segment-filter]").value.trim().toLowerCase(), acesso = $("[data-access-filter]").value;
      var de = $("[data-created-from]").value, ate = $("[data-created-to]").value;
      var cadastro = l.created_at ? dataLocal(l.created_at).slice(0, 10) : "";
      if (segmento && String(l.segmento || "").toLowerCase().indexOf(segmento) < 0) return false;
      if (acesso && estadoAcesso(l) !== acesso) return false;
      if ((de && cadastro < de) || (ate && cadastro > ate)) return false;
      if (!passaFiltro(l, state.filter)) return false;
      if (state.tag && etiquetasDe(l).indexOf(state.tag) < 0) return false;
      if (!q) return true;
      return [l.nome, l.email, l.empresa, l.telefone, l.whatsapp_numero, l.segmento, l.origem, l.plano, l.notas, PAPEL_LABEL[l.papel], etiquetasDe(l).join(" ")].join(" ").toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      var x = valorOrdem(a, k), y = valorOrdem(b, k);
      return x < y ? -dir : x > y ? dir : 0;
    });
  }

  function renderRows() {
    // Texto digitado e ainda não gravado (plano, notas) sobrevive a qualquer redesenho,
    // com foco e posição do cursor: a gravação só acontece ao sair do campo.
    var rascunhos = [], ativo = document.activeElement, foco = null;
    rows.querySelectorAll("input[data-field], textarea[data-field]").forEach(function (el) {
      var id = el.closest("tr").dataset.id, l = lead(id), f = el.dataset.field;
      var salvo = l && l[f] != null ? String(l[f]) : "";
      var focado = el === ativo;
      if (el.value !== salvo || focado) rascunhos.push({ id: id, f: f, v: el.value, focado: focado, a: el.selectionStart, b: el.selectionEnd });
    });
    var list = visible();
    empty.hidden = list.length > 0;
    $("[data-shown]").textContent = list.length === 1 ? "1 lead" : list.length + " leads";
    rows.innerHTML = list.map(function (l) {
      var tel = telHtml(l.telefone);
      return "<tr data-id=\"" + esc(l.id) + "\">" +
        "<td class=\"who\"><button type=\"button\" class=\"lead-open\" data-open>" + esc(l.nome || "Sem nome") + "</button>" +
          "<span class=\"chip " + esc(l.tipo) + "\">" + (l.tipo === "b2b" ? "Empresa" : "Pessoa") + "</span>" + (ehTeste(l) ? "<span class=\"chip teste\">Teste</span>" : "") +
          retornoHtml(l) + etiquetasHtml(l) + "<small>Acesso: " + esc(rotuloAcesso(l)) + "</small>" +
          "<a class=\"mail\" href=\"mailto:" + esc(l.email) + "\">" + esc(l.email) + "</a>" +
          (tel ? tel : "") +
          (l.empresa || l.segmento ? "<small>" + esc([l.empresa, l.segmento].filter(Boolean).join(" · ")) + "</small>" : "") +
        "</td>" +
        "<td><select class=\"status-sel st-" + esc(l.status) + "\" data-field=\"status\"" + (eu.papel === "admin" ? "" : " disabled") + " aria-label=\"Status de " + esc(l.nome || l.email) + "\">" + STATUS.map(function (s) { return "<option value=\"" + s + "\"" + (s === l.status ? " selected" : "") + ">" + LABEL[s] + "</option>"; }).join("") + "</select>" +
          (l.confirmed_at ? "" : "<small class=\"hint\">e-mail não confirmado</small>") + "</td>" +
        "<td><input type=\"text\" data-field=\"plano\" value=\"" + esc(l.plano || "") + "\" placeholder=\"—\" aria-label=\"Plano\"></td>" +
        "<td>" + papelCell(l) + "</td>" +
        "<td class=\"num\"><b>" + Number(l.mensagens_usadas || 0) + "</b> msg<small>" + Number(l.conversas || 0) + " conversa" + (Number(l.conversas) === 1 ? "" : "s") + "</small></td>" +
        "<td><div class=\"wa\">" + waCell(l) + "</div></td>" +
        "<td class=\"date\">" + fmt(l.created_at) + "<small>" + esc(l.origem || "") + "</small></td>" +
        "<td class=\"date\">" + fmt(ultimoAcesso(l)) + "</td>" +
        "<td><textarea data-field=\"notas\" rows=\"1\" aria-label=\"Notas\" placeholder=\"Anotações internas\">" + esc(l.notas || "") + "</textarea></td>" +
      "</tr>";
    }).join("");
    rascunhos.forEach(function (d) {
      var el = rows.querySelector("tr[data-id=\"" + d.id + "\"] [data-field=\"" + d.f + "\"]"); if (!el) return;
      el.value = d.v;
      if (d.focado) { foco = el; try { el.setSelectionRange(d.a, d.b); } catch (e) { /* campo sem seleção */ } }
    });
    if (foco) foco.focus();
    var pill = $("[data-tag-ativa]");
    pill.hidden = !state.tag; pill.textContent = state.tag ? "Etiqueta: " + state.tag + " ×" : "";
    document.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.setAttribute("aria-sort", th.dataset.sort === state.sort.key ? (state.sort.dir > 0 ? "ascending" : "descending") : "none");
    });
  }

  function retornoHtml(l) {
    if (!l.proximo_contato) return "";
    var hj = hoje(), classe = l.proximo_contato < hj ? " atrasado" : l.proximo_contato === hj ? " hoje" : "";
    var txt = l.proximo_contato < hj ? "Atrasado · " + diaCurto(l.proximo_contato) : l.proximo_contato === hj ? "Retornar hoje" : "Retornar " + diaCurto(l.proximo_contato);
    return "<span class=\"retorno" + classe + "\" title=\"Próximo contato\">" + esc(txt) + "</span>";
  }
  function etiquetasHtml(l) {
    var t = etiquetasDe(l); if (!t.length) return "";
    return "<span class=\"etiquetas\">" + t.map(function (e) {
      return "<button type=\"button\" class=\"etiqueta" + (e === state.tag ? " is-on" : "") + "\" data-tag=\"" + esc(e) + "\" title=\"Filtrar por " + esc(e) + "\">" + esc(e) + "</button>";
    }).join("") + "</span>";
  }

  function papelCell(l) {
    var p = l.papel || "teste";
    // Sem conta no site (só lista de espera) não há usuário para receber um tipo.
    if (!l.user_id) return "<span class=\"papel-fixo\" title=\"Só lista de espera: ainda não criou conta no site\">sem conta</span>";
    var podeAdmin = EMAILS_ADMIN.indexOf(String(l.email || "").toLowerCase()) >= 0;
    var editavel = eu.papel === "admin";
    return "<select class=\"papel-sel pa-" + esc(p) + "\" data-field=\"papel\" aria-label=\"Tipo de usuário de " + esc(l.nome || l.email) + "\"" +
      (editavel ? "" : " disabled title=\"Só um admin muda o tipo de usuário\"") + ">" +
      PAPEIS.map(function (k) {
        var bloq = k === "admin" && !podeAdmin && p !== "admin";
        return "<option value=\"" + k + "\"" + (k === p ? " selected" : "") + (bloq ? " disabled" : "") + ">" + PAPEL_LABEL[k] + (bloq ? " (não autorizado)" : "") + "</option>";
      }).join("") + "</select>";
  }

  function waCell(l) {
    var s = l.whatsapp_trial_status || "nao_solicitado";
    var sel = "<select " + (eu.papel === "admin" ? "" : "disabled ") + "data-field=\"whatsapp_trial_status\" aria-label=\"Teste WhatsApp\">" + WA.map(function (k) { return "<option value=\"" + k + "\"" + (k === s ? " selected" : "") + ">" + WA_LABEL[k] + "</option>"; }).join("") + "</select>";
    var num = l.whatsapp_numero ? telHtml(l.whatsapp_numero) : "";
    var extra = "";
    // Quem pediu, ou quem só deixou telefone no cadastro, pode ser ativado direto daqui.
    if (eu.papel === "admin" && (s === "solicitado" || (s === "nao_solicitado" && (l.whatsapp_numero || l.telefone)))) extra = "<button type=\"button\" class=\"wa-go\" data-wa-activate>Ativar 3 dias</button>";
    if (s === "ativo") extra = (l.whatsapp_trial_ends_at ? "<small>até " + fmt(l.whatsapp_trial_ends_at) + "</small>" : "") + avisoHtml(l);
    return sel + num + extra;
  }

  // Avisos da ativação (e-mail com instruções e mensagem no WhatsApp), enviados pelo banco.
  // Por canal: saiu (✓), está saindo (reserva com menos de 2 min), falhou (erro) ou pendente.
  var DOIS_MIN = 2 * 60 * 1000;
  function avisoFoi(em, l) { return !!em && (!l.whatsapp_trial_started_at || new Date(em) >= new Date(l.whatsapp_trial_started_at)); }
  function avisoCanal(l, p) {
    // Ativação automática (na confirmação do e-mail): o número do cadastro não foi verificado,
    // então o WhatsApp não sai, de propósito. Não é pendência nem falha.
    if (p === "whatsapp_aviso_wa" && l.whatsapp_ativacao === "automatica") return "semwa";
    if (avisoFoi(l[p + "_em"], l)) return "ok";
    if (l[p + "_reserva"] && Date.now() - new Date(l[p + "_reserva"]) < DOIS_MIN) return "saindo";
    if (l[p + "_erro"]) return "erro";
    return "pendente";
  }
  function avisoErros(l) {
    return [l.whatsapp_aviso_email_erro && "e-mail: " + l.whatsapp_aviso_email_erro, l.whatsapp_aviso_wa_erro && "WhatsApp: " + l.whatsapp_aviso_wa_erro].filter(Boolean).join(" · ");
  }
  // Logo depois de ativar, ou com reserva viva, os avisos ainda estão saindo.
  function avisoEmAndamento(l) {
    if (l.whatsapp_trial_status !== "ativo") return false;
    var email = avisoCanal(l, "whatsapp_aviso_email"), zap = avisoCanal(l, "whatsapp_aviso_wa");
    var recente = l.whatsapp_trial_started_at && Date.now() - new Date(l.whatsapp_trial_started_at) < DOIS_MIN;
    return email === "saindo" || zap === "saindo" || (recente && email === "pendente" && (zap === "pendente" || zap === "semwa"));
  }
  function avisoHtml(l) {
    var email = avisoCanal(l, "whatsapp_aviso_email"), zap = avisoCanal(l, "whatsapp_aviso_wa");
    var sinal = { ok: "✓", saindo: "…", erro: "✕", pendente: "—", semwa: "não (número não verificado)" };
    var texto = "Aviso: e-mail " + sinal[email] + " · WhatsApp " + sinal[zap];
    var reenviar = "<button type=\"button\" class=\"wa-go\" data-wa-reenviar>Reenviar avisos</button>";
    if (email === "ok" && (zap === "ok" || zap === "semwa")) return "<small class=\"wa-aviso\">" + texto + "</small>";
    // Falha em um canal aparece na hora, mesmo com o outro ainda saindo; reenviar não atrapalha o
    // envio em andamento (a reserva impede aviso em dobro).
    if (email === "erro" || zap === "erro") return "<small class=\"wa-aviso wa-aviso-erro\" title=\"" + esc(avisoErros(l)) + "\">" + texto + " · falhou</small>" + reenviar;
    if (avisoEmAndamento(l)) return "<small class=\"wa-aviso\">" + (email === "pendente" && (zap === "pendente" || zap === "semwa") ? "Enviando avisos…" : texto) + "</small>";
    return "<small class=\"wa-aviso\">" + (email === "pendente" && (zap === "pendente" || zap === "semwa") ? "Sem aviso enviado" : texto) + "</small>" + reenviar;
  }
  // O aviso sai logo depois da ativação, fora do navegador: recarrega a cada 8 s enquanto algum
  // aviso ainda estiver saindo (no máximo 2 minutos, o prazo da reserva).
  var avisosTimer = null;
  function recarregarAvisos(voltas) {
    voltas = voltas == null ? 15 : voltas;
    clearTimeout(avisosTimer);
    avisosTimer = setTimeout(function () {
      loadLeads().then(function () {
        if (voltas > 1 && state.leads.some(avisoEmAndamento)) recarregarAvisos(voltas - 1);
      });
    }, 8000);
  }

  function lead(id) { return state.leads.filter(function (l) { return l.id === id; })[0]; }

  rows.addEventListener("click", function (e) {
    var o = e.target.closest("[data-open]"); if (o) { abrirDetalhe(o.closest("tr").dataset.id); return; }
    var tg = e.target.closest("[data-tag]"); if (tg) { state.tag = state.tag === tg.dataset.tag ? "" : tg.dataset.tag; renderRows(); return; }
    var rb = e.target.closest("[data-wa-reenviar]");
    if (rb) {
      rb.disabled = true; rb.textContent = "Reenviando…";
      sb.rpc("reenviar_aviso_whatsapp", { p_lead_id: rb.closest("tr").dataset.id }).then(function (r) {
        if (r.error) { toast("Não foi possível reenviar: " + r.error.message, "erro"); rb.disabled = false; rb.textContent = "Reenviar avisos"; return; }
        if (r.data === false) { toast("Avisos não configurados no banco (Vault). Veja o README do Supabase.", "erro"); rb.disabled = false; rb.textContent = "Reenviar avisos"; return; }
        toast("Reenviando o que faltou. O resultado aparece em alguns segundos.");
        recarregarAvisos();
      });
      return;
    }
    var b = e.target.closest("[data-wa-activate]"); if (!b || eu.papel !== "admin") return;
    var id = b.closest("tr").dataset.id; b.disabled = true; b.textContent = "Ativando…";
    sb.rpc("activate_whatsapp_trial", { p_lead_id: id, p_days: 3 }).then(function (r) {
      if (r.error) { toast("Não foi possível ativar: " + r.error.message, "erro"); b.disabled = false; b.textContent = "Ativar 3 dias"; return; }
      toast("Teste de 3 dias ativado. O e-mail e o WhatsApp de boas-vindas saem em seguida.");
      recarregarAvisos();
      return loadLeads();
    });
  });

  rows.addEventListener("change", function (e) {
    var el = e.target.closest("[data-field]"); if (!el) return;
    var id = el.closest("tr").dataset.id, field = el.dataset.field, chave = id + "|" + field;
    var valor = el.value.trim() || null, patch = {}; patch[field] = valor;
    var l = lead(id); if (!l) return;
    // O estado local muda na hora e a gravação fica registrada como pendente: redesenhos e
    // recarregamentos no meio do caminho mostram o valor novo, não o antigo.
    var seq = ++seqGravacao;
    var antes = pendentes[chave] ? pendentes[chave].antes : l[field];
    pendentes[chave] = { valor: valor, seq: seq, antes: antes };
    l[field] = valor;
    if (field === "status" || field === "whatsapp_trial_status" || field === "papel") render(); else renderStats();
    sb.from("crm_leads").update(patch).eq("id", id).select("id," + field + ",whatsapp_trial_ends_at").single().then(function (r) {
      var p = pendentes[chave];
      // Uma gravação mais nova do mesmo campo já está a caminho: ela decide o que fica.
      if (!p || p.seq !== seq) return;
      delete pendentes[chave];
      var atual = lead(id); if (!atual) return;
      if (r.error) {
        atual[field] = p.antes;
        // O campo que falhou volta ao valor gravado (a não ser que ainda esteja sendo editado);
        // os rascunhos nos outros campos são preservados pelo redesenho.
        var falhou = rows.querySelector("tr[data-id=\"" + id + "\"] [data-field=\"" + field + "\"]");
        if (falhou && falhou !== document.activeElement) falhou.value = p.antes == null ? "" : p.antes;
        // Status e WhatsApp mexem em contagens, filtro e no botão "Ativar 3 dias": redesenha tudo.
        if (field === "status" || field === "whatsapp_trial_status" || field === "papel") render(); else renderStats();
        toast(erroLegivel(r.error), "erro");
        return;
      }
      atual[field] = r.data[field];
      // Admin que mudou o próprio tipo: as permissões desta página mudam junto.
      if (field === "papel" && atual.user_id === eu.id) { toast("Seu tipo de usuário mudou. Recarregando…"); setTimeout(function () { location.reload(); }, 1200); return; }
      if (field === "whatsapp_trial_status") {
        atual.whatsapp_trial_ends_at = r.data.whatsapp_trial_ends_at;
        if (r.data.whatsapp_trial_status === "ativo" && p.antes !== "ativo") recarregarAvisos();
      }
      var campo = rows.querySelector("tr[data-id=\"" + id + "\"] [data-field=\"" + field + "\"]");
      if (field === "whatsapp_trial_status" || field === "papel") render();
      else if (campo && campo !== document.activeElement && campo.value !== String(atual[field] == null ? "" : atual[field])) campo.value = atual[field] == null ? "" : atual[field];
      campo = rows.querySelector("tr[data-id=\"" + id + "\"] [data-field=\"" + field + "\"]");
      if (campo) { campo.classList.add("saved"); setTimeout(function () { campo.classList.remove("saved"); }, 1200); }
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
  $("[data-tag-ativa]").addEventListener("click", function () { state.tag = ""; renderRows(); });
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
      ["Acesso", esc(rotuloAcesso(l))],
      ["Início do acesso", fmt(l.acesso_inicio)],
      ["Fim do acesso", fmt(l.acesso_fim)],
      ["Motivo do acesso", esc(l.acesso_motivo || "—")],
      ["Status", LABEL[l.status] || esc(l.status)],
      ["Plano", esc(l.plano || "—")],
      ["Tipo de usuário", l.user_id ? PAPEL_LABEL[l.papel || "teste"] : "sem conta (só lista de espera)"],
      ["Uso", Number(l.mensagens_usadas || 0) + " mensagens · " + Number(l.conversas || 0) + " conversas"],
      ["Cadastro", fmt(l.created_at)],
      ["E-mail confirmado", fmt(l.confirmed_at)],
      ["Último acesso", fmt(ultimoAcesso(l))],
      ["WhatsApp", WA_LABEL[l.whatsapp_trial_status || "nao_solicitado"] + (l.whatsapp_numero ? " · " + telHtml(l.whatsapp_numero) : "")],
      ["Pedido do teste", fmt(l.whatsapp_trial_requested_at)],
      ["Teste até", fmt(l.whatsapp_trial_ends_at)],
      ["Aviso por e-mail", fmt(l.whatsapp_aviso_email_em)],
      ["Aviso no WhatsApp", l.whatsapp_ativacao === "automatica" ? "não enviado: ativação automática, número não verificado" : fmt(l.whatsapp_aviso_wa_em)],
      ["Falha no aviso", esc(avisoErros(l) || "—")],
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
    dlg.dataset.id = l.id;
    preencherAcesso(l);
    carregarConvite(l);
    carregarEmailsDetalhe(l.id);
    $("[data-detail-segment]").value = l.segmento || "";
    $("[data-detail-audit]").hidden = !(eu.papel === "admin" && l.user_id);
    $("[data-d-retorno]").value = l.proximo_contato || "";
    $("[data-d-etiquetas]").value = etiquetasDe(l).join(", ");
    carregarHistorico(l.id);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("[data-detail-close]").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  $("[data-detail-copy]").addEventListener("click", function (e) {
    var v = e.currentTarget.dataset.email;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast("E-mail copiado."); }, function () { toast("Não foi possível copiar.", "erro"); });
  });

  // Status do provedor: enviado não é entregue, e ausência de abertura não prova desinteresse.
  var emailLeadId = null;
  var emailPedido = 0, emailDetalhePedido = 0, emailLimite = 50, emailTimer = 0;
  var EMAIL_ESTADO = { enviado: "Enviado · aguardando entrega", entregue: "Entregue", aberto: "Abertura registrada", clicado: "Clique registrado", sem_interacao: "Sem interação registrada há 48h", atrasado: "Entrega atrasada", rejeitado: "Rejeitado pelo destinatário", falhou: "Falha no envio", spam: "Marcado como spam" };
  function emailHtml(e) {
    var etapas = [["Enviado", e.enviado_em], ["Entregue", e.entregue_em], ["Abertura", e.aberto_em], ["Clique", e.clicado_em]].map(function (x) { return x[0] + ": " + fmt(x[1]); }).join(" · ");
    return "<li><b>" + esc(e.assunto || "Sem assunto") + "</b><span>" + esc(EMAIL_ESTADO[e.estado] || "Aguardando atualização") + "</span><small>" + esc(e.remetente) + " → " + esc(e.destinatario) + "</small><small>" + esc(etapas) + "</small>" +
      (e.multidestinatario ? "<small>Mensagem com vários destinatários: a interação não identifica quem abriu ou clicou.</small>" : "") +
      (e.ultimo_link ? "<small>Último link: " + esc(e.ultimo_link) + " · " + Number(e.cliques || 0) + " clique(s)</small>" : "") + "</li>";
  }
  function carregarEmails() {
    if (eu.papel !== "admin") return Promise.resolve();
    var pedido = ++emailPedido, q = $("[data-email-search]").value.trim(), filtro = $("[data-email-filter]").value;
    var query = sb.from("crm_emails_overview").select("*").order("atualizado_em", { ascending: false }).order("email_id").order("destinatario").limit(emailLimite);
    if (emailLeadId) query = query.eq("lead_id", emailLeadId);
    else if (q) query = query.ilike("destinatario", "%" + q.replace(/[\\%_]/g, "\\$&") + "%");
    if (filtro) query = query.eq("estado", filtro);
    return query.then(function (r) {
      if (pedido !== emailPedido) return;
      if (r.error) { $("[data-email-list]").textContent = "Não foi possível carregar os e-mails."; return; }
      $("[data-email-list]").innerHTML = r.data.length ? r.data.map(emailHtml).join("") : "<li>Nenhum e-mail acompanhado com este filtro.</li>";
      $("[data-email-more]").hidden = r.data.length < emailLimite;
    }).catch(function () { if (pedido === emailPedido) $("[data-email-list]").textContent = "Não foi possível carregar os e-mails."; });
  }
  function carregarEmailsDetalhe(id) {
    var pedido = ++emailDetalhePedido;
    $("[data-detail-email-panel]").hidden = eu.papel !== "admin";
    if (eu.papel !== "admin") return;
    $("[data-detail-email-list]").textContent = "Carregando…";
    sb.from("crm_emails_overview").select("*").eq("lead_id", id).order("atualizado_em", { ascending: false }).order("email_id").order("destinatario").limit(50).then(function (r) {
      if (pedido !== emailDetalhePedido || !dlg.open || dlg.dataset.id !== id) return;
      $("[data-detail-email-list]").innerHTML = r.error ? "<li>Não foi possível carregar os e-mails.</li>" : r.data.length ? r.data.map(emailHtml).join("") : "<li>Nenhum evento de e-mail registrado ainda.</li>";
    }).catch(function () { if (pedido === emailDetalhePedido && dlg.dataset.id === id) $("[data-detail-email-list]").textContent = "Não foi possível carregar os e-mails."; });
  }
  function atualizarEmails() {
    carregarEmails();
    if (dlg.open) carregarEmailsDetalhe(dlg.dataset.id);
  }
  function iniciarEmails() {
    $("[data-email-panel]").hidden = eu.papel !== "admin";
    if (eu.papel !== "admin") return;
    carregarEmails();
    $("[data-email-connection]").textContent = "Conectando atualizações automáticas…";
    sb.channel("crm-emails").on("postgres_changes", { event: "*", schema: "public", table: "crm_emails" }, function () {
      clearTimeout(emailTimer); emailTimer = setTimeout(atualizarEmails, 250);
    }).subscribe(function (status) {
      $("[data-email-connection]").textContent = status === "SUBSCRIBED" ? "Atualizações em tempo real conectadas." : "Reconectando; atualização automática a cada minuto.";
      if (status === "SUBSCRIBED") atualizarEmails();
    });
    // Também renova a janela de 48 h, mesmo quando não chega um evento novo.
    setInterval(function () { if (!document.hidden) atualizarEmails(); }, 60000);
  }
  $("[data-email-refresh]").addEventListener("click", atualizarEmails);
  $("[data-goto-emails]").addEventListener("click", function () { $("[data-email-panel]").scrollIntoView({ behavior: "smooth" }); });
  $("[data-email-more]").addEventListener("click", function () { emailLimite += 50; carregarEmails(); });
  ["[data-email-search]", "[data-email-filter]"].forEach(function (selector) { $(selector).addEventListener("input", function () {
    emailLeadId = null; ++emailPedido; clearTimeout(emailTimer); emailLimite = 50; emailTimer = setTimeout(carregarEmails, 250);
  }); });
  $("[data-detail-email-all]").addEventListener("click", function () {
    var l = lead(dlg.dataset.id); if (!l) return;
    $("[data-email-search]").value = l.email; $("[data-email-filter]").value = ""; emailLimite = 50;
    emailLeadId = l.id; dlg.close(); carregarEmails(); $("[data-email-panel]").scrollIntoView({ behavior: "smooth" });
  });

  var convitePedido = 0, conviteOcupado = {};
  function podeConvidar(l) {
    return eu.papel === "admin" && l.user_id && l.papel === "teste" && l.status !== "assinante" &&
      ["revogado", "bloqueado", "bloqueado_login"].indexOf(l.acesso_modo) < 0 &&
      !(l.acesso_inicio && Date.parse(l.acesso_inicio) > Date.now()) &&
      !(l.acesso_modo === "liberado" && !l.acesso_fim);
  }
  function carregarConvite(l) {
    var pedido = ++convitePedido, id = l.id;
    $("[data-invite-panel]").hidden = eu.papel !== "admin" || !l.user_id;
    $("[data-invite-grant]").disabled = !podeConvidar(l) || !!conviteOcupado[id];
    $("[data-invite-resend]").disabled = true;
    $("[data-invite-status]").textContent = "";
    if (eu.papel !== "admin" || !l.user_id) return;
    $("[data-invite-status]").textContent = "Consultando último convite…";
    sb.from("crm_convites").select("fim,enviado_em,erro,criado_em").eq("lead_id", id).order("criado_em", { ascending: false }).limit(1).maybeSingle().then(function (r) {
      if (pedido !== convitePedido || !dlg.open || dlg.dataset.id !== id) return;
      var c = r.data;
      $("[data-invite-status]").textContent = r.error ? "Não foi possível consultar o último convite." : !c ? "Nenhum convite enviado ainda." :
        "Prazo da cortesia: " + fmt(c.fim) + ". " + (c.enviado_em ? "E-mail enviado em " + fmt(c.enviado_em) + "." : c.erro ? "Envio não confirmado. Tente novamente." : "Envio ainda não confirmado.");
      $("[data-invite-resend]").disabled = !podeConvidar(l) || !!conviteOcupado[id] || !c || Date.parse(c.fim) <= Date.now() || l.acesso_modo !== "liberado" || Date.parse(l.acesso_fim) !== Date.parse(c.fim);
    }).catch(function () {
      if (pedido === convitePedido && dlg.open && dlg.dataset.id === id) $("[data-invite-status]").textContent = "Não foi possível consultar o último convite.";
    });
  }
  async function enviarConvite(conceder) {
    var l = lead(dlg.dataset.id); if (!l || !podeConvidar(l) || conviteOcupado[l.id]) return;
    var id = l.id, chave = "crm-convite/" + eu.id + "/" + id + "/" + conceder;
    var pedido = sessionStorage.getItem(chave);
    if (!pedido) { pedido = crypto.randomUUID(); sessionStorage.setItem(chave, pedido); }
    conviteOcupado[id] = true; ++convitePedido;
    $("[data-invite-grant]").disabled = true; $("[data-invite-resend]").disabled = true;
    $("[data-invite-status]").textContent = "Enviando convite…";
    try {
      var r = await sb.functions.invoke("crm-convite", { body: { lead_id: id, pedido: pedido, conceder: conceder } });
      if (r.error) {
        var mensagem = r.error.message;
        if (r.error.context && [400, 401, 403, 503].indexOf(r.error.context.status) >= 0) sessionStorage.removeItem(chave);
        if (r.error.context && r.error.context.json) { try { mensagem = (await r.error.context.json()).error || mensagem; } catch (_) {} }
        throw new Error(mensagem);
      }
      if (r.data.error) throw new Error((r.data.fim ? "Cortesia até " + fmt(r.data.fim) + ". " : "") + r.data.error);
      if (!r.data.enviado) throw new Error("Envio ainda não confirmado. Tente novamente.");
      sessionStorage.removeItem(chave);
      toast("Convite enviado. Chat grátis até " + fmt(r.data.fim) + ".");
    } catch (err) {
      // Conserva o mesmo pedido em caso de timeout: repetir não concede mais dias nem duplica o e-mail.
      toast(err.message || "Não foi possível enviar o convite.", "erro");
      if (dlg.open && dlg.dataset.id === id) $("[data-invite-status]").textContent = err.message || "Envio não confirmado.";
    } finally {
      conviteOcupado[id] = false;
      await loadLeads();
      if (dlg.open && dlg.dataset.id === id) { preencherAcesso(lead(id)); carregarConvite(lead(id)); carregarHistorico(id); }
    }
  }
  $("[data-invite-grant]").addEventListener("click", function () { enviarConvite(true); });
  $("[data-invite-resend]").addEventListener("click", function () { enviarConvite(false); });

  function estadoAcesso(l) {
    if (l.acesso_modo === "bloqueado" || l.acesso_modo === "bloqueado_login") return "bloqueado";
    if (l.acesso_modo === "revogado" || (l.status === "cancelado" && l.acesso_modo !== "liberado")) return "revogado";
    if (l.acesso_inicio && Date.parse(l.acesso_inicio) > Date.now()) return "agendado";
    if (l.acesso_fim && Date.parse(l.acesso_fim) <= Date.now()) return "vencido";
    return "disponivel";
  }
  function rotuloAcesso(l) {
    return { disponivel: "Disponível", agendado: "Agendado", vencido: "Vencido", revogado: "Revogado", bloqueado: "Bloqueado" }[estadoAcesso(l)];
  }
  function dataLocal(v) {
    if (!v) return "";
    var d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function preencherAcesso(l) {
    $("[data-access-panel]").hidden = eu.papel !== "admin" || !l.user_id;
    $("[data-access-mode]").value = l.acesso_modo || "padrao";
    $("[data-access-start]").value = dataLocal(l.acesso_inicio);
    $("[data-access-end]").value = dataLocal(l.acesso_fim);
    $("[data-access-reason]").value = l.acesso_motivo || "";
    $("[data-access-current]").textContent = "Acesso atual: " + rotuloAcesso(l) + (l.papel === "admin" ? ". Rebaixe o administrador antes de restringir o acesso." : ".");
    $("[data-access-save]").disabled = l.papel === "admin" || l.user_id === eu.id;
  }
  $("[data-access-form]").addEventListener("submit", function (e) {
    e.preventDefault(); var l = lead(dlg.dataset.id); if (!l || eu.papel !== "admin") return;
    var id = l.id, btn = $("[data-access-save]");
    var inicio = $("[data-access-start]").value, fim = $("[data-access-end]").value;
    btn.disabled = true;
    sb.rpc("crm_definir_acesso", { p_lead_id: id, p_modo: $("[data-access-mode]").value,
      p_inicio: inicio ? new Date(inicio).toISOString() : null, p_fim: fim ? new Date(fim).toISOString() : null,
      p_motivo: $("[data-access-reason]").value.trim() }).then(function (r) {
      if (r.error) throw r.error;
      toast("Controle de acesso salvo."); return loadLeads().then(function () { if (dlg.open && dlg.dataset.id === id) abrirDetalhe(id); });
    }).catch(function (err) { toast(err.message || "Não foi possível salvar o acesso.", "erro"); })
      .finally(function () { if (dlg.dataset.id === id) btn.disabled = false; });
  });
  $("[data-access-wa]").addEventListener("click", function (e) {
    var l = lead(dlg.dataset.id); if (!l || eu.papel !== "admin") return;
    var dias = Number($("[data-access-wa-days]").value), id = l.id, btn = e.currentTarget;
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) { toast("Escolha de 1 a 365 dias.", "erro"); return; }
    btn.disabled = true;
    sb.rpc("activate_whatsapp_trial", { p_lead_id: id, p_days: dias }).then(function (r) {
      if (r.error) throw r.error;
      toast("Teste do WhatsApp ativado por " + dias + " dias.");
      return loadLeads().then(function () { if (dlg.open && dlg.dataset.id === id) abrirDetalhe(id); });
    }).catch(function (err) { toast(err.message || "Não foi possível ativar.", "erro"); }).finally(function () { btn.disabled = false; });
  });
  $("[data-access-reset-quota]").addEventListener("click", function (e) {
    var l = lead(dlg.dataset.id); if (!l || eu.papel !== "admin") return;
    var motivo = $("[data-access-reason]").value.trim(), id = l.id, btn = e.currentTarget;
    if (!motivo) { toast("Informe o motivo para reiniciar a cota.", "erro"); return; }
    btn.disabled = true;
    sb.rpc("crm_reiniciar_cota", { p_lead_id: id, p_motivo: motivo }).then(function (r) {
      if (r.error) throw r.error;
      toast("Cota de perguntas reiniciada.");
      return loadLeads().then(function () { if (dlg.open && dlg.dataset.id === id) abrirDetalhe(id); });
    }).catch(function (err) { toast(err.message || "Não foi possível reiniciar a cota.", "erro"); }).finally(function () { btn.disabled = false; });
  });
  $("[data-detail-segment-save]").addEventListener("click", function () {
    gravarFicha({ segmento: $("[data-detail-segment]").value.trim() || null }, "Segmento salvo.");
  });
  ["[data-segment-filter]", "[data-access-filter]", "[data-created-from]", "[data-created-to]"].forEach(function (sel) {
    $(sel).addEventListener("input", renderRows);
  });
  $("[data-clear-admin-filters]").addEventListener("click", function () {
    ["[data-segment-filter]", "[data-access-filter]", "[data-created-from]", "[data-created-to]"].forEach(function (sel) { $(sel).value = ""; }); renderRows();
  });

  // ------------------------------------------------------------- investigação de atividade (só admin)
  // Conversas e mensagens de uma conta, para investigar suspeita de violação dos Termos. O banco só
  // entrega esses dados pela RPC de investigação, que verifica is_admin() no servidor.
  // Fotos não ficam guardadas: aparece só o texto que a pessoa enviou.
  var auditDlg = $("[data-audit]"), audit = { lead: null, conversas: [], msgs: [], porConversa: {} };
  var RE_ANEXO_A = /\n*\[\[anexo: ([^\]\n]*)\]\]\n([\s\S]*?)\n\[\[\/anexo\]\]/g;
  var MAX_LISTA = 400, auditPedido = 0;

  function todasAsLinhas(tabela, colunas, uid, pedido) {
    var linhas = [], pagina = 1000;
    function proxima(de) {
      if (pedido !== auditPedido) return Promise.reject(new Error("Investigação encerrada"));
      return sb.rpc("crm_investigar_" + tabela, { p_user_id: uid }).select(colunas).order("created_at", { ascending: true }).order("id", { ascending: true }).range(de, de + pagina - 1).then(function (r) {
        if (r.error) throw r.error;
        linhas = linhas.concat(r.data || []);
        return (r.data || []).length === pagina ? proxima(de + pagina) : linhas;
      });
    }
    return proxima(0);
  }

  function abrirAuditoria() {
    var l = lead(dlg.dataset.id);
    if (!l || !l.user_id || eu.papel !== "admin") return;
    clearTimeout(buscaTimer);
    var pedido = ++auditPedido;
    audit = { lead: l, conversas: [], msgs: [], porConversa: {} };
    $("[data-audit-title]").textContent = "Atividade de " + (l.nome || l.email);
    $("[data-audit-resumo]").innerHTML = "";
    $("[data-audit-lista]").innerHTML = "";
    $("[data-audit-busca]").value = ""; $("[data-audit-papel]").value = ""; $("[data-audit-conversa]").innerHTML = '<option value="">Todas as conversas</option>';
    $("[data-audit-baixar]").disabled = true;
    $("[data-audit-status]").textContent = "Carregando conversas e mensagens…";
    if (auditDlg.showModal) auditDlg.showModal(); else auditDlg.setAttribute("open", "");
    Promise.all([
      todasAsLinhas("conversations", "id,title,created_at,updated_at", l.user_id, pedido),
      todasAsLinhas("messages", "id,conversation_id,role,content,model,created_at", l.user_id, pedido),
    ]).then(function (res) {
      if (pedido !== auditPedido) return;
      audit.conversas = res[0]; audit.msgs = res[1];
      audit.conversas.forEach(function (c) { audit.porConversa[c.id] = c; });
      $("[data-audit-conversa]").innerHTML = '<option value="">Todas as conversas</option>' + audit.conversas.slice().reverse().map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc((c.title || "Sem título").slice(0, 70)) + " · " + esc(fmt(c.created_at)) + "</option>";
      }).join("");
      $("[data-audit-baixar]").disabled = false;
      resumoAuditoria(); renderAuditoria();
    }).catch(function (e) {
      if (pedido !== auditPedido) return;
      $("[data-audit-status]").textContent = "Não foi possível carregar: " + ((e && e.message) || "erro desconhecido");
    });
  }

  function resumoAuditoria() {
    var enviadas = 0, respostas = 0, anexos = 0, modelos = {};
    audit.msgs.forEach(function (m) {
      if (m.role === "user") { enviadas++; RE_ANEXO_A.lastIndex = 0; while (RE_ANEXO_A.exec(m.content || "")) anexos++; }
      else { respostas++; var k = m.model || "—"; modelos[k] = (modelos[k] || 0) + 1; }
    });
    var primeira = audit.msgs[0], ultima = audit.msgs[audit.msgs.length - 1];
    var linhas = [
      ["Conversas", String(audit.conversas.length)],
      ["Mensagens enviadas", String(enviadas)],
      ["Respostas do modelo", String(respostas)],
      ["Anexos (texto lido)", String(anexos)],
      ["Primeira atividade", primeira ? fmt(primeira.created_at) : "—"],
      ["Última atividade", ultima ? fmt(ultima.created_at) : "—"],
      ["Modelos usados", Object.keys(modelos).map(function (k) { return esc(k) + " (" + modelos[k] + ")"; }).join(" · ") || "—"],
    ];
    $("[data-audit-resumo]").innerHTML = linhas.map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>"; }).join("");
  }

  // Texto da mensagem: escapado, anexos recolhidos e o termo buscado destacado.
  function marcar(texto, termo) {
    if (!termo) return esc(texto);
    var t = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp(t, "gi"), html = "", ultimo = 0, m;
    while ((m = re.exec(texto))) {
      html += esc(texto.slice(ultimo, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
      ultimo = re.lastIndex;
    }
    return html + esc(texto.slice(ultimo));
  }
  function corpoMensagem(texto, termo) {
    var html = "", ultimo = 0, m;
    RE_ANEXO_A.lastIndex = 0;
    function trecho(t) { t = t.trim(); return t ? "<p>" + marcar(t, termo).replace(/\n/g, "<br>") + "</p>" : ""; }
    while ((m = RE_ANEXO_A.exec(texto))) {
      html += trecho(texto.slice(ultimo, m.index));
      html += '<details class="audit-anexo"><summary>Anexo: ' + esc(m[1]) + "</summary><pre>" + marcar(m[2], termo) + "</pre></details>";
      ultimo = RE_ANEXO_A.lastIndex;
    }
    return html + trecho(texto.slice(ultimo));
  }

  function renderAuditoria() {
    var termo = $("[data-audit-busca]").value.trim(), papel = $("[data-audit-papel]").value, conv = $("[data-audit-conversa]").value;
    var t = termo.toLowerCase();
    var lista = audit.msgs.filter(function (m) {
      return (!papel || m.role === papel) && (!conv || m.conversation_id === conv) && (!t || String(m.content || "").toLowerCase().indexOf(t) >= 0);
    });
    var html = "", convAtual = null;
    lista.slice(0, MAX_LISTA).forEach(function (m) {
      if (m.conversation_id !== convAtual) {
        convAtual = m.conversation_id;
        var c = audit.porConversa[convAtual];
        html += '<li class="audit-conv"><b>' + esc(c ? (c.title || "Sem título") : "Conversa apagada") + "</b><span>" + esc(c ? "aberta em " + fmt(c.created_at) : "") + "</span></li>";
      }
      var quem = m.role === "user" ? "Pessoa" : "Trustio";
      html += '<li class="audit-msg audit-' + (m.role === "user" ? "user" : "ia") + '"><div class="audit-meta"><span class="audit-quem">' + quem + "</span><time>" + esc(fmt(m.created_at)) + "</time>" +
        (m.model ? '<span class="audit-modelo">' + esc(m.model) + "</span>" : "") + "</div>" + corpoMensagem(String(m.content || ""), termo) + "</li>";
    });
    $("[data-audit-lista]").innerHTML = html;
    $("[data-audit-status]").textContent = !audit.msgs.length ? "Nenhuma mensagem nesta conta."
      : lista.length > MAX_LISTA ? "Mostrando " + MAX_LISTA + " de " + lista.length + " mensagens: refine a busca ou escolha uma conversa."
      : lista.length + (lista.length === 1 ? " mensagem" : " mensagens") + (lista.length < audit.msgs.length ? " de " + audit.msgs.length : "") + ".";
  }

  function baixarAuditoria() {
    var l = audit.lead; if (!l) return;
    var dados = {
      exportado_em: new Date().toISOString(), exportado_por: eu.id,
      finalidade: "Investigação de possível violação dos Termos de Uso (acesso de administrador)",
      conta: { user_id: l.user_id, email: l.email, nome: l.nome || null },
      conversas: audit.conversas, mensagens: audit.msgs,
    };
    var blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "trustio-atividade-" + String(l.email || l.user_id).replace(/[^a-z0-9@._-]+/gi, "_") + "-" + hoje() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  var buscaTimer = null;
  $("[data-detail-audit]").addEventListener("click", abrirAuditoria);
  $("[data-audit-close]").addEventListener("click", function () { auditDlg.close(); });
  auditDlg.addEventListener("click", function (e) { if (e.target === auditDlg) auditDlg.close(); });
  auditDlg.addEventListener("close", function () { ++auditPedido; clearTimeout(buscaTimer); audit = { lead: null, conversas: [], msgs: [], porConversa: {} }; $("[data-audit-lista]").innerHTML = ""; });
  $("[data-audit-busca]").addEventListener("input", function () { clearTimeout(buscaTimer); buscaTimer = setTimeout(renderAuditoria, 200); });
  $("[data-audit-papel]").addEventListener("change", renderAuditoria);
  $("[data-audit-conversa]").addEventListener("change", renderAuditoria);
  $("[data-audit-baixar]").addEventListener("click", baixarAuditoria);

  // Grava um campo da ficha (próximo contato, etiquetas) e atualiza linha, números e histórico.
  function gravarFicha(patch, ok) {
    var id = dlg.dataset.id, l = lead(id); if (!l) return;
    var cols = Object.keys(patch).join(",");
    sb.from("crm_leads").update(patch).eq("id", id).select("id," + cols).single().then(function (r) {
      if (r.error) { toast(erroLegivel(r.error), "erro"); abrirDetalhe(id); return; }
      Object.keys(patch).forEach(function (k) { l[k] = r.data[k]; });
      render(); if (dlg.open && dlg.dataset.id === id) abrirDetalhe(id);
      toast(ok);
    });
  }
  $("[data-d-retorno]").addEventListener("change", function (e) {
    gravarFicha({ proximo_contato: e.target.value || null }, e.target.value ? "Retorno marcado para " + e.target.value.split("-").reverse().join("/") + "." : "Retorno removido.");
  });
  document.querySelectorAll("[data-d-mais]").forEach(function (b) {
    b.addEventListener("click", function () {
      var dias = b.dataset.dMais;
      if (!dias) { gravarFicha({ proximo_contato: null }, "Retorno removido."); return; }
      var d = new Date(); d.setDate(d.getDate() + Number(dias));
      gravarFicha({ proximo_contato: diaLocal(d) }, "Retorno marcado para " + diaLocal(d).split("-").reverse().join("/") + ".");
    });
  });
  function salvarEtiquetas() {
    var vistas = {}, lista = $("[data-d-etiquetas]").value.split(",").map(function (x) { return x.trim().replace(/\s+/g, " "); })
      .filter(function (x) { var k = x.toLowerCase(); if (!x || vistas[k]) return false; vistas[k] = true; return true; });
    if (lista.length > 10) { toast("No máximo 10 etiquetas.", "erro"); return; }
    if (lista.some(function (x) { return x.length > 30; })) { toast("Cada etiqueta pode ter até 30 caracteres.", "erro"); return; }
    gravarFicha({ etiquetas: lista }, lista.length ? "Etiquetas salvas." : "Etiquetas removidas.");
  }
  $("[data-d-etiquetas-salvar]").addEventListener("click", salvarEtiquetas);
  $("[data-d-etiquetas]").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); salvarEtiquetas(); } });

  // Histórico do lead: quem mudou o quê e quando (gravado pelo banco, só a equipe lê).
  var CAMPO_LABEL = { convite_retorno: "Convite de retorno", segmento: "Segmento", acesso_modo: "Controle de acesso", acesso_inicio: "Início do acesso", acesso_fim: "Fim do acesso", acesso_motivo: "Motivo", whatsapp_trial_ends_at: "Fim do teste WhatsApp", criado: "Cadastro", status: "Status", plano: "Plano", papel: "Tipo de usuário", whatsapp_trial_status: "WhatsApp", notas: "Notas", proximo_contato: "Próximo contato", etiquetas: "Etiquetas", telefone: "Telefone", confirmed_at: "E-mail confirmado" };
  function valorEvento(campo, v) {
    if (v == null || v === "") return "—";
    if (campo === "status") return LABEL[v] || v;
    if (campo === "papel") return PAPEL_LABEL[v] || v;
    if (campo === "whatsapp_trial_status") return WA_LABEL[v] || v;
    if (campo === "proximo_contato") return v.split("-").reverse().join("/");
    if (campo === "confirmed_at") return fmt(v);
    return v;
  }
  var historicoPedido = 0;
  function carregarHistorico(id) {
    var ol = $("[data-historico]"), pedido = ++historicoPedido;
    ol.innerHTML = "<li class=\"hist-vazio\">Carregando…</li>";
    sb.from("crm_eventos").select("em,autor_email,campo,de,para").eq("lead_id", id).order("em", { ascending: false }).order("id", { ascending: false }).limit(100).then(function (r) {
      if (pedido !== historicoPedido) return;
      if (r.error) { ol.innerHTML = "<li class=\"hist-vazio\">Não foi possível carregar o histórico: " + esc(r.error.message) + "</li>"; return; }
      var ev = r.data || [];
      if (!ev.length) { ol.innerHTML = "<li class=\"hist-vazio\">Sem registros ainda.</li>"; return; }
      ol.innerHTML = ev.map(function (e) {
        var quem = e.autor_email ? e.autor_email.split("@")[0] : "sistema";
        var oque = e.campo === "criado" ? "Cadastro" + (e.para ? " por " + esc(e.para) : "")
          : e.campo === "confirmed_at" ? "E-mail confirmado"
          : esc(CAMPO_LABEL[e.campo] || e.campo) + ": <s>" + esc(valorEvento(e.campo, e.de)) + "</s> → <b>" + esc(valorEvento(e.campo, e.para)) + "</b>";
        return "<li><time>" + fmt(e.em) + "</time><span>" + oque + "</span><small title=\"" + esc(e.autor_email || "mudança automática do sistema") + "\">" + esc(quem) + "</small></li>";
      }).join("");
    });
  }

  // ------------------------------------------------------------- visão geral
  // Funil (mesma base da tabela: sem testes, se ocultos) e cadastros por dia nos últimos 30 dias.
  function renderVisao() {
    var L = base(), total = L.length;
    var etapas = [
      ["Cadastros", total],
      ["E-mail confirmado", L.filter(function (l) { return !!l.confirmed_at; }).length],
      ["Usaram o chat", L.filter(function (l) { return Number(l.mensagens_usadas || 0) > 0 || Number(l.conversas || 0) > 0; }).length],
      ["Assinantes", L.filter(function (l) { return l.status === "assinante"; }).length]
    ];
    var funil = $("[data-funil]"); funil.textContent = "";
    etapas.forEach(function (e, i) {
      var li = document.createElement("li");
      var pct = total ? Math.round(e[1] / total * 100) : 0;
      var ant = i ? etapas[i - 1][1] : 0;
      li.innerHTML = "<span class=\"funil-nome\">" + e[0] + "</span><span class=\"funil-barra\"><i></i></span><b>" + e[1] + "</b><small>" +
        (i === 0 ? "100%" : pct + "% do total" + (ant ? " · " + Math.round(e[1] / ant * 100) + "% da etapa anterior" : "")) + "</small>";
      li.querySelector("i").style.width = (total ? Math.max(e[1] ? 2 : 0, e[1] / total * 100) : 0) + "%";
      funil.appendChild(li);
    });

    var dias = [], porDia = {}, d = new Date();
    for (var k = 29; k >= 0; k--) { var x = new Date(d); x.setDate(d.getDate() - k); var iso = diaLocal(x); dias.push(iso); porDia[iso] = 0; }
    L.forEach(function (l) { var iso = l.created_at ? diaLocal(new Date(l.created_at)) : ""; if (iso in porDia) porDia[iso]++; });
    var max = Math.max.apply(null, dias.map(function (x) { return porDia[x]; }).concat([1]));
    var soma7 = dias.slice(-7).reduce(function (a, x) { return a + porDia[x]; }, 0), soma30 = dias.reduce(function (a, x) { return a + porDia[x]; }, 0);
    $("[data-cad-resumo]").textContent = "· " + soma7 + " em 7 dias · " + soma30 + " em 30 dias";
    $("[data-cad-ini]").textContent = diaCurto(dias[0]);
    var barras = $("[data-barras]"); barras.textContent = "";
    barras.setAttribute("aria-label", "Cadastros por dia nos últimos 30 dias: " + soma30 + " no total, " + soma7 + " nos últimos 7 dias. Pico de " + max + " em um dia.");
    dias.forEach(function (iso) {
      var b = document.createElement("span"), v = porDia[iso];
      b.className = "barra" + (v ? "" : " zero");
      b.title = diaCurto(iso) + ": " + v + " cadastro" + (v === 1 ? "" : "s");
      var i = document.createElement("i"); i.style.height = (v ? Math.max(4, v / max * 100) : 0) + "%";
      b.appendChild(i); barras.appendChild(b);
    });
  }

  $("[data-export]").addEventListener("click", function () {
    var cols = ["nome", "email", "telefone", "tipo", "empresa", "segmento", "origem", "acesso_modo", "acesso_inicio", "acesso_fim", "acesso_motivo", "status", "papel", "plano", "mensagens_usadas", "conversas", "whatsapp_numero", "whatsapp_trial_status", "whatsapp_trial_requested_at", "whatsapp_trial_ends_at", "whatsapp_aviso_email_em", "whatsapp_aviso_email_erro", "whatsapp_aviso_wa_em", "whatsapp_aviso_wa_erro", "created_at", "confirmed_at", "ultimo_acesso", "proximo_contato", "etiquetas", "notas"];
    // Valores vindos do cadastro público: neutraliza prefixos que planilhas interpretam como fórmula.
    var cell = function (v) {
      v = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    };
    var lista = visible();
    var csv = [cols.join(";")].concat(lista.map(function (l) {
      return cols.map(function (c) { return cell(c === "ultimo_acesso" ? ultimoAcesso(l) : c === "etiquetas" ? etiquetasDe(l).join(", ") : l[c]); }).join(";");
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
    if (window.TrustioTema) window.TrustioTema.escolher(light ? "light" : "dark"); else try { localStorage.setItem("trustio-theme", light ? "light" : "dark"); } catch (e) { /* sem storage */ }
  });
  toggle.setAttribute("aria-pressed", document.documentElement.getAttribute("data-theme") === "light" ? "true" : "false");
  // Troca automática de horário com a página aberta (assets/theme.js).
  document.addEventListener("trustio:tema", function (e) { toggle.setAttribute("aria-pressed", e.detail === "light" ? "true" : "false"); });
})();
