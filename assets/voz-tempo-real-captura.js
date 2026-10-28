/* assets/voz-tempo-real-captura.js — AudioWorklet da voz em tempo real (28 out 2026).
   Roda na thread de áudio: junta o microfone em blocos de 20 ms, converte para PCM16 little-endian
   e manda cada bloco (com o nível, para a animação) para assets/voz-tempo-real.js. Blocos curtos
   deixam a xAI perceber o fim da fala mais cedo do que os 100 ms do exemplo da xAI. */
class CapturaTrustio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.tamanho = Math.round(sampleRate * 0.02);
    this.bloco = new Int16Array(this.tamanho);
    this.pos = 0;
    this.soma = 0;
  }
  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      const s = Math.max(-1, Math.min(1, canal[i]));
      this.soma += s * s;
      this.bloco[this.pos++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.pos === this.tamanho) {
        const nivel = Math.sqrt(this.soma / this.tamanho);
        this.port.postMessage({ pcm: this.bloco.buffer, nivel }, [this.bloco.buffer]);
        this.bloco = new Int16Array(this.tamanho);
        this.pos = 0;
        this.soma = 0;
      }
    }
    return true;
  }
}
registerProcessor("captura-trustio", CapturaTrustio);
