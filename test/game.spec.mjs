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
    // The founders (babies born along the way have their own rhythm), and everyone for "stuck" and "starving".
    const w = thrimp.world, did = new Map(w.thrimps.map(t => [t.id, new Set()])), last = new Map();
    let stuck = 0;
    for (let m = 0; m < 3 * 24 * 60; m += 10) {
      thrimp.run(10);
      for (const t of w.thrimps) {
        if (t.job && did.has(t.id)) did.get(t.id).add(t.job.type);
        const p = last.get(t.id);
        if (t.moving && p && p[0] === t.x && p[1] === t.y) stuck++; // "walking" but hasn't moved in 10 minutes
        last.set(t.id, [t.x, t.y]);
      }
    }
    const founders = w.thrimps.filter(t => did.has(t.id));
    const without = job => founders.filter(t => !did.get(t.id).has(job)).map(t => t.name);
    return {
      neverAte: without('eat'), neverSlept: without('sleep'), stuck,
      workers: founders.filter(t => did.get(t.id).has('forage') || did.get(t.id).has('chop')).length,
      starving: w.thrimps.filter(t => t.needs.food <= 0).map(t => t.name),
      wood: w.stock.wood,
    };
  });
  expect(r.neverAte, JSON.stringify(r)).toEqual([]);
  expect(r.neverSlept, JSON.stringify(r)).toEqual([]);
  expect(r.starving, JSON.stringify(r)).toEqual([]);
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
    const w = thrimp.world, [a, b] = w.thrimps.filter(t => !t.partner); // founders who came single
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
      knowledge: JSON.stringify(x.knowledge), outcrops: JSON.stringify(x.outcrops), knows: x.thrimps.map(t => t.knows.join('+')).join(';'),
      thrimps: x.thrimps.map(t => `${t.name}|${t.x.toFixed(2)}|${t.traits}|${JSON.stringify(t.opinions)}|${t.memories.length}|${t.partner}|${t.home}|${t.born}|${t.health.toFixed(4)}|${t.hair}|${t.parents}`).join(';'),
      dead: JSON.stringify(x.dead), graves: JSON.stringify(x.graves),
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
      eater = w.thrimps.find(t => t.pose === 'sit' && t.working === 'eat' && t.stage !== 'child'); // children just stand
    }
    const seated = eater && thrimpSprite(eater) === animFacing('sit-eat', eater.dir)[Math.floor(w.time / CONFIG.ACTION_MIN_PER_FRAME + eater.id * 1.3) % animFacing('sit-eat', eater.dir).length];
    const grown = w.thrimps.filter(t => t !== eater && t.stage !== 'child');
    for (const t of grown.slice(0, 3)) { if (t.job) finishJob(t, w, true); t.hidden = false; t.asleep = false; }
    const sleeper = grown[0];
    if (sleeper.job) finishJob(sleeper, w, true);
    sleeper.gesture = null;
    sleeper.asleep = true;
    const lying = thrimpSprite(sleeper) === animFacing('sleep', sleeper.dir)[0];
    sleeper.asleep = false;
    // Two friends meet: both turn to each other and wave, and a walker stands still until the wave is over.
    const [a, b] = grown.slice(1, 3);
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

// The life checks run hourly, so these tests move time on by a little over an hour (HOUR + 1) after a change.
test('Thrimps grow old: an elder slows down and goes grey', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, t = w.thrimps[0];
    t.born = w.time - 31 * DAY;
    thrimp.select(t.id);
    thrimp.run(HOUR + 1);
    return { stage: t.stage, hair: hairOf(t), pace: paceOf(t), years: ageYears(t, w) };
  });
  expect(r.stage).toBe('elder');
  expect(r.hair).toBe('grey');
  expect(r.pace).toBeLessThan(1);
  await expect(page.locator('#i-home')).toContainText(`Elder, ${r.years}`);
  await expect(page.locator('#i-thoughts')).toContainText('Old bones');
  expect(errors).toEqual([]);
});

test('a settled couple has a child who takes after them, and grows up', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, [a, b] = w.thrimps.filter(t => t.home);
    a.partner = b.id; b.partner = a.id; b.home = a.home;
    a.opinions[b.id] = b.opinions[a.id] = 80;
    w.stock.food = 200;
    a.expecting = b.expecting = w.time + 1;
    thrimp.run(HOUR + 1);
    const child = w.thrimps.find(t => t.parents.includes(a.id) && t.parents.includes(b.id));
    if (!child) return { born: false };
    const out = { born: true, home: child.home === a.home, stage: child.stage, love: child.opinions[a.id] >= 30 && a.opinions[child.id] >= 30,
      proud: a.thoughts.some(t => t.id === 'new_child') && b.thoughts.some(t => t.id === 'new_child'), label: relationLabel(a, child) };
    child.born = w.time - (CHILD_DAYS + 0.1) * DAY;
    thrimp.run(HOUR + 1);
    return { ...out, grown: child.stage, grewUp: child.thoughts.some(t => t.id === 'grew_up') };
  });
  expect(r).toEqual({ born: true, home: true, stage: 'child', love: true, proud: true, label: 'Child', grown: 'adult', grewUp: true });
  expect(errors).toEqual([]);
});

test('old age takes a Thrimp, who is buried and mourned', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world, [a, b] = w.thrimps;
    a.partner = b.id; b.partner = a.id; a.opinions[b.id] = b.opinions[a.id] = 80;
    a.born = w.time - (a.lifespan + 0.6) * DAY;
    thrimp.run(HOUR + 1);
    const gone = !w.thrimps.includes(a), d = w.dead.find(x => x.id === a.id), grave = d && graveById(w, d.grave);
    const widowed = b.partner === 0 && b.thoughts.some(t => t.id === 'lost_partner') && grave && b.mourn.includes(grave.id);
    for (let m = 0; m < 2 * DAY && !b.thoughts.some(t => t.id === 'paid_respects'); m += 10) thrimp.run(10);
    return { gone, cause: d && d.cause, grave: !!grave, widowed: !!widowed, respects: b.thoughts.some(t => t.id === 'paid_respects'), dead: w.stats.deaths };
  });
  expect(r).toEqual({ gone: true, cause: 'old age', grave: true, widowed: true, respects: true, dead: 1 });
  expect(errors).toEqual([]);
});

test('a fever weakens, keeps them in bed, spreads, and passes', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(4 * HOUR);
    const [a, b] = w.thrimps.filter(t => t.home && !t.hidden);
    fallSick(a, w);
    a.sick.severity = 0.3; a.sick.until = w.time + DAY;
    for (let i = 0; i < 200 && !b.sick; i++) spreadSickness(a, b, w);
    thrimp.run(3 * HOUR);
    const weaker = a.health < 1, inBed = !!(a.job && (a.job.type === 'sleep' || a.job.type === 'eat')); // up only to eat
    thrimp.run(DAY);
    return { spread: !!b.sick || b.immuneUntil > 0, weaker, inBed, over: !a.sick && a.immuneUntil > w.time, recovered: a.thoughts.some(t => t.id === 'recovered') };
  });
  expect(r).toEqual({ spread: true, weaker: true, inBed: true, over: true, recovered: true });
  expect(errors).toEqual([]);
});

test('a violent Thrimp at breaking point can kill, and the colony turns on the killer', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const w = thrimp.world;
    thrimp.run(4 * HOUR);
    const [a, b, c] = w.thrimps.filter(t => !t.hidden && !t.asleep);
    a.traits = ['violent']; b.traits = b.traits.filter(t => t !== 'violent');
    a.opinions[b.id] = -90; c.opinions[b.id] = 60;
    b.x = b.px = a.x + 30; b.y = b.py = a.y; // the murderer only goes after someone within reach
    const went = startBreak(a, w, 'murder');
    for (let i = 0; i < 8 && w.thrimps.includes(b); i++) {
      a.socialCooldown = b.socialCooldown = 0;
      b.x = b.px = a.x + 12; b.y = b.py = a.y;
      startFight(a, b, w, true);
      thrimp.run(1);
    }
    const d = w.dead.find(x => x.id === b.id);
    return { went, killed: !!d && d.cause === 'killed' && d.killer === a.id, blamed: opinionOf(c, a) <= -40,
      guilt: a.thoughts.some(t => t.id === 'killed_violent') };
  });
  expect(r).toEqual({ went: true, killed: true, blamed: true, guilt: true });
  expect(errors).toEqual([]);
});

// Buildings the colony thinks up: each idea stays quiet until its trigger, and the finished building does its job.
// `idea` asks a project whether it's wanted and starts its site; `done` finishes a site at once.
const PROJECT_HELPERS = `
  const w = thrimp.world;
  const failed = [];
  const idea = type => { // three tries, as the colony would over a few hours when a spot is hard to find
    const already = w.sites.find(s => s.type === type); // the colony may have started it on its own meanwhile
    if (already) return already;
    for (let k = 0; k < 3; k++) { const i = PROJECTS[type].want(w), s = i && startProject(w, type, i); if (s) return s; }
    failed.push(type);
    return null;
  };
  const done = s => { if (!s) return null; s.woodIn = siteWood(s); s.work = siteWork(s); completeSite(w, s); return buildingOf(w, s.type); };
`;
test('meals eaten standing lead to a new table, soaked days to a shelter, spoiled food to a storehouse', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(PROJECT_HELPERS + `(() => {
    const quiet = ['table', 'shelter', 'storehouse'].every(t => !PROJECTS[t].want(w));
    w.standingMeals = 10;
    const tables = w.tables.length, seats = w.seats.length, t = idea('table');
    done(t);
    const moreSeats = w.tables.length === tables + 1 && w.seats.length === seats + 3;
    w.stats.soaked = 20;
    const shelter = done(idea('shelter'));
    w.weather.kind = 'rain'; w.weather.until = w.time + 6 * HOUR;
    const th = w.thrimps.find(x => !x.hidden && !x.asleep);
    if (shelter) { th.x = th.px = shelter.x; th.y = th.py = shelter.y - 6; }
    const dry = underShelter(th, w);
    w.stats.spoiled = 20;
    done(idea('storehouse'));
    w.stock.food = 300;
    projectsHourly(w);
    return { failed, quiet, moreSeats, dry, sheltering: ACTIONS.find(a => a.id === 'shelter').score(w.thrimps.find(x => !x.hidden && !underShelter(x, w)), w) > 0,
      keptDry: w.stock.food === 300, ideas: w.thrimps.reduce((n, x) => n + x.memories.filter(m => m.text.startsWith('Had the idea')).length, 0) };
  })()`);
  expect(r).toEqual({ failed: [], quiet: true, moreSeats: true, dry: true, sheltering: true, keptDry: true, ideas: 3 });
  expect(errors).toEqual([]);
});

test("a fever brings a healer's hut, children a play area, crowding a family house, deaths a memorial", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(PROJECT_HELPERS + `(() => {
    // Healer: after an outbreak; the sick then rest there, and the fever is cut short.
    w.lastOutbreak = w.time;
    const healer = done(idea('healer'));
    const sick = w.thrimps[3];
    if (sick.job) finishJob(sick, w, true);
    fallSick(sick, w);
    const before = sick.sick.until - w.time;
    if (healer) { sick.x = sick.px = healer.door.x; sick.y = sick.py = healer.door.y; }
    startJob(sick, w, makeSleepJob(sick, w), 'sleep');
    // A few steps in through the door (or, if something got in the way, the next time they choose to rest).
    for (let m = 0; m < 60 && !sick.inHealer; m += 5) thrimp.run(5);
    const cared = !!sick.inHealer && sick.sick.until - w.time < before * 0.7;
    // Family house: a couple and their children overflowing a hut.
    const [a, b] = w.thrimps.filter(t => t.partner && t.home).slice(0, 1).flatMap(t => [t, byId(w, t.partner)]);
    // (No running time here: the colony's own hourly planning would start these first.)
    const kids = [0, 1].map(() => { const k = makeThrimp(w, a.x, a.y, a.home, 2); k.parents = [a.id, b.id]; w.thrimps.push(k); return k; });
    const house = done(idea('house'));
    const movedIn = !!house && [a, b, ...kids].every(t => t.home === house.id);
    // Play area: three or more children.
    w.thrimps.push(makeThrimp(w, a.x, a.y, a.home, 3));
    const pg = done(idea('playground'));
    if (pg) { kids[0].x = kids[0].px = pg.x + 60; kids[0].y = kids[0].py = pg.y; } // a child out playing nearby
    const play = makePlayJob(kids[0], w).title;
    // Memorial: after three deaths, by the graveyard.
    for (const t of w.thrimps.filter(t => ![a, b, ...kids, sick].includes(t)).slice(0, 3)) markDead(t, w, 'old age');
    processDeaths(w);
    const stone = done(idea('memorial'));
    return { failed, cared, movedIn, play, nearGraves: !!stone && dist(stone.x, stone.y, w.graveyard.x, w.graveyard.y) < 90 };
  })()`);
  expect(r).toEqual({ failed: [], cared: true, movedIn: true, play: 'Off to the play area', nearGraves: true });
  expect(errors).toEqual([]);
});

test('a campfire gathers people in the evening', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(PROJECT_HELPERS + `(() => {
    w.time += 3 * DAY; // the colony has been here a few days (a campfire comes on day 4, or sooner if they're lonely)
    const fire = done(idea('campfire'));
    w.weather.kind = 'clear'; w.weather.until = w.time + 3 * DAY; // a dry evening
    const to = Math.floor(w.time / DAY) * DAY + DAY + 18.5 * HOUR; // the next evening
    while (w.time < to) thrimp.run(10);
    let most = 0;
    for (let m = 0; m < 3 * HOUR; m += 10) { thrimp.run(10); most = Math.max(most, w.thrimps.filter(t => t.job && t.job.type === 'campfire').length); }
    return { fire: !!fire, most };
  })()`);
  expect(r.fire).toBe(true);
  expect(r.most).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('logs piling up get someone to invent sawing; it spreads, and the sawmill turns logs into planks', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(PROJECT_HELPERS + `(() => {
    const quiet = !knowersOf(w, 'sawing').length && !PROJECTS.sawmill.want(w);
    w.time += 5 * DAY; w.stock.wood = 80; // settled in, and logs piling up
    const thinker = w.thrimps.find(t => t.stage === 'adult');
    thinker.traits = ['curious', 'hard-working'];
    for (let k = 0; k < 400 && !knowersOf(w, 'sawing').length; k++) craftsHourly(w);
    const inventor = knowersOf(w, 'sawing')[0];
    const pupil = w.thrimps.find(t => t.stage === 'adult' && !knows(t, 'sawing'));
    for (let k = 0; k < 200 && !knows(pupil, 'sawing'); k++) teachSkills(inventor, pupil, w);
    const mill = done(idea('sawmill'));
    w.stock.wood = 80; w.stock.planks = 0;
    const to = Math.floor(w.time / DAY) * DAY + DAY + 9 * HOUR; // the next working day
    while (w.time < to) thrimp.run(30);
    for (let m = 0; m < 6 * HOUR && w.stock.planks === 0; m += 10) thrimp.run(10);
    return { failed, quiet, invented: !!inventor && w.knowledge.sawing && w.knowledge.sawing.by === inventor.id,
      taught: knows(pupil, 'sawing'), mill: !!mill, planks: w.stock.planks > 0 };
  })()`);
  expect(r).toEqual({ failed: [], quiet: true, invented: true, taught: true, mill: true, planks: true });
  expect(errors).toEqual([]);
});

test('a quarry cuts stone; homes are upgraded in place to cottages and stone houses; the canteen grows', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(PROJECT_HELPERS + `(() => {
    const [a, b] = w.thrimps.filter(t => t.stage === 'adult');
    learn(a, w, 'sawing'); learn(b, w, 'quarrying');
    done(idea('sawmill'));
    const quarry = done(idea('quarry')), rock = quarry && outcropById(w, quarry.outcrop);
    const before = rock ? rock.stone : 0;
    // Stone: b cuts a few loads.
    for (let k = 0; k < 3 && rock; k++) {
      if (b.job) finishJob(b, w, true);
      startJob(b, w, makeQuarryJob(b, w), 'quarry');
      for (let m = 0; m < 3 * HOUR && b.job && b.job.type === 'quarry'; m += 5) thrimp.run(5);
    }
    const cut = !!rock && rock.stone < before && w.stock.stone > 0;
    // A hut with a couple in it becomes a cottage, then a stone house: the same building, the same people.
    w.stock.planks = 40; w.stock.stone = 40;
    const cottage = done(idea('cottage'));
    const home = cottage && w.buildings.find(x => x.type === 'cottage');
    const people = home ? residentsOf(w, home).map(t => t.id).join() : '';
    if (home) home.upgradedDay -= 5; w.lastUpgrade = -1e9; // lived in for a while
    done(idea('stonehouse'));
    const stone = home && home.type === 'stonehouse' && residentsOf(w, home).map(t => t.id).join() === people;
    // The canteen: six tables full and people still eating standing, so it's extended.
    for (let k = w.tables.length; k < 6; k++) { const p = chooseTableSpot(w); if (p) { claimGround(w, p); addTable(w, p.x, p.y); } }
    w.standingMeals = 10;
    done(idea('bigcanteen'));
    const tables = w.tables.length; // (in a cramped village there may be no room for more tables)
    return { failed, cut, upgraded: !!home, stone, canteen: w.canteen.art === 'canteen-big' && tablesAllowed(w) === 10 && tables >= 6 };
  })()`);
  expect(r).toEqual({ failed: [], cut: true, upgraded: true, stone: true, canteen: true });
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
