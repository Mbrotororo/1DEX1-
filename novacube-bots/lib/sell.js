// Selling to the buyer: "/b" opens a menu, the sign in it opens the list of things the buyer takes,
// clicking an item there sells it. Every menu is written to the log so it can be tuned later.
const log = require('./log');
const { sleep } = require('./util');

function label(item) {
  if (!item) return '';
  let s = item.name;
  try { if (item.customName) s += ` "${String(item.customName).replace(/§./g, '')}"`; } catch (_) { /* no name */ }
  try { if (item.displayName) s += ` (${item.displayName})`; } catch (_) { /* no display name */ }
  return s;
}

function topSlots(win) {
  const end = win.inventoryStart !== undefined ? win.inventoryStart : win.slots.length - 36;
  return win.slots.slice(0, end).map((it, i) => (it ? { it, slot: i } : null)).filter(Boolean);
}

function dump(w, win, tag) {
  const items = topSlots(win).map(({ it, slot }) => `${slot}:${label(it)}x${it.count}`).join(', ');
  log.debug(w.name, `меню ${tag} "${String(win.title).replace(/§./g, '').slice(0, 80)}": ${items}`);
}

function waitWindow(bot, ms) {
  return new Promise((resolve) => {
    const on = (win) => { clearTimeout(t); resolve(win); };
    const t = setTimeout(() => { bot.removeListener('windowOpen', on); resolve(null); }, ms);
    bot.once('windowOpen', on);
  });
}

/** Sells the given items (all of them) through the buyer menu. Returns how many items were sold. */
async function sell(w, itemNames, keywords) {
  const bot = w.bot;
  const before = {};
  for (const n of itemNames) before[n] = w.count(n);
  const total = Object.values(before).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  w.setStatus('продаю скупщику');
  w.cmd(w.cfg.commands.sell);
  let win = await waitWindow(bot, 8000);
  if (!win) { w.say('меню скупщика не открылось'); return 0; }
  dump(w, win, '1');

  // the sign (or another entry) that opens the list of goods
  const kw = keywords.map((k) => k.toLowerCase());
  const hasGoods = (wn) => topSlots(wn).some(({ it }) => itemNames.includes(it.name));
  if (!hasGoods(win)) {
    const entry = topSlots(win).find(({ it }) => /sign/.test(it.name)) ||
      topSlots(win).find(({ it }) => kw.some((k) => label(it).toLowerCase().includes(k)));
    if (entry) {
      const next = waitWindow(bot, 2500);
      await bot.clickWindow(entry.slot, 0, 0).catch(() => {});
      const opened = await next;
      if (opened) win = opened;
      await sleep(600);
      win = bot.currentWindow || win;
      dump(w, win, '2');
    }
  }

  // a goods list may span pages; try the current one
  for (const name of itemNames) {
    for (let i = 0; i < 40 && w.count(name) > 0; i++) {
      const cur = bot.currentWindow;
      if (!cur) break;
      const slot = topSlots(cur).find(({ it }) => it.name === name);
      if (!slot) break;
      const had = w.count(name);
      await bot.clickWindow(slot.slot, 0, 0).catch(() => {});
      await sleep(450);
      if (w.count(name) >= had) {
        // maybe "shift-click sells everything"
        await bot.clickWindow(slot.slot, 0, 1).catch(() => {});
        await sleep(450);
        if (w.count(name) >= had) break;
      }
    }
  }
  if (bot.currentWindow) bot.closeWindow(bot.currentWindow);
  let sold = 0;
  for (const n of itemNames) sold += Math.max(0, before[n] - w.count(n));
  w.say(sold ? `продал скупщику: ${sold} шт.` : 'не получилось продать (меню записано в лог)');
  return sold;
}

module.exports = { sell };
