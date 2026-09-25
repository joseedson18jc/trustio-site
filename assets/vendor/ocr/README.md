# OCR no navegador (chat)

Copiados sem alteração dos pacotes npm, para servir do próprio site (CSP `script-src 'self'`):

| Arquivo | Pacote | Versão | Licença |
|---|---|---|---|
| `tesseract.min.js`, `worker.min.js` | tesseract.js | 7.0.0 | Apache-2.0 |
| `tesseract-core-{relaxedsimd-,simd-,}lstm.wasm.js` (o worker escolhe conforme o navegador) | tesseract.js-core | 7.0.0 | Apache-2.0 |
| `por.traineddata.gz` (modelo `4.0.0_best_int`) | @tesseract.js-data/por | 1.0.0 | Apache-2.0 |
| `../pdfjs/pdf.min.mjs`, `../pdfjs/pdf.worker.min.mjs` (build `legacy`, compatível com Safari e navegadores mais antigos) | pdfjs-dist | 5.7.284 | Apache-2.0 |

Usados por `assets/ocr.js`, carregados só quando alguém anexa um arquivo no chat. O arquivo
não sai do navegador: só o texto extraído vai para o modelo.
