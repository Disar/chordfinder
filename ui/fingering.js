// Saxophone fingerings by WRITTEN pitch (the same on soprano, alto, tenor and
// baritone), low B♭3 to high F♯6, plus the key layout for the diagram.
// Pure data and functions (no DOM) so Node can test it.
//
// Cross-checked against the Woodwind Fingering Guide's saxophone charts
// (wfg.woodwind.org/sax, first and second octave, basic fingerings).

/** Diagram keys: id, name, shape (c = circle, e = ellipse), centre, size.
 *  Layout is a vertical schematic: octave key and front F on top, palm keys
 *  and right-hand side keys to the left, pinky keys to the right/bottom. */
export const KEYS = [
  { id: 'oct', name: 'Octave key (left thumb)', s: 'e', x: 50, y: 9, rx: 10, ry: 5 },
  { id: 'frontF', name: 'Front F key', s: 'e', x: 50, y: 25, rx: 6, ry: 3.5 },
  { id: 'palmEb', name: 'Palm key E♭', s: 'e', x: 19, y: 30, rx: 5, ry: 8 },
  { id: 'palmD', name: 'Palm key D', s: 'e', x: 19, y: 48, rx: 5, ry: 8 },
  { id: 'palmF', name: 'Palm key F', s: 'e', x: 19, y: 66, rx: 5, ry: 8 },
  { id: 'L1', name: 'Left 1st finger (B)', s: 'c', x: 50, y: 42, r: 9 },
  { id: 'bis', name: 'Bis key (B♭)', s: 'c', x: 50, y: 57, r: 3.5 },
  { id: 'L2', name: 'Left 2nd finger (A)', s: 'c', x: 50, y: 72, r: 9 },
  { id: 'L3', name: 'Left 3rd finger (G)', s: 'c', x: 50, y: 95, r: 9 },
  { id: 'Gs', name: 'G♯ key (left pinky)', s: 'e', x: 79, y: 102, rx: 8, ry: 4.5 },
  { id: 'lowCs', name: 'Low C♯ key (left pinky)', s: 'e', x: 72, y: 116, rx: 6, ry: 4.5 },
  { id: 'lowB', name: 'Low B key (left pinky)', s: 'e', x: 87, y: 116, rx: 6, ry: 4.5 },
  { id: 'lowBb', name: 'Low B♭ key (left pinky)', s: 'e', x: 80, y: 129, rx: 7, ry: 4.5 },
  { id: 'highFs', name: 'High F♯ key (right side)', s: 'e', x: 19, y: 132, rx: 5, ry: 6 },
  { id: 'sideE', name: 'Side key high E (right)', s: 'e', x: 19, y: 149, rx: 5, ry: 7 },
  { id: 'sideC', name: 'Side C key (right)', s: 'e', x: 19, y: 166, rx: 5, ry: 7 },
  { id: 'sideBb', name: 'Side B♭ key (right)', s: 'e', x: 19, y: 183, rx: 5, ry: 7 },
  { id: 'R1', name: 'Right 1st finger (F)', s: 'c', x: 50, y: 149, r: 9 },
  { id: 'R2', name: 'Right 2nd finger (E)', s: 'c', x: 50, y: 172, r: 9 },
  { id: 'altFs', name: 'Alternate F♯ key', s: 'c', x: 64, y: 184, r: 3.5 },
  { id: 'R3', name: 'Right 3rd finger (D)', s: 'c', x: 50, y: 196, r: 9 },
  { id: 'lowEb', name: 'Low E♭ key (right pinky)', s: 'e', x: 77, y: 214, rx: 8, ry: 4.5 },
  { id: 'lowC', name: 'Low C key (right pinky)', s: 'e', x: 72, y: 229, rx: 9, ry: 5 },
];
export const DIAGRAM = { w: 100, h: 240, split: 122 }; // split: y of the hand divider

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
