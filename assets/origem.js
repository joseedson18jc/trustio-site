/**
 * De onde veio a pessoa — atribuição de origem, do lado do navegador.
 *
 * Duas coisas diferentes moram aqui, e a distinção é o ponto do arquivo:
 *
 *   1. **Código de afiliado (`?ref=`).** Quem manda é `assets/app.js`: ele guarda o código
 *      no cookie `trustio_ref` por 90 dias, e a regra publicada em `afiliados.html` é
 *      **último clique vence**. Este arquivo não guarda cópia própria e não decide nada —
 *      só lê, e leva o código ao checkout. Guardar um segundo registro aqui, com outra
 *      regra, foi exatamente o erro apontado na revisão: depois de uma visita por ANA123 e
 *      outra por BIA456, o cookie dizia BIA456 (como os termos prometem) e o checkout
 *      dizia ANA123. A compra nomearia o afiliado errado — e isso é dinheiro.
 *   2. **Campanha (`utm_*`).** Essa sim fica aqui, em `localStorage`, por **primeiro
 *      toque**: serve para saber qual canal trouxe a pessoa, não para pagar ninguém, e
 *      nenhum termo publicado diz o contrário.
 *
 * Por que o checkout precisa disso: o cookie é de primeira parte em trustio.com.br e
 * **não viaja** para o domínio da Stripe. Sem anexar `client_reference_id` ao link de
 * pagamento, a venda chega sem o código e não há como provar quem trouxe o cliente na
 * hora de pagar a comissão.
 *
 * Cuidados que o navegador exige:
 *
 *   - `localStorage` pode **lançar exceção** (janela privada, cookies bloqueados, iframe).
 *     Toda leitura e escrita vai dentro de try/catch; sem ele a página continua
 *     funcionando — perde a atribuição de campanha, não o checkout.
 *   - `client_reference_id` da Stripe aceita só letras, números, `-` e `_`, com no máximo
 *     200 caracteres. Fora disso a Stripe recusa o link, então o token é higienizado.
 *   - Não dá para depender da ordem de carga: `app.js` e este arquivo são dois módulos.
 *     Por isso o código da visita atual é lido da própria URL, com a mesma validação do
 *     `app.js`, e o cookie serve para as visitas seguintes.
 *   - A CSP do site é estrita (`script-src 'self'`): arquivo próprio, nada embutido.
 *
 * As funções puras ficam exportadas para `tests/origem.test.mjs` exercitá-las sem
 * navegador.
 */

export const CHAVE = "trustio.origem";
/** Cookie onde `assets/app.js` guarda o código do afiliado (90 dias, último clique). */
export const COOKIE_AFILIADO = "trustio_ref";

/** Formato do código de afiliado, igual ao que o `app.js` aceita e o banco gera. */
const CODIGO_AFILIADO = /^[A-Z]{1,8}\d{3}$/;

/** Campos de campanha. `ref` **não** entra aqui: afiliado é assunto do cookie. */
const CAMPOS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/** Lê os parâmetros de campanha de uma query string. `null` se não houver nenhum. */
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
 * Código do afiliado que vale agora, pela regra publicada: **último clique vence**.
 *
 * O `?ref=` desta visita ganha do cookie, porque é o clique mais recente. Sem `?ref=`
 * válido na URL, vale o cookie que o `app.js` deixou. Código fora do formato é ignorado
 * nos dois casos — melhor nenhuma atribuição que uma errada.
 */
export function codigoDeAfiliado(busca, cookies) {
  const daUrl = new URLSearchParams(busca ?? "").get("ref");
  if (daUrl && CODIGO_AFILIADO.test(daUrl.trim().toUpperCase())) return daUrl.trim().toUpperCase();
  const m = /(?:^|;\s*)trustio_ref=([^;]*)/.exec(cookies ?? "");
  const doCookie = m && decodeURIComponent(m[1]).trim().toUpperCase();
  return doCookie && CODIGO_AFILIADO.test(doCookie) ? doCookie : null;
}

/**
 * Token que vai para a Stripe no `client_reference_id`.
 *
 * `ref-<CODIGO>` quando há afiliado (o caso que vira comissão), senão
 * `utm-<source>-<campaign>`. Fora de `[A-Za-z0-9_-]` tudo vira `-`, e o teto de 200 é da
 * Stripe.
 */
export function montarToken(afiliado, campanha) {
  const limpar = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const partes = afiliado
    ? ["ref", limpar(afiliado)]
    : campanha
      ? ["utm", limpar(campanha.utm_source), limpar(campanha.utm_campaign)]
      : [];
  const token = partes.filter(Boolean).join("-").slice(0, 200).replace(/-+$/, "");
  // "ref" ou "utm" sozinho não identifica ninguém: melhor não mandar campo algum.
  return token && token !== "ref" && token !== "utm" ? token : null;
}

/**
 * Anexa `client_reference_id` a uma URL de checkout da Stripe.
 *
 * Nunca sobrescreve um valor já presente no link (o dono pode ter fixado um à mão) e
 * devolve a URL original intacta se não der para interpretá-la.
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

/** Campanha de primeiro toque já registrada, ou `null`. Nunca lança. */
export function campanhaGuardada(armazem) {
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
 * Registra a campanha se ainda não houver uma. Devolve a que vale (a antiga, quando já
 * existia — primeiro toque ganha). Só campanha: afiliado não passa por aqui.
 */
export function registrarCampanha(armazem, nova, agora = new Date()) {
  const anterior = campanhaGuardada(armazem);
  if (anterior) return anterior;
  if (!nova) return null;
  const registro = { ...nova, em: agora.toISOString() };
  try {
    armazem?.setItem(CHAVE, JSON.stringify(registro));
  } catch {
    // Janela privada ou armazenamento bloqueado: segue sem atribuição de campanha.
  }
  return registro;
}

/** Roda no navegador: registra a campanha desta visita e decora os links da página. */
function iniciar() {
  let armazem = null;
  try {
    armazem = window.localStorage;
  } catch {
    armazem = null;
  }

  const campanha = registrarCampanha(armazem, lerParametros(window.location.search));
  const afiliado = codigoDeAfiliado(window.location.search, document.cookie);
  const token = montarToken(afiliado, campanha);
  if (!token) return;

  for (const a of document.querySelectorAll('a[href*="buy.stripe.com"]')) {
    a.href = decorarUrl(a.href, token);
  }
  // O cadastro é página nossa: ali o parâmetro útil é o código do afiliado em si.
  if (afiliado) {
    for (const a of document.querySelectorAll('a[href*="cadastro"]')) {
      a.href = decorarUrl(a.href, afiliado, "ref");
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}
