// Piano view — pure. The keyboard with the scale or a chord's chord-scale,
// scale fingerings, extended chords (9 11 13, altered dominants), voicing
// styles for advanced players (shell, rootless, drop 2/3, quartal, upper
// structures …) with voice leading, chord fingerings and chord recognition.

import { mod, modeById, spellKey, accidentalFor, noteName, QUALITIES } from './theory.js';
import { spelledScale, chordLayer, octaveOf } from './horn.js';

// ---------------------------------------------------------------- keyboard

/** Keyboard sizes: lowest and highest MIDI note. */
export const PIANO_SIZES = [
  { id: 61, name: '61 keys', lo: 36, hi: 96 },
  { id: 76, name: '76 keys', lo: 28, hi: 103 },
  { id: 88, name: '88 keys', lo: 21, hi: 108 },
];
export const pianoSize = (id) => PIANO_SIZES.find((s) => s.id === +id) ?? PIANO_SIZES[0];
const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (midi) => BLACK.has(mod(midi, 12));

/** Every key from A0 to C8 with the scale note on it (spelled) or null.
 *  With a chord: its chord-scale (horn.js `chordLayer`), chord tones marked. */
export function keyboardView({ rootPc, modeId, scaleId = 'mode', chord = null }) {
  const mode = modeById(modeId);
  const key = spellKey(rootPc, mode);
  const keyTonic = { letter: key.letter, acc: key.acc, pc: key.pc };
  let sc, layer = null;
  if (chord) {
    layer = chordLayer(chord, key, key);
    const notes = layer.scale.map((n) => ({ ...n, name: noteName(n.letter, n.acc), semis: mod(n.pc - layer.root.pc, 12) }));
    sc = { scale: null, tonic: layer.root, notes, minor: mode.tonic !== 'I' };
  } else sc = spelledScale(rootPc, mode, scaleId);
  const keys = [];
  for (let midi = 21; midi <= 108; midi++) {
    const pc = mod(midi, 12);
    const index = sc.notes.findIndex((n) => n.pc === pc);
    const note = index >= 0 ? sc.notes[index] : null;
    keys.push({ midi, pc, black: BLACK.has(pc), index, note, tonic: index === 0, blue: !!note?.blue,
      tone: layer?.tones.find((t) => t.pc === pc) ?? null });
  }
  return { mode, key, keyTonic, layer, scale: sc.scale, tonic: sc.tonic, notes: sc.notes, minor: sc.minor, keys };
}

// ---------------------------------------------------------------- scale fingering

/** Fingering for a scale (notes from the tonic up, one octave), per hand.
 *  The thumb crosses under once or twice per octave: the hand plays groups
 *  of 2–4 notes, each starting (right hand, ascending) or ending (left hand,
 *  ascending) on the thumb. The thumbs go on white keys, preferably on the
 *  tonic and on the 4th (right hand) or 5th (left hand) degree, and right
 *  after a black key in the direction the thumb passes under. This gives the
 *  traditional fingerings of all major and harmonic minor scales (see
 *  tests/piano.test.js) and a consistent one for every other scale.
 *  Returns { cycle: finger per note, start, top } — `start` the first note's
 *  finger, `top` the octave's. */
export function scaleFingering(notes, hand = 'R') {
  const n = notes.length;
  const black = notes.map((x) => BLACK.has(mod(x.pc, 12)));
  const at = (i) => mod(i, n);
  let best = null;
  for (let t1 = 0; t1 < n; t1++) for (let g = 2; g <= 4; g++) {
    const t2 = at(t1 + g), g2 = n - g;
    if (g2 < 2 || g2 > 4 || (n <= 4)) continue;
    const thumbs = [t1, t2];
    let cost = 0;
    for (const t of thumbs) {
      if (black[t]) cost += 10;
      if (t === 0) cost -= 1;
      if (n === 7 && t === (hand === 'R' ? 3 : 4)) cost -= 0.8;
      if (hand === 'R' ? black[at(t - 1)] : black[at(t + 1)]) cost -= 0.5;
    }
    if (!best || cost < best.cost - 1e-9) best = { cost, thumbs };
  }
  const cycle = Array(n).fill(1);
  if (!best) {
    // Four notes or fewer: one position (1 2 3 4 / 4 3 2 1).
    notes.forEach((_, i) => { cycle[i] = hand === 'R' ? i + 1 : n - i; });
    return { cycle, start: cycle[0], top: hand === 'R' ? Math.min(5, n + 1) : 1 };
  }
  const [a, b] = best.thumbs;
  const groups = [[a, b], [b, a + n]];
  for (const [from, to] of groups) {
    const len = to > from ? to - from : to + n - from;
    for (let k = 0; k < len; k++) {
      // Right hand: 1 2 3 … from the thumb up; left hand: … 3 2 1 up to the thumb.
      if (hand === 'R') cycle[at(from + k)] = k + 1;
      else cycle[at(from + 1 + k)] = len - k;
    }
  }
  let start = cycle[0], top = cycle[0];
  if (hand === 'R') { if (top === 1) top = Math.min(5, cycle[n - 1] + 1); }
  else if (start === 1) {
    const next = best.thumbs.map((t) => (t === 0 ? n : t)).sort((x, y) => x - y)[0];
    start = Math.min(5, next + 1);
  }
  return { cycle, start, top };
}

/** Play scale on the piano: the right hand from the tonic near middle C,
 *  the left an octave lower, `octaves` up and back down. Each step:
 *  { rh, lh, rf, lf } (MIDI notes and fingers). */
export function scaleRun(view, octaves = 1) {
  const n = view.notes.length;
  const rh = scaleFingering(view.notes, 'R'), lh = scaleFingering(view.notes, 'L');
  const r0 = 60 + mod(view.tonic.pc - 60, 12), l0 = r0 - 12;
  const up = [];
  for (let i = 0; i <= n * octaves; i++) {
    const o = Math.floor(i / n), d = i % n;
    const semis = view.notes[d].semis + 12 * o;
    const first = i === 0, last = i === n * octaves;
    up.push({
      rh: r0 + semis, lh: l0 + semis, deg: d,
      rf: first ? rh.start : last ? rh.top : rh.cycle[d],
      lf: first ? lh.start : last ? lh.top : lh.cycle[d],
    });
  }
  return [...up, ...up.slice(0, -1).reverse()];
}

// ---------------------------------------------------------------- extended chords

export const EXTENSIONS = [
  { id: 'as', name: 'As written', tip: 'The chords as the progression has them' },
  { id: '7', name: '7ths', tip: 'Every chord gets its 7th from the chord-scale' },
  { id: '9', name: '9ths', tip: '7ths plus the 9th where it is not an avoid note' },
  { id: '13', name: '11 · 13', tip: '9ths plus the 11th and 13th where they are not avoid notes' },
];
const EXT_RANK = { as: 0, 7: 1, 9: 2, 13: 3 };

const DEG_OF_STEP = (step, semi) => [1, semi >= 12 ? 9 : 2, 3, 4, 5, 6, 7][step];
const NATURAL_SEMIS = { 9: 2, 11: 5, 13: 9 };

/** A tension's label: 9, ♭9, ♯11 … (against the major/perfect interval). */
function tensionLabel(deg, semis) {
  const d = mod(semis - NATURAL_SEMIS[deg] + 6, 12) - 6;
  return (d < 0 ? '♭'.repeat(-d) : '♯'.repeat(d)) + deg;
}

/** Chord tone label: R 3 ♭3 5 ♭5 ♯5 7 ♭7 6 2 4 … as on a lead sheet. */
function toneLabel(deg, semis) {
  if (deg === 1) return 'R';
  if (deg >= 9) return tensionLabel(deg, semis);
  const ref = { 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }[deg];
  const d = mod(semis - ref + 6, 12) - 6;
  return (d < 0 ? '♭'.repeat(-d) : '♯'.repeat(d)) + deg;
}

/** The chord's family from its 3rd, 5th and 7th. */
function familyOf(tones) {
  const get = (d) => tones.find((t) => t.deg === d);
  const third = get(3), fifth = get(5), sev = get(7);
  if (!third) return tones.some((t) => t.deg === 4 || t.deg === 2) ? 'sus' : 'power';
  if (third.semis === 4) return fifth?.semis === 8 ? 'aug' : sev?.semis === 10 ? 'dom' : 'maj';
  if (fifth?.semis === 6) return sev?.semis === 9 ? 'dim7' : sev?.semis === 10 ? 'hdim' : 'dim';
  return 'min';
}

/** A tension (semitones above the root) is an avoid note when it sits a
 *  half step above a chord tone — except ♭9 and ♭13 on dominants. */
function avoid(semis, tones, family) {
  if (family === 'dom' && (semis === 1 || semis === 8)) return false;
  return tones.some((t) => mod(semis - t.semis, 12) === 1);
}

/** Altered dominant tensions (super-Locrian over the root). */
const ALTERED = { b9: [1, 1], s9: [3, 1], s11: [6, 3], b13: [8, 5] };

/** A theory.js chord with extensions from its chord-scale. ext: 'as' | '7'
 *  | '9' | '13'. altered: dominants use the altered scale (♭9 / ♯9 ♭13, no
 *  5th) instead of the key's notes. Returns { root, family, tones: [{ pc,
 *  letter, acc, deg (1 3 5 7 9 11 13 …), semis, label, tension }], name }. */
export function colorChord(chord, key, { ext = 'as', altered = false } = {}) {
  const layer = chordLayer(chord, key, key);
  const root = layer.root;
  const make = (semi, step, tension = false) => {
    const letter = mod(root.letter + step, 7), pc = mod(root.pc + semi, 12);
    const deg = tension ? [1, 9, 3, 11, 5, 13, 7][step] : DEG_OF_STEP(step, semi);
    const semis = mod(semi, 12);
    return { pc, letter, acc: accidentalFor(letter, pc), deg, semis, label: toneLabel(deg, semis), tension };
  };
  const tones = QUALITIES[chord.quality].iv.map(([s, st]) => make(s, st));
  const rank = EXT_RANK[ext] ?? 0;
  let family = familyOf(tones);
  const scaleSemis = (step) => mod(layer.scale[step].pc - root.pc, 12);
  if (rank >= 1 && family !== 'power' && !tones.some((t) => t.deg === 7 || t.deg === 6)) {
    tones.push(make(scaleSemis(6), 6));
    family = familyOf(tones);
  }
  const has = (semis) => tones.some((t) => t.semis === semis);
  const add = (semis, step) => { if (!has(semis)) tones.push(make(semis, step, true)); };
  if (family === 'dom' && altered && rank >= 2) {
    if (rank >= 3) {
      // 7alt: 3, ♭7, ♯9, ♭13 over the root (the 5th gives way to the ♭13).
      const i = tones.findIndex((t) => t.deg === 5);
      if (i >= 0) tones.splice(i, 1);
      add(...ALTERED.s9); add(...ALTERED.b13);
    } else add(...ALTERED.b9);
  } else if (rank >= 2 && family !== 'power') {
    const chordTones = [...tones];
    const steps = rank >= 3 ? [1, 3, 5] : [1];
    for (const step of steps) {
      const semis = scaleSemis(step);
      if (has(semis) || avoid(semis, chordTones, family)) continue;
      if (family === 'sus' && step === 3) continue;
      add(semis, step);
    }
  }
  tones.sort((a, b) => a.semis + (a.tension ? 12 : 0) - (b.semis + (b.tension ? 12 : 0)));
  // The chord-scale as tones (the chord's own where they are), each other
  // note marked avoid or not; altered dominants use the altered scale.
  const chordTones = tones.filter((t) => !t.tension);
  const src = family === 'dom' && altered
    ? [[0, 0], [1, 1], [3, 1], [4, 2], [6, 3], [8, 5], [10, 6]]
    : layer.scale.map((n, step) => [mod(n.pc - root.pc, 12), step]);
  const scale = src.map(([s, step]) => tones.find((t) => t.semis === s)
    ?? { ...make(s, step, true), avoid: avoid(s, chordTones, family) });
  const rootName = noteName(root.letter, root.acc);
  return { root, family, tones, scale, altered: family === 'dom' && altered,
    name: rootName + extSuffix(chord, family, tones, altered), roman: chord.roman, chord };
}

/** Chord symbol suffix for a coloured chord (the original one when nothing was added). */
function extSuffix(chord, family, tones, altered) {
  const base = QUALITIES[chord.quality];
  const added = tones.length !== base.iv.length || tones.some((t) => t.tension);
  if (!added) return base.sfx;
  const t = new Set(tones.filter((x) => x.tension).map((x) => x.label));
  const sev = tones.find((x) => x.deg === 7), six = tones.some((x) => x.deg === 6);
  const nat = ['9', '11', '13'].filter((x) => t.has(x));
  const alts = ['♭9', '♯9', '♯11', '♭13'].filter((x) => t.has(x));
  const paren = (xs) => (xs.length === 1 ? xs[0] : xs.length ? `(${xs.join(',')})` : '');
  // Highest natural extension when the ones below it are there too.
  const top = (seventh) => (t.has('13') && t.has('9') ? '13' : t.has('11') && t.has('9') ? '11' : t.has('9') ? '9' : seventh);
  const extra = (name) => {
    const rest = [...nat.filter((x) => +x > +name.replace(/\D/g, '') || !/\d/.test(name)), ...alts];
    return rest.length ? (rest.length === 1 && alts.includes(rest[0]) ? rest[0] : `(${rest.join(',')})`) : '';
  };
  switch (family) {
    case 'maj': {
      if (sev) { const n = t.has('13') && t.has('9') ? 'maj13' : t.has('9') ? 'maj9' : 'maj7'; return n + extra(n.replace('maj', '')); }
      if (six) return (t.has('9') ? '6/9' : '6') + paren([...nat.filter((x) => x !== '9'), ...alts]);
      return t.has('9') ? `add9${paren([...nat.filter((x) => x !== '9'), ...alts])}` : paren(alts);
    }
    case 'dom': {
      if (altered && t.has('♯9') && t.has('♭13')) return '7alt';
      const n = top('7');
      return n + extra(n);
    }
    case 'min': {
      if (sev && sev.semis === 11) return t.has('9') ? 'm(maj9)' + extra('9') : 'm(maj7)' + extra('7');
      if (sev) { const n = top('7'); return 'm' + n + extra(n); }
      if (six) return 'm' + (t.has('9') ? '6/9' : '6') + paren([...nat.filter((x) => x !== '9'), ...alts]);
      return t.has('9') ? 'm(add9)' : 'm' + paren(alts);
    }
    case 'hdim': { const n = t.has('11') && t.has('9') ? '11' : t.has('9') ? '9' : '7'; return 'ø' + n + extra(n); }
    case 'dim7': return '°7' + paren([...nat, ...alts]);
    case 'dim': return '°' + paren([...nat, ...alts]);
    case 'aug': return (sev ? (sev.semis === 11 ? '+maj7' : '+7') : '+') + paren([...nat, ...alts]);
    case 'sus': {
      const s4 = tones.some((x) => x.deg === 4);
      if (sev) { const n = t.has('13') && t.has('9') ? '13' : t.has('9') ? '9' : '7'; return n + (s4 ? 'sus4' : 'sus2') + paren(alts); }
      return base.sfx + (t.has('9') ? '(add9)' : '');
    }
    default: return base.sfx;
  }
}

// ---------------------------------------------------------------- voicings

export const VOICINGS = [
  { id: 'close', name: 'Close', tip: 'Left hand: root in octaves; right hand: the chord in close position, nearest inversion' },
  { id: 'shell', name: 'Shell', tip: 'Left hand: root with 3rd and 7th (1-3-7), or root and 7th with the 3rd a 10th up (1-7-10)' },
  { id: 'rootless', name: 'Rootless A/B', tip: 'Left-hand jazz voicings without the root (3-5-7-9 / 7-9-3-5; 13 for the 5th on dominants) — the bass plays the root' },
  { id: 'drop2', name: 'Drop 2', tip: 'Four-note close voicing with the second voice from the top dropped an octave (into the left hand)' },
  { id: 'drop3', name: 'Drop 3', tip: 'Four-note close voicing with the third voice from the top dropped an octave' },
  { id: 'spread', name: 'Spread', tip: 'Left hand: root and 7th; right hand: 3rd and colours on top' },
  { id: 'quartal', name: 'Quartal', tip: 'Stacked perfect 4ths from the chord-scale (So What / McCoy Tyner sound) over the root' },
  { id: 'ust', name: 'Upper structure', tip: 'Left-hand shell (1-3-7) with a triad on top that adds the tensions' },
];
export const voicingById = (id) => VOICINGS.find((v) => v.id === id) ?? VOICINGS[0];
/** Voicings that imply colours: the chord gets at least this much extension. */
const MIN_EXT = { rootless: '9', quartal: '7', ust: '7', drop2: '7', drop3: '7', spread: '7', shell: '7' };
export const effectiveExt = (type, ext) => (EXT_RANK[MIN_EXT[type]] > (EXT_RANK[ext] ?? 0) ? MIN_EXT[type] : ext);

const BASS_LO = 40; // bass roots E2–D♯3
const above = (pc, from) => from + mod(pc - from, 12); // lowest MIDI ≥ from with this pc
const stackUp = (tones, from) => {
  const out = [];
  for (const t of tones) out.push(out.length ? above(t.pc, out.at(-1) + 1) : above(t.pc, from));
  return out;
};
const note = (t, midi, hand, bass = false) => ({ midi, pc: t.pc, letter: t.letter, acc: t.acc, octave: octaveOf(midi, t.acc), label: t.label, deg: t.deg, tension: t.tension, hand, bass });
const rotations = (xs) => xs.map((_, r) => [...xs.slice(r), ...xs.slice(0, r)]);
const PRIORITY = [3, 7, 6, 13, 9, 11, 4, 2, 5, 1];
const prio = (t) => { const i = PRIORITY.indexOf(t.deg); return i < 0 ? 99 : i; };
/** The n most important tones (3rd, 7th, colours, then 5th and root), low to high. */
const pick = (tones, n) => [...tones].sort((a, b) => prio(a) - prio(b)).slice(0, n).sort((a, b) => a.semis - b.semis);
const find = (tones, ...degs) => { for (const d of degs) { const t = tones.find((x) => x.deg === d); if (t) return t; } return null; };

/** Candidate voicings of a coloured chord (see colorChord) in one style. */
export function voicingsFor(cc, type) {
  const T = cc.tones, root = T.find((t) => t.deg === 1) ?? { ...T[0], deg: 1, label: 'R' };
  const bassMidi = above(root.pc, BASS_LO);
  const bass = note(root, bassMidi, 'L', true);
  const third = find(T, 3, 4, 2), seventh = find(T, 7, 6, 5);
  const out = [];
  const push = (notes, form = '') => out.push({ type, form, notes: notes.sort((a, b) => a.midi - b.midi) });
  const close = () => {
    let upper = T.length >= 4 ? T.filter((t) => t.deg !== 1) : T;
    if (upper.length > 4) upper = pick(upper, 4);
    for (const r of rotations(upper)) {
      const m = stackUp(r, 55);
      push([note(root, bassMidi - 12, 'L', true), note(root, bassMidi, 'L'), ...r.map((t, i) => note(t, m[i], 'R'))]);
    }
  };
  const tensions = T.filter((t) => t.tension);
  if (type !== 'close' && type !== 'rootless' && (!third || !seventh)) type = 'close';
  if ((type === 'drop2' || type === 'drop3') && !find(T, 7, 6)) type = 'close';
  switch (type) {
    case 'close': close(); break;
    case 'shell': {
      // 1-3-7 in the left hand; tensions (if any) in the right.
      const [a, b] = stackUp([third, seventh], bassMidi + 1);
      const rhA = stackUp(tensions, Math.max(60, b + 1));
      push([bass, note(third, a, 'L'), note(seventh, b, 'L'), ...tensions.map((t, i) => note(t, rhA[i], 'R'))], '1-3-7');
      // 1-7 in the left hand, the 3rd a 10th up starting the right hand.
      const s = above(seventh.pc, bassMidi + 1);
      const rh = stackUp([third, ...tensions], s + 1);
      push([bass, note(seventh, s, 'L'), ...[third, ...tensions].map((t, i) => note(t, rh[i], 'R'))], '1-7-10');
      break;
    }
    case 'rootless': {
      let four;
      if (cc.family === 'dim7') four = T.filter((t) => !t.tension).slice(0, 4);
      else {
        const five = cc.family === 'dom' ? find(T, 13, 5, 11) : find(T, 5, 13, 11);
        const nine = find(T, 9) ?? T.find((t) => t.tension && t.deg === 9) ?? root;
        four = [third, five, seventh, nine].filter(Boolean);
        four = four.filter((t, i) => four.findIndex((x) => x.pc === t.pc) === i);
      }
      // A: from the 3rd; B: from the 7th. Bottom note D3–C♯4.
      const forms = cc.family === 'dim7' ? rotations(four).map((r, i) => [r, `inv ${i}`])
        : [[four, 'A'], [[...four.slice(2), ...four.slice(0, 2)], 'B']];
      for (const [order, form] of forms) {
        const m = stackUp(order, 50);
        push([note(root, bassMidi - 12 >= 28 ? bassMidi - 12 : bassMidi, 'B', true), ...order.map((t, i) => note(t, m[i], 'L'))], form);
      }
      break;
    }
    case 'drop2': case 'drop3': {
      const nine = find(T, 9);
      let four = [find(T, 1), third, find(T, 13, 5), seventh];
      if (nine) four[0] = nine;
      four = four.filter(Boolean);
      four = [...four].sort((a, b) => a.semis - b.semis);
      const drop = type === 'drop2' ? 2 : 3;
      for (const r of rotations(four)) {
        // Close position under a top note in C5–A5, then drop a voice.
        const topT = r.at(-1);
        const m = [above(topT.pc, 70)];
        for (let i = r.length - 2; i >= 0; i--) m.unshift(m[0] - mod(m[0] - r[i].pc, 12) - (mod(m[0] - r[i].pc, 12) === 0 ? 12 : 0));
        const di = r.length - drop;
        const notes = r.map((t, i) => note(t, i === di ? m[i] - 12 : m[i], i === di ? 'L' : 'R'));
        push([note(root, bassMidi, 'L', true), ...notes], `top ${topT.label}`);
      }
      break;
    }
    case 'spread': {
      const lhTop = seventh;
      const rest = T.filter((t) => t !== root && t !== lhTop && t.deg !== 1);
      const rhT = [third, ...rest.filter((t) => t !== third)].filter(Boolean);
      const sm = above(lhTop.pc, bassMidi + 7);
      for (const r of rotations(rhT).slice(0, Math.min(3, rhT.length))) {
        const m = stackUp(r, Math.max(57, sm + 1));
        push([bass, note(lhTop, sm, 'L'), ...r.map((t, i) => note(t, m[i], 'R'))], `${r[0].label} at the bottom`);
      }
      break;
    }
    case 'quartal': {
      // Diatonic 4ths from the chord-scale: notes three letters apart, each a
      // perfect 4th (5 semitones); scored on the 3rd and 7th, no avoid notes.
      const scale = cc.scale;
      const stacks = [];
      for (let s = 0; s < scale.length; s++) {
        const st = [0, 3, 6, 9].map((k) => scale[(s + k) % scale.length]);
        let ok = true, semis = [0];
        for (let k = 1; k < 4; k++) {
          const step = mod(st[k].pc - st[k - 1].pc, 12);
          if (step !== 5) ok = false;
          semis.push(semis[k - 1] + step);
        }
        if (!ok) continue;
        const pcs = st.map((x) => x.pc);
        let score = 0;
        if (third && pcs.includes(third.pc)) score += 2;
        if (seventh && pcs.includes(seventh.pc)) score += 2;
        if (st.some((x) => x.avoid)) score -= 5;
        if (pcs.includes(root.pc)) score -= 0.5;
        // So What: a major 3rd on top when it is in the scale.
        const topPc = mod(st[3].pc + 4, 12);
        const so = scale.find((x) => x.pc === topPc && !x.avoid);
        stacks.push({ st: so ? [...st, so] : st, score });
      }
      stacks.sort((a, b) => b.score - a.score);
      if (!stacks.length || stacks[0].score < 2) { close(); break; }
      for (const { st } of stacks.slice(0, 2)) for (const from of [52, 59]) {
        const m = stackUp(st, from);
        if (m.at(-1) > 84) continue;
        push([bass, ...st.map((t, i) => note(t, m[i], 'R'))], st.length === 5 ? 'So What' : `4ths from ${st[0].label}`);
      }
      if (!out.length) close();
      break;
    }
    case 'ust': {
      const scale = cc.scale;
      const allowed = new Map(scale.filter((x) => !x.avoid).map((x) => [x.pc, x]));
      for (const t of T) allowed.set(t.pc, t);
      const opts = UST[cc.family] ?? [];
      const triads = [];
      for (const [iv, q] of opts) {
        const r = mod(root.pc + iv, 12);
        const pcs = [r, mod(r + (q === 'maj' ? 4 : 3), 12), mod(r + 7, 12)];
        if (!pcs.every((p) => allowed.has(p))) continue;
        const ts = pcs.map((p) => allowed.get(p));
        if (!ts.some((x) => x.tension || ![1, 3, 5, 7].includes(x.deg))) continue;
        triads.push({ ts, name: `${UST_NAME[iv]}${q === 'min' ? 'm' : ''}` });
      }
      if (!triads.length) { close(); break; }
      const [a, b] = stackUp([third, seventh], bassMidi + 1);
      for (const { ts, name } of triads.slice(0, 2)) for (const r of rotations(ts)) {
        const m = stackUp(r, Math.max(62, b + 1));
        // The triad carries the colours: tell the note its real function.
        push([bass, note(third, a, 'L'), note(seventh, b, 'L'), ...r.map((t, i) => note(t, m[i], 'R'))], `${name} triad`);
      }
      break;
    }
    default: close();
  }
  if (!out.length) close();
  const seen = new Set();
  return out.filter((v) => { const k = v.notes.map((n) => n.midi).join(','); return !seen.has(k) && seen.add(k); });
}

// Upper-structure triads per family: [semitones above the root, quality].
const UST = {
  dom: [[2, 'maj'], [9, 'maj'], [8, 'maj'], [6, 'maj'], [7, 'min'], [9, 'min']],
  maj: [[7, 'maj'], [2, 'maj'], [11, 'min'], [4, 'min']],
  min: [[10, 'maj'], [5, 'maj'], [2, 'min'], [3, 'maj']],
  hdim: [[8, 'maj'], [3, 'min'], [10, 'maj']],
  sus: [[10, 'maj'], [2, 'min']],
};
const UST_NAME = { 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 6: '♭V', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII' };

// ---------------------------------------------------------------- voice leading

const uppers = (v) => v.notes.filter((n) => !n.bass).map((n) => n.midi);
export const centre = (v) => { const u = uppers(v); return u.reduce((a, b) => a + b, 0) / u.length; };
const top = (v) => Math.max(...uppers(v));
/** How far the hands move from one voicing to the next. */
export function motion(u, v) {
  const a = uppers(u), b = uppers(v);
  const near = (x, ys) => Math.min(...ys.map((y) => Math.abs(x - y)));
  return (b.reduce((s, x) => s + near(x, a), 0) + a.reduce((s, y) => s + near(y, b), 0)) / 2 + 0.5 * Math.abs(top(v) - top(u));
}
const TARGET = { close: 64, shell: 50, rootless: 57, drop2: 68, drop3: 66, spread: 62, quartal: 62, ust: 62 };

const vlCache = new Map();
/** Voicings for a progression of coloured chords, chosen together (dynamic
 *  programming) so the hands move as little as possible and stay near the
 *  style's register. Returns { alts: [[voicing…] low to high], picks }. */
export function voiceLead(ccs, type) {
  const alts = ccs.map((cc) => {
    const k = `${type}:${cc.name}:${cc.tones.map((t) => t.pc).join('.')}`;
    if (!vlCache.has(k)) vlCache.set(k, voicingsFor(cc, type).sort((a, b) => centre(a) - centre(b)));
    return vlCache.get(k);
  });
  const target = TARGET[type] ?? 62;
  const reg = (v) => 0.25 * Math.abs(centre(v) - target);
  let cost = alts[0].map((v) => 2 * reg(v));
  const from = [null];
  for (let i = 1; i < alts.length; i++) {
    const back = [];
    cost = alts[i].map((v, j) => {
      let bc = Infinity, bk = 0;
      alts[i - 1].forEach((u, k) => {
        const c = cost[k] + motion(u, v) + reg(v);
        if (c < bc) { bc = c; bk = k; }
      });
      back[j] = bk;
      return bc;
    });
    from.push(back);
  }
  const picks = [cost.indexOf(Math.min(...cost))];
  for (let i = alts.length - 1; i > 0; i--) picks.unshift(from[i][picks[0]]);
  return { alts, picks };
}

/** MIDI notes of a voicing, low to high. */
export const voicingMidis = (v) => v.notes.map((n) => n.midi);

// ---------------------------------------------------------------- chord fingering

/** Fingers for one hand's chord notes (low to high). Triads: 1-3-5, first
 *  inversion 1-2-5, second 1-3-5 (left hand 5-3-1, 5-3-1, 5-2-1). */
export function chordFingers(midis, hand = 'R') {
  const n = midis.length;
  if (!n) return [];
  const gaps = midis.slice(1).map((m, i) => m - midis[i]);
  let rh;
  if (n === 1) return [hand === 'R' ? 1 : 5];
  if (n === 2) {
    const g = gaps[0];
    const f = g >= 7 ? 5 : g >= 5 ? 4 : g >= 3 ? 3 : 2;
    return hand === 'R' ? [1, f] : [f, 1];
  }
  if (n === 3) {
    if (hand === 'R') return [1, gaps[1] >= 5 ? 2 : 3, 5];
    return [5, gaps[0] >= 5 ? 2 : 3, 1];
  }
  if (n === 4) {
    if (hand === 'R') return gaps[2] >= 3 ? [1, 2, 3, 5] : [1, 2, 4, 5];
    return gaps[0] >= 3 ? [5, 3, 2, 1] : [5, 4, 2, 1];
  }
  rh = [1, 2, 3, 4, 5].slice(0, n);
  return hand === 'R' ? rh : [...rh].reverse();
}

/** Fingers for every note of a voicing (bass and left hand together). */
export function voicingFingers(v) {
  const out = new Map();
  for (const hand of ['L', 'R']) {
    const ns = v.notes.filter((n) => (hand === 'L' ? n.hand !== 'R' && n.hand !== 'B' : n.hand === 'R'));
    const fs = chordFingers(ns.map((n) => n.midi), hand);
    ns.forEach((n, i) => out.set(n.midi, fs[i]));
  }
  return out;
}

/** Widest stretch in one hand, in semitones (a 10th = 15–16). */
export const handSpan = (v, hand) => {
  const ms = v.notes.filter((n) => (hand === 'L' ? n.hand === 'L' : n.hand === 'R')).map((n) => n.midi);
  return ms.length ? Math.max(...ms) - Math.min(...ms) : 0;
};

// ---------------------------------------------------------------- recognition

/** Chord templates by intervals above the root; `opt` may be left out
 *  (the 5th of a 7th chord, the 9th of a 13th). */
export const TEMPLATES = [
  { sfx: '', iv: [0, 4, 7], q: 'maj' }, { sfx: 'm', iv: [0, 3, 7], q: 'min' },
  { sfx: '°', iv: [0, 3, 6], q: 'dim' }, { sfx: '+', iv: [0, 4, 8], q: 'aug' },
  { sfx: 'sus4', iv: [0, 5, 7] }, { sfx: 'sus2', iv: [0, 2, 7] }, { sfx: '5', iv: [0, 7] },
  { sfx: '6', iv: [0, 4, 7, 9], opt: [7] }, { sfx: 'm6', iv: [0, 3, 7, 9], opt: [7] },
  { sfx: '7', iv: [0, 4, 7, 10], opt: [7], q: 'dom7' }, { sfx: 'maj7', iv: [0, 4, 7, 11], opt: [7], q: 'maj7' },
  { sfx: 'm7', iv: [0, 3, 7, 10], opt: [7], q: 'min7' }, { sfx: 'm(maj7)', iv: [0, 3, 7, 11], opt: [7], q: 'mmaj7' },
  { sfx: 'ø7', iv: [0, 3, 6, 10], q: 'hdim7' }, { sfx: '°7', iv: [0, 3, 6, 9], q: 'dim7' },
  { sfx: '+7', iv: [0, 4, 8, 10] }, { sfx: '+maj7', iv: [0, 4, 8, 11] },
  { sfx: '7sus4', iv: [0, 5, 7, 10], opt: [7] },
  { sfx: 'add9', iv: [0, 2, 4, 7], opt: [7] }, { sfx: 'm(add9)', iv: [0, 2, 3, 7], opt: [7] },
  { sfx: '6/9', iv: [0, 2, 4, 7, 9], opt: [7] }, { sfx: 'm6/9', iv: [0, 2, 3, 7, 9], opt: [7] },
  { sfx: 'maj9', iv: [0, 2, 4, 7, 11], opt: [7] }, { sfx: '9', iv: [0, 2, 4, 7, 10], opt: [7] },
  { sfx: 'm9', iv: [0, 2, 3, 7, 10], opt: [7] }, { sfx: 'm11', iv: [0, 2, 3, 5, 7, 10], opt: [7, 2] },
  { sfx: 'maj7♯11', iv: [0, 4, 6, 7, 11], opt: [7] }, { sfx: 'maj9♯11', iv: [0, 2, 4, 6, 7, 11], opt: [7] },
  { sfx: '13', iv: [0, 2, 4, 7, 9, 10], opt: [7, 2] }, { sfx: 'maj13', iv: [0, 2, 4, 7, 9, 11], opt: [7, 2] },
  { sfx: 'm13', iv: [0, 2, 3, 5, 7, 9, 10], opt: [7, 2, 5] },
  { sfx: '7♭9', iv: [0, 1, 4, 7, 10], opt: [7] }, { sfx: '7♯9', iv: [0, 3, 4, 7, 10], opt: [7] },
  { sfx: '7♯11', iv: [0, 4, 6, 7, 10], opt: [7] }, { sfx: '9♯11', iv: [0, 2, 4, 6, 7, 10], opt: [7] },
  { sfx: '7♭13', iv: [0, 4, 7, 8, 10], opt: [7] }, { sfx: '7(♭9,♭13)', iv: [0, 1, 4, 8, 10] },
  { sfx: '7alt', iv: [0, 3, 4, 8, 10] }, { sfx: '13♭9', iv: [0, 1, 4, 7, 9, 10], opt: [7] },
  { sfx: '9sus4', iv: [0, 2, 5, 7, 10], opt: [7] }, { sfx: 'ø9', iv: [0, 2, 3, 6, 10] },
];

/** Names what is held: pitch classes (with the lowest note as the bass)
 *  against every template on every root. A root that isn't played (a
 *  rootless voicing) costs a little; an inverted bass gives a slash chord.
 *  Returns candidates best first: { rootPc, sfx, bassPc, rootless, cost }. */
export function identifyChord(midis) {
  const ms = [...new Set(midis)].sort((a, b) => a - b);
  if (ms.length < 2) return [];
  const pcs = new Set(ms.map((m) => mod(m, 12)));
  const bassPc = mod(ms[0], 12);
  const out = [];
  for (let r = 0; r < 12; r++) {
    const rel = new Set([...pcs].map((p) => mod(p - r, 12)));
    for (const t of TEMPLATES) {
      const need = t.iv.filter((x) => !(t.opt ?? []).includes(x));
      const rootless = !rel.has(0);
      if (rootless && (t.iv.length < 4 || pcs.size < 3)) continue;
      if (![...rel].every((x) => t.iv.includes(x))) continue;
      if (!need.every((x) => x === 0 && rootless ? true : rel.has(x))) continue;
      let cost = t.iv.length * 0.05 + (rootless ? 2.5 : 0) + (bassPc !== r && !rootless ? 0.6 : 0)
        + (t.iv.length - rel.size - (rootless ? 1 : 0)) * 0.4;
      out.push({ rootPc: r, sfx: t.sfx, q: t.q ?? null, bassPc, rootless, cost });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

/** A pitch class spelled in a key: the key's own note, else a chromatic
 *  spelling following the key's sharps or flats. */
export function spellIn(pc, key) {
  const own = key.scale.find((n) => n.pc === pc);
  if (own) return { letter: own.letter, acc: own.acc };
  const sharps = key.scale.some((n) => n.acc > 0);
  const opts = { 1: [[1, -1], [0, 1]], 3: [[2, -1], [1, 1]], 6: [[4, -1], [3, 1]], 8: [[5, -1], [4, 1]], 10: [[6, -1], [5, 1]] }[pc];
  if (!opts) { const l = [0, 2, 4, 5, 7, 9, 11].indexOf(pc); return { letter: l, acc: 0 }; }
  const [letter, acc] = sharps ? opts[1] : opts[0];
  return { letter, acc };
}

const NUMS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MINORISH = new Set(['m', 'm6', 'm7', 'm(maj7)', 'm(add9)', 'm6/9', 'm9', 'm11', 'm13', '°', '°7', 'ø7', 'ø9']);

/** A recognised chord read in a key: its name, Roman numeral (major-relative,
 *  like the rest of the app) and a rough function. */
export function readInKey(c, key) {
  const root = spellIn(c.rootPc, key), bass = spellIn(c.bassPc, key);
  const name = noteName(root.letter, root.acc) + c.sfx + (c.bassPc !== c.rootPc && !c.rootless ? `/${noteName(bass.letter, bass.acc)}` : '');
  const deg = mod(root.letter - key.letter, 7);
  const off = mod(c.rootPc - key.pc, 12);
  const a = mod(off - MAJ[deg] + 6, 12) - 6;
  const minor = MINORISH.has(c.sfx);
  const num = (a < 0 ? '♭'.repeat(-a) : '♯'.repeat(a)) + (minor ? NUMS[deg].toLowerCase() : NUMS[deg]);
  const sfx = c.sfx.replace(/^m(?!aj)/, '').replace(/^\(maj7\)/, '(maj7)');
  const inScale = [...new Set([0, ...TEMPLATES.find((t) => t.sfx === c.sfx).iv])].every((iv) => key.scale.some((n) => n.pc === mod(c.rootPc + iv, 12)));
  const fn = !inScale ? 'outside the key'
    : [0, 4, 9, 3, 8].includes(off) ? 'tonic' : [2, 5].includes(off) ? 'predominant' : [7, 11, 10].includes(off) ? 'dominant' : 'diatonic';
  return { name, roman: num + sfx, fn, inScale };
}
