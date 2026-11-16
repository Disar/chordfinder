// Guitar chord voicings — pure. A small search over the fretboard instead of
// a shape table, so every chord the app can build gets a diagram in any key.

import { mod, modeById, spellKey, noteName } from './theory.js';
import { spelledScale, chordLayer, octaveOf } from './horn.js';

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

// ---------------------------------------------------------------- fretboard

/** Fretted instruments for the guitar view. Strings low to high as sounding
 *  MIDI numbers (guitar and bass are written an octave higher than they sound). */
export const FRETTED = [
  { id: 'guitar', name: 'Guitar', strings: [40, 45, 50, 55, 59, 64], tuning: 'E A D G B E' },
  { id: 'bass', name: 'Bass', strings: [28, 33, 38, 43], tuning: 'E A D G' },
];
export const frettedById = (id) => FRETTED.find((i) => i.id === id) ?? FRETTED[0];
export const FRETS = 17;
/** Inlay dots; 12 is the octave and gets two. */
export const INLAYS = [3, 5, 7, 9, 12, 15, 17];

/** The scale on the neck: one cell per string and fret (0 = open), with the
 *  scale note it is (spelled) or null. With a chord (from theory.js, in this
 *  key): its chord-scale (see horn.js `chordLayer`), chord tones marked with
 *  their function (R 3 5 7 …) and the chord root as tonic. */
export function fretboardView({ instrumentId, rootPc, modeId, scaleId = 'mode', chord = null }) {
  const inst = frettedById(instrumentId), mode = modeById(modeId);
  const key = spellKey(rootPc, mode);
  const keyTonic = { letter: key.letter, acc: key.acc, pc: key.pc };
  let sc, layer = null;
  if (chord) {
    layer = chordLayer(chord, key, key);
    const notes = layer.scale.map((n) => ({ ...n, name: noteName(n.letter, n.acc), semis: mod(n.pc - layer.root.pc, 12) }));
    sc = { scale: null, tonic: layer.root, notes, minor: mode.tonic !== 'I' };
  } else sc = spelledScale(rootPc, mode, scaleId);
  const strings = inst.strings.map((open, string) => ({
    open,
    cells: Array.from({ length: FRETS + 1 }, (_, fret) => {
      const midi = open + fret, pc = mod(midi, 12);
      const index = sc.notes.findIndex((n) => n.pc === pc);
      const note = index >= 0 ? sc.notes[index] : null;
      const tone = layer?.tones.find((t) => t.pc === pc) ?? null;
      return { string, fret, midi, index, note, tone, tonic: index === 0, blue: !!note?.blue };
    }),
  }));
  return { inst, mode, key, keyTonic, layer, scale: sc.scale, tonic: sc.tonic, notes: sc.notes, minor: sc.minor, strings };
}

/** Play scale: up from the lowest tonic on the instrument, two octaves when
 *  they fit on the neck (else one), and back down. Sounding MIDI numbers. */
export function scaleRun(view) {
  const { strings } = view.inst, low = strings[0];
  const start = low + mod(view.tonic.pc - low, 12);
  const octaves = start + 24 <= strings[strings.length - 1] + FRETS ? 2 : 1;
  const up = [];
  for (let o = 0; o < octaves; o++) for (const n of view.notes) up.push(start + 12 * o + n.semis);
  up.push(start + 12 * octaves);
  return [...up, ...up.slice(0, -1).reverse()];
}

// ---------------------------------------------------------------- alternates

/** Where a shape sits: 0 with open strings, else its lowest fret. */
const position = (v) => (v.frets.includes(0) ? 0 : Math.min(...v.frets.filter((f) => f > 0)));
/** Average fret of the sounding strings: how far up the neck the hand is. */
const centre = (v) => {
  const on = v.frets.filter((f) => f >= 0);
  return on.reduce((a, b) => a + b, 0) / on.length;
};

const altCache = new Map();
/** Up to six shapes for a chord at different places on the neck, low to
 *  high; `best` is the index of the easiest one (`voicing`). */
export function alternates(chord) {
  const k = `${chord.pc}:${chord.semis.join('.')}:${chord.quality}`;
  if (altCache.has(k)) return altCache.get(k);
  const best = voicing(chord);
  const list = [];
  for (const v of [best, ...voicings(chord)]) {
    if (!v || list.some((p) => Math.abs(position(p) - position(v)) < 2)) continue;
    list.push(v);
    if (list.length === 6) break;
  }
  list.sort((a, b) => position(a) - position(b));
  const out = { list, best: list.indexOf(best) };
  altCache.set(k, out);
  return out;
}

/** Voice-led choice for a progression: the first chord keeps its easiest
 *  shape; the rest are chosen together (dynamic programming) for the least
 *  hand movement, with ease as a small tie-breaker. Never moves more than
 *  the easiest shapes would. Returns { alts, picks }, picks[i] indexing
 *  alts[i].list. */
export function voiceLead(chords) {
  const alts = chords.map(alternates);
  const easy = alts.map((a) => a.best);
  if (alts.length < 2) return { alts, picks: easy };
  // cost[j], from[i][j]: cheapest way to end chord i on shape j.
  let cost = alts[0].list.map((_, j) => (j === alts[0].best ? 0 : Infinity));
  const from = [null];
  for (let i = 1; i < alts.length; i++) {
    const back = [], next = alts[i].list.map((v, j) => {
      let bc = Infinity, bk = 0;
      alts[i - 1].list.forEach((u, k) => {
        const c = cost[k] + Math.abs(centre(v) - centre(u)) + 0.15 * v.score;
        if (c < bc) { bc = c; bk = k; }
      });
      back[j] = bk;
      return bc;
    });
    from.push(back);
    cost = next;
  }
  const picks = [cost.indexOf(Math.min(...cost))];
  for (let i = alts.length - 1; i > 0; i--) picks.unshift(from[i][picks[0]]);
  const shapes = (ps) => ps.map((p, i) => alts[i].list[p]);
  return { alts, picks: movement(shapes(picks)) <= movement(shapes(easy)) ? picks : easy };
}

/** Hand movement over a progression: summed jumps of the hand position. */
export const movement = (shapes) => shapes.slice(1).reduce((sum, v, i) => sum + Math.abs(centre(v) - centre(shapes[i])), 0);

// ---------------------------------------------------------------- positions

/** Fingering patterns ("positions") for the scale, one per scale note on the
 *  low string, up the neck: two notes per string for pentatonics (the five
 *  boxes), three per string for seven-note scales. Blues uses the minor
 *  pentatonic boxes with the ♭5 one fret above each 4th. Position 1 starts
 *  on the tonic. Each: { n, cells: [{ string, fret, midi, blue }], lo, hi,
 *  range: per-string [lo, hi] }. */
export function scalePositions({ instrumentId, rootPc, modeId, scaleId = 'mode' }) {
  const inst = frettedById(instrumentId), mode = modeById(modeId);
  const sc = spelledScale(rootPc, mode, scaleId);
  const blues = sc.scale.id === 'blues';
  const base = blues ? spelledScale(rootPc, mode, 'minpent') : sc;
  const pcs = base.notes.map((n) => n.pc);
  const per = pcs.length <= 5 ? 2 : 3;
  const fourth = mod(base.tonic.pc + 5, 12);
  const next = (m) => { do m++; while (!pcs.includes(mod(m, 12))); return m; };
  const low = inst.strings[0];
  return pcs.map((pc, d) => {
    const build = (start) => {
      const cells = [];
      let m = start;
      inst.strings.forEach((open, string) => {
        for (let j = 0; j < per; j++) {
          cells.push({ string, fret: m - open, midi: m, blue: false });
          if (blues && mod(m, 12) === fourth) cells.push({ string, fret: m - open + 1, midi: m + 1, blue: true });
          m = next(m);
        }
      });
      return cells;
    };
    let cells = build(low + mod(pc - low, 12));
    if (cells.some((c) => c.fret < 0)) cells = build(low + mod(pc - low, 12) + 12);
    const range = inst.strings.map((_, s) => {
      const f = cells.filter((c) => c.string === s).map((c) => c.fret);
      return [Math.min(...f), Math.max(...f)];
    });
    const frets = cells.map((c) => c.fret);
    return { n: d + 1, cells, lo: Math.min(...frets), hi: Math.max(...frets), range };
  });
}

/** Where a shape sits on the neck (see `alternates`). */
export const shapePosition = (v) => (v.frets.includes(0) ? 0 : Math.min(...v.frets.filter((f) => f > 0)));

/** The easiest shape of a chord that stays inside a position (a fret either
 *  side allowed; open strings only near the nut), else the one nearest it. */
export function shapeInPosition(chord, pos) {
  const ok = (v) => v.frets.every((f) => f < 0 || (f === 0 ? pos.lo <= 2 : f >= pos.lo - 1 && f <= pos.hi + 1));
  const all = [voicing(chord), ...voicings(chord)].filter(Boolean);
  const inside = all.filter(ok).sort((a, b) => a.score - b.score);
  if (inside.length) return inside[0];
  const mid = (pos.lo + pos.hi) / 2;
  return [...alternates(chord).list].sort((a, b) => Math.abs(centre(a) - mid) - Math.abs(centre(b) - mid))[0];
}

// ---------------------------------------------------------------- staff + tab

/** Guitar and bass are written an octave above where they sound. */
export const WRITTEN = 12;

/** Staff fields of a spelled note at a sounding MIDI number (written octave). */
const spell = (midi, n) => ({ letter: n.letter, acc: n.acc, octave: octaveOf(midi + WRITTEN, n.acc) });

/** A position's notes, low to high, as tab notes: { midi, string, fret,
 *  letter, acc, octave, blue, tonic }. `view` is the scale's fretboardView. */
export function positionTab(view, pos) {
  return pos.cells.map((c) => {
    const n = view.notes.find((x) => x.pc === mod(c.midi, 12));
    return { ...spell(c.midi, n), midi: c.midi, string: c.string, fret: c.fret, blue: c.blue, tonic: n.pc === view.tonic.pc };
  });
}

/** A guitar shape's notes, low string to high, spelled as chord tones. */
export function shapeTab(shape, layer) {
  return shape.frets.flatMap((fret, string) => {
    if (fret < 0) return [];
    const midi = TUNING[string] + fret;
    const t = layer.tones.find((x) => x.pc === mod(midi, 12));
    return [{ ...spell(midi, t), midi, string, fret, fn: t.fn, tonic: t.fn === 'R' }];
  });
}

/** The string and fret for a pitch nearest a given fret (null if off the neck). */
export function placeNote(midi, strings, near) {
  let best = null;
  strings.forEach((open, string) => {
    const fret = midi - open;
    if (fret < 0 || fret > FRETS) return;
    if (!best || Math.abs(fret - near) < Math.abs(best.fret - near)) best = { string, fret };
  });
  return best;
}

/** A chord on bass: its root low on the E or A string, then the other chord
 *  tones upward, each on the string nearest the root's fret. */
export function bassArpeggio(layer) {
  const { strings } = FRETTED[1];
  let string = 0, fret = mod(layer.root.pc - strings[0], 12);
  if (fret > 4) { string = 1; fret = mod(layer.root.pc - strings[1], 12); }
  const root = strings[string] + fret;
  const out = [{ ...spell(root, layer.root), midi: root, string, fret, fn: 'R', tonic: true }];
  let at = root;
  for (const t of layer.tones.slice(1)) {
    at += 1 + mod(t.pc - (at + 1), 12);
    const place = placeNote(at, strings, fret);
    if (place) out.push({ ...spell(at, t), midi: at, ...place, fn: t.fn, tonic: false });
  }
  return out;
}
