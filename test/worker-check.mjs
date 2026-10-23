// Manual end-to-end check of saving through the real Worker (not part of npm test, which has no Worker).
// 1. npm run build   2. npx wrangler dev --port 8787 --ip 127.0.0.1   (needs .dev.vars with DEV_EMAIL=...)
// 3. from test/: node worker-check.mjs
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:8787';
for (let i = 0; i < 30; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : { channel: 'msedge' });
const errors = [];
const open = async () => {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.thrimp && thrimp.world);
  return page;
};
const snap = page => page.evaluate(() => {
  const w = thrimp.world;
  return { place: w.placeName, time: Math.round(w.time), huts: w.buildings.length, trees: w.trees.length,
    first: w.thrimps[0].name + ' ' + JSON.stringify(w.thrimps[0].traits), opinions: Object.keys(w.thrimps[0].opinions).length,
    trail: Math.round(w.trail.reduce((a, b) => a + b, 0)), water: w.waterT.toFixed(5), note: saveStatus() };
});

await fetch(BASE + '/api/save', { method: 'DELETE' });
const a = await open();
console.log('fresh (no save yet):', JSON.stringify(await snap(a)));
await a.evaluate(async () => { thrimp.setSpeed(0); thrimp.run(2 * DAY); await pushSave(); });
const before = await snap(a);
console.log('after 2 days + save:', JSON.stringify(before));

const b = await open(); // a second "computer"
const after = await snap(b);
console.log('reloaded elsewhere: ', JSON.stringify(after));
const same = ['place', 'time', 'huts', 'trees', 'first', 'opinions', 'trail', 'water'].every(k => before[k] === after[k]);
console.log('restored identically:', same);
await b.evaluate(() => { thrimp.setSpeed(0); thrimp.run(HOUR); });
console.log('restored world keeps running:', await b.evaluate(() => Math.round(thrimp.world.time)));

// Both pages now hold the same save. b saves first; a is behind and must be refused, not overwrite b.
await b.evaluate(async () => { thrimp.run(10); await pushSave(); });
await a.evaluate(async () => { thrimp.run(10); await pushSave(); });
console.log('stale computer after trying to save:', await a.evaluate(() => saveStatus()));
console.log('the newer computer still saves:', await b.evaluate(async () => { thrimp.run(10); await pushSave(); return saveStatus(); }));

const sizes = await b.evaluate(async () => ({ json: JSON.stringify(serializeWorld(thrimp.world)).length, gz: (await gzip(JSON.stringify(serializeWorld(thrimp.world)))).byteLength }));
console.log('save size: json', sizes.json, 'bytes, gzipped', sizes.gz);
console.log('page errors:', JSON.stringify(errors));
await browser.close();
