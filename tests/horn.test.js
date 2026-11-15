import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hornView, spelledScale, formatNote, solfa, degreeLabel, registerOf, SAX_RANGE,
  chordLayer, chordSymbol, guideLine, instrumentById } from '../ui/horn.js';
import { modeById, spellKey, buildChord } from '../ui/theory.js';

const names = (s) => s.notes.map((n) => n.name).join(' ');
const view = (o) => hornView({ instrumentId: 'alto', rootPc: 0, modeId: 'ionian', ...o });

test('written keys per instrument for concert C major', () => {
  assert.equal(view({ instrumentId: 'alto' }).key.name, 'A');
  assert.equal(view({ instrumentId: 'bari' }).key.name, 'A');
  assert.equal(view({ instrumentId: 'tenor' }).key.name, 'D');
  assert.equal(view({ instrumentId: 'soprano' }).key.name, 'D');
  assert.equal(view({ pitch: 'concert' }).key.name, 'C');
});

test('written key picks the simpler spelling', () => {
  // Concert B major (5♯) on alto is A♭ major (4♭), not G♯ major.
  assert.equal(view({ rootPc: 11 }).key.name, 'A♭');
  // Concert E♭ major on alto is C major.
  assert.equal(view({ rootPc: 3 }).key.name, 'C');
});

test('range: written B♭3–F♯6 on every sax, sounding lower', () => {
  for (const id of ['soprano', 'alto', 'tenor', 'bari']) {
    const c = view({ instrumentId: id }).cells;
    assert.equal(c[0].midi, SAX_RANGE.low);
    assert.equal(c.at(-1).midi, SAX_RANGE.high);
  }
  const alto = view({ pitch: 'concert' }).cells;
  assert.equal(alto[0].midi, 49); // D♭3
  assert.equal(alto.at(-1).midi, 81); // A5
  assert.equal(view({ instrumentId: 'bari', pitch: 'concert' }).cells[0].midi, 37); // D♭2
});

test('cells carry the other pitch with matching spelling', () => {
  // Alto, concert E♭ major = written C major: written C sounds E♭.
  const c = view({ rootPc: 3 }).cells.find((x) => x.midi === 60);
  assert.equal(formatNote(c.letter, c.acc), 'C');
  assert.equal(formatNote(c.other.letter, c.other.acc), 'E♭');
  assert.equal(c.sound, 51);
  assert.equal(c.other.octave, 3);
  assert.ok(c.tonic);
});

test('registers follow written pitch', () => {
  assert.equal(registerOf(58), 'low');
  assert.equal(registerOf(73), 'low'); // C♯5
  assert.equal(registerOf(74), 'mid'); // D5: octave key
  assert.equal(registerOf(86), 'high'); // D6: palm keys
  // Concert view still uses the written register.
  const c = view({ pitch: 'concert' }).cells.find((x) => x.midi === 65); // concert F4 = written D5
  assert.equal(c.register, 'mid');
});

test('pentatonic and blues spelling', () => {
  const ion = modeById('ionian');
  assert.equal(names(spelledScale(0, ion, 'majpent')), 'C D E G A');
  assert.equal(names(spelledScale(9, ion, 'minpent')), 'A C D E G');
  assert.equal(names(spelledScale(0, ion, 'blues')), 'C E♭ F G♭ G B♭');
  assert.equal(names(spelledScale(3, ion, 'blues')), 'E♭ G♭ A♭ A B♭ D♭');
  // Minor pentatonic on pc 1 is C♯ minor, not D♭ minor.
  assert.equal(names(spelledScale(1, ion, 'minpent')), 'C♯ E F♯ G♯ B');
});

test('note name styles', () => {
  assert.equal(formatNote(6, -1, 'dutch'), 'Bes');
  assert.equal(formatNote(3, 1, 'dutch'), 'Fis');
  assert.equal(formatNote(2, -1, 'dutch'), 'Es');
  assert.equal(formatNote(5, -1, 'dutch'), 'As');
  assert.equal(formatNote(2, -2, 'dutch'), 'Eses');
  assert.equal(formatNote(1, -1, 'dutch'), 'Des');
  assert.equal(formatNote(6, 0, 'dutch'), 'B');
  assert.equal(formatNote(6, -1, 'fixed'), 'Si♭');
  assert.equal(formatNote(4, 0, 'fixed'), 'Sol');
  assert.equal(formatNote(3, 1, 'letters'), 'F♯');
});

test('movable do, Do- and La-based', () => {
  const syl = (pc, mode, scale, o) => {
    const s = spelledScale(pc, modeById(mode), scale);
    return s.notes.map((n) => solfa(n, s.tonic, { minor: s.minor, ...o })).join(' ');
  };
  assert.equal(syl(7, 'ionian', 'mode'), 'Do Re Mi Fa Sol La Ti');
  assert.equal(syl(9, 'aeolian', 'mode'), 'Do Re Me Fa Sol Le Te');
  assert.equal(syl(9, 'aeolian', 'mode', { la: true }), 'La Ti Do Re Mi Fa Sol');
  assert.equal(syl(9, 'harmonic', 'mode', { la: true }), 'La Ti Do Re Mi Fa Si');
  assert.equal(syl(0, 'ionian', 'blues'), 'Do Me Fa Se Sol Te');
  assert.equal(syl(5, 'lydian', 'mode'), 'Do Re Mi Fi Sol La Ti');
  // La-based only applies to minor scales.
  assert.equal(syl(0, 'ionian', 'mode', { la: true }), 'Do Re Mi Fa Sol La Ti');
});

test('degree labels', () => {
  const s = spelledScale(0, modeById('ionian'), 'blues');
  assert.equal(s.notes.map((n) => degreeLabel(n, s.tonic)).join(' '), '1 ♭3 4 ♭5 5 ♭7');
});

// ---------------------------------------------------------------- phase 2

const ion = modeById('ionian');
const cKey = spellKey(0, ion);
const ch = (tok, color = 'triad', key = cKey, mode = ion) => buildChord(key, mode, tok, { color });
const nm = (ns) => ns.map((n) => formatNote(n.letter, n.acc)).join(' ');

test('chord-scale: key notes, changed only where the chord forces it', () => {
  const ii = chordLayer(ch('ii', 'seventh'), cKey, cKey);
  assert.equal(nm(ii.scale), 'D E F G A B C');
  assert.equal(ii.scaleMode.name, 'Dorian');
  assert.equal(ii.changes.length, 0);

  // Borrowed chords take the scale of the mode they come from.
  const changes = (l) => l.changes.map((c) => `${c.from.name}>${formatNote(c.to.letter, c.to.acc)}`);
  const iv = chordLayer(ch('iv', 'seventh'), cKey, cKey); // Fm7 from C minor
  assert.equal(nm(iv.scale), 'F G A♭ B♭ C D E♭');
  assert.equal(iv.scaleMode.name, 'Dorian');
  assert.deepEqual(changes(iv), ['A>A♭', 'B>B♭', 'E>E♭']);
  const bIII = chordLayer(ch('bIII', 'seventh'), cKey, cKey); // E♭maj7 from C minor
  assert.equal(nm(bIII.scale), 'E♭ F G A♭ B♭ C D');
  assert.equal(bIII.scaleMode.name, 'Ionian');
  const bVII = chordLayer(ch('bVII'), cKey, cKey); // B♭ from C Mixolydian
  assert.equal(bVII.scaleMode.name, 'Lydian');
  assert.deepEqual(changes(bVII), ['B>B♭']);

  const vOfV = chordLayer(ch('V/V'), cKey, cKey);
  assert.equal(nm(vOfV.scale), 'D E F♯ G A B C');
  assert.equal(vOfV.scaleMode.name, 'Mixolydian');
});

test('chord tones, functions and guide tones', () => {
  const g7 = chordLayer(ch('V7'), cKey, cKey);
  assert.deepEqual(g7.tones.map((t) => t.fn), ['R', '3', '5', '7']);
  assert.equal(nm(g7.tones.filter((t) => t.guide)), 'B F');
  // A triad has no 7th: guide tones are the 3rd and the root.
  assert.equal(nm(chordLayer(ch('IV'), cKey, cKey).tones.filter((t) => t.guide)), 'F A');
  // Power chord: root and 5th.
  assert.equal(nm(chordLayer(ch('V5'), cKey, cKey).tones.filter((t) => t.guide)), 'G D');
});

test('chord symbols transpose with the key', () => {
  const altoKey = spellKey(9, ion); // concert C = written A on alto
  assert.equal(chordSymbol(chordLayer(ch('ii', 'seventh'), cKey, altoKey)), 'Bm7');
  assert.equal(chordSymbol(chordLayer(ch('bVII'), cKey, altoKey)), 'G');
  // Concert B major on alto is written A♭: its V (F♯) becomes E♭, not D♯.
  const bKey = spellKey(11, ion), abKey = spellKey(8, ion);
  assert.equal(chordSymbol(chordLayer(ch('V', 'triad', bKey), bKey, abKey)), 'E♭');
  assert.equal(chordSymbol(chordLayer(ch('ii', 'seventh'), cKey, cKey), 'fixed'), 'Rem7');
});

test('chord view cells mark chord tones and guide tones', () => {
  const h = hornView({ instrumentId: 'alto', pitch: 'concert', rootPc: 0, modeId: 'ionian', chord: ch('V7') });
  const g = h.cells.find((c) => c.pc === 7);
  assert.ok(g.tonic && g.fn === 'R' && !g.guide);
  const b = h.cells.find((c) => c.pc === 11);
  assert.ok(b.guide && b.fn === '3');
  assert.equal(h.cells.find((c) => c.pc === 9).fn, null); // A: in the scale, not a chord tone
  assert.ok(h.cells.find((c) => c.pc === 9).inScale);
});

test('guide-tone line moves by the smallest steps', () => {
  const alto = instrumentById('alto');
  const layers = ['ii', 'V', 'I'].map((t) => chordLayer(ch(t, 'seventh'), cKey, cKey));
  const line = guideLine(layers, alto, 'concert');
  assert.equal(nm(line), 'F F E');
  for (let i = 1; i < line.length; i++) assert.ok(Math.abs(line[i].midi - line[i - 1].midi) <= 2);
  // Stays in the middle of the horn: written C4–E5.
  const aKey = spellKey(9, ion); // written key for alto
  const w = guideLine(['ii', 'V', 'I'].map((t) => chordLayer(ch(t, 'seventh'), cKey, aKey)), alto, 'written');
  assert.equal(nm(w), 'D D C♯');
  for (const n of w) assert.ok(n.midi >= 60 && n.midi <= 76);
  // Same sounding notes whichever pitch is shown.
  assert.deepEqual(w.map((n) => n.sound), line.map((n) => n.sound));
});
