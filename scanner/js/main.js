import { loadVision, loadAge } from './models.js';
import { Tilt, upInCamera, focalPx, cameraPitchDown, measure, irisDistance, solvePhoneHeight } from './geometry.js';
import { Tracker } from './tracker.js';
import { Renderer } from './render.js';
import { AgeEstimator } from './age.js';

// ------------------------------------------------------------------ настройки
const DEFAULTS = {
  phoneHeight: 1.40,   // м, высота телефона над землёй
  fovBack: 70,         // угол обзора длинной стороны кадра, тыльная камера
  fovFront: 76,        // фронтальная
  threshold: 5,        // м, зона захвата
  mono: true,          // ч/б видео
};
const STORE_KEY = '1dex1-scanner-v1';

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...DEFAULTS, ...s };
  } catch (e) { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* приватный режим */ }
}

const settings = loadSettings();

// ------------------------------------------------------------------ DOM
const $ = (s) => document.querySelector(s);
const intro = $('#intro');
const loader = $('#loader');
const app = $('#app');
const video = $('#video');
const canvas = $('#view');
const sheet = $('#sheet');
const toastEl = $('#toast');

const renderer = new Renderer(canvas);
const tracker = new Tracker();
const tilt = new Tilt();

let models = null;
let ageEst = null;
let stream = null;
let facing = 'environment';
let running = false;
let lastVideoTime = -1;
let fpsCount = 0, fpsValue = 0, fpsT0 = performance.now();
let recorder = null, recStart = 0, recChunks = [];

// ------------------------------------------------------------------ загрузчик
const steps = {
  camera: $('[data-step="camera"]'),
  runtime: $('[data-step="runtime"]'),
  pose: $('[data-step="pose"]'),
  face: $('[data-step="face"]'),
  age: $('[data-step="age"]'),
};
function progress(key, v) {
  const el = steps[key];
  if (!el) return;
  const out = el.querySelector('.st');
  if (v === 'ok') { out.textContent = 'ГОТОВО'; el.classList.add('ok'); }
  else if (v === 'err') { out.textContent = 'ОШИБКА'; el.classList.add('err'); }
  else if (v === 'skip') { out.textContent = 'НЕТ'; el.classList.add('err'); }
  else out.textContent = `${String(Math.round(v * 100)).padStart(3, ' ')}%`;
}

function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function fail(msg) {
  loader.querySelector('.load-error').textContent = msg;
  loader.classList.add('has-error');
}

// ------------------------------------------------------------------ камера
async function openCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  await video.play();
  lastVideoTime = -1;
  tracker.reset();
  // фактическая камера могла оказаться другой
  const s = stream.getVideoTracks()[0].getSettings ? stream.getVideoTracks()[0].getSettings() : {};
  if (s.facingMode === 'user' || s.facingMode === 'environment') facing = s.facingMode;
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { /* не критично */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running) keepAwake();
});

// ------------------------------------------------------------------ старт
async function start() {
  intro.classList.add('hidden');
  loader.classList.remove('hidden');

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    fail('Камера доступна только по HTTPS. Открой сайт по ссылке https://…');
    return;
  }

  tilt.start(); // без await: на iOS спросит разрешение, на Android сразу

  try {
    progress('camera', 0.5);
    await openCamera();
    progress('camera', 'ok');
  } catch (e) {
    progress('camera', 'err');
    fail(e && e.name === 'NotAllowedError'
      ? 'Нет доступа к камере. Разреши камеру в настройках сайта и обнови страницу.'
      : `Камера не запустилась: ${e && e.message ? e.message : e}`);
    return;
  }

  try {
    models = await loadVision(progress);
  } catch (e) {
    console.error(e);
    fail(`Не удалось загрузить нейросети. Проверь интернет и обнови страницу. (${e && e.message ? e.message : e})`);
    return;
  }

  try { await document.fonts.ready; } catch (e) { /* ок */ }

  loader.classList.add('hidden');
  app.classList.remove('hidden');
  running = true;
  keepAwake();
  requestAnimationFrame(loop);

  // возраст — в фоне
  loadAge(progress)
    .then((faceapi) => { ageEst = new AgeEstimator(faceapi); })
    .catch((e) => { console.warn(e); progress('age', 'err'); toast('Модуль возраста не загрузился'); });
}

// ------------------------------------------------------------------ обработка кадра
function poseBox(pose, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (let i = 0; i < pose.length; i++) {
    const p = pose[i];
    if ((p.visibility ?? 1) < 0.5) continue;
    const x = p.x * W, y = p.y * H;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    n++;
  }
  if (n < 5) return null;
  // макушка выше глаз: ~0.45 расстояния глаза–плечи
  const v = (i) => (pose[i].visibility ?? 1) >= 0.5;
  if (v(2) && v(5) && (v(11) || v(12))) {
    const eyeY = ((pose[2].y + pose[5].y) / 2) * H;
    const shY = (v(11) && v(12) ? (pose[11].y + pose[12].y) / 2 : (v(11) ? pose[11].y : pose[12].y)) * H;
    y0 = Math.min(y0, eyeY - Math.abs(shY - eyeY) * 0.5);
  } else {
    y0 -= (y1 - y0) * 0.04;
  }
  const padX = (x1 - x0) * 0.08 + 6;
  const padY = (y1 - y0) * 0.02 + 4;
  return {
    x0: Math.max(0, x0 - padX), x1: Math.min(W, x1 + padX),
    y0: Math.max(0, y0 - padY), y1: Math.min(H, y1 + padY),
  };
}

function faceBox(face, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 468; i++) {
    const x = face[i].x * W, y = face[i].y * H;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function detect(now) {
  const W = video.videoWidth, H = video.videoHeight;
  const poseRes = models.pose.detectForVideo(video, now);
  const faceRes = models.face.detectForVideo(video, now);

  const dets = [];
  (poseRes.landmarks || []).forEach((lm, i) => {
    const box = poseBox(lm, W, H);
    if (!box) return;
    dets.push({ box, pose: lm, world: poseRes.worldLandmarks ? poseRes.worldLandmarks[i] : null, face: null });
  });

  // привязываем лица к телам по носу
  const faces = faceRes.faceLandmarks || [];
  const freeFaces = [];
  for (const f of faces) {
    const fb = faceBox(f, W, H);
    const fw = fb.x1 - fb.x0;
    const nose = { x: f[1].x * W, y: f[1].y * H };
    let best = null, bestD = Infinity;
    for (const d of dets) {
      if (d.face) continue;
      const p = d.pose[0];
      const dd = Math.hypot(p.x * W - nose.x, p.y * H - nose.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    if (best && bestD < Math.max(fw * 0.6, 20)) best.face = f;
    else freeFaces.push({ f, fb });
  }
  // лицо без тела (очень близко к камере) — отдельная цель
  for (const { f, fb } of freeFaces) {
    const w = fb.x1 - fb.x0, h = fb.y1 - fb.y0;
    dets.push({
      box: { x0: Math.max(0, fb.x0 - w * 0.15), y0: Math.max(0, fb.y0 - h * 0.25), x1: Math.min(W, fb.x1 + w * 0.15), y1: Math.min(H, fb.y1 + h * 0.1) },
      pose: null, world: null, face: f,
    });
  }

  const tracks = tracker.update(dets);
  // лицо в треке
  for (const t of tracks) {
    if (t.stale) continue;
    const d = dets.find((x) => x.box === t.raw);
    t.face = d ? d.face : null;
    if (t.face) t.faceSeenAt = now;
  }
  return tracks;
}

function cameraModel() {
  const W = video.videoWidth, H = video.videoHeight;
  const front = facing === 'user';
  const up = tilt.available ? tilt.up : null;
  return {
    w: W, h: H, cx: W / 2, cy: H / 2,
    f: focalPx(W, H, front ? settings.fovFront : settings.fovBack),
    upCam: upInCamera(up, front),
    front,
  };
}

function updateMeasurements(tracks, cam, now) {
  const thr = settings.threshold;
  for (const t of tracks) {
    if (t.stale) continue;
    let m;
    if (t.pose) m = measure(t.pose, t.world, t.face, cam, settings);
    else {
      const d = irisDistance(t.face, cam);
      m = { dist: d, distSrc: d ? 'iris' : null, height: null, heightSrc: null };
    }
    t.meas = m;
    t.dist.push(m.dist);
    if (m.distSrc) t.distSrc = m.distSrc;
    if (m.height != null) { t.height.push(m.height); t.heightSrc = m.heightSrc; }

    const d = t.dist.value;
    const wasLocked = t.locked;
    if (d == null) t.locked = false;
    else if (!wasLocked && d <= thr) t.locked = true;
    else if (wasLocked && d > thr + 0.25) t.locked = false;
    if (t.locked && !wasLocked) { t.lockedAt = now; buzz(); }
  }

  // возраст: по одному лицу за раз, каждое не чаще раза в 450 мс
  if (ageEst && !ageEst.busy) {
    let pick = null;
    for (const t of tracks) {
      if (t.stale || now - t.lastAgeAt < 450) continue;
      if (!pick || t.lastAgeAt < pick.lastAgeAt) pick = t;
    }
    if (pick) {
      pick.lastAgeAt = now;
      ageEst.estimate(video, pick, cam.w, cam.h).then((age) => { if (age != null) pick.age.push(age); });
    }
  }
}

let lastBuzz = 0;
function buzz() {
  const now = performance.now();
  if (now - lastBuzz < 800) return;
  lastBuzz = now;
  try { navigator.vibrate && navigator.vibrate(18); } catch (e) { /* ок */ }
}

function clock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let tracks = [];
let pitch = null;
function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  const now = performance.now();
  if (video.readyState < 2 || !video.videoWidth) return;

  renderer.resize();
  const cam = cameraModel();
  renderer.setView(cam.w, cam.h, cam.front);

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      tracks = detect(now);
      updateMeasurements(tracks, cam, now);
    } catch (e) {
      console.error(e);
    }
    fpsCount++;
  }
  if (now - fpsT0 >= 1000) { fpsValue = Math.round((fpsCount * 1000) / (now - fpsT0)); fpsCount = 0; fpsT0 = now; }

  const pd = cameraPitchDown(cam.upCam);
  pitch = pd;

  // рисуем
  renderer.drawVideo(video, settings.mono);
  const visible = tracks.filter((t) => !t.stale);
  for (const t of visible) {
    t.meshOn = !!t.face && ((t.dist.value != null && t.dist.value < 1.3) || faceIsBig(t.face, cam));
    if (t.pose) renderer.drawSkeleton(t.pose, models.POSE_CONNECTIONS, !t.meshOn);
  }
  for (const t of visible) {
    if (t.meshOn) renderer.drawFace(t.face, models.FACE_TESSELATION, models.FACE_CONTOURS, now);
  }
  for (const t of tracks) renderer.drawTarget(t, now, settings.threshold);

  let status = '';
  if (!visible.length) status = 'ПОИСК ЦЕЛЕЙ';
  renderer.drawHud({
    clock: clock(),
    targets: visible.length,
    locked: visible.filter((t) => t.locked).length,
    fps: fpsValue,
    pitch: pd,
    threshold: settings.threshold,
    rec: recorder ? recTime(now) : null,
    status,
    now,
  });
}

function faceIsBig(face, cam) {
  const b = faceBox(face, cam.w, cam.h);
  return (b.y1 - b.y0) / Math.min(cam.w, cam.h) > 0.3;
}

function recTime(now) {
  const s = Math.floor((now - recStart) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ кнопки
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('#btn-flip').addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  try { await openCamera(); } catch (e) { toast('Не удалось переключить камеру'); }
});

$('#btn-shot').addEventListener('click', () => {
  canvas.toBlob((b) => { if (b) { download(b, `1dex1-scan-${stamp()}.png`); toast('Снимок сохранён'); } }, 'image/png');
});

function pickMime() {
  const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

$('#btn-rec').addEventListener('click', () => {
  const btn = $('#btn-rec');
  if (recorder) { recorder.stop(); return; }
  if (!window.MediaRecorder || !canvas.captureStream) { toast('Запись не поддерживается в этом браузере'); return; }
  const mime = pickMime();
  const rs = canvas.captureStream(30);
  try {
    recorder = new MediaRecorder(rs, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
  } catch (e) { recorder = null; toast('Запись не запустилась'); return; }
  recChunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    const type = recorder.mimeType || mime || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(recChunks, { type }), `1dex1-scan-${stamp()}.${ext}`);
    recorder = null;
    btn.classList.remove('on');
    rs.getTracks().forEach((t) => t.stop());
    toast('Видео сохранено');
  };
  recorder.start(1000);
  recStart = performance.now();
  btn.classList.add('on');
});

// ------------------------------------------------------------------ настройки
const inputs = {
  phoneHeight: $('#set-height'),
  fov: $('#set-fov'),
  threshold: $('#set-threshold'),
  mono: $('#set-mono'),
};
function fovKey() { return facing === 'user' ? 'fovFront' : 'fovBack'; }
function syncSettingsUI() {
  inputs.phoneHeight.value = Math.round(settings.phoneHeight * 100);
  $('#out-height').textContent = `${Math.round(settings.phoneHeight * 100)} см`;
  inputs.fov.value = settings[fovKey()];
  $('#out-fov').textContent = `${settings[fovKey()]}°`;
  inputs.threshold.value = settings.threshold;
  $('#out-threshold').textContent = `${settings.threshold} м`;
  inputs.mono.checked = settings.mono;
}
inputs.phoneHeight.addEventListener('input', () => { settings.phoneHeight = inputs.phoneHeight.value / 100; syncSettingsUI(); saveSettings(); resetHeights(); });
inputs.fov.addEventListener('input', () => { settings[fovKey()] = Number(inputs.fov.value); syncSettingsUI(); saveSettings(); resetHeights(); });
inputs.threshold.addEventListener('input', () => { settings.threshold = Number(inputs.threshold.value); syncSettingsUI(); saveSettings(); });
inputs.mono.addEventListener('change', () => { settings.mono = inputs.mono.checked; saveSettings(); });

function resetHeights() {
  for (const t of tracker.tracks) { t.height.buf = []; t.height.value = null; t.dist.buf = []; t.dist.value = null; }
}

$('#btn-settings').addEventListener('click', () => { syncSettingsUI(); sheet.classList.add('open'); });
$('#sheet-close').addEventListener('click', () => sheet.classList.remove('open'));
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.classList.remove('open'); });

$('#btn-reset').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  saveSettings(); syncSettingsUI(); resetHeights();
  toast('Настройки сброшены');
});

// Калибровка по известному росту: ставим человека целиком в кадр
$('#btn-calib').addEventListener('click', () => {
  const cm = Number($('#set-known').value);
  if (!(cm >= 80 && cm <= 230)) { toast('Введи рост цели в сантиметрах, например 180'); return; }
  const cam = cameraModel();
  if (!cam.upCam) { toast('Нет данных датчика наклона — калибровка невозможна'); return; }
  // цель ближе всего к центру кадра
  let best = null, bestD = Infinity;
  for (const t of tracker.tracks) {
    if (t.stale || !t.meas || !t.meas.eye || !t.meas.foot) continue;
    const cx = (t.box.x0 + t.box.x1) / 2 - cam.w / 2, cy = (t.box.y0 + t.box.y1) / 2 - cam.h / 2;
    const d = Math.hypot(cx, cy);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) { toast('Нужен человек целиком в кадре: от макушки до стоп'); return; }
  const h = solvePhoneHeight(cm / 100, best.meas.eye, best.meas.foot, cam);
  if (!h) { toast('Не получилось. Отойди дальше, чтобы стопы были в кадре'); return; }
  settings.phoneHeight = Math.round(h * 100) / 100;
  saveSettings(); syncSettingsUI(); resetHeights();
  toast(`Готово: телефон на высоте ${Math.round(h * 100)} см`);
});

// ------------------------------------------------------------------ запуск
$('#btn-start').addEventListener('click', start);
$('#btn-retry').addEventListener('click', () => location.reload());
window.addEventListener('resize', () => renderer.resize());

// Тестовый режим для проверки без камеры: ?test=URL видео
const testSrc = new URLSearchParams(location.search).get('test');
if (testSrc) {
  navigator.mediaDevices.getUserMedia = async () => {
    const v = document.createElement('video');
    v.src = testSrc; v.loop = true; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
    await v.play();
    return v.captureStream();
  };
}
