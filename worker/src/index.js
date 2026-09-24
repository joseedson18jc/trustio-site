/**
 * Trustio · Worker da lista de espera (api.trustio.com.br)
 *
 * Substitui o worker cujo e-mail saía com o link quebrado — a URL de confirmação
 * terminava em "}", porque o template montava o endereço sem substituir a variável.
 * Aqui o endereço é montado com URL/URLSearchParams, que não tem como produzir um
 * link malformado, e há um teste de fumaça em GET /debug/link para conferir.
 *
 * Rotas
 *   POST /signup           inscreve e dispara o e-mail de confirmação
 *   GET  /confirm?token=   confirma a inscrição
 *   GET  /saude            diz se as variáveis estão configuradas (sem revelá-las)
 *   GET  /saude?verificar=supabase&sha256=   confere a chave configurada com a esperada
 *
 * Variáveis (wrangler secret put NOME)
 *   SUPABASE_URL                https://mjdaluioyutnxlyomzyd.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   chave de serviço do projeto  ← segredo
 *   RESEND_API_KEY              chave da Resend              ← segredo
 *   EMAIL_FROM                  Trustio <no-reply@send.trustio.com.br>
 *   SITE_URL                    https://trustio.com.br
 *   API_URL                     https://api.trustio.com.br
 *
 * A inscrição é gravada no mesmo crm_leads da conta, pelas funções registrar_optin
 * e confirmar_optin: uma lista de clientes só, não duas.
 *
 * Enquanto o banco do projeto Supabase novo não existe, ARMAZENAMENTO = "d1" grava a
 * inscrição no D1 trustio-lista-de-espera (worker/migrations). Links antigos do KV
 * SIGNUPS continuam confirmando. Na troca, ver worker/README.md.
 */

const ORIGENS = /^https:\/\/(?:[a-z0-9-]+\.)?trustio\.com\.br$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGENS.test(origin) ? origin : "https://trustio.com.br",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    Vary: "Origin",
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** O ponto exato onde o worker antigo falhava: montar o endereço de confirmação.
 *  Quem se inscreveu pela versão em inglês do site confirma numa página em inglês:
 *  o idioma viaja no próprio link. */
function linkDeConfirmacao(env, token, idioma = "pt") {
  const url = new URL("/confirm", env.API_URL || "https://api.trustio.com.br");
  url.searchParams.set("token", token);
  if (idioma === "en") url.searchParams.set("lang", "en");
  return url.toString();
}

/** "en" quando a inscrição veio de /en/ (campo lang, ou o _next do formulário sem JS). */
function idiomaDaInscricao(dados) {
  if (String(dados.lang || "").toLowerCase() === "en") return "en";
  try { return /^\/en\//.test(new URL(String(dados._next || ""), "https://trustio.com.br").pathname) ? "en" : "pt"; }
  catch { return "pt"; }
}

/**
 * Para onde redirecionar depois de um envio sem JavaScript.
 *
 * O `_next` vem do corpo da requisição, então um site qualquer pode postar aqui
 * pedindo redirecionamento para o endereço dele — e a resposta sairia de
 * api.trustio.com.br, emprestando a credibilidade do domínio a uma página de
 * phishing. Só aceitamos destino no próprio site; qualquer outro vira o padrão.
 *
 * A lista aqui é própria, e não a do CORS: aquela aceita localhost para o
 * desenvolvimento, e um destino de redirecionamento não deve herdar essa folga.
 * Em produção só vale https no domínio da Trustio; para rodar local, o destino
 * precisa bater exatamente com a origem de SITE_URL.
 */
const DESTINOS = /^https:\/\/(?:[a-z0-9-]+\.)?trustio\.com\.br$/;

function destinoSeguro(bruto, env, idioma = "pt") {
  const base = env.SITE_URL || "https://trustio.com.br";
  const padrao = `${base}${idioma === "en" ? "/en" : ""}/obrigado.html?lista=espera`;
  if (!bruto) return padrao;
  let destino;
  let origemDoSite;
  try {
    destino = new URL(String(bruto), base);
    origemDoSite = new URL(base).origin;
  } catch {
    return padrao;
  }
  if (DESTINOS.test(destino.origin)) return destino.toString();
  if (destino.origin === origemDoSite) return destino.toString();
  return padrao;
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ─────────────────────────────────────────────────────────────── banco
// A chave legada service_role é um JWT e vai também no Authorization. A chave nova
// (sb_secret_…) não é JWT: vai só no apikey, e o gateway já a trata como service_role.
function cabecalhosServico(chave) {
  const h = { apikey: chave, "Content-Type": "application/json" };
  if (String(chave).startsWith("eyJ")) h.Authorization = `Bearer ${chave}`;
  return h;
}
// Para GET /saude?verificar=supabase&sha256=<hex>: diz se a chave configurada é a que o
// operador espera e se o projeto a aceita. Só quem já conhece a chave certa sabe o
// sha256 dela, então quem não sabe recebe só "não confere": nenhum detalhe da chave
// configurada e nenhuma chamada ao Supabase. Com o sha256 certo, o worker testa a
// chave no projeto e devolve o status; nenhum trecho dela sai, nem se o Supabase a ecoar.
function semAspasNemEspacos(chave) {
  return String(chave).trim().replace(/^["']+|["']+$/g, "").trim();
}
async function sha256Hex(texto) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function verificarChaveSupabase(env, esperado) {
  const alvo = String(esperado || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(alvo)) {
    return { confere: null, erro: "informe sha256=<64 hex> com o sha256 da chave esperada" };
  }
  const chave = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return { confere: "não", motivo: "SUPABASE_SERVICE_ROLE_KEY ausente" };
  const limpa = semAspasNemEspacos(chave);
  let confere;
  if (await sha256Hex(String(chave)) === alvo) confere = "sim";
  else if (limpa !== String(chave) && await sha256Hex(limpa) === alvo) confere = "sim, mas com espaço, quebra de linha ou aspas em volta";
  else return { confere: "não" };

  const info = { confere, projeto: null, resposta_do_supabase: null, mensagem: null };
  try { info.projeto = new URL(env.SUPABASE_URL).host; } catch { info.mensagem = "SUPABASE_URL inválida"; return info; }
  try {
    const { "Content-Type": _, ...cabecalhos } = cabecalhosServico(chave);
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/`, { headers: cabecalhos, signal: AbortSignal.timeout(5000) });
    info.resposta_do_supabase = r.status;
    if (!r.ok) {
      // Tira a chave do texto inteiro antes de cortar: cortar antes deixaria um pedaço dela.
      let msg = await r.text();
      try { msg = JSON.parse(msg).message || msg; } catch { /* texto puro */ }
      msg = String(msg);
      for (const c of [String(chave), limpa]) if (c) msg = msg.split(c).join("…");
      info.mensagem = msg.slice(0, 160);
    }
  } catch (err) {
    info.mensagem = err?.name === "TimeoutError" ? "sem resposta em 5 s" : "falha de rede";
  }
  return info;
}

async function rpc(env, nome, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: cabecalhosServico(env.SUPABASE_SERVICE_ROLE_KEY),
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`rpc ${nome} ${r.status}: ${texto.slice(0, 300)}`);
  try { return JSON.parse(texto); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────── D1 (provisório)
const PRAZO_DO_LINK_MS = 48 * 60 * 60 * 1000;
// Um segundo e-mail para o mesmo endereço dentro deste intervalo não sai: evita
// duplicata em clique duplo ou reenvio do formulário.
const INTERVALO_DE_REENVIO_MS = 5 * 60 * 1000;

function usaD1(env) {
  return env.ARMAZENAMENTO === "d1";
}

function novoToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mesmo contrato de registrar_optin: { ok, token } quando há e-mail a enviar, só { ok }
 * quando não há (já confirmado, ou um link saiu há menos de 5 minutos).
 *
 * Um batch só, que o D1 executa como transação: o lead é gravado, e o link novo só
 * nasce se o lead não estiver confirmado nem tiver recebido link há pouco.
 * Os links anteriores continuam valendo até o e-mail novo sair (concluirNoD1).
 */
async function registrarNoD1(env, lead, agora = Date.now()) {
  const db = env.DB;
  await trazerDoKV(env, lead.email);
  const agoraISO = new Date(agora).toISOString();
  const limite = new Date(agora - INTERVALO_DE_REENVIO_MS).toISOString();
  const token = novoToken();
  const [, , , emitido] = await db.batch([
    // Campos vazios não apagam o que uma inscrição anterior trouxe; a origem que vale
    // é a registrada primeiro. O status e a trava de reenvio não mudam aqui.
    db.prepare(`INSERT INTO leads (email, nome, telefone, tipo, empresa, segmento, origem, notas, criado_em, atualizado_em)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
      ON CONFLICT (email) DO UPDATE SET
        nome = COALESCE(excluded.nome, nome),
        telefone = COALESCE(excluded.telefone, telefone),
        tipo = COALESCE(excluded.tipo, tipo),
        empresa = COALESCE(excluded.empresa, empresa),
        segmento = COALESCE(excluded.segmento, segmento),
        origem = COALESCE(origem, excluded.origem),
        notas = COALESCE(excluded.notas, notas),
        atualizado_em = ?9`)
      .bind(lead.email, lead.nome, lead.telefone, lead.tipo, lead.empresa, lead.segmento,
        lead.origem || "lista-de-espera", lead.notas, agoraISO),
    // O link novo só nasce se o lead não estiver confirmado nem tiver recebido link há pouco.
    db.prepare(`INSERT INTO links (token, email, expira_em, criado_em)
      SELECT ?1, ?2, ?3, ?4 WHERE NOT EXISTS (
        SELECT 1 FROM leads WHERE email = ?2 AND (status = 'confirmado' OR ultimo_link_em > ?5))`)
      .bind(token, lead.email, new Date(agora + PRAZO_DO_LINK_MS).toISOString(), agoraISO, limite),
    db.prepare("UPDATE leads SET ultimo_link_em = ?2 WHERE email = ?1 AND EXISTS (SELECT 1 FROM links WHERE token = ?3)")
      .bind(lead.email, agoraISO, token),
    db.prepare("SELECT 1 AS ok FROM links WHERE token = ?1").bind(token),
  ]);
  return emitido.results.length ? { ok: true, token } : { ok: true };
}

/**
 * O e-mail saiu: os links anteriores do mesmo endereço deixam de valer. Se esta escrita
 * falhar, eles continuam valendo junto com o novo, todos na mesma caixa de entrada.
 */
async function concluirNoD1(env, email, token) {
  await env.DB.prepare("DELETE FROM links WHERE email = ?1 AND token <> ?2").bind(email, token).run();
}

/**
 * O envio falhou: o link novo nunca chegou a ninguém, e a trava de 5 minutos é liberada
 * para a pessoa poder tentar de novo. Os links anteriores continuam valendo.
 */
async function descartarNoD1(env, email, token) {
  const db = env.DB;
  await db.batch([
    db.prepare("DELETE FROM links WHERE token = ?1").bind(token),
    db.prepare("UPDATE leads SET ultimo_link_em = NULL WHERE email = ?1").bind(email),
  ]);
}

/**
 * Mesmo contrato de confirmar_optin. A confirmação e a baixa de todos os links do
 * e-mail vão num batch só: ou as duas acontecem, ou nenhuma.
 */
async function confirmarNoD1(env, token, agora = Date.now(), antesDeConfirmar = null) {
  const db = env.DB;
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, error: "token_invalido" };
  const link = await db.prepare("SELECT email, expira_em FROM links WHERE token = ?1").bind(token).first();
  if (!link) return confirmarLinkDoKV(env, token, agora, antesDeConfirmar);
  if (agora > Date.parse(link.expira_em)) return { ok: false, error: "token_expirado" };
  const agoraISO = new Date(agora).toISOString();
  // Depois da troca para o Supabase: a confirmação vai para lá antes de o link ser
  // consumido aqui. Se falhar, nada muda e o mesmo link confirma na nova tentativa.
  if (antesDeConfirmar) {
    const lead = await db.prepare("SELECT * FROM leads WHERE email = ?1").bind(link.email).first();
    await antesDeConfirmar({ ...lead, email: link.email }, agoraISO);
  }
  const [confirmacao] = await db.batch([
    db.prepare(`UPDATE leads SET status = 'confirmado', confirmado_em = COALESCE(confirmado_em, ?2), atualizado_em = ?2
      WHERE email = ?1 AND EXISTS (SELECT 1 FROM links WHERE token = ?3)`).bind(link.email, agoraISO, token),
    db.prepare("DELETE FROM links WHERE email = ?1 AND EXISTS (SELECT 1 FROM links WHERE token = ?2)").bind(link.email, token),
  ]);
  // Zero linhas: outro clique no mesmo link confirmou primeiro.
  if (!confirmacao.meta.changes) return { ok: false, error: "token_invalido" };
  return { ok: true, email: link.email };
}

/**
 * Inscrições gravadas no KV SIGNUPS entre 24/09 07:36 e a troca para o D1: o lead em
 * lead:<e-mail>, a confirmação em status ou em confirmado:<e-mail>.
 */
async function leadDoKV(env, email) {
  const kv = env.SIGNUPS;
  if (!kv) return null;
  // Uma leitura do KV que falha propaga o erro: a requisição responde 502/503 e a pessoa
  // tenta de novo. Tratar a falha como "não existe" gravaria no D1 um lead pendente por
  // cima de uma confirmação que está no KV. Só um valor ilegível conta como ausente.
  const [textoLead, textoConfirmado] = await Promise.all([kv.get(`lead:${email}`), kv.get(`confirmado:${email}`)]);
  const lead = lerJSONOuNulo(textoLead);
  const confirmado = textoConfirmado ? lerJSONOuNulo(textoConfirmado) || {} : null;
  if (!lead && !confirmado) return null;
  const confirmadoEm = confirmado?.confirmado_em || (lead?.status === "confirmado" ? lead.confirmado_em : null);
  return { ...lead, email, confirmado: Boolean(confirmado) || lead?.status === "confirmado", confirmado_em: confirmadoEm || null };
}

function lerJSONOuNulo(texto) {
  if (!texto) return null;
  try { return JSON.parse(texto); } catch { return null; }
}

/** Grava no D1 o lead do KV, com os campos e o status que ele tinha, se o D1 ainda não o tiver. */
async function gravarLeadDoKV(env, antigo, agoraISO) {
  await env.DB.prepare(`INSERT INTO leads (email, nome, telefone, tipo, empresa, segmento, origem, notas,
      status, criado_em, atualizado_em, confirmado_em)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT (email) DO NOTHING`)
    .bind(antigo.email, antigo.nome ?? null, antigo.telefone ?? null, antigo.tipo ?? null, antigo.empresa ?? null,
      antigo.segmento ?? null, antigo.origem ?? null, antigo.notas ?? null,
      antigo.confirmado ? "confirmado" : "pendente", antigo.criado_em || agoraISO, agoraISO,
      antigo.confirmado ? antigo.confirmado_em || agoraISO : null)
    .run();
}

/**
 * Antes de uma inscrição, quem só existe no KV entra no D1 como estava: quem já confirmou
 * continua confirmado e não recebe outro link, e os campos gravados lá não se perdem.
 */
async function trazerDoKV(env, email) {
  if (!env.SIGNUPS) return;
  if (await env.DB.prepare("SELECT 1 AS ok FROM leads WHERE email = ?1").bind(email).first()) return;
  const antigo = await leadDoKV(env, email);
  if (antigo) await gravarLeadDoKV(env, antigo, new Date().toISOString());
}

/**
 * Links enviados pelo KV continuam valendo. O worker no ar até a troca (322fb09) gravava
 * token:<token> → { email } e guardava token e token_expira_em no lead; aceitamos também
 * o prazo na própria chave do token. A confirmação grava o lead no D1 já confirmado.
 * Repetir é inofensivo, porque confirmado_em guarda a primeira data.
 */
async function confirmarLinkDoKV(env, token, agora, antesDeConfirmar = null) {
  const kv = env.SIGNUPS;
  if (!kv) return { ok: false, error: "token_invalido" };
  const ref = lerJSONOuNulo(await kv.get(`token:${token}`));
  if (!ref?.email) return { ok: false, error: "token_invalido" };
  const antigo = await leadDoKV(env, ref.email);
  if (!antigo) return { ok: false, error: "token_invalido" };
  // Um link substituído por outro mais novo no mesmo lead não vale mais.
  if (antigo.token && antigo.token !== token) return { ok: false, error: "token_invalido" };
  const prazo = ref.expira_em || (antigo.token === token ? antigo.token_expira_em : null);
  if (!(agora <= Date.parse(prazo))) return { ok: false, error: "token_expirado" };
  const agoraISO = new Date(agora).toISOString();
  if (antesDeConfirmar) await antesDeConfirmar(antigo, agoraISO);
  await gravarLeadDoKV(env, antigo, agoraISO);
  await env.DB.prepare(`UPDATE leads SET status = 'confirmado', confirmado_em = COALESCE(confirmado_em, ?2), atualizado_em = ?2
    WHERE email = ?1`).bind(ref.email, agoraISO).run();
  try { await kv.delete(`token:${token}`); } catch (err) { console.error("limpeza_kv_falhou", err.message); }
  return { ok: true, email: ref.email };
}

/** Grava no crm_leads, já confirmado, um lead confirmado por um link de antes da troca. */
async function levarConfirmacaoAoSupabase(env, lead, agoraISO) {
  const r = await rpc(env, "importar_optin_confirmado", {
    p_email: lead.email,
    p_nome: lead.nome ?? null,
    p_telefone: lead.telefone ?? null,
    p_tipo: lead.tipo === "b2b" ? "b2b" : "b2c",
    p_empresa: lead.empresa ?? null,
    p_segmento: lead.segmento ?? null,
    p_origem: lead.origem || "lista-de-espera",
    p_notas: lead.notas ?? null,
    p_criado_em: lead.criado_em || agoraISO,
    p_confirmado_em: lead.confirmado_em || agoraISO,
  });
  if (!r?.ok) throw new Error(`importar_optin_confirmado: ${r?.error || "erro"}`);
}

// ─────────────────────────────────────────────────────────────── e-mail
const EMAIL = {
  pt: {
    lang: "pt-BR", ola: "Olá", assunto: "Confirme sua inscrição na lista de espera — Trustio",
    previa: "Confirme seu e-mail para garantir sua vaga na lista da Trustio.",
    corpo: "Recebemos sua inscrição na lista de espera da Trustio. Confirme seu e-mail para garantir sua vaga:",
    botao: "Confirmar minha inscrição", copie: "Se o botão não funcionar, copie e cole este endereço:",
    prazo: "O link vale por 48 horas. Se não foi você quem se inscreveu, ignore este e-mail: nada acontece.",
    privacidade: "Privacidade", caminho: "",
    texto: (link) => `Confirme sua inscrição na lista de espera da Trustio:\n${link}\n\nO link vale por 48 horas. Se não foi você, ignore este e-mail.`,
  },
  en: {
    lang: "en", ola: "Hi", assunto: "Confirm your spot on the waitlist — Trustio",
    previa: "Confirm your email to secure your spot on the Trustio list.",
    corpo: "We've received your sign-up for the Trustio waitlist. Confirm your email to secure your spot:",
    botao: "Confirm my sign-up", copie: "If the button doesn't work, copy and paste this address:",
    prazo: "The link is valid for 48 hours. If you didn't sign up, ignore this email: nothing will happen.",
    privacidade: "Privacy", caminho: "/en",
    texto: (link) => `Confirm your sign-up for the Trustio waitlist:\n${link}\n\nThe link is valid for 48 hours. If it wasn't you, ignore this email.`,
  },
};

function corpoDoEmail(nome, link, idioma = "pt") {
  const t = EMAIL[idioma] || EMAIL.pt;
  const saudacao = nome ? `${t.ola}, ${escapar(nome)}!` : `${t.ola}!`;
  return `<!DOCTYPE html>
<html lang="${t.lang}"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#05070b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070b;padding:40px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f16;border:1px solid rgba(160,179,211,.14);border-radius:16px;">
    <tr><td style="padding:34px 34px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <p style="margin:0 0 22px;font-size:19px;font-weight:700;color:#f4f6fa;letter-spacing:-.02em;">Trust<span style="color:#2563eb;">io</span></p>
      <p style="margin:0 0 14px;font-size:20px;font-weight:600;color:#f4f6fa;">${saudacao}</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#bdc5d1;">${t.corpo}</p>
      <p style="margin:0 0 26px;">
        <a href="${escapar(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:10px;">${t.botao}</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8b96a7;">${t.copie}</p>
      <p style="margin:0 0 26px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${escapar(link)}" style="color:#5ea7ff;">${escapar(link)}</a></p>
      <p style="margin:0 0 30px;font-size:13px;line-height:1.6;color:#8b96a7;">${t.prazo}</p>
      <p style="margin:0;padding-top:20px;border-top:1px solid rgba(160,179,211,.12);font-size:12px;color:#6c7789;">
        Trustio · <a href="https://trustio.com.br" style="color:#6c7789;">trustio.com.br</a> ·
        <a href="https://trustio.com.br${t.caminho}/privacidade.html" style="color:#6c7789;">${t.privacidade}</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function enviarEmail(env, para, nome, link, idioma = "pt") {
  const t = EMAIL[idioma] || EMAIL.pt;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Trustio <no-reply@send.trustio.com.br>",
      to: [para],
      subject: t.assunto,
      html: corpoDoEmail(nome, link, idioma),
      text: `${nome ? `${t.ola}, ${nome}!` : `${t.ola}!`}\n\n${t.texto(link)}\n\nTrustio · https://trustio.com.br${t.caminho}`,
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// ─────────────────────────────────────────────────────────────── páginas
function pagina(titulo, texto, env, status = 200, idioma = "pt") {
  const site = (env.SITE_URL || "https://trustio.com.br") + (idioma === "en" ? "/en" : "");
  return new Response(`<!DOCTYPE html>
<html lang="${idioma === "en" ? "en" : "pt-BR"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapar(titulo)} · Trustio</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070b;color:#f4f6fa;
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}
  .caixa{max-width:460px;text-align:center}
  h1{margin:0 0 12px;font-size:26px;letter-spacing:-.02em}
  p{margin:0 0 26px;color:#bdc5d1}
  a.btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;
    padding:12px 22px;border-radius:10px}
</style></head>
<body><div class="caixa">
  <h1>${escapar(titulo)}</h1>
  <p>${texto}</p>
  <a class="btn" href="${escapar(site)}/">${idioma === "en" ? "Go to Trustio" : "Ir para a Trustio"}</a>
</div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Título e texto (HTML confiável, escrito aqui) de cada resultado da confirmação.
const CONFIRMACAO = {
  pt: {
    incompleto: ["Link incompleto", "Este endereço não traz o código de confirmação. Abra o link direto do e-mail que enviamos."],
    instavel: ["Tente de novo em instantes", "Não conseguimos conferir o link agora. Abra de novo daqui a pouco; se ele já tiver sido usado, avisamos na hora."],
    confirmado: ["Inscrição confirmada", "Pronto: sua vaga está garantida. Avisamos por e-mail no dia da abertura, <b>1º de outubro de 2026</b>. " +
      'Quem assina um plano entra em até 1 dia útil após o pagamento — <a href="{site}/planos.html#pessoal" style="color:#5ea7ff">ver como</a>.'],
    expirado: ["Link expirado", "Este link valia por 48 horas. Faça a inscrição de novo e enviamos outro na hora."],
    invalido: ["Link inválido", "Este link não vale mais. Ele pode já ter sido usado, ou ter sido substituído por um mais " +
      "recente — se você se inscreveu mais de uma vez, <b>abra o último e-mail que recebeu</b>. " +
      "Se não encontrar, inscreva-se de novo e enviamos outro na hora."],
  },
  en: {
    incompleto: ["Incomplete link", "This address is missing the confirmation code. Open the link straight from the email we sent."],
    instavel: ["Try again in a moment", "We couldn't check the link right now. Open it again shortly; if it has already been used, we'll tell you right away."],
    confirmado: ["Sign-up confirmed", "Done: your spot is secured. We'll email you on launch day, <b>October 1, 2026</b>. " +
      'Subscribers get in within 1 business day of payment — <a href="{site}/planos.html#pessoal" style="color:#5ea7ff">see how</a>.'],
    expirado: ["Link expired", "This link was valid for 48 hours. Sign up again and we'll send a new one right away."],
    invalido: ["Invalid link", "This link is no longer valid. It may have been used already, or replaced by a newer one — " +
      "if you signed up more than once, <b>open the latest email you received</b>. " +
      "If you can't find it, sign up again and we'll send a new one right away."],
  },
};

// ─────────────────────────────────────────────────────────────── rotas
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    // ---- saúde: diz o que falta configurar, sem revelar valor nenhum.
    // Com ?verificar=supabase&sha256=…, confere a chave (ver verificarChaveSupabase).
    if (url.pathname === "/saude" && req.method === "GET") {
      return json(200, {
        ok: true,
        armazenamento: usaD1(env) ? "d1" : "supabase",
        d1: Boolean(env.DB),
        supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        resend: Boolean(env.RESEND_API_KEY),
        remetente: env.EMAIL_FROM || null,
        exemplo_de_link: linkDeConfirmacao(env, "TOKEN_DE_EXEMPLO"),
        ...(url.searchParams.get("verificar") === "supabase"
          ? { chave_supabase: await verificarChaveSupabase(env, url.searchParams.get("sha256")) }
          : {}),
      }, origin);
    }

    // ---- inscrição
    if (url.pathname === "/signup" && req.method === "POST") {
      const tipoConteudo = req.headers.get("content-type") || "";
      let dados = {};
      let veioDeFormulario = false;
      try {
        if (tipoConteudo.includes("application/json")) {
          dados = await req.json();
        } else {
          // Sem JavaScript o navegador posta o formulário direto; respondemos com redirect.
          veioDeFormulario = true;
          dados = Object.fromEntries(await req.formData());
        }
      } catch {
        return json(400, { ok: false, error: "corpo_invalido" }, origin);
      }

      if (String(dados._honey || "").trim()) return json(200, { ok: true }, origin); // robô
      const idioma = idiomaDaInscricao(dados);
      const email = String(dados.email || "").trim().toLowerCase();
      if (!email) return json(400, { ok: false, error: "email_ausente" }, origin);
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(400, { ok: false, error: "email_invalido" }, origin);
      }

      if (usaD1(env) ? !env.DB : !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("armazenamento_nao_configurado");
        return json(503, { ok: false, error: "indisponivel" }, origin);
      }

      // As notas guardam o que o formulário manda além dos campos do CRM.
      const notas = [
        dados.acesso && `Como quer entrar: ${dados.acesso}`,
        dados.plano && `Plano de interesse: ${dados.plano}`,
        dados.uso && `Pretende usar para: ${dados.uso}`,
        dados.tamanho && `Tamanho: ${dados.tamanho}`,
        dados.observacao && `Observação: ${dados.observacao}`,
      ].filter(Boolean).join(" · ");

      // Tamanho limitado: no modo kv não há coluna do banco segurando campo gigante.
      const campo = (v, max = 200) => String(v ?? "").trim().slice(0, max) || null;
      const lead = {
        email,
        nome: campo(dados.nome),
        telefone: campo(dados.telefone || dados.whatsapp, 40),
        tipo: String(dados.tipo || "").toLowerCase().includes("empresa") ? "b2b" : "b2c",
        empresa: campo(dados.empresa),
        segmento: campo(dados.segmento),
        origem: campo(dados.origem),
        notas: campo(notas, 1000),
      };

      let registro;
      try {
        registro = usaD1(env)
          ? await registrarNoD1(env, lead)
          : await rpc(env, "registrar_optin", {
            p_email: lead.email,
            p_nome: lead.nome,
            p_telefone: lead.telefone,
            p_tipo: lead.tipo,
            p_empresa: lead.empresa,
            p_segmento: lead.segmento,
            p_origem: lead.origem || "lista-de-espera",
            p_notas: lead.notas,
          });
      } catch (err) {
        console.error("registrar_optin_falhou", err.message);
        return json(502, { ok: false, error: "indisponivel" }, origin);
      }

      if (!registro?.ok) return json(400, { ok: false, error: registro?.error || "erro" }, origin);

      // Já confirmado antes: nada a enviar, e a resposta é igual à de uma inscrição nova,
      // para não revelar a terceiros quem está na lista.
      if (registro.token) {
        try {
          await enviarEmail(env, email, String(dados.nome || "").trim(), linkDeConfirmacao(env, registro.token, idioma), idioma);
        } catch (err) {
          // O lead já está salvo; o reenvio é possível. Não mentimos dizendo que deu certo.
          console.error("envio_falhou", err.message);
          if (usaD1(env)) {
            try { await descartarNoD1(env, email, registro.token); } catch (e) { console.error("descarte_falhou", e.message); }
          }
          return json(502, { ok: false, error: "email_nao_enviado" }, origin);
        }
        if (usaD1(env)) {
          try { await concluirNoD1(env, email, registro.token); } catch (err) { console.error("conclusao_falhou", err.message); }
        }
      }

      if (veioDeFormulario) {
        return Response.redirect(destinoSeguro(dados._next, env, idioma), 303);
      }
      return json(200, { ok: true }, origin);
    }

    // ---- confirmação
    if (url.pathname === "/confirm" && req.method === "GET") {
      const idioma = url.searchParams.get("lang") === "en" ? "en" : "pt";
      const t = CONFIRMACAO[idioma];
      const site = escapar((env.SITE_URL || "https://trustio.com.br") + (idioma === "en" ? "/en" : ""));
      const responder = (chave, status = 200) => pagina(t[chave][0], t[chave][1].replace("{site}", site), env, status, idioma);
      const token = url.searchParams.get("token");
      if (!token) return responder("incompleto", 400);

      let r;
      try {
        r = usaD1(env) ? await confirmarNoD1(env, token) : await rpc(env, "confirmar_optin", { p_token: token });
        // Depois da troca para o Supabase, links enviados antes dela (D1, e pelo D1 o KV)
        // continuam confirmando. Essas confirmações entram no crm_leads na importação.
        if (!usaD1(env) && r?.error === "token_invalido" && env.DB) {
          r = await confirmarNoD1(env, token, Date.now(), (lead, agoraISO) => levarConfirmacaoAoSupabase(env, lead, agoraISO));
        }
      } catch (err) {
        console.error("confirmar_optin_falhou", err.message);
        return responder("instavel", 503);
      }

      if (r?.ok) return responder("confirmado");
      if (r?.error === "token_expirado") return responder("expirado", 410);
      // Pedir a inscrição de novo emite um token novo e invalida o anterior, de propósito:
      // um link antigo não deve continuar valendo. Quem se inscreveu duas vezes chega aqui
      // pelo e-mail mais velho, então a mensagem manda procurar o mais recente.
      return responder("invalido", 400);
    }

    return json(404, { ok: false, error: "nao_encontrado" }, origin);
  },
};
