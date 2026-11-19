import {clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, lerp, smooth} from '../anim';

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
};

export const POSE_ZERO: Pose = {headYaw: 0, headPitch: 0, armR: [0, 0], armL: [0, 0], legR: [0, 0], legL: [0, 0], lean: 0, dy: 0};

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
