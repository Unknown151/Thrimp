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
function updateUI() {
  if (!world) return; // still loading art
  const h = hourOf(world.time);
  $('hud-place').textContent = world.placeName;
  $('hud-clock').textContent = `Day ${dayOf(world.time)} · ${fmtClock(world.time)} · ${periodName(h)}`;
  $('hud-pop').textContent = `${world.thrimps.length} Thrimps`;
  $('hud-food').textContent = `Food ${Math.floor(world.stock.food)}`;
  $('hud-wood').textContent = `Wood ${world.stock.wood}`;
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
  for (const k of ['food', 'rest', 'fun']) {
    const v = th.needs[k], el = $('i-' + k);
    el.style.width = Math.round(v * 100) + '%';
    el.style.background = barColor(v);
  }
  $('i-carry').textContent = th.carrying ? `Carrying ${th.carrying.amount} ${th.carrying.kind === 'food' ? 'berries' : 'logs'}` : '';
  const likes = Object.entries(th.likes).filter(([, v]) => v > 1.1).map(([k]) => k === 'forage' ? 'foraging' : 'chopping wood');
  $('i-likes').textContent = likes.length ? `Enjoys ${likes.join(' and ')}` : '';
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
