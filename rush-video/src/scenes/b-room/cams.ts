import {flyCam, impulse, lookCam, noise1, prog, shake, smooth, v3add, v3scale, type CameraState, type Vec3} from '../../core';
import {MONITOR, TRIPOD_VIEW} from '../../sets/house/anchors';
import {BEATS, type ShotName} from './beats';
import {BUTTON_CENTER} from './btn';
import {HP_FACE_DIR, HP_HEAD} from './hero';

// Камеры планов сцены b-room. ts — время от начала плана, t — локальное время сцены.

// лёгкая «ручная» камера: медленное покачивание (детерминированное)
const hand = (cam: CameraState, t: number, amount = 0.012, seed = 1) => shake(cam, amount, t, seed, 0.9);

// B1: 0–0.4 общий план от двери (постер, кровать, штатив, стол у окна), дальше камера летит за ним
// вниз и вперёд: к удару о кресло (0.8) он — треть кадра, потом подъезжает за откатившимся креслом
const b1 = flyCam([
	{t: 0, pos: [21.55, 7.45, 3.55], look: [25.3, 6.0, 3.45], fov: 60},
	// в воздухе (разворот над креслом, 0.43–0.6) голова выше всего (~7.9): взгляд выше и шире, чтобы она не уходила за кадр
	{t: 0.4, pos: [22.25, 7.15, 3.5], look: [25.95, 6.45, 3.75], fov: 58},
	{t: 0.8, pos: [23.95, 6.6, 3.3], look: [26.7, 6.15, 4.2], fov: 46},
	{t: 1.6, pos: [25.55, 6.5, 3.95], look: [28.3, 5.98, 5.0], fov: 42},
]);

// B2: крупно кнопка питания сверху-сбоку, со стороны комнаты: за кнопкой — крышка корпуса и стол, окно с
// закатом — только краем сверху (не спорит с кнопкой); кулак входит сверху-слева (оттуда, где кресло),
// кнопка с ⏻ в центре кадра (узко: кнопка ~1/8 ширины кадра)
const BTN = BUTTON_CENTER;
const btnLook: Vec3 = [BTN[0] + 0.01, BTN[1] + 0.025, BTN[2] - 0.01];
const b2btn = flyCam([
	{t: 0, pos: [BTN[0] - 0.62, BTN[1] + 0.9, BTN[2] + 0.56], look: btnLook, fov: 24},
	{t: 0.4, pos: [BTN[0] - 0.58, BTN[1] + 0.85, BTN[2] + 0.53], look: btnLook, fov: 21},
]);

// B2: корпус целиком со стороны стекла (смотрит в комнату): сквозь стекло — кольца передних
// вентиляторов и лента, RGB бежит волной снизу вверх
const b2pc = flyCam([
	{t: 0, pos: [29.28, 6.3, 5.95], look: [30.26, 6.27, 6.86], fov: 40},
	{t: 0.4, pos: [29.37, 6.3, 6.03], look: [30.26, 6.27, 6.86], fov: 37},
]);

// B2: лицо глазами монитора, на уровне глаз (из-под чёлки видны глаза); наезд
const b2face = flyCam([
	{t: 0, pos: [29.72, 6.44, 5.46], look: [28.3, 6.49, 4.98], fov: 40},
	{t: 0.8, pos: [29.6, 6.45, 5.4], look: [28.3, 6.5, 4.98], fov: 33},
]);

// B3 вставка: лицо и руки на столе снизу-сбоку в красном свете загрузки
const b3face = flyCam([
	{t: 0, pos: [29.5, 6.3, 5.72], look: [28.46, 6.3, 4.98], fov: 50},
	{t: 0.4, pos: [29.44, 6.3, 5.68], look: [28.46, 6.33, 4.98], fov: 46},
]);

// B5: через левое плечо, выше и левее: подставка с наушниками — в правой трети (слева лампа и окно,
// справа сверху — монитор с Discord), голова — только краем у правой кромки; он подкатывается,
// рука входит справа, хватает чашку и поднимает наушники вверх из кадра
const b5 = flyCam([
	{t: 0, pos: [28.45, 7.05, 3.5], look: [29.74, 6.22, 3.72], fov: 38},
	{t: 0.4, pos: [28.55, 7.03, 3.52], look: [29.74, 6.28, 3.72], fov: 36},
]);

// B5: лицо крупно спереди-справа (над клавиатурой): надевает наушники; взгляд камеры — на глаза
const b5faceDir = ((): Vec3 => {
	const a = 0.42;
	const [fx, , fz] = HP_FACE_DIR;
	// поворот направления взгляда героя на a вправо (к его правому плечу)
	return [fx * Math.cos(a) - fz * Math.sin(a), 0, fx * Math.sin(a) + fz * Math.cos(a)];
})();
// сначала выше (наушники над головой в кадре), к «надел» (8.0) — на глазах
const b5face = flyCam([
	{t: 0, pos: v3add(v3add(HP_HEAD, v3scale(b5faceDir, 1.45)), [0, 0.02, 0]), look: v3add(HP_HEAD, [0, 0.1, 0]), fov: 42},
	{t: 0.45, pos: v3add(v3add(HP_HEAD, v3scale(b5faceDir, 1.36)), [0, -0.03, 0]), look: v3add(HP_HEAD, [0, -0.03, 0]), fov: 39},
	{t: 0.8, pos: v3add(v3add(HP_HEAD, v3scale(b5faceDir, 1.34)), [0, -0.03, 0]), look: v3add(HP_HEAD, [0, -0.03, 0]), fov: 40},
]);

// B7: через видоискатель камеры на штативе — почти неподвижно, лёгкий наезд (до fov 38);
// перед «ПОГНАЛИ» взгляд чуть вверх, чтобы вскинутые руки остались в кадре
const b7 = (ts: number, t: number): CameraState => {
	const k = smooth(prog(ts, 0, 3.6));
	const up = 0.12 * smooth(prog(t, BEATS.pognali - 0.2, 0.4));
	const L = TRIPOD_VIEW.look;
	return lookCam(TRIPOD_VIEW.pos, [L[0] - 0.05 * k, L[1] + 0.03 * k + up, L[2]], TRIPOD_VIEW.fov - 2 * k);
};

// экран во весь кадр рисует DOM (ScreenPOV), 3D под ним не рисуется — камера любая
const pov = lookCam([29.4, 6.52, MONITOR.screenCenter[2]], MONITOR.screenCenter, 40);

export const SHOT_CAMS: Record<ShotName, (ts: number, t: number) => CameraState> = {
	b1: (ts, t) => shake(hand(b1(ts), t, 0.015, 2), 0.08 * impulse(t, BEATS.land, 10), t, 3, 7),
	b2btn: (ts, t) => shake(hand(b2btn(ts), t, 0.003, 4), 0.006 * impulse(t, BEATS.press, 18), t, 16, 9),
	b2pc: (ts, t) => hand(b2pc(ts), t, 0.006, 5),
	b2face: (ts, t) => shake(hand(b2face(ts), t, 0.006, 6), 0.012 * impulse(t, BEATS.monitorOn, 8), t, 7, 6),
	b3: () => pov,
	b3face: (ts, t) => hand(b3face(ts), t, 0.006, 8),
	b3b: () => pov,
	b4: () => pov,
	b5: (ts, t) => hand(b5(ts), t, 0.008, 9),
	b5face: (ts, t) => shake(hand(b5face(ts), t, 0.006, 12), 0.02 * impulse(t, BEATS.hpOn, 9), t, 10, 7),
	b6: () => pov,
	b7: (ts, t) => {
		// штатив: почти без качки; на ударе — толчок
		const c = b7(ts, t);
		const drift = shake(c, 0.003 + 0.002 * Math.abs(noise1(t * 0.3, 12)), t, 11, 0.5);
		return shake(drift, 0.06 * impulse(t, BEATS.pognali, 7), t, 13, 8);
	},
};

// какие планы — экран во весь кадр (DOM)
export const POV_SHOTS: ShotName[] = ['b3', 'b3b', 'b4', 'b6'];
