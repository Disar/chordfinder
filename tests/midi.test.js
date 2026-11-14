import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest } from '../ui/theory.js';
import { progressionToMidi, voiceSequence, midiFileName, asciiChord } from '../ui/midi.js';

/** Minimal SMF reader: returns header fields and absolute-time events. */
function parse(bytes) {
  const b = Buffer.from(bytes);
  assert.equal(b.toString('latin1', 0, 4), 'MThd');
  const format = b.readUInt16BE(8), tracks = b.readUInt16BE(10), ppq = b.readUInt16BE(12);
  assert.equal(b.toString('latin1', 14, 18), 'MTrk');
  const end = 22 + b.readUInt32BE(18);
  assert.equal(end, b.length, 'track length matches file');
  let i = 22, t = 0, status = 0;
  const vlq = () => { let n = 0, c; do { c = b[i++]; n = (n << 7) | (c & 0x7f); } while (c & 0x80); return n; };
  const events = [];
  while (i < end) {
    t += vlq();
    status = b[i] & 0x80 ? b[i++] : status;
    if (status === 0xff) {
      const type = b[i++], len = vlq();
      events.push({ t, meta: type, data: b.subarray(i, i + len) });
      i += len;
    } else {
      events.push({ t, kind: status & 0xf0, note: b[i], vel: b[i + 1] });
      i += 2;
    }
  }
  return { format, tracks, ppq, events };
}

test('progression exports as a valid, playable MIDI file', () => {
  const s = suggest({ rootPc: 0, modeId: 'ionian' });
  const main = s.templates[0];
  const chords = [s.tonic, ...main.chords, s.tonic]; // resolves home
  const midi = parse(progressionToMidi(chords, { bpm: 120, name: main.name }));
  assert.deepEqual([midi.format, midi.tracks, midi.ppq], [0, 1, 480]);

  const tempo = midi.events.find((e) => e.meta === 0x51).data;
  assert.equal((tempo[0] << 16) | (tempo[1] << 8) | tempo[2], 500000); // 120 bpm
  assert.equal(midi.events.at(-1).meta, 0x2f);

  // Every chord: all notes start together, last two beats, and match the voicing.
  const ons = midi.events.filter((e) => e.kind === 0x90);
  const offs = midi.events.filter((e) => e.kind === 0x80);
  const voiced = voiceSequence(chords);
  assert.equal(ons.length, voiced.flat().length);
  assert.equal(offs.length, ons.length);
  voiced.forEach((notes, k) => {
    const at = ons.filter((e) => e.t === k * 960).map((e) => e.note);
    assert.deepEqual(at, notes, `chord ${k}`);
    // C E G on the tonic, A C E on vi …
    assert.deepEqual([...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b),
      [...new Set([chords[k].pc, ...chords[k].semis.map((x) => (chords[k].pc + x) % 12)])].sort((a, b) => a - b));
  });
  assert.equal(Math.max(...offs.map((e) => e.t)), chords.length * 960);
  const markers = midi.events.filter((e) => e.meta === 0x06).map((e) => e.data.toString('latin1'));
  assert.deepEqual(markers, ['C', 'Am', 'F', 'G', 'C']);
});

test('file names are safe and readable', () => {
  assert.equal(midiFileName('E♭', 'Dorian', 'Modal rock'), 'Eb Dorian - Modal rock.mid');
  assert.equal(midiFileName('F♯', 'Aeolian', 'ii°–V: "noir"/tense?'), 'F# Aeolian - iidim-V noirtense.mid');
  assert.equal(asciiChord('F♯°'), 'F#dim');
  assert.equal(asciiChord('Bø7'), 'Bm7b5');
  assert.equal(asciiChord('A♭maj7'), 'Abmaj7');
});

test('every chord name exports as clean ASCII', async () => {
  const { MODES, MODIFIERS } = await import('../ui/theory.js');
  for (let pc = 0; pc < 12; pc++) for (const m of MODES) for (const mod of MODIFIERS) for (const color of ['triad', 'seventh']) {
    const s = suggest({ rootPc: pc, modeId: m.id, modifier: mod.id, color, borrowed: true });
    for (const c of [s.tonic, ...s.templates.flatMap((t) => t.chords)]) {
      assert.match(asciiChord(c.name), /^[\x20-\x7e]+$/, c.name);
    }
  }
});

test('per-chord lengths make a loop of whole bars', () => {
  const s = suggest({ rootPc: 9, modeId: 'aeolian', styleId: 'edm' });
  const t = s.templates[0]; // i–♭VI–♭III–♭VII
  const chords = [s.tonic, ...t.chords, t.chords[0]]; // 5 chords -> padded to 8 bars
  // Same rule as the app's loop mode: 1 bar each, last chord fills to 8 bars.
  const beats = chords.map(() => 4);
  beats[beats.length - 1] += (Math.ceil(chords.length / 4) * 4 - chords.length) * 4;
  const midi = parse(progressionToMidi(chords, { bpm: 128, beats }));
  const starts = [...new Set(midi.events.filter((e) => e.kind === 0x90).map((e) => e.t))];
  assert.deepEqual(starts, [0, 1920, 3840, 5760, 7680]); // one bar apart
  assert.equal(Math.max(...midi.events.filter((e) => e.kind === 0x80).map((e) => e.t)), 8 * 1920); // exactly 8 bars
});
