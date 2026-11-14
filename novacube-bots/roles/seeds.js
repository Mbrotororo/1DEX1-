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
    // the first berries go home early: they are everyone's food
    const early = plant === 'sweet_berries' && site && (!w.earlyUntil || Date.now() > w.earlyUntil) &&
      S.placedChests(w, C.storage(w)).length > 0 && S.stock(w, C.storage(w), 'sweet_berries') < 64 && w.count(plant) >= 64;
    const full = w.count(plant) >= batch || w.freeSlots() <= 3 || early;
    if (full && site) {
      if (!(await S.goToSite(w))) continue;
      await F.toGround(w);
      const before = w.count(plant);
      await C.storeHarvest(w, []);
      await C.ensureFood(w);
      if (w.count(plant) >= before) w.earlyUntil = Date.now() + 10 * 60000;   // nothing went in: not again for a while
      if (w.count(plant) >= before && w.freeSlots() <= 3 || w.count(plant) >= batch) {
        w.setStatus('хранилище ещё не построено — жду у ферм');
        await sleep(30000);
      }
      continue;
    }
    if (full) { w.setStatus(`набрал ${C.PLANT_RU[plant]}, жду, пока выберут место под фермы`); await sleep(30000); continue; }
    const want = { bamboo: 0, sweet_berries: 0 };
    want[plant] = Math.min(batch, w.count(plant) + 128);
    await gatherSeeds(w, want, 4);
  }
}

module.exports = { run };
