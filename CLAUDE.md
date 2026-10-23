# Thrimp

A browser colony sim: small colonists ("Thrimps") live, love, feud and die on their own, a storyteller throws events
at them, and the player is a god who can step in but doesn't have to. The full design is in
[thrimp-design.md](thrimp-design.md); the plan is in [TODO.md](TODO.md).

**Owner:** Rasmus (GitHub `Unknown151`). He owns the design: lines marked **[Decided]** in the design doc are settled,
**[Proposed]** ones are open. Ask before changing anything decided. He likes to go through bigger changes step by step,
with choices explained in plain terms. He works both in Claude Code on the web and in the desktop app on his Windows PC.

Keep this file current: update it in the same change as anything it describes.

## Hard rules

1. **The simulation decides, Claude narrates.** No LLM call inside the sim loop. Mechanics and pacing are hand-written.
2. **One HTML file, vanilla JS and `<canvas>`.** No game engine, no runtime libraries or CDNs. Sprites ship as PNGs
   next to it.
3. **Edit `src/`, never `public/`.** `public/` is build output (gitignored), rebuilt locally and by Cloudflare.
4. **No visible tile grid.** Invisible grids for data (walk grid, fields) are fine.
5. **No offline catch-up.** The world only lives while the page is open.
6. **All art is locked to Endesga 32.** Build every sprite sheet with `tools/build-sheet.ps1` (usually with
   `-PaletteFrom`) and make objects with the Endesga palette (see Art).
7. **No secrets in the repo.** The PixelLab token is the `PIXELLAB_API_TOKEN` environment variable; `.mcp.json` only
   names it. Future secrets go in Cloudflare's Worker settings or a gitignored `.dev.vars`.
8. **Every run is random.** No seed sharing; the seed exists only so a save can rebuild its world.
9. **Build and tests pass before every push.**

## Git workflow

- `main` is what deploys: Cloudflare Workers Builds builds and deploys every push to it.
- Work on a branch and open a PR that Rasmus merges. In the cloud, reuse one long-lived `claude/...` branch and restart
  it from the latest `main` after each merge. On the desktop, pull `main` first: cloud PRs may have landed.
- Commit and push only when tests pass, and on the desktop only when Rasmus asks.
- Commits are signed `Unknown151 <12183759+Unknown151@users.noreply.github.com>` (set in this repo's git config, so
  his real email stays private).

## Build and run

```
npm install                 # Wrangler (Cloudflare's CLI); the lockfile is committed so Cloudflare uses npm
npm --prefix test install   # Playwright for the tests
npm run build               # node build.mjs: src/ + assets/ -> public/
npm run dev                 # build, serve http://localhost:8080, rebuild on every change (refresh the page)
```

`build.mjs` glues `src/index.html`, `src/style.css` and `src/js/*.js` (in the order of its `SCRIPTS` list) into
`public/index.html` and mirrors `assets/` to `public/assets/`. It refuses to write anything if:

- any file, or the joined bundle, has a syntax error
- two top-level functions share a name (legal JS, but one silently replaces the other)
- the page contains `eval(`, `new Function`, `atob(`, `btoa(` or `String.fromCharCode`

On Rasmus's PC, Node is at `C:\Program Files\nodejs` (`.claude/launch.json` uses that full path).
Cloudflare: build command `node build.mjs`, deploy command `npx wrangler deploy`. `wrangler.jsonc` serves `./public`
at `thrimp.rsvn.dk` only (`workers_dev` and `preview_urls` are off so nothing skips the login). Cloudflare Access guards
the whole domain with an email policy and a one-time PIN. There's no Worker code yet; when one is added for `/api/*`,
it must check the Access token (`Cf-Access-Jwt-Assertion`) itself, like Seedfall's does.

## Tests

`npm test` runs the Playwright suite in `test/`. Locally it drives Microsoft Edge (no browser download). In the cloud
container, set `PW_CHROMIUM` to the pre-installed Chromium. Worlds are random, so check new tests with
`npx playwright test --repeat-each 10` (from `test/`) before trusting them.

| Test | Checks |
|---|---|
| loads a playable world | 12 Thrimps, a canteen, huts, bushes, HUD shows the place name, no console errors |
| sprite sheets load | idle, walk and gather in all 8 directions; chop east and west |
| object art | every `OBJECT_ART` file loads, and every building and tree uses its art |
| three days | everyone eats and sleeps, nobody starves, nobody is stuck "walking" in place, work gets done |
| traits and mood | 2-3 traits each, never an opposite pair; mood equals traits plus live thoughts |
| breakdown | a Thrimp held at -80 mood breaks down, then gets the "Let it all out" relief thought |
| smash and repair | a forced smashing break wrecks a table or the crate, and someone repairs it with wood |
| inspector mind | the inspector shows the mood label, every trait and every live thought |
| social life | over three days Thrimps chat, most pairs meet, and some feelings grow strong either way |
| fight | a fight leaves both shaken with a grudge and -20 opinion; a bystander remembers who started it |
| couples | mutual love (70+) and a flirt make partners; when one stops caring they split, the other heartbroken |
| relationships list | the inspector lists relationships; clicking one selects that Thrimp |
| routes | 200 routes across the path network never cross water, buildings or trees |
| inspector | clicking a Thrimp opens its inspector, Esc closes it |
| pacing | one game day simulates in under 1.5 s |

**Pacing baseline:** one game day with 12 Thrimps takes about 50 ms in Edge on Rasmus's PC (2026-10-23, with the
social layer; it was 21-25 ms before).

## Source map

| File | What lives there |
|---|---|
| `src/index.html` | Page shell: HUD, speed buttons, inspector, help bar. `/*@inline ...*/` markers are filled by the build |
| `src/style.css` | UI styling |
| `src/js/config.js` | `CONFIG` (timing, sizes, speeds), the Endesga 32 role palette `P`, sheet layout, building types |
| `src/js/helpers.js` | Seeded RNG, small math helpers, `weightedPick`, clock formatting, value noise, fields, `MinHeap` |
| `src/js/names.js` | Thrimp and place name generators |
| `src/js/world.js` | Terrain fields, walk grid, building placement, world generation |
| `src/js/paths.js` | Path network graph, A*, route smoothing, `findRoute` |
| `src/js/thrimp.js` | Thrimp data, needs decay, schedules, recent-activity memory |
| `src/js/mind.js` | `TRAITS`, `THOUGHTS` (moodlets), mood, mental breaks (`BREAKS`), inspirations, repairs |
| `src/js/social.js` | Spatial hash, opinions, chemistry, grudges, memories, `SOCIAL` encounters, fights, couples, gossip |
| `src/js/ai.js` | Job steps (`goTo`, `act`), job builders, utility scoring (`ACTIONS`), interrupts, `tick` |
| `src/js/sprites.js` | Procedural sprites (buildings, trees, bushes, emotes) and PixelLab sheet loading |
| `src/js/ground.js` | Paints the ground once into one big pixel canvas |
| `src/js/render.js` | Canvas, camera, y-sorted drawing, night lighting, debug overlay, name labels |
| `src/js/ui.js` | HUD and inspector |
| `src/js/input.js` | Mouse, wheel, keyboard, camera movement and follow |
| `src/js/main.js` | Fixed-step main loop, `init`, the `window.thrimp` console/test handle |
| `assets/` | Shipped art: `thrimp/*.png` (idle, walk, gather, chop sheets), `objects/*.png`, `favicon.png` |
| `art/` | Raw PixelLab downloads, `pixellab-objects.json` (object name -> id), previews (not shipped) |
| `tools/` | `build-sheet.ps1` (frames -> palette-locked sheet), `fetch-frames.ps1`, `fetch-objects.ps1` |
| `test/` | Playwright tests; `shots.mjs` saves screenshots of a fresh world (needs `npm run dev`) |

## How things work (the easy-to-break parts)

- **Time:** a fixed step of 20 ticks per real second at 1x, each 0.2 game minutes, so a game day is about 6 real
  minutes. Rendering interpolates between the last two positions (`px`, `py`). Real time per frame is capped at
  0.25 s, which is what stops catch-up after the tab was hidden.
- **Terrain** is three smooth fields (water, forest, tint) sampled on a 4 px grid and read bilinearly. Water is
  whatever is above the 90th percentile, so every map is about 10% water. Solids (buildings, tree trunks) live on an
  8 px walk grid.
- **Movement:** a sparse graph of walkable points (about 56 px apart, kept only if connected to the canteen), A* over
  it, then waypoints are skipped wherever a straight walk is clear. `segmentClear` ignores the start point so a Thrimp
  on an awkward spot can always walk off it.
- **AI:** each option in `ACTIONS` scores itself; the winner builds a job, a list of steps with `start` / `update` /
  `end`. `finishJob` runs the current step's `end` and the job's `cleanup`, which releases reservations (bushes,
  trees, seats). Forgetting a release leaves a bush reserved forever. Needs interrupt work every 10 game minutes.
  Jobs hold closures, so they are not saved: on load, clear jobs and let Thrimps re-decide.
- **Mind:** mood = trait base mood + every live thought (`moodOf`), recomputed every tick. `refreshMind` runs every
  10 game minutes: drops expired thoughts, re-adds condition thoughts (hungry, homeless, a smashed table…: thoughts
  without `mins`), then checks breaks and inspiration. The same thought again refreshes its timer rather than stacking.
  A break is a job of type `'break'` whose cleanup ends the break and adds the catharsis thought. In a comfortable
  colony nobody breaks: average mood sits around +5. Breaks need hardship (coming with steps 3, 5 and 7).
- **Social:** `socialTick` rebuilds the spatial hash every tick; each Thrimp looks around every 3 game minutes and has
  at most one encounter per 20 minutes with someone within 22 px. Opinions start as a first impression (housemates
  +20); **chemistry** (-1..1, fixed per pair from luck and clashing/shared traits) decides whether chats build
  friendship or rivalry. Negative opinions heal about 3 a week (not for the spiteful). Kisses and fights stop both
  Thrimps with a short `'social'` job; a fight gives both a 2-hour encounter cooldown. A step that starts a fight
  replaces its own job, so `runJob` checks `th.job !== j` after a step runs.
- **Broken things** (`table.broken`, `crate.broken`) block seats or spoil food until a `repair` job spends 4 wood.
- **Sprites** are anchored at the feet (`ax`, `ay`). Sheet frames share one baseline per direction (the lowest foot
  in any frame) so feet stay planted. Walk frames advance with distance walked, idle frames with game time.
- **State is plain data** (objects with ids, not class instances) so it can be saved later.

## Art (PixelLab)

- PixelLab is connected through `.mcp.json`; the token comes from the `PIXELLAB_API_TOKEN` environment variable.
- Base Thrimp: character `6188dae3-5df6-4f3e-b871-4ea318635c8f` (pro mode, 32 px, low top-down, 8 directions, chibi,
  Endesga 32). Walk group `a0cad017-6fbe-49b3-a4ff-54e742c57a91`, idle group `7d1dc0ff-a3cc-414d-bb18-9b45bfddb645`.
  New characters can pass `style_character_id` with this id to match its style.
- Pipeline: download raw frames to `art/pixellab-raw/<character>/<animation>/<direction>/<i>.png`, then
  `.\tools\build-sheet.ps1 -Frames <that folder> -Out assets\thrimp\<animation>.png -PaletteFrom art\pixellab-raw\<character>\rotations`.
  Rows follow `SHEET_DIRS` in `config.js`.
- Template animations drift off-palette (one turned the tunic red). `-PaletteFrom` snaps frames to the character's own
  colours, which fixes that. Skip `-PaletteFrom` when an animation adds a prop with new colours (the chop axe).
- Action animations: `th.working` names the sheet (`'gather'`, `'chop'`); a sheet may cover only some directions
  (chop is east/west only). `tools/fetch-frames.ps1` downloads one direction of an animation.
- **Objects** (buildings, trees, bushes, props) are made with `create_object_pro_flash`: `n_directions: 1`,
  `view: low top-down`, the full Endesga 32 `palette` (so no snapping is needed), and a `style_image` from the same
  family (buildings use the hut, trees the oak, small props the Thrimp). Record every object in
  `art/pixellab-objects.json`, then `tools/fetch-objects.ps1` downloads them and installs them in `assets/objects/`.
  The game's list is `OBJECT_ART` in `config.js`; each is anchored at the bottom centre of its drawn pixels.
- Pro Flash pads its canvas: a 96x96 hut is drawn about 45 px wide. Building footprints take the drawn width.
- About 2 PixelLab jobs per object and 8 job slots, so queue objects about four at a time.
- Jobs take 1-5 minutes. Use `wait_for_jobs` with a timeout of 240 s or less (longer calls time out in the client).
- PowerShell trap: `[byte] -shl 16` stays a byte and wraps to 0. Use `$color.ToArgb()` for colour keys.

## Style

- Match the surrounding code: plain functions and data objects, short comments that explain why, no frameworks.
- New source files go in the build's `SCRIPTS` list, in an order where top-level code only uses what's above it.

## Next up

See [TODO.md](TODO.md).
