// Shared engine for the 1DEX1 video clips: a three.js scene drawn frame by frame (time is passed in, nothing
// depends on the clock), Minecraft-like blocks with pixel textures made here, a player model from a 64x64
// skin, and HTML overlays (plates, pixel counters, menu buttons) on top.
import * as THREE from 'three';
export { THREE };

export const W = 1920, H = 1080;
export let renderer, scene, camera, ui;
export const tex = {};

// ------------------------------------------------------------------ time helpers
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
/** 0..1 progress of t between t0 and t1. */
export const seg = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
export const ease = {
  inOut: k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  outBack: k => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outElastic: k => k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  outExpo: k => k === 1 ? 1 : 1 - Math.pow(2, -10 * k),
};
/** A seeded random generator (the same numbers every run). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ setup
export async function init() {
  const canvas = document.getElementById('gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 600);
  ui = document.getElementById('ui');
  await makeTextures();
}

export function render() { renderer.render(scene, camera); }

// ------------------------------------------------------------------ textures
function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A 16x16 (or w x h) pixel canvas painted by f(x, y, r) -> [r,g,b,a] or null. */
export function pixelCanvas(w, h, f, seed = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const r = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = f(x, y, r);
    const i = (y * w + x) * 4;
    if (!p) { img.data[i + 3] = 0; continue; }
    img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = p.length > 3 ? p[3] : 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const jitter = (base, r, amt) => base.map(v => Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * amt))));
const pick = (r, list) => list[Math.floor(r() * list.length)];

export function pixelTex(w, h, f, seed) { return canvasTex(pixelCanvas(w, h, f, seed)); }

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

async function makeTextures() {
  const skinImg = await loadImage('assets/skin.png');
  const sc = document.createElement('canvas');
  sc.width = 64; sc.height = 64;
  sc.getContext('2d').drawImage(skinImg, 0, 0);
  tex.skin = canvasTex(sc);
  tex.skinCanvas = sc;

  const grassCols = [[95, 159, 53], [84, 145, 46], [107, 170, 62], [76, 132, 42], [117, 179, 70]];
  const dirtCols = [[134, 96, 67], [121, 85, 58], [150, 108, 74], [107, 76, 51], [160, 118, 82]];
  tex.grassTop = pixelTex(16, 16, (x, y, r) => jitter(pick(r, grassCols), r, 10), 11);
  tex.dirt = pixelTex(16, 16, (x, y, r) => jitter(pick(r, dirtCols), r, 8), 12);
  tex.grassSide = pixelTex(16, 16, (x, y, r) => {
    const edge = 3 + ((x * 7 + 3) % 3 === 0 ? 1 : 0) + ((x * 5) % 4 === 0 ? 1 : 0);
    return y < edge ? jitter(pick(r, grassCols), r, 10) : jitter(pick(r, dirtCols), r, 8);
  }, 13);
  tex.stone = pixelTex(16, 16, (x, y, r) => jitter(pick(r, [[125, 125, 125], [116, 116, 116], [135, 135, 135], [108, 108, 108]]), r, 8), 14);
  tex.cobble = pixelTex(16, 16, (x, y, r) => {
    const cell = ((Math.floor((x + (y >> 2) * 3) / 4) * 7 + Math.floor(y / 4) * 3) % 5);
    const edge = (x + (y >> 2) * 3) % 4 === 0 || y % 4 === 0;
    return edge ? jitter([72, 72, 72], r, 10) : jitter([[118, 118, 118], [132, 132, 132], [104, 104, 104], [140, 140, 140], [96, 96, 96]][cell], r, 12);
  }, 15);
  tex.planks = pixelTex(16, 16, (x, y, r) => {
    if (y % 4 === 3) return [104, 78, 44];
    const seam = (y >> 2) % 2 === 0 ? x === 5 : x === 12;
    if (seam) return [110, 83, 47];
    return jitter([[162, 130, 78], [154, 122, 72], [170, 137, 84]][(x * 3 + y) % 3], r, 8);
  }, 16);
  // chest: top / side / front (with the latch)
  const chestWood = (x, y, r) => jitter([[160, 104, 42], [146, 94, 36], [171, 113, 48]][(x + y * 2) % 3], r, 10);
  const chestEdge = [74, 46, 20];
  tex.chestTop = pixelTex(14, 14, (x, y, r) => (x === 0 || y === 0 || x === 13 || y === 13) ? chestEdge : chestWood(x, y, r), 17);
  tex.chestSide = pixelTex(14, 14, (x, y, r) => (x === 0 || x === 13 || y === 0 || y === 13 || y === 4 || y === 5) ? chestEdge : chestWood(x, y, r), 18);
  tex.chestFront = pixelTex(14, 14, (x, y, r) => {
    if (x >= 6 && x <= 7 && y >= 3 && y <= 6) return y === 3 ? [70, 70, 70] : [196, 196, 196];
    return (x === 0 || x === 13 || y === 0 || y === 13 || y === 4 || y === 5) ? chestEdge : chestWood(x, y, r);
  }, 19);
  // sweet berry bush (with berries) and young bush
  tex.bush = pixelTex(16, 16, (x, y, r) => {
    const dx = x - 7.5, dy = y - 9;
    const inside = dx * dx * 0.9 + dy * dy * 1.3 < 52 + (r() - 0.5) * 22 && y > 1;
    if (!inside) return null;
    if (r() < 0.12 && y > 3) return [205, 28, 40];
    if (r() < 0.05) return [255, 92, 92];
    return jitter(pick(r, [[46, 98, 46], [37, 82, 38], [58, 115, 52], [30, 70, 32]]), r, 12);
  }, 21);
  tex.bushYoung = pixelTex(16, 16, (x, y, r) => {
    const dx = x - 7.5, dy = y - 12;
    if (dx * dx + dy * dy * 1.6 > 20 + (r() - 0.5) * 12 || y < 6) return null;
    return jitter(pick(r, [[58, 115, 52], [46, 98, 46], [72, 130, 60]]), r, 12);
  }, 22);
  // creeper
  const creeperGreens = [[93, 168, 75], [78, 150, 62], [110, 186, 90], [60, 128, 50], [129, 200, 108], [150, 205, 132]];
  tex.creeper = pixelTex(16, 16, (x, y, r) => jitter(pick(r, creeperGreens), r, 16), 23);
  tex.creeperFace = pixelTex(8, 8, (x, y, r) => {
    const face = [
      '........',
      '........',
      '.XX..XX.',
      '.XX..XX.',
      '...XX...',
      '..XXXX..',
      '..XXXX..',
      '..X..X..'];
    return face[y][x] === 'X' ? [12, 22, 12] : jitter(pick(r, creeperGreens), r, 16);
  }, 24);
  tex.torch = pixelTex(2, 10, (x, y) => y < 2 ? [255, 214, 90] : y < 3 ? [255, 160, 40] : [118, 86, 50], 25);
  tex.botSkin = makeBotSkin();
  tex.white = pixelTex(2, 2, () => [255, 255, 255], 26);
}

/** A plain grey "bot" skin: grey body, dark legs, a visor with two cyan eyes. */
function makeBotSkin() {
  const c = pixelCanvas(64, 64, (x, y, r) => {
    const g = (b) => jitter([b, b, b + 6], r, 10);
    // head 0..32 x 0..16
    if (y < 16 && x < 32) {
      // front face 8..16 x 8..16: a dark visor and two cyan eyes
      if (x >= 8 && x < 16 && y >= 8) {
        if (y >= 10 && y <= 12 && x >= 9 && x <= 14) return (y === 11 && (x === 10 || x === 13)) ? [90, 240, 255] : [40, 44, 52];
        return g(150);
      }
      return g(140);
    }
    if (y >= 16 && y < 32) {
      if (x < 16) return g(70);              // right leg
      if (x < 40) return y === 20 && x >= 20 && x < 28 ? [90, 240, 255] : g(118);   // body with a cyan stripe
      if (x < 56) return g(128);             // right arm
    }
    if (y >= 48) {
      if (x >= 16 && x < 32) return g(70);   // left leg
      if (x >= 32 && x < 48) return g(128);  // left arm
    }
    return null;
  }, 31);
  return canvasTex(c);
}

// ------------------------------------------------------------------ materials and blocks
export function mat(t, opts = {}) {
  return new THREE.MeshLambertMaterial(Object.assign({ map: t }, opts));
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
export const blockMats = {};
function blockMat(kind) {
  if (blockMats[kind]) return blockMats[kind];
  let m;
  if (kind === 'grass') m = [mat(tex.grassSide), mat(tex.grassSide), mat(tex.grassTop), mat(tex.dirt), mat(tex.grassSide), mat(tex.grassSide)];
  else m = mat(tex[kind]);
  blockMats[kind] = m;
  return m;
}

/** Many blocks of one kind: positions are block corners [x, y, z] (the block fills x..x+1). */
export function blocks(kind, positions, { shadows = true } = {}) {
  const m = new THREE.InstancedMesh(boxGeo, blockMat(kind), positions.length);
  const o = new THREE.Object3D();
  positions.forEach((p, i) => {
    o.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.userData.base = positions;
  return m;
}

/** Moves / scales instance i of an InstancedMesh made by blocks(). */
const tmpO = new THREE.Object3D();
export function setInstance(m, i, x, y, z, s = 1, rotY = 0) {
  tmpO.position.set(x, y, z);
  tmpO.scale.set(s, s, s);
  tmpO.rotation.set(0, rotY, 0);
  tmpO.updateMatrix();
  m.setMatrixAt(i, tmpO.matrix);
}

/** A crossed-planes plant (berry bush). */
const crossGeo = (() => {
  const a = new THREE.PlaneGeometry(1, 1);
  const b = new THREE.PlaneGeometry(1, 1);
  a.rotateY(Math.PI / 4);
  b.rotateY(-Math.PI / 4);
  a.translate(0, 0.5, 0);
  b.translate(0, 0.5, 0);
  const g = new THREE.BufferGeometry();
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const nor = [...a.attributes.normal.array, ...b.attributes.normal.array];
  const uv = [...a.attributes.uv.array, ...b.attributes.uv.array];
  const idx = [...a.index.array, ...Array.from(b.index.array).map(i => i + 4)];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor.map((v, i) => i % 3 === 1 ? 1 : 0), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
})();
export function plants(texture, positions) {
  const m = new THREE.InstancedMesh(crossGeo, new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide }), positions.length);
  positions.forEach((p, i) => setInstance(m, i, p[0] + 0.5, p[1], p[2] + 0.5, 1));
  m.castShadow = true;
  return m;
}

/** A chest (14/16 of a block) standing on block corner p. */
export function chest() {
  const s = 14 / 16;
  const side = mat(tex.chestSide), top = mat(tex.chestTop), front = mat(tex.chestFront);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), [side, side, top, top, front, side]);
  m.castShadow = true;
  m.receiveShadow = true;
  const g = new THREE.Group();
  m.position.y = s / 2;
  g.add(m);
  return g;
}

/** A torch standing on a block top. */
export function torch() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(2 / 16, 10 / 16, 2 / 16), mat(tex.torch));
  stick.position.y = 5 / 16;
  g.add(stick);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.6 / 16, 2.6 / 16, 2.6 / 16), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
  glow.position.y = 9.5 / 16;
  g.add(glow);
  return g;
}

// ------------------------------------------------------------------ skin-mapped boxes (player, bots, creeper)
/**
 * A box w x h x d pixels whose faces take the skin layout at (u, v) of a texture of size tw x th.
 * The front faces +z. inflate: extra pixels on each side (overlay layers).
 */
export function skinBox(texture, u, v, w, h, d, { tw = 64, th = 64, inflate = 0, overlay = false } = {}) {
  const px = 1 / 16;
  const g = new THREE.BoxGeometry((w + inflate * 2) * px, (h + inflate * 2) * px, (d + inflate * 2) * px);
  const rects = {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h],
  };
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z (4 vertices each). The character's right side is -x.
  const faces = ['left', 'right', 'top', 'bottom', 'front', 'back'];
  const pos = g.attributes.position, uv = g.attributes.uv;
  const hx = (w + inflate * 2) * px / 2, hy = (h + inflate * 2) * px / 2, hz = (d + inflate * 2) * px / 2;
  for (let f = 0; f < 6; f++) {
    const [ru, rv, rw, rh] = rects[faces[f]];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const x = pos.getX(i) / hx / 2, y = pos.getY(i) / hy / 2, z = pos.getZ(i) / hz / 2;   // -0.5..0.5
      let s, t;
      switch (faces[f]) {
        case 'front': s = x + 0.5; t = 0.5 - y; break;
        case 'back': s = 0.5 - x; t = 0.5 - y; break;
        case 'left': s = 0.5 - z; t = 0.5 - y; break;
        case 'right': s = z + 0.5; t = 0.5 - y; break;
        case 'top': s = x + 0.5; t = z + 0.5; break;
        default: s = x + 0.5; t = 0.5 - z;
      }
      // a hair inside the pixel rect, so nearest sampling never bleeds into the neighbour
      const e = 0.01;
      uv.setXY(i, (ru + e + s * (rw - 2 * e)) / tw, 1 - (rv + e + t * (rh - 2 * e)) / th);
    }
  }
  uv.needsUpdate = true;
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
    map: texture, transparent: false, alphaTest: overlay ? 0.5 : 0, side: overlay ? THREE.DoubleSide : THREE.FrontSide,
  }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A player model from a 64x64 skin (slim arms by default). Units: blocks (the player is 2 tall), feet at y=0.
 * Returns the parts as pivots: head, body, armL, armR, legL, legR (rotate .rotation.x to swing).
 */
export function makePlayer(texture, { slim = true, overlay = true } = {}) {
  const px = 1 / 16, aw = slim ? 3 : 4;
  const root = new THREE.Group();
  const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x * px, y * px, z * px); root.add(p); return p; };
  const add = (p, m, x, y, z) => { m.position.set(x * px, y * px, z * px); p.add(m); return m; };
  const head = pivot(0, 24, 0), body = pivot(0, 12, 0);
  const armR = pivot(-(4 + aw / 2), 22, 0), armL = pivot(4 + aw / 2, 22, 0);
  const legR = pivot(-2, 12, 0), legL = pivot(2, 12, 0);
  add(head, skinBox(texture, 0, 0, 8, 8, 8), 0, 4, 0);
  add(body, skinBox(texture, 16, 16, 8, 12, 4), 0, 6, 0);
  add(armR, skinBox(texture, 40, 16, aw, 12, 4), 0, -4, 0);
  add(armL, skinBox(texture, 32, 48, aw, 12, 4), 0, -4, 0);
  add(legR, skinBox(texture, 0, 16, 4, 12, 4), 0, -6, 0);
  add(legL, skinBox(texture, 16, 48, 4, 12, 4), 0, -6, 0);
  if (overlay) {
    add(head, skinBox(texture, 32, 0, 8, 8, 8, { inflate: 0.5, overlay: true }), 0, 4, 0);
    add(body, skinBox(texture, 16, 32, 8, 12, 4, { inflate: 0.25, overlay: true }), 0, 6, 0);
    add(armR, skinBox(texture, 40, 32, aw, 12, 4, { inflate: 0.25, overlay: true }), 0, -4, 0);
    add(armL, skinBox(texture, 48, 48, aw, 12, 4, { inflate: 0.25, overlay: true }), 0, -4, 0);
    add(legR, skinBox(texture, 0, 32, 4, 12, 4, { inflate: 0.25, overlay: true }), 0, -6, 0);
    add(legL, skinBox(texture, 0, 48, 4, 12, 4, { inflate: 0.25, overlay: true }), 0, -6, 0);
  }
  return { root, head, body, armL, armR, legL, legR };
}

/** Walking pose at phase p (radians); amount 0..1. */
export function walkPose(rig, p, amount = 1) {
  const s = Math.sin(p) * 0.75 * amount;
  rig.legR.rotation.x = s;
  rig.legL.rotation.x = -s;
  rig.armR.rotation.x = -s * 0.8;
  rig.armL.rotation.x = s * 0.8;
}

/** A creeper (feet at y=0, faces +z). */
export function makeCreeper() {
  const px = 1 / 16;
  const root = new THREE.Group();
  const c = tex.creeper;
  const box = (w, h, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * px, h * px, d * px), mat(c));
    m.castShadow = true;
    return m;
  };
  const body = box(8, 12, 4); body.position.y = 12 * px; root.add(body);
  const head = new THREE.Group(); head.position.y = 18 * px; root.add(head);
  const hm = new THREE.Mesh(new THREE.BoxGeometry(8 * px, 8 * px, 8 * px), [mat(c), mat(c), mat(c), mat(c), mat(tex.creeperFace), mat(c)]);
  hm.position.y = 4 * px; hm.castShadow = true; head.add(hm);
  const legs = [];
  for (const [x, z] of [[-2, 2], [2, 2], [-2, -2], [2, -2]]) {
    const p = new THREE.Group(); p.position.set(x * px, 6 * px, z * px);
    const l = box(4, 6, 4); l.position.y = -3 * px; p.add(l); root.add(p); legs.push(p);
  }
  return { root, head, body, legs };
}

// ------------------------------------------------------------------ light and sky
export function skyGradient(stops) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  stops.forEach(([k, col]) => gr.addColorStop(k, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sun(color = 0xffffff, intensity = 2.2, pos = [20, 40, 15], size = 40) {
  const d = new THREE.DirectionalLight(color, intensity);
  d.position.set(...pos);
  d.castShadow = true;
  d.shadow.mapSize.set(2048, 2048);
  d.shadow.camera.left = -size; d.shadow.camera.right = size;
  d.shadow.camera.top = size; d.shadow.camera.bottom = -size;
  d.shadow.camera.near = 1; d.shadow.camera.far = 200;
  d.shadow.bias = -0.0005;
  d.shadow.normalBias = 0.02;
  scene.add(d);
  scene.add(d.target);
  return d;
}

// ------------------------------------------------------------------ particles (pure functions of time)
/** Little cubes flying out from a point: call update(t) every frame. */
export function burst({ center, count = 30, color = 0xffffff, colors = null, speed = 4, life = 0.8, size = 0.12, gravity = -6, seed = 5, t0 = 0, spread = 1 }) {
  const r = rng(seed);
  const parts = [];
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const col = colors ? colors[Math.floor(r() * colors.length)] : color;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: col, transparent: true }));
    const th = r() * Math.PI * 2, ph = (r() - 0.3) * Math.PI * 0.7;
    const v = speed * (0.5 + r() * 0.8);
    parts.push({ m, vx: Math.cos(th) * Math.cos(ph) * v * spread, vy: Math.sin(ph) * v + v * 0.4, vz: Math.sin(th) * Math.cos(ph) * v * spread, s: size * (0.6 + r() * 0.8), life: life * (0.7 + r() * 0.6) });
    g.add(m);
  }
  scene.add(g);
  return {
    group: g,
    update(t) {
      const dt = t - t0;
      for (const p of parts) {
        const k = dt / p.life;
        if (dt < 0 || k > 1) { p.m.visible = false; continue; }
        p.m.visible = true;
        p.m.position.set(center[0] + p.vx * dt, center[1] + p.vy * dt + 0.5 * gravity * dt * dt, center[2] + p.vz * dt);
        const s = p.s * (1 - k * 0.6);
        p.m.scale.set(s, s, s);
        p.m.material.opacity = 1 - k * k;
      }
    },
  };
}

// ------------------------------------------------------------------ HTML overlays
export function el(tag, style = {}, text = '') {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text) e.textContent = text;
  ui.appendChild(e);
  return e;
}

/**
 * A YouTube-style title plate: lines of bold white capitals, each on its own colored bar
 * (red, black, green...), slightly tilted. Returns the root element; animate with popIn().
 */
export function plate(lines, { x = W / 2, y = 150, size = 92, rot = -2 } = {}) {
  const root = el('div', { position: 'absolute', left: x + 'px', top: y + 'px', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', opacity: 0 });
  root.dataset.rot = rot;
  for (const ln of lines) {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      background: ln.bg || '#e3262f', color: ln.color || '#fff', padding: `${size * 0.08}px ${size * 0.32}px ${size * 0.04}px`,
      fontFamily: "'Inter Display', 'Inter', sans-serif", fontWeight: 900, fontSize: (ln.size || size) + 'px', lineHeight: 1.0,
      letterSpacing: '0.5px', textTransform: 'uppercase', borderRadius: '12px', whiteSpace: 'nowrap',
      boxShadow: '0 10px 0 rgba(0,0,0,0.35), 0 0 40px rgba(0,0,0,0.35)', textShadow: '0 4px 0 rgba(0,0,0,0.35)',
      border: '5px solid rgba(255,255,255,0.95)',
    });
    bar.textContent = ln.text;
    root.appendChild(bar);
  }
  return root;
}

/** Pops an element in at t0 (scale with overshoot) and out at t1 (if given). */
export function popIn(e, t, t0, t1 = 1e9, { dur = 0.35, out = 0.25, extra = '' } = {}) {
  const rot = +(e.dataset.rot || 0);
  if (t < t0 || t > t1 + out) { e.style.opacity = 0; return; }
  let s, o;
  if (t < t0 + dur) { const k = seg(t, t0, t0 + dur); s = ease.outBack(k); o = clamp(k * 3); }
  else if (t > t1) { const k = seg(t, t1, t1 + out); s = 1 + k * 0.15; o = 1 - k; }
  else { s = 1 + Math.sin((t - t0) * 3) * 0.012; o = 1; }
  e.style.opacity = o;
  e.style.transform = `translate(-50%,-50%) rotate(${rot}deg) scale(${s}) ${extra}`;
}

/** Text in the pixel font with a dark outline. */
export function pixelText(text, { x, y, size = 48, color = '#fff', shadow = '#3f3f3f', align = 'center', outline = 0 } = {}) {
  const e = el('div', {
    position: 'absolute', left: x + 'px', top: y + 'px', transform: align === 'center' ? 'translate(-50%,-50%)' : 'translate(0,-50%)',
    fontFamily: 'Pixel', fontSize: size + 'px', color, whiteSpace: 'nowrap', lineHeight: 1.2,
    textShadow: outline ? outlineShadow(outline, '#000') + `, ${size / 8}px ${size / 8}px 0 ${shadow}` : `${size / 8}px ${size / 8}px 0 ${shadow}`,
  }, text);
  return e;
}

export function outlineShadow(w, col) {
  const s = [];
  for (let dx = -w; dx <= w; dx += w) for (let dy = -w; dy <= w; dy += w) if (dx || dy) s.push(`${dx}px ${dy}px 0 ${col}`);
  return s.join(', ');
}

/** A white flash over everything (opacity by time). */
export function flash() {
  return el('div', { position: 'absolute', inset: '0', background: '#fff', opacity: 0 });
}

/** Formats 50000000 as "50 000 000". */
export function groupDigits(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** A small pixel image (drawn from a list of rows of palette letters) as a data URL, scaled up. */
export function pixelArt(rows, palette, scale = 6) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.' || !palette[ch]) continue;
    g.fillStyle = palette[ch];
    g.fillRect(x * scale, y * scale, scale, scale);
  }
  return c.toDataURL();
}

/** The mouse pointer (pixel arrow). */
export const CURSOR = pixelArt([
  'X...........',
  'XX..........',
  'XWX.........',
  'XWWX........',
  'XWWWX.......',
  'XWWWWX......',
  'XWWWWWX.....',
  'XWWWWWWX....',
  'XWWWWWWWX...',
  'XWWWWWWWWX..',
  'XWWWWWXXXXX.',
  'XWWXWWX.....',
  'XWX.XWWX....',
  'XX..XWWX....',
  'X....XWWX...',
  '.....XWWX...',
  '......XX....'], { X: '#000', W: '#fff' }, 4);

/**
 * A big green money counter in the pixel font: "$50 000 000" with narrow gaps between the digit groups,
 * a dark outline and a soft green glow. setMoney(e, value) updates it.
 */
export function moneyText({ x = W / 2, y = H / 2, size = 120, color = '#4dff7a' } = {}) {
  const e = el('div', {
    position: 'absolute', left: x + 'px', top: y + 'px', transform: 'translate(-50%,-50%)', fontFamily: 'Pixel',
    fontSize: size + 'px', color, whiteSpace: 'nowrap', lineHeight: 1,
    textShadow: outlineShadow(Math.max(3, size / 22), '#0b2a12') + `, ${size / 10}px ${size / 10}px 0 #062010, 0 0 ${size / 2}px rgba(80,255,120,0.55)`,
  });
  e.dataset.size = size;
  return e;
}
export function setMoney(e, value) {
  const groups = groupDigits(value).split(' ');
  const gap = (+e.dataset.size) * 0.28;
  e.innerHTML = '<span>$</span>' + groups.map((g, i) => `<span style="margin-left:${i === 0 ? 0 : gap}px">${g}</span>`).join('');
}
