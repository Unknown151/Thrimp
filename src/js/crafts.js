// ============================================================
// CRAFTS: the colony's second tier. Someone invents a skill (sawing planks, cutting stone), it spreads by talk and
// from parent to child, and it can die with the last Thrimp who knew it. Skills open workplaces (a sawmill, a quarry)
// and better homes, built by upgrading huts in place. The first step toward the Ages (design doc, section 14).
// ============================================================
const SKILLS = {
  sawing: { label: 'sawing planks', invented: 'Worked out how to saw logs into planks', learned: n => `Learned to saw planks from ${n}` },
  quarrying: { label: 'cutting stone', invented: 'Worked out how to cut stone from the rocks', learned: n => `Learned to cut stone from ${n}` },
};
const knows = (th, skill) => th.knows && th.knows.includes(skill);
const knowersOf = (w, skill) => w.thrimps.filter(t => knows(t, skill));
function learn(th, w, skill, from) {
  if (knows(th, skill)) return;
  th.knows.push(skill);
  const text = from ? SKILLS[skill].learned(from.name) : SKILLS[skill].invented;
  memorize(th, w, text, from ? from.id : 0);
  remember(th, w, text);
}

// What it takes before anyone thinks of it, and who might. Both need adults with the right turn of mind.
const INVENTIONS = {
  // Logs piling up at the lumberyard, once the colony has settled, set someone thinking.
  sawing: { when: w => dayOf(w.time) >= 5 && w.stock.wood >= 40, chance: 0.01,
    fits: th => th.likes.chop > 1.05 || hasTrait(th, 'curious') || hasTrait(th, 'hard-working') },
  // Living in plank cottages, someone looks at the rocks and wants walls that last.
  quarrying: { when: w => dayOf(w.time) >= 10 && w.buildings.some(b => b.type === 'cottage') && w.outcrops.some(o => o.stone > 0),
    chance: 0.008, fits: th => th.likes.quarry > 1.05 || hasTrait(th, 'curious') || hasTrait(th, 'hard-working') },
};
// Hourly. A skill nobody alive knows can be (re)invented; one that has a workplace already is easier to work out.
function craftsHourly(w) {
  for (const [skill, I] of Object.entries(INVENTIONS)) {
    if (knowersOf(w, skill).length || !I.when(w)) continue;
    const ruin = skill === 'sawing' ? buildingOf(w, 'sawmill') : buildingOf(w, 'quarry');
    for (const th of w.thrimps.filter(t => t.stage === 'adult' && !t.hidden && I.fits(t))) {
      const p = I.chance * (hasTrait(th, 'curious') ? 2 : 1) * (th.inspiration ? 3 : 1) * (ruin ? 3 : 1);
      if (!chance(p)) continue;
      learn(th, w, skill);
      addThought(th, w, 'invented');
      emote(th, w, 'idea', 60);
      const again = w.knowledge[skill];
      w.knowledge[skill] = { by: th.id, name: th.name, day: dayOf(w.time) };
      raiseAlert(w, again ? `${th.name} worked out ${SKILLS[skill].label} again` : `${th.name} worked out ${SKILLS[skill].label}!`,
        th.x, th.y, [th.id], true);
      break;
    }
  }
}
// Over a chat, a Thrimp may pass on what they know.
function teachSkills(a, b, w) {
  for (const [x, y] of [[a, b], [b, a]]) {
    for (const skill of x.knows || []) if (!knows(y, skill) && y.stage !== 'child' && chance(0.12)) learn(y, w, skill, x);
  }
}
// Growing up, a child has picked up half of what their parents knew.
function inheritSkills(th, w) {
  for (const id of th.parents) {
    const p = byId(w, id);
    if (p) for (const skill of p.knows || []) if (!knows(th, skill) && chance(0.5)) learn(th, w, skill, p);
  }
}

// --- Stone outcrops: finite, like old trees ---
function placeOutcrops(w) {
  w.outcrops = [];
  const n = randInt(3, 4);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < 300; i++) {
      const ang = rand() * Math.PI * 2, r = randRange(170, 480);
      const p = checkPlacement(w, 'outcrop', w.center.x + Math.cos(ang) * r * 1.3, w.center.y + Math.sin(ang) * r * 0.85, 10, 16);
      if (!p) continue;
      claimGround(w, p);
      const stone = randInt(40, 70);
      w.outcrops.push({ id: w.nextId++, x: p.x, y: p.y, w: p.w, h: p.h, art: p.look, rect: p.rect, stone, max: stone });
      break;
    }
  }
}
const outcropById = (w, id) => (w.outcrops || []).find(o => o.id === id);

// --- New work ---
// Fetch two logs from the lumberyard, carry them to the sawmill, saw them into three planks.
function makeSawJob(th, w) {
  const mill = buildingOf(w, 'sawmill'), yard = w.lumberyard;
  if (!mill || !yard || w.stock.wood < 2 || !knows(th, 'sawing')) return null;
  const side = chance(0.5) ? -1 : 1, spot = { x: mill.x + side * (mill.w / 2 + 6), y: mill.y + 3 };
  return job('Sawing planks', [
    goTo(yard.drop.x + randRange(-6, 6), yard.drop.y + 2, 'Fetching logs for the sawmill'),
    act(3, 'Picking up logs', { begin: t => { if (w.stock.wood < 2) return 'fail'; w.stock.wood -= 2; t.carrying = { kind: 'wood', amount: 2 }; } }),
    goTo(spot.x, spot.y, 'Carrying logs to the sawmill'),
    act(th.inspiration ? 25 : 40, 'Sawing logs into planks', {
      begin: t => { t.carrying = null; t.dir = side < 0 ? 'east' : 'west'; t.working = 'saw'; },
      finish: t => { w.stock.planks += 3; afterWork(t, w); },
      end: t => { t.working = false; },
    }),
  ]);
}
// Cut two stones from the quarry's outcrop and stack them at the quarry.
function makeQuarryJob(th, w) {
  const q = buildingOf(w, 'quarry'), o = q && outcropById(w, q.outcrop);
  if (!q || !o || o.stone < 2 || !knows(th, 'quarrying')) return null;
  const side = chance(0.5) ? -1 : 1, spot = { x: o.x + side * (o.w / 2 + 6), y: o.y + 2 };
  return job('Cutting stone', [
    goTo(spot.x, spot.y, 'Walking to the rocks'),
    act(th.inspiration ? 28 : 45, 'Cutting stone from the rock', {
      begin: t => { if (o.stone < 2) return 'fail'; t.dir = side < 0 ? 'east' : 'west'; t.working = 'mine'; },
      finish: t => { // two may work one rock: take only what's left
        const n = Math.min(2, o.stone);
        o.stone -= n;
        if (n > 0) t.carrying = { kind: 'stone', amount: n };
      },
      end: t => { t.working = false; },
    }),
    goTo(q.door.x + randRange(-6, 6), q.door.y + 1, 'Hauling stone to the quarry'),
    act(3, 'Stacking stone', { finish: t => { deposit(w, t); afterWork(t, w); } }),
  ]);
}

// --- Projects of the second tier (joined to PROJECTS in projects.js) ---
const tablesAllowed = w => w.canteen.art === 'canteen-big' ? 10 : 6;
const upgrading = w => w.sites.some(s => s.upgradeOf);
Object.assign(PROJECTS, {
  sawmill: { what: 'a sawmill', wood: 10, work: 4 * HOUR, want(w) {
    const k = knowersOf(w, 'sawing');
    if (!k.length || hasBuilt(w, 'sawmill') || !w.lumberyard) return null;
    return { urgency: 0.75, owners: [k[0]], near: { x: w.lumberyard.x, y: w.lumberyard.y, r0: 40, r1: 150 } };
  } },
  quarry: { what: 'a quarry', wood: 8, work: 3 * HOUR, want(w) {
    const k = knowersOf(w, 'quarrying');
    if (!k.length || (hasBuilt(w, 'quarry') && w.outcrops.some(o => o.stone >= 2 && w.buildings.some(b => b.type === 'quarry' && b.outcrop === o.id)))) return null;
    if (w.sites.some(s => s.type === 'quarry')) return null;
    // A rock near the village and rich in stone, with no quarry yet.
    const score = x => dist(x.x, x.y, w.canteen.x, w.canteen.y) - x.stone * 3;
    const o = w.outcrops.filter(x => x.stone >= 10 && !w.buildings.some(b => b.outcrop === x.id)).sort((a, b) => score(a) - score(b))[0];
    return o && { urgency: 0.7, owners: [k[0]], outcrop: o.id, near: { x: o.x, y: o.y + 26, r0: 10, r1: 60 } };
  } },
  // Upgrades in place: the family keeps living there while it's rebuilt around them.
  // One home at a time, and not all at once: a day or so between upgrades.
  cottage: { what: 'a cottage', cost: { wood: 4, planks: 14 }, work: 5 * HOUR, into: { type: 'cottage', art: 'cottage' }, want(w) {
    if (!buildingOf(w, 'sawmill') || upgrading(w) || w.stock.planks < 8 || w.time - (w.lastUpgrade || -1e9) < DAY) return null;
    const hut = w.buildings.filter(b => b.type === 'hut' && residentsOf(w, b).length >= 2)
      .sort((a, b) => residentsOf(w, b).length - residentsOf(w, a).length)[0];
    const owners = hut && residentsOf(w, hut).filter(t => t.stage !== 'child').slice(0, 2);
    return owners && owners.length && { urgency: 0.5, owners, upgrade: hut };
  } },
  stonehouse: { what: 'a stone house', cost: { stone: 20, planks: 8 }, work: 7 * HOUR, into: { type: 'stonehouse', art: 'stonehouse' }, want(w) {
    if (!buildingOf(w, 'quarry') || upgrading(w) || w.stock.stone < 10 || w.time - (w.lastUpgrade || -1e9) < DAY) return null;
    // A cottage lived in for a few days first.
    const home = w.buildings.filter(b => b.type === 'cottage' && residentsOf(w, b).length >= 2 && dayOf(w.time) - (b.upgradedDay || 0) >= 3)
      .sort((a, b) => residentsOf(w, b).length - residentsOf(w, a).length)[0];
    const owners = home && residentsOf(w, home).filter(t => t.stage !== 'child').slice(0, 2);
    return owners && owners.length && { urgency: 0.5, owners, upgrade: home };
  } },
  bigcanteen: { what: 'a bigger canteen', cost: { wood: 8, planks: 16 }, work: 6 * HOUR, into: { type: 'canteen', art: 'canteen-big' }, want(w) {
    // Six tables and still people eating standing (or no room left for another table).
    if (!buildingOf(w, 'sawmill') || upgrading(w) || w.canteen.art === 'canteen-big' || (w.standingMeals || 0) < 4) return null;
    if (w.tables.length < 6 && chooseTableSpot(w)) return null;
    const owner = grownUps(w).find(t => t.thoughts.some(x => x.id === 'ate_standing')) || pick(grownUps(w));
    return owner && { urgency: 0.75, owners: [owner], upgrade: w.canteen };
  } },
});

// An upgrade site sits on the building itself: no new ground, and the people inside stay.
function startUpgrade(w, owners, what, type, b) {
  const into = PROJECTS[type].into;
  const p = { type: into.type, x: b.x, y: b.y, w: b.w, h: b.h, look: into.art, rect: null };
  const site = { id: w.nextId++, type, what, p, owners: owners.map(o => o.id), woodIn: 0, work: 0, started: w.time,
    door: b.door, upgradeOf: b.id };
  w.sites.push(site);
  for (const o of owners) { remember(o, w, `Started building ${what}`); memorize(o, w, `Started turning ${b.label} into ${what}`, 0); }
  return site;
}
function finishUpgrade(w, site, owners) {
  const b = w.byId.get(site.upgradeOf), into = PROJECTS[site.type].into;
  if (!b) return;
  b.type = into.type; b.art = into.art; b.upgradedDay = dayOf(w.time);
  w.lastUpgrade = w.time;
  const T = BUILDING_TYPES[b.type];
  if (T.home) {
    b.label = `${T.label} ${w.buildings.filter(x => x.type === b.type).length}`;
    for (const t of residentsOf(w, b)) { addThought(t, w, 'better_home'); remember(t, w, `Home became ${site.what}`); }
  }
  if (b === w.canteen) for (let k = 0; k < 2; k++) { // room for two more tables straight away
    const p = chooseTableSpot(w);
    if (p) { claimGround(w, p); addTable(w, p.x, p.y); }
  }
}
