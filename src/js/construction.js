// ============================================================
// CONSTRUCTION: Thrimps decide on their own where to build, haul wood there and raise huts in stages.
// The player never places buildings.
// ============================================================
const HUT_WOOD = 12;            // logs a hut takes
const HUT_WORK = 6 * HOUR;      // labour a hut takes, shared by whoever helps
const BUILD_CHUNK = 40;         // minutes of building per stint
const MAX_SITES = 2;            // at most this many huts going up at once
const SITE_STAGES = ['hut-stage-1', 'hut-stage-2', 'hut-stage-3'];

const siteStage = s => Math.min(SITE_STAGES.length - 1, Math.floor(s.work / HUT_WORK * SITE_STAGES.length));
const woodNeededFor = work => Math.ceil(work / HUT_WORK * HUT_WOOD);
// Labour can only run as far as the wood already delivered allows.
const workAllowed = s => Math.min(HUT_WORK, s.woodIn / HUT_WOOD * HUT_WORK);

// Runs hourly. Who needs a home of their own? Couples living apart, and anyone without a home at all.
function planBuilding(w) {
  const busy = th => w.sites.some(s => s.owners.includes(th.id));
  for (const th of w.thrimps) {
    if (w.sites.length >= MAX_SITES) return;
    if (busy(th)) continue;
    const p = th.partner && byId(w, th.partner);
    if (p && th.id > p.id) continue; // a couple is handled once, by its lower id
    if (p && (th.home !== p.home || !th.home)) startSite(w, [th, p], `a home with ${p.name}`);
    else if (!p && !th.home) {
      // Homeless singles share: two of them build one hut together.
      const mate = w.thrimps.find(o => o !== th && !o.home && !o.partner && !busy(o));
      startSite(w, mate ? [th, mate] : [th], mate ? `a home to share with ${mate.name}` : 'a home of their own');
    }
  }
}

// Score candidate spots by what the owners care about: near work, near friends, far from rivals, a view of the water,
// and not too far from the heart of the village.
function siteScore(w, p, owners) {
  let s = -dist(p.x, p.y, w.canteen.x, w.canteen.y) / 250;
  for (const o of owners) {
    const work = o.likes.chop > o.likes.forage && w.lumberyard ? w.lumberyard
      : w.bushes.reduce((best, b) => !best || dist(b.x, b.y, p.x, p.y) < dist(best.x, best.y, p.x, p.y) ? b : best, null);
    if (work) s -= dist(work.x, work.y, p.x, p.y) / 400;
    for (const other of w.thrimps) {
      if (owners.includes(other)) continue;
      const home = w.byId.get(other.home);
      if (!home) continue;
      const d = dist(p.x, p.y, home.x, home.y);
      if (d < 180) s += opinionOf(o, other) / 40 * (1 - d / 180); // a rival next door weighs heavily
    }
  }
  if (w.shoreSpots.some(sp => dist(sp.x, sp.y, p.x, p.y) < 110)) s += 0.3;
  return s;
}
function chooseSite(w, owners) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 90; i++) {
    const ang = rand() * Math.PI * 2, r = randRange(110, 430);
    const p = checkPlacement(w, 'hut', w.canteen.x + Math.cos(ang) * r * 1.3, w.canteen.y + Math.sin(ang) * r * 0.85);
    if (!p) continue;
    const s = siteScore(w, p, owners);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}
function startSite(w, owners, what) {
  const p = chooseSite(w, owners);
  if (!p) return null;
  claimGround(w, p);
  rebuildPaths(w);
  // Never wall anything off: the site's door must be reachable, and so must every home.
  if (nearestVisibleNode(w, p.x, p.y + 5) < 0 || w.buildings.some(b => nearestVisibleNode(w, b.door.x, b.door.y) < 0)) {
    releaseGround(w, p);
    rebuildPaths(w);
    return null;
  }
  const site = { id: w.nextId++, p, owners: owners.map(o => o.id), woodIn: 0, work: 0, started: w.time, door: { x: p.x, y: p.y + 5 } };
  w.sites.push(site);
  for (const o of owners) { remember(o, w, `Started building ${what}`); memorize(o, w, `Picked a spot and started building ${what}`, 0); }
  return site;
}
// A new footprint changes what's walkable, so the path network is rebuilt (and its trail costs refreshed).
function rebuildPaths(w) {
  buildGraph(w);
  updateTrailCosts(w);
}

// One stint: fetch logs if the site is short, then build as far as the delivered wood allows.
function makeBuildJob(th, w) {
  const open = w.sites.filter(s => s.work < HUT_WORK);
  if (!open.length) return null;
  const site = open.find(s => s.owners.includes(th.id)) || open.sort((a, b) => dist(a.p.x, a.p.y, th.x, th.y) - dist(b.p.x, b.p.y, th.x, th.y))[0];
  const side = chance(0.5) ? -1 : 1, spot = { x: site.p.x + side * (site.p.w / 2 + 8), y: site.p.y + 3 };
  const steps = [];
  const short = site.woodIn < Math.min(HUT_WOOD, woodNeededFor(site.work + BUILD_CHUNK));
  if (short) {
    if (!w.lumberyard || w.stock.wood < 2) return null;
    steps.push(
      goTo(w.lumberyard.drop.x + randRange(-6, 6), w.lumberyard.drop.y + 2, 'Fetching logs for the new hut'),
      act(3, 'Picking up logs', { begin: t => { if (w.stock.wood < 2) return 'fail'; w.stock.wood -= 2; t.carrying = { kind: 'wood', amount: 2 }; } }),
      goTo(spot.x, spot.y, 'Carrying logs to the building site'),
      act(3, 'Dropping off logs', { finish: t => { if (t.carrying && t.carrying.kind === 'wood') { site.woodIn += t.carrying.amount; t.carrying = null; } } }),
    );
  } else {
    steps.push(goTo(spot.x, spot.y, 'Walking to the building site'));
  }
  steps.push(act(BUILD_CHUNK, 'Building', {
    begin: t => { if (workAllowed(site) <= site.work) return 'fail'; t.dir = side < 0 ? 'east' : 'west'; t.working = 'chop'; },
    each: (t, w2, dt) => {
      site.work = Math.min(workAllowed(site), site.work + dt * (t.inspiration ? 1.5 : 1));
      if (site.work >= HUT_WORK) return 'done';
      if (site.work >= workAllowed(site)) return 'done'; // out of wood for now
    },
    finish: t => { afterWork(t, w); if (site.work >= HUT_WORK && w.sites.includes(site)) completeSite(w, site); },
    end: t => { t.working = false; },
  }));
  return job(site.owners.includes(th.id) ? 'Building their new home' : 'Helping build a hut', steps);
}

function completeSite(w, site) {
  w.sites = w.sites.filter(s => s !== site);
  const hut = addBuilding(w, site.p);
  hut.label = `Hut ${w.buildings.filter(b => b.type === 'hut').length}`;
  Object.assign(hut, { builtDay: dayOf(w.time), builtBy: site.owners, fromSite: site.id }); // for the hut's info panel
  const owners = site.owners.map(id => byId(w, id)).filter(Boolean);
  for (const o of owners) {
    o.home = hut.id;
    addThought(o, w, 'built_home');
    const partner = owners.find(x => x !== o);
    memorize(o, w, partner ? `Finished building a home with ${partner.name}` : 'Finished building a home', partner ? partner.id : 0);
    remember(o, w, `Moved into ${hut.label}`);
  }
  for (let k = 0; k < 6; k++) stampTrail(w, hut.door.x + randRange(-6, 6), hut.door.y + randRange(0, 8), 0.4); // a fresh doorstep
  w.stats.huts_built = (w.stats.huts_built || 0) + 1;
}
