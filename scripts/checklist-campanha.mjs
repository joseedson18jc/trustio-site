#!/usr/bin/env node
// Confere as páginas públicas em português contra o checklist da Fase 3 da campanha
// lancamento-b2c-out26 (brand guide §5 e invariantes do brief). Cobre o que dá para
// conferir no código do site; screenshots, legendas de vídeo e cortes de reel ficam fora.
//
//   npm run checklist:campanha        lista FALHA e AVISO; sai com 1 se houver FALHA
//
// Uma FALHA bloqueia a campanha. Um AVISO pede olho humano (por exemplo, comparação de
// benchmark publicada por terceiro numa página B2B).
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Páginas que a campanha toca (landings e o caminho até o cadastro) e as demais públicas.
const B2C = ["index.html", "ia-sem-censura.html", "cadastro.html", "entrar.html", "planos.html", "seats.html",
  "espera.html", "obrigado.html", "afiliados.html", "agentio.html", "app/index.html", "modelos.html", "fundador.html",
  "privacidade.html", "manifesto.html"];
const B2B = ["empresas.html", "voice.html", "juridico/index.html", "console/index.html", "404.html", "planos-teste.html"];
const VOZ = ["voice.html", "console/index.html"];

const AVISO_TEXTO = "Quem envia as perguntas responde pelo conteúdo delas e pelo uso que faz das respostas, nos termos da lei";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", middot: "·", mdash: "—", ndash: "–", hellip: "…",
  ldquo: "“", rdquo: "”", check: "✓", aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", oacute: "ó",
  uacute: "ú", atilde: "ã", otilde: "õ", ecirc: "ê", ocirc: "ô", acirc: "â", ccedil: "ç", agrave: "à", ne: "≠", harr: "↔" };
const decod = (s) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m);

// Texto visível (nós de texto), mais <title> e as descrições de compartilhamento.
function textos(html) {
  const out = [];
  const semCodigo = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  for (const parte of semCodigo.split(/<[^>]+>/)) {
    const t = decod(parte).replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  for (const m of html.matchAll(/<meta\s+(?:name|property)="(description|og:description|og:title|og:image:alt|twitter:title|twitter:description)"\s+content="([^"]*)"/gi)) {
    out.push(decod(m[2]));
  }
  return out;
}

const achados = [];
const falha = (pagina, item, msg) => achados.push({ nivel: "FALHA", pagina, item, msg });
const aviso = (pagina, item, msg) => achados.push({ nivel: "AVISO", pagina, item, msg });
const trecho = (s, i, n = 70) => s.slice(Math.max(0, i - n / 2), i + n).replace(/\s+/g, " ");

// "sem censura" que não leva asterisco: só o próprio aviso e as definições.
const SEM_CENSURA_LIVRE = /(?<!com ou )\bsem censura(?!\*)(?!\s+(?:não é sem lei|≠|é tirar|quer dizer))/i;

const PROIBIDOS = [
  [3, /revolucion[áa]ri/i], [3, /última geração/i], [3, /a melhor IA/i], [3, /melhores modelos/i],
  [3, /\bilimitad[oa]s?\b/i], [3, /sem limites?\b/i], [3, /qualquer coisa/i], [3, /vale tudo/i],
  [3, /100% (seguro|anônim|privad)/i], [3, /\bhacker\b/i], [3, /jailbreak/i], [3, /\bprompts?\b/i],
  [3, /\buncensored\b/i], [3, /ficção adulta não precisa/i], [3, /ISO 27001/], [3, /suporte 24\/7/i], [3, /\b24\/7\b/],
  [3, /\bby Nous\b/i], [3, /\d+\+?\s*certificações/i],
  [2, /^(recomendado|mais escolhido|mais popular|melhor custo)$/i],
  [2, /\b\d[\d.]*\s*(usuários|pessoas inscritas|inscritos|clientes satisfeitos)\b/i],
];
const SAUDE = /\b(doses?|dosagem|interaç(ão|ões)|paracetamol|tramadol|ibuprofeno|MDMA|LSD)\b/i;
const OUTRA_IA = /\b(ChatGPT|Gemini|IA comum|GPT(?:[- ]?\d)?|Claude|Kimi)\b/i;
// Inglês visível (item 17). Nomes de produto (VoiceAI powered by xAI, Heavy Thinking, Omnichannel) ficam.
const INGLES = /\b(by design|uncensored|seats?|knowledge|legal intelligence|document ai|monitor live|templates uncensored)\b/i;
// Voz, busca ou Agentio no mesmo texto que "guardado/hospedado/servidores… no Brasil" (item 6).
const VOZ_BUSCA = /(VoiceAI|\bvoz\b|busca na web|Agentio|grava[çc][õo]es)/i;
const NO_BRASIL = /(armazenad|guardad|hospedad|servidores|infraestrutura nacional|permanecem|no seu perímetro|nunca deixam)[^.]{0,60}(Brasil|nacional|perímetro|ambiente)?/i;

for (const pagina of [...B2C, ...B2B]) {
  let html;
  try { html = await readFile(join(ROOT, pagina), "utf8"); } catch { continue; }
  const ts = textos(html);
  const tudo = ts.join("\n");
  // As regras de divulgação dos afiliados citam os termos vetados para proibi-los: ficam fora dos itens 3 e 7.
  const tsClaims = textos(html.replace(/<details data-checklist="regras">[\s\S]*?<\/details>/g, " "));
  const ehB2C = B2C.includes(pagina);

  // 1. asterisco e aviso visível
  for (const t of ts) {
    const m = t.match(SEM_CENSURA_LIVRE);
    if (m) falha(pagina, 1, `"sem censura" sem asterisco: …${trecho(t, m.index)}…`);
  }
  if (/sem censura\*/i.test(tudo) && !tudo.includes(AVISO_TEXTO)) falha(pagina, 1, "usa \"sem censura*\" e não mostra o aviso do asterisco");

  // 2 e 3. prova social e termos vetados
  for (const t of tsClaims) {
    for (const [item, re] of PROIBIDOS) {
      const m = t.match(re);
      if (!m) continue;
      if (/não vamos mostrar depoimento/i.test(t)) continue;
      falha(pagina, item, `"${m[0]}": …${trecho(t, m.index)}…`);
    }
  }
  // "42 de 42" só com "teste interno" ao lado
  if (/42 de 42/.test(tudo) && !/teste interno/i.test(tudo)) falha(pagina, 4, "\"42 de 42\" sem \"teste interno\"");

  // 5 e 7. outra IA e saúde (nas páginas B2C a regra é dura; nas B2B, aviso)
  for (const t of tsClaims) {
    const ia = t.match(OUTRA_IA);
    if (ia) (ehB2C && !["modelos.html"].includes(pagina) ? falha : aviso)(pagina, 5, `outra IA citada: …${trecho(t, ia.index)}…`);
    const s = t.match(SAUDE);
    if (s && ehB2C) falha(pagina, 7, `saúde: …${trecho(t, s.index)}…`);
  }

  // 17. texto em PT-BR
  for (const t of ts) {
    const m = t.match(INGLES);
    if (m) falha(pagina, 17, `inglês: …${trecho(t, m.index)}…`);
  }

  // 6. voz, busca e Agentio sem "no Brasil" no mesmo texto (a menos que o texto diga que sai para os EUA)
  for (const t of ts) {
    if (!VOZ_BUSCA.test(t) || /EUA/.test(t)) continue;
    const m = t.match(NO_BRASIL);
    if (m && /Brasil|nacional|perímetro|ambiente/i.test(m[0])) falha(pagina, 6, `voz/busca/Agentio com dado no Brasil: …${trecho(t, m.index)}…`);
  }
  if (VOZ.includes(pagina)) {
    for (const t of ts) {
      const m = t.match(/(dados|grava[çc][õo]es|registros|transcri[çc][õo]es)[^.]{0,40}no Brasil|hospedad[oa]s? no Brasil|br-sao-1/i);
      if (m) falha(pagina, 6, `voz com dado no Brasil: …${trecho(t, m.index)}…`);
    }
  }

  // 8. oferta por extenso, sem Pix para pessoa física
  if (ehB2C && /5 perguntas grátis/i.test(tudo) && !/uma vez por conta|uma única vez/i.test(tudo)) falha(pagina, 8, "\"5 perguntas grátis\" sem \"uma vez por conta\"");
  if (ehB2C && /5 perguntas grátis/i.test(tudo) && !/sem cartão/i.test(tudo)) falha(pagina, 8, "\"5 perguntas grátis\" sem \"sem cartão\"");
  if (ehB2C && pagina !== "afiliados.html") {
    // afiliado recebe comissão por Pix; isso não é forma de pagamento do cliente
    let alvo = html;
    if (pagina === "planos.html") { const i = html.indexOf('id="pessoal"'); alvo = i >= 0 ? html.slice(i, html.indexOf("<footer", i)) : html; }
    for (const t of textos(alvo)) {
      const m = t.match(/\bPix\b/);
      if (m) falha(pagina, 8, `Pix para pessoa física: …${trecho(t, m.index)}…`);
    }
  }

  // 9. nunca /chat (dá 404)
  if (/href="[^"]*\/chat(["/?#])/.test(html) || /trustio\.com\.br\/chat\b/.test(tudo)) falha(pagina, 9, "link ou menção a /chat");

  // 10. nenhum script nem folha de estilo de terceiros
  for (const m of html.matchAll(/<link\b[^>]*\bhref="(https?:\/\/(?!trustio\.com\.br)[^"]+)"[^>]*>/gi)) {
    if (/rel="(stylesheet|preconnect|preload)"/i.test(m[0])) falha(pagina, 10, `recurso de terceiro: ${m[1]}`);
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/gi)) falha(pagina, 10, `script de terceiro: ${m[1]}`);
  const csp = html.match(/Content-Security-Policy" content="([^"]*)"/);
  if (csp) {
    const scriptSrc = (csp[1].match(/script-src ([^;]*)/) || [, ""])[1].split(/\s+/).filter((x) => /^https?:/.test(x));
    for (const h of scriptSrc) if (!/cloudflareinsights\.com$/.test(h)) falha(pagina, 10, `CSP libera script de ${h}`);
  }

  // 16. Agentio no WhatsApp fora do papel de herói (sem a oferta de 3 dias no WhatsApp)
  for (const t of ts) {
    const m = t.match(/3 dias[^.]{0,60}(WhatsApp|agente|Agentio)|(WhatsApp|Agentio)[^.]{0,40}3 dias/i);
    if (m) falha(pagina, 16, `oferta de 3 dias do agente: …${trecho(t, m.index)}…`);
  }
}

// 7. a biblioteca de templates do app é produto (o usuário abre de propósito), não peça de campanha: só AVISO
{
  const js = await readFile(join(ROOT, "assets/chat-templates.js"), "utf8");
  const n = (js.match(new RegExp(SAUDE.source, "gi")) || []).length;
  if (n) aviso("assets/chat-templates.js", 7, `${n} menções de dose/interação/droga na biblioteca de templates do app (decisão de produto)`);
}

// 15. regras de divulgação no programa de afiliados
{
  const html = await readFile(join(ROOT, "afiliados.html"), "utf8");
  const tudo = textos(html).join("\n");
  if (!/#publi/.test(tudo)) falha("afiliados.html", 15, "sem a regra de #publi");
  if (!/18\+|maiores de 18/.test(tudo)) falha("afiliados.html", 15, "sem a regra de público 18+");
  if (!/nada sexual/i.test(tudo)) falha("afiliados.html", 15, "sem a regra \"nada sexual\"");
}

const f = achados.filter((a) => a.nivel === "FALHA"), w = achados.filter((a) => a.nivel === "AVISO");
for (const a of [...f, ...w]) console.log(`${a.nivel} · item ${a.item} · ${a.pagina}: ${a.msg}`);
console.log(`\nchecklist da campanha: ${f.length} falha(s), ${w.length} aviso(s) em ${B2C.length + B2B.length} páginas`);
process.exit(f.length ? 1 : 0);
