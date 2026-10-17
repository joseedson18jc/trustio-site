// Testes do leitor de Word (assets/docx.js): texto, acentos, quebras, tabelas e arquivos inválidos.
// Roda o arquivo como no navegador, num contexto isolado (Blob e DecompressionStream do Node).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const ctx = { console, Blob, Response, DecompressionStream, TextDecoder, Uint8Array, DataView, Promise };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(root + "assets/docx.js", "utf8"), ctx);
const D = ctx.TrustioDocx;
const arquivo = (bytes, name) => new File([bytes], name);
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log("ok -", name); };

// Um .docx mínimo, montado aqui: zip com word/document.xml comprimido (deflate) ou guardado.
function zip(entries) {
  const enc = new TextEncoder(), locais = [], centrais = [];
  let off = 0;
  for (const [nome, conteudo, metodo] of entries) {
    const dados = enc.encode(conteudo), comp = metodo === 8 ? deflateRawSync(dados) : dados, nm = enc.encode(nome);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(metodo, 8);
    l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(dados.length, 22); l.writeUInt16LE(nm.length, 26);
    locais.push(l, nm, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(metodo, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    centrais.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(centrais), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, e]);
}
const doc = (corpo) => `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${corpo}</w:body></w:document>`;

await t("documento real do Word (textutil): acentos, quebra de linha e tabela", async () => {
  const r = await D.extrair(arquivo(readFileSync(root + "tests/fixtures/contrato.docx"), "contrato.docx"));
  assert.match(r.texto, /Contrato de Prestação de Serviços/);
  assert.match(r.texto, /João da Silva/);
  assert.match(r.texto, /R\$ 3\.450,00 — reajuste anual pelo IPCA\.\nVigência: 12 meses\./);
  assert.match(r.texto, /Parcela\nVencimento\n1ª\n10\/11\/2026/);     // textutil achata a tabela em parágrafos
  assert.match(r.texto, /aviso prévio de 30 dias & multa de 10%/);
});

await t("parágrafos, tabulação e entidades XML", async () => {
  const xml = doc('<w:p><w:r><w:t>Olá</w:t><w:tab/><w:t xml:space="preserve"> mundo &lt;3&gt; &amp; &quot;aspas&quot;</w:t></w:r></w:p><w:p><w:r><w:t>Fim</w:t></w:r></w:p>');
  const r = await D.extrair(arquivo(zip([["word/document.xml", xml, 8]]), "a.docx"));
  assert.equal(r.texto, 'Olá\t mundo <3> & "aspas"\nFim');
});

await t("tabela do Word: células com \" | \" e uma linha por linha da tabela", async () => {
  const cel = (s) => `<w:tc><w:p><w:r><w:t>${s}</w:t></w:r></w:p></w:tc>`;
  const xml = doc(`<w:p><w:r><w:t>Antes</w:t></w:r></w:p><w:tbl><w:tr>${cel("Parcela")}${cel("Vencimento")}</w:tr>` +
    `<w:tr>${cel("1ª")}${cel("10/11/2026")}</w:tr></w:tbl><w:p><w:r><w:t>Depois</w:t></w:r></w:p>`);
  const r = await D.extrair(arquivo(zip([["word/document.xml", xml, 8]]), "t.docx"));
  assert.equal(r.texto, "Antes\nParcela | Vencimento\n1ª | 10/11/2026\nDepois");
});

await t("entrada guardada (sem compressão) também é lida", async () => {
  const r = await D.extrair(arquivo(zip([["word/document.xml", doc("<w:p><w:r><w:t>guardado</w:t></w:r></w:p>"), 0]]), "b.docx"));
  assert.equal(r.texto, "guardado");
});

await t("texto apagado em revisão (w:delText) não entra", async () => {
  const xml = doc("<w:p><w:r><w:t>fica</w:t></w:r><w:del><w:r><w:delText>sai</w:delText></w:r></w:del></w:p>");
  const r = await D.extrair(arquivo(zip([["word/document.xml", xml, 8]]), "c.docx"));
  assert.equal(r.texto, "fica");
});

await t(".doc antigo é recusado com motivo claro", async () => {
  await assert.rejects(D.extrair(arquivo(readFileSync(root + "tests/fixtures/antigo.doc"), "antigo.doc")), /doc_antigo/);
});

await t("zip sem word/document.xml é recusado", async () => {
  await assert.rejects(D.extrair(arquivo(zip([["outro.xml", "<x/>", 8]]), "d.docx")), /docx_invalido/);
});

await t("arquivo que não é zip é recusado", async () => {
  await assert.rejects(D.extrair(arquivo(Buffer.from("isto não é um docx"), "e.docx")), /docx_invalido/);
});

await t("documento grande demais ao descomprimir é recusado (bomba de zip)", async () => {
  const enorme = doc("<w:p><w:r><w:t>" + "a".repeat(D.MAX_XML + 10) + "</w:t></w:r></w:p>");
  await assert.rejects(D.extrair(arquivo(zip([["word/document.xml", enorme, 8]]), "f.docx")), /docx_grande/);
});

await t("ehDocx reconhece pela extensão ou pelo tipo", async () => {
  assert.equal(D.ehDocx({ name: "x.DOCX", type: "" }), true);
  assert.equal(D.ehDocx({ name: "x", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), true);
  assert.equal(D.ehDocx({ name: "x.doc", type: "application/msword" }), false);
  assert.equal(D.ehDocAntigo({ name: "x.doc", type: "" }), true);
});

console.log(`\n${n} testes passaram`);
