import { MODES, MODIFIERS, MODE_ABBR, ROOT_LABELS, STYLES, mod, styleById, styleModes, suggest } from './theory.js';
import { buildTree, layout, rootOffset, rootPaths } from './graph.js';
import { playChord, playSequence, playNote, playLine, playAlong, playOver, playStrum, stop } from './audio.js';
import { DRILLS, drillById, makeQuestion, isRight, record, accuracy, ready, emptyStats } from './quiz.js';
import { progressionToMidi, midiFileName, melodyToMidi, notesToMidi, GM_SAX, GM_GUITAR } from './midi.js';
import { INSTRUMENTS, REGISTERS, SCALES, SAX_RANGE, hornView, formatNote, solfa, degreeLabel, chordLayer, chordSymbol, guideLine, octaveOf } from './horn.js';
import { keySignature, layoutStaff, STAFF } from './staff.js';
import { KEYS, DIAGRAM, fingeringsFor } from './fingering.js';
import { startMic, stopMic, micOn } from './mic.js';
import { freqOf } from './pitch.js';
import { STRUMS, strumById, styleStrum, customStrum, cleanSteps, cycleStep, resizeSteps, counts, strumProgression, strumNotes } from './strum.js';
import { FRET_DRILLS, FRET_LEVELS, PRACTICE_FRETS, fretDrillById, makeFretQuestion, isFretRight, pcName, nearestString } from './fretquiz.js';
import { voicing, shapeText, baseFret, voicingMidi, alternates, voiceLead, scalePositions, shapeInPosition, shapePosition, positionTab, shapeTab, bassArpeggio, FRETTED, FRETS, INLAYS, fretboardView, scaleRun as fretRun } from './guitar.js';

// Branch (lane) colours per theme; hex because graph strokes append an alpha.
const PALETTES = {
  dark: ['#ffb454', '#7c8cff', '#4cd99a', '#ff7a90', '#4cc3f5', '#c792ea', '#f5d76e',
    '#5fe0c8', '#ff9d5c', '#9ccc65', '#f78fb3', '#82aaff', '#e6a26a', '#b4a7ff', '#6fd3a0', '#ffcb6b'],
  light: ['#d47406', '#4a5bd8', '#13915a', '#d6405e', '#1a8ac2', '#9a4fd0', '#a88400',
    '#0f978a', '#d65d1c', '#5a981c', '#c94f86', '#3d6fd6', '#b0652a', '#7360d6', '#2a986a', '#bb8410'],
  pastel: ['#df7896', '#7d8be0', '#45ab86', '#e48a6a', '#4fa6d4', '#ab79d6', '#c49e36',
    '#3dada0', '#de9658', '#77ae52', '#d478b2', '#6e98de', '#c28458', '#9989e2', '#58b088', '#cfa044'],
  sepia: ['#b0602a', '#3f5ea8', '#4f7f2e', '#b8434f', '#2f78a8', '#84448f', '#9a7a12',
    '#2a8478', '#c0702a', '#6a8a1e', '#a84a78', '#4a6cb0', '#8e5a30', '#6a52a8', '#3a8a5a', '#a87e1a'],
  mint: ['#12957a', '#4a63d0', '#d24a63', '#d07a10', '#1f86b8', '#8a4ab8', '#a88a00',
    '#2b8a3e', '#d0602a', '#5d9420', '#c24f8c', '#3d74d0', '#a8682a', '#6e5fd0', '#1a8e9a', '#b8860e'],
};
// The other dark themes share the dark set; the accent leads.
PALETTES.midnight = ['#5ccfe6', ...PALETTES.dark.filter((c) => c !== '#4cc3f5')];
PALETTES.forest = ['#e8c26a', ...PALETTES.dark.filter((c) => c !== '#f5d76e')];
PALETTES.twilight = ['#f4a6c0', ...PALETTES.dark.filter((c) => c !== '#f78fb3')];
const laneColor = (lane) => { const p = PALETTES[state.theme] ?? PALETTES.dark; return p[lane % p.length]; };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STORE = 'chordfinder:state';
// Bump when a default changes, so the new default replaces the value that was
// only saved because it used to be the default.
const STATE_VERSION = 2;
const loadSaved = () => {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORE)) ?? {}; } catch { return {}; }
  if ((saved.v ?? 1) < 2) delete saved.compact; // v2: compact view became the default
  delete saved.midiMode; // setting from the removed virtual-file experiment
  delete saved.returnStyle; // picker hidden: always the R node (drop this line if the picker comes back)
  return saved;
};
const state = Object.assign(
  { rootPc: 0, modeId: 'ionian', modifier: 'triad', color: 'triad', selected: 0, bpm: 96, zoom: 1,
    returnStyle: 'node', compact: true, borrowed: false, chordsOpen: true, settingsOpen: false,
    styleId: 'theory', length: 'phrase', guitar: false, theme: 'dark', corners: 'round',
    // Sax view
    view: 'chords', instrument: 'alto', pitch: 'written', hornScale: 'mode', names: 'letters', solfa: false, minorDo: 'do',
    bars: 1, guideLine: false, show: 'both', underNames: true, strip: true,
    practice: false, drill: 'degree', levels: { degree: 0, tone: 0, read: 0 },
    // Guitar view
    fretInst: 'guitar', fretLabels: 'names', lefty: false, gVoice: 'easy', gPos: 0, strum: 'auto', customStrum: null,
    gPractice: false, gDrill: 'find', gLevels: { find: 0, name: 0 } },
  loadSaved(),
  { v: STATE_VERSION },
);
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage unavailable */ } };
// Set before the first render so a light theme doesn't flash dark.
document.documentElement.dataset.theme = state.theme;
document.documentElement.dataset.corners = state.corners;

let model = null; // { s: suggestion, tree, g: geometry }
let playing = false;

// ------------------------------------------------------------ side panel

function renderPiano() {
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]]; // [pc, white index it sits after]
  const kw = 100 / 7;
  $('piano').innerHTML =
    whites.map((pc) => `<button class="white" data-pc="${pc}" title="${ROOT_LABELS[pc]}">${ROOT_LABELS[pc]}</button>`).join('') +
    blacks.map(([pc, i]) => `<button class="black" data-pc="${pc}" title="${ROOT_LABELS[pc]}"
      style="left:calc(${(i + 1) * kw}% - 12px)">${ROOT_LABELS[pc].replace('/', '<br>')}</button>`).join('');
  $('piano').onclick = (e) => {
    const b = e.target.closest('[data-pc]');
    if (b) update({ rootPc: +b.dataset.pc });
  };
}

function renderStatic() {
  // Styles with a `group` (e.g. video game) go under their own heading.
  const opt = (s) => `<option value="${s.id}">${esc(s.name)}</option>`;
  const groups = [...new Set(STYLES.filter((s) => s.group).map((s) => s.group))];
  $('style').innerHTML = STYLES.filter((s) => !s.group).map(opt).join('')
    + groups.map((g) => `<optgroup label="${esc(g)}">${STYLES.filter((s) => s.group === g).map(opt).join('')}</optgroup>`).join('');
  $('style').onchange = (e) => update({ styleId: e.target.value });
  renderPiano();
  $('modes').innerHTML = MODES.map((m) =>
    `<button data-mode="${m.id}"><b>${m.name}${m.alias ? ` <span style="color:var(--faint);font-weight:400">(${m.alias})</span>` : ''}</b><small>${esc(m.feel)}</small></button>`).join('');
  $('modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) update({ modeId: b.dataset.mode }); };
  $('modifiers').innerHTML = MODIFIERS.map((m) => `<button data-mod="${m.id}">${m.label}</button>`).join('');
  $('modifiers').onclick = (e) => { const b = e.target.closest('[data-mod]'); if (b) update({ modifier: b.dataset.mod }); };
  $('color').onclick = (e) => { const b = e.target.closest('[data-color]'); if (b) update({ color: b.dataset.color }); };
  $('returnStyle').onclick = (e) => { const b = e.target.closest('[data-ret]'); if (b) update({ returnStyle: b.dataset.ret }); };
  for (const [id, key] of [['settings', 'settingsOpen'], ['chordOpts', 'chordsOpen']]) {
    $(id).open = !!state[key];
    $(id).ontoggle = () => { state[key] = $(id).open; save(); };
  }
  $('borrowed').onclick = (e) => { const b = e.target.closest('[data-borrow]'); if (b) update({ borrowed: b.dataset.borrow === '1' }); };
  $('length').onclick = (e) => { const b = e.target.closest('[data-len]'); if (b) update({ length: b.dataset.len }); };
  $('density').onclick =(e) => { const b = e.target.closest('[data-compact]'); if (b) update({ compact: b.dataset.compact === '1' }); };
  $('theme').onchange = (e) => update({ theme: e.target.value });
  $('corners').onclick = (e) => { const b = e.target.closest('[data-corners]'); if (b) update({ corners: b.dataset.corners }); };
  $('view').onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) update({ view: b.dataset.view }); };
  wireHorn();
  wireGuitar();
}

function markActive() {
  document.querySelectorAll('#piano [data-pc]').forEach((b) => b.classList.toggle('on', +b.dataset.pc === state.rootPc));
  const style = styleById(state.styleId), usable = styleModes(style);
  $('style').value = style.id;
  $('styleBlurb').textContent = style.blurb;
  document.querySelectorAll('#modes [data-mode]').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === state.modeId);
    // Modes the style has no progressions for are dimmed and can't be picked
    // (the sax and guitar views only need the scale, so every mode is open there).
    const na = state.view === 'chords' && !usable.includes(b.dataset.mode);
    b.disabled = na;
    b.classList.toggle('na', na);
    b.title = na ? `Not used in the ${style.name} style` : '';
  });
  document.querySelectorAll('#length [data-len]').forEach((b) => b.classList.toggle('on', b.dataset.len === state.length));
  document.querySelectorAll('#modifiers [data-mod]').forEach((b) => b.classList.toggle('on', b.dataset.mod === state.modifier));
  document.querySelectorAll('#color [data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === state.color));
  document.querySelectorAll('#returnStyle [data-ret]').forEach((b) => b.classList.toggle('on', b.dataset.ret === state.returnStyle));
  document.querySelectorAll('#borrowed [data-borrow]').forEach((b) => b.classList.toggle('on', (b.dataset.borrow === '1') === state.borrowed));
  document.querySelectorAll('#density [data-compact]').forEach((b) => b.classList.toggle('on', (b.dataset.compact === '1') === state.compact));
  document.querySelectorAll('#view [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  $('theme').value = state.theme in PALETTES ? state.theme : 'dark';
  document.querySelectorAll('#corners [data-corners]').forEach((b) => b.classList.toggle('on', b.dataset.corners === state.corners));
  applyTheme();
}

/** Puts the theme and corner style on <html> and paints the native title bar to match. */
let appliedTheme = '';
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.corners = state.corners;
  if (appliedTheme === state.theme) return;
  appliedTheme = state.theme;
  const css = getComputedStyle(root), v = (k) => css.getPropertyValue(k).trim();
  window.__TAURI__?.core.invoke('set_titlebar', { caption: v('--surface'), text: v('--text'), border: v('--border') })
    .catch((e) => console.error(e));
}

function renderScale(s) {
  $('scale').innerHTML = s.scale.map((c, i) =>
    `<button data-deg="${i}" title="${esc(c.notes.join(' '))}"><span class="r">${esc(c.roman)}</span><span class="n">${esc(c.name)}</span></button>`).join('');
  $('scale').onclick = (e) => { const b = e.target.closest('[data-deg]'); if (b) sound(s.scale[+b.dataset.deg]); };
}

// ------------------------------------------------------------ graph

function renderGraph() {
  const { tree, g } = model;
  const color = (b) => laneColor(b.lane);
  const z = state.zoom;
  const svg = $('graph');
  svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
  svg.setAttribute('width', g.width * z);
  svg.setAttribute('height', g.height * z);

  const markers = tree.branches.map((b) =>
    `<marker id="ah${b.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${color(b)}"/></marker>
    <marker id="hh${b.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M1,1 L9,5 L1,9" fill="none" stroke="${color(b)}" stroke-width="1.6"/></marker>`).join('');

  const hints = g.hints.map((h) =>
    `<path class="hint" data-b="${h.branch.id}" d="${h.d}" stroke="${color(h.branch)}" marker-end="url(#hh${h.branch.id})"><title>${esc(hintText(h.branch))}</title></path>`).join('');

  const edges = g.edges.map((e) =>
    `<path class="edge" data-to="${esc(e.to)}" d="${e.d}" stroke="${color(e.branch)}" marker-end="url(#ah${e.branch.id})"/>`).join('');

  const returns = g.returns.map((r) =>
    `<path class="ret" data-b="${r.branch.id}" d="${r.d}" stroke="${color(r.branch)}" marker-end="url(#ah${r.branch.id})"><title>${esc(r.branch.cadence)}</title></path>`).join('');

  const endbars = g.bars.map(({ branch: b, x, y, h }) =>
    `<g class="endbar" data-b="${b.id}" stroke="${color(b)}"><title>${esc(b.cadence)}</title>
      <line x1="${x}" y1="${y - h}" x2="${x}" y2="${y + h}"/><line class="thick" x1="${x + 6}" y1="${y - h}" x2="${x + 6}" y2="${y + h}"/></g>`).join('');

  const t = model.s.tonic;
  const badges = g.badges.map(({ branch: b, cx, cy, r, d }) =>
    `<path class="edge" data-b="${b.id}" d="${d}" stroke="${color(b)}" marker-end="url(#ah${b.id})"/>
    <g class="badge" data-b="${b.id}" data-badge="${b.id}"><title>${esc(`Resolves to the root, ${t.name} — ${b.cadence}`)}</title>
      <circle cx="${cx}" cy="${cy}" r="${r}" style="stroke:${color(b)}"/>
      <text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" style="font-size:${r + 1}px">R</text></g>`).join('');

  const { w: W, h: H } = g.size;
  const nodes = g.nodes.map((n) => {
    const c = n.chord ?? t, cx = n.x + W / 2;
    const stroke = n.parent ? ` style="stroke:${color(n.owner)}55"` : '';
    const body = g.compact
      ? `<text class="nm${c.name.length + c.roman.length > 10 ? ' long' : ''}" x="${cx}" y="${n.y + H / 2}" dy=".35em" text-anchor="middle">${esc(c.name)}<tspan class="rn" dx="5">${esc(c.roman)}</tspan></text>`
      : `<text class="rn" x="${cx}" y="${n.y + 18}" text-anchor="middle">${esc(n.parent ? c.roman + (lent(c) ? ` · ${MODE_ABBR[c.source.id]}` : '') : `${c.roman} · root`)}</text>
         <text class="nm" x="${cx}" y="${n.y + 45}" text-anchor="middle">${esc(c.name)}</text>
         <text class="nt" x="${cx}" y="${n.y + 65}" text-anchor="middle">${esc(c.notes.join(' '))}</text>`;
    return `<g class="node${n.parent ? '' : ' root'}${g.compact ? ' compact' : ''}${lent(c) ? ' borrowed' : ''}" data-id="${esc(n.id)}">
      <title>${esc(chordTitle(c))}</title>
      <rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="${g.compact ? 7 : 9}"${stroke}/>${body}</g>`;
  }).join('');

  const labels = g.labels.map((l) => {
    const b = l.branch;
    return `<g class="label" data-b="${b.id}"><text x="${l.x + 2}" y="${l.y}">
      ${b.special ? `<tspan class="star" fill="${color(b)}">★ </tspan>` : ''}${b.borrowed ? `<tspan class="star" fill="${color(b)}">⇄ </tspan>` : ''}<tspan class="mood" fill="${color(b)}">${esc(b.mood)}</tspan><tspan class="nm"> — ${esc(b.name)}${b.lane === 0 ? ' (main)' : ''}</tspan>
      </text><title>${esc(b.cadence)}</title></g>`;
  }).join('');

  svg.innerHTML = `<defs>${markers}</defs>${returns}${edges}${hints}${endbars}${badges}${nodes}${labels}`;
  rootDy = -1;
  stickRoot();
  focus(null);
}

/** Keeps the root chord in view while the graph scrolls down; its edges and
 *  return arrows are redrawn so they stay connected. */
let rootDy = 0;
function stickRoot() {
  const { g } = model, svg = $('graph');
  const dy = rootOffset(g, $('canvas').scrollTop / state.zoom);
  if (dy === rootDy) return;
  rootDy = dy;
  svg.querySelector('.node.root')?.setAttribute('transform', `translate(0,${dy})`);
  const p = rootPaths(g, dy);
  for (const e of p.edges) svg.querySelector(`.edge[data-to="${CSS.escape(e.to)}"]`)?.setAttribute('d', e.d);
  for (const r of p.returns) svg.querySelector(`.ret[data-b="${r.branch.id}"]`)?.setAttribute('d', r.d);
}

function hintText(b) {
  const n = b.next;
  if (!n) return '';
  return n.home
    ? `Could continue: ${b.last.chord.roman} still wants to resolve home to ${model.s.tonic.roman}`
    : `Could continue: ${b.last.chord.roman} → ${n.node.chord.roman}, carrying on as “${n.via.mood}” (${n.via.name})`;
}

/** True for chords borrowed from a parallel mode (not secondary dominants). */
const lent = (c) => c.source && c.source !== 'secondary';

function chordTitle(c) {
  const from = lent(c) ? ` · borrowed from ${c.source.name}` : c.source === 'secondary' ? ' · secondary dominant' : '';
  return `${c.name} (${c.roman})${from} — ${c.notes.join(' ')}`;
}

/** Highlights one branch's full path from the root (null = selected only). */
function focus(branch) {
  const svg = $('graph');
  const b = branch ?? model.tree.branches.find((x) => x.id === state.selected);
  svg.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
  svg.classList.toggle('focus', !!branch);
  if (!b) return;
  const ids = new Set(['root', ...b.path.map((n) => n.id)]);
  svg.querySelectorAll('.node').forEach((el) => el.classList.toggle('on', ids.has(el.dataset.id)));
  svg.querySelectorAll('.edge').forEach((el) => el.classList.toggle('on', ids.has(el.dataset.to)));
  svg.querySelectorAll(`[data-b="${b.id}"]`).forEach((el) => el.classList.add('on'));
  if (b.next) svg.querySelector(`.node[data-id="${CSS.escape(b.next.node.id)}"]`)?.classList.add('on');
}

function branchFromEvent(e) {
  const t = e.target.closest('[data-b], [data-id], [data-to]');
  if (!t) return null;
  const { branches, nodes } = model.tree;
  if (t.dataset.b) return branches.find((b) => b.id === +t.dataset.b);
  const id = t.dataset.id ?? t.dataset.to;
  return id === 'root' ? null : nodes.find((n) => n.id === id)?.owner ?? null;
}

function wireGraph() {
  const svg = $('graph');
  svg.addEventListener('mouseover', (e) => { if (!playing) focus(branchFromEvent(e)); });
  svg.addEventListener('mouseleave', () => { if (!playing) focus(null); });
  svg.addEventListener('click', (e) => {
    const node = e.target.closest('.node');
    const b = branchFromEvent(e);
    if (b) { state.selected = b.id; save(); renderDetail(); }
    if (e.target.closest('.badge')) {
      sound(model.s.tonic);
    } else if (node) {
      const n = model.tree.nodes.find((x) => x.id === node.dataset.id);
      sound(n.chord ?? model.s.tonic);
    } else if (b) {
      playBranch(b);
    }
  });
  $('canvas').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    state.zoom = Math.min(1.8, Math.max(0.45, state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    save();
    const svg2 = $('graph');
    svg2.setAttribute('width', model.g.width * state.zoom);
    svg2.setAttribute('height', model.g.height * state.zoom);
    stickRoot();
  }, { passive: false });
  $('canvas').addEventListener('scroll', stickRoot, { passive: true });
}

// ------------------------------------------------------------ detail footer

function selectedBranch() {
  return model.tree.branches.find((b) => b.id === state.selected) ?? model.tree.branches[0];
}

function renderDetail() {
  const b = selectedBranch();
  const color = laneColor(b.lane);
  const t = model.s.tonic;
  const seq = [t, ...b.chords];
  const chip = (c, i, root) => {
    const v = state.guitar && voicing(c);
    const tip = chordTitle(c) + (v ? ` · guitar ${shapeText(v)}` : '');
    return `<button class="chord${root ? ' root' : ''}${lent(c) ? ' borrowed' : ''}${v ? ' gtr' : ''}" data-i="${i}" title="${esc(tip)}"><b>${esc(c.name)}</b>${v ? chordBox(v) : ''}<small>${esc(c.roman)}</small></button>`;
  };
  const chips = seq.map((c, i) => chip(c, i, i === 0)).join('<span class="arrow">→</span>');
  const shifts = parallelShifts();
  const ending = b.end === 'resolve'
    ? `<span class="arrow">→</span>${chip(t, seq.length, true)}<span class="arrow" title="Resolves to the root">↺</span>`
      + (shifts.modes.length ? `<span class="shift" id="shift"><span class="lbl">⇄ ${shifts.label}:</span>${shifts.modes.map((m) =>
        `<button class="mode${m.id === shiftOpen ? ' open' : ''}" data-shift="${m.id}" title="${esc(m.tip)}" aria-expanded="${m.id === shiftOpen}">${esc(m.name)} ▾</button>`).join('')}${shiftMenu(shifts)}</span>` : '')
    :'<span class="end" title="Ends here">‖</span>' + (b.next
      ? `<button class="cont" id="cont" title="${esc(hintText(b))}">⇢ could continue: ${b.next.home
        ? `resolve to ${esc(t.name)}`
        : `${esc(b.next.node.chord.name)} — ${esc(b.next.via.mood)}`}</button>`
      : '');
  $('detail').innerHTML = `
    <div class="head">
      <span class="dot" style="background:${color}"></span>
      <span class="mood" style="color:${color}">${b.special ? '★ ' : ''}${b.borrowed ? '⇄ ' : ''}${esc(b.mood)}</span>
      <span class="name">${esc(b.name)}</span>
      <span class="now" id="now" aria-live="polite"></span>
      <span class="cad">${esc(b.cadence)}</span>
      ${seg('guitar', [[false, 'Names'], [true, 'Guitar', 'Show a guitar chord diagram under each chord']])}
    </div>
    <div class="row">
      <button class="play" id="play">${playing ? '■ Stop' : '▶ Play'}</button>
      ${chips}${ending}
      <label class="tempo">Tempo <input id="bpm" type="range" min="50" max="180" value="${state.bpm}"> <span id="bpmv">${state.bpm}</span></label>
      <button class="midi" id="midi" title="Drag into your DAW to drop this progression in as MIDI">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/><circle cx="4" cy="7" r="1.3"/><circle cx="10" cy="7" r="1.3"/><circle cx="4" cy="11" r="1.3"/><circle cx="10" cy="11" r="1.3"/></g></svg>
        MIDI</button>
    </div>`;
  showNow(nowChord);
  $('play').onclick = () => (playing ? halt() : playBranch(b));
  wireMidiDrag($('midi'), () => midiFor(b));
  const cont = $('cont');
  if (cont) cont.onclick = () => {
    if (b.next.home) return sound(t);
    state.selected = b.next.via.id;
    save();
    renderDetail();
    focus(null);
  };
  wireShift(shifts);
  $('detail').querySelector('.head').onclick = segClick;
  $('bpm').oninput = (e) => { state.bpm = +e.target.value; $('bpmv').textContent = state.bpm; save(); };
  $('detail').querySelector('.row').onclick = (e) => {
    const c = e.target.closest('.chord');
    if (c) sound(+c.dataset.i >= seq.length ? t : seq[+c.dataset.i]);
  };
}

/** Small guitar chord diagram: strings low E (left) to high E, four frets,
 *  nut or a start-fret number, x / o above muted and open strings. */
function chordBox(v, k = 1) {
  const base = baseFret(v), dx = 7, dy = 9, x0 = 10, y0 = 9;
  const sx = (s) => x0 + s * dx, fy = (f) => y0 + (f - base + 0.5) * dy;
  const strings = v.frets.map((_, s) => `<line x1="${sx(s)}" y1="${y0}" x2="${sx(s)}" y2="${y0 + 4 * dy}"/>`).join('');
  const frets = [0, 1, 2, 3, 4].map((i) => `<line x1="${sx(0)}" y1="${y0 + i * dy}" x2="${sx(5)}" y2="${y0 + i * dy}"/>`).join('');
  const marks = v.frets.map((f, s) => f < 0
    ? `<text class="mx" x="${sx(s)}" y="${y0 - 2.5}">×</text>`
    : f === 0 ? `<circle class="mo" cx="${sx(s)}" cy="${y0 - 4.5}" r="2"/>` : '').join('');
  const b = v.barre;
  const barre = b ? `<rect class="fd" x="${sx(b.from) - 2.8}" y="${fy(b.fret) - 2.8}" width="${sx(b.to) - sx(b.from) + 5.6}" height="5.6" rx="2.8"/>` : '';
  const dots = v.frets.map((f, s) => (f > 0 && !(b && f === b.fret && s >= b.from && s <= b.to)
    ? `<circle class="fd" cx="${sx(s)}" cy="${fy(f)}" r="2.8"/>` : '')).join('');
  const nut = base === 1 ? `<line class="nut" x1="${sx(0) - 0.5}" y1="${y0}" x2="${sx(5) + 0.5}" y2="${y0}"/>`
    : `<text class="fr" x="${x0 - 4}" y="${fy(base) + 2.5}">${base}</text>`;
  const h = y0 + 4 * dy + 2;
  return `<svg class="gbox" viewBox="0 0 50 ${h}" width="${50 * k}" height="${h * k}" aria-hidden="true">${frets}${strings}${nut}${barre}${dots}${marks}</svg>`;
}

// Parallel modes to shift into after a resolved branch, most common first.
const SHIFT_ORDER = {
  major: ['aeolian', 'dorian', 'phrygian', 'harmonic', 'melodic', 'locrian'],
  minor: ['ionian', 'mixolydian', 'lydian', 'phrygdom'],
};
const isMinorMode = (m) => m.tonic !== 'I';

/** Modes on the same root with the opposite tonic quality (major ↔ minor)
 *  that the current style has progressions for: up to three, each with its
 *  own progression tree so the menu can list and preview its branches. */
function parallelShifts() {
  const { mode, style, key } = model.s;
  const minor = isMinorMode(mode);
  const usable = styleModes(style);
  const modes = SHIFT_ORDER[minor ? 'minor' : 'major'].filter((id) => usable.includes(id)).slice(0, 3)
    .map((id) => {
      const m = MODES.find((x) => x.id === id);
      const s = suggest({ ...state, modeId: id });
      return { id, name: m.name, tonic: s.tonic, tree: buildTree(s.templates), tip: `Same root: ${key.name} ${m.name}` };
    });
  return { label: minor ? 'parallel major' : 'parallel minor', modes };
}

// The mode whose progression list is open above its shift button, if any.
let shiftOpen = null;

/** The open mode's progressions, one row each: colour dot, mood, preview
 *  button and the chords in play-panel style. */
function shiftMenu(shifts) {
  const m = shifts.modes.find((x) => x.id === shiftOpen);
  if (!m) return '';
  const rows = m.tree.branches.map((b) => {
    const seq = [m.tonic, ...b.chords].map((c, i) =>
      `<span class="c${lent(c) ? ' borrowed' : ''}" data-i="${i}" title="${esc(chordTitle(c))}">${esc(c.name)}</span>`).join('<span class="arrow">→</span>');
    const end = b.end === 'resolve' ? '<span class="arrow" title="Resolves to the root">↺</span>' : '<span class="end" title="Ends here">‖</span>';
    return `<div class="srow" role="option" tabindex="-1" data-b="${b.id}" title="${esc(b.name)}">
      <span class="dot" style="background:${laneColor(b.lane)}"></span>
      <span class="smood">${esc(b.mood)}</span>
      <button class="sprev" title="Preview · right-click: play the selected progression first, then this one">▶</button>
      <span class="sseq">${seq}${end}</span></div>`;
  }).join('');
  return `<div class="shiftmenu" role="listbox" aria-label="${esc(m.name)} progressions">${rows}</div>`;
}

function closeShift() {
  if (shiftOpen === null) return;
  shiftOpen = null;
  stop();
  renderDetail();
}

function wireShift(shifts) {
  const el = $('shift');
  if (!el) return;
  const m = shifts.modes.find((x) => x.id === shiftOpen);
  const rows = [...el.querySelectorAll('.srow')];
  // Keep the menu inside the window: slide it left if it would overflow.
  const menu = el.querySelector('.shiftmenu');
  if (menu) {
    const over = menu.getBoundingClientRect().right - (innerWidth - 12);
    if (over > 0) menu.style.left = `${-over}px`;
  }
  el.onclick = (e) => {
    const btn = e.target.closest('[data-shift]');
    if (btn) {
      shiftOpen = shiftOpen === btn.dataset.shift ? null : btn.dataset.shift;
      stop();
      renderDetail();
      $('shift')?.querySelector('.srow')?.focus();
      return;
    }
    const row = e.target.closest('.srow');
    if (!row) return;
    const b = m.tree.branches.find((x) => x.id === +row.dataset.b);
    if (e.target.closest('.sprev')) previewShift(m, b, row);
    else pickShift(m.id, b.id);
  };
  // Right-click ▶ plays the selected progression first, then this one.
  el.oncontextmenu = (e) => {
    const row = e.target.closest('.srow');
    if (!row || !e.target.closest('.sprev')) return;
    e.preventDefault();
    e.stopPropagation();
    previewShift(m, m.tree.branches.find((x) => x.id === +row.dataset.b), row, true);
  };
  el.onkeydown = (e) => {
    const i = rows.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeShift(); el.querySelector('.mode.open')?.focus(); }
    else if (!rows.length) return;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = e.key === 'ArrowDown' ? i + 1 : i - 1;
      rows[(n + rows.length) % rows.length].focus();
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      pickShift(m.id, +rows[i].dataset.b);
    } else if (e.key === ' ' && i >= 0) {
      e.preventDefault();
      e.stopPropagation();
      previewShift(m, m.tree.branches.find((x) => x.id === +rows[i].dataset.b), rows[i]);
    }
  };
}

/** Plays a branch of the other mode without switching to it. With chain,
 *  the selected progression plays first, so you hear the shift itself. */
function previewShift(m, b, row, chain = false) {
  if (playing) halt();
  const first = chain ? sequenceFor(selectedBranch()) : { chords: [], beats: [] };
  const second = sequenceFor(b, m.tonic);
  const chords = [...first.chords, ...second.chords], beats = [...first.beats, ...second.beats];
  const n = first.chords.length;
  const clear = () => document.querySelectorAll('#detail .playing').forEach((x) => x.classList.remove('playing'));
  playSequence(chords, state.bpm, beats, (i) => {
    clear();
    if (i < n) $('detail').querySelector(`.row .chord[data-i="${i}"]`)?.classList.add('playing');
    // The closing root chord (phrase length) lights up the first chip again.
    else row.querySelector(`.c[data-i="${i - n > b.chords.length ? 0 : i - n}"]`)?.classList.add('playing');
    showNow(chords[i]);
  }, () => { clear(); showNow(null); });
}

/** Switches to the parallel mode with the chosen branch selected. */
function pickShift(modeId, branchId) {
  shiftOpen = null;
  update({ modeId });
  if (model.tree.branches.some((b) => b.id === branchId)) {
    state.selected = branchId;
    save();
    renderDetail();
    focus(null);
  }
}

document.addEventListener('mousedown', (e) => {
  if (shiftOpen !== null && !e.target.closest('#shift')) closeShift();
});

// ------------------------------------------------------------ MIDI drag-out

/** The selected progression as MIDI: what Play plays, at the current tempo. */
function midiFor(b) {
  const { chords, beats } = sequenceFor(b);
  const { style, mode, key } = model.s;
  const modeName = style.id === 'theory' ? mode.name : `${mode.name} ${style.name}`;
  const name = midiFileName(key.name, modeName, b.name);
  return { name, bytes: progressionToMidi(chords, { bpm: state.bpm, beats, name: name.replace(/\.mid$/, '') }) };
}

function flashMidi(btn, text, cls) {
  btn.dataset.msg = text;
  btn.classList.add(cls);
  setTimeout(() => { btn.classList.remove(cls); delete btn.dataset.msg; }, 2200);
}

/** Makes `btn` drag out the MIDI file that build() returns ({ name, bytes }). */
function wireMidiDrag(btn, build) {
  const tauri = window.__TAURI__?.core;
  if (!tauri) {
    // Plain browser: let Chromium drag the file out itself (drops onto the desktop).
    btn.draggable = true;
    btn.ondragstart = (e) => {
      const { name, bytes } = build();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
      e.dataTransfer.setData('DownloadURL', `audio/midi:${name}:${url}`);
      e.dataTransfer.effectAllowed = 'copy';
    };
    btn.onclick = () => flashMidi(btn, 'Drag me out', 'hint');
    return;
  }
  // Desktop app: once the pointer has moved a few pixels with the button held,
  // hand a real file to the OS drag, which DAWs accept like one from Explorer.
  btn.onmousedown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    const done = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', done); };
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      done();
      const { name, bytes } = build();
      btn.classList.add('dragging');
      tauri.invoke('drag_midi', { name, bytes: Array.from(bytes) })
        .catch((err) => { console.error(err); flashMidi(btn, 'Drag failed', 'error'); })
        .finally(() => btn.classList.remove('dragging'));
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', done);
  };
  btn.onclick = () => flashMidi(btn, 'Drag me into your DAW', 'hint');
}

// ------------------------------------------------------------ playback

/** What a progression sounds like, shared by Play and the MIDI export.
 *  'phrase': 2 beats per chord, then back to the root if it resolves.
 *  'loop': 1 bar per chord, no closing chord, and the last chord held so the
 *  loop fills a whole number of 4-bar phrases (4 chords -> 4 bars, 5 -> 8). */
function sequenceFor(b, tonic = model.s.tonic) {
  const chords = [tonic, ...b.chords];
  const nodeIds = ['root', ...b.path.map((n) => n.id)];
  if (state.length === 'loop') {
    const beats = chords.map(() => 4);
    beats[beats.length - 1] += (Math.ceil(chords.length / 4) * 4 - chords.length) * 4;
    return { chords, nodeIds, beats };
  }
  if (b.end === 'resolve') {
    chords.push(tonic);
    // In R-node view the resolution lights up the branch's R node, not the root.
    nodeIds.push(state.returnStyle === 'node' ? `badge:${b.id}` : 'root');
  }
  return { chords, nodeIds, beats: chords.map(() => 2) };
}

// The chord currently sounding, shown next to the title in the play panel.
let nowChord = null, nowTimer = 0;

function showNow(c) {
  nowChord = c;
  const el = $('now');
  if (!el) return;
  el.innerHTML = c ? `<span class="note">♪</span><span class="tones">${esc(c.notes.join(' '))}</span>` : '';
  el.classList.toggle('on', !!c);
}

/** Plays one chord and shows its notes until it fades. */
function sound(c) {
  playChord(c);
  showNow(c);
  clearTimeout(nowTimer);
  nowTimer = setTimeout(() => { if (!playing) showNow(null); }, 1600);
}

function halt() {
  stop();
  playing = false;
  clearTimeout(nowTimer);
  nowChord = null;
  document.querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
  focus(null);
  renderDetail();
}

function playBranch(b) {
  state.selected = b.id;
  save();
  playing = true;
  renderDetail();
  focus(b);
  const { chords, nodeIds, beats } = sequenceFor(b);
  playSequence(chords, state.bpm, beats, (i) => {
    document.querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
    const id = nodeIds[i];
    const sel = id.startsWith('badge:') ? `#graph .badge[data-badge="${id.slice(6)}"]` : `#graph .node[data-id="${CSS.escape(id)}"]`;
    document.querySelector(sel)?.classList.add('playing');
    document.querySelector(`#detail .chord[data-i="${i}"]`)?.classList.add('playing');
    showNow(chords[i]);
  }, halt);
}

// ------------------------------------------------------------ sax view

// What the grid shows: null = the scale, else an index into the progression
// (0 = root chord). Follows the backing track while it plays.
let hornFocus = null;
let linePlaying = false, alongPlaying = false;

const hornModel = (chord = null) => hornView({
  instrumentId: state.instrument, pitch: state.pitch, rootPc: state.rootPc, modeId: state.modeId,
  scaleId: state.hornScale, chord,
});

const modeLabel = (m) => m.name + (m.alias ? ` (${m.alias})` : '');
const fnName = { R: 'root', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 9: '9th' };

/** Segmented control bound to a state key; values are compared as strings. */
const seg = (key, opts) => `<div class="seg" data-set="${key}">${opts.map(([v, label, tip]) =>
  `<button data-v="${v}" class="${String(state[key]) === String(v) ? 'on' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(label)}</button>`).join('')}</div>`;

/** The selected progression in the sax view: concert chords (root chord
 *  first), each re-spelled in the shown pitch, and its guide-tone line. */
function hornProgression() {
  const b = selectedBranch();
  const chords = [model.s.tonic, ...b.chords];
  const h = hornModel();
  const layers = chords.map((c) => chordLayer(c, model.s.key, h.key));
  return { b, chords, layers, line: guideLine(layers, h.inst, state.pitch) };
}

/** Bars per chord for the play-along, the last chord held so the loop fills
 *  whole 4-chord phrases. */
function alongBeats(n) {
  const beats = Array.from({ length: n }, () => 4 * state.bars);
  beats[n - 1] += (Math.ceil(n / 4) * 4 - n) * 4 * state.bars;
  return beats;
}

function renderHorn() {
  const h = hornModel(), inst = h.inst, written = state.pitch === 'written';
  const nm = (n) => formatNote(n.letter, n.acc, state.names);
  const p = hornProgression();
  if (hornFocus !== null && hornFocus >= p.chords.length) hornFocus = null;

  // Title: the key in the pitch shown, the other pitch underneath.
  // The title names the scale chosen with the scale chips; with a soloing
  // scale (pentatonic, blues) the key it belongs to goes underneath.
  const solo = h.scale.id !== 'mode';
  const pitchTag = written ? 'written' : 'concert';
  $('keyTitle').textContent = solo
    ? `${inst.name} — ${nm(h.tonic)} ${h.scale.name.toLowerCase()} (${pitchTag})`
    : `${inst.name} — ${nm(h.key)} ${modeLabel(h.mode)} (${pitchTag})`;
  const keyLine = solo ? `Key: ${nm(h.key)} ${h.mode.name}. ` : '';
  $('keyFeel').textContent = keyLine + (written
    ? `Concert ${nm(h.otherKey)} ${h.mode.name}. The ${inst.name.toLowerCase()} is in ${inst.key}: it sounds ${inst.interval} lower than written.`
    : `Written ${nm(h.otherKey)} ${h.mode.name} for ${inst.name.toLowerCase()} (in ${inst.key}: sounds ${inst.interval} lower than written).`);
  $('keyFeel').title = $('keyFeel').textContent; // the line is cut off when space is short

  const branches = model.tree.branches.map((b) =>
    `<option value="${b.id}"${b.id === p.b.id ? ' selected' : ''}>${esc(b.mood)} — ${esc(b.name)}</option>`).join('');
  const chips = p.layers.map((l, i) =>
    `<button class="hchord${i === 0 ? ' root' : ''}${lent(p.chords[i]) ? ' borrowed' : ''}" data-ci="${i}" title="${esc(chordTitle(p.chords[i]))}">
      <b>${esc(chordSymbol(l, state.names))}</b><small>${esc(p.chords[i].roman)}</small></button>`).join('<span class="arrow">→</span>');
  const ending = p.b.end === 'resolve' ? '<span class="arrow" title="Resolves to the root">↺</span>' : '<span class="end" title="Ends here">‖</span>';
  const triadHint = state.guideLine && state.color === 'triad'
    ? `<span class="hhint">Triads have no 7th, so the line uses 3rds and roots. <button class="link" id="use7">Use 7th chords</button></span>` : '';

  // Header: instrument, pitch and the display options (a dropdown panel).
  $('saxbar').innerHTML = `
    ${seg('practice', [[false, 'Explore'], [true, 'Practice', 'Ear-training and reading drills']])}
    <select id="inst" class="select" aria-label="Instrument">${INSTRUMENTS.map((i) =>
      `<option value="${i.id}"${i.id === inst.id ? ' selected' : ''}>${esc(i.name)} (${i.key})</option>`).join('')}</select>
    ${seg('pitch', [['written', 'Written', 'What the player reads'], ['concert', 'Concert', 'What sounds: piano pitch']])}
    <div class="hoptwrap">
      <button class="hoptbtn${optsOpen ? ' open' : ''}" id="hoptbtn" aria-expanded="${optsOpen}">Options ▾</button>
      <div class="hopts" id="hopts"${optsOpen ? '' : ' hidden'}>
        <div class="hfield"><span>Note names</span>${seg('names', [['letters', 'C D E'], ['dutch', 'Cis Bes', 'Dutch: Cis, Bes, Es, As'], ['fixed', 'Do Re Mi', 'Fixed do: Do is always C']])}</div>
        <div class="hfield"><span>Movable do</span>${seg('solfa', [[false, 'Off'], [true, 'On', 'Syllables by scale degree: Do is the key’s tonic']])}</div>
        ${state.solfa ? `<div class="hfield"><span>Minor keys</span>${seg('minorDo', [['do', 'Do-based', 'Minor tonic is Do (♭3 = Me)'], ['la', 'La-based', 'Minor tonic is La']])}</div>` : ''}
        <div class="hfield"><span>Show</span>${seg('show', [['both', 'Staff + grid'], ['staff', 'Staff'], ['grid', 'Grid']])}</div>
        <div class="hfield"><span>Names under notes</span>${seg('underNames', [[true, 'On'], [false, 'Off']])}</div>
        <div class="hfield"><span>Fingering strip</span>${seg('strip', [[true, 'On', 'Small fingering charts under the scale staff'], [false, 'Off']])}</div>
      </div>
    </div>`;
  $('inst').onchange = (e) => update({ instrument: e.target.value });

  $('horn').innerHTML = `
    <div class="quiz" id="hquiz"></div>
    <div class="hprog">
      <select id="hbranch" class="select" aria-label="Progression" title="Progression">${branches}</select>
      <div class="hchords" id="hchords">
        <span class="chiplabel" title="The notes to improvise with: the key's full scale, or a smaller pentatonic or blues set">Solo with</span>
        <span class="scalechips">${SCALES.map((s) => `<button class="hchord scalechip" data-ci="-1" data-scale="${s.id}"
          title="Show the ${esc(s.id === 'mode' ? `${h.mode.name} scale` : s.name.toLowerCase())}">${esc(s.id === 'mode' ? h.mode.name : s.short ?? s.name)}</button>`).join('')}</span>
        <span class="sep"></span>${chips}${ending}
      </div>
    </div>
    <div class="hplay">
      <button class="play" id="halong" title="Count-in, then the progression on a loop · Space">${alongPlaying ? '■ Stop' : '▶ Play along'}</button>
      <button class="mic${micOn() ? ' on' : ''}" id="hmic" title="Tuner: listens to your sax. Nothing is recorded or saved.">${micOn() ? '● Listening' : '🎤 Listen'}</button>
      <div class="hfield inline"><span>Guide-tone line</span>${seg('guideLine', [[false, 'Off'], [true, 'On', 'Play and show a smooth line through each chord’s 3rd and 7th']])}</div>
      <div class="hfield inline"><span>Bars per chord</span>${seg('bars', [[1, '1'], [2, '2']])}</div>
      <label class="tempo">Tempo <input id="hbpm" type="range" min="50" max="180" value="${state.bpm}"> <span id="hbpmv">${state.bpm}</span></label>
      <button class="mic" id="hprint" title="One page: the scale with fingerings, chord tones for each chord, and the lead sheet. Print it or save it as a PDF.">🖨 Practice sheet</button>
      ${triadHint}
    </div>
    <div id="hline"></div>
    <div id="hfocus"></div>
    <div class="hmid">
      <div class="staffbox tunerbox" id="htuner"${micOn() || micError ? '' : ' hidden'}></div>
      <div class="hstaves" id="hstaves"${state.show === 'grid' ? ' hidden' : ''}></div>
      <div class="staffbox fingerbox" id="hfinger"></div>
    </div>
    <div class="hgrid" id="hgrid"${state.show === 'staff' ? ' hidden' : ''}></div>
    <div class="hlegend" id="hlegend"></div>`;
  $('hbranch').onchange = (e) => {
    stopHorn();
    state.selected = +e.target.value;
    hornFocus = null;
    save();
    renderDetail();
    renderHorn();
  };
  $('hbpm').oninput = (e) => { state.bpm = +e.target.value; $('hbpmv').textContent = state.bpm; save(); };
  const use7 = $('use7');
  if (use7) use7.onclick = () => update({ color: 'seventh' });
  $('horn').classList.toggle('practicing', !!state.practice);
  if (state.practice) renderQuiz();
  renderFocus(p);
}

/** The part that follows the focused chord: guide-line chips, the scale or
 *  "over this chord" panel, the grid and its legend. */
function renderFocus(p = hornProgression()) {
  const chord = hornFocus === null ? null : p.chords[hornFocus];
  const h = hornModel(chord);
  const nm = (n) => formatNote(n.letter, n.acc, state.names);
  // Movable do: on the scale view Do is the scale's tonic; over a chord it
  // stays the key's tonic, which is what shows the chord's function.
  const syl = (n) => (chord
    ? solfa(n, h.keyTonic, { minor: h.mode.tonic !== 'I', la: state.minorDo === 'la' })
    : solfa(n, h.tonic, { minor: h.minor, la: state.minorDo === 'la' }));
  const lineNote = state.guideLine && hornFocus !== null ? p.line[hornFocus] : null;

  document.querySelectorAll('#hchords .hchord').forEach((el) => {
    if (el.dataset.scale) {
      // The chosen scale: lit while it is shown, marked while a chord is.
      const mine = el.dataset.scale === state.hornScale;
      el.classList.toggle('on', mine && hornFocus === null);
      el.classList.toggle('sel', mine && hornFocus !== null);
    } else el.classList.toggle('on', +el.dataset.ci === (hornFocus ?? -1));
  });

  $('hline').innerHTML = state.guideLine
    ? `<div class="hlinerow"><span class="lbl">Guide-tone line</span>${p.line.map((n, i) =>
      `<button class="hln${i === hornFocus ? ' on' : ''}" data-ci="${i}" title="${esc(fnName[n.fn])} of ${esc(chordSymbol(p.layers[i], state.names))}">
        <b>${esc(nm(n))}</b><small>${esc(n.fn)}</small></button>`).join('<span class="arrow">→</span>')}
        ${midiButton('hmidiLine', 'Drag out the guide-tone line, with the chords as a second track (concert pitch, play-along bar lengths)')}</div>`
    : '';
  if ($('hmidiLine')) wireMidiDrag($('hmidiLine'), () => lineMidi(p));

  if (!chord) {
    const scaleTitle = `${nm(h.tonic)} ${h.scale.id === 'mode' ? modeLabel(h.mode) : h.scale.name.toLowerCase()}`;
    $('hfocus').innerHTML = `<div class="hscale">
      <h3>${esc(scaleTitle)}</h3>
      <div class="hnotes">${h.notes.map((n, i) =>
        `<button class="hnote${i === 0 ? ' tonic' : ''}${n.blue ? ' blue' : ''}" data-pc="${n.pc}" title="${n.blue ? 'Blue note' : ''}">
          <b>${esc(nm(n))}</b>${state.solfa ? `<i>${esc(syl(n))}</i>` : ''}<small>${esc(degreeLabel(n, h.tonic))}</small></button>`).join('')}</div>
      <button class="play" id="hplay">${linePlaying ? '■ Stop' : '▶ Play scale'}</button>
      <button class="mic${exercise ? ' on' : ''}" id="hexer" title="Play this scale on your sax, up and down: the app listens and moves on when each note is right">${exercise ? '■ Stop exercise' : '🎯 Play it back'}</button>
      ${midiButton('hmidiScale', 'Drag into your DAW or MuseScore: this scale up and down, as Play scale plays it (concert pitch)')}</div>`;
  } else {
    const l = h.layer, sym = chordSymbol(l, state.names);
    const from = lent(chord) ? `borrowed from ${chord.source.name}` : chord.source === 'secondary' ? 'secondary dominant' : '';
    const scaleName = `${nm(l.root)} ${l.scaleMode ? l.scaleMode.name : 'scale'}`;
    const change = l.changes.length
      ? `changes ${l.changes.map((c) => `${nm(c.from)} → ${nm(c.to)}`).join(', ')}`
      : 'the key’s own notes, nothing changes';
    $('hfocus').innerHTML = `<div class="hscale over">
      <h3>Over ${esc(sym)} <small>${esc(chord.roman)}${from ? ` · ${esc(from)}` : ''}</small></h3>
      <div class="hnotes">${l.tones.map((t) =>
        `<button class="hnote tone${t.guide ? ' guide' : ''}${t.fn === 'R' ? ' tonic' : ''}" data-pc="${t.pc}" title="${esc(fnName[t.fn])}${t.guide ? ' · guide tone' : ''}">
          <b>${esc(nm(t))}</b>${state.solfa ? `<i>${esc(syl(t))}</i>` : ''}<small>${esc(t.fn)}</small></button>`).join('')}</div>
      <div class="hover-text">
        <div><span class="k">Guide tones</span>${[l.third, l.seventh].filter((t, i, a) => a.indexOf(t) === i).map((t) => `${esc(nm(t))} (${fnName[t.fn]})`).join(' · ')}</div>
        <div><span class="k">Scale</span>${esc(scaleName)}: ${esc(l.scale.map(nm).join(' '))} — ${esc(change)}</div>
      </div></div>`;
  }

  if ($('hmidiScale')) wireMidiDrag($('hmidiScale'), scaleMidi);
  renderStaves(h, p, chord, nm, syl);
  renderFinger();
  // Grid and staves were rebuilt: put the tuner marks back after this.
  queueMicrotask(() => { renderTuner(true); markHeard(); });

  // One row per octave (high at the top), one column per pitch class, so the
  // same note lines up vertically and the scale's repeating shape shows.
  const written = state.pitch === 'written', inst = h.inst;
  const rows = new Map();
  for (const c of h.cells) {
    const r = Math.floor(c.midi / 12) - 1;
    if (!rows.has(r)) rows.set(r, Array(12).fill(null));
    rows.get(r)[c.pc] = c;
  }
  const regTip = Object.fromEntries(REGISTERS.map((r) => [r.id, r.tip]));
  const cell = (c) => {
    if (!c) return '<span class="hcell empty"></span>';
    const here = `${nm(c)}${c.octave}`, there = `${formatNote(c.other.letter, c.other.acc, state.names)}${c.other.octave}`;
    const tip = (written ? `Written ${here} · sounds ${there} (concert)` : `Concert ${here} · written ${there} for ${inst.name.toLowerCase()}`)
      + (c.fn ? `\n${fnName[c.fn]} of ${chordSymbol(h.layer, state.names)}${c.guide ? ' · guide tone' : ''}` : '')
      + `\n${regTip[c.register]}`;
    const cls = ['hcell', `r-${c.register}`, c.inScale && 'in', c.tonic && 'tonic', c.blue && 'blue',
      c.fn && 'tone', c.guide && 'guide', lineNote && lineNote.midi === c.midi && 'line'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-m="${c.midi}" title="${esc(tip)}">
      ${c.fn ? `<em>${esc(c.fn)}</em>` : ''}<b>${esc(nm(c))}</b>${state.solfa && c.inScale ? `<i>${esc(syl(c))}</i>` : ''}</button>`;
  };
  $('hgrid').innerHTML = [...rows].sort((a, b) => b[0] - a[0]).map(([r, cols]) =>
    `<div class="hrow"><span class="oct" title="Octave ${r}">${r}</span>${cols.map(cell).join('')}</div>`).join('');

  $('hlegend').innerHTML = (chord
    ? `<span><i class="sw tonic"></i>root</span><span><i class="sw tone"></i>chord tone</span><span><i class="sw guide"></i>guide tone (3rd, 7th)</span>
       ${lineNote ? '<span><i class="sw line"></i>guide-tone line</span>' : ''}<span><i class="sw in"></i>fits the chord</span>`
    : `<span><i class="sw tonic"></i>tonic</span><span><i class="sw in"></i>in the scale</span>
       ${h.scale.blue ? '<span><i class="sw blue"></i>blue note</span>' : ''}`)
    + `<span class="sep"></span>
      ${REGISTERS.map((r) => `<span title="${esc(r.tip)}"><i class="bar r-${r.id}"></i>${esc(r.tip.split(':')[0])}${r.id === 'low' ? '' : ` · ${esc(r.tip.split(': ')[1])}`}</span>`).join('')}
      <span class="hint">Click a chord to see its notes · click a note to hear it (concert pitch) · Space plays along</span>`;
}

// ------------------------------------------------------------ staff

/** The focus staff (the scale, or the chord's tones as an arpeggio) and the
 *  progression as a one-line lead sheet, in the pitch shown. Tenor and
 *  baritone use bass clef in concert pitch, where their sound sits. */
function renderStaves(h, p, chord, nm, syl) {
  if (state.show === 'grid') return;
  const { clef, rows, focus, lead } = buildStaves(h, p, chord, nm, syl);
  focus.strip = state.strip;
  // Fixed height (ledger room from A3 to E6 in treble) and, for the focus
  // staff, the width of a full octave with a 7-accidental key signature, so
  // the boxes keep their size as the scale, chord or key changes.
  const noteW = state.strip ? 48 : STAFF.noteW;
  focus.minWidth = 8 + STAFF.clefW + 7 * STAFF.sigW + 8 + STAFF.barPad + 8 * noteW + 2 * STAFF.accW;
  $('hstaves').innerHTML = [focus, lead].map((s) => {
    const g = layoutStaff({ clef, sig: s.sig, bars: s.bars, labels: rows, noteW: s.strip ? noteW : undefined,
      span: [-3, 12], minWidth: s.minWidth ?? 0 });
    return `<div class="staffbox"><h4>${esc(s.title)}</h4>${staffSvg(g, s.current, s.strip)}</div>`;
  }).join('');
}

/** The staves' content (shared by the view and the practice sheet): clef,
 *  rows of text under the notes, the focus staff and the lead sheet. */
function buildStaves(h, p, chord, nm, syl, { guide = state.guideLine, current = hornFocus } = {}) {
  const clef =state.pitch === 'concert' && ['tenor', 'bari'].includes(h.inst.id) ? 'bass' : 'treble';
  const mid = clef === 'bass' ? 50 : 71; // middle line: D3 / B4
  const top = h.cells.at(-1).midi, bottom = h.cells[0].midi;
  const keySig = keySignature(h.key, h.mode.id);
  // The lead sheet's syllables are always relative to the key's tonic.
  const keySyl = (n) => solfa(n, h.keyTonic, { minor: h.mode.tonic !== 'I', la: state.minorDo === 'la' });
  const texts = (n, s = syl) => (state.underNames ? [nm(n), ...(state.solfa ? [s(n)] : [])] : []);
  const rows = state.underNames ? (state.solfa ? 2 : 1) : 0;
  const toNote = (c, cls) => ({ letter: c.letter, acc: c.acc, octave: c.octave, midi: c.midi, sound: c.sound,
    written: c.sound + h.inst.shift, cls, texts: texts(c) });

  // Focus staff. The root/tonic is the one whose octave sits nearest the
  // middle of the staff.
  const roots = h.cells.filter((c) => c.tonic && c.midi + 12 <= top)
    .sort((a, b) => Math.abs(a.midi + 6 - mid) - Math.abs(b.midi + 6 - mid));
  const t = roots[0];
  let focus;
  if (!chord) {
    const s = h.scale;
    const sig = s.id === 'mode' ? keySig : keySignature(h.tonic, s.minor ? 'aeolian' : 'ionian');
    const notes = h.cells.filter((c) => c.inScale && c.midi >= t.midi && c.midi <= t.midi + 12)
      .map((c) => toNote(c, [c.tonic && 'tonic', c.blue && 'blue'].filter(Boolean).join(' ')));
    focus = { title: 'Scale', sig, bars: [{ notes }] };
  } else {
    // Chord tones upward from the root, each on the next note above the last.
    const notes = [];
    let at = t.midi - 1;
    for (const tone of h.layer.tones) {
      at += 1 + mod12(tone.pc - (at + 1));
      const c = h.cells.find((x) => x.midi === at);
      if (c) notes.push(toNote(c, [tone.fn === 'R' && 'tonic', tone.guide && 'guide'].filter(Boolean).join(' ')));
    }
    focus = { title: `Over ${chordSymbol(h.layer, state.names)}`, sig: keySig, bars: [{ label: chordSymbol(h.layer, state.names), notes }] };
  }

  // Lead sheet: one bar per chord, the guide-tone line or else the roots.
  const lead = {
    title: guide ? 'Progression · guide-tone line' : 'Progression · roots',
    sig: keySig,
    bars: p.layers.map((l, i) => {
      const n = guide ? p.line[i] : (() => {
        const m = mid - 6 + mod12(l.root.pc - (mid - 6));
        return { ...l.root, midi: m, sound: m - (state.pitch === 'written' ? h.inst.shift : 0) };
      })();
      const note = { letter: n.letter, acc: n.acc, octave: octaveOf(n.midi, n.acc), midi: n.midi, sound: n.sound,
        cls: guide ? 'line' : 'tonic', texts: texts(n, keySyl) };
      return { label: chordSymbol(l, state.names), notes: n.midi >= bottom && n.midi <= top ? [note] : [] };
    }),
    current,
  };
  return { clef, rows, focus, lead };
}

// ------------------------------------------------------------ practice sheet

/** Fills #printsheet with a one-page sheet for the current settings and
 *  opens the print dialog (which also offers "Save as PDF"). */
function printSheet() {
  const p = hornProgression();
  const h = hornModel(), inst = h.inst, written = state.pitch === 'written';
  const nm = (n) => formatNote(n.letter, n.acc, state.names);
  const la = state.minorDo === 'la';
  const sylFor = (hh, chord) => (n) => (chord
    ? solfa(n, hh.keyTonic, { minor: hh.mode.tonic !== 'I', la })
    : solfa(n, hh.tonic, { minor: hh.minor, la }));
  const svg = (s, clef, rows, strip = false) =>
    staffSvg(layoutStaff({ clef, sig: s.sig, bars: s.bars, labels: rows, noteW: strip ? 48 : undefined }), null, strip);

  const base = buildStaves(h, p, null, nm, sylFor(h, null), { guide: true, current: null });
  const scaleTitle = `${nm(h.tonic)} ${h.scale.id === 'mode' ? modeLabel(h.mode) : h.scale.name.toLowerCase()}`;
  const chords = p.chords.map((c) => {
    const hc = hornModel(c), l = hc.layer, sym = chordSymbol(l, state.names);
    const s = buildStaves(hc, p, c, nm, sylFor(hc, c), { guide: true, current: null });
    s.focus.bars[0].label = null; // the box title already names the chord
    const guide = [l.third, l.seventh].filter((t, i, a) => a.indexOf(t) === i).map((t) => `${nm(t)} (${fnName[t.fn]})`).join(' · ');
    const change = l.changes.length ? `changes ${l.changes.map((x) => `${nm(x.from)} → ${nm(x.to)}`).join(', ')}` : 'the key’s own notes';
    return `<div class="ps-chord"><div class="ps-ch"><b>${esc(sym)}</b> <small>${esc(c.roman)}</small></div>
      ${svg(s.focus, s.clef, s.rows)}
      <div class="ps-cap">Guide tones: ${esc(guide)}<br>${esc(`${nm(l.root)} ${l.scaleMode ? l.scaleMode.name : 'scale'}`)} — ${esc(change)}</div></div>`;
  }).join('');

  let sheet = $('printsheet');
  if (!sheet) { sheet = document.createElement('div'); sheet.id = 'printsheet'; document.body.appendChild(sheet); }
  sheet.innerHTML = `
    <header>
      <h1>${esc(inst.name)} — ${esc(nm(h.key))} ${esc(modeLabel(h.mode))} <span>(${written ? 'written' : 'concert'})</span></h1>
      <p>${written ? `Concert ${esc(nm(h.otherKey))} ${esc(h.mode.name)}` : `Written ${esc(nm(h.otherKey))} ${esc(h.mode.name)} for ${esc(inst.name.toLowerCase())}`}
        · Progression: ${esc(p.b.mood)} — ${esc(p.b.name)}</p>
    </header>
    <section><h2>Scale · ${esc(scaleTitle)}</h2>${svg(base.focus, base.clef, base.rows, true)}</section>
    <section><h2>Chords · tones to aim for</h2><div class="ps-chords${p.chords.length > 6 ? ' dense' : ''}">${chords}</div></section>
    <section><h2>Lead sheet · guide-tone line</h2>${svg(base.lead, base.clef, base.rows)}</section>
    <footer>Chordfinder</footer>`;

  // WKWebView (macOS) ignores window.print(); the app asks the window instead.
  const tauri = window.__TAURI__?.core;
  if (tauri && /Mac/.test(navigator.userAgent)) tauri.invoke('print_page').catch((e) => console.error(e));
  else window.print();
}

// ------------------------------------------------------------ fingering

// The note the fingering panel shows (displayed MIDI), null = the tonic.
let fingerMidi = null;

/** A fingering diagram: pressed keys filled. Full size has key names as
 *  tooltips and the hand labels. */
function fingerSvg(keys, { scale = 1, full = false } = {}) {
  const on = new Set(keys);
  const shapes = KEYS.map((k) => {
    const cls = `fk${on.has(k.id) ? ' on' : ''}`;
    const t = full ? `<title>${esc(k.name)}</title>` : '';
    return k.s === 'c'
      ? `<circle class="${cls}" cx="${k.x}" cy="${k.y}" r="${k.r}">${t}</circle>`
      : `<ellipse class="${cls}" cx="${k.x}" cy="${k.y}" rx="${k.rx}" ry="${k.ry}">${t}</ellipse>`;
  }).join('');
  const deco = `<line class="fdiv" x1="34" y1="${DIAGRAM.split}" x2="66" y2="${DIAGRAM.split}"/>`
    + (full ? `<text class="fhand" x="98" y="60">L</text><text class="fhand" x="98" y="176">R</text>` : '');
  return `<g transform="scale(${scale})">${deco}${shapes}</g>`;
}

/** Fingering panel for `fingerMidi`: big diagram, the note in both pitches,
 *  register, and the common alternates. */
function renderFinger() {
  const el = $('hfinger');
  if (!el) return;
  const chord = hornFocus === null ? null : hornProgression().chords[hornFocus];
  const h = hornModel(chord), inst = h.inst, written = state.pitch === 'written';
  const shown = written ? inst.shift : 0;
  const mid = 67 - inst.shift + shown; // around written G4
  const cell = h.cells.find((c) => c.midi === fingerMidi)
    ?? h.cells.filter((c) => c.tonic).sort((a, b) => Math.abs(a.midi - mid) - Math.abs(b.midi - mid))[0];
  const w = cell.sound + inst.shift;
  const [main, ...alts] = fingeringsFor(w);
  const nm = (l, a) => formatNote(l, a, state.names);
  const here = `${nm(cell.letter, cell.acc)}${cell.octave}`, there = `${nm(cell.other.letter, cell.other.acc)}${cell.other.octave}`;
  const reg = REGISTERS.find((r) => r.id === cell.register);
  el.innerHTML = `<h4>Fingering</h4>
    <div class="fmain">
      <svg class="fdiag" width="${DIAGRAM.w}" height="${DIAGRAM.h}" viewBox="0 0 ${DIAGRAM.w} ${DIAGRAM.h}">${fingerSvg(main.keys, { full: true })}</svg>
      <div class="finfo">
        <b>${esc(written ? here : there)}</b>
        <span>${written ? `written · sounds ${esc(there)}` : `written · sounds ${esc(here)} (concert)`}</span>
        <span class="freg">${esc(reg.tip)}</span>
        ${main.keys.length ? '' : '<span class="freg">All keys open</span>'}
        ${alts.length ? `<div class="falts">${alts.map((a) => `<div class="falt" title="${esc(a.tip)}">
          <svg width="${DIAGRAM.w * 0.45}" height="${DIAGRAM.h * 0.45}">${fingerSvg(a.keys, { scale: 0.45 })}</svg>
          <small>${esc(a.name)}</small></div>`).join('')}</div>` : ''}
      </div>
    </div>`;
}

const mod12 = (n) => ((n % 12) + 12) % 12;

/** SVG for a laid-out staff; `current` highlights that bar; `strip` adds a
 *  small fingering chart under each note. */
function staffSvg(g, current = null, strip = false) {
  const sc = 0.42, stripY = g.height + 4;
  const extra = strip ? DIAGRAM.h * sc + 8 : 0;
  const x0 = 4, x1 = g.width - 2;
  const [topLine, , , , botLine] = g.lines;
  const hl = current !== null && g.barBoxes[current]
    ? `<rect class="sbar-on" x="${g.barBoxes[current].x + 2}" y="${topLine - 22}" width="${g.barBoxes[current].w - 4}" height="${botLine - topLine + 30}" rx="6"/>` : '';
  const lines = g.lines.map((y) => `<line class="sline" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`).join('');
  const clef = g.clef.id === 'treble'
    ? `<text class="sclef" x="6" y="${botLine + g.half * 2.6}" style="font-size:${g.half * 15}px">${g.clef.glyph}</text>`
    : `<text class="sclef" x="8" y="${topLine + g.half * 6.2}" style="font-size:${g.half * 8.6}px">${g.clef.glyph}</text>`;
  const sig = g.sigGlyphs.map((s) => `<text class="sacc" x="${s.x}" y="${s.y}">${s.glyph}</text>`).join('');
  const bars = g.barlines.map((x, i) => (i === g.barlines.length - 1
    ? `<line class="sline" x1="${x - 4}" y1="${topLine}" x2="${x - 4}" y2="${botLine}"/><line class="sline thick" x1="${x}" y1="${topLine}" x2="${x}" y2="${botLine}"/>`
    : `<line class="sline" x1="${x}" y1="${topLine}" x2="${x}" y2="${botLine}"/>`)).join('');
  const labels = g.barBoxes.map((b) => (b.label ? `<text class="slabel" x="${b.x + 16}" y="${Math.min(14, topLine - 14)}">${esc(b.label)}</text>` : '')).join('');
  const notes = g.notes.map((n) => `<g class="snote ${n.cls}" data-m="${n.midi}" data-snd="${n.sound}">
      ${n.ledgers.map((y) => `<line class="sledger" x1="${n.x - 11}" y1="${y}" x2="${n.x + 11}" y2="${y}"/>`).join('')}
      ${n.acc ? `<text class="sacc" x="${n.accX}" y="${n.y}">${n.acc}</text>` : ''}
      <ellipse class="shead" cx="${n.x}" cy="${n.y}" rx="6.6" ry="4.6" transform="rotate(-20 ${n.x} ${n.y})"/>
      <rect class="shit" x="${n.x - 12}" y="${n.y - 9}" width="24" height="18"/>
      ${n.texts.map((t, i) => `<text class="stext${i ? ' syl' : ''}" x="${n.x}" y="${g.textY + i * 14}">${esc(t)}</text>`).join('')}</g>`).join('');
  const minis = strip ? g.notes.map((n) => {
    const fing = fingeringsFor(n.written)[0];
    return fing ? `<g class="fmini" data-m="${n.midi}" transform="translate(${n.x - (DIAGRAM.w * sc) / 2} ${stripY})">${fingerSvg(fing.keys, { scale: sc })}</g>` : '';
  }).join('') : '';
  const H = g.height + extra;
  return `<svg class="staff" width="${g.width}" height="${H}" viewBox="0 0 ${g.width} ${H}">${hl}${lines}${clef}${sig}${bars}${labels}${notes}${minis}</svg>`;
}

/** Shows a note's fingering (displayed MIDI) without re-rendering the rest. */
function showFinger(midi) {
  if (midi === fingerMidi) return;
  fingerMidi = midi;
  renderFinger();
}

// Whether the header's Options panel is open (kept across re-renders).
let optsOpen = false;

/** A click on a segmented control bound to a state key (see `seg`). */
function segClick(e) {
  const opt = e.target.closest('[data-set] [data-v]');
  if (!opt) return false;
  const key = opt.parentElement.dataset.set, v = opt.dataset.v;
  update({ [key]: v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? +v : v });
  return true;
}

function wireHorn() {
  $('saxbar').onclick = (e) => {
    if (e.target.closest('#hoptbtn')) { optsOpen = !optsOpen; renderHorn(); return; }
    segClick(e);
  };
  // A click anywhere outside closes the Options panel.
  document.addEventListener('mousedown', (e) => {
    if (optsOpen && !e.target.closest('.hoptwrap')) { optsOpen = false; renderHorn(); }
  });
  // Hovering a note in the grid or on a staff shows its fingering.
  $('horn').onmouseover = (e) => {
    const n = e.target.closest('.hcell[data-m], .snote[data-m], .fmini[data-m]');
    if (n) showFinger(+n.dataset.m);
  };
  $('horn').onclick = (e) => {
    if (state.practice && e.target.closest('#hquiz') && wireQuiz(e)) return;
    if (segClick(e)) return;
    if (e.target.closest('#hplay')) return linePlaying ? stopHorn() : playScale();
    if (e.target.closest('#hmic')) return micOn() ? micOff() : micStart();
    if (e.target.closest('#hprint')) return printSheet();
    if (e.target.closest('#hexer')) return exercise ? endExercise(false) : startExercise();
    if (e.target.closest('#halong')) return alongPlaying ? stopHorn() : playAlongNow();
    const ch = e.target.closest('[data-ci]');
    if (ch?.dataset.scale) {
      // A scale chip: show that scale (switching type if needed).
      if (!alongPlaying) stopHorn();
      hornFocus = null;
      if (ch.dataset.scale !== state.hornScale) update({ hornScale: ch.dataset.scale });
      else renderFocus();
      return;
    }
    if (ch) {
      const i = +ch.dataset.ci;
      if (!alongPlaying) stopHorn();
      hornFocus = i < 0 ? null : i;
      renderFocus();
      if (i >= 0 && !alongPlaying) {
        if (ch.classList.contains('hln')) playNote(hornProgression().line[i].sound);
        else playChord(hornProgression().chords[i]);
      }
      return;
    }
    const c = e.target.closest('.hcell[data-m]');
    if (c) return flashNote(+c.dataset.m);
    const sn = e.target.closest('.snote');
    if (sn) {
      if (linePlaying) stopHorn();
      playNote(+sn.dataset.snd);
      sn.classList.add('playing');
      setTimeout(() => sn.classList.remove('playing'), 450);
      return;
    }
    const n = e.target.closest('.hnote');
    if (n) {
      // That note just above the lowest root/tonic in range.
      const cells = hornModel(hornFocus === null ? null : hornProgression().chords[hornFocus]).cells;
      const low = cells.find((x) => x.tonic).midi;
      const cell = cells.find((x) => x.pc === +n.dataset.pc && x.midi >= low);
      if (cell) flashNote(cell.midi);
    }
  };
}

/** Plays one cell's note and lights it up briefly. */
function flashNote(midi) {
  const el = $('hgrid').querySelector(`.hcell[data-m="${midi}"]`);
  if (!el) return;
  if (linePlaying) stopHorn();
  const shift = state.pitch === 'written' ? hornModel().inst.shift : 0;
  playNote(midi - shift);
  el.classList.add('playing');
  setTimeout(() => el.classList.remove('playing'), 450);
}

/** The scale from the lowest tonic in range to the highest, and back down. */
function scaleRun(h) {
  const tonics = h.cells.filter((c) => c.tonic);
  const up = h.cells.filter((c) => c.inScale && c.midi >= tonics[0].midi && c.midi <= tonics.at(-1).midi);
  return [...up, ...up.slice(0, -1).reverse()];
}

const midiButton = (id, tip) => `<button class="midi" id="${id}" title="${esc(tip)}">
  <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/><circle cx="4" cy="7" r="1.3"/><circle cx="10" cy="7" r="1.3"/><circle cx="4" cy="11" r="1.3"/><circle cx="10" cy="11" r="1.3"/></g></svg>
  MIDI</button>`;

/** The scale as Play scale plays it (eighth notes), in sounding pitch. */
function scaleMidi() {
  const h = hornModel();
  const title = `${formatNote(h.tonic.letter, h.tonic.acc)} ${h.scale.id === 'mode' ? h.mode.name : h.scale.name.toLowerCase()}`;
  const name = midiFileName(title, 'scale', h.inst.name);
  return {
    name,
    bytes: melodyToMidi(scaleRun(h).map((c) => ({ midi: c.sound, beats: 0.5 })),
      { bpm: state.bpm, program: GM_SAX[h.inst.id], name: name.replace(/\.mid$/, '') }),
  };
}

/** The guide-tone line, one note per chord at the play-along length, with
 *  the chords on a second track. Sounding pitch. */
function lineMidi(p) {
  const h = hornModel(), beats = alongBeats(p.chords.length);
  const name = midiFileName(`${model.s.key.name} ${h.mode.name}`, p.b.name, 'guide tones');
  return {
    name,
    bytes: melodyToMidi(p.line.map((n, i) => ({ midi: n.sound, beats: beats[i], marker: p.chords[i].name })),
      { bpm: state.bpm, program: GM_SAX[h.inst.id], name: name.replace(/\.mid$/, ''), chords: p.chords, chordBeats: beats }),
  };
}

/** Up from the lowest tonic in range to the highest, and back down. */
function playScale() {
  stopHorn();
  const h = hornModel();
  const line = scaleRun(h);
  linePlaying = true;
  $('hplay').textContent = '■ Stop';
  playLine(line.map((c) => c.sound), state.bpm, (i) => {
    $('horn').querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
    $('horn').querySelectorAll(`.hcell[data-m="${line[i].midi}"], #hstaves .staffbox:first-child .snote[data-m="${line[i].midi}"]`)
      .forEach((el) => el.classList.add('playing'));
    showFinger(line[i].midi);
  }, stopHorn);
}

/** Count-in, then the progression on a loop; the grid follows each chord. */
function playAlongNow() {
  stopHorn();
  const p = hornProgression();
  alongPlaying = true;
  along = { tone: 0, scale: 0, out: 0, lastSince: null };
  lastResults = null;
  const btn = $('halong');
  btn.textContent = '■ Stop';
  playAlong({
    chords: p.chords, beats: alongBeats(p.chords.length), bpm: state.bpm,
    line: state.guideLine ? p.line.map((n) => n.sound) : null,
    onCount: (n) => { btn.textContent = `■ ${n + 1}…`; },
    onStep: (i) => {
      btn.textContent = '■ Stop';
      hornFocus = i;
      // With the guide-tone line on, the panel shows the note to play.
      if (state.guideLine) fingerMidi = p.line[i].midi;
      renderFocus(p);
      $('hchords').querySelector(`[data-ci="${i}"]`)?.classList.add('playing');
    },
  });
}

/** Stops the scale or the play-along, keeping the focused chord. */
function stopHorn() {
  stop();
  linePlaying = false;
  alongPlaying = false;
  $('horn').querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
  const b = $('hplay');
  if (b) b.textContent = '▶ Play scale';
  const a = $('halong');
  if (a) a.textContent = '▶ Play along';
}

// ------------------------------------------------------------ guitar view

let gOptsOpen = false, gPlaying = false, gAlong = false;
// What the neck shows: null = the scale, else a chord of the progression
// (0 = root chord). Follows the backing track while it plays.
let gFocus = null;
// Shapes picked with ◀ ▶, by `${index}:${chord name}` (stale keys are harmless).
let gAlt = {};

const isGuitar = () => state.fretInst === 'guitar';

const fretModel = (chord = null) => fretboardView({
  instrumentId: state.fretInst, rootPc: state.rootPc, modeId: state.modeId, scaleId: state.hornScale, chord,
});

/** What a note on the neck is labelled with: its name, degree (from the
 *  chord root when a chord is shown) or movable do (Do stays the key's). */
function fretLabel(n, v) {
  const la = state.minorDo === 'la';
  if (state.fretLabels === 'degrees') return degreeLabel(n, v.tonic);
  if (state.fretLabels === 'solfa') return v.layer
    ? solfa(n, v.keyTonic, { minor: v.mode.tonic !== 'I', la })
    : solfa(n, v.tonic, { minor: v.minor, la });
  return formatNote(n.letter, n.acc, state.names);
}

/** The scale's positions (boxes) for the shown instrument, key and scale. */
const fretPositions = () => scalePositions({
  instrumentId: state.fretInst, rootPc: state.rootPc, modeId: state.modeId, scaleId: state.hornScale,
});
/** The chosen position, or null for the whole neck. */
const currentPosition = () => (state.gPos ? fretPositions()[state.gPos - 1] ?? null : null);

/** The selected progression, with a guitar shape per chord: inside the
 *  chosen position, else the easiest or voice-led ("close together");
 *  a shape picked with ◀ ▶ wins. */
function guitarProgression() {
  const b = selectedBranch();
  const chords = [model.s.tonic, ...b.chords];
  const pos = currentPosition();
  if (!isGuitar()) return { b, chords, pos, alts: null, pick: null, shapes: null };
  const led = !pos && state.gVoice === 'led' ? voiceLead(chords) : null;
  const alts = led ? led.alts : chords.map((c) => {
    const a = alternates(c);
    if (!pos) return a;
    // The in-position shape joins the list (in neck order) if it isn't there.
    const s = shapeInPosition(c, pos);
    const has = a.list.find((v) => shapeText(v) === shapeText(s));
    const list = has ? a.list : [...a.list, s].sort((x, y) => shapePosition(x) - shapePosition(y));
    return { list, best: list.indexOf(has ?? s) };
  });
  const pick = chords.map((c, i) => Math.min(alts[i].list.length - 1, gAlt[`${i}:${c.name}`] ?? (led ? led.picks[i] : alts[i].best)));
  return { b, chords, pos, alts, pick, shapes: pick.map((p, i) => alts[i].list[p]) };
}

/** Whether a cell lies inside a position's frets on its string. */
const inPosition = (c, pos) => !pos || (c.fret >= pos.range[c.string][0] && c.fret <= pos.range[c.string][1]);

/** Lowest root on the bass (E1 up), for the bass play-along line. */
const bassRoot = (c) => 28 + mod(c.pc - 28, 12);

// Neck geometry (SVG units). Frets have equal widths so labels fit everywhere.
const NECK = { left: 30, open: 38, fret: 54, top: 20, gap: 30, right: 12 };
const OPEN_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** The neck with the scale (or a chord's chord-scale and tones); `shape`
 *  rings the notes of a guitar shape. */
function neckSvg(v, shape = null, pos = null, practice = null) {
  const n = v.inst.strings.length, G = NECK;
  const nut = G.left + G.open, end = nut + FRETS * G.fret;
  const W = end + G.right, H = G.top + (n - 1) * G.gap + 36;
  const X = (x) => (state.lefty ? W - x : x);
  const sy = (s) => G.top + (n - 1 - s) * G.gap; // high string on top
  const fx = (f) => (f === 0 ? G.left + G.open / 2 : nut + (f - 0.5) * G.fret);
  const yTop = sy(n - 1), yBot = sy(0), mid = (yTop + yBot) / 2;
  const board = `<rect class="board" x="${Math.min(X(nut), X(end))}" y="${yTop - 8}" width="${end - nut}" height="${yBot - yTop + 16}" rx="3"/>`;
  const inlays = INLAYS.map((f) => (f === 12
    ? [mid - G.gap, mid + G.gap].map((y) => `<circle class="inlay" cx="${X(fx(f))}" cy="${y}" r="5"/>`).join('')
    : `<circle class="inlay" cx="${X(fx(f))}" cy="${mid}" r="5"/>`)).join('');
  const frets = Array.from({ length: FRETS }, (_, i) => {
    const x = X(nut + (i + 1) * G.fret);
    return `<line class="fret" x1="${x}" y1="${yTop - 8}" x2="${x}" y2="${yBot + 8}"/>`;
  }).join('');
  const nutLine = `<line class="nut" x1="${X(nut)}" y1="${yTop - 9}" x2="${X(nut)}" y2="${yBot + 9}"/>`;
  const strings = v.inst.strings.map((open, s) =>
    `<line class="str${practice?.string === s ? ' ask' : ''}" x1="${X(G.left + 6)}" y1="${sy(s)}" x2="${X(end)}" y2="${sy(s)}" style="stroke-width:${(1 + (n - 1 - s) * 0.35).toFixed(2)}"/>`
    + `<text class="sname" x="${X(G.left - 14)}" y="${sy(s)}">${OPEN_NAMES[open % 12]}</text>`).join('');
  const nums = Array.from({ length: FRETS + 1 }, (_, f) =>
    `<text class="fnum${INLAYS.includes(f) ? ' mark' : ''}" x="${X(fx(f))}" y="${yBot + 25}">${f}</text>`).join('');
  const inShape = (c) => shape && shape.frets[c.string] === c.fret;
  if (practice) {
    // Practice: no notes shown; clickable spots (frets 0–12) and marks.
    const beyond = `<rect class="beyond" x="${Math.min(X(nut + PRACTICE_FRETS * G.fret), X(end))}" y="${yTop - 9}" width="${(FRETS - PRACTICE_FRETS) * G.fret}" height="${yBot - yTop + 18}"/>`;
    const hits = practice.targets ? v.inst.strings.flatMap((open, s) => Array.from({ length: PRACTICE_FRETS + 1 }, (_, f) =>
      `<circle class="ftarget" data-s="${s}" data-f="${f}" data-m="${open + f}" cx="${X(fx(f))}" cy="${sy(s)}" r="13"/>`)).join('') : '';
    const marks = practice.marks.map((m) => `<g class="fnote qmark ${m.cls}" data-m="${v.inst.strings[m.string] + m.fret}" data-s="${m.string}" data-f="${m.fret}" transform="translate(${X(fx(m.fret))} ${sy(m.string)})"><circle r="12"/><text>${esc(m.label)}</text></g>`).join('');
    return `<svg class="neck" id="neck" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.inst.name)} neck">${board}${inlays}${frets}${nutLine}${strings}${nums}${beyond}${hits}${marks}</svg>`;
  }
  const notes = v.strings.flatMap((s) => s.cells.filter((c) => c.note).map((c) => {
    const pass = v.layer && !c.tone;
    const cls = `fnote${c.tonic ? ' tonic' : ''}${c.blue ? ' blue' : ''}${c.tone ? ' tone' : ''}${pass ? ' pass' : ''}${inPosition(c, pos) ? '' : ' out'}`;
    return `<g class="${cls}" data-m="${c.midi}" data-s="${c.string}" data-f="${c.fret}" transform="translate(${X(fx(c.fret))} ${sy(c.string)})">`
      + `${inShape(c) ? '<circle class="ring" r="15.5"/>' : ''}<circle r="${pass ? 9.5 : 12}"/><text>${esc(fretLabel(c.note, v))}</text></g>`;
  })).join('');
  return `<svg class="neck" id="neck" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.inst.name)} neck">${board}${inlays}${frets}${nutLine}${strings}${nums}${notes}</svg>`;
}

function renderGuitar() {
  const positions = fretPositions();
  if (state.gPos > positions.length) state.gPos = 0;
  const p = guitarProgression();
  if (gFocus !== null && gFocus >= p.chords.length) gFocus = null;
  const chord = gFocus === null ? null : p.chords[gFocus];
  const v = fretModel(chord);
  const shape = chord && p.shapes ? p.shapes[gFocus] : null;
  const nm = (n) => formatNote(n.letter, n.acc, state.names);
  const solo = v.scale && v.scale.id !== 'mode';
  const keyName = `${nm(v.key)} ${modeLabel(v.mode)}`;
  if (chord) {
    const sm = v.layer.scaleMode;
    $('keyTitle').textContent = `${v.inst.name} — ${chord.name} in ${keyName}`;
    $('keyFeel').textContent = `Chord tones: ${v.layer.tones.map(nm).join(' ')} · scale over it: ${sm ? `${nm(v.tonic)} ${sm.name}` : v.notes.map(nm).join(' ')}`;
  } else {
    $('keyTitle').textContent = solo
      ? `${v.inst.name} — ${nm(v.tonic)} ${v.scale.name.toLowerCase()}`
      : `${v.inst.name} — ${keyName}`;
    $('keyFeel').textContent = `${solo ? `Key: ${nm(v.key)} ${v.mode.name}. ` : ''}Notes: ${v.notes.map(nm).join(' ')} · standard tuning ${v.inst.tuning}`
      + (p.pos ? ` · position ${p.pos.n}: frets ${p.pos.lo}–${p.pos.hi}` : '');
  }
  $('keyFeel').title = $('keyFeel').textContent;

  $('gbar').innerHTML = `
    ${seg('gPractice', [[false, 'Explore'], [true, 'Practice', 'Find and name notes on the neck, and tune your strings']])}
    <select id="finst" class="select" aria-label="Instrument">${FRETTED.map((i) =>
      `<option value="${i.id}"${i.id === v.inst.id ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
    <div class="hoptwrap">
      <button class="hoptbtn${gOptsOpen ? ' open' : ''}" id="goptbtn" aria-expanded="${gOptsOpen}">Options ▾</button>
      <div class="hopts"${gOptsOpen ? '' : ' hidden'}>
        <div class="hfield"><span>Labels</span>${seg('fretLabels', [['names', 'Names'], ['degrees', '1 2 ♭3', 'Scale degrees (from the chord root when a chord is shown)'], ['solfa', 'Do Re Mi', 'Movable do: Do is the key’s tonic']])}</div>
        ${state.fretLabels === 'names' ? `<div class="hfield"><span>Note names</span>${seg('names', [['letters', 'C D E'], ['dutch', 'Cis Bes', 'Dutch: Cis, Bes, Es, As'], ['fixed', 'Do Re Mi', 'Fixed do: Do is always C']])}</div>` : ''}
        ${state.fretLabels === 'solfa' ? `<div class="hfield"><span>Minor keys</span>${seg('minorDo', [['do', 'Do-based', 'Minor tonic is Do (♭3 = Me)'], ['la', 'La-based', 'Minor tonic is La']])}</div>` : ''}
        <div class="hfield"><span>Neck</span>${seg('lefty', [[false, 'Right-handed'], [true, 'Left-handed', 'Mirror the neck: nut on the right']])}</div>
      </div>
    </div>`;
  $('finst').onchange = (e) => update({ fretInst: e.target.value });
  if (state.gPractice) return renderFretQuiz(v);

  const branches = model.tree.branches.map((b) =>
    `<option value="${b.id}"${b.id === p.b.id ? ' selected' : ''}>${esc(b.mood)} — ${esc(b.name)}</option>`).join('');
  const scaleChips = SCALES.map((s) => {
    const cls = s.id !== state.hornScale ? '' : gFocus === null ? ' on' : ' sel';
    return `<button class="hchord scalechip${cls}" data-scale="${s.id}" title="Show the ${esc(s.id === 'mode' ? `${v.mode.name} scale` : s.name.toLowerCase())}">${esc(s.id === 'mode' ? v.mode.name : s.short ?? s.name)}</button>`;
  }).join('');
  const chips = p.chords.map((c, i) =>
    `<button class="hchord${i === 0 ? ' root' : ''}${lent(c) ? ' borrowed' : ''}${i === gFocus ? ' on' : ''}" data-gi="${i}" title="${esc(chordTitle(c))}"><b>${esc(c.name)}</b><small>${esc(c.roman)}</small></button>`).join('<span class="arrow">→</span>');
  const ending = p.b.end === 'resolve' ? '<span class="arrow" title="Resolves to the root">↺</span>' : '<span class="end" title="Ends here">‖</span>';

  let card = '';
  if (isGuitar()) {
    const n = shape ? p.alts[gFocus].list.length : 0, at = shape ? p.pick[gFocus] : 0;
    card = `<div class="gcard">${shape ? `
      <b class="gname">${esc(chord.name)}</b>
      <button class="gstrum" id="gstrum" title="Strum it">${chordBox(shape, 2.3)}</button>
      <div class="galt"><button data-alt="-1" title="Shape lower on the neck"${at === 0 ? ' disabled' : ''}>◀</button><span>${at + 1} / ${n}</span><button data-alt="1" title="Shape higher on the neck"${at === n - 1 ? ' disabled' : ''}>▶</button></div>
      <code>${esc(shapeText(shape))}</code>` : '<p class="ghint">Pick a chord to see its shape and where its notes are on the neck</p>'}</div>`;
  }
  const legend = chord
    ? `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-tonic"/></svg>chord root</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-tone"/></svg>chord tone</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="5.5" class="k-pass"/></svg>other scale note</span>
       ${shape ? '<span><svg width="18" height="18"><circle cx="9" cy="9" r="7.5" class="k-ring"/></svg>the shape</span>' : ''}`
    : `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-tonic"/></svg>root</span>
       <span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-note"/></svg>scale note</span>
       ${v.notes.some((x) => x.blue) ? '<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-blue"/></svg>blue note</span>' : ''}`;

  $('gview').innerHTML = `
    <div class="hprog">
      <select id="gbranch" class="select" aria-label="Progression" title="Progression">${branches}</select>
      <div class="hchords">
        <span class="scalechips">${scaleChips}</span><span class="sep"></span>${chips}${ending}
      </div>
    </div>
    <div class="hplay">
      <button class="play" id="galong" title="Count-in, then the progression on a loop · Space">${gAlong ? '■ Stop' : '▶ Play along'}</button>
      <button class="mic" id="gplay" title="Up and down the scale shown">${gPlaying ? '■ Stop' : '▶ Play scale'}</button>
      <div class="hfield inline"><span>Position</span>${seg('gPos', [[0, 'Whole neck'], ...positions.map((x) =>
        [x.n, String(x.n), `Frets ${x.lo}–${x.hi}: ${positions.length === 5 ? 'two' : 'three'} notes per string${x.n === 1 ? ', starting on the root' : ''}`])])}</div>
      ${!isGuitar() ? '' : p.pos ? '<div class="hfield inline"><span>Shapes</span><em class="gnote">in position</em></div>'
        : `<div class="hfield inline"><span>Shapes</span>${seg('gVoice', [['easy', 'Easiest', 'Each chord’s easiest shape'], ['led', 'Close together', 'Shapes near each other on the neck, so the hand moves little']])}</div>`}
      <div class="hfield inline"><span>Bars per chord</span>${seg('bars', [[1, '1'], [2, '2']])}</div>
      <label class="tempo">Tempo <input id="gbpm" type="range" min="50" max="180" value="${state.bpm}"> <span id="gbpmv">${state.bpm}</span></label>
    </div>
    ${isGuitar() ? `<div class="hplay gstrumrow">
      <label class="gpat">Strum <select id="gpattern" class="select" aria-label="Strumming pattern">
        <option value="auto"${state.strum === 'auto' ? ' selected' : ''}>Auto: ${esc(styleStrum(state.styleId).name)}</option>
        ${STRUMS.map((x) => `<option value="${x.id}"${state.strum === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
        <option value="custom"${state.strum === 'custom' ? ' selected' : ''}>Custom…</option></select></label>
      ${strumStrip(currentStrum(), state.strum === 'custom')}
      ${state.strum === 'custom' ? customStrumControls() : `<span class="gpattip">${esc(currentStrum().tip)}</span>`}
      ${midiButton('gmidi', 'Drag into your DAW: this progression strummed with this pattern, one pass (guitar sound)')}
    </div>` : ''}
    <div class="gmain">${card}<div class="neckbox">${neckSvg(v, shape, p.pos)}</div></div>
    <div class="gstaves">${guitarStaves(v, p, chord, shape)}</div>
    <div class="gkey">${legend}
      ${p.pos ? `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" class="k-out"/></svg>outside position ${p.pos.n}</span>` : ''}
      <span class="hint">Click a note to hear it · hover to see the same note elsewhere on the neck</span>
    </div>`;
  $('gbpm').oninput = (e) => { state.bpm = +e.target.value; $('gbpmv').textContent = state.bpm; save(); };
  if ($('gpattern')) $('gpattern').onchange = (e) => {
    // A first Custom starts from the pattern that was showing.
    const patch = { strum: e.target.value };
    if (patch.strum === 'custom' && !state.customStrum) {
      const c = currentStrum();
      patch.customStrum = { steps: c.steps, swing: !!c.swing, short: !!c.short };
    }
    update(patch);
  };
  if ($('gsteps')) {
    $('gsteps').onchange = (e) => {
      const steps = cleanSteps(e.target.value);
      if (steps) editCustomStrum({ steps });
      else e.target.value = currentStrum().steps;
    };
    $('gsteps').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); };
  }
  if ($('gmidi')) wireMidiDrag($('gmidi'), () => strumMidi(guitarProgression()));
  $('gbranch').onchange = (e) => {
    stopGuitar();
    state.selected = +e.target.value;
    gFocus = null;
    save();
    renderDetail();
    renderGuitar();
  };
}

/** Staff + tab for the guitar view: the focus (a position of the scale, or
 *  the chord: its shape and then note by note; on bass an arpeggio) and the
 *  progression (guitar shapes, or bass roots), one bar per chord. Written
 *  pitch: treble clef (bass clef on bass) with an 8 below. */
function guitarStaves(v, p, chord, shape) {
  const bass = !isGuitar();
  const clef = bass ? 'bass' : 'treble';
  const span = bass ? [-2, 12] : [-7, 10];
  const keySig = keySignature(v.key, v.mode.id);
  const tabNote = (n, stack = false) => ({ ...n, stack, texts: [], cls: [n.tonic && 'tonic', n.blue && 'blue'].filter(Boolean).join(' ') });
  let focus;
  if (chord && shape) {
    const notes = shapeTab(shape, v.layer);
    focus = { title: `${chord.name} · the shape, then note by note`, sig: keySig,
      bars: [{ label: chord.name, notes: notes.map((n, i) => tabNote(n, i > 0)) }, { notes: notes.map((n) => tabNote(n)) }] };
  } else if (chord) {
    focus = { title: `${chord.name} · chord tones`, sig: keySig, bars: [{ label: chord.name, notes: bassArpeggio(v.layer).map((n) => tabNote(n)) }] };
  } else {
    const pos = p.pos ?? fretPositions()[0];
    const solo = v.scale.id !== 'mode';
    focus = { title: `Scale · position ${pos.n}${p.pos ? '' : ' (choose a position to see another)'}`,
      sig: solo ? keySignature(v.tonic, v.minor ? 'aeolian' : 'ionian') : keySig,
      bars: [{ notes: positionTab(v, pos).map((n) => tabNote(n)) }] };
  }
  const layers = p.chords.map((c) => chordLayer(c, v.key, v.key));
  const lead = {
    title: bass ? 'Progression · roots' : 'Progression · shapes',
    sig: keySig,
    bars: p.chords.map((c, i) => ({ label: c.name, notes: bass
      ? [tabNote(bassArpeggio(layers[i])[0])]
      : shapeTab(p.shapes[i], layers[i]).map((n, j) => tabNote(n, j > 0)) })),
  };
  return [focus, lead].map((s, i) => {
    const g = layoutStaff({ clef, sig: s.sig, bars: s.bars, span });
    return `<div class="staffbox"><h4>${esc(s.title)}</h4>${tabStaffSvg(g, v.inst.strings.length, i === 1 ? gFocus : null)}</div>`;
  }).join('');
}

/** A staff (from layoutStaff) with a tab staff under it; notes and fret
 *  numbers carry data-m (sounding MIDI), data-s and data-f (string, fret). */
function tabStaffSvg(g, n, current) {
  const gap = 10, tabTop = g.height + 10, tabH = (n - 1) * gap, H = tabTop + tabH + 10;
  const x0 = 4, x1 = g.width - 2;
  const [topLine, , , , botLine] = g.lines;
  const sy = (s) => tabTop + (n - 1 - s) * gap;
  const box = current !== null && g.barBoxes[current];
  const hl = box ? `<rect class="sbar-on" x="${box.x + 2}" y="${topLine - 22}" width="${box.w - 4}" height="${tabTop + tabH - topLine + 30}" rx="6"/>` : '';
  const lines = g.lines.map((y) => `<line class="sline" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`).join('')
    + Array.from({ length: n }, (_, s) => `<line class="sline" x1="${x0}" y1="${sy(s)}" x2="${x1}" y2="${sy(s)}"/>`).join('');
  const clef = g.clef.id === 'treble'
    ? `<text class="sclef" x="6" y="${botLine + g.half * 2.6}" style="font-size:${g.half * 15}px">${g.clef.glyph}</text><text class="s8" x="17" y="${botLine + g.half * 5.4}">8</text>`
    : `<text class="sclef" x="8" y="${topLine + g.half * 6.2}" style="font-size:${g.half * 8.6}px">${g.clef.glyph}</text><text class="s8" x="16" y="${botLine + g.half * 3.2}">8</text>`;
  const tab = ['T', 'A', 'B'].map((t, i) => `<text class="stab" x="16" y="${tabTop + tabH / 2 + (i - 1) * Math.min(12, tabH / 3)}">${t}</text>`).join('');
  const sig = g.sigGlyphs.map((s) => `<text class="sacc" x="${s.x}" y="${s.y}">${s.glyph}</text>`).join('');
  const bar = (x, y0, y1, last) => (last
    ? `<line class="sline" x1="${x - 4}" y1="${y0}" x2="${x - 4}" y2="${y1}"/><line class="sline thick" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/>`
    : `<line class="sline" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/>`);
  const bars = g.barlines.map((x, i) => {
    const last = i === g.barlines.length - 1;
    return bar(x, topLine, botLine, last) + bar(x, sy(n - 1), sy(0), last);
  }).join('');
  const labels = g.barBoxes.map((b) => (b.label ? `<text class="slabel" x="${b.x + 16}" y="${Math.min(14, topLine - 14)}">${esc(b.label)}</text>` : '')).join('');
  const ids = (x) => `data-m="${x.midi}" data-s="${x.string}" data-f="${x.fret}"`;
  const notes = g.notes.map((x) => `<g class="snote ${x.cls}" ${ids(x)}>
      ${x.ledgers.map((y) => `<line class="sledger" x1="${x.x - 11}" y1="${y}" x2="${x.x + 11}" y2="${y}"/>`).join('')}
      ${x.acc ? `<text class="sacc" x="${x.accX}" y="${x.y}">${x.acc}</text>` : ''}
      <ellipse class="shead" cx="${x.x}" cy="${x.y}" rx="6.6" ry="4.6" transform="rotate(-20 ${x.x} ${x.y})"/>
      <rect class="shit" x="${x.x - 12}" y="${x.y - 9}" width="24" height="18"/></g>`).join('');
  const frets = g.notes.map((x) => {
    const w = x.fret > 9 ? 16 : 11;
    return `<g class="tabn" ${ids(x)}><rect class="tabbg" x="${x.col - w / 2}" y="${sy(x.string) - 6}" width="${w}" height="12"/><text x="${x.col}" y="${sy(x.string)}">${x.fret}</text></g>`;
  }).join('');
  return `<svg class="staff gstaff" width="${g.width}" height="${H}" viewBox="0 0 ${g.width} ${H}">${hl}${lines}${clef}${tab}${sig}${bars}${labels}${notes}${frets}</svg>`;
}

/** The strumming pattern in use: the style's own ("Auto") or the one picked. */
const currentStrum = () => (state.strum === 'auto' ? styleStrum(state.styleId)
  : state.strum === 'custom' ? customStrum(state.customStrum) : strumById(state.strum));

const STRUM_GLYPH = { D: '↓', U: '↑', x: '×', '-': '·' };

/** The pattern as arrows over the count; `data-k` = step, lit while playing.
 *  Editable (Custom): each step is a button that cycles on click. */
function strumStrip(pat, edit = false) {
  const n = pat.steps.length, cnt = counts(pat);
  const tip = edit ? 'Click a step: ↓ down, ↑ up, × chuck, · rest (right-click goes back)' : pat.tip;
  return `<span class="strumbar${n === 16 ? ' s16' : ''}${edit ? ' edit' : ''}" title="${esc(tip)}">${[...pat.steps].map((ch, i) =>
    `<span class="sb${i % (n / 4) === 0 ? ' beat' : ''}${ch === '-' ? ' rest' : ''}" data-k="${i}"${edit ? ` data-cs="${i}"` : ''}><b>${STRUM_GLYPH[ch] ?? ch}</b><small>${cnt[i]}</small></span>`).join('')}</span>`;
}

/** Custom pattern controls: the steps as text, 8/16 steps, swing, palm mute. */
function customStrumControls() {
  const c = currentStrum();
  const tog = (key, label, title, on, dis = false) =>
    `<button class="gtog${on ? ' on' : ''}" data-ctog="${key}" title="${title}"${dis ? ' disabled' : ''}>${label}</button>`;
  return `<span class="gcustom">
    <input id="gsteps" class="gsteps" value="${c.steps}" maxlength="16" spellcheck="false" aria-label="Pattern steps"
      title="Type 8 or 16 steps: D down, U up, x chuck, - rest, 1–6 pick one string (1 = lowest)">
    ${tog('len', c.steps.length === 16 ? '16ths' : '8ths', 'Eighths or sixteenths', false)}
    ${tog('swing', 'Swing', 'Swung eighths: long-short (8 steps only)', c.swing, c.steps.length !== 8)}
    ${tog('short', 'Mute', 'Short, palm-muted hits', c.short)}
  </span>`;
}

/** Changes the custom pattern; restarts the play-along so it is heard. */
function editCustomStrum(patch) {
  const was = gAlong;
  update({ customStrum: { ...{ steps: currentStrum().steps, swing: false, short: false }, ...state.customStrum, ...patch } });
  if (was) playGuitarAlong();
}

/** A click (or right-click, `back`) on the custom pattern's steps/toggles. */
function customStrumClick(e, back = false) {
  if (state.strum !== 'custom') return false;
  const c = currentStrum();
  const st = e.target.closest('[data-cs]');
  if (st) {
    const i = +st.dataset.cs, s = [...c.steps];
    s[i] = cycleStep(s[i], back);
    editCustomStrum({ steps: s.join('') });
    return true;
  }
  const t = back ? null : e.target.closest('[data-ctog]');
  if (!t) return false;
  const k = t.dataset.ctog;
  if (k === 'len') editCustomStrum({ steps: resizeSteps(c.steps, c.steps.length === 8 ? 16 : 8) });
  else editCustomStrum({ [k]: !c[k] });
  return true;
}

/** The progression strummed with the pattern, one pass, as guitar MIDI. */
function strumMidi(p) {
  const pat = currentStrum(), beats = alongBeats(p.chords.length);
  const events = strumProgression(pat, p.shapes.map(voicingMidi), beats);
  const starts = beats.map((_, i) => beats.slice(0, i).reduce((a, b) => a + b, 0));
  const name = midiFileName(`${model.s.key.name} ${MODES.find((m) => m.id === state.modeId).name}`, p.b.name, `${pat.name} guitar`);
  return {
    name,
    bytes: notesToMidi(strumNotes(events), {
      bpm: state.bpm, program: GM_GUITAR, name: name.replace(/\.mid$/, ''),
      markers: p.chords.map((c, i) => ({ at: starts[i], text: c.name })),
    }),
  };
}

/** Sounds chord i: its guitar shape strummed, or on bass the piano chord. */
function soundGuitarChord(i) {
  const p = guitarProgression();
  if (p.shapes) playStrum(voicingMidi(p.shapes[i]));
  else playChord(p.chords[i]);
}

function wireGuitar() {
  $('gbar').onclick = (e) => {
    if (e.target.closest('#goptbtn')) { gOptsOpen = !gOptsOpen; renderGuitar(); return; }
    segClick(e);
  };
  document.addEventListener('mousedown', (e) => {
    if (gOptsOpen && !e.target.closest('.hoptwrap')) { gOptsOpen = false; renderGuitar(); }
  });
  $('gview').onclick = (e) => {
    if (state.gPractice && fretQuizClick(e)) return;
    if (segClick(e)) return;
    if (customStrumClick(e)) return;
    if (e.target.closest('#galong')) return gAlong ? stopGuitar() : playGuitarAlong();
    if (e.target.closest('#gplay')) return gPlaying ? stopGuitar() : playFretScale();
    const sc = e.target.closest('[data-scale]');
    if (sc) {
      if (!gAlong) stopGuitar();
      gFocus = null;
      if (sc.dataset.scale !== state.hornScale) update({ hornScale: sc.dataset.scale });
      else renderGuitar();
      return;
    }
    const ch = e.target.closest('[data-gi]');
    if (ch) {
      if (gPlaying) stopGuitar();
      gFocus = +ch.dataset.gi;
      renderGuitar();
      if (!gAlong) soundGuitarChord(gFocus);
      return;
    }
    const alt = e.target.closest('[data-alt]');
    if (alt && gFocus !== null) {
      const p = guitarProgression();
      const n = p.alts[gFocus].list.length;
      gAlt[`${gFocus}:${p.chords[gFocus].name}`] = Math.max(0, Math.min(n - 1, p.pick[gFocus] + +alt.dataset.alt));
      renderGuitar();
      if (!gAlong) soundGuitarChord(gFocus);
      return;
    }
    if (e.target.closest('#gstrum') && gFocus !== null) return soundGuitarChord(gFocus);
    const n = e.target.closest('.fnote, .snote, .tabn');
    if (n) playNote(+n.dataset.m);
  };
  $('gview').oncontextmenu = (e) => { if (customStrumClick(e, true)) e.preventDefault(); };
  // Hovering a note rings every place the same pitch sits on the neck.
  // A staff or tab note marks its spot on the neck.
  $('gview').onmouseover = (e) => {
    $('gview').querySelectorAll('.same').forEach((x) => x.classList.remove('same'));
    const n = e.target.closest('.fnote');
    if (n) $('gview').querySelectorAll(`.fnote[data-m="${n.dataset.m}"]`).forEach((x) => x.classList.add('same'));
    const t = e.target.closest('.snote, .tabn');
    if (t) $('gview').querySelectorAll(`[data-s="${t.dataset.s}"][data-f="${t.dataset.f}"]`).forEach((x) => x.classList.add('same'));
  };
}

/** Play scale: in a position, its notes low to high and back, lighting the
 *  exact spots; on the whole neck, up and down from the lowest tonic,
 *  lighting every spot of each pitch. */
function playFretScale() {
  stopGuitar();
  const p = guitarProgression();
  const v = fretModel(gFocus === null ? null : p.chords[gFocus]);
  let run, sel;
  if (p.pos) {
    const seen = new Set();
    const up = v.strings.flatMap((s) => s.cells).filter((c) => c.note && inPosition(c, p.pos))
      .sort((a, b) => a.midi - b.midi || a.string - b.string)
      .filter((c) => !seen.has(c.midi) && seen.add(c.midi));
    const cells = [...up, ...up.slice(0, -1).reverse()];
    run = cells.map((c) => c.midi);
    sel = (i) => `[data-s="${cells[i].string}"][data-f="${cells[i].fret}"]`;
  } else {
    run = fretRun(v);
    sel = (i) => `[data-m="${run[i]}"]`;
  }
  gPlaying = true;
  $('gplay').textContent = '■ Stop';
  playLine(run, state.bpm, (i) => {
    $('gview').querySelectorAll('.playing').forEach((x) => x.classList.remove('playing'));
    $('gview').querySelectorAll(`.neckbox ${sel(i)}, .gstaves .staffbox:first-child ${sel(i)}`).forEach((x) => x.classList.add('playing'));
  }, stopGuitar);
}

/** Count-in, then the progression on a loop: strummed guitar shapes, or on
 *  bass the chords with the root line. The neck follows each chord. */
function playGuitarAlong() {
  stopGuitar();
  const p = guitarProgression(), beats = alongBeats(p.chords.length);
  gAlong = true;
  $('galong').textContent = '■ Stop';
  playAlong({
    chords: p.chords, beats, bpm: state.bpm,
    rhythm: p.shapes ? strumProgression(currentStrum(), p.shapes.map(voicingMidi), beats) : null,
    onHit: (e) => {
      $('gview').querySelectorAll('.strumbar .hit').forEach((x) => x.classList.remove('hit'));
      $('gview').querySelector(`.strumbar [data-k="${e.step}"]`)?.classList.add('hit');
    },
    line: p.shapes ? null : p.chords.map(bassRoot),
    onCount: (n) => { $('galong').textContent = `■ ${n + 1}…`; },
    onStep: (i) => {
      gFocus = i;
      renderGuitar();
      $('gview').querySelector(`[data-gi="${i}"]`)?.classList.add('playing');
    },
  });
}

function stopGuitar() {
  stop();
  gPlaying = false;
  gAlong = false;
  $('gview').querySelectorAll('.playing').forEach((x) => x.classList.remove('playing'));
  const b = $('gplay');
  if (b) b.textContent = '▶ Play scale';
  const a = $('galong');
  if (a) a.textContent = '▶ Play along';
}

// ------------------------------------------------------------ guitar practice

// The current question ({ key, q, answered }), the tuner's heard note and error.
let gQuiz = null, gHeard = null, gMicErr = null, gResetArmed = 0;
const gLevel = () => state.gLevels?.[state.gDrill] ?? 0;
const gStatsKey = () => `g${state.gDrill}:${state.fretInst}:${gLevel()}`;

/** "low E", "A", … "high E" (guitar); plain names on bass. */
const stringWord = (inst, s) => (inst.id === 'guitar' && (s === 0 || s === inst.strings.length - 1)
  ? `${s === 0 ? 'low' : 'high'} E` : OPEN_NAMES[inst.strings[s] % 12]);

function renderFretQuiz(v) {
  const inst = v.inst, d = fretDrillById(state.gDrill), lv = gLevel();
  const key = `${d.id}:${lv}:${inst.id}`;
  if (!gQuiz || gQuiz.key !== key) gQuiz = { key, q: makeFretQuestion({ drill: d.id, level: lv, instrumentId: inst.id, prev: gQuiz?.q }), answered: null };
  const q = gQuiz.q, st = quizStats[gStatsKey()] ?? emptyStats(), acc = accuracy(st);
  const done = gQuiz.answered !== null, ok = done && isFretRight(q, gQuiz.answered);
  const str = `${stringWord(inst, q.string)} string`;
  $('keyTitle').textContent = `${inst.name} — practice`;
  $('keyFeel').textContent = `${d.name}: ${FRET_LEVELS[lv].tip.toLowerCase()} · frets 0–${PRACTICE_FRETS}`;
  $('keyFeel').title = $('keyFeel').textContent;

  const prompt = q.drill === 'find'
    ? `Find <b>${esc(pcName(q.pc))}</b> on the ${esc(str)}`
    : `Which note is marked? <small class="qsub">${esc(str)}</small>`;
  const opts = q.drill !== 'name' ? '' : q.options.map((o, i) => {
    const cls = !done ? '' : o.id === q.answer ? ' right' : o.id === gQuiz.answered ? ' wrong' : ' dim';
    return `<button class="qopt${cls}" data-qa="${o.id}"><kbd>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</kbd>${esc(o.label)}</button>`;
  }).join('');
  const where = q.drill === 'find'
    ? `${pcName(q.pc)} is at fret ${q.answers.join(' and ')} on the ${str}`
    : `it’s ${pcName(q.pc)} (${str}, fret ${q.fret})`;
  const feedback = !done ? '' : `<div class="qfeed ${ok ? 'ok' : 'bad'}">${ok ? '✓ Right' : '✗ Not quite'} — ${esc(where)}
    <button class="play" id="qnext">Next <kbd>Space</kbd></button></div>`;

  // Marks on the neck: the asked spot, the answers, a wrong click.
  const marks = [];
  if (q.drill === 'find') {
    if (done) {
      if (!ok) marks.push({ string: gQuiz.answered.string, fret: gQuiz.answered.fret, cls: 'wrong',
        label: OPEN_NAMES[mod(inst.strings[gQuiz.answered.string] + gQuiz.answered.fret, 12)] });
      for (const f of q.answers) marks.push({ string: q.string, fret: f, cls: 'right', label: OPEN_NAMES[q.pc] });
    }
  } else {
    marks.push({ string: q.string, fret: q.fret, cls: done ? (ok ? 'right' : 'wrong') : 'ask', label: done ? OPEN_NAMES[q.pc] : '?' });
  }
  const practice = { marks, targets: q.drill === 'find' && !done, string: q.string };

  $('gview').innerHTML = `
    <div class="quiz">
      <div class="qhead">
        ${seg('gDrill', FRET_DRILLS.map((x) => [x.id, x.name]))}
        <div class="seg qlevels">${FRET_LEVELS.map((l, i) => `<button data-qlevel="${i}" class="${i === lv ? 'on' : ''}" title="${esc(l.tip)}">${i + 1} · ${esc(l.name)}</button>`).join('')}</div>
      </div>
      <p class="qblurb">${esc(d.blurb)}</p>
      <div class="qscore">
        <span>Streak <b>${st.streak}</b></span><span>Best <b>${st.best}</b></span>
        <span>Last ${st.recent.length || 20}: <b>${acc === null ? '—' : `${acc}%`}</b></span><span>${st.total} answered</span>
        <button class="link" id="qreset">${gResetArmed > Date.now() ? 'Sure? Click again' : 'Reset'}</button>
        ${ready(st) && lv < FRET_LEVELS.length - 1 ? `<button class="qready" data-qlevel="${lv + 1}">90%+ — try level ${lv + 2} →</button>` : ''}
      </div>
      <div class="qcard"><div class="qplay"><span class="qprompt">${prompt}</span></div>${opts ? `<div class="qopts">${opts}</div>` : ''}${feedback}</div>
    </div>
    <div class="hplay">
      <button class="mic${micOn() ? ' on' : ''}" id="gmic" title="Tuner: play one open string at a time. Nothing is recorded or saved.">${micOn() ? '● Tuner on' : '🎤 Tune strings'}</button>
    </div>
    <div class="gmain">${gTunerHtml(inst)}<div class="neckbox">${neckSvg(v, null, null, practice)}</div></div>`;
}

/** The string tuner: the nearest open string and how far off it is. */
function gTunerHtml(inst) {
  if (!micOn() && !gMicErr) return '';
  let html = '<h4>Tuner</h4>';
  if (gMicErr) html += `<p class="terr">${esc(gMicErr)}</p>`;
  else if (gHeard) {
    const t = nearestString(gHeard.midi, gHeard.cents, inst.strings), c = t.cents;
    const tone = Math.abs(c) <= IN_TUNE ? 'ok' : Math.abs(c) <= 30 ? 'near' : 'off';
    const pos = 50 + Math.max(-50, Math.min(50, c));
    html += `<div class="tnote">${esc(stringWord(inst, t.string))} <small>string</small></div>
      <div class="tneedle"><span class="tzone"></span><span class="tmark ${tone}" style="left:${pos}%"></span></div>
      <div class="tcents ${tone}">${Math.abs(c) <= 5 ? 'in tune' : `${c > 0 ? '+' : ''}${c}¢ · tune ${c > 0 ? 'down' : 'up'}`}</div>
      <div class="tsub">${Math.abs(c) > 100 ? 'far from this string: check which one you’re playing' : `${OPEN_NAMES[t.open % 12]}${Math.floor(t.open / 12) - 1} · ${inst.tuning}`}</div>`;
  } else {
    html += '<div class="tnote idle">Play one open string…</div><div class="tsub">Listening · nothing is recorded</div>';
  }
  return `<div class="staffbox tunerbox gtuner">${html}</div>`;
}

async function gMicStart() {
  const inst = FRETTED.find((i) => i.id === state.fretInst) ?? FRETTED[0];
  gMicErr = null;
  try {
    await startMic({
      minHz: freqOf(inst.strings[0] - 3), maxHz: freqOf(inst.strings.at(-1) + 15),
      size: inst.id === 'bass' ? 4096 : 2048, // bass low E (41 Hz) needs the longer window
      onFrame: (s) => {
        gHeard = s;
        const box = document.querySelector('.gtuner');
        if (box) box.outerHTML = gTunerHtml(inst);
      },
    });
  } catch (e) {
    gMicErr = e?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it for Chordfinder to use the tuner.'
      : e?.name === 'NotFoundError' ? 'No microphone found.'
        : `Microphone unavailable (${e?.message || e?.name || e}).`;
  }
  renderGuitar();
}

function gMicOff() {
  stopMic();
  gHeard = null;
  gMicErr = null;
  renderGuitar();
}

/** Answers the current question (a clicked spot, or an option id). */
function answerFret(a) {
  if (!gQuiz || gQuiz.answered !== null) return;
  const q = gQuiz.q, inst = FRETTED.find((i) => i.id === state.fretInst) ?? FRETTED[0];
  gQuiz.answered = a;
  quizStats[gStatsKey()] = record(quizStats[gStatsKey()], isFretRight(q, a));
  saveQuiz();
  playNote(q.drill === 'find' ? inst.strings[a.string] + a.fret : inst.strings[q.string] + q.fret);
  renderGuitar();
}

function nextFretQ() {
  if (!gQuiz) return;
  gQuiz = { key: gQuiz.key, q: makeFretQuestion({ drill: state.gDrill, level: gLevel(), instrumentId: state.fretInst, prev: gQuiz.q }), answered: null };
  renderGuitar();
}

/** Clicks in practice mode; true when handled. */
function fretQuizClick(e) {
  const t = e.target;
  if (segClick(e)) return true;
  const lvl = t.closest('[data-qlevel]');
  if (lvl) { update({ gLevels: { ...state.gLevels, [state.gDrill]: +lvl.dataset.qlevel } }); return true; }
  if (t.closest('#gmic')) { micOn() ? gMicOff() : gMicStart(); return true; }
  if (t.closest('#qnext')) { nextFretQ(); return true; }
  if (t.closest('#qreset')) {
    if (gResetArmed > Date.now()) { delete quizStats[gStatsKey()]; saveQuiz(); gResetArmed = 0; } else gResetArmed = Date.now() + 3000;
    renderGuitar();
    return true;
  }
  const a = t.closest('[data-qa]');
  if (a) { answerFret(a.dataset.qa); return true; }
  const tg = t.closest('.ftarget');
  if (tg) { answerFret({ string: +tg.dataset.s, fret: +tg.dataset.f }); return true; }
  const n = t.closest('.fnote');
  if (n) playNote(+n.dataset.m);
  return true;
}

// ------------------------------------------------------------ practice drills

const QUIZ_STORE = 'chordfinder:quiz';
let quizStats = (() => { try { return JSON.parse(localStorage.getItem(QUIZ_STORE)) ?? {}; } catch { return {}; } })();
const saveQuiz = () => { try { localStorage.setItem(QUIZ_STORE, JSON.stringify(quizStats)); } catch { /* storage unavailable */ } };

// The current question and what was answered; `sig` notes the settings it
// was made for, so a re-render only makes a new one when they change.
let quiz = { q: null, answered: null, sig: '' };
let resetArmed = 0;

const quizLevel = () => state.levels?.[state.drill] ?? 0;
const statsKey = () => `${state.drill}:${quizLevel()}`;
const quizSig = () => [state.drill, quizLevel(), state.rootPc, state.modeId, state.instrument, state.minorDo].join(':');

function newQuestion(play = true) {
  stop();
  quiz = {
    q: makeQuestion({
      drill: state.drill, level: quizLevel(), rootPc: state.rootPc, modeId: state.modeId,
      instrumentId: state.instrument, la: state.minorDo === 'la', prev: quiz.q?.answer,
    }),
    answered: null, sig: quizSig(),
  };
  renderQuiz();
  if (play) playQuestion();
}

function playQuestion() {
  const q = quiz.q;
  if (!q) return;
  stop();
  if (q.drill === 'degree') playSequence(q.cadence, 104, [1, 1, 1, 2], () => {}, () => playNote(q.target, 1.3));
  else if (q.drill === 'tone') playOver(q.chord, q.target);
  else playNote(q.target, 1); // reading: only on request or after answering
}

function answerQuiz(id) {
  const q = quiz.q;
  if (!q || quiz.answered !== null) return;
  const ok = isRight(q, id);
  quiz.answered = id;
  quizStats[statsKey()] = record(quizStats[statsKey()], ok);
  saveQuiz();
  renderQuiz();
  // Let her hear the answer: degrees walk home to Do.
  if (q.drill === 'degree') playLine(q.resolve, 150, () => {}, () => {});
  else if (q.drill === 'tone') playOver(q.chord, q.target, 0.5);
  else playNote(q.target, 1);
}

function renderQuiz() {
  const el = $('hquiz');
  if (!el) return;
  if (!quiz.q || quiz.sig !== quizSig()) {
    // Settings changed (or first time): fresh question, played on the next click.
    quiz = { q: null, answered: null, sig: '' };
    quiz.q = makeQuestion({
      drill: state.drill, level: quizLevel(), rootPc: state.rootPc, modeId: state.modeId,
      instrumentId: state.instrument, la: state.minorDo === 'la',
    });
    quiz.sig = quizSig();
  }
  const q = quiz.q, d = drillById(state.drill), lv = quizLevel(), st = quizStats[statsKey()] ?? emptyStats();
  const acc = accuracy(st), done = quiz.answered !== null, ok = done && isRight(q, quiz.answered);
  const nm = (n) => formatNote(n.letter, n.acc, state.names);
  const optLabel = (o) => (q.drill === 'read' ? esc(nm(o)) : `${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}`);
  const rightOpt = q.options.find((o) => o.id === q.answer);
  const opts = q.options.map((o, i) => {
    const cls = !done ? '' : o.id === q.answer ? ' right' : o.id === quiz.answered ? ' wrong' : ' dim';
    return `<button class="qopt${cls}" data-qa="${esc(String(o.id))}"><kbd>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</kbd>${optLabel(o)}</button>`;
  }).join('');

  let stage = '';
  if (q.drill === 'read') {
    const n = { letter: q.note.letter, acc: q.note.acc, octave: q.note.octave, midi: q.written, sound: q.target, cls: done ? (ok ? 'guide' : 'tonic') : '', texts: done ? [nm(q.note)] : [] };
    const g = layoutStaff({ clef: 'treble', sig: keySignature(q.key, state.modeId), bars: [{ notes: [n] }], labels: 1 });
    stage = `<div class="qstaff">${staffSvg(g)}</div>
      <div class="qmic">${micOn()
        ? `<span class="qheard">${heard ? `🎤 You’re playing <b>${esc(writtenName(heard.midi))}</b>` : '🎤 Play the note on your sax…'}</span> <button class="link" id="qmic">mic off</button>`
        : '<button class="mic" id="qmic">🎤 Answer by playing</button>'}</div>`;
  } else {
    stage = `<div class="qplay"><button class="play" id="qreplay">▶ Replay <kbd>R</kbd></button>
      <span class="qprompt">${q.drill === 'degree' ? 'Which note was that?' : 'Which chord tone was on top?'}</span></div>`;
  }
  const feedback = !done ? '' : `<div class="qfeed ${ok ? 'ok' : 'bad'}">${ok ? '✓ Right' : '✗ Not quite'} — ${q.drill === 'read'
    ? `it’s ${esc(nm(q.note))}${q.note.octave}`
    : q.drill === 'degree' ? `it was ${esc(rightOpt.label)} (${esc(rightOpt.sub)})` : `it was the ${esc(rightOpt.label.toLowerCase())} of ${esc(q.chord.name)}`}
    <button class="play" id="qnext">Next <kbd>Space</kbd></button></div>`;

  el.innerHTML = `
    <div class="qhead">
      <div class="seg" data-set="drill">${DRILLS.map((x) => `<button data-v="${x.id}" class="${x.id === d.id ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div>
      <div class="seg qlevels">${d.levels.map((l, i) => `<button data-qlevel="${i}" class="${i === lv ? 'on' : ''}">${i + 1} · ${esc(l.name)}</button>`).join('')}</div>
    </div>
    <p class="qblurb">${esc(d.blurb)}</p>
    <div class="qscore">
      <span>Streak <b>${st.streak}</b></span><span>Best <b>${st.best}</b></span>
      <span>Last ${st.recent.length || 20}: <b>${acc === null ? '—' : `${acc}%`}</b></span><span>${st.total} answered</span>
      <button class="link" id="qreset">${resetArmed > Date.now() ? 'Sure? Click again' : 'Reset'}</button>
      ${ready(st) && lv < d.levels.length - 1 ? `<button class="qready" data-qlevel="${lv + 1}">90%+ — try level ${lv + 2} →</button>` : ''}
    </div>
    <div class="qcard">${stage}<div class="qopts">${opts}</div>${feedback}</div>`;
}

/** Name of a concert MIDI note in written pitch for the current sax. */
function writtenName(concert) {
  const m = concert + currentInst().shift;
  const c = hornView({ instrumentId: state.instrument, pitch: 'written', rootPc: state.rootPc, modeId: state.modeId }).cells.find((x) => x.midi === m);
  return c ? `${formatNote(c.letter, c.acc, state.names)}${c.octave}` : '—';
}

function wireQuiz(e) {
  const t = e.target;
  const lvl = t.closest('[data-qlevel]');
  if (lvl) { update({ levels: { ...state.levels, [state.drill]: +lvl.dataset.qlevel } }); return true; }
  const a = t.closest('[data-qa]');
  if (a) {
    const o = quiz.q.options.find((x) => String(x.id) === a.dataset.qa);
    if (o) answerQuiz(o.id);
    return true;
  }
  if (t.closest('#qreplay')) { playQuestion(); return true; }
  if (t.closest('#qnext')) { newQuestion(); return true; }
  if (t.closest('#qmic')) { micOn() ? micOff() : micStart(); return true; }
  if (t.closest('#qreset')) {
    if (resetArmed > Date.now()) { delete quizStats[statsKey()]; saveQuiz(); resetArmed = 0; }
    else { resetArmed = Date.now() + 3000; setTimeout(renderQuiz, 3100); }
    renderQuiz();
    return true;
  }
  return false;
}

/** Keys while practising: 1–9/0 answer, R replays, Space = next (or replay). */
function quizKey(e) {
  if (!quiz.q || e.target.closest?.('input, select')) return false;
  if (/^[0-9]$/.test(e.key)) {
    const i = e.key === '0' ? 9 : +e.key - 1;
    const o = quiz.q.options[i];
    if (o) answerQuiz(o.id);
    return true;
  }
  if (e.key === 'r' || e.key === 'R') { playQuestion(); return true; }
  if (e.code === 'Space') { quiz.answered !== null ? newQuestion() : playQuestion(); return true; }
  return false;
}

/** Reading drill with the tuner on: playing the right note answers it. */
function quizHear() {
  if (!state.practice || quiz.q?.drill !== 'read' || quiz.answered !== null) return;
  if (heard && heard.midi === quiz.q.target && performance.now() - heard.since > 300) answerQuiz(quiz.q.answer);
  else {
    const span = $('hquiz')?.querySelector('.qheard');
    if (span) span.innerHTML = heard ? `🎤 You’re playing <b>${esc(writtenName(heard.midi))}</b>` : '🎤 Play the note on your sax…';
  }
}

// ------------------------------------------------------------ microphone

let micError = null; // why the mic could not start, shown in the tuner box
let heard = null; // steady note from the mic: { midi (concert), cents, since }
let exercise = null; // "play it back": { targets: [cell], i, results: [{ cell, cents }] }
let lastResults = null; // the finished exercise, until the next one
let along = null; // play-along tally: { tone, scale, out, lastSince }
let tunerHtml = '';

const IN_TUNE = 15; // cents

const currentInst = () => INSTRUMENTS.find((i) => i.id === state.instrument) ?? INSTRUMENTS[1];
const shownShift = () => (state.pitch === 'written' ? currentInst().shift : 0);

async function micStart() {
  const inst = currentInst();
  micError = null;
  try {
    // Search a little beyond the instrument's sounding range.
    await startMic({
      minHz: freqOf(SAX_RANGE.low - inst.shift - 2), maxHz: freqOf(SAX_RANGE.high - inst.shift + 3), onFrame: onMicFrame,
    });
  } catch (e) {
    micError = e?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it for Chordfinder to use the tuner.'
      : e?.name === 'NotFoundError' ? 'No microphone found.'
        : `Microphone unavailable (${e?.message || e?.name || e}).`;
    exercise = null;
  }
  renderHorn();
}

function micOff() {
  stopMic();
  heard = null;
  exercise = null;
  micError = null;
  renderHorn();
}

function onMicFrame(stable) {
  const changed = (stable?.midi ?? null) !== (heard?.midi ?? null) || stable?.since !== heard?.since;
  heard = stable;
  if (changed) {
    markHeard();
    if (stable && !exercise) showFinger(stable.midi + shownShift());
  }
  countAlong(); // once per note, including one already sounding when the loop starts
  quizHear();
  if (exercise) stepExercise();
  renderTuner();
}

/** How the heard note relates to the focused chord: 'tone', 'scale' or
 *  'out' (null with the scale shown). Read from the grid's own marks. */
function relation(m) {
  if (hornFocus === null) return null;
  const cell = $('hgrid')?.querySelector(`.hcell[data-m="${m}"]`);
  return cell?.classList.contains('tone') ? 'tone' : cell?.classList.contains('in') ? 'scale' : 'out';
}

/** Rings the heard note on the grid and staves, coloured by `relation`. */
function markHeard() {
  const horn = $('horn');
  horn.querySelectorAll('.heard').forEach((el) => el.classList.remove('heard', 'heard-tone', 'heard-scale', 'heard-out'));
  if (!heard) return;
  const m = heard.midi + shownShift(), rel = relation(m);
  horn.querySelectorAll(`.hcell[data-m="${m}"], #hstaves .snote[data-m="${m}"]`)
    .forEach((el) => el.classList.add('heard', ...(rel ? [`heard-${rel}`] : [])));
}

function countAlong() {
  if (!alongPlaying || !along || !heard || heard.since === along.lastSince) return;
  const rel = relation(heard.midi + shownShift());
  if (!rel) return;
  along[rel]++;
  along.lastSince = heard.since;
}

/** One octave of the scale, up and down, as on the scale staff. */
function exerciseTargets() {
  const h = hornModel();
  const bass = state.pitch === 'concert' && ['tenor', 'bari'].includes(h.inst.id);
  const mid = bass ? 50 : 71, top = h.cells.at(-1).midi;
  const t = h.cells.filter((c) => c.tonic && c.midi + 12 <= top).sort((a, b) => Math.abs(a.midi + 6 - mid) - Math.abs(b.midi + 6 - mid))[0];
  const up = h.cells.filter((c) => c.inScale && c.midi >= t.midi && c.midi <= t.midi + 12);
  return [...up, ...up.slice(0, -1).reverse()];
}

function startExercise() {
  stopHorn();
  hornFocus = null;
  // ownsMic: the exercise switched the mic on, so it switches it off again.
  exercise = { targets: exerciseTargets(), i: 0, results: [], ownsMic: !micOn() };
  lastResults = null;
  if (micOn()) renderHorn();
  else micStart();
}

/** Moves on once the target has sounded steadily for a moment. */
function stepExercise() {
  const tgt = exercise.targets[exercise.i];
  if (!heard || heard.midi !== tgt.sound || performance.now() - heard.since < 350) return;
  exercise.results.push({ cell: tgt, cents: heard.cents });
  exercise.i++;
  if (exercise.i >= exercise.targets.length) return endExercise(true);
  markTarget();
}

/** Ends the exercise (finished or stopped). If it turned the mic on, it
 *  turns it off again; a mic the user had on stays on. The results stay
 *  in the tuner box either way. */
function endExercise(done) {
  lastResults = done ? exercise.results : null;
  if (exercise.ownsMic) { stopMic(); heard = null; }
  exercise = null;
  renderHorn();
}

/** Highlights the note to play next and shows its fingering. */
function markTarget() {
  $('horn').querySelectorAll('.target').forEach((el) => el.classList.remove('target'));
  if (!exercise) return;
  const m = exercise.targets[exercise.i].midi;
  $('horn').querySelectorAll(`.hcell[data-m="${m}"], #hstaves .snote[data-m="${m}"]`).forEach((el) => el.classList.add('target'));
  showFinger(m);
}

/** The tuner box: heard note in the pitch shown, a cents needle, and the
 *  exercise or play-along feedback. Only rewritten when its text changes. */
function renderTuner(force = false) {
  const box = $('htuner');
  if (!box) return;
  const visible = micOn() || micError || lastResults;
  box.hidden = !visible;
  if (!visible) return;
  if (force) tunerHtml = '';
  const chord = hornFocus === null ? null : hornProgression().chords[hornFocus];
  const h = hornModel(chord);
  const nm = (n) => formatNote(n.letter, n.acc, state.names);
  const label = (m) => { const c = h.cells.find((x) => x.midi === m); return c ? `${nm(c)}${c.octave}` : ''; };
  let html = '<h4>Tuner</h4>';
  if (micError) html += `<p class="terr">${esc(micError)}</p>`;
  else if (micOn()) {
    if (heard) {
      const m = heard.midi + shownShift(), c = heard.cents, cell = h.cells.find((x) => x.midi === m);
      const tone = Math.abs(c) <= IN_TUNE ? 'ok' : Math.abs(c) <= 30 ? 'near' : 'off';
      const pos = 50 + Math.max(-50, Math.min(50, c));
      html += `<div class="tnote">${esc(label(m) || '—')}</div>
        <div class="tneedle"><span class="tzone"></span><span class="tmark ${tone}" style="left:${pos}%"></span></div>
        <div class="tcents ${tone}">${Math.abs(c) <= 5 ? 'in tune' : `${c > 0 ? '+' : ''}${c}¢ ${c > 0 ? 'sharp' : 'flat'}`}</div>
        <div class="tsub">${state.pitch === 'written' ? 'written' : 'concert'}${cell ? ` · ${state.pitch === 'written' ? 'sounds' : 'written'} ${esc(nm(cell.other))}${cell.other.octave}` : ' · outside the sax range'}</div>`;
      if (alongPlaying && chord && cell) {
        const rel = relation(m), sym = chordSymbol(h.layer, state.names);
        html += `<div class="tfit ${rel}">${rel === 'tone' ? `${fnName[cell.fn]} of ${esc(sym)}` : rel === 'scale' ? `fits ${esc(sym)}` : `outside ${esc(sym)}`}</div>`;
      }
    } else {
      html += '<div class="tnote idle">Play a note…</div><div class="tsub">Listening · nothing is recorded</div>';
    }
  }
  if (along && (along.tone + along.scale + along.out)) {
    html += `<div class="ttally"><span class="tone">${along.tone} chord tones</span> · <span>${along.scale} in scale</span> · <span class="out">${along.out} outside</span></div>`;
  }
  if (exercise) {
    const t = exercise.targets[exercise.i];
    html += `<div class="texer">Play <b>${esc(label(t.midi))}</b> <small>${exercise.i + 1} / ${exercise.targets.length}</small></div>`;
  } else if (lastResults) {
    const sharp = lastResults.filter((r) => r.cents > IN_TUNE), flat = lastResults.filter((r) => r.cents < -IN_TUNE);
    const list = (rs) => rs.map((r) => `${esc(label(r.cell.midi))} (${r.cents > 0 ? '+' : ''}${r.cents}¢)`).join(', ');
    html += `<div class="tdone"><b>Scale done!</b> ${lastResults.length - sharp.length - flat.length} of ${lastResults.length} in tune
      ${sharp.length ? `<div class="out">Sharp: ${list(sharp)}</div>` : ''}${flat.length ? `<div class="out">Flat: ${list(flat)}</div>` : ''}</div>`;
  }
  if (html !== tunerHtml) { box.innerHTML = html; tunerHtml = html; }
  if (force) markTarget();
}

// ------------------------------------------------------------ main

/** Picking a style sets its tempo, chord colour, chord length and root chord,
 *  and moves to one of its modes if the current one isn't part of it. */
function styleDefaults(styleId) {
  const style = styleById(styleId);
  const { color, bpm, length, modifier = 'triad' } = style.defaults;
  const modes = styleModes(style);
  // Otherwise use the style's main mode: the first one its library lists.
  return { color, bpm, length, modifier, modeId: modes.includes(state.modeId) ? state.modeId : Object.keys(style.library)[0] };
}

function update(patch = {}) {
  if (playing) halt();
  if (linePlaying || alongPlaying) stopHorn();
  if (gPlaying || gAlong) stopGuitar();
  if ('styleId' in patch && patch.styleId !== state.styleId) patch = { ...styleDefaults(patch.styleId), ...patch };
  const keyChanged = ['rootPc', 'modeId', 'modifier', 'styleId'].some((k) => k in patch && patch[k] !== state[k]);
  // Each view's tuner has its own range and handler: switch it off when that changes.
  const micReset = ['view', 'fretInst', 'gPractice'].some((k) => k in patch && patch[k] !== state[k]);
  Object.assign(state, patch);
  if (keyChanged) { state.selected = 0; shiftOpen = null; hornFocus = null; gFocus = null; }
  if ('gVoice' in patch || 'gPos' in patch) gAlt = {};
  // A displayed MIDI number means something else in another pitch or key.
  if (['rootPc', 'modeId', 'instrument', 'pitch'].some((k) => k in patch)) fingerMidi = null;
  // The exercise's notes belong to one key, scale and pitch.
  if (exercise && ['rootPc', 'modeId', 'instrument', 'pitch', 'hornScale', 'view'].some((k) => k in patch && patch[k] !== state[k])) {
    if (exercise.ownsMic) { stopMic(); heard = null; }
    exercise = null;
  }
  if (micReset && micOn()) { stopMic(); heard = null; gHeard = null; }
  if (patch.instrument && patch.instrument !== state.instrument && micOn()) queueMicrotask(micStart); // new pitch range
  save();
  const s = suggest(state);
  const tree = buildTree(s.templates);
  model = { s, tree, g: layout(tree, { compact: state.compact, returnStyle: state.returnStyle }) };
  if (!tree.branches.some((b) => b.id === state.selected)) state.selected = tree.branches[0].id;

  const mode = s.mode;
  const styleTag = s.style.id === 'theory' ? '' : ` · ${s.style.name}`;
  $('keyTitle').textContent = `${s.key.name} ${mode.name}${mode.alias ? ` (${mode.alias})` : ''}${styleTag} — root chord ${s.tonic.name}`;
  $('keyFeel').title = '';
  $('keyFeel').textContent = `${mode.feel}. ${tree.branches.length} progressions · scale ${s.key.scale.map((n) => n.name).join(' ')}`;
  markActive();
  $('lgLine').hidden = state.returnStyle !== 'line';
  $('lgNode').hidden = state.returnStyle !== 'node';
  renderScale(s);
  renderGraph();
  renderDetail();
  document.body.dataset.view = state.view;
  if (state.view === 'sax') renderHorn();
  if (state.view === 'guitar') renderGuitar();
}

// Right-click plays a whole progression instead of opening the browser menu.
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const b = branchForRightClick(e.target);
  if (b) playBranch(b);
});

/** The progression a right-click means: a label or R node's own branch; for
 *  a chord, the selected branch if it passes through it, else the chord's
 *  own branch; in the play panel, the selected progression. */
function branchForRightClick(target) {
  const { branches, nodes } = model.tree;
  const selected = selectedBranch();
  if (target.closest('#detail .chord')) return selected;
  const tagged = target.closest('#graph [data-b]');
  if (tagged) return branches.find((b) => b.id === +tagged.dataset.b) ?? null;
  const el = target.closest('#graph .node');
  if (!el) return null;
  const id = el.dataset.id;
  if (id === 'root' || selected.path.some((n) => n.id === id)) return selected;
  return nodes.find((n) => n.id === id)?.owner ?? null;
}

document.addEventListener('keydown', (e) => {
  if (state.view === 'guitar' && state.gPractice && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.closest?.('input, select')) {
    if (/^[0-9]$/.test(e.key) && gQuiz?.q.drill === 'name') {
      const o = gQuiz.q.options[e.key === '0' ? 9 : +e.key - 1];
      if (o) { e.preventDefault(); answerFret(o.id); }
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); if (gQuiz?.answered !== null) nextFretQ(); return; }
  }
  if (state.view === 'sax' && state.practice && !e.ctrlKey && !e.altKey && !e.metaKey && quizKey(e)) {
    e.preventDefault();
    return;
  }
  if (e.code === 'Space' && !e.target.closest('input, select')) {
    e.preventDefault();
    if (state.view === 'sax') linePlaying || alongPlaying ? stopHorn() : playAlongNow();
    else if (state.view === 'guitar') gPlaying || gAlong ? stopGuitar() : playGuitarAlong();
    else playing ? halt() : playBranch(selectedBranch());
  }
});

renderStatic();
wireGraph();
update();
