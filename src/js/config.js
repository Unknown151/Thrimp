// ============================================================
// CONFIG / CONSTANTS
// ============================================================
const CONFIG = {
  WORLD_W: 1600, WORLD_H: 1100,   // art pixels; the camera zooms these up
  TICK_HZ: 20,                    // sim ticks per real second at 1x
  MIN_PER_TICK: 0.2,              // game minutes per tick: one game day ≈ 6 real minutes at 1x
  MAX_STEPS_PER_FRAME: 240,
  SPEEDS: [0, 1, 3, 6, 12],
  ZOOMS: [1, 1.5, 2, 3, 4, 6],
  START_THRIMPS: 12,
  START_HOUR: 6.5,
  START_FOOD: 16,
  CELL: 8,                        // invisible walk grid for solids (data only, never drawn)
  NODE_SPACING: 56,               // path network density
  WALK_SPEED: 7,                  // art px per game minute
  WALK_PX_PER_FRAME: 3.5,         // walk animation advances with distance, so feet keep pace with the ground
  IDLE_MIN_PER_FRAME: 1.5,        // breathing advances with game time, so it pauses and speeds up with the sim
  ACTION_MIN_PER_FRAME: 0.8,      // work animations (chopping, gathering) run a bit faster than breathing
};
const HOUR = 60, DAY = 24 * HOUR;
const MAP_W = CONFIG.WORLD_W, MAP_H = CONFIG.WORLD_H;

// All art is locked to the Endesga 32 palette (lospec.com/palette-list/endesga-32); these are its colours by role.
const P = {
  outline: '#181425', night: '#262b44', white: '#ffffff', skin: '#e8b796',
  grass: ['#193c3e', '#265c42', '#3e8948', '#63c74d'],
  dirt:  ['#3e2731', '#733e39', '#b86f50', '#e4a672'],
  water: ['#124e89', '#0099db', '#2ce8f5', '#ffffff'],
  bark:  ['#3e2731', '#733e39'],
  leaf:  ['#193c3e', '#265c42', '#3e8948', '#63c74d'],
  berry: ['#a22633', '#e43b44'],
  wall:  ['#c28569', '#e4a672', '#ead4aa'],
  roof:  ['#3e2731', '#733e39', '#be4a2f'],
  stone: ['#5a6988', '#8b9bb4', '#c0cbdc'],
  flower: ['#fee761', '#f6757a', '#c0cbdc', '#b55088'],
  light: ['#f77622', '#feae34', '#fee761'],
};

// PixelLab sprite sheets: one row per direction (in this order), one column per frame.
const SHEET_DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
// Keys are what `th.working` is set to while a Thrimp does that action ('gather', 'chop').
const THRIMP_SHEETS = {
  idle: 'assets/thrimp/idle.png', walk: 'assets/thrimp/walk.png',
  gather: 'assets/thrimp/gather.png', chop: 'assets/thrimp/chop.png', fight: 'assets/thrimp/fight.png',
};

// PixelLab object art, one PNG each in assets/objects/. The world is generated after these load, because
// building footprints come from the art. Anything missing falls back to the procedural placeholder.
const OBJECT_ART = [
  'hut-a', 'hut-b', 'hut-c', 'canteen', 'table', 'table-broken', 'crate-full', 'crate-empty', 'crate-broken',
  'log', 'chopping-block',
  'oak-1', 'oak-2', 'oak-small', 'pine-1', 'pine-2', 'stump', 'bush-full', 'bush-bare',
  'rocks', 'flowers', 'reeds', 'basket', 'hut-stage-1', 'hut-stage-2', 'hut-stage-3',
];
const TREE_ART = { oak: ['oak-1', 'oak-2', 'oak-small'], pine: ['pine-1', 'pine-2'] };

// w and h are the footprint (solid ground) when there's no art; with art, w is the drawn width minus a margin.
const BUILDING_TYPES = {
  hut:        { label: 'Hut',        w: 54, h: 30, art: ['hut-a', 'hut-b', 'hut-c'] },
  canteen:    { label: 'Canteen',    w: 100, h: 38, art: ['canteen'] },
  lumberyard: { label: 'Lumberyard', w: 52, h: 14 },
};

// Screen directions in atan2 order (east = 0, clockwise because y points down).
const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
