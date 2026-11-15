// Pitch detection for the microphone tuner: YIN on a block of samples.
// Pure functions only (no DOM, no audio) so Node can test them with
// synthetic signals. A sax note is a single, harmonically rich tone, which
// YIN handles well (its normalised difference avoids most octave errors).

/** Estimated fundamental of `buf` (Float32Array, -1..1) in Hz, or null when
 *  there is no clear pitch (silence, noise, chords).
 *  minHz/maxHz bound the search (and its cost) to the instrument's range. */
export function detectPitch(buf, sampleRate, { minHz = 60, maxHz = 1500, threshold = 0.15, gate = 0.01 } = {}) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < gate) return null;

  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const W = buf.length - maxTau;
  // Difference function and its cumulative-mean-normalised form.
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  let sum = 0;
  const cm = new Float32Array(maxTau + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) { sum += d[tau]; cm[tau] = sum ? (d[tau] * tau) / sum : 1; }

  // First dip under the threshold, followed down to its local minimum.
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= maxTau && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Parabolic interpolation for sub-sample accuracy.
  const a = cm[tau - 1] ?? cm[tau], b = cm[tau], c = cm[tau + 1] ?? cm[tau];
  const den = a - 2 * b + c;
  const shift = den ? (a - c) / (2 * den) : 0;
  return sampleRate / (tau + shift);
}

/** Nearest MIDI note to a frequency and how far off it is, in cents. */
export function noteOf(freq, a4 = 440) {
  const exact = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

export const freqOf = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

/** Smooths a stream of detections: reports a note once it has been the same
 *  for `hold` ms, and drops it after `release` ms of silence. Cents are
 *  averaged over the last few frames. */
export function noteTracker({ hold = 120, release = 250 } = {}) {
  let cand = null, since = 0, stable = null, lastHeard = 0;
  const cents = [];
  return (freq, now) => {
    if (freq) {
      const n = noteOf(freq);
      lastHeard = now;
      if (!cand || cand !== n.midi) { cand = n.midi; since = now; cents.length = 0; }
      cents.push(n.cents);
      if (cents.length > 8) cents.shift();
      if (now - since >= hold) stable = { midi: cand, cents: Math.round(cents.reduce((x, y) => x + y, 0) / cents.length), since };
    } else if (now - lastHeard > release) {
      cand = null;
      stable = null;
    }
    return stable;
  };
}
