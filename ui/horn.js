// Wind-instrument (sax) view: transposition, playable range, scales laid out
// across that range, and note naming (letters, Dutch, fixed do, movable do).
// Pure functions only (no DOM) so Node can test it.
//
// "Written" pitch is what the player reads; "concert" (sounding) pitch is what
// a piano plays. The app's root picker is always concert pitch.

import { LETTERS, MODES, QUALITIES, mod, accidentalFor, noteName, spellKey, modeById } from './theory.js';

const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/** shift: semitones the written note sits ABOVE the sounding note.
 *  letters: the same interval in letter steps (keeps spelling correct). */
export const INSTRUMENTS = [
  { id: 'soprano', name: 'Soprano sax', key: 'B♭', shift: 2, letters: 1, interval: 'a major 2nd' },
  { id: 'alto', name: 'Alto sax', key: 'E♭', shift: 9, letters: 5, interval: 'a major 6th' },
  { id: 'tenor', name: 'Tenor sax', key: 'B♭', shift: 14, letters: 8, interval: 'an octave and a major 2nd' },
  { id: 'bari', name: 'Baritone sax', key: 'E♭', shift: 21, letters: 12, interval: 'an octave and a major 6th' },
];
export const instrumentById = (id) => INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[1];

/** Every sax shares one written range: low B♭3 to high F♯6 (no altissimo). */
export const SAX_RANGE = { low: 58, high: 90 };

/** Registers by WRITTEN pitch: the octave key comes in at middle D (D5),
 *  the palm keys at high D (D6). */
export const REGISTERS = [
  { id: 'low', name: 'Low', tip: 'Low register: no octave key', from: SAX_RANGE.low },
  { id: 'mid', name: 'Middle', tip: 'Middle register: octave key, from middle D', from: 74 },
  { id: 'high', name: 'High', tip: 'High register: palm keys, from high D', from: 86 },
];
export const registerOf = (written) => [...REGISTERS].reverse().find((r) => written >= r.from).id;

/** Scales other than the current mode. iv: [semitones, letter step, alt
 *  letter step?]; with an alternative the spelling with fewer accidentals
 *  wins (blues ♭5: G♭ in C, but A rather than B𝄫 in E♭). */
export const SCALES = [
  { id: 'mode', name: 'Mode' },
  { id: 'majpent', name: 'Major pentatonic', short: 'Major pent.', ref: 'ionian', minor: false,
    iv: [[0, 0], [2, 1], [4, 2], [7, 4], [9, 5]] },
  { id: 'minpent', name: 'Minor pentatonic', short: 'Minor pent.', ref: 'aeolian', minor: true,
    iv: [[0, 0], [3, 2], [5, 3], [7, 4], [10, 6]] },
  { id: 'blues', name: 'Blues', ref: 'aeolian', minor: true,
    iv: [[0, 0], [3, 2], [5, 3], [6, 4, 3], [7, 4], [10, 6]], blue: 6 },
];
export const scaleById = (id) => SCALES.find((s) => s.id === id) ?? SCALES[0];

const isMinor = (scale, mode) => (scale.id === 'mode' ? mode.tonic !== 'I' : scale.minor);

/** The scale on pitch class `pc`, spelled. The tonic spelling comes from the
 *  mode (or the scale's reference mode), so it has the fewest accidentals. */
export function spelledScale(pc, mode, scaleId) {
  const scale = scaleById(scaleId);
  const key = spellKey(pc, scale.id === 'mode' ? mode : modeById(scale.ref));
  const tonic = { letter: key.letter, acc: key.acc, pc: key.pc, name: key.name };
  const iv = scale.id === 'mode' ? mode.steps.map((s, d) => [s, d]) : scale.iv;
  const notes = iv.map(([semis, ...steps]) => {
    const p = mod(pc + semis, 12);
    const best = steps.map((st) => {
      const l = mod(tonic.letter + st, 7);
      return { letter: l, acc: accidentalFor(l, p) };
    }).sort((a, b) => Math.abs(a.acc) - Math.abs(b.acc))[0];
    return { ...best, pc: p, semis, name: noteName(best.letter, best.acc), blue: semis === scale.blue };
  });
  return { scale, tonic, notes, minor: isMinor(scale, mode) };
}

/** Spelling for notes outside the scale, following the key's sharps or flats. */
function chromatic(pc, notes) {
  const flats = notes.some((n) => n.acc < 0), sharps = notes.some((n) => n.acc > 0);
  const opts = { 1: [[1, -1], [0, 1]], 3: [[2, -1], [1, 1]], 6: [[4, -1], [3, 1]], 8: [[5, -1], [4, 1]], 10: [[6, -1], [5, 1]] }[pc];
  if (!opts) { const l = NATURAL.indexOf(pc); return { letter: l, acc: 0 }; }
  // No accidentals in the key (C major): C♯ E♭ F♯ A♭ B♭, the usual choices.
  const [flat, sharp] = opts;
  const [letter, acc] = flats ? flat : sharps ? sharp : pc === 1 || pc === 6 ? sharp : flat;
  return { letter, acc };
}

/** Scientific octave of a spelled note (B♯4 and C♭5 keep their letter's octave). */
export const octaveOf = (midi, acc) => Math.floor((midi - acc) / 12) - 1;

// ---------------------------------------------------------------- chords

/** Chord-tone label from [semitones, letter steps] above the root. */
function toneFn(semi, step) {
  return { 0: 'R', 1: semi >= 12 ? '9' : '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7' }[step];
}

/** A chord from theory.js (spelled in the concert key `ck`) re-spelled in
 *  `key` (the same key in another pitch), with its chord-scale: the notes
 *  of the key — or, for a borrowed chord, of the parallel mode it comes from
 *  (Fm7 in C major → C minor's notes, F Dorian) — with each chord tone
 *  replacing the note on the same letter. `changes` lists what differs from
 *  the key. Scale is rotated to start on the chord root. */
export function chordLayer(chord, ck, key) {
  const deg = mod(chord.letter - ck.letter, 7);
  const rl = mod(key.letter + deg, 7), rpc = mod(chord.pc + key.pc - ck.pc, 12);
  const q = QUALITIES[chord.quality];
  const tones = q.iv.map(([semi, step]) => {
    const l = mod(rl + step, 7), pc = mod(rpc + semi, 12);
    return { letter: l, acc: accidentalFor(l, pc), pc, fn: toneFn(semi, step), step };
  });
  // Guide tones: 3rd and 7th. A triad has no 7th (use the root); sus and
  // power chords have no 3rd (use the suspended note, else the 5th).
  const third = tones.find((t) => t.step === 2) ?? tones.find((t) => t.step === 3 || t.step === 1) ?? tones.find((t) => t.step === 4);
  const seventh = tones.find((t) => t.step === 6) ?? tones[0];
  for (const t of tones) t.guide = t === third || t === seventh;

  const borrowed = chord.source && chord.source !== 'secondary';
  const base = borrowed
    ? chord.source.steps.map((s, d) => {
      const l = mod(key.letter + d, 7), pc = mod(key.pc + s, 12);
      return { letter: l, acc: accidentalFor(l, pc), pc };
    })
    : key.scale;
  const start = base.findIndex((n) => n.letter === rl);
  const changes = [];
  const scale = [...base.slice(start), ...base.slice(0, start)].map((n) => {
    const out = tones.find((x) => x.letter === n.letter) ?? { letter: n.letter, acc: n.acc, pc: n.pc };
    const k = key.scale.find((x) => x.letter === n.letter);
    if (out.pc !== k.pc) changes.push({ from: k, to: out });
    return out;
  });
  const steps = scale.map((n) => mod(n.pc - rpc, 12));
  const scaleMode = MODES.find((m) => m.steps.every((s, i) => s === steps[i])) ?? null;
  const root = { letter: rl, acc: accidentalFor(rl, rpc), pc: rpc };
  return { root, sfx: q.sfx, tones, scale, scaleMode, changes, third, seventh };
}

/** Chord symbol in the given note-name style ('dutch' keeps letters, as on
 *  Dutch lead sheets). */
export const chordSymbol = (layer, style) =>
  formatNote(layer.root.letter, layer.root.acc, style === 'fixed' ? 'fixed' : 'letters') + layer.sfx;

/** A smooth line through each chord's guide tones (3rd or 7th, whichever is
 *  nearest the previous note), kept in the middle of the horn: written
 *  C4–E5, starting on the first chord's 3rd near A♭4. Returns one note per
 *  chord, in displayed pitch (`midi`) and sounding pitch (`sound`). */
export function guideLine(layers, inst, pitch = 'written') {
  const shown = pitch === 'written' ? inst.shift : 0;
  const lo = 60 - inst.shift + shown, hi = 76 - inst.shift + shown, mid = 68 - inst.shift + shown;
  const place = (pc) => lo + mod(pc - lo, 12);
  let prev = null;
  return layers.map((l, i) => {
    const opts = l.tones.filter((t) => t.guide).flatMap((t) => [place(t.pc), place(t.pc) + 12]
      .filter((m) => m <= hi).map((m) => ({ m, t })));
    let pick;
    if (i === 0) {
      // Nearest the middle; on a tie the upper note, which speaks better.
      pick = opts.filter((o) => o.t === l.third).sort((a, b) => Math.abs(a.m - mid) - Math.abs(b.m - mid) || b.m - a.m)[0] ?? opts[0];
    } else {
      pick = opts.sort((a, b) => Math.abs(a.m - prev) - Math.abs(b.m - prev) || (a.t === l.third ? -1 : 1))[0];
    }
    prev = pick.m;
    return { midi: pick.m, sound: pick.m - shown, letter: pick.t.letter, acc: pick.t.acc, pc: pick.t.pc, fn: pick.t.fn };
  });
}

// ---------------------------------------------------------------- view

/** Everything the sax view shows for one instrument, key and scale.
 *  pitch: 'written' | 'concert' — which pitch the cells are labelled in.
 *  chord: a concert chord from theory.js to show instead of the scale. */
export function hornView({ instrumentId, pitch = 'written', rootPc, modeId, scaleId = 'mode', chord = null }) {
  const inst = instrumentById(instrumentId), mode = modeById(modeId);
  const written = pitch === 'written';
  const shown = written ? inst.shift : 0, other = written ? 0 : inst.shift;
  const key = spellKey(mod(rootPc + shown, 12), mode), otherKey = spellKey(mod(rootPc + other, 12), mode);
  const keyTonic = { letter: key.letter, acc: key.acc, pc: key.pc };
  let disp, alt, layer = null;
  if (chord) {
    const ck = spellKey(rootPc, mode);
    layer = chordLayer(chord, ck, key);
    const altLayer = chordLayer(chord, ck, otherKey);
    disp = { tonic: layer.root, notes: layer.scale, scale: null, minor: mode.tonic !== 'I' };
    alt = { notes: altLayer.scale };
  } else {
    disp = spelledScale(mod(rootPc + shown, 12), mode, scaleId);
    alt = spelledScale(mod(rootPc + other, 12), mode, scaleId);
  }
  const low = SAX_RANGE.low - inst.shift + shown, high = SAX_RANGE.high - inst.shift + shown;
  const cells = [];
  for (let m = low; m <= high; m++) {
    const i = disp.notes.findIndex((n) => n.pc === mod(m, 12));
    const n = i >= 0 ? disp.notes[i] : chromatic(mod(m, 12), disp.notes);
    const om = m - shown + other;
    const o = i >= 0 ? alt.notes[i] : chromatic(mod(om, 12), alt.notes);
    cells.push({
      midi: m, sound: m - shown, pc: mod(m, 12), letter: n.letter, acc: n.acc, octave: octaveOf(m, n.acc),
      inScale: i >= 0, index: i, tonic: i === 0, blue: !!n.blue, fn: n.fn ?? null, guide: !!n.guide,
      register: registerOf(m - shown + inst.shift),
      other: { letter: o.letter, acc: o.acc, octave: octaveOf(om, o.acc) },
    });
  }
  return {
    inst, mode, pitch, layer, keyTonic,
    tonic: disp.tonic, scale: disp.scale, notes: disp.notes, minor: disp.minor,
    key, otherKey, cells,
  };
}

// ---------------------------------------------------------------- naming

const FIXED_DO = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const accSym = (acc) => (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc));

/** style: 'letters' (B♭), 'dutch' (Bes, Fis, Es, As) or 'fixed' (Si♭). */
export function formatNote(letter, acc, style = 'letters') {
  if (style === 'fixed') return FIXED_DO[letter] + accSym(acc);
  if (style !== 'dutch') return noteName(letter, acc);
  const base = LETTERS[letter];
  if (acc > 0) return base + 'is'.repeat(acc);
  if (acc < 0) return base + (base === 'E' || base === 'A' ? 's' + 'es'.repeat(-acc - 1) : 'es'.repeat(-acc));
  return base;
}

const DO_BASE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];
const LA_BASE = ['La', 'Ti', 'Do', 'Re', 'Mi', 'Fa', 'Sol'];
const RAISE = { Do: 'Di', Re: 'Ri', Fa: 'Fi', Sol: 'Si', La: 'Li' };
const LOWER = { Re: 'Ra', Mi: 'Me', Sol: 'Se', La: 'Le', Ti: 'Te' };
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];

/** How far a note is from the plain scale degree (-1 = lowered, +1 = raised). */
function alteration(note, tonic, ref) {
  const deg = mod(note.letter - tonic.letter, 7);
  let a = mod(note.pc - tonic.pc, 12) - ref[deg];
  if (a > 6) a -= 12;
  if (a < -6) a += 12;
  return { deg, a };
}

/** Movable-do syllable of a note in the key of `tonic` (Do = tonic).
 *  la: minor keys La-based (tonic = La) instead of Do-based (♭3 = Me). */
export function solfa(note, tonic, { minor = false, la = false } = {}) {
  const laBased = minor && la;
  const { deg, a } = alteration(note, tonic, laBased ? AEOLIAN : NATURAL);
  const base = (laBased ? LA_BASE : DO_BASE)[deg];
  if (a === 0) return base;
  if (a === 1 && RAISE[base]) return RAISE[base];
  if (a === -1 && LOWER[base]) return LOWER[base];
  return base + accSym(a);
}

/** Scale-degree number against the major scale: 1, 2, ♭3, ♯4, ♭7 … */
export function degreeLabel(note, tonic) {
  const { deg, a } = alteration(note, tonic, NATURAL);
  return accSym(a) + (deg + 1);
}
