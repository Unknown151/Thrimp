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
  processAlerts(now);
  updateCamera(realDt);
  render(clamp(acc / stepLen, 0, 1));
  if (now - lastUi > 200) { updateUI(); lastUi = now; }
  requestAnimationFrame(frame);
}

async function init() {
  resize();
  await loadObjectArt(); // building footprints and meadow props come from the art
  const saved = await fetchSave();
  if (saved) {
    try { world = restoreWorld(saved); } catch (e) { console.warn('Could not restore the save', e); }
    if (!world) {
      cloud.enabled = false; // keep the unreadable save safe until "New world" is chosen on purpose
      cloud.note = 'Couldn\'t read the saved colony: this is a fresh one (not saved)';
    }
  }
  if (!world) world = generateWorld();
  startAutosave();
  loadJumpSetting();
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
  get world() { return world; }, CONFIG, setSpeed, select, anims: thrimpAnims, art: objectArt,
  run(minutes) { // fast-forward the sim without rendering
    for (let i = Math.round(minutes / CONFIG.MIN_PER_TICK); i > 0; i--) {
      for (const th of world.thrimps) { th.px = th.x; th.py = th.y; }
      tick(world);
    }
  },
};
