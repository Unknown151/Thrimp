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
// What each trait actually does, for the inspector's tooltip. Keep in step with the code that reads the traits.
const TRAIT_EFFECTS = {
  'hard-working': ['Works about 35% more', 'Relaxes a little less', 'Feels good after a stint of work (+5)', 'Clashes with the lazy'],
  lazy:           ['Works about 40% less', 'Lounges about 35% more', 'Often grumbles after working (-4)', 'Clashes with the hard-working'],
  greedy:         ['Eats a double portion at the canteen (+3)', 'Frets when the stores run low (-5)', 'Likelier to binge eat when breaking down'],
  curious:        ['Wanders about 2.5x as often, and twice as far', 'Chats more with people they barely know', 'Likelier to wander off when breaking down'],
  shy:            ['Needs company less', 'Starts fewer conversations', 'Hates eating at a crowded table (-5)', 'Slinks off humiliated when insulted (-4)', 'Likelier to sulk when breaking down', 'Clashes with hotheads'],
  hotheaded:      ['Breaks down sooner (at -24 instead of -32)', 'Insults people they merely dislike', 'Swings back when insulted by someone they hate', 'Picks fights more often', 'Likelier to smash things when breaking down', 'Rubs most people the wrong way'],
  spiteful:       ['Every grudge counts double', 'Bad turns hurt their opinion 50% more', 'Never forgives: bad opinions don\'t fade', 'Insults more readily', 'Rubs most people the wrong way', 'Clashes with the cunning'],
  violent:        ['Far likelier to start a fight, and to win it', 'Hits harder', 'Enjoys winning a fight (+3)', 'May lash out at someone when breaking down', 'At breaking point, may go after their worst enemy to kill', 'Likelier to smash things when breaking down'],
  cunning:        ['Flatters people freely', 'Their insults sting half as much', 'Clashes with the spiteful'],
  cheerful:       ['Mood +8', 'Conversations go a little better', 'Clashes with the gloomy'],
  gloomy:         ['Mood -8', 'Conversations go a little worse', 'Likelier to sulk when breaking down', 'Clashes with the cheerful'],
  'early-riser':  ['Wakes and goes to bed about 1.5 hours earlier'],
  'night-owl':    ['Wakes and goes to bed about 1.2 hours later'],
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
  // Weather (weather.js)
  got_soaked:     { label: 'Got soaked in the rain', mood: -3, mins: 3 * HOUR },
  rain_on_roof:   { label: 'Fell asleep to rain on the roof', mood: 3, mins: 8 * HOUR },
  sunshine:       { label: 'Enjoyed the sunshine', mood: 2, mins: 4 * HOUR },
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
  // Life and death (life.js)
  grew_up:        { label: 'All grown up', mood: 6, mins: 2 * DAY },
  expecting:      { label: 'Expecting a child', mood: 6, mins: 2 * DAY },
  new_child:      { label: 'Had a child', mood: 12, mins: 3 * DAY },
  new_sibling:    { label: 'Got a little brother or sister', mood: 3, mins: DAY },
  recovered:      { label: 'Over the fever', mood: 4, mins: DAY },
  lost_partner:   { label: 'Lost my partner', mood: -25, mins: 6 * DAY },
  lost_family:    { label: 'Lost family', mood: -18, mins: 5 * DAY },
  lost_friend:    { label: 'Lost a friend', mood: -10, mins: 3 * DAY },
  enemy_died:     { label: 'Someone I hated is dead', mood: 4, mins: DAY },
  saw_death:      { label: 'Saw someone die', mood: -12, mins: 2 * DAY },
  paid_respects:  { label: 'Said goodbye at the grave', mood: 4, mins: DAY },
  visited_grave:  { label: 'Sat by a loved one\'s grave', mood: 2, mins: 8 * HOUR },
  took_a_life:    { label: 'Killed someone', mood: -18, mins: 5 * DAY },
  killed_violent: { label: 'Killed someone', mood: -4, mins: 2 * DAY },
  // Buildings (projects.js)
  built_something:{ label: 'Built something for everyone', mood: 5, mins: 2 * DAY },
  fireside:       { label: 'An evening by the fire', mood: 4, mins: 10 * HOUR },
  remembered:     { label: 'Remembered them at the memorial stone', mood: 3, mins: DAY },
  played:         { label: 'Played at the play area', mood: 4, mins: 8 * HOUR },
  cared_for:      { label: 'Nursed back to health', mood: 5, mins: 2 * DAY },
  // Conditions: recomputed every refresh while they hold, so they last only as long as the cause.
  crowded_home:   { label: 'Home is too crowded', mood: -4 },
  sick:           { label: 'Sick with a fever', mood: -8 },
  hurt:           { label: 'In pain', mood: -6 },
  frail:          { label: 'Old bones', mood: -2 },
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
  else {
    const home = w.byId.get(th.home), T = home && BUILDING_TYPES[home.type];
    if (T && T.home && residentsOf(w, home).length > T.room) out.push('crowded_home');
  }
  if (th.sick) out.push('sick');
  if (th.health < 0.5) out.push('hurt');
  if (th.stage === 'elder') out.push('frail');
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
  weatherThoughts(th, w);
  checkHealth(th, w);
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
    emote(th, w, 'idea', 60);
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
  // The worst of it: a violent Thrimp at breaking point goes after the one they hate most, to kill.
  murder: { label: 'Out for blood', weight: th => hasTrait(th, 'violent') && th.stage !== 'child' ? 0.6 : 0, make: makeMurderJob },
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
    raiseAlert(w, `${th.name} snapped: ${BREAKS[k].label.toLowerCase()}`, th.x, th.y, [th.id]);
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
        if (target.kind === 'crate') { // berries everywhere (with a storehouse, only what was in the crate)
          w.stock.food -= Math.floor((buildingOf(w, 'storehouse') ? Math.min(w.stock.food, CRATE_HOLDS) : w.stock.food) * 0.4);
          w.stats.crate_smashed = (w.stats.crate_smashed || 0) + 1;
        }
        remember(t, w, target.kind === 'crate' ? 'Smashed the food crate, berries everywhere' : 'Smashed a canteen table');
        raiseAlert(w, `${t.name} smashed ${target.kind === 'crate' ? 'the food crate' : 'a canteen table'}!`, o.x, o.y, [t.id]);
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
