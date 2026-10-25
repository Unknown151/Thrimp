// ============================================================
// WORLD: terrain, buildings, resources
// ============================================================
function isWater(world, x, y) { return sampleField(world.waterF, x, y) > world.waterT; }
function isBlocked(world, x, y) {
  if (x < 6 || y < 10 || x > MAP_W - 6 || y > MAP_H - 4) return true;
  if (world.solid[Math.floor(y / CONFIG.CELL) * world.gw + Math.floor(x / CONFIG.CELL)]) return true;
  return sampleField(world.waterF, x, y) > world.waterT - 0.004; // keep feet off the waterline
}
function markSolid(world, x0, y0, x1, y1, value = 1) {
  const C = CONFIG.CELL;
  for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++)
    for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++)
      if (cx >= 0 && cy >= 0 && cx < world.gw && cy < world.gh) world.solid[cy * world.gw + cx] = value;
}
// The start point is skipped so a Thrimp standing on an awkward spot can always walk away from it.
function segmentClear(world, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(dist(x0, y0, x1, y1) / 4));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (isBlocked(world, lerp(x0, x1, t), lerp(y0, y1, t))) return false;
  }
  return true;
}
function dirtValue(world, x, y) {
  let v = 0;
  for (const s of world.dirtSpots) v = Math.max(v, 1 - (((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2));
  return v;
}

// Placing a building is three steps, so a construction site can claim its ground long before the hut exists:
// checkPlacement (is there room?), claimGround (block it off), addBuilding (the finished building).
function checkPlacement(world, type, x, y, side = 12, front = 18) {
  const T = BUILDING_TYPES[type];
  x = Math.round(x); y = Math.round(y);
  const looks = (T.art || []).filter(name => objectArt[name]);
  const look = looks.length ? pick(looks) : null;
  const w = look ? Math.max(20, objectArt[look].width - 8) : T.w, h = T.h; // with art, the walls set the width
  const rect = { x0: x - w / 2 - side, x1: x + w / 2 + side, y0: y - h - 10, y1: y + front };
  if (rect.x0 < 24 || rect.x1 > MAP_W - 24 || rect.y0 < 48 || rect.y1 > MAP_H - 20) return null;
  if (world.noBuild.some(r => rectsOverlap(r, rect))) return null;
  for (let yy = rect.y0; yy <= rect.y1; yy += 4)
    for (let xx = rect.x0; xx <= rect.x1; xx += 4)
      if (isWater(world, xx, yy) || world.solid[Math.floor(yy / CONFIG.CELL) * world.gw + Math.floor(xx / CONFIG.CELL)]) return null;
  return { type, x, y, w, h, look, rect };
}
function claimGround(world, p) {
  world.noBuild.push(p.rect);
  markSolid(world, p.x - p.w / 2, p.y - p.h, p.x + p.w / 2 - 1, p.y - 1);
}
function releaseGround(world, p) {
  const same = (a, b) => a.x0 === b.x0 && a.x1 === b.x1 && a.y0 === b.y0 && a.y1 === b.y1; // by value: survives a save
  world.noBuild = world.noBuild.filter(r => !same(r, p.rect));
  markSolid(world, p.x - p.w / 2, p.y - p.h, p.x + p.w / 2 - 1, p.y - 1, 0); // checkPlacement made sure nothing else was there
}
function addBuilding(world, p) {
  const T = BUILDING_TYPES[p.type];
  const b = { id: world.nextId++, type: p.type, label: T.label, art: p.look, x: p.x, y: p.y, w: p.w, h: p.h,
    door: { x: p.x, y: p.y + 5 }, sleepers: [] };
  world.buildings.push(b);
  world.byId.set(b.id, b);
  world.dirtSpots.push({ x: p.x, y: p.y + 7, rx: 10, ry: 6, building: b.id });
  return b;
}
function placeBuilding(world, type, x, y, side, front) {
  const p = checkPlacement(world, type, x, y, side, front);
  if (!p) return null;
  claimGround(world, p);
  return addBuilding(world, p);
}

// Terrain comes only from terrainSeed and the settlement centre, so a save just stores those two and rebuilds it.
function buildTerrain(world) {
  const trng = mulberry32(world.terrainSeed);
  const fbmWater = makeNoise(trng), fbmForest = makeNoise(trng), fbmTint = makeNoise(trng);
  const { x: cx, y: cy } = world.center;
  const keepClear = (x, y) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * 230 ** 2));
  const edge = (x, y) => clamp(1 - Math.min(x, MAP_W - x, y, MAP_H - y) / 240, 0, 1);
  world.waterF = makeField((x, y) => fbmWater(x / 300, y / 300) - 0.55 * keepClear(x, y));
  const sorted = Float32Array.from(world.waterF.data).sort();
  world.waterT = sorted[Math.floor(sorted.length * 0.9)]; // ~10% of the map is water
  world.forestF = makeField((x, y) => clamp(fbmForest(x / 200, y / 200) * 0.9 + edge(x, y) * 0.75 - 0.35 - 0.6 * keepClear(x, y), 0, 1));
  world.tintF = makeField((x, y) => fbmTint(x / 90, y / 90));
  world.gw = Math.ceil(MAP_W / CONFIG.CELL);
  world.gh = Math.ceil(MAP_H / CONFIG.CELL);
  world.solid = new Uint8Array(world.gw * world.gh);
}

function generateWorld() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const world = tryGenerateWorld();
    if (world) return world;
  }
  throw new Error('Could not generate a playable world');
}

function tryGenerateWorld() {
  const world = {
    seed: SEED, time: CONFIG.START_HOUR * HOUR, tick: 0,
    placeName: makePlaceName(),
    stock: { food: CONFIG.START_FOOD, wood: 0 },
    buildings: [], byId: new Map(), trees: [], bushes: [], thrimps: [],
    tables: [], seats: [], shoreSpots: [], noBuild: [], dirtSpots: [],
    names: new Set(), nextId: 1, stats: {},
  };
  world.terrainSeed = Math.floor(rand() * 2 ** 32);
  world.center = { x: MAP_W * randRange(0.42, 0.58), y: MAP_H * randRange(0.42, 0.58) };
  const cx = world.center.x, cy = world.center.y;
  buildTerrain(world);

  // Canteen at the heart of the settlement, with tables and a food store out front.
  let canteen = null;
  for (let i = 0; i < 300 && !canteen; i++) {
    const spread = i / 3;
    canteen = placeBuilding(world, 'canteen', cx + randRange(-spread, spread), cy + randRange(-spread, spread), 32, 46);
  }
  if (!canteen) return null;
  world.canteen = canteen;
  const ty = canteen.y + 26;
  for (const tx of [canteen.x - 30, canteen.x + 30]) {
    const table = { x: tx, y: ty, broken: false };
    world.tables.push(table);
    // The table is seen end-on with a bench either side; one more seat at the far end.
    world.seats.push({ x: tx - 13, y: ty - 2, face: 'east', takenBy: 0, table });
    world.seats.push({ x: tx + 13, y: ty - 2, face: 'west', takenBy: 0, table });
    world.seats.push({ x: tx, y: ty - 14, face: 'south', takenBy: 0, table });
  }
  world.dirtSpots.push({ x: canteen.x, y: ty, rx: 46, ry: 16 });
  world.crate = { x: canteen.x + canteen.w / 2 + 14, y: canteen.y + 4, broken: false };
  world.store = { x: world.crate.x, y: world.crate.y + 7 };

  // Lumberyard out toward the thickest woods.
  let bestAng = 0, bestF = -1;
  for (let a = 0; a < 24; a++) {
    const ang = a / 24 * Math.PI * 2;
    const f = sampleField(world.forestF, cx + Math.cos(ang) * 380, cy + Math.sin(ang) * 300);
    if (f > bestF) { bestF = f; bestAng = ang; }
  }
  let yard = null;
  for (let i = 0; i < 400 && !yard; i++) {
    const ang = bestAng + randRange(-0.6, 0.6), r = randRange(220, 330);
    yard = placeBuilding(world, 'lumberyard', cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, 16, 22);
  }
  if (yard) {
    yard.drop = { x: yard.x, y: yard.y + 9 };
    world.lumberyard = yard;
    world.dirtSpots.push({ x: yard.x, y: yard.y + 4, rx: 30, ry: 12, building: yard.id });
  }

  // Huts scattered loosely around the canteen.
  // One hut short on purpose: the last two Thrimps start out sleeping rough, and building them a home is the
  // colony's first project. Couples forming later raise more.
  const nHuts = Math.ceil(CONFIG.START_THRIMPS / 2) - 1;
  for (let k = 0; k < nHuts; k++) {
    for (let i = 0; i < 400; i++) {
      const ang = rand() * Math.PI * 2, r = randRange(100, 250);
      const hut = placeBuilding(world, 'hut', cx + Math.cos(ang) * r * 1.3, cy + Math.sin(ang) * r * 0.85);
      if (hut) { hut.label = `Hut ${k + 1}`; break; }
    }
  }

  // Trees: thick toward the edges, a few strays in the open.
  const treeBuckets = new Map(), TB = 32, tcols = Math.ceil(MAP_W / TB);
  const nearTree = (x, y, r) => {
    const bx = Math.floor(x / TB), by = Math.floor(y / TB), k = Math.ceil(r / TB);
    for (let j = by - k; j <= by + k; j++) for (let i = bx - k; i <= bx + k; i++) {
      if (i < 0 || j < 0 || i >= tcols) continue;
      for (const t of treeBuckets.get(i + j * tcols) || []) if ((t.x - x) ** 2 + (t.y - y) ** 2 < r * r) return true;
    }
    return false;
  };
  for (let i = 0; i < 16000 && world.trees.length < 900; i++) {
    const x = Math.round(randRange(10, MAP_W - 10)), y = Math.round(randRange(30, MAP_H - 6));
    const f = sampleField(world.forestF, x, y);
    if (rand() > f * f * 1.5 + 0.004) continue;
    if (isWater(world, x, y) || isWater(world, x, y - 8) || dist(x, y, cx, cy) < 160) continue;
    if (world.noBuild.some(r => x > r.x0 - 12 && x < r.x1 + 12 && y > r.y0 - 4 && y < r.y1 + 30)) continue;
    if (nearTree(x, y, lerp(34, 16, f))) continue;
    const kind = f > 0.55 && chance(0.6) ? 'pine' : 'oak';
    const looks = TREE_ART[kind].filter(name => objectArt[name]);
    const tree = { id: world.nextId++, x, y, kind, variant: randInt(0, 1), art: looks.length ? pick(looks) : null,
      wood: 3, stump: false, regrowAt: 0, reservedBy: 0 };
    world.trees.push(tree);
    const k = Math.floor(x / TB) + Math.floor(y / TB) * tcols;
    if (!treeBuckets.has(k)) treeBuckets.set(k, []);
    treeBuckets.get(k).push(tree);
    markSolid(world, x - 2, y - 2, x + 2, y);
  }

  // Berry bushes in a few meadow patches.
  for (let p = 0; p < 3; p++) {
    let px = 0, py = 0, found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const ang = rand() * Math.PI * 2, r = randRange(170, 380);
      px = cx + Math.cos(ang) * r * 1.2; py = cy + Math.sin(ang) * r * 0.8;
      found = !isBlocked(world, px, py) && sampleField(world.forestF, px, py) < 0.45
        && !world.noBuild.some(rc => px > rc.x0 - 30 && px < rc.x1 + 30 && py > rc.y0 - 30 && py < rc.y1 + 30);
    }
    if (!found) continue;
    for (let k = 0; k < randInt(5, 8); k++) {
      const x = Math.round(px + randRange(-38, 38)), y = Math.round(py + randRange(-26, 26));
      if (isBlocked(world, x, y) || isBlocked(world, x, y + 6) || nearTree(x, y, 14)) continue;
      if (world.bushes.some(b => dist(b.x, b.y, x, y) < 20)) continue;
      if (world.noBuild.some(rc => x > rc.x0 && x < rc.x1 && y > rc.y0 && y < rc.y1 + 10)) continue;
      world.bushes.push({ id: world.nextId++, x, y, ix: x, iy: y + 6, berries: randInt(2, 6), max: 6, reservedBy: 0 });
    }
  }

  buildGraph(world);
  if (nearestVisibleNode(world, canteen.door.x, canteen.door.y) < 0) return null;

  // Keep only resources a Thrimp can actually walk to.
  for (const tr of world.trees) {
    tr.reachable = false;
    // Stand beside the roots and a little in front of the trunk, so the chopper is drawn over the tree.
    for (const s of chance(0.5) ? [-11, 11] : [11, -11]) {
      const ix = tr.x + s, iy = tr.y + 3;
      if (!isBlocked(world, ix, iy) && nearestVisibleNode(world, ix, iy) >= 0) { tr.ix = ix; tr.iy = iy; tr.reachable = true; break; }
    }
  }
  world.bushes = world.bushes.filter(b => nearestVisibleNode(world, b.ix, b.iy) >= 0);
  if (world.bushes.length < 6) return null;
  world.buildings = world.buildings.filter(b => b === canteen || nearestVisibleNode(world, b.door.x, b.door.y) >= 0);
  if (world.lumberyard && !world.buildings.includes(world.lumberyard)) world.lumberyard = null;
  world.dirtSpots = world.dirtSpots.filter(s => !s.building || world.buildings.some(b => b.id === s.building)); // no worn doorstep where no hut stands

  for (let i = 0; i < 2500 && world.shoreSpots.length < 40; i++) {
    const x = Math.round(randRange(20, MAP_W - 20)), y = Math.round(randRange(20, MAP_H - 20));
    if (isBlocked(world, x, y) || sampleField(world.forestF, x, y) > 0.6) continue;
    let face = null;
    for (const [dx, dy, dir] of [[0, 12, 'south'], [0, -12, 'north'], [12, 0, 'east'], [-12, 0, 'west']]) {
      if (isWater(world, x + dx, y + dy)) { face = dir; break; }
    }
    if (face && nearestVisibleNode(world, x, y) >= 0) world.shoreSpots.push({ x, y, face });
  }

  // Founders, two to a hut. The first three huts hold young couples who came here together (so the first children
  // come within days); the rest are housemates, and the last two have no hut yet.
  const huts = world.buildings.filter(b => b.type === 'hut');
  const COUPLES = 3;
  for (let i = 0; i < CONFIG.START_THRIMPS; i++) {
    const home = huts[Math.floor(i / 2)] || null;
    const door = home ? home.door : canteen.door, couple = Math.floor(i / 2) < COUPLES && home;
    world.thrimps.push(makeThrimp(world, door.x + randRange(-8, 8), door.y + randRange(2, 10), home ? home.id : 0,
      couple ? randRange(9, 15) : undefined));
  }
  for (let k = 0; k < COUPLES; k++) {
    const [a, b] = world.thrimps.slice(k * 2, k * 2 + 2);
    if (!a || !b || !a.home) continue;
    a.partner = b.id; b.partner = a.id;
    a.opinions[b.id] = b.opinions[a.id] = Math.round(randRange(65, 80));
    a.chemistry[b.id] = b.chemistry[a.id] = randRange(0.3, 0.6);
    for (const [x, y] of [[a, b], [b, a]]) memorize(x, world, `Came here together with ${y.name}`, y.id);
  }
  world.sites = [];
  world.dead = []; world.graves = []; world.graveyard = null;
  initTrails(world);
  seedTrails(world);
  initWeather(world);
  return world;
}
