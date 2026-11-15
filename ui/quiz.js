// Practice drills for the sax view: hearing scale degrees, hearing chord
// tones, and reading notes on the staff. Pure functions only (no DOM, no
// audio) so Node can test them; `rng` is injectable for tests.

import { mod, accidentalFor, spellKey, modeById, buildChord, diatonicChords } from './theory.js';
import { instrumentById, solfa, degreeLabel, hornView } from './horn.js';

export const DRILLS = [
  {
    id: 'degree', name: 'Which note?', blurb: 'Hear the key, then one note: which scale degree is it?',
    levels: [
      { name: 'Do Mi Sol', degrees: [0, 2, 4] },
      { name: 'Do to Sol', degrees: [0, 1, 2, 3, 4] },
      { name: 'Whole scale', degrees: [0, 1, 2, 3, 4, 5, 6] },
      { name: '+ chromatic', chromatic: true },
    ],
  },
  {
    id: 'tone', name: 'Which chord tone?', blurb: 'Hear a chord, then a note on top: root, 3rd, 5th or 7th?',
    levels: [{ name: 'Triads', color: 'triad' }, { name: '7th chords', color: 'seventh' }],
  },
  {
    id: 'read', name: 'Read the note', blurb: 'Name the note on the staff (written pitch) — or play it with the tuner on.',
    levels: [
      { name: 'On the staff', lo: 64, hi: 77 }, // written E4–F5
      { name: '+ low notes', lo: 58, hi: 77 },
      { name: 'Full range', lo: 58, hi: 90 },
    ],
  },
];
export const drillById = (id) => DRILLS.find((d) => d.id === id) ?? DRILLS[0];

// Spelling of each semitone above the tonic when it is not in the scale:
// [letter steps, alteration against the major scale] — ♭2 ♭3 ♯4 ♭6 ♭7.
const CHROMATIC = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

/** A note `semis` above the key's tonic, spelled from the scale if it is in
 *  it, else as the usual chromatic degree. */
export function spellDegree(key, semis) {
  const pc = mod(key.pc + semis, 12);
  const inScale = key.scale.find((n) => n.pc === pc);
  if (inScale) return { letter: inScale.letter, acc: inScale.acc, pc };
  const l = mod(key.letter + CHROMATIC[semis][0], 7);
  return { letter: l, acc: accidentalFor(l, pc), pc };
}

const isMinor = (mode) => mode.tonic !== 'I';
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/** Picks again (once) if it would repeat the previous answer. */
function fresh(gen, prev, rng) {
  const a = gen(rng);
  return prev != null && a.answer === prev ? gen(rng) : a;
}

/** The sounding (concert) MIDI of the key's tonic in the sax's comfortable
 *  middle: the first one at or above written D4. */
function middleTonic(key, inst) {
  const lo = 62 - inst.shift;
  return lo + mod(key.pc - lo, 12);
}

/** Builds a question. opts: { drill, level, rootPc, modeId, instrumentId,
 *  la (La-based minor), prev (previous answer), rng }.
 *  Returns { drill, answer, options: [{ id, label, sub }], …sounds/notes }. */
export function makeQuestion({ drill, level = 0, rootPc, modeId, instrumentId, la = false, prev = null, rng = Math.random }) {
  const mode = modeById(modeId), key = spellKey(rootPc, mode), inst = instrumentById(instrumentId);
  const d = drillById(drill), lv = d.levels[Math.min(level, d.levels.length - 1)];
  const tonic = { letter: key.letter, acc: key.acc, pc: key.pc };

  if (d.id === 'degree') {
    const semisList = lv.chromatic ? [...Array(12).keys()] : lv.degrees.map((i) => mode.steps[i]);
    const options = semisList.map((s) => {
      const n = spellDegree(key, s);
      return { id: s, label: solfa(n, tonic, { minor: isMinor(mode), la }), sub: degreeLabel(n, tonic) };
    });
    return fresh((r) => {
      const semis = pick(semisList, r);
      const t = middleTonic(key, inst);
      return { drill: d.id, answer: semis, options, target: t + semis, tonicMidi: t, cadence: cadence(key, mode),
        resolve: resolution(mode, semis, t) };
    }, prev, rng);
  }

  if (d.id === 'tone') {
    const chords = diatonicChords(key, mode, lv.color).filter((c) => c.quality !== 'aug' && c.quality !== 'augmaj7');
    const names = ['R', '3', '5', '7'];
    return fresh((r) => {
      const chord = pick(chords, r);
      const i = Math.floor(r() * chord.semis.length);
      // Chord root around concert F3–E4 (the synth voices chords near D4),
      // the note an octave above that.
      const root = 53 + mod(chord.pc - 53, 12);
      const options = chord.semis.map((_, k) => ({ id: names[k], label: { R: 'Root', 3: '3rd', 5: '5th', 7: '7th' }[names[k]], sub: '' }));
      return { drill: d.id, answer: names[i], options, chord, target: root + 12 + chord.semis[i] };
    }, prev, rng);
  }

  // Read: a note of the key in written pitch within the level's range.
  const h = hornView({ instrumentId, pitch: 'written', rootPc, modeId });
  const pool = h.cells.filter((c) => c.inScale && c.midi >= lv.lo && c.midi <= lv.hi);
  const options = h.notes.map((n) => ({ id: n.letter, letter: n.letter, acc: n.acc }));
  return fresh((r) => {
    const c = pick(pool, r);
    return { drill: d.id, answer: c.letter, options, note: c, written: c.midi, target: c.sound, key: h.key, keyTonic: h.keyTonic };
  }, prev, rng);
}

/** I–IV–V–I (i–iv–V–i in minor) to set the key before a note. */
export function cadence(key, mode) {
  const toks = isMinor(mode) ? ['i', 'iv', 'V', 'i'] : ['I', 'IV', 'V', 'I'];
  return toks.map((t) => buildChord(key, mode, t));
}

/** After the answer: the note walking stepwise through the scale to the
 *  nearest Do (down from Do–Fa, up from Sol–Ti). Concert MIDI. */
export function resolution(mode, semis, tonicMidi) {
  const steps = [...mode.steps, 12];
  const up = semis >= 7;
  const out = [tonicMidi + semis];
  if (up) for (const s of steps) { if (s > semis) out.push(tonicMidi + s); }
  else for (const s of [...steps].reverse()) { if (s < semis) out.push(tonicMidi + s); }
  return out;
}

export const isRight = (q, id) => q.answer === id;

// ---------------------------------------------------------------- scoring

export const emptyStats = () => ({ streak: 0, best: 0, total: 0, right: 0, recent: [] });

/** Stats after one answer; `recent` keeps the last 20 results. */
export function record(stats, correct) {
  const s = { ...emptyStats(), ...stats };
  const streak = correct ? s.streak + 1 : 0;
  return {
    streak, best: Math.max(s.best, streak), total: s.total + 1, right: s.right + (correct ? 1 : 0),
    recent: [...s.recent, correct].slice(-20),
  };
}

export const accuracy = (s) => (s?.recent?.length ? Math.round((100 * s.recent.filter(Boolean).length) / s.recent.length) : null);

/** Ready for the next level: 20 recent answers at 90% or better. */
export const ready = (s) => (s?.recent?.length ?? 0) >= 20 && accuracy(s) >= 90;
