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
 *
 * Variáveis (wrangler secret put NOME)
 *   SUPABASE_URL                https://yxkgdgcdvngltnykleig.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   chave de serviço do projeto  ← segredo
 *   RESEND_API_KEY              chave da Resend              ← segredo
 *   EMAIL_FROM                  Trustio <no-reply@send.trustio.com.br>
 *   SITE_URL                    https://trustio.com.br
 *   API_URL                     https://api.trustio.com.br
 *
 * A inscrição é gravada no mesmo crm_leads da conta, pelas funções registrar_optin
 * e confirmar_optin: uma lista de clientes só, não duas.
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

/** O ponto exato onde o worker antigo falhava: montar o endereço de confirmação. */
function linkDeConfirmacao(env, token) {
  const url = new URL("/confirm", env.API_URL || "https://api.trustio.com.br");
  url.searchParams.set("token", token);
  return url.toString();
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

function destinoSeguro(bruto, env) {
  const base = env.SITE_URL || "https://trustio.com.br";
  const padrao = `${base}/obrigado.html?lista=espera`;
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
async function rpc(env, nome, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`rpc ${nome} ${r.status}: ${texto.slice(0, 300)}`);
  try { return JSON.parse(texto); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────── e-mail
function corpoDoEmail(nome, link) {
  const saudacao = nome ? `Olá, ${escapar(nome)}!` : "Olá!";
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#05070b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Confirme seu e-mail para garantir sua vaga na lista da Trustio.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070b;padding:40px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f16;border:1px solid rgba(160,179,211,.14);border-radius:16px;">
    <tr><td style="padding:34px 34px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <p style="margin:0 0 22px;font-size:19px;font-weight:700;color:#f4f6fa;letter-spacing:-.02em;">Trust<span style="color:#2563eb;">io</span></p>
      <p style="margin:0 0 14px;font-size:20px;font-weight:600;color:#f4f6fa;">${saudacao}</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#bdc5d1;">Recebemos sua inscrição na lista de espera da Trustio. Confirme seu e-mail para garantir sua vaga:</p>
      <p style="margin:0 0 26px;">
        <a href="${escapar(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:10px;">Confirmar minha inscrição</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8b96a7;">Se o botão não funcionar, copie e cole este endereço:</p>
      <p style="margin:0 0 26px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${escapar(link)}" style="color:#5ea7ff;">${escapar(link)}</a></p>
      <p style="margin:0 0 30px;font-size:13px;line-height:1.6;color:#8b96a7;">O link vale por 48 horas. Se não foi você quem se inscreveu, ignore este e-mail: nada acontece.</p>
      <p style="margin:0;padding-top:20px;border-top:1px solid rgba(160,179,211,.12);font-size:12px;color:#6c7789;">
        Trustio · <a href="https://trustio.com.br" style="color:#6c7789;">trustio.com.br</a> ·
        <a href="https://trustio.com.br/privacidade.html" style="color:#6c7789;">Privacidade</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function enviarEmail(env, para, nome, link) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Trustio <no-reply@send.trustio.com.br>",
      to: [para],
      subject: "Confirme sua inscrição na lista de espera — Trustio",
      html: corpoDoEmail(nome, link),
      text: `${nome ? `Olá, ${nome}!` : "Olá!"}\n\nConfirme sua inscrição na lista de espera da Trustio:\n${link}\n\nO link vale por 48 horas. Se não foi você, ignore este e-mail.\n\nTrustio · https://trustio.com.br`,
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// ─────────────────────────────────────────────────────────────── páginas
function pagina(titulo, texto, env, status = 200) {
  const site = env.SITE_URL || "https://trustio.com.br";
  return new Response(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
  <a class="btn" href="${escapar(site)}/">Ir para a Trustio</a>
</div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ─────────────────────────────────────────────────────────────── rotas
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    // ---- saúde: diz o que falta configurar, sem revelar valor nenhum
    if (url.pathname === "/saude" && req.method === "GET") {
      return json(200, {
        ok: true,
        supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        resend: Boolean(env.RESEND_API_KEY),
        remetente: env.EMAIL_FROM || null,
        exemplo_de_link: linkDeConfirmacao(env, "TOKEN_DE_EXEMPLO"),
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
      const email = String(dados.email || "").trim().toLowerCase();
      if (!email) return json(400, { ok: false, error: "email_ausente" }, origin);

      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("supabase_nao_configurado");
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

      let registro;
      try {
        registro = await rpc(env, "registrar_optin", {
          p_email: email,
          p_nome: String(dados.nome || "").trim() || null,
          p_telefone: String(dados.telefone || dados.whatsapp || "").trim() || null,
          p_tipo: String(dados.tipo || "").toLowerCase().includes("empresa") ? "b2b" : "b2c",
          p_empresa: String(dados.empresa || "").trim() || null,
          p_segmento: String(dados.segmento || "").trim() || null,
          p_origem: String(dados.origem || "lista-de-espera").trim(),
          p_notas: notas || null,
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
          await enviarEmail(env, email, String(dados.nome || "").trim(), linkDeConfirmacao(env, registro.token));
        } catch (err) {
          // O lead já está salvo; o reenvio é possível. Não mentimos dizendo que deu certo.
          console.error("envio_falhou", err.message);
          return json(502, { ok: false, error: "email_nao_enviado" }, origin);
        }
      }

      if (veioDeFormulario) {
        return Response.redirect(destinoSeguro(dados._next, env), 303);
      }
      return json(200, { ok: true }, origin);
    }

    // ---- confirmação
    if (url.pathname === "/confirm" && req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return pagina("Link incompleto", "Este endereço não traz o código de confirmação. Abra o link direto do e-mail que enviamos.", env, 400);

      let r;
      try {
        r = await rpc(env, "confirmar_optin", { p_token: token });
      } catch (err) {
        console.error("confirmar_optin_falhou", err.message);
        return pagina("Tente de novo em instantes", "Não conseguimos confirmar agora. O link continua valendo — abra de novo daqui a pouco.", env, 503);
      }

      if (r?.ok) {
        return pagina("Inscrição confirmada",
          "Pronto: sua vaga está garantida. Avisamos por e-mail no dia da abertura, <b>1º de outubro de 2026</b>. " +
          'Quem assina um plano tem a conta liberada em até 1 dia útil após a confirmação do pagamento — <a href="' + escapar(env.SITE_URL || "https://trustio.com.br") + '/planos.html#pessoal" style="color:#5ea7ff">ver como</a>.', env);
      }
      if (r?.error === "token_expirado") {
        return pagina("Link expirado",
          "Este link valia por 48 horas. Faça a inscrição de novo e enviamos outro na hora.", env, 410);
      }
      // Pedir a inscrição de novo emite um token novo e invalida o anterior, de propósito:
      // um link antigo não deve continuar valendo. Quem se inscreveu duas vezes chega aqui
      // pelo e-mail mais velho, então a mensagem manda procurar o mais recente.
      return pagina("Link inválido",
        "Este link não vale mais. Ele pode já ter sido usado, ou ter sido substituído por um mais " +
        "recente — se você se inscreveu mais de uma vez, <b>abra o último e-mail que recebeu</b>. " +
        "Se não encontrar, inscreva-se de novo e enviamos outro na hora.", env, 400);
    }

    return json(404, { ok: false, error: "nao_encontrado" }, origin);
  },
};
