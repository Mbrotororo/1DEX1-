// Miner (optional role): digs in the auto-mine (/warp mine) and sells the loot to the buyer (/b).
const { mineFor } = require('../lib/mine');
const { sell } = require('../lib/sell');
const { sleep } = require('../lib/util');

const LOOT = ['coal', 'raw_iron', 'raw_gold', 'raw_copper', 'diamond', 'emerald', 'lapis_lazuli', 'redstone',
  'cobblestone', 'iron_ingot', 'gold_ingot'];

async function run(w) {
  for (;;) {
    await w.waitReady();
    await mineFor(w, { budgetMs: 15 * 60000, done: () => w.freeSlots() <= 2 });
    if (w.freeSlots() <= 4) await sell(w, LOOT, w.cfg.sell.menuKeywords);
    await sleep(2000);
  }
}

module.exports = { run };
