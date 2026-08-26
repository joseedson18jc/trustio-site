class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 24000;
    this.chunkMs = 50;
    this.sourceFrames = Math.max(1, Math.round(sampleRate * this.chunkMs / 1000));
    this.targetFrames = Math.max(1, Math.round(this.targetRate * this.chunkMs / 1000));
    this.buffer = new Float32Array(this.sourceFrames);
    this.offset = 0;
  }

  emitChunk() {
    const pcm = new Int16Array(this.targetFrames);
    let energy = 0;

    for (let i = 0; i < this.targetFrames; i += 1) {
      const sourcePosition = i * (this.sourceFrames - 1) / Math.max(1, this.targetFrames - 1);
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(leftIndex + 1, this.sourceFrames - 1);
      const fraction = sourcePosition - leftIndex;
      const sample = this.buffer[leftIndex] * (1 - fraction) + this.buffer[rightIndex] * fraction;
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      energy += clipped * clipped;
    }

    const level = Math.sqrt(energy / this.targetFrames);
    this.port.postMessage(
      { type: "audio", pcm: pcm.buffer, level },
      [pcm.buffer],
    );
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let i = 0; i < input.length; i += 1) {
      this.buffer[this.offset] = input[i];
      this.offset += 1;

      if (this.offset >= this.sourceFrames) {
        this.emitChunk();
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
