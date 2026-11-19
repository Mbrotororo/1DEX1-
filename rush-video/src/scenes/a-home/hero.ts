// Герой сцены a-home: положение, поворот, поза, лицо и всё, что он носит/бросает, — чистые функции времени.
import * as THREE from 'three';
import {
	autoBlink,
	blinkAt,
	clamp01,
	doorShove,
	easeInQuad,
	easeOutCubic,
	flingHat,
	hash1,
	hurlBackpack,
	idle,
	lerp,
	lerpAngle,
	lookUp,
	mixFace,
	mixHex,
	mixPose,
	prog,
	pulse,
	shockPose,
	sigh,
	slump,
	smooth,
	sprint,
	sprintStairs,
	tiredWalk,
	withPose,
	type FaceState,
	type Pose,
	type Vec3,
} from '../../core';
import {BEANIE_ON_HOOK} from '../../sets/house/anchors';
import {
	ACT,
	BAG_DUR,
	BAG_REST,
	BAG_REST_YAW,
	BEATS,
	DIVE_DUR,
	DIVE_FROM,
	DIVE_TO,
	ENTER,
	HAT_DUR,
	RUN,
	SHOVE_DUR,
	SHOVE_FROM,
	STAND,
	STAND_YAW,
	story,
	storyInv,
	type BookDef,
} from './beats';

const PXB = 1.875 / 32;
// тонкие руки: плечо на 4 + 3/2 px от оси
const ARM_X = 5.5;
const TAU = Math.PI * 2;

// повороты героя по эпизодам (без «заворота» через ±π — числа подобраны, чтобы поворот шёл в нужную сторону)
// A6: лицом к вешалке/камере (запад-юго-запад)
export const YAW_HAT = TAU - 0.8;
// A7: лицом вдоль прихожей (+x)
export const YAW_BAG = TAU + Math.PI / 2;

export type HeroState = {
	pos: Vec3;
	yaw: number;
	pose: Pose;
	face: Partial<FaceState>;
	// множитель цвета (силуэт в проёме двери)
	color: string;
	// наклон всего тела (только там, где нет предметов в руках)
	lean: [number, number];
	// кувырок вокруг центра тела (полёт «рыбкой»)
	tumble: [number, number];
	// высота пола под героем (для тени) и высота над полом
	ground: number;
};

// ---------- поза и лицо ----------
const faceA1 = (t: number): Partial<FaceState> => ({tired: 1, blink: autoBlink(t, 2, 2.8, 0.3)});

// A2–A5: стоит, вздыхает, поднимает глаза, читает записку, шок
// суммарный наклон головы в мире (корпус + голова), рад; > 0 — вниз
const headTotal = (p: Pose) => (p.bend ?? 0) + p.headPitch + (p.lean ?? 0);
const standPose = (t: number): Pose => {
	const sl = slump(t);
	const ks = prog(t, BEATS.sigh, BEATS.sighDur);
	const ws = t < BEATS.sigh + BEATS.sighDur ? smooth(ks * 8) : 1 - smooth((t - BEATS.sigh - BEATS.sighDur) / 0.4);
	const sg = sigh(ks);
	let p = mixPose(sl, sg, ws);
	// A2: голова лишь чуть опускается (лицо в кадре): вздох двигает её вполовину, потолок 0.18 рад
	const total = Math.min(0.18, headTotal(sl) - 0.3 + 0.5 * ws * (headTotal(sg) - headTotal(sl)) + 0.05 * smooth(prog(t, BEATS.a2 + 0.8, 1.2)));
	p = withPose(p, {headPitch: total - (p.bend ?? 0) - (p.lean ?? 0)});
	const kl = prog(t, BEATS.lookUp, 0.6);
	if (t > BEATS.lookUp) {
		// поднимает голову к часам (левее), потом к записке (правее, ниже)
		const toNote = smooth(prog(t, 6.75, 0.35));
		const lu = withPose(lookUp(kl, lerp(-0.24, -0.12, toNote)), {headYaw: lerp(0.1, -0.16, toNote)});
		p = mixPose(p, lu, smooth(kl * 5));
	}
	// шок: рывок с ударом 8.0 (виден во время наезда)
	const kk = prog(t, BEATS.shock, 1.55);
	if (kk > 0) p = mixPose(p, shockPose(kk), smooth(kk * 30));
	return p;
};

// «бегающие» зрачки в шоке: держит взгляд, потом резкий скачок (детерминированно)
const SACC_T = 0.22;
const saccade = (t: number, seed: number) => {
	const u = (t - BEATS.shock - 0.1) / SACC_T;
	const i = Math.floor(u);
	const f = u - i;
	const v = (n: number) => (n < 0 ? 0 : (hash1(n, seed) * 2 - 1) * 0.8);
	return lerp(v(i - 1), v(i), smooth(f / 0.2));
};

const standFace = (t: number): Partial<FaceState> => {
	// A2: усталость, медленное моргание, выдох ртом
	// моргания: медленное в 4.05, ещё одно перед тем, как поднять глаза (к 5.8 глаза открыты)
	const blink = t < BEATS.blink2 - 0.1 ? Math.max(autoBlink(t, 3, 2.7, 0.32), blinkAt(t, BEATS.slowBlink, 0.6)) : blinkAt(t, BEATS.blink2, 0.16);
	const mouth = 0.5 * pulse(t, BEATS.exhale, BEATS.exhale + 0.45, 0.1, 0.3);
	// поднимает глаза: голова поднимается, веки приоткрываются (глаза у скина тёмные под чёлкой — сильный lookY их прячет)
	const up = smooth(prog(t, BEATS.lookUp, 0.3));
	const wake = smooth(prog(t, 7.2, 0.7));
	const base: Partial<FaceState> = {
		tired: lerp(1, 0.8, up) * (1 - wake * 0.7),
		blink,
		mouth,
		lookY: up * 0.25 * (1 - smooth(prog(t, 7.6, 0.3)) * 0.8),
		lookX: lerp(0.15, -0.25, smooth(prog(t, 6.75, 0.3))) * up,
	};
	// глаза распахиваются уже на виду (после вспышки)
	const ks = smooth(prog(t, BEATS.shock + 0.03, 0.05));
	if (ks <= 0) return base;
	const shock = mixFace(base, {shock: 1}, ks);
	return {...shock, lookX: saccade(t, 3) * ks, lookY: 0.1 + saccade(t, 4) * 0.35 * ks, blink: 0};
};

// подготовка к рывку: 0 → 1 к самой склейке 12.0 (в 11.98 и 12.0 поза одна и та же)
const READY_FROM = 11.58;
const readyAt = (t: number) => smooth(prog(t, READY_FROM, BEATS.turn - 0.02 - READY_FROM));
// стойка: корпус и голова к лестнице (+ — влево), присел (ноги в шаге), руки согнуты к бегу
const READY_POSE: Pose = {headYaw: 0.55, headPitch: -0.1, bend: 0.3, lean: 0.1, twist: 0.38, tilt: -0.05, dy: -0.07, legR: [-0.5, -0.06], legL: [0.42, 0.08], armR: [0.75, -0.28], armL: [-0.65, 0.28], shrug: 0.4};
// поворот всего тела к лестнице (рад, + — влево, к −z); RUN продолжает поворот отсюда
const READY_YAW = 0.32;

// A6–A7: шапка, рюкзак (сюжетное время в замедлении)
const actPose = (t: number): Pose => {
	const s = story(t);
	let p = withPose(idle(t), {shrug: 0.2});
	const kh = prog(t, BEATS.hatFrom, HAT_DUR);
	const wf = t < 10.05 ? 1 : 1 - smooth((t - 10.05) / 0.2);
	p = mixPose(p, flingHat(kh), wf);
	const kb = prog(s, BEATS.bagFrom, BAG_DUR);
	if (kb > 0 && kb < 1) p = mixPose(p, hurlBackpack(kb), smooth((s - BEATS.bagFrom) / 0.1));
	// перед рывком (11.6–12.0, его видно на наезде): голова и корпус — к лестнице (влево), присел в стойку,
	// руки — к бегу. В 12.0 эта поза — ровно начало RUN (runPose смешивает от actPose(BEATS.turn))
	const ready = readyAt(t);
	if (ready > 0) p = mixPose(p, READY_POSE, ready);
	return p;
};

const actYaw = (t: number): number => {
	// поворот к вешалке (начат ещё «за склейкой»), затем — вдоль прихожей; перед рывком — на треть к лестнице
	const a = lerp(3.95, YAW_HAT, easeOutCubic(prog(t, BEATS.a6 - 0.02, 0.24)));
	return lerp(a, YAW_BAG, smooth(prog(t, 10.08, 0.36))) + READY_YAW * readyAt(t);
};

// полёт «рыбкой»: руки вперёд над головой, ноги назад, голова поднята (корпус наклоняет tumble)
const SUPERMAN: Pose = {headYaw: 0, headPitch: -0.6, armR: [-2.95, -0.12], armL: [-2.95, 0.12], legR: [0.32, -0.05], legL: [0.12, 0.05], lean: 0, bend: -0.12, twist: 0, tilt: 0, shrug: 0.8, dy: 0};

// A8: разворот, рывок, лестница, коридор, удар в дверь, прыжок
const runPose = (t: number): {pose: Pose; pos: Vec3; yaw: number; dive: number; ground: number} => {
	const st = RUN.at(t);
	const x = st.position[0];
	const amt = smooth(prog(t, BEATS.turn, 0.14));
	let p = mixPose(actPose(BEATS.turn), sprint(st.phase, 1), amt);
	const ws = smooth((x - 4.7) / 0.5) * (1 - smooth((x - 14.1) / 0.5));
	if (ws > 0) p = mixPose(p, sprintStairs(st.phase), ws);
	const kd = prog(t, SHOVE_FROM, SHOVE_DUR);
	if (kd > 0 && kd < 1) p = doorShove(kd, p);
	let pos: Vec3 = st.position;
	let yaw = lerpAngle(actYaw(BEATS.turn), st.heading, smooth(prog(t, BEATS.turn, 0.16)));
	// прыжок «рыбкой» в комнату: толчок, затем полёт почти горизонтально, руки вперёд
	const kv = prog(t, BEATS.dive - 0.04, DIVE_DUR);
	let dive = 0;
	if (kv > 0) {
		const crouch = smooth(kv / 0.1) * (1 - smooth((kv - 0.1) / 0.08));
		const fly = smooth((kv - 0.1) / 0.18);
		p = mixPose(p, withPose(p, {bend: 0.35, dy: -0.14, armR: [0.6, -0.1], armL: [0.6, 0.1], legR: [-0.5, 0], legL: [-0.2, 0]}), crouch);
		p = mixPose(p, SUPERMAN, fly);
		dive = smooth((kv - 0.08) / 0.4);
		const f = (kv - 0.1) / 0.9;
		const arc = f > 0 ? Math.sin(Math.PI * clamp01(f) * 0.8) * 0.75 : 0;
		const ff = clamp01(f);
		pos = [lerp(DIVE_FROM[0], DIVE_TO[0], ff), DIVE_FROM[1] + arc, lerp(DIVE_FROM[2], DIVE_TO[2], ff)];
		if (f < 0) pos = st.position;
		yaw = lerpAngle(yaw, Math.atan2(DIVE_TO[0] - DIVE_FROM[0], DIVE_TO[2] - DIVE_FROM[2]), smooth(kv * 4));
	}
	return {pose: p, pos, yaw, dive, ground: kv > 0 ? DIVE_FROM[1] : st.position[1]};
};

const runMouth = (t: number) => 0.2 + 0.15 * Math.abs(Math.sin(t * 9));

export const heroAt = (t: number): HeroState => {
	if (t < BEATS.a2) {
		const st = ENTER.at(t);
		const z = st.position[2];
		// снаружи — тёмный силуэт против света, внутри — обычный
		const sil = smooth((z - 7.2) / 1.3);
		return {
			pos: st.position,
			yaw: st.heading,
			pose: mixPose(slump(t), tiredWalk(st.phase), st.moving),
			face: faceA1(t),
			color: mixHex('#ffffff', '#3a3e4a', sil),
			lean: [0, 0],
			tumble: [0, 0],
			ground: 0,
		};
	}
	if (t < BEATS.a6) return {pos: STAND, yaw: STAND_YAW, pose: standPose(t), face: standFace(t), color: '#ffffff', lean: [0, 0], tumble: [0, 0], ground: 0};
	if (t < BEATS.turn) {
		const kh = prog(t, BEATS.hatFrom, HAT_DUR);
		const effort = 0.35 * pulse(kh, 0.45, 0.75, 0.1, 0.2) + 0.3 * pulse(story(t), BEATS.bagRelease - 0.1, BEATS.bagRelease + 0.15, 0.06, 0.12);
		// перед рывком дышит ртом, как на бегу (лицо в 12.0 совпадает с началом A8)
		const mouth = lerp(effort, runMouth(t), readyAt(t));
		return {
			pos: ACT,
			yaw: actYaw(t),
			pose: actPose(t),
			face: {...mixFace({shock: 0.6}, {focus: 1}, smooth(prog(t, BEATS.a6, 0.12))), blink: autoBlink(t, 4, 2.4, 0.12), mouth},
			color: '#ffffff',
			lean: [0, 0],
			tumble: [0, 0],
			ground: 0,
		};
	}
	const r = runPose(t);
	const sp = smooth(prog(t, BEATS.turn + 0.05, 0.2));
	return {pos: r.pos, yaw: r.yaw, pose: r.pose, face: {focus: 1, mouth: runMouth(t), blink: autoBlink(t, 6, 2.2, 0.1)}, color: '#ffffff', lean: [0.06 * sp * (1 - r.dive), 0], tumble: [1.3 * r.dive, 0], ground: r.ground};
};

// ---------- точки скелета в мире (матрицы как в Humanoid; lean-проп = 0) ----------
const m4 = new THREE.Matrix4();
const eul = new THREE.Euler();

const torso = (h: HeroState): THREE.Matrix4 => {
	const p = h.pose;
	const m = new THREE.Matrix4().makeTranslation(h.pos[0], h.pos[1] + (p.dy ?? 0), h.pos[2]);
	m.multiply(m4.makeRotationY(h.yaw));
	m.multiply(m4.makeRotationX((p.lean ?? 0) + h.lean[0]));
	m.multiply(m4.makeScale(PXB, PXB, PXB));
	m.multiply(m4.makeTranslation(0, 12, 0));
	m.multiply(m4.makeRotationFromEuler(eul.set(p.bend ?? 0, p.twist ?? 0, p.tilt ?? 0, 'YXZ')));
	return m;
};
const unscale = (m: THREE.Matrix4) => m.multiply(m4.makeScale(1 / PXB, 1 / PXB, 1 / PXB));

// центр головы (начало headSlot), единицы — блоки
export const headFrame = (h: HeroState): THREE.Matrix4 => {
	const m = torso(h);
	m.multiply(m4.makeTranslation(0, 12, 0));
	m.multiply(m4.makeRotationFromEuler(eul.set(h.pose.headPitch, h.pose.headYaw, 0, 'YXZ')));
	m.multiply(m4.makeTranslation(0, 4, 0));
	return unscale(m);
};
// «кулак» правой руки
export const handFrame = (h: HeroState): THREE.Matrix4 => {
	const m = torso(h);
	m.multiply(m4.makeTranslation(-ARM_X, 10 + (h.pose.shrug ?? 0), 0));
	m.multiply(m4.makeRotationFromEuler(eul.set(h.pose.armR[0], 0, h.pose.armR[1], 'XYZ')));
	m.multiply(m4.makeTranslation(0, -9, 0));
	return unscale(m);
};
// начало backSlot
export const backFrame = (h: HeroState): THREE.Matrix4 => {
	const m = torso(h);
	m.multiply(m4.makeTranslation(0, 6, -2.26));
	return unscale(m);
};

export const framePos = (m: THREE.Matrix4): Vec3 => {
	const v = new THREE.Vector3().setFromMatrixPosition(m);
	return [v.x, v.y, v.z];
};
// глаза (для фокуса и камеры): чуть ниже центра головы и вперёд
export const eyesAt = (t: number): Vec3 => {
	const h = heroAt(t);
	const m = headFrame(h).multiply(m4.makeTranslation(0, -0.075, 0.24));
	return framePos(m);
};
export const headAt = (t: number): Vec3 => framePos(headFrame(heroAt(t)));

// ---------- предметы: положение в мире ----------
export type Placed = {pos: Vec3; quat: THREE.Quaternion};
const place = (m: THREE.Matrix4): Placed => {
	const p = new THREE.Vector3();
	const q = new THREE.Quaternion();
	const s = new THREE.Vector3();
	m.decompose(p, q, s);
	return {pos: [p.x, p.y, p.z], quat: q};
};
// смесь двух относительных положений (позиция — линейно, поворот — slerp)
const mixRel = (a: THREE.Matrix4, b: THREE.Matrix4, k: number): THREE.Matrix4 => {
	const pa = new THREE.Vector3();
	const qa = new THREE.Quaternion();
	const pb = new THREE.Vector3();
	const qb = new THREE.Quaternion();
	const s = new THREE.Vector3();
	a.decompose(pa, qa, s);
	b.decompose(pb, qb, s);
	return new THREE.Matrix4().compose(pa.lerp(pb, k), qa.slerp(qb, k), new THREE.Vector3(1, 1, 1));
};
// квадратичная кривая Безье
const bez = (a: Vec3, c: Vec3, b: Vec3, u: number): Vec3 => {
	const v = 1 - u;
	return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1], v * v * a[2] + 2 * v * u * c[2] + u * u * b[2]];
};

// --- шапка
// надетая шапка как «свободная» (начало — центр шапки, 4.2 px над центром головы)
const hatWornWorld = (h: HeroState) => headFrame(h).multiply(m4.makeTranslation(0, 4.2 * PXB, 0));
export const HAT_GRAB = BEATS.hatFrom + 0.22 * HAT_DUR;
const hatGrabRel = (() => {
	let cache: THREE.Matrix4 | null = null;
	return () => {
		if (!cache) {
			const h = heroAt(HAT_GRAB);
			cache = handFrame(h).invert().multiply(hatWornWorld(h));
		}
		return cache;
	};
})();
// в кулаке: держит за макушку, шапка висит под кулаком отворотом вниз (как надетая — читается как шапка),
// на размахе отстаёт от движения руки
const fistAt = (t: number): Vec3 => framePos(handFrame(heroAt(t)));
const hatHang = (t: number): THREE.Matrix4 => {
	const h = heroAt(t);
	const f = fistAt(t);
	const a = fistAt(t - 0.012);
	const b = fistAt(t + 0.012);
	const v = new THREE.Vector3((b[0] - a[0]) / 0.024, (b[1] - a[1]) / 0.024, (b[2] - a[2]) / 0.024);
	// «вниз» шапки: тяжесть минус сопротивление движению
	const down = new THREE.Vector3(0, -1, 0).addScaledVector(v, -0.07).normalize();
	const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
	const q = tilt.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw));
	const c = new THREE.Vector3(f[0], f[1], f[2]).addScaledVector(down, 0.24);
	return new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1));
};
const hatInHand = (t: number) => {
	const k = smooth(prog(t, HAT_GRAB, 0.12));
	const grab = handFrame(heroAt(t)).multiply(hatGrabRel());
	return place(mixRel(grab, hatHang(t), k));
};
// положение шапки в момент выпуска (постоянное — считаем один раз)
const hatRelease = (() => {
	let c: Placed | null = null;
	return () => (c ??= hatInHand(BEATS.hatRelease));
})();
const HOOK_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...BEANIE_ON_HOOK.rotation));

export type HatState = {mode: 'worn'} | {mode: 'loose'; pos: Vec3; quat: THREE.Quaternion; snow: number};
export const hatSnow = (t: number) => lerp(0.8, 0.45, prog(t, 2.5, 6));
export const hatAt = (t: number): HatState => {
	if (t < HAT_GRAB) return {mode: 'worn'};
	if (t < BEATS.hatRelease) {
		const p = hatInHand(t);
		return {mode: 'loose', pos: p.pos, quat: p.quat, snow: hatSnow(t)};
	}
	if (t < BEATS.hatLand) {
		const a = hatRelease();
		const b = BEANIE_ON_HOOK.position;
		const u = (t - BEATS.hatRelease) / (BEATS.hatLand - BEATS.hatRelease);
		// дуга: выше и ближе к камере (камера у двери, +z)
		const c: Vec3 = [(a.pos[0] + b[0]) / 2 + 0.1, Math.max(a.pos[1], b[1]) + 0.4, (a.pos[2] + b[2]) / 2 + 0.35];
		const ue = 1 - (1 - u) * (1 - u) * 0.35 - 0.65 * (1 - u);
		const pos = bez(a.pos, c, b, clamp01(ue));
		// вращение: быстро встаёт отворотом вниз и крутится плоско вокруг вертикали (без кувырков)
		const q = a.quat.clone().slerp(HOOK_Q, smooth(Math.min(1, u * 2.2)));
		const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -TAU * 1.5 * (1 - u) * (1 - u));
		return {mode: 'loose', pos, quat: spin.multiply(q), snow: hatSnow(t)};
	}
	// на крючке: качнулась и успокоилась
	const tt = t - BEATS.hatLand;
	const sw = Math.sin(tt * 16) * Math.exp(-tt * 5);
	const q = HOOK_Q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sw * 0.12, 0, sw * 0.35)));
	const b = BEANIE_ON_HOOK.position;
	return {mode: 'loose', pos: [b[0] + sw * 0.03, b[1] - Math.abs(sw) * 0.02, b[2]], quat: q, snow: hatSnow(t)};
};

// --- рюкзак
const bagWornWorld = (h: HeroState) => backFrame(h).multiply(m4.makeTranslation(0, -0.4 * PXB, -2.0 * PXB));
const BAG_IN_HAND = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.3, -0.05), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
// схватил лямку (сюжетное время)
export const BAG_GRAB = BEATS.bagFrom + 0.3 * BAG_DUR;
// t (экранное), когда сюжетное время = s (до замедления они совпадают)
const bagGrabRel = (() => {
	let cache: THREE.Matrix4 | null = null;
	return () => {
		if (!cache) {
			const h = heroAt(BAG_GRAB);
			cache = handFrame(h).invert().multiply(bagWornWorld(h));
		}
		return cache;
	};
})();
const bagInHand = (t: number) => {
	const h = heroAt(t);
	const k = smooth(prog(story(t), BAG_GRAB, 0.12));
	return place(handFrame(h).multiply(mixRel(bagGrabRel(), BAG_IN_HAND, k)));
};
// положение рюкзака в момент выпуска
const bagRelease = (() => {
	let c: Placed | null = null;
	return () => (c ??= bagInHand(BEATS.bagRelease));
})();
const REST_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.45, BAG_REST_YAW, 0, 'YXZ'));
export const BAG_LAND_S = story(BEATS.bagLand);
// Доля полёта рюкзака по экранному времени: в замедлении рюкзак летит вдвое медленнее (книги — в 0.28),
// чтобы за замедление он успел пролететь к камере (~76 % пути), а последние метры — падение — уже в реальном темпе.
const BAG_SLOW = 0.55;
const bagWork = (t: number) => t - BEATS.bagRelease - ((1 - BAG_SLOW) / 0.72) * (t - story(t));
const BAG_WORK = bagWork(BEATS.bagLand);
export const bagU = (t: number) => clamp01(bagWork(t) / BAG_WORK);

export type BagState = {mode: 'worn'} | {mode: 'loose'; pos: Vec3; quat: THREE.Quaternion; open: number; squash: number};
// центр рюкзака в полёте по сюжетному времени s
const bagFlight = (u: number): {pos: Vec3; quat: THREE.Quaternion; u: number} => {
	const a = bagRelease();
	const b = BAG_REST;
	const c: Vec3 = [lerp(a.pos[0], b[0], 0.45), Math.max(a.pos[1], b[1]) + 0.55, lerp(a.pos[2], b[2], 0.45) + 0.1];
	// почти равномерно по горизонтали (бросок), падение ускоряется к концу
	const pos = bez(a.pos, c, b, u);
	const q = a.quat.clone().slerp(REST_Q, smooth(u));
	const tumble = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), TAU * (1 - u) * 1.0);
	return {pos, quat: q.multiply(tumble), u};
};
export const bagAt = (t: number): BagState => {
	const s = story(t);
	if (s < BAG_GRAB) return {mode: 'worn'};
	if (t < BEATS.bagRelease) {
		const p = bagInHand(t);
		return {mode: 'loose', pos: p.pos, quat: p.quat, open: 0, squash: 0};
	}
	const open = 0.9 * smooth(prog(s, BEATS.bagRelease + 0.03, 0.06));
	if (t < BEATS.bagLand) {
		const f = bagFlight(bagU(t));
		return {mode: 'loose', pos: f.pos, quat: f.quat, open: open + 0.08 * Math.sin(s * 60), squash: 0};
	}
	// удар об пол: сплющился, подпрыгнул, проехал чуть вперёд
	const tt = t - BEATS.bagLand;
	const squash = 0.32 * Math.exp(-tt * 16) * Math.cos(tt * 34);
	const hop = tt > 0.05 && tt < 0.27 ? 0.11 * Math.sin((Math.PI * (tt - 0.05)) / 0.22) : 0;
	const slide = 0.16 * easeOutCubic(tt / 0.3);
	const wob = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15 * Math.sin(Math.PI * clamp01((tt - 0.05) / 0.22)), 0, 0));
	return {mode: 'loose', pos: [BAG_REST[0] + slide, BAG_REST[1] + hop, BAG_REST[2] + slide * 0.12], quat: REST_Q.clone().multiply(wob), open: 0.95, squash};
};
// скорость рюкзака по сюжетному времени s (для книг)
export const bagVel = (s: number): Vec3 => {
	const t = storyInv(s);
	const a = bagFlight(bagU(t - 0.004)).pos;
	const b = bagFlight(bagU(t + 0.004)).pos;
	return [(b[0] - a[0]) / 0.008, (b[1] - a[1]) / 0.008, (b[2] - a[2]) / 0.008];
};
export const bagCenterS = (s: number): Vec3 => bagFlight(bagU(storyInv(s))).pos;

// --- книги и тетради: вылетают из открытого рюкзака в замедлении, падают вокруг
export type BookState = {visible: boolean; pos: Vec3; quat: THREE.Quaternion; open: number};
export const bookAt = (b: BookDef, i: number, t: number): BookState => {
	const s = story(t);
	if (s < b.born) return {visible: false, pos: [0, 0, 0], quat: new THREE.Quaternion(), open: 0};
	const a0 = bagCenterS(b.born);
	const v = bagVel(b.born);
	// стартует из горловины рюкзака
	const a: Vec3 = [a0[0] + v[0] * 0.01, a0[1] + 0.1, a0[2] + v[2] * 0.01];
	const u = clamp01((s - b.born) / b.T);
	// по горизонтали — быстрый старт (инерция рюкзака), по вертикали — дуга
	const uh = 1 - (1 - u) * (1 - u) * 0.6 - 0.4 * (1 - u);
	const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(b.up ? -Math.PI / 2 : Math.PI / 2, 0, b.rz, 'YXZ'));
	if (u < 1) {
		const y = lerp(a[1], b.land[1], easeInQuad(u)) + b.h * Math.sin(Math.PI * u) * (1 - u * 0.5);
		const pos: Vec3 = [lerp(a[0], b.land[0], uh), y, lerp(a[2], b.land[2], uh)];
		const tumble = new THREE.Quaternion().setFromEuler(new THREE.Euler(TAU * b.turns * (1 - u), (i - 2) * 0.6 * (1 - u), TAU * 0.5 * (1 - u)));
		const q = tumble.multiply(flat);
		return {visible: true, pos, quat: q, open: clamp01(0.45 + 0.45 * Math.sin(s * 40 + i * 1.7)) * (1 - smooth((u - 0.8) / 0.2))};
	}
	// лежит: чуть проехал и замер, обложка хлопнула
	const tt = (s - b.born - b.T) * 1.0;
	const dir = [b.land[0] - a[0], b.land[2] - a[2]];
	const dl = Math.hypot(dir[0], dir[1]) || 1;
	const slide = 0.22 * easeOutCubic(tt / 0.25);
	const pos: Vec3 = [b.land[0] + (dir[0] / dl) * slide, b.land[1], b.land[2] + (dir[1] / dl) * slide];
	const flop = Math.max(0, Math.sin(tt * 18) * Math.exp(-tt * 9));
	return {visible: true, pos, quat: flat, open: b.notebook ? 0.15 * flop : 0.5 * flop + 0.08};
};
