// Crafting: planks, sticks, crafting table, wooden/stone tools. Also chopping trees for wood.
const { Vec3 } = require('vec3');
const { sleep, withTimeout } = require('./util');
const log = require('./log');

const LOG_RE = /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_log$/;

function plankFor(logName) {
  return logName.replace(/_log$/, '_planks');
}

async function craftItem(w, name, times = 1, table = null) {
  const bot = w.bot;
  const it = bot.registry.itemsByName[name];
  if (!it) return false;
  const recipes = bot.recipesFor(it.id, null, 1, table);
  if (!recipes.length) return false;
  try {
    await withTimeout(bot.craft(recipes[0], times, table), 15000, `крафт ${name}`);
    log.debug(w.name, `скрафтил ${name} x${times}`);
    return true;
  } catch (e) {
    log.debug(w.name, `не скрафтил ${name}: ${e.message}`);
    return false;
  }
}

function plankCount(w) { return w.countMatch(/_planks$/); }

/** Makes at least n planks out of logs in the inventory. */
async function ensurePlanks(w, n) {
  while (plankCount(w) < n) {
    const logItem = w.bot.inventory.items().find((i) => LOG_RE.test(i.name));
    if (!logItem) return false;
    if (!(await craftItem(w, plankFor(logItem.name), 1))) return false;
  }
  return true;
}

async function ensureSticks(w, n) {
  while (w.count('stick') < n) {
    if (!(await ensurePlanks(w, 2))) return false;
    if (!(await craftItem(w, 'stick', 1))) return false;
  }
  return true;
}

/** Finds a crafting table nearby or places our own (crafts one if needed). */
async function ensureTable(w) {
  const bot = w.bot;
  const near = w.find(['crafting_table'], 5, 1);
  if (near.length) return bot.blockAt(near[0]);
  if (!w.item('crafting_table')) {
    if (!(await ensurePlanks(w, 4))) return null;
    if (!(await craftItem(w, 'crafting_table', 1))) return null;
  }
  // place it on solid ground next to us
  const p = bot.entity.position.floored();
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const target = p.offset(d[0], 0, d[1]);
    const ground = bot.blockAt(target.offset(0, -1, 0));
    const here = bot.blockAt(target);
    if (ground && ground.boundingBox === 'block' && here && (here.name === 'air' || here.name === 'short_grass')) {
      if (await w.placeAt(target, 'crafting_table', target.offset(0, -1, 0))) {
        await sleep(300);
        const b = bot.blockAt(target);
        if (b && b.name === 'crafting_table') { w.tablePos = target; return b; }
      }
    }
  }
  return null;
}

/** Picks the crafting table back up so it can be reused elsewhere. */
async function pickUpTable(w) {
  if (!w.tablePos) return;
  const b = w.bot.blockAt(w.tablePos);
  if (b && b.name === 'crafting_table') {
    await w.dig(w.tablePos);
    await w.collectDrops(4, 4);
  }
  w.tablePos = null;
}

function hasPickaxe(w, minTier = 0) {
  const tiers = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe', 'golden_pickaxe'];
  return w.bot.inventory.items().some((i) => tiers.indexOf(i.name) >= minTier && /_pickaxe$/.test(i.name));
}

/** Best pickaxe we can make from what we carry: stone if we have cobblestone, otherwise wood. */
async function ensurePickaxe(w) {
  if (hasPickaxe(w, 1)) return true;
  const stone = w.count('cobblestone') >= 3 ? 'cobblestone' : (w.count('cobbled_deepslate') >= 3 ? 'cobbled_deepslate' : null);
  if (!stone && hasPickaxe(w, 0)) return true;
  if (!(await ensureSticks(w, 2))) return hasPickaxe(w, 0);
  if (!stone && !(await ensurePlanks(w, 3))) return hasPickaxe(w, 0);
  const table = await ensureTable(w);
  if (!table) return hasPickaxe(w, 0);
  const ok = await craftItem(w, stone ? 'stone_pickaxe' : 'wooden_pickaxe', 1, table);
  await pickUpTable(w);
  return ok || hasPickaxe(w, 0);
}

async function ensureShovel(w) {
  if (w.bot.inventory.items().some((i) => /_shovel$/.test(i.name))) return true;
  if (!(await ensureSticks(w, 1))) return false;
  const stone = w.count('cobblestone') >= 1;
  if (!stone && !(await ensurePlanks(w, 1))) return false;
  const table = await ensureTable(w);
  if (!table) return false;
  const ok = await craftItem(w, stone ? 'stone_shovel' : 'wooden_shovel', 1, table);
  await pickUpTable(w);
  return ok;
}

function woodCount(w) {
  return w.countMatch(LOG_RE) * 4 + plankCount(w);
}

/** Chops trees around until we have about `planks` worth of wood. */
async function chopWood(w, planks = 24, radius = 40, rtpTries = 4) {
  const names = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'pale_oak_log'];
  let fails = 0;
  let rtps = 0;
  while (woodCount(w) < planks && fails < 6) {
    await sleep(50); // always give the network a moment (keeps the connection alive)
    const found = w.find(names, radius, 30);
    if (!found.length) {
      // no trees around: jump somewhere else with /rtp
      if (rtps >= rtpTries || !w.cfg.commands.rtp) return false;
      rtps++;
      w.setStatus('рядом нет деревьев — /rtp');
      if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) await sleep(5000);
      continue;
    }
    const me = w.bot.entity.position;
    found.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
    // prefer logs reachable from the ground (low ones)
    const target = found.find((p) => p.y <= me.y + 3) || found[0];
    w.setStatus('рублю дерево');
    if (!(await w.goto(target, 2, 40000))) { fails++; continue; }
    if (!(await w.dig(target))) { fails++; continue; }
    // the rest of the trunk above, while reachable
    for (let dy = 1; dy <= 3; dy++) {
      const up = target.offset(0, dy, 0);
      const b = w.bot.blockAt(up);
      if (b && LOG_RE.test(b.name) && w.bot.entity.position.distanceTo(up) < 4.5) await w.dig(up);
    }
    await w.collectDrops(6, 8);
  }
  return woodCount(w) >= planks;
}

module.exports = { craftItem, ensurePlanks, ensureSticks, ensureTable, pickUpTable, ensurePickaxe, ensureShovel, chopWood, woodCount, hasPickaxe, LOG_RE };
