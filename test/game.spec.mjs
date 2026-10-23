import { test, expect } from '@playwright/test';

// Opens the game paused and collects every page error and console error.
async function open(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => window.thrimp && window.thrimp.world);
  await page.evaluate(() => window.thrimp.setSpeed(0));
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

test('routes never cross water, buildings or trees', async ({ page }) => {
  await open(page);
  const bad = await page.evaluate(() => {
    const w = thrimp.world, nodes = w.graph.nodes.filter(n => n.main), out = [];
    for (let i = 0; i < 200; i++) {
      const a = nodes[(i * 7919) % nodes.length], b = nodes[(i * 104729 + 13) % nodes.length];
      const route = findRoute(w, a.x, a.y, b.x, b.y);
      if (!route) { out.push(`no route ${a.i} -> ${b.i}`); continue; }
      let x = a.x, y = a.y;
      for (const p of route) {
        if (!segmentClear(w, x, y, p.x, p.y)) { out.push(`blocked leg on ${a.i} -> ${b.i}`); break; }
        x = p.x; y = p.y;
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
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

// Pacing baseline: 12 Thrimps, one game day (7,200 ticks) took 25 ms in Edge on Rasmus's PC (2026-10-22).
// The limit is generous on purpose; it is there to catch something going badly wrong, not small slowdowns.
test('one game day simulates in under 1.5 seconds', async ({ page }) => {
  await open(page);
  const ms = await page.evaluate(() => { const t0 = performance.now(); thrimp.run(24 * 60); return performance.now() - t0; });
  console.log(`  one game day: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(1500);
});
