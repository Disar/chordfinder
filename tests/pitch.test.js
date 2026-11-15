import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, noteOf, freqOf, noteTracker } from '../ui/pitch.js';

const SR = 48000, N = 2048;

/** A sax-like tone: fundamental plus strong harmonics, a little noise. */
function tone(hz, { harmonics = [1, 0.8, 0.6, 0.45, 0.3, 0.2], noise = 0.01, amp = 0.3 } = {}) {
  const buf = new Float32Array(N);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < N; i++) {
    let s = 0;
    harmonics.forEach((a, k) => { s += a * Math.sin(2 * Math.PI * hz * (k + 1) * i / SR + k); });
    buf[i] = amp * s / harmonics.length + noise * rnd();
  }
  return buf;
}

test('detects sax-range tones within a few cents', () => {
  // Concert D♭2 (bari low B♭) up to E6 (soprano high F♯).
  for (const midi of [37, 44, 49, 56, 61, 69, 76, 81, 88]) {
    const f = detectPitch(tone(freqOf(midi)), SR, { minHz: 60, maxHz: 1500 });
    assert.ok(f, `no pitch for ${midi}`);
    const n = noteOf(f);
    assert.equal(n.midi, midi, `octave/semitone error at ${midi}: got ${n.midi}`);
    assert.ok(Math.abs(n.cents) <= 3, `cents off at ${midi}: ${n.cents}`);
  }
});

test('reports how far off a detuned note is', () => {
  const f = detectPitch(tone(freqOf(69) * 2 ** (20 / 1200)), SR); // A4 +20 cents
  assert.deepEqual(noteOf(f), { midi: 69, cents: 20 });
});

test('a weak fundamental is not mistaken for the octave', () => {
  const f = detectPitch(tone(freqOf(57), { harmonics: [0.3, 1, 0.7, 0.5, 0.3] }), SR);
  assert.equal(noteOf(f).midi, 57);
});

test('silence and noise give no pitch', () => {
  assert.equal(detectPitch(new Float32Array(N), SR), null);
  const noise = tone(440, { harmonics: [], noise: 0.3 });
  assert.equal(detectPitch(noise, SR), null);
});

test('tracker waits for a steady note and lets go after silence', () => {
  const track = noteTracker({ hold: 100, release: 200 });
  const a = freqOf(69);
  assert.equal(track(a, 0), null);
  assert.equal(track(a, 50), null);
  assert.equal(track(a, 110).midi, 69);
  assert.equal(track(null, 200).midi, 69); // short gap: keep it
  assert.equal(track(null, 400), null); // released
  assert.equal(track(freqOf(70), 410), null); // new note must settle again
});
