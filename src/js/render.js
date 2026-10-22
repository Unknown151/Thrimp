// ============================================================
// RENDER
// ============================================================
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
let dpr = 1, viewW = 0, viewH = 0;
const cam = { x: 0, y: 0, zoom: 2, follow: false };
const game = { speedIndex: 1, lastSpeed: 1, debug: false, selected: 0, hovered: 0 };
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
  const s = thrimpSprite(th), height = s.ay - (s.top || 0);
  const bob = th.moving && !thrimpAnims.walk ? (Math.floor(th.stepPhase / 5) & 1) : 0; // placeholder bounce until the walk sheet loads
  const shake = th.working ? ((Math.floor(world.time * 3) & 1) ? 1 : -1) : 0;
  ctx.drawImage(s.img, x - s.ax + shake, y - s.ay - bob);
  if (th.carrying) {
    if (th.carrying.kind === 'food') {
      const hx = x + (th.dir.includes('west') ? -6 : 3), hy = y - Math.round(height * 0.38) - bob;
      ctx.fillStyle = P.berry[0]; ctx.fillRect(hx, hy, 3, 2);
      ctx.fillStyle = P.berry[1]; ctx.fillRect(hx, hy, 1, 1); ctx.fillRect(hx + 2, hy, 1, 1);
    } else {
      blit(sprites.log, x, y - Math.round(height * 0.62) - bob);
    }
  }
}
function emoteFor(th) {
  if (th.emote) return th.emote.icon;
  if (th.needs.food < 0.12) return 'hungry';
  if (th.needs.rest < 0.1 && !th.asleep) return 'z';
  if (th.asleep && !th.hidden) return 'z';
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

  const hw = viewW / 2 / cam.zoom, hh = viewH / 2 / cam.zoom;
  const vx0 = cam.x - hw - 48, vx1 = cam.x + hw + 48, vy0 = cam.y - hh - 16, vy1 = cam.y + hh + 64;
  const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
  const list = [];

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const tr of world.trees) {
    if (!inView(tr.x, tr.y)) continue;
    if (tr.stump) { list.push({ y: tr.y, draw: () => blit(sprites.stump, tr.x, tr.y) }); continue; }
    shadow(tr.x, tr.y, 8, 2);
    const s = sprites[tr.kind][tr.variant];
    list.push({ y: tr.y, draw: () => blit(s, tr.x, tr.y) });
  }
  for (const b of world.bushes) {
    if (!inView(b.x, b.y)) continue;
    list.push({ y: b.y, draw: () => {
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
      list.push({ y: b.y, draw: () => {
        const logs = Math.min(30, Math.ceil(world.stock.wood / 2));
        for (let i = 0; i < logs; i++) {
          const pile = Math.floor(i / 10), k = i % 10, row = k < 4 ? 0 : k < 7 ? 1 : k < 9 ? 2 : 3;
          const inRow = [0, 4, 7, 9][row], col = k - inRow, rowLen = 4 - row;
          blit(sprites.log, b.x - 16 + pile * 14 + (col - (rowLen - 1) / 2) * 4 + 6, b.y - 2 - row * 4 - pile);
        }
        blit(sprites.block, b.x + 16, b.y + 2);
      } });
    } else {
      const s = sprites[b.type];
      list.push({ y: b.y, draw: () => blit(s, b.x, b.y) });
    }
  }
  for (const t of world.tables) if (inView(t.x, t.y)) list.push({ y: t.y, draw: () => blit(sprites.table, t.x, t.y) });
  if (inView(world.crate.x, world.crate.y)) {
    list.push({ y: world.crate.y, draw: () => {
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
    shadow(p.x, p.y, 5, 1);
    list.push({ y: p.y + 0.5, draw: () => {
      if (th.id === game.selected) ring(p.x, p.y, 8, 3, P.light[1]);
      else if (th.id === game.hovered) ring(p.x, p.y, 8, 3, P.white);
      drawThrimp(th, alpha);
    } });
  }
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
    if (b.sleepers.length && inView(b.x, b.y)) blit(sprites.emotes.z, b.x + 10, b.y - sprites[b.type].ay - 2 + Math.round(Math.sin(world.time / 6) * 1.5));
  }

  drawNight(z, tx, ty);
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
  const lights = [];
  for (const b of world.buildings) {
    const s = sprites[b.type];
    if (!s || !s.windows) continue;
    const lit = b.type === 'canteen' || (b.sleepers.length > 0 && (h >= 17 || h < 0.5) && h < 23.5);
    if (!lit) continue;
    for (const w of s.windows) lights.push({ x: b.x + w.x, y: b.y + w.y, w: w.w, h: w.h });
  }
  for (const L of lights) {
    const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 18);
    grad.addColorStop(0, P.light[1]);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 * dk;
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 18, cy - 18, 36, 36);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = dk;
    ctx.fillStyle = P.light[2];
    ctx.fillRect(L.x, L.y, L.w, L.h);
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

function drawLabels(alpha) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = P.outline;
  for (const id of new Set([game.selected, game.hovered])) {
    const th = id && world.thrimps.find(t => t.id === id);
    if (!th || th.hidden) continue;
    const p = thrimpPos(th, alpha);
    const sp = worldToScreen(p.x, p.y + 4);
    ctx.fillStyle = id === game.selected ? P.light[1] : P.white;
    ctx.strokeText(th.name, sp.x, sp.y + 10);
    ctx.fillText(th.name, sp.x, sp.y + 10);
  }
}
