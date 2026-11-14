// RodionDex when he is controlled by the program (main.controlledByBot = true):
// goes to the farm, takes the crop and sells bamboo and berries to the buyer (/b).
const { sell } = require('../lib/sell');
const { sleep } = require('../lib/util');

async function run(w) {
  const cfg = w.cfg;
  for (;;) {
    await w.waitReady();
    // sell whatever we carry
    if (w.count('bamboo') + w.count('sweet_berries') > 0) {
      await sell(w, cfg.sell.mainSells, cfg.sell.menuKeywords);
    }
    const farmer = [...w.team.workers.values()].find((x) => x.role === 'farmer');
    if (farmer && farmer.atBase && farmer.bot && farmer.bot.entity &&
        farmer.count('bamboo') + farmer.count('sweet_berries') > 2 * cfg.farm.keepForReplant) {
      const p = w.bot.players[farmer.name];
      const far = !p || !p.entity || p.entity.position.distanceTo(w.bot.entity.position) > 10;
      if (far) {
        w.setStatus(`иду к ферме (/tpa ${farmer.name})`);
        await w.teleport(cfg.commands.tpa, { player: farmer.name }, 'tpa', 2);
      }
      w.setStatus('забираю урожай');
      for (let i = 0; i < 20; i++) { await w.collectDrops(10, 10); await sleep(1000); }
      continue;
    }
    w.setStatus('жду урожай');
    await sleep(20000);
  }
}

module.exports = { run };
