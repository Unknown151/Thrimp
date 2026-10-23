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
await shot('village-midday', () => { thrimp.setSpeed(0); thrimp.run(6 * 60); const c = thrimp.world.canteen; cam.zoom = 2; cam.x = c.x; cam.y = c.y + 10; });
await shot('lumberyard', () => { const y = thrimp.world.lumberyard; cam.zoom = 3; cam.x = y.x; cam.y = y.y - 10; });
await shot('overview', () => { cam.zoom = 1; cam.x = thrimp.world.canteen.x; cam.y = thrimp.world.canteen.y; });
await shot('inspector', () => {
  const t = thrimp.world.thrimps.filter(t => !t.hidden).sort((a, b) => b.thoughts.length - a.thoughts.length)[0];
  thrimp.select(t.id); cam.zoom = 3; cam.x = t.x; cam.y = t.y - 10;
});
await page.evaluate(() => thrimp.select(0));
await shot('village-night', () => { thrimp.run(15 * 60 - 12.5 * 60 + 9 * 60); const c = thrimp.world.canteen; cam.zoom = 2; cam.x = c.x; cam.y = c.y + 10; });
await browser.close();
