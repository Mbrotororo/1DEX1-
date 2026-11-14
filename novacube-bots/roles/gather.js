// Shared by scouts and the farmer: looking around a random place for bamboo and ripe berry bushes.
const { sleep } = require('../lib/util');

function bushAge(block) {
  try { return Number(block.getProperties().age); } catch (_) { return 0; }
}

/** Harvests bamboo and berries around the current position for up to `budgetMs`. */
async function harvestAround(w, want, budgetMs = 120000) {
  const t0 = Date.now();
  const radius = w.cfg.scout.searchRadius || 56;
  let idle = 0;
  while (Date.now() - t0 < budgetMs && idle < 3) {
    let did = false;
    await w.maybeEat();
    if (w.count('sweet_berries') < want.sweet_berries) {
      const bushes = w.find(['sweet_berry_bush'], radius, 12, (b) => b && bushAge(b) >= 2);
      if (bushes.length) {
        w.setStatus(`собираю ягоды (${w.count('sweet_berries')})`);
        const me = w.bot.entity.position;
        bushes.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
        for (const p of bushes.slice(0, 8)) {
          if (Date.now() - t0 > budgetMs) break;
          if (w.bot.health < 12) { await w.escapeBushes(); await w.maybeEat(19); }
          if (w.bot.health < 8) break;
          if (!(await w.goto(p, 3, 25000))) continue;
          const b = w.bot.blockAt(p);
          if (b && b.name === 'sweet_berry_bush' && bushAge(b) >= 2) {
            try { await w.bot.activateBlock(b); } catch (_) { /* ignore */ }
            await sleep(400);
          }
          await w.collectDrops(4, 4);
          if (w.bot.health < 12) await w.escapeBushes();
          did = true;
        }
      }
    }
    if (w.count('bamboo') < want.bamboo) {
      // the lowest piece of each stalk: breaking it drops the whole stalk
      const all = w.find(['bamboo'], radius, 80);
      const bases = all.filter((p) => {
        const below = w.bot.blockAt(p.offset(0, -1, 0));
        return below && below.name !== 'bamboo';
      });
      if (bases.length) {
        w.setStatus(`рублю бамбук (${w.count('bamboo')})`);
        const me = w.bot.entity.position;
        bases.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
        for (const p of bases.slice(0, 10)) {
          if (Date.now() - t0 > budgetMs) break;
          if (!(await w.goto(p, 2, 25000))) continue;
          // keep the bottom piece so the plant grows back for the next visitor
          const up = p.offset(0, 1, 0);
          const b = w.bot.blockAt(up);
          await w.dig(b && b.name === 'bamboo' ? up : p);
          await sleep(300);
          await w.collectDrops(5, 8);
          did = true;
        }
      }
    }
    if (!did) idle++;
    if (w.count('bamboo') >= want.bamboo && w.count('sweet_berries') >= want.sweet_berries) break;
  }
}

/** Random-teleports and harvests until it has what it wants (or tries run out). */
async function gatherSeeds(w, want, maxRtp = 40) {
  for (let i = 0; i < maxRtp; i++) {
    if (w.count('bamboo') >= want.bamboo && w.count('sweet_berries') >= want.sweet_berries) return true;
    w.setStatus('ищу бамбук и ягоды (/rtp)');
    if (!(await w.teleport(w.cfg.commands.rtp, {}, 'rtp'))) continue;
    await harvestAround(w, want);
    if (w.onRtp) await w.onRtp();
  }
  return w.count('bamboo') >= want.bamboo && w.count('sweet_berries') >= want.sweet_berries;
}

module.exports = { harvestAround, gatherSeeds, bushAge };
