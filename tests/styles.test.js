import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, MODIFIERS, styleModes, suggest, parseToken, buildChord, spellKey, modeById } from '../ui/theory.js';
import { buildTree, layout } from '../ui/graph.js';
import { asciiChord } from '../ui/midi.js';

test('every style token parses and every style has sane defaults', () => {
  for (const style of STYLES) {
    assert.ok(style.name && style.blurb, style.id);
    assert.ok(['triad', 'seventh'].includes(style.defaults.color), style.id);
    assert.ok(['phrase', 'loop'].includes(style.defaults.length), style.id);
    assert.ok(style.defaults.bpm >= 50 && style.defaults.bpm <= 180, style.id);
    assert.ok(styleModes(style).length >= 1, style.id);
    for (const list of Object.values(style.library)) for (const t of list) t.chords.forEach(parseToken);
  }
});

test('every style × mode × root draws all of its progressions', () => {
  for (const style of STYLES) for (const modeId of styleModes(style)) for (let pc = 0; pc < 12; pc++) {
    for (const modifier of ['triad', 'seventh', '5', 'sus4']) for (const color of ['triad', 'seventh']) {
      const s = suggest({ rootPc: pc, modeId, modifier, color, styleId: style.id });
      const tree = buildTree(s.templates);
      // No library progression may vanish by repeating the start of another.
      const authored = style.library[modeId].length;
      const kept = tree.branches.filter((b) => !b.special && !b.borrowed).length;
      assert.equal(kept, authored, `${style.id}/${modeId}: ${authored - kept} progression(s) hidden`);
      assert.equal(tree.branches[0].name, style.library[modeId][0].name, 'main line first');
      const g = layout(tree, { compact: true, returnStyle: 'node' });
      for (const n of g.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
      for (const c of [s.tonic, ...s.templates.flatMap((t) => t.chords)]) {
        assert.doesNotMatch(c.name, /undefined|NaN/, `${style.id}: ${c.token}`);
        assert.match(asciiChord(c.name), /^[\x20-\x7e]+$/, c.name);
      }
    }
  }
});

test('new chord types are spelled correctly', () => {
  const chord = (pc, modeId, tok, quality) => {
    const m = modeById(modeId);
    return buildChord(spellKey(pc, m), m, tok, { quality });
  };
  assert.deepEqual(chord(0, 'ionian', 'IVmaj9').notes, ['F', 'A', 'C', 'E', 'G']);
  assert.deepEqual(chord(0, 'ionian', 'ii9').notes, ['D', 'F', 'A', 'C', 'E']);
  assert.deepEqual(chord(0, 'ionian', 'V9').notes, ['G', 'B', 'D', 'F', 'A']);
  assert.deepEqual(chord(0, 'ionian', 'V7sus4').notes, ['G', 'C', 'D', 'F']);
  assert.equal(chord(4, 'phrygian', 'bII5').name, 'F5');
  assert.equal(chord(9, 'aeolian', 'i', 'power').name, 'A5');
  // Phrygian dominant: E F G♯ A B C D, with a major tonic.
  assert.equal(spellKey(4, modeById('phrygdom')).scale.map((n) => n.name).join(' '), 'E F G♯ A B C D');
  // Power chords are judged by their notes, so diatonic ones are not "borrowed".
  assert.equal(chord(0, 'aeolian', 'bVI5').source, null);
});

test('picking a style that lacks the mode falls back to the theory set', () => {
  const s = suggest({ rootPc: 0, modeId: 'locrian', styleId: 'pop' });
  assert.ok(s.templates.length > 0);
});

test('style modifiers exist', () => {
  assert.ok(MODIFIERS.some((m) => m.id === '5'));
  assert.equal(suggest({ rootPc: 4, modeId: 'phrygian', modifier: '5', styleId: 'metal' }).tonic.name, 'E5');
});
