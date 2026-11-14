// Tiny Web Audio synth for auditioning chords. No samples, no dependencies.

import { voiceChord } from './midi.js';

let ctx = null, master = null, voices = [], timers = [];

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(lp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
let center = 62;

/** Voices the next chord near the last one (same voicing as the MIDI export). */
function voice(chord) {
  const v = voiceChord(chord, center);
  center = v.center;
  return v.notes;
}

function note(midi, when, dur, gain) {
  const c = audio();
  const env = c.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.02);
  env.gain.exponentialRampToValueAtTime(gain * 0.55, when + 0.35);
  env.gain.setValueAtTime(gain * 0.55, when + dur);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.45);
  env.connect(master);
  for (const [type, detune, g] of [['triangle', 0, 1], ['sine', 6, 0.5]]) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type;
    o.frequency.value = freq(midi);
    o.detune.value = detune;
    og.gain.value = g;
    o.connect(og).connect(env);
    o.start(when);
    o.stop(when + dur + 0.5);
    voices.push(o);
  }
}

export function playChord(chord, when = 0, dur = 1.1) {
  const c = audio();
  const t = Math.max(c.currentTime + 0.01, when || 0);
  const notes = voice(chord);
  notes.forEach((m, i) => note(m, t, dur, (i === 0 ? 0.16 : 0.11) / Math.sqrt(notes.length / 3)));
}

export function stop() {
  timers.forEach(clearTimeout);
  timers = [];
  const now = ctx?.currentTime ?? 0;
  voices.forEach((o) => { try { o.stop(now + 0.05); } catch { /* already stopped */ } });
  voices = [];
}

/** Plays chords in sequence, `beats[i]` beats each; onStep(i) fires as each
 *  one sounds, onEnd() after the last. */
export function playSequence(chords, bpm, beats, onStep, onEnd) {
  stop();
  const c = audio();
  const beat = 60 / bpm;
  const start = c.currentTime + 0.05;
  center = 62;
  let at = 0;
  chords.forEach((ch, i) => {
    const len = beats[i] * beat;
    playChord(ch, start + at, len * 0.92);
    const t = at;
    timers.push(setTimeout(() => onStep(i), (0.05 + t) * 1000));
    at += len;
  });
  timers.push(setTimeout(onEnd, (0.05 + at) * 1000 + 200));
}
