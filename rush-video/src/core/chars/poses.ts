import {clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, lerp, smooth} from '../anim';
import {noise1} from '../rng';

// Позы персонажа. Углы в радианах. ЧИСТЫЙ модуль.
//  рука: [вперёд/назад (X), в сторону (Z)]. X < 0 — рука идёт вперёд; -PI/2 — вытянута вперёд, -PI — вверх.
//        Z: правая рука уходит в сторону при Z < 0, левая — при Z > 0.
//  нога: [вперёд/назад (X), разворот носка (Y)]. X < 0 — нога вперёд.
//  голова: yaw > 0 — поворот влево (к +x персонажа), pitch > 0 — смотрит вниз.

export type Pose = {
	headYaw: number;
	headPitch: number;
	armR: [number, number];
	armL: [number, number];
	legR: [number, number];
	legL: [number, number];
	// наклон корпуса вперёд (радианы, вокруг ступней) — добавляется к lean персонажа
	lean?: number;
	// смещение по высоте в блоках (сидит — ниже)
	dy?: number;
	// корпус (голова, туловище, руки, backSlot) относительно бёдер; ноги остаются на месте:
	// bend — наклон вперёд (сутулится), twist — поворот (> 0 — влево, к +x персонажа),
	// tilt — наклон вбок (> 0 — вправо, к −x, как lean[1]); радианы
	bend?: number;
	twist?: number;
	tilt?: number;
	// плечи вверх (> 0) / вниз (< 0), пиксели скина (1 px = 0.059 блока): вдох, «опущенные плечи»
	shrug?: number;
};

export const POSE_ZERO: Pose = {headYaw: 0, headPitch: 0, armR: [0, 0], armL: [0, 0], legR: [0, 0], legL: [0, 0], lean: 0, dy: 0, bend: 0, twist: 0, tilt: 0, shrug: 0};

const pair = (a: [number, number], b: [number, number], k: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

// Смешать две позы (k: 0 → a, 1 → b)
export const mixPose = (a: Pose, b: Pose, k: number): Pose => {
	const q = clamp01(k);
	if (q === 0) return a;
	if (q === 1) return b;
	return {
		headYaw: lerp(a.headYaw, b.headYaw, q),
		headPitch: lerp(a.headPitch, b.headPitch, q),
		armR: pair(a.armR, b.armR, q),
		armL: pair(a.armL, b.armL, q),
		legR: pair(a.legR, b.legR, q),
		legL: pair(a.legL, b.legL, q),
		lean: lerp(a.lean ?? 0, b.lean ?? 0, q),
		dy: lerp(a.dy ?? 0, b.dy ?? 0, q),
		bend: lerp(a.bend ?? 0, b.bend ?? 0, q),
		twist: lerp(a.twist ?? 0, b.twist ?? 0, q),
		tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, q),
		shrug: lerp(a.shrug ?? 0, b.shrug ?? 0, q),
	};
};

// Поменять что-то в позе: withPose(idle(t), {headYaw: 0.4})
export const withPose = (p: Pose, patch: Partial<Pose>): Pose => ({...p, ...patch});

// Стоит и «дышит»: руки чуть покачиваются
export const idle = (t: number): Pose => {
	const s = Math.sin(t * 2.2) * 0.05;
	return {headYaw: Math.sin(t * 0.7) * 0.06, headPitch: Math.sin(t * 1.1) * 0.03, armR: [s, -0.03 - Math.abs(s) * 0.3], armL: [-s, 0.03 + Math.abs(s) * 0.3], legR: [0, 0], legL: [0, 0]};
};

// Ходьба. phase — фаза шага в радианах (2π = два шага); удобно брать из makePath().at(t).phase.
// amount 0..1 — размах (0 — стоит).
export const walk = (phase: number, amount = 1): Pose => {
	const s = Math.sin(phase) * 0.72 * amount;
	return {headYaw: 0, headPitch: 0, armR: [s, -0.04], armL: [-s, 0.04], legR: [-s, 0], legL: [s, 0], lean: 0.03 * amount};
};

// Бег: шире шаг, корпус вперёд
export const run = (phase: number, amount = 1): Pose => {
	const s = Math.sin(phase) * 1.15 * amount;
	return {headYaw: 0, headPitch: -0.06 * amount, armR: [s * 1.05, -0.08], armL: [-s * 1.05, 0.08], legR: [-s, 0], legL: [s, 0], lean: 0.16 * amount};
};

// Спринт «как ракета»: руки отведены назад, сильный наклон
export const sprint = (phase: number, amount = 1): Pose => {
	const s = Math.sin(phase) * 1.3 * amount;
	return {headYaw: 0, headPitch: -0.22 * amount, armR: [1.05 + s * 0.2, -0.22], armL: [1.05 - s * 0.2, 0.22], legR: [-s, 0], legL: [s, 0], lean: 0.42 * amount};
};

// Прыжок. k: 0 — толчок, 0.5 — верхняя точка, 1 — приземление
export const jump = (k: number): Pose => {
	const up = Math.sin(clamp01(k) * Math.PI);
	return {headYaw: 0, headPitch: -0.15 * up, armR: [-0.5 - up * 1.4, -0.25 * up], armL: [-0.5 - up * 1.4, 0.25 * up], legR: [0.35 * up, 0], legL: [-0.45 * up, 0], lean: 0.08 * up};
};

// Падение: руки вверх, болтает ногами
export const fall = (t: number): Pose => {
	const w = Math.sin(t * 16) * 0.25;
	return {headYaw: 0, headPitch: 0.2, armR: [-2.9 + w, -0.35], armL: [-2.9 - w, 0.35], legR: [0.4 + w * 0.6, 0], legL: [-0.4 - w * 0.6, 0]};
};

// Удар правой рукой (меч, булава сбоку). k: 0 — замах, ~0.45 — контакт, 1 — рука вернулась
export const swing = (k: number): Pose => {
	const q = clamp01(k);
	const wind = smooth(q / 0.25);
	const hit = easeOutCubic((q - 0.25) / 0.25);
	const back = smooth((q - 0.6) / 0.4);
	const x = lerp(lerp(0, -2.5, wind), -0.55, hit) * (1 - back);
	const z = lerp(lerp(0, -0.35, wind), 0.35, hit) * (1 - back);
	return {headYaw: 0, headPitch: 0.08 * hit * (1 - back), armR: [x, z], armL: [0.25 * hit * (1 - back), 0.08], legR: [0.2 * hit * (1 - back), 0], legL: [-0.25 * hit * (1 - back), 0], lean: 0.18 * hit * (1 - back)};
};

// Удар сверху двумя руками (булава). k: 0 — оружие над головой, 1 — обрушил вниз
export const smash = (k: number): Pose => {
	const q = clamp01(k);
	const down = easeInCubic(q);
	const x = lerp(-3.05, -0.75, down);
	return {headYaw: 0, headPitch: lerp(-0.35, 0.35, down), armR: [x, 0.28], armL: [x, -0.28], legR: [lerp(0.25, -0.35, down), 0], legL: [lerp(-0.25, 0.35, down), 0], lean: lerp(-0.12, 0.45, down)};
};

// Пьёт из правой руки. k: 0 — рука внизу, 0.25..0.85 — пьёт (голова запрокинута), 1 — опустил
export const drink = (k: number): Pose => {
	const q = clamp01(k);
	const up = smooth(q / 0.22) * (1 - smooth((q - 0.86) / 0.14));
	const gulp = up * Math.sin(q * 38) * 0.04;
	return {headYaw: 0.12 * up, headPitch: -0.42 * up + gulp, armR: [-2.05 * up + gulp, 0.62 * up], armL: [0, 0.03], legR: [0, 0], legL: [0, 0]};
};

// Бросок правой рукой (снежок, жемчуг). k: 0 — замах назад, ~0.5 — выпуск, 1 — рука опустилась
export const throwing = (k: number): Pose => {
	const q = clamp01(k);
	const wind = smooth(q / 0.4);
	const release = easeOutBack((q - 0.4) / 0.2, 1.2);
	const back = smooth((q - 0.7) / 0.3);
	const x = lerp(lerp(0, -2.9, wind), -1.0, clamp01(release)) * (1 - back);
	return {headYaw: 0, headPitch: -0.1 * wind * (1 - back), armR: [x, -0.2 * wind * (1 - back)], armL: [0.35 * wind * (1 - back), 0.15], legR: [0.3 * wind * (1 - back), 0], legL: [-0.3 * wind * (1 - back), 0], lean: lerp(-0.12 * wind, 0.22, clamp01(release)) * (1 - back)};
};

// Машет правой рукой
export const wave = (t: number): Pose => ({
	headYaw: Math.sin(t * 3) * 0.14,
	headPitch: -0.05,
	armR: [0, -2.45 + Math.sin(t * 17) * 0.38],
	armL: [Math.sin(t * 2.2) * 0.05, 0.04],
	legR: [0, 0],
	legL: [0, 0],
});

// Радуется: обе руки вверх и трясутся
export const cheer = (t: number): Pose => ({
	headYaw: Math.sin(t * 2.4) * 0.15,
	headPitch: -0.3,
	armR: [-2.85 + Math.sin(t * 9) * 0.22, -0.4],
	armL: [-2.85 + Math.sin(t * 9 + 1.6) * 0.22, 0.4],
	legR: [0, 0],
	legL: [0, 0],
});

// Испуг: руки вверх и дрожат, присел
export const scared = (t: number): Pose => ({
	headYaw: Math.sin(t * 23) * 0.06,
	headPitch: 0.15,
	armR: [-2.7 + Math.sin(t * 30) * 0.2, -0.45],
	armL: [-2.7 + Math.cos(t * 30) * 0.2, 0.45],
	legR: [-0.25, -0.15],
	legL: [0.2, 0.15],
	lean: -0.1,
});

// Сидит (ноги вперёд). Опускает корпус на 0.59 блока — поставь персонажа на y сиденья.
export const sit = (): Pose => ({headYaw: 0, headPitch: 0, armR: [-0.6, -0.1], armL: [-0.6, 0.1], legR: [-1.45, -0.22], legL: [-1.45, 0.22], dy: -0.59});

// Зомби: руки вытянуты вперёд, шаркает
export const zombieArms = (phase: number, amount = 1): Pose => {
	const s = Math.sin(phase) * 0.55 * amount;
	return {headYaw: Math.sin(phase * 0.5) * 0.12, headPitch: 0.05, armR: [-1.5 + Math.sin(phase * 0.5) * 0.08, 0.05], armL: [-1.5 - Math.sin(phase * 0.5) * 0.08, -0.05], legR: [-s, 0], legL: [s, 0], lean: 0.06};
};

// Целится из лука (скелет): левая рука вытянута вперёд, правая у «тетивы». pull 0..1 — натяжение
export const aimBow = (pull = 1): Pose => ({
	headYaw: 0,
	headPitch: 0,
	armR: [-1.45, 0.5 + 0.25 * pull],
	armL: [-1.52, -0.3],
	legR: [0.12, 0],
	legL: [-0.12, 0],
});

// Держит предмет перед собой в правой руке (показывает)
export const hold = (k = 1): Pose => ({headYaw: 0, headPitch: 0.12 * k, armR: [-1.15 * k, 0.12 * k], armL: [0, 0.03], legR: [0, 0], legL: [0, 0]});

// Оружие на плече (правая рука согнута вверх-назад)
export const shoulder = (t = 0): Pose => ({headYaw: 0, headPitch: -0.04, armR: [-2.75 + Math.sin(t * 2) * 0.03, 0.1], armL: [Math.sin(t * 2.2) * 0.05, 0.04], legR: [0, 0], legL: [0, 0]});

// Вмёрз в нелепой позе
export const frozenPose = (): Pose => ({headYaw: 0.5, headPitch: -0.2, armR: [-2.3, -0.9], armL: [-0.6, 0.8], legR: [-0.7, 0.2], legL: [0.35, -0.1], lean: -0.12});

// Оглядывается по сторонам. k 0..1 — один цикл «влево-вправо»
export const lookAround = (t: number, k: number): Pose => {
	const p = idle(t);
	return {...p, headYaw: Math.sin(clamp01(k) * Math.PI * 2) * 0.85, headPitch: -0.05};
};

// Плавное включение позы на отрезке времени: blendIn(t, 3, 0.25) → 0..1
export const blendIn = (t: number, at: number, dur = 0.2) => easeInOutCubic((t - at) / dur);

// ============================================================================================
// Позы ролика «Опоздал на вайп» (усталость, шок, броски, бег по лестнице, сидя за компьютером).
// Все — чистые функции; k — прогресс действия 0..1 (prog(t, start, dur)), t — время, phase — фаза шага.
// Новые поля позы: bend/twist/tilt (корпус относительно бёдер) и shrug (плечи).
// ============================================================================================

// длина ноги, блоки (12 px скина): чтобы ступни не отрывались, когда ноги разведены
const LEG = (12 * 1.875) / 32;
const footDrop = (a: number) => -LEG * (1 - Math.cos(a));
const k01 = (q: number, a: number, b: number) => smooth((q - a) / (b - a));

// Зеркальная поза: правое ↔ левое
export const mirrorPose = (p: Pose): Pose => ({
	...p,
	headYaw: -p.headYaw,
	armR: [p.armL[0], -p.armL[1]],
	armL: [p.armR[0], -p.armR[1]],
	legR: [p.legL[0], -p.legL[1]],
	legL: [p.legR[0], -p.legR[1]],
	twist: -(p.twist ?? 0),
	tilt: -(p.tilt ?? 0),
});

// Плетётся уставший: ссутулился, голова опущена, руки висят и почти не качаются, шаг короткий.
// phase — фаза шага (makePath(..., {stride: 0.6}).at(t).phase или t * 5); amount 0..1.
export const tiredWalk = (phase: number, amount = 1): Pose => {
	const s = Math.sin(phase);
	const a = s * 0.3 * amount;
	const bob = Math.abs(Math.cos(phase));
	const bend = 0.26 * amount;
	return {
		headYaw: Math.sin(phase * 0.5) * 0.05 * amount,
		headPitch: (0.2 + (1 - bob) * 0.06) * amount,
		armR: [-bend - 0.05 + s * 0.13 * amount, -0.05],
		armL: [-bend - 0.05 - s * 0.13 * amount, 0.05],
		legR: [-a, -0.05 * amount],
		legL: [a, 0.05 * amount],
		lean: -0.03 * amount,
		bend,
		twist: -s * 0.07 * amount,
		tilt: s * 0.03 * amount,
		shrug: -0.8 * amount,
		dy: footDrop(a),
	};
};

// Стоит уставший: плечи опущены, тяжело дышит (вдох ~2.6 с). t — время.
export const slump = (t: number): Pose => {
	const inhale = 0.5 + 0.5 * Math.sin(t * 2.4);
	const bend = 0.27 - inhale * 0.05;
	return {
		headYaw: Math.sin(t * 0.6) * 0.05,
		headPitch: 0.24 - inhale * 0.06,
		armR: [-bend - 0.04, -0.05 - inhale * 0.02],
		armL: [-bend - 0.04, 0.05 + inhale * 0.02],
		legR: [0, -0.1],
		legL: [0, 0.1],
		lean: -0.03,
		bend,
		tilt: 0.03,
		shrug: -0.85 + inhale * 0.5,
	};
};
const SLUMP = slump(-Math.PI / 4.8); // середина вдоха — опорная поза для sigh/lookUp

// Тяжёлый вздох поверх slump: k 0..0.4 — вдох (плечи и голова вверх), 0.5..0.8 — выдох (обмяк),
// к 1 — снова slump. Длительность ~1.4–2 с; смешивать: mixPose(slump(t), sigh(k), pulse...).
export const sigh = (k: number): Pose => {
	const q = clamp01(k);
	const up = k01(q, 0, 0.4) * (1 - k01(q, 0.5, 0.8));
	const drop = k01(q, 0.5, 0.8) * (1 - k01(q, 0.8, 1));
	const b = SLUMP;
	const bend = (b.bend ?? 0) - up * 0.22 + drop * 0.07;
	return {
		...b,
		headPitch: b.headPitch - up * 0.34 + drop * 0.14,
		armR: [-bend - 0.04, b.armR[1] - up * 0.05],
		armL: [-bend - 0.04, b.armL[1] + up * 0.05],
		bend,
		shrug: (b.shrug ?? 0) + up * 1.9 - drop * 0.45,
		lean: (b.lean ?? 0) - up * 0.03,
	};
};

// Поднимает взгляд: k 0 — сутулится (как slump), 1 — выпрямился и смотрит вверх на стену.
// pitch — итоговый наклон головы (отрицательный — вверх), голова опережает корпус.
export const lookUp = (k: number, pitch = -0.32): Pose => {
	const q = clamp01(k);
	const head = smooth(q / 0.7);
	const body = k01(q, 0.15, 1);
	const bend = lerp(SLUMP.bend ?? 0, 0.03, body);
	return {
		...SLUMP,
		headPitch: lerp(SLUMP.headPitch, pitch - bend, head),
		armR: [-bend - 0.04, -0.06],
		armL: [-bend - 0.04, 0.06],
		bend,
		shrug: lerp(SLUMP.shrug ?? 0, -0.2, body),
		tilt: lerp(0.03, 0, body),
	};
};

// Шок: рывок назад, руки вскинуты вверх-в стороны, голова запрокинута. k 0..1 на весь испуг
// (~1.2–1.6 с): удар — первые 12 %, потом дрожь и чуть обмякает. Включать за 0.05–0.08 с.
export const shockPose = (k: number): Pose => {
	const q = clamp01(k);
	const hit = easeOutBack(clamp01(q / 0.12), 2.4);
	const a = hit * (1 - k01(q, 0.35, 1) * 0.3);
	const tr = Math.sin(q * 95) * 0.035 * (1 - q) * hit;
	return {
		headYaw: tr,
		headPitch: -0.24 * a,
		armR: [-1.95 * a + tr, -0.7 * a],
		armL: [-1.95 * a - tr, 0.7 * a],
		legR: [0.2 * a, -0.06],
		legL: [-0.12 * a, 0.06],
		lean: -0.07 * a,
		bend: -0.16 * a,
		shrug: 1.5 * a,
		dy: footDrop(0.2 * a),
	};
};

// Срывает шапку правой рукой и швыряет вперёд-вправо. k: 0..0.22 — рука к макушке (схватил ~0.22),
// 0.22..0.4 — поднял над головой, 0.4..0.5 — замах, выпуск ~0.6, к 1 — рука опускается.
// Шапка: headSlot до 0.22, handR 0.22..0.6, дальше летит сама. Длительность ~0.8 с.
export const flingHat = (k: number): Pose => {
	const q = clamp01(k);
	const reach = k01(q, 0, 0.22);
	const lift = k01(q, 0.22, 0.4);
	const wind = k01(q, 0.38, 0.5);
	const thr = easeOutCubic(clamp01((q - 0.5) / 0.12));
	const back = k01(q, 0.72, 1);
	let ax = lerp(0, -2.75, reach);
	let az = lerp(-0.03, 0.42, reach);
	ax = lerp(ax, -3.0, lift);
	az = lerp(az, 0.12, lift);
	ax = lerp(ax, -2.5, wind);
	az = lerp(az, -0.95, wind);
	ax = lerp(ax, -1.25, thr);
	az = lerp(az, -0.3, thr);
	ax = lerp(ax, 0, back);
	az = lerp(az, -0.05, back);
	const tw = lerp(lerp(0, -0.35, wind), 0.35, thr) * (1 - back);
	return {
		headYaw: lerp(0, -0.35, thr) * (1 - back),
		headPitch: lerp(-0.18 * reach * (1 - thr), 0, back),
		armR: [ax, az],
		armL: [lerp(0, 0.4, thr) * (1 - back), lerp(0.05, 0.25, wind) * (1 - back) + 0.04],
		legR: [0.15 * wind * (1 - back), -0.05],
		legL: [-0.15 * thr * (1 - back), 0.05],
		lean: (0.12 * thr - 0.05 * lift) * (1 - back),
		twist: tw,
		shrug: 0.6 * reach * (1 - thr),
	};
};

// Скидывает рюкзак и швыряет правой рукой. k: 0..0.35 — стряхивает лямки (плечи вверх-назад,
// правая рука ловит лямку ~0.3), 0.35..0.6 — размах сбоку, выпуск ~0.6, 0.6..0.8 — доводка через
// корпус, к 1 — выпрямился. Рюкзак: backSlot до ~0.3, handR 0.3..0.6, дальше летит.
// Длительность ~1–1.2 с (выпуск — на долю).
export const hurlBackpack = (k: number): Pose => {
	const q = clamp01(k);
	const sh = k01(q, 0, 0.12) * (1 - k01(q, 0.12, 0.3));
	const off = k01(q, 0.08, 0.3);
	const swing = k01(q, 0.35, 0.6);
	const thr = easeOutCubic(clamp01((q - 0.5) / 0.1));
	const fol = k01(q, 0.6, 0.8);
	const back = k01(q, 0.8, 1);
	// правая рука: назад к лямке → в сторону → вперёд-вверх → через корпус
	let ax = lerp(0, 0.75, off);
	let az = lerp(-0.04, -0.3, off);
	ax = lerp(ax, 0.2, swing);
	az = lerp(az, -1.25, swing);
	ax = lerp(ax, -1.9, thr);
	az = lerp(az, -0.35, thr);
	ax = lerp(ax, -1.1, fol);
	az = lerp(az, 0.35, fol);
	ax = lerp(ax, 0, back);
	az = lerp(az, -0.04, back);
	const tw = (lerp(lerp(0, -0.25, off), -0.6, swing) + thr * 1.05 + fol * 0.15) * (1 - back);
	return {
		headYaw: (-0.2 * swing + 0.45 * thr) * (1 - back),
		headPitch: (0.1 * off - 0.12 * thr) * (1 - back),
		armR: [ax, az],
		armL: [lerp(lerp(0, 0.55, off), -0.5, thr) * (1 - back), (0.12 + 0.2 * swing) * (1 - back) + 0.04],
		legR: [(0.3 * swing - 0.1 * fol) * (1 - back), -0.06],
		legL: [(-0.25 * thr) * (1 - back), 0.06],
		lean: (0.06 * off - 0.04 * swing + 0.14 * thr) * (1 - back),
		bend: (0.18 * off + 0.12 * fol) * (1 - back),
		twist: tw,
		tilt: (-0.08 * swing + 0.1 * thr) * (1 - back),
		shrug: (1.4 * sh - 0.4 * off) * (1 - swing),
		dy: footDrop(0.3 * swing * (1 - thr)),
	};
};

// Бег вверх по лестнице: колени (ноги) выше вперёд, сильный наклон, руки работают.
// phase — фаза шага (t * 14 или из makePath со stride ≈ 1.6 по горизонтали). y героя — по ступеням.
export const sprintStairs = (phase: number, amount = 1): Pose => {
	const s = Math.sin(phase);
	const bend = 0.34 * amount;
	return {
		headYaw: 0,
		headPitch: -0.42 * amount,
		armR: [-bend + 0.15 + s * 1.05 * amount, -0.16],
		armL: [-bend + 0.15 - s * 1.05 * amount, 0.16],
		legR: [(-0.38 - s * 0.78) * amount, 0],
		legL: [(-0.38 + s * 0.78) * amount, 0],
		lean: 0.16 * amount,
		bend,
		twist: s * 0.12 * amount,
		shrug: 0.4 * amount,
	};
};

// Распахивает дверь правой рукой на бегу. k: 0..0.3 — замах (рука к груди, плечо назад),
// удар ~0.42, 0.55..1 — рука возвращается к base. base — поза бега (ноги и наклон берутся из неё):
// doorShove(k, sprint(phase)). Зеркально (левой) — mirrorPose(doorShove(k, mirrorPose(base))).
export const doorShove = (k: number, base: Pose = POSE_ZERO): Pose => {
	const q = clamp01(k);
	const cock = k01(q, 0, 0.3);
	const hit = easeOutCubic(clamp01((q - 0.3) / 0.12));
	const back = k01(q, 0.55, 1);
	const ax = lerp(lerp(base.armR[0], -0.9, cock), -1.6, hit);
	const az = lerp(lerp(base.armR[1], 0.45, cock), -0.05, hit);
	const a = Math.max(cock, hit) * (1 - back);
	return {
		...base,
		headPitch: lerp(base.headPitch, -0.1, a),
		headYaw: lerp(base.headYaw, -0.15 * hit, a),
		armR: [lerp(ax, base.armR[0], back), lerp(az, base.armR[1], back)],
		armL: [lerp(base.armL[0], 0.7, a), lerp(base.armL[1], 0.2, a)],
		twist: (base.twist ?? 0) + (lerp(0.3, -0.35, hit) * cock) * (1 - back),
		bend: (base.bend ?? 0) + 0.1 * hit * (1 - back),
		shrug: (base.shrug ?? 0) + 0.5 * a,
	};
};

// Прыжок в кресло: 0..0.18 — толчок (корпус вперёд, руки назад), 0.18..0.72 — полёт
// (руки вперёд-вверх, ноги подтягиваются), ~0.75 — плюхнулся (руки разлетаются, голова кивает),
// к 1 — ровно sit(). Положение — diveArc(k, from, seat). Длительность ~0.8–1 с.
export const diveIntoChair = (k: number): Pose => {
	const q = clamp01(k);
	const push = k01(q, 0, 0.18);
	const fly = k01(q, 0.16, 0.72);
	const land = k01(q, 0.7, 0.8);
	const settle = k01(q, 0.8, 1);
	const s = sit();
	const airArm = lerp(lerp(0, 0.9, push), -2.3, fly);
	const armX = lerp(airArm, -0.25, land);
	const armZ = lerp(0.12 + 0.35 * fly, 0.75, land);
	const legX = lerp(lerp(0, 0.35, push), -1.6, fly);
	const pose: Pose = {
		headYaw: 0,
		headPitch: lerp(lerp(0.1 * push, -0.25, fly), 0.3, land),
		armR: [armX, -armZ],
		armL: [armX, armZ],
		legR: [lerp(legX, -1.35, land), -0.22 * fly],
		legL: [lerp(legX, -1.35, land), 0.22 * fly],
		lean: lerp(lerp(0, 0.28, push), -0.15, fly) * (1 - land),
		bend: lerp(0, 0.2, land),
		shrug: lerp(0.8 * fly, -0.3, land),
		dy: lerp(0, -0.59, fly),
	};
	return mixPose(pose, s, settle);
};

// Траектория прыжка в кресло: с from (стоит на полу) по дуге в seat (верх сиденья).
// Стоит на месте до k = 0.16, летит до 0.72, дальше — на сиденье. height — высота дуги, блоки.
export const diveArc = (k: number, from: [number, number, number], seat: [number, number, number], height = 0.7): [number, number, number] => {
	const f = clamp01((k - 0.16) / (0.72 - 0.16));
	const h = smooth(f);
	const arc = Math.sin(f * Math.PI) * height;
	return [lerp(from[0], seat[0], h), lerp(from[1], seat[1], f) + arc, lerp(from[2], seat[2], h)];
};

// Сидит и дышит (ноги как в sit(): верх сиденья = position.y)
export const sitIdle = (t: number): Pose => {
	const br = Math.sin(t * 2.2);
	return {
		...sit(),
		headYaw: Math.sin(t * 0.7) * 0.06,
		headPitch: 0.04 + br * 0.02,
		armR: [-0.62 + br * 0.02, -0.1],
		armL: [-0.62 + br * 0.02, 0.1],
		bend: 0.04 + br * 0.015,
		shrug: br * 0.15,
	};
};

// Печатает сидя: обе руки вперёд на клавиатуре (правая — у мыши), кисти мелко подрагивают.
// Кулаки — ~0.47 блока над сиденьем и ~0.5 перед персонажем: стол ≈ сиденье + 0.42.
export const sitTyping = (t: number, amount = 1): Pose => {
	const jR = noise1(t * 11, 3) * 0.05 + Math.max(0, Math.sin(t * 21)) ** 6 * 0.06;
	const jL = noise1(t * 13, 7) * 0.05 + Math.max(0, Math.sin(t * 19 + 1.3)) ** 6 * 0.06;
	return {
		...sit(),
		headYaw: Math.sin(t * 0.9) * 0.05,
		headPitch: 0.06 + noise1(t * 1.3, 5) * 0.03,
		armR: [-1.2 - jR * amount, -0.04],
		armL: [-1.24 - jL * amount, -0.14],
		bend: 0.1,
		twist: 0.03,
		shrug: 0.25,
	};
};

// Правая рука на мыши (левая лежит на клавиатуре): мышь ездит, на каждый момент из clicks — «клик».
export const sitMouse = (t: number, clicks: number[] = []): Pose => {
	let click = 0;
	for (const c of clicks) {
		const d = t - c;
		if (d > -0.05 && d < 0.15) click = Math.max(click, d < 0 ? 1 + d / 0.05 : 1 - d / 0.15);
	}
	const mx = noise1(t * 2.2, 11) * 0.06;
	return {
		...sit(),
		headYaw: -0.03 + mx * 0.5,
		headPitch: 0.06,
		armR: [-1.16 + click * 0.06 + noise1(t * 3, 4) * 0.03, -0.12 + mx],
		armL: [-1.24, -0.14],
		bend: 0.1,
		twist: -0.04,
		shrug: 0.25,
	};
};

// Тянется вперёд-вниз и жмёт кнопку правой рукой (кнопка ПК). k: 0..0.4 — тянется, ~0.5 — нажал,
// 0.62..1 — вернулся в sit(). low 0..1: 0 — кнопка на уровне стола, 1 — внизу (корпус под столом).
export const sitReach = (k: number, low = 1): Pose => {
	const q = clamp01(k);
	const r = k01(q, 0, 0.4) * (1 - k01(q, 0.62, 1));
	const press = Math.sin(clamp01((q - 0.4) / 0.2) * Math.PI);
	const s = sit();
	const bend = lerp(0.18, 0.42, low) * r;
	return {
		...s,
		headPitch: lerp(0.1, 0.38, low) * r,
		headYaw: -0.1 * r,
		armR: [lerp(-0.6, lerp(-1.45, -1.05, low), r) - 0.14 * press, lerp(-0.1, 0.06, r)],
		armL: [lerp(-0.6, -0.45, r), 0.1 + 0.08 * r],
		bend,
		twist: -0.12 * r,
		shrug: 0.4 * r,
	};
};

// Надевает наушники двумя руками: k 0..0.35 — руки вверх (наушники над макушкой), 0.35..0.7 —
// опускает их на уши (руки по бокам головы), 0.7..1 — руки возвращаются к base (по умолчанию sit()).
// Сами наушники — в headSlot со сдвигом headphonesLift(k). Длительность ~1–1.2 с (надел — k ≈ 0.7).
// Руки без локтей: кулаки достают лишь до верха головы, поэтому руки почти вертикальны.
export const headphonesOn = (k: number, base: Pose = sit()): Pose => {
	const q = clamp01(k);
	const up = k01(q, 0, 0.35);
	const on = k01(q, 0.35, 0.7);
	const back = k01(q, 0.72, 1);
	const ax = lerp(lerp(base.armR[0], -3.08, up), -2.9, on);
	const az = lerp(0.07 * up, 0.01, on);
	const a = 1 - back;
	return {
		...base,
		headPitch: lerp(base.headPitch, -0.1 * up * (1 - on) + 0.12 * on, a),
		armR: [lerp(ax, base.armR[0], back), lerp(az, base.armR[1], back)],
		armL: [lerp(ax, base.armL[0], back), lerp(-az, base.armL[1], back)],
		bend: lerp(base.bend ?? 0, 0.04 * on, a),
		twist: lerp(base.twist ?? 0, 0, a),
		shrug: lerp(base.shrug ?? 0, 0.6 * up, a),
	};
};

// Сдвиг наушников в headSlot для headphonesOn(k), блоки (от центра головы): поднимаются перед
// лицом вместе с руками, к 0.35 — над макушкой, к 0.7 — на голове, дальше [0, 0, 0].
export const headphonesLift = (k: number): [number, number, number] => {
	const q = clamp01(k);
	const up = k01(q, 0.05, 0.35);
	const on = k01(q, 0.35, 0.7);
	return [0, lerp(lerp(-0.3, 0.2, up), 0, on), lerp(0.35, 0, up)];
};

// Сидя радуется (обе руки вверх). turn — поворот корпуса к камере (> 0 — влево), радианы.
export const sitCheer = (t: number, turn = 0): Pose => ({
	...sit(),
	headYaw: turn * 0.3 + Math.sin(t * 2.4) * 0.12,
	headPitch: -0.22,
	armR: [-2.85 + Math.sin(t * 9) * 0.2, -0.38],
	armL: [-2.85 + Math.sin(t * 9 + 1.6) * 0.2, 0.38],
	bend: -0.06,
	twist: turn * 0.7,
	shrug: 0.5,
});

// Сидя машет правой рукой в камеру. turn — как у sitCheer.
export const sitWave = (t: number, turn = 0): Pose => ({
	...sit(),
	headYaw: turn * 0.3 + Math.sin(t * 3) * 0.1,
	headPitch: -0.06,
	armR: [-0.1, -2.5 + Math.sin(t * 15) * 0.35],
	armL: [-0.62, 0.1],
	bend: -0.02,
	twist: turn * 0.7,
	tilt: 0.06,
	shrug: 0.3,
});
