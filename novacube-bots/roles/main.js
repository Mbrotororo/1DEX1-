// RodionDex when he is controlled by the program (main.controlledByBot = true):
// takes bamboo and berries from the farm chests and sells them to the buyer (/b).
const { Vec3 } = require('vec3');
const { sell } = require('../lib/sell');
const { sleep } = require('../lib/util');

async function run(w) {
  const cfg = w.cfg;
  const { chestSpots, groundY } = require('./builder');
  for (;;) {
    await w.waitReady();
    // sell whatever we carry
    if (w.count('bamboo') + w.count('sweet_berries') > 0) {
      await sell(w, cfg.sell.mainSells, cfg.sell.menuKeywords);
    }
    const farm = w.team.state.wideFarm;
    if (!farm) { w.setStatus('жду, пока построят ферму'); await sleep(30000); continue; }
    const harvested = w.team.state.harvested || 0;
    if (harvested - (w.team.state.soldMark || 0) < 256) { w.setStatus('жду урожай'); await sleep(30000); continue; }

    // get to the farm: a /tpa to a builder who stands at the chests
    const base = new Vec3(farm.x - 4, farm.y + 1, farm.z + 3);
    if (w.bot.entity.position.distanceTo(base) > 40) {
      const b = [...w.team.workers.values()].find((x) => x.role === 'builder' && x.atBase && x.bot && x.bot.entity);
      if (!b) { w.setStatus('жду строителя у сундуков'); await sleep(20000); continue; }
      w.setStatus(`иду к ферме (/tpa ${b.name})`);
      if (!(await w.teleport(cfg.commands.tpa, { player: b.name }, 'tpa', 2))) { await sleep(20000); continue; }
    }
    w.setStatus('забираю урожай из сундуков');
    const chests = chestSpots(farm).map((s) => new Vec3(s.x, groundY(w.bot, s.x, s.z, farm.y) + 1, s.z));
    const got = await w.withdrawFrom(chests, cfg.sell.mainSells);
    w.team.state.soldMark = harvested;
    w.team.save();
    if (!got) await sleep(30000);
  }
}

module.exports = { run };
