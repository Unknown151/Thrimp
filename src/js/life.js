// ============================================================
// LIFE: ages, health, sickness, births, deaths, grief and graves. Thrimps live about 40 game days.
// ============================================================
const CHILD_DAYS = 8;            // a child grows up after this many days
const ELDER_DAYS = 30;           // and turns old after this many
const LIFESPAN = [34, 46];       // days; each Thrimp is given its own at birth
const YEARS_PER_DAY = 2;         // ages are shown in years: 40 days is 80 years
const POP_CAP = 40;              // births stop here (the sim is tuned for a few dozen)

const ageDays = (th, w) => (w.time - th.born) / DAY;
const ageYears = (th, w) => Math.floor(ageDays(th, w) * YEARS_PER_DAY);
const stageFor = days => days < CHILD_DAYS ? 'child' : days >= ELDER_DAYS ? 'elder' : 'adult';
const STAGE_LABEL = { child: 'Child', adult: 'Adult', elder: 'Elder' };
// Walking pace: children and elders are slower, and so is anyone badly hurt.
const paceOf = th => (th.stage === 'child' ? 0.85 : th.stage === 'elder' ? 0.75 : 1) * (th.health < 0.4 ? 0.8 : 1);
const isFamily = (a, b) => a.parents.includes(b.id) || b.parents.includes(a.id) || a.parents.some(p => b.parents.includes(p));
function familyLabel(a, b) {
  if (a.parents.includes(b.id)) return 'Parent';
  if (b.parents.includes(a.id)) return 'Child';
  if (a.parents.some(p => b.parents.includes(p))) return 'Sibling';
  return '';
}
const HAIRS = ['black', 'black', 'brown', 'brown', 'ginger', 'blond', 'plum'];

// Life fields for a new Thrimp. Starting colonists are adults of all ages; the born arrive as babies (age 0).
function lifeFields(w, ageInDays) {
  return {
    born: w.time - ageInDays * DAY, lifespan: randRange(LIFESPAN[0], LIFESPAN[1]), stage: stageFor(ageInDays),
    health: 1, sick: null, immuneUntil: 0, parents: [], hair: pick(HAIRS), expecting: 0, lastChild: -1e9, mourn: [], // (JSON has no -Infinity)
  };
}
// Old saves (from before the life cycle) get these on load.
function ensureLife(th, w) {
  if (th.born !== undefined) return;
  Object.assign(th, lifeFields(w, randRange(10, 26)));
}

// --- Every tick: the body ---
function updateBody(th, w, dt) {
  let d = 0;
  if (th.needs.food <= 0) d -= dt / (1.5 * DAY);                             // starving: about a day and a half
  if (th.sick) d -= th.sick.severity * dt / DAY * (th.asleep ? 0.5 : 1);  // resting in bed halves the toll
  else if (th.needs.food > 0.2) d += dt / (2 * DAY);                       // wounds heal while fed
  th.health = clamp(th.health + d, 0, 1);
  if (th.health <= 0) markDead(th, w, th.needs.food <= 0 ? 'starvation' : th.sick ? 'sickness' : 'wounds');
}
// A blow in a fight. Children are spared the worst; a killing blow is recorded with its killer.
function hurt(th, w, amount, by, cause = 'wounds') {
  if (th.stage === 'child') amount *= 0.4;
  th.health = clamp(th.health - amount, 0, 1);
  if (th.health <= 0) markDead(th, w, cause, by ? by.id : 0);
}

// --- Every 10 minutes (from refreshMind): sickness comes and goes ---
function checkHealth(th, w) {
  if (th.sick) {
    if (w.time >= th.sick.until) {
      th.sick = null;
      th.immuneUntil = w.time + 10 * DAY;
      addThought(th, w, 'recovered');
      remember(th, w, 'Got over the fever');
    }
    return;
  }
  if (w.time < th.immuneUntil) return;
  let p = 0.004 * MIND_EVERY / DAY; // about one in 250 a day
  if (th.thoughts.some(t => t.id === 'got_soaked')) p *= 3;
  if (th.needs.food < 0.1) p *= 3;
  if (th.stage !== 'adult') p *= 2;
  if (rand() < p) fallSick(th, w);
}
function fallSick(th, w, from) {
  const frail = th.stage === 'adult' ? 1 : 1.8; // the young and the old take it harder
  th.sick = { since: w.time, until: w.time + randRange(1, 3) * DAY, severity: randRange(0.15, 0.45) * frail };
  remember(th, w, from ? `Caught the fever from ${from.name}` : 'Came down with a fever');
  if (from) memorize(th, w, `Caught a fever from ${from.name}`, from.id);
  emote(th, w, 'sick', 30);
  const sick = w.thrimps.filter(t => t.sick).length;
  if (sick >= 3 && w.time - (w.lastOutbreak || -Infinity) > 2 * DAY) {
    w.lastOutbreak = w.time;
    raiseAlert(w, `A fever is going around: ${sick} are sick`, th.x, th.y, [th.id]);
  }
}
// Called when two Thrimps meet (socialTick): a fever can jump between them.
function spreadSickness(a, b, w) {
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.sick && !y.sick && w.time >= y.immuneUntil && chance(0.05)) fallSick(y, w, x);
  }
}

// --- Hourly: growing up, growing old, children, and dying of age ---
function lifeHourly(w) {
  for (const th of w.thrimps) {
    if (th.dead) continue;
    const days = ageDays(th, w), stage = stageFor(days);
    if (stage !== th.stage) {
      const was = th.stage;
      th.stage = stage;
      if (was === 'child') {
        addThought(th, w, 'grew_up');
        remember(th, w, 'Grew up');
        memorize(th, w, 'Grew up', 0);
        raiseAlert(w, `${th.name} has grown up`, th.x, th.y, [th.id], true);
      } else if (stage === 'elder') {
        remember(th, w, 'Getting on in years');
      }
    }
    // Old age: past their span they go, often in their sleep.
    if (days >= th.lifespan && (th.asleep || days >= th.lifespan + 0.5 || chance(0.08))) markDead(th, w, 'old age');
  }
  for (const a of w.thrimps) {
    const b = a.partner && byId(w, a.partner);
    if (!b || a.id > b.id || a.dead || b.dead) continue;
    if (a.expecting) { if (w.time >= a.expecting) giveBirth(w, a, b); continue; }
    const kids = w.thrimps.filter(t => t.parents.includes(a.id) && t.parents.includes(b.id)).length;
    const ready = a.stage === 'adult' && b.stage === 'adult' && (a.home || b.home)
      && opinionOf(a, b) >= 50 && opinionOf(b, a) >= 50 && kids < 5 && w.time - a.lastChild > 2.5 * DAY
      && w.thrimps.length < POP_CAP && w.stock.food >= w.thrimps.length * 1.5;
    if (ready && chance(1 / 24)) { // about once a day for a happy couple with a roof, then a day and a half to wait
      a.expecting = b.expecting = w.time + 1.5 * DAY;
      for (const [x, y] of [[a, b], [b, a]]) { addThought(x, w, 'expecting'); memorize(x, w, `Expecting a child with ${y.name}`, y.id); }
      raiseAlert(w, `${a.name} and ${b.name} are expecting a child`, a.x, a.y, [a.id, b.id], true);
    }
  }
}

function giveBirth(w, a, b) {
  a.expecting = b.expecting = 0;
  a.lastChild = b.lastChild = w.time;
  const homeId = a.home || b.home, home = w.byId.get(homeId), door = home ? home.door : { x: a.x, y: a.y };
  const child = makeThrimp(w, door.x + randRange(-4, 4), door.y + 3, homeId, 0);
  child.parents = [a.id, b.id];
  // Traits run in families: each of the parents' traits passes on half the time; the rest is the child's own.
  const inherited = [...new Set([...a.traits, ...b.traits])].filter(() => chance(0.5));
  const traits = [];
  for (const t of inherited) if (traits.length < 3 && !traits.includes(TRAITS[t].opposite)) traits.push(t);
  for (const t of pickTraits()) if (traits.length < 2 && !traits.includes(t) && !traits.includes(TRAITS[t].opposite)) traits.push(t);
  child.traits = traits;
  child.hair = chance(0.9) ? pick([a.hair, b.hair]) : pick(HAIRS);
  child.schedule = { wake: randRange(6, 7.5), bed: randRange(19.5, 20.5) }; // children go to bed early
  // Family warmth, and the family's feuds: a child takes on a share of what its parents feel strongly about.
  for (const p of [a, b]) {
    child.opinions[p.id] = 40; p.opinions[child.id] = 50;
    child.chemistry[p.id] = p.chemistry[child.id] = randRange(0.1, 0.6);
    for (const [id, op] of Object.entries(p.opinions)) {
      if (+id === child.id || Math.abs(op) < 40 || child.opinions[id] !== undefined) continue;
      child.opinions[id] = Math.round(op * 0.4);
      if ((p.grudges[id] || 0) >= 3) child.grudges[id] = 1;
    }
    addThought(p, w, 'new_child');
    memorize(p, w, `Had a child: ${child.name}`, child.id);
    remember(p, w, `Became a parent to ${child.name}`);
  }
  for (const s of w.thrimps.filter(t => t !== child && t.parents.some(id => child.parents.includes(id)))) {
    child.opinions[s.id] = 25; s.opinions[child.id] = 25;
    addThought(s, w, 'new_sibling');
  }
  memorize(child, w, `Born to ${a.name} and ${b.name}`, 0);
  remember(child, w, 'Was born');
  w.thrimps.push(child);
  w.stats.births = (w.stats.births || 0) + 1;
  raiseAlert(w, `${a.name} and ${b.name} had a child: ${child.name}`, child.x, child.y, [child.id], true);
  return child;
}

// --- Death ---
const CAUSE_TEXT = { 'old age': 'of old age', starvation: 'of hunger', sickness: 'of a fever', wounds: 'of their wounds', killed: 'killed' };
// Deaths are queued and handled at the end of the tick, so nobody vanishes from a list someone is walking through.
function markDead(th, w, cause, killer = 0) {
  if (th.dead) return;
  th.dead = { cause, killer };
  (w.dying || (w.dying = [])).push(th);
}
function processDeaths(w) {
  if (!w.dying || !w.dying.length) return;
  for (const th of w.dying) {
    if (!w.thrimps.includes(th)) continue;
    const { cause, killer: killerId } = th.dead, killer = killerId && byId(w, killerId);
    if (th.job) finishJob(th, w, false);
    for (const b of w.buildings) if (b.sleepers) b.sleepers = b.sleepers.filter(id => id !== th.id);
    w.thrimps = w.thrimps.filter(t => t !== th);
    const grave = digGrave(w, th);
    w.dead.push({ id: th.id, name: th.name, born: th.born, died: w.time, cause, killer: killerId, parents: th.parents,
      partner: th.partner, traits: th.traits, hair: th.hair, grave: grave ? grave.id : 0 });
    const years = ageYears(th, w), how = CAUSE_TEXT[cause] || cause;
    for (const o of w.thrimps) grieve(o, th, w, how, killer, grave);
    if (killer) blameKiller(w, th, killer);
    w.stats.deaths = (w.stats.deaths || 0) + 1;
    raiseAlert(w, killer ? `${killer.name} killed ${th.name}!` : `${th.name} died ${how}, aged ${years}`, th.x, th.y,
      killer ? [killer.id] : []);
  }
  w.dying = [];
}
function grieve(o, dead, w, how, killer, grave) {
  const op = opinionOf(o, dead), partner = o.partner === dead.id, fam = isFamily(o, dead);
  if (partner) { o.partner = 0; addThought(o, w, 'lost_partner'); }
  else if (fam) addThought(o, w, 'lost_family');
  else if (op >= 40) addThought(o, w, 'lost_friend');
  else if (op <= -50) addThought(o, w, 'enemy_died'); // grimy, but true
  if (partner || fam || Math.abs(op) >= 40 || o.home === dead.home) {
    memorize(o, w, killer ? `${dead.name} was killed by ${killer.name}` : `${dead.name} died ${how}`, dead.id);
  }
  if ((partner || fam || op >= 40) && grave) { o.mourn.push(grave.id); emote(o, w, 'tear', 40); }
  if (dist(o.x, o.y, dead.x, dead.y) < SIGHT && !o.hidden && !o.asleep && (killer || dead.dead.cause === 'wounds')) addThought(o, w, 'saw_death');
}
// A killing turns the victim's people against the killer for good, and the rest of the colony too.
function blameKiller(w, victim, killer) {
  for (const o of w.thrimps) {
    if (o === killer) continue;
    meetFirst(o, killer);
    const close = o.partner === victim.id || isFamily(o, victim) || opinionOf(o, victim) >= 20;
    changeOpinion(o, killer, close ? -60 : -15);
    if (close) addGrudge(o, killer, 4);
  }
  addThought(killer, w, hasTrait(killer, 'violent') ? 'killed_violent' : 'took_a_life');
  memorize(killer, w, `Killed ${victim.name}`, victim.id);
  remember(killer, w, `Killed ${victim.name}`);
}

// --- Graves: the first death picks a quiet spot for a graveyard; graves are laid out in rows from there ---
function digGrave(w, dead) {
  if (!w.graveyard) w.graveyard = chooseGraveyard(w);
  if (!w.graveyard) return null;
  const g = w.graveyard;
  for (let i = w.graves.length; i < w.graves.length + 40; i++) {
    const col = i % 5, row = Math.floor(i / 5);
    const x = g.x + (col - 2) * 15 + (row % 2) * 4, y = g.y + row * 13;
    if (isWater(w, x, y) || isBlocked(w, x, y) || w.graves.some(o => dist(o.x, o.y, x, y) < 10)) continue;
    const grave = { id: w.nextId++, x: Math.round(x), y: Math.round(y), of: dead.id, name: dead.name, day: dayOf(w.time) };
    w.graves.push(grave);
    return grave;
  }
  return null;
}
function chooseGraveyard(w) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 80; i++) {
    const ang = rand() * Math.PI * 2, r = randRange(170, 280);
    const p = checkPlacement(w, 'hut', w.canteen.x + Math.cos(ang) * r * 1.2, w.canteen.y + Math.sin(ang) * r * 0.8);
    if (!p || nearestVisibleNode(w, p.x, p.y + 5) < 0) continue;
    // A quiet spot: away from the houses, a little shade from trees is nice.
    const houses = w.buildings.filter(b => dist(b.x, b.y, p.x, p.y) < 120).length;
    const trees = w.trees.filter(t => dist(t.x, t.y, p.x, p.y) < 90).length;
    const s = -houses * 2 + Math.min(trees, 4) * 0.3 + rand() * 0.5;
    if (s > bestScore) { bestScore = s; best = { x: p.x, y: p.y - p.h }; }
  }
  return best;
}
const graveById = (w, id) => w.graves.find(g => g.id === id);

// The bereaved go and stand at the grave once; later, a grave of someone they loved is a place to sit and remember.
function makeMournJob(th, w) {
  const grave = graveById(w, th.mourn[0]);
  if (!grave) { th.mourn.shift(); return null; }
  return job(`Mourning ${grave.name}`, [
    goTo(grave.x + randRange(-8, 8), grave.y + 9, `Walking to ${grave.name}'s grave`),
    act(randRange(30, 50), `Standing at ${grave.name}'s grave`, {
      begin: t => { t.dir = 'north'; emote(t, w, 'tear', 30); },
      finish: t => { addThought(t, w, 'paid_respects'); remember(t, w, `Said goodbye to ${grave.name}`); },
    }),
  ], { cleanup: t => { t.mourn = t.mourn.filter(id => id !== grave.id); } });
}
// A loved one's grave this Thrimp might sit by when taking it easy.
function lovedGrave(th, w) {
  const loved = w.dead.filter(d => d.grave && (th.parents.includes(d.id) || d.parents.some(p => th.parents.includes(p) || p === th.id)
    || opinionOf(th, d) >= 40));
  const d = loved.length && pick(loved);
  return d ? graveById(w, d.grave) : null;
}
