// INTRO (teaser, 16 s): "Этот бот играет за меня сам..." -> the bot flattens a 70x30 field, plants berries,
// builds 10 floors (riding each one up), beats a creeper, fills the chests, the money counter glitches into "$???",
// white flash.
// Everything in update(t) is a pure function of t (caches only skip work when nothing changed).
// Note: the world is built from merged face meshes, not InstancedMesh: in software WebGL instancing is several
// times slower than plain merged geometry.
export const DURATION = 16;

let E, THREE;
const O = {};                       // scene objects
const FX0 = -35, FX1 = 35, FZ0 = -15, FZ1 = 15;     // the 70 x 30 field (block corners)
const FLOORS = 10, GAP = 3;
const P0 = [0.5, 0, 10.5];          // where 1DEX1 stands in the field (4 blocks from its front edge: seen when he rides the floors up)
const MY = 1;                       // the land around the field is one block higher: the field is dug down to y=0
const CH_Z = 58.5;                  // the chest row (centre z), out on the meadow: the farm stands whole behind it
const CH_X0 = -9;                   // centre x of the first of the 10 double chests (2 apart)
const SIT = [9.3, MY + 0.15, CH_Z - 0.12];          // where he sits (on the last chest, facing the farm)
const FIGHT = [-50.5, MY, 62.5];    // where he meets the creeper: out on the meadow, the whole tower behind him
const FA = 0.62;                    // heading of the fight camera (radians from -z toward +x): it looks at the tower

// ---------------------------------------------------------------- timing (seconds)
const T = {
  eyeOn: 0.40, pull0: 0.72, pull1: 1.6, plate1: 1.2, plate1Out: 2.35,
  dayA: 2.55, dayB: 3.5, wave0: 3.0, wave1: 4.45, plate70: 3.3, plate70Out: 5.55, dims: 4.2,
  bush0: 4.4, rowStep: 0.075,
  floors0: 6.0, rise: 0.2, slam0: 6.32, slamStep: 0.27,
  fight: 9.0, creepArrive: 9.5, turn0: 9.34, hit1: 9.72, hit2: 10.04, poof: 10.22,
  chests: 11.0, money0: 11.15, count0: 11.25, count1: 12.95, glitch1: 13.35,
  sit: 13.0, plateEnd: 13.85, eyes2: 15.12, flash0: 15.5, flash1: 15.78,
};
const landT = k => T.slam0 + (k - 2) * T.slamStep;   // floor k (2..10) slams into place
const riseT = k => landT(k) - T.rise;                // ... and starts rising out of the floor below

// ---------------------------------------------------------------- small helpers
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
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixHex = (a, b, k) => { const A = hexRGB(a), B = hexRGB(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',') + ')'; };
const isOdd = z => ((z % 2) + 2) % 2 === 1;
const angTo = (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const smooth = k => k * k * (3 - 2 * k);
let _o;
function setM(m, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  _o.position.set(x, y, z); _o.scale.set(sx, sy, sz); _o.rotation.set(rx, ry, rz); _o.updateMatrix();
  m.setMatrixAt(i, _o.matrix);
}
/** money as HTML with narrow gaps between the digit groups (the pixel font's space is a whole cell wide) */
function moneyHTML(prefix, v, size) {
  return `<span>${prefix}</span>` + E.groupDigits(v).split(' ').map((g, i) => `<span style="margin-left:${i ? size * 0.28 : 0}px">${g}</span>`).join('');
}

// the fight's own frame: dx to the right of the camera's view, dz toward the camera
const FF = [Math.sin(FA), 0, -Math.cos(FA)], FR = [Math.cos(FA), 0, Math.sin(FA)];
const F = (dx, dy, dz) => [FIGHT[0] + FR[0] * dx - FF[0] * dz, MY + dy, FIGHT[2] + FR[2] * dx - FF[2] * dz];

// ---------------------------------------------------------------- camera paths
// keyPose: eased segments, each with the ease of its end key
function keyPose(keys, t) {
  if (t <= keys[0].t) return { p: keys[0].p, l: keys[0].l, fov: keys[0].fov || 40 };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) {
      const k = b.e === 'lin' ? E.seg(t, a.t, b.t) : E.ease[b.e || 'inOut'](E.seg(t, a.t, b.t));
      return { p: mix3(a.p, b.p, k), l: mix3(a.l, b.l, k), fov: E.lerp(a.fov || 40, b.fov || 40, k) };
    }
  }
  const z = keys[keys.length - 1];
  return { p: z.p, l: z.l, fov: z.fov || 40 };
}
// a smooth path through the keys in TIME: cubic Hermite, the velocity at each inner key taken from the parabola
// through it and its neighbours (so the speed never jumps at a key, whatever the segment lengths). The first and
// last keys stop (velocity 0) unless marked free: then the path keeps its speed into the cut.
function hermitePose(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return { p: keys[0].p, l: keys[0].l, fov: keys[0].fov || 40 };
  if (t >= keys[n - 1].t) { const z = keys[n - 1]; return { p: z.p, l: z.l, fov: z.fov || 40 }; }
  let i = 0;
  while (t >= keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = (t - a.t) / h;
  const vel = (j, f) => {
    const K = keys[j];
    if (j === 0) return K.free ? [0, 1, 2].map(c => (f(keys[1])[c] - f(K)[c]) / (keys[1].t - K.t)) : [0, 0, 0];
    if (j === n - 1) return K.free ? [0, 1, 2].map(c => (f(K)[c] - f(keys[j - 1])[c]) / (K.t - keys[j - 1].t)) : [0, 0, 0];
    const P = keys[j - 1], N = keys[j + 1], h0 = K.t - P.t, h1 = N.t - K.t;
    return [0, 1, 2].map(c => ((f(K)[c] - f(P)[c]) / h0 * h1 + (f(N)[c] - f(K)[c]) / h1 * h0) / (h0 + h1));
  };
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const ev = f => { const va = vel(i, f), vb = vel(i + 1, f); return [0, 1, 2].map(c => h00 * f(a)[c] + h10 * h * va[c] + h01 * f(b)[c] + h11 * h * vb[c]); };
  return { p: ev(q => q.p), l: ev(q => q.l), fov: E.lerp(a.fov || 40, b.fov || 40, smooth(s)) };
}

// 0 - 2.5: the whole face fills the frame, the eyes flash, fast pull back
const SH1 = [
  { t: 0, p: [0.36, 1.86, 11.72], l: [0.5, 1.755, 10.5] },
  { t: T.pull0, p: [0.38, 1.84, 11.6], l: [0.5, 1.75, 10.5], e: 'out' },
  { t: T.pull1, p: [2.35, 1.75, 16.0], l: [-0.5, 1.35, 10.5], e: 'inOut' },
  { t: 2.5, p: [2.6, 1.85, 16.35], l: [-0.45, 1.35, 10.5], e: 'out' },
];
// 2.5 - 9: one smooth path: up over the field, the whole field while the wave runs, back down to him,
// then up along the tower as it grows, ending high on the whole tower
const SH2 = [
  { t: 2.5, p: [2.6, 1.85, 16.35], l: [-0.45, 1.35, 10.5] },
  { t: 3.3, p: [-2.0, 9.5, 31.0], l: [-5.0, 0.5, 4.0] },
  { t: 4.05, p: [2.0, 28.5, 48.0], l: [0.5, 0.0, 0.0], fov: 48 },
  { t: 4.75, p: [-2.5, 30.5, 51.5], l: [-0.5, 0.0, 0.5], fov: 48 },
  { t: 5.35, p: [-5.0, 20.0, 43.0], l: [0.0, 1.0, 6.0], fov: 44 },
  { t: 6.1, p: [-12.0, 10.5, 33.0], l: [0.5, 2.0, 10.0] },
  { t: 6.9, p: [-17.0, 16.5, 31.5], l: [0.5, 9.5, 10.0] },
  { t: 7.8, p: [-22.0, 25.5, 32.0], l: [0.5, 18.5, 9.5] },
  { t: 8.5, p: [-33.0, 35.0, 51.0], l: [-2.0, 13.0, 2.0], fov: 44 },
  { t: 9.0, p: [-39.0, 39.0, 60.0], l: [-4.0, 11.5, 0.0], fov: 46, free: true },
];
// 9 - 11: the creeper. Low angle, slow orbit to the right around him, the tower and the sky behind
const SH4 = [
  { t: 9.0, p: F(-3.4, 0.85, 7.2), l: F(0.6, 2.05, 0), free: true },
  { t: 10.0, p: F(-0.4, 0.8, 6.3), l: F(0.55, 1.95, 0) },
  { t: 11.0, p: F(2.9, 1.0, 5.7), l: F(0.2, 2.0, 0), free: true },
];
// 11 - 13: low behind the chest row, the tower whole in the background: a dolly along the row with the berries
const SH5 = [
  { t: 11.0, p: [-16.0, MY + 1.9, CH_Z + 6.5], l: [-2.0, MY + 2.3, CH_Z - 2.0], free: true },
  { t: 12.0, p: [-12.0, MY + 1.85, CH_Z + 6.2], l: [1.0, MY + 2.3, CH_Z - 2.2] },
  { t: 13.0, p: [-8.0, MY + 1.8, CH_Z + 5.8], l: [4.0, MY + 2.3, CH_Z - 2.4], free: true },
];
// 13 - 16: he sits on the last chest; 3/4 view from his front-right at eye level, a slow arc, then into his eyes
const sitCam = (deg, dist, dy = 0, lx = -0.62) => {
  const a = deg * Math.PI / 180;           // angle from his facing (-z) toward his right (+x)
  const p = [SIT[0] + Math.sin(a) * dist, MY + 1.8 + dy, SIT[2] - Math.cos(a) * dist];
  // look a little to his left so he sits in the right third
  const dir = [SIT[0] - p[0], SIT[2] - p[2]], L = Math.hypot(dir[0], dir[1]);
  const side = [-dir[1] / L, dir[0] / L];
  return { p, l: [SIT[0] + side[0] * lx, MY + 1.6 + dy * 0.3, SIT[2] + side[1] * lx] };
};
const SH6 = [
  Object.assign({ t: 13.0, free: true }, sitCam(90, 4.7, 0.05)),
  Object.assign({ t: 15.15 }, sitCam(50, 3.4, 0.02)),
  Object.assign({ t: 15.75, fov: 34 }, sitCam(42, 1.25, 0.08, -0.02)),
  Object.assign({ t: 16.0, fov: 33 }, sitCam(40, 1.15, 0.08, -0.02)),
];

/** the camera pose at time t (also used by the speed check script) */
export function camPose(t, e) {
  if (e) E = e;
  if (t < 2.5) return keyPose(SH1, t);
  if (t < T.fight) return hermitePose(SH2, t);
  if (t < T.chests) return hermitePose(SH4, t);
  if (t < T.sit) return hermitePose(SH5, t);
  return hermitePose(SH6, t);
}

// ---------------------------------------------------------------- merged geometry
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  quad(a, b, c, d, n, u0, v0, u1, v1) {
    const k = this.p.length / 3;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let j = 0; j < 4; j++) this.n.push(n[0], n[1], n[2]);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /** one face of the box [x0,x1]x[y0,y1]x[z0,z1]; uv in block units (repeating textures) unless unit;
   *  vo shifts v on the side faces (to line a short grass-side strip up with the texture's top) */
  face(dir, x0, y0, z0, x1, y1, z1, unit = false, vo = 0) {
    const W = unit ? 1 : null;
    switch (dir) {
      case '+y': this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 0, 0, W || x1 - x0, W || z1 - z0); break;
      case '-y': this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], 0, 0, W || x1 - x0, W || z1 - z0); break;
      case '+z': this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], 0, vo, W || x1 - x0, vo + (W || y1 - y0)); break;
      case '-z': this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], 0, vo, W || x1 - x0, vo + (W || y1 - y0)); break;
      case '+x': this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], 0, vo, W || z1 - z0, vo + (W || y1 - y0)); break;
      case '-x': this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], 0, vo, W || z1 - z0, vo + (W || y1 - y0)); break;
    }
  }
  box(x0, y0, z0, x1, y1, z1, unit = true) { for (const d of ['+x', '-x', '+y', '-y', '+z', '-z']) this.face(d, x0, y0, z0, x1, y1, z1, unit); }
  /** a crossed-planes plant standing at (x, y, z), size s */
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
/** several Geos keyed by material name -> a group of meshes */
class MGeo {
  constructor() { this.g = {}; }
  get(k) { return this.g[k] || (this.g[k] = new Geo()); }
  group(M, { cast = false, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const k in this.g) { if (!this.g[k].p.length) continue; const m = this.g[k].mesh(M[k]); m.castShadow = cast; m.receiveShadow = receive; grp.add(m); }
    return grp;
  }
}
/** geometry rewritten every frame (preallocated, drawn up to the quads written) */
class DynGeo {
  constructor(maxQuads, mat) {
    this.max = maxQuads;
    const g = new THREE.BufferGeometry();
    this.P = new Float32Array(maxQuads * 12); this.N = new Float32Array(maxQuads * 12); this.U = new Float32Array(maxQuads * 8);
    const I = new Uint32Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) { const k = q * 4; I.set([k, k + 1, k + 2, k, k + 2, k + 3], q * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    this.g = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.n = 0;
  }
  begin() { this.n = 0; }
  quad(a, b, c, d, n, u0, v0, u1, v1) {
    if (this.n >= this.max) return;
    const q = this.n++, p = q * 12, u = q * 8;
    this.P.set(a, p); this.P.set(b, p + 3); this.P.set(c, p + 6); this.P.set(d, p + 9);
    for (let j = 0; j < 4; j++) this.N.set(n, p + j * 3);
    this.U[u] = u0; this.U[u + 1] = v0; this.U[u + 2] = u1; this.U[u + 3] = v0; this.U[u + 4] = u1; this.U[u + 5] = v1; this.U[u + 6] = u0; this.U[u + 7] = v1;
  }
  end() {
    this.g.setDrawRange(0, this.n * 6);
    for (const a of ['position', 'normal', 'uv']) this.g.attributes[a].needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }
}
DynGeo.prototype.face = Geo.prototype.face;
DynGeo.prototype.plant = Geo.prototype.plant;

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
  X.dandelion = E.pixelTex(16, 16, (x, y) => {
    if (x === 7 && y >= 7) return [52, 120, 40];
    if (x === 8 && y === 10) return [52, 120, 40];
    if (y >= 4 && y <= 6 && x >= 6 && x <= 8) return (x === 7 && y === 5) ? [255, 236, 90] : [245, 200, 30];
    return null;
  }, 43);
  X.log = E.pixelTex(16, 16, (x, y, r) => j((x % 4 === 0) ? [70, 52, 30] : [[104, 80, 48], [94, 72, 42], [112, 88, 54]][(x + (y >> 2)) % 3], r, 10), 44);
  X.logTop = E.pixelTex(16, 16, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return j([94, 72, 42], r, 8);
    return j(Math.floor(d) % 2 ? [176, 140, 86] : [150, 118, 70], r, 8);
  }, 45);
  X.leaves = E.pixelTex(16, 16, (x, y, r) => j([[52, 120, 38], [44, 104, 32], [64, 136, 46], [36, 90, 28], [72, 148, 52]][Math.floor(r() * 5)], r, 14), 46);
  X.berry = E.pixelTex(16, 16, (x, y) => {          // sweet berries item
    for (const [bx, by] of [[5, 9], [10, 8], [7, 12], [11, 12]]) {
      const d = (x - bx) ** 2 + (y - by) ** 2;
      if (d <= 1) return (x === bx - 1 && y === by - 1) ? [255, 150, 150] : [222, 34, 48];
      if (d <= 3.2) return [140, 12, 28];
    }
    if ((x === 8 && y >= 3 && y <= 7) || (x === 7 && y === 4) || (x === 6 && y === 5) || (x === 9 && y === 5) || (x === 10 && y === 6)) return [62, 130, 44];
    return null;
  }, 47);
  X.moon = E.pixelTex(16, 16, (x, y, r) => {
    if (x < 2 || x > 13 || y < 2 || y > 13) return null;
    const crater = ((x - 5) ** 2 + (y - 6) ** 2 < 4) || ((x - 10) ** 2 + (y - 10) ** 2 < 3) || ((x - 9) ** 2 + (y - 4) ** 2 < 1.5);
    return crater ? j([186, 196, 214], r, 8) : j([232, 238, 250], r, 8);
  }, 48);
  const wood = (x, y, r) => j([[160, 104, 42], [146, 94, 36], [171, 113, 48]][(x + y * 2) % 3], r, 10);
  const edge = [74, 46, 20];
  X.dchestFront = E.pixelTex(30, 14, (x, y, r) => {
    if (x >= 14 && x <= 15 && y >= 3 && y <= 6) return y === 3 ? [70, 70, 70] : [196, 196, 196];
    return (x === 0 || x === 29 || y === 0 || y === 13 || y === 4 || y === 5) ? edge : wood(x, y, r);
  }, 49);
  X.dchestTop = E.pixelTex(30, 14, (x, y, r) => (x === 0 || y === 0 || x === 29 || y === 13) ? edge : wood(x, y, r), 50);
  const soft = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  X.glow = soft(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,0.7)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  X.softGlow = soft(128, 128, (g, w, h) => {          // a broad, even halo (the light behind his head)
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  X.streak = soft(256, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
  return X;
}

/** plant material: double sided, but both sides lit like the top (no flipped normal on the back face) */
function plantMat(map) {
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );'); };
  return m;
}
function rmat(t, opts = {}) {
  const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true;
  return new THREE.MeshLambertMaterial(Object.assign({ map: c }, opts));
}

// ---------------------------------------------------------------- the field (rough -> flat)
// rough top height of field column (x, z)
function fieldH(x, z) {
  const d = Math.hypot(x + 0.5 - P0[0], z + 0.5 - P0[2]);
  if (d < 3.2) return 0;
  const n = vnoise(x / 6.5, z / 6.5, 1) * 1.0 + vnoise(x / 2.7, z / 2.7, 2) * 0.55;
  let h = (n - 0.76) * 6.2 * E.clamp((d - 3.2) / 4);
  h = Math.max(-2, Math.min(4, Math.round(h)));
  if (x <= FX0 + 1 || x >= FX1 - 2 || z <= FZ0 + 1 || z >= FZ1 - 2) h = Math.max(MY, h);   // meets the land around
  // the corridor the first camera pulls back through: no holes, nothing to clip
  if (x >= -2 && x <= 7 && z >= 9 && z <= 14) h = Math.max(0, Math.min(1, h));
  if (x >= 0 && x <= 5 && z >= 11) h = 0;
  return h;
}
const inField = (x, z) => x >= FX0 && x < FX1 && z >= FZ0 && z < FZ1;
const CHUNK = 5;
// the wave: a ridge of earth (2 blocks high) rolls along +x; ahead of it the rough field, behind it flat ground.
// Columns move in half-block steps.
const WAVE_R = 6.5;              // a column moves while the front is within this many blocks of it
const waveFront = t => E.lerp(FX0 - 6, FX1 + 6, E.seg(t, T.wave0, T.wave1));
const colD = (x, wf) => wf - (x + 0.5);       // how far the front has gone past column x
function colY(h, d) {
  if (d <= -WAVE_R) return h;
  if (d >= WAVE_R) return 0;
  const sm = smooth(E.clamp((d + 2.5) / 6));
  const y = h * (1 - sm) + 3.5 * Math.exp(-d * d / 4.5);
  return Math.round(y * 2) / 2;
}
const tWave = x => T.wave0 + Math.min(1, Math.max(0, (x - (FX0 - 6)) / (FX1 - FX0 + 12))) * (T.wave1 - T.wave0);   // when the front is at x
const DIRS = [['+x', 1, 0], ['-x', -1, 0], ['+z', 0, 1], ['-z', 0, -1]];
/** a wall on the dir side of column (x,z) from yLo up to yHi: a grass-side strip on top, dirt below */
function wall(geoSide, geoDirt, dir, x, z, yLo, yHi) {
  if (yHi - yLo < 0.001) return;
  const g0 = Math.max(yLo, yHi - 1);
  geoSide.face(dir, x, g0, z, x + 1, yHi, z + 1, false, 1 - (yHi - g0));
  if (g0 > yLo + 0.001) geoDirt.face(dir, x, yLo, z, x + 1, g0, z + 1);
}

function buildField(scene, M) {
  O.H = {};
  for (let x = FX0; x < FX1; x++) for (let z = FZ0; z < FZ1; z++) O.H[x + ',' + z] = fieldH(x, z);
  const H = (x, z) => inField(x, z) ? O.H[x + ',' + z] : MY;
  // static rough chunks (5 x-slices each)
  O.roughChunks = [];
  for (let c = 0; c < (FX1 - FX0) / CHUNK; c++) {
    const mg = new MGeo();
    for (let x = FX0 + c * CHUNK; x < FX0 + (c + 1) * CHUNK; x++) for (let z = FZ0; z < FZ1; z++) {
      const h = H(x, z);
      mg.get('grassTop').face('+y', x, h - 1, z, x + 1, h, z + 1);
      for (const [d, dx, dz] of DIRS) {
        const nh = H(x + dx, z + dz);
        if (nh < h) wall(mg.get('grassSide'), mg.get('dirt'), d, x, z, nh, h);
      }
    }
    const g = mg.group(M, { cast: true });
    scene.add(g);
    O.roughChunks.push(g);
  }
  // the part that moves (rebuilt each frame during the wave) and the flat part
  O.dynTop = new DynGeo(6000, M.grassTop); O.dynSide = new DynGeo(8000, M.grassSide); O.dynDirt = new DynGeo(8000, M.dirt);
  for (const d of [O.dynTop, O.dynSide, O.dynDirt]) { d.mesh.receiveShadow = true; d.mesh.castShadow = true; scene.add(d.mesh); }
}

let lastWaveKey = null;
function updateField(t) {
  const wf = t < T.wave0 ? -1e9 : t > T.wave1 + 0.2 ? 1e9 : waveFront(t);
  const key = wf <= -1e9 ? 'a' : wf >= 1e9 ? 'b' : wf.toFixed(4);
  if (key === lastWaveKey) return;
  lastWaveKey = key;
  const nC = (FX1 - FX0) / CHUNK;
  // chunk states: 0 rough (static mesh), 1 moving, 2 flat
  const state = [];
  for (let c = 0; c < nC; c++) {
    const x0 = FX0 + c * CHUNK;
    const dMax = colD(x0, wf), dMin = colD(x0 + CHUNK - 1, wf);
    state.push(dMax <= -WAVE_R ? 0 : dMin >= WAVE_R ? 2 : 1);
    O.roughChunks[c].visible = state[c] === 0;
  }
  const chunkOf = x => Math.floor((x - FX0) / CHUNK);
  const H = (x, z) => O.H[x + ',' + z];
  const top = (x, z) => {
    if (!inField(x, z)) return MY;
    const s = state[chunkOf(x)];
    if (s === 0) return H(x, z);
    if (s === 2) return 0;
    return colY(H(x, z), colD(x, wf));
  };
  const dynamic = (x, z) => inField(x, z) && state[chunkOf(x)] === 1;
  O.dynTop.begin(); O.dynSide.begin(); O.dynDirt.begin();
  // the flat part: one quad from the left edge to the first chunk that is not flat
  let flatEnd = 0;
  while (flatEnd < nC && state[flatEnd] === 2) flatEnd++;
  if (flatEnd > 0) O.dynTop.face('+y', FX0, -1, FZ0, FX0 + flatEnd * CHUNK, 0, FZ1);
  for (let c = 0; c < nC; c++) {
    if (state[c] !== 1) continue;
    for (let x = FX0 + c * CHUNK; x < FX0 + (c + 1) * CHUNK; x++) {
      // the crest of the ridge is churned earth: bare dirt on top and on its sides
      const dd = colD(x, wf), churned = dd > -3.2 && dd < 2.6;
      for (let z = FZ0; z < FZ1; z++) {
      const y = top(x, z);
      (churned ? O.dynDirt : O.dynTop).face('+y', x, y - 1, z, x + 1, y, z + 1);
      for (const [d, dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, ny = top(nx, nz);
        if (ny < y) wall(churned ? O.dynDirt : O.dynSide, O.dynDirt, d, x, z, Math.max(ny, -4), y);
        else if (ny > y && !dynamic(nx, nz)) {
          // the static neighbour is higher: give it a wall facing this column
          const od = d[0] === '+' ? '-' + d[1] : '+' + d[1];
          if (inField(nx, nz)) wall(O.dynSide, O.dynDirt, od, nx, nz, Math.max(y, -4), ny);
          else if (y < 0) O.dynDirt.face(od, nx, Math.max(y, -4), nz, nx + 1, 0, nz + 1);   // the land's own wall covers 0..1
        }
      }
      }
    }
  }
  O.dynTop.end(); O.dynSide.end(); O.dynDirt.end();
  // tall grass and flowers on the rough field: they shrink away just ahead of the ridge
  for (const kind of ['grass', 'poppy', 'dandelion']) {
    const dg = O.fieldPlants[kind];
    dg.geo.begin();
    for (const p of dg.list) {
      const d = colD(p.x, wf);
      const s = p.s * (1 - E.ease.in(E.clamp((d + 5.5) / 3)));
      if (s < 0.02) continue;
      dg.geo.plant(p.x + 0.5, colY(p.h, d), p.z + 0.5, s, p.ry);
    }
    dg.geo.end();
  }
  // little trees in the field get swept away by the ridge
  for (const tr of O.fieldTrees) {
    const d = colD(tr.x, wf);
    const s = 1 - E.ease.in(E.clamp((d + 5) / 2.2));
    tr.g.visible = s > 0.01;
    tr.g.scale.setScalar(Math.max(0.001, s));
    tr.g.position.y = colY(tr.h, Math.min(d, -WAVE_R)) + (1 - s) * 1.5;
  }
}

// he hops over the ridge when it passes under him
const T_CREST = tWave(P0[0]);
function playerLift(t) {
  if (t < T.wave0 || t > T.wave1 + 0.5) return 0;
  const k = E.seg(t, T_CREST - 0.24, T_CREST + 0.36);
  const jump = k > 0 && k < 1 ? 4.2 * 4 * k * (1 - k) : 0;
  return Math.max(jump, colY(0, colD(0, waveFront(t))));
}

// ---------------------------------------------------------------- the floors
function floorOff(k, t) {          // the floor's offset from its place (null: not there yet)
  const t0 = riseT(k), tl = landT(k);
  if (t < t0) return null;
  if (t < tl) { const q = E.seg(t, t0, tl); return -GAP * (1 - q * q); }      // speeds up into place ...
  const dt = t - tl;
  return 0.2 * Math.exp(-dt * 15) * Math.sin(dt * 34);                          // ... and slams to a stop
}
/** his feet while the floors are built: on top of the newest floor, tossed up a little when it stops -> [y, toss] */
function heroFloor(t) {
  let y = 0, toss = 0;
  for (let k = 2; k <= FLOORS; k++) { const o = floorOff(k, t); if (o !== null) y = GAP * (k - 1) + Math.max(o, -GAP); }
  for (let k = 2; k <= FLOORS; k++) {
    const dt = t - landT(k);
    if (dt < 0 || dt >= 0.24) continue;
    const h = GAP * (k - 1) + 0.55 * Math.sin(Math.PI * dt / 0.24);
    if (h > y) { toss = h - y; y = h; }
  }
  return [y, toss];
}

// ---------------------------------------------------------------- setup
export async function setup(e) {
  E = e; THREE = E.THREE; _o = new THREE.Object3D();
  const { scene } = E;
  const X = O.X = makeTextures();
  const M = O.M = {
    grassTop: rmat(E.tex.grassTop), grassSide: rmat(E.tex.grassSide), dirt: rmat(E.tex.dirt), cobble: rmat(E.tex.cobble),
    stone: rmat(E.tex.stone), planks: rmat(E.tex.planks), log: rmat(X.log), logTop: rmat(X.logTop), leaves: rmat(X.leaves),
    bush: plantMat(E.tex.bush), tallGrass: plantMat(X.tallGrass), poppy: plantMat(X.poppy), dandelion: plantMat(X.dandelion),
    torch: E.mat(E.tex.torch), torchHead: new THREE.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false }),
  };

  // ---- sky, light
  const sc = document.createElement('canvas'); sc.width = 4; sc.height = 512;
  O.skyCanvas = sc; O.skyTex = new THREE.CanvasTexture(sc); O.skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = O.skyTex;
  scene.fog = new THREE.Fog(0x16285a, 40, 160);
  O.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.0); scene.add(O.hemi);
  O.sun = E.sun(0xffffff, 2.0, [20, 40, 15], 40);
  O.sun.shadow.camera.far = 300;
  O.rim = new THREE.DirectionalLight(0xa9bcff, 0); O.rim.position.set(-3, 4, -8); scene.add(O.rim);   // night back light
  O.rim.target.position.set(0.5, 1.5, 0.5); scene.add(O.rim.target);
  O.fill = new THREE.PointLight(0xffe2c8, 0, 9, 1.2); scene.add(O.fill);                             // warm light on his face
  // a soft, neutral-warm key light on him at night (keeps his purple hoodie purple under the blue night)
  O.key = new THREE.SpotLight(0xfff0e4, 0, 0, 0.26, 0.75, 0);
  O.key.position.set(P0[0] - 3.5, 5.5, P0[2] + 6.5); O.key.target.position.set(P0[0], 1.1, P0[2]);
  scene.add(O.key); scene.add(O.key.target);

  // stars, moon, clouds, distant mountains
  {
    const r = E.rng(7), pts = [];
    for (let i = 0; i < 800; i++) {
      const th = r() * Math.PI * 2, el = 0.05 + Math.pow(r(), 0.8) * 1.4;
      pts.push(Math.cos(th) * Math.cos(el) * 380, Math.sin(el) * 380, Math.sin(th) * Math.cos(el) * 380);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    O.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    scene.add(O.stars);
    O.moon = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: X.moon, transparent: true, fog: false, toneMapped: false }));
    O.moon.position.set(-156, 122, -272); O.moon.lookAt(3, 1, 7); scene.add(O.moon);
    O.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.glow, color: 0x9fb8ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    O.moonGlow.scale.set(140, 140, 1); O.moonGlow.position.copy(O.moon.position).multiplyScalar(1.01); scene.add(O.moonGlow);
    const cg = new Geo(), cr = E.rng(9);
    for (let i = 0; i < 46; i++) {
      const th = cr() * Math.PI * 2, rad = 90 + cr() * 250;
      const cx = Math.cos(th) * rad, cz = Math.sin(th) * rad, n = 2 + Math.floor(cr() * 3);
      for (let k = 0; k < n; k++) {
        const x = cx + (cr() - 0.5) * 30, z = cz + (cr() - 0.5) * 18, w = 16 + cr() * 26, d = 10 + cr() * 16;
        cg.box(x - w / 2, 86, z - d / 2, x + w / 2, 90, z + d / 2);
      }
    }
    O.clouds = cg.mesh(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    scene.add(O.clouds);
    // blocky hills far away (they take the fog colour: a soft, hazy horizon instead of the edge of the world)
    const mg = new MGeo(), mr = E.rng(19);
    for (let i = 0; i < 80; i++) {
      const th = (i / 80) * Math.PI * 2 + mr() * 0.08, rad = 200 + mr() * 100;
      const cx = Math.cos(th) * rad, cz = Math.sin(th) * rad;
      const hgt = 8 + mr() * 22, w0 = 26 + mr() * 34, steps = 4;
      for (let s = 0; s < steps; s++) {
        const w = w0 * (1 - s / steps * 0.75), y0 = hgt * s / steps, y1 = hgt * (s + 1) / steps;
        const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2), z0 = Math.round(cz - w / 2), z1 = Math.round(cz + w / 2);
        for (const d of ['+x', '-x', '+z', '-z']) mg.get('leaves').face(d, x0, y0, z0, x1, y1, z1, false);
        mg.get('grassTop').face('+y', x0, y0, z0, x1, y1, z1);
      }
    }
    O.mountains = mg.group(M, { cast: false, receive: false });
    scene.add(O.mountains);
  }

  // ---- the field
  buildField(scene, M);
  {
    const r = E.rng(12);
    O.fieldPlants = {};
    for (const k of ['grass', 'poppy', 'dandelion']) O.fieldPlants[k] = { list: [] };
    for (let x = FX0; x < FX1; x++) for (let z = FZ0; z < FZ1; z++) {
      if (Math.abs(x + 0.5 - P0[0]) < 1.2 && Math.abs(z + 0.5 - P0[2]) < 1.2) continue;
      const q = r();
      if (q < 0.34) O.fieldPlants[q < 0.03 ? 'poppy' : q < 0.055 ? 'dandelion' : 'grass'].list.push({ x, z, h: O.H[x + ',' + z], s: 0.75 + r() * 0.4, ry: r() * 3 });
    }
    for (const k of ['grass', 'poppy', 'dandelion']) {
      const fp = O.fieldPlants[k];
      fp.geo = new DynGeo(fp.list.length * 2 + 4, M[k === 'grass' ? 'tallGrass' : k]);
      fp.geo.mesh.castShadow = false;
      scene.add(fp.geo.mesh);
    }
  }
  // small trees in the rough field (swept away by the wave)
  const treeGeo = (mg, x0, y0, z0, th, r) => {
    for (let y = 0; y < th; y++) {
      for (const d of ['+x', '-x', '+z', '-z']) mg.get('log').face(d, x0, y0 + y, z0, x0 + 1, y0 + y + 1, z0 + 1);
    }
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
  };
  O.fieldTrees = [];
  {
    const r = E.rng(77);
    // (no tree near the path the camera rises along at 2.5-3.3 s)
    for (const [x, z] of [[-22, -8], [13, 9], [26, -7], [-29, 5], [6, -10], [-15, -2], [20, 3]]) {
      const mg = new MGeo();
      treeGeo(mg, -0.5, 0, -0.5, 4 + Math.floor(r() * 2), r);
      const g = mg.group(M, { cast: true });
      g.position.set(x + 0.5, O.H[x + ',' + z], z + 0.5);
      scene.add(g);
      O.fieldTrees.push({ x, z, h: O.H[x + ',' + z], g });
    }
  }

  // ---- the land around the field: rolling hills, a flat meadow in front of the farm (the yard), trees
  {
    const SX0 = -124, SX1 = 124, SZ0 = -112, SZ1 = 124;
    const YX0 = -78, YX1 = 48, YZ1 = 88;                                   // the yard: x YX0..YX1, z FZ1..YZ1
    const yardD = (x, z) => Math.max(YX0 - x, x - YX1 + 1, FZ1 - z, z - YZ1 + 1, 0);
    const fieldD = (x, z) => Math.max(FX0 - x - 1, x - FX1, 0, FZ0 - z - 1, z - FZ1);
    const sh = (x, z) => {
      if (inField(x, z)) return null;
      if (x < SX0 || x >= SX1 || z < SZ0 || z >= SZ1) return null;
      const flat = Math.min(yardD(x, z), Math.max(fieldD(x, z), 0));
      if (flat <= 0) return MY;
      const n = vnoise(x / 9, z / 9, 5) + vnoise(x / 4, z / 4, 6) * 0.4 + vnoise(x / 26, z / 26, 7) * 1.4;
      const h = (n - 0.95) * 5.2 * E.clamp((flat - 1) / 9) + Math.max(0, flat - 40) * 0.04;
      return Math.max(MY, Math.min(15, Math.round(MY + h)));
    };
    const near = (x, z) => x > -80 && x < 80 && z > -60 && z < 92;        // casts shadows (inside the shadow boxes)
    const mgN = new MGeo(), mgF = new MGeo();
    const runs = {};       // greedy tops: "h,z" -> list of x
    const r = E.rng(15);
    const deco = { tallGrass: new Geo(), poppy: new Geo(), dandelion: new Geo() };
    for (let x = SX0; x < SX1; x++) for (let z = SZ0; z < SZ1; z++) {
      const h = sh(x, z);
      if (h === null) continue;
      (runs[h + ',' + z] = runs[h + ',' + z] || []).push(x);
      const mg = near(x, z) ? mgN : mgF;
      for (const [d, dx, dz] of DIRS) {
        let nh = sh(x + dx, z + dz);
        if (nh === null) nh = inField(x + dx, z + dz) ? 0 : -1;
        if (nh < h) wall(mg.get('grassSide'), mg.get('dirt'), d, x, z, Math.max(nh, h - 3), h);
      }
      const clearDeco = (x > -3 && x < 9 && z >= FZ1 && z < 22) ||                    // the opening pull-back
        Math.hypot(x - FIGHT[0], z - FIGHT[2]) < 4.5 || Math.hypot(x - (FIGHT[0] - 4.5), z - (FIGHT[2] + 6.5)) < 4 ||
        (x > -20 && x < 4 && z > CH_Z - 2 && z < CH_Z + 9) || Math.hypot(x - (SIT[0] + 3), z - (SIT[2] - 1.5)) < 4;
      if (Math.abs(x) < 95 && z > -80 && z < 100 && !clearDeco) {
        const q = r();
        const inYard = yardD(x, z) === 0;
        if (q < (inYard ? 0.075 : 0.13)) deco[q < 0.012 ? 'poppy' : q < 0.024 ? 'dandelion' : 'tallGrass'].plant(x + 0.5, h, z + 0.5, 0.7 + r() * 0.4, r() * 3);
      }
    }
    for (const key in runs) {
      const [h, z] = key.split(',').map(Number);
      const xs = runs[key].sort((a, b) => a - b);
      let s = xs[0], p = xs[0];
      for (let i = 1; i <= xs.length; i++) {
        if (i < xs.length && xs[i] === p + 1) { p = xs[i]; continue; }
        // split the runs at the near/far border, so the near part alone casts shadows
        const a0 = s, a1 = p + 1;
        const cut = [a0, Math.min(Math.max(-80, a0), a1), Math.min(Math.max(80, a0), a1), a1];
        for (let j = 0; j < 3; j++) {
          if (cut[j + 1] <= cut[j]) continue;
          const mid = (cut[j] + cut[j + 1]) / 2;
          (near(mid, z) ? mgN : mgF).get('grassTop').face('+y', cut[j], h - 1, z, cut[j + 1], h, z + 1);
        }
        if (i < xs.length) { s = p = xs[i]; }
      }
    }
    // trees: none on the yard near the farm, none where the camera works
    const keepOut = (x, z) =>
      (z >= FZ1 - 2 && z < 50 && x > YX0 - 2 && x < YX1 + 2) ||
      Math.hypot(x - FIGHT[0], z - FIGHT[2]) < 16 ||
      (x > -26 && x < 24 && z > CH_Z - 12 && z < CH_Z + 17);
    const tr = E.rng(21);
    O.landTrees = [];
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < 190; tries++) {
      const x = Math.floor(SX0 + 3 + tr() * (SX1 - SX0 - 6)), z = Math.floor(SZ0 + 3 + tr() * (SZ1 - SZ0 - 6));
      const h = sh(x, z);
      if (h === null) continue;
      if (Math.max(fieldD(x, z), 0) < 5 && yardD(x, z) > 0) continue;
      if (keepOut(x, z)) continue;
      if (yardD(x, z) === 0 && tr() < 0.6) continue;                        // fewer on the meadow
      if (O.landTrees.some(p => Math.abs(p[0] - x) < 4 && Math.abs(p[1] - z) < 4)) continue;
      treeGeo(near(x, z) ? mgN : mgF, x, h, z, 4 + Math.floor(tr() * 3), tr);
      O.landTrees.push([x, z]);
      placed++;
    }
    O.surr = mgN.group(M, { cast: true });
    scene.add(O.surr);
    O.surrFar = mgF.group(M, { cast: false });
    scene.add(O.surrFar);
    for (const k in deco) { const m = deco[k].mesh(M[k]); O.surr.add(m); }
    // far ground beyond (under the hazy hills)
    const gt = E.tex.grassTop.clone(); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.needsUpdate = true;
    const farMat = new THREE.MeshLambertMaterial({ map: gt });
    const fg = new Geo(), FY = MY + 2;
    fg.face('+y', -600, FY - 1, -600, SX0, FY, 600); fg.face('+y', SX1, FY - 1, -600, 600, FY, 600);
    fg.face('+y', SX0, FY - 1, -600, SX1, FY, SZ0); fg.face('+y', SX0, FY - 1, SZ1, SX1, FY, 600);
    fg.face('+x', SX0 - 1, -4, SZ0, SX0, FY, SZ1); fg.face('-x', SX1, -4, SZ0, SX1 + 1, FY, SZ1);
    fg.face('+z', SX0, -4, SZ0 - 1, SX1, FY, SZ0); fg.face('-z', SX0, -4, SZ1, SX1, FY, SZ1 + 1);
    const far = fg.mesh(farMat); far.receiveShadow = false; scene.add(far);
  }

  // ---- ground-floor berry bushes (rows on odd z), popped in row by row, outward from him
  O.gBush = [];
  for (let z = FZ0; z < FZ1; z++) if (isOdd(z)) for (let x = FX0; x < FX1; x++) O.gBush.push([x, z]);
  O.gBushGeo = new DynGeo(O.gBush.length * 2, M.bush);
  O.gBushGeo.mesh.castShadow = true;
  scene.add(O.gBushGeo.mesh);

  // ---- floors 2..10: a planks rim, dirt rows + stone walkways, bushes, torches, log pillars at the edges
  O.floors = [];
  const pillarsXZ = [];
  for (const x of [FX0, -25, -15, -5, 4, 14, 24, FX1 - 1]) { pillarsXZ.push([x, FZ0]); pillarsXZ.push([x, FZ1 - 1]); }
  for (const z of [-5, 4]) { pillarsXZ.push([FX0, z]); pillarsXZ.push([FX1 - 1, z]); }
  const nearHero = (x, z) => Math.abs(x + 0.5 - P0[0]) < 2.5 && Math.abs(z + 0.5 - P0[2]) < 2.5;
  for (let k = 2; k <= FLOORS; k++) {
    const Y = GAP * (k - 1);
    const mg = new MGeo();
    for (let z = FZ0; z < FZ1; z++) {
      const rimRow = z === FZ0 || z === FZ1 - 1;
      const kind = rimRow ? 'planks' : isOdd(z) ? 'dirt' : 'stone';
      const x0 = rimRow ? FX0 : FX0 + 1, x1 = rimRow ? FX1 : FX1 - 1;
      const gg = mg.get(kind);
      gg.face('+y', x0, Y - 1, z, x1, Y, z + 1);
      gg.face('-y', x0, Y - 1, z, x1, Y, z + 1);
      if (z === FZ0) gg.face('-z', x0, Y - 1, z, x1, Y, z + 1);
      if (z === FZ1 - 1) gg.face('+z', x0, Y - 1, z, x1, Y, z + 1);
      if (rimRow) { gg.face('+x', x0, Y - 1, z, x1, Y, z + 1); gg.face('-x', x0, Y - 1, z, x1, Y, z + 1); }
      else {
        const pg = mg.get('planks');
        for (const xr of [FX0, FX1 - 1]) {
          pg.face('+y', xr, Y - 1, z, xr + 1, Y, z + 1); pg.face('-y', xr, Y - 1, z, xr + 1, Y, z + 1);
          pg.face(xr === FX0 ? '-x' : '+x', xr, Y - 1, z, xr + 1, Y, z + 1);
        }
      }
    }
    // pillars under this floor (from the floor below up to this slab)
    for (const [px, pz] of pillarsXZ) for (const d of ['+x', '-x', '+z', '-z']) mg.get('log').face(d, px, Y - GAP, pz, px + 1, Y - 1, pz + 1);
    // bushes: the outer ones always, the inner ones only near the top (hidden by the floors above later)
    const edge = new Geo(), inner = new Geo();
    for (const [x, z] of O.gBush) {
      if (z <= FZ0 || z >= FZ1 - 1 || x <= FX0 || x >= FX1 - 1) continue;
      const isEdge = z >= FZ1 - 4 || z <= FZ0 + 3 || x < FX0 + 4 || x >= FX1 - 4;
      (isEdge ? edge : inner).plant(x + 0.5, Y, z + 0.5, 1, 0);
    }
    const torches = new Geo(), heads = new Geo();
    for (let z = -12; z <= 12; z += 4) for (let x = -32; x <= 32; x += 8) {
      const tx = x + ((z / 4) % 2 ? 4 : 0) + 0.5, tz = z + 0.5;
      if (nearHero(tx - 0.5, tz - 0.5)) continue;
      torches.box(tx - 1 / 16, Y, tz - 1 / 16, tx + 1 / 16, Y + 10 / 16, tz + 1 / 16);
      heads.box(tx - 1.4 / 16, Y + 8.2 / 16, tz - 1.4 / 16, tx + 1.4 / 16, Y + 11 / 16, tz + 1.4 / 16);
    }
    const g = mg.group(M, { cast: true });
    const em = edge.mesh(M.bush), im = inner.mesh(M.bush);
    g.add(em, im, torches.mesh(M.torch), heads.mesh(M.torchHead));
    g.visible = false;
    scene.add(g);
    O.floors.push({ k, Y, g, inner: im });
  }

  // ---- the storage: 10 double chests in a row in front of the farm (their fronts face the farm)
  O.chests = [];
  {
    const side = E.mat(E.tex.chestSide), top = E.mat(X.dchestTop), front = E.mat(X.dchestFront);
    const geo = new THREE.BoxGeometry(30 / 16, 14 / 16, 14 / 16);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, [side, side, top, top, side, front]);
      m.position.y = 7 / 16; m.castShadow = m.receiveShadow = true;
      g.add(m); g.position.set(CH_X0 + 2 * i, MY, CH_Z);
      g.visible = false;
      scene.add(g);
      O.chests.push(g);
    }
  }

  // ---- 1DEX1 and his glowing eyes (face row 5, columns 1-2 and 5-6)
  O.rig = E.makePlayer(E.tex.skin);
  O.rig.root.rotation.order = 'YXZ';     // lean (x) in his own frame, after the turn (y)
  scene.add(O.rig.root);
  {
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc8fbff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    O.eyeMat = eyeMat;
    const eg = new THREE.PlaneGeometry(2 / 16, 1 / 16);
    O.eyeHalo = []; O.eyeStreak = [];
    for (const sx of [-1, 1]) {
      // face row 5 of 8 is 2.5 px above the head pivot (the head box spans 0..8 px above it)
      const m = new THREE.Mesh(eg, eyeMat); m.position.set(sx * 2 / 16, 2.5 / 16, 4.06 / 16); O.rig.head.add(m);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.glow, color: 0x6fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
      halo.position.set(sx * 2 / 16, 2.5 / 16, 5 / 16); O.rig.head.add(halo); O.eyeHalo.push(halo);
      const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.streak, color: 0x9ff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
      st.position.set(sx * 2 / 16, 2.5 / 16, 5.2 / 16); O.rig.head.add(st); O.eyeStreak.push(st);
    }
    O.eyeLight = new THREE.PointLight(0x6fe8ff, 0, 2.5, 1.6);
    O.eyeLight.position.set(0, 2.5 / 16, 0.45); O.rig.head.add(O.eyeLight);
    // a cool halo of light right behind his head in the opening close-up: the dark hair stands out from the night
    O.headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.softGlow, color: 0x6f95ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    O.headGlow.position.set(P0[0], 1.78, P0[2] - 1.6);
    O.headGlow.scale.set(3.2, 3.2, 1);
    scene.add(O.headGlow);
  }

  // ---- the creeper
  O.cr = E.makeCreeper();
  scene.add(O.cr.root);
  O.crMats = [];
  O.cr.root.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!O.crMats.includes(m)) O.crMats.push(m); }); });

  // ---- flying berries (camera-facing quads): from the farm's floors into the chests, the far chests first
  {
    const r = E.rng(33), list = [];
    for (let i = 0; i < 64; i++) {
      const prog = i / 63;
      const ci = Math.max(0, Math.min(9, Math.round(prog * 9 + (r() - 0.5) * 1.6)));
      const fk = 1 + Math.floor(Math.pow(r(), 1.4) * 4);
      const dur = 1.05 + r() * 0.3;
      const t1 = T.chests + 0.12 + prog * 1.8 + r() * 0.05;
      const tx = CH_X0 + 2 * ci + (r() - 0.5) * 0.8;
      list.push({ ci, from: [tx * 1.6 + (r() - 0.5) * 10, GAP * (fk - 1) + 0.6, FZ1 - 1.5], to: [tx, MY + 0.95, CH_Z + (r() - 0.5) * 0.3], t0: t1 - dur, t1, spin: r() * 6, apex: 9 + r() * 5 });
    }
    O.items = list;
    O.itemMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: X.berry, alphaTest: 0.5, side: THREE.DoubleSide }), list.length);
    O.itemMesh.frustumCulled = false;
    scene.add(O.itemMesh);
  }

  // ---- 70 x 30: glowing dimension lines along the field's long and short edges
  {
    const mk = (len, axis) => {
      const g = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false, fog: false });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? len : 0.28, 0.28, axis === 'x' ? 0.28 : len), m);
      g.add(bar);
      for (const s of [-1, 1]) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.6, 0.28), m);
        tick.position.set(axis === 'x' ? s * len / 2 : 0, 0.5, axis === 'x' ? 0 : s * len / 2);
        g.add(tick);
      }
      g.visible = false;
      scene.add(g);
      return { g, bar };
    };
    O.dimX = mk(FX1 - FX0, 'x'); O.dimX.g.position.set((FX0 + FX1) / 2, MY + 0.6, FZ1 + 1.4);
    O.dimZ = mk(FZ1 - FZ0, 'z'); O.dimZ.g.position.set(FX1 + 1.4, MY + 0.6, (FZ0 + FZ1) / 2);
  }

  // ---- particles (instanced cubes, only the live ones drawn)
  O.parts = [];
  const addBurst = ({ t0, at, n, colors, speed = 3, up = 2, life = 0.7, size = 0.14, grav = -7, seed = 1, spread = [1, 1, 1], box = [0, 0, 0], dir = null }) => {
    const r = E.rng(seed);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, v = speed * (0.4 + r() * 0.8);
      let vx = Math.cos(th) * v * spread[0], vz = Math.sin(th) * v * spread[2], vy = (up + (r() - 0.3) * speed) * spread[1];
      if (dir) { vx += dir[0]; vy += dir[1]; vz += dir[2]; }
      O.parts.push({ t0: t0 + r() * 0.04, o: [at[0] + (r() - 0.5) * box[0], at[1] + (r() - 0.5) * box[1], at[2] + (r() - 0.5) * box[2]], v: [vx, vy, vz], life: life * (0.6 + r() * 0.7), s: size * (0.6 + r() * 0.9), g: grav, c: new THREE.Color(colors[Math.floor(r() * colors.length)]), rs: (r() - 0.5) * 10 });
    }
  };
  // dirt and grass thrown up along the crest of the ridge as it rolls
  for (let i = 0; i < 30; i++) {
    const x = E.lerp(FX0 + 1, FX1 - 1, i / 29);
    addBurst({ t0: tWave(x + 0.5), at: [x + 0.5, 3.4, 0], n: 30, colors: [0x8a6a4a, 0xa98564, 0x6f8f3e, 0xcbb79a, 0x5f9a3a, 0x7a5a3a], speed: 2.2, up: 4.2, life: 0.75, size: 0.3, seed: 100 + i, box: [1.2, 0.6, 30], spread: [0.5, 1, 0.25], dir: [5, 0, 0] });
  }
  for (const tr of O.fieldTrees) addBurst({ t0: tWave(tr.x + 0.5 + 4.2), at: [tr.x + 0.5, tr.h + 3.5, tr.z + 0.5], n: 26, colors: [0x3c8a2a, 0x2f7020, 0x55a53a, 0x6a4a2a], speed: 3, up: 3, life: 0.7, size: 0.3, seed: 150 + tr.x, box: [2.5, 2.5, 2.5] });
  for (const f of O.floors) {
    const t0 = landT(f.k);
    for (let i = 0; i < 4; i++) addBurst({ t0, at: [E.lerp(FX0, FX1, (i + 0.5) / 4), f.Y - 0.6, FZ1 + 0.3], n: 16, colors: [0xbfae94, 0x9b8a72, 0xd8cbb5, 0x8c8c8c], speed: 3.0, up: 0.8, life: 0.55, size: 0.38, seed: 300 + f.k * 10 + i, box: [16, 0.3, 0.5], dir: [0, 0, 2.2], spread: [1, 0.6, 0.4] });
    addBurst({ t0, at: [FX0 - 0.3, f.Y - 0.6, 0], n: 16, colors: [0xbfae94, 0x9b8a72, 0xd8cbb5], speed: 3, up: 0.8, life: 0.55, size: 0.38, seed: 500 + f.k, box: [0.5, 0.3, 28], dir: [-2.2, 0, 0], spread: [0.4, 0.6, 1] });
    addBurst({ t0, at: [FX1 + 0.3, f.Y - 0.6, 0], n: 10, colors: [0xbfae94, 0x9b8a72, 0xd8cbb5], speed: 3, up: 0.8, life: 0.55, size: 0.38, seed: 400 + f.k, box: [0.5, 0.3, 28], dir: [2.2, 0, 0], spread: [0.4, 0.6, 1] });
  }
  const cp1 = creeperPos(T.hit1), cp2 = creeperPos(T.hit2), cpp = creeperPos(T.poof - 0.001);
  const hp1 = heroFightPos(T.hit1), hp2 = heroFightPos(T.hit2);
  const mid = (h, c) => [E.lerp(h[0], c[0], 0.6), MY + 1.3, E.lerp(h[2], c[2], 0.6)];
  addBurst({ t0: T.hit1, at: mid(hp1, cp1), n: 22, colors: [0xffffff, 0xfff3a0, 0xffd34d], speed: 4.5, up: 1.5, life: 0.35, size: 0.1, grav: -3, seed: 601 });
  addBurst({ t0: T.hit2, at: mid(hp2, cp2), n: 22, colors: [0xffffff, 0xfff3a0, 0xffd34d], speed: 4.5, up: 1.5, life: 0.35, size: 0.1, grav: -3, seed: 602 });
  addBurst({ t0: T.poof, at: [cpp[0], MY + 0.8, cpp[2]], n: 70, colors: [0xe6e6e6, 0xbdbdbd, 0x969696, 0x5fb348, 0x7fd06a, 0x3f8f34], speed: 3.4, up: 1.6, life: 0.55, size: 0.15, grav: -2.5, seed: 603, box: [0.9, 1.5, 0.9] });
  O.items.forEach((it, i) => { if (i % 2 === 0) addBurst({ t0: it.t1, at: [it.to[0], MY + 1.0, it.to[2]], n: 6, colors: [0xff4050, 0xffffff, 0x60ff80], speed: 1.8, up: 2.4, life: 0.45, size: 0.08, grav: -6, seed: 700 + i }); });
  O.partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), O.parts.length);
  O.partMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  O.partMesh.frustumCulled = false;
  scene.add(O.partMesh);

  // ---------------------------------------------------------------- HTML overlays
  O.vignette = E.el('div', { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)' });
  O.lowShade = E.el('div', { position: 'absolute', left: '0', right: '0', bottom: '0', height: '420px', opacity: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))' });
  O.plate1 = E.plate([{ text: 'БОТ ИГРАЕТ' }, { text: 'ЗА МЕНЯ', bg: '#111' }], { x: 560, y: 330, size: 120, rot: -4 });
  O.plate70 = E.plate([{ text: '70 × 30', bg: '#e3262f' }], { x: 960, y: 135, size: 86, rot: -3 });
  O.dimTxt = [E.pixelText('70', { x: 0, y: 0, size: 62, color: '#ffe14a', outline: 5 }), E.pixelText('30', { x: 0, y: 0, size: 62, color: '#ffe14a', outline: 5 })];
  O.dimTxt.forEach(e => { e.style.opacity = 0; });
  O.floorTxt = E.pixelText('ЭТАЖ 1/10', { x: 960, y: 985, size: 76, color: '#fff', outline: 6 });
  O.floorTxt.style.opacity = 0;
  O.arrow = E.el('img', { position: 'absolute', left: '0', top: '0', width: '63px', imageRendering: 'pixelated', opacity: 0, filter: 'drop-shadow(0 6px 0 rgba(0,0,0,0.35))' });
  O.arrow.src = E.pixelArt([
    '..XXXXX..',
    '..XRRRX..',
    '..XRRRX..',
    '..XRRRX..',
    'XXXRRRXXX',
    'XRRRRRRRX',
    '.XRRRRRX.',
    '..XRRRX..',
    '...XRX...',
    '....X....'], { X: '#ffffff', R: '#e3262f' }, 7);
  O.money = E.moneyText({ x: 960, y: 905, size: 116 });
  // a thinner outline than the engine's default: in the pixel font a heavy outline makes "8" read like "S"
  O.money.dataset.shadow = E.outlineShadow(3, '#0b2a12') + ', 9px 9px 0 #062010, 0 0 58px rgba(80,255,120,0.55)';
  O.money.style.textShadow = O.money.dataset.shadow;
  O.money.style.opacity = 0;
  O.pops = [];
  let lastPop = -1;
  O.items.forEach((it, i) => {
    if (it.t1 < lastPop + 0.45 || it.t1 > T.sit - 0.3) return;    // one at a time
    lastPop = it.t1;
    const e = E.pixelText('', { x: 0, y: 0, size: 44, color: '#4dff7a', outline: 3, shadow: '#062010' });
    e.innerHTML = moneyHTML('+$', 1000 + Math.floor(hash2(i, 3, 9) * 90) * 100, 44);
    e.style.opacity = 0;
    O.pops.push({ e, it });
  });
  O.plateEnd = E.plate([{ text: 'СКОЛЬКО' }, { text: 'ЗАРАБОТАЕТ?', bg: '#111' }], { x: 600, y: 250, size: 104, rot: -3 });
  O.flash = E.flash();
}

// ---------------------------------------------------------------- the fight: positions
const CR_START = F(8.6, 0, 1.2), CR_END = F(1.12, 0, 0.1);
const FACE_CR = angTo(FIGHT, CR_END);
const CR_DIR = [Math.sin(FACE_CR), 0, Math.cos(FACE_CR)];
function heroStep(t) {        // he steps into each hit
  return 0.24 * E.ease.out(E.seg(t, T.hit1 - 0.1, T.hit1 + 0.02)) + 0.2 * E.ease.out(E.seg(t, T.hit2 - 0.1, T.hit2 + 0.02));
}
function heroFightPos(t) { const s = heroStep(t); return [FIGHT[0] + CR_DIR[0] * s, MY, FIGHT[2] + CR_DIR[2] * s]; }
function creeperPos(t) {
  const ck = E.seg(t, T.fight, T.creepArrive);
  const cp = mix3(CR_START, CR_END, E.ease.out(ck) * 0.35 + ck * 0.65);
  const kb = E.ease.out(E.seg(t, T.hit1, T.hit1 + 0.2)) * 0.9 - E.ease.inOut(E.seg(t, T.hit1 + 0.2, T.hit2 - 0.03)) * 0.58;
  const kb2 = E.ease.out(E.seg(t, T.hit2, T.hit2 + 0.16)) * 0.6;
  const y = Math.sin(Math.PI * E.seg(t, T.hit1, T.hit1 + 0.3)) * 0.45 + Math.sin(Math.PI * E.seg(t, T.hit2, T.hit2 + 0.18)) * 0.3;
  return [cp[0] + CR_DIR[0] * (kb + kb2), MY + y, cp[2] + CR_DIR[2] * (kb + kb2)];
}

// ---------------------------------------------------------------- update parts
const NIGHT = { sky: ['#040a1e', '#0e1e4e', '#25427f'], fog: '#18295c', hemiSky: 0x928eb2, hemiGround: 0x22202c, hemi: 1.2, sun: 0xdcd6f2, sunI: 1.4 };
const DAY = { sky: ['#2a76dc', '#68adef', '#b2d9f6'], fog: '#b9dcf6', hemiSky: 0xd8ecff, hemiGround: 0xb4b48e, hemi: 1.4, sun: 0xfff0d8, sunI: 2.5 };
let lastSkyKey = -1;
function setDaylight(k, t) {
  const key = Math.round(k * 200);
  if (key !== lastSkyKey) {
    lastSkyKey = key;
    const g = O.skyCanvas.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, mixHex(NIGHT.sky[0], DAY.sky[0], k));
    gr.addColorStop(0.55, mixHex(NIGHT.sky[1], DAY.sky[1], k));
    gr.addColorStop(1, mixHex(NIGHT.sky[2], DAY.sky[2], k));
    g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    O.skyTex.needsUpdate = true;
  }
  const c = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  E.scene.fog.color.copy(c(NIGHT.fog, DAY.fog));
  // day: little haze on the farm (it starts past 120 blocks), the far hills fade into the sky
  E.scene.fog.near = E.lerp(45, 125, k); E.scene.fog.far = E.lerp(170, 360, k);
  O.hemi.color.copy(c(NIGHT.hemiSky, DAY.hemiSky)); O.hemi.groundColor.copy(c(NIGHT.hemiGround, DAY.hemiGround));
  O.hemi.intensity = E.lerp(NIGHT.hemi, DAY.hemi, k);
  O.sun.color.copy(c(NIGHT.sun, DAY.sun)); O.sun.intensity = E.lerp(NIGHT.sunI, DAY.sunI, k);
  O.rim.intensity = 3.2 * (1 - k);
  O.stars.material.opacity = 1 - E.clamp(k * 1.6);
  O.moon.material.opacity = 1 - E.clamp(k * 1.4); O.moonGlow.material.opacity = 0.5 * (1 - E.clamp(k * 1.4));
  O.moon.visible = O.moonGlow.visible = O.stars.visible = k < 0.99;
  O.clouds.material.opacity = 0.9 * E.clamp(k * 1.3 - 0.2);
  O.clouds.visible = k > 0.15;
}

let lastBushKey = null;
const bushT0 = (x, z) => T.bush0 + Math.floor(Math.abs(z + 0.5 - P0[2]) / 2) * T.rowStep + Math.abs(x + 0.5 - P0[0]) * 0.006;
function updateBushes(t) {
  const key = t < T.bush0 ? 'a' : t > T.bush0 + 2 ? 'b' : t.toFixed(4);
  if (key === lastBushKey) return;
  lastBushKey = key;
  const g = O.gBushGeo;
  g.begin();
  for (const [x, z] of O.gBush) {
    const t0 = bushT0(x, z);
    const k = E.seg(t, t0, t0 + 0.3);
    if (k <= 0) continue;
    g.plant(x + 0.5, 0, z + 0.5, E.ease.outBack(k), 0);
  }
  g.end();
}

function updateFloors(t) {
  let topK = 1;
  for (const f of O.floors) if (t >= riseT(f.k)) topK = f.k;
  for (const f of O.floors) {
    const off = floorOff(f.k, t);
    if (off === null || off < -2.97) { f.g.visible = false; continue; }
    f.g.visible = true;
    f.g.position.y = off;
    // the inner bushes are hidden under the floors above once those are built
    f.inner.visible = f.k >= topK - 1;
  }
}

function updateParticles(t) {
  const m = O.partMesh;
  let n = 0;
  for (const p of O.parts) {
    const dt = t - p.t0;
    if (dt < 0 || dt > p.life) continue;
    const k = dt / p.life, s = p.s * (1 - k * k);
    setM(m, n, p.o[0] + p.v[0] * dt, p.o[1] + p.v[1] * dt + 0.5 * p.g * dt * dt, p.o[2] + p.v[2] * dt, s, s, s, p.rs * dt, p.rs * dt * 0.7);
    m.setColorAt(n, p.c);
    n++;
  }
  m.count = n;
  m.visible = n > 0;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

function updateChests(t) {
  for (let i = 0; i < 10; i++) {
    const g = O.chests[i];
    const ta = T.chests - 0.06 + i * 0.035;     // they pop in, in a quick run, at the cut to this shot
    if (t < ta) { g.visible = false; continue; }
    g.visible = true;
    const s0 = t < T.chests ? 0 : E.ease.outBack(E.seg(t, Math.max(ta, T.chests), Math.max(ta, T.chests) + 0.28));
    if (s0 <= 0.001) { g.visible = false; continue; }
    let last = -1;
    for (const it of O.items) if (it.ci === i && it.t1 <= t && it.t1 > last) last = it.t1;
    let b = 0;
    if (last > 0) { const dt = t - last; b = Math.exp(-dt * 9) * Math.cos(dt * 34); }
    g.scale.set(s0 * (1 + 0.1 * b), s0 * (1 - 0.2 * b), s0 * (1 + 0.1 * b));
    g.position.y = MY + Math.max(0, b) * 0.12;
  }
}

function updateItems(t) {
  const m = O.itemMesh, q = E.camera.quaternion;
  let n = 0;
  for (const it of O.items) {
    if (t < it.t0 || t >= it.t1) continue;
    const k = E.seg(t, it.t0, it.t1);
    const x = E.lerp(it.from[0], it.to[0], k), z = E.lerp(it.from[2], it.to[2], k);
    const y = E.lerp(it.from[1], it.to[1], k) + Math.sin(Math.PI * k) * it.apex;
    const s = 1 - 0.4 * E.clamp((k - 0.8) * 5);
    _o.position.set(x, y, z); _o.quaternion.copy(q); _o.rotateZ(it.spin + k * 6); _o.scale.set(s, s, s); _o.updateMatrix();
    m.setMatrixAt(n++, _o.matrix);
  }
  m.count = n; m.visible = n > 0;
  m.instanceMatrix.needsUpdate = true;
  _o.rotation.set(0, 0, 0);
}

// ---------------------------------------------------------------- 1DEX1 + creeper
function resetRig(r) {
  for (const p of [r.head, r.body, r.armL, r.armR, r.legL, r.legR]) p.rotation.set(0, 0, 0);
  r.root.rotation.set(0, 0, 0);
}
function idle(r, t, a = 1) {
  r.armR.rotation.z = -0.06 - Math.sin(t * 2.2) * 0.03 * a;
  r.armL.rotation.z = 0.06 + Math.sin(t * 2.2) * 0.03 * a;
  r.armR.rotation.x = Math.sin(t * 1.7) * 0.04 * a;
  r.armL.rotation.x = -Math.sin(t * 1.7) * 0.04 * a;
}
function swing(k) {      // arm angle of a hit, k 0..1
  if (k <= 0 || k >= 1) return 0;
  return k < 0.35 ? -2.1 * E.ease.out(k / 0.35) : -2.1 + 2.1 * E.ease.inOut((k - 0.35) / 0.65);
}
function setCreeperTint(red, white) {
  for (const m of O.crMats) {
    m.emissive.setRGB(red * 0.7 + white * 0.9, white * 0.9, white * 0.9);
    m.color.setRGB(1, 1 - red * 0.9, 1 - red * 0.9);
  }
}
const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };

function updateActors(t) {
  const r = O.rig;
  resetRig(r);
  O.cr.root.visible = false;
  O.cr.root.rotation.set(0, 0, 0);
  O.cr.root.scale.set(1, 1, 1);
  setCreeperTint(0, 0);
  if (t < T.fight) {
    const [y, toss] = t < riseT(2) ? [playerLift(t), 0] : heroFloor(t);
    r.root.position.set(P0[0], y, P0[2]);
    idle(r, t);
    // looks into the camera, then turns a little and looks around the field
    let rot = E.lerp(0, 0.35, E.ease.inOut(E.seg(t, 0.9, 2.2)));
    r.head.rotation.y = E.lerp(0, -0.25, E.ease.inOut(E.seg(t, 1.0, 2.2))) + Math.sin(E.seg(t, 2.6, 5.6) * Math.PI * 2) * 0.5;
    r.head.rotation.x = E.lerp(0, -0.08, E.seg(t, 1.2, 2.4));
    // while building he faces the camera's side of the tower and puts each floor in place with a swing
    const camDir = angTo(P0, [-16, 0, 32]);
    rot = angLerp(rot, camDir, E.ease.inOut(E.seg(t, 5.6, 6.2)));
    r.root.rotation.y = rot;
    if (t >= riseT(2)) {
      r.head.rotation.x = -0.25;
      for (let k = 2; k <= FLOORS; k++) r.armR.rotation.x += swing(E.seg(t, riseT(k) - 0.02, landT(k) + 0.04)) * 0.8;
      // in the air when tossed: legs apart a little
      r.legR.rotation.x = toss > 0.04 ? 0.3 : 0; r.legL.rotation.x = -r.legR.rotation.x;
      // 10/10: both arms up
      const win = E.ease.outBack(E.seg(t, landT(FLOORS) + 0.05, landT(FLOORS) + 0.3));
      if (win > 0) {
        r.armR.rotation.x = E.lerp(r.armR.rotation.x, -2.9, win); r.armL.rotation.x = E.lerp(r.armL.rotation.x, -2.9, win);
        r.armR.rotation.z = E.lerp(r.armR.rotation.z, -0.35, win); r.armL.rotation.z = E.lerp(r.armL.rotation.z, 0.35, win);
        r.head.rotation.x = E.lerp(-0.25, -0.45, win);
      }
    }
    if (t >= T.wave0 && t < T.wave1 + 0.5) {
      // tucks his legs over the ridge
      const k = E.seg(t, T_CREST - 0.24, T_CREST + 0.36);
      const tuck = Math.sin(Math.PI * k) * (k > 0 && k < 1 ? 1 : 0);
      r.legR.rotation.x = -0.6 * tuck; r.legL.rotation.x = 0.3 * tuck;
      r.armR.rotation.x -= 0.9 * tuck; r.armL.rotation.x -= 0.9 * tuck;
    }
  } else if (t < T.chests) {
    const C = heroFightPos(t);
    r.root.position.set(...C);
    const turnK = E.ease.outBack(E.seg(t, T.turn0, T.turn0 + 0.16));
    // before: looks off to the left; after the poof: turns to the camera and pumps his fist
    const toCam = -FA, back = E.ease.inOut(E.seg(t, T.poof + 0.12, T.poof + 0.45));
    let rot = angLerp(toCam - 0.75, FACE_CR, turnK);
    rot = angLerp(rot, toCam + 0.15, back);
    r.root.rotation.y = rot;
    r.head.rotation.y = E.lerp(0.35, 0, turnK) + E.lerp(0, -0.1, back);
    r.head.rotation.x = 0.05;
    idle(r, t, 0.5);
    r.armR.rotation.x += swing(E.seg(t, T.hit1 - 0.08, T.hit1 + 0.14)) + swing(E.seg(t, T.hit2 - 0.08, T.hit2 + 0.14));
    // lunge: he leans into each hit
    r.root.rotation.x = 0.12 * (Math.sin(Math.PI * E.seg(t, T.hit1 - 0.1, T.hit1 + 0.12)) + Math.sin(Math.PI * E.seg(t, T.hit2 - 0.1, T.hit2 + 0.12)));
    const pump = E.seg(t, T.poof + 0.4, 11.0);
    if (pump > 0) {
      const up = E.ease.outBack(E.clamp(pump * 3)) - 0.25 * E.clamp((pump - 0.45) * 4) * Math.sin(pump * 18) * (pump > 0.45 ? 1 : 0);
      r.armR.rotation.x = -2.75 * up; r.armR.rotation.z = -0.2 * up;
      r.head.rotation.x = -0.12 * up;
    }
    if (t < T.poof) {
      O.cr.root.visible = true;
      const cp = creeperPos(t);
      O.cr.root.position.set(...cp);
      const runDir = angTo(CR_START, CR_END), lookDir = angTo(CR_END, C);
      O.cr.root.rotation.y = angLerp(runDir, lookDir, E.seg(t, T.creepArrive - 0.1, T.creepArrive + 0.1));
      const run = 1 - E.seg(t, T.creepArrive - 0.05, T.creepArrive + 0.1);
      const lp = (t - T.fight) * 22;
      O.cr.legs.forEach((l, i) => { l.rotation.x = Math.sin(lp + (i % 2 ? 0 : Math.PI) + (i > 1 ? Math.PI : 0)) * 0.7 * run; });
      const hiss = E.seg(t, T.creepArrive - 0.05, T.hit1);
      const blink = Math.sin((t - T.creepArrive) * 50);
      const sw = 1 + 0.08 * hiss * (0.5 + 0.5 * blink) * (t < T.hit1 ? 1 : 0);
      const die = E.ease.in(E.seg(t, T.hit2 + 0.02, T.poof));
      O.cr.root.rotation.z = -die * 1.4;
      O.cr.root.scale.set(sw, sw, sw);
      // Minecraft's hurt tint: a solid red for a moment, then cut (the second hit kills it: red to the end)
      const red1 = t >= T.hit1 + 0.05 && t < T.hit1 + 0.3 ? 1 : 0;
      const red2 = t >= T.hit2 + 0.05 ? 1 : 0;
      const whiteBlink = hiss > 0 && t < T.hit1 && blink > 0.5 ? 0.3 : 0;
      const hitWhite = (t >= T.hit1 && t < T.hit1 + 0.05) || (t >= T.hit2 && t < T.hit2 + 0.05) ? 1 : 0;
      setCreeperTint(hitWhite ? 0 : Math.max(red1, red2), Math.max(whiteBlink, hitWhite));
    }
  } else if (t < T.sit) {
    // behind the chests (the farm side), facing the camera: catches the harvest and puts it away
    const C = [-3.4, MY, CH_Z - 1.3];
    r.root.position.set(...C);
    r.root.rotation.y = -0.75;
    r.head.rotation.y = -0.1 + Math.sin((t - T.chests) * 2.5) * 0.25; r.head.rotation.x = -0.1 + 0.15 * Math.sin((t - T.chests) * 3.1);
    idle(r, t, 0.6);
    r.armR.rotation.x += swing(((t - T.chests) % 0.42) / 0.42) * 0.75;
    r.armL.rotation.x += swing(((t - T.chests + 0.21) % 0.42) / 0.42) * 0.5;
  } else {
    // sits on the last chest, relaxed, facing the farm; looks into the camera
    r.root.position.set(...SIT);
    r.root.rotation.y = Math.PI;
    r.legR.rotation.x = -1.45 + Math.sin(t * 3.4) * 0.16; r.legL.rotation.x = -1.45 - Math.sin(t * 3.4) * 0.16;
    r.legR.rotation.z = 0.05; r.legL.rotation.z = -0.05;
    r.armR.rotation.x = -0.75; r.armL.rotation.x = -0.75;
    r.armR.rotation.z = 0.1; r.armL.rotation.z = -0.1;
    const cam = E.camera.position;
    const yaw = Math.atan2(cam.x - SIT[0], cam.z - SIT[2]) - r.root.rotation.y;
    let yw = yaw; while (yw > Math.PI) yw -= 2 * Math.PI; while (yw < -Math.PI) yw += 2 * Math.PI;
    r.head.rotation.y = E.clamp(yw, -1.1, 1.1);
    r.head.rotation.x = E.clamp(Math.atan2(SIT[1] + 1.65 - cam.y, Math.hypot(cam.x - SIT[0], cam.z - SIT[2])), -0.5, 0.5);
    r.head.rotation.z = 0.08 + Math.sin(t * 1.3) * 0.03;
  }
}

function updateEyes(t) {
  const on1 = E.ease.out(E.seg(t, T.eyeOn, T.eyeOn + 0.16));
  const hold = 1 - 0.5 * E.ease.inOut(E.seg(t, 0.95, 1.9));
  const off = 1 - E.seg(t, 2.6, 3.1);
  const spike = t > T.eyeOn ? Math.exp(-Math.max(0, t - T.eyeOn - 0.1) * 7) * off : 0;
  let g = on1 * hold * off, s = spike;
  if (t >= T.fight) { g = 0; s = 0; }
  if (t >= T.sit) { g = E.ease.out(E.seg(t, T.eyes2, T.eyes2 + 0.15)); s = t > T.eyes2 ? Math.exp(-Math.max(0, t - T.eyes2 - 0.08) * 6) : 0; }
  O.eyeMat.opacity = E.clamp(g * 1.3);
  // sizes in screen pixels -> world units at the eyes' distance
  O.rig.root.updateMatrixWorld(true);
  const hp = new THREE.Vector3(); O.rig.head.getWorldPosition(hp);
  const wpp = E.camera.position.distanceTo(hp) * 2 * Math.tan(E.camera.fov * Math.PI / 360) / E.H;
  const eyePx = (2 / 16) / wpp;
  const halo = E.clamp(eyePx * 1.6, 34, 420) * (1 + 0.9 * s) * wpp;
  O.eyeHalo.forEach(h => { h.material.opacity = E.clamp(g * 0.7 + s * 0.5); h.scale.set(halo, halo, 1); h.visible = g + s > 0.01; });
  const sw = E.clamp(eyePx * 2, 160, 700) * (0.5 + 1.6 * s) * wpp, shh = E.clamp(eyePx * 0.06, 6, 22) * (1 + 0.8 * s) * wpp;
  O.eyeStreak.forEach(h => { h.material.opacity = E.clamp(s * 0.9 + g * 0.2); h.scale.set(sw, shh, 1); h.visible = g + s > 0.01; });
  O.eyeLight.intensity = (g * 0.05 + s * 0.08) * E.clamp(wpp * 2500);
  // the halo behind his head: strong in the close-up, gone once the camera is back
  const hg = 1 - E.ease.inOut(E.seg(t, 0.75, 1.5));
  O.headGlow.material.opacity = hg;
  O.headGlow.visible = hg > 0.01;
}

// ---------------------------------------------------------------- camera
function shakeAt(t) {
  const imp = [];
  if (t >= T.floors0 && t < T.fight) for (let k = 2; k <= FLOORS; k++) imp.push([landT(k), k === FLOORS ? 0.7 : 0.28, 40, 9]);
  imp.push([T.hit1, 0.07, 55, 12], [T.hit2, 0.09, 55, 12], [T.poof, 0.05, 40, 10]);
  let x = 0, y = 0;
  for (const [t0, a, f, d] of imp) {
    if (t < t0 || t > t0 + 0.6) continue;
    const dt = t - t0, e = a * Math.exp(-dt * d);
    x += e * Math.sin(dt * f); y += e * Math.cos(dt * f * 1.3);
  }
  return [x, y];
}

function updateCamera(t) {
  const pose = camPose(t);
  const cam = E.camera;
  const [sx, sy] = shakeAt(t);
  const hs = t < T.pull0 ? 0.1 : 1;     // almost no handheld float in the close-up
  const hx = (Math.sin(t * 1.3) * 0.02 + Math.sin(t * 2.9) * 0.01) * hs, hy = Math.cos(t * 1.1) * 0.015 * hs;
  cam.position.set(pose.p[0] + sx + hx, pose.p[1] + sy + hy, pose.p[2]);
  let fov = pose.fov;
  for (const th of [T.hit1, T.hit2]) if (t >= th) fov -= 4 * Math.exp(-(t - th) * 9);
  if (t >= landT(FLOORS) && t < T.fight) fov -= 2.5 * Math.exp(-(t - landT(FLOORS)) * 8);   // a punch on 10/10
  if (Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.lookAt(pose.l[0] + sx * 0.5, pose.l[1] + sy * 0.5, pose.l[2]);
  cam.updateMatrixWorld();
}

function updateSun(t) {
  let focus = [0.5, 1, 0.5], size = 9;
  let dayDir = [0.5, 0.85, 0.45];
  if (t >= 2.5 && t < 6) { focus = [0, 0, 0]; size = 42; }
  else if (t >= 6 && t < T.fight) { focus = [0, 12, 0]; size = 50; }
  else if (t >= T.fight && t < T.chests) { focus = [-24, 8, 30]; size = 62; dayDir = [-0.45, 0.8, 0.6]; }     // from behind the camera
  else if (t >= T.chests && t < T.sit) { focus = [-1, MY + 1, CH_Z]; size = 17; dayDir = [-0.5, 0.8, 0.5]; }
  else if (t >= T.sit) { focus = [SIT[0], MY + 1, SIT[2]]; size = 7; dayDir = [0.75, 0.75, -0.05]; }
  const dayK = E.seg(t, T.dayA, T.dayB);
  const dir = v3(mix3([-0.55, 0.65, 0.55], dayDir, E.ease.inOut(dayK))).normalize();
  O.sun.position.set(focus[0] + dir.x * 90, focus[1] + dir.y * 90, focus[2] + dir.z * 90);
  O.sun.target.position.set(...focus);
  O.sun.target.updateMatrixWorld();
  const sc = O.sun.shadow.camera;
  if (sc.right !== size) { sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.updateProjectionMatrix(); }
  O.fill.position.copy(E.camera.position).add(new THREE.Vector3(0.3, 0.35, 0.1));
  O.key.intensity = 2.4 * (1 - E.seg(t, 2.7, 3.4));
  O.key.visible = O.key.intensity > 0.001;
  O.fill.intensity = t < 3.2 ? 2.6 * (1 - 0.35 * E.seg(t, 1.0, 1.8) - 0.65 * E.seg(t, 2.6, 3.2)) : 0;
}

// ---------------------------------------------------------------- UI
const _pv = { v: null };
function toScreen(p) {
  const v = (_pv.v || (_pv.v = new THREE.Vector3())).set(p[0], p[1], p[2]).project(E.camera);
  return [(v.x + 1) / 2 * E.W, (1 - v.y) / 2 * E.H, v.z];
}
function updateUI(t) {
  E.popIn(O.plate1, t, T.plate1, T.plate1Out);
  E.popIn(O.plate70, t, T.plate70, T.plate70Out);
  // the dimension lines grow out from the middle of each edge, their numbers pop in
  const dk = E.ease.out(E.seg(t, T.dims, T.dims + 0.35)), dOut = E.seg(t, T.plate70Out - 0.1, T.plate70Out + 0.15);
  for (const [d, txt, at, off] of [[O.dimX, O.dimTxt[0], [0, MY + 0.6, FZ1 + 1.4], [0, 70]], [O.dimZ, O.dimTxt[1], [FX1 + 1.4, MY + 0.6, 0], [80, 0]]]) {
    d.g.visible = dk > 0.001 && dOut < 1;
    d.g.scale.set(1, 1 - dOut, 1);
    if (d === O.dimX) d.bar.scale.x = Math.max(0.001, dk); else d.bar.scale.z = Math.max(0.001, dk);
    d.g.children.slice(1).forEach((tk, i) => {
      const s = i ? 1 : -1;
      if (d === O.dimX) tk.position.x = s * (FX1 - FX0) / 2 * dk; else tk.position.z = s * (FZ1 - FZ0) / 2 * dk;
    });
    const [x, y] = toScreen(at);
    txt.style.left = E.clamp(x + off[0], 90, E.W - 90) + 'px'; txt.style.top = E.clamp(y + off[1], 90, E.H - 60) + 'px';
    txt.dataset.rot = 0;
    E.popIn(txt, t, T.dims + 0.2, T.plate70Out - 0.1);
  }
  if (t >= T.floors0 && t < T.fight) {
    let k = 1, tk = T.floors0;
    for (let f = 2; f <= FLOORS; f++) if (t >= landT(f)) { k = f; tk = landT(f); }
    O.floorTxt.innerHTML = `ЭТАЖ <span style="color:${k === FLOORS ? '#4dff7a' : '#ffd84a'}">${k}</span>/10`;
    const p = 1 + 0.3 * Math.exp(-(t - tk) * 10) * (t > T.floors0 + 0.2 ? 1 : 0);
    const inK = E.ease.outBack(E.seg(t, T.floors0, T.floors0 + 0.3));
    const outK = E.seg(t, T.fight - 0.18, T.fight - 0.02);
    O.floorTxt.style.opacity = E.clamp(E.seg(t, T.floors0, T.floors0 + 0.08)) * (1 - outK);
    O.floorTxt.style.transform = `translate(-50%,-50%) scale(${inK * p * (1 + outK * 0.2)})`;
  } else O.floorTxt.style.opacity = 0;
  // the red arrow over him on the finished tower
  {
    const a0 = landT(FLOORS) - 0.1, a1 = T.fight - 0.05;
    if (t >= a0 && t < a1) {
      const hp = O.rig.root.position;
      const [x, y] = toScreen([hp.x, hp.y + 2.3, hp.z]);
      const k = E.ease.outBack(E.seg(t, a0, a0 + 0.25));
      O.arrow.style.opacity = E.clamp(k * 3) * (1 - E.seg(t, a1 - 0.08, a1));
      O.arrow.style.transform = `translate(${x - 31}px, ${y - 70 - 12 * Math.abs(Math.sin((t - a0) * 9))}px) scale(${k})`;
      O.arrow.style.transformOrigin = '50% 100%';
    } else O.arrow.style.opacity = 0;
  }
  O.lowShade.style.opacity = t >= T.chests ? 1 - E.seg(t, T.flash0, T.flash1) : 0;
  const m = O.money;
  if (t >= T.money0) {
    let extra = '';
    if (t < T.count1) {
      const k = E.seg(t, T.count0, T.count1);
      m.innerHTML = moneyHTML('$', Math.floor(E.ease.in(k) * 8765432 + k * 123456), 116);
      m.style.textShadow = m.dataset.shadow;
      // a little zoom punch whenever a berry lands
      let last = -1;
      for (const it of O.items) if (it.t1 <= t && it.t1 > last) last = it.t1;
      const pun = last > 0 ? 0.07 * Math.exp(-(t - last) * 16) : 0;
      extra = `scale(${1 + pun})`;
    } else if (t < T.glitch1) {
      const fr = Math.floor(t * 30), r = E.rng(fr * 7 + 3);
      const chars = '0123456789?#$%&';
      const keep = E.seg(t, T.count1, T.glitch1);
      let s = '';
      for (let i = 0; i < 9; i++) s += r() < keep * 0.8 ? '?' : chars[Math.floor(r() * chars.length)];
      m.innerHTML = '<span>$</span><span>' + s.slice(0, 3 + Math.floor(r() * 4)) + '</span>';
      extra = `translate(${(r() - 0.5) * 30}px, ${(r() - 0.5) * 10}px) skewX(${(r() - 0.5) * 20}deg)`;
      m.style.textShadow = m.dataset.shadow + `, ${-8 - r() * 8}px 0 0 rgba(255,30,80,0.85), ${8 + r() * 8}px 0 0 rgba(30,230,255,0.85)`;
    } else {
      m.innerHTML = '<span>$</span><span>???</span>';
      m.style.textShadow = m.dataset.shadow;
      extra = `rotate(${Math.sin((t - T.glitch1) * 5) * 1.5}deg) scale(${1 + 0.04 * Math.sin((t - T.glitch1) * 7)})`;
    }
    // during the glitch it jumps to its place in the last shot (left, bigger)
    const mk = t < T.count1 ? 0 : t < T.glitch1 ? (E.rng(Math.floor(t * 30) + 11)() < E.seg(t, T.count1, T.glitch1) ? 1 : 0) : 1;
    m.style.left = E.lerp(960, 560, mk) + 'px'; m.style.top = E.lerp(905, 620, mk) + 'px';
    extra += ` scale(${E.lerp(1, 1.3, mk)})`;
    E.popIn(m, t, T.money0, 1e9, { extra });
  } else m.style.opacity = 0;
  for (const p of O.pops) {
    const k = E.seg(t, p.it.t1, p.it.t1 + 0.5);
    if (t < p.it.t1 || k >= 1 || t >= T.sit) { p.e.style.opacity = 0; continue; }
    const [x, y, z] = toScreen([p.it.to[0], MY + 1.35, p.it.to[2]]);
    if (z > 1 || x < 60 || x > E.W - 60) { p.e.style.opacity = 0; continue; }
    p.e.style.left = x + 'px';
    p.e.style.top = (y - k * 80) + 'px';
    p.e.style.opacity = E.clamp(k * 6) * (1 - E.clamp((k - 0.6) / 0.4));
    p.e.style.transform = `translate(-50%,-50%) scale(${0.6 + 0.4 * E.ease.outBack(E.clamp(k * 4))})`;
  }
  E.popIn(O.plateEnd, t, T.plateEnd, 1e9);
  let f = 0;
  if (t > T.eyeOn) f = Math.max(f, 0.14 * Math.exp(-Math.max(0, t - T.eyeOn - 0.05) * 10));
  for (const th of [T.hit1, T.hit2]) if (t >= th) f = Math.max(f, 0.3 * Math.exp(-(t - th) * 16));
  if (t >= T.poof) f = Math.max(f, 0.2 * Math.exp(-(t - T.poof) * 14));
  if (t >= landT(FLOORS)) f = Math.max(f, 0.12 * Math.exp(-(t - landT(FLOORS)) * 14));
  if (t >= T.fight) f = Math.max(f, 0.35 * Math.exp(-(t - T.fight) * 14));
  if (t >= T.sit) f = Math.max(f, 0.55 * Math.exp(-(t - T.sit) * 12));
  if (t >= T.chests) f = Math.max(f, 0.3 * Math.exp(-(t - T.chests) * 14));
  f = Math.max(f, E.ease.in(E.seg(t, T.flash0, T.flash1)));
  O.flash.style.opacity = f;
}

export function update(t, e) {
  E = e;
  updateCamera(t);
  setDaylight(E.ease.inOut(E.seg(t, T.dayA, T.dayB)), t);
  updateSun(t);
  updateField(t);
  updateBushes(t);
  updateFloors(t);
  updateChests(t);
  updateActors(t);
  updateEyes(t);
  updateItems(t);
  updateParticles(t);
  updateUI(t);
}
