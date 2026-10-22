// ============================================================
// PATHS: a sparse graph of walkable points, routed with A*
// ============================================================
function buildGraph(world) {
  const BS = 64, cols = Math.ceil(MAP_W / BS);
  const g = { nodes: [], buckets: new Map(), BS, cols };
  world.graph = g;
  const spacing = CONFIG.NODE_SPACING;
  for (let a = 0; a < 9000; a++) {
    const x = Math.round(randRange(10, MAP_W - 10)), y = Math.round(randRange(14, MAP_H - 8));
    if (isBlocked(world, x, y)) continue;
    let ok = true;
    graphNear(g, x, y, spacing, n => {
      if ((n.x - x) ** 2 + (n.y - y) ** 2 < (spacing * 0.8) ** 2) { ok = false; return false; }
    });
    if (!ok) continue;
    const n = { i: g.nodes.length, x, y, edges: [], main: false };
    g.nodes.push(n);
    const k = Math.floor(x / BS) + Math.floor(y / BS) * cols;
    if (!g.buckets.has(k)) g.buckets.set(k, []);
    g.buckets.get(k).push(n);
  }
  const maxLen = spacing * 1.9;
  for (const a of g.nodes) {
    graphNear(g, a.x, a.y, maxLen, b => {
      if (b.i <= a.i) return;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > maxLen || !segmentClear(world, a.x, a.y, b.x, b.y)) return;
      a.edges.push({ to: b.i, cost: d });
      b.edges.push({ to: a.i, cost: d });
    });
  }
  // Only the network connected to the canteen counts; islands are ignored.
  const door = world.canteen.door;
  let start = null, best = Infinity;
  graphNear(g, door.x, door.y, 200, n => {
    const d = dist(n.x, n.y, door.x, door.y);
    if (d < best && segmentClear(world, door.x, door.y, n.x, n.y)) { best = d; start = n; }
  });
  if (!start) return;
  const queue = [start];
  start.main = true;
  while (queue.length) {
    const n = queue.pop();
    for (const e of n.edges) { const m = g.nodes[e.to]; if (!m.main) { m.main = true; queue.push(m); } }
  }
}
function graphNear(g, x, y, r, fn) {
  const bx = Math.floor(x / g.BS), by = Math.floor(y / g.BS), k = Math.ceil(r / g.BS);
  for (let j = by - k; j <= by + k; j++) for (let i = bx - k; i <= bx + k; i++) {
    if (i < 0 || j < 0 || i >= g.cols) continue;
    const list = g.buckets.get(i + j * g.cols);
    if (list) for (const n of list) if (fn(n) === false) return;
  }
}
function nearbyMainNodes(world, x, y, r) {
  const out = [];
  graphNear(world.graph, x, y, r, n => { if (n.main) out.push(n); });
  return out.sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
}
function nearestVisibleNode(world, x, y) {
  const cands = nearbyMainNodes(world, x, y, 200);
  for (let i = 0; i < Math.min(cands.length, 12); i++) if (segmentClear(world, x, y, cands[i].x, cands[i].y)) return cands[i].i;
  return -1;
}
function astar(g, s, t) {
  if (s === t) return [s];
  const N = g.nodes.length, T = g.nodes[t];
  const gs = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const h = i => dist(g.nodes[i].x, g.nodes[i].y, T.x, T.y);
  const open = new MinHeap();
  gs[s] = 0; open.push(s, h(s));
  while (open.size) {
    const u = open.pop();
    if (u === t) break;
    if (closed[u]) continue;
    closed[u] = 1;
    for (const e of g.nodes[u].edges) {
      const ng = gs[u] + e.cost;
      if (ng < gs[e.to]) { gs[e.to] = ng; from[e.to] = u; open.push(e.to, ng + h(e.to)); }
    }
  }
  if (from[t] < 0) return null;
  const path = [t];
  for (let c = t; c !== s;) { c = from[c]; path.push(c); }
  return path.reverse();
}
// Skip waypoints wherever a straight walk is clear, so routes look chosen rather than gridded.
function smoothRoute(world, pts) {
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 6);
    while (j > i + 1 && !segmentClear(world, pts[i].x, pts[i].y, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}
function findRoute(world, x0, y0, x1, y1) {
  const d = dist(x0, y0, x1, y1);
  if (d < 1) return [];
  if (d < 220 && segmentClear(world, x0, y0, x1, y1)) return [{ x: x1, y: y1 }];
  let a = nearestVisibleNode(world, x0, y0);
  if (a < 0) { const near = nearbyMainNodes(world, x0, y0, 400); if (!near.length) return null; a = near[0].i; }
  const b = nearestVisibleNode(world, x1, y1);
  if (b < 0) return null;
  const path = astar(world.graph, a, b);
  if (!path) return null;
  const pts = [{ x: x0, y: y0 }, ...path.map(i => ({ x: world.graph.nodes[i].x, y: world.graph.nodes[i].y })), { x: x1, y: y1 }];
  return smoothRoute(world, pts).slice(1);
}
