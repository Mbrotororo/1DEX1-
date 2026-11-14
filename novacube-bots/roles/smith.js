// Smith: digs stone and coal in the auto-mine (/warp mine), takes logs from the depot and makes
// everything the others need: shovels for the diggers, an axe for the lumberjack, swords for the
// bamboo (a sword cuts bamboo instantly), torches for the floors, and chests: the depot and the big
// storage for the harvest.
const { Vec3 } = require('vec3');
const S = require('../lib/site');
const F = require('../lib/floors');
const C = require('./common');
const { craftItem, ensurePlanks, ensureSticks, woodCount } = require('../lib/craft');
const { mineFor } = require('../lib/mine');
const { sleep } = require('../lib/util');

function torchesWanted(w) {
  const s = C.site(w);
  return s.farms.some((f) => { for (let k = 0; k < f.F; k++) if (S.needsTorches(f, k)) return true; return false; });
}

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
  if (torchesWanted(w) && w.count('coal') > 0) {
    const have = S.stock(w, depot, 'torch') + w.count('torch');
    const target = cfg.torches ?? 128;
    if (have < target) {
      w.setStatus('делаю факелы');
      while (w.count('coal') > 0 && S.stock(w, depot, 'torch') + w.count('torch') < target) {
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
    if (can > 0 && (await ensurePlanks(w, can * 8))) {
      const table = await C.workbench(w);
      if (table) for (let i = 0; i < can; i++) if (!(await craftItem(w, 'chest', 1, table))) break;
    }
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
      // before farming: everything we carry goes to the depot (stone makes swords for the bamboo team)
      if (w.count('cobblestone') + w.count('coal') > 0 && S.nearSite(w)) await S.depositRow(w, C.depot(w), ['cobblestone', 'coal', 'torch']);
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

    await placeChests(w, depot, 'склад', 2);
    await makeGoods(w);
    const placed = await placeChests(w, C.storage(w), 'хранилище урожая', 6);
    w.team.state.storagePairs = Math.floor(S.placedChests(w, C.storage(w)).length / 2);
    w.team.save();
    if (placed) w.say(`хранилище: ${w.team.state.storagePairs} двойных сундуков`);

    // out of stone or coal: a trip to the mine
    if (w.count('cobblestone') < 24 || (torchesWanted(w) && w.count('coal') < 4 && S.stock(w, depot, 'torch') < 64)) {
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
