// ============================================================
// UI: HUD, speed control, inspector
// ============================================================
const $ = id => document.getElementById(id);
function setSpeed(i) {
  if (i > 0) game.lastSpeed = i;
  game.speedIndex = i;
  updateUI();
}
function select(id) {
  game.selected = id;
  if (!id) cam.follow = false;
  updateUI();
}
function barColor(v) { return v > 0.5 ? 'var(--good)' : v > 0.25 ? 'var(--warn)' : 'var(--bad)'; }
const signed = n => (n > 0 ? '+' : '') + n;
const fmtLeft = mins => mins >= HOUR ? `${Math.round(mins / HOUR)}h` : `${Math.max(1, Math.round(mins))}m`;
function updateUI() {
  if (!world) return; // still loading art
  const h = hourOf(world.time);
  $('hud-place').textContent = world.placeName;
  $('hud-clock').textContent = `Day ${dayOf(world.time)} · ${fmtClock(world.time)} · ${periodName(h)}`;
  $('hud-pop').textContent = `${world.thrimps.length} Thrimps`;
  $('hud-food').textContent = `Food ${Math.floor(world.stock.food)}`;
  $('hud-wood').textContent = `Wood ${world.stock.wood}`;
  const avg = world.thrimps.reduce((s, t) => s + t.mood, 0) / world.thrimps.length;
  const broken = world.thrimps.filter(t => t.breaking).length;
  $('hud-mood').textContent = `Colony mood ${signed(Math.round(avg))} (${moodLabel(avg).toLowerCase()})${broken ? ` · ${broken} breaking down` : ''}`;
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === game.speedIndex));

  const th = world.thrimps.find(t => t.id === game.selected);
  $('inspector').style.display = th ? 'block' : 'none';
  if (!th) return;
  const home = world.byId.get(th.home);
  const step = th.job && th.job.steps[th.job.i];
  $('i-name').textContent = th.name;
  $('i-home').textContent = `${home ? 'Lives in ' + home.label : 'Homeless'} · up ${fmtClock(th.schedule.wake * HOUR)} · bed ${fmtClock(th.schedule.bed * HOUR)}`;
  $('i-doing').textContent = step ? step.label : 'Thinking about what to do';
  $('i-why').textContent = th.job ? th.job.title : '';
  for (const k of ['food', 'rest', 'fun', 'social']) {
    const v = th.needs[k], el = $('i-' + k);
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
    : th.inspiration ? `Inspired: a work frenzy (${fmtLeft(th.inspiration.until - world.time)} left)` : '';
  const traitsEl = $('i-traits');
  if (traitsEl.dataset.who !== String(th.id)) { // traits never change, so only rebuild on a new selection
    traitsEl.dataset.who = th.id;
    traitsEl.replaceChildren(...th.traits.map(t => {
      const s = document.createElement('span');
      s.textContent = TRAITS[t].label;
      s.title = TRAITS[t].desc;
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
