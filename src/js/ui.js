// ============================================================
// UI: HUD, speed control, inspector
// ============================================================
const $ = id => document.getElementById(id);
function setSpeed(i) {
  if (i > 0) game.lastSpeed = i;
  game.speedIndex = i;
  updateUI();
}
// One thing is selected at a time: a Thrimp (game.selected, its id) or a building, site, bush or tree (game.thing).
function select(id) {
  game.selected = id;
  if (id) game.thing = null;
  if (!id) cam.follow = false;
  updateUI();
}
// `at` is the world point that was clicked; the panel opens beside it (or beside the thing itself).
function selectThing(t, at) {
  game.thing = t;
  game.thingAwaySince = 0;
  if (t) {
    game.selected = 0; cam.follow = false;
    const obj = findThing(t), p = obj && (obj.p || obj);
    game.thingAnchor = at || (p ? { x: p.x, y: p.y - 12 } : { x: cam.x, y: cam.y });
  }
  updateUI();
}
function barColor(v) { return v > 0.5 ? 'var(--good)' : v > 0.25 ? 'var(--warn)' : 'var(--bad)'; }
const signed = n => (n > 0 ? '+' : '') + n;
const fmtLeft = mins => mins >= HOUR ? `${Math.round(mins / HOUR)}h` : `${Math.max(1, Math.round(mins))}m`;
function updateUI() {
  if (!world) return; // still loading art
  const h = hourOf(world.time);
  $('hud-place').textContent = world.placeName;
  const sky = world.weather ? ` · ${WEATHER[world.weather.kind].label}` : '';
  $('hud-clock').textContent = `Day ${dayOf(world.time)} · ${fmtClock(world.time)} · ${periodName(h)}${sky}`;
  $('hud-pop').textContent = `${world.thrimps.length} Thrimps`;
  $('hud-food').textContent = `Food ${Math.floor(world.stock.food)}`;
  $('hud-wood').textContent = `Wood ${world.stock.wood}`;
  const avg = world.thrimps.reduce((s, t) => s + t.mood, 0) / world.thrimps.length;
  const broken = world.thrimps.filter(t => t.breaking).length;
  $('hud-mood').textContent = `Colony mood ${signed(Math.round(avg))} (${moodLabel(avg).toLowerCase()})${broken ? ` · ${broken} breaking down` : ''}`;
  $('hud-save').textContent = saveStatus();
  $('hud-build').textContent = world.sites.map(s => {
    const names = s.owners.map(id => byId(world, id)).filter(Boolean).map(t => t.name).join(' & ');
    const pct = `${Math.round(s.work / siteWork(s) * 100)}%`;
    return siteType(s) === 'hut' ? `Building a hut for ${names}: stage ${siteStage(s) + 1}/3, ${pct}`
      : `Building ${siteWhat(s)} (${names}'s idea): ${pct}`;
  }).join('\n');
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === game.speedIndex));

  $('jump-toggle').textContent = `Jump there: ${game.jump ? 'on' : 'off'}`;
  updateThingPanel();
  const th = world.thrimps.find(t => t.id === game.selected);
  $('inspector').style.display = th ? 'block' : 'none';
  if (!th) return;
  const home = world.byId.get(th.home);
  const step = th.job && th.job.steps[th.job.i];
  if ($('i-rename').hidden) $('i-name').textContent = th.name;
  else if ($('i-rename').dataset.who !== String(th.id)) finishRename(false); // selection moved on mid-rename
  $('i-home').textContent = `${STAGE_LABEL[th.stage]}, ${ageYears(th, world)} · ${home ? 'lives in ' + home.label : 'homeless'} · up ${fmtClock(th.schedule.wake * HOUR)} · bed ${fmtClock(th.schedule.bed * HOUR)}`;
  $('i-family').textContent = familyLine(th);
  $('i-doing').textContent = step ? step.label : 'Thinking about what to do';
  $('i-why').textContent = th.job ? th.job.title : '';
  for (const k of ['food', 'rest', 'fun', 'social', 'health']) {
    const v = k === 'health' ? th.health : th.needs[k], el = $('i-' + k);
    el.style.width = Math.round(v * 100) + '%';
    el.style.background = barColor(v);
  }
  // Mood bar spans -50..+50, the range moods normally live in.
  $('i-mood-label').textContent = `${moodLabel(th.mood)} ${signed(Math.round(th.mood))}`;
  $('i-mood').style.width = Math.round(clamp((th.mood + 50) / 100, 0.02, 1) * 100) + '%';
  $('i-mood').style.background = barColor((th.mood - breakThreshold(th)) / 60);
  const state = $('i-state');
  state.className = 'state' + (th.inspiration && !th.breaking ? ' inspired' : '');
  state.textContent = th.breaking ? `Mental break: ${BREAKS[th.breaking.type].label.toLowerCase()}`
    : th.sick ? `Sick with a fever (${fmtLeft(Math.max(1, th.sick.until - world.time))} to go)`
    : th.inspiration ? `Inspired: a work frenzy (${fmtLeft(th.inspiration.until - world.time)} left)`
    : th.expecting ? `Expecting a child (due in ${fmtLeft(Math.max(1, th.expecting - world.time))})` : '';
  const traitsEl = $('i-traits');
  if (traitsEl.dataset.who !== String(th.id)) { // traits never change, so only rebuild on a new selection
    traitsEl.dataset.who = th.id;
    traitsEl.replaceChildren(...th.traits.map(t => {
      const s = document.createElement('span');
      s.textContent = TRAITS[t].label;
      s.dataset.trait = t; // hovering shows TRAIT_EFFECTS (showTraitTip)
      return s;
    }));
  }
  const thoughts = th.thoughts.filter(t => t.until > world.time).sort((a, b) => a.mood - b.mood);
  $('i-thoughts').replaceChildren(...thoughts.map(t => {
    const li = document.createElement('li');
    const label = document.createElement('span'), val = document.createElement('span'), left = document.createElement('span');
    label.textContent = THOUGHTS[t.id].label;
    val.textContent = signed(t.mood);
    val.className = t.mood >= 0 ? 'pos' : 'neg';
    left.textContent = THOUGHTS[t.id].mins ? fmtLeft(t.until - world.time) : 'now';
    left.className = 'left';
    li.append(label, val, left);
    return li;
  }));
  $('i-carry').textContent = th.carrying ? `Carrying ${th.carrying.amount} ${th.carrying.kind === 'food' ? 'berries' : 'logs'}` : '';
  const likes = Object.entries(th.likes).filter(([, v]) => v > 1.1).map(([k]) => k === 'forage' ? 'foraging' : 'chopping wood');
  $('i-likes').textContent = likes.length ? `Enjoys ${likes.join(' and ')}` : '';
  // Relationships: the partner first, then whoever they feel most strongly about either way.
  const known = Object.keys(th.opinions).map(id => byId(world, +id)).filter(Boolean)
    .sort((a, b) => (b.id === th.partner) - (a.id === th.partner) || Math.abs(opinionOf(th, b)) - Math.abs(opinionOf(th, a)))
    .slice(0, 8);
  $('i-rels').replaceChildren(...known.map(o => {
    const li = document.createElement('li');
    li.dataset.id = o.id;
    if (th.partner === o.id) li.className = 'partner';
    const who = document.createElement('span'), kind = document.createElement('span'), val = document.createElement('span');
    const grudges = th.grudges[o.id] || 0;
    who.className = 'who'; who.textContent = o.name;
    kind.className = 'kind'; kind.textContent = relationLabel(th, o) + (grudges >= 3 ? ' · grudge' : '');
    const v = Math.round(opinionOf(th, o));
    val.className = v >= 0 ? 'pos' : 'neg'; val.textContent = signed(v);
    li.append(who, kind, val);
    return li;
  }));
  $('i-memories').replaceChildren(...th.memories.slice(0, 6).map(m => {
    const li = document.createElement('li'), b = document.createElement('b');
    b.textContent = m.text;
    li.append(`Day ${dayOf(m.time)} `, b);
    return li;
  }));
  const ul = $('i-recent');
  ul.replaceChildren(...th.recent.map(r => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = r.text;
    li.append(`${dayOf(r.time) !== dayOf(world.time) ? 'Day ' + dayOf(r.time) + ' ' : ''}${fmtClock(r.time)} `, b);
    return li;
  }));
  $('i-follow').classList.toggle('on', cam.follow);
}

// "Child of A and B · parent of C, D (died)": the living and the dead, by name.
function familyLine(th) {
  const nameOf = id => { const t = byId(world, id); if (t) return t.name; const d = world.dead.find(x => x.id === id); return d ? `${d.name} (died)` : null; };
  const kids = [...world.thrimps.filter(t => t.parents.includes(th.id)).map(t => t.name),
    ...world.dead.filter(d => d.parents.includes(th.id)).map(d => `${d.name} (died)`)];
  const parts = [];
  const parents = th.parents.map(nameOf).filter(Boolean);
  if (parents.length) parts.push(`Child of ${parents.join(' and ')}`);
  if (kids.length) parts.push(`parent of ${kids.join(', ')}`);
  const s = parts.join(' · ');
  return s && s[0].toUpperCase() + s.slice(1);
}
function thrimpAt(wx, wy) {
  if (!world) return null;
  let best = null;
  for (const th of world.thrimps) {
    if (th.hidden) continue;
    const s = thrimpSprite(th), top = th.y - (s.ay - (s.top || 0));
    if (wx >= th.x - 8 && wx <= th.x + 8 && wy >= top - 2 && wy <= th.y + 3 && (!best || th.y > best.y)) best = th;
  }
  return best;
}

// ============================================================
// THINGS: clicking buildings, building sites, bushes and trees
// ============================================================
// The drawn area of a sprite placed at (x, y), anchored at its bottom centre.
function spriteBox(s, x, y) {
  const w = s.width || s.img.width, h = s.ay - (s.top || 0) + 1;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y + 2 };
}
function thingAt(wx, wy) {
  if (!world) return null;
  const hits = [];
  const test = (kind, id, y, box) => { if (wx >= box.x0 && wx <= box.x1 && wy >= box.y0 && wy <= box.y1) hits.push({ kind, id, y }); };
  for (const s of world.sites) {
    const look = siteArt(s);
    test('site', s.id, s.p.y, look ? spriteBox(look, s.p.x, s.p.y) : { x0: s.p.x - s.p.w / 2, x1: s.p.x + s.p.w / 2, y0: s.p.y - s.p.h, y1: s.p.y });
  }
  for (const b of world.buildings) {
    const look = art(b.art) || sprites[b.type];
    if (b.type === 'lumberyard') test('building', b.id, b.y, { x0: b.x - 50, x1: b.x + 40, y0: b.y - 34, y1: b.y + 6 });
    else if (look) test('building', b.id, b.y, spriteBox(look, b.x, b.y));
  }
  for (const b of world.bushes) test('bush', b.id, b.y, spriteBox(art('bush-full') || sprites.bush, b.x, b.y));
  for (const g of world.graves) { const s = graveArt(g); if (s) test('grave', g.id, g.y, spriteBox(s, g.x, g.y)); }
  for (const t of world.trees) {
    const s = t.stump ? (art('stump') || sprites.stump) : (art(t.art) || sprites[t.kind][t.variant]);
    test('tree', t.id, t.y, spriteBox(s, t.x, t.y));
  }
  hits.sort((a, b) => b.y - a.y); // the one drawn in front
  return hits[0] || null;
}
function findThing(t) {
  if (!t) return null;
  if (t.kind === 'building') return world.byId.get(t.id);
  if (t.kind === 'site') return world.sites.find(s => s.id === t.id);
  if (t.kind === 'bush') return world.bushes.find(b => b.id === t.id);
  if (t.kind === 'tree') return world.trees.find(x => x.id === t.id);
  if (t.kind === 'grave') return graveById(world, t.id);
  return null;
}

const namesOf = list => list.map(th => ({ id: th.id, name: th.name }));
function updateThingPanel() {
  let obj = findThing(game.thing);
  if (!obj && game.thing && game.thing.kind === 'site') {
    // The site became a hut: follow it there.
    const hut = world.buildings.find(b => b.fromSite === game.thing.id);
    if (hut) { game.thing = { kind: 'building', id: hut.id }; obj = hut; }
  }
  if (!obj) { if (game.thing) game.thing = null; $('thing').style.display = 'none'; return; }
  $('thing').style.display = 'block';
  const rows = []; // [label, value] where value is text or a list of {id, name} links
  const doing = (test) => world.thrimps.filter(t => t.job && test(t));
  let title = '';
  const k = game.thing.kind;
  const built = () => obj.builtDay
    ? rows.push(['Built', [`day ${obj.builtDay} by `, ...namesOf(obj.builtBy.map(id => byId(world, id)).filter(Boolean))]])
    : rows.push(['Built', 'before anyone remembers']);
  const at = (jobType) => namesOf(doing(t => t.job.type === jobType));
  if (k === 'building' && BUILDING_TYPES[obj.type].home) {
    title = obj.label;
    const residents = world.thrimps.filter(t => t.home === obj.id), room = BUILDING_TYPES[obj.type].room;
    rows.push(['Home of', residents.length ? namesOf(residents) : 'nobody yet']);
    if (residents.length > room) rows.push(['Room', `crowded: ${residents.length} living in room for ${room}`]);
    const inside = world.thrimps.filter(t => t.hidden && t.home === obj.id);
    rows.push(['Inside now', inside.length ? namesOf(inside) : 'nobody']);
    built();
  } else if (k === 'building' && obj.type === 'campfire') {
    title = 'The campfire';
    rows.push(['Fire', fireLit() ? 'burning' : 'cold until the evening']);
    rows.push(['Round the fire', at('campfire')]);
    built();
  } else if (k === 'building' && obj.type === 'shelter') {
    title = 'The rain shelter';
    rows.push(['Sheltering', at('shelter')]);
    built();
  } else if (k === 'building' && obj.type === 'storehouse') {
    title = 'The storehouse';
    rows.push(['Keeps dry', `${Math.floor(world.stock.food)} berries`]);
    rows.push(['Spoiled before it was built', `${world.stats.spoiled || 0} berries`]);
    built();
  } else if (k === 'building' && obj.type === 'healer') {
    title = 'The healer\'s hut';
    rows.push(['Being cared for', namesOf(world.thrimps.filter(t => obj.sleepers.includes(t.id)))]);
    rows.push(['Sick elsewhere', namesOf(world.thrimps.filter(t => t.sick && !obj.sleepers.includes(t.id)))]);
    built();
  } else if (k === 'building' && obj.type === 'memorial') {
    title = 'The memorial stone';
    rows.push(['In memory of', `${world.dead.length} who have died`]);
    rows.push(['Remembering now', namesOf(doing(t => t.job.steps[t.job.i].label === 'Relaxing by the memorial stone'))]);
    built();
  } else if (k === 'building' && obj.type === 'playground') {
    title = 'The play area';
    rows.push(['Playing now', namesOf(doing(t => t.job.title === 'Off to the play area'))]);
    built();
  } else if (k === 'building' && obj.type === 'canteen') {
    title = 'The canteen';
    rows.push(['Food in store', `${Math.floor(world.stock.food)} berries${world.crate.broken ? ' (crate smashed: spoiling!)' : ''}`]);
    const smashed = world.tables.filter(t => t.broken).length;
    rows.push(['Tables', `${world.tables.length}${smashed ? ` (${smashed} smashed)` : ''}`]);
    rows.push(['Seats taken', `${world.seats.filter(s => s.takenBy).length} of ${world.seats.filter(s => !s.table.broken).length}`]);
    rows.push(['Eating now', namesOf(doing(t => t.job.type === 'eat' && t.job.steps[t.job.i].label === 'Eating at the canteen'))]);
  } else if (k === 'building' && obj.type === 'lumberyard') {
    title = 'The lumberyard';
    rows.push(['Wood stacked', `${world.stock.wood} logs`]);
    rows.push(['Chopping now', namesOf(doing(t => t.job.type === 'chop'))]);
  } else if (k === 'site') {
    const hutSite = siteType(obj) === 'hut', pct = Math.round(obj.work / siteWork(obj) * 100);
    title = hutSite ? 'A hut going up' : `Building ${siteWhat(obj)}`;
    rows.push([hutSite ? 'For' : 'Whose idea', namesOf(obj.owners.map(id => byId(world, id)).filter(Boolean))]);
    rows.push(['Progress', hutSite ? `stage ${siteStage(obj) + 1} of 3, ${pct}%` : `${pct}%`]);
    rows.push(['Wood delivered', `${obj.woodIn} of ${siteWood(obj)} logs`]);
    rows.push(['Working on it', namesOf(doing(t => t.job.type === 'build'))]);
    rows.push(['Started', `day ${dayOf(obj.started)}`]);
  } else if (k === 'bush') {
    title = 'Berry bush';
    const n = Math.floor(obj.berries), regrow = 240; // minutes per berry (tick in ai.js)
    rows.push(['Berries', `${n} of ${obj.max}`]);
    rows.push(['Ready to pick', obj.berries >= 2 ? 'now' : `in about ${fmtLeft((2 - obj.berries) * regrow)}`]);
    rows.push(['Full again', obj.berries >= obj.max ? 'it is full' : `in about ${fmtLeft((obj.max - obj.berries) * regrow)}`]);
    const picker = obj.reservedBy && byId(world, obj.reservedBy);
    if (picker) rows.push(['Being picked by', namesOf([picker])]);
  } else if (k === 'grave') {
    const d = world.dead.find(x => x.id === obj.of);
    title = `Here lies ${obj.name}`;
    if (d) {
      rows.push(['Aged', `${Math.floor((d.died - d.born) / DAY * YEARS_PER_DAY)}`]);
      rows.push(['Died', `day ${dayOf(d.died)}, ${CAUSE_TEXT[d.cause] || d.cause}`]);
      const killer = d.killer && (byId(world, d.killer) || world.dead.find(x => x.id === d.killer));
      if (killer) rows.push(['Killed by', byId(world, d.killer) ? namesOf([killer]) : killer.name]);
      const kin = world.thrimps.filter(t => t.parents.includes(d.id) || d.parents.includes(t.id) || t.parents.some(p => d.parents.includes(p)));
      if (kin.length) rows.push(['Family left behind', namesOf(kin)]);
    }
    rows.push(['Mourning', namesOf(world.thrimps.filter(t => t.mourn.includes(obj.id) || (t.job && t.job.title === `Mourning ${obj.name}`)))]);
  } else if (k === 'tree') {
    title = obj.stump ? 'Tree stump' : obj.kind === 'pine' ? 'Pine' : 'Oak';
    if (obj.stump) rows.push(['Grows back', `in about ${fmtLeft(Math.max(1, obj.regrowAt - world.time))}`]);
    else rows.push(['Wood left', `${obj.wood * 2} logs (${obj.wood} more chopping${obj.wood > 1 ? 's' : ''})`]);
    const chopper = obj.reservedBy && byId(world, obj.reservedBy);
    if (chopper) rows.push(['Being chopped by', namesOf([chopper])]);
  }
  $('t-name').textContent = title;
  $('t-body').replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div'), lbl = document.createElement('span');
    row.className = 'row'; lbl.className = 'lbl'; lbl.textContent = label + ': ';
    row.append(lbl);
    const parts = Array.isArray(value) ? value : [value];
    if (Array.isArray(value) && !value.length) row.append('nobody');
    parts.forEach((p, i) => {
      if (typeof p === 'string') { row.append(p); return; }
      const a = document.createElement('span');
      a.className = 'who'; a.dataset.id = p.id; a.textContent = p.name;
      row.append(a);
      if (i < parts.length - 1 && typeof parts[i + 1] !== 'string') row.append(', ');
    });
    return row;
  }));
  placeThingPanel();
}
// The panel closes once the pointer has been off both the thing and the panel for a moment (input.js starts the
// clock); the grace lets the pointer cross the gap from the thing onto the panel to click a name.
const THING_AWAY_MS = 400;
function closeThingIfAway(now) {
  if (game.thing && game.thingAwaySince && now - game.thingAwaySince > THING_AWAY_MS) selectThing(null);
}
// Every frame: keep the panel beside the clicked spot as the camera moves, flipping to the left near the right edge
// and staying on screen.
function placeThingPanel() {
  const el = $('thing');
  if (!game.thing || !game.thingAnchor || el.style.display === 'none') return;
  const p = worldToScreen(game.thingAnchor.x, game.thingAnchor.y), w = el.offsetWidth, h = el.offsetHeight, gap = 18;
  const x = p.x + gap + w <= viewW - 8 ? p.x + gap : p.x - gap - w;
  el.style.left = Math.round(clamp(x, 8, viewW - w - 8)) + 'px';
  el.style.top = Math.round(clamp(p.y - 24, 8, viewH - h - 8)) + 'px';
}

// ============================================================
// ALERTS: show what happened; when allowed, slow to 1x and pan over
// ============================================================
const JUMP_COOLDOWN_MS = 20000; // never yank the camera more often than this
let toastTimer = 0;
function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}
function processAlerts(now) {
  if (!world.alerts || !world.alerts.length) return;
  // The latest trouble is what's worth seeing; calm news (a birth) only when nothing went wrong.
  const a = [...world.alerts].reverse().find(x => !x.calm) || world.alerts[world.alerts.length - 1];
  world.alerts.length = 0;
  showToast(a.text);
  if (a.calm || !game.jump || now - game.lastJump < JUMP_COOLDOWN_MS) return;
  game.lastJump = now;
  if (game.speedIndex > 1) setSpeed(1);
  cam.follow = false;
  cam.target = { x: a.x, y: a.y - 10 };
  if (a.who.length) select(a.who[0]);
}
function setJump(on) {
  game.jump = on;
  try { localStorage.setItem('thrimp.jump', on ? '1' : '0'); } catch (e) { /* storage unavailable: just not remembered */ }
  updateUI();
}
function loadJumpSetting() {
  try { game.jump = localStorage.getItem('thrimp.jump') !== '0'; } catch (e) { game.jump = true; }
}

// ============================================================
// TRAIT TOOLTIP and RENAMING
// ============================================================
function showTraitTip(trait, x, y) {
  const tip = $('tooltip'), T = TRAITS[trait];
  const b = document.createElement('b'), ul = document.createElement('ul');
  b.textContent = T.label;
  ul.replaceChildren(...TRAIT_EFFECTS[trait].map(e => { const li = document.createElement('li'); li.textContent = e; return li; }));
  tip.replaceChildren(b, ul);
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(x - r.width - 12, viewW - r.width - 8)) + 'px';
  tip.style.top = Math.max(8, Math.min(y + 12, viewH - r.height - 8)) + 'px';
}
function hideTraitTip() { $('tooltip').hidden = true; }

function startRename() {
  const th = world.thrimps.find(t => t.id === game.selected);
  if (!th) return;
  const input = $('i-rename');
  input.dataset.who = th.id;
  input.value = th.name;
  input.hidden = false;
  $('i-name').hidden = true;
  input.focus();
  input.select();
}
function finishRename(keep) {
  const input = $('i-rename');
  if (input.hidden) return;
  const th = world.thrimps.find(t => t.id === +input.dataset.who);
  const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (keep && th && name && name !== th.name && !world.thrimps.some(t => t !== th && t.name === name)) {
    world.names.delete(th.name);
    remember(th, world, `Became known as ${name}`);
    th.name = name;
    world.names.add(name);
  }
  input.hidden = true;
  $('i-name').hidden = false;
  updateUI();
}
