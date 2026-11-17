// Saxophone fingerings by WRITTEN pitch (the same on soprano, alto, tenor and
// baritone), low B♭3 to high F♯6, plus the key layout for the diagram.
// Pure data and functions (no DOM) so Node can test it.
//
// Cross-checked against the Woodwind Fingering Guide's saxophone charts
// (wfg.woodwind.org/sax, first and second octave, basic fingerings).

/** Diagram keys: id and name. Where each key sits is up to the layout. */
export const KEYS = [
  { id: 'oct', name: 'Octave key (left thumb)' },
  { id: 'frontF', name: 'Front F key' },
  { id: 'palmEb', name: 'Palm key E♭' },
  { id: 'palmD', name: 'Palm key D' },
  { id: 'palmF', name: 'Palm key F' },
  { id: 'L1', name: 'Left 1st finger (B)' },
  { id: 'bis', name: 'Bis key (B♭)' },
  { id: 'L2', name: 'Left 2nd finger (A)' },
  { id: 'L3', name: 'Left 3rd finger (G)' },
  { id: 'Gs', name: 'G♯ key (left pinky)' },
  { id: 'lowCs', name: 'Low C♯ key (left pinky)' },
  { id: 'lowB', name: 'Low B key (left pinky)' },
  { id: 'lowBb', name: 'Low B♭ key (left pinky)' },
  { id: 'highFs', name: 'High F♯ key (right side)' },
  { id: 'sideE', name: 'Side key high E (right)' },
  { id: 'sideC', name: 'Side C key (right)' },
  { id: 'sideBb', name: 'Side B♭ key (right)' },
  { id: 'R1', name: 'Right 1st finger (F)' },
  { id: 'R2', name: 'Right 2nd finger (E)' },
  { id: 'altFs', name: 'Alternate F♯ key' },
  { id: 'R3', name: 'Right 3rd finger (D)' },
  { id: 'lowEb', name: 'Low E♭ key (right pinky)' },
  { id: 'lowC', name: 'Low C key (right pinky)' },
];
export const DIAGRAM = { w: 100, h: 240 }; // every layout fits this box

// Shapes: c = [cx, cy, r], e = [cx, cy, rx, ry], r = [x, y, w, h, corner
// radius], p = SVG path. Pearls (finger keys) are circles; levers, side
// and pinky keys are not.
const c = (...a) => ({ c: a }), e = (...a) => ({ e: a }), r = (...a) => ({ r: a }), p = (d) => ({ p: d });

/** Diagram layouts. `deco`: lines ([x1, y1, x2, y2, class]); `hands`: where
 *  the L / R labels go on the big diagram. */
export const LAYOUTS = [
  {
    // Vertical schematic: palm and side keys to the left, pinky keys to the
    // right and bottom.
    id: 'schematic', name: 'Schematic', tip: 'Keys in a column, levers drawn as bars',
    keys: {
      oct: p('M40 14 Q50 1 60 14 Z'),
      frontF: p('M43 27 Q50 19 57 27 Q50 31 43 27 Z'),
      palmEb: r(14.5, 22, 9, 16, 4), palmD: r(14.5, 40, 9, 16, 4), palmF: r(14.5, 58, 9, 16, 4),
      L1: c(50, 42, 9), bis: c(50, 57, 3.5), L2: c(50, 72, 9), L3: c(50, 95, 9),
      Gs: r(70, 98, 18, 8, 2),
      lowCs: r(66, 111, 12, 10, 2), lowB: r(81, 111, 12, 10, 2), lowBb: r(71, 125, 18, 8, 2),
      highFs: p('M15 126 H23 L21 138 H17 Z'),
      sideE: r(15.5, 142, 7, 14, 2), sideC: r(15.5, 159, 7, 14, 2), sideBb: r(15.5, 176, 7, 14, 2),
      R1: c(50, 149, 9), R2: c(50, 172, 9), altFs: c(64, 184, 3.5), R3: c(50, 196, 9),
      lowEb: r(69, 209, 17, 9, 2), lowC: r(63, 223, 19, 11, 3),
    },
    deco: [[34, 122, 66, 122, 'fdiv']],
    hands: [[98, 60], [98, 176]],
  },
  {
    // Compact chart: octave key as a wedge left of the pearls, palm keys as
    // a cluster to the right, left pinky table right of G, side keys as
    // stacked bars, right pinky keys one split pad at the bottom left.
    id: 'chart', name: 'Chart', tip: 'Compact chart: pinky table and side bars next to the pearls',
    keys: {
      oct: p('M18 66 L24 32 L28 66 Z'),
      frontF: c(51, 15, 5),
      palmD: e(86, 28, 4, 8), palmEb: e(76, 38, 4, 8), palmF: e(86, 48, 4, 8),
      L1: c(51, 40, 11), bis: c(65, 56, 3.5), L2: c(51, 71, 11), L3: c(51, 102, 11),
      Gs: r(72, 94, 24, 7, 2),
      lowCs: r(72, 104, 11, 13, 2), lowB: r(85, 104, 11, 13, 2), lowBb: r(72, 120, 24, 7, 2),
      highFs: r(24, 122, 7, 9, 2), sideE: r(24, 134, 7, 12, 2), sideC: r(24, 149, 7, 12, 2), sideBb: r(24, 164, 7, 12, 2),
      R1: c(51, 142, 11), R2: c(51, 174, 11), altFs: c(33, 198, 3.5), R3: c(51, 207, 11),
      lowEb: p('M14 225 V219 Q14 214 19 214 H33 Q38 214 38 219 V225 Z'),
      lowC: p('M14 227 H38 V232 Q38 237 33 237 H19 Q14 237 14 232 Z'),
    },
    deco: [[40, 122, 62, 122, 'fdiv']],
    hands: [[99, 76], [99, 176]],
  },
  {
    // The horn's body as two rails: pearls between them, side keys and the
    // right pinky keys outside the left rail, palm keys and the left pinky
    // table outside the right rail.
    id: 'body', name: 'Body', tip: 'Keys around an outline of the horn',
    keys: {
      oct: r(29, 14, 8, 14, 2),
      frontF: e(52, 22, 5, 3),
      palmD: e(80, 20, 4, 7), palmEb: e(90, 20, 4, 7), palmF: e(85, 37, 4, 7),
      L1: c(52, 52, 8), bis: c(52, 66, 2.5), L2: c(52, 79, 8), L3: c(52, 103, 8),
      Gs: r(72, 92, 22, 8, 3),
      lowCs: r(72, 103, 10, 11, 1.5), lowB: r(84, 103, 10, 11, 1.5), lowBb: r(72, 117, 22, 8, 3),
      highFs: r(24, 128, 9, 10, 1.5), sideE: r(24, 141, 9, 10, 1.5), sideC: r(24, 154, 9, 10, 1.5), sideBb: r(24, 167, 9, 10, 1.5),
      R1: c(52, 144, 8), R2: c(52, 168, 8), altFs: c(62, 181, 2.5), R3: c(52, 193, 8),
      lowEb: r(20, 203, 14, 9, 2), lowC: r(20, 216, 14, 11, 2),
    },
    deco: [[40, 4, 40, 236, 'frail'], [64, 4, 64, 236, 'frail'], [44, 122, 60, 122, 'fdiv']],
    hands: [[99, 66], [99, 176]],
  },
];
export const layoutById = (id) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

/** Bounding box of a layout shape: [x0, y0, x1, y1]. */
export function shapeBox(s) {
  if (s.c) { const [x, y, rr] = s.c; return [x - rr, y - rr, x + rr, y + rr]; }
  if (s.e) { const [x, y, rx, ry] = s.e; return [x - rx, y - ry, x + rx, y + ry]; }
  if (s.r) { const [x, y, w, h] = s.r; return [x, y, x + w, y + h]; }
  // Path: the box of its numbers taken as x, y pairs (H/V take one number).
  const xs = [], ys = [];
  let cur = [0, 0];
  for (const [, cmd, args] of s.p.matchAll(/([MLQHVZ])([^MLQHVZ]*)/gi)) {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'H') n.forEach((x) => { cur = [x, cur[1]]; xs.push(x); ys.push(cur[1]); });
    else if (cmd === 'V') n.forEach((y) => { cur = [cur[0], y]; xs.push(cur[0]); ys.push(y); });
    else for (let i = 0; i + 1 < n.length; i += 2) { cur = [n[i], n[i + 1]]; xs.push(n[i]); ys.push(n[i + 1]); }
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const LH = ['L1', 'L2', 'L3'], RH = ['R1', 'R2', 'R3'];
const f = (keys, name = null, tip = '') => ({ keys, name, tip });

// First and second octave share fingerings; the second adds the octave key.
const LOW = {
  58: [f([...LH, 'lowBb', ...RH, 'lowC'])],
  59: [f([...LH, 'lowB', ...RH, 'lowC'])],
  60: [f([...LH, ...RH, 'lowC'])],
  61: [f([...LH, 'lowCs', ...RH, 'lowC'])],
  62: [f([...LH, ...RH])],
  63: [f([...LH, ...RH, 'lowEb'])],
  64: [f([...LH, 'R1', 'R2'])],
  65: [f([...LH, 'R1'])],
  66: [f([...LH, 'R2']), f([...LH, 'R1', 'altFs'], 'Alternate F♯', 'Smoother next to F: keep F down, add the F♯ key')],
  67: [f(LH)],
  68: [f([...LH, 'Gs'])],
  69: [f(['L1', 'L2'])],
  70: [
    f(['L1', 'bis'], 'Bis B♭', 'Easiest when there is no B♮ nearby'),
    f(['L1', 'L2', 'sideBb'], 'Side B♭', 'For chromatic lines and B♭–B or B♭–C moves'),
    f(['L1', 'R1'], '1 and 1', 'Handy next to F or F♯'),
  ],
  71: [f(['L1'])],
  72: [f(['L2']), f(['L1', 'sideC'], 'Side C', 'For chromatic lines and B–C moves')],
  73: [f([])],
};

const HIGH = {
  86: [f(['oct', 'palmD'])],
  87: [f(['oct', 'palmD', 'palmEb'])],
  88: [f(['oct', 'palmD', 'palmEb', 'sideE']), f(['oct', 'frontF', 'L2', 'L3'], 'Front F', 'Less stable; next to high C and C♯')],
  89: [f(['oct', 'palmD', 'palmEb', 'palmF', 'sideE']), f(['oct', 'frontF', 'L2'], 'Front F', 'Less stable; next to high C')],
  90: [
    f(['oct', 'palmD', 'palmEb', 'palmF', 'sideE', 'highFs']),
    f(['oct', 'frontF', 'L2', 'sideBb'], 'Without high F♯ key', 'For saxophones that have no high F♯ key'),
  ],
};

/** Fingerings for a written MIDI note (B♭3 = 58 … F♯6 = 90); the first is
 *  the standard one. Empty outside the range. */
export function fingeringsFor(written) {
  if (LOW[written]) return LOW[written];
  if (HIGH[written]) return HIGH[written];
  const low = LOW[written - 12];
  return low && written >= 74 ? low.map((x) => ({ ...x, keys: ['oct', ...x.keys] })) : [];
}

export const keyName = (id) => KEYS.find((k) => k.id === id)?.name ?? id;
