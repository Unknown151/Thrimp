// ============================================================
// PROJECTS: buildings Thrimps think up for themselves. Each answers something that actually happened in the colony
// (meals eaten standing, soaked days, spoiled food, a fever, deaths, children, a crowded home). When the need is
// there, a fitting Thrimp gets the idea, picks a spot, and the colony builds it like a hut (construction.js).
// ============================================================
const hasBuilt = (w, type) => w.buildings.some(b => b.type === type) || w.sites.some(s => s.type === type);
const buildingOf = (w, type) => w.buildings.find(b => b.type === type) || null;
const grownUps = w => w.thrimps.filter(t => t.stage !== 'child');

// want(w): null, or { urgency, owner, near } for the best version of this idea right now.
const PROJECTS = {
  house: { what: 'a family house', wood: 20, work: 8 * HOUR, want(w) {
    // A home with more people than room, where a couple lives with their children.
    for (const b of w.buildings.filter(b => b.type === 'hut')) {
      const people = residentsOf(w, b);
      if (people.length <= BUILDING_TYPES.hut.room) continue;
      const parent = people.find(t => t.partner && people.some(k => k.stage === 'child' && k.parents.includes(t.id)));
      const partner = parent && byId(w, parent.partner);
      if (parent && partner && !w.sites.some(s => s.owners.includes(parent.id))) return { urgency: 0.8, owners: [parent, partner], home: true };
    }
    return null;
  } },
  table: { what: 'a canteen table', wood: 6, work: 2 * HOUR, want(w) {
    // Six tables fit in front of the old canteen; the bigger canteen (crafts.js) makes room for ten.
    if (w.tables.length + w.sites.filter(s => s.type === 'table').length >= tablesAllowed(w) || (w.standingMeals || 0) < 6) return null;
    const owner = w.thrimps.filter(t => t.stage !== 'child' && t.thoughts.some(x => x.id === 'ate_standing'))[0] || pick(grownUps(w));
    return owner && { urgency: 0.7, owners: [owner] };
  } },
  campfire: { what: 'a campfire', wood: 4, work: 1.5 * HOUR, want(w) {
    if (hasBuilt(w, 'campfire') || w.thrimps.length < 8 || dayOf(w.time) < 2) return null; // settle in first
    const lonely = w.thrimps.reduce((s, t) => s + (2 - t.needs.fun - t.needs.social), 0) / w.thrimps.length;
    if (lonely < 0.6 && dayOf(w.time) < 4) return null;
    const owner = grownUps(w).find(t => hasTrait(t, 'cheerful') || hasTrait(t, 'curious')) || pick(grownUps(w));
    return owner && { urgency: 0.5, owners: [owner], near: { x: w.canteen.x, y: w.canteen.y + 30, r0: 60, r1: 150 } };
  } },
  shelter: { what: 'a rain shelter', wood: 10, work: 4 * HOUR, want(w) {
    if (hasBuilt(w, 'shelter') || (w.stats.soaked || 0) < 12) return null;
    const owner = grownUps(w).find(t => t.thoughts.some(x => x.id === 'got_soaked')) || pick(grownUps(w));
    return owner && { urgency: 0.6, owners: [owner], near: { x: w.canteen.x, y: w.canteen.y + 20, r0: 70, r1: 170 } };
  } },
  storehouse: { what: 'a storehouse', wood: 14, work: 5 * HOUR, want(w) {
    if (hasBuilt(w, 'storehouse') || ((w.stats.spoiled || 0) < 10 && !(w.stats.crate_smashed > 0))) return null;
    const owner = grownUps(w).find(t => hasTrait(t, 'greedy')) || grownUps(w).sort((a, b) => b.likes.forage - a.likes.forage)[0];
    return owner && { urgency: 0.7, owners: [owner], near: { x: w.crate.x, y: w.crate.y, r0: 50, r1: 130 } };
  } },
  healer: { what: 'a healer\'s hut', wood: 12, work: 5 * HOUR, want(w) {
    if (hasBuilt(w, 'healer') || !(w.lastOutbreak || w.dead.some(d => d.cause === 'sickness'))) return null;
    // Whoever has been through it: lost someone to a fever, or had one themselves.
    const owner = grownUps(w).find(t => w.dead.some(d => d.cause === 'sickness' && (isFamily(t, d) || opinionOf(t, d) >= 40)))
      || grownUps(w).find(t => t.immuneUntil > 0) || pick(grownUps(w));
    return owner && { urgency: 0.85, owners: [owner], near: { x: w.canteen.x, y: w.canteen.y, r0: 90, r1: 260 } };
  } },
  memorial: { what: 'a memorial stone', wood: 2, work: 3 * HOUR, want(w) {
    if (hasBuilt(w, 'memorial') || w.dead.length < 3 || !w.graveyard) return null;
    const grief = t => t.thoughts.filter(x => ['lost_partner', 'lost_family', 'lost_friend'].includes(x.id)).length;
    const owner = grownUps(w).sort((a, b) => grief(b) - grief(a))[0];
    return owner && { urgency: 0.6, owners: [owner], near: { x: w.graveyard.x, y: w.graveyard.y - 12, r0: 0, r1: 70 } };
  } },
  playground: { what: 'a play area', wood: 6, work: 2 * HOUR, want(w) {
    const kids = w.thrimps.filter(t => t.stage === 'child');
    if (hasBuilt(w, 'playground') || kids.length < 3) return null;
    const parents = grownUps(w).filter(t => kids.some(k => k.parents.includes(t.id)));
    const homes = kids.map(k => w.byId.get(k.home)).filter(Boolean);
    const c = homes.length ? { x: homes.reduce((s, h) => s + h.x, 0) / homes.length, y: homes.reduce((s, h) => s + h.y, 0) / homes.length } : w.canteen;
    return parents.length && { urgency: 0.55, owners: [pick(parents)], near: { x: c.x, y: c.y + 20, r0: 30, r1: 140 } };
  } },
};

// Hourly, when a building slot is free: the most pressing idea gets started.
function planProjects(w) {
  let best = null;
  for (const [type, P] of Object.entries(PROJECTS)) {
    const idea = P.want(w);
    if (idea && (!best || idea.urgency > best.urgency)) best = { type, ...idea };
  }
  if (best) startProject(w, best.type, best);
}
// Someone has the idea, picks a spot and the site starts (or nothing happens if there's no room for it).
function startProject(w, type, idea) {
  const P = PROJECTS[type], [owner] = idea.owners;
  const site = idea.upgrade ? startUpgrade(w, idea.owners, P.what, type, idea.upgrade)
    : startSite(w, idea.owners, P.what, type, idea.near || null);
  if (!site) return null;
  if (idea.outcrop) site.outcrop = idea.outcrop; // a quarry works the rock it was built beside
  if (type === 'table') w.standingMeals = 0;
  emote(owner, w, 'idea', 30);
  memorize(owner, w, `Had the idea to build ${P.what}`, 0);
  raiseAlert(w, `${owner.name} wants to build ${P.what}`, site.p.x, site.p.y, [owner.id], true);
  return site;
}
function finishProject(w, site, owners, b) {
  for (const o of owners) { addThought(o, w, 'built_something'); memorize(o, w, `Finished building ${siteWhat(site)}`, 0); }
  w.stats[`built_${siteType(site)}`] = (w.stats[`built_${siteType(site)}`] || 0) + 1;
  raiseAlert(w, `The colony finished ${siteWhat(site)}`, site.p.x, site.p.y, owners.map(o => o.id), true);
}

// A spot for one more table: in rows out in front of the canteen, clear of everything, 40 px from the others.
function chooseTableSpot(w) {
  const c = w.canteen, ty = c.y + 26;
  for (const row of [0, 1, 2, 3]) for (const dx of [-90, 90, -30, 30, -150, 150, -210, 210]) {
    const x = Math.round(c.x + dx), y = Math.round(ty + row * 34);
    if (w.tables.some(t => dist(t.x, t.y, x, y) < 40) || w.sites.some(s => dist(s.p.x, s.p.y, x, y) < 40)) continue;
    const rect = { x0: x - 20, x1: x + 20, y0: y - 18, y1: y + 8 };
    if (w.noBuild.some(r => rectsOverlap(r, rect))) continue;
    let clear = true;
    for (let yy = rect.y0; yy <= rect.y1 && clear; yy += 4) for (let xx = rect.x0; xx <= rect.x1 && clear; xx += 4) if (isBlocked(w, xx, yy)) clear = false;
    if (clear) return { type: 'table', x, y, w: 26, h: 10, look: 'table', rect };
  }
  return null;
}

// --- What the buildings do ---
// Rain spoils food the crate can't hold, unless there's a storehouse. Runs hourly.
const CRATE_HOLDS = 40;
function projectsHourly(w) {
  if (isRaining(w) && !buildingOf(w, 'storehouse') && w.stock.food > CRATE_HOLDS) {
    const lost = Math.max(1, Math.floor((w.stock.food - CRATE_HOLDS) * 0.03));
    w.stock.food -= lost;
    w.stats.spoiled = (w.stats.spoiled || 0) + lost;
    if (w.time - (w.lastSpoilAlert || -Infinity) > 2 * DAY) {
      w.lastSpoilAlert = w.time;
      raiseAlert(w, 'The rain is spoiling the food stores', w.crate.x, w.crate.y, [], true);
    }
  }
  w.standingMeals = (w.standingMeals || 0) * 0.97; // old grumbles fade over a day or two
}
// Under a shelter's roof: no getting soaked.
function underShelter(th, w) {
  return w.buildings.some(b => b.type === 'shelter' && Math.abs(th.x - b.x) < b.w / 2 && th.y > b.y - b.h - 2 && th.y < b.y + 2);
}
// The healer's hut takes in the sick; those inside recover faster and can't pass the fever on.
const atHealer = th => th.sick && th.hidden && th.asleep && th.inHealer;

// Evening by the fire: ten places in a ring around it, taken like seats (not saved: jobs aren't).
const FIRE_PLACES = 10;
const firePlacesOf = w => w.firePlaces || (w.firePlaces = new Map()); // place index -> Thrimp id
function makeCampfireJob(th, w) {
  const fire = buildingOf(w, 'campfire'), firePlaces = firePlacesOf(w);
  if (!fire) return null;
  const free = [...Array(FIRE_PLACES).keys()].filter(i => !firePlaces.has(i) || !byId(w, firePlaces.get(i)));
  const spots = free.map(i => {
    const a = i / FIRE_PLACES * Math.PI * 2;
    return { i, x: fire.x + Math.cos(a) * 28, y: fire.y - 3 + Math.sin(a) * 16 };
  }).filter(s => !isBlocked(w, s.x, s.y));
  const spot = spots.length && pick(spots);
  if (!spot) return null;
  firePlaces.set(spot.i, th.id);
  return job('An evening by the fire', [
    goTo(spot.x, spot.y, 'Heading to the campfire'),
    act(randRange(40, 80), 'Sitting by the fire', {
      begin: t => { t.dir = dirFromVec(fire.x - t.x, fire.y - 3 - t.y); t.pose = 'sit'; },
      each: (t, w2, dt) => { t.needs.fun = Math.min(1, t.needs.fun + dt / 120); t.needs.social = Math.min(1, t.needs.social + dt / 160); },
      finish: t => addThought(t, w, 'fireside'),
      end: t => { t.pose = null; },
    }),
  ], { cleanup: t => { if (firePlaces.get(spot.i) === t.id) firePlaces.delete(spot.i); } });
}
const fireFull = w => [...firePlacesOf(w).values()].filter(id => byId(w, id)).length >= FIRE_PLACES;
// Waiting out the rain under the shelter's roof.
function makeShelterJob(th, w) {
  const s = buildingOf(w, 'shelter');
  if (!s) return null;
  const spot = { x: s.x + randRange(-s.w / 3, s.w / 3), y: s.y - randRange(3, s.h - 6) };
  return job('Out of the rain', [
    goTo(spot.x, spot.y, 'Running for the shelter'),
    act(3 * HOUR, 'Waiting out the rain under the shelter', {
      begin: t => { t.dir = 'south'; if (chance(0.5)) t.pose = 'sit'; },
      each: () => isRaining(w) ? undefined : 'done',
      end: t => { t.pose = null; },
    }),
  ]);
}
const sheltering = w => w.thrimps.filter(t => t.job && t.job.type === 'shelter').length;
