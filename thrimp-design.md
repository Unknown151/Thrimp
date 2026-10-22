# Thrimp — Design Document

> A standalone, browser-based colony sim about small colonists ("Thrimps") living, loving, feuding and dying on their own, with a storyteller that throws events at them and a god (the player) who can step in, but doesn't have to.
>
> Inspired by the *concept* of Black Mirror's "Plaything" / Thronglets (a colony that grows a mind of its own and becomes aware of you) and by RimWorld's pawns and storyteller. **Not** a remake of either, and no Netflix IP (names, designs, art) is used.

Status: **design phase, nothing built yet.** Lines marked **[Decided]** are settled by Rasmus. Lines marked **[Proposed]** are suggestions still open to change. Open questions are listed at the bottom.

---

## 1. Pillars

1. **Alive without you.** [Decided] The colony runs fully on its own. Player input is optional, never required.
2. **Every Thrimp has a life.** [Decided] Each Thrimp has its own needs, wants, relationships, memories and agenda, RimWorld-style.
3. **Grimy, but not only grim.** [Decided] Death, sickness, betrayal and loss are real and permanent, but so are marriages, births, festivals and friendships. Joy and grief are tied together. (Seedfall ended up too "happy and sunshine"; Thrimp should not.)
4. **Stories you can read back.** [Decided] Everything the storyteller does and how it turned out is visible in a chronicle.
5. **Never the same twice.** [Decided] Every run is fully random. No seed sharing or replays.

---

## 2. Tech constraints

- **[Decided]** Standalone project, separate from Seedfall, but built the same way: a single HTML file, vanilla JS and `<canvas>`. **No game engine.**
- **[Decided]** **No offline catch-up.** Unlike Seedfall's "perpetual" mode (which simulates up to 8 hours on return), the Thrimp world only lives while the page is open.
- **[Decided]** **No tile grid on screen.** Seedfall's grid look was clunky. The world should look organic. (Invisible grids used purely for data, such as spatial hashing or the trail map, are fine.)
- **[Proposed]** Hosting like Seedfall: Cloudflare Workers behind Cloudflare Access.
- **[Proposed]** Carry over Seedfall's API key rule: the Anthropic API key stays in the browser only and is never written to save files, the chronicle or logs.
- **[Proposed]** Save game state in `localStorage` (or IndexedDB if it grows) so a run survives a page reload.
- Target scale: a few hundred Thrimps on a modest map. That's the sweet spot for rich individual simulation in plain JS.

---

## 3. The world

### Map structure
- **[Proposed]** A hybrid: a handful of **named places** (e.g. "The Hollow", "Ash Ridge", "The Drowned Wood") connected by paths, with **free movement inside each place**. Places accumulate their own history and myths, and relocating/splitting becomes "a group moves to another place".
- Alternative considered: one open space with free-floating resource points. Simpler, but places give stronger stories.

### Self-building settlement
- **[Decided]** Thrimps build **entirely on their own**. The player never places buildings.
- **[Decided]** Paths form organically over time, **slime-mold style** (stigmergy):
  - The ground has an invisible **trail value** everywhere (fine-grained data grid, never drawn as tiles).
  - Walking over ground reinforces it. Thrimps prefer worn ground (cheaper to walk on), creating a feedback loop.
  - Trails **decay** when unused. Abandoned routes and old settlements slowly grow over, leaving visible traces of history.
  - Rendered as grass gradually wearing into dirt paths.
- **[Proposed]** Thrimps choose building sites by what they care about: near water, near work, near family, away from rivals, on high ground after a flood, etc.
- **[Proposed]** For routing, buildings and important spots form a **path network** (graph). A* on a graph of a few dozen to a few hundred nodes is trivially cheap. Thrimps compute a route once when picking a job, then follow it. Edge costs drop as trails wear in.

### Resources
- **[Proposed]** Three kinds:
  - **Renewable:** berries, fish, game. Regrow slowly; overharvesting kills them for a long time.
  - **Finite:** stone, metal, old-growth wood. Gone when gone.
  - **Hidden:** unknown until someone invents a use (cave mushrooms, clay, deep water).
- **[Proposed]** Scarcity creeps in gradually and drives two responses:
  - **Invention under pressure:** a curious, desperate Thrimp has a chance to discover fishing traps, farming, mining… ("Old Mott invented farming during the Grey Rot").
  - **Relocation as the Thrimps' own decision:** when things get bad, factions form (stay and pray vs. leave). The colony may move together or split, and splinter groups can vanish, die out, or return years later as strangers.

---

## 4. Thrimps (the agents)

**[Decided]** Small humanoid colonists going about their lives. (The name isn't a shrimp pun.)

### Inner life (RimWorld-inspired)
- **Needs:** hunger, rest, social, safety, fun… drain over time.
- **Traits:** greedy, curious, shy, spiteful, hotheaded, lazy, hard-working, violent, cunning… weight every decision.
- **Skills & passions:** improve with use; some work is done gladly, some reluctantly.
- **Relationships:** opinion of every known Thrimp (−100 hate … +100 love) → friends, rivals, partners, family, grudges.
- **Memories:** significant events stored per Thrimp ("you starved my sibling"), feeding later decisions and dialogue.
- **Goals:** multi-step agendas ("build a nest near Pib so I can court her").

### Moodlets (core of the "alive" feeling)
Mood is a stack of timed thoughts, not one number:

```js
thrimp.thoughts.push({ id: 'sibling_died', mood: -20, until: now + 5*DAY, about: sibId });
thrimp.mood = thrimp.thoughts
  .filter(t => t.until > now)
  .reduce((sum, t) => sum + t.mood, thrimp.baseMood);
```

- **Mental breaks:** low mood for too long → binge eating, wandering off, smashing things, at worst murder. This is where much of the grimy side emerges on its own.
- **Inspirations:** great mood → creative bursts, courting, inventions.

### Decision making
- **Utility AI:** each tick, a Thrimp scores possible actions against needs, traits, skills and colony needs, and picks one. Cheap enough for hundreds of agents.
- **Self-chosen jobs:** no player work-priority screen. The lazy one shirks, the hard worker works himself to death.

### Purposeful movement & daily rhythm
- **[Decided]** Thrimps walk with purpose: home → lumberyard/workplace → canteen → home, etc.
- **[Proposed]** Day/night cycle with loose schedules shaped by traits (early riser vs. lazy).
- **[Proposed]** Interruptions create small stories: hungry mid-shift → detour; stop to chat with a friend; take the long way around to avoid a rival.

### Inspector
- **[Decided]** Every Thrimp is clickable. The inspector shows mood breakdown (all active moodlets and why), needs, traits, skills, relationships, current job/goal, and **life story** (born, survived the Grey Rot, lost a sibling, holds a grudge against Vex…).

---

## 5. Awareness & social encounters

**Noticing:** every Thrimp has a sight radius. An invisible **spatial hash** (data only) means each Thrimp only checks neighbours in its own and adjacent buckets, which scales to hundreds of agents.

**Reacting:** on encounter, look up the relationship and pick a weighted interaction:

```js
function onEncounter(a, b) {
  if (a.cooldowns.social > now) return;
  const op = a.opinionOf(b);           // -100 hate ... +100 love
  const options = SOCIAL.filter(s => s.when(a, b, op));
  const act = weightedPick(options, s => s.weight(a, b, op));
  if (!act) return;

  act.do(a, b);                        // the insult, kiss, nod...
  b.respond(act, a);                   // b reacts with its own traits
  a.cooldowns.social = now + 30;
}

const SOCIAL = [
  { id: 'insult', when: (a,b,op) => op < -30,
    weight: (a) => a.traits.hotheaded ? 3 : 1, interrupts: false },
  { id: 'kiss', when: (a,b,op) => a.partner === b.id,
    weight: (a) => a.mood > 0 ? 3 : 0.5, interrupts: true },
  { id: 'fight', when: (a,b,op) => op < -70 && a.mood < -20,
    weight: (a) => a.traits.violent ? 2 : 0.2, interrupts: true },
];
```

- **In passing vs. stopping:** insults and nods happen mid-walk; kisses and fights make both stop. The colony looks busy, not choreographed.
- **The other party reacts on its own terms** (yell back, slink away, cry), and everything feeds moodlets and opinions.
- **Witnesses:** nearby Thrimps who see something get a memory of it. Gossip spreads.
- **Places and objects count too:** passing a sibling's grave, gloating at a rival's burned house.
- Visual feedback: small icons above heads ("!" for a mental break, a heart for flirting, a tear for grief).

---

## 6. The storyteller (narrator)

**[Decided]** A RimWorld-style narrator throws scripted and random events at the colony.
**[Decided]** What it did, and the outcome, must be visible to the player (see Chronicle).

### Pacing, not randomness
The narrator is a **tension director**: tension builds during calm, events "spend" it.

```js
const narrator = {
  tension: 0,
  cooldowns: {},
  tick(world, dt) {
    this.tension += dt * this.style.buildRate * (1 + world.prosperity);
    if (this.tension < this.style.threshold) return;

    const eligible = EVENTS.filter(e =>
      e.canFire(world) &&
      !(this.cooldowns[e.id] > world.time) &&
      e.severity <= this.tension
    );
    const ev = weightedPick(eligible, e => e.weight(world, this.style));
    if (!ev) return;

    ev.fire(world);
    this.cooldowns[ev.id] = world.time + ev.cooldown;
    this.tension -= ev.severity;
  }
};
```

- **[Proposed]** Multiple narrator styles via a `style` object (`buildRate`, `threshold`, `cruelty`…): a wave-builder, a long-breather, a pure dice-roller.

### Events
- **Hardcoded, data-driven templates.** Variety comes from combinations (who's involved × traits × history × colony state × narrator), not raw count:

```js
{ id: 'feud',
  pick: w => pairWith(w, (a, b) => a.grudges[b.id] > 3),
  outcomes: [
    { if: (a, b) => a.traits.violent, do: 'murder' },
    { if: (a, b) => a.traits.cunning, do: 'frame_for_theft' },
    { else: 'exile_vote' }
  ] }
```

- Targets: **25–40 templates** for a varied first version, **60–100 with branches** for "weeks of play". Each is roughly 20–50 lines, so this fits in a single file.
- **Events leave scars:** a blight doesn't just remove food; a Thrimp remembers starving, hoards from then on, resents whoever ate last.
- **Chains, not one-offs:** a stranger arrives → taken in → turns out to be a thief → exiled → returns hours later with friends.
- **Generational drift:** Thrimps age and die; grudges, beliefs and myths pass (and distort) through their children, so the colony develops a culture.

### Per-run randomness
Map layout, starting Thrimps (names, traits), starting conditions (fertile valley vs. barren rock) and narrator style are all randomised each run.

---

## 7. The chronicle

**[Decided]** A readable record of what happened and how it turned out.

Each entry is a **living story arc**, not a notification:
- **What happened:** "A stranger named Vex arrived at the eastern edge"
- **Why** (optional peek behind the curtain): "The colony had been calm for a long time"
- **Who it touched:** links to the Thrimps involved (click → inspector)
- **Outcomes, appended over time:** "Pib took Vex in." → "Vex stole from the food store and was exiled." → "Vex returned with three others."

**[Proposed]** At the end of an era or generation, Claude writes a short chapter summary from the real data.

---

## 8. The player (god)

- **[Decided]** The player can do both good and bad things, but the colony is fully functional with zero input.
- **[Proposed]** Example powers:
  - **Good:** bless a harvest, heal one sick Thrimp, send rain, whisper an idea (nudges an invention)
  - **Bad:** smite one Thrimp, send a plague, spoil the food, plant a lie in someone's ear
  - **Neutral/weird:** show yourself, mark a Thrimp as "chosen", stay silent when they pray
- **[Proposed]** Powers cost **influence**, a slowly recharging meter, so miracles can't be spammed.
- **[Decided, in spirit]** Thrimps **notice their god** and form opinions: healing a sick child might start a religion; smiting the wrong Thrimp might turn the colony against you. This is the Thronglets-style creepiness.

---

## 9. Claude (LLM) integration

**Rule: the simulation decides, Claude narrates.**

- **Never** an LLM call in each Thrimp's head every tick. Too slow, too expensive, breaks consistency.
- Claude is handed the **actual state and history** of a Thrimp or event and writes:
  - diary entries and lines of dialogue
  - prayers to the player, and the colony "talking to you" through a small command window
  - chronicle chapter summaries
  - myths about past disasters ("The elders still speak of the Grey Rot. Pib swears the stranger brought it.")
  - flavour names (plagues, places, eras)
- Mechanics and pacing stay **hand-written code** so they remain balanced and predictable.
- API key: browser-only (see Tech constraints).

---

## 10. Art

- **[Decided]** Pixel art. Small humanoid colonists. Assets will be **generated or found**, not hand-drawn.
- **[Proposed]** Generate with **PixelLab** via its MCP server in Claude Code.
  - Its character tools are built for humanoids, which fits Thrimps.
  - Useful built-in animation templates: `walk`/`walking-*`, `breathing-idle`, `sad-walk`, `scary-walk`, `falling-back-death`, `drinking`, `picking-up`, `pull-heavy-object`.
  - `create_character_state` makes variants of the same character (old and hunched, sick, in rags, wearing a crown) for aging and life changes.
  - `chibi` proportions for a small, cute, slightly pitiful look that makes dark moments hit harder.
  - Lock all generation to **one fixed palette** for consistency.
  - Jobs are async (2–5 min): generate assets up front, **never live in-game**.
- **[Proposed]** Style guide to decide before generating: sprite size, palette, view angle, list of animations.
- **Variation in code, not in art:** palette swaps for families/bloodlines, layered extras (scar, hat, "chosen" mark), slight size differences. One base sprite → hundreds of unique-looking Thrimps.
- Sprite sheets: same frame size throughout, one animation per row, transparent PNG. Either embedded as base64 in the single HTML file, or served alongside it.
- If using found asset packs: check the license.

### PixelLab MCP setup (Claude Code)
Docs: https://api.pixellab.ai/mcp/docs. Token from https://api.pixellab.ai/mcp.

```json
{
  "mcpServers": {
    "pixellab": {
      "url": "https://api.pixellab.ai/mcp",
      "transport": "http",
      "headers": { "Authorization": "Bearer YOUR_API_TOKEN" }
    }
  }
}
```

**Never commit the real token to the repo.**

---

## 11. Suggested architecture (single file)

```
thrimp.html
├─ config / constants
├─ rng + helpers (weightedPick, spatial hash, A*)
├─ world      places, path graph, trail map, resources, buildings
├─ thrimp     needs, traits, skills, thoughts/mood, memories, relationships, goals
├─ ai         utility scoring, job selection, schedules, mental breaks/inspirations
├─ social     perception, encounters, witnesses, gossip
├─ narrator   tension director, styles, EVENTS (data), event chains
├─ chronicle  entries, outcomes, life stories
├─ god        powers, influence meter, colony's opinion of the player
├─ claude     prompt builders, browser-only key, narration queue
├─ render     canvas, sprites, trails, emote icons, inspector + chronicle UI
└─ save/load  localStorage
```

Main loop: fixed-step simulation tick, decoupled from rendering (`requestAnimationFrame`), with a speed control.

---

## 12. Suggested build order

1. **Sandbox:** canvas, one place, a handful of Thrimps wandering with needs and a canteen/home/work loop.
2. **Inner life:** traits, moodlets, inspector panel.
3. **Social:** spatial hash, encounters, opinions, emote icons.
4. **Trails:** trail map, desire paths, self-chosen building sites.
5. **Narrator + chronicle:** tension director, first ~10 events, chronicle UI.
6. **Life cycle:** births, aging, death, marriages, family, inheritance of grudges.
7. **Resources & pressure:** depletion, invention, relocation/splitting.
8. **God powers:** influence, good/bad/neutral powers, colony opinion of the player.
9. **Claude voice:** diaries, prayers, chronicle chapters, myths.
10. **Art pass:** PixelLab assets, palette swaps, layered variation.
11. **Content:** grow events toward 40 → 100.

---

## 13. Open questions

- Can the colony **split into multiple settlements** that coexist (enabling trade and war), or does it always move as one group?
- Should **gossip distort** as it spreads ("he pushed him" → "he tried to kill him")?
- Final call on the **map structure**: named places + free movement (proposed) vs. one open space.
- Should the **narrator be a visible character**, or stay an invisible hand whose work shows in the chronicle?
- Exact **sprite size, palette and view angle** for the style guide.
- Which **narrator styles** to ship, and can the player choose one at the start of a run?
