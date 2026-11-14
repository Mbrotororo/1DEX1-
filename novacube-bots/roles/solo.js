// One bot does everything on the main account (RodionDex): wood, stone and coal, tools, torches,
// chests, wild seeds, builds the two farms (bamboo and berries), plants and harvests them, keeps the
// harvest in the storage chests and sells it to the buyer (/b).
//
// Getting back to the farms after a trip (/rtp, /warp mine): /home if the server has it, otherwise
// /spawn and a walk. That is why the farms are built a few hundred blocks from the spawn.
const { Vec3 } = require('vec3');
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const D = require('./digger');
const Smith = require('./smith');
const { gatherSeeds } = require('./gather');
const { chopWood, woodCount, hasPickaxe, craftItem, ensureSticks } = require('../lib/craft');
const { mineFor } = require('../lib/mine');
const { sell } = require('../lib/sell');
const { sleep } = require('../lib/util');

const ru = C.PLANT_RU;
function scfg(w) { return w.cfg.solo || {}; }
function logs(w) { return w.countMatch(C.LOGS); }

// ------------------------------------------------------------------ getting around
/** Walks a long way in pieces (far chunks are not loaded, so one long path can't be planned at once). */
async function walkToXZ(w, tx, tz, range = 4) {
  w.careful(false);
  for (let i = 0; i < 20; i++) {
    const p = w.bot.entity.position;
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (d <= range + 1) return true;
    const step = Math.min(40, d);
    const nx = p.x + (tx - p.x) * step / d, nz = p.z + (tz - p.z) * step / d;
    if (!(await w.gotoXZ(nx, nz, d <= 40 ? range : 3, 90000))) {
      // around an obstacle: a little to the side, then on
      await w.gotoXZ(nx + (Math.random() * 16 - 8), nz + (Math.random() * 16 - 8), 3, 30000);
    }
  }
  const p = w.bot.entity.position;
  return Math.hypot(tx - p.x, tz - p.z) <= range + 1;
}

async function goHome(w) {
  const site = w.team.state.site;
  if (!site) return false;
  if (S.nearSite(w)) return true;
  const cmds = w.cfg.commands;
  if (cmds.home && w.team.state.homeSet) {
    w.setStatus('возвращаюсь к фермам (/home)');
    if ((await w.teleport(cmds.home, {}, 'home', 2)) && S.nearSite(w)) return true;
  }
  w.setStatus('возвращаюсь к фермам: /spawn и пешком');
  await w.teleport(cmds.spawn, {}, 'spawn', 2);
  const c = S.center(site);
  await walkToXZ(w, site.x - 6, c.z, 4);
  return S.nearSite(w);
}

// ------------------------------------------------------------------ the place
/** Can we dig here? (Spawn regions are usually protected: blocks come back.) */
async function canDigHere(w, site) {
  const found = w.find(['grass_block', 'dirt'], 12, 20, (b) => !S.inZone(site, b.position, 1));
  for (const p of found.slice(0, 3)) {
    const before = w.count('dirt');
    if (p.distanceTo(w.bot.entity.position) > 4.3) await w.goto(p, 3, 15000);
    await w.dig(p);
    await w.collectDrops(3, 3);
    if (w.count('dirt') > before) return true;
  }
  return false;
}

async function found(w) {
  const st = w.team.state;
  const cmds = w.cfg.commands;
  // wood for the first chests, a table and tools
  if (woodCount(w) < 24 * 4) {
    w.setStatus('рублю дерево на сундуки и инструменты (/rtp)');
    await w.teleport(cmds.rtp, {}, 'rtp');
    await chopWood(w, 28 * 4, 48, 6);
    return;
  }
  const dist0 = scfg(w).siteDistance || 220;
  st.siteTries = st.siteTries || 0;
  for (let t = st.siteTries; t < 32; t++) {
    st.siteTries = t + 1;
    w.team.save();
    const ang = (t % 8) * Math.PI / 4;
    const dist = dist0 + Math.floor(t / 8) * 150;
    if (!(await w.teleport(cmds.spawn, {}, 'spawn', 3))) continue;
    const sp = w.bot.entity.position;
    w.setStatus(`ищу ровное место под фермы в ${dist} блоках от спавна`);
    if (!(await walkToXZ(w, sp.x + Math.cos(ang) * dist, sp.z + Math.sin(ang) * dist, 6))) continue;
    await sleep(1500);   // chunks around
    const site = D.evaluateHere(w);
    if (!site) continue;
    if (!(await canDigHere(w, site))) { w.say('здесь копать нельзя (защищённая зона) — ищу дальше'); continue; }
    site.solo = true;
    st.site = site;
    w.team.save();
    w.say(`фермы будут здесь: ${site.x} ${site.y} ${site.z} (две фермы ${site.W}x${site.L}, по ${site.F} этажа)`);
    if (cmds.sethome) { w.cmd(cmds.sethome); st.homeSet = true; w.team.save(); }
    return;
  }
  w.say('не нашёл ровного места рядом со спавном — увеличь solo.siteDistance в config.json');
  await sleep(60000);
}

// ------------------------------------------------------------------ trips away from the farms
async function woodTrip(w, planks) {
  w.lastWoodTrip = Date.now();
  await C.storeHarvest(w, []);
  w.setStatus('иду за деревом (/rtp)');
  await w.teleport(w.cfg.commands.rtp, {}, 'rtp');
  await chopWood(w, planks, 48, 6);
}

async function mineTrip(w) {
  w.lastMineTrip = Date.now();
  await C.storeHarvest(w, []);
  await mineFor(w, {
    budgetMs: (scfg(w).mineMinutes || 6) * 60000, prefer: ['coal_ore', 'deepslate_coal_ore'],
    done: () => w.freeSlots() <= 4 || (w.count('cobblestone') >= 96 && w.count('coal') >= 32),
  });
  await w.tossJunk();
  await w.tossAll(['andesite', 'diorite', 'granite', 'tuff', 'gravel', 'flint', 'cobbled_deepslate']);
}

async function seedTrip(w, plant) {
  w.lastSeedTrip = Date.now();
  await C.storeHarvest(w, []);
  const want = { bamboo: 0, sweet_berries: 0 };
  want[plant] = w.count(plant) + 128;
  w.setStatus(`ищу ${plant === 'bamboo' ? 'дикий бамбук' : 'дикие ягоды'} (/rtp)`);
  await gatherSeeds(w, want, 8);
}

// ------------------------------------------------------------------ at the farms
async function tools(w) {
  // stone for tools (and a furnace) comes from the mine
  if (!hasPickaxe(w, 0)) await C.craftTool(w, 'pickaxe');
  if (w.count('cobblestone') < 8 && (!w.lastMineTrip || Date.now() - w.lastMineTrip > 20 * 60000)) return 'mine';
  if (!hasPickaxe(w, 1) && w.count('cobblestone') >= 3) await C.craftTool(w, 'pickaxe');
  if (!w.bot.inventory.items().some((i) => /_shovel$/.test(i.name))) await C.craftTool(w, 'shovel');
  if (!w.bot.inventory.items().some((i) => /_sword$/.test(i.name))) await C.craftTool(w, 'sword');
  return null;
}

async function torches(w, target) {
  if (w.count('torch') >= target) return null;
  if (w.count('coal') + w.count('charcoal') === 0) {
    await Smith.charcoal(w);   // a furnace by the workbench turns logs into charcoal
    if (w.count('coal') + w.count('charcoal') === 0) {
      return (!w.lastMineTrip || Date.now() - w.lastMineTrip > 15 * 60000) ? 'mine' : null;
    }
  }
  w.setStatus('делаю факелы');
  for (let i = 0; i < 64 && w.count('torch') < target && w.count('coal') + w.count('charcoal') > 0; i++) {
    if (!(await ensureSticks(w, 1)) || !(await craftItem(w, 'torch', 1))) break;
  }
  return null;
}

/** Sells what lies in the storage (keeping some seeds there for replanting). */
async function sellRound(w) {
  const keepIn = scfg(w).keepInStorage ?? 128;
  const st = C.storage(w);
  await C.storeHarvest(w, []);
  for (let round = 0; round < 6; round++) {
    const wants = ['bamboo', 'sweet_berries'].map((n) => ({ test: n, count: Math.max(0, S.stock(w, st, n) - keepIn) }));
    if (!wants.some((x) => x.count >= 64)) break;
    await S.takeRow(w, st, wants, 2);
    const have = w.count('bamboo') + w.count('sweet_berries');
    if (!have) break;
    const sold = await sell(w, ['bamboo', 'sweet_berries'], w.cfg.sell.menuKeywords);
    w.team.state.sold = (w.team.state.sold || 0) + (sold || 0);
    w.team.save();
    if (!sold) { w.say('скупщик ничего не взял — проверь меню /b (в логах записано, что там было)'); await C.storeHarvest(w, []); break; }
    w.say(`продал скупщику: ${sold} (всего ${w.team.state.sold})`);
  }
}

function unbuiltFloors(w) {
  const site = w.team.state.site;
  // farm by farm, from the bottom: the bamboo farm first
  const out = [];
  for (const f of site.farms) for (let k = 0; k < site.F; k++) if (!S.isBuilt(w.team, f.id, k)) out.push({ farm: f.id, k });
  return out;
}
function readyFloors(w) {
  const site = w.team.state.site;
  return S.allFloors(site).filter((f) => S.isBuilt(w.team, f.farm, f.k) &&
    (site.farms[f.farm].plant !== 'bamboo' || f.k === site.F - 1 || S.isBuilt(w.team, f.farm, f.k + 1)));
}

async function run(w) {
  const cfg = w.cfg;
  for (;;) {
    await w.waitReady();
    const st = w.team.state;
    w.acceptTeleports = false;
    if (!st.site) { await found(w); continue; }
    if (!(await goHome(w))) { await sleep(5000); continue; }
    await F.toGround(w);
    w.atBase = true;
    await C.ensureFood(w);
    await w.tossJunk();

    // 1) chests: the depot (wood, dirt, tools) and the storage for the harvest
    const depot = C.depot(w), storage = C.storage(w);
    if (S.missingChests(w, depot).length) {
      if (woodCount(w) >= 12) await C.ensureDepot(w);
      else { await woodTrip(w, 64 * 4); continue; }
    }
    st.storagePairs = Math.floor(S.placedChests(w, storage).length / 2);
    const wantPairs = Math.min(scfg(w).storagePairs ?? 6, storage.length / 2);
    if (st.storagePairs < wantPairs) {
      if (woodCount(w) >= 24) await Smith.placeChests(w, storage, 'хранилище урожая', 1, 4);
      else if (!w.lastWoodTrip || Date.now() - w.lastWoodTrip > 15 * 60000) { await woodTrip(w, 48 * 4); continue; }
    }

    // 2) tools and torches (stone and coal from the mine)
    if ((await tools(w)) === 'mine') { await mineTrip(w); continue; }
    const unbuilt = unbuiltFloors(w);
    if (unbuilt.length && (await torches(w, 48)) === 'mine') { await mineTrip(w); continue; }

    // 3) selling
    const reserve = (scfg(w).keepInStorage ?? 128) * 2;
    const stored = S.stock(w, storage, 'bamboo') + S.stock(w, storage, 'sweet_berries');
    if (stored - reserve >= (scfg(w).sellAt ?? 512)) { await sellRound(w); continue; }

    // 4) planting and harvest every few minutes, building in between
    const ready = readyFloors(w);
    const tendDue = ready.length && (!unbuilt.length || !w.lastTend || Date.now() - w.lastTend > (scfg(w).tendEveryMin ?? 10) * 60000);
    if (tendDue) {
      const site = st.site;
      w.tendNo = (w.tendNo || 0) + 1;
      const byFarm = site.farms.map((f) => ready.filter((x) => x.farm === f.id).map((x) => x.k));
      let fi = w.tendNo % site.farms.length;
      if (!byFarm[fi].length) fi = byFarm.findIndex((a) => a.length);
      const farm = site.farms[fi];
      // seeds: from the storage, otherwise from the wild
      if (w.count(farm.plant) < 16 && S.stock(w, storage, farm.plant) < 16) {
        if (!w.lastSeedTrip || Date.now() - w.lastSeedTrip > 10 * 60000) { await seedTrip(w, farm.plant); continue; }
      }
      await C.tendTrip(w, farm, byFarm[fi], 0);
      w.lastTend = Date.now();
      continue;
    }
    if (unbuilt.length) {
      const farmId = unbuilt[0].farm;
      const farm = st.site.farms[farmId];
      // seeds early: the first floor gets planted as soon as it is ready
      if (w.count(farm.plant) < 16 && S.stock(w, storage, farm.plant) < 16 && (!w.lastSeedTrip || Date.now() - w.lastSeedTrip > 30 * 60000)) {
        await seedTrip(w, farm.plant);
        continue;
      }
      if (w.count('dirt') < 300) { await C.digDirt(w, scfg(w).dirtBatch || 64 * 24); continue; }
      const floors = unbuilt.filter((f) => f.farm === farmId).map((f) => f.k);
      await C.buildTrip(w, farm, floors, 0);
      continue;
    }
    w.setStatus('всё построено, жду, пока вырастет урожай');
    await sleep(30000);
  }
}

module.exports = { run, goHome, walkToXZ };
