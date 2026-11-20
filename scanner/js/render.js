// Отрисовка: видео, скелет, сетка лица, рамки целей и HUD — всё на одном холсте,
// поэтому запись экрана и снимки получаются ровно такими, как на телефоне.

export const COLORS = {
  red: '#ff2b2b',
  green: '#22f06a',
  white: '#ffffff',
};

const BODY_MIN = 11; // точки 0–10 — лицо, их рисуем отдельно

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.view = { s: 1, ox: 0, oy: 0, mirror: false, W: 1, H: 1 };
    this.resize();
  }

  resize() {
    if (this.frozen) return; // во время записи размер кадра не меняем
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * this.dpr);
    const h = Math.round(window.innerHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // границы для подписей: ниже текста HUD и выше панели кнопок
  beginFrame(controlsTop, rec) {
    const ch = this.canvas.height;
    this.hudTop = (rec ? 86 : 72) * this.dpr;
    this.bottom = Math.min(ch, isFinite(controlsTop) ? controlsTop : ch - 90 * this.dpr) - 6 * this.dpr;
    this.placed = [];
  }

  _free(r) {
    for (const q of this.placed) {
      if (r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) return false;
    }
    return true;
  }

  setView(W, H, mirror) {
    const cw = this.canvas.width, ch = this.canvas.height;
    const s = Math.max(cw / W, ch / H);
    this.view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2, mirror, W, H };
  }

  // пиксели кадра → пиксели холста
  map(u, v) {
    const { s, ox, oy, mirror } = this.view;
    let x = ox + u * s;
    if (mirror) x = this.canvas.width - x;
    return { x, y: oy + v * s };
  }

  // нормализованные координаты → холст
  mapN(p) { return this.map(p.x * this.view.W, p.y * this.view.H); }

  mapBox(b) {
    const a = this.map(b.x0, b.y0), c = this.map(b.x1, b.y1);
    return { x0: Math.min(a.x, c.x), y0: Math.min(a.y, c.y), x1: Math.max(a.x, c.x), y1: Math.max(a.y, c.y) };
  }

  font(px, weight = 500) {
    return `${weight} ${Math.round(px * this.dpr)}px "IBM Plex Mono", ui-monospace, monospace`;
  }

  // ---------------------------------------------------------------- видео
  drawVideo(video, mono) {
    const { ctx } = this;
    const { s, ox, oy, mirror, W, H } = this.view;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (mirror) {
      ctx.translate(this.canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.filter = mono ? 'grayscale(1) contrast(1.12) brightness(0.92)' : 'none';
    ctx.drawImage(video, ox, oy, W * s, H * s);
    ctx.restore();
  }

  // ---------------------------------------------------------------- скелет
  drawSkeleton(pose, connections, withHead = true, alpha = 1) {
    if (!pose) return;
    const { ctx, dpr } = this;
    const ok = (i) => pose[i] && (pose[i].visibility ?? 1) >= 0.5;
    const P = pose.map((p) => this.mapN(p));
    const segs = [];
    for (const c of connections) {
      if (c.start < BODY_MIN || c.end < BODY_MIN) continue;
      if (ok(c.start) && ok(c.end)) segs.push([P[c.start], P[c.end]]);
    }
    // шея: середина плеч → нос (если поверх лица нет сетки)
    if (withHead && ok(11) && ok(12) && ok(0)) {
      const m = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 };
      segs.push([m, P[0]]);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // свечение: широкая полупрозрачная линия под яркой
    const passes = [
      [4.5 * dpr, 'rgba(0,0,0,0.45)'], // тёмная кромка — видно на светлом фоне
      [10 * dpr, 'rgba(255,255,255,0.10)'],
      [5 * dpr, 'rgba(255,255,255,0.28)'],
      [2.2 * dpr, '#ffffff'],
    ];
    for (const [w, col] of passes) {
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (const [a, b] of segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    // суставы
    ctx.fillStyle = '#fff';
    for (let i = BODY_MIN; i < 33; i++) {
      if (!ok(i) || i > 28) continue;
      ctx.beginPath();
      ctx.arc(P[i].x, P[i].y, 3.2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    // голова — кольцо
    if (withHead && ok(7) && ok(8) && ok(0)) {
      const r = Math.hypot(P[7].x - P[8].x, P[7].y - P[8].y) * 0.62;
      ctx.lineWidth = 1.6 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc((P[7].x + P[8].x) / 2, (P[7].y + P[8].y) / 2, Math.max(r, 6 * dpr), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- лицо
  drawFace(face, tesselation, contours, now) {
    const { ctx, dpr } = this;
    const P = face.map((p) => this.mapN(p));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 468; i++) {
      const p = P[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    ctx.save();
    // сетка
    ctx.lineWidth = 0.7 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    for (const c of tesselation) { ctx.moveTo(P[c.start].x, P[c.start].y); ctx.lineTo(P[c.end].x, P[c.end].y); }
    ctx.stroke();
    // контуры
    ctx.lineWidth = 1.3 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    for (const c of contours) { ctx.moveTo(P[c.start].x, P[c.start].y); ctx.lineTo(P[c.end].x, P[c.end].y); }
    ctx.stroke();
    // точки
    ctx.fillStyle = '#fff';
    const r = 1.1 * dpr;
    for (let i = 0; i < P.length; i++) ctx.fillRect(P[i].x - r / 2, P[i].y - r / 2, r, r);
    // радужки
    for (const c of [468, 473]) {
      if (!P[c]) continue;
      const rr = Math.hypot(P[c + 1].x - P[c + 3].x, P[c + 1].y - P[c + 3].y) / 2;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.arc(P[c].x, P[c].y, Math.max(rr, 2 * dpr), 0, Math.PI * 2);
      ctx.stroke();
    }
    // сканирующая линия
    const t = (now % 1600) / 1600;
    const sy = y0 + (y1 - y0) * (t < 0.5 ? t * 2 : 2 - t * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(x0 - 10 * dpr, sy); ctx.lineTo(x1 + 10 * dpr, sy);
    ctx.stroke();
    // подпись
    ctx.font = this.font(10, 600);
    ctx.letterSpacing = `${1.5 * dpr}px`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`СКАН ЛИЦА · ${face.length} ТЧК`, x0, y0 - 8 * dpr);
    ctx.restore();
  }

  // ---------------------------------------------------------------- цель
  drawTarget(track, now, threshold) {
    const { ctx, dpr } = this;
    const cw = this.canvas.width;
    const M = 4 * dpr;
    const top = this.hudTop ?? 72 * dpr;
    const bottom = this.bottom ?? this.canvas.height - 96 * dpr;
    // рамка в пределах видимой части экрана
    const b = this.mapBox(track.box);
    b.x0 = Math.max(M, b.x0); b.x1 = Math.min(cw - M, b.x1);
    b.y0 = Math.max(M, b.y0); b.y1 = Math.min(bottom, b.y1);
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (w < 6 * dpr || h < 6 * dpr) return;
    const locked = track.locked;
    const col = locked ? COLORS.red : COLORS.green;

    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(b.x0, b.y0, w, h);
    ctx.globalAlpha = 1;

    // уголки, при захвате «схлопываются» к рамке
    let k = 0;
    if (locked) {
      const t = Math.min(1, (now - track.lockedAt) / 320);
      k = (1 - t) * (1 - t);
    }
    const pad = k * Math.min(w, h) * 0.25;
    const L = Math.max(10 * dpr, Math.min(w, h) * 0.16);
    const X0 = Math.max(M, b.x0 - pad), Y0 = Math.max(M, b.y0 - pad);
    const X1 = Math.min(cw - M, b.x1 + pad), Y1 = Math.min(bottom, b.y1 + pad);
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(X0, Y0 + L); ctx.lineTo(X0, Y0); ctx.lineTo(X0 + L, Y0);
    ctx.moveTo(X1 - L, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(X1, Y0 + L);
    ctx.moveTo(X1, Y1 - L); ctx.lineTo(X1, Y1); ctx.lineTo(X1 - L, Y1);
    ctx.moveTo(X0 + L, Y1); ctx.lineTo(X0, Y1); ctx.lineTo(X0, Y1 - L);
    ctx.stroke();

    const clampX = (x, ww) => Math.max(M, Math.min(cw - ww - M, x));
    const clampY = (y, hh) => Math.max(top, Math.min(bottom - hh, y));
    const pick = (cands) => cands.find((r) => this._free(r)) || cands[0];

    // метка: над рамкой, иначе внутри у верхнего края
    const id = String(track.id).padStart(2, '0');
    const tag = locked ? `ЦЕЛЬ ${id} · ЗАХВАТ` : `ЦЕЛЬ ${id} · НАБЛЮДЕНИЕ`;
    ctx.font = this.font(10.5, 600);
    ctx.letterSpacing = `${1.2 * dpr}px`;
    const tw = ctx.measureText(tag).width + 12 * dpr;
    const th = 18 * dpr;
    const tagCands = [];
    if (b.y0 - th - 4 * dpr >= top) tagCands.push({ x: clampX(b.x0, tw), y: b.y0 - th - 4 * dpr, w: tw, h: th });
    tagCands.push({ x: clampX(b.x0 + 4 * dpr, tw), y: clampY(b.y0 + 4 * dpr, th), w: tw, h: th });
    tagCands.push({ x: clampX(b.x0 + 4 * dpr, tw), y: clampY(b.y1 - th - 4 * dpr, th), w: tw, h: th });
    const T = pick(tagCands);
    this.placed.push(T);
    const flash = locked && now - track.lockedAt < 1300 && Math.floor(now / 260) % 2 === 0;
    if (flash) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(T.x, T.y, tw, th);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(T.x + 0.5 * dpr, T.y + 0.5 * dpr, tw - dpr, th - dpr);
      ctx.fillStyle = col;
    } else {
      ctx.fillStyle = col;
      ctx.fillRect(T.x, T.y, tw, th);
      ctx.fillStyle = '#000';
    }
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, T.x + 6 * dpr, T.y + th / 2 + 0.5 * dpr);

    // данные
    const dist = track.dist.value;
    const height = track.height.value;
    const age = track.age.value;
    const rough = { approx: 1, flat: 1, tilt: 1 };
    const rows = [
      ['ДИСТ', dist != null ? `${dist.toFixed(dist < 10 ? 1 : 0)} м` : '—', dist != null && track.distSrc === 'body' ? '≈' : ''],
      ['РОСТ', height != null && track.height.count >= 3 ? `${Math.round(height * 100)} см` : '—', height != null && track.height.count >= 3 && rough[track.heightSrc] ? '≈' : ''],
      ['ВОЗР', age != null && track.age.count >= 2 ? `${Math.round(age)}` : '—', age != null && track.age.count >= 2 ? '~' : ''],
    ];
    ctx.font = this.font(11, 500);
    ctx.letterSpacing = `${1 * dpr}px`;
    const lh = 16 * dpr;
    const pw = 122 * dpr, ph = (rows.length + 1) * lh + 8 * dpr;
    const pc = [];
    const py0 = clampY(Math.max(b.y0, T.y), ph);
    if (b.x1 + 8 * dpr + pw <= cw - M) pc.push({ x: b.x1 + 8 * dpr, y: py0, w: pw, h: ph });
    if (b.x0 - 8 * dpr - pw >= M) pc.push({ x: b.x0 - 8 * dpr - pw, y: py0, w: pw, h: ph });
    pc.push({ x: clampX(b.x0 + 6 * dpr, pw), y: clampY(T.y + th + 4 * dpr, ph), w: pw, h: ph });
    if (b.y1 + 6 * dpr + ph <= bottom) pc.push({ x: clampX(b.x0, pw), y: b.y1 + 6 * dpr, w: pw, h: ph });
    pc.push({ x: clampX(b.x0 + 6 * dpr, pw), y: clampY(b.y1 - ph - 6 * dpr, ph), w: pw, h: ph });
    const R = pick(pc);
    this.placed.push(R);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(R.x, R.y, pw, ph);
    ctx.fillStyle = col;
    ctx.fillRect(R.x, R.y, 2 * dpr, ph);
    ctx.textBaseline = 'middle';
    const y0 = R.y + 4 * dpr + lh / 2;
    ctx.fillText(`ЦЕЛЬ ${id}`, R.x + 9 * dpr, y0);
    rows.forEach(([k2, v, mark], i) => {
      const y = y0 + lh * (i + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(k2, R.x + 9 * dpr, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${mark}${v}`, R.x + 54 * dpr, y);
    });

    // перекрестие на корпусе при захвате
    if (locked && track.pose) {
      const p = track.pose;
      const ok = (i) => p[i] && (p[i].visibility ?? 1) > 0.5;
      if (ok(11) && ok(12)) {
        let c = { x: (p[11].x + p[12].x) / 2, y: (p[11].y + p[12].y) / 2 };
        if (ok(23) && ok(24)) c = { x: (c.x + (p[23].x + p[24].x) / 2) / 2, y: (c.y + (p[23].y + p[24].y) / 2) / 2 };
        const m = this.mapN(c);
        const r = 9 * dpr;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(m.x - r * 1.8, m.y); ctx.lineTo(m.x - r * 0.6, m.y);
        ctx.moveTo(m.x + r * 0.6, m.y); ctx.lineTo(m.x + r * 1.8, m.y);
        ctx.moveTo(m.x, m.y - r * 1.8); ctx.lineTo(m.x, m.y - r * 0.6);
        ctx.moveTo(m.x, m.y + r * 0.6); ctx.lineTo(m.x, m.y + r * 1.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(m.x, m.y, r * 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  // затемнение под текстом HUD сверху — читается на ярком небе и снегу
  drawScrim() {
    const { ctx, dpr } = this;
    const sh = 100 * dpr;
    const grd = ctx.createLinearGradient(0, 0, 0, sh);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.canvas.width, sh);
  }

  drawHud(info) {
    const { ctx, dpr } = this;
    const cw = this.canvas.width, ch = this.canvas.height;
    const m = 14 * dpr, L = 22 * dpr;
    ctx.save();
    // уголки экрана
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
    ctx.moveTo(cw - m - L, m); ctx.lineTo(cw - m, m); ctx.lineTo(cw - m, m + L);
    ctx.moveTo(cw - m, ch - m - L); ctx.lineTo(cw - m, ch - m); ctx.lineTo(cw - m - L, ch - m);
    ctx.moveTo(m + L, ch - m); ctx.lineTo(m, ch - m); ctx.lineTo(m, ch - m - L);
    ctx.stroke();

    // прицел в центре
    const cx = cw / 2, cy = ch / 2, g = 6 * dpr, s = 16 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy); ctx.lineTo(cx - g, cy);
    ctx.moveTo(cx + g, cy); ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - g);
    ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + s);
    ctx.stroke();

    // шкала наклона справа
    if (info.pitch != null) {
      const x = cw - m - 4 * dpr, h = ch * 0.28, y0 = cy - h / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      for (let d = -30; d <= 30; d += 5) {
        const y = y0 + ((d + 30) / 60) * h;
        const len = d % 15 === 0 ? 10 * dpr : 5 * dpr;
        ctx.moveTo(x, y); ctx.lineTo(x - len, y);
      }
      ctx.stroke();
      const p = Math.max(-30, Math.min(30, info.pitch));
      const y = y0 + ((p + 30) / 60) * h;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x - 14 * dpr, y); ctx.lineTo(x - 20 * dpr, y - 4 * dpr); ctx.lineTo(x - 20 * dpr, y + 4 * dpr);
      ctx.closePath();
      ctx.fill();
    }

    // текст
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3 * dpr;
    const text = (str, x, y) => { ctx.strokeText(str, x, y); ctx.fillText(str, x, y); };
    ctx.letterSpacing = `${1.6 * dpr}px`;
    const tx = m + 10 * dpr, ty = m + 8 * dpr;
    ctx.font = this.font(12, 700);
    ctx.fillStyle = '#fff';
    text('1DEX1 // СКАНЕР', tx, ty);
    ctx.font = this.font(10, 500);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    text(info.clock, tx, ty + 18 * dpr);
    text(`ЦЕЛИ ${info.targets} · ЗАХВАТ ${info.locked}`, tx, ty + 32 * dpr);

    ctx.textAlign = 'right';
    const rx = cw - m - 10 * dpr;
    text(`${info.fps} FPS`, rx, ty);
    text(info.pitch != null ? `НАКЛОН ${info.pitch > 0 ? '−' : '+'}${Math.abs(info.pitch).toFixed(0)}°` : 'НАКЛОН —', rx, ty + 14 * dpr);
    text(`ЗОНА ≤ ${info.threshold} М`, rx, ty + 28 * dpr);
    if (info.rec) {
      const blink = Math.floor(info.now / 500) % 2 === 0;
      ctx.fillStyle = blink ? COLORS.red : 'rgba(255,43,43,0.4)';
      text(`● REC ${info.rec}`, rx, ty + 46 * dpr);
    }
    ctx.textAlign = 'left';

    // статус внизу по центру
    if (info.status) {
      ctx.font = this.font(10.5, 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const blink = Math.floor(info.now / 600) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
      text(info.status, cx, cy + 44 * dpr);
    }
    ctx.restore();
  }
}
