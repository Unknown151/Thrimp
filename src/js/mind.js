// ============================================================
// MIND: traits, moodlets (timed thoughts), mental breaks, inspirations
// ============================================================
// Traits weight decisions. work / relax / wander multiply those actions' scores; baseMood shifts mood;
// schedule shifts wake and bed time (hours). The social traits only start to bite once Thrimps meet (build step 3).
const TRAITS = {
  'hard-working': { label: 'Hard-working', desc: 'Works more, and feels good after a day\'s work.', work: 1.35, relax: 0.8, opposite: 'lazy' },
  lazy:           { label: 'Lazy', desc: 'Shirks work, lounges about, grumbles when made to work.', work: 0.6, relax: 1.35, opposite: 'hard-working' },
  greedy:         { label: 'Greedy', desc: 'Eats double portions; frets when the stores run low.' },
  curious:        { label: 'Curious', desc: 'Wanders off to look at things.', wander: 2.5 },
  shy:            { label: 'Shy', desc: 'Hates eating at a crowded table; sulks when it breaks.' },
  hotheaded:      { label: 'Hotheaded', desc: 'Snaps sooner under stress, and things get smashed.' },
  spiteful:       { label: 'Spiteful', desc: 'Holds grudges.' },
  violent:        { label: 'Violent', desc: 'Lashes out when it all gets too much.' },
  cunning:        { label: 'Cunning', desc: 'Always has an angle.' },
  cheerful:       { label: 'Cheerful', desc: 'A sunny disposition.', baseMood: 8, opposite: 'gloomy' },
  gloomy:         { label: 'Gloomy', desc: 'Always sees the grey side.', baseMood: -8, opposite: 'cheerful' },
  'early-riser':  { label: 'Early riser', desc: 'Up at dawn, in bed early.', schedule: -1.5, opposite: 'night-owl' },
  'night-owl':    { label: 'Night owl', desc: 'Up late, slow to rise.', schedule: 1.2, opposite: 'early-riser' },
};
function pickTraits() {
  const out = [];
  const want = chance(0.4) ? 3 : 2;
  const pool = Object.keys(TRAITS);
  while (out.length < want) {
    const t = pick(pool);
    if (out.includes(t) || out.includes(TRAITS[t].opposite)) continue;
    out.push(t);
  }
  return out;
}
const hasTrait = (th, t) => th.traits.includes(t);
const traitMult = (th, key) => th.traits.reduce((m, t) => m * (TRAITS[t][key] || 1), 1);

// Thoughts: a stack of timed moodlets, as in the design doc. `mins` is how long one lasts.
const THOUGHTS = {
  ate_meal:       { label: 'Ate a proper meal', mood: 4, mins: 6 * HOUR },
  big_meal:       { label: 'Stuffed myself', mood: 3, mins: 6 * HOUR },
  ate_standing:   { label: 'No seat at the canteen', mood: -2, mins: 3 * HOUR },
  crowded_table:  { label: 'Had to eat at a crowded table', mood: -5, mins: 4 * HOUR },
  ate_raw:        { label: 'Ate raw berries off a bush', mood: -2, mins: 4 * HOUR },
  slept_home:     { label: 'Slept in my own bed', mood: 3, mins: 14 * HOUR },
  slept_rough:    { label: 'Slept on the cold ground', mood: -8, mins: 16 * HOUR },
  woke_hungry:    { label: 'Woke up hungry', mood: -3, mins: 3 * HOUR },
  relaxed_water:  { label: 'Watched the water for a while', mood: 5, mins: 8 * HOUR },
  relaxed_grass:  { label: 'Lay in the grass', mood: 3, mins: 6 * HOUR },
  relaxed_canteen:{ label: 'Rested at the canteen', mood: 2, mins: 5 * HOUR },
  good_work:      { label: 'Did an honest day\'s work', mood: 5, mins: 10 * HOUR },
  made_to_work:   { label: 'Worked far too much', mood: -4, mins: 6 * HOUR },
  catharsis:      { label: 'Let it all out', mood: 12, mins: 36 * HOUR },
  inspired:       { label: 'Inspired!', mood: 8, mins: DAY },
  built_home:     { label: 'Built my own home', mood: 10, mins: 2 * DAY },
  // Social (social.js)
  nice_chat:      { label: 'Had a nice chat', mood: 3, mins: 6 * HOUR },
  awkward_chat:   { label: 'Had a grating conversation', mood: -3, mins: 6 * HOUR },
  complimented:   { label: 'Got a compliment', mood: 3, mins: 6 * HOUR },
  insulted:       { label: 'Got insulted', mood: -6, mins: 10 * HOUR },
  humiliated:     { label: 'Humiliated in front of others', mood: -4, mins: 10 * HOUR },
  rejected:       { label: 'Was turned down', mood: -6, mins: DAY },
  new_partner:    { label: 'Fell in love', mood: 12, mins: 2 * DAY },
  kissed:         { label: 'Shared a kiss', mood: 4, mins: 6 * HOUR },
  got_in_fight:   { label: 'Got into a fight', mood: -10, mins: DAY },
  beaten:         { label: 'Got beaten up', mood: -6, mins: DAY },
  won_fight:      { label: 'Won a fight', mood: 3, mins: 12 * HOUR },
  saw_fight:      { label: 'Saw a fight', mood: -3, mins: 8 * HOUR },
  heartbroken:    { label: 'Heartbroken', mood: -15, mins: 3 * DAY },
  // Conditions: recomputed every refresh while they hold, so they last only as long as the cause.
  hungry:         { label: 'Hungry', mood: -6 },
  starving:       { label: 'Starving', mood: -18 },
  tired:          { label: 'Tired', mood: -5 },
  exhausted:      { label: 'Exhausted', mood: -12 },
  bored:          { label: 'Bored', mood: -4 },
  homeless:       { label: 'Has no home', mood: -6 },
  stores_low:     { label: 'The food stores are running low', mood: -5 },
  broken_table:   { label: 'Someone smashed a canteen table', mood: -2 },
  broken_crate:   { label: 'The food crate is smashed', mood: -3 },
  lonely:         { label: 'Lonely', mood: -5 },
  in_love:        { label: 'In love', mood: 5 },
};
const MIND_EVERY = 10; // game minutes between mood refreshes

function addThought(th, w, id) {
  const T = THOUGHTS[id];
  const old = th.thoughts.find(t => t.id === id);
  if (old) old.until = w.time + T.mins; // the same thought again refreshes it rather than stacking
  else th.thoughts.push({ id, mood: T.mood, until: w.time + T.mins });
  th.mood = moodOf(th, w);
}
function moodOf(th, w) {
  const base = th.traits.reduce((m, t) => m + (TRAITS[t].baseMood || 0), 0);
  return clamp(th.thoughts.filter(t => t.until > w.time).reduce((sum, t) => sum + t.mood, base), -100, 100);
}
function moodLabel(m) {
  return m >= 25 ? 'Happy' : m >= 8 ? 'Content' : m > -8 ? 'Fine' : m > -20 ? 'Stressed' : m > -32 ? 'On edge' : 'Breaking';
}
const breakThreshold = th => hasTrait(th, 'hotheaded') ? -24 : -32;

function conditionThoughts(th, w) {
  const n = th.needs, out = [];
  if (n.food < 0.1) out.push('starving'); else if (n.food < 0.3) out.push('hungry');
  if (n.rest < 0.08) out.push('exhausted'); else if (n.rest < 0.25) out.push('tired');
  if (n.fun < 0.2) out.push('bored');
  if (n.social < 0.2) out.push('lonely');
  if (th.partner) out.push('in_love');
  if (!th.home) out.push('homeless');
  if (hasTrait(th, 'greedy') && w.stock.food < w.thrimps.length) out.push('stores_low');
  if (w.tables.some(t => t.broken)) out.push('broken_table');
  if (w.crate.broken) out.push('broken_crate');
  return out;
}

// Runs every MIND_EVERY minutes: drop old thoughts, re-check conditions, maybe break or get inspired.
function refreshMind(th, w) {
  th.thoughts = th.thoughts.filter(t => THOUGHTS[t.id].mins && t.until > w.time); // conditions are re-added below
  refreshRelations(th, w);
  for (const id of conditionThoughts(th, w)) th.thoughts.push({ id, mood: THOUGHTS[id].mood, until: w.time + MIND_EVERY + 1 });
  th.mood = moodOf(th, w);
  if (th.inspiration && th.inspiration.until <= w.time) { th.inspiration = null; remember(th, w, 'The inspiration faded'); }

  if (th.breaking || th.asleep) return;
  // Low mood for hours on end can snap a Thrimp; great mood can inspire one.
  th.lowFor = th.mood < breakThreshold(th) ? th.lowFor + MIND_EVERY : 0;
  th.highFor = th.mood >= 18 ? th.highFor + MIND_EVERY : 0; // a good day (meal, rest, honest work) gets there
  if (th.lowFor >= 2 * HOUR && chance(0.12)) startBreak(th, w);
  else if (!th.inspiration && th.highFor >= 3 * HOUR && chance(0.05)) {
    th.inspiration = { type: 'work', until: w.time + DAY };
    th.highFor = 0;
    addThought(th, w, 'inspired');
    emote(th, w, 'note', 60);
    remember(th, w, 'Got inspired: a work frenzy');
  }
}

// Finishing a stint of work: the hard-working feel good about it, the lazy feel put upon.
function afterWork(th, w) {
  if (hasTrait(th, 'hard-working')) addThought(th, w, 'good_work');
  else if (hasTrait(th, 'lazy') && chance(0.4)) addThought(th, w, 'made_to_work');
}

// --- Mental breaks: what a snapped Thrimp does depends on who they are ---
const BREAKS = {
  binge:  { label: 'Binge eating', weight: th => hasTrait(th, 'greedy') ? 3 : 1, make: makeBingeJob },
  wander: { label: 'Wandering off in a daze', weight: th => hasTrait(th, 'curious') ? 3 : 1, make: makeWanderOffJob },
  sulk:   { label: 'Sulking alone', weight: th => hasTrait(th, 'shy') || hasTrait(th, 'gloomy') ? 3 : 1, make: makeSulkJob },
  smash:  { label: 'Smashing things', weight: th => 0.4 + (hasTrait(th, 'hotheaded') ? 2.5 : 0) + (hasTrait(th, 'violent') ? 2.5 : 0), make: makeSmashJob },
  lashout: { label: 'Lashing out', weight: th => (hasTrait(th, 'violent') ? 3 : 0.1) + (hasTrait(th, 'hotheaded') ? 1 : 0), make: makeLashOutJob },
};
function startBreak(th, w, type) {
  const options = Object.keys(BREAKS).map(k => ({ k, j: null }));
  for (let tries = 0; tries < 4; tries++) {
    const k = type || weightedPick(options, o => BREAKS[o.k].weight(th)).k;
    const j = BREAKS[k].make(th, w);
    if (!j) { if (type) return false; continue; }
    if (th.job) finishJob(th, w, true);
    th.breaking = { type: k, since: w.time };
    th.lowFor = 0;
    th.breaks = (th.breaks || 0) + 1;
    j.cleanup = chainCleanup(j.cleanup, t => endBreak(t, w));
    startJob(th, w, j, 'break');
    remember(th, w, `Snapped: ${BREAKS[k].label.toLowerCase()}`);
    emote(th, w, '!', 40);
    return true;
  }
  return false;
}
const chainCleanup = (a, b) => (t, w) => { if (a) a(t, w); b(t, w); };
function endBreak(th, w) {
  if (!th.breaking) return;
  th.breaking = null;
  addThought(th, w, 'catharsis');
}

function makeBingeJob(th, w) {
  if (w.stock.food < 2) return null;
  const spot = { x: w.store.x + randRange(-6, 6), y: w.store.y + randRange(1, 4) };
  return job('Binge eating', [
    goTo(spot.x, spot.y, 'Heading for the food store'),
    act(60, 'Stuffing their face from the stores', {
      begin: t => { t.dir = 'north'; },
      each: (t, w2, dt) => {
        t.binged = (t.binged || 0) + dt;
        if (t.binged >= 15 && w.stock.food >= 1) { t.binged -= 15; w.stock.food -= 1; eat(t, 0.4); }
      },
      end: t => { t.binged = 0; },
    }),
  ]);
}
function makeWanderOffJob(th, w) {
  const far = w.graph.nodes.filter(n => n.main && dist(n.x, n.y, th.x, th.y) > 300);
  const n = pick(far);
  if (!n) return null;
  return job('Wandering off in a daze', [
    goTo(n.x, n.y, 'Walking away from everything'),
    act(randRange(2, 4) * HOUR, 'Staring at nothing'),
  ]);
}
function makeSulkJob(th, w) {
  const home = w.byId.get(th.home);
  if (!home) return makeWanderOffJob(th, w);
  return job('Sulking alone', [
    goTo(home.door.x, home.door.y, 'Stomping home'),
    { label: 'Sulking at home with the door shut',
      start(t) { t.hidden = true; t.sulkLeft = randRange(3, 5) * HOUR; },
      update(t, w2, dt) { t.sulkLeft -= dt; return t.sulkLeft <= 0; },
      end(t) { t.hidden = false; t.y = t.py = home.door.y + 2; t.x = t.px = home.door.x; t.dir = 'south'; } },
  ]);
}
// Smash a canteen table or the food crate. Wrecking the crate spills food; either needs wood to repair.
function makeSmashJob(th, w) {
  const targets = [...w.tables.filter(t => !t.broken).map(t => ({ kind: 'table', obj: t })),
    ...(w.crate.broken ? [] : [{ kind: 'crate', obj: w.crate }])];
  const target = pick(targets);
  if (!target) return null;
  const side = chance(0.5) ? -14 : 14, o = target.obj;
  return job('Smashing things', [
    goTo(o.x + side, o.y + 2, `Storming over to the ${target.kind === 'crate' ? 'food crate' : 'canteen table'}`),
    act(20, `Smashing the ${target.kind === 'crate' ? 'food crate' : 'table'}`, {
      begin: t => { t.dir = side < 0 ? 'east' : 'west'; t.working = 'chop'; },
      finish: t => {
        o.broken = true;
        if (target.kind === 'crate') w.stock.food -= Math.floor(w.stock.food * 0.4); // berries everywhere
        remember(t, w, target.kind === 'crate' ? 'Smashed the food crate, berries everywhere' : 'Smashed a canteen table');
      },
      end: t => { t.working = false; },
    }),
  ]);
}

// --- Repairs give wood its first use ---
const REPAIR_WOOD = 4;
function brokenThings(w) {
  return [...w.tables.filter(t => t.broken).map(t => ({ kind: 'table', obj: t })),
    ...(w.crate.broken ? [{ kind: 'crate', obj: w.crate }] : [])];
}
function makeRepairJob(th, w) {
  const target = brokenThings(w).find(b => !b.obj.repairBy || b.obj.repairBy === th.id);
  if (!target || w.stock.wood < REPAIR_WOOD) return null;
  const o = target.obj, side = chance(0.5) ? -14 : 14;
  o.repairBy = th.id;
  return job(`Fixing the ${target.kind === 'crate' ? 'food crate' : 'canteen table'}`, [
    goTo(o.x + side, o.y + 2, 'Walking over with some planks'),
    act(40, 'Hammering it back together', {
      begin: t => { if (w.stock.wood < REPAIR_WOOD) return 'fail'; w.stock.wood -= REPAIR_WOOD; t.dir = side < 0 ? 'east' : 'west'; t.working = 'chop'; },
      finish: t => { o.broken = false; remember(t, w, `Fixed the ${target.kind === 'crate' ? 'food crate' : 'canteen table'}`); afterWork(t, w); },
      end: t => { t.working = false; },
    }),
  ], { cleanup: () => { if (o.repairBy === th.id) o.repairBy = 0; } });
}
