// Trustio · voz das respostas: o atendimento de um pedido (26 nov 2026, tirado de index.ts sem mudar o
// comportamento). index.ts lê os segredos e liga isto ao Deno.serve; aqui não há Deno nem cliente real do
// Supabase, tudo chega por parâmetro, e por isso tests/voz-pedido.test.mjs consegue exercitar cada resposta.
import { cortarNaFrase, textoParaFala } from "./texto.ts";
import { type ConfigVoz, provedoresConfigurados, sintetizar } from "./provedores.ts";

const MAX_POR_PEDIDO = 3000;
const MAX_CORPO = 64 * 1024;          // bytes do pedido: o texto útil é cortado em 3000 caracteres, o resto é desperdício
const MAX_DEMO_POR_RESPOSTA = 500;   // a demonstração cobre ~3 respostas de verdade, não uma resposta longa

const ALLOWED_ORIGINS = /^https:\/\/(?:[a-z0-9-]+\.)?trustio\.com\.br$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.test(origin) ? origin : "https://trustio.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-Voz-Demo, X-Voz-Restante, X-Voz-Provedor",
    "Vary": "Origin",
  };
}
function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// O cliente do Supabase (supabase-js devolve { data, error } em vez de lançar). Daqui só se usa
// auth.getUser(token) e rpc(nome, args); o tipo fica aberto para aceitar o cliente real e o dos testes.
// deno-lint-ignore no-explicit-any
export type Admin = any;
export type Dependencias = {
  criarAdmin: () => Admin;
  config: ConfigVoz;
  limiteDiario: number;
  demo: number;
  sintetizarFn?: typeof sintetizar;
};

export function criarAtendente({ criarAdmin, config: CONFIG, limiteDiario: LIMITE_DIARIO, demo: DEMO, sintetizarFn = sintetizar }: Dependencias) {
 return async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "method_not_allowed" }, origin);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" }, origin);
  const admin = criarAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "unauthorized" }, origin);

  // GET: o chat pergunta se a voz está ligada e quanto da demonstração ainda resta (sem gastar nada).
  if (req.method === "GET") {
    const configurada = provedoresConfigurados(CONFIG).length > 0;
    const { data: situacao } = await admin.rpc("voz_situacao", { p_user_id: user.id, p_demo: DEMO });
    return json(200, { configurada, acesso: situacao?.acesso ?? "teste", demo_restante: situacao?.demo_restante ?? 0 }, origin);
  }

  if (!provedoresConfigurados(CONFIG).length) return json(503, { error: "voz_nao_configurada" }, origin);
  // As mesmas portas do chat: e-mail confirmado e chat aberto para esta conta (acesso_do_chat).
  if (!user.email_confirmed_at) return json(403, { error: "email_nao_confirmado" }, origin);
  const { data: liberacao, error: liberacaoErro } = await admin.rpc("acesso_do_chat", { p_user_id: user.id });
  if (liberacaoErro || !liberacao?.aberto) return json(403, { error: "chat_ainda_fechado" }, origin);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_CORPO) return json(413, { error: "pedido_grande" }, origin);
  let body: { texto?: unknown; idioma?: unknown };
  try {
    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) return json(413, { error: "pedido_grande" }, origin);
    body = JSON.parse(bruto);
  } catch { return json(400, { error: "pedido_invalido" }, origin); }
  if (!body || typeof body !== "object") return json(400, { error: "pedido_invalido" }, origin);
  // Sem a situação não dá para saber o teto: melhor recusar do que cortar a fala do assinante em 500 caracteres.
  const { data: situacao, error: situacaoErro } = await admin.rpc("voz_situacao", { p_user_id: user.id, p_demo: DEMO });
  if (situacaoErro || !situacao) { console.error("voz_situacao", situacaoErro); return json(503, { error: "voz_indisponivel" }, origin); }
  const teto = situacao?.acesso === "livre" ? MAX_POR_PEDIDO : MAX_DEMO_POR_RESPOSTA;
  const texto = cortarNaFrase(textoParaFala(typeof body.texto === "string" ? body.texto : ""), teto);
  if (!texto) return json(400, { error: "texto_vazio" }, origin);
  const idioma = body.idioma === "en" ? "en" : "pt";

  const { data: reserva, error: reservaErro } = await admin.rpc("reservar_voz", {
    p_user_id: user.id, p_caracteres: texto.length, p_limite: LIMITE_DIARIO, p_demo: DEMO,
  });
  if (reservaErro || !reserva) { console.error("reservar_voz", reservaErro); return json(503, { error: "voz_indisponivel" }, origin); }
  if (!reserva.ok) {
    const status = reserva.error === "voz_demo_esgotada" ? 402 : reserva.error === "voz_limite_diario" ? 429 : 403;
    return json(status, { error: reserva.error, usados: reserva.usados, limite: reserva.limite }, origin);
  }

  try {
    const { resposta, provedor } = await sintetizarFn(texto, idioma, CONFIG);
    return new Response(resposta.body, {
      status: 200,
      headers: { ...cors(origin), "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
                 "X-Voz-Demo": reserva.demo ? "1" : "0", "X-Voz-Restante": String(reserva.restante ?? ""),
                 "X-Voz-Provedor": provedor },
    });
  } catch (err) {
    // supabase-js devolve o erro em vez de lançar; rede caída pode lançar. Nos dois casos a resposta ainda sai, com CORS.
    try {
      const { error: devolverErro } = await admin.rpc("devolver_voz", { p_user_id: user.id, p_caracteres: texto.length, p_demo: !!reserva.demo });
      if (devolverErro) console.error("devolver_voz", devolverErro);
    } catch (e) { console.error("devolver_voz", e instanceof Error ? e.message : String(e)); }
    const codigo = err instanceof Error ? err.message : "voz_indisponivel";
    const falhas = (err as { falhas?: string[] })?.falhas ?? [];
    return json(codigo === "voz_nao_configurada" ? 503 : 502, { error: codigo, falhas }, origin);
  }
 };
}
