// Возраст: вырезаем лицо из кадра и отдаём в AgeGenderNet.
// Работает в фоне, не чаще одного лица за раз, чтобы не тормозить видео.

const CROP = 128;

export class AgeEstimator {
  constructor(faceapi) {
    this.faceapi = faceapi;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = CROP;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.busy = false;
  }

  // Квадрат вокруг лица в пикселях кадра.
  static faceSquare(track, W, H) {
    const f = track.face;
    if (f) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 468; i++) {
        const x = f[i].x * W, y = f[i].y * H;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const s = Math.max(x1 - x0, y1 - y0) * 1.25;
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s };
    }
    const p = track.pose;
    if (!p) return null;
    const ok = (i, t = 0.8) => p[i] && (p[i].visibility ?? 1) >= t;
    // лицо должно смотреть в камеру: нос и оба глаза видны
    if (!ok(0) || !ok(2) || !ok(5)) return null;
    const pts = [0, 2, 5, 7, 8, 9, 10].filter((i) => ok(i, 0.5)).map((i) => ({ x: p[i].x * W, y: p[i].y * H }));
    const eyeDist = Math.hypot((p[2].x - p[5].x) * W, (p[2].y - p[5].y) * H);
    const earDist = ok(7, 0.5) && ok(8, 0.5) ? Math.hypot((p[7].x - p[8].x) * W, (p[7].y - p[8].y) * H) : 0;
    const s = Math.max(eyeDist * 3.6, earDist * 1.5);
    if (s < 24) return null; // слишком мелко — возраст будет случайным
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const cy = pts.reduce((a, q) => a + q.y, 0) / pts.length + s * 0.08;
    return { cx, cy, s };
  }

  async estimate(video, track, W, H) {
    if (this.busy) return null;
    const sq = AgeEstimator.faceSquare(track, W, H);
    if (!sq) return null;
    this.busy = true;
    try {
      const { cx, cy, s } = sq;
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, CROP, CROP);
      this.ctx.drawImage(video, cx - s / 2, cy - s / 2, s, s, 0, 0, CROP, CROP);
      const r = await this.faceapi.nets.ageGenderNet.predictAgeAndGender(this.canvas);
      const res = Array.isArray(r) ? r[0] : r;
      return res && isFinite(res.age) ? res.age : null;
    } catch (e) {
      console.warn('age', e);
      return null;
    } finally {
      this.busy = false;
    }
  }
}
