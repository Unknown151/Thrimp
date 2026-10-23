// ============================================================
// RNG + HELPERS
// ============================================================
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Every run is different (design pillar 5); the seed only exists so a save can rebuild the same world.
const SEED = crypto.getRandomValues(new Uint32Array(1))[0];
const rand = mulberry32(SEED);
const randRange = (a, b) => a + rand() * (b - a);
const randInt = (a, b) => Math.floor(randRange(a, b + 1));
const pick = arr => arr[Math.floor(rand() * arr.length)];
const chance = p => rand() < p;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const hexRgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const rectsOverlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

function weightedPick(items, weightFn) {
  let total = 0;
  const ws = items.map(it => { const w = Math.max(0, weightFn(it)); total += w; return w; });
  if (total <= 0) return null;
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

const hourOf = t => (t / HOUR) % 24;
const dayOf = t => Math.floor(t / DAY) + 1;
function fmtClock(t) {
  const m = Math.floor(t) % DAY;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function periodName(h) {
  return h < 5 ? 'Night' : h < 7 ? 'Dawn' : h < 11 ? 'Morning' : h < 14 ? 'Midday'
    : h < 18 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
}

function makeNoise(rand) { // takes its own rng, so terrain can be rebuilt from a saved seed
  const perm = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const vals = Float32Array.from({ length: 256 }, () => rand());
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  const s = t => t * t * (3 - 2 * t);
  function value(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = s(x - ix), fy = s(y - iy);
    return lerp(lerp(h(ix, iy), h(ix + 1, iy), fx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), fx), fy);
  }
  return (x, y, octaves = 3) => {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += value(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
}

// Smooth scalar fields sampled on a coarse grid and read back bilinearly.
const FIELD_STEP = 4;
function makeField(fn) {
  const fw = Math.ceil(MAP_W / FIELD_STEP) + 2, fh = Math.ceil(MAP_H / FIELD_STEP) + 2;
  const data = new Float32Array(fw * fh);
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) data[j * fw + i] = fn(i * FIELD_STEP, j * FIELD_STEP);
  return { fw, fh, data };
}
function sampleField(f, x, y) {
  const gx = clamp(x / FIELD_STEP, 0, f.fw - 1.001), gy = clamp(y / FIELD_STEP, 0, f.fh - 1.001);
  const i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j, d = f.data, w = f.fw;
  return lerp(lerp(d[j * w + i], d[j * w + i + 1], tx), lerp(d[(j + 1) * w + i], d[(j + 1) * w + i + 1], tx), ty);
}

class MinHeap {
  constructor() { this.items = []; this.pri = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const it = this.items, pr = this.pri;
    let i = it.length; it.push(item); pr.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= p) break;
      it[i] = it[parent]; pr[i] = pr[parent]; i = parent;
    }
    it[i] = item; pr[i] = p;
  }
  pop() {
    const it = this.items, pr = this.pri, top = it[0];
    const lastI = it.pop(), lastP = pr.pop(), n = it.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && pr[c + 1] < pr[c]) c++;
        if (pr[c] >= lastP) break;
        it[i] = it[c]; pr[i] = pr[c]; i = c;
      }
      it[i] = lastI; pr[i] = lastP;
    }
    return top;
  }
}
