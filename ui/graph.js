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

  const edges = nodes.filter((n) => n.parent).map((n) =>
    ({ to: n.id, from: n.parent.id, branch: n.owner, d: edgePath(n, W, H) }));

  const returns = returning.map((b, i) => ({ branch: b, d: returnPath(b, i, root, left, S) }));

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
  return { size: S, compact, nodes, edges, returns, badges, bars, hints, labels, width, height, root, left, returning, lanes };
}

/** Edge from n's parent into n. Branches share a vertical trunk just right
 *  of the fork node, so siblings overlap into one clean line instead of
 *  fanning out. rootDy moves the root down (sticky root). */
function edgePath(n, W, H, rootDy = 0) {
  const a = n.parent, x1 = a.x + W, y1 = a.y + H / 2 + (a.parent ? 0 : rootDy), x2 = n.x - 3, y2 = n.y + H / 2;
  if (y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
  const tx = x1 + 16, r = Math.min(10, Math.abs(y2 - y1) / 2), s = Math.sign(y2 - y1);
  return `M${x1},${y1} L${tx - r},${y1} Q${tx},${y1} ${tx},${y1 + s * r} L${tx},${y2 - s * r} Q${tx},${y2} ${tx + r},${y2} L${x2},${y2}`;
}

/** Return arrow: down into the gutter under its lane, left to a rail beside
 *  the root, up (or down, when the root is stuck below), into the root. */
function returnPath(b, i, root, left, S, rootDy = 0) {
  const W = S.w, H = S.h;
  const ry = root.y + H / 2 + rootDy;
  const sx = b.last.x + W / 2, sy = b.last.y + H;
  const gy = b.last.y + H + S.gutter;
  const rx = left - 22 - i * RAIL_GAP;
  const r = Math.min(8, Math.abs(gy - ry) / 2), s = Math.sign(ry - gy) || -1;
  return [
    `M${sx},${sy}`, `L${sx},${gy - 8}`, `Q${sx},${gy} ${sx - 8},${gy}`,
    `L${rx + r},${gy}`, `Q${rx},${gy} ${rx},${gy + s * r}`,
    `L${rx},${ry - s * r}`, `Q${rx},${ry} ${rx + r},${ry}`, `L${root.x - 3},${ry}`,
  ].join(' ');
}

/** How far the root moves down so it stays in view when the graph is
 *  scrolled: top = the visible top edge in graph units. Stops at the last lane. */
export function rootOffset(g, top) {
  const max = (g.lanes - 1) * g.size.lane;
  return Math.max(0, Math.min(max, top + 12 - g.root.y));
}

/** The root's edges and return arrows with the root moved down by dy. */
export function rootPaths(g, dy) {
  const W = g.size.w, H = g.size.h;
  return {
    edges: g.nodes.filter((n) => n.parent === g.root).map((n) => ({ to: n.id, d: edgePath(n, W, H, dy) })),
    returns: g.returning.map((b, i) => ({ branch: b, d: returnPath(b, i, g.root, g.left, g.size, dy) })),
  };
}
