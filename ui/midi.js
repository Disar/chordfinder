// Voicing shared by the synth and the MIDI export, plus a Standard MIDI File
// writer. Pure functions only, testable with Node.

/** Close-position voicing near the previous chord's centre, plus a bass root.
 *  Returns MIDI note numbers and the centre to voice the next chord around. */
export function voiceChord(chord, center = 62) {
  const bass = 40 + ((chord.pc - 4 + 12) % 12); // E2..D♯3
  const upper = chord.semis.map((s) => {
    let m = 48 + ((chord.pc + s) % 12);
    while (m + 6 < center) m += 12;
    return m;
  }).sort((a, b) => a - b);
  const next = upper.reduce((a, b) => a + b, 0) / upper.length;
  return { notes: [bass, ...upper], center: Math.min(68, Math.max(58, next)) };
}

/** Voices a whole progression with smooth voice leading. */
export function voiceSequence(chords) {
  let center = 62;
  return chords.map((c) => {
    const v = voiceChord(c, center);
    center = v.center;
    return v.notes;
  });
}

const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

/** Spells chord symbols in plain ASCII: E♭ → Eb, F♯° → F#dim, Bø7 → Bm7b5. */
export const asciiChord = (s) => s
  .replaceAll('♭', 'b').replaceAll('♯', '#')
  .replaceAll('ø7', 'm7b5').replaceAll('ø', 'm7b5').replaceAll('°', 'dim')
  .replaceAll('–', '-').replaceAll('—', '-');

const ascii = (s) => [...s].map((ch) => {
  const c = ch.codePointAt(0);
  return c < 128 ? c : 63; // '?' for anything outside ASCII
});

/** Builds a format-0 Standard MIDI File. `beats` is the length of every chord,
 *  or a list with one length per chord. */
export function progressionToMidi(chords, { bpm = 96, beats = 2, name = 'Chordfinder' } = {}) {
  const lengths = chords.map((_, i) => PPQ * (Array.isArray(beats) ? beats[i] : beats));
  const ev = [];
  const meta = (type, data) => ev.push(0, 0xff, type, ...vlq(data.length), ...data);
  meta(0x03, ascii(asciiChord(name))); // track name
  const tempo = Math.round(60_000_000 / bpm);
  meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
  meta(0x58, [4, 2, 24, 8]); // 4/4
  voiceSequence(chords).forEach((notes, i) => {
    meta(0x06, ascii(asciiChord(chords[i].name)));
    notes.forEach((n, j) => ev.push(0, 0x90, n, j === 0 ? 96 : 84));
    notes.forEach((n, j) => ev.push(...vlq(j === 0 ? lengths[i] : 0), 0x80, n, 64));
  });
  ev.push(0, 0xff, 0x2f, 0); // end of track

  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  return new Uint8Array([
    ...ascii('MThd'), ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff,
    ...ascii('MTrk'), ...u32(ev.length), ...ev,
  ]);
}

const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const chunk = (id, data) => [...ascii(id), ...u32(data.length), ...data];

/** General MIDI programs (0-based) for each sax. */
export const GM_SAX = { soprano: 64, alto: 65, tenor: 66, bari: 67 };

/** A melody as MIDI. notes: [{ midi, beats, marker? }] in sounding pitch;
 *  a marker names the chord the note belongs to. With `chords` (and their
 *  `chordBeats`) it is a format-1 file with a second track for the chords,
 *  so they can be muted or deleted separately. */
export function melodyToMidi(notes, { bpm = 96, name = 'Chordfinder', program = 65, chords = null, chordBeats = null } = {}) {
  const lead = [];
  const meta = (ev, type, data) => ev.push(0, 0xff, type, ...vlq(data.length), ...data);
  meta(lead, 0x03, ascii(asciiChord(name)));
  const tempo = Math.round(60_000_000 / bpm);
  meta(lead, 0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
  meta(lead, 0x58, [4, 2, 24, 8]);
  lead.push(0, 0xc0, program & 0x7f);
  for (const n of notes) {
    if (n.marker) meta(lead, 0x06, ascii(asciiChord(n.marker)));
    lead.push(0, 0x90, n.midi, 100, ...vlq(Math.round(PPQ * n.beats)), 0x80, n.midi, 64);
  }
  lead.push(0, 0xff, 0x2f, 0);
  if (!chords) return new Uint8Array([...chunk('MThd', [0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff]), ...chunk('MTrk', lead)]);

  const back = [];
  meta(back, 0x03, ascii('Chords'));
  back.push(0, 0xc1, 0); // piano on channel 2
  voiceSequence(chords).forEach((vs, i) => {
    vs.forEach((m, j) => back.push(0, 0x91, m, j === 0 ? 80 : 70));
    vs.forEach((m, j) => back.push(...vlq(j === 0 ? Math.round(PPQ * chordBeats[i]) : 0), 0x81, m, 64));
  });
  back.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([...chunk('MThd', [0, 1, 0, 2, (PPQ >> 8) & 0xff, PPQ & 0xff]), ...chunk('MTrk', lead), ...chunk('MTrk', back)]);
}

/** General MIDI programs (0-based): steel-string acoustic guitar, finger bass. */
export const GM_GUITAR = 25, GM_BASS = 33;

/** Overlapping notes as a format-0 MIDI file. notes: [{ midi, at, dur
 *  (beats), vel? }], markers: [{ at, text }] (e.g. chord names). */
export function notesToMidi(notes, { bpm = 96, name = 'Chordfinder', program = GM_GUITAR, markers = [] } = {}) {
  const tick = (b) => Math.round(PPQ * b);
  // Absolute-time events; at equal times: markers, then note-offs, then note-ons.
  const evs = [
    ...markers.map((m) => ({ t: tick(m.at), o: 0, bytes: [0xff, 0x06, ...vlq(ascii(asciiChord(m.text)).length), ...ascii(asciiChord(m.text))] })),
    ...notes.flatMap((n) => [
      { t: tick(n.at), o: 2, bytes: [0x90, n.midi, n.vel ?? 90] },
      { t: Math.max(tick(n.at) + 1, tick(n.at + n.dur)), o: 1, bytes: [0x80, n.midi, 64] },
    ]),
  ].sort((a, b) => a.t - b.t || a.o - b.o);
  const ev = [];
  const meta = (type, data) => ev.push(0, 0xff, type, ...vlq(data.length), ...data);
  meta(0x03, ascii(asciiChord(name)));
  const tempo = Math.round(60_000_000 / bpm);
  meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]);
  meta(0x58, [4, 2, 24, 8]);
  ev.push(0, 0xc0, program & 0x7f);
  let now = 0;
  for (const e of evs) {
    ev.push(...vlq(e.t - now), ...e.bytes);
    now = e.t;
  }
  ev.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([...chunk('MThd', [0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff]), ...chunk('MTrk', ev)]);
}

/** A file name that is safe on every OS, e.g. "Eb Dorian - Modal rock.mid". */
export function midiFileName(keyName, modeName, branchName) {
  const raw = asciiChord(`${keyName} ${modeName} - ${branchName}`);
  return raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) + '.mid';
}
