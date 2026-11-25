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
function strum(notes, when, dur, level = 1, spread = 0.022) {
  const gain = (0.13 * level) / Math.sqrt(Math.max(notes.length, 2) / 4);
  notes.forEach((m, j) => note(m, when + j * spread, Math.max(0.1, dur - j * spread), gain));
}

/** Notes struck together (a piano voicing), as MIDI numbers. */
export function playNotes(notes, dur = 1.4) {
  strum(notes, audio().currentTime + 0.02, dur, 1, 0);
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
    // A step may be several notes (both hands of a piano scale).
    for (const x of Array.isArray(m) ? m : [m]) note(x, start + i * step, step * 0.85, Array.isArray(m) ? 0.14 : 0.18);
    timers.push(setTimeout(() => onStep(i), (0.05 + i * step) * 1000));
  });
  timers.push(setTimeout(onEnd, (0.05 + midis.length * step) * 1000 + 300));
}

/** Backing track: an optional one-bar count-in, then the chords on a loop
 *  until stop(). beats[i]: beats per chord. line: optional MIDI note per
 *  chord played on top (the guide-tone line). onCount(n) fires on each
 *  count-in beat, onStep(i) as chord i sounds. strums: MIDI notes per chord,
 *  strummed once per chord; rhythm: strum events for one pass ({ at, dur in
 *  beats, notes, gain, chord } from strum.js / comp.js), played instead,
 *  onHit(e) firing on each. countIn: false starts at once. startAt: the
 *  chord the first pass starts on (the playhead); later passes start at 0. */
export function playAlong({ chords, beats, bpm, line = null, strums = null, rhythm = null, onCount, onStep, onHit, countIn = true, startAt = 0 }) {
  stop();
  const c = audio();
  const beat = 60 / bpm;
  const ms = (t) => Math.max(0, (t - c.currentTime) * 1000);
  const start = c.currentTime + 0.1;
  if (countIn) countClicks(start, beat, onCount);
  const offsets = beats.map((_, i) => beats.slice(0, i).reduce((a, b) => a + b, 0));
  const total = beats.reduce((a, b) => a + b, 0);
  const pass = (from, first = 0) => {
    timers = timers.slice(-1024); // fired timers from earlier passes
    center = 62;
    const skip = offsets[first] ?? 0; // beats left out of this pass
    chords.forEach((ch, i) => {
      if (i < first) return;
      const len = beats[i] * beat, at = from + (offsets[i] - skip) * beat;
      if (!rhythm) {
        if (strums) strum(strums[i], at, len * 0.92);
        else playChord(ch, at, len * 0.92);
      }
      if (line) note(line[i], at, len * 0.95, 0.2);
      timers.push(setTimeout(() => onStep(i), ms(at)));
    });
    // After the chord changes, so onHit at the same moment comes second.
    for (const e of rhythm ?? []) {
      if ((e.chord ?? 0) < first || e.at < skip - 1e-9) continue;
      const at = from + (e.at - skip) * beat;
      strum(e.notes, at, e.dur * beat * 0.95, e.gain, e.spread ?? 0.022);
      if (onHit) timers.push(setTimeout(() => onHit(e), ms(at)));
    }
    // Schedule the next pass just before this one ends.
    const end = from + (total - skip) * beat;
    timers.push(setTimeout(() => pass(end), ms(end - 0.3)));
  };
  pass(countIn ? start + 4 * beat : start, Math.max(0, Math.min(chords.length - 1, startAt)));
}

/** Four metronome clicks (the first accented), onCount(n) on each. */
function countClicks(start, beat, onCount) {
  const c = audio();
  for (let n = 0; n < 4; n++) {
    click(start + n * beat, n === 0);
    timers.push(setTimeout(() => onCount?.(n), Math.max(0, (start + n * beat - c.currentTime) * 1000)));
  }
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
 *  instead of the piano chords. countIn: four clicks first (onCount(n) on
 *  each); startAt: the chord to start from (the playhead). */
export function playSequence(chords, bpm, beats, onStep, onEnd, rhythm = null, { countIn = false, startAt = 0, onCount = null } = {}) {
  stop();
  const c = audio();
  const beat = 60 / bpm;
  const lead = countIn ? 4 * beat : 0;
  if (countIn) countClicks(c.currentTime + 0.05, beat, onCount);
  const start = c.currentTime + 0.05 + lead;
  center = 62;
  const first = Math.max(0, Math.min(chords.length - 1, startAt));
  const skip = beats.slice(0, first).reduce((a, b) => a + b, 0);
  for (const e of rhythm ?? []) {
    if ((e.chord ?? 0) < first || e.at < skip - 1e-9) continue;
    strum(e.notes, start + (e.at - skip) * beat, e.dur * beat * 0.95, e.gain, e.spread ?? 0.022);
  }
  let at = 0;
  chords.forEach((ch, i) => {
    if (i < first) return;
    const len = beats[i] * beat;
    if (!rhythm) playChord(ch, start + at, len * 0.92);
    const t = at;
    timers.push(setTimeout(() => onStep(i), (0.05 + lead + t) * 1000));
    at += len;
  });
  timers.push(setTimeout(onEnd, (0.05 + lead + at) * 1000 + 200));
}
