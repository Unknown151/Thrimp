// ============================================================
// CONSTRUCTION: Thrimps decide on their own where to build, haul wood there and raise buildings in stages.
// The player never places buildings. Homes are planned here; everything else (a campfire, a storehouse...) starts as
// someone's idea in projects.js and is built the same way.
// ============================================================
const HUT_WOOD = 12;            // logs a hut takes
const HUT_WORK = 6 * HOUR;      // labour a hut takes, shared by whoever helps
const BUILD_CHUNK = 40;         // minutes of building per stint
const MAX_SITES = 3;            // at most this many things going up at once
const SITE_STAGES = ['hut-stage-1', 'hut-stage-2', 'hut-stage-3'];

// What a site takes: huts use the constants above, other types their PROJECTS entry (projects.js, crafts.js):
// a `cost` in wood, planks and stone, or just `wood`.
const MATERIALS = ['wood', 'planks', 'stone'];
const MATERIAL_WORD = { wood: 'logs', planks: 'planks', stone: 'stone' };
const siteType = s => s.type || 'hut';
const siteCost = s => siteType(s) === 'hut' ? { wood: HUT_WOOD } : PROJECTS[siteType(s)].cost || { wood: PROJECTS[siteType(s)].wood };
const siteWood = s => siteCost(s).wood || 0;
const siteWork = s => siteType(s) === 'hut' ? HUT_WORK : PROJECTS[siteType(s)].work;
const siteWhat = s => s.what || 'a hut';
const siteStage = s => Math.min(SITE_STAGES.length - 1, Math.floor(s.work / siteWork(s) * SITE_STAGES.length));
const delivered = (s, m) => m === 'wood' ? s.woodIn : (s.in && s.in[m]) || 0;
function deliver(s, m, n) { if (m === 'wood') s.woodIn += n; else { s.in = s.in || {}; s.in[m] = (s.in[m] || 0) + n; } }
const neededFor = (s, m, work) => Math.ceil(work / siteWork(s) * (siteCost(s)[m] || 0));
const woodNeededFor = (s, work) => neededFor(s, 'wood', work);
// Labour can only run as far as the scarcest delivered material allows.
function workAllowed(s) {
  const c = siteCost(s);
  let f = 1;
  for (const m of MATERIALS) if (c[m]) f = Math.min(f, delivered(s, m) / c[m]);
  return Math.min(siteWork(s), f * siteWork(s));
}
// Where each material is fetched from.
const MATERIAL_SOURCE = {
  wood: w => w.lumberyard && w.lumberyard.drop,
  planks: w => { const b = buildingOf(w, 'sawmill'); return b && b.door; },
  stone: w => { const b = buildingOf(w, 'quarry'); return b && b.door; },
};
const materialsText = s => MATERIALS.filter(m => siteCost(s)[m]).map(m => `${delivered(s, m)} of ${siteCost(s)[m]} ${MATERIAL_WORD[m]}`).join(', ');
const residentsOf = (w, b) => w.thrimps.filter(t => t.home === b.id);

// Runs hourly. Who needs a home of their own? Couples living apart, anyone without a home at all, and families who
// have outgrown theirs. Then, if there's still room, one of the colony's ideas (projects.js).
function planBuilding(w) {
  const busy = th => w.sites.some(s => s.owners.includes(th.id));
  const apart = th => { const p = th.partner && byId(w, th.partner); return p && p.home !== th.home; };
  // A home whose people have all died stands empty: the homeless, or a couple living apart, move in before building.
  for (const hut of w.buildings.filter(b => BUILDING_TYPES[b.type].home && !residentsOf(w, b).length)) {
    const th = w.thrimps.find(t => t.stage !== 'child' && !busy(t) && (!t.home || apart(t)));
    if (!th) break;
    const p = th.partner && byId(w, th.partner);
    for (const o of p ? [th, p] : [th]) { o.home = hut.id; remember(o, w, `Moved into ${hut.label}`); memorize(o, w, `Moved into ${hut.label}`, 0); }
  }
  for (const th of w.thrimps) {
    if (w.sites.length >= MAX_SITES) return;
    if (busy(th) || th.stage === 'child') continue;
    const p = th.partner && byId(w, th.partner);
    if (p && th.id > p.id) continue; // a couple is handled once, by its lower id
    if (p && (th.home !== p.home || !th.home)) startSite(w, [th, p], `a home with ${p.name}`);
    else if (!p && !th.home) {
      // Homeless singles share: two of them build one hut together.
      const mate = w.thrimps.find(o => o !== th && !o.home && !o.partner && !busy(o) && o.stage !== 'child');
      startSite(w, mate ? [th, mate] : [th], mate ? `a home to share with ${mate.name}` : 'a home of their own');
    }
  }
  if (w.sites.length < MAX_SITES) planProjects(w);
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
// A home goes where its owners like it; anything else near its anchor (`near`: { x, y, r0, r1 }).
function chooseSite(w, owners, type = 'hut', near = null) {
  let best = null, bestScore = -Infinity;
  const small = BUILDING_TYPES[type].w < 30;
  for (let i = 0; i < 150 && !(best && i >= 90); i++) {
    const ang = rand() * Math.PI * 2, wider = i >= 90 ? 1.8 : 1; // nothing near enough? look a little further out
    const c = near || { x: w.canteen.x, y: w.canteen.y, r0: 110, r1: 430 }, r = randRange(c.r0, c.r1 * wider);
    const p = checkPlacement(w, type, c.x + Math.cos(ang) * r * 1.3, c.y + Math.sin(ang) * r * 0.85, small ? 8 : 12, small ? 12 : 18);
    if (!p) continue;
    const s = near ? -dist(p.x, p.y, c.x, c.y) / 100 + rand() * 0.3 : siteScore(w, p, owners);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}
function startSite(w, owners, what, type = 'hut', near = null) {
  const p = type === 'table' ? chooseTableSpot(w) : chooseSite(w, owners, type, near);
  if (!p) return null;
  claimGround(w, p);
  rebuildPaths(w);
  // Never wall anything off: the site's door must be reachable, and so must every home.
  if (nearestVisibleNode(w, p.x, p.y + 5) < 0 || w.buildings.some(b => nearestVisibleNode(w, b.door.x, b.door.y) < 0)) {
    releaseGround(w, p);
    rebuildPaths(w);
    return null;
  }
  const site = { id: w.nextId++, type, what, p, owners: owners.map(o => o.id), woodIn: 0, work: 0, started: w.time, door: { x: p.x, y: p.y + 5 } };
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
  const open = w.sites.filter(s => s.work < siteWork(s));
  if (!open.length) return null;
  const site = open.find(s => s.owners.includes(th.id)) || open.sort((a, b) => dist(a.p.x, a.p.y, th.x, th.y) - dist(b.p.x, b.p.y, th.x, th.y))[0];
  const side = chance(0.5) ? -1 : 1, spot = { x: site.p.x + side * (site.p.w / 2 + 8), y: site.p.y + 3 };
  const steps = [];
  // The first material that's behind what the next stint needs gets fetched from where it's made.
  const cost = siteCost(site), short = MATERIALS.find(m => cost[m] && delivered(site, m) < Math.min(cost[m], neededFor(site, m, site.work + BUILD_CHUNK)));
  if (short) {
    const from = MATERIAL_SOURCE[short](w), word = MATERIAL_WORD[short];
    if (!from || (w.stock[short] || 0) < 2) return null;
    steps.push(
      goTo(from.x + randRange(-6, 6), from.y + 2, `Fetching ${word} for ${siteWhat(site)}`),
      act(3, `Picking up ${word}`, { begin: t => { if ((w.stock[short] || 0) < 2) return 'fail'; w.stock[short] -= 2; t.carrying = { kind: short, amount: 2 }; } }),
      goTo(spot.x, spot.y, `Carrying ${word} to the building site`),
      act(3, `Dropping off ${word}`, { finish: t => { if (t.carrying && t.carrying.kind === short) { deliver(site, short, t.carrying.amount); t.carrying = null; } } }),
    );
  } else {
    steps.push(goTo(spot.x, spot.y, 'Walking to the building site'));
  }
  steps.push(act(BUILD_CHUNK, 'Building', {
    begin: t => { if (workAllowed(site) <= site.work) return 'fail'; t.dir = side < 0 ? 'east' : 'west'; t.working = 'chop'; },
    each: (t, w2, dt) => {
      site.work = Math.min(workAllowed(site), site.work + dt * (t.inspiration ? 1.5 : 1));
      if (site.work >= siteWork(site)) return 'done';
      if (site.work >= workAllowed(site)) return 'done'; // out of wood for now
    },
    finish: t => { afterWork(t, w); if (site.work >= siteWork(site) && w.sites.includes(site)) completeSite(w, site); },
    end: t => { t.working = false; },
  }));
  const homeType = BUILDING_TYPES[siteType(site)] && BUILDING_TYPES[siteType(site)].home;
  return job(site.owners.includes(th.id) ? (homeType ? 'Building their new home' : `Building ${siteWhat(site)}`) : `Helping build ${siteWhat(site)}`, steps);
}

function completeSite(w, site) {
  w.sites = w.sites.filter(s => s !== site);
  const owners = site.owners.map(id => byId(w, id)).filter(Boolean);
  if (siteType(site) === 'table') { // a table is furniture, not a building: it joins the canteen's (its ground stays claimed)
    addTable(w, site.p.x, site.p.y);
    finishProject(w, site, owners, null);
    return;
  }
  if (site.upgradeOf) { finishUpgrade(w, site, owners); finishProject(w, site, owners, null); return; } // crafts.js
  const b = addBuilding(w, site.p);
  if (site.outcrop) b.outcrop = site.outcrop;
  const T = BUILDING_TYPES[b.type];
  if (T.home) b.label = `${T.label} ${w.buildings.filter(x => x.type === b.type).length}`;
  Object.assign(b, { builtDay: dayOf(w.time), builtBy: site.owners, fromSite: site.id }); // for the info panel
  if (T.home) {
    // The owners move in, and into a family house their children who lived with them come along.
    const old = owners[0] && owners[0].home;
    const kids = b.type === 'house' ? w.thrimps.filter(t => t.home === old && t.stage === 'child' && owners.some(o => t.parents.includes(o.id))) : [];
    for (const o of [...owners, ...kids]) {
      o.home = b.id;
      if (owners.includes(o)) addThought(o, w, 'built_home');
      remember(o, w, `Moved into ${b.label}`);
    }
    for (const o of owners) {
      const partner = owners.find(x => x !== o);
      memorize(o, w, partner ? `Finished building a home with ${partner.name}` : 'Finished building a home', partner ? partner.id : 0);
    }
    if (b.type === 'hut') w.stats.huts_built = (w.stats.huts_built || 0) + 1;
    else finishProject(w, site, owners, b);
  } else finishProject(w, site, owners, b);
  for (let k = 0; k < 6; k++) stampTrail(w, b.door.x + randRange(-6, 6), b.door.y + randRange(0, 8), 0.4); // a fresh doorstep
}
