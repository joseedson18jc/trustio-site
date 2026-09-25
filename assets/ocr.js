/* assets/ocr.js — leitura de anexos do chat no navegador (fotos e PDFs).
   O arquivo não sai do aparelho: o texto é extraído aqui e só ele vai para o modelo.
   - Foto: OCR com tesseract.js (português).
   - PDF: texto direto com pdf.js; página sem texto (digitalizada) passa pelo OCR.
   As bibliotecas (assets/vendor/ocr e assets/vendor/pdfjs) só carregam no primeiro anexo. */
(function () {
  "use strict";
  var BASE = "/assets/vendor/";
  var MAX_PAGINAS = 30;          // páginas lidas por PDF
  var MAX_PAGINAS_OCR = 10;      // páginas digitalizadas passadas pelo OCR por PDF
  var MIN_TEXTO_PAGINA = 25;     // abaixo disso a página é tratada como imagem

  var tesseractPronto = null, workerPronto = null, pdfPronto = null;

  function carregarScript(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { falha(new Error("nao_carregou " + src)); };
      document.head.appendChild(s);
    });
  }

  // Um worker só, reaproveitado entre anexos (carregar o modelo de português custa ~1,4 MB).
  // Chamadas em sequência: o worker do tesseract processa uma imagem por vez.
  var fila = Promise.resolve();
  function ocrWorker(progresso) {
    if (!tesseractPronto) tesseractPronto = carregarScript(BASE + "ocr/tesseract.min.js");
    if (!workerPronto) {
      workerPronto = tesseractPronto.then(function () {
        return window.Tesseract.createWorker("por", 1, {
          workerPath: BASE + "ocr/worker.min.js",
          corePath: BASE + "ocr/",
          langPath: BASE + "ocr/",
          gzip: true,
          // Worker a partir do arquivo, não de blob: a CSP da página não aceita blob: em scripts.
          workerBlobURL: false,
          logger: function (m) { if (ocrWorker.aviso && m && m.status === "recognizing text") ocrWorker.aviso(m.progress || 0); }
        });
      });
      workerPronto.catch(function () { workerPronto = null; });
    }
    return workerPronto;
  }
  function reconhecer(imagem, progresso) {
    var tarefa = fila.then(function () {
      return ocrWorker().then(function (w) {
        ocrWorker.aviso = progresso;
        return w.recognize(imagem).then(function (r) { ocrWorker.aviso = null; return (r && r.data && r.data.text) || ""; });
      });
    });
    fila = tarefa.catch(function () {});
    return tarefa;
  }

  function pdfjs() {
    if (!pdfPronto) {
      pdfPronto = import(BASE + "pdfjs/pdf.min.mjs").then(function (m) {
        m.GlobalWorkerOptions.workerSrc = BASE + "pdfjs/pdf.worker.min.mjs";
        return m;
      });
      pdfPronto.catch(function () { pdfPronto = null; });
    }
    return pdfPronto;
  }

  function lerPdf(arquivo, progresso) {
    return Promise.all([pdfjs(), arquivo.arrayBuffer()]).then(function (r) {
      var lib = r[0];
      return lib.getDocument({ data: new Uint8Array(r[1]), isEvalSupported: false }).promise;
    }).then(function (doc) {
      var total = Math.min(doc.numPages, MAX_PAGINAS), partes = [], ocrUsadas = 0, i = 0;
      function proxima() {
        i++;
        if (i > total) return null;
        return doc.getPage(i).then(function (pag) {
          return pag.getTextContent().then(function (tc) {
            var txt = tc.items.map(function (it) { return it.str + (it.hasEOL ? "\n" : " "); }).join("").replace(/[ \t]+\n/g, "\n").trim();
            if (txt.length >= MIN_TEXTO_PAGINA || ocrUsadas >= MAX_PAGINAS_OCR) return txt;
            // Página digitalizada: desenha e passa pelo OCR.
            ocrUsadas++;
            var vp = pag.getViewport({ scale: 2 }), canvas = document.createElement("canvas");
            canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
            return pag.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise.then(function () {
              return reconhecer(canvas, function (p) { progresso((i - 1 + p) / total); });
            });
          }).then(function (txt) {
            if (txt && txt.trim()) partes.push((total > 1 ? "[página " + i + "]\n" : "") + txt.trim());
            progresso(i / total);
            return proxima();
          });
        });
      }
      return Promise.resolve(proxima()).then(function () {
        return { texto: partes.join("\n\n"), paginas: doc.numPages, lidas: total, ocr: ocrUsadas };
      });
    });
  }

  window.TrustioOCR = {
    // Resolve { texto, paginas, lidas, ocr } — texto vazio quando não há nada legível.
    extrair: function (arquivo, progresso) {
      progresso = progresso || function () {};
      var tipo = String(arquivo.type || "").toLowerCase(), nome = String(arquivo.name || "").toLowerCase();
      if (tipo === "application/pdf" || /\.pdf$/.test(nome)) return lerPdf(arquivo, progresso);
      return reconhecer(arquivo, progresso).then(function (texto) {
        progresso(1);
        return { texto: String(texto || "").trim(), paginas: 1, lidas: 1, ocr: 1 };
      });
    }
  };
})();
