// ============================================================
// AMBIENCE: life that only decorates: butterflies, birds, fireflies, fish rings, rain, fog, cloud shadows,
// chimney smoke, leaves and wind in the trees. Pure looks: it never touches the simulation and uses Math.random,
// not the sim's rng. The weather itself is decided in weather.js; this only shows it.
// ============================================================
const arand = (a, b) => a + Math.random() * (b - a);
const amb = { world: null, t: 0, wind: 0.3, rain: 0, cloud: 0, fog: 0, butterflies: [], flocks: [], flying: [],
  ripples: [], drops: [], splashes: [], smoke: [], leaves: [], fireflies: [], clouds: [], fogCanvas: null,
  nextFlock: 0, nextGround: 0, nextRipple: 0, nextSmoke: 0, nextLeaf: 0 };
const CHIMNEYS = { 'hut-b': [10, -42] }; // chimney top relative to the hut's anchor, measured from the art
const BIRD = { body: '#733e39', head: '#3e2731', beak: '#feae34', wing: '#b86f50' };

function viewRect(margin = 0) {
  const hw = viewW / 2 / cam.zoom + margin, hh = viewH / 2 / cam.zoom + margin;
  return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
}
const inRect = (r, x, y) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
function openGround(r) { // a random dry, unblocked spot inside r
  for (let i = 0; i < 20; i++) {
    const x = arand(Math.max(4, r.x0), Math.min(MAP_W - 4, r.x1)), y = arand(Math.max(4, r.y0), Math.min(MAP_H - 4, r.y1));
    if (!isWater(world, x, y) && !isBlocked(world, x, y)) return { x, y };
  }
  return null;
}
function waterSpot(r) {
  for (let i = 0; i < 24; i++) {
    const x = arand(Math.max(4, r.x0), Math.min(MAP_W - 4, r.x1)), y = arand(Math.max(4, r.y0), Math.min(MAP_H - 4, r.y1));
    if (isWater(world, x, y) && isWater(world, x - 6, y) && isWater(world, x + 6, y)) return { x, y };
  }
  return null;
}

function resetAmbience() {
  Object.assign(amb, { world, butterflies: [], flocks: [], flying: [], ripples: [], drops: [], splashes: [], smoke: [],
    leaves: [], fireflies: [], clouds: [], fogCanvas: null });
  amb.butterflies = (world.flowerSpots || []).filter(() => Math.random() < 0.5).map(f => ({
    ax: f.x, ay: f.y, x: f.x, y: f.y, tx: f.x, ty: f.y, h: 8, ph: arand(0, 6), col: pick(P.flower) }));
  if (world.weather) { amb.wind = world.weather.wind; amb.rain = isRaining(world) ? 1 : 0; }
}

// Called every frame with real seconds. Paused means frozen; fast speeds are capped so critters don't go frantic.
function updateAmbience(realDt) {
  if (amb.world !== world) resetAmbience();
  const dt = realDt * Math.min(3, CONFIG.SPEEDS[game.speedIndex]);
  if (!dt) return;
  amb.t += dt;
  const wx = world.weather || { kind: 'clear', wind: 0.3 }, h = hourOf(world.time), day = h >= 6.5 && h < 19.5;
  const ease = k => Math.min(1, dt * k);
  amb.wind = lerp(amb.wind, wx.wind, ease(0.3));
  amb.rain = lerp(amb.rain, wx.kind === 'rain' ? 1 : 0, ease(0.4));
  amb.cloud = lerp(amb.cloud, wx.kind === 'rain' ? 1 : wx.kind === 'cloudy' ? 0.75 : 0.2, ease(0.3));
  amb.fog = lerp(amb.fog, wx.kind === 'fog' ? 1 : 0, ease(0.25));
  const r = viewRect(40), wet = amb.rain > 0.3;

  // Butterflies flit between points around their flowers, by day and when dry.
  for (const b of amb.butterflies) {
    if (dist(b.x, b.y, b.tx, b.ty) < 2) { b.tx = b.ax + arand(-16, 16); b.ty = b.ay + arand(-10, 10); }
    const d = dist(b.x, b.y, b.tx, b.ty) || 1, sp = 10 * dt;
    b.x += (b.tx - b.x) / d * Math.min(d, sp) + Math.sin(amb.t * 7 + b.ph) * 0.3;
    b.y += (b.ty - b.y) / d * Math.min(d, sp);
    b.h = 9 + Math.sin(amb.t * 3 + b.ph) * 3;
  }

  // Little flocks pecking at the ground; they take off when a Thrimp comes close, or the rain starts.
  if (day && !wet && amb.t > amb.nextGround && amb.flocks.length < 3) {
    amb.nextGround = amb.t + arand(20, 50);
    const at = openGround(viewRect(-30));
    if (at && !world.thrimps.some(t => !t.hidden && dist(t.x, t.y, at.x, at.y) < 60)) {
      const n = Math.floor(arand(3, 6));
      amb.flocks.push({ x: at.x, y: at.y, leaveAt: amb.t + arand(40, 90), birds: Array.from({ length: n }, () => ({
        x: at.x + arand(-10, 10), y: at.y + arand(-6, 6), dir: Math.random() < 0.5 ? -1 : 1, peck: 0, hopT: arand(0, 2) })) });
    }
  }
  for (const f of amb.flocks) {
    const scare = world.thrimps.find(t => !t.hidden && dist(t.x, t.y, f.x, f.y) < 30);
    if (scare || wet || !day || amb.t > f.leaveAt) {
      const fx = scare ? scare.x : f.x - 1, fy = scare ? scare.y : f.y + 1;
      for (const b of f.birds) {
        const a = Math.atan2(b.y - fy, b.x - fx) + arand(-0.5, 0.5);
        amb.flying.push({ x: b.x, y: b.y, z: 0, vx: Math.cos(a) * arand(30, 45), vy: Math.sin(a) * 20 - 8, vz: arand(18, 26), ph: arand(0, 6), life: 6 });
      }
      f.gone = true;
      continue;
    }
    for (const b of f.birds) {
      b.hopT -= dt; b.peck = Math.max(0, b.peck - dt);
      if (b.hopT <= 0) {
        b.hopT = arand(0.4, 2.5);
        if (Math.random() < 0.5) b.peck = 0.3;
        else { if (Math.random() < 0.3) b.dir = -b.dir; b.x += b.dir * arand(1, 3); b.y += arand(-1, 1); }
      }
    }
  }
  amb.flocks = amb.flocks.filter(f => !f.gone);
  // A skein of birds now and then, high overhead.
  if (day && !wet && amb.t > amb.nextFlock) {
    amb.nextFlock = amb.t + arand(25, 70);
    const v = viewRect(0), fromLeft = Math.random() < 0.5, y = arand(v.y0, v.y1 - 40), n = Math.floor(arand(4, 8));
    const vx = (fromLeft ? 1 : -1) * arand(40, 55), vy = arand(-8, 8);
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      amb.flying.push({ x: (fromLeft ? v.x0 - 30 : v.x1 + 30) - Math.sign(vx) * row * 7, y: y + side * row * 5, z: 60, vx, vy, vz: 0, ph: i, life: 40, high: true });
    }
  }
  for (const b of amb.flying) { b.x += b.vx * dt; b.y += b.vy * dt; b.z = Math.min(b.high ? 60 : 50, b.z + b.vz * dt); b.life -= dt; }
  amb.flying = amb.flying.filter(b => b.life > 0 && inRect(viewRect(120), b.x, b.y) && (day || !b.high)); // flocks roost at dusk

  // Rings where a fish rose; in rain the whole water surface prickles.
  if (amb.t > amb.nextRipple) {
    amb.nextRipple = amb.t + (wet ? 0.04 : arand(0.8, 2.5));
    const at = waterSpot(r);
    if (at) amb.ripples.push({ x: Math.round(at.x), y: Math.round(at.y), age: 0, life: wet ? 0.7 : 1.8, size: wet ? 3 : arand(5, 8) });
  }
  for (const p of amb.ripples) p.age += dt;
  amb.ripples = amb.ripples.filter(p => p.age < p.life);

  // Rain: drops fall through the view and splash where they land.
  const want = Math.round(amb.rain * Math.min(800, (r.x1 - r.x0) * (r.y1 - r.y0) / 700));
  while (amb.drops.length < want) amb.drops.push({ x: arand(r.x0, r.x1), y: arand(r.y0, r.y1), z: arand(0, 90) });
  if (amb.drops.length > want) amb.drops.length = want;
  const fall = 150 * dt, drift = (20 + amb.wind * 50) * dt;
  for (const d of amb.drops) {
    d.z -= fall; d.x += drift;
    if (d.z <= 0) {
      if (!isWater(world, d.x, d.y)) amb.splashes.push({ x: Math.round(d.x), y: Math.round(d.y), age: 0 });
      d.x = arand(r.x0, r.x1); d.y = arand(r.y0, r.y1); d.z = arand(60, 90);
    }
  }
  for (const s of amb.splashes) s.age += dt;
  amb.splashes = amb.splashes.filter(s => s.age < 0.15);

  // Chimney smoke when someone's home, and over breakfast and supper.
  if (amb.t > amb.nextSmoke) {
    amb.nextSmoke = amb.t + 0.5;
    const cooking = (h >= 6 && h < 9) || (h >= 17 && h < 22);
    for (const b of world.buildings) {
      const c = CHIMNEYS[b.art];
      if (!c || !inRect(r, b.x, b.y)) continue;
      const home = world.thrimps.some(t => t.home === b.id && (t.hidden || cooking));
      if (home) amb.smoke.push({ x: b.x + c[0] + arand(-0.5, 0.5), y: b.y + c[1], age: 0, life: arand(3, 5) });
    }
  }
  for (const s of amb.smoke) { s.age += dt; s.y -= 6 * dt; s.x += (2 + amb.wind * 10) * dt; }
  amb.smoke = amb.smoke.filter(s => s.age < s.life);

  // Leaves torn off by a strong wind.
  if (amb.wind > 0.45 && amb.t > amb.nextLeaf) {
    amb.nextLeaf = amb.t + arand(0.2, 1.2) / amb.wind;
    const trees = world.trees.filter(t => !t.stump && inRect(r, t.x, t.y));
    const tr = trees.length && pick(trees);
    if (tr) amb.leaves.push({ x: tr.x + arand(-10, 10), y: tr.y, z: arand(18, 30), ph: arand(0, 6), col: pick([P.grass[2], P.grass[3], P.flower[0]]), age: 0 });
  }
  for (const l of amb.leaves) {
    l.age += dt; l.x += (8 + amb.wind * 25) * dt + Math.sin(amb.t * 4 + l.ph) * 0.4;
    l.z = Math.max(0, l.z - 6 * dt);
  }
  amb.leaves = amb.leaves.filter(l => l.age < (l.z > 0 ? 12 : 14));

  // Fireflies on warm, dry nights.
  const night = darkness(h) > 0.5 && !wet;
  const flies = night ? 40 : 0;
  while (amb.fireflies.length < flies) { const at = openGround(r); if (!at) break; amb.fireflies.push({ ...at, ph: arand(0, 6), vx: 0, vy: 0 }); }
  if (amb.fireflies.length > flies) amb.fireflies.length = flies;
  for (const f of amb.fireflies) {
    f.vx = clamp(f.vx + arand(-6, 6) * dt, -4, 4); f.vy = clamp(f.vy + arand(-6, 6) * dt, -4, 4);
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (!inRect(r, f.x, f.y)) { const at = openGround(r); if (at) Object.assign(f, at); }
  }

  // Cloud shadows drift with the wind across whatever is in view.
  if (!amb.clouds.length) for (let i = 0; i < 7; i++) amb.clouds.push(makeCloud(arand(r.x0 - 200, r.x1), arand(r.y0 - 100, r.y1)));
  for (const c of amb.clouds) {
    c.x += (3 + amb.wind * 12) * dt;
    if (c.x - c.w > r.x1 + 60) Object.assign(c, makeCloud(r.x0 - c.w * 2 - arand(0, 120), arand(r.y0 - 100, r.y1)));
    if (c.y > r.y1 + 150 || c.y + c.h < r.y0 - 150) c.y = arand(r.y0 - 100, r.y1);
  }
}

// One cloud's shadow: a crisp-edged blob of overlapping circles, drawn once into its own little canvas.
function makeCloud(x, y) {
  const w = Math.round(arand(90, 190)), h = Math.round(w * arand(0.4, 0.6)), c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#181425';
  for (let i = 0; i < 6; i++) {
    const rr = arand(h * 0.25, h * 0.5), cx = arand(rr, w - rr), cy = arand(rr, h - rr);
    g.beginPath(); g.arc(Math.round(cx), Math.round(cy), Math.round(rr), 0, Math.PI * 2); g.fill();
  }
  return { x, y, w, h, c };
}

// Swaying tops: in a wind, the upper part of a tree shifts a pixel while the trunk stays planted.
function drawSwaying(s, x, y, seed) {
  const dx = Math.round(Math.sin(amb.t * (1.2 + amb.wind) + seed) * amb.wind * 1.5);
  x = Math.round(x); y = Math.round(y);
  if (!dx) { ctx.drawImage(s.img, x - s.ax, y - s.ay); return; }
  const W = s.img.width, H = s.img.height, cut = Math.round(s.ay - (s.ay - (s.top || 0)) * 0.4);
  ctx.drawImage(s.img, 0, cut, W, H - cut, x - s.ax, y - s.ay + cut, W, H - cut);
  ctx.drawImage(s.img, 0, 0, W, cut, x - s.ax + dx, y - s.ay, W, cut);
}

// Ground level, before the y-sorted things: fish rings, rain splashes, and the shadows of birds overhead.
function drawAmbienceGround() {
  for (const p of amb.ripples) {
    const k = p.age / p.life, rx = Math.max(1, Math.round(1 + k * p.size));
    ctx.globalAlpha = 0.8 * (1 - k);
    ring(p.x, p.y, rx, Math.max(1, Math.round(rx * 0.45)), P.water[2]);
  }
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = P.water[2];
  for (const s of amb.splashes) { ctx.fillRect(s.x - 1, s.y - 1, 1, 1); ctx.fillRect(s.x + 1, s.y - 1, 1, 1); }
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#181425';
  for (const b of amb.flying) ctx.fillRect(Math.round(b.x + b.z * 0.4) - 1, Math.round(b.y + b.z * 0.6), 3, 1);
  ctx.globalAlpha = 1;
}
// Things that stand among the scenery join the y-sorted draw list.
function addAmbienceSprites(list, inView) {
  const h = hourOf(world.time), day = h >= 6.5 && h < 19.5 && amb.rain < 0.3;
  if (day) for (const b of amb.butterflies) {
    if (!inView(b.x, b.y)) continue;
    list.push({ y: b.y, draw: () => {
      const x = Math.round(b.x), y = Math.round(b.y - b.h), open = Math.floor(amb.t * 14 + b.ph) & 1;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, Math.round(b.y), 1, 1);
      ctx.fillStyle = b.col;
      if (open) { ctx.fillRect(x - 2, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2); ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); }
      else { ctx.fillRect(x - 1, y - 2, 1, 2); ctx.fillRect(x + 1, y - 2, 1, 2); }
      ctx.fillStyle = P.outline; ctx.fillRect(x, y, 1, 1);
    } });
  }
  for (const f of amb.flocks) for (const b of f.birds) {
    if (!inView(b.x, b.y)) continue;
    list.push({ y: b.y, draw: () => {
      const x = Math.round(b.x), y = Math.round(b.y);
      ctx.fillStyle = BIRD.body; ctx.fillRect(x - 1, y - 2, 3, 2);
      ctx.fillStyle = BIRD.head; ctx.fillRect(x + b.dir * 2, y - (b.peck > 0 ? 2 : 3), 1, 1);
      ctx.fillStyle = BIRD.beak; ctx.fillRect(x + b.dir * 3, y - (b.peck > 0 ? 1 : 3), 1, 1);
      ctx.fillStyle = BIRD.wing; ctx.fillRect(x - b.dir, y - 2, 1, 1);
    } });
  }
}
// Above everything: flying birds, smoke, leaves, rain, cloud shadows, fog and the sky's colour.
function drawAmbienceAir(z, tx, ty) {
  for (const b of amb.flying) {
    const x = Math.round(b.x), y = Math.round(b.y - b.z), up = Math.floor(amb.t * 8 + b.ph) & 1;
    const inner = up ? -1 : 0, outer = up ? -2 : 1; // wings up: a "v"; wings down: a "^"
    ctx.fillStyle = b.high ? P.outline : BIRD.body;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x - 1, y + inner, 1, 1); ctx.fillRect(x + 1, y + inner, 1, 1);
    ctx.fillRect(x - 2, y + outer, 1, 1); ctx.fillRect(x + 2, y + outer, 1, 1);
  }
  for (const s of amb.smoke) {
    const k = s.age / s.life, rr = Math.round(1 + k * 2.5);
    ctx.globalAlpha = 0.55 * (1 - k);
    ctx.fillStyle = '#c0cbdc';
    ctx.fillRect(Math.round(s.x) - rr + 1, Math.round(s.y) - rr, rr * 2 - 1, rr * 2);
    ctx.fillRect(Math.round(s.x) - rr, Math.round(s.y) - rr + 1, rr * 2 + 1, rr * 2 - 2);
  }
  ctx.globalAlpha = 1;
  for (const l of amb.leaves) {
    ctx.globalAlpha = l.z > 0 ? 1 : Math.max(0, 1 - (l.age - 12) / 2);
    ctx.fillStyle = l.col;
    ctx.fillRect(Math.round(l.x), Math.round(l.y - l.z), (Math.floor(amb.t * 6 + l.ph) & 1) + 1, 1);
  }
  ctx.globalAlpha = 1;
  if (amb.drops.length) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#c0cbdc';
    const lean = Math.round(amb.wind * 2);
    for (const d of amb.drops) {
      const x = Math.round(d.x), y = Math.round(d.y - d.z);
      ctx.fillRect(x, y, 1, 3); ctx.fillRect(x - lean, y - 3, 1, 3);
    }
    ctx.globalAlpha = 1;
  }
  if (amb.cloud > 0.05) {
    ctx.globalAlpha = 0.13 * amb.cloud;
    for (const c of amb.clouds) ctx.drawImage(c.c, Math.round(c.x), Math.round(c.y));
    ctx.globalAlpha = 1;
  }
  // Screen-wide light: grey under rain clouds, warm around sunrise and sunset.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const grey = 0.06 * Math.max(0, amb.cloud - 0.2) + 0.14 * amb.rain;
  if (grey > 0.01) { ctx.globalAlpha = grey; ctx.fillStyle = '#3a4466'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const h = hourOf(world.time), warm = Math.max(0, 1 - Math.abs(h - 19) / 1.5, 1 - Math.abs(h - 6) / 1.2) * (1 - amb.rain * 0.7);
  if (warm > 0.01) { ctx.globalAlpha = 0.16 * warm; ctx.fillStyle = '#f77622'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.globalAlpha = 1;
  if (amb.fog > 0.02) drawFog(z, tx, ty);
  ctx.setTransform(z, 0, 0, z, tx, ty);
}
// Fog: a soft, slowly drifting veil (deliberately smooth: mist has no hard edges).
function drawFog(z, tx, ty) {
  if (!amb.fogCanvas) {
    const fw = Math.ceil(MAP_W / 8), fh = Math.ceil(MAP_H / 8), c = makeCanvas(fw, fh), g = c.getContext('2d');
    const img = g.createImageData(fw, fh), n = makeNoise(mulberry32(Math.floor(Math.random() * 1e9)));
    const fog = hexRgb('#c0cbdc');
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const o = (y * fw + x) * 4, v = clamp((n(x / 18, y / 18, 3) - 0.35) * 2.2, 0, 1);
      img.data[o] = fog[0]; img.data[o + 1] = fog[1]; img.data[o + 2] = fog[2]; img.data[o + 3] = Math.round(v * 255);
    }
    g.putImageData(img, 0, 0);
    amb.fogCanvas = c;
  }
  ctx.setTransform(z, 0, 0, z, tx, ty);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.55 * amb.fog;
  const drift = (amb.t * 3) % MAP_W;
  ctx.drawImage(amb.fogCanvas, drift, 0, MAP_W, MAP_H);
  ctx.drawImage(amb.fogCanvas, drift - MAP_W, 0, MAP_W, MAP_H);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
// After the night falls: fireflies glow through the dark.
function drawAmbienceNight() {
  if (!amb.fireflies.length) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = P.flower[0];
  for (const f of amb.fireflies) {
    const glow = clamp(Math.sin(amb.t * 1.7 + f.ph) * 1.6 + 0.4, 0, 1); // mostly lit, now and then dark
    if (glow < 0.05) continue;
    const x = Math.round(f.x), y = Math.round(f.y - 6);
    ctx.globalAlpha = 0.18 * glow; ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.globalAlpha = 0.6 * glow; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
    ctx.globalAlpha = glow; ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
