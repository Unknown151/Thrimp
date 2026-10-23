// ============================================================
// TRAILS: an invisible wear map (data only, never drawn as tiles). Walking wears grass into dirt,
// worn ground is cheaper to walk so routes bend toward it, and paths nobody uses grow back.
// ============================================================
const TRAIL_CELL = 4;          // px per wear cell
const TRAIL_STEP = 0.05;       // wear a Thrimp adds to each cell it walks into
const TRAIL_DECAY = 0.012;     // wear lost per game hour: a fully worn path grows back in about 3.5 days
const TRAIL_DISCOUNT = 0.45;   // fully worn ground costs 45% less to walk
const TRAIL_LEVELS = 24;       // visual steps; a cell only causes a repaint when its step changes
const TRAIL_CHUNK = 16;        // px; the overlay is repainted in squares this size
const TRAIL_WOBBLE = 3;        // px the drawn path wanders off the worn line, so it meanders instead of ruling straight
const TRAIL_BLUR = 4;          // px reach of the blur applied before painting

function initTrails(w) {
  w.trailW = Math.ceil(MAP_W / TRAIL_CELL);
  w.trailH = Math.ceil(MAP_H / TRAIL_CELL);
  w.trail = new Float32Array(w.trailW * w.trailH);
  w.trailActive = new Set();   // cells with any wear, so decay only visits those
  w.trailDirty = new Set();    // overlay chunks whose look changed since the last repaint
}
const trailCell = (w, x, y) => clamp(Math.floor(y / TRAIL_CELL), 0, w.trailH - 1) * w.trailW + clamp(Math.floor(x / TRAIL_CELL), 0, w.trailW - 1);
const wearAt = (w, x, y) => w.trail[trailCell(w, x, y)];
const trailLevel = v => Math.min(TRAIL_LEVELS, Math.floor(v * TRAIL_LEVELS));

function addWear(w, i, amount) {
  const before = w.trail[i], after = clamp(before + amount, 0, 1);
  if (after === before) return;
  w.trail[i] = after;
  if (after > 0) w.trailActive.add(i); else w.trailActive.delete(i);
  if (trailLevel(after) !== trailLevel(before)) markTrailDirty(w, i);
}
// A cell's wear shows in every pixel that blends it in or wobbles onto it, so repaint the chunks around it too.
function markTrailDirty(w, i) {
  const reach = TRAIL_CELL + TRAIL_WOBBLE + TRAIL_BLUR + 1, cw = Math.ceil(MAP_W / TRAIL_CHUNK), ch = Math.ceil(MAP_H / TRAIL_CHUNK);
  const x = (i % w.trailW) * TRAIL_CELL, y = Math.floor(i / w.trailW) * TRAIL_CELL;
  const cx0 = Math.max(0, Math.floor((x - reach) / TRAIL_CHUNK)), cx1 = Math.min(cw - 1, Math.floor((x + TRAIL_CELL + reach) / TRAIL_CHUNK));
  const cy0 = Math.max(0, Math.floor((y - reach) / TRAIL_CHUNK)), cy1 = Math.min(ch - 1, Math.floor((y + TRAIL_CELL + reach) / TRAIL_CHUNK));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) w.trailDirty.add(cy * cw + cx);
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
      for (let k = 0; k <= n; k++) stampTrail(w, lerp(px, p.x, k / n), lerp(py, p.y, k / n), strength * randRange(0.9, 1.1));
      px = p.x; py = p.y;
    }
  };
  const door = w.canteen.door;
  for (const b of w.buildings) if (b !== w.canteen) wear(b.door, door, randRange(0.15, 0.35));
  if (w.lumberyard) wear(w.lumberyard.drop, door, 0.3);
  for (const bush of w.bushes.filter((_, i) => i % 3 === 0)) wear({ x: bush.ix, y: bush.iy }, door, randRange(0.08, 0.2));
  updateTrailCosts(w);
}

// Wear read smoothly between cell centres, so path edges curve instead of stepping in 4 px squares.
function wearSmooth(w, x, y) {
  const gx = clamp(x / TRAIL_CELL - 0.5, 0, w.trailW - 1.001), gy = clamp(y / TRAIL_CELL - 0.5, 0, w.trailH - 1.001);
  const i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j, t = w.trail, W = w.trailW, k = j * W + i;
  return lerp(lerp(t[k], t[k + 1], tx), lerp(t[k + W], t[k + W + 1], tx), ty);
}

// Paints changed chunks into the trail overlay canvas (drawn over the ground, under everything else).
function paintTrails(w, budget = 40) {
  if (!w.trailCanvas) {
    w.trailCanvas = makeCanvas(MAP_W, MAP_H);
    w.trailCtx = w.trailCanvas.getContext('2d');
    w.trailChunkImg = w.trailCtx.createImageData(TRAIL_CHUNK, TRAIL_CHUNK);
    w.trailNoise = makeNoise(mulberry32(w.seed ^ 0x7a11)); // its own rng: painting never touches the sim's
    w.trailCols = { rim: hexRgb(P.dirt[1]), dirt: hexRgb(P.dirt[2]), stone: hexRgb(P.dirt[3]) };
    for (const i of w.trailActive) markTrailDirty(w, i);
  }
  const img = w.trailChunkImg, d = img.data, n = w.trailNoise, c = w.trailCols, cw = Math.ceil(MAP_W / TRAIL_CHUNK);
  let done = 0;
  for (const k of w.trailDirty) {
    if (done++ >= budget) break;
    w.trailDirty.delete(k);
    const x0 = (k % cw) * TRAIL_CHUNK, y0 = Math.floor(k / cw) * TRAIL_CHUNK;
    for (let py = 0; py < TRAIL_CHUNK; py++) for (let px = 0; px < TRAIL_CHUNK; px++) {
      const x = x0 + px, y = y0 + py, o = (py * TRAIL_CHUNK + px) * 4;
      // Slow wobble bends straight walks into a meander; fine grain roughens the edge without dithering it.
      const ox = (n(x / 40, y / 40, 2) - 0.5) * 4 * TRAIL_WOBBLE, oy = (n(x / 40 + 31.7, y / 40 + 11.3, 2) - 0.5) * 4 * TRAIL_WOBBLE;
      // A small blur melts one-off detours (thin spurs that look like cracks) and leaves the real paths.
      const sx = x + ox, sy = y + oy, b = TRAIL_BLUR;
      const v = 0.4 * wearSmooth(w, sx, sy) + 0.15 * (wearSmooth(w, sx - b, sy) + wearSmooth(w, sx + b, sy)
        + wearSmooth(w, sx, sy - b) + wearSmooth(w, sx, sy + b)) + (n(x / 8, y / 8, 1) - 0.5) * 0.08;
      // Bare dirt with a thin darker rim, and pale stones where it's busiest.
      const col = v < 0.24 ? null : v < 0.29 ? c.rim
        : v > 0.7 && ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 29 === 0 ? c.stone : c.dirt;
      if (!col || isWater(w, x, y)) { d[o + 3] = 0; continue; }
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    w.trailCtx.putImageData(img, x0, y0);
  }
}
