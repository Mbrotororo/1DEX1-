// OUTRO (20 s): the results, a Minecraft-style subscribe and the end screen, at sunset by the finished farm.
//   0.0-4.4   sunset; 1DEX1 sits on the edge of the top (10th) floor, legs dangling; a close-up while he turns
//             his head to us (0.4-1.1), then from 1.5 s the camera pulls back (evenly, in log-distance) and rises
//             to show the whole farm (10 floors, berry rows, cobble walkways, torches, chests).
//   4.0-9.8   results: plate "ИТОГ / ФЕРМЫ", "ЭТАЖЕЙ: 10", the green counter shows $0, runs up from zero (5.1 s),
//             faster and faster, and slams into $50 000 000 at 7.3 s (shake, flash, punch 1 -> 1.35 -> 1,
//             green $ and cubes, rays, shine), then it moves up and leaves at 9.6 s.
//   8.4-11.6  the world blurs like a Minecraft menu: the button "Подписаться", the cursor glides in, the button
//             lights up (hover), the click at 10.6 s.
//  10.6-13.9  advancement toast "Достижение получено! / Подписка на 1DEX1" (golden bell, sparkles).
//  11.6-20.0  the camera lands next to 1DEX1 (now standing on the top floor), he waves; from 13.5 s the end screen:
//             two inventory-slot frames (next video 16:9 on the left, subscribe square on the right),
//             he waves (right arm, toward the frames), points up-left at "ПОДПИСКА" then at "СЛЕДУЮЩЕЕ ВИДЕО",
//             waves again, then idles until the end.
// Everything in update() is a pure function of t (caches only skip work when nothing changed).
export const DURATION = 20;

let E, THREE, _o, V3;
const O = {};
const W = 1920, H = 1080;
const FX0 = -35, FX1 = 35, FZ0 = -15, FZ1 = 15, FLOORS = 10, GAP = 3;
const TOP = GAP * (FLOORS - 1);     // 27: the top floor's surface
const HX = 10.5;                    // where 1DEX1 sits (x) on the front edge of the top floor
const HZ_SIT = 15.02, HZ_STAND = 14.5;
const CH_Z = 21.5;                  // the chest row (centre z), as in the intro

// ---------------------------------------------------------------- timing (seconds)
const T = {
  look0: 0.4, look1: 1.1,                            // he turns his head to the camera (still in the close-up)
  pull0: 1.5, reveal: 4.4,                            // the camera holds the close-up, then pulls back
  plate: 4.0, floors: 4.45, money: 4.8, count0: 5.1, slam: 7.3,
  resOut: 8.3,                                        // the plate and the floors line leave
  up0: 8.3, up1: 8.8, moneyOut: 9.55,                 // the counter moves up, then leaves
  blur0: 8.35, blur1: 8.85, unblur0: 11.3, unblur1: 11.9,
  btn: 8.55, title: 9.5, cur0: 9.0, cur1: 9.95, click: 10.6, btnOut: 11.25,
  toast: 10.68, toastOut: 13.6,
  stand0: 10.2, stand1: 10.75,
  land: 12.8,                                          // the camera arrives at the end-screen pose
  hi0: 11.75, hi1: 13.15,                              // he waves at the camera ("Жми")
  dim: 13.25, frame1: 13.4, frame2: 13.55, cap1: 13.62, cap2: 13.72,
  wave0: 14.0, wave1: 15.5, point0: 15.7, point1: 17.6, wave2: 17.9, wave3: 18.9,
  jab0: 15.95, pointB0: 16.45, pointB1: 16.8, glance0: 17.05,   // jabs at ~16.1 and ~16.9
  capPulse: [[16.75, 17.35], [15.95, 16.55]],                   // [big frame, square]: its caption pulses
};

// ---------------------------------------------------------------- small helpers
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const isOdd = z => ((z % 2) + 2) % 2 === 1;
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const sm = (t, a, b, f = 'inOut') => E.ease[f](E.seg(t, a, b));
function bez(a, b, c, d, k) {
  const u = 1 - k;
  return [0, 1, 2].map(i => u * u * u * a[i] + 3 * u * u * k * b[i] + 3 * u * k * k * c[i] + k * k * k * d[i]);
}
function hash2(ix, iz, s) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
function div(parent, style = {}, html = '') {
  const e = document.createElement('div');
  Object.assign(e.style, style);
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}
/** screen position of a world point */
function proj(p) {
  V3.set(p[0], p[1], p[2]).project(E.camera);
  return [(V3.x + 1) / 2 * W, (1 - V3.y) / 2 * H];
}
/** sets opacity only when it changed (cheap) */
function op(e, v) { const s = String(Math.round(E.clamp(v) * 1000) / 1000); if (e.style.opacity !== s) e.style.opacity = s; }

// ---------------------------------------------------------------- merged geometry (as in the intro: faster than instancing in software GL)
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  quad(a, b, c, d, n, u0, v0, u1, v1) {
    const k = this.p.length / 3;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let j = 0; j < 4; j++) this.n.push(n[0], n[1], n[2]);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  face(dir, x0, y0, z0, x1, y1, z1, unit = false) {
    const U = unit ? 1 : null;
    switch (dir) {
      case '+y': this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 0, 0, U || x1 - x0, U || z1 - z0); break;
      case '-y': this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], 0, 0, U || x1 - x0, U || z1 - z0); break;
      case '+z': this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], 0, 0, U || x1 - x0, U || y1 - y0); break;
      case '-z': this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], 0, 0, U || x1 - x0, U || y1 - y0); break;
      case '+x': this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], 0, 0, U || z1 - z0, U || y1 - y0); break;
      case '-x': this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], 0, 0, U || z1 - z0, U || y1 - y0); break;
    }
  }
  box(x0, y0, z0, x1, y1, z1, unit = true) { for (const d of ['+x', '-x', '+y', '-y', '+z', '-z']) this.face(d, x0, y0, z0, x1, y1, z1, unit); }
  plant(x, y, z, s = 1, ry = 0) {
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const c = Math.cos(a + ry) * 0.5 * s, d = -Math.sin(a + ry) * 0.5 * s;
      this.quad([x - c, y, z - d], [x + c, y, z + d], [x + c, y + s, z + d], [x - c, y + s, z - d], [0, 1, 0], 0, 0, 1, 1);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat) { return new THREE.Mesh(this.geometry(), mat); }
}
class MGeo {
  constructor() { this.g = {}; }
  get(k) { return this.g[k] || (this.g[k] = new Geo()); }
  group(M, { cast = false, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const k in this.g) { if (!this.g[k].p.length) continue; const m = this.g[k].mesh(M[k]); m.castShadow = cast; m.receiveShadow = receive; grp.add(m); }
    return grp;
  }
}
function rmat(t, opts = {}) {
  const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true;
  return new THREE.MeshLambertMaterial(Object.assign({ map: c }, opts));
}
/** a double-sided plant material that keeps the up normal on both sides (as in the intro: no dark back faces) */
function plantMat(map) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );'); };
  return m;
}

// ---------------------------------------------------------------- textures made here
function makeTextures() {
  const X = {};
  const j = (c, r, a) => c.map(v => Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * a))));
  X.tallGrass = E.pixelTex(16, 16, (x, y, r) => {
    for (const b of [1, 3, 4, 6, 8, 9, 11, 13, 14]) {
      const top = 3 + ((b * 7) % 6);
      const bx = b + (y < 5 ? ((b % 3) - 1) : 0);
      if (x === bx && y >= top) return j([[88, 150, 52], [72, 132, 44], [104, 168, 60]][(b + y) % 3], r, 14);
    }
    return null;
  }, 41);
  X.poppy = E.pixelTex(16, 16, (x, y) => {
    if (x === 7 && y >= 7) return [52, 120, 40];
    if (x === 6 && y === 11) return [52, 120, 40];
    if (y >= 3 && y <= 6 && x >= 5 && x <= 9 && !((x === 5 || x === 9) && (y === 3 || y === 6))) return (x === 7 && y === 4) ? [40, 20, 20] : [220, 30, 36];
    return null;
  }, 42);
  X.log = E.pixelTex(16, 16, (x, y, r) => j((x % 4 === 0) ? [70, 52, 30] : [[104, 80, 48], [94, 72, 42], [112, 88, 54]][(x + (y >> 2)) % 3], r, 10), 44);
  X.logTop = E.pixelTex(16, 16, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return j([94, 72, 42], r, 8);
    return j(Math.floor(d) % 2 ? [176, 140, 86] : [150, 118, 70], r, 8);
  }, 45);
  X.leaves = E.pixelTex(16, 16, (x, y, r) => j([[52, 120, 38], [44, 104, 32], [64, 136, 46], [36, 90, 28], [72, 148, 52]][Math.floor(r() * 5)], r, 14), 46);
  const wood = (x, y, r) => j([[160, 104, 42], [146, 94, 36], [171, 113, 48]][(x + y * 2) % 3], r, 10);
  const edge = [74, 46, 20];
  X.dchestFront = E.pixelTex(30, 14, (x, y, r) => {
    if (x >= 14 && x <= 15 && y >= 3 && y <= 6) return y === 3 ? [70, 70, 70] : [196, 196, 196];
    return (x === 0 || x === 29 || y === 0 || y === 13 || y === 4 || y === 5) ? edge : wood(x, y, r);
  }, 49);
  X.dchestTop = E.pixelTex(30, 14, (x, y, r) => (x === 0 || y === 0 || x === 29 || y === 13) ? edge : wood(x, y, r), 50);
  // the square Minecraft sun
  X.sun = E.pixelTex(16, 16, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d < 4) return [255, 252, 226];
    if (d < 6) return [255, 236, 160];
    if (d < 7) return [255, 210, 112];
    return [255, 178, 84];
  }, 51);
  const soft = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  X.glow = soft(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  return X;
}

/** canvas -> data URL of a Minecraft button (210 x 26 texture pixels, shown at 4x) */
function buttonURL(kind) {
  const w = 210, h = 26;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const r = E.rng(kind === 'hover' ? 61 : kind === 'press' ? 62 : 60);
  const base = kind === 'hover' ? 150 : kind === 'press' ? 96 : 112;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v;
    const outline = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (outline) v = kind === 'normal' ? 0 : 255;
    else if (y === 1 || x === 1) v = kind === 'press' ? base - 46 : base + 62;               // top-left bevel
    else if (y >= h - 3 || x === w - 2) v = kind === 'press' ? base + 40 : base - 52;        // bottom-right bevel
    else v = base + Math.round((r() - 0.5) * 16 + (((x >> 1) + (y >> 1)) % 5 === 0 ? -6 : 0));
    const i = (y * w + x) * 4;
    const tint = kind === 'hover' && !outline ? [0, 4, 10] : [0, 0, 0];
    img.data[i] = Math.max(0, Math.min(255, v + tint[0])); img.data[i + 1] = Math.max(0, Math.min(255, v + tint[1]));
    img.data[i + 2] = Math.max(0, Math.min(255, v + tint[2])); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

// ---------------------------------------------------------------- world
function buildWorld(scene, M, X) {
  // ---- the big flat ground (everything at y = 0 is this one quad)
  {
    const g = new Geo();
    g.face('+y', -600, -1, -600, 600, 0, 600);
    const m = g.mesh(M.grassTop); m.receiveShadow = true; scene.add(m);
  }
  // ---- hills and trees around the farm (static, merged, greedy tops)
  {
    const SX0 = -120, SX1 = 120, SZ0 = -110, SZ1 = 90;
    const fh = (x, z) => {
      if (x < SX0 || x >= SX1 || z < SZ0 || z >= SZ1) return 0;
      const dx = Math.max(FX0 - 7 - x, x - (FX1 + 6), 0);
      const dzb = Math.max(FZ0 - 7 - z, 0), dzf = Math.max(z - 46, 0);
      const dist = Math.max(dx, dzb, dzf);
      if (dist <= 0) return 0;
      const n = vnoise(x / 11, z / 11, 5) * 1.0 + vnoise(x / 4.5, z / 4.5, 6) * 0.4;
      const h = (n - 0.62) * 6 * E.clamp(dist / 12) + Math.max(0, dist - 16) * 0.2;
      return Math.max(0, Math.min(15, Math.round(h)));
    };
    const mg = new MGeo();
    const runs = {};
    const deco = { tallGrass: new Geo(), poppy: new Geo() };
    const r = E.rng(15);
    const DIRS = [['+x', 1, 0], ['-x', -1, 0], ['+z', 0, 1], ['-z', 0, -1]];
    const H = {};
    for (let x = SX0; x < SX1; x++) for (let z = SZ0; z < SZ1; z++) H[x + ',' + z] = fh(x, z);
    const hAt = (x, z) => { const v = H[x + ',' + z]; return v === undefined ? 0 : v; };
    for (let x = SX0; x < SX1; x++) for (let z = SZ0; z < SZ1; z++) {
      const h = hAt(x, z);
      if (h > 0) {
        (runs[h + ',' + z] = runs[h + ',' + z] || []).push(x);
        for (const [d, dx, dz] of DIRS) {
          const nh = hAt(x + dx, z + dz);
          if (nh < h) {
            const lo = Math.max(nh, h - 3);
            mg.get('grassSide').face(d, x, h - 1, z, x + 1, h, z + 1);
            if (h - 1 > lo) mg.get('dirt').face(d, x, lo, z, x + 1, h - 1, z + 1);
          }
        }
      }
      const inFarm = x >= FX0 - 1 && x < FX1 + 1 && z >= FZ0 - 1 && z < FZ1 + 1;
      const q = r();
      const near = Math.abs(x) < 75 && z > -70 && z < 70;
      if (!inFarm && near && q < 0.09) deco[q < 0.012 ? 'poppy' : 'tallGrass'].plant(x + 0.5, h, z + 0.5, 0.7 + r() * 0.4, r() * 3);
    }
    for (const key in runs) {
      const [h, z] = key.split(',').map(Number);
      const xs = runs[key].sort((a, b) => a - b);
      let s = xs[0], p = xs[0];
      for (let i = 1; i <= xs.length; i++) {
        if (i < xs.length && xs[i] === p + 1) { p = xs[i]; continue; }
        mg.get('grassTop').face('+y', s, h - 1, z, p + 1, h, z + 1);
        if (i < xs.length) { s = p = xs[i]; }
      }
    }
    // trees (they cast shadows; the hills do not)
    const tmg = new MGeo();
    const tr = E.rng(21);
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 70; tries++) {
      const x = Math.floor(SX0 + 4 + tr() * (SX1 - SX0 - 8)), z = Math.floor(SZ0 + 4 + tr() * (SZ1 - SZ0 - 8));
      const dx = Math.max(FX0 - x, x - FX1 + 1, 0), dz = Math.max(FZ0 - z, z - FZ1 + 1, 0);
      if (Math.max(dx, dz) < 7) continue;
      if (z > FZ1 && z < 40 && x > -45 && x < 50) continue;       // keep the chest yard clear
      treeGeo(tmg, x, hAt(x, z), z, 4 + Math.floor(tr() * 2), tr);
      placed++;
    }
    const grp = mg.group(M, { cast: false });
    for (const k in deco) grp.add(deco[k].mesh(M[k]));
    scene.add(grp, tmg.group(M, { cast: true }));
  }

  // ---- the farm: floors 2..10 (dirt rows + cobble walkways), bushes, torches; floor 1 is the grass itself
  {
    const mg = new MGeo();
    const torchG = new Geo(), headG = new Geo();
    O.torchHeads = [];
    for (let k = 1; k <= FLOORS; k++) {
      const Y = GAP * (k - 1);
      if (k > 1) {
        for (let z = FZ0; z < FZ1; z++) {
          const gg = mg.get(isOdd(z) ? 'dirt' : 'cobble');
          gg.face('+y', FX0, Y - 1, z, FX1, Y, z + 1);
          gg.face('-y', FX0, Y - 1, z, FX1, Y, z + 1);
          gg.face('+x', FX0, Y - 1, z, FX1, Y, z + 1);
          gg.face('-x', FX0, Y - 1, z, FX1, Y, z + 1);
          if (z === FZ0) gg.face('-z', FX0, Y - 1, z, FX1, Y, z + 1);
          if (z === FZ1 - 1) gg.face('+z', FX0, Y - 1, z, FX1, Y, z + 1);
        }
      }
      for (let z = FZ0; z < FZ1; z++) {
        if (!isOdd(z)) continue;
        for (let x = FX0; x < FX1; x++) {
          const isEdge = z >= FZ1 - 4 || z <= FZ0 + 2 || x < FX0 + 3 || x >= FX1 - 3;
          if (!isEdge && k !== FLOORS && k !== 1) continue;
          mg.get('bush').plant(x + 0.5, Y, z + 0.5, 1, 0);
        }
      }
      if (k > 1) {
        for (let z = -12; z <= 12; z += 4) for (let x = -32; x <= 32; x += 8) {
          const tx = x + ((z / 4) % 2 ? 4 : 0) + 0.5, tz = z + 0.5;
          // under the top floor only the outer ones can be seen through the gaps
          if (k !== FLOORS && Math.abs(z) < 12 && Math.abs(tx) < 30) continue;
          torchG.box(tx - 1 / 16, Y, tz - 1 / 16, tx + 1 / 16, Y + 10 / 16, tz + 1 / 16);
          headG.box(tx - 1.4 / 16, Y + 8.2 / 16, tz - 1.4 / 16, tx + 1.4 / 16, Y + 11 / 16, tz + 1.4 / 16);
          if (k === FLOORS || z === 12) O.torchHeads.push([tx, Y + 0.6, tz]);
        }
        // torches along the front edge walkway too, so the stack shows warm lights at dusk
        for (let x = -31; x <= 31; x += 6) {
          if (k === FLOORS && Math.abs(x + 0.5 - HX) < 3) continue;   // not right next to him
          if (k === FLOORS && x + 0.5 > 2 && x + 0.5 < 9) continue;     // nor under the big end-screen frame
          const tx = x + 0.5, tz = FZ1 - 0.5;
          torchG.box(tx - 1 / 16, Y, tz - 1 / 16, tx + 1 / 16, Y + 10 / 16, tz + 1 / 16);
          headG.box(tx - 1.4 / 16, Y + 8.2 / 16, tz - 1.4 / 16, tx + 1.4 / 16, Y + 11 / 16, tz + 1.4 / 16);
          O.torchHeads.push([tx, Y + 0.6, tz]);
        }
      }
    }
    const g = mg.group(M, { cast: true });
    g.add(torchG.mesh(M.torch), headG.mesh(M.torchHead));
    scene.add(g);
    // warm glow sprites on the torch heads
    // (one Points object: a sprite each would be ~150 draw calls)
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(O.torchHeads.flat(), 3));
    O.torchGlow = new THREE.Points(pg, new THREE.PointsMaterial({ map: X.glow, color: 0xffb347, size: 4.2, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    O.torchGlow.frustumCulled = false;
    scene.add(O.torchGlow);
  }

  // ---- the storage: 10 double chests in a row in front of the farm (as in the intro)
  {
    const side = E.mat(E.tex.chestSide), top = E.mat(X.dchestTop), front = E.mat(X.dchestFront);
    const geo = new THREE.BoxGeometry(30 / 16, 14 / 16, 14 / 16);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, [side, side, top, top, front, side]);
      m.position.set(-9 + 2 * i, 7 / 16, CH_Z); m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }
}

function treeGeo(mg, x0, y0, z0, th, r) {
  for (let y = 0; y < th; y++) for (const d of ['+x', '-x', '+z', '-z']) mg.get('log').face(d, x0, y0 + y, z0, x0 + 1, y0 + y + 1, z0 + 1);
  const leaves = new Set();
  for (let yy = th - 2; yy <= th + 1; yy++) {
    const rad = yy >= th ? 1 : 2;
    for (let ax = -rad; ax <= rad; ax++) for (let az = -rad; az <= rad; az++) {
      if (ax === 0 && az === 0 && yy < th) continue;
      if (Math.abs(ax) === rad && Math.abs(az) === rad && (yy === th + 1 || r() < 0.5)) continue;
      leaves.add(ax + ',' + yy + ',' + az);
    }
  }
  const solid = (ax, yy, az) => leaves.has(ax + ',' + yy + ',' + az) || (ax === 0 && az === 0 && yy >= 0 && yy < th);
  for (const s of leaves) {
    const [ax, yy, az] = s.split(',').map(Number);
    for (const [d, dx, dy, dz] of [['+x', 1, 0, 0], ['-x', -1, 0, 0], ['+y', 0, 1, 0], ['-y', 0, -1, 0], ['+z', 0, 0, 1], ['-z', 0, 0, -1]]) {
      if (solid(ax + dx, yy + dy, az + dz)) continue;
      mg.get('leaves').face(d, x0 + ax, y0 + yy, z0 + az, x0 + ax + 1, y0 + yy + 1, z0 + az + 1);
    }
  }
  mg.get('logTop').face('+y', x0, y0 + th - 1, z0, x0 + 1, y0 + th, z0 + 1);
}

// ---------------------------------------------------------------- sky (a dome that follows the camera)
const SUNV = norm([-0.74, 0.075, -0.66]);      // where the sun disc hangs (low, behind-left)
const SUNL = norm([-0.5, 0.48, 0.72]);          // where the light comes from (front-left, so faces stay readable)
// up to +0.02 rad the sky is exactly the fog colour (the far ground fades into it: no seam at the horizon)
const FOG = '#f7a774';
const SKY = [[-1.6, FOG], [0.02, FOG], [0.065, '#ffb35a'], [0.11, '#ff9757'], [0.17, '#f97a68'], [0.28, '#e0648a'], [0.46, '#a3559f'], [0.75, '#5a468f'], [1.2, '#33377a'], [1.6, '#2a2e6c']];
function skyColor(d) {
  const el = Math.asin(E.clamp(d[1], -1, 1));
  let c = new THREE.Color(SKY[0][1]);
  for (let i = 0; i < SKY.length - 1; i++) {
    if (el >= SKY[i][0] && el <= SKY[i + 1][0]) {
      const k = (el - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
      c = new THREE.Color(SKY[i][1]).lerp(new THREE.Color(SKY[i + 1][1]), k);
      break;
    }
    if (el > SKY[SKY.length - 1][0]) c = new THREE.Color(SKY[SKY.length - 1][1]);
  }
  const s = Math.max(0, d[0] * SUNV[0] + d[1] * SUNV[1] + d[2] * SUNV[2]);
  // the sun's halo in the sky fades out in the haze right above the horizon (so the fog line stays seamless)
  const hz = E.clamp((el - 0.02) / 0.07), haze = hz * hz * (3 - 2 * hz);
  const g = (Math.pow(s, 6) * 0.55 + Math.pow(s, 30) * 0.3) * haze;
  c.lerp(new THREE.Color('#ffd08a'), E.clamp(g));
  return c;
}

// ---------------------------------------------------------------- setup
export async function setup(e) {
  E = e; THREE = E.THREE; _o = new THREE.Object3D(); V3 = new THREE.Vector3();
  const { scene } = E;
  const X = O.X = makeTextures();
  const M = O.M = {
    grassTop: rmat(E.tex.grassTop), grassSide: rmat(E.tex.grassSide), dirt: rmat(E.tex.dirt), cobble: rmat(E.tex.cobble),
    log: rmat(X.log), logTop: rmat(X.logTop), leaves: rmat(X.leaves),
    bush: plantMat(E.tex.bush), tallGrass: plantMat(X.tallGrass), poppy: plantMat(X.poppy),
    torch: E.mat(E.tex.torch), torchHead: new THREE.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false }),
  };

  // ---- sky dome, sun, clouds, fog, light
  {
    const g = new THREE.SphereGeometry(450, 64, 40);
    const pos = g.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const c = skyColor(norm([pos.getX(i), pos.getY(i), pos.getZ(i)]));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    O.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    O.sky.renderOrder = -10; O.sky.frustumCulled = false;
    scene.add(O.sky);
    O.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.sun, fog: false, depthWrite: false, toneMapped: false, transparent: true }));
    O.sunDisc.scale.set(23, 23, 1); O.sunDisc.renderOrder = -8; scene.add(O.sunDisc);
    // a warm additive halo: a tight bright core and a wide soft bloom
    const halo = (col, op) => new THREE.Sprite(new THREE.SpriteMaterial({ map: X.glow, color: col, fog: false, depthWrite: false, depthTest: true, toneMapped: false, transparent: true, opacity: op, blending: THREE.AdditiveBlending }));
    O.sunGlow = halo(0xffc070, 0.95); O.sunGlow.scale.set(78, 78, 1); O.sunGlow.renderOrder = -9; scene.add(O.sunGlow);
    O.sunBloom = halo(0xff9a4a, 0.55); O.sunBloom.scale.set(230, 230, 1); O.sunBloom.renderOrder = -9.5; scene.add(O.sunBloom);
    // flat Minecraft clouds, pink underneath
    const top = new Geo(), rest = new Geo(), cr = E.rng(9);
    for (let i = 0; i < 46; i++) {
      const a = cr() * Math.PI * 2, rr = 90 + cr() * 260;
      const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, n = 2 + Math.floor(cr() * 3);
      for (let k = 0; k < n; k++) {
        const x = cx + (cr() - 0.5) * 30, z = cz + (cr() - 0.5) * 18, w = 14 + cr() * 26, d = 9 + cr() * 14;
        top.face('+y', x - w / 2, 92, z - d / 2, x + w / 2, 96, z + d / 2);
        for (const f of ['-y', '+x', '-x', '+z', '-z']) rest.face(f, x - w / 2, 92, z - d / 2, x + w / 2, 96, z + d / 2);
      }
    }
    const cm = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false });
    O.clouds = new THREE.Group();
    O.clouds.add(top.mesh(cm(0xffd2b8)), rest.mesh(cm(0xf6a2a0)));
    scene.add(O.clouds);
  }
  scene.fog = new THREE.Fog(new THREE.Color(FOG), 95, 360);
  O.hemi = new THREE.HemisphereLight(0xffc6b0, 0x5a4054, 1.25); scene.add(O.hemi);
  O.sun = E.sun(0xffa45e, 2.7, [0, 50, 0], 50);
  O.sun.shadow.camera.far = 320;
  O.fill = new THREE.DirectionalLight(0x9aa8ff, 0.45); O.fill.position.set(40, 30, -30); scene.add(O.fill);

  buildWorld(scene, M, X);

  // ---- 1DEX1
  O.rig = E.makePlayer(E.tex.skin);
  scene.add(O.rig.root);

  // ---- end-screen camera: he stands on the top floor walkway, the camera floats in front of the farm
  O.END_P = [HX - 3.3, TOP + 1.9, HZ_STAND + 9.0];
  O.END_L = aim(O.END_P, [HX, TOP + 1.0, HZ_STAND], 1738, 795);
  O.END_FACE = Math.atan2(O.END_P[0] - HX, O.END_P[2] - HZ_STAND);

  buildUI(X);
}

/** a look-at point that puts world point `target` at screen (sx, sy) for a camera at p */
function aim(p, target, sx, sy) {
  const cam = E.camera, L = v3(target);
  cam.position.set(p[0], p[1], p[2]);
  for (let i = 0; i < 40; i++) {
    cam.lookAt(L); cam.updateMatrixWorld();
    const [px, py] = proj(target);
    const ex = sx - px, ey = sy - py;
    if (Math.abs(ex) + Math.abs(ey) < 0.3) break;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const d = cam.position.distanceTo(v3(target));
    const upp = 2 * d * Math.tan(cam.fov * Math.PI / 360) / H;
    L.addScaledVector(right, -ex * upp).addScaledVector(up, ey * upp);
  }
  return [L.x, L.y, L.z];
}

// ---------------------------------------------------------------- HTML overlays
const MONEY = { x: 960, y: 575, size: 112, upY: 215, upS: 0.7 };
const BTN = { x: 960, y: 620, w: 840, h: 104 };
const BIG = { x: 560, y: 560, w: 760, h: 428 };
const SUB = { x: 1380, y: 560, w: 300, h: 300 };
const TOAST = { right: 44, top: 60, w: 820, h: 156 };

function buildUI(X) {
  const ui = E.ui;
  const full = { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none' };
  O.vignette = div(ui, Object.assign({}, full, { background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 62%, rgba(46,12,8,0.3) 100%)' }));
  // results: only a soft band behind the text gets darker (the farm, its torches and the sun stay bright)
  O.dimRes = div(ui, Object.assign({}, full, { background: 'radial-gradient(ellipse 52% 40% at 50% 47%, rgba(12,4,16,0.36) 0%, rgba(12,4,16,0.26) 50%, rgba(12,4,16,0.08) 85%, rgba(12,4,16,0) 100%)', opacity: 0 }));
  // the menu: a stronger Minecraft-menu dim
  O.dim = div(ui, Object.assign({}, full, { background: 'radial-gradient(ellipse 62% 48% at 50% 50%, rgba(12,4,16,0.58) 0%, rgba(12,4,16,0.4) 55%, rgba(12,4,16,0.12) 100%)', opacity: 0 }));
  O.endDim = div(ui, Object.assign({}, full, { background: 'linear-gradient(90deg, rgba(8,4,18,0.62) 0%, rgba(8,4,18,0.5) 55%, rgba(8,4,18,0.16) 78%, rgba(8,4,18,0) 90%)', opacity: 0 }));
  O.layer = div(ui, Object.assign({}, full));          // shakes on the slam

  // ---- results
  O.plate = E.plate([{ text: 'ИТОГ' }, { text: 'ФЕРМЫ', bg: '#111', size: 68 }], { x: 960, y: 168, size: 124, rot: -3 });
  O.layer.appendChild(O.plate);
  O.floors = E.pixelText('', { x: 960, y: 372, size: 54, color: '#fff', outline: 5 });
  O.floors.innerHTML = 'ЭТАЖЕЙ: <span style="color:#ffd84a">10</span>';
  O.layer.appendChild(O.floors);
  op(O.floors, 0);
  // rays + glow behind the money
  O.rays = div(O.layer, {
    position: 'absolute', left: MONEY.x + 'px', top: MONEY.y + 'px', width: '1700px', height: '1700px', marginLeft: '-850px', marginTop: '-850px',
    background: 'repeating-conic-gradient(from 0deg, rgba(150,255,170,0.34) 0deg 6deg, rgba(150,255,170,0) 6deg 15deg)',
    WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 8%, rgba(0,0,0,0.55) 26%, rgba(0,0,0,0) 56%)',
    maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 8%, rgba(0,0,0,0.55) 26%, rgba(0,0,0,0) 56%)', opacity: 0,
  });
  O.mglow = div(O.layer, {
    position: 'absolute', left: MONEY.x + 'px', top: MONEY.y + 'px', width: '1500px', height: '520px', marginLeft: '-750px', marginTop: '-260px',
    background: 'radial-gradient(ellipse at center, rgba(70,255,120,0.42) 0%, rgba(70,255,120,0.16) 38%, rgba(70,255,120,0) 68%)', opacity: 0,
  });
  O.burstLayer = div(O.layer, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px' });
  O.money = E.moneyText({ x: MONEY.x, y: MONEY.y, size: MONEY.size });
  O.layer.appendChild(O.money);
  O.money.dataset.shadow = O.money.style.textShadow;
  O.money.style.willChange = 'transform';
  op(O.money, 0);
  // the shine: the same text, filled with a moving white band
  O.shine = div(O.layer, {
    position: 'absolute', left: MONEY.x + 'px', top: MONEY.y + 'px', fontFamily: 'Pixel', fontSize: MONEY.size + 'px', lineHeight: 1, whiteSpace: 'nowrap',
    color: 'transparent', WebkitTextFillColor: 'transparent',
    backgroundImage: 'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 42%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 58%, rgba(255,255,255,0) 100%)',
    backgroundSize: '250% 100%', backgroundRepeat: 'no-repeat', WebkitBackgroundClip: 'text', backgroundClip: 'text', opacity: 0,
  });
  O.shine.dataset.size = MONEY.size;
  E.setMoney(O.shine, 50000000);
  // the burst of green dollars and cubes
  O.burst = [];
  {
    const r = E.rng(404);
    const greens = ['#4dff7a', '#7dffa0', '#2fd85c', '#b6ffc8', '#38f070'];
    for (let i = 0; i < 64; i++) {
      const dollar = i < 30;
      const a = (i / 64) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const sp = 650 + r() * 1100;
      const size = dollar ? 34 + r() * 50 : 12 + r() * 18;
      const col = greens[Math.floor(r() * greens.length)];
      const e = dollar
        ? div(O.burstLayer, { position: 'absolute', left: '0', top: '0', fontFamily: 'Pixel', fontSize: size + 'px', color: col, lineHeight: 1, opacity: 0, textShadow: E.outlineShadow(Math.max(3, size / 14), '#06260f') + `, 0 0 ${size * 0.6}px rgba(80,255,120,0.8)` }, '$')
        : div(O.burstLayer, { position: 'absolute', left: '0', top: '0', width: size + 'px', height: size + 'px', background: col, boxShadow: `inset -${size / 4}px -${size / 4}px 0 rgba(0,60,20,0.45), inset ${size / 5}px ${size / 5}px 0 rgba(255,255,255,0.45), 0 0 0 3px #06260f, 0 0 ${size}px rgba(80,255,120,0.7)`, opacity: 0 });
      O.burst.push({ e, x0: MONEY.x + (r() - 0.5) * 560, y0: MONEY.y + (r() - 0.5) * 50, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 420, rot: (r() - 0.5) * 720, life: 0.9 + r() * 0.7, size, delay: r() * 0.08 });
    }
  }

  // ---- the Minecraft menu: title, button, cursor
  O.title = E.pixelText('Последнее достижение', { x: 960, y: 500, size: 42, color: '#fff', outline: 4 });
  op(O.title, 0);
  O.btnURL = { normal: buttonURL('normal'), hover: buttonURL('hover'), press: buttonURL('press') };
  O.btn = div(ui, {
    position: 'absolute', left: BTN.x + 'px', top: BTN.y + 'px', width: BTN.w + 'px', height: BTN.h + 'px', marginLeft: -BTN.w / 2 + 'px', marginTop: -BTN.h / 2 + 'px',
    backgroundImage: `url(${O.btnURL.normal})`, backgroundSize: '100% 100%', imageRendering: 'pixelated',
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', opacity: 0,
  });
  O.btnText = div(O.btn, { fontFamily: 'Pixel', fontSize: '42px', color: '#fff', textShadow: '5px 5px 0 #3f3f3f', marginTop: '-2px', whiteSpace: 'nowrap' }, 'Подписаться');
  O.btnState = 'normal';
  O.ripple = div(ui, { position: 'absolute', left: '0', top: '0', width: '20px', height: '20px', border: '6px solid #fff', borderRadius: '50%', opacity: 0, boxSizing: 'border-box' });
  O.cursor = document.createElement('img');
  O.cursor.src = E.CURSOR;
  Object.assign(O.cursor.style, { position: 'absolute', left: '0', top: '0', width: '62px', height: '88px', imageRendering: 'pixelated', transformOrigin: '0 0', filter: 'drop-shadow(5px 6px 0 rgba(0,0,0,0.35))', opacity: 0 });
  ui.appendChild(O.cursor);

  // ---- the advancement toast
  O.toast = div(ui, {
    position: 'absolute', left: (W - TOAST.right - TOAST.w) + 'px', top: TOAST.top + 'px', width: TOAST.w + 'px', height: TOAST.h + 'px',
    background: 'linear-gradient(180deg, #2a2a2a 0%, #1b1b1b 100%)', borderRadius: '12px',
    boxShadow: '0 0 0 4px #000, inset 0 0 0 4px #5e5e5e, inset 0 0 0 8px #262626, 0 14px 34px rgba(0,0,0,0.55)', opacity: 0, overflow: 'visible',
  });
  const bell = E.pixelArt([
    '.......XX.......',
    '......XooX......',
    '......XXXX......',
    '.....XLYYOX.....',
    '....XLWYYYOX....',
    '....XLYYYYOX....',
    '...XLWYYYYYOX...',
    '...XLYYYYYYOX...',
    '...XLYYYYYYOX...',
    '..XLYYYYYYYYOX..',
    '..XLYYYYYYYYOX..',
    '.XLYYYYYYYYYYOX.',
    'XDOOOOOOOOOOOODX',
    '.XXXXXXXXXXXXXX.',
    '......XDDX......',
    '.......XX.......'], { X: '#3a2400', L: '#fff1a0', W: '#ffffff', Y: '#f7c935', O: '#d08f16', D: '#8a5604', o: '#6b6b6b' }, 5);
  O.bellBox = div(O.toast, { position: 'absolute', left: '30px', top: '33px', width: '90px', height: '90px', transformOrigin: '50% 8%' });
  const bi = document.createElement('img'); bi.src = bell;
  Object.assign(bi.style, { width: '90px', height: '90px', imageRendering: 'pixelated', filter: 'drop-shadow(0 0 10px rgba(255,210,80,0.6))' });
  O.bellBox.appendChild(bi);
  div(O.toast, { position: 'absolute', left: '146px', top: '36px', fontFamily: 'Pixel', fontSize: '30px', color: '#ffff55', textShadow: '3px 3px 0 #3f3f15', whiteSpace: 'nowrap' }, 'Достижение получено!');
  div(O.toast, { position: 'absolute', left: '146px', top: '90px', fontFamily: 'Pixel', fontSize: '30px', color: '#ffffff', textShadow: '3px 3px 0 #3f3f3f', whiteSpace: 'nowrap' }, 'Подписка на 1DEX1');
  O.toastShine = div(O.toast, { position: 'absolute', inset: '0', borderRadius: '12px', background: 'linear-gradient(105deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 65%)', backgroundSize: '300% 100%', backgroundRepeat: 'no-repeat', opacity: 0 });
  const spark = E.pixelArt([
    '...Y...',
    '...Y...',
    '..YWY..',
    'YYWWWYY',
    '..YWY..',
    '...Y...',
    '...Y...'], { Y: '#ffe45c', W: '#ffffff' }, 6);
  O.sparks = [];
  {
    const r = E.rng(77);
    for (let i = 0; i < 14; i++) {
      const img = document.createElement('img'); img.src = spark;
      const s = 0.6 + r() * 0.8;
      Object.assign(img.style, { position: 'absolute', left: '0', top: '0', width: 42 * s + 'px', height: 42 * s + 'px', marginLeft: -21 * s + 'px', marginTop: -21 * s + 'px', imageRendering: 'pixelated', opacity: 0, filter: 'drop-shadow(0 0 8px rgba(255,230,120,0.9))' });
      O.toast.appendChild(img);
      // around the toast's edge
      const side = r();
      let x, y;
      if (side < 0.4) { x = r() * TOAST.w; y = -14 + r() * 10; }
      else if (side < 0.8) { x = r() * TOAST.w; y = TOAST.h + 4 + r() * 14; }
      else { x = -18 + r() * 10; y = r() * TOAST.h; }
      O.sparks.push({ e: img, x, y, t0: T.toast + 0.25 + (i / 14) * 2.6 + r() * 0.15, life: 0.55 + r() * 0.3 });
    }
  }

  // ---- end screen: inventory-slot frames
  O.frames = [];
  for (const [F, label] of [[BIG, 'СЛЕДУЮЩЕЕ ВИДЕО'], [SUB, 'ПОДПИСКА']]) {
    const B = 18;
    const panel = div(ui, {
      position: 'absolute', left: F.x - F.w / 2 - B + 'px', top: F.y - F.h / 2 - B + 'px', width: F.w + 2 * B + 'px', height: F.h + 2 * B + 'px',
      background: '#c6c6c6', boxShadow: '0 0 0 4px #000, inset 5px 5px 0 #ffffff, inset -5px -5px 0 #555555, 0 18px 40px rgba(0,0,0,0.55)', opacity: 0,
    });
    div(panel, {
      position: 'absolute', left: B - 4 + 'px', top: B - 4 + 'px', width: F.w + 8 + 'px', height: F.h + 8 + 'px',
      background: 'radial-gradient(ellipse at 50% 40%, #2a2a2e 0%, #18181b 70%, #121214 100%)', boxShadow: 'inset 4px 4px 0 #373737, inset -4px -4px 0 #ffffff',
    });
    const cap = E.pixelText(label, { x: F.x, y: F.y - F.h / 2 - B - 44, size: F === BIG ? 40 : 36, color: '#fff', outline: 4 });
    op(cap, 0);
    O.frames.push({ panel, cap, F });
  }
  // dust motes in the warm light (end screen)
  O.motes = [];
  {
    const r = E.rng(91);
    for (let i = 0; i < 22; i++) {
      const s = 4 + Math.floor(r() * 3) * 2;
      const e = div(ui, { position: 'absolute', left: '0', top: '0', width: s + 'px', height: s + 'px', background: i % 3 ? '#ffd58a' : '#fff3c8', boxShadow: `0 0 ${s * 2}px rgba(255,200,120,0.9)`, opacity: 0 });
      O.motes.push({ e, x: 1560 + r() * 360, y: 300 + r() * 760, sp: 18 + r() * 30, ph: r() * 6.28, amp: 10 + r() * 22 });
    }
  }
  // flash on top of everything
  O.flash = E.flash();
}

// ---------------------------------------------------------------- camera
const OPEN = {
  p: [[HX + 1.55, TOP + 1.35, 19.2], [HX + 6.5, TOP + 2.6, 33], [HX + 30, 40, 76], [HX + 44, 37, 92]],
  l: [[HX - 0.15, TOP + 0.62, 15.0], [HX - 2.5, TOP - 0.4, 10], [0, 17, 0], [-3, 15, 0]],
};
const DRIFT = { p: [HX + 33, 35, 99], l: [-5, 15, -1] };

/**
 * The pull-back runs evenly in log-distance from him (so his size shrinks at a steady visual rate instead of
 * collapsing in the first second): OPEN_LOG maps the bezier parameter to log(distance), pullK() inverts it.
 */
const HERO_C = [HX, TOP + 0.4, 15.2];
let OPEN_LOG = null;
function pullK(u) {
  if (!OPEN_LOG) {
    OPEN_LOG = [];
    for (let i = 0; i <= 400; i++) {
      const p = bez(...OPEN.p, i / 400);
      OPEN_LOG.push(Math.log(Math.hypot(p[0] - HERO_C[0], p[1] - HERO_C[1], p[2] - HERO_C[2])));
    }
  }
  const N = OPEN_LOG.length - 1, want = E.lerp(OPEN_LOG[0], OPEN_LOG[N], u);
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (OPEN_LOG[m] < want) lo = m; else hi = m; }
  const f = E.clamp((want - OPEN_LOG[lo]) / Math.max(1e-9, OPEN_LOG[hi] - OPEN_LOG[lo]));
  return (lo + f) / N;
}
function cameraPose(t) {
  if (t < T.reveal) {
    // a tiny drift while he looks at us, then the even pull-back (eased at both ends)
    const s = E.seg(t, T.pull0, T.reveal), smooth = s * s * (3 - 2 * s);
    const u = 0.04 * E.ease.out(E.seg(t, 0, T.reveal)) + 0.96 * smooth;    // both parts come to rest at T.reveal
    const k = pullK(u);
    return { p: bez(...OPEN.p, k), l: bez(...OPEN.l, k) };
  }
  if (t < 8.35) {
    const k = sm(t, T.reveal, 8.35);
    return { p: mix3(OPEN.p[3], DRIFT.p, k), l: mix3(OPEN.l[3], DRIFT.l, k) };
  }
  const EP = O.END_P, EL = O.END_L;
  if (t < T.land) {
    const k = sm(t, 8.35, T.land);
    const p = bez(DRIFT.p, [HX + 20, 44, 72], [EP[0] + 7, EP[1] + 5, EP[2] + 16], EP, k);
    const l = bez(DRIFT.l, [-2, 16, 0], [EL[0] + 2, EL[1] + 1, EL[2]], EL, k);
    return { p, l };
  }
  // end screen: a very gentle float
  const u = t - T.land, a = E.clamp(u / 1.5);
  return {
    p: [EP[0] + Math.sin(u * 0.55) * 0.06 * a, EP[1] + Math.sin(u * 0.8) * 0.03 * a, EP[2] - u * 0.012],
    l: EL,
  };
}

function shake(t) {
  const imp = [[T.slam, 1, 50, 7]];
  let x = 0, y = 0;
  for (const [t0, a, f, d] of imp) {
    if (t < t0 || t > t0 + 0.8) continue;
    const dt = t - t0, e = a * Math.exp(-dt * d);
    x += e * Math.sin(dt * f); y += e * Math.cos(dt * f * 1.3);
  }
  return [x, y];
}

function updateCamera(t) {
  const pose = cameraPose(t);
  const cam = E.camera;
  const [sx, sy] = shake(t);
  cam.position.set(pose.p[0] + sx * 0.9, pose.p[1] + sy * 0.9, pose.p[2]);
  let fov = 40;
  if (t >= T.slam) fov -= 3 * Math.exp(-(t - T.slam) * 6) * Math.cos((t - T.slam) * 9);
  if (Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.lookAt(pose.l[0] + sx * 0.5, pose.l[1] + sy * 0.5, pose.l[2]);
  cam.updateMatrixWorld();
  // sky things follow the camera
  O.sky.position.copy(cam.position);
  O.sunDisc.position.set(cam.position.x + SUNV[0] * 400, cam.position.y + SUNV[1] * 400, cam.position.z + SUNV[2] * 400);
  O.sunGlow.position.copy(O.sunDisc.position);
  O.sunBloom.position.copy(O.sunDisc.position);
  O.clouds.position.set(cam.position.x * 0.9 + t * 1.2, 0, cam.position.z * 0.9);
  return [sx, sy];
}

function updateLight(t) {
  // the shadow box: small around him in the close shots, big over the farm in the wide ones
  const wide = t < T.reveal ? sm(t, 1.8, 3.9) : t < 8.35 ? 1 : 1 - sm(t, 8.6, 12.4);
  const focus = mix3([HX, TOP, 15], [0, 10, 0], wide);
  const size = E.lerp(9, 52, wide);
  O.sun.position.set(focus[0] + SUNL[0] * 120, focus[1] + SUNL[1] * 120, focus[2] + SUNL[2] * 120);
  O.sun.target.position.set(focus[0], focus[1], focus[2]);
  O.sun.target.updateMatrixWorld();
  const sc = O.sun.shadow.camera;
  if (Math.abs(sc.right - size) > 1e-3) { sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.updateProjectionMatrix(); }
  O.torchGlow.material.opacity = 0.5 + 0.05 * Math.sin(t * 6.3);
}

// ---------------------------------------------------------------- 1DEX1
function resetRig(r) {
  for (const p of [r.head, r.body, r.armL, r.armR, r.legL, r.legR]) p.rotation.set(0, 0, 0);
  r.root.rotation.set(0, 0, 0);
}
function lookAtCam(r, yawBase, k = 1, y = TOP + 1.62) {
  const c = E.camera.position, p = r.root.position;
  let yaw = Math.atan2(c.x - p.x, c.z - p.z) - yawBase;
  while (yaw > Math.PI) yaw -= 2 * Math.PI;
  while (yaw < -Math.PI) yaw += 2 * Math.PI;
  r.head.rotation.y += E.clamp(yaw, -0.9, 0.9) * k;
  r.head.rotation.x += E.clamp(-Math.atan2(c.y - y, Math.hypot(c.x - p.x, c.z - p.z)), -0.6, 0.6) * k;
}
/**
 * waving arm, amount a: the right arm (screen left when he faces the camera), so the hand swings toward the
 * frames ("look here") and never out of the picture on the right
 */
function wave(r, t, t0, a) {
  r.armR.rotation.z -= a * (2.78 + Math.sin((t - t0) * 10) * 0.24);
  r.armR.rotation.x += a * -0.22;
}

function updateHero(t) {
  const r = O.rig;
  resetRig(r);
  const sitK = 1 - sm(t, T.stand0, T.stand1);           // 1 sitting, 0 standing
  const hop = Math.sin(Math.PI * E.seg(t, T.stand0, T.stand1)) * 0.32;
  // position
  const yS = TOP - 0.75, yU = TOP;
  r.root.position.set(HX, E.lerp(yU, yS, sitK) + hop, E.lerp(HZ_STAND, HZ_SIT, sitK));
  // facing: sitting he faces out (+z); standing he faces the end camera
  const face = E.lerp(O.END_FACE, 0.08, sitK);
  r.root.rotation.y = face;
  // legs: dangling and kicking while he sits
  const kick = Math.sin(t * 2.6) * 0.22;
  r.legR.rotation.x = sitK * (-1.12 + kick);
  r.legL.rotation.x = sitK * (-1.12 - kick);
  r.legR.rotation.z = sitK * 0.05; r.legL.rotation.z = -sitK * 0.05;
  // arms: leaning on his hands while sitting, relaxed idle while standing
  r.armR.rotation.x = sitK * 0.32 + (1 - sitK) * Math.sin(t * 1.7) * 0.04;
  r.armL.rotation.x = sitK * 0.32 - (1 - sitK) * Math.sin(t * 1.7) * 0.04;
  r.armR.rotation.z = -sitK * 0.16 - (1 - sitK) * (0.06 + Math.sin(t * 2.2) * 0.03);
  r.armL.rotation.z = sitK * 0.16 + (1 - sitK) * (0.06 + Math.sin(t * 2.2) * 0.03);
  r.body.rotation.x = sitK * -0.04;
  // head: first looks into the sunset, then at the camera
  {
    const k = sm(t, T.look0, T.look1);
    r.head.rotation.y = 0.5 * (1 - k) + Math.sin(t * 0.9) * 0.04 * sitK;
    r.head.rotation.x = -0.1 * (1 - k);
    lookAtCam(r, face, k, E.lerp(TOP + 1.62, TOP + 0.87, sitK));
    r.head.rotation.z = 0.06 * k * sitK;
  }
  if (t < T.stand0) return;

  // --- standing on the top floor
  // "Жми!" - a big wave at the camera
  const hiA = sm(t, T.hi0, T.hi0 + 0.3, 'out') * (1 - sm(t, T.hi1 - 0.3, T.hi1));
  if (hiA > 0) wave(r, t, T.hi0, hiA);
  // end screen: wave, point at the frames, wave, idle
  const wA = sm(t, T.wave0, T.wave0 + 0.3, 'out') * (1 - sm(t, T.wave1 - 0.3, T.wave1));
  if (wA > 0) wave(r, t, T.wave0, wA);
  const pA = sm(t, T.point0, T.point0 + 0.45) * (1 - sm(t, T.point1 - 0.4, T.point1));
  if (pA > 0) {
    // turns toward the frames (screen left) and points up-left with the right arm: first at "ПОДПИСКА",
    // then he swings further round to "СЛЕДУЮЩЕЕ ВИДЕО"; a jab at each
    const b = sm(t, T.pointB0, T.pointB1);
    r.root.rotation.y = face - (0.95 + 0.4 * b) * pA;
    const jab = (Math.max(0, Math.sin((t - T.jab0) * Math.PI * 2.5)) * 0.2) * E.seg(t, T.jab0, T.jab0 + 0.05);
    r.armR.rotation.x = E.lerp(r.armR.rotation.x, E.lerp(-2.3, -1.88, b) - jab, pA);
    r.armR.rotation.z = E.lerp(r.armR.rotation.z, -0.12, pA);
    r.armL.rotation.x += 0.12 * pA; r.armL.rotation.z += 0.05 * pA;
    // the head looks along the arm, then glances back at the camera
    r.head.rotation.set(0, 0, 0);
    const glance = sm(t, T.glance0, T.glance0 + 0.3) * (1 - sm(t, T.point1 - 0.35, T.point1));
    lookAtCam(r, r.root.rotation.y, 0.3 + 0.7 * glance);
    r.head.rotation.y += (1 - glance) * -0.2 * pA;
    r.head.rotation.x += (1 - glance) * -0.18 * pA;
  }
  const w2 = sm(t, T.wave2, T.wave2 + 0.3, 'out') * (1 - sm(t, T.wave3 - 0.3, T.wave3));
  if (w2 > 0) wave(r, t, T.wave2, w2 * 0.85);
  // idle after: a little sway and a nod
  if (t > T.wave3) {
    const u = t - T.wave3;
    r.body.rotation.z = Math.sin(u * 1.6) * 0.02;
    r.head.rotation.z += Math.sin(u * 1.3) * 0.05;
    r.head.rotation.x += Math.sin(u * 2.1) * 0.03;
  }
}

// ---------------------------------------------------------------- UI updates
/** the counter: "$0" for a beat, then up from zero (19, 150, 2 000, 40 000 ...), faster and faster, to the slam */
function countValue(t) {
  if (t >= T.slam) return 50000000;
  if (t <= T.count0) return 0;
  const k = E.seg(t, T.count0, T.slam);
  const v = 50000000 * Math.pow(k, 3);
  const rate = 50000000 * 3 * k * k / (T.slam - T.count0);      // per second
  // the low digits flicker like a fast counter (at most one frame's worth, so the number never goes down)
  const r = E.rng(Math.floor(t * 60) * 13 + 7);
  return Math.floor(v + r() * Math.min(rate / 60, 999999) * E.seg(t, T.count0, T.count0 + 0.4));
}

let lastMoney = -1;
function updateMoney(t) {
  const m = O.money;
  if (t < T.money || t > T.moneyOut + 0.3) { op(m, 0); op(O.shine, 0); op(O.rays, 0); op(O.mglow, 0); return; }
  const v = countValue(t);
  if (v !== lastMoney) { E.setMoney(m, v); lastMoney = v; }
  const k = E.seg(t, T.count0, T.slam);
  const rate = t < T.slam && t > T.count0 ? E.clamp(Math.pow(k, 2.1) * 1.2) : 0;
  // digits blur while it runs fast
  const kids = m.children;
  for (let i = 1; i < kids.length; i++) {
    const fromEnd = kids.length - 1 - i;   // 0: the last group
    const b = fromEnd === 0 ? 4.2 * E.clamp(rate * 2 + 0.3 * (t > T.count0 && t < T.slam)) : fromEnd === 1 ? 3 * E.clamp((rate - 0.3) * 1.6) : 0;
    kids[i].style.display = 'inline-block';
    if (b > 0.05) {
      const jy = (E.rng(Math.floor(t * 60) * 3 + i)() - 0.5) * 10 * b / 3;
      kids[i].style.filter = `blur(${b.toFixed(2)}px)`;
      kids[i].style.transform = `translateY(${jy.toFixed(1)}px)`;
    } else { kids[i].style.filter = 'none'; kids[i].style.transform = 'none'; }
  }
  // scale: pop in, swell while counting, punch on the slam, then move up, then leave
  const dt = t - T.slam;
  let s = E.ease.outBack(E.seg(t, T.money, T.money + 0.35));
  s *= 1 + 0.07 * E.ease.in(k) * (t < T.slam ? 1 : 0);
  if (dt >= 0) {
    if (dt < 0.07) s *= 1 + 0.35 * E.ease.out(dt / 0.07);
    else { const u = dt - 0.07; s *= 1 + 0.35 * Math.exp(-u * 6.5) * Math.cos(u * 15); }
  }
  const up = sm(t, T.up0, T.up1);
  s *= E.lerp(1, MONEY.upS, up);
  const y = E.lerp(MONEY.y, MONEY.upY, up);
  let o = E.clamp(E.seg(t, T.money, T.money + 0.1));
  if (t > T.moneyOut) { const q = E.seg(t, T.moneyOut, T.moneyOut + 0.28); s *= 1 + 0.25 * q; o *= 1 - q; }
  // a tremble that grows while it counts
  const tr = t < T.slam && t > T.count0 ? Math.pow(k, 3) * 6 : 0;
  const r = E.rng(Math.floor(t * 60) * 5 + 1);
  const jx = (r() - 0.5) * tr, jy = (r() - 0.5) * tr;
  const tf = `translate(-50%,-50%) translate(${(jx).toFixed(1)}px, ${(jy).toFixed(1)}px) scale(${s.toFixed(4)})`;
  m.style.top = y + 'px';
  m.style.transform = tf;
  op(m, o);
  // colour + glow: white-hot on the hit, then a strong green glow that settles
  const hot = dt >= 0 ? Math.exp(-dt * 10) : 0;
  const g = dt >= 0 ? 0.35 + 0.65 * Math.exp(-dt * 2.2) : 0.15 * k;
  m.style.color = dt >= 0 && dt < 0.05 ? '#ffffff' : '#4dff7a';
  m.style.textShadow = m.dataset.shadow + `, 0 0 ${(40 + 90 * g).toFixed(0)}px rgba(90,255,130,${(0.35 + 0.5 * g).toFixed(2)}), 0 0 ${(12 + 20 * hot).toFixed(0)}px rgba(255,255,255,${(0.6 * hot).toFixed(2)})`;
  // the shine follows the money
  O.shine.style.top = y + 'px';
  O.shine.style.transform = `translate(-50%,-50%) scale(${s.toFixed(4)})`;
  const sweep = (t0) => E.seg(t, t0, t0 + 0.5);
  let sh = -1;
  if (t >= T.slam + 0.12 && t < T.slam + 0.62) sh = sweep(T.slam + 0.12);
  else if (t >= 8.95 && t < 9.45) sh = sweep(8.95);
  if (sh >= 0) { O.shine.style.backgroundPosition = `${(100 - E.ease.inOut(sh) * 100).toFixed(1)}% 0`; op(O.shine, o); }
  else op(O.shine, 0);
  // rays and glow behind
  const ra = dt >= 0 ? E.clamp(dt / 0.12) : 0;
  O.rays.style.top = y + 'px'; O.mglow.style.top = y + 'px';
  O.rays.style.transform = `rotate(${(t * 14).toFixed(2)}deg) scale(${(E.lerp(1, 0.75, up) * (0.8 + 0.2 * E.ease.out(ra))).toFixed(3)})`;
  op(O.rays, ra * o * (0.85 + 0.15 * Math.sin(t * 5)) * (1 - 0.55 * up));
  O.mglow.style.transform = `scale(${(E.lerp(1, 0.75, up) * (1 + 0.2 * hot)).toFixed(3)})`;
  op(O.mglow, o * (0.35 + 0.65 * (dt >= 0 ? 1 : k)));
}

function updateBurst(t) {
  for (const p of O.burst) {
    const dt = t - T.slam - p.delay;
    if (dt < 0 || dt > p.life) { if (p.e.style.opacity !== '0') p.e.style.opacity = '0'; continue; }
    const x = p.x0 + p.vx * dt, y = p.y0 + p.vy * dt + 0.5 * 2100 * dt * dt;
    const k = dt / p.life;
    const s = (0.4 + 0.6 * E.ease.out(E.clamp(dt * 8))) * (1 - 0.3 * k);
    p.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) rotate(${(p.rot * dt).toFixed(1)}deg) scale(${s.toFixed(3)})`;
    op(p.e, 1 - k * k);
  }
}

function setBtn(state) {
  if (O.btnState === state) return;
  O.btnState = state;
  O.btn.style.backgroundImage = `url(${O.btnURL[state]})`;
  O.btnText.style.color = state === 'normal' ? '#ffffff' : state === 'hover' ? '#ffffa0' : '#e8e890';
}

function cursorPos(t) {
  const k = sm(t, T.cur0, T.cur1);
  const p = bez([1660, 1120], [1600, 780], [1330, 660], [1248, 640], k);
  // after arriving it settles with a tiny drift
  const u = Math.max(0, t - T.cur1);
  return [p[0] + Math.sin(u * 3) * 3 * E.clamp(u * 3), p[1] + Math.sin(u * 2.3) * 2 * E.clamp(u * 3)];
}

function updateMenu(t) {
  // background blur like a Minecraft menu
  const bk = sm(t, T.blur0, T.blur1) * (1 - sm(t, T.unblur0, T.unblur1));
  const cv = E.renderer.domElement;
  const f = bk > 0.01 ? `blur(${(bk * 7).toFixed(2)}px) saturate(${(1 - 0.15 * bk).toFixed(3)})` : 'none';
  if (cv.style.filter !== f) cv.style.filter = f;
  const tf = bk > 0.01 ? `scale(${(1 + 0.03 * bk).toFixed(4)})` : 'none';
  if (cv.style.transform !== tf) cv.style.transform = tf;
  // dim: results, menu; off when we see him again
  const dres = sm(t, T.plate - 0.1, T.plate + 0.4);
  op(O.dimRes, dres * (1 - bk) * (1 - sm(t, T.unblur0, T.unblur1)));
  op(O.dim, bk);

  // title + button
  const bIn = E.seg(t, T.btn, T.btn + 0.4);
  const bOut = E.seg(t, T.btnOut, T.btnOut + 0.28);
  if (t < T.btn || bOut >= 1) { op(O.btn, 0); }
  else {
    let s = E.ease.outBack(bIn) * (1 - 0.15 * E.ease.in(bOut));
    let dy = (1 - E.ease.out(bIn)) * 40;
    // press
    const pressed = t >= T.click - 0.03 && t < T.click + 0.14;
    if (pressed) dy += 5;
    // a little bounce after the click
    if (t > T.click + 0.14) s *= 1 + 0.06 * Math.exp(-(t - T.click - 0.14) * 7) * Math.sin((t - T.click - 0.14) * 22);
    O.btn.style.transform = `translateY(${dy.toFixed(1)}px) scale(${s.toFixed(4)})`;
    op(O.btn, E.clamp(bIn * 3) * (1 - bOut));
    const [cx, cy] = cursorPos(t);
    const inside = t > T.cur0 && Math.abs(cx - BTN.x) < BTN.w / 2 - 6 && Math.abs(cy - BTN.y) < BTN.h / 2 - 6;
    setBtn(pressed ? 'press' : inside ? 'hover' : 'normal');
  }
  // the menu title appears once the money has left
  const tIn = E.seg(t, T.title, T.title + 0.35);
  if (t < T.title || bOut >= 1) op(O.title, 0);
  else {
    O.title.style.transform = `translate(-50%,-50%) translateY(${((1 - E.ease.out(tIn)) * -20).toFixed(1)}px) scale(${(1 - 0.15 * E.ease.in(bOut)).toFixed(3)})`;
    op(O.title, E.ease.out(tIn) * (1 - bOut));
  }
  // cursor
  if (t < T.cur0 || t > T.btnOut + 0.3) op(O.cursor, 0);
  else {
    const [cx, cy] = cursorPos(t);
    const cs = t >= T.click - 0.03 && t < T.click + 0.12 ? 0.86 : 1;
    O.cursor.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) scale(${cs})`;
    op(O.cursor, E.clamp(E.seg(t, T.cur0, T.cur0 + 0.15)) * (1 - E.seg(t, T.btnOut, T.btnOut + 0.25)));
  }
  // click ripple
  const rk = E.seg(t, T.click, T.click + 0.45);
  if (t < T.click || rk >= 1) op(O.ripple, 0);
  else {
    const [cx, cy] = cursorPos(T.click);
    const d = 20 + 200 * E.ease.out(rk);
    O.ripple.style.width = d + 'px'; O.ripple.style.height = d + 'px';
    O.ripple.style.transform = `translate(${(cx - d / 2).toFixed(1)}px, ${(cy - d / 2).toFixed(1)}px)`;
    O.ripple.style.borderWidth = (8 * (1 - rk) + 1).toFixed(1) + 'px';
    op(O.ripple, 1 - rk);
  }
}

function updateResults(t) {
  E.popIn(O.plate, t, T.plate, T.resOut);
  // the floors line
  if (t < T.floors || t > T.resOut + 0.25) op(O.floors, 0);
  else {
    const k = E.seg(t, T.floors, T.floors + 0.3);
    const out = E.seg(t, T.resOut, T.resOut + 0.25);
    O.floors.style.transform = `translate(-50%,-50%) scale(${(E.ease.outBack(k) * (1 + 0.15 * out)).toFixed(3)})`;
    op(O.floors, E.clamp(k * 3) * (1 - out));
  }
}

function updateToast(t) {
  const tin = E.seg(t, T.toast, T.toast + 0.4), tout = E.seg(t, T.toastOut, T.toastOut + 0.32);
  if (t < T.toast || tout >= 1) { op(O.toast, 0); return; }
  const x = (1 - E.ease.out(tin)) * (TOAST.w + 80) + E.ease.in(tout) * (TOAST.w + 80);
  O.toast.style.transform = `translateX(${x.toFixed(1)}px)`;
  op(O.toast, 1);
  // the bell rings
  const u = t - T.toast - 0.3;
  const ang = u > 0 ? Math.sin(u * 16) * 22 * Math.exp(-u * 2.2) : 0;
  O.bellBox.style.transform = `rotate(${ang.toFixed(2)}deg) scale(${(1 + (u > 0 ? 0.25 * Math.exp(-u * 6) : 0)).toFixed(3)})`;
  // a glint over the panel
  const g = E.seg(t, T.toast + 0.35, T.toast + 0.95);
  if (g > 0 && g < 1) { O.toastShine.style.backgroundPosition = `${(100 - g * 100).toFixed(1)}% 0`; op(O.toastShine, 1); }
  else op(O.toastShine, 0);
  for (const s of O.sparks) {
    const k = E.seg(t, s.t0, s.t0 + s.life);
    if (t < s.t0 || k >= 1) { op(s.e, 0); continue; }
    const sc = Math.sin(Math.PI * k);
    s.e.style.transform = `translate(${s.x}px, ${(s.y - k * 14).toFixed(1)}px) rotate(${(k * 90).toFixed(1)}deg) scale(${sc.toFixed(3)})`;
    op(s.e, sc);
  }
}

function updateEnd(t) {
  op(O.endDim, sm(t, T.dim, T.dim + 0.6));
  O.frames.forEach((fr, i) => {
    const t0 = i === 0 ? T.frame1 : T.frame2, tc = i === 0 ? T.cap1 : T.cap2;
    const k = E.seg(t, t0, t0 + 0.45);
    if (t < t0) { op(fr.panel, 0); op(fr.cap, 0); return; }
    fr.panel.style.transform = `scale(${(0.6 + 0.4 * E.ease.outBack(k)).toFixed(4)})`;
    op(fr.panel, E.clamp(k * 3));
    const kc = E.seg(t, tc, tc + 0.4);
    // the caption he points at gets a little pulse
    const [p0, p1] = T.capPulse[i];
    const pulse = 1 + 0.12 * Math.sin(Math.PI * E.seg(t, p0, p1));
    fr.cap.style.transform = `translate(-50%,-50%) translateY(${((1 - E.ease.outBack(kc)) * 30).toFixed(1)}px) scale(${pulse.toFixed(3)})`;
    op(fr.cap, E.clamp(kc * 2.5));
  });
  for (const m of O.motes) {
    const a = sm(t, T.dim, T.dim + 1.2);
    if (a <= 0) { op(m.e, 0); continue; }
    const u = t - T.dim;
    let y = m.y - u * m.sp;
    y = 300 + ((y - 300) % 760 + 760) % 760;
    const x = m.x + Math.sin(u * 0.9 + m.ph) * m.amp;
    m.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    op(m.e, a * (0.35 + 0.35 * Math.sin(u * 2 + m.ph)));
  }
}

function updateFlash(t) {
  let f = 0;
  if (t >= T.slam) f = Math.max(f, 0.85 * Math.exp(-(t - T.slam) * 9));
  if (t >= T.click) f = Math.max(f, 0.12 * Math.exp(-(t - T.click) * 14));
  op(O.flash, f);
}

export function update(t, e) {
  E = e;
  const [sx, sy] = updateCamera(t);
  updateLight(t);
  updateHero(t);
  updateResults(t);
  updateMoney(t);
  updateBurst(t);
  updateMenu(t);
  updateToast(t);
  updateEnd(t);
  updateFlash(t);
  // the result layer shakes with the camera
  const tf = Math.abs(sx) + Math.abs(sy) > 0.002 ? `translate(${(sx * 26).toFixed(1)}px, ${(sy * 20).toFixed(1)}px)` : 'none';
  if (O.layer.style.transform !== tf) O.layer.style.transform = tf;
}
