// Piano view (DOM). Keyboard with scales and fingerings, voicings with
// voice leading, extensions, reharmonisation, comping, grand staff, MIDI
// keyboard / computer-key input with chord recognition, and practice drills.
// app.js passes its shared helpers in `initPiano(ctx)`.

import { SPELLINGS, noteName, mod, MODES } from './theory.js';
import { SCALES, formatNote, solfa, degreeLabel, octaveOf } from './horn.js';
import { keySignature, layoutGrand } from './staff.js';
import { playNote, playNotes, playLine, playAlong, stop } from './audio.js';
import { notesToMidi, midiFileName } from './midi.js';
import { record, accuracy, ready, emptyStats } from './quiz.js';
import {
  PIANO_SIZES, pianoSize, isBlack, keyboardView, scaleRun, EXTENSIONS, VOICINGS, voicingById, effectiveExt,
  colorChord, voicingsFor, voiceLead, voicingFingers, handSpan, identifyChord, readInKey,
} from './piano.js';
import { REHARMS, reharmonize, reharmBeats } from './reharm.js';
import { COMPS, compById, styleComp, compProgression, compNotes } from './comp.js';
import { PIANO_DRILLS, pianoDrillById, makePianoQuestion, playedRight, answerPcs, QUALITY_NAMES } from './pianoquiz.js';

export const GM_PIANO = 0;

let C = null; // ctx from app.js
let pFocus = null; // null = the scale, else an index into the progression's items
let pAlt = {}; // voicings picked with ◀ ▶, by `${index}:${chord name}`
let pOptsOpen = false, pPlaying = false, pAlong = false;
const held = new Set(); // notes held on the MIDI keyboard / computer keys / clicked in practice
let midiAccess = null, midiErr = null;
let pQuiz = null; // { q, answered: null | true | false, shown }
let pResetArmed = 0;

const S = () => C.state;
const $ = (id) => document.getElementById(id);
const esc = (s) => C.esc(s);

export function initPiano(ctx) {
  C = ctx;
  wire();
}

export const pianoBusy = () => pPlaying || pAlong;
export function resetPiano({ key = false, voicing = false } = {}) {
  if (key) { pFocus = null; pQuiz = null; }
  if (key || voicing) pAlt = {};
}

// ------------------------------------------------------------ model

const currentComp = () => (S().comp === 'auto' ? styleComp(S().styleId) : compById(S().comp));
export { currentComp as pianoComp };

const extOf = () => effectiveExt(S().pVoicing, S().pExt);

/** The selected progression on the piano: reharmonised items, each chord
 *  coloured (extensions) and voiced; voicings voice-led, ◀ ▶ picks win. */
function pianoProgression() {
  const model = C.model(), b = C.selectedBranch();
  const { key, mode, tonic } = model.s;
  const items = reharmonize([tonic, ...b.chords], { key, mode, on: S().pReharm ?? [] });
  const ccs = items.map((it) => colorChord(it.chord, key, { ext: extOf(), altered: S().pAltered }));
  const vl = voiceLead(ccs, S().pVoicing);
  const pick = ccs.map((cc, i) => Math.min(vl.alts[i].length - 1, pAlt[`${i}:${cc.name}`] ?? vl.picks[i]));
  const voicings = pick.map((p, i) => vl.alts[i][p]);
  return { b, key, mode, items, ccs, alts: vl.alts, pick, voicings, beats: reharmBeats(items, S().bars) };
}

/** Voice-led piano voicings for any chords (the play panel's Piano toggle). */
export function panelVoicings(chords) {
  const key = C.model().s.key;
  const ccs = chords.map((c) => colorChord(c, key, { ext: extOf(), altered: S().pAltered }));
  const vl = voiceLead(ccs, S().pVoicing);
  return { ccs, voicings: vl.picks.map((p, i) => vl.alts[i][p]) };
}

/** Comp events for chords with the piano view's pattern. */
export const panelComp = (chords, beats) => compProgression(currentComp(), panelVoicings(chords).voicings, beats);
export const compMidiNotes = compNotes;

// ------------------------------------------------------------ labels

const nm = (n) => formatNote(n.letter, n.acc, S().names);
/** A chord symbol in the chosen note-name style (Dutch keeps letters). */
function chordLabel(cc) {
  const rn = noteName(cc.root.letter, cc.root.acc);
  return (S().names === 'fixed' ? formatNote(cc.root.letter, cc.root.acc, 'fixed') : rn) + cc.name.slice(rn.length);
}
const pcName = (pc) => { const [l, a] = SPELLINGS[mod(pc, 12)][0]; return formatNote(l, a, S().names === 'fixed' ? 'fixed' : 'letters'); };

function keyLabel(n, v, cc) {
  const L = S().pLabels;
  if (L === 'degrees') return cc ? (cc.tones.find((t) => t.pc === n.pc)?.label ?? cc.scale.find((t) => t.pc === n.pc)?.label ?? '') : degreeLabel(n, v.tonic);
  if (L === 'fingers') return nm(n);
  if (L === 'solfa') return solfa(n, v.keyTonic, { minor: v.mode.tonic !== 'I', la: S().minorDo === 'la' });
  return nm(n);
}

// ------------------------------------------------------------ keyboard SVG

const KW = 22, KH = 124, BW = 13, BH = 78;
const WHITE_X = [0, null, 1, null, 2, 3, null, 4, null, 5, null, 6];
const BLACK_SHIFT = { 1: -2, 3: 2, 6: -2.5, 8: 0, 10: 2.5 }; // black keys sit a little off the gap, as on a real keyboard

/** x of a key's left edge and its width (in key units of the range). */
function keyGeom(midi, lo) {
  const white = (m) => Math.floor(m / 12) * 7 + WHITE_X[mod(m, 12)];
  const w0 = white(lo);
  if (!isBlack(midi)) return { x: (white(midi) - w0) * KW, w: KW, black: false };
  return { x: (white(midi - 1) - w0 + 1) * KW - BW / 2 + BLACK_SHIFT[mod(midi, 12)], w: BW, black: true };
}

/** The keyboard. marks: Map midi → { cls, label, finger } for keys to
 *  colour; dots: Map midi → { cls, label } for scale-note markers. */
function keyboardSvg({ lo, hi, marks = new Map(), dots = new Map(), id = 'keys', small = false }) {
  const keys = [];
  for (let m = lo; m <= hi; m++) keys.push(m);
  const whites = keys.filter((m) => !isBlack(m));
  const W = whites.length * KW, H = KH + 18;
  const key = (m) => {
    const g = keyGeom(m, lo), mk = marks.get(m), dt = dots.get(m);
    const h = g.black ? BH : KH;
    const cls = `pk ${g.black ? 'b' : 'w'}${mk ? ` ${mk.cls}` : ''}${held.has(m) ? ' held' : ''}`;
    const cx = g.x + g.w / 2;
    const dotY = h - (g.black ? 12 : 13);
    const dot = dt ? `<g class="pdot ${dt.cls}"><circle cx="${cx}" cy="${dotY}" r="${g.black ? 6.2 : 8.6}"/><text x="${cx}" y="${dotY}">${esc(dt.label)}</text></g>` : '';
    const fing = mk?.finger ? `<text class="pfing" x="${cx}" y="${g.black ? BH - 30 : KH - 36}">${mk.finger}</text>` : '';
    const lbl = mk?.label ? `<text class="plbl" x="${cx}" y="${dotY}">${esc(mk.label)}</text>` : '';
    return `<g class="pkey" data-m="${m}"><rect class="${cls}" x="${g.x + 0.5}" y="0.5" width="${g.w - 1}" height="${h}" rx="${g.black ? 2 : 3}"/>${dot}${lbl}${fing}</g>`;
  };
  // C labels under the white keys (C4 = middle C).
  const cs = whites.filter((m) => mod(m, 12) === 0).map((m) => `<text class="pc" x="${keyGeom(m, lo).x + KW / 2}" y="${KH + 12}">C${Math.floor(m / 12) - 1}</text>`).join('');
  return `<svg class="keys${small ? ' small' : ''}" id="${id}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Piano keyboard">${whites.map(key).join('')}${keys.filter(isBlack).map(key).join('')}${cs}</svg>`;
}

/** A small keyboard for a play-panel chord: the voicing's keys coloured. */
export function miniKeys(v) {
  const ms = v.notes.map((n) => n.midi);
  const lo = Math.floor(Math.min(...ms) / 12) * 12, hi = Math.floor(Math.max(...ms) / 12) * 12 + 11;
  const ww = 5, wh = 24, bw = 3.4, bh = 15;
  const whites = [], blacks = [];
  for (let m = lo; m <= hi; m++) (isBlack(m) ? blacks : whites).push(m);
  const wx = (m) => (Math.floor(m / 12) * 7 + WHITE_X[mod(m, 12)] - (Math.floor(lo / 12) * 7)) * ww;
  const hand = (m) => v.notes.find((n) => n.midi === m);
  const cls = (m) => { const n = hand(m); return n ? (n.hand === 'R' ? ' vR' : n.bass ? ' vB' : ' vL') : ''; };
  const w = whites.map((m) => `<rect class="mk w${cls(m)}" x="${wx(m)}" y="0" width="${ww}" height="${wh}"/>`).join('');
  const b = blacks.map((m) => `<rect class="mk b${cls(m)}" x="${wx(m - 1) + ww - bw / 2}" y="0" width="${bw}" height="${bh}"/>`).join('');
  return `<svg class="minikeys" viewBox="-0.5 -0.5 ${whites.length * ww + 1} ${wh + 1}" width="${whites.length * ww + 1}" height="${wh + 1}" aria-hidden="true">${w}${b}</svg>`;
}

// ------------------------------------------------------------ grand staff SVG

function grandSvg(g, current = null, clickBars = false) {
  const [tTop, , , , tBot] = g.treble.lines, [bTop, , , , bBot] = g.bass.lines;
  const x0 = 12, x1 = g.width - 2, h = g.half;
  const box = current !== null && g.barBoxes[current];
  const hl = box ? `<rect class="sbar-on" x="${box.x + 2}" y="${tTop - 22}" width="${box.w - 4}" height="${bBot - tTop + 34}" rx="6"/>` : '';
  const lines = [...g.treble.lines, ...g.bass.lines].map((y) => `<line class="sline" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`).join('');
  const brace = `<line class="sline thick" x1="${x0}" y1="${tTop}" x2="${x0}" y2="${bBot}"/><path class="sbrace" d="M8 ${tTop} C1 ${(tTop + bBot) / 2 - 20} 1 ${(tTop + bBot) / 2 - 6} -2 ${(tTop + bBot) / 2} C1 ${(tTop + bBot) / 2 + 6} 1 ${(tTop + bBot) / 2 + 20} 8 ${bBot}"/>`;
  const clefs = `<text class="sclef" x="16" y="${tBot + h * 2.6}" style="font-size:${h * 15}px">𝄞</text>`
    + `<text class="sclef" x="18" y="${bTop + h * 6.2}" style="font-size:${h * 8.6}px">𝄢</text>`;
  const sig = g.sigGlyphs.map((s) => `<text class="sacc" x="${s.x}" y="${s.y}">${s.glyph}</text>`).join('');
  const bars = g.barlines.map((x, i) => (i === g.barlines.length - 1
    ? `<line class="sline" x1="${x - 4}" y1="${tTop}" x2="${x - 4}" y2="${bBot}"/><line class="sline thick" x1="${x}" y1="${tTop}" x2="${x}" y2="${bBot}"/>`
    : `<line class="sline" x1="${x}" y1="${tTop}" x2="${x}" y2="${bBot}"/>`)).join('');
  const labels = g.barBoxes.map((b, i) => (b.label ? `<text class="slabel${clickBars ? ' click' : ''}" ${clickBars ? `data-bar="${i}" ` : ''}x="${b.x + 14}" y="${Math.min(16, tTop - 16)}">${esc(b.label)}</text>` : '')).join('');
  const hits = clickBars ? C.barHits(g, 0, g.height) : '';
  const notes = g.notes.map((n) => {
    const fy = n.staff === 't' ? Math.min(n.y - 12, tTop - 6) : Math.max(n.y + 16, bBot + 12);
    return `<g class="snote ${n.cls ?? ''}" data-m="${n.midi}">
      ${n.ledgers.map((y) => `<line class="sledger" x1="${n.x - 11}" y1="${y}" x2="${n.x + 11}" y2="${y}"/>`).join('')}
      ${n.acc ? `<text class="sacc" x="${n.accX}" y="${n.y}">${n.acc}</text>` : ''}
      <ellipse class="shead" cx="${n.x}" cy="${n.y}" rx="6.6" ry="4.6" transform="rotate(-20 ${n.x} ${n.y})"/>
      <rect class="shit" x="${n.x - 12}" y="${n.y - 9}" width="24" height="18"/>
      ${n.finger ? `<text class="sfing" x="${n.x}" y="${fy}">${n.finger}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="staff gstaff" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">${hl}${hits}${lines}${brace}${clefs}${sig}${bars}${labels}${notes}</svg>`;
}

const spelled = (n) => ({ letter: n.letter, acc: n.acc, octave: octaveOf(n.midi, n.acc), midi: n.midi });

function staves(v, p, focusCc, focusV) {
  const sig = keySignature(v.key, v.mode.id);
  let focus;
  if (focusV) {
    const fing = voicingFingers(focusV);
    const ns = focusV.notes.map((n) => ({ ...spelled(n), finger: fing.get(n.midi), cls: n.hand === 'R' ? 'rh' : n.bass ? 'bs' : 'lh' }));
    focus = { title: `${chordLabel(focusCc)} · ${voicingById(focusV.type).name}${focusV.form ? ` (${focusV.form})` : ''}`,
      bars: [{ label: chordLabel(focusCc), cols: [{ rh: ns.filter((n) => n.midi >= 60 || n.cls === 'rh'), lh: ns.filter((n) => !(n.midi >= 60 || n.cls === 'rh')) }] }] };
  } else {
    const run = scaleRun(v, 1).slice(0, v.notes.length + 1);
    const hands = S().pHands;
    const sp = (midi, d, finger) => ({ ...spelled({ midi, letter: v.notes[d].letter, acc: v.notes[d].acc }), finger, cls: d === 0 ? 'tonic' : '' });
    const solo = v.scale && v.scale.id !== 'mode';
    focus = { title: `Scale · fingering ${hands === 'rh' ? 'right hand' : hands === 'lh' ? 'left hand' : 'both hands'}`,
      sig: solo ? keySignature(v.tonic, v.minor ? 'aeolian' : 'ionian') : sig,
      bars: [{ cols: run.map((s) => ({ rh: hands === 'lh' ? [] : [sp(s.rh, s.deg, s.rf)], lh: hands === 'rh' ? [] : [sp(s.lh, s.deg, s.lf)] })) }] };
  }
  const lead = {
    title: `Progression · ${voicingById(S().pVoicing).name.toLowerCase()} voicings`,
    bars: p.voicings.map((vc, i) => {
      const ns = vc.notes.map((n) => ({ ...spelled(n), cls: n.hand === 'R' ? 'rh' : n.bass ? 'bs' : 'lh' }));
      return { label: chordLabel(p.ccs[i]), cols: [{ rh: ns.filter((n) => n.midi >= 60), lh: ns.filter((n) => n.midi < 60) }] };
    }),
  };
  return [focus, lead].map((s, i) => {
    const g = layoutGrand({ sig: s.sig ?? sig, bars: s.bars, textRoom: 8 });
    return `<div class="staffbox"><h4>${esc(s.title)}</h4>${grandSvg(g, i === 1 ? pFocus : null, i === 1)}</div>`;
  }).join('');
}

// ------------------------------------------------------------ render

export function renderPiano() {
  const st = S(), model = C.model();
  const size = pianoSize(st.pianoSize);
  const p = pianoProgression();
  if (pFocus !== null && pFocus >= p.items.length) pFocus = null;
  const cc = pFocus === null ? null : p.ccs[pFocus];
  const vc = pFocus === null ? null : p.voicings[pFocus];
  const v = keyboardView({ rootPc: st.rootPc, modeId: st.modeId, scaleId: st.hornScale });
  const keyName = `${nm(v.key)} ${C.modeLabel(v.mode)}`;
  const solo = v.scale && v.scale.id !== 'mode';
  if (cc) {
    $('keyTitle').textContent = `Piano — ${chordLabel(cc)} in ${keyName}`;
    $('keyFeel').textContent = `Chord tones: ${cc.tones.map((t) => `${nm(t)} (${t.label})`).join(' ')}`
      + ` · avoid: ${cc.scale.filter((t) => t.avoid).map((t) => `${nm(t)} (${t.label})`).join(' ') || 'none'}`;
  } else {
    $('keyTitle').textContent = solo ? `Piano — ${nm(v.tonic)} ${v.scale.name.toLowerCase()}` : `Piano — ${keyName}`;
    $('keyFeel').textContent = `${solo ? `Key: ${nm(v.key)} ${v.mode.name}. ` : ''}Notes: ${v.notes.map(nm).join(' ')}`;
  }
  $('keyFeel').title = $('keyFeel').textContent;

  const sizeOpts = PIANO_SIZES.map((s) => `<option value="${s.id}"${s.id === size.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  $('pbar').innerHTML = `
    ${C.seg('pPractice', [[false, 'Explore'], [true, 'Practice', 'Play, hear and read chords']])}
    <select id="psize" class="select" aria-label="Keyboard size">${sizeOpts}</select>
    <button class="hoptbtn${st.pKeys ? ' open' : ''}" id="pkeysbtn" title="Play notes with the computer keyboard: A W S E D F T G Y H U J K O L P ; (Z / X: octave down / up)">⌨ Keys</button>
    <button class="hoptbtn${midiAccess ? ' open' : ''}" id="pmidibtn" title="${esc(midiErr ?? (midiAccess ? `MIDI input: ${midiInputs() || 'no device connected'}` : 'Listen to a MIDI keyboard'))}">🎹 MIDI${midiAccess ? ' on' : ''}</button>
    <div class="hoptwrap">
      <button class="hoptbtn${pOptsOpen ? ' open' : ''}" id="poptbtn" aria-expanded="${pOptsOpen}">Options ▾</button>
      <div class="hopts"${pOptsOpen ? '' : ' hidden'}>
        <div class="hfield"><span>Labels</span>${C.seg('pLabels', [['names', 'Names'], ['degrees', '1 2 ♭3', 'Scale degrees; chord functions (R 3 ♭7 9 …) when a chord is shown'], ['solfa', 'Do Re Mi', 'Movable do: Do is the key’s tonic'], ['fingers', 'Fingers', 'Scale fingering on the keys']])}</div>
        <div class="hfield"><span>Note names</span>${C.seg('names', [['letters', 'C D E'], ['dutch', 'Cis Bes', 'Dutch: Cis, Bes, Es, As'], ['fixed', 'Do Re Mi', 'Fixed do: Do is always C']])}</div>
        ${st.pLabels === 'solfa' ? `<div class="hfield"><span>Minor keys</span>${C.seg('minorDo', [['do', 'Do-based', 'Minor tonic is Do (♭3 = Me)'], ['la', 'La-based', 'Minor tonic is La']])}</div>` : ''}
        <div class="hfield"><span>Input</span>${C.seg('pEcho', [[true, 'Hear it', 'Sound the notes you play (for controllers without their own sound)'], [false, 'Silent', 'Your instrument makes the sound']])}</div>
      </div>
    </div>`;
  $('psize').onchange = (e) => C.update({ pianoSize: +e.target.value });
  if (st.pPractice) return renderPianoQuiz(v, size);

  const b = p.b;
  const branches = model.tree.branches.map((x) => `<option value="${x.id}"${x.id === b.id ? ' selected' : ''}>${esc(x.mood)} — ${esc(x.name)}</option>`).join('');
  const scaleChips = SCALES.map((s) => {
    const cls = s.id !== st.hornScale ? '' : pFocus === null ? ' on' : ' sel';
    return `<button class="hchord scalechip${cls}" data-scale="${s.id}" title="Show the ${esc(s.id === 'mode' ? `${v.mode.name} scale` : s.name.toLowerCase())}">${esc(s.id === 'mode' ? v.mode.name : s.short ?? s.name)}</button>`;
  }).join('');
  const chips = p.items.map((it, i) => {
    const c = it.chord, cls = `hchord${i === 0 ? ' root' : ''}${C.lent(c) ? ' borrowed' : ''}${it.tag ? ' reharm' : ''}${i === pFocus ? ' on' : ''}${it.len < 1 ? ' short' : ''}`;
    const tip = `${C.chordTitle(c)}${it.why ? ` · ${it.why}` : ''} · ${p.ccs[i].tones.map((t) => t.label).join(' ')}`;
    return `<button class="${cls}" data-pi="${i}" title="${esc(tip)}"><b>${esc(chordLabel(p.ccs[i]))}</b><small>${esc(c.roman)}${it.len < 1 ? ` · ${it.len === 0.5 ? '½' : '¼'}` : ''}</small></button>`;
  }).join('<span class="arrow">→</span>');
  const ending = b.end === 'resolve' ? '<span class="arrow" title="Resolves to the root">↺</span>' : '<span class="end" title="Ends here">‖</span>';

  const rh = new Set(st.pReharm ?? []);
  const reharmChips = REHARMS.map((r) => `<button class="gtog${rh.has(r.id) ? ' on' : ''}" data-reharm="${r.id}" title="${esc(r.tip)}">${esc(r.name)}</button>`).join('');
  const comp = currentComp();
  const compOpts = `<option value="auto"${st.comp === 'auto' ? ' selected' : ''}>Auto: ${esc(styleComp(st.styleId).name)}</option>`
    + COMPS.map((x) => `<option value="${x.id}"${st.comp === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');

  // Keyboard marks: the voicing (focused chord) or the scale with its fingering.
  const marks = new Map(), dots = new Map();
  if (cc) {
    const fing = voicingFingers(vc);
    for (const n of vc.notes) marks.set(n.midi, { cls: n.hand === 'R' ? 'vR' : n.bass ? 'vB' : 'vL', finger: fing.get(n.midi), label: st.pLabels === 'degrees' ? n.label : nm(n) });
    for (const k of v.keys) {
      if (marks.has(k.midi)) continue;
      const t = cc.tones.find((x) => x.pc === k.pc), s = cc.scale.find((x) => x.pc === k.pc);
      if (t) dots.set(k.midi, { cls: t.deg === 1 ? 'tonic' : 'tone', label: st.pLabels === 'degrees' ? t.label : nm(t) });
      else if (s) dots.set(k.midi, { cls: s.avoid ? 'avoid' : 'pass', label: st.pLabels === 'degrees' ? s.label : nm(s) });
    }
  } else {
    const run = st.pLabels === 'fingers' ? scaleRun(v, st.pOct) : [];
    const fingers = new Map();
    for (const s of run) {
      if (st.pHands !== 'lh') fingers.set(s.rh, s.rf);
      if (st.pHands !== 'rh') fingers.set(s.lh, s.lf);
    }
    for (const k of v.keys) if (k.note) {
      const f = fingers.get(k.midi);
      dots.set(k.midi, { cls: `${k.tonic ? 'tonic' : 'note'}${k.blue ? ' blue' : ''}${f ? ' fing' : ''}`, label: f ? String(f) : keyLabel(k.note, v, null) });
    }
  }

  let card;
  if (cc) {
    const n = p.alts[pFocus].length, at = p.pick[pFocus];
    const span = Math.max(handSpan(vc, 'L'), handSpan(vc, 'R'));
    const fing = voicingFingers(vc);
    const hand = (h) => vc.notes.filter((x) => (h === 'R' ? x.hand === 'R' : x.hand !== 'R'))
      .map((x) => `${nm(x)}<sub>${x.label}</sub>${fing.get(x.midi) ? `<i>${fing.get(x.midi)}</i>` : ''}`).join(' ');
    card = `<div class="gcard pcard">
      <b class="gname">${esc(chordLabel(cc))}</b>
      <small class="pform">${esc(voicingById(vc.type).name)}${vc.form ? ` · ${esc(vc.form)}` : ''}</small>
      <div class="galt"><button data-palt="-1" title="Lower voicing"${at === 0 ? ' disabled' : ''}>◀</button><span>${at + 1} / ${n}</span><button data-palt="1" title="Higher voicing"${at === n - 1 ? ' disabled' : ''}>▶</button></div>
      <div class="phand"><span>RH</span> ${hand('R') || '—'}</div>
      <div class="phand"><span>LH</span> ${hand('L') || '—'}</div>
      ${span > 14 ? '<small class="pwarn" title="More than a 9th in one hand">wide: roll it</small>' : ''}
      <button class="mic" id="pstrike" title="Play this voicing">▶ Hear it</button>
    </div>`;
  } else card = '<div class="gcard pcard"><p class="ghint">Pick a chord to see its voicing, fingering and chord-scale</p></div>';

  const legend = cc
    ? `<span><i class="sw vR"></i>right hand</span><span><i class="sw vL"></i>left hand</span><span><i class="sw vB"></i>bass</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-tone"/></svg>other chord tone</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="6" class="k-pass"/></svg>scale tension</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="6" class="k-avoid"/></svg>avoid note</span>`
    : `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-tonic"/></svg>root</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-note"/></svg>scale note</span>`;

  $('pview').innerHTML = `
    <div class="hprog">
      <select id="pbranch" class="select" aria-label="Progression" title="Progression">${branches}</select>
      <div class="hchords"><span class="scalechips">${scaleChips}</span><span class="sep"></span>${chips}${ending}</div>
    </div>
    <div class="hplay">
      ${C.metroButton()}<button class="play" id="palong" title="The progression on a loop, comped, from the chord shown · Space">${pAlong ? '■ Stop' : '▶ Play'}</button>
      <button class="mic" id="pplay" title="Up and down the scale, with the fingering">${pPlaying ? '■ Stop' : '▶ Play scale'}</button>
      <div class="hfield inline"><span>Hands</span>${C.seg('pHands', [['rh', 'Right'], ['lh', 'Left'], ['both', 'Both']])}</div>
      <div class="hfield inline"><span>Octaves</span>${C.seg('pOct', [[1, '1'], [2, '2']])}</div>
      <div class="hfield inline"><span>Bars per chord</span>${C.seg('bars', [[1, '1'], [2, '2']])}</div>
      <label class="tempo">Tempo <input id="pbpm" type="range" min="50" max="180" value="${st.bpm}"> <span id="pbpmv">${st.bpm}</span></label>
    </div>
    <div class="hplay">
      <label class="gpat">Voicing <select id="pvoicing" class="select" aria-label="Voicing">${VOICINGS.map((x) => `<option value="${x.id}"${x.id === st.pVoicing ? ' selected' : ''} title="${esc(x.tip)}">${esc(x.name)}</option>`).join('')}</select></label>
      <div class="hfield inline"><span>Colour</span>${C.seg('pExt', EXTENSIONS.map((x) => [x.id, x.name, x.tip]))}</div>
      <button class="gtog${st.pAltered ? ' on' : ''}" id="paltered" title="Dominant 7th chords use the altered scale: ♭9 (9ths), ♯9 ♭13 — 7alt (11 · 13)">Altered dominants</button>
      <span class="gpattip">${esc(voicingById(st.pVoicing).tip)}${extOf() !== st.pExt ? ` (adds ${EXTENSIONS.find((x) => x.id === extOf()).name.toLowerCase()})` : ''}</span>
    </div>
    <div class="hplay">
      <span class="chiplabel" title="Jazz reharmonisation of the progression">Reharm</span>${reharmChips}
      <label class="gpat">Comp <select id="pcomp" class="select" aria-label="Comping pattern">${compOpts}</select></label>
      <span class="gpattip">${esc(comp.tip)}</span>
      ${C.midiButton('pmidi', 'Drag into your DAW: this progression with these voicings, comped, one pass (piano)')}
    </div>
    <div class="pmid">${card}<div class="gstaves">${staves(v, p, cc, vc)}</div></div>
    <div class="gkey">${legend}<span class="hint">Click a key to hear it · ⌨ Keys or 🎹 MIDI: play and see what you hold</span></div>
    <div class="keybox">
      <div class="pheld" id="pheld">${heldHtml()}</div>
      ${keyboardSvg({ lo: size.lo, hi: size.hi, marks, dots })}
    </div>`;
  $('pbpm').oninput = (e) => { st.bpm = +e.target.value; $('pbpmv').textContent = st.bpm; C.save(); };
  $('pvoicing').onchange = (e) => C.update({ pVoicing: e.target.value });
  $('pcomp').onchange = (e) => C.update({ comp: e.target.value });
  C.wireMidiDrag($('pmidi'), () => progressionMidi(pianoProgression()));
  $('pbranch').onchange = (e) => {
    stopPiano();
    st.selected = +e.target.value;
    pFocus = null;
    C.save();
    C.renderDetail();
    renderPiano();
  };
  scrollKeys();
}

/** Keeps the keyboard scrolled to the notes in use. */
function scrollKeys() {
  const box = document.querySelector('#pview .keybox');
  const svg = box?.querySelector('svg');
  if (!box || !svg || box.scrollWidth <= box.clientWidth) return;
  const marked = svg.querySelector('.vR, .vL, .pdot.fing, .held') ?? svg.querySelector('.pkey[data-m="60"]');
  if (!marked) return;
  const r = marked.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (r.left < b.left || r.right > b.right) box.scrollLeft += r.left - b.left - b.width / 2;
}

/** What the held keys are: the notes, the chord and how it reads in the key. */
function heldHtml() {
  if (!held.size) return S().pKeys || midiAccess ? '<span class="hint">Play something: the chord you hold is named here</span>' : '';
  const ms = [...held].sort((a, b) => a - b);
  const key = C.model().s.key;
  const names = ms.map((m) => pcName(m)).join(' ');
  const c = identifyChord(ms)[0];
  if (!c) return `<b>${esc(names)}</b>`;
  const r = readInKey(c, key);
  return `<b>${esc(names)}</b> → <span class="pchord">${esc(r.name)}</span>${c.rootless ? ' <small>(rootless)</small>' : ''} <span class="hint">${esc(r.roman)} · ${esc(r.fn)} in ${esc(key.name)}</span>`;
}

function refreshHeld() {
  document.querySelectorAll('#pview .pk').forEach((r) => r.classList.toggle('held', held.has(+r.closest('.pkey').dataset.m)));
  const el = $('pheld');
  if (el && !S().pPractice) el.innerHTML = heldHtml();
  if (S().pPractice && pQuiz?.q.drill === 'play' && pQuiz.answered === null) {
    if (playedRight(pQuiz.q, [...held])) answerQuiz(true);
    else renderHeldQuiz();
  }
}

// ------------------------------------------------------------ MIDI out (drag)

function progressionMidi(p) {
  const pat = currentComp();
  const events = compProgression(pat, p.voicings, p.beats);
  const starts = p.beats.map((_, i) => p.beats.slice(0, i).reduce((a, b) => a + b, 0));
  const model = C.model();
  const name = midiFileName(`${model.s.key.name} ${MODES.find((m) => m.id === S().modeId).name}`, p.b.name,
    `${voicingById(S().pVoicing).name} ${pat.name} piano`);
  return {
    name,
    bytes: notesToMidi(compNotes(events), {
      bpm: S().bpm, program: GM_PIANO, name: name.replace(/\.mid$/, ''),
      markers: p.ccs.map((cc, i) => ({ at: starts[i], text: cc.name })),
    }),
  };
}

// ------------------------------------------------------------ playback

function strike(i) {
  const p = pianoProgression();
  playNotes(p.voicings[i].notes.map((n) => n.midi));
}

function playPianoScale() {
  stopPiano();
  const v = keyboardView({ rootPc: S().rootPc, modeId: S().modeId, scaleId: S().hornScale });
  const run = scaleRun(v, S().pOct);
  const hands = S().pHands;
  const steps = run.map((s) => (hands === 'rh' ? [s.rh] : hands === 'lh' ? [s.lh] : [s.lh, s.rh]));
  pPlaying = true;
  $('pplay').textContent = '■ Stop';
  playLine(steps, S().bpm, (i) => {
    document.querySelectorAll('#pview .playing').forEach((x) => x.classList.remove('playing'));
    for (const m of steps[i]) document.querySelectorAll(`#pview .keybox .pkey[data-m="${m}"], #pview .gstaves .staffbox:first-child .snote[data-m="${m}"]`).forEach((x) => x.classList.add('playing'));
  }, stopPiano);
}

function playPianoAlong(startAt = pFocus ?? 0, countIn = S().countIn) {
  stopPiano();
  const p = pianoProgression();
  pAlong = true;
  $('palong').textContent = '■ Stop';
  playAlong({
    chords: p.items.map((it) => it.chord), beats: p.beats, bpm: S().bpm,
    rhythm: compProgression(currentComp(), p.voicings, p.beats), countIn, startAt,
    onCount: (n) => { $('palong').textContent = `■ ${n + 1}…`; },
    onStep: (i) => {
      pFocus = i;
      renderPiano();
      $('pview').querySelector(`[data-pi="${i}"]`)?.classList.add('playing');
    },
  });
}

export function stopPiano() {
  stop();
  pPlaying = false;
  pAlong = false;
  document.querySelectorAll('#pview .playing').forEach((x) => x.classList.remove('playing'));
  if ($('pplay')) $('pplay').textContent = '▶ Play scale';
  if ($('palong')) $('palong').textContent = '▶ Play';
}

// ------------------------------------------------------------ input

function noteOn(m) {
  if (m < 21 || m > 108 || held.has(m)) return;
  held.add(m);
  if (S().pEcho) playNote(m, 0.9);
  refreshHeld();
}
function noteOff(m) {
  if (!held.delete(m)) return;
  refreshHeld();
}

const midiInputs = () => (midiAccess ? [...midiAccess.inputs.values()].map((i) => i.name).join(', ') : '');

async function toggleMidi() {
  if (midiAccess) {
    for (const i of midiAccess.inputs.values()) i.onmidimessage = null;
    midiAccess = null;
    held.clear();
    return renderPiano();
  }
  if (!navigator.requestMIDIAccess) { midiErr = 'Web MIDI is not available here'; return renderPiano(); }
  try {
    midiAccess = await navigator.requestMIDIAccess();
    midiErr = null;
    const bind = () => { for (const i of midiAccess.inputs.values()) i.onmidimessage = onMidi; };
    bind();
    midiAccess.onstatechange = () => { if (midiAccess) { bind(); renderPiano(); } };
  } catch (e) {
    midiAccess = null;
    midiErr = `MIDI input refused: ${e.message || e.name}`;
  }
  renderPiano();
}

function onMidi(e) {
  const [st, d1, d2] = e.data;
  const type = st & 0xf0;
  if (type === 0x90 && d2 > 0) noteOn(d1);
  else if (type === 0x80 || (type === 0x90 && d2 === 0)) noteOff(d1);
}

// Computer keys: a piano row on the home row (A = C, W = C♯ …), Z / X octave.
const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
let keyOct = 60;
const keyHeld = new Map();

/** Key handling for the piano view; true when the key was used. */
export function pianoKey(e, down = true) {
  const st = S();
  if (e.ctrlKey || e.altKey || e.metaKey || e.target.closest?.('input, select')) return false;
  if (st.pKeys) {
    if (down && (e.code === 'KeyZ' || e.code === 'KeyX')) {
      keyOct = Math.max(24, Math.min(96, keyOct + (e.code === 'KeyZ' ? -12 : 12)));
      return true;
    }
    if (e.code in KEYMAP) {
      if (down) { if (!e.repeat && !keyHeld.has(e.code)) { const m = keyOct + KEYMAP[e.code]; keyHeld.set(e.code, m); noteOn(m); } }
      else { const m = keyHeld.get(e.code); keyHeld.delete(e.code); if (m !== undefined) noteOff(m); }
      return true;
    }
  }
  if (!down) return false;
  if (st.pPractice) {
    if (/^[0-9]$/.test(e.key) && pQuiz?.q.options && pQuiz.answered === null) {
      const o = pQuiz.q.options[e.key === '0' ? 9 : +e.key - 1];
      if (o) answerQuiz(o.id === pQuiz.q.answer, o.id);
      return true;
    }
    if (e.code === 'KeyR' && !st.pKeys) { quizSound(); return true; }
    if (e.code === 'Space') { pQuiz?.answered !== null ? nextQuiz() : quizSound(); return true; }
    return false;
  }
  if (e.code === 'Space') { pianoBusy() ? stopPiano() : playPianoAlong(); return true; }
  return false;
}

// ------------------------------------------------------------ practice

const pLevel = () => S().pLevels?.[S().pDrill] ?? 0;
const statsKey = () => `p${S().pDrill}:${pLevel()}`;
const quizName = (q) => pcName(q.rootPc) + q.sfx;

function nextQuiz() {
  const st = S();
  const model = C.model();
  const q = makePianoQuestion({ drill: st.pDrill, level: pLevel(), key: model.s.key, mode: model.s.mode, prev: pQuiz?.q ?? null });
  pQuiz = { q, answered: null, pick: null, shown: false, level: pLevel() };
  held.clear();
  renderPiano();
  quizSound();
}

function quizSound() {
  const q = pQuiz?.q;
  if (!q) return;
  if (q.drill === 'quality' || q.drill === 'inversion') playNotes(q.midis, 1.8);
  if (q.drill === 'read' && pQuiz.answered !== null) playNotes(q.midis, 1.6);
}

function answerQuiz(right, pick = null) {
  if (!pQuiz || pQuiz.answered !== null) return;
  pQuiz.answered = right;
  pQuiz.pick = pick;
  const stats = C.quizStats();
  stats[statsKey()] = record(stats[statsKey()] ?? emptyStats(), right);
  C.saveQuiz();
  if (pQuiz.q.drill === 'play' && right) playNotes([...held], 1.2);
  if (pQuiz.q.drill === 'read') playNotes(pQuiz.q.midis, 1.6);
  renderPiano();
}

function renderHeldQuiz() {
  const el = $('pqheld');
  if (el) el.innerHTML = held.size ? `Holding: <b>${esc([...held].sort((a, b) => a - b).map(pcName).join(' '))}</b>` : 'Holding: —';
}

function renderPianoQuiz(v, size) {
  const st = S();
  const d = pianoDrillById(st.pDrill);
  if (!pQuiz || pQuiz.q.drill !== d.id || pQuiz.level !== pLevel()) {
    pQuiz = null;
    const model = C.model();
    pQuiz = { q: makePianoQuestion({ drill: d.id, level: pLevel(), key: model.s.key, mode: model.s.mode }), answered: null, pick: null, shown: false, level: pLevel() };
  }
  pQuiz.level = pLevel();
  const q = pQuiz.q, stats = C.quizStats()[statsKey()] ?? emptyStats();
  const acc = accuracy(stats);
  const marks = new Map(), dots = new Map();
  if (q.drill === 'read') for (const m of q.midis) marks.set(m, { cls: 'vR' });
  if ((q.drill === 'play' && (pQuiz.shown || pQuiz.answered === false))) {
    const pcs = answerPcs(q);
    for (let m = size.lo; m <= size.hi; m++) if (pcs.includes(mod(m, 12)) && m >= 48 && m < 72) dots.set(m, { cls: mod(m, 12) === q.rootPc ? 'tonic' : 'tone', label: pcName(m) });
  }
  if ((q.drill === 'quality' || q.drill === 'inversion') && pQuiz.answered !== null) for (const m of q.midis) marks.set(m, { cls: 'vR', label: pcName(m) });

  let prompt, body = '';
  if (q.drill === 'play') {
    const name = q.key ? `${q.roman} in ${C.model().s.key.name}` : quizName(q);
    prompt = `Play <b>${esc(name)}</b>${q.rootless ? ' <span class="qsub">(the root may be left out)</span>' : ''}`;
    body = `<div class="qmic" id="pqheld"></div>
      <div class="qplay">${pQuiz.answered === null
        ? `<button class="mic" id="pqcheck" title="Mark it wrong and show the chord">Show me</button>`
        : ''}${!st.pKeys && !midiAccess ? '<span class="hint">Click keys to toggle them, or turn on ⌨ Keys / 🎹 MIDI above</span>' : ''}</div>`;
  } else if (q.drill === 'read') {
    prompt = 'Which chord is lit on the keys?';
    body = `<div class="qopts">${q.options.map((o, i) => `<button class="qopt${optCls(o.id)}" data-pq="${esc(o.id)}"><kbd>${(i + 1) % 10}</kbd>${esc(pcName(q.rootPc) + o.sfx)}</button>`).join('')}</div>`;
  } else {
    prompt = q.drill === 'quality' ? 'Which kind of chord is this?' : 'Which inversion is this?';
    body = `<div class="qplay"><button class="play" id="pqplay">▶ Play again <kbd>R</kbd></button></div>
      <div class="qopts">${q.options.map((o, i) => `<button class="qopt${optCls(o.id)}" data-pq="${esc(String(o.id))}"><kbd>${(i + 1) % 10}</kbd>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
  }
  const feed = pQuiz.answered === null ? ''
    : `<div class="qfeed ${pQuiz.answered ? 'ok' : 'bad'}">${pQuiz.answered ? '✓ Right' : '✗ Not quite'}: ${esc(feedText(q))}
       <button class="play" id="pqnext">Next <kbd>Space</kbd></button></div>`;
  $('pview').innerHTML = `
    <div class="quiz">
      <div class="qhead">
        ${C.seg('pDrill', PIANO_DRILLS.map((x) => [x.id, x.name, x.blurb]))}
        <div class="seg qlevels" id="pqlevels">${d.levels.map((l, i) => `<button data-plv="${i}" class="${i === pLevel() ? 'on' : ''}">${esc(l.name)}</button>`).join('')}</div>
      </div>
      <p class="qblurb">${esc(d.blurb)}</p>
      <div class="qscore"><span>Streak <b>${stats.streak}</b></span><span>Best <b>${stats.best}</b></span>
        <span>Last ${stats.recent.length}: <b>${acc === null ? '—' : `${acc}%`}</b></span>
        ${ready(stats) && pLevel() < d.levels.length - 1 ? '<span class="qready">Ready for the next level</span>' : ''}
        <button class="link" id="pqreset">${pResetArmed > Date.now() ? 'Click again to reset' : 'Reset score'}</button></div>
      <div class="qcard">
        <div class="qprompt">${prompt}</div>
        ${body}${feed}
      </div>
    </div>
    <div class="keybox">${keyboardSvg({ lo: size.lo, hi: size.hi, marks, dots })}</div>`;
  renderHeldQuiz();
  scrollKeys();
}

function optCls(id) {
  if (!pQuiz || pQuiz.answered === null) return '';
  const q = pQuiz.q;
  if (String(id) === String(q.answer)) return ' right';
  if (String(id) === String(pQuiz.pick)) return ' wrong';
  return ' dim';
}

function feedText(q) {
  if (q.drill === 'play') return q.key ? `${q.roman} is ${q.name}: ${q.notes.join(' ')}` : `${quizName(q)}: ${answerPcs(q).map(pcName).join(' ')}`;
  if (q.drill === 'quality') return `${quizName(q)} (${QUALITY_NAMES[q.sfx] ?? q.sfx}): ${q.midis.map(pcName).join(' ')}`;
  if (q.drill === 'inversion') return `${quizName(q)}, ${q.options[q.inv].label.toLowerCase()}: ${q.midis.map(pcName).join(' ')} (low to high)`;
  const alt = identifyChord(q.midis).find((c) => !(c.rootPc === q.rootPc && c.sfx === q.sfx));
  return `${quizName(q)}: ${q.midis.map(pcName).join(' ')}${alt && alt.cost < 1 ? ` — also reads as ${pcName(alt.rootPc)}${alt.sfx}` : ''}`;
}

// ------------------------------------------------------------ wiring

function wire() {
  $('pbar').onclick = (e) => {
    if (e.target.closest('#poptbtn')) { pOptsOpen = !pOptsOpen; renderPiano(); return; }
    if (e.target.closest('#pkeysbtn')) { held.clear(); keyHeld.clear(); C.update({ pKeys: !S().pKeys }); return; }
    if (e.target.closest('#pmidibtn')) { toggleMidi(); return; }
    C.segClick(e);
  };
  document.addEventListener('mousedown', (e) => {
    if (pOptsOpen && !e.target.closest('#pbar .hoptwrap')) { pOptsOpen = false; if (S().view === 'piano') renderPiano(); }
  });
  $('pview').onclick = (e) => {
    const st = S();
    if (st.pPractice) return quizClick(e);
    if (C.segClick(e)) return;
    if (e.target.closest('#palong')) return pAlong ? stopPiano() : playPianoAlong();
    if (e.target.closest('#pplay')) return pPlaying ? stopPiano() : playPianoScale();
    if (e.target.closest('#paltered')) return C.update({ pAltered: !st.pAltered });
    const r = e.target.closest('[data-reharm]');
    if (r) {
      const on = new Set(st.pReharm ?? []);
      on.has(r.dataset.reharm) ? on.delete(r.dataset.reharm) : on.add(r.dataset.reharm);
      pFocus = null;
      return C.update({ pReharm: [...on] });
    }
    const sc = e.target.closest('[data-scale]');
    if (sc) {
      if (!pAlong) stopPiano();
      pFocus = null;
      if (sc.dataset.scale !== st.hornScale) C.update({ hornScale: sc.dataset.scale }); else renderPiano();
      return;
    }
    const ch = e.target.closest('[data-pi], [data-bar]');
    if (ch) {
      const i = +(ch.dataset.pi ?? ch.dataset.bar);
      // Playing: jump there at once; else show and sound it (the playhead).
      if (pAlong) return playPianoAlong(i, false);
      if (pPlaying) stopPiano();
      pFocus = i;
      renderPiano();
      strike(pFocus);
      return;
    }
    const alt = e.target.closest('[data-palt]');
    if (alt && pFocus !== null) {
      const p = pianoProgression();
      const n = p.alts[pFocus].length;
      pAlt[`${pFocus}:${p.ccs[pFocus].name}`] = Math.max(0, Math.min(n - 1, p.pick[pFocus] + +alt.dataset.palt));
      renderPiano();
      if (!pAlong) strike(pFocus);
      return;
    }
    if (e.target.closest('#pstrike') && pFocus !== null) return strike(pFocus);
    const k = e.target.closest('.pkey, .snote');
    if (k) playNote(+k.dataset.m);
  };
  // Hovering a staff note marks its key.
  $('pview').onmouseover = (e) => {
    $('pview').querySelectorAll('.same').forEach((x) => x.classList.remove('same'));
    const n = e.target.closest('.snote');
    if (n) $('pview').querySelectorAll(`.pkey[data-m="${n.dataset.m}"] .pk`).forEach((x) => x.classList.add('same'));
  };
  document.addEventListener('keyup', (e) => { if (S().view === 'piano') pianoKey(e, false); });
  addEventListener('blur', () => { if (keyHeld.size) { keyHeld.clear(); held.clear(); refreshHeld(); } });
}

function quizClick(e) {
  const st = S();
  if (C.segClick(e)) return; // a new drill gets a new question when it renders
  const lv = e.target.closest('[data-plv]');
  if (lv) { pQuiz = null; return C.update({ pLevels: { ...st.pLevels, [st.pDrill]: +lv.dataset.plv } }); }
  if (e.target.closest('#pqreset')) {
    if (pResetArmed > Date.now()) { delete C.quizStats()[statsKey()]; C.saveQuiz(); pResetArmed = 0; }
    else pResetArmed = Date.now() + 3000;
    return renderPiano();
  }
  if (e.target.closest('#pqnext')) return nextQuiz();
  if (e.target.closest('#pqplay')) return quizSound();
  if (e.target.closest('#pqcheck')) { pQuiz.shown = true; return answerQuiz(false); }
  const o = e.target.closest('[data-pq]');
  if (o && pQuiz.answered === null) {
    const id = o.dataset.pq;
    return answerQuiz(String(pQuiz.q.answer) === id, id);
  }
  const k = e.target.closest('.pkey');
  if (k) {
    const m = +k.dataset.m;
    if (pQuiz?.q.drill === 'play' && pQuiz.answered === null) { held.has(m) ? noteOff(m) : noteOn(m); }
    else playNote(m);
  }
}
