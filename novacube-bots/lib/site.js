// The place the bots build: two big farms side by side (bamboo and berries), chest rows on the
// ground and the columns the bots climb.
//
//   west                                                                       east
//   table  depot  corridor  storage  .  .  columns  FARM 0  8 free (storage, columns)  FARM 1
//   x-9    x-7    x-6 x-5   x-4     x-3 x-2  x-1    x ...                               x+W+8 ...
//
// Chests stand in pairs (double chests) along the farm length with one free block between pairs.
const { Vec3 } = require('vec3');
const { sleep, withTimeout } = require('./util');
const log = require('./log');

function siteCfg(cfg) {
  const f = cfg.farm || {};
  const plants = Array.isArray(f.plants) && f.plants.length ? f.plants : ['bamboo', 'sweet_berries'];
  return { W: f.width || 30, L: f.length || 70, F: f.floors || 10, gap: f.floorGap || 4, first: f.firstFloorHeight || 3, plants };
}

function makeSite(cfg, x, y, z) {
  const d = siteCfg(cfg);
  const farms = d.plants.map((plant, i) => ({
    id: i, plant, x: x + i * (d.W + 8), y, z, W: d.W, L: d.L, F: d.F, gap: d.gap, first: d.first,
  }));
  return { x, y, z, W: d.W, L: d.L, F: d.F, farms, spanX: farms.length * (d.W + 8) - 8 };
}

/** The whole area that belongs to us: nobody digs there and path finding never breaks or places blocks there. */
function inZone(site, p, margin = 0) {
  return p.x >= site.x - 11 - margin && p.x <= site.x + site.spanX + 2 + margin &&
    p.z >= site.z - 3 - margin && p.z <= site.z + site.L + 2 + margin && p.y >= site.y - 3;
}
function center(site) { return new Vec3(site.x + site.spanX / 2, site.y + 1, site.z + site.L / 2); }
function flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function nearSite(w, extra = 60) {
  const site = w.team.state.site;
  if (!site || !w.bot || !w.bot.entity) return false;
  return flatDist(w.bot.entity.position, center(site)) < Math.max(site.spanX, site.L) / 2 + extra;
}
/** Standing on the ground next to the farms (not up on a floor). */
function onSiteGround(w) {
  const site = w.team.state.site;
  return !!site && nearSite(w) && w.bot.entity.position.y <= site.y + 2.6;
}
function farmAt(site, x) {
  return site.farms.find((f) => x >= f.x - 2 && x < f.x + f.W + 1) || null;
}

// ------------------------------------------------------------------ floors
const floorY = (farm, k) => farm.y + farm.first + k * farm.gap;
const isRow = (dx, dz, farm) => dx % 2 === 1 && dz > 0 && dz < farm.L - 1;
/** Torches only where daylight from the open sides does not reach (6+ blocks in), never on the top floor. */
function isTorch(dx, dz, farm, k) {
  if (k >= farm.F - 1) return false;
  return dx % 4 === 0 && dz % 6 === 3 && dx >= 6 && dx <= farm.W - 7 && dz >= 6 && dz <= farm.L - 7;
}
function needsTorches(farm, k) {
  for (let dx = 0; dx < farm.W; dx += 4) for (let dz = 3; dz < farm.L; dz += 6) if (isTorch(dx, dz, farm, k)) return true;
  return false;
}
function shaftOf(farm, i) { return new Vec3(farm.x - 1, 0, farm.z + 1 + i * 3); }
function maxShafts(site) { return Math.floor((site.L - 2) / 3) + 1; }

/** All floors in build order: floor 1 of every farm, then floor 2 of every farm, ... */
function allFloors(site) {
  const out = [];
  for (let k = 0; k < site.F; k++) for (const f of site.farms) out.push({ farm: f.id, k });
  return out;
}
function isBuilt(team, farmId, k) {
  const b = team.state.built || {};
  return (b[farmId] || []).includes(k);
}
function markBuilt(team, farmId, k) {
  team.state.built = team.state.built || {};
  const arr = team.state.built[farmId] = team.state.built[farmId] || [];
  if (!arr.includes(k)) { arr.push(k); arr.sort((a, b) => a - b); team.save(); }
}
function builtCount(team, site) { return site.farms.reduce((s, f) => s + ((team.state.built || {})[f.id] || []).length, 0); }
function allBuilt(team, site) { return builtCount(team, site) >= site.F * site.farms.length; }

// ------------------------------------------------------------------ ground and chests
function groundY(bot, x, z, site) {
  for (let y = site.y + 1; y > site.y - 24; y--) {
    const b = bot.blockAt(new Vec3(x, y, z));
    if (b && b.boundingBox === 'block' && !/leaves|chest|crafting_table|torch|log/.test(b.name)) return y;
  }
  return site.y;
}
function pairOffsets(L, maxPairs) {
  const out = [];
  for (let j = 0; j + 1 < L && out.length < maxPairs * 2; j += 3) out.push(j, j + 1);
  return out;
}
function depotSpots(site, cfg) {
  const n = (cfg.depot && cfg.depot.doubleChests) || 4;
  return pairOffsets(site.L, n).map((j) => new Vec3(site.x - 7, 0, site.z + j));
}
/** Storage rows next to every farm, the pairs closest to the depot first. */
function storageSpots(site) {
  const out = [];
  const offs = pairOffsets(site.L, 999);
  for (let i = 0; i < offs.length; i += 2) for (const f of site.farms) out.push(new Vec3(f.x - 4, 0, f.z + offs[i]), new Vec3(f.x - 4, 0, f.z + offs[i + 1]));
  return out;
}
function workbenchSpot(site) { return new Vec3(site.x - 9, 0, site.z + 1); }
function onGround(bot, site, p) { return new Vec3(p.x, groundY(bot, p.x, p.z, site) + 1, p.z); }
function isChest(bot, p) { const b = bot.blockAt(p); return !!b && /chest/.test(b.name); }
/** Chests of a row that really stand there (with their y on the ground). */
function placedChests(w, spots) {
  const site = w.team.state.site;
  return spots.map((s) => onGround(w.bot, site, s)).filter((p) => isChest(w.bot, p));
}
function missingChests(w, spots) {
  const site = w.team.state.site;
  return spots.map((s) => onGround(w.bot, site, s)).filter((p) => !isChest(w.bot, p));
}
function pairKey(site, p) { const j = p.z - site.z; return `${p.x},${site.z + j - (j % 3)}`; }

/** Opens a chest, runs fn(chest) and remembers what is inside (so others know where things are). */
async function useChest(w, p, fn) {
  const bot = w.bot;
  const site = w.team.state.site;
  const b = bot.blockAt(p);
  if (!b || !/chest/.test(b.name)) return false;
  if (bot.entity.position.distanceTo(p.offset(0.5, 0.5, 0.5)) > 4.2 && !(await w.goto(p, 2, 30000))) return false;
  let chest;
  try { chest = await withTimeout(bot.openContainer(bot.blockAt(p)), 7000, 'сундук'); } catch (_) { return false; }
  try { await fn(chest); } catch (e) { log.debug(w.name, `сундук: ${e.message}`); }
  const items = {};
  for (const it of chest.containerItems()) items[it.name] = (items[it.name] || 0) + it.count;
  let free = 0;
  for (let i = 0; i < chest.inventoryStart; i++) if (!chest.slots[i]) free++;
  w.team.state.chests = w.team.state.chests || {};
  w.team.state.chests[pairKey(site, p)] = { items, free };
  chest.close();
  await sleep(250);
  return true;
}
function cacheOf(w, p) { return (w.team.state.chests || {})[pairKey(w.team.state.site, p)]; }

/** How many of an item the chests of a row hold, by what the bots saw last time. */
function stock(w, spots, test) {
  const site = w.team.state.site;
  const seen = new Set();
  let n = 0;
  for (const s of spots) {
    const k = pairKey(site, s);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = (w.team.state.chests || {})[k];
    if (!c) continue;
    for (const [name, cnt] of Object.entries(c.items)) if (match(test, name)) n += cnt;
  }
  return n;
}
function match(test, name) { return typeof test === 'string' ? test === name : test.test(name); }

/** Puts items into the chests of a row. keep: how many of each to keep. Returns what was stored. */
async function depositRow(w, spots, names, keep = {}) {
  const stored = {};
  const left = () => names.filter((n) => w.count(n) > (keep[n] || 0));
  for (const p of placedChests(w, spots)) {
    if (!left().length) break;
    const c = cacheOf(w, p);
    if (c && c.free === 0) continue;
    await useChest(w, p, async (chest) => {
      for (const n of left()) {
        let extra = w.count(n) - (keep[n] || 0);
        while (extra > 0) {
          const it = w.bot.inventory.items().find((i) => i.name === n);
          if (!it) break;
          const cnt = Math.min(extra, it.count);
          try { await chest.deposit(it.type, null, cnt); } catch (_) { extra = 0; break; }
          stored[n] = (stored[n] || 0) + cnt;
          extra -= cnt;
        }
      }
    });
  }
  return stored;
}

/** Takes items from the chests of a row. wants: [{ test: name|RegExp, count }]. */
async function takeRow(w, spots, wants, leaveFree = 3) {
  const taken = {};
  const remaining = () => wants.filter((x) => x.count > 0);
  for (const p of placedChests(w, spots)) {
    if (!remaining().length || w.freeSlots() <= leaveFree) break;
    const c = cacheOf(w, p);
    if (c && !Object.keys(c.items).some((n) => remaining().some((x) => match(x.test, n)))) continue;
    await useChest(w, p, async (chest) => {
      for (const x of remaining()) {
        for (const it of chest.containerItems()) {
          if (x.count <= 0 || w.freeSlots() <= leaveFree) break;
          if (!match(x.test, it.name)) continue;
          const cnt = Math.min(x.count, it.count);
          try { await chest.withdraw(it.type, null, cnt); } catch (_) { continue; }
          x.count -= cnt;
          taken[it.name] = (taken[it.name] || 0) + cnt;
        }
      }
    });
  }
  return taken;
}

// ------------------------------------------------------------------ getting there
/** Gets to the farms: /home if the server has it, otherwise a /tpa to a teammate standing there. */
async function goToSite(w) {
  const site = w.team.state.site;
  if (!site) return false;
  if (nearSite(w)) return true;
  const cmds = w.cfg.commands;
  if (cmds.home && w.team.state.homeSet && w.team.state.homeSet[w.name]) {
    w.setStatus('иду к ферме (/home)');
    if (await w.teleport(cmds.home, {}, 'home', 2) && nearSite(w)) return true;
  }
  const anchors = [...w.team.workers.values()]
    .filter((x) => x !== w && x.ready && x.acceptTeleports && x.bot && x.bot.entity && onSiteGround(x))
    .sort((a, b) => (b.role === 'digger') - (a.role === 'digger'));
  if (!anchors.length) {
    w.setStatus('жду, кто примет меня у ферм (/tpa)');
    await sleep(15000);
    return false;
  }
  w.setStatus(`иду к фермам (/tpa ${anchors[0].name})`);
  const ok = await w.teleport(cmds.tpa, { player: anchors[0].name }, 'tpa к ферме', 2);
  if (ok && nearSite(w) && cmds.sethome) {
    // remember the place for next time
    w.team.state.homeSet = w.team.state.homeSet || {};
    if (!w.team.state.homeSet[w.name]) { w.cmd(cmds.sethome); w.team.state.homeSet[w.name] = true; w.team.save(); }
  }
  return ok && nearSite(w);
}

module.exports = {
  siteCfg, makeSite, inZone, center, nearSite, onSiteGround, farmAt,
  floorY, isRow, isTorch, needsTorches, shaftOf, maxShafts, allFloors, isBuilt, markBuilt, builtCount, allBuilt,
  groundY, depotSpots, storageSpots, workbenchSpot, onGround, placedChests, missingChests,
  useChest, stock, depositRow, takeRow, goToSite, match,
};
