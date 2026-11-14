// Supplier for the wide farm: digs dirt next to the farm, chops wood and gathers bamboo seeds,
// then hands everything to a builder who is down at the chests.
const { Vec3 } = require('vec3');
const { gatherSeeds } = require('./gather');
const { chopWood, woodCount } = require('../lib/craft');
const { sleep } = require('../lib/util');

function builders(team) {
  return [...team.workers.values()].filter((x) => x.role === 'builder');
}

/** Gives our stuff to a builder standing at the chests (teleports to him if needed). */
async function handOver(w, names) {
  const b = builders(w.team).filter((x) => x.atBase && x.bot && x.bot.entity && x.freeSlots() > 4)
    .sort((a, c) => c.freeSlots() - a.freeSlots())[0];
  if (!b) return false;
  const p = w.bot.players[b.name];
  const near = p && p.entity && p.entity.position.distanceTo(w.bot.entity.position) < 40;
  if (!near) {
    w.setStatus(`несу ресурсы строителю ${b.name} (/tpa)`);
    if (!(await w.teleport(w.cfg.commands.tpa, { player: b.name }, `tpa ${b.name}`, 2))) return false;
  }
  const pe = w.bot.players[b.name] && w.bot.players[b.name].entity;
  if (pe) { await w.goto(pe.position, 2, 20000); await w.bot.lookAt(pe.position.offset(0, 1, 0)); }
  await w.tossAll(names);
  w.say(`отдал ресурсы ${b.name}`);
  await sleep(1500);
  return true;
}

async function digDirt(w, farm, target) {
  const bot = w.bot;
  let fails = 0;
  while (w.count('dirt') < target && fails < 12 && w.freeSlots() > 1) {
    w.setStatus(`копаю землю для фермы (${w.count('dirt')}/${target})`);
    const found = w.find(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt'], 40, 60, (b) => {
      if (!b) return false;
      const x = b.position.x, z = b.position.z;
      const inFarm = x >= farm.x - 6 && x < farm.x + farm.W + 1 && z >= farm.z - 1 && z < farm.z + farm.L + 1;
      return !inFarm && Math.abs(b.position.y - farm.y) <= 4;
    });
    if (!found.length) { fails += 4; await sleep(1000); continue; }
    const me = bot.entity.position;
    found.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
    let got = false;
    for (const p of found.slice(0, 10)) {
      if (p.distanceTo(bot.entity.position) > 4.3 && !(await w.goto(p, 3, 20000))) continue;
      if (await w.dig(p)) got = true;
    }
    await w.collectDrops(5, 8);
    if (!got) fails++;
  }
}

async function run(w) {
  const cfg = w.cfg;
  for (;;) {
    await w.waitReady();
    await w.maybeEat();
    const farm = w.team.state.wideFarm;
    if (!farm) {
      // before the farm exists: seeds and wood for the first builder
      await gatherSeeds(w, { bamboo: 64, sweet_berries: 0 }, 4);
      if (woodCount(w) < 24) await chopWood(w, 24, 30);
      if (w.count('bamboo') + woodCount(w) > 0) await handOver(w, ['bamboo', 'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log']);
      await sleep(5000);
      continue;
    }
    const base = new Vec3(farm.x, farm.y + 1, farm.z);
    const builderBamboo = builders(w.team).reduce((s, b) => s + (b.bot ? b.count('bamboo') : 0), 0);
    const wantSeeds = builderBamboo < 128 && (w.team.state.harvested || 0) < 500;
    const wantWood = builders(w.team).every((b) => !b.bot || woodCount(b) < 16);
    if (wantSeeds || wantWood) {
      // a trip to the wild for bamboo and wood
      if (wantSeeds) await gatherSeeds(w, { bamboo: 128, sweet_berries: 0 }, 6);
      if (wantWood) { if (!(await w.teleport(cfg.commands.rtp, {}, 'rtp'))) continue; await chopWood(w, 32, 40); }
      for (let i = 0; i < 20 && !(await handOver(w, ['bamboo', 'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log'])); i++) {
        w.setStatus('жду строителя у сундуков');
        await sleep(15000);
      }
      continue;
    }
    // at the farm: dig dirt around it
    if (w.bot.entity.position.distanceTo(base) > 120) {
      if (!(await handOver(w, []))) { w.setStatus('жду строителя, чтобы вернуться к ферме'); await sleep(15000); }
      continue;
    }
    await digDirt(w, farm, 64 * 8);
    for (let i = 0; i < 20 && !(await handOver(w, ['dirt'])); i++) {
      w.setStatus('жду строителя у сундуков (несу землю)');
      await sleep(10000);
    }
  }
}

module.exports = { run, handOver };
