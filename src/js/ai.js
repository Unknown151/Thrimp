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
  if (th.gesture) { th.moving = false; return false; } // stopped to wave; walks on when it's done
  let budget = th.speed * CONFIG.MIN_PER_TICK * paceOf(th);
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
      begin: t => { t.working = 'eat'; },
      end: t => { t.working = false; },
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
          t.working = 'eat';
          if (seat) t.pose = 'sit';
        },
        end: t => { t.working = false; t.pose = null; },
        finish: t => {
          eat(t, t.portions === 2 ? 0.9 : 0.65);
          addThought(t, w, t.portions === 2 ? 'big_meal' : 'ate_meal');
          if (!seat) { addThought(t, w, 'ate_standing'); w.standingMeals = (w.standingMeals || 0) + 1; } // enough of these and someone builds a table
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
      begin: t => { if (bush.berries < 1) return 'fail'; t.dir = 'north'; t.working = 'eat'; },
      finish: t => { const n = Math.min(2, Math.floor(bush.berries)); bush.berries -= n; eat(t, 0.2 * n); addThought(t, w, 'ate_raw'); },
      end: t => { t.working = false; },
    }),
  ], { cleanup: t => releaseIfMine(bush, t) });
}

function makeSleepJob(th, w) {
  const healer = th.sick && buildingOf(w, 'healer');
  if (healer) return job('Going to the healer\'s', [goTo(healer.door.x + randRange(-3, 3), healer.door.y, 'Walking to the healer\'s hut'), sleepStep(w, healer)]);
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
  const healer = home && home.type === 'healer';
  return {
    label: healer ? 'Resting at the healer\'s hut' : home ? 'Sleeping at home' : 'Sleeping on the ground',
    start(t) {
      t.asleep = true; t.sleptFor = 0;
      if (home) { t.hidden = true; home.sleepers.push(t.id); }
      if (healer && t.sick) {
        t.inHealer = true;
        if (!t.sick.treated) { t.sick.treated = true; t.sick.until = w.time + (t.sick.until - w.time) * 0.6; } // care shortens it
      }
    },
    update(t, w2, dt) {
      t.needs.rest = Math.min(1, t.needs.rest + dt / 360);
      t.sleptFor += dt;
      if (t.needs.food < 0.15) { if (t.sleptFor > HOUR) addThought(t, w, 'woke_hungry'); return true; }
      return t.needs.rest >= 1 && !isSleepTime(t, hourOf(w.time)) && !t.sick; // the sick stay in bed
    },
    end(t) {
      t.asleep = false;
      t.inHealer = false;
      if (t.sleptFor > 3 * HOUR && !healer) addThought(t, w, home ? 'slept_home' : 'slept_rough');
      if (home) {
        t.hidden = false;
        home.sleepers = home.sleepers.filter(id => id !== t.id);
        t.x = t.px = home.door.x + randRange(-4, 4);
        t.y = t.py = home.door.y + 2;
        t.dir = 'south';
      }
      if (t.sleptFor > 3 * HOUR) gesture(t, w, 'stretch', 4); // up, and a good stretch
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
  const options = [], wet = isRaining(w) ? 0.15 : 1; // nobody lounges by the lake in the rain
  if (w.shoreSpots.length) options.push({ weight: 2 * wet, where: 'by the water', spot: pick(w.shoreSpots) });
  if (freeSeats(w).length) options.push({ weight: hasTrait(th, 'shy') ? 0.4 : 1.5, where: 'at the canteen', seat: true });
  const n = pick(nearbyMainNodes(w, th.x, th.y, 260));
  if (n) options.push({ weight: wet, where: 'in the grass', spot: { x: n.x + randRange(-10, 10), y: n.y + randRange(-10, 10), face: pick(DIRS) } });
  const grave = lovedGrave(th, w); // sitting a while with someone they've lost
  if (grave) options.push({ weight: 0.5 * wet, where: `by ${grave.name}'s grave`, grave: true, spot: { x: grave.x + randRange(-8, 8), y: grave.y + 9, face: 'north' } });
  const stone = grave && buildingOf(w, 'memorial'); // the memorial stone, for anyone who has lost someone
  if (stone) options.push({ weight: 0.8 * wet, where: 'by the memorial stone', memorial: true, spot: { x: stone.x + randRange(-10, 10), y: stone.y + randRange(8, 12), face: 'north' } });
  const o = weightedPick(options, o => o.weight);
  if (!o) return null;
  const spot = o.seat ? claimSeat(w, th) : o.spot;
  return job('Taking it easy', [
    goTo(spot.x, spot.y, `Strolling to a spot ${o.where}`),
    act(randRange(30, 70), `Relaxing ${o.where}`, {
      // Sit at the table or by the water; in the grass, sit or lie back (the "lay in the grass" thought).
      begin: t => { t.dir = spot.face || t.dir; t.pose = o.where === 'in the grass' && chance(0.5) ? 'sleep' : 'sit'; },
      end: t => { t.pose = null; },
      each: (t, w2, dt) => { t.needs.fun = Math.min(1, t.needs.fun + dt / 60); if (t.needs.fun >= 1) return 'done'; },
      finish: t => {
        if (o.memorial) {
          // Remembering together eases grief: what's left of it passes a quarter sooner.
          addThought(t, w, 'remembered');
          for (const g of t.thoughts) if (['lost_partner', 'lost_family', 'lost_friend'].includes(g.id)) g.until = w.time + (g.until - w.time) * 0.75;
          return;
        }
        addThought(t, w, o.seat ? 'relaxed_canteen' : o.grave ? 'visited_grave' : o.where === 'by the water' ? 'relaxed_water' : 'relaxed_grass');
      },
    }),
  ], { cleanup: t => releaseSeat(w, t) });
}

// Children run about near home or wherever the other children are, a few short dashes at a time.
function makePlayJob(th, w) {
  const pg = buildingOf(w, 'playground');
  if (pg && dist(pg.x, pg.y, th.x, th.y) < 450) { // the play area, if there's one within reach: twice the fun
    const steps = [];
    for (let i = 0; i < 3; i++) steps.push(goTo(pg.x + randRange(-pg.w / 2 + 4, pg.w / 2 - 4), pg.y - randRange(2, pg.h - 4), 'Playing at the play area'));
    steps.push(act(randRange(10, 20), 'Playing at the play area', {
      each: (t, w2, dt) => { t.needs.fun = Math.min(1, t.needs.fun + dt / 20); t.needs.social = Math.min(1, t.needs.social + dt / 150); },
      finish: t => addThought(t, w, 'played'),
    }));
    return job('Off to the play area', steps);
  }
  const friend = w.thrimps.find(o => o !== th && o.stage === 'child' && !o.hidden && !o.asleep && dist(o.x, o.y, th.x, th.y) < 300);
  const home = w.byId.get(th.home), base = friend || (home ? home.door : w.canteen.door);
  const steps = [];
  for (let i = 0; i < 3; i++) {
    const n = nearbyMainNodes(w, base.x, base.y + 20, 70);
    const p = n.length ? pick(n) : { x: base.x, y: base.y + 20 };
    steps.push(goTo(p.x + randRange(-14, 14), p.y + randRange(-10, 10), friend ? `Playing with ${friend.name}` : 'Running about'));
  }
  steps.push(act(randRange(8, 15), friend ? `Playing with ${friend.name}` : 'Playing', {
    each: (t, w2, dt) => { t.needs.fun = Math.min(1, t.needs.fun + dt / 40); if (friend) t.needs.social = Math.min(1, t.needs.social + dt / 120); },
    begin: t => { if (chance(0.3)) emote(t, w, 'note', 10); },
  }));
  return job(friend ? `Playing with ${friend.name}` : 'Playing', steps);
}
function makeWanderJob(th, w) {
  const n = pick(nearbyMainNodes(w, th.x, th.y, hasTrait(th, 'curious') ? 340 : 160));
  if (!n) return null;
  let nextLook = 0;
  return job('Wandering', [
    goTo(n.x + randRange(-12, 12), n.y + randRange(-12, 12), 'Wandering about'),
    act(randRange(5, 20), 'Looking around', {
      begin: t => { if (chance(0.25)) gesture(t, w, 'stretch', 4); },
      each: (t, w2) => { if (w2.time >= nextLook) { nextLook = w2.time + randRange(1.5, 4); t.dir = pick(DIRS); } },
    }),
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
    if (th.sick) return 0.9; // a fever keeps them in bed
    return r < 0.2 ? 1.15 - r : 0;
  } },
  { id: 'mourn', make: makeMournJob, score: (th, w) => th.mourn.length && !isSleepTime(th, hourOf(w.time)) ? 0.95 : 0 },
  // Evenings round the fire, once there is one: company and fun after the day's work.
  { id: 'campfire', make: makeCampfireJob, score(th, w) {
    const h = hourOf(w.time);
    if (!buildingOf(w, 'campfire') || h < 18 || h >= 22.5 || isSleepTime(th, h) || isRaining(w) || th.stage === 'child' && h >= 20 || fireFull(w)) return 0;
    return 0.45 + (1 - th.needs.fun) * 0.3 + (1 - th.needs.social) * 0.3;
  } },
  // In the rain, anyone with nowhere better to be runs for the shelter (it holds about eight).
  { id: 'shelter', make: makeShelterJob, score(th, w) {
    if (!isRaining(w) || !buildingOf(w, 'shelter') || th.hidden || underShelter(th, w) || sheltering(w) >= 8) return 0;
    return 0.75;
  } },
  { id: 'play', make: makePlayJob, score(th, w) {
    if (th.stage !== 'child' || isSleepTime(th, hourOf(w.time))) return 0;
    return 0.45 + (1 - th.needs.fun) * 0.5;
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
    const crush = crushOf(th, w), longing = crush ? clamp((opinionOf(th, crush) - 25) / 100, 0, 0.35) : 0; // in love, they seek them out
    const s = (1 - th.needs.social) * 0.7 * (hasTrait(th, 'shy') ? 0.5 : 1) + longing;
    return isWorkTime(th, hourOf(w.time)) ? s * 0.6 : s + 0.15;
  } },
];
// Children don't work; elders and the sick do less.
const workDrive = th => th.stage === 'child' ? 0
  : traitMult(th, 'work') * (th.inspiration ? 1.4 : 1) * (th.stage === 'elder' ? 0.6 : 1) * (th.sick ? 0.3 : 1);

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
  th.job = null; th.route = null; th.moving = false; th.working = false; th.pose = null;
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
  if (th.dead) return; // gone at the end of this tick
  updateNeeds(th, dt);
  updateBody(th, w, dt);
  if (w.time >= th.nextMind) { th.nextMind = w.time + MIND_EVERY; refreshMind(th, w); }
  else th.mood = moodOf(th, w); // cheap, and keeps mood exact when a thought runs out between refreshes
  if (th.emote && th.emote.until < w.time) th.emote = null;
  if (th.gesture && th.gesture.until < w.time) th.gesture = null;
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
  if (w.crate.broken && w.stock.food >= 1 && !buildingOf(w, 'storehouse')) w.stock.food = Math.max(0, w.stock.food - dt / 120); // spoiling in the open
  socialTick(w);
  if (w.tick % Math.round(HOUR / dt) === 0) { // hourly upkeep
    decayTrails(w);
    updateTrailCosts(w);
    planBuilding(w);
    updateWeather(w);
    lifeHourly(w);
    projectsHourly(w);
  }
  for (const th of w.thrimps) updateThrimp(th, w, dt);
  separateThrimps(w);
  processDeaths(w);
}
