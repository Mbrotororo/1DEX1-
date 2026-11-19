// Камера и постобработка сцены a-home: планы A1–A8 (чистые функции времени).
import * as THREE from 'three';
import {
	DEG,
	POST,
	clamp01,
	easeInCubic,
	easeOutExpo,
	easeOutQuad,
	impulse,
	lerp,
	lookCam,
	mixPost,
	noise1,
	prog,
	pulse,
	rackFocus,
	shotAt,
	smooth,
	spline,
	v3lerp,
	whipSmear,
	withFocus,
	type CameraState,
	type PostSettings,
	type Vec3,
} from '../../core';
import {CLOCK, CORK} from '../../sets/house/anchors';
import {ACT, BEATS, RUN, STAND_YAW} from './beats';
import {bagAt, eyesAt, hatAt, heroAt} from './hero';

export type ShotName = 'door' | 'face' | 'clock' | 'note' | 'shock' | 'hat' | 'bag' | 'turn' | 'stairs' | 'corridor' | 'room';
export const SHOT_LIST: {from: number; name: ShotName}[] = [
	{from: 0, name: 'door'},
	{from: BEATS.a2, name: 'face'},
	{from: BEATS.clock, name: 'clock'},
	{from: BEATS.a4, name: 'note'},
	{from: BEATS.shock, name: 'shock'},
	{from: BEATS.a6, name: 'hat'},
	{from: BEATS.a7, name: 'bag'},
	{from: BEATS.turn, name: 'turn'},
	{from: BEATS.stairs, name: 'stairs'},
	{from: BEATS.corridor, name: 'corridor'},
	{from: BEATS.room, name: 'room'},
];
export const shotOf = (t: number) => {
	const {index, tShot} = shotAt(SHOT_LIST, t);
	return {name: SHOT_LIST[index].name, ts: tShot};
};

// ---------- помощники ----------
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
// направление «из цели на камеру» по азимуту/высоте (радианы)
const dirAE = (az: number, el: number): Vec3 => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
// вектор «вправо» на экране для камеры с азимутом az
const rightOf = (az: number): Vec3 => [Math.cos(az), 0, -Math.sin(az)];
// «ручная» камера: лёгкие повороты от шума (не сдвиг — на крупных планах сдвиг слишком заметен)
const handheld = (cam: CameraState, amp: number, t: number, seed = 1, freq = 1.4): CameraState => {
	if (amp <= 0) return cam;
	const e = new THREE.Euler(noise1(t * freq, seed) * amp, noise1(t * freq * 1.13, seed + 1) * amp, noise1(t * freq * 0.87, seed + 2) * amp * 0.6, 'YXZ');
	const quaternion = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(e));
	const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
	return {...cam, quaternion, forward};
};
// среднее значения по прошлым моментам — «оператор не успевает» (чистая функция)
// minT — начало плана: за склейку не заглядываем
const lagged = (f: (t: number) => Vec3, t: number, lag: number, n = 6, minT = -1e9): Vec3 => {
	let s: Vec3 = [0, 0, 0];
	for (let i = 0; i < n; i++) s = add(s, f(Math.max(minT, t - (lag * i) / (n - 1))));
	return sc(s, 1 / n);
};
const chest = (t: number): Vec3 => {
	const h = heroAt(t);
	return [h.pos[0], h.pos[1] + 1.15 + (h.pose.dy ?? 0), h.pos[2]];
};

// ---------- A1: низко у пола в глубине прихожей, дверь → герой; камера отъезжает и уходит вбок (параллакс) ----------
// в центре — дверь и холодный проём; камера уходит влево (к вешалке), и к концу он виден на 3/4 спереди-слева,
// как в A2 (одна сторона от линии движения), за ним — окно с холодным дневным светом
const DOOR_KEYS = {
	pos: [
		[0, [3.35, 0.34, 3.1]],
		[1.6, [2.9, 0.36, 2.95]],
		[3.6, [1.05, 0.5, 3.25]],
	] as [number, Vec3][],
	look: [
		[0, [2.35, 0.92, 7.1]],
		[1.6, [2.4, 1.0, 7.1]],
		[3.6, [2.5, 1.2, 5.3]],
	] as [number, Vec3][],
};
const sp3 = (t: number, keys: [number, Vec3][]): Vec3 => [0, 1, 2].map((i) => spline(t, keys.map(([k, v]) => [k, v[i]] as [number, number]))) as Vec3;
const camDoor = (t: number) => handheld(lookCam(sp3(t, DOOR_KEYS.pos), sp3(t, DOOR_KEYS.look), lerp(48, 44, smooth(t / 3.6))), 0.006, t, 11);

// ---------- A2–A3: лицо крупно, 3/4 снизу, медленный наезд; поднимает глаза ----------
const FACE_AZ = STAND_YAW + 0.6;
const camFace = (t: number) => {
	const eyes = lagged(eyesAt, t, 0.18, 5, BEATS.a2);
	const k = smooth(prog(t, BEATS.a2, BEATS.clock - BEATS.a2));
	const dist = lerp(1.7, 1.4, k);
	// камера почти на уровне глаз (чуть выше к концу) — лицо не прячется под шапкой
	const el = lerp(-2, 2.5, smooth(prog(t, BEATS.a2, 1.8))) * DEG;
	// глаза — на верхней трети, лицо — на правой трети (смотрит влево, место — слева); шапку режет верхний край
	const look = add(add(eyes, sc(rightOf(FACE_AZ), -0.12 * dist)), [0, -0.085 * dist, 0]);
	const pos = add(eyes, sc(dirAE(FACE_AZ, el), dist));
	return handheld(lookCam(pos, look, 30), 0.006, t, 21, 0.9);
};

// ---------- A3: часы, медленный наезд ----------
const camClock = (t: number) => {
	const k = smooth(prog(t, BEATS.clock, BEATS.a4 - BEATS.clock));
	const c = CLOCK.center;
	const pos: Vec3 = [lerp(c[0] + 0.12, c[0] + 0.03, k), lerp(c[1] - 0.1, c[1] - 0.04, k), lerp(1.32, 0.98, k)];
	return handheld(lookCam(pos, [c[0] + 0.02, c[1], c[2]], 40), 0.005, t, 31);
};

// ---------- A4: записка, наезд на «13:00», нарастающая дрожь ----------
const camNote = (t: number) => {
	const k = smooth(prog(t, BEATS.a4, BEATS.shock - BEATS.a4));
	const tm = CORK.time;
	const pos: Vec3 = [lerp(tm[0] - 0.42, tm[0] - 0.12, k), lerp(tm[1] + 0.2, tm[1] + 0.05, k), lerp(1.12, 0.74, k)];
	const look: Vec3 = [lerp(tm[0] - 0.02, tm[0], k), lerp(tm[1] + 0.1, tm[1] + 0.01, k), 0];
	const tension = smooth(prog(t, 7.4, 0.6));
	return handheld(lookCam(pos, look, lerp(40, 34, k)), 0.004 + tension * 0.01, t, 41, 1.6 + tension * 4);
};

// ---------- A5: резкий наезд на лицо, тряска ----------
const SHOCK_AZ = STAND_YAW + 0.16;
const camShock = (t: number) => {
	const eyes = lagged(eyesAt, t, 0.1, 4, BEATS.shock);
	// наезд виден после вспышки: 8.02 → 8.16
	const zoom = easeOutExpo(prog(t, BEATS.shock + 0.02, 0.14));
	const fov = lerp(56, 29, zoom) - 1.8 * impulse(t, BEATS.title, 10) + 1.5 * smooth(prog(t, 8.6, 1.0));
	const pos = add(eyes, sc(dirAE(SHOCK_AZ, -5 * DEG), lerp(1.0, 0.95, smooth(prog(t, 8.3, 1.2)))));
	const look = add(eyes, [0, -0.07, 0]);
	const hit = 0.05 * impulse(t, BEATS.shock, 5) + 0.02 * impulse(t, BEATS.title, 9);
	return handheld(handheld(lookCam(pos, look, fov), hit, t, 51, 26), 0.006, t, 52, 3.2);
};

// ---------- A6: у двери возле вешалки; шапка летит к камере и повисает на крючке ----------
const HAT_CAM: Vec3 = [1.35, 1.15, 6.6];
const camHat = (t: number) => {
	const k = smooth(prog(t, BEATS.a6, 0.8));
	// сначала на героя, по ходу броска — к крючку (крючок слева от центра); он разворачивается и уходит из кадра вправо
	const toHook = 0.85 * smooth(prog(t, BEATS.hatRelease - 0.05, 0.25)) + 0.15 * smooth(prog(t, BEATS.hatLand - 0.05, 0.2));
	const look = v3lerp([1.75, 1.45, 4.15], [1.05, 1.52, 4.45], toHook);
	const pos = add(HAT_CAM, [0.04 * k, 0.02 * k, -0.15 * k]);
	const cam = lookCam(pos, look, lerp(56, 60, Math.min(1, toHook / 0.85)));
	return handheld(cam, 0.01 + 0.012 * impulse(t, BEATS.hatLand, 7), t, 61, 2.4);
};

// ---------- A7: средний → камера у пола, рюкзак пролетает мимо, удар 11.2 ----------
// камера на полу за местом падения смотрит на героя (длинный фокус — средний план): он срывает рюкзак
// и швыряет его прямо в камеру; в замедлении рюкзак летит на объектив, книги разлетаются (одна — мимо камеры),
// в 11.2 рюкзак шлёпается на пол в нижней трети кадра. Камера почти не поворачивается — кадр удара резкий.
const BAG_CAM_POS: [number, Vec3][] = [
	[BEATS.a7, [10.4, 0.62, 5.42]],
	[10.62, [10.33, 0.3, 5.34]],
	[11.15, [10.3, 0.28, 5.32]],
	[12.0, [10.24, 0.28, 5.3]],
];
// Замедление — «деньги кадра»: объектив держит летящий рюкзак крупно (длинный фокус, взгляд ведёт рюкзак),
// а когда рюкзак идёт вниз, к полу, — резкий отъезд зумом в тот же неподвижный общий план, что и раньше (удар 11.2).
// После удара и перевода фокуса (11.5) — медленный наезд зумом на героя: он готовится к рывку.
const BAG_LENS = {
	// фокусное в полёте (поле зрения по вертикали, градусы)
	tight: 14.8,
	// когда начинается отъезд и сколько длится (к landHold + 0.04 кадр уже неподвижен)
	wideFrom: 10.98,
	wideDur: 0.14,
	// насколько взгляд ведёт рюкзак: на броске → в замедлении
	followThrow: 0.4,
	followSlow: 0.94,
	// наезд на героя после перевода фокуса
	pushFrom: 11.5,
	pushDur: 0.5,
	pushFov: 11,
};
const camBag = (t: number) => {
	const pos = sp3(t, BAG_CAM_POS);
	const hero = chest(t);
	const bagPos = (tt: number): Vec3 => {
		const b = bagAt(tt);
		return b.mode === 'loose' ? b.pos : add(heroAt(tt).pos, [0, 1.1, 0]);
	};
	const L = BAG_LENS;
	const wide = smooth(prog(t, L.wideFrom, L.wideDur));
	// взгляд: на броске чуть тянется за рюкзаком, в замедлении ведёт его почти вплотную;
	// с отъездом возвращается — рюкзак падает в неподвижный кадр
	const follow = (L.followThrow * smooth(prog(t, BEATS.bagRelease - 0.02, 0.2)) + (L.followSlow - L.followThrow) * smooth(prog(t, 10.66, 0.22))) * (1 - wide);
	const bag = lagged(bagPos, t, 0.08, 4, BEATS.a7);
	const base: Vec3 = v3lerp(hero, [ACT[0] + 0.6, 0.95, ACT[2] + 0.2], smooth(prog(t, BEATS.bagRelease, 0.4)));
	// наезд: взгляд чуть смещается к герою (он в центре кадра, рюкзак — слева внизу на первом плане)
	const push = smooth(prog(t, L.pushFrom, L.pushDur));
	const look = v3lerp(v3lerp(base, bag, follow), add(hero, [0, -0.1, 0]), 0.5 * push);
	// длинный фокус на героя → ещё длиннее на рюкзак в полёте → резкий отъезд зумом перед ударом → медленный наезд на героя
	const fov = lerp(lerp(23, L.tight, smooth(prog(t, 10.55, 0.35))), 50, wide) - 3 * smooth(prog(t, BEATS.bagLand + 0.1, 0.7)) - L.pushFov * push;
	const hit = 0.05 * impulse(t, BEATS.bagLand, 9);
	// перед ударом — без ручной тряски; в полёте на длинном фокусе тряска меньше (иначе рюкзак дёргается по кадру)
	const shake = 0.007 * (1 - 0.6 * (1 - wide) * smooth(prog(t, 10.6, 0.15))) * (1 - pulse(t, BEATS.landHold - 0.02, BEATS.bagLand + 0.02, 0.04, 0.06));
	return handheld(handheld(lookCam(pos, look, fov), hit, t, 71, 24), shake, t, 72, 2);
};

// ---------- A8a: разворот и рывок к лестнице (с конца прихожей, он уходит вправо к ступеням) ----------
const camTurn = (t: number) => {
	const k = smooth(prog(t, BEATS.turn, 0.4));
	const pos: Vec3 = [lerp(6.7, 6.5, k), lerp(0.95, 1.0, k), lerp(5.45, 5.2, k)];
	const look = lagged(chest, t, 0.12, 4, BEATS.turn);
	return handheld(lookCam(pos, add(look, [0, -0.05, 0]), 44), 0.012, t, 81, 3);
};

// ---------- A8b: камера на первой ступени, он проносится мимо и вверх; камера гонится следом на постоянном отставании ----------
// мягкий максимум: камера стоит у первой ступени, пока он не убежит на ~2.1 блока, дальше едет за ним
const smax = (a: number, b: number, k: number) => (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
const camStairs = (t: number) => {
	const k = smooth(prog(t, BEATS.stairs, BEATS.corridor - BEATS.stairs));
	const hx = RUN.at(t - 0.04).position[0];
	const x = Math.min(12.2, smax(3.7, hx - 2.15, 0.7));
	// поднимается над ступенями (лица ступеней ловят бегущий за ним свет), сначала — низко у пола
	const rise = smooth(prog(t, BEATS.stairs + 0.08, 0.45));
	const y = lerp(0.5, lerp(0.5, 3.6, clamp01((x - 3.7) / 8.5)) + 1.45, rise);
	const pos: Vec3 = [x, y, lerp(0.6, 0.85, rise)];
	// сначала смотрит вверх по лестнице (он влетает в кадр снизу справа), потом ведёт его
	const fol = smooth(prog(t, BEATS.stairs + 0.12, 0.35));
	const look = v3lerp([12.5, 4.4, 1.3], add(lagged(chest, t, 0.08, 4, BEATS.stairs), [0.5, 0.1, 0]), 0.2 + 0.8 * fol);
	return handheld(lookCam(pos, look, lerp(62, 54, k)), 0.012, t, 91, 3);
};

// ---------- A8c: коридор, камера едет задом перед ним ----------
const camCorridor = (t: number) => {
	const st = RUN.at(t);
	const k = prog(t, BEATS.corridor, BEATS.room - BEATS.corridor);
	const gap = lerp(2.7, 1.2, easeInCubic(k));
	const x = Math.min(20.55, Math.max(16.9, st.position[0] + gap));
	const pos: Vec3 = [x, lerp(6.3, 6.15, k), lerp(1.95, 1.75, k)];
	const look: Vec3 = [st.position[0] - 0.4, Math.max(5.6, st.position[1] + 1.1), 1.5];
	const bob = 0.012 * Math.sin(t * 19);
	return handheld(lookCam([pos[0], pos[1] + bob, pos[2]], look, 66, 0.03 * Math.sin(t * 4.5)), 0.012, t, 101, 3.5);
};

// ---------- A8d: в комнате: дверь (левая треть) и постер (справа); удар двери о стену, он влетает и прыгает «рыбкой» ----------
const ROOM_CAM: Vec3 = [24.1, 5.45, 5.2];
const roomYaw = (t: number) => -0.8 * easeInCubic(prog(t, 15.8, 0.2));
const camRoom = (t: number) => {
	// медленный наезд на дверь (напряжение), после удара — за ним
	const push = smooth(prog(t, BEATS.room, BEATS.slam - BEATS.room));
	const look0: Vec3 = [lerp(22.85, 22.6, push), 6.05, 1.2];
	const hero = chest(t);
	const follow = smooth(prog(t, 15.3, 0.45)) * 0.7;
	const look = v3lerp(look0, add(hero, [0.4, 0.1, 0]), follow);
	const back = smooth(prog(t, 15.4, 0.6));
	const cam = lookCam(add(ROOM_CAM, [-0.2 * push + 0.25 * back, -0.05 * back, -0.3 * push + 0.15 * back]), look, 54);
	// «вжух» вправо (поворот вокруг вертикали) в самом конце
	const q = cam.quaternion.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roomYaw(t)));
	const hit = 0.04 * impulse(t, BEATS.slam, 8);
	return handheld({...cam, quaternion: q, forward: new THREE.Vector3(0, 0, -1).applyQuaternion(q)}, hit + 0.01, t, 111, 20);
};

const CAMS: Record<ShotName, (t: number) => CameraState> = {
	door: camDoor,
	face: camFace,
	clock: camClock,
	note: camNote,
	shock: camShock,
	hat: camHat,
	bag: camBag,
	turn: camTurn,
	stairs: camStairs,
	corridor: camCorridor,
	room: camRoom,
};

export const camera = (t: number): CameraState => {
	const {name} = shotOf(t);
	return CAMS[name](t);
};

// ---------- постобработка по планам ----------
// аберрация (chroma) выключена везде: в текущем шейдере она даёт заливку цветом
const fin = (s: PostSettings): PostSettings => ({...s, chroma: 0});

// сколько холодного дневного света в прихожей (дверь открыта)
// открывается с толчка (быстрый старт — звук и движение вместе), закрывается плавно
export const doorOpenAt = (t: number) => easeOutQuad(prog(t, BEATS.doorOpen, BEATS.doorOpenDur)) * (1 - smooth(prog(t, BEATS.doorClose, BEATS.doorCloseDur)));

// смаз от поворота камеры за кадр (внутри плана, через склейку не смотрим)
const SHOT_END = (t: number) => {
	const i = shotAt(SHOT_LIST, t).index;
	return i + 1 < SHOT_LIST.length ? SHOT_LIST[i + 1].from : BEATS.end;
};
const autoSmear = (t: number): {smear: number; smearAngle: number} => {
	const h = 1 / 120;
	const {name, ts} = shotOf(t);
	const t0 = Math.max(t - ts, t - h);
	const t1 = Math.min(SHOT_END(t) - 1e-4, t + h);
	if (t1 <= t0) return {smear: 0, smearAngle: 0};
	const f = CAMS[name];
	const a = f(t0);
	const b = f(t1);
	const c = f(t);
	const d = clamp01(a.forward.dot(b.forward));
	const ang = (Math.acos(d) * (2 * h)) / (t1 - t0);
	const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
	const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
	const mv = b.forward.clone().sub(a.forward);
	const smear = Math.min(80, whipSmear(ang, c.fov));
	return smear < 4 ? {smear: 0, smearAngle: 0} : {smear, smearAngle: Math.atan2(mv.dot(up), mv.dot(right))};
};

export const post = (t: number, cam: CameraState): PostSettings => {
	const s = postBase(t, cam);
	const {name} = shotOf(t);
	if (name !== 'bag' && name !== 'turn' && name !== 'stairs' && name !== 'corridor') return s;
	const sm = autoSmear(t);
	// удар рюкзака 11.2 — кадр резкий
	if (name === 'bag' && t > BEATS.landHold - 0.03) sm.smear = Math.min(sm.smear, 20);
	return {...s, ...sm, smear: sm.smear < 4 ? 0 : sm.smear};
};

// A1 до открытия двери: прибавка к экспозиции (стопы), подъём теней, ослабление виньетки
const DOOR_SHUT = {exposure: 0.4, lift: 0.015, vignette: 0.12};

const postBase = (t: number, cam: CameraState): PostSettings => {
	const {name} = shotOf(t);
	switch (name) {
		case 'door': {
			const open = doorOpenAt(t);
			// тёмный контрастный тёплый интерьер: кирпич уходит в тень, яркое — проём и свечи
			// когда он вошёл и стоит в тёплом свете — чуть светлее (лицо читается)
			// пока дверь закрыта — светлее (иначе на телефоне почти чёрный кадр); с открытием «глаз привыкает» к свету из проёма
			const shut = 1 - smooth(prog(t, BEATS.doorOpen, 0.8));
			const warm = {
				...POST.warmInterior,
				dof: 6,
				focusRange: 1.6,
				saturation: 0.82,
				contrast: 1.16,
				lift: -0.02 + DOOR_SHUT.lift * shut,
				vignette: 0.6 - DOOR_SHUT.vignette * shut,
				exposure: lerp(-0.14, 0.0, smooth(prog(t, 2.4, 1.0))) + DOOR_SHUT.exposure * shut,
			};
			const base = mixPost(warm, {...POST.coldDay, exposure: -0.08, saturation: 0.85, vignette: 0.5}, 0.5 * open);
			const z = heroAt(t).pos[2];
			const target: Vec3 = t < BEATS.doorOpen ? [2.5, 0.6, 7.1] : [2.5, 1.2, Math.min(z, 8.6)];
			return fin(withFocus(base, cam, target));
		}
		case 'face': {
			const s = {...POST.closeUp, dof: 20, focusRange: 0.45};
			return fin(withFocus(s, cam, eyesAt(t)));
		}
		case 'clock':
			return fin(withFocus({...POST.closeUp, dof: 16, bloom: 1.0, bloomThreshold: 0.5}, cam, CLOCK.center));
		case 'note': {
			// перевод фокуса: с даты на «13:00»
			const k = smooth(prog(t, BEATS.a4 + 0.1, 0.5));
			const f = rackFocus(cam, [CORK.time[0] - 0.05, CORK.time[1] + 0.3, 0.06], CORK.time, k);
			return fin({...POST.closeUp, dof: 14, focusRange: 0.3, focus: f, vignette: 0.55 + 0.1 * smooth(prog(t, 7.4, 0.6))});
		}
		case 'shock': {
			const s = mixPost(POST.closeUp, POST.shock, smooth(prog(t, BEATS.shock, 0.1)));
			// белая вспышка: полная только 2 кадра при 60 к/с, затем быстро гаснет — наезд и распахнутые глаза видны
			const flash = t < BEATS.shock + 0.017 ? 1 : 0.55 * impulse(t, BEATS.shock + 0.017, 30);
			return fin({...withFocus(s, cam, eyesAt(t)), flash});
		}
		case 'hat': {
			const h = hatAt(t);
			const target: Vec3 = h.mode === 'loose' && t > BEATS.hatRelease - 0.05 ? h.pos : [ACT[0], 1.5, ACT[2]];
			return fin(withFocus({...POST.warmInterior, dof: 10, focusRange: 0.9}, cam, target));
		}
		case 'bag': {
			const b = bagAt(t);
			const tb: Vec3 = b.mode === 'loose' && t > BEATS.bagRelease ? b.pos : [ACT[0], 1.2, ACT[2]];
			const back = smooth(prog(t, 11.5, 0.35));
			const f = rackFocus(cam, tb, chest(t), back);
			const slow = smooth(prog(t, BEATS.slowFrom, 0.1)) * (1 - smooth(prog(t, BEATS.slowTo, 0.1)));
			return fin({...POST.warmInterior, dof: 12, focusRange: 0.7, focus: f, contrast: 1.16 + 0.06 * slow, saturation: 1.04 - 0.12 * slow});
		}
		case 'turn':
			return fin(withFocus({...POST.warmInterior, dof: 8, focusRange: 1.2}, cam, chest(t)));
		case 'stairs':
			return fin(withFocus({...POST.warmInterior, dof: 6, focusRange: 1.5}, cam, chest(t)));
		case 'corridor': {
			const st = RUN.at(t);
			return fin(withFocus({...POST.warmInterior, dof: 7, focusRange: 1.2}, cam, [st.position[0], st.position[1] + 1.4, 1.5]));
		}
		case 'room': {
			const dyaw = roomYaw(t + 1 / 120) - roomYaw(t - 1 / 120);
			const smear = whipSmear(dyaw, cam.fov);
			const flash = 0.9 * easeInCubic(prog(t, 15.8, 0.2));
			// удар двери: вспышка экспозиции на 2 кадра и быстрый спад (без «молочной» заливки)
			const hitEv = t >= BEATS.slam && t < BEATS.slam + 0.034 ? 0.5 : 0.5 * impulse(t, BEATS.slam + 0.034, 14);
			const target = t < 15.25 ? ([21.0, 5.9, 1.6] as Vec3) : chest(t);
			// до удара комната в полутьме — светится только щель под дверью
			const pre = 1 - smooth(prog(t, BEATS.slam - 0.14, 0.1));
			const base = {...POST.warmInterior, dof: 9, focusRange: 1.3, contrast: 1.18, vignette: 0.5 + 0.15 * pre, bloom: 0.75 + 0.35 * pre, bloomThreshold: 0.62 - 0.1 * pre};
			return fin({...withFocus(base, cam, target), exposure: base.exposure - 0.4 * pre + hitEv, smear: Math.min(90, smear), smearAngle: 0, flash});
		}
	}
	return fin(POST.warmInterior);
};
