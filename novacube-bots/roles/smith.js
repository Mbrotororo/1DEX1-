// Smith: digs stone and coal in the auto-mine (/warp mine), takes logs from the depot and makes
// everything the others need: shovels for the diggers, an axe for the lumberjack, swords for the
// bamboo (a sword cuts bamboo instantly), torches for the floors, and chests: the depot and the big
// storage for the harvest.
const { Vec3 } = require('vec3');
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { craftItem, ensurePlanks, ensureSticks, woodCount } = require('../lib/craft');
const { withTimeout } = require('../lib/util');
const { mineFor } = require('../lib/mine');
const { sleep } = require('../lib/util');

function torchesWanted(w) { return C.site(w).farms.some((f) => S.needsTorches(f)); }

/** Looks into every depot chest so we know what is there. */
async function lookInto(w, spots) {
  for (const p of S.placedChests(w, spots)) {
    const j = p.z - C.site(w).z;
    if (j % 3 !== 0) continue; // one half of a double chest shows both
    await S.useChest(w, p, async () => {});
  }
}

/** Takes logs from the depot so we have at least `planks` worth of wood. */
async function wood(w, planks) {
  if (woodCount(w) >= planks) return true;
  await S.takeRow(w, C.depot(w), [{ test: C.LOGS, count: Math.ceil((planks - woodCount(w)) / 4) + 2 }]);
  return woodCount(w) >= planks;
}

/** After the mine: junk away, valuables into the storage (RodionDex can sell them), extra stone to the
 *  depot (the builders use it for walkways). */
async function unload(w) {
  await w.tossJunk();
  await w.tossAll(['andesite', 'diorite', 'granite', 'tuff', 'gravel', 'flint', 'cobbled_deepslate']);
  const valuables = [...new Set(w.bot.inventory.items().map((i) => i.name).filter((n) => /^raw_|_ingot$|^(diamond|emerald|redstone|lapis_lazuli)$/.test(n)))];
  if (valuables.length) await S.depositRow(w, C.storage(w), valuables);
  if (w.count('cobblestone') > 256) await S.depositRow(w, C.dirtDepot(w), ['cobblestone'], { cobblestone: 192 });
}

/** Charcoal from logs in a furnace next to the workbench: torches when the mine gives too little coal. */
async function charcoal(w) {
  const site = C.site(w);
  const fuelHave = w.count('coal') + w.count('charcoal');
  const spot = S.onGround(w.bot, site, new Vec3(site.x - 9, 0, site.z + 4));
  let b = w.bot.blockAt(spot);
  if (!b || b.name !== 'furnace') {
    if (fuelHave >= 16) return;   // not needed yet
    if (b && b.boundingBox === 'block') return;   // something else stands there: no furnace this time
    if (!w.item('furnace')) {
      if (w.count('cobblestone') < 8 + 6) return;   // keep stone for tools
      const table = await C.workbench(w);
      if (!table || !(await craftItem(w, 'furnace', 1, table))) return;
    }
    await w.gotoBlock(spot.offset(1, 0, 0), 30000);
    await w.placeAt(spot, 'furnace', spot.offset(0, -1, 0));
    b = w.bot.blockAt(spot);
    if (!b || b.name !== 'furnace') return;
  }
  if (w.bot.entity.position.distanceTo(spot) > 4) await w.goto(spot, 2, 30000);
  let f;
  try { f = await withTimeout(w.bot.openFurnace(w.bot.blockAt(spot)), 7000, 'печь'); } catch (_) { return; }
  try {
    if (f.outputItem()) { await withTimeout(f.takeOutput(), 5000, 'печь'); }
    // more logs in only when we really lack coal and the depot has wood to spare
    const spare = S.stock(w, C.depot(w), C.LOGS);
    if (!f.inputItem() && w.count('coal') + w.count('charcoal') < 32 && spare + w.countMatch(C.LOGS) >= 24) {
      if (w.countMatch(C.LOGS) < 8) { f.close(); f = null; await S.takeRow(w, C.depot(w), [{ test: C.LOGS, count: 16 }]); f = await withTimeout(w.bot.openFurnace(w.bot.blockAt(spot)), 7000, 'печь'); }
      const log = w.bot.inventory.items().find((i) => C.LOGS.test(i.name));
      if (log) await withTimeout(f.putInput(log.type, null, Math.min(16, log.count)), 5000, 'печь');
    }
    if (!f.fuelItem() && f.inputItem()) {
      const fuel = w.bot.inventory.items().find((i) => i.name === 'charcoal') || w.bot.inventory.items().find((i) => /_planks$/.test(i.name));
      if (fuel) await withTimeout(f.putFuel(fuel.type, null, Math.min(fuel.name === 'charcoal' ? 2 : 11, fuel.count)), 5000, 'печь');
    }
  } catch (e) { /* the furnace will be checked again next time */ }
  if (f) f.close();
  await sleep(300);
}

async function makeGoods(w) {
  const cfg = w.cfg.smith || {};
  const depot = C.depot(w);
  const allBuilt = S.allBuilt(w.team, C.site(w));
  const want = [
    { re: /_shovel$/, kind: 'shovel', n: cfg.shovels ?? 3 },
    { re: /_axe$/, kind: 'axe', n: cfg.axes ?? 1 },
    { re: /_sword$/, kind: 'sword', n: allBuilt ? (cfg.swordsBeforeEveryoneFarms ?? 20) : (cfg.swords ?? 8) },
  ];
  let made = 0;
  for (const t of want) {
    const have = S.stock(w, depot, t.re) + w.bot.inventory.items().filter((i) => t.re.test(i.name)).length;
    for (let i = have; i < t.n; i++) {
      if (!(await wood(w, 4))) break;
      w.setStatus(`делаю инструменты (${t.kind})`);
      if (!(await C.craftTool(w, t.kind))) break;
      made++;
    }
  }
  // torches: coal + stick = 4 torches
  if (torchesWanted(w) && w.count('coal') + w.count('charcoal') > 0) {
    const have = S.stock(w, depot, 'torch') + w.count('torch');
    const target = cfg.torches ?? 128;
    if (have < target) {
      w.setStatus('делаю факелы');
      while (w.count('coal') + w.count('charcoal') > 0 && S.stock(w, depot, 'torch') + w.count('torch') < target) {
        if (!(await wood(w, 2)) || !(await ensureSticks(w, 1))) break;
        if (!(await craftItem(w, 'torch', 1))) break;
        made++;
      }
    }
  }
  // everything made goes to the depot (keep our own pickaxe)
  const goods = [...new Set(w.bot.inventory.items().map((i) => i.name).filter((n) => /_(shovel|axe|sword)$/.test(n) || n === 'torch'))];
  if (goods.length) await S.depositRow(w, depot, goods);
  return made;
}

/** Crafts chests and puts them on a row (standing in the corridor between the depot and the storage). */
async function placeChests(w, spots, label, keepLogs, maxNow = 8) {
  const missing = S.missingChests(w, spots).slice(0, maxNow);
  if (!missing.length) return 0;
  const need = missing.length - w.count('chest');
  if (need > 0) {
    await wood(w, need * 8 + keepLogs * 4);
    const can = Math.min(need, Math.floor((woodCount(w) - keepLogs * 4) / 8));
    const table = can > 0 ? await C.workbench(w) : null;
    // planks of one kind for each chest (mixed woods are fine this way)
    if (table) for (let i = 0; i < can; i++) if (!(await ensurePlanks(w, 8)) || !(await craftItem(w, 'chest', 1, table))) break;
  }
  let placed = 0;
  const site = C.site(w);
  for (const p of missing) {
    if (!w.item('chest')) break;
    w.setStatus(`ставлю сундуки: ${label}`);
    const side = p.x === site.x - 7 ? 2 : -2;
    await w.gotoBlock(new Vec3(p.x + side, p.y, p.z), 30000);
    if (await w.placeAt(p, 'chest', p.offset(0, -1, 0))) placed++;
  }
  return placed;
}

async function run(w) {
  const cfg = w.cfg;
  for (;;) {
    await w.waitReady();
    if (C.phase2(w)) {
      // everyone farms now; the smith still tops up swords and torches on each visit to the depot
      if (S.nearSite(w)) {
        const swords = S.stock(w, C.depot(w), /_sword$/);
        if (swords < ((w.cfg.smith || {}).swordsBeforeEveryoneFarms ?? 20) && (w.count('cobblestone') >= 2 || S.stock(w, C.depot(w), 'cobblestone') >= 2)) {
          if (w.count('cobblestone') < 2) await S.takeRow(w, C.depot(w), [{ test: 'cobblestone', count: 64 }]);
          await makeGoods(w);
        }
      }
      await C.tender(w);
      continue;
    }
    const site = w.team.state.site;
    if (!site) {
      // the place is not chosen yet: stock up on stone and coal
      if (w.count('cobblestone') >= 192 && w.count('coal') >= 32) { w.setStatus('камень и уголь есть, жду место под фермы'); await sleep(20000); continue; }
      await mineFor(w, { budgetMs: 5 * 60000, prefer: ['coal_ore', 'deepslate_coal_ore'], done: () => w.freeSlots() <= 3 });
      continue;
    }
    if (!(await S.goToSite(w))) continue;
    await F.toGround(w);
    w.acceptTeleports = true;
    w.atBase = true;
    await C.ensureFood(w);
    const depot = C.depot(w);
    if (!w.lastLook || Date.now() - w.lastLook > 120000) { await lookInto(w, depot); w.lastLook = Date.now(); }
    await unload(w);

    await placeChests(w, depot, 'склад', 2);
    await charcoal(w);
    await makeGoods(w);
    const placed = await placeChests(w, C.storage(w), 'хранилище урожая', 6);
    w.team.state.storagePairs = Math.floor(S.placedChests(w, C.storage(w)).length / 2);
    w.team.save();
    if (placed) w.say(`хранилище: ${w.team.state.storagePairs} двойных сундуков`);

    // out of stone or coal: a trip to the mine
    if (w.count('cobblestone') < 24 || (torchesWanted(w) && w.count('coal') + w.count('charcoal') < 4 && S.stock(w, depot, 'torch') < 64)) {
      await mineFor(w, {
        budgetMs: 6 * 60000, prefer: ['coal_ore', 'deepslate_coal_ore'],
        done: () => w.freeSlots() <= 3 || (w.count('cobblestone') >= 192 && w.count('coal') >= 48),
      });
      continue;
    }
    if (!placed) { w.setStatus('жду брёвен и заказов'); await sleep(20000); }
  }
}

module.exports = { run };
