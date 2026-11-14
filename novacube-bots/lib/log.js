const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `bots-${new Date().toISOString().slice(0, 10)}.log`);
const COLORS = [36, 33, 35, 32, 34, 91, 96, 93];
const colorOf = {};
let next = 0;
function line(who, msg) {
  if (!(who in colorOf)) colorOf[who] = COLORS[next++ % COLORS.length];
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`\x1b[90m${time}\x1b[0m \x1b[${colorOf[who]}m[${who}]\x1b[0m ${msg}`);
  fs.appendFileSync(file, `${time} [${who}] ${msg}\n`);
}
function debug(who, msg) {
  fs.appendFileSync(file, `${new Date().toTimeString().slice(0, 8)} [${who}] (debug) ${msg}\n`);
}
module.exports = { line, debug, file };
