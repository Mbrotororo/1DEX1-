// Mining in the auto-mine (/warp mine): a pickaxe first (wood -> stone), then ores and stone around.
const { ensurePickaxe, chopWood, woodCount, hasPickaxe, ensureSticks } = require('./craft');
const { sleep } = require('./util');

const ORES = ['diamond_ore', 'deepslate_diamond_ore', 'emerald_ore', 'deepslate_emerald_ore', 'gold_ore', 'deepslate_gold_ore',
  'iron_ore', 'deepslate_iron_ore', 'lapis_ore', 'deepslate_lapis_ore', 'redstone_ore', 'deepslate_redstone_ore',
  'copper_ore', 'deepslate_copper_ore', 'coal_ore', 'deepslate_coal_ore'];
const NEEDS_STONE = /(iron|gold|lapis|redstone|diamond|emerald)_ore/;
const STONE = ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate', 'andesite', 'diorite', 'granite', 'tuff'];
const JUNK = ['andesite', 'diorite', 'granite', 'tuff', 'gravel', 'flint', 'cobbled_deepslate'];

/** Makes sure we have a pickaxe; goes for wood with /rtp when there is nothing to make one from. */
async function miningTools(w) {
  if (hasPickaxe(w, 1)) return true;
  if (hasPickaxe(w, 0) && w.count('cobblestone') < 3) return true;
  if (w.count('cobblestone') >= 3 && (await ensureSticks(w, 2)) && (await ensurePickaxe(w))) return true;
  if (woodCount(w) < 12) {
    w.setStatus('иду за деревом на кирку (/rtp)');
    for (let i = 0; i < 6 && woodCount(w) < 12; i++) {
      if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) continue;
      await chopWood(w, 16, 32);
    }
  }
  return ensurePickaxe(w);
}

/**
 * Mines in the auto-mine until done() says so, the inventory is full or the time is up.
 * prefer: ore names to go for first (e.g. coal).
 */
async function mineFor(w, { budgetMs = 300000, done = () => false, prefer = [] } = {}) {
  const cfg = w.cfg;
  if (!(await miningTools(w))) return false;
  w.setStatus('иду в автошахту (/warp mine)');
  if (!(await w.teleport(cfg.commands.mine, {}, 'warp mine'))) return false;
  const home = w.bot.entity.position.clone();
  const radius = (cfg.miner && cfg.miner.radius) || 24;
  const t0 = Date.now();
  const bad = new Set();         // protected or unreachable blocks (the warp platform, walls)
  const bag = () => w.bot.inventory.items().reduce((s, i) => s + (/_pickaxe$/.test(i.name) ? 0 : i.count), 0);
  let misses = 0;
  w.setStatus('копаю в автошахте');
  while (misses < 10 && Date.now() - t0 < budgetMs && !done()) {
    await w.maybeEat();
    if (!hasPickaxe(w, 0) && !(await ensurePickaxe(w))) break;
    if (w.count('cobblestone') >= 3 && !hasPickaxe(w, 1) && w.count('stick') + w.countMatch(/_planks$/) >= 2) await ensurePickaxe(w);
    if (w.freeSlots() <= 5) {
      await w.tossAll(JUNK);
      await w.tossJunk();
      if (w.freeSlots() <= 2) break;
    }
    const stoneTier = hasPickaxe(w, 1);
    const names = ORES.filter((n) => stoneTier || !NEEDS_STONE.test(n)).concat(STONE);
    const found = w.find(names, radius, 40, (b) => !bad.has(b.position.toString()) && b.position.distanceTo(home) <= radius);
    if (!found.length) { misses++; await sleep(3000); continue; }
    const me = w.bot.entity.position;
    const score = (p) => {
      const b = w.bot.blockAt(p);
      if (!b) return 999;
      return (prefer.includes(b.name) ? -40 : 0) + (ORES.includes(b.name) ? -15 : 0) + p.distanceTo(me);
    };
    found.sort((a, b) => score(a) - score(b));
    const target = found[0];
    if (target.distanceTo(me) > 4.2 && !(await w.goto(target, 3, 30000))) { bad.add(target.toString()); misses++; continue; }
    const before = bag();
    if (await w.dig(target)) await w.collectDrops(4, 3);
    if (bag() > before) misses = 0; else { bad.add(target.toString()); misses++; }
  }
  return true;
}

module.exports = { miningTools, mineFor, ORES, STONE, JUNK };
