// Strumming patterns for the guitar view — pure. A pattern is one 4/4 bar
// of 8 (eighths) or 16 (sixteenths) steps:
//   D  downstroke (low string to high)      U  upstroke (top strings, high to low)
//   x  muted "chuck" (a short percussive hit) -  no hit (the strum rings on)
//   1–6  one note of the shape, counted from the lowest sounding string
//        (fingerpicking; clamped to the strings the shape has)

export const STRUMS = [
  { id: 'quarters', name: 'Quarters', steps: 'D-D-D-D-', tip: 'One downstroke per beat: the first pattern to learn' },
  { id: 'folk', name: 'Folk', steps: 'D-DU-UDU', tip: 'Down, down-up, up-down-up: the classic campfire and pop pattern' },
  { id: 'ballad', name: 'Ballad', steps: 'D---D-DU', tip: 'Let beat 1 ring, then down on 3 and a down-up on 4' },
  { id: 'eighths', name: 'Driving eighths', steps: 'DDDDDDDD', tip: 'Steady downstrokes on every eighth (rock, punk, synthwave)' },
  { id: 'skank', name: 'Offbeat skank', steps: '-U-U-U-U', short: true, tip: 'Short, choked upstrokes on every “and” (ska, reggae)' },
  { id: 'shuffle', name: 'Shuffle', steps: 'DUDUDUDU', swing: true, tip: 'Swung down-ups: long-short, long-short (blues)' },
  { id: 'rumba', name: 'Rumba', steps: 'DUxUDUxU', tip: 'Down-up with a muted chuck on 2 and 4 (flamenco rumba)' },
  { id: 'funk', name: 'Funk sixteenths', steps: 'D-DUx-DU-UDUx-DU', tip: 'Busy sixteenths with chucks on the backbeat' },
  { id: 'gallop', name: 'Gallop', steps: 'D-DDD-DDD-DDD-DD', short: true, tip: 'Eighth and two sixteenths, palm-muted (metal)' },
  { id: 'picked', name: 'Fingerpicked', steps: '13243424', tip: 'One string at a time: bass, then the upper strings' },
];
export const strumById = (id) => STRUMS.find((s) => s.id === id) ?? STRUMS[0];

/** A user-made pattern ({ steps, swing, short }, saved in the UI state) as
 *  a pattern object. Bad input falls back to Quarters' steps. */
export function customStrum(c = {}) {
  const steps = cleanSteps(c.steps) ?? STRUMS[0].steps;
  return {
    id: 'custom', name: 'Custom', steps, swing: !!c.swing && steps.length === 8, short: !!c.short,
    tip: 'Your own pattern: click a step to change it, or type it',
  };
}

/** Typed steps → a valid pattern string (d/u any case, X, . or space = rest),
 *  or null unless it is 8 or 16 valid steps. */
export function cleanSteps(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[\s.]/g, '-').replace(/[du]/g, (c) => c.toUpperCase()).replace(/X/g, 'x');
  return /^[DUx\-1-6]+$/.test(s) && (s.length === 8 || s.length === 16) ? s : null;
}

const CYCLE = ['D', 'U', 'x', '-'];
/** The next step when a step is clicked: ↓ → ↑ → × → rest → ↓ (a pick → ↓). */
export const cycleStep = (ch, back = false) => {
  const i = CYCLE.indexOf(ch);
  if (i < 0) return 'D';
  return CYCLE[(i + (back ? CYCLE.length - 1 : 1)) % CYCLE.length];
};

/** Eighths ↔ sixteenths, keeping each hit on the same beat position. */
export const resizeSteps = (steps, n) => (n === steps.length ? steps
  : n === 16 ? [...steps].map((c) => `${c}-`).join('')
    : [...steps].filter((_, i) => i % 2 === 0).join(''));

/** The pattern each style starts with ("Auto"). */
export const STYLE_STRUM = {
  theory: 'quarters', pop: 'folk', edm: 'eighths', kawaii: 'folk', lofi: 'picked', rock: 'eighths',
  ska: 'skank', skapunk: 'skank', blues: 'shuffle', jazz: 'quarters', cinematic: 'picked',
  synthwave: 'eighths', jpop: 'folk', gospel: 'ballad', metal: 'gallop', flamenco: 'rumba',
  adventure: 'folk', vampirehunter: 'gallop', zelda: 'picked', castlevania: 'gallop', doubledragon: 'eighths',
};
export const styleStrum = (styleId) => strumById(STYLE_STRUM[styleId] ?? 'quarters');

/** Counting syllables under the steps: 1 & 2 & … or 1 e & a 2 e & a … */
export const counts = (pattern) => (pattern.steps.length === 16
  ? Array.from({ length: 16 }, (_, i) => [String(i / 4 + 1), 'e', '&', 'a'][i % 4])
  : Array.from({ length: 8 }, (_, i) => (i % 2 ? '&' : String(i / 2 + 1))));

const UP_STRINGS = 4; // an upstroke catches the top strings only

/** One bar of a pattern on a shape's notes (MIDI, low to high). Events:
 *  { step, at, dur (beats), notes (in the order they're struck), kind
 *  ('down' | 'up' | 'chuck' | 'pick'), gain (0–1) }. A hit rings until the
 *  next one (shorter for `short` patterns and chucks); swing puts every
 *  off-beat eighth at 2/3 of the beat. */
export function strumBar(pattern, notes) {
  const n = pattern.steps.length, size = 4 / n;
  const time = (i) => (pattern.swing && n === 8 && i % 2 ? Math.floor(i / 2) + 2 / 3 : i * size);
  const hits = [...pattern.steps].map((ch, i) => ({ ch, i })).filter((h) => h.ch !== '-');
  return hits.map(({ ch, i }, k) => {
    const at = time(i), next = k + 1 < hits.length ? time(hits[k + 1].i) : 4;
    let dur = next - at;
    if (pattern.short) dur = Math.min(dur, 0.3);
    const base = { step: i, at, dur };
    if (ch === 'D') return { ...base, notes: [...notes], kind: 'down', gain: i % (n / 4) === 0 ? 1 : 0.8 };
    if (ch === 'U') return { ...base, notes: notes.slice(-UP_STRINGS).reverse(), kind: 'up', gain: 0.6 };
    if (ch === 'x') return { ...base, dur: Math.min(dur, 0.12), notes: [...notes], kind: 'chuck', gain: 0.35 };
    return { ...base, notes: [notes[Math.min(+ch, notes.length) - 1]], kind: 'pick', gain: +ch === 1 ? 0.9 : 0.7 };
  });
}

/** The events for a whole progression, one pass: each chord repeats the
 *  bar for its length (beats[i], a multiple of 4). `at` counts from the
 *  start; `chord` is the chord index. */
export function strumProgression(pattern, shapes, beats) {
  const out = [];
  let t = 0;
  shapes.forEach((notes, chord) => {
    for (let bar = 0; bar < beats[chord] / 4; bar++) {
      for (const e of strumBar(pattern, notes)) out.push({ ...e, at: t + bar * 4 + e.at, chord });
    }
    t += beats[chord];
  });
  return out;
}

/** Strum events as single notes, each string a little after the last
 *  (`spread` beats apart), for MIDI. Velocity follows the event's gain. */
export const strumNotes = (events, spread = 0.04) => events.flatMap((e) => e.notes.map((midi, j) => ({
  midi, at: e.at + j * spread, dur: Math.max(0.05, e.dur - j * spread), vel: Math.round(40 + 70 * e.gain),
})));
