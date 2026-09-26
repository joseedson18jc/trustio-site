/* assets/ocr.js — leitura de anexos do chat no navegador (fotos e PDFs).
   O arquivo original não sai do aparelho: o texto é extraído aqui.
   - Foto: OCR com tesseract.js (português), e uma cópia reduzida (JPEG, até 1280 px)
     para o modelo ver a imagem — foto de paisagem, pessoa ou objeto não tem texto.
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
          // Só a variante SIMD do motor (todo navegador atual tem: Chrome, Firefox, Safari 16.4+).
          corePath: BASE + "ocr/tesseract-core-simd-lstm.wasm.js",
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
        return w.recognize(imagem).then(function (r) { ocrWorker.aviso = null; return (r && r.data) || {}; });
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
      var total = Math.min(doc.numPages, MAX_PAGINAS), partes = [], ocrUsadas = 0, falhas = 0, i = 0;
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
              return reconhecer(canvas, function (p) { progresso((i - 1 + p) / total); }).then(function (d) { return d.text || ""; });
            });
          }).catch(function (err) {
            // Uma página que não renderiza ou não passa no OCR não derruba as outras.
            console.warn("ocr página " + i, err); falhas++;
            return "[página " + i + ": não foi possível ler]";
          }).then(function (txt) {
            if (txt && txt.trim()) partes.push((total > 1 && txt.indexOf("[página " + i + ":") !== 0 ? "[página " + i + "]\n" : "") + txt.trim());
            progresso(i / total);
            return proxima();
          });
        });
      }
      return Promise.resolve(proxima()).then(function () {
        if (falhas && falhas === total) throw new Error("nenhuma_pagina_legivel");
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
      return reconhecer(arquivo, progresso).then(function (d) {
        progresso(1);
        var texto = String(d.text || "").trim();
        // Foto sem texto (paisagem, rosto, objeto) sai do OCR como ruído de baixa confiança:
        // abaixo de 55%, ou sem nenhuma letra ou número, conta como "sem texto". Texto curto
        // e legível ("PARE", um código) fica.
        if ((typeof d.confidence === "number" && d.confidence < 55) || !/[A-Za-zÀ-ÿ0-9]/.test(texto)) texto = "";
        return { texto: texto, paginas: 1, lidas: 1, ocr: 1 };
      });
    },
    // Resolve um data: URL JPEG da foto, com o lado maior em até 1280 px (a orientação da
    // câmera é respeitada). É isso, e não o arquivo original, que vai para o modelo.
    // Foto muito detalhada é recomprimida (e reduzida) até caber no limite da função do
    // chat; se não couber nem assim, resolve null e a foto vai só com o texto lido.
    miniatura: function (arquivo) {
      var LADO = 1280, LIMITE = 1400000;
      var abrir = window.createImageBitmap
        ? createImageBitmap(arquivo, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(arquivo); })
        : Promise.reject(new Error("sem_createImageBitmap"));
      return abrir.then(function (bmp) {
        var escala = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * escala)); c.height = Math.max(1, Math.round(bmp.height * escala));
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); // PNG transparente vira fundo branco
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        var tentativas = [[1, 0.82], [1, 0.65], [0.75, 0.6], [0.5, 0.55]];
        for (var i = 0; i < tentativas.length; i++) {
          var alvo = c;
          if (tentativas[i][0] < 1) {
            alvo = document.createElement("canvas");
            alvo.width = Math.max(1, Math.round(c.width * tentativas[i][0])); alvo.height = Math.max(1, Math.round(c.height * tentativas[i][0]));
            alvo.getContext("2d").drawImage(c, 0, 0, alvo.width, alvo.height);
          }
          var url = alvo.toDataURL("image/jpeg", tentativas[i][1]);
          if (url.length <= LIMITE) return url;
        }
        return null;
      });
    }
  };
})();
