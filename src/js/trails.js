// ============================================================
// TRAILS: an invisible wear map (data only, never drawn as tiles). Walking wears grass into dirt,
// worn ground is cheaper to walk so routes bend toward it, and paths nobody uses grow back.
// ============================================================
const TRAIL_CELL = 4;          // px per wear cell
const TRAIL_STEP = 0.05;       // wear a Thrimp adds to each cell it walks into
const TRAIL_DECAY = 0.012;     // wear lost per game hour: a fully worn path grows back in about 3.5 days
const TRAIL_DISCOUNT = 0.45;   // fully worn ground costs 45% less to walk
const TRAIL_LEVELS = 8;        // visual steps; a cell is only repainted when its step changes

function initTrails(w) {
  w.trailW = Math.ceil(MAP_W / TRAIL_CELL);
  w.trailH = Math.ceil(MAP_H / TRAIL_CELL);
  w.trail = new Float32Array(w.trailW * w.trailH);
  w.trailActive = new Set();   // cells with any wear, so decay only visits those
  w.trailDirty = new Set();    // cells whose look changed since the last repaint
}
const trailCell = (w, x, y) => clamp(Math.floor(y / TRAIL_CELL), 0, w.trailH - 1) * w.trailW + clamp(Math.floor(x / TRAIL_CELL), 0, w.trailW - 1);
const wearAt = (w, x, y) => w.trail[trailCell(w, x, y)];
const trailLevel = v => Math.min(TRAIL_LEVELS, Math.floor(v * TRAIL_LEVELS));

function addWear(w, i, amount) {
  const before = w.trail[i], after = clamp(before + amount, 0, 1);
  if (after === before) return;
  w.trail[i] = after;
  if (after > 0) w.trailActive.add(i); else w.trailActive.delete(i);
  if (trailLevel(after) !== trailLevel(before)) w.trailDirty.add(i);
}
// A footfall wears its own cell fully and the four around it by half, so busy paths end up a few pixels wide.
function stampTrail(w, x, y, amount) {
  const i = trailCell(w, x, y), cx = i % w.trailW;
  addWear(w, i, amount);
  if (cx > 0) addWear(w, i - 1, amount / 2);
  if (cx < w.trailW - 1) addWear(w, i + 1, amount / 2);
  if (i >= w.trailW) addWear(w, i - w.trailW, amount / 2);
  if (i + w.trailW < w.trail.length) addWear(w, i + w.trailW, amount / 2);
}
// Called as a Thrimp moves: wear is added once per cell entered, not per tick, so standing still doesn't dig a pit.
function walkWear(th, w) {
  const i = trailCell(w, th.x, th.y);
  if (i === th.trailCell) return;
  th.trailCell = i;
  stampTrail(w, th.x, th.y, TRAIL_STEP);
}
function decayTrails(w) {
  for (const i of [...w.trailActive]) addWear(w, i, -TRAIL_DECAY);
}

// Average wear along a straight walk, and what that walk costs once the wear discount is in.
function segmentWear(w, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(dist(x0, y0, x1, y1) / 6));
  let sum = 0;
  for (let k = 0; k <= n; k++) sum += wearAt(w, lerp(x0, x1, k / n), lerp(y0, y1, k / n));
  return sum / (n + 1);
}
const walkCost = (w, x0, y0, x1, y1) => dist(x0, y0, x1, y1) * (1 - TRAIL_DISCOUNT * segmentWear(w, x0, y0, x1, y1));
// Path-network edges get cheaper as their trail wears in. Refreshed hourly, and after the graph is rebuilt.
function updateTrailCosts(w) {
  const g = w.graph;
  for (const a of g.nodes) for (const e of a.edges) {
    if (e.to < a.i) continue;
    const b = g.nodes[e.to];
    e.cost = e.len * (1 - TRAIL_DISCOUNT * segmentWear(w, a.x, a.y, b.x, b.y));
    const back = b.edges.find(r => r.to === a.i);
    if (back) back.cost = e.cost;
  }
}

// A new world starts with faint, uneven trails between the places everyone already goes. After that it's up to them.
function seedTrails(w) {
  const wear = (from, to, strength) => {
    const r = findRoute(w, from.x, from.y, to.x, to.y);
    if (!r) return;
    let px = from.x, py = from.y;
    for (const p of r) {
      const n = Math.ceil(dist(px, py, p.x, p.y) / 3);
      for (let k = 0; k <= n; k++) stampTrail(w, lerp(px, p.x, k / n), lerp(py, p.y, k / n), strength * randRange(0.6, 1.2));
      px = p.x; py = p.y;
    }
  };
  const door = w.canteen.door;
  for (const b of w.buildings) if (b !== w.canteen) wear(b.door, door, randRange(0.15, 0.35));
  if (w.lumberyard) wear(w.lumberyard.drop, door, 0.3);
  for (const bush of w.bushes.filter((_, i) => i % 3 === 0)) wear({ x: bush.ix, y: bush.iy }, door, randRange(0.08, 0.2));
  updateTrailCosts(w);
}

// Paints changed cells into the trail overlay canvas (drawn over the ground, under everything else).
function paintTrails(w, budget = 600) {
  if (!w.trailCanvas) {
    w.trailCanvas = makeCanvas(MAP_W, MAP_H);
    w.trailCtx = w.trailCanvas.getContext('2d');
    w.trailCellImg = w.trailCtx.createImageData(TRAIL_CELL, TRAIL_CELL);
    for (const i of w.trailActive) w.trailDirty.add(i);
  }
  const img = w.trailCellImg, d = img.data, main = hexRgb(P.dirt[2]), fleck = hexRgb(P.dirt[3]);
  let done = 0;
  for (const i of w.trailDirty) {
    if (done++ >= budget) break;
    w.trailDirty.delete(i);
    const v = w.trail[i], x0 = (i % w.trailW) * TRAIL_CELL, y0 = Math.floor(i / w.trailW) * TRAIL_CELL;
    for (let py = 0; py < TRAIL_CELL; py++) for (let px = 0; px < TRAIL_CELL; px++) {
      const x = x0 + px, y = y0 + py, o = (py * TRAIL_CELL + px) * 4;
      // Dithered: light wear shows as scattered bare pixels, heavy wear as solid dirt with a few pale stones.
      const show = v > 0.12 + bayer(x, y) * 0.55 && !isWater(w, x, y);
      const c = v > 0.6 && bayer(x + 2, y + 1) > 0.88 ? fleck : main;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = show ? 255 : 0;
    }
    w.trailCtx.putImageData(img, x0, y0);
  }
}
