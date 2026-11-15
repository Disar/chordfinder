// Staff notation for the sax view: clefs, key signatures, accidentals and
// pixel layout of note heads (no rhythm: whole-note heads only). Pure
// functions only (no DOM) so Node can test it; app.js draws the SVG.

import { mod, accidentalFor } from './theory.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Diatonic step of a spelled note: 7 per octave, C = 0. */
export const stepOf = (letter, octave) => octave * 7 + letter;

/** bottom: step of the bottom line. Sharp/flat positions are staff
 *  positions (0 = bottom line, 1 = first space …) in signature order. */
export const CLEFS = {
  treble: { id: 'treble', glyph: '𝄞', bottom: stepOf(2, 4), sharps: [8, 5, 9, 6, 3, 7, 4], flats: [4, 7, 3, 6, 2, 5, 1] },
  bass: { id: 'bass', glyph: '𝄢', bottom: stepOf(4, 2), sharps: [6, 3, 7, 4, 1, 5, 2], flats: [2, 5, 1, 4, 0, 3, -1] },
};

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** Accidental each letter carries in a signature of `count` sharps (+) or flats (-). */
export function signatureMap(count) {
  const map = Array(7).fill(0);
  const order = count > 0 ? SHARP_ORDER : FLAT_ORDER;
  for (let i = 0; i < Math.abs(count); i++) map[order[i]] = Math.sign(count);
  return map;
}

/** Sharps (+) or flats (-) in the major key on this spelled tonic; 0 if it
 *  would need double accidentals or more than 7. */
export function majorSignature(letter, pc) {
  const accs = MAJOR.map((s, d) => accidentalFor(mod(letter + d, 7), mod(pc + s, 12)));
  const sum = accs.reduce((a, b) => a + b, 0);
  return accs.every((a) => Math.abs(a) <= 1 && Math.sign(a) * Math.sign(sum) >= 0) ? sum : 0;
}

// Degree of the parent major scale each church mode starts on.
const PARENT = { ionian: 0, dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, aeolian: 5, locrian: 6, harmonic: 5, melodic: 5 };

/** Key signature for a tonic (spelled) in a mode: church modes take their
 *  parent major's signature (D Dorian: none); harmonic and melodic minor the
 *  natural minor's; Phrygian dominant its harmonic-minor parent's (E: A minor). */
export function keySignature(tonic, modeId) {
  if (modeId === 'phrygdom') return majorSignature(mod(tonic.letter + 5, 7), mod(tonic.pc + 8, 12));
  const d = PARENT[modeId] ?? 0;
  return majorSignature(mod(tonic.letter - d, 7), mod(tonic.pc - MAJOR[d], 12));
}

export const ACC_GLYPH = { '-2': '𝄫', '-1': '♭', 0: '♮', 1: '♯', 2: '𝄪' };

/** Which notes need a printed accidental: against the signature, carried to
 *  the end of the bar per letter and octave. Returns glyphs (or null). */
export function accidentals(bars, sig) {
  const base = signatureMap(sig);
  return bars.map((notes) => {
    const now = new Map();
    return notes.map((n) => {
      const k = stepOf(n.letter, n.octave);
      const cur = now.has(k) ? now.get(k) : base[n.letter];
      now.set(k, n.acc);
      return n.acc === cur ? null : ACC_GLYPH[n.acc];
    });
  });
}

// ---------------------------------------------------------------- layout

export const STAFF = { gap: 10, clefW: 38, sigW: 9, noteW: 38, accW: 11, barPad: 16, minBar: 74 };

/** Pixel geometry for one staff. bars: [{ label?, notes: [{letter, acc,
 *  octave, …}] }]; note fields are passed through. Returns lines, clef,
 *  signature glyphs, notes with x/y/ledgers/accidental, barlines, size. */
export function layoutStaff({ clef: clefId = 'treble', sig = 0, bars, labels = 0, noteW = STAFF.noteW, span = [0, 8], minWidth = 0 }) {
  const clef = CLEFS[clefId], half = STAFF.gap / 2;
  const pos = (n) => stepOf(n.letter, n.octave) - clef.bottom;
  const all = bars.flatMap((b) => b.notes.map(pos));
  // `span` reserves room for that range of positions even when no note
  // uses it, so the staff keeps its height as the notes change.
  const hi = Math.max(8, span[1], ...all), lo = Math.min(0, span[0], ...all);
  const top = 26 + (hi - 8) * half + 6; // room for chord symbols and high ledger lines
  const yOf = (p) => top + (8 - p) * half;
  const bottom = yOf(lo) + 8;

  const sigPos = sig > 0 ? clef.sharps : clef.flats;
  const sigGlyphs = Array.from({ length: Math.abs(sig) }, (_, i) => ({
    x: 8 + STAFF.clefW + i * STAFF.sigW, y: yOf(sigPos[i]), glyph: sig > 0 ? '♯' : '♭',
  }));
  const accs = accidentals(bars.map((b) => b.notes), sig);

  let x = 8 + STAFF.clefW + Math.abs(sig) * STAFF.sigW + 8;
  const notes = [], barlines = [], barBoxes = [];
  bars.forEach((b, bi) => {
    const x0 = x;
    x += STAFF.barPad;
    b.notes.forEach((n, ni) => {
      const acc = accs[bi][ni];
      if (acc) x += STAFF.accW;
      const p = pos(n), cx = x + 7;
      const ledgers = [];
      for (let l = -2; l >= p; l -= 2) ledgers.push(yOf(l));
      for (let l = 10; l <= p; l += 2) ledgers.push(yOf(l));
      notes.push({ ...n, bar: bi, x: cx, y: yOf(p), p, acc, accX: cx - 16, ledgers });
      x += noteW;
    });
    x = Math.max(x, x0 + STAFF.minBar);
    if (bi === bars.length - 1) x = Math.max(x, minWidth - 4); // last bar fills `minWidth`
    barBoxes.push({ x: x0, w: x - x0, label: b.label ?? null });
    barlines.push(x);
  });
  const width = x + 4;
  const textY = bottom + 10;
  return {
    clef, half, top, lines: [8, 6, 4, 2, 0].map(yOf) /* top line first */, yOf, sigGlyphs, notes, barlines, barBoxes,
    width, textY, height: textY + labels * 14 + 4,
  };
}
