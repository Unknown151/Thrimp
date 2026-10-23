// ============================================================
// THRIMP: needs, schedule, memory of recent activity
// ============================================================
function makeThrimp(world, x, y, homeId) {
  const traits = pickTraits();
  const shift = traits.reduce((s, t) => s + (TRAITS[t].schedule || 0), 0); // early risers and night owls
  return {
    id: world.nextId++, name: makeName(world.names),
    x, y, px: x, py: y,
    dir: 'south', moving: false, working: false, hidden: false, asleep: false, stepPhase: 0,
    speed: CONFIG.WALK_SPEED * randRange(0.85, 1.15),
    needs: { food: randRange(0.6, 0.9), rest: randRange(0.7, 0.95), fun: randRange(0.4, 0.9), social: randRange(0.5, 0.9) },
    schedule: { wake: clamp(randRange(5, 7.5) + shift, 4, 9.5), bed: clamp(randRange(21, 23.2) + shift, 19.5, 23.9) },
    likes: { forage: randRange(0.75, 1.25), chop: randRange(0.75, 1.25) },
    traits, thoughts: [], mood: 0, lowFor: 0, highFor: 0, inspiration: null, breaking: null, breaks: 0, nextMind: 0,
    opinions: {}, chemistry: {}, grudges: {}, memories: [], partner: 0, nextPerceive: randRange(0, PERCEIVE_EVERY), socialCooldown: 0,
    home: homeId,
    job: null, route: null, carrying: null,
    idleUntil: 0, nextCheck: 0, emote: null,
    recent: [],
  };
}
const isSleepTime = (th, h) => h >= th.schedule.bed || h < th.schedule.wake;
const isWorkTime = (th, h) => h >= th.schedule.wake + 1 && h < 18;
const isMealTime = h => (h >= 7 && h < 8.5) || (h >= 12 && h < 13.5) || (h >= 18 && h < 19.5);
const WORK_JOBS = new Set(['forage', 'chop', 'haul']);

function updateNeeds(th, dt) {
  const n = th.needs;
  n.food -= dt / (th.asleep ? 2200 : 1100);
  if (!th.asleep) n.rest -= dt / 1300 * (th.job && WORK_JOBS.has(th.job.type) ? 1.15 : 1);
  if (!th.asleep) n.fun -= dt / 1500;
  if (!th.asleep) n.social -= dt / (hasTrait(th, 'shy') ? 2600 : 1400); // the shy need company less
  n.food = clamp(n.food, 0, 1); n.rest = clamp(n.rest, 0, 1); n.fun = clamp(n.fun, 0, 1); n.social = clamp(n.social, 0, 1);
}
function remember(th, world, text) {
  const last = th.recent[0];
  if (last && last.text === text && world.time - last.time < 3 * HOUR) { last.time = world.time; return; }
  th.recent.unshift({ time: world.time, text });
  if (th.recent.length > 8) th.recent.pop();
}
function emote(th, world, icon, mins = 20) { th.emote = { icon, until: world.time + mins }; }
// Something the player would want to see (a fight, a breakdown...). The UI shows it and may slow time and pan over
// (ui.js); the simulation never waits for it. Not saved.
function raiseAlert(w, text, x, y, who = []) {
  if (!w.alerts) w.alerts = [];
  w.alerts.push({ text, x, y, who, time: w.time });
  if (w.alerts.length > 10) w.alerts.shift();
}
