// ============================================================
// AI: utility scoring picks a job; a job is a list of steps
// ============================================================
function goTo(x, y, label) {
  x = Math.round(x); y = Math.round(y);
  return {
    label,
    start(th, w) { const r = findRoute(w, th.x, th.y, x, y); if (!r) return 'fail'; th.route = r; },
    update(th, w) { return followRoute(th, w); },
    end(th) { th.route = null; th.moving = false; },
  };
}
function act(mins, label, o = {}) {
  let left = mins;
  return {
    label,
    start(th, w) { left = mins; return o.begin ? o.begin(th, w) : undefined; },
    update(th, w, dt) {
      left -= dt;
      const r = o.each ? o.each(th, w, dt) : undefined;
      if (r === 'fail') return 'fail';
      if (r === 'done' || left <= 0) { if (o.finish) o.finish(th, w); return true; }
      return false;
    },
    end(th, w) { if (o.end) o.end(th, w); },
  };
}
const job = (title, steps, extra = {}) => ({ title, steps, i: 0, started: false, ...extra });

function followRoute(th, w) {
  const r = th.route;
  if (!r || !r.length) { th.moving = false; return true; }
  let budget = th.speed * CONFIG.MIN_PER_TICK;
  if (th.needs.rest < 0.2) budget *= 0.8;
  if (th.needs.food < 0.1) budget *= 0.85;
  const start = budget;
  while (budget > 0 && r.length) {
    const p = r[0], dx = p.x - th.x, dy = p.y - th.y, d = Math.hypot(dx, dy);
    if (d > 0.01) th.dir = dirFromVec(dx, dy);
    if (d <= budget) { th.x = p.x; th.y = p.y; budget -= d; r.shift(); }
    else { th.x += dx / d * budget; th.y += dy / d * budget; budget = 0; }
  }
  th.stepPhase += start - budget;
  walkWear(th, w);
  th.moving = r.length > 0;
  return r.length === 0;
}
function dirFromVec(dx, dy) { return DIRS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]; }

const eat = (th, amount) => { th.needs.food = Math.min(1, th.needs.food + amount); };
function deposit(world, th) {
  if (!th.carrying) return;
  world.stock[th.carrying.kind === 'food' ? 'food' : 'wood'] += th.carrying.amount;
  th.carrying = null;
}
const freeSeats = world => world.seats.filter(s => !s.takenBy && !s.table.broken);
function claimSeat(world, th) {
  const free = freeSeats(world);
  if (!free.length) return null;
  const seat = pick(free);
  seat.takenBy = th.id;
  return seat;
}
function releaseSeat(world, th) { for (const s of world.seats) if (s.takenBy === th.id) s.takenBy = 0; }
function findBush(world, th, minBerries) {
  let best = null, bestScore = 0;
  for (const b of world.bushes) {
    if (b.berries < minBerries || (b.reservedBy && b.reservedBy !== th.id)) continue;
    const s = b.berries / (dist(th.x, th.y, b.x, b.y) + 120);
    if (s > bestScore) { bestScore = s; best = b; }
  }
  return best;
}
const releaseIfMine = (thing, th) => { if (thing && thing.reservedBy === th.id) thing.reservedBy = 0; };

function makeEatJob(th, w) {
  if (th.carrying && th.carrying.kind === 'food') {
    return job('Snacking on berries', [act(12, 'Eating berries', {
      finish: t => {
        const n = Math.min(2, t.carrying.amount);
        eat(t, 0.25 * n);
        t.carrying.amount -= n;
        if (t.carrying.amount <= 0) t.carrying = null;
      },
    })]);
  }
  if (w.stock.food >= 1) {
    const seat = claimSeat(w, th);
    const spot = seat || { x: w.canteen.door.x + randRange(-30, 30), y: w.canteen.door.y + randRange(30, 42) };
    return job('Going for a meal', [
      goTo(spot.x, spot.y, 'Walking to the canteen'),
      act(randRange(20, 30), 'Eating at the canteen', {
        begin: t => {
          if (w.stock.food < 1) return 'fail';
          t.portions = hasTrait(t, 'greedy') && w.stock.food >= 2 ? 2 : 1;
          w.stock.food -= t.portions;
          t.dir = seat ? seat.face : 'north';
        },
        finish: t => {
          eat(t, t.portions === 2 ? 0.9 : 0.65);
          addThought(t, w, t.portions === 2 ? 'big_meal' : 'ate_meal');
          if (!seat) addThought(t, w, 'ate_standing');
          const company = w.seats.filter(s => s.takenBy && s.takenBy !== t.id).length;
          if (hasTrait(t, 'shy') && company >= 3) addThought(t, w, 'crowded_table');
        },
      }),
    ], { cleanup: t => releaseSeat(w, t) });
  }
  const bush = findBush(w, th, 1);
  if (!bush) return null;
  bush.reservedBy = th.id;
  return job('Looking for something to eat', [
    goTo(bush.ix, bush.iy, 'Walking to a berry bush'),
    act(15, 'Eating wild berries', {
      begin: t => { if (bush.berries < 1) return 'fail'; t.dir = 'north'; t.working = 'gather'; },
      finish: t => { const n = Math.min(2, Math.floor(bush.berries)); bush.berries -= n; eat(t, 0.2 * n); addThought(t, w, 'ate_raw'); },
      end: t => { t.working = false; },
    }),
  ], { cleanup: t => releaseIfMine(bush, t) });
}

function makeSleepJob(th, w) {
  const home = w.byId.get(th.home);
  if (!home) {
    // Homeless: curl up near the canteen.
    const n = pick(nearbyMainNodes(w, w.canteen.x, w.canteen.y, 160));
    if (!n) return null;
    return job('Sleeping rough', [goTo(n.x, n.y, 'Looking for a place to lie down'), sleepStep(w, null)]);
  }
  return job('Going to bed', [goTo(home.door.x + randRange(-3, 3), home.door.y, 'Walking home'), sleepStep(w, home)]);
}
function sleepStep(w, home) {
  return {
    label: home ? 'Sleeping at home' : 'Sleeping on the ground',
    start(t) { t.asleep = true; t.sleptFor = 0; if (home) { t.hidden = true; home.sleepers.push(t.id); } },
    update(t, w2, dt) {
      t.needs.rest = Math.min(1, t.needs.rest + dt / 360);
      t.sleptFor += dt;
      if (t.needs.food < 0.15) { if (t.sleptFor > HOUR) addThought(t, w, 'woke_hungry'); return true; }
      return t.needs.rest >= 1 && !isSleepTime(t, hourOf(w.time));
    },
    end(t) {
      t.asleep = false;
      if (t.sleptFor > 3 * HOUR) addThought(t, w, home ? 'slept_home' : 'slept_rough');
      if (home) {
        t.hidden = false;
        home.sleepers = home.sleepers.filter(id => id !== t.id);
        t.x = t.px = home.door.x + randRange(-4, 4);
        t.y = t.py = home.door.y + 2;
        t.dir = 'south';
      }
    },
  };
}

function makeForageJob(th, w) {
  const bush = findBush(w, th, 2);
  if (!bush) return null;
  bush.reservedBy = th.id;
  let timer = 0;
  return job('Foraging berries', [
    goTo(bush.ix, bush.iy, 'Walking to a berry bush'),
    act(40, 'Picking berries', {
      begin: t => { t.working = 'gather'; t.dir = 'north'; },
      each: (t, w2, dt) => {
        timer += dt;
        const every = t.inspiration ? 4 : 6; // minutes per berry
        while (timer >= every && bush.berries >= 1) {
          timer -= every;
          bush.berries -= 1;
          if (!t.carrying) t.carrying = { kind: 'food', amount: 0 };
          t.carrying.amount++;
        }
        const have = t.carrying ? t.carrying.amount : 0;
        if (have >= 5) return 'done';
        if (bush.berries < 1) return have > 0 ? 'done' : 'fail';
      },
      end: t => { t.working = false; releaseIfMine(bush, t); },
    }),
    goTo(w.store.x + randRange(-5, 5), w.store.y + randRange(-1, 3), 'Carrying berries to the canteen'),
    act(3, 'Storing berries', { finish: t => { deposit(w, t); afterWork(t, w); } }),
  ], { cleanup: t => releaseIfMine(bush, t) });
}

function makeChopJob(th, w) {
  const yard = w.lumberyard;
  if (!yard) return null;
  let tree = null, best = Infinity;
  for (const tr of w.trees) {
    if (tr.stump || !tr.reachable || (tr.reservedBy && tr.reservedBy !== th.id)) continue;
    const s = dist(tr.x, tr.y, yard.x, yard.y) + 0.5 * dist(tr.x, tr.y, th.x, th.y);
    if (s < best) { best = s; tree = tr; }
  }
  if (!tree) return null;
  tree.reservedBy = th.id;
  return job('Chopping wood', [
    goTo(tree.ix, tree.iy, 'Walking to a tree'),
    act(th.inspiration ? 28 : 45, 'Chopping a tree', {
      begin: t => { if (tree.stump) return 'fail'; t.working = 'chop'; t.dir = tree.ix < tree.x ? 'east' : 'west'; },
      finish: t => {
        tree.wood--;
        if (tree.wood <= 0) { tree.stump = true; tree.regrowAt = w.time + 4 * DAY; }
        t.carrying = { kind: 'wood', amount: 2 };
      },
      end: t => { t.working = false; releaseIfMine(tree, t); },
    }),
    goTo(yard.drop.x + randRange(-8, 8), yard.drop.y + randRange(-1, 3), 'Hauling logs to the lumberyard'),
    act(3, 'Stacking logs', { finish: t => { deposit(w, t); afterWork(t, w); } }),
  ], { cleanup: t => releaseIfMine(tree, t) });
}

function makeHaulJob(th, w) {
  if (!th.carrying) return null;
  const food = th.carrying.kind === 'food';
  if (!food && !w.lumberyard) return null;
  const to = food ? w.store : w.lumberyard.drop;
  return job(food ? 'Bringing berries to the canteen' : 'Bringing logs to the lumberyard', [
    goTo(to.x + randRange(-5, 5), to.y + randRange(-1, 3), food ? 'Carrying berries' : 'Carrying logs'),
    act(3, 'Putting things away', { finish: t => deposit(w, t) }),
  ]);
}

function makeRelaxJob(th, w) {
  const options = [];
  if (w.shoreSpots.length) options.push({ weight: 2, where: 'by the water', spot: pick(w.shoreSpots) });
  if (freeSeats(w).length) options.push({ weight: hasTrait(th, 'shy') ? 0.4 : 1.5, where: 'at the canteen', seat: true });
  const n = pick(nearbyMainNodes(w, th.x, th.y, 260));
  if (n) options.push({ weight: 1, where: 'in the grass', spot: { x: n.x + randRange(-10, 10), y: n.y + randRange(-10, 10), face: pick(DIRS) } });
  const o = weightedPick(options, o => o.weight);
  if (!o) return null;
  const spot = o.seat ? claimSeat(w, th) : o.spot;
  return job('Taking it easy', [
    goTo(spot.x, spot.y, `Strolling to a spot ${o.where}`),
    act(randRange(30, 70), `Relaxing ${o.where}`, {
      begin: t => { t.dir = spot.face || t.dir; },
      each: (t, w2, dt) => { t.needs.fun = Math.min(1, t.needs.fun + dt / 60); if (t.needs.fun >= 1) return 'done'; },
      finish: t => addThought(t, w, o.seat ? 'relaxed_canteen' : o.where === 'by the water' ? 'relaxed_water' : 'relaxed_grass'),
    }),
  ], { cleanup: t => releaseSeat(w, t) });
}

function makeWanderJob(th, w) {
  const n = pick(nearbyMainNodes(w, th.x, th.y, hasTrait(th, 'curious') ? 340 : 160));
  if (!n) return null;
  return job('Wandering', [
    goTo(n.x + randRange(-12, 12), n.y + randRange(-12, 12), 'Wandering about'),
    act(randRange(5, 20), 'Looking around'),
  ]);
}

// Utility AI: every option scores itself; the best (with a little noise) wins.
const ACTIONS = [
  { id: 'eat', make: makeEatJob, score(th, w) {
    const f = th.needs.food;
    let s = f < 0.3 ? 1.25 - f : f < 0.6 ? 0.62 - f * 0.6 : 0;
    if (f < 0.8 && isMealTime(hourOf(w.time))) s += 0.3;
    return s;
  } },
  { id: 'sleep', make: makeSleepJob, score(th, w) {
    const r = th.needs.rest;
    if (isSleepTime(th, hourOf(w.time))) return 0.95 + (1 - r) * 0.3;
    return r < 0.2 ? 1.15 - r : 0;
  } },
  { id: 'haul', make: makeHaulJob, score: th => th.carrying ? 0.85 : 0 },
  { id: 'build', make: makeBuildJob, score(th, w) {
    if (!w.sites.some(s => s.work < HUT_WORK)) return 0;
    const own = w.sites.some(s => s.owners.includes(th.id));
    if (!isWorkTime(th, hourOf(w.time))) return own ? 0.25 : 0; // owners put in evenings too
    return (0.45 + (own ? 0.35 : 0)) * workDrive(th);
  } },
  { id: 'repair', make: makeRepairJob, score(th, w) {
    if (!isWorkTime(th, hourOf(w.time)) || w.stock.wood < REPAIR_WOOD || !brokenThings(w).length) return 0;
    return 0.6 * workDrive(th);
  } },
  { id: 'forage', make: makeForageJob, score(th, w) {
    if (!isWorkTime(th, hourOf(w.time))) return 0;
    const need = clamp(1 - w.stock.food / (w.thrimps.length * 4), 0, 1);
    return (0.32 + 0.5 * need) * th.likes.forage * workDrive(th);
  } },
  { id: 'chop', make: makeChopJob, score(th, w) {
    if (!isWorkTime(th, hourOf(w.time))) return 0;
    const need = clamp(1 - w.stock.wood / 40, 0, 1); // wood only goes to repairs so far: keep the stockpile modest
    return (0.18 + 0.35 * need) * th.likes.chop * workDrive(th);
  } },
  { id: 'relax', make: makeRelaxJob, score(th, w) {
    const s = (1 - th.needs.fun) * 0.75 * traitMult(th, 'relax');
    return isWorkTime(th, hourOf(w.time)) ? s * 0.7 : s + 0.3;
  } },
  { id: 'wander', make: makeWanderJob, score: th => 0.12 * traitMult(th, 'wander') },
  { id: 'socialize', make: makeSocializeJob, score(th, w) {
    const s = (1 - th.needs.social) * 0.7 * (hasTrait(th, 'shy') ? 0.5 : 1);
    return isWorkTime(th, hourOf(w.time)) ? s * 0.6 : s + 0.15;
  } },
];
const workDrive = th => traitMult(th, 'work') * (th.inspiration ? 1.4 : 1);

function chooseJob(th, w) {
  const scored = [];
  for (const a of ACTIONS) {
    const s = a.score(th, w);
    if (s > 0) scored.push({ a, s: s + rand() * 0.06 });
  }
  scored.sort((p, q) => q.s - p.s);
  while (scored.length) {
    const top = scored.slice(0, 2).filter(o => o.s > scored[0].s - 0.08);
    const o = weightedPick(top, o => o.s);
    const j = o.a.make(th, w);
    if (j) { startJob(th, w, j, o.a.id); return; }
    scored.splice(scored.indexOf(o), 1);
  }
}
function startJob(th, w, j, type) {
  j.type = type;
  th.job = j;
  remember(th, w, j.title);
}
function runJob(th, w, dt) {
  const j = th.job, step = j.steps[j.i];
  if (!j.started) {
    j.started = true;
    if (step.start && step.start(th, w) === 'fail') return finishJob(th, w, false);
  }
  const r = step.update(th, w, dt);
  if (th.job !== j) return; // the step started something else (a fight) and replaced this job
  if (r === 'fail') return finishJob(th, w, false);
  if (r === true) {
    if (step.end) step.end(th, w);
    if (th.job !== j) return;
    j.started = false;
    j.i++;
    if (j.i >= j.steps.length) finishJob(th, w, true);
  }
}
function finishJob(th, w, ok) {
  const j = th.job;
  if (!j) return;
  if (j.started) { const step = j.steps[j.i]; if (step && step.end) step.end(th, w); }
  if (j.cleanup) j.cleanup(th, w);
  th.job = null; th.route = null; th.moving = false; th.working = false;
  if (!ok) th.idleUntil = w.time + 3;
}
// Needs can cut a job short: hungry mid-shift means a detour to eat.
function checkInterrupts(th, w) {
  const type = th.job.type;
  if (type === 'eat' || type === 'sleep' || type === 'social' || w.time < th.nextCheck) return;
  th.nextCheck = w.time + 10;
  let next = null, nextType = '', why = '';
  if (th.needs.food < 0.12) { next = makeEatJob(th, w); nextType = 'eat'; why = 'Too hungry to keep going'; }
  else if (th.needs.rest < 0.05) { next = makeSleepJob(th, w); nextType = 'sleep'; why = 'Too exhausted to keep going'; }
  if (!next) return;
  finishJob(th, w, true);
  remember(th, w, why);
  emote(th, w, '!');
  startJob(th, w, next, nextType);
}

function updateThrimp(th, w, dt) {
  updateNeeds(th, dt);
  if (w.time >= th.nextMind) { th.nextMind = w.time + MIND_EVERY; refreshMind(th, w); }
  else th.mood = moodOf(th, w); // cheap, and keeps mood exact when a thought runs out between refreshes
  if (th.emote && th.emote.until < w.time) th.emote = null;
  if (th.job) checkInterrupts(th, w);
  if (!th.job) {
    if (th.idleUntil > w.time) return;
    chooseJob(th, w);
    if (!th.job) { th.idleUntil = w.time + 5; return; }
  }
  runJob(th, w, dt);
}

function tick(w) {
  const dt = CONFIG.MIN_PER_TICK;
  w.time += dt;
  w.tick++;
  for (const b of w.bushes) if (b.berries < b.max) b.berries = Math.min(b.max, b.berries + dt / 240);
  if (w.tick % 50 === 0) for (const tr of w.trees) if (tr.stump && w.time >= tr.regrowAt) { tr.stump = false; tr.wood = 3; }
  if (w.crate.broken && w.stock.food >= 1) w.stock.food = Math.max(0, w.stock.food - dt / 120); // spoiling in the open
  socialTick(w);
  if (w.tick % Math.round(HOUR / dt) === 0) { // hourly upkeep
    decayTrails(w);
    updateTrailCosts(w);
    planBuilding(w);
  }
  for (const th of w.thrimps) updateThrimp(th, w, dt);
}
