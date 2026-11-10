import * as THREE from 'three';
import {clamp01, spline} from './anim';
import {hash3} from './rng';
import {T} from './timeline';

export const CAMERA_FOV = 38;

type CamKey = {
	t: number;
	az: number; // азимут, градусы
	el: number; // высота над горизонтом, градусы
	dist: number;
	tx: number;
	ty: number;
	tz: number;
	shift: number; // сдвиг кадра вправо (остров уходит влево, справа место под текст)
};

// Путь камеры по ключевым точкам
const KEYS: CamKey[] = [
	// мир собирается: камера подлетает издалека
	{t: 0.0, az: 18, el: 20, dist: 100, tx: 0, ty: -3, tz: 0, shift: 10},
	{t: 2.3, az: 45, el: 27, dist: 52, tx: 0, ty: -1.5, tz: 0, shift: 10},
	{t: 2.75, az: 45, el: 27, dist: 52, tx: 0, ty: -1.5, tz: 0, shift: 10},
	// крупный план игрока
	{t: 3.45, az: 38, el: 9, dist: 11.5, tx: 2.5, ty: 1.75, tz: 2.5, shift: 0.6},
	{t: 4.55, az: 32, el: 8, dist: 11, tx: 2.5, ty: 1.9, tz: 2.5, shift: 0.6},
	// логотип FantasyVisual над островом
	{t: 5.6, az: 45, el: 12, dist: 33, tx: 0, ty: 7.4, tz: 0, shift: 7},
	{t: 7.6, az: 50, el: 11, dist: 32, tx: 0, ty: 7.6, tz: 0, shift: 7},
	{t: 8.3, az: 51, el: 11, dist: 29, tx: 0, ty: 8, tz: 0, shift: 6.5},
	// вода растекается: смотрим сверху
	{t: 9.1, az: 48, el: 34, dist: 42, tx: 0, ty: 4.6, tz: 0, shift: 8.5},
	{t: 10.2, az: 52, el: 31, dist: 44, tx: 0, ty: 4.6, tz: 0, shift: 9},
	// мир уходит под воду, финальный облёт
	{t: 13.0, az: 74, el: 19, dist: 40, tx: 0, ty: 8.2, tz: 0, shift: 8.3},
	{t: 16.0, az: 98, el: 17, dist: 38, tx: 0, ty: 8.6, tz: 0, shift: 8},
];

const channel = (t: number, pickValue: (k: CamKey) => number) =>
	spline(
		t,
		KEYS.map((k) => [k.t, pickValue(k)] as [number, number]),
	);

// плавный шум для тряски камеры
const noise = (t: number, seed: number) => {
	const i = Math.floor(t);
	const f = t - i;
	const a = hash3(i, seed, 0, 77) * 2 - 1;
	const b = hash3(i + 1, seed, 0, 77) * 2 - 1;
	const k = f * f * (3 - 2 * f);
	return a + (b - a) * k;
};

const shakeAmount = (t: number) => {
	// нарастает во время заряда, пик на ударе, затем затухает
	const charge = clamp01((t - T.charge) / (T.strike - T.charge));
	const before = t < T.strike ? charge * charge * 0.16 : 0;
	const after = t >= T.strike ? 0.55 * Math.exp(-(t - T.strike) * 3.2) : 0;
	const land = t >= T.playerLand ? 0.18 * Math.exp(-(t - T.playerLand) * 9) : 0;
	const rise = t > T.riseStart && t < T.riseEnd ? 0.035 : 0;
	return before + after + land + rise;
};

export type CameraState = {
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	azimuth: number; // радианы
	// куда смотрит камера
	forward: THREE.Vector3;
};

const DEG = Math.PI / 180;

export const cameraAt = (t: number): CameraState => {
	const az = channel(t, (k) => k.az) * DEG;
	const el = channel(t, (k) => k.el) * DEG;
	const dist = channel(t, (k) => k.dist);
	const target = new THREE.Vector3(
		channel(t, (k) => k.tx),
		channel(t, (k) => k.ty),
		channel(t, (k) => k.tz),
	);
	const shift = channel(t, (k) => k.shift);

	const dir = new THREE.Vector3(
		Math.cos(el) * Math.sin(az),
		Math.sin(el),
		Math.cos(el) * Math.cos(az),
	);
	// вектор «вправо» на экране
	const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
	const position = target.clone().addScaledVector(dir, dist).addScaledVector(right, shift);
	const lookAt = target.clone().addScaledVector(right, shift);

	const amp = shakeAmount(t);
	if (amp > 0) {
		position.x += noise(t * 31, 1) * amp;
		position.y += noise(t * 29, 2) * amp;
		position.z += noise(t * 33, 3) * amp;
	}

	const m = new THREE.Matrix4().lookAt(position, lookAt, new THREE.Vector3(0, 1, 0));
	const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
	const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
	return {position, quaternion, azimuth: az, forward};
};
