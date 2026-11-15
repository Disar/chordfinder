import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keySignature, majorSignature, signatureMap, accidentals, layoutStaff, CLEFS, stepOf } from '../ui/staff.js';
import { spellKey, modeById } from '../ui/theory.js';

const sigOf = (pc, modeId) => keySignature(spellKey(pc, modeById(modeId)), modeId);
const n = (letter, acc, octave) => ({ letter, acc, octave });

test('major key signatures', () => {
  assert.equal(majorSignature(0, 0), 0); // C
  assert.equal(majorSignature(4, 7), 1); // G
  assert.equal(majorSignature(5, 9), 3); // A
  assert.equal(majorSignature(2, 3), -3); // E♭
  assert.equal(majorSignature(0, 1), 7); // C♯
  assert.equal(majorSignature(4, 8), 0); // G♯ major would need F𝄪
});

test('key signatures per mode', () => {
  assert.equal(sigOf(2, 'dorian'), 0); // D Dorian: parent C major
  assert.equal(sigOf(4, 'phrygian'), 0);
  assert.equal(sigOf(5, 'lydian'), 0);
  assert.equal(sigOf(7, 'mixolydian'), 0);
  assert.equal(sigOf(9, 'aeolian'), 0);
  assert.equal(sigOf(11, 'locrian'), 0);
  assert.equal(sigOf(9, 'harmonic'), 0); // A minor signature, G♯ written in
  assert.equal(sigOf(9, 'melodic'), 0);
  assert.equal(sigOf(4, 'phrygdom'), 0); // E Phrygian dominant: A minor
  assert.equal(sigOf(0, 'dorian'), -2); // C Dorian: B♭ major
  assert.equal(sigOf(9, 'ionian'), 3);
});

test('signature map', () => {
  assert.deepEqual(signatureMap(2), [1, 0, 0, 1, 0, 0, 0]); // F♯ C♯
  assert.deepEqual(signatureMap(-1), [0, 0, 0, 0, 0, 0, -1]); // B♭
});

test('accidentals: against the signature, carried through the bar', () => {
  // A major (3♯): G♮ needs a natural, the next G♮ in the bar does not,
  // and G♯ after it needs its sharp back.
  const [bar] = accidentals([[n(4, 0, 4), n(4, 0, 4), n(4, 1, 4), n(2, -1, 4)]], 3);
  assert.deepEqual(bar, ['♮', null, '♯', '♭']);
  // The carry is per octave and resets each bar.
  const two = accidentals([[n(4, 0, 4), n(4, 0, 5)], [n(4, 0, 4)]], 3);
  assert.deepEqual(two, [['♮', '♮'], ['♮']]);
  // C major: nothing printed for naturals.
  assert.deepEqual(accidentals([[n(0, 0, 4), n(3, 1, 4)]], 0), [[null, '♯']]);
});

test('staff positions and ledger lines', () => {
  assert.equal(stepOf(2, 4) - CLEFS.treble.bottom, 0); // E4 on the bottom line
  const g = layoutStaff({ bars: [{ notes: [n(0, 0, 4), n(3, 0, 5), n(6, -1, 3), n(3, 1, 6)] }] });
  const [c4, f5, bb3, fs6] = g.notes;
  assert.equal(c4.ledgers.length, 1);
  assert.equal(f5.y, g.lines[0]); // F5 on the top line
  assert.equal(f5.ledgers.length, 0);
  assert.equal(bb3.ledgers.length, 1); // B♭3 hangs under the C4 ledger
  assert.equal(bb3.acc, '♭');
  assert.equal(fs6.ledgers.length, 3); // F♯6: above the 3rd ledger line (E6)
  assert.ok(fs6.y < g.lines[0] && g.top > 26);
  // Bass clef: G2 on the bottom line.
  const b = layoutStaff({ clef: 'bass', bars: [{ notes: [n(4, 0, 2)] }] });
  assert.equal(b.notes[0].y, b.lines[4]);
});

test('signature glyphs sit on the right lines', () => {
  const g = layoutStaff({ sig: 2, bars: [{ notes: [] }] });
  assert.equal(g.sigGlyphs.length, 2);
  assert.equal(g.sigGlyphs[0].y, g.lines[0]); // F♯ on the top line (F5)
  const b = layoutStaff({ sig: -1, bars: [{ notes: [] }] });
  assert.equal(b.sigGlyphs[0].y, b.lines[2]); // B♭ on the middle line
});
