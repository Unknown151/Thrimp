import { test, expect } from '@playwright/test';

// Opens the game paused and collects every page error and console error.
async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.thrimp && window.thrimp.world);
  // Paused, and alerts don't move the camera or the selection (tests that need them switch them back on).
  await page.evaluate(() => { window.thrimp.setSpeed(0); game.jump = false; });
  return errors;
}

test('loads a playable world with no errors', async ({ page }) => {
  const errors = await open(page);
  const w = await page.evaluate(() => {
    const w = thrimp.world;
    return {
      name: w.placeName, thrimps: w.thrimps.length, canteen: !!w.canteen,
      huts: w.buildings.filter(b => b.type === 'hut').length, bushes: w.bushes.length,
    };
  });
  expect(w.name).toBeTruthy();
  expect(w.thrimps).toBe(12);
  expect(w.canteen).toBe(true);
  expect(w.huts).toBeGreaterThan(0);
  expect(w.bushes).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#hud-place')).toHaveText(w.name);
  expect(errors).toEqual([]);
});

test('PixelLab sprite sheets load', async ({ page }) => {
  const errors = await open(page);
  await page.waitForFunction(() => ['idle', 'walk', 'gather', 'chop', 'fight'].every(k => thrimp.anims[k]));
  const frames = await page.evaluate(() => Object.fromEntries(Object.entries(thrimp.anims).map(([name, dirs]) =>
    [name, Object.fromEntries(Object.entries(dirs).map(([d, f]) => [d, f.length]))])));
  const all8 = n => Object.fromEntries(['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'].map(d => [d, n]));
  expect(frames.idle).toEqual(all8(4));
  expect(frames.walk).toEqual(all8(6));
  expect(frames.gather).toEqual(all8(5));
  expect(frames.chop).toEqual({ east: 9, west: 9 }); // Thrimps only ever chop facing sideways
  expect(frames.fight).toEqual(all8(6));
  expect(errors).toEqual([]);
});

test('PixelLab object art loads and the world uses it', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    return {
      missing: OBJECT_ART.filter(name => !thrimp.art[name]),
      plainBuildings: w.buildings.filter(b => b.type !== 'lumberyard' && !b.art).map(b => b.label),
      plainTrees: w.trees.filter(t => !t.art).length,
    };
  });
  expect(r.missing).toEqual([]);
  expect(r.plainBuildings).toEqual([]);
  expect(r.plainTrees).toBe(0);
  expect(errors).toEqual([]);
});

test('over three days everyone eats and sleeps, and nobody gets stuck', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, did = new Map(w.thrimps.map(t => [t.id, new Set()])), last = new Map();
    let stuck = 0;
    for (let m = 0; m < 3 * 24 * 60; m += 10) {
      thrimp.run(10);
      for (const t of w.thrimps) {
        if (t.job) did.get(t.id).add(t.job.type);
        const p = last.get(t.id);
        if (t.moving && p && p[0] === t.x && p[1] === t.y) stuck++; // "walking" but hasn't moved in 10 minutes
        last.set(t.id, [t.x, t.y]);
      }
    }
    const without = job => w.thrimps.filter(t => !did.get(t.id).has(job)).map(t => t.name);
    return {
      neverAte: without('eat'), neverSlept: without('sleep'), stuck,
      workers: w.thrimps.filter(t => did.get(t.id).has('forage') || did.get(t.id).has('chop')).length,
      starving: w.thrimps.filter(t => t.needs.food <= 0).map(t => t.name),
      wood: w.stock.wood,
    };
  });
  expect(r.neverAte).toEqual([]);
  expect(r.neverSlept).toEqual([]);
  expect(r.starving).toEqual([]);
  expect(r.stuck).toBe(0);
  expect(r.workers).toBeGreaterThanOrEqual(6);
  expect(r.wood).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every Thrimp has 2-3 traits without a clashing pair, and mood adds up', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(24 * 60);
    return w.thrimps.map(t => ({
      name: t.name, count: t.traits.length,
      clash: t.traits.some(a => t.traits.includes(TRAITS[a].opposite)),
      moodOff: Math.abs(t.mood - moodOf(t, w)) > 0.001,
      thoughts: t.thoughts.length,
    }));
  });
  expect(r.filter(t => t.count < 2 || t.count > 3)).toEqual([]);
  expect(r.filter(t => t.clash)).toEqual([]);
  expect(r.filter(t => t.moodOff)).toEqual([]);
  expect(r.filter(t => t.thoughts > 0).length).toBeGreaterThan(6); // a day of living leaves thoughts behind
  expect(errors).toEqual([]);
});

test('a Thrimp kept miserable breaks down, then feels relief', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, th = w.thrimps[0];
    th.thoughts.push({ id: 'slept_rough', mood: -80, until: w.time + 3 * DAY }); // test-only misery
    let relief = false;
    for (let m = 0; m < 2 * DAY && !relief; m += 10) {
      thrimp.run(10);
      if (th.thoughts.some(t => t.id === 'catharsis')) relief = true;
    }
    return { broke: th.breaks > 0, relief, breaks: th.breaks }; // counted, not sampled: lashing out can be over in minutes
  });
  expect(r.broke).toBe(true);
  expect(r.relief).toBe(true);
  expect(errors).toEqual([]);
});

test('a smashing break wrecks something, and someone repairs it with wood', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(3 * 60); // mid-morning, so repairs fall in working hours
    w.stock.wood = 30;
    const th = w.thrimps.find(t => !t.hidden && !t.asleep);
    const started = startBreak(th, w, 'smash');
    const isBroken = () => w.crate.broken || w.tables.some(t => t.broken);
    let smashed = false, fixed = false;
    for (let m = 0; m < 2 * DAY && !fixed; m += 10) {
      thrimp.run(10);
      if (isBroken()) smashed = true;
      else if (smashed) fixed = true;
    }
    return { started, smashed, fixed, wood: w.stock.wood };
  });
  expect(r.started).toBe(true);
  expect(r.smashed).toBe(true);
  expect(r.fixed).toBe(true);
  expect(errors).toEqual([]);
});

test('the inspector shows mood, traits and thoughts', async ({ page }) => {
  const errors = await open(page);
  const th = await page.evaluate(() => {
    thrimp.run(8 * 60);
    const t = thrimp.world.thrimps.find(t => t.thoughts.some(x => x.until > thrimp.world.time));
    thrimp.select(t.id);
    return { traits: t.traits.length, thoughts: t.thoughts.filter(x => x.until > thrimp.world.time).length };
  });
  await expect(page.locator('#i-mood-label')).toHaveText(/^(Happy|Content|Fine|Stressed|On edge|Breaking) [+-]?\d+$/);
  await expect(page.locator('#i-traits span')).toHaveCount(th.traits);
  await expect(page.locator('#i-thoughts li')).toHaveCount(th.thoughts);
  await expect(page.locator('#hud-mood')).toContainText('Colony mood');
  expect(errors).toEqual([]);
});

test('left alone for three days, Thrimps meet, talk and form opinions', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(3 * DAY);
    const ops = w.thrimps.flatMap(t => Object.values(t.opinions));
    return { chats: w.stats.chat || 0, known: ops.length, strong: ops.filter(o => Math.abs(o) >= 15).length,
      remembering: w.thrimps.filter(t => t.memories.length).length };
  });
  expect(r.chats).toBeGreaterThan(30);
  expect(r.known).toBeGreaterThan(60);       // most of the 132 possible pairs have met
  expect(r.strong).toBeGreaterThan(5);       // some feelings have grown either way
  expect(errors).toEqual([]);
});

test('a fight hurts both fighters and a bystander remembers it', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(4 * HOUR); // mid-morning: everyone up and about
    const [a, b, c] = w.thrimps.filter(t => !t.hidden && !t.asleep);
    const spot = { x: w.canteen.door.x, y: w.canteen.door.y + 30 };
    [a, b, c].forEach((t, i) => { if (t.job) finishJob(t, w, true); t.x = t.px = spot.x + i * 12; t.y = t.py = spot.y; });
    buildSpatialHash(w);
    meetFirst(a, b); // a first impression forms on meeting; measure the fight's effect from there
    const before = opinionOf(a, b);
    startFight(a, b, w);
    thrimp.run(20);
    const has = (t, id) => t.thoughts.some(x => x.id === id);
    return {
      bothShaken: has(a, 'got_in_fight') && has(b, 'got_in_fight'),
      grudge: (b.grudges[a.id] || 0) >= 2,
      opinionDropped: opinionOf(a, b) <= before - 19, // -20 for the fight, less a sliver of forgiveness since
      witnessRemembers: c.memories.some(m => m.text.startsWith('Saw ') && m.about === a.id) && has(c, 'saw_fight'),
      counted: w.stats.fight === 1,
    };
  });
  expect(r).toEqual({ bothShaken: true, grudge: true, opinionDropped: true, witnessRemembers: true, counted: true });
  expect(errors).toEqual([]);
});

test('two Thrimps in love become partners, and a soured love ends', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, [a, b] = w.thrimps;
    a.opinions[b.id] = 80; b.opinions[a.id] = 80;
    buildSpatialHash(w);
    doSocial(a, b, w, 'flirt');
    const paired = a.partner === b.id && b.partner === a.id && a.thoughts.some(t => t.id === 'new_partner');
    a.opinions[b.id] = -20; // a has had enough
    thrimp.run(20);
    return { paired, splitUp: !a.partner && !b.partner, heartbroken: b.thoughts.some(t => t.id === 'heartbroken') };
  });
  expect(r).toEqual({ paired: true, splitUp: true, heartbroken: true });
  expect(errors).toEqual([]);
});

test('the inspector lists relationships, and clicking one selects that Thrimp', async ({ page }) => {
  const errors = await open(page);
  const who = await page.evaluate(() => {
    thrimp.run(DAY);
    const t = thrimp.world.thrimps.find(t => Object.keys(t.opinions).length >= 2);
    thrimp.select(t.id);
    return t.name;
  });
  await expect(page.locator('#i-name')).toHaveText(who);
  const first = page.locator('#i-rels li').first();
  await expect(first).toBeVisible();
  const other = await first.locator('.who').textContent();
  await first.dispatchEvent('pointerdown');
  await expect(page.locator('#i-name')).toHaveText(other);
  expect(errors).toEqual([]);
});

test('trails: worlds start with some, walking wears more in, and unused ones grow back', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, worn = () => w.trail.filter(v => v > 0.3).length;
    const atStart = worn();
    const corner = trailCell(w, 6, 12); // nobody walks the map's corner
    addWear(w, corner, 1);
    thrimp.run(DAY);
    const afterDay = worn();
    thrimp.run(4 * DAY);
    return { atStart, afterDay, cornerLeft: w.trail[corner] };
  });
  expect(r.atStart).toBeGreaterThan(100);
  expect(r.afterDay).toBeGreaterThan(r.atStart);
  expect(r.cornerLeft).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});

test('a worn path is cheaper to walk than fresh grass', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, g = w.graph;
    const a = g.nodes.find(n => n.main && n.edges.length), e = a.edges[0], b = g.nodes[e.to];
    const fresh = walkCost(w, a.x, a.y, b.x, b.y);
    for (let k = 0; k <= 20; k++) stampTrail(w, lerp(a.x, b.x, k / 20), lerp(a.y, b.y, k / 20), 1);
    updateTrailCosts(w);
    return { len: e.len, fresh, worn: walkCost(w, a.x, a.y, b.x, b.y), edge: e.cost };
  });
  expect(r.worn).toBeLessThan(r.fresh * 0.7);
  expect(r.edge).toBeLessThan(r.len * 0.7);
});

test('the homeless pair builds a home through all three stages and moves in', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    const homeless = w.thrimps.filter(t => !t.home).map(t => t.id);
    const stages = new Set();
    for (let m = 0; m < 4 * DAY && !(w.stats.huts_built > 0); m += 10) {
      thrimp.run(10);
      for (const s of w.sites) stages.add(siteStage(s));
    }
    const homes = homeless.map(id => byId(w, id).home);
    return {
      homeless: homeless.length, built: w.stats.huts_built || 0, stages: [...stages].sort().join(','),
      sameNewHome: homes[0] && homes.every(h => h === homes[0]) && w.byId.get(homes[0]).type === 'hut',
      proud: homeless.every(id => byId(w, id).thoughts.some(t => t.id === 'built_home')),
    };
  });
  expect(r.homeless).toBe(2);
  expect(r.built).toBe(1);
  expect(r.stages).toBe('0,1,2');
  expect(r.sameNewHome).toBe(true);
  expect(r.proud).toBe(true);
  expect(errors).toEqual([]);
});

test('a building site next to a rival scores worse than one next to a friend', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, [owner, other] = w.thrimps.filter(t => t.home);
    const home = w.byId.get(other.home);
    const spot = { x: home.x + 70, y: home.y };
    other.opinions = other.opinions || {};
    owner.opinions[other.id] = -90;
    const nearRival = siteScore(w, spot, [owner]);
    owner.opinions[other.id] = 90;
    const nearFriend = siteScore(w, spot, [owner]);
    return { nearRival, nearFriend };
  });
  expect(r.nearRival).toBeLessThan(r.nearFriend - 1);
});

test('a saved colony comes back identical and keeps living', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(async () => {
    const w = thrimp.world;
    thrimp.run(2 * DAY); // long enough for opinions, memories, trails and the first new hut
    const look = x => ({
      place: x.placeName, time: x.time, stock: JSON.stringify(x.stock), huts: x.buildings.length, sites: x.sites.length,
      trees: x.trees.map(t => `${t.x},${t.y},${t.stump}`).join(';'), waterT: x.waterT, weather: JSON.stringify(x.weather),
      thrimps: x.thrimps.map(t => `${t.name}|${t.x.toFixed(2)}|${t.traits}|${JSON.stringify(t.opinions)}|${t.memories.length}|${t.partner}|${t.home}`).join(';'),
    });
    const before = look(w);
    // Through gzip and back, as it travels to the Worker.
    const data = JSON.parse(await gunzip(await gzip(JSON.stringify(serializeWorld(w)))));
    const restored = restoreWorld(data);
    const after = look(restored);
    const diff = Object.keys(before).filter(k => before[k] !== after[k]);
    // Trail wear is stored in 1/255 steps, so each cell may move by half a step (invisible), never more.
    let worst = 0;
    for (let i = 0; i < w.trail.length; i++) worst = Math.max(worst, Math.abs(w.trail[i] - restored.trail[i]));
    if (worst > 0.5 / 255 + 1e-6) diff.push(`trail off by ${worst}`);
    restored.ground = paintGround(restored, P); // as init does after loading a save
    world = restored; // play on in the restored world
    thrimp.run(DAY);
    return { diff, ranOn: restored.time > w.time + DAY - 1 };
  });
  expect(r.diff).toEqual([]);
  expect(r.ranOn).toBe(true);
  await expect(page.locator('#new-world')).toBeVisible();
  expect(errors).toEqual([]);
});

test('routes never cross water, buildings or trees, and bend round corners', async ({ page }) => {
  await open(page);
  const { bad, bent } = await page.evaluate(() => {
    const w = thrimp.world, nodes = w.graph.nodes.filter(n => n.main), out = [];
    let bent = 0;
    for (let i = 0; i < 200; i++) {
      const a = nodes[(i * 7919) % nodes.length], b = nodes[(i * 104729 + 13) % nodes.length];
      const route = findRoute(w, a.x, a.y, b.x, b.y);
      if (!route) { out.push(`no route ${a.i} -> ${b.i}`); continue; }
      if (route.some(p => p.bend)) bent++;
      let x = a.x, y = a.y;
      for (const p of route) {
        if (!segmentClear(w, x, y, p.x, p.y)) { out.push(`blocked leg on ${a.i} -> ${b.i}`); break; }
        x = p.x; y = p.y;
      }
    }
    return { bad: out, bent };
  });
  expect(bad).toEqual([]);
  expect(bent).toBeGreaterThan(50); // most longer routes turn somewhere
});

test('clicking a Thrimp opens the inspector', async ({ page }) => {
  const errors = await open(page);
  // Mid-morning, point the camera at a Thrimp who is out and about with nobody else right beside them.
  const name = await page.evaluate(() => {
    thrimp.run(4 * 60);
    const out = thrimp.world.thrimps.filter(t => !t.hidden);
    const t = out.find(a => out.every(b => b === a || Math.hypot(a.x - b.x, a.y - b.y) > 24));
    cam.x = t.x; cam.y = t.y;
    return t.name;
  });
  await page.evaluate(() => new Promise(requestAnimationFrame)); // one frame, so the camera settles (it stops at map edges)
  const target = await page.evaluate(n => {
    const t = thrimp.world.thrimps.find(t => t.name === n);
    return { name: n, ...worldToScreen(t.x, t.y - 10) };
  }, name);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#i-name')).toHaveText(target.name);
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspector')).toBeHidden();
  expect(errors).toEqual([]);
});

test('clicking a hut shows who lives there; a bush says when it can be picked', async ({ page }) => {
  const errors = await open(page);
  const hut = await page.evaluate(() => {
    const w = thrimp.world;
    const b = w.buildings.find(b => b.type === 'hut' && w.thrimps.some(t => t.home === b.id));
    cam.x = b.x; cam.y = b.y - 20;
    return { id: b.id, label: b.label, residents: w.thrimps.filter(t => t.home === b.id).map(t => t.name) };
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const at = await page.evaluate(id => {
    const b = thrimp.world.byId.get(id);
    for (let dy = 8; dy < 40; dy += 4) { // a point on the hut that no Thrimp covers and nothing stands in front of
      const t = thingAt(b.x, b.y - dy);
      if (t && t.id === id && !thrimpAt(b.x, b.y - dy)) return worldToScreen(b.x, b.y - dy);
    }
    return null;
  }, hut.id);
  expect(at).not.toBeNull();
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#thing')).toBeVisible();
  await expect(page.locator('#t-name')).toHaveText(hut.label);
  // The panel opens right beside the click (to its right, or its left near the screen edge).
  const box = await page.locator('#thing').boundingBox();
  const gap = Math.min(Math.abs(box.x - at.x), Math.abs(box.x + box.width - at.x));
  expect(gap).toBeLessThan(30);
  expect(Math.abs(box.y - at.y)).toBeLessThan(40);
  for (const name of hut.residents) await expect(page.locator('#t-body')).toContainText(name);
  // Moving onto the panel keeps it open; moving away from both the hut and the panel closes it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(800);
  await expect(page.locator('#thing')).toBeVisible();
  await page.mouse.move(20, 20, { steps: 4 }); // onto the HUD
  await expect(page.locator('#thing')).toBeHidden();
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#thing')).toBeVisible();
  await page.locator('#t-body .who').first().dispatchEvent('pointerdown'); // a name selects that Thrimp
  await expect(page.locator('#i-name')).toHaveText(hut.residents[0]);

  await page.evaluate(() => {
    const b = thrimp.world.bushes[0];
    b.berries = 0.5; // 1.5 berries short of pickable, at 4 hours a berry
    selectThing({ kind: 'bush', id: b.id });
  });
  await expect(page.locator('#t-name')).toHaveText('Berry bush');
  await expect(page.locator('#t-body')).toContainText('Ready to pick: in about 6h');
  await page.keyboard.press('Escape');
  await expect(page.locator('#thing')).toBeHidden();
  expect(errors).toEqual([]);
});

test('hovering a trait shows what it does', async ({ page }) => {
  const errors = await open(page);
  const missing = await page.evaluate(() => Object.keys(TRAITS).filter(t => !(TRAIT_EFFECTS[t] || []).length));
  expect(missing).toEqual([]);
  const first = await page.evaluate(() => { const t = thrimp.world.thrimps[0]; thrimp.select(t.id); return TRAIT_EFFECTS[t.traits[0]][0]; });
  await page.locator('#i-traits [data-trait]').first().hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).toContainText(first);
  await page.mouse.move(5, 5);
  await expect(page.locator('#tooltip')).toBeHidden();
  expect(errors).toEqual([]);
});

test('nameplates run from red when breaking to green when happy', async ({ page }) => {
  await open(page);
  const c = await page.evaluate(() => ({ low: moodColor(-60), mid: moodColor(0), high: moodColor(40) }));
  expect(c.low).toBe('rgb(228,59,68)');   // Endesga red
  expect(c.high).toBe('rgb(99,199,77)');  // Endesga green
  expect(c.mid).not.toBe(c.low);
  expect(c.mid).not.toBe(c.high);
});

test('Thrimps on one spot step apart', async ({ page }) => {
  const errors = await open(page);
  const closest = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(4 * HOUR);
    const crowd = w.thrimps.filter(t => !t.hidden && !t.asleep).slice(0, 4);
    const spot = { x: w.canteen.door.x, y: w.canteen.door.y + 36 };
    for (const t of crowd) { if (t.job) finishJob(t, w, true); t.moving = false; t.x = t.px = spot.x; t.y = t.py = spot.y; }
    for (let i = 0; i < 20; i++) { buildSpatialHash(w); separateThrimps(w); }
    let min = Infinity;
    for (const a of crowd) for (const b of crowd) if (a !== b) min = Math.min(min, dist(a.x, a.y, b.x, b.y));
    return min;
  });
  expect(closest).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test('when trouble starts the game slows to 1x and looks', async ({ page }) => {
  const errors = await open(page);
  const a = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(4 * HOUR);
    const [a, b] = w.thrimps.filter(t => !t.hidden && !t.asleep);
    game.jump = true; game.lastJump = -Infinity;
    setSpeed(3);
    startFight(a, b, w);
    return { id: a.id, name: a.name };
  });
  await expect(page.locator('#toast')).toContainText(`${a.name} attacked`);
  const r = await page.evaluate(() => ({ speed: game.speedIndex, selected: game.selected }));
  expect(r).toEqual({ speed: 1, selected: a.id });
  expect(errors).toEqual([]);
});

test('a renamed Thrimp keeps the name, also after a save', async ({ page }) => {
  const errors = await open(page);
  const other = await page.evaluate(() => { thrimp.select(thrimp.world.thrimps[0].id); return thrimp.world.thrimps[1].name; });
  await page.locator('#i-name').click();
  await page.locator('#i-rename').fill('  Sir   Wobble ');
  await page.locator('#i-rename').press('Enter');
  await expect(page.locator('#i-name')).toHaveText('Sir Wobble');
  await page.locator('#i-name').click();
  await page.locator('#i-rename').fill(other); // names stay unique
  await page.locator('#i-rename').press('Enter');
  await expect(page.locator('#i-name')).toHaveText('Sir Wobble');
  const r = await page.evaluate(() => {
    const w = thrimp.world, t = w.thrimps[0];
    const back = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    return { remembered: t.recent.some(m => m.text === 'Became known as Sir Wobble'), saved: back.thrimps[0].name,
      taken: back.names.has('Sir Wobble') };
  });
  expect(r).toEqual({ remembered: true, saved: 'Sir Wobble', taken: true });
  expect(errors).toEqual([]);
});

test('the weather changes, and rain soaks those outside but lulls those in bed', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, seen = new Set();
    for (let d = 0; d < 6 * DAY; d += HOUR) { thrimp.run(HOUR); seen.add(w.weather.kind); }
    w.weather.kind = 'rain'; w.weather.until = w.time + 6 * HOUR;
    const out = w.thrimps.find(t => !t.hidden && !t.asleep), home = w.thrimps.find(t => t.home && t !== out);
    if (home.job) finishJob(home, w, true);
    home.hidden = true; home.asleep = true;
    out.nextMind = home.nextMind = 0;
    thrimp.run(1);
    return { kinds: seen.size, soaked: out.thoughts.some(t => t.id === 'got_soaked'), cosy: home.thoughts.some(t => t.id === 'rain_on_roof') };
  });
  expect(r.kinds).toBeGreaterThanOrEqual(2);
  expect(r.soaked).toBe(true);
  expect(r.cosy).toBe(true);
  await expect(page.locator('#hud-clock')).toContainText('Rain');
  expect(errors).toEqual([]);
});

test('Thrimps sit to eat at the table, lie down outdoors, and stop to wave to friends', async ({ page }) => {
  const errors = await open(page);
  await page.waitForFunction(() => ['eat', 'sit-eat', 'sit', 'sleep', 'wave', 'stretch'].every(k => thrimp.anims[k]));
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    let eater = null;
    for (let m = 0; m < 2 * DAY && !eater; m += 2) {
      thrimp.run(2);
      eater = w.thrimps.find(t => t.pose === 'sit' && t.working === 'eat');
    }
    const seated = eater && thrimpSprite(eater) === animFacing('sit-eat', eater.dir)[Math.floor(w.time / CONFIG.ACTION_MIN_PER_FRAME + eater.id * 1.3) % animFacing('sit-eat', eater.dir).length];
    const sleeper = w.thrimps.find(t => !t.hidden && t !== eater);
    if (sleeper.job) finishJob(sleeper, w, true);
    sleeper.gesture = null;
    sleeper.asleep = true;
    const lying = thrimpSprite(sleeper) === animFacing('sleep', sleeper.dir)[0];
    sleeper.asleep = false;
    // Two friends meet: both turn to each other and wave, and a walker stands still until the wave is over.
    const [a, b] = w.thrimps.filter(t => !t.hidden && t !== eater && t !== sleeper && !t.asleep);
    for (const t of [a, b]) if (t.job) finishJob(t, w, true);
    a.x = a.px = w.canteen.door.x - 40; a.y = a.py = w.canteen.door.y + 40; b.x = b.px = a.x + 16; b.y = b.py = a.y;
    a.opinions[b.id] = 50; b.opinions[a.id] = 50;
    startJob(a, w, job('Test walk', [goTo(a.x - 60, a.y + 30, 'Walking')]), 'wander');
    runJob(a, w, CONFIG.MIN_PER_TICK); // starts the route
    doSocial(a, b, w, 'wave');
    const facing = a.dir === 'east' && b.dir === 'west', x0 = a.x;
    thrimp.run(1);
    const waited = a.x === x0 && a.gesture && a.gesture.anim === 'wave';
    thrimp.run(5);
    return { seated, lying, facing, waited, walkedOn: a.x !== x0 && !a.gesture };
  });
  expect(r).toEqual({ seated: true, lying: true, facing: true, waited: true, walkedOn: true });
  expect(errors).toEqual([]);
});

test('every kind of weather, day and night, draws without errors', async ({ page }) => {
  const errors = await open(page);
  for (const [kind, hour] of [['clear', 11], ['cloudy', 15], ['rain', 13], ['fog', 6], ['clear', 19], ['clear', 23], ['rain', 2]]) {
    await page.evaluate(([k, h]) => {
      const w = thrimp.world;
      w.time = Math.floor(w.time / DAY) * DAY + h * HOUR;
      w.weather.kind = k; w.weather.until = w.time + 5 * HOUR; w.weather.wind = w.weather.windTarget = k === 'rain' ? 0.9 : 0.4;
      amb.nextGround = 0; amb.nextFlock = 0;
      thrimp.setSpeed(1);
    }, [kind, hour]);
    await page.waitForTimeout(700);
  }
  const state = await page.evaluate(() => ({ drops: amb.drops.length, flies: amb.fireflies.length }));
  expect(state.drops).toBeGreaterThan(0);   // last stop: rain at night
  expect(state.flies).toBe(0);              // and no fireflies in the rain
  expect(errors).toEqual([]);
});

// Pacing baseline: 12 Thrimps, one game day (7,200 ticks) took 25 ms in Edge on Rasmus's PC (2026-10-22).
// The limit is generous on purpose; it is there to catch something going badly wrong, not small slowdowns.
test('one game day simulates in under 1.5 seconds', async ({ page }) => {
  await open(page);
  const ms = await page.evaluate(() => { const t0 = performance.now(); thrimp.run(24 * 60); return performance.now() - t0; });
  console.log(`  one game day: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(1500);
});
