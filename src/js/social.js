// ============================================================
// SOCIAL: noticing, opinions, encounters, witnesses, gossip
// ============================================================
const SIGHT = 48;             // px a Thrimp notices others within (and witnesses what they do)
const MEET = 22;              // px close enough for an encounter
const SOCIAL_COOLDOWN = 20;   // game minutes between one Thrimp's encounters
const PERCEIVE_EVERY = 3;     // game minutes between looks around

// Invisible spatial hash (data only): each Thrimp only checks its own and the adjacent buckets.
const HASH = 64;
function buildSpatialHash(w) {
  const cols = Math.ceil(MAP_W / HASH), m = new Map();
  for (const th of w.thrimps) {
    if (th.hidden) continue;
    const k = Math.floor(th.x / HASH) + Math.floor(th.y / HASH) * cols;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(th);
  }
  w.hash = { cols, m };
}
function neighbours(w, th, r) {
  const { cols, m } = w.hash, out = [];
  const bx = Math.floor(th.x / HASH), by = Math.floor(th.y / HASH);
  for (let j = by - 1; j <= by + 1; j++) for (let i = bx - 1; i <= bx + 1; i++) {
    if (i < 0 || j < 0 || i >= cols) continue;
    for (const o of m.get(i + j * cols) || []) if (o !== th && dist(o.x, o.y, th.x, th.y) <= r) out.push(o);
  }
  return out;
}

// --- Opinions (-100 hate ... +100 love), grudges and memories ---
const opinionOf = (a, b) => a.opinions[b.id] || 0;
function meetFirst(a, b) {
  if (a.opinions[b.id] !== undefined) return;
  let o = randRange(-12, 12);
  if (a.home && a.home === b.home) o += 20; // housemates start out warmer
  a.opinions[b.id] = Math.round(o);
  if (a.chemistry[b.id] === undefined) a.chemistry[b.id] = b.chemistry[a.id] = chemistryBetween(a, b);
}
// How well two Thrimps get on, fixed when they first meet (-1..+1): partly luck, partly clashing or shared traits.
// It decides whether their chats build a friendship or slowly sour into a rivalry.
const CLASHES = [['cheerful', 'gloomy'], ['lazy', 'hard-working'], ['shy', 'hotheaded'], ['cunning', 'spiteful']];
function chemistryBetween(a, b) {
  let c = randRange(-0.6, 0.6);
  for (const [x, y] of CLASHES) if ((hasTrait(a, x) && hasTrait(b, y)) || (hasTrait(a, y) && hasTrait(b, x))) c -= 0.5;
  for (const t of ['hotheaded', 'spiteful']) c -= (hasTrait(a, t) ? 0.15 : 0) + (hasTrait(b, t) ? 0.15 : 0);
  c += 0.2 * a.traits.filter(t => b.traits.includes(t)).length; // birds of a feather
  return clamp(c, -1, 1);
}
function changeOpinion(a, b, delta) { // a's opinion of b
  if (delta < 0 && hasTrait(a, 'spiteful')) delta *= 1.5;
  a.opinions[b.id] = clamp(opinionOf(a, b) + delta, -100, 100);
}
function addGrudge(a, b, n = 1) { a.grudges[b.id] = (a.grudges[b.id] || 0) + n * (hasTrait(a, 'spiteful') ? 2 : 1); }
function memorize(th, w, text, about) {
  th.memories.unshift({ time: w.time, text, about });
  if (th.memories.length > 30) th.memories.pop();
}
function relationLabel(a, b) {
  if (a.partner === b.id) return 'Partner';
  const o = opinionOf(a, b);
  return o >= 50 ? 'Friend' : o >= 20 ? 'Friendly' : o > -20 ? 'Acquaintance' : o > -50 ? 'Dislikes' : 'Rival';
}
const byId = (w, id) => w.thrimps.find(t => t.id === id);

// Those who see something happen remember it, and think less of whoever started it.
function witness(w, a, b, text, againstA, thought) {
  for (const o of neighbours(w, a, SIGHT)) {
    if (o === b || o.asleep) continue;
    meetFirst(o, a);
    memorize(o, w, text, a.id);
    if (againstA) changeOpinion(o, a, againstA);
    if (thought) addThought(o, w, thought);
  }
}

// A Thrimp can be stopped for a kiss or a fight unless they're asleep, indoors, eating, mid-break or already busy.
const canStop = th => !th.hidden && !th.asleep && !th.breaking && !(th.job && ['sleep', 'eat', 'social', 'break'].includes(th.job.type));
function stopFor(th, w, other, mins, label, working) {
  if (th.job) finishJob(th, w, true);
  const j = job(label, [act(mins, label, {
    begin: t => { t.dir = dirFromVec(other.x - t.x, other.y - t.y); t.working = working || false; },
    end: t => { t.working = false; },
  })]);
  startJob(th, w, j, 'social');
}

// --- Encounters: who does what depends on what they think of each other, and who they are ---
const SOCIAL = [
  { id: 'nod', when: (a, b, op) => op > -25, weight: () => 0.6, do: (a, b) => { changeOpinion(a, b, 1); changeOpinion(b, a, 1); } },
  { id: 'chat', when: (a, b, op) => op > -15,
    weight: (a, b, op) => (hasTrait(a, 'shy') ? 0.4 : 1.2) * (hasTrait(a, 'curious') && Math.abs(op) < 15 ? 1.6 : 1) * (2 - a.needs.social),
    do: chat },
  { id: 'compliment', when: (a, b, op) => op > 20 || hasTrait(a, 'cunning'), weight: a => hasTrait(a, 'cunning') ? 1.4 : 0.5,
    do: (a, b, w) => { changeOpinion(b, a, 4); addThought(b, w, 'complimented'); emote(b, w, 'chat', 15); } },
  // A bad mood loosens tongues: a Thrimp in a foul mood snaps at people it merely doesn't like.
  { id: 'insult', when: (a, b, op) => op < (hasTrait(a, 'hotheaded') ? -10 : -30) || (a.mood < -10 && op < 0),
    weight: a => (hasTrait(a, 'hotheaded') ? 3 : 1) * (hasTrait(a, 'spiteful') ? 1.5 : 1) * (a.mood < 0 ? 1.5 : 1), do: insult },
  { id: 'flirt', when: (a, b, op) => op >= 40 && !a.partner && !b.partner, weight: a => a.mood > 0 ? 1.2 : 0.3, do: flirt },
  { id: 'kiss', when: (a, b) => a.partner === b.id && canStop(a) && canStop(b), weight: a => a.mood > 0 ? 3 : 0.5, do: kiss },
  { id: 'fight', when: (a, b, op) => op < -60 && a.mood < -10 && canStop(a) && canStop(b),
    weight: a => hasTrait(a, 'violent') ? 2 : hasTrait(a, 'hotheaded') ? 1 : 0.2, do: (a, b, w) => startFight(a, b, w) },
  { id: 'nothing', when: () => true, weight: () => 1, do: () => {} },
];
function onEncounter(a, b, w) {
  if (a.socialCooldown > w.time) return;
  const op = opinionOf(a, b);
  const options = SOCIAL.filter(s => s.when(a, b, op));
  const act = weightedPick(options, s => s.weight(a, b, op));
  if (!act) return;
  doSocial(a, b, w, act.id);
}
function doSocial(a, b, w, id) {
  meetFirst(a, b); meetFirst(b, a);
  SOCIAL.find(s => s.id === id).do(a, b, w);
  a.socialCooldown = w.time + SOCIAL_COOLDOWN;
  b.socialCooldown = Math.max(b.socialCooldown, w.time + SOCIAL_COOLDOWN / 2);
  if (id !== 'nothing' && id !== 'fight') w.stats[id] = (w.stats[id] || 0) + 1;
}

function chat(a, b, w) {
  for (const [x, y] of [[a, b], [b, a]]) {
    // Good chemistry makes a chat warm; bad chemistry makes it grate, and it adds up over time.
    const gain = 12 * x.chemistry[y.id] + randRange(-1.5, 1.5) + (hasTrait(x, 'cheerful') ? 1 : 0) - (hasTrait(x, 'gloomy') ? 1 : 0);
    changeOpinion(x, y, gain);
    x.needs.social = Math.min(1, x.needs.social + (hasTrait(x, 'shy') ? 0.15 : 0.25));
    addThought(x, w, gain < -1.5 ? 'awkward_chat' : 'nice_chat');
    emote(x, w, gain < -1.5 ? 'anger' : 'chat', 15);
  }
  // Gossip: a passes on what they think of someone else, and b's view drifts toward it.
  const others = Object.keys(a.opinions).map(Number).filter(id => id !== b.id && Math.abs(a.opinions[id]) >= 30);
  if (others.length && chance(0.35)) {
    const c = byId(w, pick(others));
    if (c) {
      meetFirst(b, c);
      const shift = Math.round((opinionOf(a, c) - opinionOf(b, c)) * 0.15);
      if (Math.abs(shift) >= 2) {
        changeOpinion(b, c, shift);
        memorize(b, w, `${a.name} told me ${shift > 0 ? 'good' : 'bad'} things about ${c.name}`, c.id);
      }
    }
  }
}
function insult(a, b, w) {
  changeOpinion(b, a, hasTrait(a, 'cunning') ? -4 : -8); // a cunning tongue is subtler
  addGrudge(b, a);
  addThought(b, w, 'insulted');
  memorize(b, w, `${a.name} insulted me`, a.id);
  emote(a, w, 'anger', 15);
  witness(w, a, b, `Heard ${a.name} insult ${b.name}`, -2);
  // b answers in character: a hothead swings, a shy one slinks off, anyone else yells back.
  if (hasTrait(b, 'hotheaded') && opinionOf(b, a) < -40 && canStop(a) && canStop(b)) startFight(b, a, w);
  else if (hasTrait(b, 'shy')) { addThought(b, w, 'humiliated'); emote(b, w, 'tear', 20); }
  else { changeOpinion(a, b, -4); emote(b, w, 'anger', 15); }
}
function flirt(a, b, w) {
  emote(a, w, 'heart', 15);
  if (opinionOf(b, a) >= 40 && !b.partner) {
    changeOpinion(a, b, 6); changeOpinion(b, a, 6);
    emote(b, w, 'heart', 15);
    if (opinionOf(a, b) >= 70 && opinionOf(b, a) >= 70) {
      a.partner = b.id; b.partner = a.id;
      for (const [x, y] of [[a, b], [b, a]]) { addThought(x, w, 'new_partner'); memorize(x, w, `Fell in love with ${y.name}`, y.id); remember(x, w, `Became ${y.name}'s partner`); }
      witness(w, a, b, `Saw ${a.name} and ${b.name} become a couple`, 0);
    }
  } else {
    addThought(a, w, 'rejected');
    changeOpinion(a, b, -5);
    memorize(a, w, `${b.name} turned me down`, b.id);
    emote(a, w, 'tear', 20);
  }
}
function kiss(a, b, w) {
  for (const [x, y] of [[a, b], [b, a]]) {
    stopFor(x, w, y, 6, `Kissing ${y.name}`);
    changeOpinion(x, y, 2);
    x.needs.social = Math.min(1, x.needs.social + 0.3);
    addThought(x, w, 'kissed');
    emote(x, w, 'heart', 20);
  }
}
// a throws the first punch. Both stop, both are shaken, and everyone nearby remembers who started it.
function startFight(a, b, w) {
  meetFirst(a, b); meetFirst(b, a);
  stopFor(a, w, b, 15, `Fighting ${b.name}`, 'fight');
  stopFor(b, w, a, 15, `Fighting ${a.name}`, 'fight');
  a.socialCooldown = b.socialCooldown = w.time + 2 * HOUR; // no friendly nods straight after a brawl
  const aWins = rand() < (hasTrait(a, 'violent') ? 0.7 : 0.5) - (hasTrait(b, 'violent') ? 0.2 : 0);
  const [winner, loser] = aWins ? [a, b] : [b, a];
  for (const [x, y] of [[a, b], [b, a]]) {
    changeOpinion(x, y, -20);
    addGrudge(x, y, 2);
    addThought(x, w, 'got_in_fight');
    emote(x, w, 'anger', 30);
  }
  addThought(loser, w, 'beaten');
  if (hasTrait(winner, 'violent')) addThought(winner, w, 'won_fight');
  memorize(a, w, `Picked a fight with ${b.name}${aWins ? ' and won' : ' and lost'}`, b.id);
  memorize(b, w, `${a.name} attacked me${aWins ? ' and beat me' : ', but I won'}`, a.id);
  remember(a, w, `Got into a fight with ${b.name}`);
  remember(b, w, `Got into a fight with ${a.name}`);
  witness(w, a, b, `Saw ${a.name} attack ${b.name}`, -8, 'saw_fight');
  w.stats.fight = (w.stats.fight || 0) + 1; // counted here: fights also start from insults and breaks
  raiseAlert(w, `${a.name} attacked ${b.name}!`, (a.x + b.x) / 2, (a.y + b.y) / 2, [a.id, b.id]);
}

// Runs from refreshMind: grudges soften (not for the spiteful), and love that has soured ends.
function refreshRelations(th, w) {
  if (!hasTrait(th, 'spiteful')) {
    for (const id in th.opinions) if (th.opinions[id] < 0) th.opinions[id] = Math.min(0, th.opinions[id] + 0.003); // ~3 a week
  }
  if (th.partner && opinionOf(th, { id: th.partner }) < 10) {
    const p = byId(w, th.partner);
    th.partner = 0;
    if (p) {
      p.partner = 0;
      memorize(th, w, `Left ${p.name}`, p.id);
      memorize(p, w, `${th.name} left me`, th.id);
      remember(th, w, `Broke up with ${p.name}`);
      remember(p, w, `${th.name} broke up with them`);
      addThought(p, w, 'heartbroken');
      raiseAlert(w, `${th.name} left ${p.name}`, p.x, p.y, [p.id]);
    }
  }
}

// Called every tick: rebuild the hash, and let a few Thrimps look around (each one every few minutes).
function socialTick(w) {
  buildSpatialHash(w);
  for (const a of w.thrimps) {
    if (a.hidden || a.asleep || w.time < a.nextPerceive) continue;
    a.nextPerceive = w.time + PERCEIVE_EVERY;
    for (const b of neighbours(w, a, SIGHT)) {
      meetFirst(a, b);
      if (b.asleep || dist(a.x, a.y, b.x, b.y) > MEET) continue;
      onEncounter(a, b, w);
      break;
    }
  }
}

// --- Personal space: Thrimps don't stand inside each other; walkers step around whoever is in the way ---
const PERSONAL_SPACE = 10; // px
const STALL_TICKS = 20; // a walker that hasn't gained on its next waypoint for 1 s (at 1x) squeezes past
const walkProgress = new WeakMap(); // Thrimp -> { wp, best, stall, ghost }; not saved, it only matters for seconds
function separateThrimps(w) {
  for (const th of w.thrimps) trackProgress(th);
  for (const a of w.thrimps) {
    if (a.hidden) continue;
    for (const b of neighbours(w, a, PERSONAL_SPACE)) {
      if (b.id < a.id || b.hidden) continue; // each pair once
      let dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
      if (d >= PERSONAL_SPACE) continue;
      if (d < 0.01) { const ang = rand() * Math.PI * 2; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
      // Someone about to reach a waypoint is let through: a waypoint (or a crate or seat at the end of a route)
      // inside another Thrimp's space could otherwise never be reached, and the walker would freeze there.
      // So is a walker wedged in a crowd (pushed back as far as it steps): better a brief overlap than a freeze.
      if (arriving(a) || arriving(b) || stalled(a) || stalled(b)) continue;
      const push = (PERSONAL_SPACE - d) * 0.5; // closing half the gap per tick reads as a gentle sidestep
      // Walkers and idlers make room; someone busy on the spot (chopping, eating, sleeping rough) stays put.
      const ma = movable(a), mb = movable(b);
      const ka = ma === mb ? 0.5 : ma ? 1 : 0;
      // Push apart plus a sideways shear (each to its own right). A plain push would hold a walker at a fixed
      // distance from someone standing on its path (step forward, pushed back the same amount, forever) and
      // shove head-on walkers back along their paths; the shear makes them slide round each other instead.
      const sx = dx / d, sy = dy / d, ex = sx - sy * 1.2, ey = sy + sx * 1.2;
      nudge(w, a, ex * push * ka, ey * push * ka, sx * push * ka, sy * push * ka);
      nudge(w, b, -ex * push * (1 - ka), -ey * push * (1 - ka), -sx * push * (1 - ka), -sy * push * (1 - ka));
    }
  }
}
// Points along a rounded corner (bend) come every few px and only need passing near, so they don't count.
const arriving = th => th.moving && th.route && th.route.length > 0 && !th.route[0].bend
  && dist(th.x, th.y, th.route[0].x, th.route[0].y) < PERSONAL_SPACE + 4;
const movable = th => th.moving || !th.job;
const stalled = th => th.moving && (walkProgress.get(th) || {}).ghost > 0;
function trackProgress(th) {
  const wp = th.moving && th.route && th.route[0];
  if (!wp) { walkProgress.delete(th); return; }
  const d = dist(th.x, th.y, wp.x, wp.y), p = walkProgress.get(th);
  if (!p || p.wp !== wp) walkProgress.set(th, { wp, best: d, stall: 0, ghost: 0 });
  else if (p.ghost > 0) p.ghost--; // squeezing past for 2 s, then back to polite
  else if (d < p.best - 0.5) { p.best = d; p.stall = 0; }
  else if (++p.stall > STALL_TICKS) { p.ghost = 40; p.stall = 0; }
}
// Move by (dx, dy); if that way is blocked, by the plain push (fx, fy); else not at all.
function nudge(w, th, dx, dy, fx, fy) {
  if (!dx && !dy) return;
  for (const [mx, my] of [[dx, dy], [fx, fy]]) {
    const x = th.x + mx, y = th.y + my;
    if (!isBlocked(w, x, y)) { th.x = x; th.y = y; return; }
  }
}

// --- Seeking company, and lashing out ---
function makeSocializeJob(th, w) {
  // Head for whoever they like best who's out and about; else the canteen tables, where people gather.
  const friends = w.thrimps.filter(o => o !== th && !o.hidden && !o.asleep && opinionOf(th, o) >= 20)
    .sort((a, b) => opinionOf(th, b) - opinionOf(th, a));
  const f = friends[0];
  if (f && dist(f.x, f.y, th.x, th.y) < 500) {
    return job(`Looking for ${f.name}`, [
      goTo(f.x + randRange(-10, 10), f.y + randRange(6, 12), `Going to see ${f.name}`),
      act(randRange(20, 40), `Hanging out near ${f.name}`, { each: (t, w2, dt) => { t.needs.social = Math.min(1, t.needs.social + dt / 300); } }),
    ]);
  }
  const seat = claimSeat(w, th);
  if (!seat) return null;
  return job('Looking for company', [
    goTo(seat.x, seat.y, 'Heading to the canteen for company'),
    act(randRange(30, 50), 'Sitting with whoever turns up', {
      begin: t => { t.dir = seat.face; },
      each: (t, w2, dt) => { if (w.seats.some(s => s.takenBy && s.takenBy !== t.id)) t.needs.social = Math.min(1, t.needs.social + dt / 200); },
    }),
  ], { cleanup: t => releaseSeat(w, t) });
}
function makeLashOutJob(th, w) {
  const victim = w.thrimps.filter(o => o !== th && !o.hidden && !o.asleep && dist(o.x, o.y, th.x, th.y) < 400)
    .sort((a, b) => opinionOf(th, a) - opinionOf(th, b))[0];
  if (!victim) return null;
  return job(`Going after ${victim.name}`, [
    goTo(victim.x, victim.y, `Storming after ${victim.name}`),
    act(1, `Confronting ${victim.name}`, {
      finish: t => { if (dist(t.x, t.y, victim.x, victim.y) < 40 && canStop(victim)) startFight(t, victim, w); },
    }),
  ]);
}
