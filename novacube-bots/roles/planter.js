// Planter: plants bamboo and berries on the built floors and harvests them, puts the harvest
// into the storage. While nothing is built yet, digs dirt for the builders.
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { sleep } = require('../lib/util');

async function run(w) {
  for (;;) {
    await w.waitReady();
    if (C.phase2(w)) { await C.tender(w); continue; }
    const site = w.team.state.site;
    if (!site) {
      if (w.count('dirt') < 64 * 12) await C.digDirt(w, 64 * 12);
      else { w.setStatus('земля есть, жду место под фермы'); await sleep(20000); }
      continue;
    }
    if (!(await S.goToSite(w))) continue;
    await F.toGround(w);
    w.acceptTeleports = true;
    await C.ensureFood(w);
    if (await C.tendOnce(w)) continue;
    // nothing built yet: dirt for the builders
    await C.digForDepot(w);
  }
}

module.exports = { run };
