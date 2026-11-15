// Clip "bots" (18 s): ten grey bots from one IP get locked out of the server, merge into one 1DEX1 who walks in.
//   0.0-4.5  ten bots with name tags walk in a row toward the huge server gate        plate "ПЛАН: 10 БОТОВ"
//   4.5-7.0  a glowing "1 IP" label above them, glowing lines down to every bot       plate "ВСЕ С ОДНОГО IP"
//   7.0-10.5 the portcullis slams, the bots bounce back one by one with a red X,
//            then a Minecraft disconnect screen for 1.5 s, then back to the scene    plate "10 БОТОВ НЕ ПУСТИЛИ"
//  10.5-14.0 the bots whirl into one glowing point, flash, 1DEX1 lands, counter "10 → 1"
//  14.0-18.0 he turns, the gate opens by itself, he walks in, toast "Подключено",
//            the berries of every row fly to him (he harvests for ten)                plate "1 БОТ ЗА ДЕСЯТЕРЫХ"
// Everything in update() is computed from t alone.
export const DURATION = 18;

let E, T;
const W = 1920, H = 1080;

// ------------------------------------------------------------------ layout and timing
const N = 10;
const SPACING = 1.35;            // distance between bots in the row (x)
const Z0 = 3.5;                  // row start (z of the front-most bot at t=0), far enough from the gate for the orbit
const V = 2.68;                  // walking speed, blocks/s (the first bot reaches the bars at 7.26 s)
const DZS = [0.55, 1.35, 0.2, 0.95, 0.0, 1.55, 0.4, 1.15, 0.75, 1.7].map(d => d * 1.3);   // row stagger: who hits first
const DZM = DZS.reduce((a, b) => a + b, 0) / DZS.length;
const ZHIT = -15.95;             // where a bot runs into the bars
const BOUNCE = 3.2;              // how far a bot is thrown back
const ZREST = ZHIT + BOUNCE;     // where they stand after the bounce
const GATE_Z = -16.45;           // the portcullis plane
const GATE_OPEN_Y = 6.4;         // portcullis raised (its bottom)
const SLAM = 7.0;                // portcullis starts to fall
const SLAM_HIT = 7.13;           // ... and hits the ground
const MERGE_C = [0, 3.0, -12.4]; // where the bots fly together
const ZF = 0.32;                 // the whirl is flattened in z (stays well in front of the bars)
const FLASH_T = 12.12;           // the merge flash
const LAND = FLASH_T + 0.32;     // the hero lands
const HERO_Z0 = -12.4, HERO_Z1 = -11.0;
const HERO_STEP0 = 12.62, HERO_STEP1 = 13.3;
const TURN0 = 13.75, TURN1 = 14.15;
const HERO_V = 3.3;              // walking speed toward the gate
const OPEN0 = 14.2, OPEN1 = 15.3;
const SCREEN0 = 8.55, SCREEN1 = 10.05;   // the disconnect screen
const IP_Y = 8.7;                // height of the "1 IP" label

const bots = [];
let hero, portcullis, orb, core, beam, ring, rays, berries;
const fx = {};
const ui = {};

// ------------------------------------------------------------------ small helpers
let V3;
function proj(x, y, z) {
  V3.set(x, y, z).project(E.camera);
  return { x: (V3.x + 1) * W / 2, y: (1 - V3.y) * H / 2, ok: V3.z < 1 && V3.z > -1 };
}
/** Pixels per world unit at distance d from the camera. */
function ppu(x, y, z) {
  const d = E.camera.position.distanceTo(V3.set(x, y, z));
  return H / (2 * d * Math.tan(E.camera.fov * Math.PI / 360));
}
const smooth = (t, t0, t1, f = 'inOut') => E.ease[f](E.seg(t, t0, t1));
const mix3 = (a, b, k) => [E.lerp(a[0], b[0], k), E.lerp(a[1], b[1], k), E.lerp(a[2], b[2], k)];
/** A smooth start: 0 before t0, then accelerates (smoothstep velocity) to slope 1 at t1 and keeps it. */
function ramp(t, t0, t1) {
  if (t <= t0) return 0;
  const d = t1 - t0;
  if (t >= t1) return d * 0.5 + (t - t1);
  const x = (t - t0) / d;
  return d * (x * x * x - x * x * x * x / 2);
}
/** Cubic Hermite from p0 (velocity v0) to p1 (velocity v1) over dt, s in 0..1. */
function herm(p0, p1, v0, v1, s, dt) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * dt * v0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * dt * v1;
}
/**
 * Smooth monotone curve through keys [[t, value], ...] (Fritsch-Carlson, C1, no overshoot).
 * The ends keep the slope of their segment, so motion never starts or ends at a dead stop unless asked.
 */
function curve(keys) {
  const n = keys.length, ts = keys.map(k => k[0]), vs = keys.map(k => k[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]));
  const m = new Array(n);
  m[0] = keys[0][2] ?? d[0];
  m[n - 1] = keys[n - 1][2] ?? d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (keys[i][2] !== undefined) { m[i] = keys[i][2]; continue; }
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = ts[i] - ts[i - 1], h1 = ts[i + 1] - ts[i];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return t => {
    if (t <= ts[0]) return vs[0] + m[0] * (t - ts[0]);
    if (t >= ts[n - 1]) return vs[n - 1] + m[n - 1] * (t - ts[n - 1]);
    let i = 0;
    while (t > ts[i + 1]) i++;
    const dt = ts[i + 1] - ts[i];
    return herm(vs[i], vs[i + 1], m[i], m[i + 1], (t - ts[i]) / dt, dt);
  };
}
/** The same for 3-vectors: keys [[t, [x,y,z]], ...]. */
function curve3(keys) {
  const c = [0, 1, 2].map(j => curve(keys.map(k => [k[0], k[1][j]])));
  return t => [c[0](t), c[1](t), c[2](t)];
}

function el(tag, style = {}, html = '') {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (html) e.innerHTML = html;
  E.ui.appendChild(e);
  return e;
}
/**
 * Places a pixel-font element with its centre at (cx, cy) on whole pixels, so the 8-px font grid stays sharp.
 * s is a scale (only during pop animations; exactly 1 when resting).
 */
function placePix(e, cx, cy, s = 1, origin = 'center') {
  const w = e.offsetWidth, h = e.offsetHeight;
  e.style.left = Math.round(cx - w / 2) + 'px';
  e.style.top = Math.round(cy - (origin === 'bottom' ? h : h / 2)) + 'px';
  e.style.transformOrigin = origin === 'bottom' ? '50% 100%' : '50% 50%';
  e.style.transform = s === 1 ? 'none' : `scale(${s})`;
}
/** Pop animation for pixel elements (like E.popIn, but resting at exactly scale 1). Returns {s, o}. */
function popPix(t, t0, t1 = 1e9, dur = 0.35, out = 0.22) {
  if (t < t0 || t > t1 + out) return { s: 1, o: 0 };
  if (t < t0 + dur) { const k = E.seg(t, t0, t0 + dur); return { s: Math.max(0.01, E.ease.outBack(k)), o: E.clamp(k * 3) }; }
  if (t > t1) { const k = E.seg(t, t1, t1 + out); return { s: 1 + k * 0.15, o: 1 - k }; }
  return { s: 1, o: 1 };
}

// ------------------------------------------------------------------ textures made here
function makeTextures() {
  const { pixelTex } = E;
  const jit = (b, r, a) => b.map(v => Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * a))));
  // stone bricks
  E.tex.bricks = pixelTex(16, 16, (x, y, r) => {
    const row = y >> 2, off = row % 2 ? 4 : 0;
    if (y % 4 === 3 || (x + off) % 8 === 7) return jit([78, 78, 80], r, 8);
    if (y % 4 === 0 || (x + off) % 8 === 0) return jit([150, 150, 152], r, 8);
    return jit([122, 122, 124], r, 12);
  }, 101);
  // oak log side and leaves
  E.tex.log = pixelTex(16, 16, (x, y, r) => jit(x % 4 === 0 ? [74, 56, 32] : [104, 82, 50], r, 14), 102);
  E.tex.leaves = pixelTex(16, 16, (x, y, r) => {
    const v = r();
    if (v < 0.12) return jit([34, 74, 26], r, 10);
    if (v < 0.25) return jit([88, 150, 58], r, 12);
    return jit([58, 118, 40], r, 16);
  }, 103);
  // dirt path
  E.tex.path = pixelTex(16, 16, (x, y, r) => jit([[148, 122, 74], [138, 112, 66], [160, 132, 82], [126, 102, 60]][Math.floor(r() * 4)], r, 8), 104);
  // glowstone (lit windows in the towers)
  E.tex.glowstone = pixelTex(16, 16, (x, y, r) => {
    const v = r();
    if (v < 0.18) return jit([142, 98, 48], r, 14);
    if (v < 0.45) return jit([214, 160, 84], r, 14);
    if (v < 0.8) return jit([252, 214, 132], r, 12);
    return jit([255, 246, 206], r, 8);
  }, 105);
}

/** Sign "СЕРВЕР" over the gate: a dark board with glowing yellow pixel letters. */
function makeSign() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3a2614'; g.fillRect(0, 0, 1024, 256);
  for (let y = 0; y < 256; y += 32) { g.fillStyle = y % 64 ? '#4a3119' : '#432c16'; g.fillRect(0, y, 1024, 30); }
  g.fillStyle = '#21140a'; g.fillRect(0, 0, 1024, 14); g.fillRect(0, 242, 1024, 14); g.fillRect(0, 0, 14, 256); g.fillRect(1010, 0, 14, 256);
  g.font = '120px Pixel';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#7a3d00'; g.fillText('СЕРВЕР', 512 + 10, 138 + 10);
  g.shadowColor = 'rgba(255,220,80,0.9)'; g.shadowBlur = 26;
  g.fillStyle = '#ffd84a'; g.fillText('СЕРВЕР', 512, 138);
  g.shadowBlur = 0;
  g.fillStyle = '#fff6b8'; g.fillText('СЕРВЕР', 512, 134);
  g.fillStyle = '#ffd84a'; g.fillText('СЕРВЕР', 512, 138);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(120,240,255,0.55)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(0.5, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** Light rays (a sunburst fading out from the centre). */
function raysTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, w = (i % 2 ? 0.035 : 0.06);
    g.beginPath(); g.moveTo(0, 0);
    g.arc(0, 0, 256, a - w, a + w);
    g.closePath();
    g.fillStyle = i % 2 ? 'rgba(170,240,255,0.7)' : 'rgba(255,255,255,1)';
    g.fill();
  }
  g.globalCompositeOperation = 'destination-in';
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(-256, -256, 512, 512);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ world
let bushList = [];
function buildWorld() {
  const S = E.scene;
  S.background = E.skyGradient([[0, '#3f8cf2'], [0.5, '#8cc6ff'], [1, '#dff1ff']]);
  S.fog = new T.Fog(0xcfe7ff, 50, 140);
  fx.hemi = new T.HemisphereLight(0xe2f2ff, 0x6c8c4c, 1.35);
  S.add(fx.hemi);
  const sun = E.sun(0xfff0d0, 2.4, [26, 40, 12], 34);
  sun.target.position.set(0, 0, -10);
  fx.fill = new T.DirectionalLight(0xdfeeff, 0.4);
  fx.fill.position.set(-12, 14, -40);
  S.add(fx.fill);
  // the end: a soft key light from behind the camera, so he does not walk into the farm in the wall's shadow
  fx.endLight = new T.DirectionalLight(0xfff1dc, 0);
  fx.endLight.position.set(6, 16, 10);
  fx.endLight.target.position.set(0, 0, -26);
  S.add(fx.endLight); S.add(fx.endLight.target);
  fx.heroLight = new T.PointLight(0xfff0d8, 0, 9, 1.6);
  S.add(fx.heroLight);

  // ground (top surface at y=0) with a dirt path through the gate, drawn as textured planes (one tile = one block)
  const ground = (texKey, x0, x1, z0, z1) => {
    const tx = E.tex[texKey].clone();
    tx.wrapS = tx.wrapT = T.RepeatWrapping;
    tx.repeat.set(x1 - x0, z1 - z0);
    tx.needsUpdate = true;
    const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshLambertMaterial({ map: tx }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    S.add(m);
  };
  ground('grassTop', -44, -2, -64, 40);
  ground('grassTop', 2, 44, -64, 40);
  ground('path', -2, 2, -64, 40);

  // wall (cobble) left and right, towers (stone bricks) with lit glowstone windows, a bridge over the opening
  const cobble = [], bricks = [], stone = [], glow = [];
  for (let x = -44; x < 44; x++) {
    if (x >= -11 && x < 11) continue;
    for (let y = 0; y < 10; y++) for (let z = -18; z < -16; z++) cobble.push([x, y, z]);
    if ((x & 1) === 0) cobble.push([x, 10, -17]);
  }
  for (const x0 of [-11, 7]) {
    for (let x = x0; x < x0 + 4; x++) for (let y = 0; y < 16; y++) for (let z = -19; z < -15; z++) {
      const edge = x === x0 || x === x0 + 3 || z === -19 || z === -16;
      if (!edge && y > 0 && y < 15) continue;   // hollow inside
      const window = z === -16 && (x === x0 + 1 || x === x0 + 2) && (y === 5 || y === 11);
      (window ? glow : bricks).push([x, y, z]);
    }
    for (let x = x0; x < x0 + 4; x++) for (const z of [-19, -16]) if (((x - x0) & 1) === 0) bricks.push([x, 16, z]);
  }
  for (let x = -7; x < 7; x++) {
    for (let y = 9; y < 16; y++) for (let z = -18; z < -16; z++) (y === 9 ? stone : bricks).push([x, y, z]);
    if ((x & 1) === 0) bricks.push([x, 16, -17]);
  }
  S.add(E.blocks('cobble', cobble));
  S.add(E.blocks('bricks', bricks));
  S.add(E.blocks('stone', stone));
  const glowMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ map: E.tex.glowstone }), glow.length);
  glow.forEach((p, i) => E.setInstance(glowMesh, i, p[0] + 0.5, p[1] + 0.5, p[2] + 0.5, 1));
  S.add(glowMesh);
  // a soft halo in front of each window
  const haloMat = new T.SpriteMaterial({ map: glowTexture('rgba(255,224,140,0.55)', 'rgba(255,190,90,0.22)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const x0 of [-11, 7]) for (const y of [5, 11]) {
    const h = new T.Sprite(haloMat);
    h.position.set(x0 + 2, y + 0.5, -14.85);
    h.scale.set(3.6, 2.6, 1);
    S.add(h);
  }

  // sign "СЕРВЕР" on the bridge
  const st = makeSign();
  const signMesh = new T.Mesh(new T.PlaneGeometry(11.6, 2.9), new T.MeshBasicMaterial({ map: st, toneMapped: false }));
  signMesh.position.set(0, 12.5, -15.87);
  S.add(signMesh);
  const frame = new T.Mesh(new T.BoxGeometry(12.2, 3.5, 0.2), E.mat(E.tex.planks));
  frame.position.set(0, 12.5, -16.0);
  S.add(frame);

  // portcullis: dark iron bars with spikes
  portcullis = new T.Group();
  const iron = new T.MeshLambertMaterial({ color: 0x3d4048 });
  const ironLight = new T.MeshLambertMaterial({ color: 0x5d616b });
  const vb = new T.BoxGeometry(0.24, 9.4, 0.24), hb = new T.BoxGeometry(14, 0.26, 0.2);
  for (let i = 0; i < 14; i++) {
    const b = new T.Mesh(vb, iron); b.position.set(-6.5 + i, 4.7, 0); b.castShadow = true; portcullis.add(b);
    const sp = new T.Mesh(new T.ConeGeometry(0.2, 0.55, 4), ironLight); sp.rotation.x = Math.PI; sp.position.set(-6.5 + i, -0.1, 0); portcullis.add(sp);
  }
  for (const y of [1.2, 3.4, 5.6, 7.8]) { const b = new T.Mesh(hb, iron); b.position.set(0, y, 0.12); b.castShadow = true; portcullis.add(b); }
  portcullis.position.set(0, GATE_OPEN_Y, GATE_Z);
  S.add(portcullis);

  // trees outside and inside
  const logs = [], leaves = [];
  const tree = (x, z, hgt = 5) => {
    for (let y = 0; y < hgt; y++) logs.push([x, y, z]);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = hgt - 2; y < hgt; y++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (dx === 0 && dz === 0) continue;
      leaves.push([x + dx, y, z + dz]);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = hgt; y < hgt + 2; y++) {
      if (y === hgt + 1 && Math.abs(dx) + Math.abs(dz) === 2) continue;
      leaves.push([x + dx, y, z + dz]);
    }
  };
  TREES.forEach(a => tree(...a));
  S.add(E.blocks('log', logs));
  S.add(E.blocks('leaves', leaves));

  // inside: rows of berry bushes on both sides of the path, chests
  const bushes = [];
  for (let z = -24; z >= -52; z -= 2) for (let x = -12; x <= 11; x++) {
    if (x >= -3 && x <= 2) continue;
    if ((x + 20) % 4 === 3) continue;
    bushes.push([x, 0, z]);
  }
  bushList = bushes;
  S.add(E.plants(E.tex.bush, bushes));
  for (const [x, z] of [[-4, -21], [3, -21]]) { const c = E.chest(); c.position.set(x + 0.5, 0, z + 0.5); S.add(c); }
}
const TREES = [[-16, 4, 5], [-22, -6, 6], [-27, 12, 5], [-15, 20, 6], [24, 9, 6], [24, -5, 5], [28, 16, 6], [15, 26, 5],
  [-20, -34, 6], [21, -38, 5], [-13, -46, 6], [12, -50, 5], [0, -58, 6], [-24, -50, 5], [26, -54, 6], [-6, -62, 5],
  [7, -63, 6], [-30, -26, 6], [31, -28, 5], [-17, -60, 6], [18, -61, 5]];

// ------------------------------------------------------------------ bots and hero
function buildCharacters() {
  const r = E.rng(77);
  const orderByHit = DZS.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
  const mergeOrder = [0, 9, 1, 8, 2, 7, 3, 6, 4, 5];   // outermost first
  for (let i = 0; i < N; i++) {
    const rig = E.makePlayer(E.tex.botSkin, { slim: false, overlay: false });
    E.scene.add(rig.root);
    const o = mergeOrder.indexOf(i);
    bots.push({
      rig, i, x: (i - (N - 1) / 2) * SPACING, dz: DZS[i], ph: r() * 6.28,
      th: (Z0 + DZS[i] - ZHIT) / V,
      hitOrder: orderByHit.indexOf(i),
      ts: 10.5 + o * 0.045, ta: 11.25 + o * 0.085,
    });
  }
  hero = E.makePlayer(E.tex.skin, { slim: true });
  E.scene.add(hero.root);

  // merge glow (a big soft ball and a white-hot core), light beam, shock ring, rays
  orb = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(110,236,255,0.6)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  E.scene.add(orb);
  core = new T.Sprite(new T.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.7)'), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
  E.scene.add(core);
  beam = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 40, 24, 1, true),
    new T.MeshBasicMaterial({ color: 0xc8fbff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
  beam.position.set(MERGE_C[0], 20, MERGE_C[2]);
  E.scene.add(beam);
  rays = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
    map: raysTexture(), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
  E.scene.add(rays);
  ring = new T.Mesh(new T.RingGeometry(0.85, 1.15, 64),
    new T.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MERGE_C[0], 0.06, MERGE_C[2]);
  E.scene.add(ring);

  // particles
  const dustCols = [0x8a8a8a, 0xa8a8a8, 0x6e6e6e, 0x9a8466, 0xc2b8a3];
  fx.dust = [-6, -3, 0, 3, 6].map((x, k) => E.burst({ center: [x, 0.3, GATE_Z + 0.4], count: 16, colors: dustCols, speed: 3.6, life: 1.0, size: 0.24, gravity: -3, seed: 40 + k, t0: SLAM_HIT, spread: 1.2 }));
  fx.hits = bots.map((b, k) => E.burst({ center: [b.x, 1.3, ZHIT - 0.25], count: 9, colors: [0xff3030, 0xffffff, 0xff8a8a], speed: 3.2, life: 0.5, size: 0.12, gravity: -6, seed: 60 + k, t0: b.th }));
  fx.merge = E.burst({ center: [MERGE_C[0], MERGE_C[1], MERGE_C[2]], count: 110, colors: [0xffffff, 0x9ff6ff, 0x46e8ff, 0xfff38a], speed: 6, life: 1.0, size: 0.11, gravity: -4, seed: 91, t0: FLASH_T, spread: 1.1 });
  fx.land = E.burst({ center: [0, 0.15, HERO_Z0], count: 18, colors: [0x9a8466, 0xc2b8a3, 0x8a8a8a], speed: 2.4, life: 0.6, size: 0.14, gravity: -5, seed: 99, t0: LAND, spread: 1.4 });
  fx.open = [-5, 0, 5].map((x, k) => E.burst({ center: [x, 6.6, GATE_Z + 0.5], count: 10, colors: dustCols, speed: 2.2, life: 0.9, size: 0.18, gravity: -6, seed: 120 + k, t0: OPEN0 + 0.05 }));

  // berries that fly out of the bushes into him at the end (instanced; every one a function of t)
  const rb = E.rng(321);
  const rows = [-24, -26, -28, -30, -32, -34];
  const list = [];
  for (let j = 0; j < 108; j++) {
    const row = j % rows.length;
    const cand = bushList.filter(p => p[2] === rows[row]);
    const p = cand[Math.floor(rb() * cand.length)];
    list.push({ x: p[0] + 0.5 + (rb() - 0.5) * 0.5, z: p[2] + 0.5, t0: 16.2 + row * 0.15 + rb() * 0.5, up: 0.9 + rb() * 0.8, side: (rb() - 0.5) * 1.2 });
  }
  berries = new T.InstancedMesh(new T.BoxGeometry(0.26, 0.26, 0.26), new T.MeshBasicMaterial({ color: 0xffffff }), list.length);
  const cols = [0xd81e2c, 0xff4a5a, 0xb0101c, 0xff7a86];
  list.forEach((b, i) => berries.setColorAt(i, new T.Color(cols[i % cols.length])));
  berries.userData.list = list;
  berries.frustumCulled = false;
  E.scene.add(berries);
}

// ------------------------------------------------------------------ overlays
const RED_X = [
  '.KK.....KK.',
  'KRRK...KRRK',
  'KRRRK.KRRRK',
  '.KRRRKRRRK.',
  '..KRRRRRK..',
  '...KRRRK...',
  '..KRRRRRK..',
  '.KRRRKRRRK.',
  'KRRRK.KRRRK',
  'KRRK...KRRK',
  '.KK.....KK.'];
const SIGNAL = [
  '..........GG',
  '..........GG',
  '.......GG.GG',
  '.......GG.GG',
  '....GG.GG.GG',
  '....GG.GG.GG',
  '.GG.GG.GG.GG',
  '.GG.GG.GG.GG',
  '.GG.GG.GG.GG'];

// name tags in the Minecraft font (5x7 glyphs, 1 px gap, shadow, translucent box), drawn once as tiny images and
// shown at whole-number scales 2 / 3 / 4, so they are always pixel-sharp (and the 8 is a real 8)
const MC_GLYPHS = {
  B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '.....', 'XXXXX'],
  0: ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'],
  1: ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
  2: ['.XXX.', 'X...X', '....X', '..XX.', '.X...', 'X....', 'XXXXX'],
  3: ['.XXX.', 'X...X', '....X', '..XX.', '....X', 'X...X', '.XXX.'],
  4: ['...XX', '..X.X', '.X..X', 'X...X', 'XXXXX', '....X', '....X'],
  5: ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
  6: ['..XX.', '.X...', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'],
  7: ['XXXXX', 'X...X', '....X', '...X.', '..X..', '..X..', '..X..'],
  8: ['.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'],
  9: ['.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '...X.', '.XX..'],
};
function tagImage(text, color, shadow) {
  const w = text.length * 6 + 1, h = 10;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, w, h);
  for (const [col, off] of [[shadow, 1], [color, 0]]) {
    g.fillStyle = col;
    [...text].forEach((ch, k) => (MC_GLYPHS[ch] || []).forEach((row, y) => [...row].forEach((v, x) => {
      if (v === 'X') g.fillRect(1 + k * 6 + x + off, 1 + y + off, 1, 1);
    })));
  }
  return { url: c.toDataURL(), w, h };
}
const TAG_SCALES = [2, 3, 4];
function buildUI() {
  // vignette
  el('div', { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)' });

  // name tags and red crosses
  const xUrl = E.pixelArt(RED_X, { K: '#2a0000', R: '#ff2a2a' }, 8);
  for (const b of bots) {
    const name = 'BOT_' + (b.i + 1);
    b.tagW = tagImage(name, '#ffffff', '#3f3f3f');
    b.tagR = tagImage(name, '#ff5555', '#3f1515');
    b.tag = el('img', { position: 'absolute', left: '0', top: '0', imageRendering: 'pixelated', opacity: 0, transformOrigin: '50% 100%' });
    b.tag.src = b.tagW.url;
    b.xMark = el('img', { position: 'absolute', left: '0', top: '0', imageRendering: 'pixelated', opacity: 0, filter: 'drop-shadow(0 0 10px rgba(255,40,40,0.9))' });
    b.xMark.src = xUrl;
  }

  // "1 IP" label with glowing lines
  const svgNS = 'http://www.w3.org/2000/svg';
  ui.svg = document.createElementNS(svgNS, 'svg');
  ui.svg.setAttribute('width', W); ui.svg.setAttribute('height', H);
  Object.assign(ui.svg.style, { position: 'absolute', left: 0, top: 0 });
  E.ui.appendChild(ui.svg);
  // each connection: a wide faint stroke, a medium one and a bright core (a glow without CSS filters, which are slow here)
  ui.lines = []; ui.dots = [];
  const LAYERS = [[22, 0.16], [11, 0.35], [4.5, 1]];
  for (let i = 0; i < N; i++) {
    const g = document.createElementNS(svgNS, 'g');
    const set = LAYERS.map(([w, o]) => {
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('stroke-width', w); ln.setAttribute('stroke-opacity', o); ln.setAttribute('stroke-linecap', 'round');
      g.appendChild(ln);
      return ln;
    });
    ui.svg.appendChild(g); ui.lines.push({ g, set });
    for (let j = 0; j < 2; j++) {
      const d = document.createElementNS(svgNS, 'rect');
      d.setAttribute('width', 12); d.setAttribute('height', 12); d.setAttribute('fill', '#ffffff');
      d.setAttribute('stroke', '#7ff3ff'); d.setAttribute('stroke-width', 6); d.setAttribute('stroke-opacity', 0.45);
      ui.svg.appendChild(d); ui.dots.push(d);
    }
  }
  ui.ip = el('div', {
    position: 'absolute', left: '0', top: '0', fontFamily: 'Pixel', fontSize: '64px', color: '#eaffff', lineHeight: 1, whiteSpace: 'nowrap',
    padding: '24px 32px 16px', background: 'rgba(6,26,36,0.88)', border: '6px solid #6ff0ff', borderRadius: '6px',
    boxShadow: '0 0 24px #46e8ff, 0 0 60px rgba(70,232,255,0.65), inset 0 0 18px rgba(70,232,255,0.45)',
    textShadow: '0 0 14px #46e8ff, 8px 8px 0 #0a3a48', opacity: 0,
  }, '<span>1</span><span style="margin-left:24px">IP</span>');

  // counter "10 → 1"
  ui.counter = el('div', {
    position: 'absolute', left: '0', top: '0', fontFamily: 'Pixel', fontSize: '112px', color: '#ffffff', lineHeight: 1, whiteSpace: 'nowrap',
    textShadow: E.outlineShadow(5, '#0b0b0b') + ', 14px 14px 0 #000, 0 0 40px rgba(255,255,255,0.35)', opacity: 0,
  });
  // the pixel font's "8" looks like an "S": the countdown shows this drawn 8 instead (same 14-px pixels, outline, shadow)
  {
    const G = ['.XXXXX.', 'XX...XX', 'XX...XX', '.XXXXX.', 'XX...XX', 'XX...XX', '.XXXXX.'];
    const c = document.createElement('canvas');
    c.width = c.height = 140;
    const g = c.getContext('2d');
    const each = f => G.forEach((row, y) => [...row].forEach((v, x) => { if (v === 'X') f(x * 14, y * 14); }));
    g.fillStyle = '#000'; each((x, y) => g.fillRect(x + 5 + 14, y + 5 + 14, 14, 14));
    g.fillStyle = '#0b0b0b'; each((x, y) => g.fillRect(x, y, 24, 24));
    g.fillStyle = '#fff'; each((x, y) => g.fillRect(x + 5, y + 5, 14, 14));
    ui.eight = `<img src="${c.toDataURL()}" style="display:inline-block;vertical-align:top;width:140px;height:140px;margin:-5px -23px -23px -5px;image-rendering:pixelated">`;
  }
  ui.counterFinal = '10<span style="margin:0 32px;color:#ffd84a">→</span><span style="color:#4dff7a;text-shadow:' +
    E.outlineShadow(5, '#0b2a12') + ', 14px 14px 0 #062010, 0 0 40px rgba(80,255,120,0.8)">1</span>';

  // toast "Подключено"
  ui.toast = el('div', {
    position: 'absolute', left: '60px', top: '860px', width: '620px', height: '132px', display: 'flex', alignItems: 'center', gap: '28px',
    padding: '0 30px', background: 'rgba(16,16,20,0.92)', border: '6px solid #6b6b6b', borderRadius: '8px',
    boxShadow: 'inset 0 0 0 6px #1d1d22, 0 0 40px rgba(85,255,85,0.35), 0 10px 0 rgba(0,0,0,0.3)', opacity: 0,
  });
  const sig = document.createElement('img');
  sig.src = E.pixelArt(SIGNAL, { G: '#55ff55' }, 7);
  sig.style.imageRendering = 'pixelated';
  sig.style.filter = 'drop-shadow(0 0 10px rgba(85,255,85,0.8))';
  ui.toast.appendChild(sig);
  const tt = document.createElement('div');
  Object.assign(tt.style, { fontFamily: 'Pixel', fontSize: '40px', color: '#55ff55', lineHeight: 1, textShadow: '5px 5px 0 #153f15, 0 0 18px rgba(85,255,85,0.7)', whiteSpace: 'nowrap' });
  tt.textContent = 'Подключено';
  ui.toast.appendChild(tt);

  // disconnect screen: the darkened dirt background of Minecraft menus
  const dirt = E.pixelCanvas(16, 16, (x, y, r) => {
    const cols = [[134, 96, 67], [121, 85, 58], [150, 108, 74], [107, 76, 51], [160, 118, 82], [96, 68, 46]];
    const c = cols[Math.floor(r() * cols.length)];
    const j = (r() - 0.5) * 10;
    return c.map(v => Math.round(v * 0.4 + j));
  }, 12).toDataURL();
  ui.screen = el('div', {
    position: 'absolute', inset: '0', backgroundImage: `url(${dirt})`, backgroundSize: '64px 64px', imageRendering: 'pixelated', opacity: 0,
  });
  const sIn = document.createElement('div');
  Object.assign(sIn.style, { position: 'absolute', inset: '0' });
  ui.screen.appendChild(sIn);
  const mk = (txt, top, size, color) => {
    const d = document.createElement('div');
    Object.assign(d.style, { position: 'absolute', left: '0', width: '100%', top: top + 'px', textAlign: 'center', fontFamily: 'Pixel', fontSize: size + 'px', color, textShadow: `${size / 8}px ${size / 8}px 0 #3f3f3f`, lineHeight: 1 });
    d.textContent = txt;
    sIn.appendChild(d);
    return d;
  };
  mk('Соединение потеряно', 360, 48, '#aaaaaa');
  mk('Слишком много подключений с одного IP', 472, 40, '#ffffff');
  ui.button = document.createElement('div');
  Object.assign(ui.button.style, {
    position: 'absolute', left: '540px', top: '590px', width: '840px', height: '96px', background: '#6f6f6f', border: '4px solid #000',
    boxShadow: 'inset 4px 4px 0 #a9a9a9, inset -4px -6px 0 #4b4b4b', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Pixel', fontSize: '32px', color: '#fff', textShadow: '4px 4px 0 #3f3f3f',
  });
  ui.button.textContent = 'В главное меню';
  sIn.appendChild(ui.button);
  ui.cursor = document.createElement('img');
  ui.cursor.src = E.CURSOR;
  Object.assign(ui.cursor.style, { position: 'absolute', left: '0', top: '0', imageRendering: 'pixelated' });
  sIn.appendChild(ui.cursor);
  ui.screenIn = sIn;

  // plates
  ui.p1 = E.plate([{ text: 'ПЛАН:', bg: '#111', size: 72 }, { text: '10 БОТОВ', bg: '#e3262f', size: 104 }], { x: 470, y: 170, rot: -4 });
  ui.p2 = E.plate([{ text: 'ВСЕ С ОДНОГО', bg: '#111', size: 70 }, { text: 'IP', bg: '#e3262f', size: 104 }], { x: 410, y: 170, rot: 3 });
  ui.p3 = E.plate([{ text: '10 БОТОВ', bg: '#e3262f', size: 100 }, { text: 'НЕ ПУСТИЛИ', bg: '#111', size: 84 }], { x: 470, y: 170, rot: -4 });
  ui.p4 = E.plate([{ text: '1 БОТ', bg: '#e3262f', size: 104 }, { text: 'ЗА ДЕСЯТЕРЫХ', bg: '#111', size: 80 }], { x: 520, y: 170, rot: -3 });

  ui.flash = E.flash();
}

// ------------------------------------------------------------------ setup
export async function setup(e) {
  E = e; T = E.THREE; V3 = new T.Vector3();
  await document.fonts.load('64px Pixel');
  makeTextures();
  // smooth minification (mipmaps) so distant blocks do not shimmer while the camera moves; close-ups stay pixel-sharp
  const maxAniso = E.renderer.capabilities.getMaxAnisotropy();
  for (const k of ['grassTop', 'grassSide', 'dirt', 'stone', 'cobble', 'planks', 'bricks', 'log', 'leaves', 'path', 'glowstone', 'chestTop', 'chestSide', 'chestFront', 'bush', 'botSkin', 'skin']) {
    const tx = E.tex[k];
    if (!tx) continue;
    tx.generateMipmaps = true;
    tx.minFilter = T.LinearMipmapLinearFilter;
    tx.anisotropy = Math.min(8, maxAniso);
    tx.needsUpdate = true;
  }
  buildWorld();
  buildCharacters();
  buildUI();
}

// ------------------------------------------------------------------ per-frame state
function rowZ(t) { return Z0 + DZM - V * t; }

function setBot(b, t) {
  const { rig } = b;
  const R = rig.root;
  R.visible = true;
  R.scale.setScalar(1);
  R.rotation.set(0, Math.PI, 0);   // facing the gate (-z)
  rig.head.rotation.set(0, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.armL.rotation.set(0, 0, 0); rig.armR.rotation.set(0, 0, 0);
  rig.legL.rotation.set(0, 0, 0); rig.legR.rotation.set(0, 0, 0);
  let x = b.x, y = 0, z;
  const state = { hit: false, merged: false, tagY: 2.42 };
  if (t < b.th) {
    // walking
    const dist = V * t;
    z = Z0 + b.dz - dist;
    E.walkPose(rig, dist * 2.9 + b.ph, 1);
    rig.head.rotation.y = 0.12 * Math.sin(t * 1.3 + b.ph);
    y = Math.abs(Math.sin(dist * 2.9 + b.ph)) * 0.04;
  } else if (t < b.ts) {
    // thrown back, then standing dazed
    state.hit = true;
    const k = E.seg(t, b.th, b.th + 0.55);
    z = ZHIT + BOUNCE * E.ease.out(k);
    y = 4 * 1.0 * k * (1 - k);
    R.rotation.x = -0.55 * Math.sin(Math.PI * k);
    const fl = Math.sin(Math.PI * k);
    rig.armL.rotation.x = -2.4 * fl; rig.armR.rotation.x = -2.4 * fl;
    rig.armL.rotation.z = 0.5 * fl; rig.armR.rotation.z = -0.5 * fl;
    rig.legL.rotation.x = 0.5 * fl; rig.legR.rotation.x = -0.4 * fl;
    const after = t - (b.th + 0.55);
    if (after > 0) rig.head.rotation.y = 0.45 * Math.sin(after * 11) * Math.exp(-after * 1.6);
    if (after > 0 && after < 0.2) R.scale.set(1 + 0.08 * Math.sin(after / 0.2 * Math.PI), 1 - 0.1 * Math.sin(after / 0.2 * Math.PI), 1);
  } else {
    // whirling together into one glowing point: a shrinking, rising spiral, flattened in z so it stays in front of the bars
    state.hit = true;
    const k = E.seg(t, b.ts, b.ta);
    if (k >= 1) { R.visible = false; state.merged = true; return { x: MERGE_C[0], y: 0, z: MERGE_C[2], ...state }; }
    const dx = b.x - MERGE_C[0], dz = (ZREST - MERGE_C[2]) / ZF;
    const r0 = Math.hypot(dx, dz), th0 = Math.atan2(dz, dx);
    const th = th0 + 3.0 * Math.PI * Math.pow(k, 1.35);
    const rr = r0 * (1 - E.ease.inOut(k));
    x = MERGE_C[0] + Math.cos(th) * rr;
    z = Math.max(-15.4, MERGE_C[2] + Math.sin(th) * rr * ZF);
    const s = 1 - 0.9 * E.ease.in(k);
    const lift = E.ease.out(E.seg(k, 0, 0.6));
    y = (MERGE_C[1] - s) * lift + 0.22 * Math.sin(k * 9 + b.i) * (1 - k);   // its centre ends in the ball
    R.rotation.y = Math.PI - th + k * 10;
    R.rotation.x = 0.35 * Math.sin(k * 6 + b.i);
    R.scale.setScalar(s);
    rig.armL.rotation.z = 1.2 * lift; rig.armR.rotation.z = -1.2 * lift;
    rig.legL.rotation.x = 0.3 * Math.sin(k * 20); rig.legR.rotation.x = -0.3 * Math.sin(k * 20);
    state.tagY = y + 2.42 * s;
  }
  R.position.set(x, y, z);
  return { x, y, z, ...state };
}

function heroZ(t) {
  if (t < HERO_STEP0) return HERO_Z0;
  if (t < TURN1) return E.lerp(HERO_Z0, HERO_Z1, E.ease.inOut(E.seg(t, HERO_STEP0, HERO_STEP1)));
  return HERO_Z1 - HERO_V * ramp(t, TURN1, TURN1 + 0.45);
}

function setHero(t) {
  const h = hero, R = h.root;
  R.visible = t >= FLASH_T - 0.02;
  if (!R.visible) return;
  h.head.rotation.set(0, 0, 0); h.body.rotation.set(0, 0, 0);
  h.armL.rotation.set(0, 0, 0); h.armR.rotation.set(0, 0, 0);
  h.legL.rotation.set(0, 0, 0); h.legR.rotation.set(0, 0, 0);
  R.rotation.set(0, 0, 0);
  R.scale.setScalar(1);
  const z = heroZ(t);
  let y = 0;
  // appears in the light: drops in, lands with a squash
  if (t < LAND) y = 1.1 * (1 - E.ease.in(E.seg(t, FLASH_T, LAND)));
  else if (t < LAND + 0.22) { const q = Math.sin(E.seg(t, LAND, LAND + 0.22) * Math.PI); R.scale.set(1 + 0.08 * q, 1 - 0.12 * q, 1 + 0.08 * q); }
  if (t < HERO_STEP0) {
    // arms out from the burst, coming down as he lands
    const q = 1 - E.seg(t, FLASH_T + 0.1, LAND + 0.15);
    h.armL.rotation.z = 0.9 * q; h.armR.rotation.z = -0.9 * q;
  } else if (t < TURN0) {
    // two steps toward the camera, then a fist pump ("10 → 1")
    const k = E.seg(t, HERO_STEP0, HERO_STEP1);
    E.walkPose(h, (HERO_Z1 - HERO_Z0) * E.ease.inOut(k) * 3.4, Math.sin(Math.PI * k));
    const up = smooth(t, 13.2, 13.38, 'out') * (1 - smooth(t, 13.58, 13.78));
    const pump = Math.abs(Math.sin(E.seg(t, 13.38, 13.62) * Math.PI * 2)) * 0.25;
    h.armR.rotation.x = -2.75 * up + pump * up;
    h.armR.rotation.z = -0.25 * up;
    h.head.rotation.x = -0.12 * up;
    h.body.rotation.y = -0.08 * up;
  } else {
    // turn to the gate and walk in
    const k = E.ease.inOut(E.seg(t, TURN0, TURN1));
    R.rotation.y = Math.PI * k;
    if (t > TURN1) {
      const dist = HERO_Z1 - z;
      const amt = E.clamp((t - TURN1) / 0.35);
      E.walkPose(h, dist * 2.9, amt);
      y = Math.abs(Math.sin(dist * 2.9)) * 0.05 * amt;
    }
  }
  R.position.set(0, y, z);
}

function portY(t) {
  if (t < SLAM) return GATE_OPEN_Y;
  if (t < SLAM_HIT) return GATE_OPEN_Y * (1 - E.ease.in(E.seg(t, SLAM, SLAM_HIT)));
  if (t < SLAM_HIT + 0.16) return 0.28 * Math.sin(Math.PI * E.seg(t, SLAM_HIT, SLAM_HIT + 0.16));
  if (t < OPEN0) return 0;
  if (t < OPEN1) return GATE_OPEN_Y * E.ease.inOut(E.seg(t, OPEN0, OPEN1));
  return GATE_OPEN_Y;
}

// ------------------------------------------------------------------ camera
// 0 - 6: one orbit around the walking row (row-relative): faces from the front -> up and around -> high behind,
//        the whole way to the gate in view (sign at the top, "1 IP" in the middle, bots below).
const ORBIT = {
  yaw: curve([[0, Math.PI + 0.24], [1.3, Math.PI + 0.16], [4.45, 0.07], [6.2, 0.02]]),
  dist: curve([[0, 12.4], [1.3, 11.8], [2.9, 14.6], [4.45, 23.0], [6.2, 20.6]]),
  h: curve([[0, 0.75], [1.3, 0.95], [4.45, 7.3], [6.2, 7.0]]),
  look: curve3([[0, [-0.45, 1.5, 0]], [1.3, [-0.3, 1.6, 0]], [4.45, [-1.0, 5.3, -8.0]], [6.2, [-1.0, 5.0, -8.0]]]),
};
/** The orbit centre: follows the row, then slows down (from 3.4 s) so the bots walk on ahead toward the gate. */
function pivotZ(t) { return rowZ(t) + 0.8 * V * ramp(t, 3.4, 5.2); }
function camWalk(t) {
  const fz = pivotZ(t);
  const yaw = ORBIT.yaw(t), dist = ORBIT.dist(t), h = ORBIT.h(t), lk = ORBIT.look(t);
  return { pos: [Math.sin(yaw) * dist, 1.25 + h, fz + Math.cos(yaw) * dist], look: [lk[0], lk[1], fz + lk[2]], fov: 40 };
}
// 7 - 8.55: the slam, from the right and in front of the gate (a slow drift)
function camSlam(t) {
  const s = (t - 7.0) / 1.55;
  return { pos: [3.5 - 0.5 * s, 5.2 - 0.3 * s, 3.4 - 1.3 * s], look: [0.2 - 0.1 * s, 3.1, -14.6], fov: 40 };
}
// 10.05 - 18: after the disconnect screen: the merge, he lands, steps forward, turns, walks in; the camera follows
const MERGE_POS = curve3([
  [10.05, [0.7, 3.6, 1.2]], [11.1, [0.5, 3.25, -1.0]], [12.12, [0.38, 2.75, -3.2]], [12.9, [0.32, 2.35, -4.55]],
  [13.8, [0.3, 2.25, -5.2]], [14.6, [0.35, 2.7, -5.6]], [15.4, [0.4, 3.1, -6.1]], [16.3, [0.4, 3.2, -8.6]],
  [17.2, [0.3, 3.1, -11.8]], [18.0, [0.3, 3.0, -14.7]]]);
const MERGE_LOOK = curve3([
  [10.05, [0, 3.1, -12.4]], [11.1, [0, 3.05, -12.4]], [12.12, [0, 2.75, -12.3]], [12.9, [0, 1.5, -11.5]],
  [13.8, [0, 1.35, -11.0]], [14.6, [0, 2.0, -14.5]], [15.4, [0, 2.4, -18.0]], [16.3, [0, 1.9, -22.5]],
  [17.2, [0, 1.75, -26.5]], [18.0, [0, 1.7, -29.5]]]);
function camMerge(t) { return { pos: MERGE_POS(t), look: MERGE_LOOK(t), fov: 40 }; }

/** A C1 bridge from camera a (leaving at t0 with its own velocity) to camera b (arriving at t1 with its velocity). */
function bridge(t, fa, fb, t0, t1) {
  const A = fa(t0), B = fb(t1), e = 1e-3;
  const A2 = fa(t0 + e), B0 = fb(t1 - e);
  const s = E.seg(t, t0, t1), dt = t1 - t0;
  const h3 = (p, q, p2, q0) => [0, 1, 2].map(i => herm(p[i], q[i], (p2[i] - p[i]) / e, (q[i] - q0[i]) / e, s, dt));
  return { pos: h3(A.pos, B.pos, A2.pos, B0.pos), look: h3(A.look, B.look, A2.look, B0.look), fov: E.lerp(A.fov, B.fov, s) };
}

const BR0 = 5.8, BR1 = 7.05;
function camAt(t) {
  if (t < BR0) return camWalk(t);
  if (t < BR1) return bridge(t, camWalk, camSlam, BR0, BR1);
  if (t < SCREEN1) return camSlam(t);     // (hidden by the disconnect screen from 8.55; a cut happens under it)
  return camMerge(t);
}

function shake(t) {
  const ev = [[SLAM_HIT, 0.32, 0.6], [FLASH_T, 0.22, 0.5], [LAND, 0.06, 0.25]];
  for (const b of bots) ev.push([b.th, 0.07, 0.25]);
  let x = 0, y = 0;
  for (const [t0, a, d] of ev) {
    const k = (t - t0) / d;
    if (k < 0 || k > 1) continue;
    const amp = a * (1 - k) * (1 - k);
    x += amp * Math.sin(t * 61 + t0 * 7);
    y += amp * Math.sin(t * 53 + t0 * 3 + 1.3);
  }
  if (t > OPEN0 && t < OPEN1) { const amp = 0.035 * Math.sin(Math.PI * E.seg(t, OPEN0, OPEN1)); x += amp * Math.sin(t * 47); y += amp * Math.sin(t * 59); }
  return [x, y];
}

function setCamera(t) {
  const c = camAt(t);
  const [sx, sy] = shake(t);
  const cam = E.camera;
  cam.position.set(c.pos[0] + sx, c.pos[1] + sy, c.pos[2]);
  cam.lookAt(c.look[0] + sx * 0.5, c.look[1] + sy * 0.5, c.look[2]);
  // a quick zoom punch on the slam and on the merge flash
  const punch = (t0, d) => t < t0 ? 0 : t < t0 + 0.05 ? (t - t0) / 0.05 : Math.pow(1 - E.seg(t, t0 + 0.05, t0 + d), 2);
  const fov = c.fov - 3.2 * punch(SLAM_HIT, 0.45) - 2.6 * punch(FLASH_T, 0.6);
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ update
export function update(t) {
  setCamera(t);

  // world objects and light
  fx.fill.intensity = 0.35 + 1.1 * (1 - E.seg(t, 1.9, 3.6));
  const endK = smooth(t, 15.4, 16.6);
  fx.endLight.intensity = 1.25 * endK;
  fx.hemi.intensity = 1.35 + 0.35 * endK;
  portcullis.position.y = portY(t) + (t > OPEN0 && t < OPEN1 ? 0.03 * Math.sin(t * 70) : 0);
  const states = bots.map(b => setBot(b, t));
  setHero(t);
  const hz = heroZ(t);
  fx.heroLight.position.set(0.6, 2.6, hz + 2.2);
  fx.heroLight.intensity = 9 * endK;
  for (const d of fx.dust) d.update(t);
  for (const h of fx.hits) h.update(t);
  fx.merge.update(t);
  fx.land.update(t);
  for (const o of fx.open) o.update(t);

  // berries flying from the rows into him (Minecraft item pickup), a burst of them = the work of ten
  {
    const list = berries.userData.list;
    list.forEach((b, i) => {
      const a = t - b.t0;
      const up = 0.22, fly = 0.32 + Math.abs(b.z - hz) * 0.025;
      if (a < 0 || a > up + fly) { E.setInstance(berries, i, 0, -50, 0, 0.0001); return; }
      let x, y, z, s = 1;
      const p1 = [b.x + b.side * 0.4, 0.5 + b.up, b.z];
      if (a < up) {
        const k = E.ease.out(a / up);
        x = E.lerp(b.x, p1[0], k); y = E.lerp(0.5, p1[1], k); z = b.z;
        s = 0.4 + 0.6 * k;
      } else {
        const k = E.ease.in((a - up) / fly);
        x = E.lerp(p1[0], 0, k); z = E.lerp(p1[2], hz, k);
        y = E.lerp(p1[1], 1.2, k) + Math.sin(k * Math.PI) * 0.7;
        s = 1 - 0.6 * k * k;
      }
      E.setInstance(berries, i, x, y, z, s, a * 6);
    });
    berries.instanceMatrix.needsUpdate = true;
  }

  // merge glow: a growing ball with a white-hot core, a few soft rays behind it
  const merged = bots.filter(b => t >= b.ta).length;
  const orbOn = E.seg(t, 10.62, 11.0) * (1 - E.ease.out(E.seg(t, FLASH_T, FLASH_T + 0.2)));
  orb.visible = core.visible = orbOn > 0.001;
  const pulse = 1 + 0.08 * Math.sin(t * 23);
  const big = 1 + 1.4 * E.seg(t, FLASH_T - 0.12, FLASH_T) - 1.6 * E.ease.out(E.seg(t, FLASH_T, FLASH_T + 0.2));
  const orbS = (2.4 + merged * 0.36) * pulse * big;
  orb.scale.setScalar(orbS);
  orb.material.opacity = orbOn;
  orb.position.set(...MERGE_C);
  core.scale.setScalar(orbS * 0.55);
  core.material.opacity = orbOn * (0.55 + 0.45 * merged / N);
  core.position.set(MERGE_C[0], MERGE_C[1], MERGE_C[2] + 0.3);
  const bk = E.seg(t, FLASH_T - 0.05, FLASH_T + 0.6);
  beam.visible = bk > 0 && bk < 1;
  beam.material.opacity = 0.75 * (1 - E.ease.out(bk));
  beam.scale.set(1 - bk * 0.8, 1, 1 - bk * 0.8);
  {
    const on = E.seg(t, 10.8, 11.5) * (1 - E.seg(t, FLASH_T, FLASH_T + 0.4));
    rays.visible = on > 0.001;
    rays.position.set(MERGE_C[0], MERGE_C[1], MERGE_C[2] - 0.8);
    rays.quaternion.copy(E.camera.quaternion);
    rays.rotateZ(t * 0.6);
    rays.scale.setScalar(4.2 + 1.6 * E.seg(t, 10.8, FLASH_T) + 3.5 * E.ease.out(E.seg(t, FLASH_T, FLASH_T + 0.4)));
    rays.material.opacity = on * (0.2 + 0.16 * E.seg(t, 11.3, FLASH_T));
  }
  const rk = E.seg(t, FLASH_T, FLASH_T + 0.8);
  ring.visible = rk > 0 && rk < 1;
  ring.scale.setScalar(1 + 11 * E.ease.out(rk));
  ring.material.opacity = 0.9 * (1 - rk);

  // ---------- overlays
  const onScreen = t >= SCREEN0 && t < SCREEN1;

  // name tags: Minecraft-font images at one whole-number scale (2 / 3 / 4) for the whole row, so they stay sharp
  const tagBoxes = [];
  let uSum = 0, uN = 0;
  bots.forEach((b, k) => { const s = states[k]; if (!s.merged) { uSum += ppu(s.x, s.tagY, s.z); uN++; } });
  const uAvg = uN ? uSum / uN : 0;
  const tagSi = uAvg >= 150 ? 2 : uAvg >= 76 ? 1 : 0;   // one scale for the whole row
  bots.forEach((b, k) => {
    const s = states[k];
    const tagIn = E.seg(t, 0.05 + k * 0.03, 0.3 + k * 0.03);
    const visible = !s.merged && !onScreen;
    const p = proj(s.x, s.tagY, s.z);
    const u = ppu(s.x, s.tagY, s.z);
    const si = tagSi;
    const fly = t > b.ts ? 1 - E.seg(t, b.ts, b.ts + 0.25) : 1;
    const S = TAG_SCALES[si];
    const img = s.hit ? b.tagR : b.tagW;
    if (b._src !== img.url) { b.tag.src = img.url; b._src = img.url; }
    b.tag.style.width = img.w * S + 'px';
    b.tag.style.height = img.h * S + 'px';
    b.tag.style.opacity = visible && p.ok ? tagIn * fly : 0;
    b._tx = p.x; b._ty = p.y; b._ts = img.h * S; b._tw = img.w * S; b._th = img.h * S;
    b._pop = 0.6 + 0.4 * E.ease.outBack(tagIn);
    // red X
    const xk = E.seg(t, b.th + 0.08, b.th + 0.32);
    const xOn = t >= b.th + 0.08 && t < 10.75 && !onScreen;
    const xOut = 1 - E.seg(t, 10.45, 10.75);
    const pc = proj(s.x, s.y + 0.95, s.z);
    const xs = E.clamp(u * 0.78, 40, 110) / 88;
    b.xMark.style.opacity = xOn ? Math.min(1, xk * 3) * xOut : 0;
    b.xMark.style.left = pc.x + 'px';
    b.xMark.style.top = pc.y + 'px';
    b.xMark.style.transform = `translate(-50%,-50%) scale(${xs * E.ease.outBack(xk) * (0.7 + 0.3 * xOut)}) rotate(${-8 + (b.i % 3) * 6}deg)`;
  });

  // keep name tags from overlapping (a few relaxation passes along x, deterministic)
  {
    const order = bots.slice().sort((a, c) => a._tx - c._tx);
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 0; j + 1 < order.length; j++) {
        const a = order[j], c = order[j + 1];
        if (Math.abs(a._ty - c._ty) > Math.max(a._ts, c._ts) * 1.1) continue;
        const ov = (a._tx + a._tw / 2 + 6) - (c._tx - c._tw / 2);
        if (ov > 0) { a._tx -= ov / 2; c._tx += ov / 2; }
      }
    }
    for (const b of bots) {
      b.tag.style.left = Math.round(b._tx - b._tw / 2) + 'px';
      b.tag.style.top = Math.round(b._ty - b._th) + 'px';
      b.tag.style.transform = b._pop === 1 ? 'none' : `scale(${b._pop})`;
      tagBoxes.push({ x: b._tx, y: b._ty - b._th });
    }
  }

  // "1 IP" label and lines
  const ipIn = 4.6, ipOut = 7.32;
  const ipVis = t >= ipIn && t < 7.6;
  const red = t >= SLAM_HIT;
  ui.ip.style.borderColor = red ? '#ff5050' : '#6ff0ff';
  ui.ip.style.color = red ? '#ffe0e0' : '#eaffff';
  ui.ip.style.boxShadow = red ? '0 0 24px #ff3030, 0 0 60px rgba(255,48,48,0.65), inset 0 0 18px rgba(255,48,48,0.45)'
    : '0 0 24px #46e8ff, 0 0 60px rgba(70,232,255,0.65), inset 0 0 18px rgba(70,232,255,0.45)';
  ui.ip.style.textShadow = red ? '0 0 14px #ff3030, 8px 8px 0 #4a0a0a' : '0 0 14px #46e8ff, 8px 8px 0 #0a3a48';
  const fzc = rowZ(Math.min(t, 7.0));
  const pa = proj(0, IP_Y - 2.4 * smooth(t, 6.0, 7.0), fzc + 0.3);
  const ipP = popPix(t, ipIn, ipOut, 0.4, 0.2);
  ui.ip.style.opacity = ipP.o;
  placePix(ui.ip, pa.x, pa.y, ipP.s);
  const lab = { x: Math.round(pa.x), y: Math.round(pa.y) + 57 };
  const svgOp = ipVis ? 1 - E.seg(t, SLAM_HIT + 0.08, 7.45) : 0;
  ui.svg.style.opacity = svgOp;
  ui.svg.style.display = svgOp > 0.001 ? 'block' : 'none';
  bots.forEach((b, k) => {
    const ln = ui.lines[k];
    const g = E.ease.out(E.seg(t, 4.85 + b.hitOrder * 0.05, 5.15 + b.hitOrder * 0.05));
    const end = tagBoxes[k];
    const ex = E.lerp(lab.x, end.x, g), ey = E.lerp(lab.y, end.y, g);
    ln.g.setAttribute('opacity', g > 0.01 ? 1 : 0);
    ln.set.forEach((l, li) => {
      l.setAttribute('x1', lab.x); l.setAttribute('y1', lab.y);
      l.setAttribute('x2', ex); l.setAttribute('y2', ey);
      l.setAttribute('stroke', li === 2 ? (red ? '#ffb0b0' : '#d8fbff') : (red ? '#ff3a3a' : '#46e8ff'));
    });
    for (let j = 0; j < 2; j++) {
      const d = ui.dots[k * 2 + j];
      const q = ((t - 5.15) * 0.9 + j * 0.5 + k * 0.07) % 1;
      const on = g >= 1 && t > 5.15 && !red;
      d.setAttribute('x', E.lerp(lab.x, end.x, q) - 6);
      d.setAttribute('y', E.lerp(lab.y, end.y, q) - 6);
      d.setAttribute('opacity', on ? Math.sin(q * Math.PI) : 0);
    }
  });

  // counter 10 → 1
  if (t < FLASH_T) {
    const left = Math.max(1, N - merged);
    if (left === 8) ui.counter.innerHTML = ui.eight; else ui.counter.textContent = String(left);
    ui.counter.style.color = '#ffffff';
    let lastT = 10.6;
    for (const b of bots) if (t >= b.ta && b.ta > lastT) lastT = b.ta;
    const bump = 1 + 0.22 * (1 - E.seg(t, lastT, lastT + 0.14));
    const c = popPix(t, 10.6);
    ui.counter.style.opacity = c.o;
    const s = c.s * bump;
    placePix(ui.counter, 960, 196, Math.abs(s - 1) < 1e-4 ? 1 : s);
  } else {
    if (ui.counter.dataset.final !== '1') { ui.counter.innerHTML = ui.counterFinal; ui.counter.dataset.final = '1'; }
    const c = popPix(t, FLASH_T + 0.05, 13.85, 0.45);
    ui.counter.style.opacity = c.o;
    placePix(ui.counter, 960, 196, c.s);
  }
  if (t < FLASH_T && ui.counter.dataset.final === '1') ui.counter.dataset.final = '';

  // toast
  {
    const k = E.seg(t, 15.95, 16.35);
    ui.toast.style.opacity = t >= 15.95 ? 1 : 0;
    const dx = Math.round((1 - E.ease.outBack(k)) * -700);
    ui.toast.style.transform = dx === 0 ? 'none' : `translateX(${dx}px)`;
  }

  // disconnect screen
  ui.screen.style.opacity = onScreen ? 1 : 0;
  if (onScreen) {
    const zk = E.seg(t, SCREEN0, SCREEN0 + 0.25);
    ui.screenIn.style.transform = zk >= 1 ? 'none' : `scale(${1.08 - 0.08 * E.ease.out(zk)})`;
    const m = E.ease.inOut(E.seg(t, 9.25, 9.7));
    const cx = E.lerp(1340, 1000, m), cy = E.lerp(900, 645, m);
    ui.cursor.style.left = Math.round(cx) + 'px'; ui.cursor.style.top = Math.round(cy) + 'px';
    const hover = t > 9.62;
    const press = t > 9.86;
    ui.button.style.background = press ? '#5a6390' : hover ? '#7e88c2' : '#6f6f6f';
    ui.button.style.border = hover ? '4px solid #fff' : '4px solid #000';
    ui.button.style.color = hover ? '#ffffa0' : '#fff';
    ui.cursor.style.transform = press ? 'scale(0.9)' : 'none';
  }

  // plates (the "НЕ ПУСТИЛИ" plate hides under the fake game screen and pops again on the way back)
  E.popIn(ui.p1, t, 0.05, 3.3);
  E.popIn(ui.p2, t, 4.7, 6.92);
  if (t < SCREEN0) E.popIn(ui.p3, t, 7.4, 1e9);
  else if (onScreen) ui.p3.style.opacity = 0;
  else E.popIn(ui.p3, t, SCREEN1, 10.42, { dur: 0.3 });
  E.popIn(ui.p4, t, 14.35);

  // flashes
  let fl = 0;
  if (t >= SLAM_HIT) fl = Math.max(fl, 0.55 * (1 - E.seg(t, SLAM_HIT, SLAM_HIT + 0.22)));
  if (t >= SCREEN1) fl = Math.max(fl, 0.7 * (1 - E.seg(t, SCREEN1, SCREEN1 + 0.25)));
  if (t >= FLASH_T - 0.1) fl = Math.max(fl, E.seg(t, FLASH_T - 0.1, FLASH_T) * (1 - E.ease.out(E.seg(t, FLASH_T + 0.02, FLASH_T + 0.3))));
  ui.flash.style.opacity = fl;

  // the disconnect screen covers everything: skip drawing the 3D scene under it
  E.scene.visible = !onScreen;
  // overlays that are fully transparent are not painted at all (cheaper frames)
  for (const c of E.ui.children) {
    const o = parseFloat(c.style.opacity);
    c.style.visibility = o === 0 ? 'hidden' : 'visible';
  }
}
