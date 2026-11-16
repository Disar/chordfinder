// Guitar chord voicings — pure. A small search over the fretboard instead of
// a shape table, so every chord the app can build gets a diagram in any key.

import { mod } from './theory.js';

/** Standard tuning, low E to high E, as MIDI numbers. */
export const TUNING = [40, 45, 50, 55, 59, 64];
const SPAN = 4;      // frets a hand covers (window start .. start + 3)
const TOP = 12;      // highest window start

// The standard open-position shapes from beginner chord charts, used first
// when one exists for the chord (by root pitch class and quality). Everything
// else comes from the search below, which only makes movable shapes: an open
// string search finds valid but unidiomatic voicings (B as x21402).
const OPEN = {
  maj: { 0: 'x32010', 2: 'xx0232', 4: '022100', 7: '320003', 9: 'x02220' },
  min: { 2: 'xx0231', 4: '022000', 9: 'x02210' },
  dom7: { 0: 'x32310', 2: 'xx0212', 4: '020100', 7: '320001', 9: 'x02020', 11: 'x21202' },
  maj7: { 0: 'x32000', 2: 'xx0222', 4: '021100', 5: 'xx3210', 7: '320002', 9: 'x02120' },
  min7: { 2: 'xx0211', 4: '020000', 9: 'x02010' },
  sus2: { 2: 'xx0230', 9: 'x02200' },
  sus4: { 2: 'xx0233', 4: '022200', 9: 'x02230' },
  '7sus4': { 2: 'xx0213', 4: '020200', 9: 'x02030' },
  add9: { 0: 'x32030' },
  maj6: { 0: 'x32210', 2: 'xx0202', 4: '022120', 7: '320000', 9: 'x02222' },
  min6: { 2: 'xx0201', 4: '022020', 9: 'x02212' },
  power: { 2: 'xx023x', 4: '022xxx', 9: 'x022xx' },
};
export const OPEN_SHAPES = OPEN;
const parseShape = (t) => [...t].map((c) => (c === 'x' ? -1 : +c));

/** Chord pitch classes: { root, tones: [pc...], optional: Set of pcs that may be left out }.
 *  The 5th may be dropped from chords of four or more notes (not from a power chord). */
function chordPcs(chord) {
  const tones = [...new Set(chord.semis.map((s) => mod(chord.pc + s, 12)))];
  const optional = new Set();
  if (tones.length >= 4 && chord.semis.includes(7)) optional.add(mod(chord.pc + 7, 12));
  return { root: chord.pc, tones, optional };
}

/** Fingers needed, with a barre at the lowest fret when that saves fingers.
 *  Returns { fingers, barre: null | { fret, from, to } } or null if unplayable. */
function hand(frets) {
  const fretted = frets.map((f, s) => [f, s]).filter(([f]) => f > 0);
  if (!fretted.length) return { fingers: 0, barre: null };
  const low = Math.min(...fretted.map(([f]) => f));
  const atLow = fretted.filter(([f]) => f === low).map(([, s]) => s);
  if (fretted.length <= 4) return { fingers: fretted.length, barre: null };
  if (atLow.length > 1) {
    const from = atLow[0], to = atLow[atLow.length - 1];
    // A barre presses every string under it: none of them may be open or lower.
    const ok = frets.slice(from, to + 1).every((f) => f === -1 ? false : f >= low);
    const fingers = 1 + fretted.filter(([f]) => f > low).length;
    if (ok && fingers <= 4) return { fingers, barre: { fret: low, from, to } };
  }
  return null;
}

function score(v, omitted, gaps) {
  const sounding = v.frets.filter((f) => f >= 0).length;
  const fretted = v.frets.filter((f) => f > 0);
  const top = Math.max(...fretted), span = top - Math.min(...fretted);
  return top * 0.9 + v.fingers * 0.6 + (v.barre ? 0.8 : 0) + omitted * 1.5 - sounding * 1.2
    + (span >= 3 ? 2 : 0) + gaps * 1.2;
}

/** All playable movable voicings of a chord, best first: root in the bass,
 *  only chord tones, at most one muted string inside, at most four fingers. */
export function voicings(chord) {
  const { root, tones, optional } = chordPcs(chord);
  const maxStrings = chord.quality === 'power' ? 3 : 6;
  const minStrings = Math.min(3, tones.length);
  const seen = new Set(), out = [];
  for (let start = 1; start <= TOP; start++) {
    // Options per string: muted, open, or a chord tone inside the window.
    const opts = TUNING.map((open) => {
      const o = [-1];
      for (let f = start; f < start + SPAN; f++) if (tones.includes(mod(open + f, 12))) o.push(f);
      return o;
    });
    const frets = [];
    const walk = (s) => {
      if (s === 6) return consider([...frets]);
      for (const f of opts[s]) { frets.push(f); walk(s + 1); frets.pop(); }
    };
    walk(0);
  }
  function consider(frets) {
    const on = frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
    if (on.length < minStrings || on.length > maxStrings) return;
    if (on[0] > 2) return; // bass on the E, A or D string
    // One muted string is allowed only right above the bass (shell shapes
    // like 3x343x, damped by the bass finger); the rest must be next to each other.
    const gaps = on[on.length - 1] - on[0] + 1 - on.length;
    if (gaps > 1 || (gaps && on[1] !== on[0] + 2)) return;
    const pcs = on.map((s) => mod(TUNING[s] + frets[s], 12));
    if (pcs[0] !== root) return;
    const missing = tones.filter((t) => !pcs.includes(t));
    if (missing.some((t) => !optional.has(t))) return;
    const key = frets.join(',');
    if (seen.has(key)) return;
    const h = hand(frets);
    if (!h) return;
    const fretted = frets.filter((f) => f > 0);
    if (fretted.length && Math.max(...fretted) - Math.min(...fretted) >= SPAN) return;
    seen.add(key);
    const v = { frets, fingers: h.fingers, barre: h.barre };
    v.score = score(v, missing.length, gaps);
    out.push(v);
  }
  return out.sort((a, b) => a.score - b.score);
}

const cache = new Map();
/** The easiest voicing for a chord, or null if none fits the rules. */
export function voicing(chord) {
  const k = `${chord.pc}:${chord.semis.join('.')}:${chord.quality}`;
  if (!cache.has(k)) {
    const shape = OPEN[chord.quality]?.[chord.pc];
    const frets = shape && parseShape(shape);
    const open = frets && { frets, ...hand(frets), open: true };
    if (open) open.score = score(open, 0, 0);
    cache.set(k, open || (voicings(chord)[0] ?? null));
  }
  return cache.get(k);
}

/** Compact form, e.g. "x32010"; frets above 9 in parentheses. */
export const shapeText = (v) => v.frets.map((f) => (f < 0 ? 'x' : f > 9 ? `(${f})` : f)).join('');

/** First fret shown in a 4-fret diagram: 1 (nut) when everything fits there. */
export function baseFret(v) {
  const top = Math.max(0, ...v.frets);
  if (top <= 4) return 1;
  return Math.min(...v.frets.filter((f) => f > 0));
}

/** Sounding MIDI notes, low to high. */
export const voicingMidi = (v) => v.frets.flatMap((f, s) => (f >= 0 ? [TUNING[s] + f] : []));
