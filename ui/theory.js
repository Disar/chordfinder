// Music theory engine: scales, correct note spelling, chord building, and the
// progression library. Pure functions only (no DOM) so Node can test it.
//
// Chords are written as Roman numerals relative to the MAJOR scale of the
// tonic (the common modal/pop convention): "♭VI" means the chord a minor sixth
// above the tonic in every mode. Case gives the triad (upper = major,
// lower = minor), "°" diminished, "+" augmented, "ø" half-diminished, and
// "X/Y" a secondary chord (e.g. "V/V").

import { GENRE_STYLES } from './styles.js';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = NATURAL;
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export const mod = (n, m) => ((n % m) + m) % m;

export function accidentalFor(letter, pc) {
  let a = mod(pc - NATURAL[letter], 12);
  if (a > 6) a -= 12;
  return a;
}

export function noteName(letter, acc) {
  return LETTERS[letter] + (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc));
}

// Spelling candidates per pitch class, [letter, accidental]; the first is
// the tie-break preference.
export const SPELLINGS = [
  [[0, 0]], [[1, -1], [0, 1]], [[1, 0]], [[2, -1], [1, 1]], [[2, 0]], [[3, 0]],
  [[3, 1], [4, -1]], [[4, 0]], [[5, -1], [4, 1]], [[5, 0]], [[6, -1], [5, 1]], [[6, 0]],
];

export const ROOT_LABELS = SPELLINGS.map((opts) => opts.map(([l, a]) => noteName(l, a)).join('/'));

export const MODES = [
  { id: 'ionian', name: 'Ionian', alias: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], tonic: 'I',
    feel: 'Bright, stable, resolved' },
  { id: 'dorian', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], tonic: 'i',
    feel: 'Soulful minor with a hopeful major 6th' },
  { id: 'phrygian', name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10], tonic: 'i',
    feel: 'Dark, Spanish, tense ♭2' },
  { id: 'lydian', name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11], tonic: 'I',
    feel: 'Dreamy, floating ♯4' },
  { id: 'mixolydian', name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10], tonic: 'I',
    feel: 'Bluesy major, rock swagger ♭7' },
  { id: 'aeolian', name: 'Aeolian', alias: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10], tonic: 'i',
    feel: 'Melancholic, introspective' },
  { id: 'locrian', name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10], tonic: 'i°',
    feel: 'Unstable, dissonant, eerie' },
  { id: 'harmonic', name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], tonic: 'i',
    feel: 'Dramatic, classical, exotic' },
  { id: 'melodic', name: 'Melodic minor', steps: [0, 2, 3, 5, 7, 9, 11], tonic: 'i',
    feel: 'Smooth, sophisticated jazz minor' },
  { id: 'phrygdom', name: 'Phrygian dominant', steps: [0, 1, 4, 5, 7, 8, 10], tonic: 'I',
    feel: 'Fiery, flamenco, Middle-Eastern' },
];
export const modeById = (id) => MODES.find((m) => m.id === id) ?? MODES[0];

// Interval table: [semitones, letter steps above the chord root].
const T = { maj: [[0, 0], [4, 2], [7, 4]], min: [[0, 0], [3, 2], [7, 4]], dim: [[0, 0], [3, 2], [6, 4]], aug: [[0, 0], [4, 2], [8, 4]] };
export const QUALITIES = {
  maj: { sfx: '', iv: T.maj, minor: false },
  min: { sfx: 'm', iv: T.min, minor: true },
  dim: { sfx: '°', iv: T.dim, minor: true, mark: '°' },
  aug: { sfx: '+', iv: T.aug, minor: false, mark: '+' },
  sus2: { sfx: 'sus2', iv: [[0, 0], [2, 1], [7, 4]], ext: 'sus2', nothird: true },
  sus4: { sfx: 'sus4', iv: [[0, 0], [5, 3], [7, 4]], ext: 'sus4', nothird: true },
  '7sus4': { sfx: '7sus4', iv: [[0, 0], [5, 3], [7, 4], [10, 6]], ext: '7sus4', nothird: true },
  power: { sfx: '5', iv: [[0, 0], [7, 4]], ext: '5', nothird: true },
  maj9: { sfx: 'maj9', iv: [...T.maj, [11, 6], [14, 1]], minor: false, ext: 'maj9' },
  dom9: { sfx: '9', iv: [...T.maj, [10, 6], [14, 1]], minor: false, ext: '9' },
  min9: { sfx: 'm9', iv: [...T.min, [10, 6], [14, 1]], minor: true, ext: '9' },
  dom7: { sfx: '7', iv: [...T.maj, [10, 6]], minor: false, ext: '7' },
  maj7: { sfx: 'maj7', iv: [...T.maj, [11, 6]], minor: false, ext: 'maj7' },
  min7: { sfx: 'm7', iv: [...T.min, [10, 6]], minor: true, ext: '7' },
  mmaj7: { sfx: 'm(maj7)', iv: [...T.min, [11, 6]], minor: true, ext: 'maj7' },
  hdim7: { sfx: 'ø7', iv: [...T.dim, [10, 6]], minor: true, mark: 'ø', ext: '7' },
  dim7: { sfx: '°7', iv: [...T.dim, [9, 6]], minor: true, mark: '°', ext: '7' },
  aug7: { sfx: '+7', iv: [...T.aug, [10, 6]], minor: false, mark: '+', ext: '7' },
  augmaj7: { sfx: '+maj7', iv: [...T.aug, [11, 6]], minor: false, mark: '+', ext: 'maj7' },
  maj6: { sfx: '6', iv: [...T.maj, [9, 5]], minor: false, ext: '6' },
  min6: { sfx: 'm6', iv: [...T.min, [9, 5]], minor: true, ext: '6' },
  add9: { sfx: 'add9', iv: [...T.maj, [14, 1]], minor: false, ext: 'add9' },
  madd9: { sfx: 'm(add9)', iv: [...T.min, [14, 1]], minor: true, ext: 'add9' },
};

// Ways to alter the root (tonic) chord.
export const MODIFIERS = [
  { id: 'triad', label: 'Triad' },
  { id: 'seventh', label: '7th' },
  { id: 'dom7', label: 'Dom 7' },
  { id: 'sus2', label: 'sus2' },
  { id: 'sus4', label: 'sus4' },
  { id: '6', label: '6' },
  { id: 'add9', label: 'add9' },
  { id: 'dim', label: 'dim' },
  { id: 'aug', label: 'aug' },
  { id: '5', label: 'Power 5' },
];

// ---------------------------------------------------------------- spelling

/** Picks the enharmonic spelling of the tonic that gives the scale the
 *  fewest accidentals (e.g. E♭ Dorian, not D♯ Dorian). */
export function spellKey(rootPc, mode) {
  let best = null;
  for (const [letter, acc] of SPELLINGS[mod(rootPc, 12)]) {
    const scale = mode.steps.map((step, d) => {
      const l = mod(letter + d, 7), pc = mod(rootPc + step, 12);
      const a = accidentalFor(l, pc);
      return { letter: l, acc: a, pc, name: noteName(l, a) };
    });
    const cost = scale.reduce((s, n) => s + Math.abs(n.acc) + (Math.abs(n.acc) > 1 ? 10 : 0), 0);
    if (!best || cost < best.cost) best = { letter, acc, pc: mod(rootPc, 12), name: noteName(letter, acc), scale, cost };
  }
  return best;
}

// ---------------------------------------------------------------- chords

const ROMAN = '(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)';
const TOKEN_RE = new RegExp(`^([b#]?)${ROMAN}(°|ø|\\+)?(maj7|maj9|7sus4|7|9|6|sus2|sus4|add9|5)?(?:/([b#]?)${ROMAN})?$`);

function numeral(acc, num) {
  const deg = NUMERALS.indexOf(num.toUpperCase());
  return { acc, num, deg, offset: MAJOR[deg] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0), upper: num === num.toUpperCase() };
}

export function parseToken(token) {
  const m = TOKEN_RE.exec(token);
  if (!m) throw new Error(`Bad chord token: ${token}`);
  const [, acc, num, mark = '', ext = '', tAcc, tNum] = m;
  const head = numeral(acc, num);
  const target = tNum ? numeral(tAcc, tNum) : null;
  const triad = mark === '°' || mark === 'ø' ? 'dim' : mark === '+' ? 'aug' : head.upper ? 'maj' : 'min';
  return {
    token, head, target, mark, ext, triad,
    deg: mod(head.deg + (target?.deg ?? 0), 7),
    offset: mod(head.offset + (target?.offset ?? 0), 12),
  };
}

function explicitQuality({ triad, mark, ext }) {
  switch (ext) {
    case '7':
      if (mark === 'ø') return 'hdim7';
      return { maj: 'dom7', min: 'min7', dim: 'dim7', aug: 'aug7' }[triad];
    case 'maj7': return { maj: 'maj7', min: 'mmaj7', aug: 'augmaj7', dim: 'hdim7' }[triad];
    case '6': return triad === 'min' || triad === 'dim' ? 'min6' : 'maj6';
    case 'sus2': case 'sus4': return ext;
    case 'add9': return triad === 'min' || triad === 'dim' ? 'madd9' : 'add9';
    case '9': return triad === 'min' || triad === 'dim' ? 'min9' : 'dom9';
    case 'maj9': return triad === 'min' ? 'min9' : 'maj9';
    case '7sus4': return '7sus4';
    case '5': return 'power';
  }
  return mark === 'ø' ? 'hdim7' : null;
}

// Borrowed chords take their 7th from the closest scale that contains them
// (♭VII in major comes from the parallel minor, so it is ♭VII7, not ♭VIImaj7).
const SOURCE_ORDER = ['aeolian', 'ionian', 'mixolydian', 'dorian', 'harmonic', 'melodic', 'phrygian', 'lydian', 'locrian'];

export function seventhFor(offset, triad, mode, secondary = false) {
  if (secondary) return { maj: 'dom7', min: 'min7', dim: 'dim7', aug: 'aug7' }[triad];
  const tones = T[triad].map(([s]) => mod(offset + s, 12));
  for (const sc of [mode, ...SOURCE_ORDER.filter((id) => id !== mode.id).map(modeById)]) {
    const set = new Set(sc.steps);
    if (!tones.every((t) => set.has(t))) continue;
    const has = (s) => set.has(mod(offset + s, 12));
    const pick = {
      maj: has(11) ? 'maj7' : has(10) ? 'dom7' : null,
      min: has(10) ? 'min7' : has(11) ? 'mmaj7' : null,
      dim: has(10) ? 'hdim7' : has(9) ? 'dim7' : null,
      aug: has(11) ? 'augmaj7' : has(10) ? 'aug7' : null,
    }[triad];
    if (pick) return pick;
  }
  return { maj: 'dom7', min: 'min7', dim: 'hdim7', aug: 'augmaj7' }[triad];
}

const ACC_SYM = { b: '♭', '#': '♯', '': '' };

function romanFor(p, quality) {
  const q = QUALITIES[quality];
  const minor = q.minor ?? !p.head.upper;
  const num = minor ? p.head.num.toLowerCase() : p.head.num.toUpperCase();
  let s = ACC_SYM[p.head.acc] + num + (q.mark ?? '') + (q.ext ?? '');
  if (p.target) s += '/' + ACC_SYM[p.target.acc] + p.target.num;
  return s;
}

/** Builds a fully spelled chord from a Roman-numeral token.
 *  opts.color: 'triad' | 'seventh'; opts.quality forces a quality. */
export function buildChord(key, mode, token, opts = {}) {
  const p = parseToken(token);
  const quality = opts.quality
    ?? explicitQuality(p)
    ?? (opts.color === 'seventh' ? seventhFor(p.offset, p.triad, mode, !!p.target) : p.triad);
  const letter = mod(key.letter + p.deg, 7);
  const pc = mod(key.pc + p.offset, 12);
  const acc = accidentalFor(letter, pc);
  const q = QUALITIES[quality];
  const notes = q.iv.map(([semi, step]) => {
    const l = mod(letter + step, 7);
    return noteName(l, accidentalFor(l, mod(pc + semi, 12)));
  });
  return {
    token, quality, offset: p.offset, pc, letter, acc,
    triad: p.triad,
    name: noteName(letter, acc) + q.sfx,
    notes,
    semis: q.iv.map(([s]) => s),
    roman: romanFor(p, quality),
    // Where a chord outside the mode comes from: 'secondary' for applied
    // dominants, else the parallel mode it is borrowed from (null = diatonic).
    source: p.target ? 'secondary'
      // Judge by the notes actually played: a power chord has no third.
      : q.iv.every(([s]) => mode.steps.includes(mod(p.offset + s, 12))) ? null
      : creditedSource(p.offset, p.triad, mode),
  };
}

// ---------------------------------------------------------------- borrowing
// Modal interchange: chords taken from a parallel mode (same tonic).

const isMinorTonic = (mode) => parseToken(mode.tonic).triad !== 'maj';
// Where musicians usually say a chord is borrowed from, most common first.
const BORROW_ORDER = {
  major: ['aeolian', 'mixolydian', 'dorian', 'phrygian', 'lydian', 'harmonic', 'melodic', 'ionian'],
  minor: ['ionian', 'dorian', 'harmonic', 'melodic', 'aeolian', 'phrygian', 'mixolydian', 'lydian'],
};
export const MODE_ABBR = {
  ionian: 'Ion', dorian: 'Dor', phrygian: 'Phryg', lydian: 'Lyd', mixolydian: 'Mixo',
  aeolian: 'Aeol', locrian: 'Locr', harmonic: 'Harm', melodic: 'Mel',
};

const inScale = (sc, offset, triad) => T[triad].every(([s]) => sc.steps.includes(mod(offset + s, 12)));

/** Parallel modes (Locrian excluded) that contain this triad, or [] if the
 *  current mode already does. */
export function borrowSources(offset, triad, mode) {
  if (inScale(mode, offset, triad)) return [];
  return BORROW_ORDER[isMinorTonic(mode) ? 'minor' : 'major']
    .filter((id) => id !== mode.id && inScale(modeById(id), offset, triad))
    .map(modeById);
}

// The commonly borrowed chords (keyed "offset:triad" above the tonic), their
// mood, and the parallel mode they are conventionally credited to. Only
// these are offered, so suggestions stay idiomatic.
const BORROWABLE = {
  major: {
    '5:min': ['Bittersweet, tender', 'aeolian'], // iv
    '8:maj': ['Cinematic, heroic', 'aeolian'], // ♭VI
    '10:maj': ['Bluesy rock swagger', 'mixolydian'], // ♭VII
    '3:maj': ['Bold, rock-tinged', 'aeolian'], // ♭III
    '7:min': ['Laid-back, mellow', 'mixolydian'], // v
    '2:dim': ['Shadowed, wistful', 'aeolian'], // ii°
    '1:maj': ['Dark Neapolitan drama', 'phrygian'], // ♭II
    '2:maj': ['Bright, dreamy lift', 'lydian'], // II
    '5:maj': ['Grounded, familiar', 'ionian'], // IV (into Lydian)
    '7:maj': ['Classic, decisive pull', 'ionian'], // V (into Mixolydian)
  },
  minor: {
    '5:maj': ['Soulful lift', 'dorian'], // IV
    '7:maj': ['Dramatic, decisive pull', 'harmonic'], // V
    '2:min': ['Smooth, softened', 'dorian'], // ii
    '1:maj': ['Dark Neapolitan drama', 'phrygian'], // ♭II
    '5:min': ['Somber, grounded', 'aeolian'], // iv (into Dorian/melodic)
    '2:dim': ['Shadowed, tense', 'aeolian'], // ii°
    '8:maj': ['Heavy, cinematic', 'aeolian'], // ♭VI
    '10:maj': ['Earthy, open', 'aeolian'], // ♭VII
    '3:maj': ['Warm, open', 'aeolian'], // ♭III
    '7:min': ['Folk-like, modal', 'aeolian'], // v
  },
};

/** The parallel mode a non-diatonic triad is usually said to come from. */
function creditedSource(offset, triad, mode) {
  const sources = borrowSources(offset, triad, mode);
  const credited = BORROWABLE[isMinorTonic(mode) ? 'minor' : 'major'][`${offset}:${triad}`]?.[1];
  return sources.find((s) => s.id === credited) ?? sources[0] ?? null;
}

/** Builds a Roman-numeral token for a triad on a scale degree. */
function triadToken(deg, offset, triad) {
  const diff = mod(offset - MAJOR[deg] + 6, 12) - 6;
  const num = triad === 'maj' || triad === 'aug' ? NUMERALS[deg] : NUMERALS[deg].toLowerCase();
  return (diff < 0 ? 'b' : diff > 0 ? '#' : '') + num + (triad === 'dim' ? '°' : triad === 'aug' ? '+' : '');
}

/** For each chord of the mode, the chords on the same degree in parallel
 *  modes. Each one becomes a branch that swaps it into the first library
 *  progression using that degree, so it keeps the same harmonic role. */
function borrowedTemplates(mode, lib) {
  const family = isMinorTonic(mode) ? 'minor' : 'major';
  const seen = new Set(lib.map((t) => t.chords.join(' ')));
  const out = [];
  const done = new Set();
  for (const t of lib) {
    t.chords.forEach((tok, k) => {
      const p = parseToken(tok);
      if (p.target || p.ext || p.deg === 0 || !inScale(mode, p.offset, p.triad)) return;
      for (const id of BORROW_ORDER[family]) {
        if (id === mode.id) continue;
        const src = modeById(id);
        const offset = src.steps[p.deg];
        const third = mod(src.steps[(p.deg + 2) % 7] - offset, 12);
        const fifth = mod(src.steps[(p.deg + 4) % 7] - offset, 12);
        const triad = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : fifth === 6 ? 'dim' : 'min';
        if (triad === 'aug' || (triad === 'dim' && p.deg !== 1)) continue;
        if (inScale(mode, offset, triad)) continue; // not actually borrowed
        const key = `${offset}:${triad}`;
        if (done.has(key) || !BORROWABLE[family][key]) continue;
        const borrowed = triadToken(p.deg, offset, triad);
        if (t.chords[k - 1] === borrowed || t.chords[k + 1] === borrowed) continue;
        const chords = [...t.chords.slice(0, k), borrowed, ...t.chords.slice(k + 1)];
        if (seen.has(chords.join(' '))) continue;
        done.add(key);
        seen.add(chords.join(' '));
        const [mood, credited] = BORROWABLE[family][key];
        const sources = borrowSources(offset, triad, mode);
        const from = sources.find((s) => s.id === credited) ?? sources[0];
        out.push({
          mood,
          name: `borrowed ${triadToken(p.deg, offset, triad).replace('b', '♭').replace('#', '♯')} from ${from.name}`,
          chords, end: t.end, borrowed: true, from: from.id,
        });
      }
    });
  }
  return out;
}

/** The tonic chord after the user's modifier is applied. */
export function tonicQuality(mode, modifier, color) {
  const base = parseToken(mode.tonic).triad;
  const seventh = () => seventhFor(0, base, mode);
  switch (modifier) {
    case 'seventh': return seventh();
    case 'dom7': return 'dom7';
    case 'sus2': case 'sus4': return modifier;
    case '6': return base === 'min' || base === 'dim' ? 'min6' : 'maj6';
    case 'add9': return base === 'min' || base === 'dim' ? 'madd9' : 'add9';
    case 'dim': return color === 'seventh' ? 'dim7' : 'dim';
    case 'aug': return color === 'seventh' ? 'augmaj7' : 'aug';
    case '5': return 'power';
    default: return color === 'seventh' ? seventh() : base;
  }
}

/** Chords built on each scale degree (for the scale overview). */
export function diatonicChords(key, mode, color) {
  return mode.steps.map((step, d) => {
    const third = mod(mode.steps[(d + 2) % 7] - step, 12);
    const fifth = mod(mode.steps[(d + 4) % 7] - step, 12);
    const triad = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : fifth === 6 ? 'dim' : 'min';
    const acc = step - MAJOR[d];
    let num = NUMERALS[d];
    if (triad === 'min' || triad === 'dim') num = num.toLowerCase();
    const token = (acc < 0 ? 'b' : acc > 0 ? '#' : '') + num + (triad === 'dim' ? '°' : triad === 'aug' ? '+' : '');
    return buildChord(key, mode, token, { color });
  });
}

// ---------------------------------------------------------------- library
// Each mode lists real-world progressions starting after the tonic. The
// first one is the generic "main line". end: 'resolve' returns to the root;
// 'open' finishes somewhere else on purpose (deceptive, half, Picardy...).

const R = 'resolve', O = 'open';
const p = (mood, name, chords, end = R) => ({ mood, name, chords, end });

export const LIBRARY = {
  ionian: [
    p('Warm, nostalgic', '50s doo-wop progression', ['vi', 'IV', 'V']),
    p('Bright, confident', 'Authentic cadence', ['IV', 'V']),
    p('Hopeful, unfinished', 'Deceptive cadence', ['IV', 'V', 'vi'], O),
    p('Bittersweet, tender', 'Borrowed minor iv', ['IV', 'iv']),
    p('Uplifting, anthemic', 'Pop axis', ['V', 'vi', 'IV']),
    p('Graceful, timeless', 'Canon progression', ['V', 'vi', 'iii', 'IV', 'I', 'IV', 'V']),
    p('Smooth, sophisticated', 'ii–V–I', ['ii', 'V']),
    p('Easy, swinging', 'Jazz turnaround', ['vi', 'ii', 'V']),
    p('Romantic, cascading', 'Circle of fifths', ['iii', 'vi', 'ii', 'V']),
    p('Questioning, poised', 'Half cadence', ['iii', 'IV', 'V'], O),
    p('Cheerful, Beatles-esque', 'Secondary dominant II', ['V/V', 'IV']),
    p('Wistful, haunting', 'Chromatic mediant', ['V/vi', 'IV', 'iv']),
    p('Heroic, triumphant', '♭VI–♭VII–I modal mixture', ['bVI', 'bVII']),
    p('Swaggering rock anthem', 'Mixolydian borrow', ['bVII', 'IV']),
  ],
  dorian: [
    p('Earthy, soulful', 'Modal rock', ['bIII', 'bVII', 'IV']),
    p('Warm, uplifting', 'The bright Dorian IV', ['bIII', 'IV']),
    p('Hazy, unresolved', 'Drifts to the minor v', ['bIII', 'IV', 'v'], O),
    p('Funky, hypnotic', 'i–IV Dorian vamp', ['IV']),
    p('Sunlit finish', 'Picardy-style major ending', ['IV', 'bVII', 'I'], O),
    p('Breezy, open-road', '♭VII–IV shuffle', ['bVII', 'IV']),
    p('Climbing, hopeful', 'Stepwise ascent', ['ii', 'bIII', 'IV']),
    p('Jazzy, resolved', 'Minor ii–V with borrowed V', ['ii', 'V']),
    p('Cool, smoky', 'Minor v to IV', ['v', 'IV']),
  ],
  phrygian: [
    p('Dark, exotic', 'Phrygian shuffle', ['bII', 'bIII', 'bII']),
    p('Epic, galloping', 'Metal ascent and fall', ['bII', 'bIII', 'iv', 'bIII', 'bII']),
    p('Mysterious, unresolved', 'Hangs on ♭vii', ['bII', 'bvii'], O),
    p('Brooding, tense', 'Half-step pull home', ['iv', 'bII']),
    p('Eerie, suspended', 'Stops on the diminished v', ['iv', 'v°'], O),
    p('Cinematic, ominous', '♭VI–♭II', ['bVI', 'bII']),
    p('Fiery, Spanish', 'Flamenco descent', ['bIII', 'bII']),
    p('Mournful, ancient', 'Modal descent', ['bvii', 'bVI', 'bII']),
  ],
  lydian: [
    p('Dreamy, floating', 'The Lydian II lift', ['II', 'iii', 'II']),
    p('Hopeful, bright', 'II–V–I', ['II', 'V']),
    p('Bittersweet wonder', 'Lands on vi', ['II', 'vi'], O),
    p('Shimmering, ethereal', 'vii–II', ['vii', 'II']),
    p('Wondrous, cinematic', 'Film-score Lydian', ['V', 'II']),
    p('Wistful, sunlit', 'vi–II', ['vi', 'II']),
    p('Glowing, weightless', 'iii–II', ['iii', 'II']),
    p('Tense lift', 'The raised 4th', ['#iv°', 'V']),
  ],
  mixolydian: [
    p('Swaggering rock anthem', '♭VII–IV–I', ['bVII', 'IV']),
    p('Celtic, rustic', 'Folk descent', ['bVII', 'v', 'IV']),
    p('Tender, unresolved', 'Ends on vi', ['bVII', 'vi'], O),
    p('Bluesy groove', 'IV–♭VII–I', ['IV', 'bVII']),
    p('Classic backbeat', 'Borrowed V', ['IV', 'V']),
    p('Easygoing, jam-band', 'v–IV', ['v', 'IV']),
    p('Bright, folky', 'ii–IV–♭VII', ['ii', 'IV', 'bVII']),
    p('Wistful pop-rock', 'vi–IV–♭VII', ['vi', 'IV', 'bVII']),
  ],
  aeolian: [
    p('Melancholic, epic', 'Minor axis', ['bVI', 'bIII', 'bVII']),
    p('Triumphant, cinematic', 'Aeolian cadence ♭VI–♭VII–i', ['bVI', 'bVII']),
    p('Bittersweet, uplifted', 'Ends on the relative major', ['bVI', 'bVII', 'bIII'], O),
    p('Driving, heroic', 'Rock minor vamp', ['bVII', 'bVI', 'bVII']),
    p('Spanish, dramatic', 'Andalusian cadence', ['bVII', 'bVI', 'V']),
    p('Somber, folk', 'Natural-minor cadence', ['iv', 'v']),
    p('Dramatic, classical', 'Borrowed major V', ['iv', 'V']),
    p('Hope at the end', 'Picardy third', ['iv', 'V', 'I'], O),
    p('Baroque, cascading', 'Circle of fifths', ['iv', 'bVII', 'bIII', 'bVI', 'ii°', 'V']),
    p('Tense, noir', 'Minor ii°–V–i', ['ii°', 'V']),
    p('Yearning rock ballad', '♭III–♭VII–iv', ['bIII', 'bVII', 'iv']),
  ],
  locrian: [
    p('Unstable, nightmarish', 'Locrian churn', ['bII', 'biii', 'bII']),
    p('Unhinged, unresolved', 'Tritone hang', ['bII', 'bV'], O),
    p('Sinister, dissonant', 'Tritone root ♭V', ['bV', 'bII']),
    p('Brooding, heavy', '♭VI–♭II', ['bVI', 'bII']),
    p('Murky, claustrophobic', '♭iii–♭II', ['biii', 'bII']),
    p('Cold, menacing', 'iv–♭II', ['iv', 'bII']),
    p('Desolate', 'Modal descent', ['bvii', 'bVI', 'bII']),
  ],
  harmonic: [
    p('Dramatic, classical', 'Full minor cadence', ['iv', 'V']),
    p('Tragic surprise', 'Deceptive cadence', ['iv', 'V', 'bVI'], O),
    p('Hopeful ending', 'Picardy third', ['iv', 'V', 'I'], O),
    p('Dark, operatic', '♭VI–V', ['bVI', 'V']),
    p('Gothic, yearning', '♭VI–ii°–V', ['bVI', 'ii°', 'V']),
    p('Noir, suspenseful', 'ii°–V–i', ['ii°', 'V']),
    p('Ominous', 'Leading-tone diminished', ['vii°7']),
    p('Mysterious, spy-thriller', 'Augmented ♭III', ['bIII+', 'iv', 'V']),
  ],
  melodic: [
    p('Sophisticated, modern', 'Jazz-minor ii–V', ['ii', 'V']),
    p('Hopeful, open', 'ii–IV–V', ['ii', 'IV', 'V']),
    p('Bright minor, soulful', 'Major IV lift', ['IV', 'V']),
    p('Cinematic twist', 'Deceptive cadence', ['IV', 'V', 'bVI'], O),
    p('Yearning, rising', 'IV–vii°', ['IV', 'vii°']),
    p('Mysterious, shimmering', 'Augmented ♭III', ['bIII+', 'IV']),
    p('Restless, chromatic', 'vi°–ii–V', ['vi°', 'ii', 'V']),
  ],
  phrygdom: [
    p('Fiery, flamenco', 'Andalusian cadence (Phrygian frame)', ['iv', 'bIII', 'bII']),
    p('Tense, Middle-Eastern', 'Half-step pull', ['bII']),
    p('Hypnotic, exotic', '♭II–♭vii–♭II', ['bII', 'bvii', 'bII']),
    p('Brooding, dark', 'iv–♭II', ['iv', 'bII']),
    p('Mournful, desert', '♭vii–♭II', ['bvii', 'bII']),
    p('Mysterious, ancient', 'Augmented ♭VI', ['bVI+', 'bII']),
    p('Eerie, suspended', 'Stops on the diminished v', ['iv', 'v°'], O),
  ],
};

/** Extra progressions unlocked by how the root chord is altered. */
function modifierTemplates(mode, modifier) {
  const major = parseToken(mode.tonic).triad === 'maj';
  const plain = mode.tonic;
  switch (modifier) {
    case 'sus2': case 'sus4':
      return [p('Tension melts', 'Suspension release', [plain], O)];
    case 'dom7':
      return [
        p('Bluesy, gritty', '12-bar blues skeleton', ['IV7', 'I7', 'V7', 'IV7']),
        p('Gospel, churchy', 'I7 pulls to IV', ['IV', '#iv°7']),
      ];
    case 'aug':
      return major
        ? [p('Theatrical, rising', 'Line cliché', ['I6', 'I7', 'IV'])]
        : [p('Uneasy, chromatic', 'Augmented tonic slides to ♭VI', ['bVI', 'iv', 'V'])];
    case 'dim':
      if (mode.tonic === 'i°') return [];
      return [p('Suspense dissolves', 'Common-tone diminished release', [plain], O)];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- cadences

/** Names the cadence a progression ends with, from its actual chords. */
export function describeCadence(tonic, chords, end) {
  const last = chords.at(-1), prev = chords.at(-2) ?? tonic;
  const isMajor = (c) => !QUALITIES[c.quality].minor && !QUALITIES[c.quality].nothird;
  const arrow = (a, b) => `${a.roman} → ${b.roman}`;
  if (end === 'resolve') {
    const via = arrow(last, tonic);
    switch (last.offset) {
      case 7: return isMajor(last) ? `Authentic cadence · ${via}` : `Modal cadence · ${via}`;
      case 11: return `Leading-tone cadence · ${via}`;
      case 5: return `${isMajor(last) ? 'Plagal' : 'Minor plagal'} cadence · ${via}`;
      case 6: return `Chromatic passing resolution · ${via}`;
      case 10: return `Backdoor / modal cadence · ${via}`;
      case 1: return `Phrygian cadence · ${via}`;
      case 2: return `Lydian cadence · ${via}`;
      case 8: return `Aeolian cadence · ${via}`;
      default: return `Modal resolution · ${via}`;
    }
  }
  if (last.offset === 0) {
    return isMajor(last) && QUALITIES[tonic.quality].minor
      ? `Picardy third · ends on ${last.roman}`
      : `Release · settles on plain ${last.roman}`;
  }
  if (prev.offset === 7 && isMajor(prev) && (last.offset === 9 || last.offset === 8)) {
    return `Deceptive cadence · ${arrow(prev, last)}`;
  }
  if (last.offset === 7) return `Half cadence · ends on ${last.roman}`;
  return `Open ending · rests on ${last.roman}`;
}

// ---------------------------------------------------------------- styles

/** The general music-theory set first, then the genre styles. */
export const STYLES = [
  { id: 'theory', name: 'Theory', blurb: 'Classic progressions from music theory, every mode',
    defaults: { color: 'triad', bpm: 96, length: 'phrase' }, library: LIBRARY },
  ...GENRE_STYLES,
];
export const styleById = (id) => STYLES.find((s) => s.id === id) ?? STYLES[0];
/** Modes a style has progressions for, in the mode list's order. */
export const styleModes = (style) => MODES.filter((m) => style.library[m.id]).map((m) => m.id);

// ---------------------------------------------------------------- assemble

/** Everything the UI needs for one key: the tonic chord and the list of
 *  progressions with spelled chords, mood labels, and cadence names. */
export function suggest({ rootPc, modeId, modifier = 'triad', color = 'triad', borrowed = false, styleId = 'theory' }) {
  const mode = modeById(modeId);
  const style = styleById(styleId);
  const key = spellKey(rootPc, mode);
  const tonic = buildChord(key, mode, mode.tonic, { quality: tonicQuality(mode, modifier, color) });
  // A style that skips this mode falls back to the general theory library.
  const lib = style.library[mode.id] ?? LIBRARY[mode.id];
  const extra = modifierTemplates(mode, modifier).map((t) => ({ ...t, special: true }));
  const borrow = borrowed ? borrowedTemplates(mode, lib) : [];
  const templates = [lib[0], ...extra, ...lib.slice(1), ...borrow].map((t, i) => {
    const chords = t.chords.map((tok) => buildChord(key, mode, tok, { color }));
    return { ...t, id: i, chords, cadence: describeCadence(tonic, chords, t.end) };
  });
  return { mode, style, key, tonic, templates, scale: diatonicChords(key, mode, color) };
}
