import * as THREE from 'three';
import {
	angleDelta,
	autoBlink,
	blinkAt,
	clamp01,
	diveIntoChair,
	easeInOutCubic,
	easeOutCubic,
	easeOutQuad,
	handAnchor,
	headAnchor,
	headphonesOn,
	impulse,
	lerp,
	mixFace,
	mixPose,
	noise1,
	POSE_ZERO,
	prog,
	pulse,
	sit,
	sitCheer,
	sitIdle,
	sitMouse,
	sitTyping,
	sitWave,
	smooth,
	v3add,
	v3sub,
	withPose,
	worldPoint,
	type FaceState,
	type Pose,
	type Vec3,
} from '../../core';
import {CHAIR, DESK, HEADPHONES_ON_STAND, TRIPOD} from '../../sets/house/anchors';
import {chairSeat} from '../../props/chair';
import {BEAT} from '../../music/grid';
import {BEATS, CLICKS, type ShotName} from './beats';

// Герой и кресло в каждый момент сцены — чистые функции времени (без React).

const TAU = Math.PI * 2;
const wrapPi = (a: number) => {
	let s = a;
	while (s > Math.PI) s -= TAU;
	while (s <= -Math.PI) s += TAU;
	return s;
};
// кубика Эрмита: значения и касательные на концах (касательные — уже умноженные на длительность)
const hermite = (p0: number, m0: number, p1: number, m1: number, u: number) => {
	const u2 = u * u;
	const u3 = u2 * u;
	return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

// ---------- B1: полёт из a-home ----------
// Где он в a-home на 16.0 (за белой вспышкой) и с какой скоростью летит — продолжаем отсюда
const P0: Vec3 = [24.065, 5.744, 2.497];
const V0: Vec3 = [5.2, 0, 2.24];
const FLY_YAW0 = 1.164;
// поза «супермен» (как в конце a-home): руки вперёд, ноги назад; корпус кладёт tumble
const SUPERMAN: Pose = {...POSE_ZERO, headPitch: -0.6, armR: [-2.95, -0.12], armL: [-2.95, 0.12], legR: [0.32, -0.05], legL: [0.12, 0.05], bend: -0.12, shrug: 0.8};
const TUMBLE0 = 1.3;

// ---------- кресло ----------
// В начале кресло выкачено в комнату сиденьем к влетающему герою; он плюхается, кресло катится
// по ходу полёта к столу и делает полтора оборота, останавливаясь лицом к столу (spin кратен 2π).
export const CHAIR_OFF0: Vec3 = [-1.5, 0, -0.7];
const CHAIR0 = v3add(CHAIR.position, CHAIR_OFF0);
const SPIN0 = wrapPi(Math.atan2(P0[0] - CHAIR0[0], P0[2] - CHAIR0[2]) - CHAIR.rotationY);
const SPIN_END = -TAU;
// разворот к камере на штативе в B7 (чуть не до конца — лицо в три четверти)
const CAM_SPIN = (() => {
	const toCam = Math.atan2(TRIPOD.lens[0] - CHAIR.position[0], TRIPOD.lens[2] - CHAIR.position[2]);
	return angleDelta(CHAIR.rotationY, toCam) * 0.86;
})();

// плавный «дожим» с отскоком: 0 в at, колеблется и гаснет
const wobble = (t: number, at: number, freq: number, damp: number) => (t < at ? 0 : Math.exp(-(t - at) * damp) * Math.sin((t - at) * freq));

// ---------- B5: подставка с наушниками ----------
// Сидя до настоящей подставки (в глубине стола) не дотянуться: на планах B5 она стоит ближе, у края
// стола слева (подмена, на общих планах — на своём месте). Кресло подкатывается к ней.
export const HP_STAND: Vec3 = [29.72, DESK.top, 3.95];
export const HP_ON_STAND: Vec3 = [HP_STAND[0], HEADPHONES_ON_STAND[1], HP_STAND[2]];
// поворот наушников на подставке (как у HeadphoneStand: −π/2)
const HP_ROT0: Vec3 = [0, -Math.PI / 2, 0];
// ближняя чашка — за неё он хватает (локальная x модели наушников, блоки)
const CUP: Vec3 = [0.36, -0.02, 0];
const cupOffset = (rot: Vec3): Vec3 => {
	const v = new THREE.Vector3(...CUP).applyEuler(new THREE.Euler(...rot));
	return [v.x, v.y, v.z];
};
const HP_GRIP = v3add(HP_ON_STAND, cupOffset(HP_ROT0));
// поза «тянется левой рукой к подставке»: наклон вперёд, рука вперёд-вверх
const REACH: Pose = withPose(sit(), {armL: [-2.2, 0], armR: [-0.9, -0.15], bend: 0.5, headYaw: 0.42, headPitch: -0.02, shrug: 0.3, twist: 0.05});
const HP_SPIN = -0.1;
const HP_YAW = CHAIR.rotationY + HP_SPIN;
// где должно быть сиденье, чтобы кулак попал в чашку; отсюда — сдвиг кресла
const HP_SEAT: Vec3 = (() => {
	const h = worldPoint(handAnchor(REACH, 'L'), [0, 0, 0], HP_YAW);
	return [HP_GRIP[0] - h[0], CHAIR.position[1] + CHAIR.seatHeight, HP_GRIP[2] - h[2]];
})();
export const HP_CHAIR_OFF: Vec3 = (() => {
	const d = chairSeat([0, 0, 0], CHAIR.rotationY, HP_SPIN).position;
	return [HP_SEAT[0] - d[0] - CHAIR.position[0], 0, HP_SEAT[2] - d[2] - CHAIR.position[2]];
})();
// центр головы сидящего у подставки (для камеры крупного плана B5)
export const HP_HEAD: Vec3 = worldPoint(headAnchor(sit()), HP_SEAT, HP_YAW);
export const HP_FACE_DIR: Vec3 = [Math.sin(HP_YAW), 0, Math.cos(HP_YAW)];

export type ChairState = {offset: Vec3; spin: number; tilt: number};
export const chairAt = (t: number): ChairState => {
	if (t < BEATS.b5) {
		// рывок после удара: откат по ходу полёта (замедляется), вращение быстро после удара и плавно гаснет
		const kr = easeOutQuad(prog(t, BEATS.land, BEATS.rollEnd - BEATS.land));
		const ksRaw = prog(t, BEATS.land, BEATS.spinEnd - BEATS.land);
		const ks = 1 - (1 - ksRaw) ** 1.4;
		const spin = lerp(SPIN0, SPIN_END, ks) + 0.07 * wobble(t, BEATS.spinEnd, 16, 9);
		const offset: Vec3 = [CHAIR_OFF0[0] * (1 - kr), 0, CHAIR_OFF0[2] * (1 - kr)];
		// кресло качнулось назад от удара
		const tilt = -0.2 * wobble(t, BEATS.land, 11, 6);
		return {offset, spin: t < BEATS.land ? SPIN0 : spin, tilt};
	}
	if (t < BEATS.b6) {
		// B5: докатывается к подставке (последние 45 % пути — в кадре), чуть качнулось на остановке
		const k = lerp(0.55, 1, easeOutCubic(prog(t, BEATS.b5, BEATS.hpRollTo - BEATS.b5)));
		return {offset: [HP_CHAIR_OFF[0] * k, 0, HP_CHAIR_OFF[2] * k], spin: HP_SPIN * k, tilt: 0.06 * wobble(t, BEATS.hpRollTo, 12, 8)};
	}
	// B7: разворот к камере (с перелётом и возвратом)
	const k = easeInOutCubic(prog(t, BEATS.turnFrom, BEATS.turnTo - BEATS.turnFrom));
	const spin = CAM_SPIN * k + 0.06 * wobble(t, BEATS.turnTo, 13, 7);
	return {offset: [0, 0, 0], spin, tilt: 0.05 * wobble(t, BEATS.pognali, 12, 6)};
};

const chairPos = (c: ChairState): Vec3 => v3add(CHAIR.position, c.offset);
export const seatAt = (c: ChairState) => chairSeat(chairPos(c), CHAIR.rotationY, c.spin);

// ---------- B2: рука жмёт кнопку ПК ----------
// Крупный план: в кадр входит только рука (отдельная модель руки со скина, см. arm.tsx), тело не рисуем.
// Кулак сверху у кнопки, направление руки — от кулака к плечу (вверх-назад, к креслу).
const BTN_TOP: Vec3 = [30.3, DESK.top + 15 / 16 + 1.7 / 16, 7.1175];
const ARM_DIR: Vec3 = [-0.42, 0.6, -0.68];

// нажатие кнопки 0..1 (для pcPress): вниз за 0.04, держит, отпускает за 0.05
export const pcPressAt = (t: number) => pulse(t, BEATS.press - 0.04, BEATS.release + 0.05, 0.04, 0.05);

export const btnArmAt = (t: number): {fist: Vec3; dir: Vec3; roll: number} => {
	// рука въезжает в кадр вдоль своей оси, зависает над кнопкой, жмёт, после щелчка уходит вверх
	const reach = easeOutCubic(prog(t, BEATS.reach, BEATS.press - 0.06 - BEATS.reach));
	const away = 0.55 * (1 - reach) + 0.4 * easeOutQuad(prog(t, BEATS.release + 0.04, 0.16)) ** 1.5;
	const press = pcPressAt(t);
	const hover = 0.03 * (1 - press);
	const fist: Vec3 = [BTN_TOP[0] + ARM_DIR[0] * away, BTN_TOP[1] + ARM_DIR[1] * away + hover - 0.012 * press, BTN_TOP[2] + ARM_DIR[2] * away];
	return {fist, dir: ARM_DIR, roll: -0.35};
};

// ---------- общее ----------
export type HeroState = {
	visible: boolean;
	pos: Vec3;
	yaw: number;
	pose: Pose;
	face: Partial<FaceState>;
	// наушники: на подставке / в руке (мир) / на голове (headSlot, со сдвигом hpLift)
	hp: 'stand' | 'loose' | 'head';
	hpPos?: Vec3;
	hpRot?: Vec3;
	hpLift?: Vec3;
	// клавиатура/мышь
	typing: number;
	mouseClick: number;
	// где глаза (фокус постобработки), мир
	eyes: Vec3;
	// кувырок всего тела [вперёд, вбок], рад; сплющивание (удар о кресло)
	tumble?: [number, number];
	squash?: number;
};

const eyesOf = (pos: Vec3, yaw: number, pose: Pose): Vec3 => {
	const h = headAnchor(pose);
	return worldPoint([h[0], h[1] - 0.05, h[2] + 0.2], pos, yaw);
};

// клики мыши (вздрагивание руки и кнопки мыши)
const ALL_CLICKS = [...CLICKS.mcDouble, CLICKS.menu, CLICKS.row, CLICKS.connect, CLICKS.voice, CLICKS.rec];
const clickAt = (t: number) => {
	let c = 0;
	for (const x of ALL_CLICKS) c = Math.max(c, pulse(t, x - 0.04, x + 0.1, 0.03, 0.08));
	return c;
};

// ---------- B1 ----------
// Полёт: из точки a-home с её скоростью — по кубике в сиденье выкаченного кресла (на долю land),
// с горизонтальной скоростью, с которой кресло потом откатывается.
const SEAT_LAND = seatAt({offset: CHAIR_OFF0, spin: SPIN0, tilt: 0});
const ROLL_V = (2 * Math.hypot(CHAIR_OFF0[0], CHAIR_OFF0[2])) / (BEATS.rollEnd - BEATS.land);
const ROLL_DIR: Vec3 = [-CHAIR_OFF0[0] / Math.hypot(CHAIR_OFF0[0], CHAIR_OFF0[2]), 0, -CHAIR_OFF0[2] / Math.hypot(CHAIR_OFF0[0], CHAIR_OFF0[2])];
const flightAt = (t: number): Vec3 => {
	const T = BEATS.land;
	const u = clamp01(t / T);
	const p1 = SEAT_LAND.position;
	return [
		hermite(P0[0], V0[0] * T, p1[0], ROLL_V * ROLL_DIR[0] * T, u),
		hermite(P0[1], 0, p1[1], -2.6 * T, u),
		hermite(P0[2], V0[2] * T, p1[2], ROLL_V * ROLL_DIR[2] * T, u),
	];
};
// разворот в воздухе — по часовой, как потом крутится кресло
const YAW_LAND = (() => {
	let d = (SEAT_LAND.rotationY - FLY_YAW0) % TAU;
	if (d > 0) d -= TAU;
	return FLY_YAW0 + d;
})();

const heroB1 = (t: number): HeroState => {
	const c = chairAt(t);
	const seat = seatAt(c);
	const kt = smooth(prog(t, BEATS.twistFrom, BEATS.twistTo - BEATS.twistFrom));
	let pos: Vec3;
	let yaw: number;
	let pose: Pose;
	let tumble: [number, number] = [0, 0];
	let squash = 1;
	if (t < BEATS.land) {
		pos = flightAt(t);
		yaw = lerp(FLY_YAW0, YAW_LAND, kt);
		// из «супермена» — в группировку перед посадкой (ноги вперёд, руки вперёд-вверх)
		const kd = lerp(0.6, 0.75, smooth(prog(t, BEATS.twistFrom, BEATS.land - BEATS.twistFrom)));
		pose = mixPose(SUPERMAN, diveIntoChair(kd), smooth(prog(t, BEATS.twistFrom + 0.02, 0.3)));
		tumble = [TUMBLE0 * (1 - smooth(prog(t, BEATS.twistFrom - 0.04, 0.36))), 0];
	} else {
		// плюх: сиденье проседает, тело сплющивается
		const hit = impulse(t, BEATS.land, 13);
		pos = [seat.position[0], seat.position[1] - 0.05 * hit, seat.position[2]];
		yaw = seat.rotationY;
		pose = diveIntoChair(0.75 + 0.25 * prog(t, BEATS.land, 0.25));
		squash = 1 - 0.2 * hit;
		// на вращении: держится руками, ноги вытянуты, голова запрокинута — «уии»
		const spinPose = withPose(sit(), {armR: [-0.35, -0.95], armL: [-0.35, 0.95], legR: [-1.62, -0.35], legL: [-1.62, 0.35], headPitch: -0.16, bend: -0.12, shrug: 0.4});
		const ks = pulse(t, BEATS.land + 0.1, BEATS.spinEnd + 0.05, 0.14, 0.2);
		pose = mixPose(pose, spinPose, ks);
	}
	const face: Partial<FaceState> = {
		...mixFace({focus: 1}, {joy: 0.85}, smooth(prog(t, BEATS.twistFrom + 0.1, 0.3)) * (1 - smooth(prog(t, 1.4, 0.2)))),
		mouth: 0.2 + 0.45 * pulse(t, BEATS.twistFrom + 0.1, 1.45, 0.2, 0.3),
		blink: blinkAt(t, 1.2, 0.12),
	};
	return {visible: true, pos, yaw, pose, tumble, squash, face, hp: 'stand', typing: 0, mouseClick: 0, eyes: eyesOf(pos, yaw, pose)};
};

// Сидит у стола (спиной к комнате, лицом к монитору): база для B2–B4
const SEAT = chairSeat(CHAIR.position, CHAIR.rotationY, 0);

// B2: лицо в темноте → загорается монитор
const heroFace = (t: number): HeroState => {
	const pos = SEAT.position;
	const yaw = SEAT.rotationY;
	// чуть тянется к экрану, руки на клавиатуре/мыши
	const lean = smooth(prog(t, BEATS.b2face, 0.8));
	const base = mixPose(sitIdle(t), sitMouse(t, []), 0.7);
	const pose = withPose(base, {bend: 0.1 + 0.08 * lean, headPitch: 0.02 - 0.05 * smooth(prog(t, BEATS.monitorOn, 0.3))});
	const on = smooth(prog(t, BEATS.monitorOn, 0.2));
	const face: Partial<FaceState> = {
		...mixFace({focus: 0.55}, {focus: 1}, on),
		blink: blinkAt(t, BEATS.monitorOn + 0.28, 0.14),
		lookY: 0.1,
		lookX: -0.08,
	};
	return {visible: true, pos, yaw, pose, face, hp: 'stand', typing: 0, mouseClick: 0, eyes: eyesOf(pos, yaw, pose)};
};

// B3 вставка: нетерпение у красного экрана загрузки — барабанит пальцами, дёргает головой, вздыхает
const heroImpatient = (t: number): HeroState => {
	const pos = SEAT.position;
	const yaw = SEAT.rotationY;
	const base = sitTyping(t * 1.6, 1);
	// пальцы-барабан: руки по очереди стучат с шагом шестнадцатой (0.1 с)
	const ph = ((t - BEATS.b3face) / 0.1) % 2;
	const tapR = Math.max(0, Math.sin(Math.PI * ph)) * (ph < 1 ? 1 : 0);
	const tapL = ph >= 1 ? Math.sin(Math.PI * (ph - 1)) : 0;
	const twitch = Math.sin((t - BEATS.b3face) * 18) * Math.exp(-((t - BEATS.b3face - 0.18) ** 2) / 0.004);
	const pose = withPose(base, {
		armR: [base.armR[0] + 0.24 * tapR, base.armR[1]],
		armL: [base.armL[0] + 0.24 * tapL, base.armL[1]],
		headPitch: 0.02 - 0.06 * smooth(prog(t, BEATS.b3face + 0.2, 0.15)),
		headYaw: 0.08 * twitch + noise1(t * 3, 9) * 0.03,
		tilt: 0.05 * Math.sin((t - BEATS.b3face) * 6),
		bend: 0.18,
		shrug: 0.25 * pulse(t, BEATS.b3face + 0.18, BEATS.b3back, 0.1, 0.12),
	});
	const face: Partial<FaceState> = {
		focus: 1,
		// глаза к потолку («ну давай же»), выдох через рот
		lookY: lerp(0.15, 0.6, smooth(prog(t, BEATS.b3face + 0.2, 0.12))),
		lookX: 0.2 * smooth(prog(t, BEATS.b3face + 0.2, 0.12)),
		mouth: 0.08 + 0.3 * pulse(t, BEATS.b3face + 0.22, BEATS.b3back, 0.06, 0.1),
		blink: blinkAt(t, BEATS.b3face + 0.06, 0.1),
	};
	return {visible: true, pos, yaw, pose, face, hp: 'stand', typing: Math.max(tapR, tapL) * 0.7, mouseClick: 0, eyes: eyesOf(pos, yaw, pose)};
};

// ---------- B5: наушники ----------
const hpStart = BEATS.hpOn - 0.7 * BEATS.hpDur;
export const hpK = (t: number) => prog(t, hpStart, BEATS.hpDur);
// после захвата — поднимает их к голове (левая рука вверх, правая помогает)
const LIFT: Pose = withPose(sit(), {armL: [-2.75, 0.2], armR: [-2.2, -0.35], bend: 0.12, headPitch: -0.14, headYaw: 0.15, shrug: 0.45});
const hpReachPose = (t: number): Pose => {
	const kReach = lerp(0.6, 1, smooth(prog(t, BEATS.b5, BEATS.hpGrab - 0.03 - BEATS.b5)));
	let pose = mixPose(sitMouse(t, []), REACH, kReach);
	// хватает: кулак чуть «клюёт» вниз
	const grab = impulse(t, BEATS.hpGrab, 18) * (t >= BEATS.hpGrab ? 1 : 0);
	pose = withPose(pose, {armL: [pose.armL[0] + 0.06 * grab, pose.armL[1]], bend: (pose.bend ?? 0) + 0.03 * grab});
	return mixPose(pose, LIFT, smooth(prog(t, BEATS.hpGrab + 0.03, 0.2)));
};
// наушники в руке: в момент захвата — ровно на подставке, дальше висят на чашке в кулаке
const HP_HAND0 = (() => {
	const c = chairAt(BEATS.hpGrab);
	const s = seatAt(c);
	return worldPoint(handAnchor(hpReachPose(BEATS.hpGrab), 'L'), s.position, s.rotationY);
})();
const HP_FIX = v3sub(HP_GRIP, HP_HAND0);

const heroHeadphones = (t: number): HeroState => {
	const c = chairAt(t);
	const seat = seatAt(c);
	const pos = seat.position;
	const yaw = seat.rotationY;
	const face5 = t >= BEATS.b5face;
	let pose: Pose;
	let hp: HeroState['hp'] = 'stand';
	let hpPos: Vec3 | undefined;
	let hpRot: Vec3 | undefined;
	let hpLift: Vec3 | undefined;
	if (!face5) {
		pose = hpReachPose(t);
		if (t >= BEATS.hpGrab) {
			hp = 'loose';
			const w = smooth(prog(t, BEATS.hpGrab, 0.22));
			hpRot = [0.1 * w, HP_ROT0[1] - 0.3 * w, -0.25 * w];
			const hand = worldPoint(handAnchor(pose, 'L'), pos, yaw);
			hpPos = v3sub(v3add(hand, HP_FIX), cupOffset(hpRot));
		}
	} else {
		// крупно: двумя руками поднимает над головой и опускает на уши (надел — на долю hpOn)
		const k = hpK(t);
		pose = headphonesOn(k, sitIdle(t));
		// руки опускаются в стороны («есть!»), а не через лицо
		const back = Math.sin(Math.PI * smooth(prog(k, 0.72, 0.28)));
		pose = withPose(pose, {armR: [pose.armR[0], pose.armR[1] - 0.95 * back], armL: [pose.armL[0], pose.armL[1] + 0.95 * back]});
		hp = 'head';
		hpLift = t < BEATS.hpOn ? lift(k) : [0, 0, 0];
	}
	// надел: довольная улыбка, кивок
	const pleased = smooth(prog(t, BEATS.hpOn - 0.04, 0.16));
	const face: Partial<FaceState> = face5
		? {
				...mixFace({focus: 0.6}, {joy: 0.9}, pleased),
				lookY: 0.4 * (1 - smooth(prog(t, BEATS.b5face + 0.1, 0.25))),
				blink: blinkAt(t, 7.84, 0.12),
				mouth: 0.1 + 0.3 * pleased,
			}
		: {focus: 0.8, lookX: 0.45, lookY: -0.1, mouth: 0.12};
	const nod = 0.13 * wobble(t, BEATS.hpOn, 14, 7);
	const pose2 = withPose(pose, {headPitch: pose.headPitch + nod});
	return {visible: true, pos, yaw, pose: pose2, face, hp, hpPos, hpRot, hpLift, typing: 0, mouseClick: 0, eyes: eyesOf(pos, yaw, pose2)};
};
// сдвиг наушников над головой (как headphonesLift, но не перед лицом: с 0.3 они уже над макушкой)
const lift = (k: number): Vec3 => {
	const on = smooth(prog(k, 0.36, 0.34));
	return [0, lerp(0.24, 0, on), lerp(0.04, 0, on)];
};

// ---------- B7: в наушниках у монитора → разворот к камере → машет → «ПОГНАЛИ» ----------
const heroFinal = (t: number): HeroState => {
	const c = chairAt(t);
	const seat = seatAt(c);
	const pos = seat.position;
	const yaw = seat.rotationY;
	const turn = smooth(prog(t, BEATS.turnFrom, BEATS.turnTo - BEATS.turnFrom));
	// ещё щёлкает мышью (сворачивает OBS), потом отпускает её и разворачивается
	const work = mixPose(sitMouse(t, [CLICKS.final]), sitIdle(t), turn);
	const waving = smooth(prog(t, BEATS.wave - 0.12, 0.16));
	const cheering = smooth(prog(t, BEATS.pognali - 0.06, 0.08));
	let pose = mixPose(work, sitWave(t, 0.35), waving);
	pose = mixPose(pose, sitCheer(t, 0.35), cheering);
	// после удара — качает руками и пружинит в кресле на каждую долю музыки
	let pump = 0;
	for (let b = BEATS.pognali; b < BEATS.end; b = Math.round((b + BEAT) * 1e6) / 1e6) pump = Math.max(pump, impulse(t, b, 9));
	pump *= cheering;
	pose = withPose(pose, {
		armR: [pose.armR[0] - 0.22 * pump, pose.armR[1] - 0.12 * pump],
		armL: [pose.armL[0] - 0.22 * pump, pose.armL[1] + 0.12 * pump],
		shrug: (pose.shrug ?? 0) + 0.3 * pump,
		headPitch: pose.headPitch - 0.08 * pump,
	});
	// на ударе: подпрыгнул в кресле
	const hop = 0.06 * wobble(t, BEATS.pognali, 12, 5) + 0.025 * pump;
	const face: Partial<FaceState> = {
		...mixFace({focus: 0.7}, {joy: 1}, smooth(prog(t, BEATS.turnFrom + 0.15, 0.3))),
		mouth: lerp(0.15, 0.7, cheering) * smooth(prog(t, BEATS.turnFrom + 0.15, 0.3)),
		blink: t < BEATS.turnFrom ? autoBlink(t, 5, 2.6) : 0,
	};
	const p: Vec3 = [pos[0], pos[1] + Math.max(0, hop), pos[2]];
	const click = t < BEATS.turnFrom ? pulse(t, CLICKS.final - 0.04, CLICKS.final + 0.1, 0.03, 0.08) : 0;
	return {visible: true, pos: p, yaw, pose, face, hp: 'head', typing: 0, mouseClick: click, eyes: eyesOf(p, yaw, pose)};
};

const HIDDEN: HeroState = {visible: false, pos: [0, 0, 0], yaw: 0, pose: POSE_ZERO, face: {}, hp: 'stand', typing: 0, mouseClick: 0, eyes: [0, 0, 0]};

export const heroAt = (shot: ShotName, t: number): HeroState => {
	switch (shot) {
		case 'b1':
			return heroB1(t);
		case 'b2btn':
			// крупно только рука (btnArmAt); тело за кадром
			return {...HIDDEN, eyes: BTN_TOP};
		case 'b2pc':
		case 'b2face':
			return heroFace(t);
		case 'b3face':
			return heroImpatient(t);
		case 'b5':
		case 'b5face':
			return heroHeadphones(t);
		case 'b7':
			return heroFinal(t);
		default:
			return {...HIDDEN, mouseClick: clickAt(t)};
	}
};

export {BTN_TOP};
