// Seed scouts: "berries" looks for wild sweet berries, "bamboo" for wild bamboo (/rtp around the
// world). Everything goes into the farm storage: the planters take their seeds from there, the rest
// is harvest for selling.
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { gatherSeeds } = require('./gather');
const { sleep } = require('../lib/util');

async function run(w) {
  const plant = w.role === 'berries' ? 'sweet_berries' : 'bamboo';
  const batch = 64 * 8;
  for (;;) {
    await w.waitReady();
    if (C.phase2(w)) { await C.tender(w); continue; }
    const site = w.team.state.site;
    const full = w.count(plant) >= batch || w.freeSlots() <= 3;
    if (full && site) {
      if (!(await S.goToSite(w))) continue;
      await F.toGround(w);
      await C.storeHarvest(w, []);
      await C.ensureFood(w);
      continue;
    }
    if (full) { w.setStatus(`набрал ${C.PLANT_RU[plant]}, жду, пока выберут место под фермы`); await sleep(30000); continue; }
    const want = { bamboo: 0, sweet_berries: 0 };
    want[plant] = Math.min(batch, w.count(plant) + 128);
    await gatherSeeds(w, want, 4);
  }
}

module.exports = { run };
