const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
function withTimeout(promise, ms, what = 'операция') {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`таймаут: ${what}`)), ms); })
  ]);
}
function randomPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
module.exports = { sleep, fmt, withTimeout, randomPassword };
