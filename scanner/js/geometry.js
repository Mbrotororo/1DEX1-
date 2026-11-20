// Геометрия: наклон телефона, лучи камеры, дистанция и рост.
//
// Система координат камеры: X вправо, Y вниз, Z вперёд (по оптической оси).
// Координаты устройства (W3C): x вправо, y вверх, z из экрана к пользователю.

const DEG = Math.PI / 180;
const vis = (p, t = 0.5) => p && (p.visibility === undefined || p.visibility >= t);

// Антропометрия (средние значения для взрослых)
export const IRIS_DIAMETER_M = 0.0117;   // диаметр радужки почти одинаков у всех людей
export const EYE_HEIGHT_RATIO = 0.936;   // высота глаз / рост

// ---------------------------------------------------------------------------
// Датчик наклона. Храним вектор «вверх» в координатах устройства.
// ---------------------------------------------------------------------------
export class Tilt {
  constructor() {
    this.up = null;          // {x,y,z} нормализованный
    this.lastUpdate = 0;
    this._onOrientation = this._onOrientation.bind(this);
    this._onMotion = this._onMotion.bind(this);
    this._gotOrientation = false;
  }

  async start() {
    // iOS требует разрешение; на Android Chrome событие приходит сразу.
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* пользователь отказал — работаем без датчика */ }
    window.addEventListener('deviceorientation', this._onOrientation);
    window.addEventListener('devicemotion', this._onMotion);
  }

  // Chrome шлёт deviceorientation только при изменении угла ≥ 0.1°, поэтому
  // тишина означает «телефон неподвижен», а не «датчик пропал».
  get available() {
    if (this.up === null) return false;
    return this._gotOrientation || performance.now() - this.lastUpdate < 1500;
  }

  _blend(v) {
    const n = Math.hypot(v.x, v.y, v.z);
    if (!isFinite(n) || n < 1e-6) return;
    v = { x: v.x / n, y: v.y / n, z: v.z / n };
    if (!this.up) this.up = v;
    else {
      const a = 0.25; // сглаживание
      const u = {
        x: this.up.x + (v.x - this.up.x) * a,
        y: this.up.y + (v.y - this.up.y) * a,
        z: this.up.z + (v.z - this.up.z) * a,
      };
      const m = Math.hypot(u.x, u.y, u.z);
      this.up = { x: u.x / m, y: u.y / m, z: u.z / m };
    }
    this.lastUpdate = performance.now();
  }

  _onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    this._gotOrientation = true;
    // R = Rz(alpha)·Rx(beta)·Ry(gamma); «вверх» в координатах устройства = Rᵀ·(0,0,1)
    const b = e.beta * DEG, g = e.gamma * DEG;
    this._raw = {
      x: -Math.sin(g) * Math.cos(b),
      y: Math.sin(b),
      z: Math.cos(g) * Math.cos(b),
    };
    this._blend(this._raw);
  }

  _onMotion(e) {
    // ориентация точнее; devicemotion (60 Гц) только «досглаживает» последнее значение,
    // чтобы фильтр не застревал с отставанием, когда телефон замер
    if (this._gotOrientation) { if (this._raw) this._blend(this._raw); return; }
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    // В покое ускорение с учётом гравитации направлено «вверх»
    this._blend({ x: a.x, y: a.y, z: a.z });
  }
}

function screenAngle() {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  return ((a % 360) + 360) % 360;
}

// Вектор «вверх» в координатах камеры. front = фронтальная камера.
export function upInCamera(up, front) {
  if (!up) return null;
  const a = screenAngle() * DEG;
  // устройство → экран (кадр видео выровнен по экрану)
  const sx = up.x * Math.cos(a) - up.y * Math.sin(a);
  const sy = up.x * Math.sin(a) + up.y * Math.cos(a);
  // экран: x вправо, y вверх. Камера: Y вниз.
  // Тыльная камера смотрит в −z устройства, фронтальная в +z (кадр не зеркальный).
  return front
    ? { x: -sx, y: -sy, z: up.z }
    : { x: sx, y: -sy, z: -up.z };
}

// Камера: фокус в пикселях кадра по углу обзора длинной стороны.
export function focalPx(frameW, frameH, fovLongDeg) {
  return (Math.max(frameW, frameH) / 2) / Math.tan((fovLongDeg * DEG) / 2);
}

// Угол возвышения луча через пиксель (u,v) кадра. >0 — выше горизонта.
export function elevation(u, v, cam) {
  const x = (u - cam.cx) / cam.f;
  const y = (v - cam.cy) / cam.f;
  const n = Math.hypot(x, y, 1);
  const U = cam.upCam;
  const s = (x * U.x + y * U.y + 1 * U.z) / n;
  return Math.asin(Math.max(-1, Math.min(1, s)));
}

// Наклон оптической оси (для индикатора): >0 — камера смотрит вниз
export function cameraPitchDown(upCam) {
  if (!upCam) return null;
  return -Math.asin(Math.max(-1, Math.min(1, upCam.z))) / DEG;
}

// Горизонтальная дистанция до лица по размеру радужки (≈11.7 мм у всех людей).
export function irisDistance(face, cam) {
  if (!face || face.length < 478) return null;
  const W = cam.w, H = cam.h;
  const P = (k) => ({ x: face[k].x * W, y: face[k].y * H });
  // 468–472 и 473–477: центр + 4 точки по краю (469/471 — по горизонтали, 470/472 — по вертикали).
  // Берём диаметр в направлении, перпендикулярном лучу от центра кадра: вдоль него
  // проекция круга не растягивается, и диаметр ≈ f·S/Z, где Z — глубина.
  const diam = (c, a, b, d, e) => {
    const h = Math.hypot(P(a).x - P(d).x, P(a).y - P(d).y);
    const v = Math.hypot(P(b).x - P(e).x, P(b).y - P(e).y);
    const C = P(c);
    const rx = C.x - cam.cx, ry = C.y - cam.cy;
    const r = Math.hypot(rx, ry);
    if (r < 0.02 * cam.f || h < 1e-3 || v < 1e-3) return (h + v) / 2;
    const tx = -ry / r, ty = rx / r; // касательное направление
    return (h * v) / Math.sqrt(v * v * tx * tx + h * h * ty * ty);
  };
  const dpx = Math.max(diam(468, 469, 470, 471, 472), diam(473, 474, 475, 476, 477));
  if (!(dpx > 2.5)) return null;
  const Z = (cam.f * IRIS_DIAMETER_M) / dpx;
  const c = P(168); // переносица
  const x = (c.x - cam.cx) / cam.f, y = (c.y - cam.cy) / cam.f;
  if (!cam.upCam) return Z * Math.hypot(x, 1); // считаем камеру горизонтальной
  const U = cam.upCam;
  const a = x * U.x + y * U.y + U.z; // вертикальная составляющая (в долях Z)
  return Z * Math.sqrt(Math.max(0, x * x + y * y + 1 - a * a));
}

// Человек стоит прямо? Нужны выпрямленные ноги (угол в колене > 160°) и бёдра выше колен.
// Иначе рост не считаем: в приседе, выпаде или прыжке он получится неверным.
export function isStanding(pose, world) {
  if (!world) return false;
  const ids = [23, 24, 25, 26, 27, 28];
  if (!ids.every((i) => vis(pose[i], 0.5))) return false;
  const ang = (a, b, c) => {
    const u = { x: world[a].x - world[b].x, y: world[a].y - world[b].y, z: world[a].z - world[b].z };
    const v = { x: world[c].x - world[b].x, y: world[c].y - world[b].y, z: world[c].z - world[b].z };
    const d = (u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1);
    return Math.acos(Math.max(-1, Math.min(1, d))) / DEG;
  };
  if (ang(23, 25, 27) < 160 || ang(24, 26, 28) < 160) return false;
  // в мировых координатах MediaPipe ось y направлена вниз
  const hipY = (world[23].y + world[24].y) / 2, kneeY = (world[25].y + world[26].y) / 2;
  return kneeY - hipY > 0.3;
}

// ---------------------------------------------------------------------------
// Оценка дистанции и роста для одного человека.
// pose: 33 точки (норм. координаты), world: 33 точки в метрах,
// face: 478 точек лица или null.
// ---------------------------------------------------------------------------
const L_EYE = 2, R_EYE = 5;
const L_ANKLE = 27, R_ANKLE = 28, L_HEEL = 29, R_HEEL = 30, L_FOOT = 31, R_FOOT = 32;

export function measure(pose, world, face, cam, settings) {
  const W = cam.w, H = cam.h;
  const px = (p) => ({ x: p.x * W, y: p.y * H });
  const out = { dist: null, distSrc: null, height: null, heightSrc: null };

  // Точка глаз (середина)
  const eyesVisible = vis(pose[L_EYE], 0.6) && vis(pose[R_EYE], 0.6);
  let eye = null;
  if (eyesVisible) {
    const a = px(pose[L_EYE]), b = px(pose[R_EYE]);
    eye = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // Точка стоп: нижняя из видимых пяток/носков, только если внутри кадра
  let foot = null;
  for (const i of [L_HEEL, R_HEEL, L_FOOT, R_FOOT, L_ANKLE, R_ANKLE]) {
    const p = pose[i];
    if (!vis(p, 0.65)) continue;
    if (p.y > 0.985 || p.y < 0 || p.x < 0 || p.x > 1) continue;
    const q = px(p);
    if (!foot || q.y > foot.y) foot = q;
  }

  const tiltOk = !!cam.upCam;

  // --- 1. Дистанция по радужке (лучший метод вблизи) ---
  const dIris = face ? irisDistance(face, cam) : null;

  // --- 2. Дистанция по земле (нужны стопы и датчик наклона) ---
  let dGround = null;
  let elFoot = null;
  if (tiltOk && foot) {
    elFoot = elevation(foot.x, foot.y, cam);
    if (elFoot < -1.5 * DEG) {
      dGround = settings.phoneHeight / Math.tan(-elFoot);
      if (dGround > 60) dGround = null;
    }
  }

  // --- 3. Запасной вариант: по размеру тела (усреднённый человек) ---
  let dBody = null;
  if (world) {
    const ids = [0, 2, 5, 7, 8, 11, 12, 13, 14, 23, 24, 25, 26];
    const pts = ids.filter((i) => vis(pose[i], 0.6));
    if (pts.length >= 4) {
      let mx = 0, my = 0, wx = 0, wy = 0;
      for (const i of pts) { mx += pose[i].x * W; my += pose[i].y * H; wx += world[i].x; wy += world[i].y; }
      mx /= pts.length; my /= pts.length; wx /= pts.length; wy /= pts.length;
      let s2 = 0, w2 = 0;
      for (const i of pts) {
        s2 += (pose[i].x * W - mx) ** 2 + (pose[i].y * H - my) ** 2;
        w2 += (world[i].x - wx) ** 2 + (world[i].y - wy) ** 2;
      }
      if (s2 > 1) dBody = cam.f * Math.sqrt(w2 / s2);
    }
  }

  // --- Слияние дистанции ---
  if (dIris && dGround) {
    // вблизи радужке веры больше, вдали — земле
    const wI = dIris < 2.5 ? 0.7 : 0.35;
    out.dist = dIris * wI + dGround * (1 - wI);
    out.distSrc = 'iris+ground';
  } else if (dIris) { out.dist = dIris; out.distSrc = 'iris'; }
  else if (dGround) { out.dist = dGround; out.distSrc = 'ground'; }
  else if (dBody) { out.dist = dBody; out.distSrc = 'body'; }

  // --- Рост ---
  const standing = isStanding(pose, world);
  out.standing = standing;
  if (eye && out.dist && (standing || !foot)) {
    if (tiltOk) {
      const elEye = elevation(eye.x, eye.y, cam);
      if (dIris && foot && standing && elFoot !== null) {
        // не зависит от высоты телефона
        const eyeH = dIris * (Math.tan(elEye) - Math.tan(elFoot));
        out.height = eyeH / EYE_HEIGHT_RATIO;
        out.heightSrc = 'iris+feet';
      } else if (out.distSrc !== 'body' && foot) {
        const eyeH = settings.phoneHeight + out.dist * Math.tan(elEye);
        out.height = eyeH / EYE_HEIGHT_RATIO;
        out.heightSrc = 'ground';
      } else if (out.distSrc !== 'body' && out.dist > 1.5) {
        // стоп не видно: считаем, что телефон на заданной высоте. Вблизи (скан лица)
        // телефон обычно поднят к лицу, и такая оценка бессмысленна — пропускаем.
        const eyeH = settings.phoneHeight + out.dist * Math.tan(elEye);
        out.height = eyeH / EYE_HEIGHT_RATIO;
        out.heightSrc = 'tilt';
      } else if (foot) {
        const eyeH = settings.phoneHeight + out.dist * Math.tan(elEye);
        out.height = eyeH / EYE_HEIGHT_RATIO;
        out.heightSrc = 'approx';
      }
    } else if (foot && out.distSrc !== 'body') {
      // без датчика: считаем камеру горизонтальной
      const eyeH = out.dist * (foot.y - eye.y) / cam.f;
      out.height = eyeH / EYE_HEIGHT_RATIO;
      out.heightSrc = 'flat';
    } else if (foot) {
      out.height = out.dist * (foot.y - eye.y) / cam.f / EYE_HEIGHT_RATIO;
      out.heightSrc = 'approx';
    }
    if (out.height !== null && (out.height < 0.5 || out.height > 2.4)) { out.height = null; out.heightSrc = null; }
  }

  out.eye = eye;
  out.foot = foot;
  return out;
}

// Калибровка высоты телефона по известному росту цели.
// Метод «по земле»: H = h·(1 + tan(elEye)/tan(−elFoot))/0.936 → h линейна по H.
export function solvePhoneHeight(knownHeight, eyePx, footPx, cam) {
  if (!cam.upCam) return null;
  const elEye = elevation(eyePx.x, eyePx.y, cam);
  const elFoot = elevation(footPx.x, footPx.y, cam);
  if (elFoot > -1.5 * DEG) return null;
  const k = 1 + Math.tan(elEye) / Math.tan(-elFoot);
  if (k <= 0.05) return null;
  const h = (knownHeight * EYE_HEIGHT_RATIO) / k;
  return h > 0.3 && h < 2.5 ? h : null;
}
