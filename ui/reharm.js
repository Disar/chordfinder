// Reharmonisation for the piano view — pure. Jazz substitutions applied to a
// progression (root chord first; it loops back to the root chord):
//   sec       secondary dominants: V7 of each chord, in the second half of the chord before
//   iiv       the same with its ii: ii7–V7 (iiø7–V7 before a minor chord)
//   tritone   tritone substitution: a dominant that falls a 5th becomes the 7th chord a tritone away
//   passing   passing diminished: a °7 a half step up between chords a whole step apart
//   backdoor  backdoor ii–V (iv7–♭VII7) into the major root chord
// Every item: { chord, len (in chord slots: 1, ½, ¼), from (original index), tag, why }.

import { mod, buildChord, QUALITIES } from './theory.js';

export const REHARMS = [
  { id: 'sec', name: 'Sec. dominants', tip: 'V7 of each chord, in the second half of the chord before it' },
  { id: 'iiv', name: 'ii–V', tip: 'ii7–V7 of each chord (iiø7–V7 before a minor chord), in the second half of the chord before it' },
  { id: 'tritone', name: 'Tritone subs', tip: 'A dominant that falls a 5th is replaced by the 7th chord a tritone away (G7 → D♭7)' },
  { id: 'passing', name: 'Passing °7', tip: 'Between chords a whole step apart, a diminished 7th a half step above the first' },
  { id: 'backdoor', name: 'Backdoor', tip: 'iv7–♭VII7 into the major root chord (in place of V, else before the loop back)' },
];

const NUMS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJ = [0, 2, 4, 5, 7, 9, 11];

/** A Roman-numeral token for a chord on letter-degree `deg`, `offset`
 *  semitones above the tonic ('b'/'#' as needed), or null if it would need
 *  a double accidental. */
export function tokenFor(deg, offset, { upper = true, mark = '', ext = '' } = {}) {
  const d = mod(deg, 7);
  const acc = mod(offset - MAJ[d] + 6, 12) - 6;
  if (Math.abs(acc) > 1) return null;
  const num = upper ? NUMS[d] : NUMS[d].toLowerCase();
  return (acc < 0 ? 'b' : acc > 0 ? '#' : '') + num + mark + ext;
}

const degOf = (c, key) => mod(c.letter - key.letter, 7);
const isMajorish = (c) => { const q = QUALITIES[c.quality]; return !q.minor && !q.nothird && !q.mark; };
const isMinorish = (c) => { const q = QUALITIES[c.quality]; return q.minor && !q.mark; };
const fallsFifth = (a, b) => mod(b.offset - a.offset, 12) === 5;
const isDominantOf = (a, b) => isMajorish(a) && fallsFifth(a, b) && ['maj', 'dom7', 'dom9', 'aug7'].includes(a.quality);

/** The token naming a chord as a target of a secondary chord ("vi", "bVI"). */
function targetNumeral(c, key) {
  if (c.token.includes('/')) return null;
  return tokenFor(degOf(c, key), c.offset, { upper: !QUALITIES[c.quality].minor });
}

function build(key, mode, token) {
  try { return buildChord(key, mode, token, { color: 'seventh' }); } catch { return null; }
}

/** Applies the chosen substitutions (a Set or array of REHARMS ids). */
export function reharmonize(chords, { key, mode, on = [] }) {
  const use = new Set(on);
  let items = chords.map((chord, i) => ({ chord, len: 1, from: i, tag: null, why: '' }));
  const next = (i) => items[(i + 1) % items.length].chord;

  // ii–V / secondary dominants: in the second half of the chord before each target.
  if (use.has('iiv') || use.has('sec')) {
    const out = [];
    items.forEach((it, i) => {
      out.push(it);
      const target = next(i);
      if (i === items.length - 1 && target !== chords[0]) return;
      const q = QUALITIES[target.quality];
      if (q.mark || q.nothird || isDominantOf(it.chord, target) || it.tag) return;
      const t = targetNumeral(target, key);
      if (!t) return;
      const home = target === chords[0];
      const vTok = home ? 'V7' : `V7/${t}`;
      const v = build(key, mode, vTok);
      if (!v) return;
      const ii = use.has('iiv') ? build(key, mode, home ? (q.minor ? 'iiø7' : 'ii7') : `ii${q.minor ? 'ø' : ''}7/${t}`) : null;
      if (ii && ii.pc === it.chord.pc && ii.quality === it.chord.quality) {
        // The chord before already is the ii: just add the V.
        out.push({ chord: v, len: it.len / 2, from: null, tag: 'sec', why: `V7 of ${target.name}` });
        it.len /= 2;
        return;
      }
      const share = it.len / 2;
      it.len = share;
      if (ii) {
        out.push({ chord: ii, len: share / 2, from: null, tag: 'iiv', why: `ii of ${target.name}` });
        out.push({ chord: v, len: share / 2, from: null, tag: 'iiv', why: `V7 of ${target.name}` });
      } else out.push({ chord: v, len: share, from: null, tag: 'sec', why: `V7 of ${target.name}` });
    });
    items = out;
  }

  // Backdoor: iv7–♭VII7 into a major root chord.
  if (use.has('backdoor') && isMajorish(chords[0])) {
    const last = items.at(-1);
    const iv = build(key, mode, 'iv7'), bVII = build(key, mode, 'bVII7');
    if (iv && bVII) {
      if (last.chord.offset === 7 && isMajorish(last.chord)) {
        items.splice(items.length - 1, 1,
          { chord: iv, len: last.len / 2, from: last.from, tag: 'backdoor', why: 'backdoor ii (iv7) in place of V' },
          { chord: bVII, len: last.len / 2, from: null, tag: 'backdoor', why: 'backdoor dominant ♭VII7' });
      } else if (last.chord.offset !== 10) {
        last.len /= 2;
        items.push({ chord: bVII, len: last.len, from: null, tag: 'backdoor', why: 'backdoor dominant ♭VII7 into the root' });
      }
    }
  }

  // Tritone subs: every dominant (also the ones just added) that falls a 5th.
  if (use.has('tritone')) {
    items = items.map((it, i) => {
      if (i === 0 && it.from === 0) return it; // the root chord stays
      const n = items[(i + 1) % items.length].chord;
      if (!isDominantOf(it.chord, n) && !(it.chord.quality === 'dom7' && fallsFifth(it.chord, n))) return it;
      const tok = tokenFor(degOf(it.chord, key) + 4, it.chord.offset + 6, { ext: '7' });
      const sub = tok && build(key, mode, tok);
      if (!sub) return it;
      return { ...it, chord: sub, tag: 'tritone', why: `tritone sub for ${it.chord.name}` };
    });
  }

  // Passing diminished between chords a whole step apart (rising).
  if (use.has('passing')) {
    const out = [];
    items.forEach((it, i) => {
      out.push(it);
      if (i === items.length - 1) return;
      const n = items[i + 1].chord;
      if (mod(n.offset - it.chord.offset, 12) !== 2 || it.len < 0.5) return;
      const tok = tokenFor(degOf(it.chord, key), it.chord.offset + 1, { upper: false, mark: '°', ext: '7' });
      const dim = tok && build(key, mode, tok);
      if (!dim) return;
      it.len /= 2;
      out.push({ chord: dim, len: it.len, from: null, tag: 'passing', why: `passing °7 from ${it.chord.name} to ${n.name}` });
    });
    items = out;
  }
  return items;
}

/** Beats for each item at `bars` bars per original chord, the loop padded
 *  to whole 4-chord phrases (like the other views' play-along). */
export function reharmBeats(items, bars = 1) {
  const slots = items.reduce((s, it) => s + it.len, 0);
  const beats = items.map((it) => it.len * 4 * bars);
  beats[beats.length - 1] += (Math.ceil(slots / 4 - 1e-9) * 4 - slots) * 4 * bars;
  return beats;
}
