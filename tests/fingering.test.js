import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingeringsFor, KEYS, LAYOUTS, DIAGRAM, shapeBox } from '../ui/fingering.js';
import { SAX_RANGE } from '../ui/horn.js';

const ids = new Set(KEYS.map((k) => k.id));
const std = (m) => fingeringsFor(m)[0].keys;
const has = (m, k) => std(m).includes(k);

test('every written note in range has a fingering made of real keys', () => {
  for (let m = SAX_RANGE.low; m <= SAX_RANGE.high; m++) {
    const fs = fingeringsFor(m);
    assert.ok(fs.length >= 1, `no fingering for ${m}`);
    for (const x of fs) for (const k of x.keys) assert.ok(ids.has(k), `unknown key ${k}`);
    for (const x of fs.slice(1)) assert.ok(x.name && x.tip, `alternate for ${m} needs a name and tip`);
  }
  assert.equal(fingeringsFor(57).length, 0);
  assert.equal(fingeringsFor(91).length, 0);
});

test('octave key from middle D up, never below', () => {
  for (let m = SAX_RANGE.low; m <= SAX_RANGE.high; m++) assert.equal(has(m, 'oct'), m >= 74, `octave key on ${m}`);
});

test('second octave = first octave + octave key', () => {
  for (let m = 74; m <= 85; m++) {
    const a = fingeringsFor(m), b = fingeringsFor(m - 12);
    assert.equal(a.length, b.length);
    a.forEach((x, i) => assert.deepEqual(x.keys, ['oct', ...b[i].keys]));
  }
});

test('palm keys only for high D and up', () => {
  for (let m = SAX_RANGE.low; m <= SAX_RANGE.high; m++) {
    const palm = std(m).some((k) => k.startsWith('palm'));
    assert.equal(palm, m >= 86, `palm keys on ${m}`);
  }
});

test('spot checks against the Woodwind Fingering Guide', () => {
  assert.deepEqual(std(61), ['L1', 'L2', 'L3', 'lowCs', 'R1', 'R2', 'R3', 'lowC']); // low C♯
  assert.deepEqual(std(72), ['L2']); // middle C
  assert.deepEqual(std(73), []); // C♯: all open
  assert.deepEqual(fingeringsFor(70).find((x) => x.name === 'Side B♭').keys, ['L1', 'L2', 'sideBb']);
  assert.deepEqual(std(89), ['oct', 'palmD', 'palmEb', 'palmF', 'sideE']); // high F
  assert.ok(has(90, 'highFs'));
});

test('every diagram layout draws every key inside the box, without overlaps', () => {
  for (const l of LAYOUTS) {
    assert.deepEqual(Object.keys(l.keys).sort(), [...ids].sort(), `${l.id}: keys`);
    const boxes = Object.entries(l.keys).map(([id, s]) => [id, shapeBox(s)]);
    for (const [id, [x0, y0, x1, y1]] of boxes) {
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= DIAGRAM.w && y1 <= DIAGRAM.h, `${l.id}: ${id} outside the box`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, A] = boxes[i], [b, B] = boxes[j];
      const overlap = A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3];
      assert.ok(!overlap, `${l.id}: ${a} overlaps ${b}`);
    }
  }
});
