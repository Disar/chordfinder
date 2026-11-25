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
    track(o);
  }
}

/** Remembers a running oscillator for stop(), forgetting it once it ends
 *  (the play-along loop would otherwise collect them forever). */
function track(o) {
  voices.push(o);
  o.onended = () => { const i = voices.indexOf(o); if (i >= 0) voices.splice(i, 1); };
}

/** Metronome tick; the accented one is higher. */
function click(when, accent) {
  const c = audio();
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.1, when + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  o.connect(g).connect(master);
  o.start(when);
  o.stop(when + 0.08);
  track(o);
}

export function playChord(chord, when = 0, dur = 1.1) {
  const c = audio();
  const t = Math.max(c.currentTime + 0.01, when || 0);
  const notes = voice(chord);
  notes.forEach((m, i) => note(m, t, dur, (i === 0 ? 0.16 : 0.11) / Math.sqrt(notes.length / 3)));
}

/** Notes from low to high a few ms apart, like a guitar strum. */
function strum(notes, when, dur, level = 1) {
  const gain = (0.13 * level) / Math.sqrt(Math.max(notes.length, 2) / 4);
  notes.forEach((m, j) => note(m, when + j * 0.022, Math.max(0.1, dur - j * 0.022), gain));
}

/** A strummed chord, given as MIDI notes (e.g. a guitar shape). */
export function playStrum(notes, dur = 1.6) {
  strum(notes, audio().currentTime + 0.02, dur);
}

/** One single note (MIDI number), e.g. a note of a scale. */
export function playNote(midi, dur = 0.7) {
  note(midi, audio().currentTime + 0.01, dur, 0.18);
}

/** A chord, then a single note on top while the chord still rings. */
export function playOver(chord, midi, delay = 0.9) {
  stop();
  const t = audio().currentTime + 0.05;
  center = 62;
  playChord(chord, t, delay + 1.4);
  note(midi, t + delay, 1.4, 0.2);
}

/** Plays single notes in sequence, eighth notes at `bpm`; onStep(i) fires as
 *  each one sounds, onEnd() after the last. */
export function playLine(midis, bpm, onStep, onEnd) {
  stop();
  const c = audio();
  const step = 60 / bpm / 2;
  const start = c.currentTime + 0.05;
  midis.forEach((m, i) => {
    note(m, start + i * step, step * 0.85, 0.18);
    timers.push(setTimeout(() => onStep(i), (0.05 + i * step) * 1000));
  });
  timers.push(setTimeout(onEnd, (0.05 + midis.length * step) * 1000 + 300));
}

/** Backing track: a one-bar count-in, then the chords on a loop until stop().
 *  beats[i]: beats per chord. line: optional MIDI note per chord played on
 *  top (the guide-tone line). onCount(n) fires on each count-in beat,
 *  onStep(i) as chord i sounds. strums: MIDI notes per chord, strummed once
 *  per chord; rhythm: strum events for one pass ({ at, dur in beats, notes,
 *  gain } from strum.js), played instead, onHit(e) firing on each. */
export function playAlong({ chords, beats, bpm, line = null, strums = null, rhythm = null, onCount, onStep, onHit }) {
  stop();
  const c = audio();
  const beat = 60 / bpm;
  const ms = (t) => Math.max(0, (t - c.currentTime) * 1000);
  const start = c.currentTime + 0.1;
  for (let n = 0; n < 4; n++) {
    click(start + n * beat, n === 0);
    timers.push(setTimeout(() => onCount?.(n), ms(start + n * beat)));
  }
  const total = beats.reduce((a, b) => a + b, 0) * beat;
  const pass = (from) => {
    timers = timers.slice(-1024); // fired timers from earlier passes
    center = 62;
    let t = from;
    chords.forEach((ch, i) => {
      const len = beats[i] * beat, at = t;
      if (!rhythm) {
        if (strums) strum(strums[i], at, len * 0.92);
        else playChord(ch, at, len * 0.92);
      }
      if (line) note(line[i], at, len * 0.95, 0.2);
      timers.push(setTimeout(() => onStep(i), ms(at)));
      t += len;
    });
    // After the chord changes, so onHit at the same moment comes second.
    for (const e of rhythm ?? []) {
      const at = from + e.at * beat;
      strum(e.notes, at, e.dur * beat * 0.95, e.gain);
      if (onHit) timers.push(setTimeout(() => onHit(e), ms(at)));
    }
    // Schedule the next pass just before this one ends.
    timers.push(setTimeout(() => pass(from + total), ms(from + total - 0.3)));
  };
  pass(start + 4 * beat);
}

export function stop() {
  timers.forEach(clearTimeout);
  timers = [];
  const now = ctx?.currentTime ?? 0;
  voices.forEach((o) => { try { o.stop(now + 0.05); } catch { /* already stopped */ } });
  voices = [];
}

/** Plays chords in sequence, `beats[i]` beats each; onStep(i) fires as each
 *  one sounds, onEnd() after the last. rhythm: strum events for the whole
 *  sequence ({ at, dur in beats, notes, gain } from strum.js), played
 *  instead of the piano chords. */
export function playSequence(chords, bpm, beats, onStep, onEnd, rhythm = null) {
  stop();
  const c = audio();
  const beat = 60 / bpm;
  const start = c.currentTime + 0.05;
  center = 62;
  for (const e of rhythm ?? []) strum(e.notes, start + e.at * beat, e.dur * beat * 0.95, e.gain);
  let at = 0;
  chords.forEach((ch, i) => {
    const len = beats[i] * beat;
    if (!rhythm) playChord(ch, start + at, len * 0.92);
    const t = at;
    timers.push(setTimeout(() => onStep(i), (0.05 + t) * 1000));
    at += len;
  });
  timers.push(setTimeout(onEnd, (0.05 + at) * 1000 + 200));
}
