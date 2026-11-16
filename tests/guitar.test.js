import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODIFIERS, STYLES, QUALITIES, mod, spellKey, buildChord, suggest } from '../ui/theory.js';
import { TUNING, OPEN_SHAPES, voicing, shapeText, voicingMidi } from '../ui/guitar.js';

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
