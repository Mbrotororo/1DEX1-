// Digger: chooses the place for the farms (/rtp to a flat spot), puts the first depot chests,
// then digs dirt next to the farms all the time and fills the depot with it.
// He never leaves the farms, so everyone else comes back with a /tpa to him.
const { Vec3 } = require('vec3');
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { chopWood, woodCount } = require('../lib/craft');
const { sleep } = require('../lib/util');

async function chooseSite(w) {
  const cfg = w.cfg;
  const tmp = S.makeSite(cfg, 0, 0, 0);
  for (let i = 0; i < 80; i++) {
    w.setStatus('ищу ровное место под фермы (/rtp)');
    if (!(await w.teleport(cfg.commands.rtp, {}, 'rtp'))) continue;
    await sleep(2000);   // let the chunks around arrive
    const bot = w.bot;
    const p = bot.entity.position.floored();
    const x = p.x - Math.floor(tmp.spanX / 2), z = p.z - Math.floor(tmp.L / 2);
    const y0 = p.y - 1;
    let ok = true, top = -999, low = 999, samples = 0, trees = 0, soil = 0;
    for (let dx = -11; dx <= tmp.spanX + 2 && ok; dx += 3) {
      for (let dz = -3; dz <= tmp.L + 2 && ok; dz += 3) {
        let g = null;
        let tree = false;
        for (let y = y0 + 12; y > y0 - 10; y--) {
          const b = bot.blockAt(new Vec3(x + dx, y, z + dz));
          if (!b) { ok = false; break; }           // not loaded: too far, try another place
          if (/water|lava|ice|bamboo|cactus|sugar_cane/.test(b.name)) { ok = false; break; }
          if (/leaves|log/.test(b.name)) { tree = true; continue; }   // trees are fine: the lumberjack cuts them
          if (b.boundingBox === 'block') { g = y; if (/^(grass_block|dirt|podzol|coarse_dirt)$/.test(b.name)) soil++; break; }
        }
        if (!ok || g === null) { ok = false; break; }
        samples++;
        if (tree) trees++;
        top = Math.max(top, g); low = Math.min(low, g);
        if (top - low > 4) ok = false;
      }
    }
    if (ok && trees > samples * 0.3) ok = false;   // a forest: too much to cut
    if (ok && soil < samples * 0.8) ok = false;    // sand, stone, terracotta: no dirt to dig for the floors
    if (ok) return S.makeSite(cfg, x, top, z);
  }
  return null;
}

async function run(w) {
  const cfg = w.cfg;
  const team = w.team;
  for (;;) {
    await w.waitReady();
    w.acceptTeleports = true;
    if (C.phase2(w)) { await C.tender(w); continue; }
    if (!team.state.site) {
      // wood for the first chests, then the place
      if (woodCount(w) < 18 * 4) { w.setStatus('рублю дерево на первые сундуки'); await chopWood(w, 18 * 4, 40, 8); continue; }
      const site = await chooseSite(w);
      if (!site) { await sleep(10000); continue; }
      team.state.site = site;
      team.save();
      w.say(`фермы будут здесь: ${site.x} ${site.y} ${site.z} (две фермы ${site.W}x${site.L}, по ${site.F} этажей)`);
      if (cfg.commands.sethome) { w.cmd(cfg.commands.sethome); team.state.homeSet = { [w.name]: true }; team.save(); }
      await C.ensureDepot(w);
      continue;
    }
    if (!(await S.goToSite(w))) continue;
    await F.toGround(w);
    w.atBase = true;
    await C.ensureFood(w);
    if (S.placedChests(w, C.depot(w)).length < 2) {
      await C.ensureDepot(w);
      if (S.placedChests(w, C.depot(w)).length < 2 && woodCount(w) < 20 * 4) {
        w.setStatus('нужны сундуки для склада — рублю дерево');
        await chopWood(w, 20 * 4, 48, 4);
        continue;
      }
    }
    await C.digForDepot(w, 64 * 26);
  }
}

module.exports = { run, chooseSite };
