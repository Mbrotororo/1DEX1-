// Miner: makes itself a pickaxe (wood -> stone), mines in the auto-mine (/warp mine)
// and sells the loot to the buyer when the inventory is full.
const { ensurePickaxe, chopWood, woodCount, hasPickaxe, ensureSticks } = require('../lib/craft');
const { sell } = require('../lib/sell');
const { sleep } = require('../lib/util');
const { handOver } = require('./supplier');

const ORES = ['diamond_ore', 'deepslate_diamond_ore', 'emerald_ore', 'deepslate_emerald_ore', 'gold_ore', 'deepslate_gold_ore',
  'iron_ore', 'deepslate_iron_ore', 'lapis_ore', 'deepslate_lapis_ore', 'redstone_ore', 'deepslate_redstone_ore',
  'copper_ore', 'deepslate_copper_ore', 'coal_ore', 'deepslate_coal_ore'];
const NEEDS_STONE = /(iron|gold|lapis|redstone|diamond|emerald)_ore/;
const STONE = ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate', 'andesite', 'diorite', 'granite', 'tuff'];
const LOOT = ['coal', 'raw_iron', 'raw_gold', 'raw_copper', 'diamond', 'emerald', 'lapis_lazuli', 'redstone',
  'cobblestone', 'cobbled_deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'iron_ingot', 'gold_ingot'];

async function tools(w) {
  if (hasPickaxe(w, 1)) return true;
  if (hasPickaxe(w, 0) && w.count('cobblestone') < 3) return true;
  if (w.count('cobblestone') >= 3 && (await ensureSticks(w, 2))) {
    if (await ensurePickaxe(w)) return true;
  }
  // no pickaxe and no wood: go to the wild for a tree
  if (woodCount(w) < 12) {
    w.setStatus('иду за деревом (/rtp)');
    for (let i = 0; i < 6 && woodCount(w) < 12; i++) {
      if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) continue;
      await chopWood(w, 16, 32);
    }
  }
  return ensurePickaxe(w);
}

async function run(w) {
  const cfg = w.cfg;
  for (;;) {
    await w.waitReady();
    if (!(await tools(w))) { await sleep(15000); continue; }
    w.setStatus('иду в автошахту (/warp mine)');
    if (!(await w.teleport(cfg.commands.mine, {}, 'warp mine'))) { await sleep(20000); continue; }
    const home = w.bot.entity.position.clone();
    let misses = 0;
    w.setStatus('копаю в автошахте');
    while (misses < 8) {
      await w.maybeEat();
      if (!hasPickaxe(w, 0)) break; // pickaxe broke: make a new one
      if (w.count('cobblestone') >= 3 && !hasPickaxe(w, 1) && w.count('stick') + w.countMatch(/_planks$/) >= 2) {
        await ensurePickaxe(w); // upgrade to stone right in the mine if a table can be placed
      }
      if (w.team.state.wideFarm && (w.count('coal') >= 32 || (w.freeSlots() <= 2 && w.count('cobblestone') >= 128))) {
        // torches and walkways for the big farm
        if (await handOver(w, ['coal', 'cobblestone', 'cobbled_deepslate'])) break;
      }
      if (w.freeSlots() <= 2) {
        if (cfg.miner.sellWhenFull) await sell(w, LOOT.filter((n) => !(w.team.state.wideFarm && ['coal', 'cobblestone', 'cobbled_deepslate'].includes(n))), cfg.sell.menuKeywords);
        if (w.freeSlots() <= 2) await w.tossAll(['cobblestone', 'cobbled_deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'dirt', 'gravel'], { cobblestone: 16 });
        w.setStatus('копаю в автошахте');
      }
      const stoneTier = hasPickaxe(w, 1);
      const names = ORES.filter((n) => stoneTier || !NEEDS_STONE.test(n)).concat(STONE);
      const found = w.find(names, cfg.miner.radius, 40)
        .filter((p) => p.distanceTo(home) <= cfg.miner.radius);
      if (!found.length) { misses++; await sleep(4000); continue; }
      const me = w.bot.entity.position;
      // ores first, then whatever is closest
      const score = (p) => {
        const b = w.bot.blockAt(p);
        return (b && ORES.includes(b.name) ? -20 : 0) + p.distanceTo(me);
      };
      found.sort((a, b) => score(a) - score(b));
      const target = found[0];
      if (target.distanceTo(me) > 4.2 && !(await w.goto(target, 3, 30000))) { misses++; continue; }
      if (await w.dig(target)) { misses = 0; await w.collectDrops(4, 3); } else misses++;
    }
    await sleep(2000);
  }
}

module.exports = { run };
