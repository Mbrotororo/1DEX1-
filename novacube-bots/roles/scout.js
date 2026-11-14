// Scout: /rtp around the world, harvest wild bamboo and berries, bring them to the farmer
// (seeds for the tower) or, when the tower is fully planted, to RodionDex for selling.
const { gatherSeeds } = require('./gather');
const { chopWood, woodCount } = require('../lib/craft');
const { sleep } = require('../lib/util');

async function deliver(w, to) {
  const target = w.team.workers.get(to);
  if (target && target.bot && target.bot.entity) {
    if (!target.acceptTeleports) return false;
  } else if (!w.bot.players[to]) {
    return false; // not online
  }
  w.setStatus(`несу бамбук и ягоды → ${to}`);
  if (!(await w.teleport(w.cfg.commands.tpa, { player: to }, `tpa ${to}`, 2))) return false;
  await sleep(1200);
  const p = w.bot.players[to];
  if (p && p.entity) {
    await w.goto(p.entity.position, 2, 10000);
    await w.bot.lookAt(p.entity.position.offset(0, 1, 0));
  }
  const keep = to === w.cfg.main.name ? {} : {};
  await w.tossAll(['bamboo', 'sweet_berries'], keep);
  w.say(`отдал ресурсы игроку ${to}`);
  await sleep(1500);
  return true;
}

async function run(w) {
  const cfg = w.cfg;
  const want = { bamboo: cfg.scout.bamboo, sweet_berries: cfg.scout.sweet_berries };
  // a little wood on the way is always useful (the farmer may need a crafting table)
  w.onRtp = async () => { if (woodCount(w) < 8) await chopWood(w, 8, 24); };
  for (;;) {
    await w.waitReady();
    await gatherSeeds(w, want, 30);
    const farm = w.team.state.farm;
    const farmer = [...w.team.workers.values()].find((x) => x.role === 'farmer');
    const farmFull = farm && farm.planted >= cfg.farm.plants.length;
    let delivered = false;
    if (!farmFull && farmer && farmer.atBase) delivered = await deliver(w, farmer.name);
    if (!delivered) delivered = await deliver(w, cfg.main.name);
    if (!delivered) {
      w.setStatus('жду, кому отдать бамбук и ягоды');
      await sleep(30000);
    }
  }
}

module.exports = { run };
