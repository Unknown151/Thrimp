// ============================================================
// SPRITES: procedural placeholders until the PixelLab art pass
// ============================================================
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function addOutline(c, color) {
  const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  const W = c.width, H = c.height, [r, gg, b] = hexRgb(color), mark = [];
  const solid = i => d[i * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (solid(i)) continue;
    if ((x > 0 && solid(i - 1)) || (x < W - 1 && solid(i + 1)) || (y > 0 && solid(i - W)) || (y < H - 1 && solid(i + W))) mark.push(i);
  }
  for (const i of mark) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}
function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y) + 0.3);
    g.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}
// A sprite is a canvas plus the pixel that sits on the object's world position.
const sprite = (img, ax, ay, extra = {}) => ({ img, ax, ay, ...extra });

function drawHouse(P, w, h, roofH, windowXs, sign) {
  const cw = w + 12, ch = h + roofH - 1, x0 = 6, yW = ch - h;
  const c = makeCanvas(cw, ch), g = c.getContext('2d');
  g.fillStyle = P.wall[1]; g.fillRect(x0, yW, w, h);
  g.fillStyle = P.wall[0];
  for (let y = yW + 3; y < ch; y += 4) g.fillRect(x0, y, w, 1);
  g.fillRect(x0, yW, 1, h); g.fillRect(x0 + w - 1, yW, 1, h);
  const dw = 10, dh = Math.min(18, h - 8), dx = Math.floor(cw / 2 - dw / 2);
  g.fillStyle = P.wall[0]; g.fillRect(dx - 1, ch - dh - 1, dw + 2, dh + 1);
  g.fillStyle = P.roof[0]; g.fillRect(dx, ch - dh, dw, dh);
  g.fillStyle = P.roof[1]; g.fillRect(dx + Math.floor(dw / 2), ch - dh, 1, dh);
  g.fillStyle = P.light[1]; g.fillRect(dx + dw - 3, ch - Math.ceil(dh / 2), 1, 1);
  const windows = [];
  for (const wx of windowXs) {
    const x = x0 + wx, y = yW + 8, ww = 8, wh = 7;
    g.fillStyle = P.wall[0]; g.fillRect(x - 1, y - 1, ww + 2, wh + 2);
    g.fillStyle = P.night; g.fillRect(x, y, ww, wh);
    g.fillStyle = P.wall[0]; g.fillRect(x + ww / 2, y, 1, wh); g.fillRect(x, y + 3, ww, 1);
    windows.push({ x: x - Math.floor(cw / 2), y: y - ch, w: ww, h: wh });
  }
  if (sign) {
    const sx = Math.floor(cw / 2) - 7, sy = ch - dh - 9;
    g.fillStyle = P.wall[0]; g.fillRect(sx, sy, 14, 7);
    g.fillStyle = P.wall[2]; g.fillRect(sx + 1, sy + 1, 12, 5);
    g.fillStyle = P.berry[1]; g.fillRect(sx + 5, sy + 2, 1, 1); g.fillRect(sx + 7, sy + 2, 1, 1);
    g.fillStyle = P.dirt[1]; g.fillRect(sx + 3, sy + 3, 8, 1); g.fillRect(sx + 4, sy + 4, 6, 1);
  }
  for (let r = 0; r < roofH; r++) {
    const rw = Math.round(lerp(w * 0.5, w + 10, r / (roofH - 1))), rx = Math.round(cw / 2 - rw / 2);
    let col = r % 3 === 2 ? P.roof[1] : P.roof[2];
    if (r === 0) col = P.roof[1];
    if (r >= roofH - 2) col = P.roof[0];
    g.fillStyle = col; g.fillRect(rx, 1 + r, rw, 1);
  }
  addOutline(c, P.outline);
  return sprite(c, Math.floor(cw / 2), ch, { windows });
}
function drawTable(P) {
  const c = makeCanvas(22, 10), g = c.getContext('2d');
  g.fillStyle = P.wall[2]; g.fillRect(1, 1, 20, 3);
  g.fillStyle = P.wall[0]; g.fillRect(1, 4, 20, 1); g.fillRect(2, 5, 2, 4); g.fillRect(18, 5, 2, 4);
  addOutline(c, P.outline);
  return sprite(c, 11, 9);
}
function drawCrate(P) {
  const c = makeCanvas(16, 12), g = c.getContext('2d');
  g.fillStyle = P.dirt[2]; g.fillRect(1, 2, 14, 9);
  g.fillStyle = P.dirt[1]; g.fillRect(1, 5, 14, 1); g.fillRect(1, 8, 14, 1); g.fillRect(1, 2, 1, 9); g.fillRect(14, 2, 1, 9);
  addOutline(c, P.outline);
  return sprite(c, 8, 11);
}
function drawLog(P) {
  const c = makeCanvas(13, 6), g = c.getContext('2d');
  g.fillStyle = P.bark[1]; g.fillRect(1, 1, 10, 4);
  g.fillStyle = P.bark[0]; g.fillRect(1, 4, 10, 1);
  g.fillStyle = P.dirt[3]; g.fillRect(10, 1, 2, 4);
  g.fillStyle = P.dirt[2]; g.fillRect(11, 2, 1, 2);
  addOutline(c, P.outline);
  return sprite(c, 6, 5);
}
function drawStump(P) {
  const c = makeCanvas(10, 8), g = c.getContext('2d');
  g.fillStyle = P.bark[1]; g.fillRect(1, 2, 8, 5);
  g.fillStyle = P.bark[0]; g.fillRect(1, 2, 1, 5);
  g.fillStyle = P.dirt[3]; g.fillRect(2, 1, 6, 2);
  addOutline(c, P.outline);
  return sprite(c, 5, 7);
}
function drawChopBlock(P) {
  const c = makeCanvas(14, 14), g = c.getContext('2d');
  g.fillStyle = P.bark[1]; g.fillRect(2, 7, 9, 6);
  g.fillStyle = P.dirt[3]; g.fillRect(3, 6, 7, 2);
  g.fillStyle = P.bark[0]; g.fillRect(9, 1, 1, 7);   // axe handle
  g.fillStyle = P.stone[1]; g.fillRect(10, 1, 3, 3); // axe head
  addOutline(c, P.outline);
  return sprite(c, 6, 13);
}
function drawOak(P, rng) {
  const c = makeCanvas(28, 36), g = c.getContext('2d');
  g.fillStyle = P.bark[1]; g.fillRect(12, 22, 4, 13);
  g.fillStyle = P.bark[0]; g.fillRect(12, 22, 1, 13); g.fillRect(11, 34, 6, 1);
  const blobs = [[14, 14, 9], [8 + Math.floor(rng() * 2), 17, 6], [20 - Math.floor(rng() * 2), 17, 6], [14, 8, 6]];
  for (const [x, y, r] of blobs) disc(g, x, y, r, P.leaf[0]);
  for (const [x, y, r] of blobs) disc(g, x - 1, y - 1, r - 1, P.leaf[1]);
  for (const [x, y, r] of blobs) disc(g, x - 2, y - 3, Math.max(1, r - 4), P.leaf[2]);
  g.fillStyle = P.leaf[3];
  for (let i = 0; i < 5; i++) g.fillRect(8 + Math.floor(rng() * 10), 5 + Math.floor(rng() * 8), 1, 1);
  addOutline(c, P.outline);
  return sprite(c, 14, 35);
}
function drawPine(P, rng) {
  const c = makeCanvas(24, 40), g = c.getContext('2d');
  g.fillStyle = P.bark[1]; g.fillRect(11, 32, 3, 7);
  g.fillStyle = P.bark[0]; g.fillRect(11, 32, 1, 7);
  for (let L = 0; L < 4; L++) {
    const top = 2 + L * 7 + Math.floor(rng() * 2), hgt = 11, maxHalf = 4 + L * 2;
    for (let r = 0; r <= hgt; r++) {
      const half = Math.round(lerp(1, maxHalf, r / hgt));
      g.fillStyle = P.leaf[1]; g.fillRect(12 - half, top + r, half * 2 + 1, 1);
      g.fillStyle = P.leaf[2]; g.fillRect(12 - half, top + r, Math.max(1, half - 1), 1);
      g.fillStyle = P.leaf[0]; g.fillRect(12 + half - 1, top + r, 2, 1);
    }
  }
  addOutline(c, P.outline);
  return sprite(c, 12, 39);
}
function drawBush(P) {
  const c = makeCanvas(18, 13), g = c.getContext('2d');
  for (const [x, y, r] of [[9, 7, 5], [5, 8, 3], [13, 8, 3]]) disc(g, x, y, r, P.leaf[0]);
  for (const [x, y, r] of [[9, 6, 4], [5, 7, 2], [13, 7, 2]]) disc(g, x, y, r, P.leaf[1]);
  disc(g, 7, 4, 2, P.leaf[2]);
  addOutline(c, P.outline);
  return sprite(c, 9, 12, { berrySpots: [[6, 5], [10, 3], [12, 7], [8, 8], [3, 7], [11, 5]] });
}
const EMOTE_ICONS = {
  '!': ['..#..', '..#..', '..#..', '.....', '..#..'],
  z: ['#####', '...#.', '..#..', '.#...', '#####'],
  hungry: ['.....', '#...#', '#####', '.###.', '.....'],
  note: ['..##.', '..#.#', '..#..', '###..', '##...'],
  tear: ['..#..', '.###.', '#####', '#####', '.###.'],
  heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  anger: ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
  chat: ['.....', '.....', '#.#.#', '.....', '.....'],
  idea: ['.###.', '#...#', '#...#', '.###.', '..#..'],
  sweat: ['..#..', '..#..', '.###.', '.###.', '..#..'],
  rain: ['.###.', '#####', '.....', '#.#.#', '.#.#.'],
  sick: ['..#..', '.#.#.', '.#.#.', '.###.', '.###.'],
};
function drawEmote(P, rows, color) {
  const c = makeCanvas(11, 11), g = c.getContext('2d');
  g.fillStyle = P.white; g.fillRect(1, 2, 9, 7); g.fillRect(2, 1, 7, 9);
  g.fillStyle = color;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') g.fillRect(3 + x, 3 + y, 1, 1); }));
  addOutline(c, P.outline);
  return sprite(c, 5, 10);
}
function drawPlaceholderThrimp(P, back) {
  const c = makeCanvas(14, 22), g = c.getContext('2d');
  g.fillStyle = P.dirt[1]; g.fillRect(3, 11, 8, 7);
  g.fillStyle = P.skin; g.fillRect(3, 3, 8, 8);
  g.fillStyle = P.dirt[0]; g.fillRect(3, 2, 8, back ? 7 : 3);
  if (!back) { g.fillStyle = P.outline; g.fillRect(5, 7, 1, 1); g.fillRect(8, 7, 1, 1); }
  g.fillStyle = P.dirt[0]; g.fillRect(4, 18, 2, 3); g.fillRect(8, 18, 2, 3);
  addOutline(c, P.outline);
  return sprite(c, 7, 21, { top: 1 });
}
function buildSprites(P) {
  const rng = mulberry32(0x7472696d); // fixed, so tree shapes are the same every run
  return {
    hut: drawHouse(P, 54, 30, 32, [7, 39]),
    canteen: drawHouse(P, 100, 38, 40, [10, 30, 62, 82], true),
    table: drawTable(P), crate: drawCrate(P), log: drawLog(P), block: drawChopBlock(P),
    oak: [drawOak(P, rng), drawOak(P, rng)], pine: [drawPine(P, rng), drawPine(P, rng)],
    stump: drawStump(P), bush: drawBush(P),
    emotes: {
      '!': drawEmote(P, EMOTE_ICONS['!'], P.berry[0]),
      z: drawEmote(P, EMOTE_ICONS.z, P.water[1]),
      hungry: drawEmote(P, EMOTE_ICONS.hungry, P.dirt[1]),
      note: drawEmote(P, EMOTE_ICONS.note, P.grass[2]),
      tear: drawEmote(P, EMOTE_ICONS.tear, P.water[1]),
      heart: drawEmote(P, EMOTE_ICONS.heart, P.berry[1]),
      anger: drawEmote(P, EMOTE_ICONS.anger, P.berry[0]),
      chat: drawEmote(P, EMOTE_ICONS.chat, P.outline),
      idea: drawEmote(P, EMOTE_ICONS.idea, P.light[1]),
      sweat: drawEmote(P, EMOTE_ICONS.sweat, P.water[1]),
      rain: drawEmote(P, EMOTE_ICONS.rain, P.water[0]),
      sick: drawEmote(P, EMOTE_ICONS.sick, P.berry[0]),
    },
    placeholder: { front: drawPlaceholderThrimp(P, false), back: drawPlaceholderThrimp(P, true) },
  };
}

// PixelLab character animations, cut from sheets into one sprite per frame: thrimpAnims.walk.east[3].
const thrimpAnims = {};
function opaqueRows(c) {
  try {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let top = -1, bottom = -1, left = c.width, right = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 0) {
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    return bottom >= 0 ? { top, bottom, left, right } : null; // null: an empty cell
  } catch (e) { return undefined; } // opened from file:// the canvas is tainted; assume a full frame
}

// PixelLab object art, anchored at the bottom centre of its drawn pixels (where it meets the ground).
const objectArt = {};
const art = name => name && objectArt[name];
function loadObjectArt() {
  return Promise.all(OBJECT_ART.map(name => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = makeCanvas(img.width, img.height);
      c.getContext('2d').drawImage(img, 0, 0);
      const b = opaqueRows(c) || { top: 0, bottom: img.height - 1, left: 0, right: img.width - 1 };
      objectArt[name] = sprite(c, Math.round((b.left + b.right) / 2), b.bottom,
        { top: b.top, width: b.right - b.left + 1, height: b.bottom - b.top + 1 });
      resolve();
    };
    img.onerror = () => resolve(); // missing art: the procedural placeholder stays
    img.src = `assets/objects/${name}.png`;
  })));
}
// A sheet may leave rows or trailing cells empty: an animation made for only some directions, or fewer frames.
function loadThrimpSheet(name, src) {
  const img = new Image();
  img.onload = () => {
    const size = img.height / SHEET_DIRS.length, cols = Math.round(img.width / size), anim = {};
    SHEET_DIRS.forEach((dir, row) => {
      const frames = [];
      for (let col = 0; col < cols; col++) {
        const c = makeCanvas(size, size);
        c.getContext('2d').drawImage(img, col * size, row * size, size, size, 0, 0, size, size);
        const rows = opaqueRows(c);
        if (rows !== null) frames.push({ c, rows });
      }
      if (!frames.length) return;
      // One baseline per direction (the lowest foot in any frame) so feet stay planted while walking.
      const bottom = Math.max(...frames.map(f => f.rows ? f.rows.bottom : size - 1));
      const top = Math.min(...frames.map(f => f.rows ? f.rows.top : 0));
      anim[dir] = frames.map(f => sprite(f.c, Math.floor(size / 2), bottom, { top }));
    });
    thrimpAnims[name] = anim;
  };
  img.src = src;
}
// Hair colour is painted in code, so one set of art covers every family, and every elder goes grey. The art's hair
// highlights are #262b44 (used nowhere else); its dark hair shares #181425 with the outline, so only dark pixels that
// touch a highlight and aren't on the sprite's edge count as hair.
const HAIR = {
  black: null, brown: ['#b86f50', '#733e39'], ginger: ['#d77643', '#be4a2f'], blond: ['#fee761', '#feae34'],
  plum: ['#b55088', '#68386c'], grey: ['#c0cbdc', '#8b9bb4'],
};
const hairCache = new WeakMap(); // frame sprite -> { colour: recoloured sprite }
function withHair(s, hair) {
  const cols = HAIR[hair];
  if (!cols || !s) return s;
  let m = hairCache.get(s);
  if (!m) hairCache.set(s, m = {});
  return m[hair] || (m[hair] = recolorHair(s, cols));
}
function recolorHair(s, [hi, base]) {
  try {
    const W = s.img.width, H = s.img.height, c = makeCanvas(W, H), g = c.getContext('2d');
    g.drawImage(s.img, 0, 0);
    const img = g.getImageData(0, 0, W, H), d = img.data, src = new Uint8ClampedArray(d);
    const is = (x, y, r, gg, b) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] >= 128
      && src[(y * W + x) * 4] === r && src[(y * W + x) * 4 + 1] === gg && src[(y * W + x) * 4 + 2] === b;
    const empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || src[(y * W + x) * 4 + 3] < 128;
    const HI = hexRgb(hi), BASE = hexRgb(base);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let to = null;
      if (is(x, y, 0x26, 0x2b, 0x44)) to = HI;
      else if (is(x, y, 0x18, 0x14, 0x25) && !empty(x - 1, y) && !empty(x + 1, y) && !empty(x, y - 1) && !empty(x, y + 1)) {
        for (let dy = -1; dy <= 1 && !to; dy++) for (let dx = -1; dx <= 1 && !to; dx++) if (is(x + dx, y + dy, 0x26, 0x2b, 0x44)) to = BASE;
      }
      if (to) { d[o] = to[0]; d[o + 1] = to[1]; d[o + 2] = to[2]; }
    }
    g.putImageData(img, 0, 0);
    return { ...s, img: c };
  } catch (e) { return s; } // a tainted canvas (opened from file://): keep the original look
}
const hairOf = th => th.stage === 'elder' ? 'grey' : th.hair;
// Frames for an animation facing `dir`, or the nearest side it was made for: gestures and seated eating exist only
// facing south, east, north and west, so a Thrimp facing south-east uses the east frames.
function animFacing(name, dir) {
  const a = thrimpAnims[name];
  if (!a) return null;
  return a[dir] || a[dir.split('-')[1]] || a[dir.split('-')[0]] || null;
}
function thrimpSprite(th) {
  // Children have their own small sprite: walking, or standing (they don't sit at tables or work).
  if (th.stage === 'child' && thrimpAnims['child-idle']) {
    const cw = th.moving && animFacing('child-walk', th.dir);
    if (cw) return cw[Math.floor(th.stepPhase / CONFIG.WALK_PX_PER_FRAME) % cw.length];
    const ci = animFacing('child-idle', th.dir);
    if (ci) return ci[Math.floor(world.time / CONFIG.IDLE_MIN_PER_FRAME + th.id * 1.7) % ci.length];
  }
  const walk = th.moving && thrimpAnims.walk && thrimpAnims.walk[th.dir];
  if (walk) return walk[Math.floor(th.stepPhase / CONFIG.WALK_PX_PER_FRAME) % walk.length];
  const gesture = th.gesture && animFacing(th.gesture.anim, th.dir);
  if (gesture) return gesture[Math.floor(Math.max(0, world.time - th.gesture.start) / CONFIG.ACTION_MIN_PER_FRAME * 2) % gesture.length];
  const working = th.working === 'eat' && th.pose === 'sit' ? 'sit-eat' : th.working;
  const action = working && animFacing(working, th.dir);
  if (action) return action[Math.floor(world.time / CONFIG.ACTION_MIN_PER_FRAME + th.id * 1.3) % action.length];
  const still = th.asleep && !th.hidden ? 'sleep' : th.pose;
  const pose = still && animFacing(still, th.dir);
  if (pose) return pose[0];
  const idle = thrimpAnims.idle && thrimpAnims.idle[th.dir];
  if (idle) return idle[Math.floor(world.time / CONFIG.IDLE_MIN_PER_FRAME + th.id * 1.7) % idle.length]; // offset per Thrimp so they don't breathe in unison
  return th.dir.startsWith('north') ? sprites.placeholder.back : sprites.placeholder.front;
}
