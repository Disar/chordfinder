import { MODES, MODIFIERS, MODE_ABBR, ROOT_LABELS, STYLES, styleById, styleModes, suggest } from './theory.js';
import { buildTree, layout } from './graph.js';
import { playChord, playSequence, stop } from './audio.js';
import { progressionToMidi, midiFileName } from './midi.js';

const PALETTE = ['#ffb454', '#7c8cff', '#4cd99a', '#ff7a90', '#4cc3f5', '#c792ea', '#f5d76e',
  '#5fe0c8', '#ff9d5c', '#9ccc65', '#f78fb3', '#82aaff', '#e6a26a', '#b4a7ff', '#6fd3a0', '#ffcb6b'];

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
  return saved;
};
const state = Object.assign(
  { rootPc: 0, modeId: 'ionian', modifier: 'triad', color: 'triad', selected: 0, bpm: 96, zoom: 1,
    returnStyle: 'line', compact: true, borrowed: false, chordsOpen: true, settingsOpen: false,
    styleId: 'theory', length: 'phrase' },
  loadSaved(),
  { v: STATE_VERSION },
);
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage unavailable */ } };

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
  $('style').innerHTML = STYLES.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
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
}

function markActive() {
  document.querySelectorAll('#piano [data-pc]').forEach((b) => b.classList.toggle('on', +b.dataset.pc === state.rootPc));
  const style = styleById(state.styleId), usable = styleModes(style);
  $('style').value = style.id;
  $('styleBlurb').textContent = style.blurb;
  document.querySelectorAll('#modes [data-mode]').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === state.modeId);
    // Modes the style has no progressions for are dimmed and can't be picked.
    const na = !usable.includes(b.dataset.mode);
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
}

function renderScale(s) {
  $('scale').innerHTML = s.scale.map((c, i) =>
    `<button data-deg="${i}" title="${esc(c.notes.join(' '))}"><span class="r">${esc(c.roman)}</span><span class="n">${esc(c.name)}</span></button>`).join('');
  $('scale').onclick = (e) => { const b = e.target.closest('[data-deg]'); if (b) sound(s.scale[+b.dataset.deg]); };
}

// ------------------------------------------------------------ graph

function renderGraph() {
  const { tree, g } = model;
  const color = (b) => PALETTE[b.lane % PALETTE.length];
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
  focus(null);
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
  }, { passive: false });
}

// ------------------------------------------------------------ detail footer

function selectedBranch() {
  return model.tree.branches.find((b) => b.id === state.selected) ?? model.tree.branches[0];
}

function renderDetail() {
  const b = selectedBranch();
  const color = PALETTE[b.lane % PALETTE.length];
  const t = model.s.tonic;
  const seq = [t, ...b.chords];
  const chip = (c, i, root) =>
    `<button class="chord${root ? ' root' : ''}${lent(c) ? ' borrowed' : ''}" data-i="${i}" title="${esc(chordTitle(c))}"><b>${esc(c.name)}</b><small>${esc(c.roman)}</small></button>`;
  const chips = seq.map((c, i) => chip(c, i, i === 0)).join('<span class="arrow">→</span>');
  const ending = b.end === 'resolve'
    ? `<span class="arrow">→</span>${chip(t, seq.length, true)}<span class="arrow" title="Resolves to the root">↺</span>`
    : '<span class="end" title="Ends here">‖</span>' + (b.next
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
  wireMidiDrag($('midi'), b);
  const cont = $('cont');
  if (cont) cont.onclick = () => {
    if (b.next.home) return sound(t);
    state.selected = b.next.via.id;
    save();
    renderDetail();
    focus(null);
  };
  $('bpm').oninput = (e) => { state.bpm = +e.target.value; $('bpmv').textContent = state.bpm; save(); };
  $('detail').querySelector('.row').onclick = (e) => {
    const c = e.target.closest('.chord');
    if (c) sound(+c.dataset.i >= seq.length ? t : seq[+c.dataset.i]);
  };
}

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

function wireMidiDrag(btn, b) {
  const tauri = window.__TAURI__?.core;
  if (!tauri) {
    // Plain browser: let Chromium drag the file out itself (drops onto the desktop).
    btn.draggable = true;
    btn.ondragstart = (e) => {
      const { name, bytes } = midiFor(b);
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
      const { name, bytes } = midiFor(b);
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
function sequenceFor(b) {
  const tonic = model.s.tonic;
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
  if ('styleId' in patch && patch.styleId !== state.styleId) patch = { ...styleDefaults(patch.styleId), ...patch };
  const keyChanged = ['rootPc', 'modeId', 'modifier', 'styleId'].some((k) => k in patch && patch[k] !== state[k]);
  Object.assign(state, patch);
  if (keyChanged) state.selected = 0;
  save();
  const s = suggest(state);
  const tree = buildTree(s.templates);
  model = { s, tree, g: layout(tree, { compact: state.compact, returnStyle: state.returnStyle }) };
  if (!tree.branches.some((b) => b.id === state.selected)) state.selected = tree.branches[0].id;

  const mode = s.mode;
  const styleTag = s.style.id === 'theory' ? '' : ` · ${s.style.name}`;
  $('keyTitle').textContent = `${s.key.name} ${mode.name}${mode.alias ? ` (${mode.alias})` : ''}${styleTag} — root chord ${s.tonic.name}`;
  $('keyFeel').textContent = `${mode.feel}. ${tree.branches.length} progressions · scale ${s.key.scale.map((n) => n.name).join(' ')}`;
  markActive();
  $('lgLine').hidden = state.returnStyle !== 'line';
  $('lgNode').hidden = state.returnStyle !== 'node';
  renderScale(s);
  renderGraph();
  renderDetail();
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
  if (e.code === 'Space' && !e.target.closest('input')) {
    e.preventDefault();
    playing ? halt() : playBranch(selectedBranch());
  }
});

renderStatic();
wireGraph();
update();
