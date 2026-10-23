// ============================================================
// INPUT
// ============================================================
const keys = new Set();
let drag = null;
canvas.addEventListener('pointerdown', e => {
  drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  const w = screenToWorld(e.clientX, e.clientY);
  const th = thrimpAt(w.x, w.y);
  game.hovered = th ? th.id : 0;
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; cam.follow = false; canvas.classList.add('dragging'); }
  if (drag.moved) { cam.x = drag.cx - dx / cam.zoom; cam.y = drag.cy - dy / cam.zoom; }
});
canvas.addEventListener('pointerup', e => {
  if (drag && !drag.moved) {
    const w = screenToWorld(e.clientX, e.clientY);
    const th = thrimpAt(w.x, w.y);
    select(th ? th.id : 0);
  }
  drag = null;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('pointerleave', () => { game.hovered = 0; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const zs = CONFIG.ZOOMS, i = zs.indexOf(cam.zoom);
  const next = zs[clamp(i + (e.deltaY < 0 ? 1 : -1), 0, zs.length - 1)];
  if (next === cam.zoom) return;
  const before = screenToWorld(e.clientX, e.clientY);
  cam.zoom = next;
  const after = screenToWorld(e.clientX, e.clientY);
  if (!cam.follow) { cam.x += before.x - after.x; cam.y += before.y - after.y; }
}, { passive: false });
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setSpeed(game.speedIndex ? 0 : game.lastSpeed); }
  else if ('1234'.includes(k) && k.length === 1) setSpeed(+k);
  else if (k === 'g') game.debug = !game.debug;
  else if (k === 'f') { if (game.selected) { cam.follow = !cam.follow; updateUI(); } }
  else if (k === 'escape') select(0);
  else keys.add(k);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);
document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => { setSpeed(+b.dataset.speed); b.blur(); }));
$('i-close').addEventListener('click', () => select(0));
// The list is rebuilt five times a second, so react on pointerdown (a click could straddle a rebuild).
$('i-rels').addEventListener('pointerdown', e => {
  const li = e.target.closest('li');
  if (li) select(+li.dataset.id);
});
$('i-follow').addEventListener('click', e => { cam.follow = !cam.follow; updateUI(); e.currentTarget.blur(); });

function updateCamera(realDt) {
  const pan = 420 / cam.zoom * realDt;
  if (keys.has('arrowleft') || keys.has('a')) { cam.x -= pan; cam.follow = false; }
  if (keys.has('arrowright') || keys.has('d')) { cam.x += pan; cam.follow = false; }
  if (keys.has('arrowup') || keys.has('w')) { cam.y -= pan; cam.follow = false; }
  if (keys.has('arrowdown') || keys.has('s')) { cam.y += pan; cam.follow = false; }
  const th = cam.follow && world.thrimps.find(t => t.id === game.selected);
  if (th) {
    const home = th.hidden && world.byId.get(th.home);
    const tx = home ? home.x : th.x, ty = home ? home.y : th.y - 12;
    cam.x = lerp(cam.x, tx, Math.min(1, realDt * 5));
    cam.y = lerp(cam.y, ty, Math.min(1, realDt * 5));
  }
  const hw = viewW / 2 / cam.zoom, hh = viewH / 2 / cam.zoom;
  cam.x = hw * 2 >= MAP_W ? MAP_W / 2 : clamp(cam.x, hw, MAP_W - hw);
  cam.y = hh * 2 >= MAP_H ? MAP_H / 2 : clamp(cam.y, hh, MAP_H - hh);
}
