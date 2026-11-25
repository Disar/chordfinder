import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRUMS, STYLE_STRUM, strumById, styleStrum, counts, strumBar, strumProgression, strumNotes } from '../ui/strum.js';
import { STYLES } from '../ui/theory.js';
import { notesToMidi } from '../ui/midi.js';

const C = [48, 52, 55, 60, 64]; // x32010

test('patterns are one bar of 8 or 16 valid steps', () => {
  const ids = new Set();
  for (const p of STRUMS) {
    assert.ok([8, 16].includes(p.steps.length), p.id);
    assert.match(p.steps, /^[DUx\-1-6]+$/, p.id);
    assert.ok(p.tip && p.name, p.id);
    assert.ok(!ids.has(p.id));
    ids.add(p.id);
    assert.equal(counts(p).length, p.steps.length);
  }
});

test('every style has a pattern', () => {
  for (const s of STYLES) {
    assert.ok(STYLE_STRUM[s.id], s.id);
    assert.equal(styleStrum(s.id).id, STYLE_STRUM[s.id]);
  }
  assert.equal(strumById('nope').id, STRUMS[0].id);
});

test('a bar fills four beats, hits in order, rests ring on', () => {
  for (const p of STRUMS) {
    const ev = strumBar(p, C);
    assert.equal(ev.length, [...p.steps].filter((c) => c !== '-').length, p.id);
    ev.forEach((e, i) => {
      assert.ok(e.at >= 0 && e.at < 4 && e.dur > 0, p.id);
      if (i) assert.ok(e.at > ev[i - 1].at, p.id);
      assert.ok(e.at + e.dur <= 4 + 1e-9, p.id);
      assert.ok(e.notes.length >= 1 && e.notes.every((m) => C.includes(m)), p.id);
    });
  }
  const folk = strumBar(strumById('folk'), C); // D - D U - U D U
  assert.deepEqual(folk.map((e) => e.at), [0, 1, 1.5, 2.5, 3, 3.5]);
  assert.equal(folk[0].dur, 1); // the first down rings through the rest
  assert.deepEqual(folk.map((e) => e.kind), ['down', 'down', 'up', 'up', 'down', 'up']);
});

test('downstrokes go low to high, upstrokes catch the top strings high to low', () => {
  const [d, u] = strumBar(strumById('shuffle'), C);
  assert.deepEqual(d.notes, C);
  assert.deepEqual(u.notes, [64, 60, 55, 52]);
  assert.ok(d.gain > u.gain);
});

test('swing puts the off-beats at two thirds of the beat', () => {
  const ev = strumBar(strumById('shuffle'), C);
  assert.ok(Math.abs(ev[1].at - 2 / 3) < 1e-9);
  assert.ok(Math.abs(ev[0].dur - 2 / 3) < 1e-9);
  assert.ok(Math.abs(ev[1].dur - 1 / 3) < 1e-9);
});

test('fingerpicking plays single strings, clamped to the shape', () => {
  const ev = strumBar(strumById('picked'), [40, 47, 52]); // a power chord: 3 strings
  assert.ok(ev.every((e) => e.notes.length === 1));
  assert.deepEqual(ev.map((e) => e.notes[0]), [40, 52, 47, 52, 52, 52, 47, 52]);
});

test('short patterns and chucks are clipped', () => {
  assert.ok(strumBar(strumById('skank'), C).every((e) => e.dur <= 0.3));
  assert.ok(strumBar(strumById('rumba'), C).filter((e) => e.kind === 'chuck').every((e) => e.dur <= 0.12));
});

test('a progression repeats the bar for each chord’s length', () => {
  const ev = strumProgression(strumById('quarters'), [C, [43, 47, 50, 55, 59, 67]], [8, 4]);
  assert.equal(ev.length, 12);
  assert.deepEqual(ev.map((e) => e.chord), [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
  assert.equal(ev[8].at, 8);
  const notes = strumNotes(ev);
  assert.equal(notes.length, 8 * 5 + 4 * 6);
  assert.ok(notes[1].at > notes[0].at);
});

test('a 2-beat chord strums the first half of the bar', () => {
  const ev = strumProgression(strumById('quarters'), [C, C], [2, 2]);
  assert.deepEqual(ev.map((e) => e.at), [0, 1, 2, 3]);
  assert.deepEqual(ev.map((e) => e.chord), [0, 0, 1, 1]);
  assert.ok(ev.every((e) => e.at + e.dur <= (e.chord + 1) * 2 + 1e-9));
});

test('strummed MIDI is a valid single-track file', () => {
  const ev = strumProgression(strumById('folk'), [C], [4]);
  const bytes = notesToMidi(strumNotes(ev), { bpm: 100, markers: [{ at: 0, text: 'C' }] });
  const s = String.fromCharCode(...bytes.slice(0, 4));
  assert.equal(s, 'MThd');
  assert.equal(String.fromCharCode(...bytes.slice(14, 18)), 'MTrk');
  const len = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
  assert.equal(bytes.length, 22 + len);
  // Ends with end-of-track; every note-on has a note-off.
  assert.deepEqual([...bytes.slice(-3)], [0xff, 0x2f, 0]);
  const on = [...bytes].filter((b, i) => b === 0x90 && i > 22).length;
  const off = [...bytes].filter((b, i) => b === 0x80 && i > 22).length;
  assert.equal(on, off);
});

test('custom patterns: typing, cycling, resizing', async () => {
  const { customStrum, cleanSteps, cycleStep, resizeSteps } = await import('../ui/strum.js');
  assert.equal(cleanSteps('d.du uDu'), 'D-DU-UDU');
  assert.equal(cleanSteps('DXDX DXD'), 'DxDx-DxD');
  assert.equal(cleanSteps('DDD'), null);
  assert.equal(cleanSteps('D-Q-D-D-'), null);
  assert.equal(cleanSteps('1324132413241324'), '1324132413241324');
  assert.deepEqual(['D', 'U', 'x', '-', '3'].map((c) => cycleStep(c)), ['U', 'x', '-', 'D', 'D']);
  assert.equal(cycleStep('D', true), '-');
  assert.equal(resizeSteps('D-DU-UDU', 16), 'D---D-U---U-D-U-');
  assert.equal(resizeSteps('D---D-U---U-D-U-', 8), 'D-DU-UDU');
  const c = customStrum({ steps: 'bad' });
  assert.equal(c.steps, 'D-D-D-D-');
  assert.equal(customStrum({ steps: 'D-DU-UDUD-DU-UDU', swing: true }).swing, false); // swing is 8ths only
  const bar = strumBar(customStrum({ steps: 'DUDUDUDU', swing: true, short: true }), C);
  assert.equal(bar.length, 8);
  assert.ok(bar.every((e) => e.dur <= 0.3));
});
