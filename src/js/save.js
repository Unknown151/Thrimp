// ============================================================
// SAVE: the colony as plain JSON, kept on the Cloudflare site (worker/index.js) so it follows you between
// computers. No offline catch-up: time only passes while a page has the colony open.
// ============================================================
const SAVE_VERSION = 1;
const SAVE_EVERY_MS = 2 * 60 * 1000;
const cloud = { enabled: false, basedOn: 0, lastSaved: 0, lastSavedTime: -1, busy: false, note: '' };

// What makes this colony this colony. The terrain (from terrainSeed) and the path network are rebuilt on load;
// jobs, routes and reservations aren't saved: every Thrimp simply decides afresh what to do.
function serializeWorld(w) {
  const trailIdx = [], trailVal = [];
  let last = 0;
  for (const i of [...w.trailActive].sort((a, b) => a - b)) {
    const v = Math.round(w.trail[i] * 255);
    if (!v) continue;
    trailIdx.push(i - last); trailVal.push(v); last = i; // delta-coded: the list is long but mostly small numbers
  }
  return {
    v: SAVE_VERSION,
    seed: w.seed, terrainSeed: w.terrainSeed, center: w.center,
    time: w.time, tick: w.tick, placeName: w.placeName, nextId: w.nextId, stock: w.stock, stats: w.stats,
    buildings: w.buildings.map(b => ({ ...b, sleepers: [] })),
    canteen: w.canteen.id, lumberyard: w.lumberyard ? w.lumberyard.id : 0,
    trees: w.trees.map(t => ({ ...t, reservedBy: 0 })),
    bushes: w.bushes.map(b => ({ ...b, reservedBy: 0 })),
    tables: w.tables.map(t => ({ ...t, repairBy: 0 })),
    seats: w.seats.map(s => ({ x: s.x, y: s.y, face: s.face, table: w.tables.indexOf(s.table) })),
    crate: { ...w.crate, repairBy: 0 }, store: w.store,
    shoreSpots: w.shoreSpots, noBuild: w.noBuild, dirtSpots: w.dirtSpots, sites: w.sites,
    thrimps: w.thrimps.map(th => {
      const { job, route, ...rest } = th;
      return { ...rest, moving: false, working: false, hidden: false, asleep: false, breaking: null, emote: null, trailCell: -1 };
    }),
    trailIdx, trailVal,
  };
}

function restoreWorld(d) {
  if (!d || d.v !== SAVE_VERSION) return null;
  const w = {
    seed: d.seed, terrainSeed: d.terrainSeed, center: d.center, time: d.time, tick: d.tick, placeName: d.placeName,
    nextId: d.nextId, stock: d.stock, stats: d.stats || {},
    buildings: d.buildings, trees: d.trees, bushes: d.bushes, tables: d.tables, crate: d.crate, store: d.store,
    shoreSpots: d.shoreSpots, noBuild: d.noBuild, dirtSpots: d.dirtSpots, sites: d.sites || [], thrimps: d.thrimps,
  };
  buildTerrain(w);
  w.byId = new Map(w.buildings.map(b => [b.id, b]));
  w.names = new Set(w.thrimps.map(t => t.name));
  w.canteen = w.byId.get(d.canteen);
  w.lumberyard = d.lumberyard ? w.byId.get(d.lumberyard) : null;
  w.seats = d.seats.map(s => ({ ...s, takenBy: 0, table: w.tables[s.table] }));
  // The walk grid isn't saved: re-mark every footprint and trunk.
  for (const b of w.buildings) markSolid(w, b.x - b.w / 2, b.y - b.h, b.x + b.w / 2 - 1, b.y - 1);
  for (const s of w.sites) markSolid(w, s.p.x - s.p.w / 2, s.p.y - s.p.h, s.p.x + s.p.w / 2 - 1, s.p.y - 1);
  for (const t of w.trees) markSolid(w, t.x - 2, t.y - 2, t.x + 2, t.y);
  for (const th of w.thrimps) { th.px = th.x; th.py = th.y; }
  initTrails(w);
  let i = 0;
  d.trailIdx.forEach((step, k) => { i += step; w.trail[i] = d.trailVal[k] / 255; w.trailActive.add(i); });
  buildGraph(w);
  updateTrailCosts(w);
  return w;
}

// --- Talking to the Worker. Saves travel gzipped. ---
async function gzip(text) {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
async function gunzip(buf) {
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
// Returns the saved colony, or null for "start a new world". Local dev servers have no /api, so saving stays off there.
async function fetchSave() {
  try {
    const r = await fetch('/api/save', { cache: 'no-store' });
    if (r.status === 204) { cloud.enabled = true; return null; } // signed in, nothing saved yet
    if (!r.ok || r.headers.get('content-type') !== 'application/octet-stream') { cloud.note = 'Saving is off (no server here)'; return null; }
    cloud.enabled = true;
    cloud.basedOn = Number(r.headers.get('x-saved-at')) || 0;
    cloud.lastSaved = cloud.basedOn;
    return JSON.parse(await gunzip(await r.arrayBuffer()));
  } catch (e) {
    cloud.note = 'Couldn\'t reach the save: playing a new world';
    return null;
  }
}
async function pushSave(leaving = false) {
  if (!cloud.enabled || cloud.busy || !world || world.time === cloud.lastSavedTime) return;
  cloud.busy = true;
  try {
    const body = await gzip(JSON.stringify(serializeWorld(world)));
    const r = await fetch('/api/save', {
      method: 'PUT', body, keepalive: leaving && body.byteLength < 60000,
      headers: { 'content-type': 'application/octet-stream', 'x-based-on': String(cloud.basedOn) },
    });
    if (r.status === 409) {
      // Another computer saved since this one loaded: stop, rather than overwrite that colony.
      cloud.enabled = false;
      cloud.note = 'Another computer has saved this colony since. Reload to continue from there.';
    } else if (r.ok) {
      cloud.basedOn = cloud.lastSaved = (await r.json()).savedAt;
      cloud.lastSavedTime = world.time;
      cloud.note = '';
    } else cloud.note = `Saving failed (${r.status}); will retry`;
  } catch (e) {
    cloud.note = 'Saving failed (offline?); will retry';
  }
  cloud.busy = false;
}
function startAutosave() {
  setInterval(() => pushSave(), SAVE_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushSave(true); });
}
async function newWorld() {
  if (!confirm('Start a new world? This colony will be gone for good.')) return;
  cloud.enabled = false; // nothing may save the old colony on the way out
  try { await fetch('/api/save', { method: 'DELETE' }); } catch (e) { /* offline: the next save overwrites it anyway */ }
  location.reload();
}
function saveStatus() {
  if (cloud.note) return cloud.note;
  if (!cloud.enabled) return '';
  if (!cloud.lastSaved) return 'Not saved yet';
  const mins = Math.floor((Date.now() - cloud.lastSaved) / 60000);
  return mins < 1 ? 'Saved just now' : `Saved ${mins} min ago`;
}
