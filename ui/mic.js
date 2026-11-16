// Microphone input for the tuner. Audio is analysed live and never stored:
// nothing is recorded, kept beyond one analysis block, or written anywhere.
// The mic is opened only when the user switches it on.

import { detectPitch, noteTracker } from './pitch.js';

let stream = null, ctx = null;

/** Opens the mic and calls onFrame(stableNote | null, rawFreq | null) about
 *  30 times a second. stableNote: { midi (concert), cents, since }.
 *  Rejects if the mic is unavailable or permission is refused. `size`:
 *  samples per analysis block (the lowest pitch found is about rate / (size / 2)). */
export async function startMic({ minHz, maxHz, onFrame, size = 2048 }) {
  stopMic();
  // No noise suppression or auto gain: they colour the tone and the pitch.
  // Echo cancellation stays on to damp the app's own backing track.
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  });
  ctx = new AudioContext();
  // Samples come from an AudioWorklet on the audio clock rather than a
  // requestAnimationFrame loop, which stops when the window is hidden.
  let tap;
  try {
    await ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    tap = new AudioWorkletNode(ctx, 'tuner-tap', { processorOptions: { size } });
  } catch (e) {
    stopMic(); // release the mic again
    throw e;
  }
  ctx.createMediaStreamSource(stream).connect(tap);
  const track = noteTracker();
  const rate = ctx.sampleRate;
  tap.port.onmessage = (e) => {
    const f = detectPitch(e.data, rate, { minHz, maxHz });
    onFrame(track(f, performance.now()), f);
  };
}

export function stopMic() {
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close();
  stream = null;
  ctx = null;
}

export const micOn = () => stream !== null;
