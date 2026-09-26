#!/usr/bin/env node
// Gera a versão em inglês do site (en/) a partir das páginas em português.
//
// O português continua sendo a fonte: cada página em en/ é a página em português
// com o texto trocado pelo dicionário em i18n/en/, os caminhos ajustados para um
// nível abaixo e o idioma declarado. Assim uma correção de layout feita no
// português chega ao inglês na próxima geração, sem ninguém copiar HTML à mão.
//
// Também escreve, nas duas versões, a bandeira de troca de idioma no cabeçalho e
// os <link rel="alternate" hreflang> — entre marcadores, então rodar de novo não
// duplica nada.
//
//   npm run i18n           gera en/ e atualiza bandeira e hreflang no português
//   npm run i18n:check     falha se en/ estiver desatualizado ou se sobrar
//                          texto sem tradução (use no CI, como o stamp:check)
//   npm run i18n -- --faltando   lista o que ainda não tem tradução
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://trustio.com.br";
const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const LISTAR = args.has("--faltando");

// Páginas espelhadas em en/. Ficam só em português, de propósito: admin/ e crm/
// (ferramentas internas do operador), planos-teste.html (noindex, checkout de
// teste) e voice-mvp/ (outra aplicação, publicada à parte).
export const PAGINAS = [
  "index.html", "modelos.html", "voice.html", "agentio.html", "planos.html", "espera.html",
  "manifesto.html", "fundador.html", "privacidade.html", "seats.html",
  "cadastro.html", "entrar.html", "obrigado.html", "404.html",
  "juridico/index.html", "app/index.html", "console/index.html",
];
const ESPELHADAS = new Set(PAGINAS);

// Onde a bandeira entra quando a página não tem o botão de tema.
const ANCORA_BANDEIRA = {
  "404.html": '<div class="error-content">',
  "console/index.html": '<a class="btn btn-ghost" href="../voice.html">',
};

// Texto que não se traduz: marcas, siglas, nomes próprios.
const MARCAS = new Set([
  "Trustio", "Trust", "io", "VoiceAI", "Omnichannel", "Pix", "Stripe", "xSpace", "WhatsApp",
  "Telegram", "LGPD", "ANPD", "ISO 27001", "Hermes", "OpenAI", "Supabase", "Cloudflare",
  "Resend", "Apple Pay", "Google Pay", "RAG", "OCR", "API", "SSO", "SIEM", "VPC", "GPU",
  "SLA", "CRM", "CSV", "PDF", "Starter", "Pro", "Dedicado", "Crédito Jus", "br-sao-1",
  "Gmail", "Outlook", "powered by xSpace", "Agentio", "Agentio · Nous", "Nous Research", "Hermes Agent", "by", "Agent Builder", "SAFE ROUTE", "TRUSTIO / SAFE ROUTE",
  // a própria bandeira: é reescrita depois da tradução
  "EN", "PT", "English", "Português", "Switch to English", "Mudar para português",
]);

// ─────────────────────────────────────────────────────────────── entidades
const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  atilde: "ã", Atilde: "Ã", otilde: "õ", Otilde: "Õ", eacute: "é", Eacute: "É",
  aacute: "á", Aacute: "Á", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú", ecirc: "ê", Ecirc: "Ê", acirc: "â", Acirc: "Â",
  ocirc: "ô", Ocirc: "Ô", ccedil: "ç", Ccedil: "Ç", agrave: "à", Agrave: "À",
  middot: "·", mdash: "—", ndash: "–", hellip: "…", ordm: "º", ordf: "ª",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  harr: "↔", rarr: "→", larr: "←", darr: "↓", uarr: "↑", check: "✓", times: "×",
  copy: "©", reg: "®", trade: "™", deg: "°", euro: "€", bull: "•",
};
const decodificar = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTIDADES ? ENTIDADES[n] : m));
const codificarTexto = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const codificarAtributo = (s) => codificarTexto(s).replace(/"/g, "&quot;");
const normalizar = (s) => decodificar(s).replace(/\s+/g, " ").trim();

// Não precisa de tradução: sem letras, e-mail, endereço, marca.
function dispensaTraducao(chave) {
  // \p{L} e não [A-Za-zÀ-ÿ]: esse intervalo inclui × e ÷, que não são letra.
  if (!/\p{L}/u.test(chave)) return true;
  if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(chave)) return true;
  if (/^(https?:\/\/|www\.)\S+$/.test(chave)) return true;
  if (/^[\w.-]+\.(com|br|io|md|html|js|css)(\/\S*)?$/i.test(chave)) return true;
  return MARCAS.has(chave);
}

// ─────────────────────────────────────────────────────────────── dicionários
async function lerDicionario(nome) {
  const caminho = join(ROOT, "i18n", "en", nome);
  if (!existsSync(caminho)) return { raw: [], text: {} };
  const d = JSON.parse(await readFile(caminho, "utf8"));
  const text = {};
  for (const [k, v] of Object.entries(d.text || {})) text[normalizar(k)] = v;
  return { raw: d.raw || [], text };
}
const nomeDoDicionario = (pagina) => pagina.replace(/\//g, "__").replace(/\.html$/, ".json");

// ─────────────────────────────────────────────────────────────── endereços
const bonito = (pagina) => pagina === "index.html" ? "" : pagina.replace(/index\.html$/, "");
const urlPt = (pagina) => `${SITE}/${bonito(pagina)}`;
const urlEn = (pagina) => `${SITE}/en/${bonito(pagina)}`;

function paginaDoCaminho(pathname) {
  let p = decodeURIComponent(pathname).replace(/^\//, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  return p;
}

// Um nível abaixo, em en/: link para página espelhada continua relativo (a árvore
// é a mesma); todo o resto vira absoluto a partir da raiz, então asset e página
// que só existe em português continuam funcionando de qualquer profundidade.
function reescreverUrl(valor, paginaPt) {
  const v = valor.trim();
  if (!v || /^(#|mailto:|tel:|data:|javascript:)/i.test(v)) return valor;
  let alvo;
  try { alvo = new URL(v, `${SITE}/${paginaPt}`); } catch { return valor; }
  if (alvo.origin !== SITE) return valor;
  const pagina = paginaDoCaminho(alvo.pathname);
  const absoluto = /^https?:\/\//i.test(v);
  if (ESPELHADAS.has(pagina)) {
    if (absoluto) return `${SITE}/en${alvo.pathname}${alvo.search}${alvo.hash}`;
    if (v.startsWith("/")) return `/en${v}`;
    return valor;
  }
  if (absoluto) return valor;
  return `${alvo.pathname}${alvo.search}${alvo.hash}`;
}

// ─────────────────────────────────────────────────────────────── bandeira e hreflang
const BANDEIRA_BR = '<svg viewBox="0 0 20 14" aria-hidden="true" focusable="false"><rect width="20" height="14" fill="#009c3b"/><path d="M10 1.6 18.4 7 10 12.4 1.6 7z" fill="#ffdf00"/><circle cx="10" cy="7" r="3.1" fill="#002776"/></svg>';
const BANDEIRA_US = '<svg viewBox="0 0 20 14" aria-hidden="true" focusable="false"><rect width="20" height="14" fill="#b22234"/><path d="M0 1.62h20M0 3.77h20M0 5.92h20M0 8.08h20M0 10.23h20M0 12.38h20" stroke="#fff" stroke-width="1.08"/><rect width="8.6" height="7.54" fill="#3c3b6e"/></svg>';

function bandeira(pagina, idioma) {
  return idioma === "pt"
    ? `<a class="lang-switch" href="/en/${bonito(pagina)}" hreflang="en" lang="en" aria-label="Switch to English" title="English">${BANDEIRA_US}<span>EN</span></a>`
    : `<a class="lang-switch" href="/${bonito(pagina)}" hreflang="pt-BR" lang="pt-BR" aria-label="Mudar para português" title="Português">${BANDEIRA_BR}<span>PT</span></a>`;
}

const alternativos = (pagina) =>
  `<link rel="alternate" hreflang="pt-BR" href="${urlPt(pagina)}">\n` +
  `  <link rel="alternate" hreflang="en" href="${urlEn(pagina)}">\n` +
  `  <link rel="alternate" hreflang="x-default" href="${urlPt(pagina)}">`;

function comMarcadores(html, marca, conteudo, onde) {
  const abre = `<!--i18n:${marca}-->`, fecha = `<!--/i18n:${marca}-->`;
  const bloco = `${abre}${conteudo}${fecha}`;
  const re = new RegExp(`<!--i18n:${marca}-->[\\s\\S]*?<!--/i18n:${marca}-->`);
  if (re.test(html)) return html.replace(re, bloco);
  const i = html.indexOf(onde);
  if (i < 0) throw new Error(`âncora não encontrada para ${marca}: ${onde.slice(0, 50)}`);
  // O bloco ganha linha própria com o mesmo recuo da âncora, que fica intacta.
  const inicioDaLinha = html.lastIndexOf("\n", i - 1) + 1;
  const recuo = /^[ \t]*$/.test(html.slice(inicioDaLinha, i)) ? html.slice(inicioDaLinha, i) : "";
  const recuoDoBloco = onde === "</head>" ? "  " : "";
  return html.slice(0, i) + recuoDoBloco + bloco + "\n" + recuo + html.slice(i);
}

function marcarIdioma(html, pagina, idioma) {
  html = comMarcadores(html, "alt", alternativos(pagina), "</head>");
  const ancora = ANCORA_BANDEIRA[pagina] || '<button class="theme-toggle"';
  return comMarcadores(html, "lang", bandeira(pagina, idioma), ancora);
}

// ─────────────────────────────────────────────────────────────── tradução
const TOKEN = /(<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>)/gi;
const ATRIBUTOS_DE_TEXTO = ["alt", "title", "aria-label", "placeholder"];
const META_DE_TEXTO = /^(description|keywords|og:title|og:description|og:image:alt|twitter:title|twitter:description)$/;

function traduzirPagina(fonte, pagina, dic) {
  const faltando = new Set();
  const traduz = (bruto) => {
    const chave = normalizar(bruto);
    if (!chave) return null;
    // O dicionário vem antes da dispensa: número sem letra também muda de formato
    // (4.900 em português é 4,900 em inglês).
    if (chave in dic.text) return dic.text[chave];
    if (dispensaTraducao(chave)) return null;
    faltando.add(chave);
    return null;
  };

  let html = fonte;
  for (const [de, para] of dic.raw) {
    if (!html.includes(de)) faltando.add(`[raw não encontrado] ${de.slice(0, 70)}`);
    html = html.split(de).join(para);
  }

  const partes = html.split(TOKEN);
  let dentroDeCodigo = 0;
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (!p) continue;
    if (i % 2 === 0) {
      // Dentro de <pre>/<code> fica o que é código: identificadores, JSON, chamadas.
      // Só troca se houver entrada explícita (um comentário, por exemplo), e nunca
      // conta como faltando.
      if (dentroDeCodigo > 0) {
        const chave = normalizar(p);
        if (chave && chave in dic.text) {
          const antes = p.match(/^\s*/)[0], depois = p.match(/\s*$/)[0];
          partes[i] = antes + codificarTexto(dic.text[chave]) + depois;
        }
        continue;
      }
      // texto entre tags
      const t = traduz(p);
      if (t != null) {
        const antes = p.match(/^\s*/)[0], depois = p.match(/\s*$/)[0];
        partes[i] = antes + codificarTexto(t) + depois;
      }
      continue;
    }
    if (p.startsWith("<!--")) continue;
    if (/^<script\b/i.test(p)) {
      // A tag de abertura leva o src, que precisa descer um nível como qualquer
      // outro endereço; só o corpo do script fica intocado.
      const abertura = p.match(/^<script\b[^>]*>/i)[0];
      const bloco = traduzirTag(abertura, pagina, traduz) + p.slice(abertura.length);
      partes[i] = /type=["']application\/ld\+json["']/i.test(p) ? traduzirJsonLd(bloco, traduz) : bloco;
      continue;
    }
    if (/^<style\b/i.test(p)) continue;
    if (/^<(pre|code)\b/i.test(p)) dentroDeCodigo++;
    else if (/^<\/(pre|code)\s*>/i.test(p)) dentroDeCodigo = Math.max(0, dentroDeCodigo - 1);
    partes[i] = traduzirTag(p, pagina, traduz);
  }
  html = partes.join("");

  html = html.replace(/<html lang="pt-BR">/, '<html lang="en">')
             .replace(/(property="og:locale" content=")pt_BR"/, '$1en_US"');
  return { html, faltando };
}

function traduzirTag(tag, pagina, traduz) {
  const ehMeta = /^<meta\b/i.test(tag);
  const nomeMeta = ehMeta ? (tag.match(/\b(?:name|property)="([^"]+)"/) || [])[1] : null;
  return tag.replace(/(\s)([\w:-]+)="([^"]*)"/g, (m, esp, nome, valor) => {
    const n = nome.toLowerCase();
    if (ATRIBUTOS_DE_TEXTO.includes(n) || (n === "content" && nomeMeta && META_DE_TEXTO.test(nomeMeta))) {
      const t = traduz(valor);
      return t != null ? `${esp}${nome}="${codificarAtributo(t)}"` : m;
    }
    // O assunto de um mailto: aparece pronto no cliente de e-mail de quem clica.
    if (n === "href" && /^mailto:/i.test(valor)) {
      const r = valor.replace(/([?&]subject=)([^&]*)/i, (s, pre, cod) => {
        let assunto;
        try { assunto = decodeURIComponent(cod); } catch { return s; }
        const t = traduz(assunto);
        return t != null ? pre + encodeURIComponent(t) : s;
      });
      return `${esp}${nome}="${r}"`;
    }
    if (n === "href" || n === "src" || n === "action") {
      return `${esp}${nome}="${reescreverUrl(valor, pagina)}"`;
    }
    // content e value quase nunca são endereço (viewport, CSP, valor de rádio). Qualquer
    // texto passa em new URL() como caminho relativo, então só mexemos no que já é
    // absoluto — og:url, o _next dos formulários.
    if ((n === "content" || n === "value") && /^https?:\/\//i.test(valor)) {
      return `${esp}${nome}="${reescreverUrl(valor, pagina)}"`;
    }
    if (n === "srcset") {
      const r = valor.split(",").map((parte) => {
        const [u, ...resto] = parte.trim().split(/\s+/);
        return [reescreverUrl(u, pagina), ...resto].join(" ");
      }).join(", ");
      return `${esp}${nome}="${r}"`;
    }
    return m;
  });
}

// Dados estruturados: mesmo dicionário, só em valores que casam por inteiro. Texto sem
// tradução conta como faltando, como no resto da página; identificadores e endereços
// (as chaves abaixo) passam direto.
const JSONLD_LITERAL = new Set(["@context", "@type", "@id", "url", "logo", "image", "sameAs", "alternateName", "legalName", "taxID", "streetAddress", "email", "telephone",
  "addressCountry", "addressRegion", "addressLocality", "postalCode", "priceCurrency", "price", "inLanguage", "contentUrl", "unitCode", "areaServed"]);

function traduzirJsonLd(bloco, traduz) {
  const m = bloco.match(/^(<script\b[^>]*>)([\s\S]*)(<\/script>)$/i);
  if (!m) return bloco;
  let dados;
  try { dados = JSON.parse(m[2]); } catch { return bloco; }
  const anda = (v, chave) => {
    if (typeof v === "string") {
      if (/^https:\/\/trustio\.com\.br\//.test(v)) return reescreverUrl(v, "index.html");
      if (JSONLD_LITERAL.has(chave)) return v;
      return traduz(v) ?? v;
    }
    if (Array.isArray(v)) return v.map((x) => anda(x, chave));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "inLanguage" ? "en" : anda(x, k)]));
    return v;
  };
  return `${m[1]}\n${JSON.stringify(anda(dados, ""), null, 2)}\n${m[3]}`;
}

// ─────────────────────────────────────────────────────────────── execução
const comum = await lerDicionario("_comum.json");
let desatualizados = 0, totalFaltando = 0;

for (const pagina of PAGINAS) {
  const caminhoPt = join(ROOT, pagina);
  const fontePt = await readFile(caminhoPt, "utf8");

  // Português: só bandeira e hreflang, entre marcadores.
  const pt = marcarIdioma(fontePt, pagina, "pt");
  if (pt !== fontePt) {
    if (CHECK) { console.error(`desatualizado: ${pagina} (bandeira/hreflang)`); desatualizados++; }
    else await writeFile(caminhoPt, pt);
  }

  // Inglês: parte do português já marcado, troca a bandeira pela de volta.
  const proprio = await lerDicionario(nomeDoDicionario(pagina));
  const dic = { raw: [...comum.raw, ...proprio.raw], text: { ...comum.text, ...proprio.text } };
  const { html, faltando } = traduzirPagina(pt, pagina, dic);
  const en = marcarIdioma(html, pagina, "en");

  const caminhoEn = join(ROOT, "en", pagina);
  const atual = existsSync(caminhoEn) ? await readFile(caminhoEn, "utf8") : null;
  if (atual !== en) {
    if (CHECK) { console.error(`desatualizado: en/${pagina}`); desatualizados++; }
    else { await mkdir(dirname(caminhoEn), { recursive: true }); await writeFile(caminhoEn, en); }
  }

  totalFaltando += faltando.size;
  if (faltando.size && (LISTAR || CHECK)) {
    console.log(`\n── ${pagina} · ${faltando.size} sem tradução`);
    for (const f of faltando) console.log(`  ${JSON.stringify(f)}`);
  }
}

if (CHECK && (desatualizados || totalFaltando)) {
  console.error(`\ni18n: ${desatualizados} arquivo(s) desatualizado(s), ${totalFaltando} texto(s) sem tradução. Rode \`npm run i18n\`.`);
  process.exit(1);
}
console.log(`\ni18n: ${PAGINAS.length} páginas · ${totalFaltando} texto(s) sem tradução${totalFaltando ? " (npm run i18n -- --faltando)" : ""}`);
