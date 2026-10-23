// Takes screenshots of a fresh world for eyeballing art and layout: node test/shots.mjs [outDir]
// Needs the dev server running (npm run dev). Uses Edge locally, or PW_CHROMIUM in the cloud.
import { chromium } from '@playwright/test';
import path from 'node:path';

const out = process.argv[2] || 'test/shots';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : { channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.thrimp && thrimp.world && thrimp.anims.walk);

const shot = async (name, setup) => {
  await page.evaluate(setup);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`saved ${name}.png`);
};
await shot('building-site', () => {
  thrimp.setSpeed(0);
  for (let m = 0; m < 2 * DAY && !thrimp.world.sites.some(s => siteStage(s) >= 1); m += 10) thrimp.run(10);
  const s = thrimp.world.sites[0] || thrimp.world.canteen;
  const at = s.p || s;
  cam.zoom = 3; cam.x = at.x; cam.y = at.y - 20;
});
await shot('trails-day3', () => {
  thrimp.run(2 * DAY);
  cam.zoom = 1.5; cam.x = thrimp.world.canteen.x; cam.y = thrimp.world.canteen.y;
});
await page.goto('http://localhost:8080/');
await page.waitForFunction(() => window.thrimp && thrimp.world && thrimp.anims.walk);
await shot('village-midday', () => { thrimp.setSpeed(0); thrimp.run(6 * 60); const c = thrimp.world.canteen; cam.zoom = 2; cam.x = c.x; cam.y = c.y + 10; });
await shot('lumberyard', () => { const y = thrimp.world.lumberyard; cam.zoom = 3; cam.x = y.x; cam.y = y.y - 10; });
await shot('overview', () => { cam.zoom = 1; cam.x = thrimp.world.canteen.x; cam.y = thrimp.world.canteen.y; });
await shot('inspector', () => {
  const t = thrimp.world.thrimps.filter(t => !t.hidden).sort((a, b) => b.thoughts.length - a.thoughts.length)[0];
  thrimp.select(t.id); cam.zoom = 3; cam.x = t.x; cam.y = t.y - 10;
});
await shot('fight', () => {
  const w = thrimp.world, [a, b, c] = w.thrimps.filter(t => !t.hidden && !t.asleep);
  const spot = { x: w.canteen.door.x - 60, y: w.canteen.door.y + 50 };
  [a, b, c].forEach((t, i) => { if (t.job) finishJob(t, w, true); t.x = t.px = spot.x + [0, 16, 8][i]; t.y = t.py = spot.y + [0, 0, 22][i]; });
  buildSpatialHash(w); startFight(a, b, w); thrimp.run(3);
  thrimp.select(c.id); cam.zoom = 4; cam.x = spot.x + 40; cam.y = spot.y;
});
await page.evaluate(() => thrimp.select(0));
await shot('village-night', () => { thrimp.run(15 * 60 - 12.5 * 60 + 9 * 60); const c = thrimp.world.canteen; cam.zoom = 2; cam.x = c.x; cam.y = c.y + 10; });
await browser.close();
