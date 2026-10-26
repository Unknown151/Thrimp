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
at `thrimp.rsvn.dk` only (`workers_dev` and `preview_urls` are off so nothing skips the login; builds for preview
branches are switched off in the dashboard). Cloudflare Access guards the whole domain with an email policy and a
one-time PIN. `worker/index.js` runs only for `/api/*` (`run_worker_first`) and checks the Access token
(`Cf-Access-Jwt-Assertion`) itself on every call: RS256 signature against the team's keys, `POLICY_AUD`, `TEAM_DOMAIN`
issuer, expiry. Saves live in the KV namespace bound as `SAVES`, one key per signed-in email.

Saving locally: `npm run dev` has no Worker, so saving stays off there (the dev server answers `/api/*` with a plain
200 so nothing logs an error). To test saving, run `npx wrangler dev --port 8787 --ip 127.0.0.1` with a gitignored
`.dev.vars` containing `DEV_EMAIL=you@localhost`: that stands in for the login, only for requests from this machine.
`test/worker-check.mjs` then checks save, reload, the two-computers conflict and save size end to end.

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
| trails | new worlds start with trails, a day of walking wears more in, an unused trail grows back within 5 days |
| trail cost | a fully worn edge costs under 70% of fresh grass, in `walkCost` and in the graph |
| building | the homeless pair raises one shared hut through all three stages within 4 days and moves in |
| site choice | a spot next to a rival's home scores well below the same spot next to a friend's |
| save round trip | after two days, a colony (weather included) through `serializeWorld`, gzip and `restoreWorld` matches exactly (trail wear to within its 1/255 steps) and plays on |
| routes | 200 routes across the path network never cross water, buildings or trees (curves included), and most bend |
| inspector | clicking a Thrimp opens its inspector, Esc closes it |
| things panel | clicking a hut opens a panel beside the click listing who lives there (a name selects them); it stays while the pointer is on it and closes when the pointer moves away; a bush says when it can be picked |
| trait tooltip | every trait has effects listed; hovering a chip shows them |
| nameplate colour | `moodColor` runs from Endesga red (breaking) through yellow to green (happy) |
| personal space | four Thrimps put on one spot end up more than 8 px apart |
| alerts | a fight shows a notice, drops 3x to 1x and selects the attacker (with "Jump there" on) |
| renaming | a new name shows in the inspector, is trimmed, can't copy someone else's, and survives a save |
| weather | over six days the weather changes; rain gives those outside "soaked" and those asleep at home "rain on the roof"; the HUD shows it |
| poses and gestures | someone eats seated at a table (sit-eat frames), a sleeper outdoors lies down, friends face each other and wave, and a walker waits for the wave before walking on |
| weather drawing | clear, cloudy, rain and fog, by day, dusk and night, draw without page errors; rain falls, and no fireflies come out in it |
| growing old | a Thrimp past 30 days is an elder: slower, grey-haired, "Old bones", shown as "Elder, 62" |
| children | a settled couple's due child is born at home, loved by and labelled as their child; at 8 days it grows up |
| old age | past their lifespan a Thrimp dies, gets a grave and a `w.dead` record; the partner is widowed and goes to the grave |
| fever | a fever hurts health, keeps them in bed, can spread on meeting, passes and leaves them immune |
| murder | a violent Thrimp's murderous break kills their enemy (`killed`, with killer); friends of the victim turn on the killer |
| tables, shelter, storehouse | quiet until their triggers; standing meals add a table (3 seats), the shelter keeps the rain off, the storehouse stops rain spoiling food; each idea is remembered by whoever had it |
| healer, house, play area, memorial | the sick rest at the healer's (fever shortened), a crowded family moves into a house with its children, children play at the play area, the memorial goes up by the graves |
| campfire | once built, at least three gather round it on a dry evening |
| sawing | logs piling up get a fitting adult to invent sawing, it's taught over chats, a sawmill is built, and planks get sawn |
| quarry and upgrades | a quarry cuts stone from its rock; a hut is rebuilt in place as a cottage, then a stone house, same people inside; the canteen is extended (room for 10 tables) |
| pacing | one game day simulates in under 1.5 s |

**Pacing baseline:** one game day with 12 Thrimps takes about 55-60 ms in Edge on Rasmus's PC on a quiet day
(2026-10-23, with social life, trails and building; it was 21-25 ms before those). The same build measured 130-150 ms
later that day, so compare against `main` on the same machine before blaming a change. Personal space adds ~10 ms.
Drawing (not in that number): a whole frame zoomed out in heavy rain at 12x renders in about 2-3 ms; the ambience
update is under 0.1 ms.

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
| `src/js/trails.js` | Wear map, footfall wear and decay, trail-discounted walk costs, seeded trails, the trail overlay |
| `src/js/thrimp.js` | Thrimp data, needs decay, schedules, recent-activity memory, `raiseAlert` |
| `src/js/mind.js` | `TRAITS` (+ `TRAIT_EFFECTS` for the tooltip), `THOUGHTS` (moodlets), mood, mental breaks (`BREAKS`), inspirations, repairs |
| `src/js/social.js` | Spatial hash, opinions, chemistry, grudges, memories, `SOCIAL` encounters, fights, couples, gossip, personal space |
| `src/js/construction.js` | Who needs a home, site choice, building sites of any type in stages, build jobs, completion |
| `src/js/projects.js` | `PROJECTS`: buildings Thrimps think up (house, table, campfire, shelter, storehouse, healer, memorial, play area), their triggers and what they do |
| `src/js/crafts.js` | Skills (`SKILLS`, `INVENTIONS`): inventing, teaching, inheriting, losing them; stone outcrops; sawing and quarrying jobs; sawmill, quarry, home and canteen upgrades |
| `src/js/weather.js` | `WEATHER` (clear, cloudy, rain, fog), hourly changes and wind, what the sky does to moods |
| `src/js/life.js` | Ages and life stages, health, fever, births and inheritance, deaths, grief, graves and mourning |
| `src/js/ai.js` | Job steps (`goTo`, `act`), job builders, utility scoring (`ACTIONS`), interrupts, `tick` |
| `src/js/sprites.js` | Procedural sprites (buildings, trees, bushes, emotes), PixelLab sheet loading, `thrimpSprite` (which frame a Thrimp shows) |
| `src/js/ground.js` | Paints the ground once into one big pixel canvas; remembers where the flowers are |
| `src/js/render.js` | Canvas, camera, y-sorted drawing, night lighting, debug overlay, mood-coloured nameplates |
| `src/js/ambience.js` | Looks-only life: butterflies, birds, fireflies, fish rings, rain, fog, cloud shadows, smoke, leaves, swaying trees, dusk light |
| `src/js/ui.js` | HUD, inspector, things panel (every building, sites, graves, bushes, trees), alert notices and the camera jump, trait tooltip, renaming |
| `src/js/input.js` | Mouse, wheel, keyboard, camera movement, follow and the glide to an alert |
| `src/js/save.js` | `serializeWorld` / `restoreWorld`, gzip, talking to the Worker, autosave, "New world" |
| `src/js/main.js` | Fixed-step main loop, `init` (load the save or make a world), the `window.thrimp` console/test handle |
| `worker/index.js` | The Cloudflare Worker for `/api/save`: Access token check, KV storage, conflict check |
| `assets/` | Shipped art: `thrimp/*.png` (idle, walk, gather, chop, fight, eat, sit-eat, sit, sleep, wave, stretch, saw, mine, child-walk, child-idle sheets), `objects/*.png`, `favicon.png` |
| `art/` | Raw PixelLab downloads, `pixellab-objects.json` (object name -> id), previews (not shipped) |
| `tools/` | `build-sheet.ps1` (frames -> palette-locked sheet), `fetch-frames.ps1`, `fetch-objects.ps1` |
| `test/` | Playwright tests; `shots.mjs` saves screenshots of a fresh world (needs `npm run dev`) |

## How things work (the easy-to-break parts)

- **Time:** a fixed step of 20 ticks per real second at 1x, each 0.2 game minutes, so a game day is about 6 real
  minutes. Rendering interpolates between the last two positions (`px`, `py`). Real time per frame is capped at
  0.25 s, which is what stops catch-up after the tab was hidden.
- **Terrain** is three smooth fields (water, forest, tint) sampled on a 4 px grid and read bilinearly. Water is
  whatever is above the 90th percentile, so every map is about 10% water. Where colours meet (grass shades, water
  depths, shore) the edge is crisp, roughened by a little noise grain; Rasmus found checkerboard dithering too fuzzy. Solids (buildings, tree trunks) live on an
  8 px walk grid.
- **Movement:** a sparse graph of walkable points (about 56 px apart, kept only if connected to the canteen), A* over
  it, then waypoints are skipped wherever a straight walk is clear. `segmentClear` ignores the start point so a Thrimp
  on an awkward spot can always walk off it. `roundCorners` then swaps each corner for a short quadratic Bezier
  (24 px along each leg, points about 8 px apart, marked `bend: true`) unless any piece of it, or the leg after it,
  would clip something solid. Thrimps walk the curves, so the trails they wear in bend too.
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
- **Trails:** a Float32 wear map on a 4 px grid (data only). Each cell a Thrimp walks into gains 0.05 wear (half on
  its four neighbours); every game hour all wear drops 0.012, so a full path grows back in about 3.5 days. Edge
  costs are `len * (1 - 0.45 * wear)`, refreshed hourly; the A* estimate is scaled by the same 0.45 so it stays
  exact; `smoothRoute` only cuts a corner if the shortcut's trail-discounted cost is no worse, so Thrimps keep to
  paths. Drawing: each overlay pixel reads the wear smoothly between cell centres (never as 4 px squares), slightly
  blurred (so one-off detours don't show as thin cracks), with a slow noise wobble (so straight walks meander) and a
  little edge grain. Past a threshold it is dirt with a thin darker rim, and pale stones where wear is heaviest. The
  noise has its own rng from `world.seed`, so painting never touches the sim's. When a cell's level (of 24) changes,
  the 16 px chunks it can reach are repainted, at most 40 a frame (about 1.5 ms at 12x).
- **Building:** every world starts one hut short, so two homeless Thrimps raise the first new hut together.
  `planBuilding` (hourly) starts sites for couples living apart and homeless singles (paired up), then, if a slot is
  free, the most urgent idea from `planProjects`; at most 3 sites at a time. A site has a `type` (old saves: hut),
  claims its ground at once (`checkPlacement` / `claimGround`), the path network is rebuilt, and the site is abandoned
  if it would cut off any door. A hut takes 12 wood and 6 hours of work, other types their `PROJECTS` numbers; work
  can't outrun delivered wood. Huts show their stage art; anything else rises from the ground (only the bottom part of
  its finished art, with two scaffold poles). `chooseSite` looks near an anchor (`near`) and wider if nothing fits.
- **Projects** (`projects.js`): Thrimps decide what to build. Each `PROJECTS` entry's `want(w)` returns null or an
  idea (urgency, owners, where) from what actually happened: meals eaten standing (`w.standingMeals`) give a table
  (up to 6; tables aren't buildings and don't block walking), soaked days (`w.stats.soaked`) a rain shelter, food
  spoiled by rain or a smashed crate a storehouse, an outbreak or a fever death a healer's hut, three deaths a
  memorial stone by the graves, three children a play area near their homes, a hut over its `room` with a couple and
  their children a family house, and a lonely colony (from day 2, any colony from day 4) a campfire. The owner
  remembers having the idea; a calm notice says so. What they do: tables add seats; the campfire has 10 ring places
  for evenings (18:00-22:30, not in rain; children until 20:00), lit and glowing 17:30-23:30; the shelter (walk-in,
  about 8) keeps the rain off (`underShelter`); without a storehouse, rain spoils 3% an hour of food above 40, and a
  smashed crate spoils food; the healer's hut takes in the sick (`inHealer`): 40% of the toll, and the fever 40%
  shorter; the memorial is a place to relax that shortens grief by a quarter; the play area doubles children's fun;
  a family house takes the parents and the children who lived with them. Homes have a `room` (hut 3, house 7) and
  more than that gives "Home is too crowded". In 30-day test colonies everything got built, roughly in that order.
- **Personal space:** after everyone moves, `separateThrimps` pushes apart any two visible Thrimps closer than 10 px,
  with a sideways shear so they slide round each other instead of stalling face to face. Walkers and idlers give way;
  someone busy on the spot (eating, chopping) stays put. Skipped for a walker within 14 px of its next waypoint, bends aside (so a
  seat or crate inside someone's space can still be reached) and for 2 s when a walker hasn't gained on its waypoint
  for 1 s (wedged between idlers). Seats are 13+ px apart, so seated eaters don't push each other off their seats.
- **Alerts:** the sim calls `raiseAlert(w, text, x, y, who)` for trouble (fight, break, smash, break-up) into
  `w.alerts` (not saved). Each frame `processAlerts` shows the latest as a notice; with "Jump there" on (remembered in
  `localStorage`) it also drops to 1x, glides the camera there (`cam.target`) and selects `who[0]`, at most once per
  20 s. Tests switch it off in `open()`.
- **Things panel:** `thingAt` hit-tests drawn sprite boxes (front-most wins; a Thrimp under the pointer wins over
  everything). `game.thing` is `{ kind, id }`, looked up fresh every UI update, so it follows a site into its hut
  (`fromSite`). Huts remember `builtDay` and `builtBy`. The panel opens beside the clicked world point
  (`game.thingAnchor`) and `placeThingPanel` re-places it every frame, so it travels with the thing when the camera
  moves, flips left near the right edge and stays on screen. It closes by itself once the pointer has been off both
  the thing and the panel for 0.4 s (`game.thingAwaySince`, started by pointer moves in `input.js`, checked each frame
  by `closeThingIfAway`); opening it from code doesn't start that clock. The Thrimp inspector stays docked on the right.
- **Renaming:** click the name in the inspector. Names are trimmed, at most 20 characters and unique (`world.names`
  is rebuilt from the Thrimps on load). The name is saved with the Thrimp, so no save version bump was needed.
- **Weather** is simulation (sim rng, saved as `w.weather`): clear, cloudy, rain or fog, each lasting a few hours,
  changed hourly by `WEATHER[kind].next` weights (fog only settles before dawn). Wind eases toward a target per
  weather. Rain gives "Got soaked" (-3) to anyone outdoors and "Rain on the roof" (+3) to those asleep at home, makes
  lounging by the water or in the grass unlikely, and clear middays sometimes give "Enjoyed the sunshine". Saves from
  before the weather start clear.
- **Ambience** (`ambience.js`) only decorates: it never touches the simulation and uses `Math.random`, not `rand`.
  `updateAmbience(realDt)` runs every frame on real time, capped at 3x and frozen while paused, and eases rain, cloud
  and fog in and out so weather changes fade rather than snap. Critters live near the camera and come and go;
  ground birds fly off when a Thrimp comes within 30 px. Trees sway by shifting their top 60% a pixel in the wind.
  Chimney smoke comes only from art with a chimney (`CHIMNEYS`, measured from the PNG). Fog is the one deliberately
  smooth (non-pixel) layer.
- **Poses and gestures** (looks, set by jobs, not saved): `th.pose` is `'sit'` (eating at a seat, relaxing) or
  `'sleep'` (lying in the grass); sleeping outdoors also lies down. `th.gesture` (`gesture(th, w, 'wave' | 'stretch')`)
  is a few game minutes of body language; a walker stops for it (`followRoute` waits), which is the one way it
  touches the sim. Friends (opinion 25+, liked back) can wave instead of nodding; Thrimps stretch on waking and
  sometimes while looking around. `thrimpSprite` picks, in order: walk, gesture, work action (seated eating uses
  `sit-eat`), still pose, idle breathing. Gestures and seated eating exist facing south/east/north/west only;
  `animFacing` uses the nearest side for diagonals.
- **Crafts** (`crafts.js`, decided with Rasmus 2026-10-26: skills are invented by Thrimps; homes upgrade in place).
  Skills live in heads (`th.knows`); `w.knowledge` remembers who first worked each out. Hourly, a skill nobody alive
  knows can be invented by a fitting adult (likes the work, curious or hard-working) once its `INVENTIONS.when` holds:
  sawing from day 5 with 40+ logs stacked, quarrying from day 10 once a cottage stands; if the workplace still stands,
  reinventing is 3x likelier. Skills spread at chats (12%) and half of a parent's skills pass to a child growing up;
  if every knower dies, the skill is lost. Materials: `w.stock` has wood, planks and stone; a site's `cost` can mix
  them (`delivered`/`deliver`, fetched from lumberyard, sawmill or quarry by `MATERIAL_SOURCE`), and work runs only
  as far as the scarcest delivered material. Sawing: 2 logs from the lumberyard become 3 planks at the sawmill;
  quarrying: 2 stone from the quarry's own outcrop (`w.outcrops`, 3-4 per map, 40-70 stone, finite; worked out it
  shows as small rocks, and a new quarry goes to another outcrop). Both stop at 60 stacked. Upgrades are sites on the
  building itself (`upgradeOf`; no new ground, residents stay): hut to cottage (planks, room 5, "A cosy cottage" +2),
  cottage lived in for 3 days to stone house (stone, room 7, "A sturdy stone house" +4), one at a time and a day
  apart (`w.lastUpgrade`); the canteen extends (`canteen-big` art, room for 10 tables) when 6 tables aren't enough or
  there's no room for another. In 40-day test colonies sawing came around day 4-5, stone around day 10-12, and homes
  upgraded steadily through days 5-30.
- **Life cycle** (`life.js`, decided with Rasmus 2026-10-25: about 40 game days of life; death by age, hunger,
  fever or violence). Each Thrimp has `born` (game time), its own `lifespan` (34-46 days) and a cached `stage`
  (child under 8 days, elder from 30), refreshed hourly; ages show as years (2 a day). Children don't work (they
  play), elders and the sick work less, and children, elders and the badly hurt walk slower (`paceOf`).
  `health` (0-1) drains while starving or feverish and heals while fed; fights hurt (a murderous break hits about
  3.5x); at 0 the Thrimp dies. Deaths are queued (`markDead`) and handled at the end of the tick (`processDeaths`):
  out of `w.thrimps`, into `w.dead`, a grave in the graveyard (picked at the first death), grief thoughts by bond,
  the bereaved add the grave to `mourn` and go stand at it, a killer is blamed by everyone. Fevers start at random
  (more often when soaked, starving, young or old), spread at encounters (5%), last 1-3 days, keep the sick in bed,
  and leave 10 days' immunity.
- **Families:** founders are 12 adults: three young couples sharing huts, housemates, and two homeless. A couple
  (both adults, 50+ both ways, a roof, food enough, under 40 Thrimps) expects about once a day, waits a day and a
  half, then has a child at home; at least 2.5 days between children, at most 5. Children take half of their
  parents' traits and mostly a parent's hair, and start with a share of their parents' strong feelings and grudges.
  Romance stays within a stage (adults with adults), never within a family; single adults court their crush
  (`crushOf`), which ends in a flirt. Empty huts are moved into before anyone builds. Tuned so 50-day colonies mostly
  hold 10-30 Thrimps; some shrink, none died out in testing.
- **Hair** is painted in code (`withHair` in sprites.js): the art's hair highlights are #262b44, its dark hair shares
  #181425 with the outline, so only dark pixels touching a highlight and not on the edge are recoloured. Colours:
  black, brown, ginger, blond, plum, and grey for every elder. Recoloured frames are cached per frame and colour.
- **Broken things** (`table.broken`, `crate.broken`) block seats or spoil food until a `repair` job spends 4 wood.
- **Sprites** are anchored at the feet (`ax`, `ay`). Sheet frames share one baseline per direction (the lowest foot
  in any frame) so feet stay planted. Walk frames advance with distance walked, idle frames with game time.
- **State is plain data** (objects with ids, not class instances) so it can be saved.
- **Saving:** the terrain is rebuilt from `terrainSeed` + `center` (its own rng, separate from the sim's), so a save
  holds only what changes: Thrimps, buildings, sites, trees, bushes, stock, the trail map (delta-coded, 1/255 steps)
  and so on. Not saved: jobs, routes, reservations, the walk grid and the path network (rebuilt on load; Thrimps
  re-decide). Anything new that must survive a reload has to go into `serializeWorld`/`restoreWorld`, and changing
  their shape needs a `SAVE_VERSION` bump. Autosave every 2 minutes and when the tab is hidden, only if game time
  moved; the Worker refuses (409) a save based on an older version than it holds, so two computers can't overwrite
  each other: the stale one stops saving and says so. An unreadable save is left alone (saving off) until "New world".

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
- Action animations: `th.working` names the sheet (`'gather'`, `'chop'`, `'eat'`); a sheet may cover only some
  directions (chop is east/west only). `tools/fetch-frames.ps1` downloads one direction of an animation.
- Character states (same Thrimp, new pose, 8 rotations): Sitting `bb523548-5899-4752-ac62-1cb422357a5c` (its own
  `sit-eat` animation), Sleeping `5b3cb4c4-6d02-4723-8327-e3279fcd14fc`. A state's rotations make a one-frame sheet
  (`sit.png`, `sleep.png`). `eat` is the `drinking` template; `wave`, `stretch` and `sit-eat` are custom (v3)
  animations made for four directions only (about 1 generation each).
- Children: character `98e2bd52-5888-49df-b32f-576932729ffe` (v3, 24 px canvas, so they really are smaller; a state
  of the base Thrimp keeps adult height, so `74e03353-...` "Child" isn't used). Its colours drifted pale, so its
  sheets are built with `-PaletteFrom` the adult's rotations. Children use only `child-walk` and `child-idle`.
- Graves: objects `grave` (fresh) and `grave-old` (from 4 days on).
- Crafts: objects `sawmill`, `quarry`, `cottage`, `stonehouse` (96 px), `outcrop-1`, `outcrop-2` (64), `canteen-big`
  (192x128, keeps the canteen's footprint). Animations `saw` and `mine` are custom (v3), east and west only, built
  without `-PaletteFrom` so the tools keep their colours. Carried planks and stone are drawn in code.
- Buildings Thrimps think up: `house-big` (128 px canvas), `shelter`, `storehouse`, `healer-hut` (96), `playground`
  (64), `memorial` (48), `campfire` (32). Their flames are partly in the art; `drawFlames` adds flicker in the evening.
- Custom (v3) animations come back on bigger canvases that differ per direction (40 px south, 44 px east);
  `build-sheet.ps1` centres every frame in the largest size, and the loader finds the feet per direction.
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
