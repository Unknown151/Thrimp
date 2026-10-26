// ============================================================
// RENDER
// ============================================================
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
let dpr = 1, viewW = 0, viewH = 0;
const cam = { x: 0, y: 0, zoom: 2, follow: false };
const game = { speedIndex: 1, lastSpeed: 1, debug: false, selected: 0, hovered: 0, thing: null, jump: true, lastJump: -Infinity };
let world, sprites;

function resize() {
  dpr = window.devicePixelRatio || 1;
  viewW = window.innerWidth; viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr); canvas.height = Math.round(viewH * dpr);
}
const screenToWorld = (sx, sy) => ({ x: (sx - viewW / 2) / cam.zoom + cam.x, y: (sy - viewH / 2) / cam.zoom + cam.y });
const worldToScreen = (wx, wy) => ({ x: (wx - cam.x) * cam.zoom + viewW / 2, y: (wy - cam.y) * cam.zoom + viewH / 2 });

function darkness(h) {
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3;
  if (h >= 21 || h < 4.5) return 1;
  return 1 - (h - 4.5) / 2.5;
}
function shadow(x, y, rx, ry) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    ctx.fillRect(x - half, y + dy, half * 2 + 1, 1);
  }
}
function ring(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  for (let a = 0; a < 28; a++) {
    const t = a / 28 * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(t) * rx), Math.round(y + Math.sin(t) * ry), 1, 1);
  }
}
const blit = (s, x, y) => ctx.drawImage(s.img, Math.round(x) - s.ax, Math.round(y) - s.ay);
const thrimpPos = (th, alpha) => ({ x: Math.round(lerp(th.px, th.x, alpha)), y: Math.round(lerp(th.py, th.y, alpha)) });

function drawThrimp(th, alpha) {
  const { x, y } = thrimpPos(th, alpha);
  const s = withHair(thrimpSprite(th), hairOf(th)), height = s.ay - (s.top || 0);
  const bob = th.moving && !thrimpAnims.walk ? (Math.floor(th.stepPhase / 5) & 1) : 0; // placeholder bounce until the walk sheet loads
  const animated = th.working && thrimpAnims[th.working] && thrimpAnims[th.working][th.dir];
  const shake = th.working && !animated ? ((Math.floor(world.time * 3) & 1) ? 1 : -1) : 0; // stand-in where there's no action animation
  ctx.drawImage(s.img, x - s.ax + shake, y - s.ay - bob);
  if (th.carrying && th.pose !== 'sleep' && !th.asleep) { // lying down, the load rests beside them unseen
    if (th.carrying.kind === 'food') {
      const hx = x + (th.dir.includes('west') ? -6 : 3), hy = y - Math.round(height * 0.38) - bob;
      const basket = art('basket');
      if (basket) blit(basket, hx + 1, hy + 4);
      else {
        ctx.fillStyle = P.berry[0]; ctx.fillRect(hx, hy, 3, 2);
        ctx.fillStyle = P.berry[1]; ctx.fillRect(hx, hy, 1, 1); ctx.fillRect(hx + 2, hy, 1, 1);
      }
    } else if (th.carrying.kind === 'planks') drawPlanks(x - 4, y - height + 1 - bob);
    else if (th.carrying.kind === 'stone') drawStone(x - 2, y - Math.round(height * 0.4) - bob);
    else blit(sprites.log, x, y - height + 2 - bob); // balanced on the head, clear of the face
  }
}
// Small loads drawn by hand: a bundle of planks (carried on the head) and a block of stone (held in front).
function drawPlanks(x, y) {
  ctx.fillStyle = P.outline; ctx.fillRect(x - 1, y - 1, 10, 4);
  ctx.fillStyle = P.dirt[3]; ctx.fillRect(x, y, 8, 1); ctx.fillRect(x, y + 2, 8, 1);
  ctx.fillStyle = P.dirt[2]; ctx.fillRect(x, y + 1, 8, 1);
}
function drawStone(x, y) {
  ctx.fillStyle = P.outline; ctx.fillRect(x - 1, y - 1, 6, 5);
  ctx.fillStyle = '#8b9bb4'; ctx.fillRect(x, y, 4, 3);
  ctx.fillStyle = '#c0cbdc'; ctx.fillRect(x, y, 3, 1);
}
// Stock piled up where it's made: planks by the sawmill, cut stone by the quarry (one stack per few).
function drawStockpile(b) {
  const planks = b.type === 'sawmill', n = Math.min(8, Math.ceil((planks ? world.stock.planks : world.stock.stone) / 5));
  for (let i = 0; i < n; i++) {
    const col = i % 4, row = Math.floor(i / 4), x = Math.round(b.x + b.w / 2 + 4 + col * (planks ? 3 : 6)), y = Math.round(b.y - 2 - row * 4);
    if (planks) drawPlanks(x - 2, y - 2); else drawStone(x, y - 3);
  }
}
// The lumberyard's stock as two little pyramids of logs (3-2-1, ends facing us), beside the chopping block.
function drawWoodpile(b) {
  const log = art('log'), block = art('chopping-block');
  if (!log) {
    const logs = Math.min(30, Math.ceil(world.stock.wood / 2));
    for (let i = 0; i < logs; i++) {
      const pile = Math.floor(i / 10), k = i % 10, row = k < 4 ? 0 : k < 7 ? 1 : k < 9 ? 2 : 3;
      const inRow = [0, 4, 7, 9][row], col = k - inRow, rowLen = 4 - row;
      blit(sprites.log, b.x - 16 + pile * 14 + (col - (rowLen - 1) / 2) * 4 + 6, b.y - 2 - row * 4 - pile);
    }
  } else {
    const logs = Math.min(12, Math.ceil(world.stock.wood / 4));
    for (let i = 0; i < logs; i++) {
      const pile = Math.floor(i / 6), k = i % 6, row = k < 3 ? 0 : k < 5 ? 1 : 2;
      const col = k - [0, 3, 5][row], rowLen = 3 - row;
      blit(log, b.x - 30 + pile * 30 + (col - (rowLen - 1) / 2) * (log.width - 3), b.y - row * Math.round(log.height * 0.55));
    }
  }
  blit(block || sprites.block, b.x + 26, b.y + 2);
}
// What a site looks like: a hut by its stage art; anything else is its finished art, rising from the ground.
const siteArt = s => siteType(s) === 'hut' ? art(SITE_STAGES[siteStage(s)]) : art(s.p.look || BUILDING_TYPES[siteType(s)].art[0]);
// A building going up, with the delivered logs stacked beside it.
function drawSite(s) {
  const look = siteArt(s), old = s.upgradeOf && world.byId.get(s.upgradeOf);
  if (old && art(old.art)) blit(art(old.art), old.x, old.y); // an upgrade rises over the old building
  if (!look) { ctx.fillStyle = P.dirt[1]; ctx.fillRect(s.p.x - s.p.w / 2, s.p.y - s.p.h, s.p.w, s.p.h); }
  else if (siteType(s) === 'hut') blit(look, s.p.x, s.p.y);
  else {
    // Only the bottom rows so far, plus two scaffold poles a little taller than the work.
    const frac = Math.max(0.12, s.work / siteWork(s)), full = look.ay - (look.top || 0) + 1, vis = Math.round(full * frac);
    const x = Math.round(s.p.x) - look.ax, y = Math.round(s.p.y) - look.ay, y0 = look.ay + 1 - vis;
    ctx.drawImage(look.img, 0, y0, look.img.width, vis, x, y + y0, look.img.width, vis);
    ctx.fillStyle = P.dirt[0];
    const half = Math.round((look.width || 20) / 2) - 2, top = Math.round(s.p.y) - Math.min(full, vis + 6);
    for (const px of [s.p.x - half, s.p.x + half - 1]) ctx.fillRect(Math.round(px), top, 1, Math.round(s.p.y) - top);
  }
  const unused = Math.max(0, Math.round(s.woodIn - woodNeededFor(s, s.work)));
  for (let i = 0; i < Math.min(6, unused); i++) blit(sprites.log, s.p.x + s.p.w / 2 + 6, s.p.y - i * 3);
}
// The campfire is lit in the evening: a few flickering pixels of flame over its logs.
const fireLit = () => { const h = hourOf(world.time); return h >= 17.5 && h < 23.5; };
function drawFlames(b) {
  if (!fireLit()) return;
  const t = Math.floor(amb.t * 8);
  const cols = [P.light[0], P.light[1], P.light[2]];
  for (let i = 0; i < 6; i++) {
    const k = (t + i * 7) % 5, x = Math.round(b.x) - 2 + (i % 4), y = Math.round(b.y) - 6 - k;
    ctx.fillStyle = cols[(i + t) % 3];
    ctx.fillRect(x, y, 1, 1 + (k < 2 ? 1 : 0));
  }
}
// A fresh grave is bare earth with flowers; after a few days the grass has grown over it.
const graveArt = g => art(dayOf(world.time) - g.day >= 4 ? 'grave-old' : 'grave') || art('grave');
function emoteFor(th) {
  if (th.emote) return th.emote.icon;
  if (th.breaking) return '!';
  if (th.mood <= -20 && !th.asleep) return 'tear';
  if (th.needs.food < 0.12) return 'hungry';
  if (th.needs.rest < 0.1 && !th.asleep) return 'z';
  if (th.asleep && !th.hidden) return 'z';
  if (th.sick && Math.floor(world.time / 8 + th.id) % 2 === 0) return 'sick';
  if (th.working && th.working !== 'eat' && th.needs.rest < 0.3) return 'sweat';
  if (th.pose === 'sit' && !th.working && th.mood >= 15 && Math.floor(world.time / 6 + th.id) % 3 === 0) return 'note'; // humming
  return null;
}

function render(alpha) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.outline;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const z = cam.zoom * dpr;
  const tx = Math.round(canvas.width / 2 - cam.x * z), ty = Math.round(canvas.height / 2 - cam.y * z);
  ctx.setTransform(z, 0, 0, z, tx, ty);
  ctx.drawImage(world.ground, 0, 0);
  paintTrails(world);
  ctx.drawImage(world.trailCanvas, 0, 0);
  drawAmbienceGround();

  const hw = viewW / 2 / cam.zoom, hh = viewH / 2 / cam.zoom;
  const vx0 = cam.x - hw - 48, vx1 = cam.x + hw + 48, vy0 = cam.y - hh - 16, vy1 = cam.y + hh + 64;
  const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
  const list = [];

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const tr of world.trees) {
    if (!inView(tr.x, tr.y)) continue;
    if (tr.stump) { const s = art('stump') || sprites.stump; list.push({ y: tr.y, draw: () => blit(s, tr.x, tr.y) }); continue; }
    const s = art(tr.art) || sprites[tr.kind][tr.variant];
    shadow(tr.x, tr.y, Math.max(8, Math.round((s.width || 16) * 0.3)), 2);
    list.push({ y: tr.y, draw: () => drawSwaying(s, tr.x, tr.y, tr.x * 0.07) });
  }
  for (const b of world.bushes) {
    if (!inView(b.x, b.y)) continue;
    list.push({ y: b.y, draw: () => {
      const look = art(b.berries >= 2 ? 'bush-full' : 'bush-bare');
      if (look) { blit(look, b.x, b.y); return; }
      const s = sprites.bush;
      blit(s, b.x, b.y);
      const n = Math.floor(b.berries), ox = b.x - s.ax, oy = b.y - s.ay;
      for (let i = 0; i < n && i < s.berrySpots.length; i++) {
        const [bx, by] = s.berrySpots[i];
        ctx.fillStyle = P.berry[0]; ctx.fillRect(ox + bx, oy + by, 2, 2);
        ctx.fillStyle = P.berry[1]; ctx.fillRect(ox + bx, oy + by, 1, 1);
      }
    } });
  }
  for (const b of world.buildings) {
    if (!inView(b.x, b.y)) continue;
    if (b.type === 'lumberyard') {
      list.push({ y: b.y, draw: () => drawWoodpile(b) });
    } else {
      const s = art(b.art) || sprites[b.type];
      if (!s || world.sites.some(x => x.upgradeOf === b.id)) continue; // no art yet, or being rebuilt (the site draws it)
      list.push({ y: b.y, draw: () => {
        blit(s, b.x, b.y);
        if (b.type === 'campfire') drawFlames(b);
        if (b.type === 'sawmill' || b.type === 'quarry') drawStockpile(b);
      } });
    }
  }
  for (const s of world.sites) {
    if (!inView(s.p.x, s.p.y)) continue;
    list.push({ y: s.p.y, draw: () => drawSite(s) });
  }
  for (const o of world.outcrops || []) { // worked out, an outcrop is just a few rocks
    if (!inView(o.x, o.y)) continue;
    const s = o.stone >= 2 ? art(o.art) : art('rocks');
    if (s) list.push({ y: o.y, draw: () => blit(s, o.x, o.y) });
  }
  for (const g of world.graves) {
    if (!inView(g.x, g.y)) continue;
    const s = graveArt(g);
    if (s) list.push({ y: g.y, draw: () => blit(s, g.x, g.y) });
  }
  for (const t of world.tables) {
    if (!inView(t.x, t.y)) continue;
    const s = (t.broken && art('table-broken')) || art('table') || sprites.table;
    list.push({ y: t.y, draw: () => blit(s, t.x, t.y) });
  }
  if (inView(world.crate.x, world.crate.y)) {
    list.push({ y: world.crate.y, draw: () => {
      const look = art(world.crate.broken ? 'crate-broken' : world.stock.food >= 1 ? 'crate-full' : 'crate-empty');
      if (look) { blit(look, world.crate.x, world.crate.y); return; }
      const s = sprites.crate, ox = world.crate.x - s.ax, oy = world.crate.y - s.ay;
      blit(s, world.crate.x, world.crate.y);
      const n = Math.min(10, Math.ceil(world.stock.food / 3));
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? P.berry[0] : P.berry[1];
        ctx.fillRect(ox + 3 + (i % 5) * 2, oy + 1 - Math.floor(i / 5), 2, 1);
      }
    } });
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const th of world.thrimps) {
    if (th.hidden) continue;
    const p = thrimpPos(th, alpha);
    if (!inView(p.x, p.y)) continue;
    shadow(p.x, p.y, th.stage === 'child' ? 4 : 5, 1);
    // Someone seated on a side bench sits on it, so they're drawn after their table (benches included); the seat at
    // the far end stays behind the table.
    const bench = th.pose === 'sit' && world.seats.find(s => s.takenBy === th.id && s.face !== 'south');
    list.push({ y: bench ? bench.table.y + 1 : p.y + 0.5, draw: () => {
      if (th.id === game.selected) ring(p.x, p.y, 8, 3, P.light[1]);
      else if (th.id === game.hovered) ring(p.x, p.y, 8, 3, P.white);
      drawThrimp(th, alpha);
    } });
  }
  addAmbienceSprites(list, inView);
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.draw();

  // Emotes float above heads; a "z" hangs over any hut with sleepers.
  for (const th of world.thrimps) {
    const icon = !th.hidden && emoteFor(th);
    if (!icon) continue;
    const p = thrimpPos(th, alpha), s = thrimpSprite(th);
    blit(sprites.emotes[icon], p.x, p.y - (s.ay - (s.top || 0)) - 3);
  }
  for (const b of world.buildings) {
    if (!b.sleepers.length || !inView(b.x, b.y)) continue;
    const s = art(b.art) || sprites[b.type];
    blit(sprites.emotes.z, b.x + 10, b.y - (s.ay - (s.top || 0)) - 2 + Math.round(Math.sin(world.time / 6) * 1.5));
  }

  drawAmbienceAir(z, tx, ty);
  drawNight(z, tx, ty);
  drawAmbienceNight();
  if (game.debug) drawDebug();
  drawLabels(alpha);
}

function drawNight(z, tx, ty) {
  const h = hourOf(world.time), dk = darkness(h);
  if (dk <= 0) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = dk * 0.6;
  ctx.fillStyle = P.night;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.setTransform(z, 0, 0, z, tx, ty);
  // Lamplight spills out of the doorway of the canteen and of any hut with someone home in the evening.
  for (const b of world.buildings) {
    if (b.type === 'lumberyard') continue;
    const fire = b.type === 'campfire';
    const lit = fire ? fireLit() : b.type === 'canteen' || (b.sleepers.length > 0 && (h >= 17 || h < 0.5) && h < 23.5);
    if (!lit) continue;
    const cx = fire ? b.x : b.door.x, cy = fire ? b.y - 4 : b.door.y - 6;
    const r = fire ? 46 + Math.sin(amb.t * 9) * 2 : b.type === 'canteen' ? 34 : 24; // firelight flickers
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    grad.addColorStop(0, P.light[1]);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (fire ? 0.5 : 0.32) * dk;
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

function drawDebug() {
  const g = world.graph;
  ctx.fillStyle = 'rgba(228,59,68,0.28)';
  for (let cy = 0; cy < world.gh; cy++) for (let cx = 0; cx < world.gw; cx++)
    if (world.solid[cy * world.gw + cx]) ctx.fillRect(cx * CONFIG.CELL, cy * CONFIG.CELL, CONFIG.CELL, CONFIG.CELL);
  ctx.lineWidth = 1 / cam.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  for (const n of g.nodes) for (const e of n.edges) if (e.to > n.i) { ctx.moveTo(n.x, n.y); ctx.lineTo(g.nodes[e.to].x, g.nodes[e.to].y); }
  ctx.stroke();
  for (const n of g.nodes) { ctx.fillStyle = n.main ? '#ffffff' : '#e43b44'; ctx.fillRect(n.x - 1, n.y - 1, 2, 2); }
  const th = world.thrimps.find(t => t.id === game.selected);
  if (th && th.route && th.route.length) {
    ctx.strokeStyle = P.light[1];
    ctx.beginPath(); ctx.moveTo(th.x, th.y);
    for (const p of th.route) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

// Mood as a colour: red at breaking point, yellow around neutral, green when happy.
const MOOD_RED = hexRgb('#e43b44'), MOOD_YELLOW = hexRgb('#feae34'), MOOD_GREEN = hexRgb('#63c74d');
function moodColor(m) {
  const t = clamp((m + 32) / 57, 0, 1); // -32 (breaking) .. +25 (happy)
  const [a, b, f] = t < 0.56 ? [MOOD_RED, MOOD_YELLOW, t / 0.56] : [MOOD_YELLOW, MOOD_GREEN, (t - 0.56) / 0.44];
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], f))).join(',')})`;
}
// Every Thrimp out of doors wears a nameplate under its feet; the selected and hovered ones stand out.
function drawLabels(alpha) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.strokeStyle = P.outline;
  for (const th of world.thrimps) {
    if (th.hidden) continue;
    const p = thrimpPos(th, alpha), sp = worldToScreen(p.x, p.y + 4);
    if (sp.x < -60 || sp.x > viewW + 60 || sp.y < -20 || sp.y > viewH + 30) continue;
    const focus = th.id === game.selected || th.id === game.hovered;
    ctx.font = `bold ${focus ? 12 : 10}px ui-monospace, Consolas, monospace`;
    ctx.lineWidth = focus ? 4 : 3;
    ctx.fillStyle = moodColor(th.mood);
    ctx.strokeText(th.name, sp.x, sp.y + 10);
    ctx.fillText(th.name, sp.x, sp.y + 10);
    if (focus) { ctx.fillStyle = P.white; ctx.fillRect(sp.x - ctx.measureText(th.name).width / 2, sp.y + 13, ctx.measureText(th.name).width, 1); }
  }
}
