// Lumberjack: chops trees in the wild (/rtp), brings the logs to the depot at the farms.
// The smith makes chests, sticks and tools out of them.
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { chopWood } = require('../lib/craft');
const { sleep } = require('../lib/util');

function logs(w) { return w.countMatch(C.LOGS); }
const LOG_NAMES = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'pale_oak_log'];

/** Cuts the trees that stand where the farms will be. */
async function clearSite(w, found) {
  w.setStatus(`вырубаю деревья на месте ферм (${found.length})`);
  await C.ensureTool(w, /_axe$/);
  const me = w.bot.entity.position;
  found.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
  for (const p of found.slice(0, 6)) {
    if (p.distanceTo(w.bot.entity.position) > 4.3 && !(await w.goto(p, 3, 25000))) continue;
    await w.dig(p);
  }
  await w.collectDrops(6, 8);
}

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
    // trees standing on our place go first (nobody can build through them)
    if (site && !w.team.state.siteCleared) {
      if (!(await S.goToSite(w))) continue;
      await F.toGround(w);
      const inSite = w.find(LOG_NAMES, 90, 30).filter((p) => S.inZone(site, p, 2));
      if (inSite.length) { await clearSite(w, inSite); continue; }
      w.team.state.siteCleared = true;
      w.team.save();
      w.say('место под фермы чистое, деревьев нет');
    }
    if (!site && logs(w) >= 192) { w.setStatus('брёвна есть, жду, пока выберут место под фермы'); await sleep(30000); continue; }
    w.setStatus('рублю деревья (/rtp)');
    if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) continue;
    await chopWood(w, (logs(w) + 64) * 4, 40, 3);
  }
}

module.exports = { run };
