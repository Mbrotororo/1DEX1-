// One bot = one account. Connects, logs in / registers, reconnects, accepts teleports from the team,
// and gives the roles simple helpers: walking, digging, placing, collecting drops, teleport commands.
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const log = require('./log');
const { sleep, fmt, withTimeout } = require('./util');

class Worker {
  constructor(cfg, account, team) {
    this.cfg = cfg;
    this.name = account.name;
    this.pass = account.password;
    this.role = account.role;
    this.team = team;            // shared object: { names:Set, workers:Map, state }
    this.status = 'подключаюсь';
    this.bot = null;
    this.ready = false;
    this.stopped = false;
    this.lastChat = [];
    this.acceptTeleports = true;
    this.reconnectDelay = 10000;
  }

  say(msg) { log.line(this.name, msg); }
  setStatus(s) { if (s !== this.status) { this.status = s; this.say(s); } }

  start() {
    const { host, port, version } = this.cfg.server;
    const bot = mineflayer.createBot({ host, port, version, username: this.name, auth: 'offline', hideErrors: true, checkTimeoutInterval: 60000 });
    this.bot = bot;
    this.ready = false;
    bot.loadPlugin(pathfinder);

    bot.once('spawn', async () => {
      const mv = new Movements(bot);
      mv.canDig = true;
      mv.allowParkour = false;
      mv.allowSprinting = true;
      mv.maxDropDown = 3;
      const reg = bot.registry;
      mv.blocksToAvoid.add(reg.blocksByName.sweet_berry_bush.id);
      mv.scafoldingBlocks = ['dirt', 'cobblestone', 'cobbled_deepslate', 'netherrack'].map((n) => reg.itemsByName[n] && reg.itemsByName[n].id).filter(Boolean);
      bot.pathfinder.setMovements(mv);
      this.movements = mv;
      // careful walking on the farm floors: no digging, no own blocks, never step off an edge
      const safe = new Movements(bot);
      safe.canDig = false;
      safe.allowParkour = false;
      safe.allow1by1towers = false;
      safe.scafoldingBlocks = [];
      safe.maxDropDown = 0;
      safe.blocksToAvoid.add(reg.blocksByName.sweet_berry_bush.id);
      this.safeMovements = safe;
      this.say('зашёл на сервер');
      // berry bushes hurt: if we ever stand inside one (a random teleport can drop us there), cut it
      clearInterval(this.bushTimer);
      this.bushTimer = setInterval(async () => {
        try {
          if (!bot.entity || bot.targetDigBlock || this.cuttingBush) return;
          // every block the body touches (the body is 0.6 wide, so up to 4 columns, 2 blocks high)
          const p = bot.entity.position;
          const seen = new Set();
          for (const dx of [-0.31, 0.31]) {
            for (const dz of [-0.31, 0.31]) {
              for (const dy of [0, 1]) {
                const v = p.offset(dx, dy, dz).floored();
                const key = v.toString();
                if (seen.has(key)) continue;
                seen.add(key);
                const b = bot.blockAt(v);
                if (b && b.name === 'sweet_berry_bush') {
                  this.cuttingBush = true;
                  if (bot.health < 10) bot.pathfinder.setGoal(null); // stop walking into it while we cut
                  await bot.dig(b, true).catch(() => {});
                  this.cuttingBush = false;
                  return;
                }
              }
            }
          }
        } catch (_) { this.cuttingBush = false; }
      }, 400);
      this.reconnectDelay = 10000;
      await sleep(2500);
      // if the server asked nothing, try to log in anyway (harmless if already logged in)
      if (!this.authDone) this.sendAuth('login');
      await sleep(2500);
      this.ready = true;
    });

    bot.on('messagestr', (msg, position) => this.onChat(msg, position));
    bot.on('kicked', (reason) => this.say(`кикнуло: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`.slice(0, 300)));
    bot.on('error', (e) => log.debug(this.name, `ошибка: ${e.message}`));
    bot.on('death', () => this.say('умер, возрождаюсь'));
    bot.on('end', (reason) => {
      this.ready = false;
      clearInterval(this.bushTimer);
      if (this.stopped) return;
      this.say(`отключился (${reason}), переподключусь через ${Math.round(this.reconnectDelay / 1000)} с`);
      setTimeout(() => this.start(), this.reconnectDelay);
      this.reconnectDelay = Math.min(120000, this.reconnectDelay * 2);
    });
  }

  // ------------------------------------------------------------------ chat: login, register, teleports
  onChat(msg, position) {
    if (!msg || position === 'game_info') return;
    log.debug(this.name, `чат: ${msg}`);
    this.lastChat.push({ t: Date.now(), msg });
    if (this.lastChat.length > 40) this.lastChat.shift();
    const low = msg.toLowerCase();
    if (/\/reg(ister)?\b|зарегистр/.test(low)) this.sendAuth('register');
    else if (/\/l(ogin)?\b|авториз|войдите|введите пароль/.test(low)) this.sendAuth('login');
    if (/(успешно|successfully).*(вош|авториз|зарегистр|logged|registered)|добро пожаловать/.test(low)) this.authDone = true;
    // teleport request from a teammate or from the main account
    if (/tpa|телепорт|teleport/.test(low)) {
      // whole-word match: "RodionDex" must not match inside "RodionDex1"
      const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const from = [...this.team.names].sort((a, b) => b.length - a.length)
        .find((n) => n !== this.name && new RegExp(`(^|[^A-Za-z0-9_])${esc(n)}([^A-Za-z0-9_]|$)`).test(msg));
      if (from && this.acceptTeleports && /(хочет|запрос|request|отправил|просит)/.test(low)) {
        const now = Date.now();
        if (!this.lastAccept || now - this.lastAccept > 3000) {
          this.lastAccept = now;
          setTimeout(() => this.cmd(this.cfg.commands.tpaccept, { player: from }), 600);
          this.say(`принимаю телепорт от ${from}`);
        }
      }
    }
  }

  sendAuth(kind) {
    const now = Date.now();
    if (this.lastAuth && now - this.lastAuth < 4000) return;
    this.lastAuth = now;
    const tpl = kind === 'register' ? this.cfg.commands.register : this.cfg.commands.login;
    this.bot.chat(fmt(tpl, { pass: this.pass }));
    log.debug(this.name, kind === 'register' ? 'отправил регистрацию' : 'отправил вход');
  }

  cmd(tpl, vars = {}) {
    const text = fmt(tpl, vars);
    if (this.bot) this.bot.chat(text);
    log.debug(this.name, `команда: ${text}`);
  }

  recentChat(sinceMs) {
    const t = Date.now() - sinceMs;
    return this.lastChat.filter((m) => m.t >= t).map((m) => m.msg);
  }

  async waitReady() {
    // a real (timer) pause on every call: role loops that hit nothing to do can't freeze the program
    await sleep(100);
    while (!this.ready || !this.bot || !this.bot.entity) await sleep(500);
  }

  // ------------------------------------------------------------------ teleports
  /** Runs a teleport command and waits until the server moves us. Handles cooldown messages. */
  async teleport(tpl, vars = {}, label = 'телепорт', tries = 6) {
    for (let i = 0; i < tries; i++) {
      await this.waitReady();
      const before = this.bot.entity.position.clone();
      const sent = Date.now();
      this.cmd(tpl, vars);
      const moved = await this.waitMoved(before, 25000);
      if (moved) {
        await this.settle();
        return true;
      }
      // cooldown? "подождите 7 сек" / "wait 12 seconds"
      const text = this.recentChat(Date.now() - sent + 500).join(' ');
      const m = text.match(/(\d+)\s*(сек|с\b|sec|s\b)/i);
      const wait = m ? (parseInt(m[1], 10) + 2) : (this.cfg.scout.rtpCooldownSec || 10);
      log.debug(this.name, `${label} не сработал, жду ${wait} с`);
      await sleep(wait * 1000);
    }
    return false;
  }

  waitMoved(before, timeout) {
    return new Promise((resolve) => {
      const bot = this.bot;
      const done = (v) => { clearInterval(iv); clearTimeout(to); resolve(v); };
      const iv = setInterval(() => {
        if (!bot.entity) return;
        if (bot.entity.position.distanceTo(before) > 6) done(true);
      }, 250);
      const to = setTimeout(() => done(false), timeout);
    });
  }

  async settle() {
    try { await withTimeout(this.bot.waitForChunksToLoad(), 20000, 'загрузка чанков'); } catch (_) { /* ok */ }
    await sleep(1500);
  }

  // ------------------------------------------------------------------ inventory
  count(name) {
    return this.bot.inventory.items().filter((i) => i.name === name).reduce((s, i) => s + i.count, 0);
  }
  countMatch(re) {
    return this.bot.inventory.items().filter((i) => re.test(i.name)).reduce((s, i) => s + i.count, 0);
  }
  item(name) { return this.bot.inventory.items().find((i) => i.name === name); }
  freeSlots() { return this.bot.inventory.emptySlotCount(); }

  async equip(name) {
    const it = this.item(name);
    if (!it) return false;
    try { await this.bot.equip(it, 'hand'); return true; } catch (_) { return false; }
  }

  async tossAll(names, keep = {}) {
    for (const name of names) {
      let extra = this.count(name) - (keep[name] || 0);
      while (extra > 0) {
        const it = this.item(name);
        if (!it) break;
        const n = Math.min(extra, it.count);
        try { await this.bot.toss(it.type, null, n); } catch (_) { break; }
        extra -= n;
        await sleep(250);
      }
    }
  }

  // ------------------------------------------------------------------ movement / world
  async goto(pos, range = 1, timeout = 60000) {
    const { GoalNear } = goals;
    try {
      await withTimeout(this.bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, range)), timeout, 'путь');
      return true;
    } catch (e) {
      this.bot.pathfinder.setGoal(null);
      log.debug(this.name, `не дошёл до ${pos}: ${e.message}`);
      return false;
    }
  }

  async gotoBlock(pos, timeout = 30000) {
    try {
      await withTimeout(this.bot.pathfinder.goto(new goals.GoalBlock(pos.x, pos.y, pos.z)), timeout, 'путь');
      return true;
    } catch (e) {
      this.bot.pathfinder.setGoal(null);
      return false;
    }
  }

  find(names, maxDistance = 32, count = 64, extra = null) {
    const reg = this.bot.registry;
    const ids = names.map((n) => reg.blocksByName[n] && reg.blocksByName[n].id).filter((x) => x !== undefined);
    const positions = this.bot.findBlocks({ matching: ids, maxDistance, count: extra ? count * 4 : count });
    if (!extra) return positions;
    return positions.filter((p) => extra(this.bot.blockAt(p))).slice(0, count);
  }

  async equipBestFor(block) {
    try {
      const tool = this.bot.pathfinder.bestHarvestTool(block);
      if (tool) await this.bot.equip(tool, 'hand');
    } catch (_) { /* hand */ }
  }

  async dig(pos) {
    const block = this.bot.blockAt(pos);
    if (!block || block.name === 'air' || !this.bot.canDigBlock(block)) return false;
    await this.equipBestFor(block);
    try { await withTimeout(this.bot.dig(block, true), 20000, 'копание'); return true; } catch (e) { log.debug(this.name, `не выкопал ${block.name}: ${e.message}`); return false; }
  }

  /** Walks over dropped items nearby so they get picked up. */
  async collectDrops(radius = 8, max = 20) {
    for (let i = 0; i < max; i++) {
      const bot = this.bot;
      const drops = Object.values(bot.entities).filter((e) => (e.name === 'item' || e.type === 'object' && e.objectType === 'Item') && e.position.distanceTo(bot.entity.position) < radius);
      if (!drops.length) return;
      drops.sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));
      const d = drops[0];
      const ok = await this.goto(d.position.floored(), 0.6, 8000);
      await sleep(250);
      if (!ok) return;
    }
  }

  /** Places an item from the inventory onto the face of a neighbouring block. */
  async placeAt(target, itemName, preferRef = null) {
    const bot = this.bot;
    const cur = bot.blockAt(target);
    if (cur && cur.name !== 'air' && cur.name !== 'cave_air' && !cur.name.includes('grass') && cur.boundingBox === 'block') return true;
    const dirs = [new Vec3(0, -1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, 1, 0)];
    const refs = preferRef ? [preferRef] : dirs.map((d) => target.plus(d));
    for (const rp of refs) {
      const ref = bot.blockAt(rp);
      if (!ref || ref.boundingBox !== 'block') continue;
      if (!(await this.equip(itemName))) return false;
      const face = target.minus(rp);
      try {
        await withTimeout(bot.placeBlock(ref, face), 5000, 'установка блока');
        return true;
      } catch (e) {
        const now = bot.blockAt(target);
        if (now && now.name !== 'air') return true; // placed, the event was just late
        log.debug(this.name, `не поставил ${itemName} на ${target}: ${e.message}`);
      }
    }
    return false;
  }

  /** Jumps and puts a block under itself: one block higher. */
  async pillarUp(itemName = 'dirt') {
    const bot = this.bot;
    if (!(await this.equip(itemName))) return false;
    const startY = Math.floor(bot.entity.position.y);
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0).floored());
    await bot.look(bot.entity.yaw, -Math.PI / 2, true);
    bot.setControlState('jump', true);
    const t0 = Date.now();
    while (bot.entity.position.y < startY + 1.05 && Date.now() - t0 < 1500) await sleep(30);
    try {
      await withTimeout(bot.placeBlock(below, new Vec3(0, 1, 0)), 3000, 'столб');
    } catch (_) { /* checked below */ }
    bot.setControlState('jump', false);
    await sleep(350);
    const ok = Math.floor(bot.entity.position.y) >= startY + 1;
    if (!ok) log.debug(this.name, 'не получилось подняться столбом');
    return ok;
  }

  /** Digs the block under its feet and falls one block down. */
  async digDown() {
    const bot = this.bot;
    const startY = Math.floor(bot.entity.position.y);
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0).floored());
    if (!below || below.name === 'air') return true;
    await this.equipBestFor(below);
    try { await withTimeout(bot.dig(below, true), 10000, 'копание вниз'); } catch (_) { return false; }
    const t0 = Date.now();
    while (Math.floor(bot.entity.position.y) >= startY && Date.now() - t0 < 2500) await sleep(50);
    await sleep(200);
    return Math.floor(bot.entity.position.y) < startY;
  }

  /** Switches between careful walking (on the farm) and normal walking (in the wild). */
  careful(on) {
    if (!this.bot || !this.bot.pathfinder || !this.safeMovements) return;
    this.bot.pathfinder.setMovements(on ? this.safeMovements : this.movements);
  }

  /** Puts items into chests at the given positions. Returns how many were stored. */
  async depositTo(chestPositions, names, keep = {}) {
    const bot = this.bot;
    let stored = 0;
    for (const p of chestPositions) {
      const left = names.some((n) => this.count(n) > (keep[n] || 0));
      if (!left) break;
      const b = bot.blockAt(p);
      if (!b || !/chest/.test(b.name)) continue;
      if (bot.entity.position.distanceTo(p) > 4 && !(await this.goto(p, 2, 30000))) continue;
      let chest;
      try { chest = await withTimeout(bot.openContainer(b), 6000, 'сундук'); } catch (_) { continue; }
      for (const n of names) {
        let extra = this.count(n) - (keep[n] || 0);
        while (extra > 0) {
          const it = this.item(n);
          if (!it) break;
          const c = Math.min(extra, it.count);
          try { await chest.deposit(it.type, null, c); } catch (_) { extra = 0; break; }
          stored += c; extra -= c;
        }
      }
      chest.close();
      await sleep(300);
    }
    return stored;
  }

  /** Takes items out of chests until the inventory is nearly full. Returns how many were taken. */
  async withdrawFrom(chestPositions, names, leaveFree = 2) {
    const bot = this.bot;
    let taken = 0;
    for (const p of chestPositions) {
      if (this.freeSlots() <= leaveFree) break;
      const b = bot.blockAt(p);
      if (!b || !/chest/.test(b.name)) continue;
      if (bot.entity.position.distanceTo(p) > 4 && !(await this.goto(p, 2, 30000))) continue;
      let chest;
      try { chest = await withTimeout(bot.openContainer(b), 6000, 'сундук'); } catch (_) { continue; }
      for (const it of chest.containerItems()) {
        if (!names.includes(it.name) || this.freeSlots() <= leaveFree) continue;
        try { await chest.withdraw(it.type, null, it.count); taken += it.count; } catch (_) { /* full */ }
      }
      chest.close();
      await sleep(300);
    }
    return taken;
  }

  /** Eats something when hungry (berries count too). */
  async maybeEat(threshold = 14) {
    const bot = this.bot;
    if (!bot || !bot.entity || bot.food >= threshold || this.eating) return;
    const foods = ['golden_carrot', 'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'bread', 'baked_potato', 'apple', 'carrot', 'sweet_berries'];
    const it = bot.inventory.items().find((i) => foods.includes(i.name));
    if (!it) return;
    this.eating = true;
    try { await bot.equip(it, 'hand'); await withTimeout(bot.consume(), 6000, 'еда'); } catch (_) { /* ignore */ }
    this.eating = false;
  }

  /** Steps out of berry bushes (they hurt) when health gets low. */
  async escapeBushes() {
    const bot = this.bot;
    const near = this.find(['sweet_berry_bush'], 2, 10);
    if (!near.length) return;
    const p = bot.entity.position;
    const avg = near.reduce((a, b) => a.plus(b), new Vec3(0, 0, 0)).scaled(1 / near.length).offset(0.5, 0, 0.5);
    const away = p.minus(avg);
    bot.pathfinder.setGoal(null);
    await bot.look(Math.atan2(-away.x, -away.z), 0, true);
    bot.setControlState('forward', true);
    bot.setControlState('jump', true);
    await sleep(1400);
    bot.clearControlStates();
    this.say('выбрался из кустов');
  }

  /** A simple status line for the console dashboard. */
  summary() {
    if (!this.bot || !this.bot.entity) return `${this.name}: ${this.status}`;
    const p = this.bot.entity.position;
    return `${this.name} (${this.role}): ${this.status} | бамбук ${this.count('bamboo')}, ягоды ${this.count('sweet_berries')}, земля ${this.count('dirt')} | ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}`;
  }
}

module.exports = { Worker };
