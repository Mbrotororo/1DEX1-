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
  const s = site(w);
  // bamboo grows up to the floor above: plant a bamboo floor only once the floor above it is there
  const ready = (f) => S.isBuilt(w.team, f.farm, f.k) &&
    (s.farms[f.farm].plant !== 'bamboo' || f.k === s.F - 1 || S.isBuilt(w.team, f.farm, f.k + 1));
  const built = S.allFloors(s).filter(ready);
  return built.filter((f, j) => j % pool.length === i);
}

// ------------------------------------------------------------------ small helpers
async function ensureFood(w) {
  const foods = ['bread', 'apple', 'carrot', 'baked_potato', 'cooked_beef', 'cooked_porkchop', 'sweet_berries'];
  const have = w.bot.inventory.items().filter((i) => foods.includes(i.name)).reduce((a, i) => a + i.count, 0);
  // keep a few berries (or the lumberjack's apples from the depot) in the bag
  if (have < 8 && site(w) && S.nearSite(w)) {
    await S.takeRow(w, storage(w), [{ test: 'sweet_berries', count: 24 }]);
    if (w.bot.inventory.items().filter((i) => foods.includes(i.name)).length === 0) await S.takeRow(w, depot(w), [{ test: 'apple', count: 8 }]);
  }
  await w.maybeEat(16, 19);
}

/** A crafting table west of the depot (the spot is remembered; if it can't be used, the next one). */
async function workbench(w) {
  const s = site(w);
  const st = w.team.state;
  const base = S.workbenchSpot(s);
  const cands = [0, 1, -1, 2, -2].map((dz) => S.onGround(w.bot, s, base.offset(0, 0, dz)));   // z+4 is the furnace
  if (st.workbench) cands.unshift(new Vec3(st.workbench.x, st.workbench.y, st.workbench.z));
  const existing = cands.find((p) => { const b = w.bot.blockAt(p); return b && b.name === 'crafting_table'; });
  if (existing) {
    if (w.bot.entity.position.distanceTo(existing) > 3.5) await w.goto(existing, 2, 30000);
    return w.bot.blockAt(existing);
  }
  if (!w.item('crafting_table')) {
    if (!(await ensurePlanks(w, 4)) || !(await craftItem(w, 'crafting_table', 1))) return null;
  }
  for (const spot of cands.slice(st.workbench ? 1 : 0)) {
    await w.gotoBlock(spot.offset(1, 0, 0), 30000);
    await w.placeAt(spot, 'crafting_table', spot.offset(0, -1, 0));
    const b = w.bot.blockAt(spot);
    if (b && b.name === 'crafting_table') { st.workbench = { x: spot.x, y: spot.y, z: spot.z }; w.team.save(); return b; }
  }
  return null;
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
    const table = await workbench(w);
    if (!table) return;
    for (let i = 0; i < can; i++) if (!(await ensurePlanks(w, 8)) || !(await craftItem(w, 'chest', 1, table))) break;
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

/** Digs dirt next to the farms (never on our own place). Every bot has its own direction from the farms,
 *  so they don't dig the same pit; it digs everything within reach before moving on. */
async function digDirt(w, target) {
  const bot = w.bot;
  const s = site(w);
  w.careful(false);
  if (!s && !w.preSiteRtp && w.cfg.commands.rtp) {
    // not at the spawn: it is usually protected, and digging there does nothing
    w.preSiteRtp = true;
    w.setStatus('ухожу со спавна копать землю (/rtp)');
    await w.teleport(w.cfg.commands.rtp, {}, 'rtp');
  }
  const reg = bot.registry;
  const ids = ['grass_block', 'dirt', 'podzol'].map((n) => reg.blocksByName[n] && reg.blocksByName[n].id).filter((x) => x !== undefined);
  const all = w.cfg.bots.length ? w.cfg.bots.map((b) => b.name) : [w.name];
  const me = Math.max(0, all.indexOf(w.name));
  w.digTurn = w.digTurn || 0;
  const spotFor = () => {
    if (!s) return bot.entity.position.floored();
    const ang = ((me + w.digTurn * 0.5) / all.length) * 2 * Math.PI;
    const c = S.center(s);
    const R = Math.max(s.spanX, s.L) / 2 + 16 + (w.digRing || 0);
    return new Vec3(Math.round(c.x + Math.cos(ang) * R), s.y, Math.round(c.z + Math.sin(ang) * R));
  };
  let spot = spotFor();
  const ok = (b) => {
    if (!b) return false;
    const p = b.position;
    if (s && (S.inZone(s, p, 1) || p.y > s.y + 4 || p.y < s.y - 6)) return false;
    const above = bot.blockAt(p.offset(0, 1, 0));
    return !!above && above.boundingBox !== 'block' && !/water|lava/.test(above.name);
  };
  await w.tossJunk();
  let fails = 0;
  while (w.count('dirt') < target && fails < 6 && w.freeSlots() > 2) {
    if (!s && w.team.state.site) return;   // the place got chosen meanwhile: go there
    w.setStatus(`копаю землю (${w.count('dirt')}/${target})`);
    // walk to our spot first: far chunks are not loaded and would look empty
    if (s && Math.hypot(bot.entity.position.x - spot.x, bot.entity.position.z - spot.z) > 20) {
      await w.goto(new Vec3(spot.x, s.y + 1, spot.z), 8, 40000);
    }
    const found = bot.findBlocks({ matching: ids, point: s ? spot : bot.entity.position.floored(), maxDistance: 18, count: 40, useExtraInfo: ok });
    if (!found.length) {
      if (!s) { fails += 2; await sleep(1000); continue; }
      // this spot is dug out: further out, and after a while in another direction
      w.digRing = (w.digRing || 0) + 10;
      if (w.digRing > 70) { w.digRing = 0; w.digTurn++; }
      spot = spotFor();
      fails++;
      continue;
    }
    const before = w.count('dirt');
    const eye = () => bot.entity.position.offset(0, 1.6, 0);
    found.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
    let dug = 0;
    // everything within reach first, no walking
    for (const p of found) {
      if (p.offset(0.5, 0.5, 0.5).distanceTo(eye()) > 4.4) continue;
      if (await w.dig(p)) dug++;
      if (w.count('dirt') >= target || w.freeSlots() <= 2) break;
    }
    if (!dug && !(await w.goto(found[0], 2, 20000))) { fails++; continue; }
    if (dug) await w.collectDrops(3, 4);
    // no dirt came in (protected land, drops lost): that counts as a failure too
    if (w.count('dirt') > before) fails = 0; else if (dug) fails++;
  }
}

/** Dirt goes to every depot pair but the first one: that one stays free for logs, tools and torches. */
function dirtDepot(w) { return depot(w).slice(2); }

/** Dirt for the depot: dig a batch, then put it in. */
async function digForDepot(w, batch = 64 * 8) {
  await ensureTool(w, /_shovel$/);
  await digDirt(w, batch);
  if (w.count('dirt') < 16) { w.setStatus('земли рядом нет — жду'); await sleep(15000); return; }
  w.setStatus('несу землю на склад');
  const stored = await S.depositRow(w, dirtDepot(w), ['dirt', 'cobblestone']);
  if (!stored.dirt && w.count('dirt') >= batch / 2) { w.setStatus('склад земли полный — жду строителей'); await sleep(30000); }
}

function countStored(w, stored) {
  w.team.state.stored = w.team.state.stored || {};
  for (const [n, c] of Object.entries(stored)) w.team.state.stored[n] = (w.team.state.stored[n] || 0) + c;
  w.team.save();
}

/** Harvest into the storage, keeping seeds of the plants we look after. */
async function storeHarvest(w, plantsKept = []) {
  const keepN = (w.cfg.farm && w.cfg.farm.keepSeeds) || 192;
  const keep = { sweet_berries: 24 };   // a few berries always stay: that is the food
  for (const p of plantsKept) keep[p] = Math.max(keepN, keep[p] || 0);
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
  // columns are made of dirt (stone is for swords and walkways)
  const top = Math.max(...floors.map((k) => S.floorY(farm, k))) - site(w).y + 6;
  if (w.count('dirt') >= top) return true;
  await S.takeRow(w, depot(w), [{ test: 'dirt', count: top + 32 - w.count('dirt') }]);
  if (w.count('dirt') < top) await digDirt(w, top + 16);
  return w.count('dirt') >= top;
}

// ------------------------------------------------------------------ trips
async function tendTrip(w, farm, floors, idx) {
  const s = site(w);
  w.atBase = true;
  const keepN = (w.cfg.farm && w.cfg.farm.keepSeeds) || 192;
  await w.tossJunk();
  await storeHarvest(w, [farm.plant]);
  if (w.count(farm.plant) < keepN / 2) {
    await S.takeRow(w, storage(w), [{ test: farm.plant, count: keepN - w.count(farm.plant) }]);
  }
  if (farm.plant === 'bamboo') await ensureSword(w);
  if (w.count('torch') < 16) await S.takeRow(w, depot(w), [{ test: 'torch', count: 64 }]);
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

/** Lights the ground under the first floor of a farm (once), so no monsters appear in the dark there. */
async function lightUnder(w, farm) {
  const s = site(w);
  w.team.state.groundLit = w.team.state.groundLit || {};
  if (w.team.state.groundLit[farm.id]) return;
  const spots = S.groundTorches(farm);
  if (w.count('torch') < spots.length) await S.takeRow(w, depot(w), [{ test: 'torch', count: spots.length + 16 }]);
  if (w.count('torch') < spots.length) return;   // later, when the smith has made torches
  w.setStatus(`ставлю факелы под фермой «${PLANT_RU[farm.plant]}»`);
  w.careful(false);
  let ok = 0;
  for (const [dx, dz] of spots) {
    const x = farm.x + dx, z = farm.z + dz;
    const g = S.groundY(w.bot, x, z, s);
    const p = new Vec3(x, g + 1, z);
    const here = w.bot.blockAt(p);
    if (here && /torch/.test(here.name)) { ok++; continue; }
    if (!(await w.goto(p, 3, 30000))) continue;
    if (here && here.name !== 'air' && here.boundingBox !== 'block') await w.dig(p, false);   // grass, a flower
    if (await w.placeAt(p, 'torch', p.offset(0, -1, 0))) ok++;
  }
  if (ok >= spots.length) { w.team.state.groundLit[farm.id] = true; w.team.save(); }
}

async function buildTrip(w, farm, floors, idx) {
  const s = site(w);
  w.atBase = true;
  // materials from the depot: a full bag of blocks and some torches
  if (F.blocksCarried(w) < 64 * 20) {
    await S.takeRow(w, depot(w), [{ test: 'dirt', count: 64 * 30 }, { test: 'cobblestone', count: 64 * 6 }], 5);   // dirt is in pairs 1+, cobble anywhere
  }
  if (w.count('torch') < 32) await S.takeRow(w, depot(w), [{ test: 'torch', count: 128 }]);
  await lightUnder(w, farm);
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
  if (w.count('dirt') > 64 * 3) await S.depositRow(w, dirtDepot(w), ['dirt'], { dirt: 96 });
  await tendTrip(w, farm, floors, idx);
  return true;
}

/** Everyone in phase 2 runs this. */
async function tender(w) {
  if (!(await tendOnce(w))) await sleep(5000);
}

module.exports = {
  PLANT_RU, LOGS, site, depot, dirtDepot, storage, names, phase2, myTeam, climberIndex, builderFloors, builderDone, tendFloors,
  ensureFood, workbench, ensureDepot, craftTool, ensureTool, ensureSword, digDirt, digForDepot, storeHarvest, countStored,
  ensureColumnBlocks, lightUnder, tendTrip, buildTrip, tendOnce, tender,
};
