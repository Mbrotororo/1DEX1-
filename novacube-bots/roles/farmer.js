// Farmer: picks a place, builds a tower farm (default 10 floors: bamboo and sweet berries in turn)
// and keeps harvesting it. Each floor is a 5x5 dirt platform: the middle 3x3 is a walkway around
// the central column, the outer ring of 16 blocks is planted. Floors are open at the sides, so the
// plants get enough sky light without torches.
//
// Going up: jump and put dirt under itself through the hole in the middle of every floor.
// Going down: dig the column under itself. The dirt goes back into the inventory.
const { Vec3 } = require('vec3');
const { gatherSeeds, bushAge } = require('./gather');
const { sleep } = require('../lib/util');

const RING1 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const RING2 = [];
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) RING2.push([dx, dz]);
RING2.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])));

function floorY(farm, k, cfg) { return farm.y + cfg.farm.firstFloorHeight + k * cfg.farm.floorGap; } // k: 0-based

async function chooseSite(w) {
  // a flat, open place after a random teleport
  for (let i = 0; i < 30; i++) {
    w.setStatus('ищу место под ферму (/rtp)');
    if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) continue;
    const bot = w.bot;
    const p = bot.entity.position.floored();
    const ground = bot.blockAt(p.offset(0, -1, 0));
    if (!ground || ground.boundingBox !== 'block' || /leaves|water|lava|ice/.test(ground.name)) continue;
    let ok = true;
    // open sky above the 5x5 area, high enough for the whole tower
    const need = w.cfg.farm.firstFloorHeight + w.cfg.farm.plants.length * w.cfg.farm.floorGap + 2;
    for (let dx = -2; dx <= 2 && ok; dx++) {
      for (let dz = -2; dz <= 2 && ok; dz++) {
        for (let dy = 0; dy < need && ok; dy += 3) {
          const b = bot.blockAt(p.offset(dx, dy, dz));
          if (b && b.boundingBox === 'block') ok = false;
        }
      }
    }
    if (!ok) continue;
    return { x: p.x, y: p.y - 1, z: p.z, built: 0, planted: 0 };
  }
  return null;
}

/** Digs dirt/grass around the base until we carry `need` dirt. */
async function gatherDirt(w, farm, need) {
  const center = new Vec3(farm.x, farm.y, farm.z);
  let fails = 0;
  while (w.count('dirt') < need && fails < 25 && w.freeSlots() > 1) {
    w.setStatus(`копаю землю (${w.count('dirt')}/${need})`);
    const found = w.find(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt'], 24, 60, (b) => {
      if (!b) return false;
      const d = Math.max(Math.abs(b.position.x - farm.x), Math.abs(b.position.z - farm.z));
      if (d <= 3) return false;                                   // never under the tower
      if (Math.abs(b.position.y - farm.y) > 2) return false;
      const above = w.bot.blockAt(b.position.offset(0, 1, 0));
      return above && above.boundingBox !== 'block';
    });
    if (!found.length) { fails += 5; await sleep(2000); continue; }
    const me = w.bot.entity.position;
    found.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
    let got = false;
    for (const p of found.slice(0, 6)) {
      if (p.distanceTo(w.bot.entity.position) > 4.3 && !(await w.goto(p, 3, 20000))) continue;
      if (await w.dig(p)) got = true;
    }
    await w.collectDrops(5, 6);
    if (!got) fails++;
  }
  await w.goto(center.offset(0, 1, 0), 0, 30000);
  return w.count('dirt') >= Math.min(need, 40);
}

async function toCenter(w, farm, y) {
  // stand exactly on the column (or the ground) in the middle
  return w.gotoBlock(new Vec3(farm.x, y, farm.z), 20000);
}

/** Pillars up until our feet are at `feetY`. */
async function climbTo(w, feetY) {
  let guard = 0;
  while (Math.floor(w.bot.entity.position.y) < feetY && guard++ < 80) {
    if (w.count('dirt') < 2) { w.say('кончилась земля для подъёма'); return false; }
    if (!(await w.pillarUp('dirt'))) {
      await sleep(400);
      if (!(await w.pillarUp('dirt'))) return false;
    }
  }
  return Math.floor(w.bot.entity.position.y) >= feetY;
}

async function descend(w, farm) {
  w.setStatus('спускаюсь с башни');
  let guard = 0;
  while (Math.floor(w.bot.entity.position.y) > farm.y + 1 && guard++ < 90) {
    if (!(await w.digDown())) {
      // stuck on something: step back to the column middle and try again
      await toCenter(w, farm, Math.floor(w.bot.entity.position.y));
      if (!(await w.digDown())) break;
    }
  }
  w.atBase = Math.abs(Math.floor(w.bot.entity.position.y) - (farm.y + 1)) <= 1;
}

async function buildFloor(w, farm, k) {
  const cfg = w.cfg;
  const L = floorY(farm, k, cfg);
  const plant = cfg.farm.plants[k];
  w.setStatus(`строю этаж ${k + 1}/${cfg.farm.plants.length} (${plant === 'bamboo' ? 'бамбук' : 'ягоды'})`);
  const at = (dx, dz, dy = 0) => new Vec3(farm.x + dx, L + dy, farm.z + dz);
  for (const [dx, dz] of RING1.concat(RING2)) await w.placeAt(at(dx, dz), 'dirt');
  for (const [dx, dz] of RING2) {
    if (w.count(plant) < 1) break;
    await w.placeAt(at(dx, dz, 1), plant, at(dx, dz));
  }
}

async function harvestFloor(w, farm, k) {
  const cfg = w.cfg;
  const L = floorY(farm, k, cfg);
  const plant = cfg.farm.plants[k];
  const bot = w.bot;
  let done = 0;
  for (const [dx, dz] of RING2) {
    const spot = new Vec3(farm.x + dx, L + 1, farm.z + dz);
    const b = bot.blockAt(spot);
    if (plant === 'bamboo') {
      const above = bot.blockAt(spot.offset(0, 1, 0));
      if (above && above.name === 'bamboo') { if (await w.dig(spot.offset(0, 1, 0))) done++; }
      else if (b && b.name === 'air' && w.count('bamboo') > 0) await w.placeAt(spot, 'bamboo', spot.offset(0, -1, 0));
    } else {
      if (b && b.name === 'sweet_berry_bush' && bushAge(b) >= 2) {
        try { await bot.activateBlock(b); done++; } catch (_) { /* ignore */ }
        await sleep(150);
      } else if (b && b.name === 'air' && w.count('sweet_berries') > 0) await w.placeAt(spot, 'sweet_berries', spot.offset(0, -1, 0));
    }
  }
  if (done) {
    // walk the four walkway corners to pick up what fell, then back onto the column
    await sleep(600);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      await w.gotoBlock(new Vec3(farm.x + dx, L + 1, farm.z + dz), 8000);
      await sleep(250);
    }
    await toCenter(w, farm, L + 1);
  }
  return done;
}

async function deliverToMain(w) {
  const main = w.bot.players[w.cfg.main.name];
  if (!main || !main.entity) return;
  if (main.entity.position.distanceTo(w.bot.entity.position) > 12) return;
  const keep = { bamboo: w.cfg.farm.keepForReplant, sweet_berries: w.cfg.farm.keepForReplant };
  if (w.count('bamboo') <= keep.bamboo && w.count('sweet_berries') <= keep.sweet_berries) return;
  w.setStatus(`отдаю урожай ${w.cfg.main.name}`);
  await w.goto(main.entity.position, 2, 10000);
  await w.bot.lookAt(main.entity.position.offset(0, 1, 0));
  await w.tossAll(['bamboo', 'sweet_berries'], keep);
}

async function run(w) {
  if (w.cfg.tower) w.cfg = Object.assign({}, w.cfg, { farm: w.cfg.tower });   // the old tower farm has its own settings
  const cfg = w.cfg;
  const team = w.team;
  const floors = cfg.farm.plants.length;
  w.atBase = false;
  for (;;) {
    await w.waitReady();
    let farm = team.state.farm;
    if (!farm) {
      // seeds to start with: the scouts help, but the farmer can find them on its own too
      const start = { bamboo: cfg.farm.seedsToStart, sweet_berries: cfg.farm.seedsToStart };
      w.acceptTeleports = true;
      if (w.count('bamboo') < start.bamboo || w.count('sweet_berries') < start.sweet_berries) {
        await gatherSeeds(w, start, 20);
        continue;
      }
      farm = await chooseSite(w);
      if (!farm) { await sleep(10000); continue; }
      team.state.farm = farm;
      team.save();
      w.say(`ферма будет здесь: ${farm.x} ${farm.y} ${farm.z}`);
    }

    // far from the farm (e.g. after a death) and no way back: say so and wait
    const base = new Vec3(farm.x, farm.y + 1, farm.z);
    if (w.bot.entity.position.distanceTo(base) > 64) {
      if (cfg.commands.home) {
        await w.teleport(cfg.commands.home, {}, 'home');
      } else if (w.bot.players[cfg.main.name]) {
        // ask RodionDex to take us back: he stands at the farm and types /tpaccept
        w.setStatus(`я далеко от фермы — ${cfg.main.name}, встань у фермы (${farm.x} ${farm.y} ${farm.z}) и прими /tpa`);
        await w.teleport(cfg.commands.tpa, { player: cfg.main.name }, 'tpa к ферме', 1);
        await sleep(20000);
        continue;
      } else {
        w.setStatus(`я далеко от фермы (${farm.x} ${farm.y} ${farm.z}) — жду ${cfg.main.name}`);
        w.acceptTeleports = true;
        await sleep(30000);
        continue;
      }
    }

    if (farm.built < floors) {
      const remaining = floors - farm.built;
      const need = Math.min(320, remaining * 28 + cfg.farm.firstFloorHeight + 12);
      if (w.count('dirt') < need) await gatherDirt(w, farm, need);
      if (cfg.commands.sethome && !farm.homeSet) { w.cmd(cfg.commands.sethome); farm.homeSet = true; team.save(); }
      w.atBase = false;
      w.acceptTeleports = false;
      await toCenter(w, farm, farm.y + 1);
      for (let k = 0; k < floors; k++) {
        const L = floorY(farm, k, cfg);
        if (!(await climbTo(w, L + 1))) break;
        if (k >= farm.built) {
          await buildFloor(w, farm, k);
          farm.built = k + 1;
          farm.planted = Math.max(farm.planted || 0, k + 1);
          team.save();
        }
        if (w.count('dirt') < 6 + cfg.farm.floorGap) break;
      }
      await descend(w, farm);
      w.acceptTeleports = true;
      continue;
    }

    // the tower is ready: harvest every few minutes, hand the crop to RodionDex in between
    w.setStatus('собираю урожай');
    w.atBase = false;
    w.acceptTeleports = false;
    if (w.count('dirt') < cfg.farm.firstFloorHeight + floors * cfg.farm.floorGap + 4) {
      await gatherDirt(w, farm, cfg.farm.firstFloorHeight + floors * cfg.farm.floorGap + 8);
    }
    await toCenter(w, farm, farm.y + 1);
    let total = 0;
    for (let k = 0; k < floors; k++) {
      if (!(await climbTo(w, floorY(farm, k, cfg) + 1))) break;
      total += await harvestFloor(w, farm, k);
    }
    await descend(w, farm);
    w.acceptTeleports = true;
    w.say(`урожай собран: ${total} растений. Бамбук ${w.count('bamboo')}, ягоды ${w.count('sweet_berries')}`);
    team.state.harvested = (team.state.harvested || 0) + total;
    team.save();
    const until = Date.now() + cfg.farm.harvestEveryMin * 60000;
    w.setStatus('жду, пока вырастет (стою у фермы)');
    while (Date.now() < until) {
      await w.maybeEat();
      await deliverToMain(w);
      await sleep(3000);
    }
  }
}

module.exports = { run };
