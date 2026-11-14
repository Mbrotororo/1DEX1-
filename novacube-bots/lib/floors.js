// Moving on the farm floors: climbing our own column, walking the walkways in straight lines,
// building the floor (builders) or planting and harvesting (everyone else), and getting back down.
//
// The bots never use path finding on the floors: they walk one cell at a time along the walkways
// (sneaking at the edges, so they can't fall), and work the cells to the left and right.
const { Vec3 } = require('vec3');
const S = require('./site');
const { sleep, withTimeout } = require('./util');
const log = require('./log');

const walkMaterials = ['cobblestone', 'cobbled_deepslate', 'dirt'];
// what counts as a finished floor cell: plant rows need soil, walkways any of our blocks
const SOIL = /^(dirt|grass_block|coarse_dirt|podzol|rooted_dirt|moss_block)$/;
const WALK = /^(dirt|grass_block|coarse_dirt|podzol|rooted_dirt|moss_block|cobblestone|cobbled_deepslate|stone|deepslate)$/;

function solid(bot, p) { const b = bot.blockAt(p); return !!b && b.boundingBox === 'block'; }
function floorOk(bot, farm, dx, dz, y) {
  const b = bot.blockAt(new Vec3(farm.x + dx, y, farm.z + dz));
  return !!b && (S.isRow(dx, dz, farm) ? SOIL : WALK).test(b.name);
}
/** Something solid that is not ours (a bamboo stalk, leaves, a log) where the floor or the way goes. */
function foreign(b) {
  return !!b && b.name !== 'air' && b.name !== 'cave_air' && !/torch|bamboo_sapling/.test(b.name) &&
    (b.boundingBox === 'block' || /bamboo|leaves|log|vine|bush|flower|grass|fern/.test(b.name));
}
function bushAge(block) { try { return Number(block.getProperties().age); } catch (_) { return 0; } }
function blocksCarried(w) { return walkMaterials.reduce((s, m) => s + w.count(m), 0); }

async function stepTo(w, cell, sneak) {
  w.act(`шаг на ${cell}`);
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

// ------------------------------------------------------------------ column
/** Ground level of a column = the ground right next to it (west), where nothing is ever built or dug.
 *  Pieces of an old column above that level are ours and get dug away. */
function colBase(w, farm, i) {
  const s = S.shaftOf(farm, i);
  return S.groundY(w.bot, s.x - 1, s.z, w.team.state.site);
}

function rememberShaft(w, farm, i) {
  w.shaftIdx = i;
  w.team.state.shafts = w.team.state.shafts || {};
  const cur = w.team.state.shafts[w.name];
  if (!cur || cur.farm !== farm.id || cur.idx !== i) { w.team.state.shafts[w.name] = { farm: farm.id, idx: i }; w.team.save(); }
}

async function toShaftBottom(w, farm, i) {
  const s = S.shaftOf(farm, i);
  const g = colBase(w, farm, i);
  w.careful(false);
  if (onColumn(w, s) && Math.floor(w.bot.entity.position.y) <= g + 1) return true;
  // stand next to the column, clear its cell down to the ground level (old pieces, a flower), step in
  if (!(await w.gotoBlock(new Vec3(s.x - 1, g + 1, s.z), 60000))) return false;
  for (let y = g + 4; y >= g + 1; y--) {
    const p = new Vec3(s.x, y, s.z);
    const b = w.bot.blockAt(p);
    if (b && b.name !== 'air' && b.name !== 'cave_air') await w.dig(p, false);
  }
  await stepTo(w, new Vec3(s.x, g + 1, s.z), false);
  return onColumn(w, s);
}

async function climbShaft(w, farm, k) {
  const target = S.floorY(farm, k) + 1;
  if (!onColumn(w, S.shaftOf(farm, w.shaftIdx || 0))) return false;
  let guard = 0;
  while (Math.floor(w.bot.entity.position.y) < target && guard++ < 120) {
    // the column must be clear above the head (old column pieces can hang there)
    const head = w.bot.entity.position.floored().offset(0, 2, 0);
    if (solid(w.bot, head) && !(await w.dig(head))) return false;
    const mat = walkMaterials.find((m) => w.count(m) > 0);
    if (!mat) return false;
    if (!(await w.pillarUp(mat))) { await sleep(300); if (!(await w.pillarUp(mat))) return false; }
  }
  return Math.floor(w.bot.entity.position.y) >= target;
}

function onColumn(w, s) {
  const p = w.bot.entity.position;
  return Math.floor(p.x) === s.x && Math.floor(p.z) === s.z;
}

/** From anywhere on a floor back to our column by walkways only (rows with plants are never crossed). */
async function walkHome(w, farm, i) {
  const s = S.shaftOf(farm, i);
  const p = w.bot.entity.position;
  const y = Math.floor(p.y);
  let dx = Math.floor(p.x) - farm.x, dz = Math.floor(p.z) - farm.z;
  const cell = (x, z) => new Vec3(farm.x + x, y, farm.z + z);
  const walk = async (tx, tz) => {
    while (dx !== tx || dz !== tz) {
      const nx = dx + Math.sign(tx - dx), nz = dz + Math.sign(tz - dz);
      if (!(await stepTo(w, cell(nx, nz), true))) { log.debug(w.name, `домой: не прошёл на клетку ${nx},${nz}`); return false; }
      dx = nx; dz = nz;
    }
    return true;
  };
  if (dx % 2 !== 0 && dx > 0 && !(await walk(dx - 1, dz))) return false;
  if (dx !== 0 && dz !== 0 && dz !== farm.L - 1 && !(await walk(dx, dz < farm.L / 2 ? 0 : farm.L - 1))) return false;
  if (!(await walk(0, dz))) return false;
  if (!(await walk(0, s.z - farm.z))) return false;
  await stepTo(w, new Vec3(s.x, y, s.z), true);
  return onColumn(w, s);
}

async function descendShaft(w, farm, i) {
  const site = w.team.state.site;
  const s = S.shaftOf(farm, i);
  w.careful(true);
  const y = Math.floor(w.bot.entity.position.y);
  if (!onColumn(w, s)) await walkHome(w, farm, i);
  if (!onColumn(w, s)) await w.gotoBlock(new Vec3(s.x, y, s.z), 15000);
  const onCol = onColumn(w, s);
  if (!onCol) log.debug(w.name, 'не дошёл до своего столба, спускаюсь прямо вниз (дыру потом заделают)');
  // on our column we go down to its base; anywhere else to the real ground under us
  // (groundY looks from just above the highest ground, so floors and columns above are not mistaken for it)
  const p0 = w.bot.entity.position.floored();
  const stopY = onCol ? colBase(w, farm, i) + 1 : S.groundY(w.bot, p0.x, p0.z, site) + 1;
  let guard = 0;
  while (Math.floor(w.bot.entity.position.y) > stopY && guard++ < 120) {
    const below = w.bot.blockAt(w.bot.entity.position.offset(0, -1, 0).floored());
    // never dig out a plant pot: step aside to a walkway first
    if (below && !onColumn(w, s)) {
      const p = w.bot.entity.position.floored();
      if (S.isRow(p.x - farm.x, p.z - farm.z, farm)) await stepTo(w, p.offset(-1, 0, 0), true);
    }
    if (!(await w.digDown())) break;
  }
  w.careful(false);
}

/** If we are up on a farm (after a restart or a failed descent), get down by our own column. */
async function toGround(w) {
  const site = w.team.state.site;
  if (!site || !w.bot.entity) return;
  const p = w.bot.entity.position;
  if (p.y <= site.y + 2.6 || !S.inZone(site, p)) return;
  const mine = (w.team.state.shafts || {})[w.name];
  const farm = (mine && site.farms[mine.farm]) || S.farmAt(site, Math.floor(p.x)) || site.farms[0];
  const idx = mine ? mine.idx : (w.shaftIdx || 0);
  w.setStatus('спускаюсь с фермы');
  await descendShaft(w, farm, idx);
}

// ------------------------------------------------------------------ one pass over a floor
function lanesOf(W) {
  const lanes = [];
  for (let c = 2; c < W; c += 4) lanes.push(c);
  let lastRow = W - 1; if (lastRow % 2 === 0) lastRow--;
  if (lanes.length && lastRow > lanes[lanes.length - 1] + 1) lanes.push(lastRow + 1 < W ? lastRow + 1 : lastRow - 1);
  return lanes;
}

class Pass {
  /** mode: 'build' (put the floor down, torches) or 'tend' (plant, harvest, torches). */
  constructor(w, farm, k, idx, mode) {
    this.w = w; this.bot = w.bot; this.farm = farm; this.k = k; this.idx = idx; this.mode = mode;
    this.L = S.floorY(farm, k);
    this.s = S.shaftOf(farm, idx);
    this.plant = farm.plant;
    this.path = [];
    this.harvested = 0;
    this.planted = 0;
    this.blocked = false;     // out of blocks / stuck / inventory full / floor not there
    this.reason = '';
  }
  cell(dx, dz) { return new Vec3(this.farm.x + dx, this.L + 1, this.farm.z + dz); }
  edge(dx, dz) { return dx <= 0 || dx >= this.farm.W - 1 || dz <= 0 || dz >= this.farm.L - 1; }
  material(dx, dz) {
    const w = this.w;
    if (S.isRow(dx, dz, this.farm)) return w.count('dirt') ? 'dirt' : null;
    return walkMaterials.find((m) => w.count(m) > 0) || null;
  }
  /** Makes sure the floor cell is ours: clears anything foreign there, puts a block if missing.
   *  Builders always do it; planters only patch holes with the dirt they carry. */
  async placeFloor(dx, dz, refDx, refDz) {
    const p = new Vec3(this.farm.x + dx, this.L, this.farm.z + dz);
    if (floorOk(this.bot, this.farm, dx, dz, this.L)) return true;
    const b = this.bot.blockAt(p);
    if (b && b.boundingBox === 'block' && !foreign(b) && this.mode !== 'build') return true;  // something solid: walkable
    if (foreign(b)) await this.w.dig(p, false);
    const mat = this.material(dx, dz);
    if (!mat) return false;
    if (this.mode !== 'build' && this.w.count('dirt') < 24) return false;   // keep enough to get down and up again
    return this.w.placeAt(p, mat, new Vec3(this.farm.x + refDx, this.L, this.farm.z + refDz));
  }
  stop(reason) { this.blocked = true; this.reason = this.reason || reason; return false; }
  /** Clears what stands in the way at walking height (leaves, logs, a bamboo stalk). */
  async clearWay(dx, dz) {
    for (const up of [1, 2]) {
      const p = new Vec3(this.farm.x + dx, this.L + up, this.farm.z + dz);
      const b = this.bot.blockAt(p);
      if (foreign(b)) await this.w.dig(p, false);
    }
  }
  async step(dx, dz, fromDx, fromDz) {
    if (!(await this.placeFloor(dx, dz, fromDx, fromDz))) return this.stop(this.mode === 'build' ? 'нет блоков' : 'этаж не достроен');
    await this.clearWay(dx, dz);
    if (!(await stepTo(this.w, this.cell(dx, dz), this.edge(dx, dz)))) return this.stop('не прошёл');
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
      if (this.w.freeSlots() < 2) return this.stop('инвентарь полный');
    }
    return !this.blocked;
  }
  /** The cells left and right of the walkway cell (lane c, row z). */
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
      if (S.isRow(x, z, farm)) {
        if (this.mode !== 'tend') continue;
        if (this.plant === 'bamboo') {
          const up = bot.blockAt(top.offset(0, 1, 0));
          if (here && here.name === 'bamboo' && up && up.name === 'bamboo') {
            // cut above the first piece: the plant grows back by itself
            if (await w.dig(top.offset(0, 1, 0), false)) this.harvested++;
          } else if (here && here.name === 'air' && w.count('bamboo') > 0) {
            if (await w.placeAt(top, 'bamboo', top.offset(0, -1, 0))) this.planted++;
          }
        } else {
          if (here && here.name === 'sweet_berry_bush' && bushAge(here) >= 2) {
            try { await withTimeout(bot.activateBlock(here), 4000, 'куст'); this.harvested++; } catch (_) { /* ignore */ }
          } else if (here && here.name === 'air' && w.count('sweet_berries') > 0) {
            if (await w.placeAt(top, 'sweet_berries', top.offset(0, -1, 0))) this.planted++;
          }
        }
      } else if (S.isTorch(x, z, farm) && here && here.name === 'air' && w.count('torch') > 0) {
        await w.placeAt(top, 'torch', top.offset(0, -1, 0));
      }
    }
  }
  async run() {
    const { farm, s, bot, w } = this;
    const entryDz = s.z - farm.z;
    const entry = new Vec3(farm.x, this.L, s.z);
    if (!solid(bot, entry)) {
      if (this.mode !== 'build') { this.stop('этаж не достроен'); return; }
      const mat = this.material(0, entryDz);
      if (!mat || !(await w.placeAt(entry, mat, new Vec3(s.x, this.L, s.z)))) { this.stop('нет блоков'); return; }
    }
    if (!(await stepTo(w, this.cell(0, entryDz), true))) { this.stop('не прошёл'); return; }
    this.path.push([0, entryDz]);
    const name = farm.plant === 'bamboo' ? 'бамбук' : 'ягоды';
    w.setStatus(this.mode === 'build' ? `строю этаж ${this.k + 1} (${name})` : `сажаю и собираю: этаж ${this.k + 1} (${name})`);
    const lanes = lanesOf(farm.W);
    // start where the last trip stopped (a full bag), otherwise at the first lane
    const from = Math.min(this.startLane || 0, lanes.length - 1);
    let x = 0, z = entryDz;
    const zStart = from % 2 === 0 ? 0 : farm.L - 1;
    if (await this.line(x, z, 0, zStart)) z = zStart;
    for (let li = from; li < lanes.length; li++) {
      const c = lanes[li];
      this.lane = li;
      if (this.blocked) break;
      if (!(await this.line(x, z, c, z))) break;
      x = c;
      await this.work(c, z);
      const zEnd = z === 0 ? farm.L - 1 : 0;
      if (!(await this.line(c, z, c, zEnd, (cx, cz) => this.work(cx, cz)))) break;
      z = zEnd;
      if (li === lanes.length - 1) this.finished = true;
    }
    // back along our own steps to the column
    for (let i = this.path.length - 2; i >= 0; i--) {
      const [dx, dz] = this.path[i];
      if (!(await stepTo(w, this.cell(dx, dz), true))) break;
    }
    await stepTo(w, new Vec3(s.x, this.L + 1, s.z), true);
    if (!onColumn(w, s)) await walkHome(w, farm, this.idx);
  }
}

function floorDone(w, farm, k) {
  const L = S.floorY(farm, k);
  for (let dx = 0; dx < farm.W; dx++) for (let dz = 0; dz < farm.L; dz++) {
    if (!floorOk(w.bot, farm, dx, dz, L)) return false;
  }
  return true;
}

/**
 * One trip up a column: works the given floors of one farm from the bottom up, then comes back down.
 * Returns { harvested, planted, built: [k...] }.
 */
async function trip(w, farm, floors, idx, mode) {
  const res = { harvested: 0, planted: 0, built: [], reason: '' };
  rememberShaft(w, farm, idx);
  w.atBase = false;
  w.acceptTeleports = false;
  if (!(await toShaftBottom(w, farm, idx))) { res.reason = 'не дошёл до столба'; w.acceptTeleports = true; return res; }
  // a trip that stopped on a full bag goes on from that floor and lane
  const r = w.resume && w.resume.farm === farm.id && w.resume.mode === mode && floors.includes(w.resume.k) ? w.resume : null;
  let order = [...floors].sort((a, b) => a - b);
  if (r) order = order.filter((k) => k >= r.k).concat(order.filter((k) => k < r.k));
  for (const k of order) {
    if (!(await climbShaft(w, farm, k))) { res.reason = 'не поднялся'; break; }
    const pass = new Pass(w, farm, k, idx, mode);
    if (r && r.k === k) pass.startLane = r.lane;
    await pass.run();
    res.harvested += pass.harvested;
    res.planted += pass.planted;
    if (mode === 'build' && floorDone(w, farm, k)) res.built.push(k);
    if (pass.finished) { if (w.resume && w.resume.k === k) w.resume = null; }
    else if (pass.reason === 'инвентарь полный' || pass.reason === 'нет блоков') w.resume = { farm: farm.id, k, lane: pass.lane || 0, mode };
    if (pass.blocked && pass.reason !== 'этаж не достроен') { res.reason = pass.reason; break; }
  }
  await descendShaft(w, farm, idx);
  w.acceptTeleports = true;
  return res;
}

module.exports = { walkMaterials, SOIL, WALK, floorOk, foreign, colBase, solid, bushAge, blocksCarried, stepTo, toShaftBottom, climbShaft, descendShaft, walkHome, toGround, Pass, floorDone, trip, lanesOf };
