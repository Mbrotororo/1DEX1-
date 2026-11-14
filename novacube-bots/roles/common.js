// Things every role does: work phases, who works which floor, food, tools, digging dirt,
// trips up the farm to build or to plant and harvest.
const { Vec3 } = require('vec3');
const S = require('../lib/site');
const F = require('../lib/floors');
const { craftItem, ensurePlanks, ensureSticks, woodCount, LOG_RE } = require('../lib/craft');
const { sleep } = require('../lib/util');

const PLANT_RU = { bamboo: 'бамбук', sweet_berries: 'ягоды' };
const LOGS = /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_log$/;

function site(w) { return w.team.state.site; }
function depot(w) { return S.depotSpots(site(w), w.cfg); }
function storage(w) { return S.storageSpots(site(w)); }
function names(w, role) { return w.cfg.bots.filter((b) => b.role === role).map((b) => b.name); }

// ------------------------------------------------------------------ phases and assignments
/** Phase 2: both farms are built and the storage has enough chests -> all ten bots plant and harvest. */
function phase2(w) {
  const s = site(w);
  if (!s || !S.allBuilt(w.team, s)) return false;
  const want = Math.min(((w.cfg.storage || {}).doubleChestsBeforeEveryoneFarms ?? 12), S.storageSpots(s).length / 2);
  return (w.team.state.storagePairs || 0) >= want;
}

/** Phase 2 team: which farm and which column this bot uses. */
function myTeam(w) {
  const s = site(w);
  const teams = w.cfg.teams || {};
  for (const f of s.farms) {
    const list = teams[f.plant] || [];
    const i = list.indexOf(w.name);
    if (i >= 0) return { farm: f, idx: i, size: list.length };
  }
  const all = w.cfg.bots.map((b) => b.name);
  const per = Math.ceil(all.length / s.farms.length);
  const i = Math.max(0, all.indexOf(w.name));
  const fi = Math.min(s.farms.length - 1, Math.floor(i / per));
  return { farm: s.farms[fi], idx: i - fi * per, size: Math.min(per, all.length - fi * per) };
}

/** Phase 1: builders and planters have their own columns. */
function climberIndex(w) {
  const list = w.cfg.bots.filter((b) => b.role === 'builder' || b.role === 'planter').map((b) => b.name);
  return Math.max(0, list.indexOf(w.name)) % S.maxShafts(site(w));
}

function builderFloors(w, name = w.name) {
  const bs = names(w, 'builder');
  const i = bs.indexOf(name);
  if (i < 0) return [];
  return S.allFloors(site(w)).filter((f, j) => j % bs.length === i);
}
function builderDone(w, name) { return builderFloors(w, name).every((f) => S.isBuilt(w.team, f.farm, f.k)); }

/** Phase 1: built floors are shared between the planters (and builders who have finished). */
function tendFloors(w) {
  const pool = w.cfg.bots.filter((b) => b.role === 'planter' || (b.role === 'builder' && builderDone(w, b.name))).map((b) => b.name);
  const i = pool.indexOf(w.name);
  if (i < 0) return [];
  const built = S.allFloors(site(w)).filter((f) => S.isBuilt(w.team, f.farm, f.k));
  return built.filter((f, j) => j % pool.length === i);
}

// ------------------------------------------------------------------ small helpers
async function ensureFood(w) {
  if (w.bot.food >= 14) return;
  const foods = ['bread', 'apple', 'carrot', 'baked_potato', 'cooked_beef', 'cooked_porkchop', 'sweet_berries'];
  if (!w.bot.inventory.items().some((i) => foods.includes(i.name)) && site(w)) {
    await S.takeRow(w, storage(w), [{ test: 'sweet_berries', count: 32 }]);
  }
  await w.maybeEat();
}

/** A crafting table that always stands west of the depot. */
async function workbench(w) {
  const s = site(w);
  const spot = S.onGround(w.bot, s, S.workbenchSpot(s));
  let b = w.bot.blockAt(spot);
  if (b && b.name === 'crafting_table') {
    if (w.bot.entity.position.distanceTo(spot) > 3.5) await w.goto(spot, 2, 30000);
    return w.bot.blockAt(spot);
  }
  if (!w.item('crafting_table')) {
    if (!(await ensurePlanks(w, 4)) || !(await craftItem(w, 'crafting_table', 1))) return null;
  }
  await w.gotoBlock(spot.offset(1, 0, 0), 30000);
  await w.placeAt(spot, 'crafting_table', spot.offset(0, -1, 0));
  b = w.bot.blockAt(spot);
  return b && b.name === 'crafting_table' ? b : null;
}

/** The depot chests: whoever stands at the farms with enough wood puts the missing ones. */
async function ensureDepot(w, maxNow = 4) {
  const missing = S.missingChests(w, depot(w)).slice(0, maxNow);
  if (!missing.length) return;
  const need = missing.length - w.count('chest');
  if (need > 0) {
    const can = Math.min(need, Math.floor((woodCount(w) - 4) / 8));
    if (can <= 0) return;
    w.setStatus('ставлю сундуки склада');
    if (!(await ensurePlanks(w, can * 8 + 4))) return;
    const table = await workbench(w);
    if (!table) return;
    for (let i = 0; i < can; i++) if (!(await craftItem(w, 'chest', 1, table))) break;
  }
  for (const p of missing) {
    if (!w.item('chest')) break;
    w.setStatus('ставлю сундуки склада');
    await w.gotoBlock(new Vec3(p.x + 2, p.y, p.z), 30000);
    await w.placeAt(p, 'chest', p.offset(0, -1, 0));
  }
}

/** Makes a tool: stone if we carry cobblestone, otherwise wood. kind: sword | shovel | axe | pickaxe */
async function craftTool(w, kind) {
  const cost = { sword: [2, 1], shovel: [1, 2], axe: [3, 2], pickaxe: [3, 2] }[kind];
  const stone = w.count('cobblestone') >= cost[0];
  if (!(await ensureSticks(w, cost[1]))) return false;
  if (!stone && !(await ensurePlanks(w, cost[0]))) return false;
  const table = await workbench(w);
  if (!table) return false;
  return craftItem(w, `${stone ? 'stone' : 'wooden'}_${kind}`, 1, table);
}

/** Takes a tool from the depot if we have none. */
async function ensureTool(w, re, count = 1) {
  if (w.bot.inventory.items().some((i) => re.test(i.name))) return true;
  await S.takeRow(w, depot(w), [{ test: re, count }]);
  return w.bot.inventory.items().some((i) => re.test(i.name));
}

/** Bamboo breaks instantly with a sword. From the depot, or made from the depot's stone and wood. */
async function ensureSword(w) {
  if (await ensureTool(w, /_sword$/, 2)) return true;
  if (S.stock(w, depot(w), 'cobblestone') >= 2) {
    await S.takeRow(w, depot(w), [{ test: 'cobblestone', count: 2 }, { test: LOGS, count: 1 }]);
    if (await craftTool(w, 'sword')) return true;
  }
  return false; // by hand then: slower, but works
}

/** Digs dirt next to the farms (never on our own place). */
async function digDirt(w, target) {
  const bot = w.bot;
  const s = site(w);
  w.careful(false);
  let fails = 0;
  const startPos = bot.entity.position.clone();
  while (w.count('dirt') < target && fails < 10 && w.freeSlots() > 2) {
    w.setStatus(`копаю землю (${w.count('dirt')}/${target})`);
    const found = w.find(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt'], 32, 60, (b) => {
      if (!b) return false;
      const p = b.position;
      if (s) {
        if (S.inZone(s, p, 1)) return false;
        if (Math.abs(p.y - s.y) > 5 || p.distanceTo(S.center(s)) > 120) return false;
      } else if (Math.abs(p.y - startPos.y) > 5) return false;
      const above = bot.blockAt(p.offset(0, 1, 0));
      return above && above.boundingBox !== 'block' && !/water|lava/.test(above.name);
    });
    if (!found.length) { fails += 3; await sleep(1000); continue; }
    const me = bot.entity.position;
    found.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
    let got = false;
    for (const p of found.slice(0, 10)) {
      if (p.distanceTo(bot.entity.position) > 4.3 && !(await w.goto(p, 3, 20000))) continue;
      if (await w.dig(p)) got = true;
    }
    await w.collectDrops(5, 6);
    if (!got) fails++;
  }
}

/** Dirt for the depot: dig until the bag is full, then put it in. */
async function digForDepot(w) {
  await ensureTool(w, /_shovel$/);
  await digDirt(w, 64 * 26);
  w.setStatus('несу землю на склад');
  await S.depositRow(w, depot(w), ['dirt', 'cobblestone']);
}

function countStored(w, stored) {
  w.team.state.stored = w.team.state.stored || {};
  for (const [n, c] of Object.entries(stored)) w.team.state.stored[n] = (w.team.state.stored[n] || 0) + c;
  w.team.save();
}

/** Harvest into the storage, keeping seeds of the plants we look after. */
async function storeHarvest(w, plantsKept = []) {
  const keepN = (w.cfg.farm && w.cfg.farm.keepSeeds) || 640;
  const keep = {};
  for (const p of plantsKept) keep[p] = keepN;
  const plants = ['bamboo', 'sweet_berries'];
  if (!plants.some((p) => w.count(p) > (keep[p] || 0))) return;
  w.setStatus('кладу урожай в хранилище');
  const stored = await S.depositRow(w, storage(w), plants, keep);
  countStored(w, stored);
  const total = Object.values(stored).reduce((a, b) => a + b, 0);
  if (total) w.say(`положил в хранилище: ${Object.entries(stored).map(([n, c]) => `${PLANT_RU[n] || n} ${c}`).join(', ')}`);
}

/** Enough blocks to climb to the highest of these floors (the column is dug back down later). */
async function ensureColumnBlocks(w, farm, floors) {
  const top = Math.max(...floors.map((k) => S.floorY(farm, k))) - site(w).y + 6;
  if (F.blocksCarried(w) >= top) return true;
  await S.takeRow(w, depot(w), [{ test: 'dirt', count: top + 32 - F.blocksCarried(w) }]);
  if (F.blocksCarried(w) < top) await digDirt(w, top + 16);
  return F.blocksCarried(w) >= top;
}

// ------------------------------------------------------------------ trips
async function tendTrip(w, farm, floors, idx) {
  const s = site(w);
  w.atBase = true;
  const keepN = (w.cfg.farm && w.cfg.farm.keepSeeds) || 640;
  await storeHarvest(w, [farm.plant]);
  if (w.count(farm.plant) < Math.min(256, keepN)) {
    await S.takeRow(w, storage(w), [{ test: farm.plant, count: keepN - w.count(farm.plant) }]);
  }
  if (farm.plant === 'bamboo') await ensureSword(w);
  if (floors.some((k) => S.needsTorches(farm, k)) && w.count('torch') < 16) await S.takeRow(w, depot(w), [{ test: 'torch', count: 64 }]);
  if (!(await ensureColumnBlocks(w, farm, floors))) { w.setStatus('нет земли, чтобы подняться'); return; }
  const res = await F.trip(w, farm, floors, idx, 'tend');
  if (res.harvested || res.planted) {
    w.team.state.harvested = (w.team.state.harvested || 0) + res.harvested;
    w.team.save();
    w.say(`${PLANT_RU[farm.plant]}: собрал ${res.harvested}, посадил ${res.planted} (этажи ${floors.map((k) => k + 1).join(', ')})`);
  }
  w.atBase = true;
  await w.collectDrops(4, 4);
  await storeHarvest(w, [farm.plant]);
}

async function buildTrip(w, farm, floors, idx) {
  const s = site(w);
  w.atBase = true;
  // materials from the depot: a full bag of blocks and some torches
  if (F.blocksCarried(w) < 64 * 20) {
    await S.takeRow(w, depot(w), [{ test: 'dirt', count: 64 * 30 }, { test: 'cobblestone', count: 64 * 6 }], 5);
  }
  if (floors.some((k) => S.needsTorches(farm, k)) && w.count('torch') < 32) await S.takeRow(w, depot(w), [{ test: 'torch', count: 128 }]);
  if (F.blocksCarried(w) < 300) await digDirt(w, 640);   // nothing on the depot yet: dig some ourselves
  if (F.blocksCarried(w) < 100) return;
  const res = await F.trip(w, farm, floors, idx, 'build');
  for (const k of res.built) {
    S.markBuilt(w.team, farm.id, k);
    w.say(`этаж ${k + 1} на ферме «${PLANT_RU[farm.plant]}» построен!`);
  }
  w.atBase = true;
}

/** Plants and harvests the floors this bot looks after (phase 1: shared built floors, phase 2: its team). */
async function tendOnce(w) {
  const s = site(w);
  if (!(await S.goToSite(w))) return;
  await F.toGround(w);
  w.acceptTeleports = true;
  await ensureFood(w);
  let farm, floors, idx;
  if (phase2(w)) {
    const t = myTeam(w);
    farm = t.farm; idx = t.idx % S.maxShafts(s);
    floors = [];
    for (let k = 0; k < s.F; k++) if (k % t.size === t.idx % t.size) floors.push(k);
    if (!floors.length) floors.push(t.idx % s.F);   // more bots than floors: share
  } else {
    const mine = tendFloors(w);
    if (!mine.length) return false;
    const byFarm = s.farms.map((f) => mine.filter((x) => x.farm === f.id).map((x) => x.k));
    w.tripNo = (w.tripNo || 0) + 1;
    let fi = w.tripNo % s.farms.length;
    if (!byFarm[fi].length) fi = byFarm.findIndex((a) => a.length);
    farm = s.farms[fi]; floors = byFarm[fi]; idx = climberIndex(w);
  }
  if (w.count('dirt') > 64 * 3 && w.role !== 'builder') await S.depositRow(w, depot(w), ['dirt'], { dirt: 96 });
  await tendTrip(w, farm, floors, idx);
  return true;
}

/** Everyone in phase 2 runs this. */
async function tender(w) {
  if (!(await tendOnce(w))) await sleep(5000);
}

module.exports = {
  PLANT_RU, LOGS, site, depot, storage, names, phase2, myTeam, climberIndex, builderFloors, builderDone, tendFloors,
  ensureFood, workbench, ensureDepot, craftTool, ensureTool, ensureSword, digDirt, digForDepot, storeHarvest, countStored,
  ensureColumnBlocks, tendTrip, buildTrip, tendOnce, tender,
};
