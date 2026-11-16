// Practice drills for the guitar view — pure (injectable rng), like quiz.js.
//   find: a note name and a string → click where it is (frets 0–12)
//   name: a spot on the neck → pick its note name
// Scores reuse quiz.js (`record`, `accuracy`, `ready`).

import { mod, ROOT_LABELS } from './theory.js';
import { frettedById } from './guitar.js';

export const PRACTICE_FRETS = 12;
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

/** Levels shared by both drills. `low`: only the two lowest strings. */
export const FRET_LEVELS = [
  { name: 'Low strings', tip: 'Natural notes (no ♯/♭) on the two lowest strings', low: true, naturals: true },
  { name: 'All strings', tip: 'Natural notes on every string', low: false, naturals: true },
  { name: 'With ♯/♭', tip: 'Every note on every string', low: false, naturals: false },
];

export const FRET_DRILLS = [
  { id: 'find', name: 'Find the note', blurb: 'Click the spot on the string asked for (frets 0–12). Saying the note while you play it helps it stick.' },
  { id: 'name', name: 'Name the note', blurb: 'Which note is marked on the neck? Count up from the open string or from a note you know.' },
];
export const fretDrillById = (id) => FRET_DRILLS.find((d) => d.id === id) ?? FRET_DRILLS[0];

/** Name of a pitch class: a letter, or both spellings for black keys (C♯/D♭). */
export const pcName = (pc) => LETTER[pc] ?? ROOT_LABELS[pc];

/** Strings a level asks about (indexes, low string = 0). */
export const levelStrings = (instrumentId, level) => {
  const n = frettedById(instrumentId).strings.length;
  return Array.from({ length: FRET_LEVELS[level].low ? 2 : n }, (_, i) => i);
};

/** The frets (0–12) on a string where a pitch class sits. */
export const fretsOf = (open, pc) => [0, 12].map((o) => mod(pc - open, 12) + o).filter((f) => f <= PRACTICE_FRETS);

/** A new question, never the same as `prev`. find: { string, pc, answers:
 *  [frets] }; name: { string, fret, pc, options: [{ id, label }], answer }. */
export function makeFretQuestion({ drill, level = 0, instrumentId, prev = null, rng = Math.random }) {
  const lv = FRET_LEVELS[level] ?? FRET_LEVELS[0];
  const inst = frettedById(instrumentId);
  const strings = levelStrings(instrumentId, level);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const pcs = lv.naturals ? NATURALS : Array.from({ length: 12 }, (_, i) => i);
  for (let tries = 0; ; tries++) {
    const string = pick(strings), open = inst.strings[string];
    let q;
    if (drill === 'find') {
      const pc = pick(pcs);
      q = { drill, level, string, pc, answers: fretsOf(open, pc) };
    } else {
      const frets = Array.from({ length: PRACTICE_FRETS + 1 }, (_, f) => f).filter((f) => pcs.includes(mod(open + f, 12)));
      const fret = pick(frets), pc = mod(open + fret, 12);
      q = { drill: 'name', level, string, fret, pc, answer: String(pc),
        options: pcs.map((p) => ({ id: String(p), label: pcName(p) })) };
    }
    const same = prev && prev.drill === q.drill && prev.string === q.string && prev.pc === q.pc && prev.fret === q.fret;
    if (!same || tries > 20) return q;
  }
}

/** Whether a click (find) or a picked option id (name) answers it. */
export const isFretRight = (q, a) => (q.drill === 'find'
  ? a.string === q.string && q.answers.includes(a.fret)
  : String(a) === q.answer);

/** The open string nearest a heard pitch (MIDI + cents), and how far off it
 *  is in cents (+ sharp, − flat). */
export function nearestString(midi, cents, strings) {
  const v = midi + cents / 100;
  let best = 0;
  strings.forEach((s, i) => { if (Math.abs(v - s) < Math.abs(v - strings[best])) best = i; });
  return { string: best, open: strings[best], cents: Math.round((v - strings[best]) * 100) };
}
