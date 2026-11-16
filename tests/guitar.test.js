import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODIFIERS, STYLES, QUALITIES, mod, spellKey, buildChord, suggest } from '../ui/theory.js';
import { TUNING, OPEN_SHAPES, voicing, shapeText, voicingMidi, FRETTED, FRETS, fretboardView, scaleRun, alternates, voiceLead, movement, scalePositions, shapeInPosition, positionTab, shapeTab, bassArpeggio, placeNote, WRITTEN } from '../ui/guitar.js';
import { chordLayer, octaveOf } from '../ui/horn.js';
import { layoutStaff } from '../ui/staff.js';
import { SCALES } from '../ui/horn.js';

const pcsOf = (v) => voicingMidi(v).map((m) => mod(m, 12));

/** Checks a voicing against the chord: root in the bass, only chord tones,
 *  every tone present except possibly the 5th of a 4+ note chord. */
function assertFits(v, chord) {
  const tones = [...new Set(chord.semis.map((s) => mod(chord.pc + s, 12)))];
  const pcs = pcsOf(v);
  const where = `${chord.name} ${shapeText(v)}`;
  assert.equal(pcs[0], chord.pc, `${where}: root in the bass`);
  assert.ok(pcs.every((p) => tones.includes(p)), `${where}: only chord tones`);
  const fifth = mod(chord.pc + 7, 12);
  for (const t of tones) {
    if (!pcs.includes(t)) assert.ok(tones.length >= 4 && t === fifth, `${where}: missing ${t}`);
  }
  const fretted = v.frets.filter((f) => f > 0);
  if (fretted.length) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 3, `${where}: stretch`);
  assert.ok(v.fingers <= 4, `${where}: fingers`);
}

// Every chord the app can show: all styles, modes, keys, chord colours,
// root modifiers, with and without borrowed chords.
function* allChords() {
  for (const style of STYLES) for (const mode of MODES) {
    if (style.id !== 'theory' && !style.library[mode.id]) continue;
    for (let rootPc = 0; rootPc < 12; rootPc++) for (const color of ['triad', 'seventh']) {
      for (const modifier of MODIFIERS.map((m) => m.id)) for (const borrowed of [false, true]) {
        const s = suggest({ rootPc, modeId: mode.id, modifier, color, borrowed, styleId: style.id });
        yield s.tonic;
        for (const t of s.templates) yield* t.chords;
      }
    }
  }
}

test('every chord the app can build has a fitting voicing', () => {
  const done = new Set();
  for (const c of allChords()) {
    const k = `${c.pc}:${c.quality}`;
    if (done.has(k)) continue;
    done.add(k);
    const v = voicing(c);
    assert.ok(v, `${c.name}: no voicing`);
    assertFits(v, c);
  }
  assert.ok(done.size > 100);
});

test('every quality has a voicing in every key', () => {
  const ion = MODES[0];
  for (const quality of Object.keys(QUALITIES)) for (let pc = 0; pc < 12; pc++) {
    const c = buildChord(spellKey(pc, ion), ion, 'I', { quality });
    const v = voicing(c);
    assert.ok(v, `${c.name}: no voicing`);
    assertFits(v, c);
  }
});

test('open shapes in the table spell their chord', () => {
  const ion = MODES[0];
  for (const [quality, byPc] of Object.entries(OPEN_SHAPES)) {
    assert.ok(QUALITIES[quality], quality);
    for (const pc of Object.keys(byPc)) {
      const c = buildChord(spellKey(+pc, ion), ion, 'I', { quality });
      assertFits(voicing(c), c);
    }
  }
});

test('familiar shapes', () => {
  const ion = MODES[0];
  const shape = (pc, quality) => shapeText(voicing(buildChord(spellKey(pc, ion), ion, 'I', { quality })));
  assert.equal(shape(0, 'maj'), 'x32010');
  assert.equal(shape(7, 'maj'), '320003');
  assert.equal(shape(5, 'maj'), '133211');   // F: E-shape barre
  assert.equal(shape(10, 'maj'), 'x13331');  // B♭: A-shape barre
  assert.equal(shape(11, 'min'), 'x24432');  // Bm
  assert.equal(shape(6, 'min'), '244222');   // F♯m
  assert.equal(shape(11, 'dom7'), 'x21202');
  assert.equal(shape(0, 'power'), 'x355xx');
});

test('barres only when more than four strings are fretted', () => {
  const ion = MODES[0];
  for (const quality of Object.keys(QUALITIES)) for (let pc = 0; pc < 12; pc++) {
    const v = voicing(buildChord(spellKey(pc, ion), ion, 'I', { quality }));
    const fretted = v.frets.filter((f) => f > 0).length;
    if (v.barre) {
      assert.ok(fretted > 4, shapeText(v));
      for (let s = v.barre.from; s <= v.barre.to; s++) assert.ok(v.frets[s] >= v.barre.fret, shapeText(v));
    } else assert.ok(fretted <= 4, shapeText(v));
  }
  assert.equal(TUNING.length, 6);
});

test('fretboard marks the scale notes on every string and fret', () => {
  const v = fretboardView({ instrumentId: 'guitar', rootPc: 0, modeId: 'ionian' });
  assert.equal(v.strings.length, 6);
  for (const s of v.strings) {
    assert.equal(s.cells.length, FRETS + 1);
    for (const c of s.cells) {
      const white = [0, 2, 4, 5, 7, 9, 11].includes(mod(c.midi, 12));
      assert.equal(!!c.note, white, `midi ${c.midi}`);
    }
  }
  // Low E string: open E is degree 3, fret 8 is C (tonic).
  assert.equal(v.strings[0].cells[0].note.name, 'E');
  assert.ok(v.strings[0].cells[8].tonic);
  // Spelling follows the key: B♭ in F, F♯ in G.
  const f = fretboardView({ instrumentId: 'guitar', rootPc: 5, modeId: 'ionian' });
  assert.equal(f.strings[5].cells[6].note.name, 'B♭');
  const g = fretboardView({ instrumentId: 'bass', rootPc: 7, modeId: 'ionian' });
  assert.equal(g.strings.length, 4);
  assert.equal(g.strings[3].cells[11].note.name, 'F♯');
});

test('pentatonic and blues scales on the neck', () => {
  const pent = fretboardView({ instrumentId: 'guitar', rootPc: 9, modeId: 'aeolian', scaleId: 'minpent' });
  assert.deepEqual(pent.notes.map((n) => n.name), ['A', 'C', 'D', 'E', 'G']);
  const blues = fretboardView({ instrumentId: 'guitar', rootPc: 4, modeId: 'aeolian', scaleId: 'blues' });
  assert.ok(blues.strings[0].cells[6].blue); // B♭ on the low E string
});

test('play-scale run stays on the neck for every key, scale and instrument', () => {
  for (const inst of FRETTED) for (let pc = 0; pc < 12; pc++) for (const sc of SCALES) {
    const v = fretboardView({ instrumentId: inst.id, rootPc: pc, modeId: 'dorian', scaleId: sc.id });
    const run = scaleRun(v);
    assert.equal(mod(run[0], 12), pc);
    assert.equal(run[0], run[run.length - 1]);
    assert.ok(run[0] >= inst.strings[0], `${inst.id} ${pc} low`);
    assert.ok(Math.max(...run) <= inst.strings[inst.strings.length - 1] + FRETS, `${inst.id} ${pc} high`);
  }
});

test('a focused chord shows its tones and chord-scale on the neck', () => {
  const s = suggest({ rootPc: 0, modeId: 'ionian', color: 'seventh' });
  const g7 = s.scale.find((c) => c.name === 'G7');
  const v = fretboardView({ instrumentId: 'guitar', rootPc: 0, modeId: 'ionian', chord: g7 });
  assert.equal(v.tonic.pc, 7);
  const cells = v.strings.flatMap((x) => x.cells);
  const fns = new Map(cells.filter((c) => c.tone).map((c) => [c.note.name, c.tone.fn]));
  assert.deepEqual(Object.fromEntries(fns), { G: 'R', B: '3', D: '5', F: '7' });
  // Mixolydian from G: every note of C major, starting on G.
  assert.deepEqual(v.notes.map((n) => n.name), ['G', 'A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(scaleRun(v)[0] % 12, 7);
  // Borrowed iv (Fm) in C: the chord-scale takes C minor's notes (A♭, E♭, B♭).
  const b = suggest({ rootPc: 0, modeId: 'ionian', borrowed: true });
  const fm = b.templates.flatMap((t) => t.chords).find((c) => c.name === 'Fm');
  const vf = fretboardView({ instrumentId: 'guitar', rootPc: 0, modeId: 'ionian', chord: fm });
  assert.ok(vf.notes.some((n) => n.name === 'A♭'));
});

test('alternate shapes fit the chord, sit at different places and include the easiest', () => {
  const done = new Set();
  for (const c of allChords()) {
    const k = `${c.pc}:${c.quality}`;
    if (done.has(k)) continue;
    done.add(k);
    const { list, best } = alternates(c);
    assert.ok(list.length >= 1 && best >= 0, c.name);
    assert.equal(list[best], voicing(c), c.name);
    for (const v of list) assertFits(v, c);
    assert.equal(new Set(list.map(shapeText)).size, list.length, c.name);
  }
});

test('voice-leading never moves the hand more than the easiest shapes', () => {
  for (const style of STYLES) for (const mode of MODES) {
    if (!style.library[mode.id]) continue;
    for (const rootPc of [0, 3, 6, 10]) {
      const s = suggest({ rootPc, modeId: mode.id, color: 'seventh', styleId: style.id });
      for (const t of s.templates) {
        const chords = [s.tonic, ...t.chords];
        const { alts, picks } = voiceLead(chords);
        const led = picks.map((p, i) => alts[i].list[p]);
        const easy = alts.map((a) => a.list[a.best]);
        assert.ok(movement(led) <= movement(easy) + 1e-9, `${style.id} ${mode.id} ${rootPc} ${t.name}`);
      }
    }
  }
});

test('A minor pentatonic boxes are the standard five', () => {
  const ps = scalePositions({ instrumentId: 'guitar', rootPc: 9, modeId: 'aeolian', scaleId: 'minpent' });
  const r = (p) => p.range.map((x) => x.join('-')).join(' ');
  assert.equal(ps.length, 5);
  assert.equal(r(ps[0]), '5-8 5-7 5-7 5-7 5-8 5-8');
  assert.equal(r(ps[1]), '8-10 7-10 7-10 7-9 8-10 8-10');
  assert.equal(r(ps[4]), '3-5 3-5 2-5 2-5 3-5 3-5');
});

test('positions walk the scale note by note on the neck', () => {
  for (const inst of FRETTED) for (const mode of MODES) for (const sc of SCALES) for (let pc = 0; pc < 12; pc++) {
    const ps = scalePositions({ instrumentId: inst.id, rootPc: pc, modeId: mode.id, scaleId: sc.id });
    const v = fretboardView({ instrumentId: inst.id, rootPc: pc, modeId: mode.id, scaleId: sc.id });
    const pcs = v.notes.map((n) => n.pc);
    const where = `${inst.id} ${pc} ${mode.id} ${sc.id}`;
    assert.equal(ps.length, sc.id === 'mode' ? mode.steps.length : 5, where);
    assert.equal(mod(ps[0].cells[0].midi, 12), pc, `${where}: position 1 starts on the tonic`);
    for (const p of ps) {
      const per = sc.id === 'mode' ? 3 : 2;
      for (let s = 0; s < inst.strings.length; s++) {
        assert.equal(p.cells.filter((c) => c.string === s && !c.blue).length, per, where);
      }
      for (let i = 0; i < p.cells.length; i++) {
        const c = p.cells[i];
        assert.ok(c.fret >= 0 && c.fret <= FRETS, `${where} p${p.n}: fret ${c.fret}`);
        assert.equal(c.midi, inst.strings[c.string] + c.fret);
        assert.ok(pcs.includes(mod(c.midi, 12)), `${where}: not in scale`);
        if (i) {
          // Next note of the scale, no skips.
          const prev = p.cells[i - 1].midi;
          assert.ok(c.midi > prev, where);
          for (let m = prev + 1; m < c.midi; m++) assert.ok(!pcs.includes(mod(m, 12)), `${where} p${p.n}: skips ${m}`);
        }
      }
    }
  }
});

test('chord shapes stay in the position when one fits', () => {
  for (const [pc, modeId] of [[0, 'ionian'], [9, 'aeolian'], [10, 'mixolydian']]) {
    const s = suggest({ rootPc: pc, modeId, color: 'seventh' });
    for (const p of scalePositions({ instrumentId: 'guitar', rootPc: pc, modeId })) {
      for (const c of [s.tonic, ...s.scale]) {
        const v = shapeInPosition(c, p);
        assertFits(v, c);
      }
    }
  }
  // C major, position starting on G (frets 3–7 area): C chord at the 3rd fret.
  const ps = scalePositions({ instrumentId: 'guitar', rootPc: 0, modeId: 'ionian' });
  const c = suggest({ rootPc: 0, modeId: 'ionian' }).tonic;
  for (const p of ps) {
    const v = shapeInPosition(c, p);
    const fretted = v.frets.filter((f) => f > 0);
    assert.ok(fretted.every((f) => f >= p.lo - 1 && f <= p.hi + 1), `p${p.n} ${shapeText(v)} ${p.lo}-${p.hi}`);
  }
});

const writtenMidi = (n) => {
  const pcOf = [0, 2, 4, 5, 7, 9, 11][n.letter] + n.acc;
  return (n.octave + 1) * 12 + pcOf;
};

test('tab notes are spelled at written pitch (an octave above sounding)', () => {
  for (const inst of FRETTED) for (const mode of MODES) for (const sc of SCALES) for (const pc of [0, 4, 6, 10]) {
    const v = fretboardView({ instrumentId: inst.id, rootPc: pc, modeId: mode.id, scaleId: sc.id });
    for (const pos of scalePositions({ instrumentId: inst.id, rootPc: pc, modeId: mode.id, scaleId: sc.id })) {
      for (const n of positionTab(v, pos)) {
        assert.equal(writtenMidi(n), n.midi + WRITTEN, `${inst.id} ${mode.id} ${sc.id} ${pc}`);
        assert.equal(n.midi, inst.strings[n.string] + n.fret);
      }
    }
  }
  // Open low E sounds E2 and is written E3.
  const e = positionTab(fretboardView({ instrumentId: 'guitar', rootPc: 4, modeId: 'aeolian', scaleId: 'minpent' }),
    scalePositions({ instrumentId: 'guitar', rootPc: 4, modeId: 'aeolian', scaleId: 'minpent' })[0])[0];
  assert.deepEqual([e.letter, e.acc, e.octave, e.string, e.fret], [2, 0, 3, 0, 0]);
});

test('shape and bass tabs spell chord tones', () => {
  const ion = MODES[0];
  for (let pc = 0; pc < 12; pc++) {
    const k = spellKey(pc, ion);
    for (const c of suggest({ rootPc: pc, modeId: 'ionian', color: 'seventh' }).scale) {
      const layer = chordLayer(c, k, k);
      const shape = shapeTab(voicing(c), layer);
      assert.equal(shape[0].fn, 'R');
      for (const n of shape) assert.equal(writtenMidi(n), n.midi + WRITTEN, c.name);
      const bass = bassArpeggio(layer);
      assert.equal(bass.length, layer.tones.length, c.name);
      bass.forEach((n, i) => {
        assert.equal(writtenMidi(n), n.midi + WRITTEN, c.name);
        assert.equal(n.midi, FRETTED[1].strings[n.string] + n.fret);
        if (i) assert.ok(n.midi > bass[i - 1].midi);
      });
    }
  }
  assert.equal(placeNote(10, TUNING, 0), null);
});

test('stacked chord notes share a column; a second shifts the upper head', () => {
  const g = layoutStaff({ bars: [{ notes: [
    { letter: 0, acc: 0, octave: 4 }, { letter: 1, acc: 0, octave: 4, stack: true }, { letter: 4, acc: 0, octave: 4, stack: true },
    { letter: 0, acc: 0, octave: 5 },
  ] }] });
  const [c, d, gN, next] = g.notes;
  assert.equal(c.col, d.col);
  assert.equal(d.col, gN.col);
  assert.ok(d.x > c.x, 'D shifted right of C');
  assert.equal(gN.x, c.x);
  assert.ok(next.col > c.col);
  assert.equal(octaveOf(60, 0), 4);
});
