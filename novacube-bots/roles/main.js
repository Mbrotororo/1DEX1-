// RodionDex when he is controlled by the program (main.controlledByBot = true):
// takes bamboo and berries from the farm storage and sells them to the buyer (/b).
// By default RodionDex is played by a person, and this role is not used.
const S = require('../lib/site');
const F = require('../lib/floors');
const { sell } = require('../lib/sell');
const { sleep } = require('../lib/util');

async function run(w) {
  const cfg = w.cfg;
  w.acceptTeleports = false;
  for (;;) {
    await w.waitReady();
    if (w.count('bamboo') + w.count('sweet_berries') > 0) await sell(w, cfg.sell.mainSells, cfg.sell.menuKeywords);
    const site = w.team.state.site;
    const stored = Object.values(w.team.state.stored || {}).reduce((a, b) => a + b, 0);
    if (!site || stored - (w.team.state.soldMark || 0) < 512) { w.setStatus('жду урожай в хранилище'); await sleep(30000); continue; }
    if (!(await S.goToSite(w))) continue;
    await F.toGround(w);
    w.setStatus('забираю урожай из хранилища');
    const got = await S.takeRow(w, S.storageSpots(site), [{ test: 'bamboo', count: 64 * 30 }, { test: 'sweet_berries', count: 64 * 30 }], 1);
    w.team.state.soldMark = stored;
    w.team.save();
    if (!Object.keys(got).length) await sleep(30000);
  }
}

module.exports = { run };
