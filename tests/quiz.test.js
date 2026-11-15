import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeQuestion, spellDegree, resolution, record, accuracy, ready, emptyStats } from '../ui/quiz.js';
import { spellKey, modeById } from '../ui/theory.js';
import { formatNote } from '../ui/horn.js';

/** Deterministic rng from a list of values in [0, 1). */
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const base = { rootPc: 0, modeId: 'ionian', instrumentId: 'alto' };

test('degree drill: options follow the level and the mode', () => {
  const q = makeQuestion({ ...base, drill: 'degree', level: 0, rng: seq(0) });
  assert.deepEqual(q.options.map((o) => o.label), ['Do', 'Mi', 'Sol']);
  const minor = makeQuestion({ ...base, modeId: 'aeolian', drill: 'degree', level: 0, rng: seq(0) });
  assert.deepEqual(minor.options.map((o) => `${o.label} ${o.sub}`), ['Do 1', 'Me ♭3', 'Sol 5']);
  const la = makeQuestion({ ...base, modeId: 'aeolian', drill: 'degree', level: 0, la: true, rng: seq(0) });
  assert.deepEqual(la.options.map((o) => o.label), ['La', 'Do', 'Mi']);
  const chrom = makeQuestion({ ...base, drill: 'degree', level: 3, rng: seq(0) });
  assert.equal(chrom.options.length, 12);
  assert.deepEqual(chrom.options.map((o) => o.label).slice(0, 4), ['Do', 'Ra', 'Re', 'Me']);
});

test('degree drill: target sits in the middle of the sax, cadence sets the key', () => {
  const q = makeQuestion({ ...base, drill: 'degree', level: 2, rng: seq(0.5) });
  // Alto: written D4 = concert F3 (53); C's tonic at or above that is C4 (60).
  assert.equal(q.tonicMidi, 60);
  assert.equal(q.target, 60 + q.answer);
  assert.deepEqual(q.cadence.map((c) => c.name), ['C', 'F', 'G', 'C']);
  const m = makeQuestion({ ...base, modeId: 'aeolian', rootPc: 9, drill: 'degree', rng: seq(0) });
  assert.deepEqual(m.cadence.map((c) => c.name), ['Am', 'Dm', 'E', 'Am']);
});

test('no immediate repeat when another answer is possible', () => {
  const a = makeQuestion({ ...base, drill: 'degree', level: 0, rng: seq(0) });
  const b = makeQuestion({ ...base, drill: 'degree', level: 0, prev: a.answer, rng: seq(0, 0.9) });
  assert.notEqual(a.answer, b.answer);
});

test('chromatic spelling and resolutions', () => {
  const c = spellKey(0, modeById('ionian'));
  const nm = (s) => { const n = spellDegree(c, s); return formatNote(n.letter, n.acc); };
  assert.deepEqual([1, 3, 6, 8, 10].map(nm), ['D♭', 'E♭', 'F♯', 'A♭', 'B♭']);
  const loc = spellKey(11, modeById('locrian'));
  assert.equal(formatNote(spellDegree(loc, 6).letter, spellDegree(loc, 6).acc), 'F'); // ♭5 from the scale
  const ion = modeById('ionian');
  assert.deepEqual(resolution(ion, 4, 60), [64, 62, 60]); // Mi Re Do
  assert.deepEqual(resolution(ion, 9, 60), [69, 71, 72]); // La Ti Do
  assert.deepEqual(resolution(ion, 0, 60), [60]);
});

test('chord-tone drill', () => {
  const q = makeQuestion({ ...base, drill: 'tone', level: 0, rng: seq(0, 0.5) });
  assert.deepEqual(q.options.map((o) => o.id), ['R', '3', '5']);
  assert.equal(q.chord.name, 'C');
  assert.equal(q.answer, '3');
  assert.equal(q.target, 60 + 12 + 4); // E above the chord
  const s = makeQuestion({ ...base, drill: 'tone', level: 1, rng: seq(0.99, 0.99) });
  assert.equal(s.options.length, 4);
  assert.equal(s.answer, '7');
});

test('reading drill: notes of the key in written pitch, within the level', () => {
  for (const level of [0, 1, 2]) {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const q = makeQuestion({ ...base, drill: 'read', level, rng: seq(r) });
      const [lo, hi] = [[64, 77], [58, 77], [58, 90]][level];
      assert.ok(q.written >= lo && q.written <= hi);
      assert.ok(q.note.inScale);
    }
  }
  // Concert C major on alto = written A major: options carry the sharps.
  const q = makeQuestion({ ...base, drill: 'read', rng: seq(0) });
  assert.deepEqual(q.options.map((o) => formatNote(o.letter, o.acc)), ['A', 'B', 'C♯', 'D', 'E', 'F♯', 'G♯']);
  assert.equal(q.target, q.written - 9);
});

test('scoring', () => {
  let s = emptyStats();
  for (const ok of [true, true, false, true]) s = record(s, ok);
  assert.deepEqual({ streak: s.streak, best: s.best, total: s.total, right: s.right }, { streak: 1, best: 2, total: 4, right: 3 });
  assert.equal(accuracy(s), 75);
  assert.equal(ready(s), false);
  for (let i = 0; i < 20; i++) s = record(s, true);
  assert.equal(s.recent.length, 20);
  assert.equal(ready(s), true);
  assert.equal(accuracy(emptyStats()), null);
});
