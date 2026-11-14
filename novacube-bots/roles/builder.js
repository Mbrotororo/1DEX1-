// Builder: builds the floors of the farms. Takes a bag of dirt from the depot (and torches),
// climbs its own column, lays the floor walking the walkways, comes back down for more.
// Builders share the floors; when all their floors are built they plant and harvest too.
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
      // the place is not chosen yet: dig dirt here, it will be useful
      if (w.count('dirt') < 64 * 12) await C.digDirt(w, 64 * 12);
      else { w.setStatus('земля есть, жду место под фермы'); await sleep(20000); }
      continue;
    }
    if (!(await S.goToSite(w))) continue;
    await F.toGround(w);
    w.acceptTeleports = true;
    await C.ensureFood(w);
    const todo = C.builderFloors(w).filter((f) => !S.isBuilt(w.team, f.farm, f.k));
    if (!todo.length) {
      // my floors are done: help planting
      if (!(await C.tendOnce(w))) { w.setStatus('мои этажи готовы, жду'); await sleep(15000); }
      continue;
    }
    // one farm per trip, lowest floors first
    const farmId = todo[0].farm;
    const farm = site.farms[farmId];
    const floors = todo.filter((f) => f.farm === farmId).map((f) => f.k);
    await C.buildTrip(w, farm, floors, C.climberIndex(w));
  }
}

module.exports = { run };
