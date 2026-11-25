// Piano practice drills — pure (no DOM, no audio; `rng` injectable):
//   play       play a named chord (MIDI keyboard, computer keys or clicks); any inversion
//   quality    hear a chord: which kind is it?
//   inversion  hear a chord: root position or which inversion?
//   read       see a voicing on the keys: which chord is it?

import { mod, diatonicChords } from './theory.js';
import { TEMPLATES } from './piano.js';

const TRIADS = ['', 'm', '°', '+'];
const SEVENTHS = ['maj7', '7', 'm7', 'ø7', '°7'];
const EXTENDED = ['maj9', '9', 'm9', '13', 'm11', '7♭9', '7♯9', '7alt', '6/9'];

export const PIANO_DRILLS = [
  { id: 'play', name: 'Play the chord', blurb: 'Play the chord on a MIDI keyboard, the computer keys or by clicking keys — any inversion, any octave.',
    levels: [{ name: 'Triads', set: TRIADS }, { name: '7th chords', set: SEVENTHS }, { name: 'Extended', set: EXTENDED, rootless: true }, { name: 'In the key', inKey: true }] },
  { id: 'quality', name: 'Hear the quality', blurb: 'A chord plays: which kind is it?',
    levels: [{ name: 'Triads', set: TRIADS }, { name: '7th chords', set: [...SEVENTHS, 'm(maj7)'] }, { name: 'Extended', set: ['maj9', '9', 'm9', '13', '7♭9', '7♯9', '7alt'] }] },
  { id: 'inversion', name: 'Hear the inversion', blurb: 'A chord plays: which chord tone is in the bass?',
    levels: [{ name: 'Triads', set: ['', 'm'] }, { name: '7th chords', set: ['maj7', '7', 'm7', 'ø7'] }] },
  { id: 'read', name: 'Name the voicing', blurb: 'Keys light up: which chord is it?',
    levels: [{ name: 'Triads', set: TRIADS }, { name: '7ths, inverted', set: SEVENTHS, invert: true }, { name: 'Rootless · drop 2', set: ['maj9', '9', 'm9', 'maj7', '7', 'm7'], jazz: true }] },
];
export const pianoDrillById = (id) => PIANO_DRILLS.find((d) => d.id === id) ?? PIANO_DRILLS[0];
const tpl = (sfx) => TEMPLATES.find((t) => t.sfx === sfx);
export const QUALITY_NAMES = {
  '': 'major', m: 'minor', '°': 'diminished', '+': 'augmented', maj7: 'major 7', 7: 'dominant 7', m7: 'minor 7',
  'ø7': 'half-diminished', '°7': 'diminished 7', 'm(maj7)': 'minor-major 7', maj9: 'major 9', 9: 'dominant 9',
  m9: 'minor 9', 13: 'dominant 13', m11: 'minor 11', '7♭9': '7♭9', '7♯9': '7♯9', '7alt': 'altered', '6/9': '6/9',
};
const INV = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'];
const INV_BASS = ['root', '3rd', '5th', '7th'];

const pickFrom = (xs, rng, not = null) => {
  const ok = xs.length > 1 && not !== null ? xs.filter((x) => x !== not) : xs;
  return ok[Math.floor(rng() * ok.length)];
};

/** Close position from a bass note: the template's tones stacked up. */
export function closeChord(rootPc, sfx, low = 48) {
  const t = tpl(sfx);
  const root = low + mod(rootPc - low, 12);
  return t.iv.map((iv) => root + iv).sort((a, b) => a - b);
}

/** Inversion k of close-position notes: the bottom k notes go up an octave. */
export const invert = (midis, k) => [...midis.slice(k), ...midis.slice(0, k).map((m) => m + 12)];

/** Rootless A (3-5-7-9; 3-13-7-9 for 13ths) or a drop 2 of a jazz chord. */
function jazzVoicing(rootPc, sfx, rng) {
  const t = tpl(sfx);
  const base = 50 + mod(rootPc - 50, 12);
  if (t.iv.includes(2) && rng() < 0.6) {
    const ivs = t.iv.filter((x) => x !== 0).map((x) => (x < 3 ? x + 12 : x)).sort((a, b) => a - b);
    return ivs.slice(0, 4).map((x) => base + x - (ivs[0] > 6 ? 12 : 0));
  }
  const four = t.iv.filter((x) => x !== 2).slice(0, 4).map((x) => base + 12 + x);
  four.sort((a, b) => a - b);
  const k = Math.floor(rng() * 4);
  const close = invert(four, k);
  close[close.length - 2] -= 12; // drop the second voice from the top
  return close.sort((a, b) => a - b);
}

/** A new question. key: theory.js spelled key (for 'In the key'); mode:
 *  the mode object; prev: the previous question (not repeated exactly). */
export function makePianoQuestion({ drill, level = 0, key, mode, rng = Math.random, prev = null }) {
  const d = pianoDrillById(drill), lv = d.levels[Math.min(level, d.levels.length - 1)];
  const rootPc = Math.floor(rng() * 12);
  if (d.id === 'play') {
    if (lv.inKey) {
      const chords = diatonicChords(key, mode, 'seventh');
      const i = pickFrom(chords.map((_, j) => j), rng, prev?.degree ?? null);
      const c = chords[i];
      const sfx = { maj7: 'maj7', dom7: '7', min7: 'm7', hdim7: 'ø7', dim7: '°7', mmaj7: 'm(maj7)', augmaj7: '+maj7', aug7: '+7' }[c.quality] ?? '';
      return { drill: d.id, degree: i, rootPc: c.pc, sfx, roman: c.roman, name: c.name, notes: c.notes, prompt: c.roman, key: true };
    }
    const sfx = pickFrom(lv.set, rng, prev?.sfx ?? null);
    return { drill: d.id, rootPc, sfx, rootless: !!lv.rootless, prompt: null };
  }
  if (d.id === 'quality') {
    const sfx = pickFrom(lv.set, rng, prev?.sfx ?? null);
    return { drill: d.id, rootPc, sfx, midis: closeChord(rootPc, sfx, 48), options: lv.set.map((s) => ({ id: s, label: QUALITY_NAMES[s] ?? s })), answer: sfx };
  }
  if (d.id === 'inversion') {
    const sfx = pickFrom(lv.set, rng);
    const size = tpl(sfx).iv.length;
    const k = Math.floor(rng() * size);
    const midis = invert(closeChord(rootPc, sfx, 48), k);
    return { drill: d.id, rootPc, sfx, inv: k, midis, options: INV.slice(0, size).map((label, i) => ({ id: i, label, sub: `${INV_BASS[i]} in the bass` })), answer: k };
  }
  // read: see the keys, name the chord (4 options: the chord and 3 others on the same root).
  const sfx = pickFrom(lv.set, rng, prev?.sfx ?? null);
  let midis = closeChord(rootPc, sfx, 55);
  if (lv.invert) midis = invert(midis, Math.floor(rng() * midis.length));
  if (lv.jazz) midis = jazzVoicing(rootPc, sfx, rng);
  const others = lv.set.filter((s) => s !== sfx);
  const opts = [sfx];
  while (opts.length < Math.min(4, lv.set.length)) {
    const o = others[Math.floor(rng() * others.length)];
    if (!opts.includes(o)) opts.push(o);
  }
  // Shuffle so the answer isn't always first.
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { drill: d.id, rootPc, sfx, midis, options: opts.map((s) => ({ id: s, sfx: s })), answer: sfx };
}

/** Whether held keys play the asked chord: every needed pitch class is
 *  there and nothing else (the 5th of a 7th chord may be left out; on the
 *  Extended level the root may be too). */
export function playedRight(q, midis) {
  const t = tpl(q.sfx);
  if (!t || midis.length < 2) return false;
  const held = new Set(midis.map((m) => mod(m - q.rootPc, 12)));
  const optional = new Set(t.opt ?? []);
  if (q.rootless && t.iv.length >= 4) optional.add(0);
  return [...held].every((x) => t.iv.includes(x)) && t.iv.every((x) => optional.has(x) || held.has(x));
}

/** The pitch classes of the asked chord (to show the answer). */
export const answerPcs = (q) => tpl(q.sfx).iv.map((x) => mod(q.rootPc + x, 12));
