// Простое сопровождение целей между кадрами: каждой цели — свой номер,
// сглаженная рамка и сглаженные цифры.

let nextId = 1;

function iou(a, b) {
  const x1 = Math.max(a.x0, b.x0), y1 = Math.max(a.y0, b.y0);
  const x2 = Math.min(a.x1, b.x1), y2 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 0 ? inter / ua : 0;
}

// Медиана последних значений + экспоненциальное сглаживание
class Smoother {
  constructor(size = 9, alpha = 0.2) { this.buf = []; this.size = size; this.alpha = alpha; this.value = null; }
  push(v) {
    if (v === null || v === undefined || !isFinite(v)) return this.value;
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    const med = [...this.buf].sort((a, b) => a - b)[this.buf.length >> 1];
    this.value = this.value === null ? med : this.value + (med - this.value) * this.alpha;
    return this.value;
  }
  get count() { return this.buf.length; }
}

export class Track {
  constructor(box) {
    this.id = nextId++;
    this.box = { ...box };
    this.raw = box;
    this.born = performance.now();
    this.seen = this.born;
    this.dist = new Smoother(9, 0.25);
    this.height = new Smoother(25, 0.08);
    this.age = new Smoother(9, 0.35);
    this.distSrc = null;
    this.heightSrc = null;
    this.locked = false;
    this.lockedAt = 0;
    this.lastAgeAt = 0;
    this.pose = null;
    this.face = null;
    this.faceSeenAt = 0;
    this.meas = null;
  }
  update(box) {
    const a = 0.55;
    for (const k of ['x0', 'y0', 'x1', 'y1']) this.box[k] += (box[k] - this.box[k]) * a;
    this.raw = box;
    this.seen = performance.now();
  }
}

export class Tracker {
  constructor() { this.tracks = []; }

  // dets: [{box, pose, world}]
  update(dets) {
    const now = performance.now();
    const used = new Set();
    const pairs = [];
    this.tracks.forEach((t, ti) => dets.forEach((d, di) => {
      const s = iou(t.box, d.box);
      if (s > 0.15) pairs.push([s, ti, di]);
    }));
    pairs.sort((a, b) => b[0] - a[0]);
    const tUsed = new Set();
    for (const t of this.tracks) t.stale = true;
    for (const [, ti, di] of pairs) {
      if (tUsed.has(ti) || used.has(di)) continue;
      tUsed.add(ti); used.add(di);
      const t = this.tracks[ti];
      t.update(dets[di].box);
      t.stale = false;
      t.pose = dets[di].pose;
      t.world = dets[di].world;
    }
    dets.forEach((d, di) => {
      if (used.has(di)) return;
      const t = new Track(d.box);
      t.stale = false;
      t.pose = d.pose;
      t.world = d.world;
      this.tracks.push(t);
    });
    // цели, которых не видно больше 400 мс, удаляем
    this.tracks = this.tracks.filter((t) => now - t.seen < 400);
    return this.tracks;
  }

  reset() { this.tracks = []; }
}
