# Thrimp TODO

The build order comes from section 12 of [thrimp-design.md](thrimp-design.md).

## Setup (from github-setup.md)

- [x] 1. GitHub repo, pushed with git
- [x] 2. Files: `.gitignore`, `package.json` + lockfile, `build.mjs` with safety checks, `test/`, `CLAUDE.md`
- [ ] 3. Claude: install the Claude GitHub App on the repo, make a cloud environment with a setup script, start a session
- [ ] 4. Cloudflare: Workers Builds from GitHub, custom domain, Access login, (KV and secrets when needed)
- [ ] 5. Optional: protect `main` behind the Workers Builds check; a GitHub Action that runs the tests on PRs

## Build order

- [x] 1. **Sandbox:** canvas, one place, Thrimps wandering with needs and a canteen / home / work loop
- [ ] 2. **Inner life:** traits, moodlets, inspector mood breakdown
- [ ] 3. **Social:** spatial hash, encounters, opinions, emote icons
- [ ] 4. **Trails:** trail map, desire paths, self-chosen building sites
- [ ] 5. **Narrator + chronicle:** tension director, first ~10 events, chronicle UI
- [ ] 6. **Life cycle:** births, aging, death, marriages, family, inheritance of grudges
- [ ] 7. **Resources & pressure:** depletion, invention, relocation and splitting
- [ ] 8. **God powers:** influence, good / bad / neutral powers, the colony's opinion of the player
- [ ] 9. **Claude voice:** diaries, prayers, chronicle chapters, myths
- [ ] 10. **Art pass:** started (base Thrimp, walk, breathing idle). Still procedural: buildings, trees, bushes, emotes
- [ ] 11. **Content:** grow events toward 40, then 100

## Known issues

- Thrimps can stand on exactly the same spot (they don't notice each other until step 3).
- Food and wood pile up without limit (scarcity is step 7; nothing uses wood until step 4).
- The design doc still says `thrimp.html` (now built as `public/index.html`), and its PixelLab MCP snippet uses
  `"transport"` where Claude Code expects `"type"`.
