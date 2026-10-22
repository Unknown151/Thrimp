// ============================================================
// MAIN LOOP: fixed-step simulation, decoupled from rendering
// ============================================================
let acc = 0, lastNow = 0, lastUi = 0;
function frame(now) {
  const realDt = Math.min(0.25, (now - lastNow) / 1000); // no catch-up after the tab was hidden
  lastNow = now;
  const stepLen = 1 / CONFIG.TICK_HZ;
  acc += realDt * CONFIG.SPEEDS[game.speedIndex];
  let steps = 0;
  while (acc >= stepLen && steps < CONFIG.MAX_STEPS_PER_FRAME) {
    for (const th of world.thrimps) { th.px = th.x; th.py = th.y; }
    tick(world);
    acc -= stepLen;
    steps++;
  }
  if (steps >= CONFIG.MAX_STEPS_PER_FRAME) acc = 0;
  updateCamera(realDt);
  render(clamp(acc / stepLen, 0, 1));
  if (now - lastUi > 200) { updateUI(); lastUi = now; }
  requestAnimationFrame(frame);
}

function init() {
  resize();
  world = generateWorld();
  sprites = buildSprites(P);
  for (const [name, src] of Object.entries(THRIMP_SHEETS)) loadThrimpSheet(name, src);
  world.ground = paintGround(world, P);
  cam.x = world.center.x;
  cam.y = world.center.y + 20;
  updateUI();
  lastNow = performance.now();
  requestAnimationFrame(frame);
}
init();
// Console handle for poking at the sim while developing (and for the tests in test/).
window.thrimp = {
  get world() { return world; }, CONFIG, setSpeed, select, anims: thrimpAnims,
  run(minutes) { // fast-forward the sim without rendering
    for (let i = Math.round(minutes / CONFIG.MIN_PER_TICK); i > 0; i--) {
      for (const th of world.thrimps) { th.px = th.x; th.py = th.y; }
      tick(world);
    }
  },
};
