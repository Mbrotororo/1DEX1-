// Builder of the wide farm (variant A): a big multi-floor bamboo farm that the bots themselves keep
// running. Default size 30 x 70, 10 floors.
//
// Every floor is a flat platform. Along its length it has rows of bamboo (odd columns) with walkways
// between them (even columns); the first and last rows across are walkways too, so the bots can go
// from one walkway to another. Torches on the walkways keep the light up for the bamboo to grow.
//
// Next to the farm (west side) every builder has its own shaft: it climbs by putting blocks under
// itself and goes down by digging that column. Next to the shafts on the ground stand the chests
// where the harvest goes — RodionDex takes it from there and sells it with /b.
//
// Builders share the floors: builder 0 takes floors 0, 2, 4…, builder 1 takes 1, 3, 5…
const { Vec3 } = require('vec3');
const { gatherSeeds, bushAge } = require('./gather');
const { chopWood, woodCount, ensurePlanks, ensureSticks, craftItem, ensureTable, pickUpTable } = require('../lib/craft');
const { sleep } = require('../lib/util');

function fc(cfg) {
  const f = cfg.farm;
  return { W: f.width || 30, L: f.length || 70, F: f.floors || 10, gap: f.floorGap || 4, first: f.firstFloorHeight || 3 };
}
function plantOf(cfg, k) {
  const p = cfg.farm.plants;
  if (Array.isArray(p)) return p[k % p.length] || 'bamboo';
  return p || 'bamboo';
}
const floorY = (farm, k) => farm.y + farm.first + k * farm.gap;
const isRow = (dx, dz, farm) => dx % 2 === 1 && dz > 0 && dz < farm.L - 1;
const isTorch = (dx, dz, farm) => dx % 4 === 0 && dz % 6 === 3 && dz < farm.L - 1;
const walkMaterials = ['cobblestone', 'cobbled_deepslate', 'dirt'];

function builders(team) {
  return [...team.workers.values()].filter((x) => x.role === 'builder').sort((a, b) => a.name.localeCompare(b.name));
}
function myIndex(w) { return Math.max(0, builders(w.team).indexOf(w)); }
function myFloors(w, farm) {
  const n = Math.max(1, builders(w.team).length);
  const i = myIndex(w);
  const out = [];
  for (let k = 0; k < farm.F; k++) if (k % n === i) out.push(k);
  return out;
}
function shaftOf(farm, i) { return new Vec3(farm.x - 1, 0, farm.z + 1 + i * 4); }
function chestSpots(farm) {
  // three double chests in a row with a gap between them
  return [0, 1, 3, 4, 6, 7].map((i) => new Vec3(farm.x - 4, 0, farm.z + i));
}
function groundY(bot, x, z, fromY) {
  for (let y = fromY + 12; y > fromY - 20; y--) {
    const b = bot.blockAt(new Vec3(x, y, z));
    if (b && b.boundingBox === 'block' && !/leaves|chest|crafting_table/.test(b.name)) return y;  // our own chests are not ground
  }
  return fromY - 1;
}

// ------------------------------------------------------------------ picking the place
async function chooseSite(w) {
  const cfg = w.cfg;
  const d = fc(cfg);
  for (let i = 0; i < 40; i++) {
    w.setStatus('ищу ровное место под большую ферму (/rtp)');
    if (!(await w.teleport(cfg.commands.rtp, {}, 'rtp'))) continue;
    const bot = w.bot;
    const p = bot.entity.position.floored();
    const y0 = p.y - 1;
    const ox = p.x + 5, oz = p.z - Math.floor(d.L / 2);
    let ok = true, top = y0;
    for (let dx = -5; dx < d.W && ok; dx += 3) {
      for (let dz = 0; dz < d.L && ok; dz += 3) {
        const x = ox + dx, z = oz + dz;
        const g = groundY(bot, x, z, y0);
        const gb = bot.blockAt(new Vec3(x, g, z));
        const above = bot.blockAt(new Vec3(x, g + 1, z));
        if (!gb || /water|lava|ice/.test(gb.name) || (above && /water|lava|leaves|log/.test(above.name))) ok = false;
        if (Math.abs(g - y0) > 2) ok = false;
        top = Math.max(top, g);
      }
    }
    if (!ok) continue;
    return { x: ox, y: top, z: oz, W: d.W, L: d.L, F: d.F, gap: d.gap, first: d.first };
  }
  return null;
}

// ------------------------------------------------------------------ shaft
async function toShaftBottom(w, farm, i) {
  const s = shaftOf(farm, i);
  const gy = groundY(w.bot, s.x, s.z, farm.y);
  w.careful(false);
  const ok = await w.gotoBlock(new Vec3(s.x, gy + 1, s.z), 60000);
  return ok;
}

async function climbShaft(w, farm, k) {
  const target = floorY(farm, k) + 1;
  let guard = 0;
  while (Math.floor(w.bot.entity.position.y) < target && guard++ < 90) {
    const mat = walkMaterials.find((m) => w.count(m) > 0);
    if (!mat) return false;
    if (!(await w.pillarUp(mat))) { await sleep(300); if (!(await w.pillarUp(mat))) return false; }
  }
  return Math.floor(w.bot.entity.position.y) >= target;
}

async function descendShaft(w, farm, i) {
  const s = shaftOf(farm, i);
  w.careful(true);
  const y = Math.floor(w.bot.entity.position.y);
  // step back onto the column top
  await w.gotoBlock(new Vec3(s.x, y, s.z), 15000);
  let guard = 0;
  const gy = groundY(w.bot, s.x, s.z, farm.y - 1);
  while (Math.floor(w.bot.entity.position.y) > gy + 1 && guard++ < 90) {
    if (!(await w.digDown())) break;
  }
  w.careful(false);
}

// ------------------------------------------------------------------ one pass over a floor
// The bot never uses path finding on the floors: it walks straight lines along the walkways
// (one cell at a time), puts the next block in front of itself when it is missing, and works
// the cells to the left and right of the walkway. It remembers its steps to walk back the same way.

function lanesOf(W) {
  const lanes = [];
  for (let c = 2; c < W; c += 4) lanes.push(c);
  let lastRow = W - 1; if (lastRow % 2 === 0) lastRow--;
  if (lanes.length && lastRow > lanes[lanes.length - 1] + 1) lanes.push(lastRow + 1 < W ? lastRow + 1 : lastRow - 1);
  return lanes;
}

function solid(bot, p) { const b = bot.blockAt(p); return !!b && b.boundingBox === 'block'; }

async function stepTo(w, cell, sneak) {
  const bot = w.bot;
  const tx = cell.x + 0.5, tz = cell.z + 0.5;
  bot.setControlState('sneak', !!sneak);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 5000) {
    const p = bot.entity.position;
    const dx = tx - p.x, dz = tz - p.z;
    if (Math.hypot(dx, dz) < 0.2) { ok = true; break; }
    await bot.look(Math.atan2(-dx, -dz), 0, true);
    bot.setControlState('forward', true);
    await sleep(50);
  }
  bot.setControlState('forward', false);
  await sleep(60);
  bot.setControlState('sneak', false);
  return ok && Math.abs(bot.entity.position.y - cell.y) < 0.6;
}

class Pass {
  constructor(w, farm, k, idx) {
    this.w = w; this.bot = w.bot; this.farm = farm; this.k = k;
    this.L = floorY(farm, k);
    this.s = shaftOf(farm, idx);
    this.plant = plantOf(w.cfg, k);
    this.path = [];           // cells we stood on, to walk back
    this.harvested = 0;
    this.blocked = false;     // out of blocks / stuck / inventory full
  }
  cell(dx, dz) { return new Vec3(this.farm.x + dx, this.L + 1, this.farm.z + dz); }   // feet position
  edge(dx, dz) { return dx <= 0 || dx >= this.farm.W - 1 || dz <= 0 || dz >= this.farm.L - 1; }
  material(dx, dz) {
    const w = this.w;
    if (isRow(dx, dz, this.farm)) return w.count('dirt') ? 'dirt' : null;
    return walkMaterials.find((m) => w.count(m) > 0) || null;
  }
  async placeFloor(dx, dz, refDx, refDz) {
    const p = new Vec3(this.farm.x + dx, this.L, this.farm.z + dz);
    if (solid(this.bot, p)) return true;
    const mat = this.material(dx, dz);
    if (!mat) return false;
    return this.w.placeAt(p, mat, new Vec3(this.farm.x + refDx, this.L, this.farm.z + refDz));
  }
  /** Walks one cell along a line, building the floor under that cell first if needed. */
  async step(dx, dz, fromDx, fromDz) {
    if (!(await this.placeFloor(dx, dz, fromDx, fromDz))) { this.blocked = true; return false; }
    const c = this.cell(dx, dz);
    if (!(await stepTo(this.w, c, this.edge(dx, dz)))) { this.blocked = true; return false; }
    this.path.push([dx, dz]);
    return true;
  }
  async line(fromDx, fromDz, toDx, toDz, work) {
    let x = fromDx, z = fromDz;
    const sx = Math.sign(toDx - fromDx), sz = Math.sign(toDz - fromDz);
    while ((x !== toDx || z !== toDz) && !this.blocked) {
      const nx = x + sx, nz = z + sz;
      if (!(await this.step(nx, nz, x, z))) return false;
      x = nx; z = nz;
      if (work) await work(x, z);
      if (this.w.freeSlots() < 2) { this.blocked = true; return false; }
    }
    return !this.blocked;
  }
  /** Floor around the walkway cell (lane c, row z): side blocks, planting, torches, harvest. */
  async work(c, z) {
    const w = this.w, bot = this.bot, farm = this.farm;
    for (const d of [-1, 1, -2, 2]) {
      const x = c + d;
      if (x < 0 || x >= farm.W) continue;
      await this.placeFloor(x, z, c + Math.sign(d) * (Math.abs(d) - 1), z);
    }
    for (const d of [-2, -1, 0, 1, 2]) {
      const x = c + d;
      if (x < 0 || x >= farm.W) continue;
      const top = new Vec3(farm.x + x, this.L + 1, farm.z + z);
      if (!solid(bot, top.offset(0, -1, 0))) continue;
      const here = bot.blockAt(top);
      if (isRow(x, z, farm)) {
        if (this.plant === 'bamboo') {
          const up = bot.blockAt(top.offset(0, 1, 0));
          if (up && up.name === 'bamboo') { if (await w.dig(top.offset(0, 1, 0))) this.harvested++; }
          else if (here && here.name === 'air' && w.count('bamboo') > 0) await w.placeAt(top, 'bamboo', top.offset(0, -1, 0));
        } else {
          if (here && here.name === 'sweet_berry_bush' && bushAge(here) >= 2) { try { await bot.activateBlock(here); this.harvested++; } catch (_) { /* ignore */ } }
          else if (here && here.name === 'air' && w.count('sweet_berries') > 0) await w.placeAt(top, 'sweet_berries', top.offset(0, -1, 0));
        }
      } else if (isTorch(x, z, farm) && here && here.name === 'air' && w.count('torch') > 0) {
        await w.placeAt(top, 'torch', top.offset(0, -1, 0));
      }
    }
  }
  async run() {
    const { farm, s, bot, w } = this;
    const entryDz = s.z - farm.z;
    // from the top of our column onto the floor
    const entry = new Vec3(farm.x, this.L, s.z);
    if (!solid(bot, entry)) {
      const mat = this.material(0, entryDz);
      if (!mat || !(await w.placeAt(entry, mat, new Vec3(s.x, this.L, s.z)))) return 0;
    }
    if (!(await stepTo(w, this.cell(0, entryDz), true))) return 0;
    this.path.push([0, entryDz]);
    w.setStatus(`этаж ${this.k + 1}: строю, сажаю, собираю`);
    const lanes = lanesOf(farm.W);
    let x = 0, z = entryDz;
    // along the edge column to the first end row
    if (await this.line(x, z, 0, 0)) { z = 0; }
    for (const c of lanes) {
      if (this.blocked) break;
      if (!(await this.line(x, z, c, z))) break;            // along the end row to the lane
      x = c;
      await this.work(c, z);
      const zEnd = z === 0 ? farm.L - 1 : 0;
      if (!(await this.line(c, z, c, zEnd, (cx, cz) => this.work(cx, cz)))) break;
      z = zEnd;
    }
    // walk back along our own steps to the column and step onto it
    for (let i = this.path.length - 2; i >= 0; i--) {
      const [dx, dz] = this.path[i];
      if (!(await stepTo(w, this.cell(dx, dz), true))) break;
    }
    await stepTo(w, new Vec3(s.x, this.L + 1, s.z), true);
    return this.harvested;
  }
}

function floorDone(w, farm, k) {
  const L = floorY(farm, k);
  for (let dx = 0; dx < farm.W; dx++) for (let dz = 0; dz < farm.L; dz++) {
    if (!solid(w.bot, new Vec3(farm.x + dx, L, farm.z + dz))) return false;
  }
  return true;
}

// ------------------------------------------------------------------ chests, materials
async function ensureChests(w, farm) {
  const bot = w.bot;
  const spots = chestSpots(farm).map((s) => new Vec3(s.x, groundY(bot, s.x, s.z, farm.y) + 1, s.z));
  const missing = spots.filter((p) => { const b = bot.blockAt(p); return !b || !/chest/.test(b.name); });
  if (!missing.length) return spots;
  w.setStatus('ставлю сундуки для урожая');
  w.careful(false);
  // craft every missing chest at once (8 planks each), keeping 4 planks for a table if we have none
  const need = missing.length - w.count('chest');
  if (need > 0) {
    const tableCost = w.item('crafting_table') || w.find(['crafting_table'], 5, 1).length ? 0 : 4;
    const can = Math.min(need, Math.floor((woodCount(w) - tableCost) / 8));
    if (can > 0 && (await ensurePlanks(w, can * 8 + tableCost))) {
      const table = await ensureTable(w);
      if (table) { await craftItem(w, 'chest', can, table); await pickUpTable(w); }
    }
  }
  for (const p of missing) {
    if (!w.item('chest')) break;
    // stand two blocks west of the chest row, not on the spot itself
    await w.gotoBlock(new Vec3(p.x - 2, p.y, p.z), 30000);
    await w.placeAt(p, 'chest', p.offset(0, -1, 0));
  }
  return spots;
}

async function makeTorches(w) {
  if (w.count('torch') >= 32) return;
  const fuel = w.count('coal') ? 'coal' : (w.count('charcoal') ? 'charcoal' : null);
  if (!fuel) return;
  if (!(await ensureSticks(w, Math.min(8, w.count(fuel))))) return;
  while (w.count(fuel) > 0 && w.count('stick') > 0 && w.count('torch') < 128) {
    if (!(await craftItem(w, 'torch', 1))) break;
  }
}

async function makeSword(w) {
  if (w.bot.inventory.items().some((i) => /_sword$/.test(i.name))) return;
  if (woodCount(w) < 3) return;
  if (!(await ensureSticks(w, 1)) || !(await ensurePlanks(w, 2))) return;
  const table = await ensureTable(w);
  if (!table) return;
  await craftItem(w, 'wooden_sword', 1, table);
  await pickUpTable(w);
}

async function digDirtNearby(w, farm, need) {
  // the builders dig a bit themselves when the supplier is late
  const bot = w.bot;
  w.careful(false);
  let fails = 0;
  while (w.count('dirt') < need && fails < 10 && w.freeSlots() > 2) {
    w.setStatus(`копаю землю (${w.count('dirt')}/${need})`);
    const found = w.find(['grass_block', 'dirt', 'coarse_dirt', 'podzol'], 28, 40, (b) => {
      if (!b) return false;
      const x = b.position.x, z = b.position.z;
      const inFarm = x >= farm.x - 6 && x < farm.x + farm.W + 1 && z >= farm.z - 1 && z < farm.z + farm.L + 1;
      if (inFarm) return false;
      const above = bot.blockAt(b.position.offset(0, 1, 0));
      return above && above.boundingBox !== 'block' && Math.abs(b.position.y - farm.y) <= 3;
    });
    if (!found.length) { fails += 3; continue; }
    const me = bot.entity.position;
    found.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
    let got = false;
    for (const p of found.slice(0, 8)) {
      if (p.distanceTo(bot.entity.position) > 4.3 && !(await w.goto(p, 3, 20000))) continue;
      if (await w.dig(p)) got = true;
    }
    await w.collectDrops(5, 6);
    if (!got) fails++;
  }
}

// ------------------------------------------------------------------ main loop
async function run(w) {
  const cfg = w.cfg;
  const team = w.team;
  for (;;) {
    await w.waitReady();
    let farm = team.state.wideFarm;
    const idx = myIndex(w);

    if (!farm) {
      if (idx !== 0) {
        // the first builder founds the farm; meanwhile collect seeds and wood
        w.setStatus('жду, пока главный строитель выберет место; собираю бамбук');
        await gatherSeeds(w, { bamboo: 64, sweet_berries: 0 }, 3);
        if (woodCount(w) < 16) await chopWood(w, 16, 30);
        continue;
      }
      const seeds = cfg.farm.seedsToStart || 64;
      if (w.count('bamboo') < seeds) { await gatherSeeds(w, { bamboo: seeds, sweet_berries: 0 }, 25); continue; }
      if (woodCount(w) < 56) { w.setStatus('рублю дерево на сундуки'); await chopWood(w, 56, 40); if (woodCount(w) < 32) continue; }
      farm = await chooseSite(w);
      if (!farm) { await sleep(10000); continue; }
      team.state.wideFarm = farm;
      team.save();
      w.say(`большая ферма будет здесь: ${farm.x} ${farm.y} ${farm.z}, ${farm.W}x${farm.L}, этажей ${farm.F}`);
    }

    // get to the farm
    const base = new Vec3(farm.x, farm.y + 1, farm.z);
    if (w.bot.entity.position.distanceTo(base) > 120) {
      const other = builders(team).find((b) => b !== w && b.bot && b.bot.entity && b.bot.entity.position.distanceTo(base) < 120 && b.acceptTeleports);
      if (other) { await w.teleport(cfg.commands.tpa, { player: other.name }, 'tpa к ферме', 1); }
      else if (w.bot.players[cfg.main.name]) {
        w.setStatus(`я далеко от фермы — ${cfg.main.name}, встань у фермы (${farm.x} ${farm.y} ${farm.z}) и прими /tpa`);
        await w.teleport(cfg.commands.tpa, { player: cfg.main.name }, 'tpa к ферме', 1);
      } else { w.setStatus('жду, кто проведёт меня к ферме'); await sleep(20000); }
      continue;
    }

    // on the ground: chests, torches, materials; accept deliveries here
    w.acceptTeleports = true;
    w.atBase = true;
    const chests = idx === 0 ? await ensureChests(w, farm) : chestSpots(farm).map((s) => new Vec3(s.x, groundY(w.bot, s.x, s.z, farm.y) + 1, s.z));
    const keep = { bamboo: cfg.farm.keepForReplant || 128, sweet_berries: cfg.farm.keepForReplant || 128 };
    await w.depositTo(chests, ['bamboo', 'sweet_berries'], keep);
    await makeTorches(w);
    await makeSword(w);
    await w.maybeEat();

    const floors = myFloors(w, farm);
    const unfinished = floors.filter((k) => !floorDone(w, farm, k));
    const blocks = walkMaterials.reduce((s, m) => s + w.count(m), 0);
    if (unfinished.length && blocks < 300) {
      // wait a little for the supplier, dig some ourselves if nobody brings it
      await digDirtNearby(w, farm, Math.min(64 * 6, 300));
    }

    // up the shaft: build / plant / harvest my floors from the bottom up
    w.acceptTeleports = false;
    w.atBase = false;
    if (!(await toShaftBottom(w, farm, idx))) { await sleep(5000); continue; }
    let harvested = 0;
    for (const k of floors) {
      if (!(await climbShaft(w, farm, k))) break;
      const pass = new Pass(w, farm, k, idx);
      harvested += await pass.run();
      if (pass.blocked) break;   // out of blocks or full: down to the chests
    }
    await descendShaft(w, farm, idx);
    if (harvested) {
      team.state.harvested = (team.state.harvested || 0) + harvested;
      team.save();
      w.say(`собрал ${harvested} бамбука/ягод с моих этажей`);
    }
    const done = floors.filter((k) => floorDone(w, farm, k)).length;
    team.state[`floors_${w.name}`] = done;
    team.save();
    // a short break on the ground: deliveries come now
    w.acceptTeleports = true;
    w.atBase = true;
    w.setStatus('внизу у сундуков: принимаю ресурсы');
    for (let i = 0; i < 10; i++) { await w.collectDrops(6, 4); await sleep(2000); }
  }
}

module.exports = { run, floorY, chestSpots, groundY };
