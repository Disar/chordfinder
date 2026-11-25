import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, modeById, spellKey, buildChord, mod, suggest, STYLES } from '../ui/theory.js';
import {
  keyboardView, scaleFingering, scaleRun, colorChord, voicingsFor, voiceLead, VOICINGS, effectiveExt,
  chordFingers, identifyChord, readInKey, isBlack,
} from '../ui/piano.js';
import { reharmonize, reharmBeats } from '../ui/reharm.js';
import { COMPS, compBar, compProgression, compNotes, STYLE_COMP } from '../ui/comp.js';
import { layoutGrand } from '../ui/staff.js';
import { makePianoQuestion, playedRight, PIANO_DRILLS, closeChord, invert } from '../ui/pianoquiz.js';

const ion = modeById('ionian');
const fing = (pc, modeId, hand) => {
  const v = keyboardView({ rootPc: pc, modeId });
  const f = scaleFingering(v.notes, hand);
  return [f.start, ...f.cycle.slice(1), f.top].join('');
};

test('major scale fingerings match the traditional tables', () => {
  const R = { 0: '12312345', 7: '12312345', 2: '12312345', 9: '12312345', 4: '12312345', 11: '12312345',
    6: '23412312', 1: '23123412', 8: '34123123', 3: '31234123', 10: '41231234', 5: '12341234' };
  const L = { 0: '54321321', 7: '54321321', 2: '54321321', 9: '54321321', 4: '54321321', 11: '43214321',
    6: '43213214', 1: '32143213', 8: '32143213', 3: '32143213', 10: '32143213', 5: '54321321' };
  for (let pc = 0; pc < 12; pc++) {
    assert.equal(fing(pc, 'ionian', 'R'), R[pc], `RH pc ${pc}`);
    assert.equal(fing(pc, 'ionian', 'L'), L[pc], `LH pc ${pc}`);
  }
});

test('harmonic minor fingerings match the traditional tables', () => {
  const R = { 9: '12312345', 4: '12312345', 11: '12312345', 6: '34123123', 1: '34123123', 8: '34123123',
    3: '31234123', 5: '12341234', 0: '12312345', 7: '12312345', 2: '12312345' };
  const L = { 9: '54321321', 4: '54321321', 11: '43214321', 6: '43213214', 1: '32143213', 8: '32143213',
    3: '21432132', 10: '21321432', 5: '54321321', 0: '54321321', 7: '54321321', 2: '54321321' };
  for (const [pc, f] of Object.entries(R)) assert.equal(fing(+pc, 'harmonic', 'R'), f, `RH pc ${pc}`);
  for (const [pc, f] of Object.entries(L)) assert.equal(fing(+pc, 'harmonic', 'L'), f, `LH pc ${pc}`);
});

test('right-hand 4th finger rule (cs.miami.edu fingering chart)', () => {
  // C D E G A: RH 4 on the 7th note; the rest: RH 4 on B♭/A♯.
  for (let pc = 0; pc < 12; pc++) {
    const v = keyboardView({ rootPc: pc, modeId: 'ionian' });
    const f = scaleFingering(v.notes, 'R');
    const fours = v.notes.filter((_, i) => f.cycle[i] === 4).map((n) => n.pc);
    if ([0, 2, 4, 7, 9].includes(pc)) assert.deepEqual(fours, [v.notes[6].pc], `pc ${pc}`);
    else if (pc !== 11 && pc !== 5) assert.deepEqual(fours, [10], `pc ${pc}`);
  }
});

test('thumbs never land on black keys in any mode', () => {
  // (Pentatonics and blues can't always avoid it: G♭ major pentatonic is all black keys.)
  for (const m of MODES) for (let pc = 0; pc < 12; pc++) for (const scaleId of ['mode']) {
    const v = keyboardView({ rootPc: pc, modeId: m.id, scaleId });
    for (const hand of ['R', 'L']) {
      const f = scaleFingering(v.notes, hand);
      v.notes.forEach((n, i) => { if (f.cycle[i] === 1 && v.notes.length > 4) assert.ok(!isBlack(n.pc) || v.notes.filter((x) => !isBlack(x.pc)).length < 2, `${m.id} ${pc} ${scaleId} ${hand}`); });
      assert.ok(f.cycle.every((x) => x >= 1 && x <= 5));
    }
  }
});

test('scale run goes up and back with fingers on every note', () => {
  const v = keyboardView({ rootPc: 0, modeId: 'ionian' });
  const run = scaleRun(v, 2);
  assert.equal(run.length, 29);
  assert.equal(run[0].rh, 60);
  assert.equal(run[14].rh, 84);
  assert.equal(run[0].lh, 48);
  assert.equal(run[14].rf, 5);
  assert.equal(run[7].rf, 1); // the thumb passes under on the middle C
});

const C = spellKey(0, ion);
const cc = (tok, ext, opts = {}) => colorChord(buildChord(C, ion, tok), C, { ext, ...opts });

test('extensions come from the chord-scale and skip avoid notes', () => {
  assert.deepEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'].map((t) => cc(t, '13').name),
    ['Cmaj13', 'Dm13', 'Em7(11)', 'Fmaj13♯11', 'G13', 'Am11', 'Bø7(11,♭13)']);
  assert.deepEqual(['I', 'ii', 'V', 'vii°'].map((t) => cc(t, '9').name), ['Cmaj9', 'Dm9', 'G9', 'Bø7']);
  assert.equal(cc('V', '7').name, 'G7');
  assert.equal(cc('V', 'as').name, 'G');
  assert.equal(cc('V', '9', { altered: true }).name, 'G7♭9');
  const alt = cc('V', '13', { altered: true });
  assert.equal(alt.name, 'G7alt');
  assert.deepEqual(alt.tones.map((t) => t.label), ['R', '3', '♭7', '♯9', '♭13']);
  // G13: no 11 (a half step above the 3rd).
  assert.ok(!cc('V', '13').tones.some((t) => t.label === '11'));
});

test('every voicing style voices every chord of every library progression', () => {
  for (const style of STYLES.slice(0, 6)) for (const m of MODES) {
    if (!style.library[m.id]) continue;
    const s = suggest({ rootPc: 3, modeId: m.id, styleId: style.id, color: 'seventh' });
    const chords = [s.tonic, ...s.templates.flatMap((t) => t.chords)];
    for (const type of VOICINGS.map((v) => v.id)) for (const c of chords.slice(0, 12)) {
      const x = colorChord(c, s.key, { ext: effectiveExt(type, '9') });
      const vs = voicingsFor(x, type);
      assert.ok(vs.length, `${type} ${x.name}`);
      for (const v of vs) {
        const pcs = new Set(x.tones.map((t) => t.pc).concat(x.scale.map((t) => t.pc)));
        for (const n of v.notes) assert.ok(pcs.has(mod(n.midi, 12)), `${type} ${x.name}: ${n.midi}`);
        assert.ok(v.notes.every((n) => n.midi >= 21 && n.midi <= 108));
      }
    }
  }
});

test('rootless voicings: A from the 3rd, B from the 7th, no root above the bass', () => {
  const vs = voicingsFor(cc('ii', '9'), 'rootless');
  const forms = Object.fromEntries(vs.map((v) => [v.form, v.notes.filter((n) => !n.bass).map((n) => n.label)]));
  assert.deepEqual(forms.A, ['♭3', '5', '♭7', '9']);
  assert.deepEqual(forms.B, ['♭7', '9', '♭3', '5']);
  const g13 = voicingsFor(cc('V', '13'), 'rootless').find((v) => v.form === 'A');
  assert.deepEqual(g13.notes.filter((n) => !n.bass).map((n) => n.label), ['3', '13', '♭7', '9']);
});

test('voice-led rootless ii–V–I alternates A and B forms', () => {
  const chords = ['ii', 'V', 'I'].map((t) => cc(t, '9'));
  const { alts, picks } = voiceLead(chords, 'rootless');
  const v = picks.map((p, i) => alts[i][p]);
  assert.deepEqual(v.map((x) => x.form), ['A', 'B', 'A']);
  const midis = v.map((x) => x.notes.filter((n) => !n.bass).map((n) => n.midi));
  assert.deepEqual(midis, [[53, 57, 60, 64], [53, 57, 59, 62], [52, 55, 59, 62]]);
});

test('drop 2 drops the second voice from the top an octave', () => {
  for (const v of voicingsFor(cc('I', '7'), 'drop2')) {
    const up = v.notes.filter((n) => !n.bass);
    const close = [...up.map((n) => n.midi)];
    const dropped = up.find((n) => n.hand === 'L');
    close[close.indexOf(dropped.midi)] += 12;
    close.sort((a, b) => a - b);
    assert.ok(close.at(-1) - close[0] < 12, `close span ${close}`);
    assert.equal(close.at(-2), dropped.midi + 12);
  }
});

test('chord fingering for triads and inversions', () => {
  assert.deepEqual(chordFingers([60, 64, 67], 'R'), [1, 3, 5]);
  assert.deepEqual(chordFingers([64, 67, 72], 'R'), [1, 2, 5]);
  assert.deepEqual(chordFingers([67, 72, 76], 'R'), [1, 3, 5]);
  assert.deepEqual(chordFingers([48, 52, 55], 'L'), [5, 3, 1]);
  assert.deepEqual(chordFingers([52, 55, 60], 'L'), [5, 3, 1]);
  assert.deepEqual(chordFingers([55, 60, 64], 'L'), [5, 2, 1]);
});

test('chord recognition names what is held', () => {
  const top = (ms) => { const c = identifyChord(ms)[0]; return `${c.rootPc}${c.sfx}${c.bassPc !== c.rootPc ? `/${c.bassPc}` : ''}`; };
  assert.equal(top([60, 64, 67]), '0');
  assert.equal(top([64, 67, 72]), '0/4');
  assert.equal(top([62, 65, 69, 72]), '2m7');
  assert.equal(top([55, 59, 62, 65]), '7' + '7');
  assert.equal(top([59, 62, 65, 69]), '11ø7');
  assert.equal(top([48, 52, 55, 59, 62]), '0maj9');
  assert.equal(top([43, 59, 63, 65, 70]), '77alt'); // G B E♭ F B♭: 3 ♭13 ♭7 ♯9
  assert.equal(top([38, 54, 57, 60, 64]), '29');
  const r = readInKey(identifyChord([62, 65, 69, 72])[0], C);
  assert.deepEqual([r.name, r.roman, r.fn], ['Dm7', 'ii7', 'predominant']);
});

test('reharmonisation', () => {
  const chords = ['I', 'vi', 'ii', 'V'].map((t) => buildChord(C, ion, t));
  const names = (on) => reharmonize(chords, { key: C, mode: ion, on }).map((x) => x.chord.name).join(' ');
  assert.equal(names(['tritone']), 'C Am Dm D♭7');
  assert.equal(names(['iiv']), 'C Bø7 E7 Am Eø7 A7 Dm Am7 D7 G');
  assert.equal(names(['sec']), 'C E7 Am A7 Dm D7 G');
  assert.equal(names(['backdoor']), 'C Am Dm Fm7 B♭7');
  const items = reharmonize(chords, { key: C, mode: ion, on: ['iiv'] });
  assert.equal(items.reduce((s, x) => s + x.len, 0), 4);
  assert.equal(reharmBeats(items).reduce((a, b) => a + b, 0), 16);
  const pass = reharmonize(['I', 'ii', 'iii'].map((t) => buildChord(C, ion, t)), { key: C, mode: ion, on: ['passing'] });
  assert.equal(pass.map((x) => x.chord.name).join(' '), 'C C♯°7 Dm D♯°7 Em');
});

test('comping patterns fill their bar and use the voicing', () => {
  const v = voicingsFor(cc('ii', '9'), 'rootless')[0];
  for (const p of COMPS) {
    const ev = compBar(p, v);
    assert.ok(ev.length, p.id);
    for (const e of ev) {
      assert.ok(e.at >= 0 && e.at < 4 && e.dur > 0, p.id);
      assert.ok(e.notes.length && e.notes.every((m) => m >= 21 && m <= 108), p.id);
    }
  }
  const evs = compProgression(COMPS.find((c) => c.id === 'pop8'), [v, v], [4, 2]);
  assert.ok(evs.every((e) => e.at < 6));
  assert.ok(compNotes(evs).length > 10);
  for (const s of STYLES) assert.ok(COMPS.some((c) => c.id === STYLE_COMP[s.id]), s.id);
});

test('grand staff puts both hands in shared columns', () => {
  const n = (letter, acc, octave) => ({ letter, acc, octave });
  const g = layoutGrand({ sig: 0, bars: [{ cols: [{ rh: [n(0, 0, 5)], lh: [n(0, 0, 3)] }, { rh: [n(1, 0, 5)], lh: [n(1, 0, 3)] }] }] });
  const [a, b, c, d] = g.notes;
  assert.equal(a.x, b.x);
  assert.equal(c.x, d.x);
  assert.ok(a.y < g.bass.lines[0] && b.y > g.treble.lines[4]);
  assert.equal(a.y, g.treble.yOf(5)); // C5: third space
  assert.equal(b.y, g.bass.yOf(3)); // C3: second space of the bass staff
});

test('piano drills: questions are well-formed and answerable', () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const d of PIANO_DRILLS) d.levels.forEach((_, level) => {
    for (let i = 0; i < 30; i++) {
      const q = makePianoQuestion({ drill: d.id, level, key: C, mode: ion, rng });
      if (q.options) assert.ok(q.options.some((o) => String(o.id) === String(q.answer)), d.id);
      if (q.drill === 'play') {
        const notes = closeChord(q.rootPc, q.sfx, 48);
        assert.ok(playedRight(q, notes), `${q.rootPc}${q.sfx}`);
        assert.ok(playedRight(q, invert(notes, 1)), `${q.rootPc}${q.sfx} inv`);
        const off = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((x) => notes[0] + x).find((m) => !playedRight(q, [...notes, m]) && !notes.some((n) => mod(n - m, 12) === 0));
        assert.ok(off, 'some wrong note is caught');
      }
    }
  });
});
