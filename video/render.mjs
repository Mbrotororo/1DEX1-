// Renders a clip frame by frame in headless Chromium and pipes the frames into ffmpeg.
//   node render.mjs <clip> video [fps]          -> out/<clip>.mp4 (1920x1080)
//   node render.mjs <clip> stills t1 t2 ...      -> out/<clip>_<t>.png
//   node render.mjs <clip> sheet [n]            -> out/<clip>_sheet.png (n frames in a grid)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';

const [, , clip, mode = 'video', ...rest] = process.argv;
const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[page error]', e.message));
await page.goto(`http://localhost:${port}/index.html?clip=${clip}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 180000 });
const dur = await page.evaluate(() => window.DURATION);
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
const shot = async (t) => {
  await page.evaluate(t => window.renderAt(t), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
};

if (mode === 'stills' || mode === 'sheet') {
  let times = rest.map(Number);
  if (mode === 'sheet') { const n = +(rest[0] || 12); times = Array.from({ length: n }, (_, i) => +(dur * (i + 0.5) / n).toFixed(2)); }
  const files = [];
  for (const t of times) {
    const f = path.join(root, 'out', `${clip}_${t.toFixed(2)}.png`);
    fs.writeFileSync(f, await shot(t));
    files.push(f);
    console.log('still', t, f);
  }
  if (mode === 'sheet') {
    const cols = 4;
    const args = [];
    files.forEach(f => args.push('-i', f));
    const rows = Math.ceil(files.length / cols);
    const scaled = files.map((_, i) => `[${i}:v]scale=480:270,drawtext=text='${times[i]}s':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`).join(';');
    const inputs = files.map((_, i) => `[v${i}]`).join('');
    const out = path.join(root, 'out', `${clip}_sheet.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', `${scaled};${inputs}xstack=inputs=${files.length}:layout=${Array.from({ length: files.length }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}:fill=black`, out]);
    files.forEach(f => fs.unlinkSync(f));
    console.log('sheet', out, rows + 'x' + cols);
  }
} else {
  const fps = +(rest[0] || 60);
  const n = Math.round(dur * fps);
  const out = path.join(root, 'out', `${clip}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await shot(i / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('video', out, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await browser.close();
server.close();
