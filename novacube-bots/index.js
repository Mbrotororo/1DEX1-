// 1DEX1 helper bots for play.novacube.fun
// Start: double-click start.bat (Windows) or run "node index.js".
const fs = require('fs');
const path = require('path');
const { Worker } = require('./lib/worker');
const log = require('./lib/log');
const { sleep, randomPassword } = require('./lib/util');

const DIR = process.env.BOTS_DIR || __dirname;   // where config.json, accounts.json and state.json live
const cfgPath = path.join(DIR, 'config.json');
if (!fs.existsSync(cfgPath)) fs.copyFileSync(path.join(__dirname, 'config.example.json'), cfgPath);
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

// every bot gets its own password once, kept in accounts.json on this computer
const accPath = path.join(DIR, 'accounts.json');
const accounts = fs.existsSync(accPath) ? JSON.parse(fs.readFileSync(accPath, 'utf8')) : {};
for (const b of cfg.bots) if (!accounts[b.name]) accounts[b.name] = randomPassword();
fs.writeFileSync(accPath, JSON.stringify(accounts, null, 2));

const statePath = path.join(DIR, 'state.json');
const team = {
  names: new Set([cfg.main.name, ...cfg.bots.map((b) => b.name)]),
  workers: new Map(),
  state: fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {},
  save() { fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2)); },
};

const seeds = require('./roles/seeds');
const ROLES = {
  berries: seeds,
  bamboo: seeds,
  lumberjack: require('./roles/lumberjack'),
  digger: require('./roles/digger'),
  smith: require('./roles/smith'),
  builder: require('./roles/builder'),
  planter: require('./roles/planter'),
  miner: require('./roles/miner'),
  main: require('./roles/main'),
};

async function runRole(w) {
  const role = ROLES[w.role];
  if (!role) { w.say(`неизвестная роль "${w.role}"`); return; }
  for (;;) {
    try {
      await role.run(w);
    } catch (e) {
      log.line(w.name, `ошибка в работе: ${e.message} — начинаю заново`);
      log.debug(w.name, e.stack || String(e));
      try { w.bot && w.bot.pathfinder && w.bot.pathfinder.setGoal(null); } catch (_) { /* ignore */ }
      await sleep(5000);
    }
  }
}

async function main() {
  log.line('1DEX1', `сервер ${cfg.server.host}:${cfg.server.port}, ботов: ${cfg.bots.length}. Лог: ${log.file}`);
  const list = cfg.bots.map((b) => ({ name: b.name, role: b.role, password: accounts[b.name] }));
  if (cfg.main.controlledByBot) {
    if (!cfg.main.password) {
      log.line('1DEX1', `чтобы ${cfg.main.name} был ботом, впиши его пароль в config.json (main.password)`);
    } else {
      list.unshift({ name: cfg.main.name, role: 'main', password: cfg.main.password });
    }
  }
  for (const acc of list) {
    const w = new Worker(cfg, acc, team);
    team.workers.set(acc.name, w);
    w.start();
    runRole(w);
    await sleep((cfg.joinDelaySec || 8) * 1000);
  }
  // watchdog: if some code ever hogs the program, say so in the log (the bots would time out otherwise)
  let last = Date.now();
  setInterval(() => {
    const lag = Date.now() - last - 1000;
    if (lag > 3000) log.line('1DEX1', `программа подвисла на ${Math.round(lag / 1000)} с`);
    last = Date.now();
  }, 1000);
  // a bot that has been doing the same thing for minutes is stuck somewhere: say where
  setInterval(() => {
    for (const w of team.workers.values()) {
      if (!w.actAt || !w.ready) continue;
      const min = (Date.now() - w.actAt) / 60000;
      if (min > 4 && (!w.stallSaid || Date.now() - w.stallSaid > 300000)) {
        w.stallSaid = Date.now();
        log.line(w.name, `давно ничего не меняется (${Math.round(min)} мин): ${w.actWhat}`);
      }
    }
  }, 60000);
  // status board every minute
  setInterval(() => {
    const lines = [...team.workers.values()].map((w) => '  ' + w.summary());
    const site = team.state.site;
    let f = 'место под фермы ещё не выбрано';
    if (site) {
      const ru = { bamboo: 'бамбук', sweet_berries: 'ягоды' };
      const floors = site.farms.map((fm) => `${ru[fm.plant] || fm.plant} ${((team.state.built || {})[fm.id] || []).length}/${site.F}`).join(', ');
      const st = team.state.stored || {};
      f = `фермы ${site.x} ${site.y} ${site.z} | этажи: ${floors} | хранилище: ${team.state.storagePairs || 0} двойных сундуков | ` +
        `сложено: бамбук ${st.bamboo || 0}, ягоды ${st.sweet_berries || 0}`;
    }
    console.log(`\n\x1b[1m── 1DEX1 боты ─ ${new Date().toTimeString().slice(0, 5)} ─ ${f}\x1b[0m\n${lines.join('\n')}\n`);
  }, 60000);
}

process.on('SIGINT', () => {
  log.line('1DEX1', 'останавливаю ботов');
  for (const w of team.workers.values()) { w.stopped = true; try { w.bot.quit(); } catch (_) { /* ignore */ } }
  setTimeout(() => process.exit(0), 1500);
});
process.on('unhandledRejection', (e) => log.debug('1DEX1', `unhandled: ${e && e.stack ? e.stack : e}`));

main();
