// ============================================================
// NAMES
// ============================================================
const NAME_ON = ['P', 'B', 'M', 'V', 'T', 'D', 'N', 'K', 'G', 'R', 'S', 'L', 'F', 'H', 'W', 'Z', 'Br', 'Gr', 'Sk', 'Th', 'Sn', 'Pl', 'Tr', 'Fl', 'Gl', 'Dr', 'Wr'];
const NAME_VO = ['a', 'e', 'i', 'o', 'u', 'ee', 'oo', 'ai', 'y', 'ou'];
const NAME_CO = ['b', 't', 'x', 'k', 'tt', 'll', 'p', 'm', 'n', 'g', 'sh', 'ck', 'ss', 'rr', 'd', 'b'];
const NAME_END = ['a', 'o', 'in', 'et', 'y', 'ie', 'um', 'el'];
function makeName(taken) {
  for (let i = 0; i < 100; i++) {
    let n = pick(NAME_ON) + pick(NAME_VO) + pick(NAME_CO);
    if (chance(0.3)) n += pick(NAME_END);
    if (!taken.has(n)) { taken.add(n); return n; }
  }
  return 'Thrimp ' + taken.size;
}
const PLACE_ADJ = ['Ash', 'Drowned', 'Grey', 'Low', 'Bitter', 'Mossy', 'Crooked', 'Still', 'Rotten', 'Quiet', 'Sunken', 'Old'];
const PLACE_NOUN = ['Hollow', 'Ridge', 'Wood', 'Fen', 'Dell', 'Mire', 'Reach', 'Brook', 'Knoll', 'Bottom', 'Meadow'];
function makePlaceName() {
  const n = pick(PLACE_NOUN), a = pick(PLACE_ADJ);
  return pick([`The ${n}`, `${a} ${n}`, `The ${a} ${n}`]);
}
