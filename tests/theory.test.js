import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellKey, modeById, buildChord, suggest, MODES, MODIFIERS, LIBRARY, parseToken } from '../ui/theory.js';
import { buildTree, layout } from '../ui/graph.js';

const scaleOf = (pc, mode) => spellKey(pc, modeById(mode)).scale.map((n) => n.name).join(' ');
const chord = (pc, mode, tok, color) => {
  const m = modeById(mode);
  return buildChord(spellKey(pc, m), m, tok, { color });
};

test('scales are spelled with one letter per degree', () => {
  assert.equal(scaleOf(0, 'ionian'), 'C D E F G A B');
  assert.equal(scaleOf(6, 'ionian'), 'F♯ G♯ A♯ B C♯ D♯ E♯');
  assert.equal(scaleOf(3, 'dorian'), 'E♭ F G♭ A♭ B♭ C D♭');
  assert.equal(scaleOf(1, 'aeolian'), 'C♯ D♯ E F♯ G♯ A B');
  assert.equal(scaleOf(9, 'harmonic'), 'A B C D E F G♯');
  assert.equal(scaleOf(4, 'phrygian'), 'E F G A B C D');
  assert.equal(scaleOf(5, 'lydian'), 'F G A B C D E');
});

test('chords are spelled and named correctly', () => {
  assert.deepEqual(chord(0, 'ionian', 'V7').notes, ['G', 'B', 'D', 'F']);
  assert.equal(chord(0, 'ionian', 'bVI').name, 'A♭');
  assert.equal(chord(0, 'ionian', 'V/V').name, 'D');
  assert.deepEqual(chord(0, 'ionian', 'V/vi').notes, ['E', 'G♯', 'B']);
  assert.equal(chord(9, 'aeolian', 'V').name, 'E');
  assert.equal(chord(4, 'phrygian', 'bII').name, 'F');
  assert.equal(chord(0, 'ionian', '#iv°7').name, 'F♯°7');
  assert.equal(chord(9, 'harmonic', 'vii°7').name, 'G♯°7');
});

test('seventh colouring follows the chord’s source scale', () => {
  assert.equal(chord(0, 'ionian', 'V', 'seventh').name, 'G7');
  assert.equal(chord(0, 'ionian', 'IV', 'seventh').name, 'Fmaj7');
  assert.equal(chord(0, 'ionian', 'vii°', 'seventh').name, 'Bø7');
  assert.equal(chord(0, 'ionian', 'iv', 'seventh').name, 'Fm7'); // borrowed from minor
  assert.equal(chord(0, 'ionian', 'bVII', 'seventh').name, 'B♭7'); // backdoor dominant
  assert.equal(chord(9, 'harmonic', 'i', 'seventh').name, 'Am(maj7)');
  assert.equal(chord(9, 'aeolian', 'V', 'seventh').name, 'E7');
});

test('every library token parses', () => {
  for (const list of Object.values(LIBRARY)) for (const t of list) t.chords.forEach(parseToken);
});

test('every key/mode/modifier yields a valid tree', () => {
  for (let pc = 0; pc < 12; pc++) {
    for (const m of MODES) {
      for (const mod of MODIFIERS) {
        for (const color of ['triad', 'seventh']) {
          const s = suggest({ rootPc: pc, modeId: m.id, modifier: mod.id, color });
          const tree = buildTree(s.templates);
          const g = layout(tree);
          assert.ok(tree.branches.length >= 6, `${pc} ${m.id} ${mod.id}`);
          for (const n of g.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
          // Main line stays on lane 0.
          assert.ok(tree.branches[0].path.every((n) => n.lane === 0));
          // No two nodes in one spot.
          const spots = new Set(g.nodes.map((n) => `${n.col},${n.lane}`));
          assert.equal(spots.size, g.nodes.length);
          for (const b of tree.branches) for (const c of b.chords) assert.doesNotMatch(c.name, /undefined/);
        }
      }
    }
  }
});

test('cadences are named from the actual chords', () => {
  const s = suggest({ rootPc: 0, modeId: 'ionian' });
  const by = (name) => s.templates.find((t) => t.name === name).cadence;
  assert.match(by('Authentic cadence'), /^Authentic cadence · V → I$/);
  assert.match(by('Deceptive cadence'), /^Deceptive cadence/);
  assert.match(by('Borrowed minor iv'), /^Minor plagal/);
  assert.match(by('Half cadence'), /^Half cadence/);
  const a = suggest({ rootPc: 9, modeId: 'aeolian' });
  assert.match(a.templates.find((t) => t.name === 'Picardy third').cadence, /^Picardy third/);
});

test('root modifiers change the tonic and add fitting branches', () => {
  const s = suggest({ rootPc: 0, modeId: 'ionian', modifier: 'sus4' });
  assert.equal(s.tonic.name, 'Csus4');
  assert.ok(s.templates.some((t) => t.name === 'Suspension release'));
  const d = suggest({ rootPc: 0, modeId: 'ionian', modifier: 'dom7' });
  assert.equal(d.tonic.name, 'C7');
  assert.ok(d.templates.some((t) => t.name === '12-bar blues skeleton'));
  assert.equal(suggest({ rootPc: 2, modeId: 'dorian', modifier: 'seventh' }).tonic.name, 'Dm7');
});

test('open endings suggest musically sensible continuations', () => {
  const tree = (modeId) => buildTree(suggest({ rootPc: 0, modeId }).templates);
  const by = (t, name) => t.branches.find((b) => b.name === name);
  const ion = tree('ionian');
  // Deceptive vi carries on through vi → IV of the pop axis.
  const dec = by(ion, 'Deceptive cadence').next;
  assert.equal(dec.node.chord.roman, 'IV');
  assert.equal(dec.node.parent.chord.roman, 'vi');
  // Tonic endings (Picardy) are final.
  assert.equal(by(tree('aeolian'), 'Picardy third').next, null);
  for (let pc = 0; pc < 12; pc++) for (const m of MODES) {
    const t = buildTree(suggest({ rootPc: pc, modeId: m.id }).templates);
    for (const b of t.branches) {
      if (b.end === 'resolve') assert.equal(b.next, undefined);
      if (b.next && !b.next.home && !b.next.toDominant) {
        assert.equal(b.next.node.parent.chord.token, b.last.chord.token);
        assert.ok(!b.path.includes(b.next.node));
      }
    }
  }
});

test('R nodes and compact view never overlap chords', () => {
  for (let pc = 0; pc < 12; pc += 5) for (const m of MODES) for (const mod of ['triad', 'dom7', 'sus4']) {
    for (const compact of [false, true]) for (const returnStyle of ['line', 'node']) {
      const tree = buildTree(suggest({ rootPc: pc, modeId: m.id, modifier: mod }).templates);
      const g = layout(tree, { compact, returnStyle });
      const { w, h } = g.size;
      assert.equal(g.returns.length > 0, returnStyle === 'line');
      assert.equal(g.badges.length > 0, returnStyle === 'node');
      for (const bd of g.badges) {
        for (const n of g.nodes) {
          const dx = Math.max(n.x - bd.cx, 0, bd.cx - (n.x + w));
          const dy = Math.max(n.y - bd.cy, 0, bd.cy - (n.y + h));
          assert.ok(Math.hypot(dx, dy) > bd.r, `badge overlaps ${n.id}`);
        }
      }
    }
  }
});

test('borrowed branches swap exactly one chord for a parallel-mode chord', () => {
  const s = suggest({ rootPc: 0, modeId: 'ionian', borrowed: true });
  const by = (name) => s.templates.find((t) => t.name === name);
  assert.deepEqual(by('borrowed iv from Aeolian').chords.map((c) => c.name), ['Am', 'Fm', 'G']);
  assert.deepEqual(by('borrowed ♭II from Phrygian').chords.map((c) => c.name), ['D♭', 'G']);
  // Minor keys borrow the major V from harmonic minor and IV from Dorian.
  const d = suggest({ rootPc: 9, modeId: 'dorian', borrowed: true });
  assert.ok(d.templates.some((t) => t.name === 'borrowed V from Harmonic minor'));
  const a = suggest({ rootPc: 9, modeId: 'aeolian', borrowed: true });
  assert.ok(a.templates.some((t) => t.name === 'borrowed IV from Dorian'));
  // Off by default; library chords are still tagged with their source.
  const plain = suggest({ rootPc: 0, modeId: 'ionian' });
  assert.ok(!plain.templates.some((t) => t.borrowed));
  assert.equal(plain.templates.find((t) => t.name === 'Borrowed minor iv').chords[1].source.id, 'aeolian');
  assert.equal(plain.templates.find((t) => t.name === 'Secondary dominant II').chords[0].source, 'secondary');
  for (let pc = 0; pc < 12; pc++) for (const m of MODES) {
    const lib = LIBRARY[m.id];
    for (const t of suggest({ rootPc: pc, modeId: m.id, borrowed: true }).templates.filter((x) => x.borrowed)) {
      const borrowedCount = t.chords.filter((c) => c.source && c.source !== 'secondary').length;
      const original = lib.find((l) => l.chords.length === t.chords.length
        && l.chords.filter((tok, i) => tok !== t.chords[i].token).length === 1);
      assert.ok(original, `${m.id}: ${t.name} is not a one-chord swap`);
      assert.ok(borrowedCount >= 1, `${m.id}: ${t.name}`);
      assert.doesNotMatch(t.chords.map((c) => c.name).join(' '), /undefined/);
    }
  }
});
