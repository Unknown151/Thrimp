# Thrimp TODO

The build order comes from section 12 of [thrimp-design.md](thrimp-design.md).

## Setup (from github-setup.md)

- [x] 1. GitHub repo, pushed with git
- [x] 2. Files: `.gitignore`, `package.json` + lockfile, `build.mjs` with safety checks, `test/`, `CLAUDE.md`
- [ ] 3. Claude: install the Claude GitHub App on the repo, make a cloud environment with a setup script, start a session
- [x] 4. Cloudflare: Workers Builds from GitHub, `thrimp.rsvn.dk`, Access login (2026-10-22)
  - [x] KV namespace for saves and an `/api` Worker with an Access token check (cloud saves, 2026-10-23)
  - [ ] Later: Anthropic key secret (Claude's voice, build step 9)
- [ ] 5. Optional: protect `main` behind the Workers Builds check; a GitHub Action that runs the tests on PRs

## Build order

- [x] 1. **Sandbox:** canvas, one place, Thrimps wandering with needs and a canteen / home / work loop
- [x] 2. **Inner life:** traits, moodlets, mental breaks (binge, wander off, sulk, smash), inspirations (work frenzy),
  repairs with wood, inspector mood breakdown. Social traits (spiteful, violent, cunning) only bite from step 3
- [x] 3. **Social:** spatial hash, encounters (nod, chat, compliment, insult, flirt, kiss, fight), opinions with
  chemistry, grudges, memories, witnesses, gossip, couples and break-ups, social need, lashing-out breaks, fight
  animation, relationships and memories in the inspector. Open: gossip distortion (design doc question)
- [x] 4. **Trails:** wear map with desire paths that grow back, trail-preferring routes, seeded trails in new worlds;
  Thrimps choose building sites (work, friends, rivals, water) and raise huts in three visible stages from wood.
  Later: other building types (storage, workshops) once there's a use for them
- [x] Polish 1: click huts, sites, bushes and trees for an info panel; trouble (fights, breaks, smashing,
  break-ups) shows a notice and, if "Jump there" is on, slows to 1x and pans over; trait tooltips; nameplates on
  everyone coloured by mood; personal space (Thrimps step round each other); renaming Thrimps
- [x] Polish 2: smooth curving trails, crisp ground edges, things panel beside the click that closes on its own
- [x] Feel 1: weather (clear, cloudy, rain, fog) that touches moods and plans; living world (butterflies, ground
  birds that scatter, flocks overhead, fireflies, fish rings, rain, fog, cloud shadows, chimney smoke, wind in the
  trees, warm dusk light); expressive Thrimps (eating, sitting at the table, lying in the grass, curling up to sleep
  outdoors, waving to friends, stretching on waking, looking around, new emotes). Later: sound, seasons, more
  critters, Thrimp variants
- [ ] 5. **Narrator + chronicle:** tension director, first ~10 events, chronicle UI
- [ ] 6. **Life cycle:** births, aging, death, marriages, family, inheritance of grudges
- [ ] 7. **Resources & pressure:** depletion, invention, relocation and splitting
- [ ] 8. **God powers:** influence, good / bad / neutral powers, the colony's opinion of the player
- [ ] 9. **Claude voice:** diaries, prayers, chronicle chapters, myths
- [ ] 10. **Art pass:** mostly done: Thrimp (idle, walk, gather, chop), 3 huts, canteen, table, crates, woodpile,
  chopping block, 5 trees, stump, bushes full/bare, rocks, flowers, reeds, basket. Still procedural: the ground,
  emote bubbles, the carried log. Eating, sitting, sleeping, waving and stretching are done (Feel 1). Later: dying
  animation, Thrimp variants (aging, sickness)
- [ ] 11. **Content:** grow events toward 40, then 100

## Known issues

- A Thrimp wedged in a crowd squeezes through for 2 seconds rather than freezing, so brief overlaps still happen.
- Food and wood pile up without limit (scarcity is step 7). Wood goes to repairs and huts, but chopping still
  outpaces it. Breakdowns are rare without hardship: they need feuds, events or scarcity.
- The design doc still says `thrimp.html` (now built as `public/index.html`), and its PixelLab MCP snippet uses
  `"transport"` where Claude Code expects `"type"`.
