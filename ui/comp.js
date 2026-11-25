// Piano comping patterns — pure. A pattern is one 4/4 bar of hits; each
// hit plays part of the voicing:
//   all  every note            up   everything but the bass note
//   lh   the left hand         rh   the right hand
//   B    the bass note         F S T  the bass note + a 5th / 6th / ♭7 (boogie, stride)
//   A    one note of the voicing, low to high (`i`, wraps around): arpeggios
// at / dur in beats; vel 0–1.

const H = (at, dur, part, vel = 0.8, i = 0) => ({ at, dur, part, vel, i });
const eighths = (part, vel, from = 0, to = 4, dur = 0.5) => {
  const out = [];
  for (let t = from; t < to; t += 0.5) out.push(H(t, dur, part, t % 1 ? vel * 0.8 : vel));
  return out;
};

export const COMPS = [
  { id: 'block', name: 'Whole notes', tip: 'The voicing held for the whole bar: hear the harmony', hits: [H(0, 4, 'all', 0.85)] },
  { id: 'halves', name: 'Half notes', tip: 'Twice per bar', hits: [H(0, 2, 'all', 0.85), H(2, 2, 'all', 0.7)] },
  { id: 'ballad', name: 'Ballad', tip: 'Bass held, the chord on 1 and 3', hits: [H(0, 4, 'B', 0.9), H(0, 2, 'up', 0.7), H(2, 2, 'up', 0.6)] },
  { id: 'pop8', name: 'Pop eighths', tip: 'Bass on 1 and 3, the chord on every eighth', hits: [H(0, 2, 'B', 0.9), H(2, 2, 'B', 0.8), ...eighths('up', 0.7)] },
  { id: 'charleston', name: 'Charleston', swing: true, tip: 'Jazz comping: hits on 1 and the “and” of 2, bass on 1 and 3 (swung)',
    hits: [H(0, 2, 'B', 0.9), H(2, 2, 'F', 0.75), H(0, 1, 'up', 0.8), H(1.5, 0.5, 'up', 0.7)] },
  { id: 'anticip', name: 'Push on 4&', swing: true, tip: 'Jazz: the chord on 2 and pushed on the “and” of 4 (ringing over the bar line)',
    hits: [H(0, 2, 'B', 0.9), H(2, 2, 'F', 0.75), H(1, 0.6, 'up', 0.65), H(3.5, 0.5, 'up', 0.75)] },
  { id: 'bossa', name: 'Bossa nova', tip: 'Bass root–5th (dotted rhythm), the chord on 1, the “and” of 2 and 4',
    hits: [H(0, 1.5, 'B', 0.9), H(1.5, 0.5, 'F', 0.7), H(2, 1.5, 'F', 0.8), H(3.5, 0.5, 'B', 0.7),
      H(0, 1, 'up', 0.7), H(1.5, 1, 'up', 0.65), H(3, 0.5, 'up', 0.6)] },
  { id: 'stride', name: 'Stride', tip: 'Left hand jumps: bass on 1 and 3, the chord on 2 and 4',
    hits: [H(0, 0.9, 'B', 0.9), H(1, 0.8, 'up', 0.65), H(2, 0.9, 'F', 0.8), H(3, 0.8, 'up', 0.65)] },
  { id: 'boogie', name: 'Boogie', swing: true, tip: 'Blues left hand R–5–6–♭7 in eighths, chord stabs on the “ands” (swung)',
    hits: [H(0, 0.5, 'B', 0.9), H(0.5, 0.5, 'B', 0.7), H(1, 0.5, 'F', 0.85), H(1.5, 0.5, 'F', 0.7),
      H(2, 0.5, 'S', 0.85), H(2.5, 0.5, 'S', 0.7), H(3, 0.5, 'T', 0.85), H(3.5, 0.5, 'S', 0.7),
      H(1.5, 0.4, 'rh', 0.6), H(3.5, 0.4, 'rh', 0.6)] },
  { id: 'offbeat', name: 'Offbeat', tip: 'Short chords on every “and” (ska, reggae), bass on 1 and 3',
    hits: [H(0, 1, 'B', 0.9), H(2, 1, 'B', 0.8), ...[0.5, 1.5, 2.5, 3.5].map((t) => H(t, 0.3, 'up', 0.7))] },
  { id: 'alberti', name: 'Alberti', tip: 'Classical broken chord: low–high–middle–high in eighths',
    hits: [H(0, 4, 'B', 0.7), ...[0, 2, 1, 2, 0, 2, 1, 2].map((k, j) => H(j * 0.5, 0.5, 'A', j % 2 ? 0.55 : 0.7, k))] },
  { id: 'arpeggio', name: 'Arpeggio', tip: 'The voicing up and down in eighths, each note left ringing',
    hits: [0, 1, 2, 3, 4, 3, 2, 1].map((k, j) => H(j * 0.5, 4 - j * 0.5, 'A', j % 2 ? 0.55 : 0.7, k)) },
];
export const compById = (id) => COMPS.find((c) => c.id === id) ?? COMPS[0];

/** The pattern each style starts with ("Auto"). */
export const STYLE_COMP = {
  theory: 'block', pop: 'pop8', edm: 'pop8', kawaii: 'pop8', lofi: 'ballad', rock: 'pop8',
  ska: 'offbeat', skapunk: 'offbeat', blues: 'boogie', jazz: 'charleston', cinematic: 'arpeggio',
  synthwave: 'pop8', jpop: 'pop8', gospel: 'ballad', metal: 'halves', flamenco: 'arpeggio',
  adventure: 'arpeggio', vampirehunter: 'pop8', zelda: 'arpeggio', castlevania: 'pop8', doubledragon: 'pop8',
};
export const styleComp = (styleId) => compById(STYLE_COMP[styleId] ?? 'block');

/** The MIDI notes a hit plays from a voicing ({ notes: [{ midi, hand, bass }] }). */
export function partNotes(v, part, i = 0) {
  const all = v.notes.map((n) => n.midi).sort((a, b) => a - b);
  const bassN = v.notes.find((n) => n.bass)?.midi ?? all[0];
  switch (part) {
    case 'all': return all;
    case 'up': { const u = all.filter((m) => m !== bassN); return u.length ? u : all; }
    case 'lh': return v.notes.filter((n) => n.hand !== 'R').map((n) => n.midi).sort((a, b) => a - b);
    case 'rh': { const r = v.notes.filter((n) => n.hand === 'R').map((n) => n.midi); return r.length ? r.sort((a, b) => a - b) : all.filter((m) => m !== bassN); }
    case 'B': return [bassN];
    case 'F': return [bassN + 7];
    case 'S': return [bassN + 9];
    case 'T': return [bassN + 10];
    case 'A': { const u = all.filter((m) => m !== bassN); const xs = u.length ? u : all; return [xs[i % xs.length]]; }
    default: return all;
  }
}

/** One bar of a pattern on a voicing: { at, dur, notes, gain, spread: 0 }.
 *  Swing puts every off-beat eighth at 2/3 of the beat. */
export function compBar(pattern, v) {
  const time = (t) => (pattern.swing && Math.abs((t % 1) - 0.5) < 1e-9 ? Math.floor(t) + 2 / 3 : t);
  return pattern.hits.map((h) => {
    const at = time(h.at), end = time(h.at + h.dur);
    return { at, dur: Math.max(0.1, end - at), notes: partNotes(v, h.part, h.i), gain: h.vel, spread: 0, part: h.part };
  });
}

/** Events for a whole progression, one pass: each voicing repeats the bar
 *  for its length (beats[i]); a shorter length plays the start of the bar. */
export function compProgression(pattern, voicings, beats) {
  const out = [];
  let t = 0;
  voicings.forEach((v, chord) => {
    const len = beats[chord];
    for (let bar = 0; bar * 4 < len; bar++) {
      for (const e of compBar(pattern, v)) {
        const at = bar * 4 + e.at;
        if (at < len - 1e-9) out.push({ ...e, at: t + at, dur: Math.min(e.dur, len - at), chord });
      }
    }
    t += len;
  });
  return out;
}

/** Comp events as single MIDI notes (all together; velocity from the gain). */
export const compNotes = (events) => events.flatMap((e) => e.notes.map((midi) => ({
  midi, at: e.at, dur: Math.max(0.05, e.dur), vel: Math.round(35 + 75 * e.gain),
})));
