// ============================================================
// GROUND: painted once into one big pixel canvas (no tiles)
// ============================================================
function paintGround(world, P) {
  const c = makeCanvas(MAP_W, MAP_H), g = c.getContext('2d');
  const img = g.createImageData(MAP_W, MAP_H), d = img.data;
  const grass = P.grass.map(hexRgb), dirt = P.dirt.map(hexRgb), water = P.water.map(hexRgb);
  const T = world.waterT;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const b = bayer(x, y) - 0.5;
      const wv = sampleField(world.waterF, x, y);
      let col;
      if (wv > T) {
        const depth = (wv - T) / 0.06;
        col = depth < 0.12 ? (b > 0.25 ? water[2] : water[1]) : depth + b * 0.35 > 1 ? water[0] : water[1];
      } else if (wv > T - 0.014 + b * 0.006) {
        col = wv > T - 0.006 ? dirt[1] : dirt[2];
      } else {
        const tint = sampleField(world.tintF, x, y) + b * 0.08;
        const fo = sampleField(world.forestF, x, y) + b * 0.12;
        col = fo > 0.72 ? grass[0] : (fo > 0.45 || tint < 0.36) ? grass[1] : grass[2];
      }
      const i = (y * MAP_W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  // Worn ground at doors, under the tables and around the lumberyard (trails will add to this later).
  for (const s of world.dirtSpots) {
    for (let y = Math.floor(s.y - s.ry); y <= s.y + s.ry; y++) for (let x = Math.floor(s.x - s.rx); x <= s.x + s.rx; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || isWater(world, x, y)) continue;
      const v = 1 - (((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2) + (bayer(x, y) - 0.5) * 0.5;
      if (v <= 0) continue;
      const col = v > 0.7 && bayer(x + 1, y + 2) > 0.85 ? dirt[3] : dirt[2];
      const i = (y * MAP_W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
    }
  }
  g.putImageData(img, 0, 0);

  // Decoration uses its own rng seeded from the world, so repainting (e.g. after loading a save) gives the same meadow.
  const r = mulberry32(world.seed ^ 0x5eed);
  const at = () => [Math.floor(r() * MAP_W), Math.floor(r() * MAP_H)];
  const meadow = (x, y) => sampleField(world.waterF, x, y) < T - 0.02 && dirtValue(world, x, y) <= 0;
  for (let i = 0; i < MAP_W * MAP_H / 240; i++) {
    const [x, y] = at();
    if (!meadow(x, y)) continue;
    const fo = sampleField(world.forestF, x, y);
    g.fillStyle = fo > 0.6 ? P.grass[0] : r() < 0.5 ? P.grass[3] : P.grass[1];
    g.fillRect(x - 1, y - 1, 1, 2); g.fillRect(x, y - 2, 1, 3); g.fillRect(x + 1, y - 1, 1, 2);
  }
  for (let k = 0; k < 50; k++) {
    const [cx, cy] = at();
    if (!meadow(cx, cy) || sampleField(world.forestF, cx, cy) > 0.4) continue;
    const col = P.flower[Math.floor(r() * P.flower.length)];
    for (let i = 0; i < 4 + r() * 6; i++) {
      const x = Math.round(cx + (r() - 0.5) * 24), y = Math.round(cy + (r() - 0.5) * 16);
      if (!meadow(x, y)) continue;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
      g.fillStyle = P.grass[1]; g.fillRect(x, y + 1, 1, 1);
    }
  }
  for (let i = 0; i < 180; i++) {
    const [x, y] = at();
    if (!meadow(x, y)) continue;
    g.fillStyle = P.stone[0]; g.fillRect(x, y, 2, 1);
    g.fillStyle = P.stone[2]; g.fillRect(x, y - 1, 1, 1);
  }
  for (let i = 0; i < 6000; i++) {
    const [x, y] = at();
    const wv = sampleField(world.waterF, x, y);
    if (wv < T - 0.016 || wv > T + 0.004) continue;
    g.fillStyle = P.grass[1]; g.fillRect(x, y - 3, 1, 3);
    if (r() < 0.3) { g.fillStyle = P.dirt[1]; g.fillRect(x, y - 4, 1, 1); }
  }
  for (let i = 0; i < 3000; i++) {
    const [x, y] = at();
    if (sampleField(world.waterF, x, y) < T + 0.02) continue;
    g.fillStyle = P.grass[2]; g.fillRect(x, y, 3, 1); g.fillRect(x + 1, y + 1, 2, 1);
  }
  return c;
}
