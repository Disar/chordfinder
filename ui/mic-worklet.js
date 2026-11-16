// Audio-thread side of the tuner: keeps the last `size` mic samples (2048
// by default; 4096 for bass, whose low E needs a longer window) and posts a
// copy every `hop` samples. Runs on the audio clock, so the tuner keeps
// working when the window is in the background (requestAnimationFrame and
// timers are throttled there). Nothing is kept beyond this one buffer.

class TunerTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const size = options?.processorOptions?.size ?? 2048;
    this.buf = new Float32Array(size);
    this.fill = 0;
    this.since = 0;
    this.hop = (size * 3) / 4;
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) {
      const n = ch.length, buf = this.buf;
      buf.copyWithin(0, n);
      buf.set(ch, buf.length - n);
      this.fill = Math.min(buf.length, this.fill + n);
      this.since += n;
      if (this.since >= this.hop && this.fill === buf.length) {
        this.since = 0;
        this.port.postMessage(buf.slice());
      }
    }
    return true;
  }
}

registerProcessor('tuner-tap', TunerTap);
