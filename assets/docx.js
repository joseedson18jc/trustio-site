/* assets/docx.js — leitura de documentos do Word (.docx) no navegador, sem biblioteca externa.
   O arquivo original não sai do aparelho: o texto é extraído aqui, como nos PDFs (assets/ocr.js).
   Um .docx é um zip; o texto fica em word/document.xml. Lê o diretório central do zip, descomprime
   só essa entrada (DecompressionStream "deflate-raw", nativo do navegador) e percorre o XML:
   parágrafos viram linhas, tabelas viram "célula | célula", <w:tab/> e <w:br/> são respeitados.
   .doc antigo (formato binário) é recusado com motivo claro. */
(function () {
  "use strict";
  var MAX_XML = 20 * 1024 * 1024;   // texto do documento depois de descomprimido (protege de bomba de zip)
  var MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  function ehDocx(f) { return String(f.type || "").toLowerCase() === MIME || /\.docx$/i.test(f.name || ""); }
  function ehDocAntigo(f) { return String(f.type || "").toLowerCase() === "application/msword" || /\.doc$/i.test(f.name || ""); }
  function falha(codigo) { return new Error(codigo); }

  function bytesDe(arquivo) {
    if (arquivo.arrayBuffer) return arquivo.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Response(arquivo).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // Acha uma entrada pelo diretório central (o fim do zip), que traz tamanhos confiáveis.
  function acharEntrada(u8, nome) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), fim = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw falha("docx_invalido");
    var total = dv.getUint16(fim + 10, true), p = dv.getUint32(fim + 16, true), dec = new TextDecoder();
    for (var k = 0; k < total; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw falha("docx_invalido");
      var metodo = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), tam = dv.getUint32(p + 24, true);
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      var local = dv.getUint32(p + 42, true), n = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      if (n === nome) {
        if (local + 30 > u8.length || dv.getUint32(local, true) !== 0x04034b50) throw falha("docx_invalido");
        var ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        if (ini + comp > u8.length) throw falha("docx_invalido");
        return { metodo: metodo, dados: u8.subarray(ini, ini + comp), tamanho: tam };
      }
      p += 46 + nl + xl + cl;
    }
    throw falha("docx_invalido");
  }

  // Descomprime com teto: para de ler (e falha) assim que passa de MAX_XML.
  function descomprimir(e) {
    if (e.tamanho > MAX_XML) return Promise.reject(falha("docx_grande"));
    if (e.metodo === 0) return Promise.resolve(e.dados);
    if (e.metodo !== 8 || typeof DecompressionStream === "undefined") return Promise.reject(falha("docx_invalido"));
    var leitor = new Blob([e.dados]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    var partes = [], total = 0;
    function proximo() {
      return leitor.read().then(function (r) {
        if (r.done) {
          var out = new Uint8Array(total), o = 0;
          partes.forEach(function (p) { out.set(p, o); o += p.length; });
          return out;
        }
        total += r.value.length;
        if (total > MAX_XML) { leitor.cancel(); throw falha("docx_grande"); }
        partes.push(r.value);
        return proximo();
      });
    }
    return proximo().catch(function (err) { throw /docx_/.test(err.message) ? err : falha("docx_invalido"); });
  }

  var ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  function decodificar(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") { var c = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(c) ? String.fromCodePoint(c) : m; }
      return Object.prototype.hasOwnProperty.call(ENTIDADES, e) ? ENTIDADES[e] : m;
    });
  }

  // Percorre as tags do XML do Word: <w:t> é texto; <w:p> fecha linha; célula e linha de tabela
  // viram " | " e quebra. Texto apagado em revisão (<w:delText>) e campos ocultos ficam de fora.
  function textoDoXml(xml) {
    var linhas = [], linha = "", celulas = null, celula = "", dentroT = false;
    var re = /<(\/?)(w:[A-Za-z]+)\b[^>]*?(\/?)>|([^<]+)/g, m;
    function fecharParagrafo() {
      if (celulas) { celula += (celula ? "\n" : "") + linha; } else { linhas.push(linha); }
      linha = "";
    }
    while ((m = re.exec(xml))) {
      if (m[4] !== undefined) { if (dentroT) linha += decodificar(m[4]); continue; }
      var fecha = m[1] === "/", tag = m[2], vazia = m[3] === "/";
      if (tag === "w:t") { dentroT = !fecha && !vazia; continue; }
      if (fecha) {
        if (tag === "w:p") fecharParagrafo();
        else if (tag === "w:tc" && celulas) { celulas.push(celula.replace(/\n+/g, " ").trim()); celula = ""; }
        else if (tag === "w:tr" && celulas) { linhas.push(celulas.join(" | ")); celulas = []; }
        else if (tag === "w:tbl") celulas = null;
        continue;
      }
      if (tag === "w:tab") linha += "\t";
      else if (tag === "w:br" || tag === "w:cr") linha += "\n";
      else if (tag === "w:tbl") celulas = [];
      else if (tag === "w:tr" && celulas) celulas = [];
    }
    if (linha) fecharParagrafo();
    return linhas.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  window.TrustioDocx = {
    MAX_XML: MAX_XML,
    ehDocx: ehDocx,
    ehDocAntigo: function (f) { return ehDocAntigo(f) && !ehDocx(f); },
    // Resolve { texto, paginas: 0 }. Falha com "doc_antigo", "docx_invalido" ou "docx_grande".
    extrair: function (arquivo) {
      if (ehDocAntigo(arquivo) && !ehDocx(arquivo)) return Promise.reject(falha("doc_antigo"));
      return bytesDe(arquivo).then(function (u8) {
        if (u8[0] === 0xd0 && u8[1] === 0xcf) throw falha("doc_antigo");     // cabeçalho do .doc binário
        return descomprimir(acharEntrada(u8, "word/document.xml"));
      }).then(function (xml) {
        return { texto: textoDoXml(new TextDecoder().decode(xml)), paginas: 0 };
      });
    }
  };
})();
