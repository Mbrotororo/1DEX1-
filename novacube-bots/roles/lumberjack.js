// Lumberjack: chops trees in the wild (/rtp), brings the logs to the depot at the farms.
// The smith makes chests, sticks and tools out of them.
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { chopWood } = require('../lib/craft');
const { sleep } = require('../lib/util');

function logs(w) { return w.countMatch(C.LOGS); }

async function run(w) {
  for (;;) {
    await w.waitReady();
    if (C.phase2(w)) { await C.tender(w); continue; }
    const site = w.team.state.site;
    // bring the wood home when the bag is full (or has a lot)
    if (site && (logs(w) >= 160 || w.freeSlots() <= 3)) {
      if (!(await S.goToSite(w))) continue;
      await F.toGround(w);
      w.setStatus('несу брёвна на склад');
      const names = [...new Set(w.bot.inventory.items().filter((i) => C.LOGS.test(i.name)).map((i) => i.name))];
      const stored = await S.depositRow(w, C.depot(w), names.concat(['stick', 'apple']));
      const n = Object.entries(stored).filter(([k]) => C.LOGS.test(k)).reduce((a, [, c]) => a + c, 0);
      if (n) w.say(`отнёс на склад ${n} брёвен`);
      await C.ensureFood(w);
      await C.ensureTool(w, /_axe$/);
      if (logs(w) >= 160) { w.setStatus('склад полный — жду, пока кузнец поставит сундуки'); await sleep(30000); }
      continue;
    }
    if (!site && logs(w) >= 192) { w.setStatus('брёвна есть, жду, пока выберут место под фермы'); await sleep(30000); continue; }
    w.setStatus('рублю деревья (/rtp)');
    if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) continue;
    await chopWood(w, (logs(w) + 64) * 4, 40, 3);
  }
}

module.exports = { run };
