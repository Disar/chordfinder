import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRET_DRILLS, FRET_LEVELS, PRACTICE_FRETS, makeFretQuestion, isFretRight, fretsOf, levelStrings, pcName, nearestString } from '../ui/fretquiz.js';
import { FRETTED } from '../ui/guitar.js';
import { mod } from '../ui/theory.js';

/** Deterministic rng for repeatable runs. */
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

test('find questions point at real spots on the asked string', () => {
  for (const inst of FRETTED) for (let level = 0; level < FRET_LEVELS.length; level++) {
    const rng = seeded(7 + level);
    let prev = null;
    for (let i = 0; i < 200; i++) {
      const q = makeFretQuestion({ drill: 'find', level, instrumentId: inst.id, prev, rng });
      assert.ok(levelStrings(inst.id, level).includes(q.string));
      if (FRET_LEVELS[level].naturals) assert.ok([0, 2, 4, 5, 7, 9, 11].includes(q.pc));
      assert.ok(q.answers.length >= 1 && q.answers.length <= 2);
      for (const f of q.answers) {
        assert.ok(f >= 0 && f <= PRACTICE_FRETS);
        assert.equal(mod(inst.strings[q.string] + f, 12), q.pc);
        assert.ok(isFretRight(q, { string: q.string, fret: f }));
      }
      assert.ok(!isFretRight(q, { string: q.string, fret: q.answers[0] + 1 }));
      if (inst.strings.length > 1) assert.ok(!isFretRight(q, { string: (q.string + 1) % inst.strings.length, fret: q.answers[0] }));
      if (prev) assert.ok(!(prev.string === q.string && prev.pc === q.pc), 'no repeat');
      prev = q;
    }
  }
});

test('name questions have the right answer among the options', () => {
  for (const inst of FRETTED) for (let level = 0; level < FRET_LEVELS.length; level++) {
    const rng = seeded(3 + level);
    for (let i = 0; i < 200; i++) {
      const q = makeFretQuestion({ drill: 'name', level, instrumentId: inst.id, rng });
      assert.equal(mod(inst.strings[q.string] + q.fret, 12), q.pc);
      assert.ok(q.fret >= 0 && q.fret <= PRACTICE_FRETS);
      assert.ok(q.options.some((o) => o.id === q.answer));
      assert.equal(q.options.length, FRET_LEVELS[level].naturals ? 7 : 12);
      assert.ok(isFretRight(q, q.answer));
      assert.ok(!isFretRight(q, String((q.pc + 1) % 12)));
    }
  }
});

test('low-string level only asks the two lowest strings', () => {
  assert.deepEqual(levelStrings('guitar', 0), [0, 1]);
  assert.deepEqual(levelStrings('guitar', 1), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(levelStrings('bass', 2), [0, 1, 2, 3]);
});

test('notes on a string within 12 frets: E on low E is open and 12th', () => {
  assert.deepEqual(fretsOf(40, 4), [0, 12]);
  assert.deepEqual(fretsOf(40, 7), [3]);
  assert.equal(pcName(1), 'D♭/C♯'); // same as the root picker
  assert.equal(pcName(9), 'A');
  assert.equal(FRET_DRILLS.length, 2);
});

test('string tuner picks the nearest open string', () => {
  const g = FRETTED[0].strings;
  assert.deepEqual(nearestString(45, -12, g), { string: 1, open: 45, cents: -12 });
  assert.deepEqual(nearestString(40, 30, g), { string: 0, open: 40, cents: 30 });
  assert.equal(nearestString(57, 0, g).string, 3); // A3 is closest to the G string (G3)
  assert.equal(nearestString(66, 0, g).string, 5);
});
