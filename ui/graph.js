// Turns a list of progressions into a branching tree and lays it out.
// Progressions that share opening chords share nodes; each one that diverges
// gets its own lane (row) branching from the node it diverges after.
// Pure functions only, testable with Node.

// Geometry per view. Compact nodes drop the note names and move the Roman
// numeral next to the chord name.
export const SIZES = {
  full: { w: 116, h: 78, col: 168, lane: 136, label: 30, labelDy: 11, badgeR: 13, badgeDx: 34, badgeDy: 0, bar: 14, gutter: 16 },
  compact: { w: 108, h: 40, col: 156, lane: 88, label: 24, labelDy: 9, badgeR: 10, badgeDx: 30, badgeDy: 0, bar: 10, gutter: 11 },
};
export const TOP = 18;
export const RAIL_GAP = 8;

export function buildTree(templates) {
  const root = { id: 'root', parent: null, children: [], col: 0 };
  const nodes = new Map([['root', root]]);
  const kept = [];
  for (const t of templates) {
    const b = { ...t, path: [] };
    let cur = root;
    for (const chord of t.chords) {
      const id = `${cur.id}>${chord.token}`;
      let n = nodes.get(id);
      if (!n) {
        n = { id, chord, parent: cur, children: [], owner: b, col: cur.col + 1 };
        nodes.set(id, n);
        cur.children.push(n);
        b.first ??= n;
      }
      b.path.push(n);
      cur = n;
    }
    // A progression that adds nothing new (fully shared) has no lane to label.
    if (!b.first) continue;
    b.fork = b.first.parent;
    b.last = cur;
    kept.push(b);
  }
  root.owner = kept[0];

  assignLanes(kept, [...nodes.values()]);
  const tree = { root, nodes: [...nodes.values()], branches: kept };
  for (const b of kept) if (b.end === 'open') b.next = continuation(tree, b);
  return tree;
}

/** Where an open ending could carry on. Returns
 *  { node, via, steps } (continue into another branch at `node`), or
 *  { node: root, home: true } (a dominant that can simply resolve), or null. */
export function continuation(tree, b) {
  const last = b.last.chord;
  if (last.offset === 0) return null; // already on the tonic: truly final
  // A dominant (V, vii°) left hanging simply wants to resolve home.
  const dominant = (last.offset === 7 && last.triad === 'maj') || (last.offset === 11 && last.triad === 'dim');
  if (dominant) return { node: tree.root, home: true };
  let best = null;
  for (const via of tree.branches) {
    if (via === b || via.end !== 'resolve') continue;
    via.path.forEach((n, i) => {
      if (i === 0 || via.path[i - 1].chord.token !== last.token || n === b.last) return;
      if (b.path.includes(n)) return;
      const steps = via.path.length - i; // chords left before it resolves
      if (!best || steps < best.steps || (steps === best.steps && via.lane < best.via.lane)) {
        best = { node: n, via, steps };
      }
    });
  }
  if (best) return best;
  // A predominant (ii, IV/iv, ♭VI) can move to any major V that resolves next.
  if ([2, 5, 8].includes(last.offset)) {
    const v = tree.branches.find((x) => x !== b && x.end === 'resolve'
      && x.last.chord.offset === 7 && x.last.chord.triad === 'maj');
    if (v) return { node: v.last, via: v, steps: 1, toDominant: true };
  }
  return null;
}

// Depth-first: a branch's sub-branches sit directly below it. Branches that
// fork later (further right) get the nearer lanes so connectors don't cross.
function assignLanes(branches, nodes) {
  let lane = 0;
  const place = (b) => {
    b.lane = lane++;
    const owned = nodes.filter((n) => n.owner === b);
    owned.forEach((n) => { n.lane = b.lane; });
    branches
      .filter((k) => k !== b && owned.includes(k.fork))
      .sort((x, y) => y.fork.col - x.fork.col || x.id - y.id)
      .forEach(place);
  };
  place(branches[0]);
}

/** Computes pixel geometry for nodes, edges, returns, hints, and labels.
 *  opts.compact: smaller nodes. opts.returnStyle: 'line' draws arrows back to
 *  the root; 'node' ends each resolving branch with a small R node instead. */
export function layout(tree, { compact = false, returnStyle = 'line' } = {}) {
  const { nodes, branches, root } = tree;
  const S = compact ? SIZES.compact : SIZES.full;
  const W = S.w, H = S.h;
  const resolving = branches.filter((b) => b.end === 'resolve').sort((a, b) => a.lane - b.lane);
  const returning = returnStyle === 'line' ? resolving : [];
  const left = 28 + (returning.length ? returning.length * RAIL_GAP + 22 : 0);
  for (const n of nodes) {
    n.x = left + n.col * S.col;
    n.y = TOP + n.lane * S.lane + S.label;
  }

  const edges = nodes.filter((n) => n.parent).map((n) => {
    const a = n.parent, x1 = a.x + W, y1 = a.y + H / 2, x2 = n.x - 3, y2 = n.y + H / 2;
    // Branches share a vertical trunk just right of the fork node, so
    // siblings overlap into one clean line instead of fanning out.
    const tx = x1 + 16, r = 10;
    const d = y1 === y2
      ? `M${x1},${y1} L${x2},${y2}`
      : `M${x1},${y1} L${tx - r},${y1} Q${tx},${y1} ${tx},${y1 + r} L${tx},${y2 - r} Q${tx},${y2} ${tx + r},${y2} L${x2},${y2}`;
    return { to: n.id, from: a.id, branch: n.owner, d };
  });

  // Return arrows run down into the gutter under their lane, left to a rail
  // beside the root, up, and into the root's left side.
  const r = 8, ry = root.y + H / 2;
  const returns = returning.map((b, i) => {
    const sx = b.last.x + W / 2, sy = b.last.y + H;
    const gy = b.last.y + H + S.gutter;
    const rx = left - 22 - i * RAIL_GAP;
    const d = [
      `M${sx},${sy}`, `L${sx},${gy - r}`, `Q${sx},${gy} ${sx - r},${gy}`,
      `L${rx + r},${gy}`, `Q${rx},${gy} ${rx},${gy - r}`,
      `L${rx},${ry + r}`, `Q${rx},${ry} ${rx + r},${ry}`, `L${root.x - 3},${ry}`,
    ].join(' ');
    return { branch: b, d };
  });

  // The alternative: a small "R" node right after the last chord.
  const badges = returnStyle === 'node' ? resolving.map((b) => {
    const cy = b.last.y + H / 2 + S.badgeDy, cx = b.last.x + W + S.badgeDx;
    return { branch: b, cx, cy, r: S.badgeR, d: `M${b.last.x + W},${cy} L${cx - S.badgeR - 3},${cy}` };
  }) : [];

  // Final barlines for branches that end away from home.
  const bars = branches.filter((b) => b.end === 'open')
    .map((b) => ({ branch: b, x: b.last.x + W + 10, y: b.last.y + H / 2 + S.badgeDy, h: S.bar }));

  // Dotted "could continue" hints: from past an open ending's bar into the
  // top of the chord it could carry on to.
  const hints = branches.filter((b) => b.next).map((b) => {
    const sx = b.last.x + W + 22, sy = b.last.y + H / 2;
    const t = b.next.node, ex = t.x + W * 0.72, ey = t.y - 3;
    const lift = Math.max(40, Math.min(90, Math.abs(sy - ey) / 2));
    return { branch: b, d: `M${sx},${sy} C${sx + 60},${sy} ${ex},${ey - lift} ${ex},${ey}` };
  });

  // The main line is labelled above the root; branches above their first chord.
  const labels = branches.map((b, i) => {
    const at = i === 0 ? root : b.first;
    return { branch: b, x: at.x, y: at.y - S.labelDy };
  });

  const maxCol = Math.max(...nodes.map((n) => n.col));
  const width = left + (maxCol + 1) * S.col + 80;
  const lanes = Math.max(...nodes.map((n) => n.lane)) + 1;
  const height = TOP + lanes * S.lane + 10;
  return { size: S, compact, nodes, edges, returns, badges, bars, hints, labels, width, height };
}
