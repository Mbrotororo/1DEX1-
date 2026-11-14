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

const ROLES = {
  farmer: require('./roles/farmer'),
  scout: require('./roles/scout'),
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
  // status board every minute
  setInterval(() => {
    const lines = [...team.workers.values()].map((w) => '  ' + w.summary());
    const farm = team.state.farm;
    const f = farm ? `ферма ${farm.x} ${farm.y} ${farm.z}: этажей ${farm.built}/${cfg.farm.plants.length}, собрано растений ${team.state.harvested || 0}` : 'ферма ещё не построена';
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
