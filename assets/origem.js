/**
 * De onde veio a pessoa — atribuição de origem, do lado do navegador.
 *
 * Hoje o site não sabe responder "quem trouxe este assinante". Sem isso não
 * existe programa de indicação, nem canal de aquisição medido: não há como
 * pagar quem indicou, nem como saber qual campanha vale a pena. Este arquivo é
 * a peça que falta, e é a mais barata de todas: nenhum servidor novo, nenhuma
 * dependência, nada sai para a rede.
 *
 * Como funciona:
 *
 *   1. Chegou com `?ref=joao` ou com `utm_*` na URL → guardamos **a primeira**
 *      origem no localStorage e nunca sobrescrevemos. Primeiro toque é o que
 *      vale: quem indicou merece o crédito mesmo que a pessoa volte depois por
 *      uma busca no Google.
 *   2. Em todo link de checkout da Stripe, anexamos `client_reference_id` com
 *      essa origem. A Stripe devolve esse campo na sessão e no webhook, então a
 *      venda chega ao banco já sabendo quem indicou — sem precisar perguntar.
 *   3. Nos links internos de cadastro, repassamos `?ref=` para o fluxo de
 *      criação de conta poder gravar a origem junto do lead.
 *
 * Cuidados que o navegador exige:
 *
 *   - `localStorage` pode **lançar exceção** (janela privada, cookies
 *      bloqueados, iframe). Toda leitura e escrita vai dentro de try/catch, e
 *      sem ele a página continua funcionando — perde a atribuição, não o
 *      checkout.
 *   - `client_reference_id` da Stripe aceita só letras, números, `-` e `_`, com
 *      no máximo 200 caracteres. Qualquer coisa fora disso faz a Stripe recusar
 *      o link, então o token é higienizado antes de entrar na URL.
 *   - A CSP do site é estrita (`script-src 'self'`): por isso é um arquivo
 *      próprio, carregado como módulo, e não um `<script>` embutido.
 *
 * As funções puras ficam exportadas para o teste em `tests/origem.test.mjs`
 * poder exercitá-las sem navegador.
 */

export const CHAVE = "trustio.origem";

/** Parâmetros que nos interessam, na ordem em que entram no token. */
const CAMPOS = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/** Lê os parâmetros de origem de uma query string. Devolve `null` se não houver nenhum. */
export function lerParametros(busca) {
  const p = new URLSearchParams(busca ?? "");
  const origem = {};
  for (const campo of CAMPOS) {
    const valor = p.get(campo);
    if (valor && valor.trim()) origem[campo] = valor.trim().slice(0, 120);
  }
  return Object.keys(origem).length ? origem : null;
}

/**
 * Token que vai para a Stripe no `client_reference_id`.
 *
 * Formato: `ref-<codigo>` quando houve indicação (o caso que precisa de
 * pagamento), senão `utm-<source>-<campaign>`. Fora de `[A-Za-z0-9_-]` tudo
 * vira `-`, porque é o que a Stripe aceita; o limite de 200 é dela também.
 */
export function montarToken(origem) {
  if (!origem) return null;
  const limpar = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const partes = origem.ref
    ? ["ref", limpar(origem.ref)]
    : ["utm", limpar(origem.utm_source), limpar(origem.utm_campaign)];
  const token = partes.filter(Boolean).join("-").slice(0, 200).replace(/-+$/, "");
  // "ref" ou "utm" sozinho não identifica nada: melhor não mandar campo algum.
  return token && token !== "ref" && token !== "utm" ? token : null;
}

/**
 * Anexa `client_reference_id` a uma URL de checkout da Stripe.
 *
 * Nunca sobrescreve um valor que já esteja no link (o dono pode ter fixado um
 * à mão) e devolve a URL original intacta se ela não for da Stripe ou não der
 * para interpretar.
 */
export function decorarUrl(url, token, parametro = "client_reference_id") {
  if (!token) return url;
  try {
    const u = new URL(url, "https://trustio.com.br");
    if (u.searchParams.has(parametro)) return url;
    u.searchParams.set(parametro, token);
    return u.toString();
  } catch {
    return url;
  }
}

/** Primeira origem já registrada, ou `null`. Nunca lança. */
export function origemGuardada(armazem) {
  try {
    const bruto = armazem?.getItem(CHAVE);
    if (!bruto) return null;
    const dado = JSON.parse(bruto);
    return dado && typeof dado === "object" ? dado : null;
  } catch {
    return null;
  }
}

/**
 * Registra a origem se ainda não houver uma. Devolve a que vale (a antiga,
 * quando já existia — primeiro toque ganha).
 */
export function registrarOrigem(armazem, nova, agora = new Date()) {
  const anterior = origemGuardada(armazem);
  if (anterior) return anterior;
  if (!nova) return null;
  const registro = { ...nova, em: agora.toISOString() };
  try {
    armazem?.setItem(CHAVE, JSON.stringify(registro));
  } catch {
    // Janela privada ou armazenamento bloqueado: segue sem atribuição.
  }
  return registro;
}

/** Roda no navegador: registra a origem desta visita e decora os links da página. */
function iniciar() {
  let armazem = null;
  try {
    armazem = window.localStorage;
  } catch {
    armazem = null;
  }

  const origem = registrarOrigem(armazem, lerParametros(window.location.search));
  const token = montarToken(origem);
  if (!token) return;

  for (const a of document.querySelectorAll('a[href*="buy.stripe.com"]')) {
    a.href = decorarUrl(a.href, token);
  }
  // O cadastro é página nossa: ali o parâmetro útil é o `ref` em si.
  if (origem?.ref) {
    for (const a of document.querySelectorAll('a[href*="cadastro"]')) {
      a.href = decorarUrl(a.href, origem.ref, "ref");
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}
