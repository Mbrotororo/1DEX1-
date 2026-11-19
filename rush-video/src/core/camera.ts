import * as THREE from 'three';
import {clamp01, DEG, spline, type Vec3} from './anim';
import {noise1} from './rng';
import {HEIGHT, WIDTH} from '../timeline';

// Камера. Каждая функция — чистая: t (секунды) -> CameraState.

export type CameraState = {
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	// куда смотрит камера (единичный вектор)
	forward: THREE.Vector3;
	// азимут камеры, радианы: камера стоит от цели в сторону (sin az, ·, cos az).
	// Персонаж с rotationY = cam.azimuth смотрит прямо в камеру.
	azimuth: number;
	// вертикальный угол обзора, градусы
	fov: number;
};

export type CamFn = (t: number) => CameraState;

export const DEFAULT_FOV = 38;
const UP = new THREE.Vector3(0, 1, 0);

// Камера из положения и точки, куда смотреть. roll — наклон горизонта, радианы.
export const lookCam = (position: Vec3 | THREE.Vector3, target: Vec3 | THREE.Vector3, fov = DEFAULT_FOV, roll = 0): CameraState => {
	const pos = position instanceof THREE.Vector3 ? position.clone() : new THREE.Vector3(...position);
	const tgt = target instanceof THREE.Vector3 ? target.clone() : new THREE.Vector3(...target);
	const m = new THREE.Matrix4().lookAt(pos, tgt, UP);
	const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
	if (roll !== 0) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
	const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
	return {position: pos, quaternion, forward, azimuth: Math.atan2(-forward.x, -forward.z), fov};
};

// ---------- облёт вокруг цели ----------
export type OrbitKey = {
	t: number;
	// азимут и высота над горизонтом, градусы
	az: number;
	el: number;
	// расстояние до цели, блоки
	dist: number;
	// цель: [x, y, z]
	target: Vec3;
	// сдвиг кадра вправо в блоках (цель уходит влево — справа место под надпись)
	shift?: number;
	fov?: number;
	roll?: number;
};

// Облёт по ключам (плавный монотонный сплайн по каждому параметру)
export const orbitCam = (keys: OrbitKey[]): CamFn => {
	const ch = (pick: (k: OrbitKey) => number) => keys.map((k) => [k.t, pick(k)] as [number, number]);
	const az = ch((k) => k.az);
	const el = ch((k) => k.el);
	const dist = ch((k) => k.dist);
	const tx = ch((k) => k.target[0]);
	const ty = ch((k) => k.target[1]);
	const tz = ch((k) => k.target[2]);
	const shift = ch((k) => k.shift ?? 0);
	const fov = ch((k) => k.fov ?? DEFAULT_FOV);
	const roll = ch((k) => k.roll ?? 0);
	return (t) => {
		const a = spline(t, az) * DEG;
		const e = spline(t, el) * DEG;
		const d = spline(t, dist);
		const target = new THREE.Vector3(spline(t, tx), spline(t, ty), spline(t, tz));
		const s = spline(t, shift);
		const dir = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
		// вектор «вправо» на экране
		const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
		const position = target.clone().addScaledVector(dir, d).addScaledVector(right, s);
		const look = target.clone().addScaledVector(right, s);
		const cam = lookCam(position, look, spline(t, fov), spline(t, roll));
		cam.azimuth = a;
		return cam;
	};
};

// ---------- свободный пролёт ----------
export type FlyKey = {
	t: number;
	// где камера
	pos: Vec3;
	// куда смотрит
	look: Vec3;
	fov?: number;
	roll?: number;
};

// Пролёт по ключам: положение и точка взгляда идут по плавным сплайнам
export const flyCam = (keys: FlyKey[]): CamFn => {
	const ch = (pick: (k: FlyKey) => number) => keys.map((k) => [k.t, pick(k)] as [number, number]);
	const px = ch((k) => k.pos[0]);
	const py = ch((k) => k.pos[1]);
	const pz = ch((k) => k.pos[2]);
	const lx = ch((k) => k.look[0]);
	const ly = ch((k) => k.look[1]);
	const lz = ch((k) => k.look[2]);
	const fov = ch((k) => k.fov ?? DEFAULT_FOV);
	const roll = ch((k) => k.roll ?? 0);
	return (t) =>
		lookCam([spline(t, px), spline(t, py), spline(t, pz)], [spline(t, lx), spline(t, ly), spline(t, lz)], spline(t, fov), spline(t, roll));
};

// ---------- склейка планов ----------
export type Shot = {
	// локальное время сцены, с которого начинается план
	from: number;
	// камера плана; получает время ОТ НАЧАЛА ПЛАНА (tShot) и время сцены (t)
	cam: (tShot: number, t: number) => CameraState;
};

// Сцена как последовательность планов с резкими склейками
export const shots = (list: Shot[]): CamFn => {
	const sorted = [...list].sort((a, b) => a.from - b.from);
	return (t) => {
		let cur = sorted[0];
		for (const s of sorted) if (t >= s.from) cur = s;
		return cur.cam(t - cur.from, t);
	};
};

// Номер плана и время внутри него (если от плана зависит что-то кроме камеры)
export const shotAt = (list: {from: number}[], t: number) => {
	let index = 0;
	for (let i = 0; i < list.length; i++) if (t >= list[i].from) index = i;
	return {index, tShot: t - list[index].from};
};

// Плавный переход между двумя камерами (k: 0 → a, 1 → b)
export const mixCam = (a: CameraState, b: CameraState, k: number): CameraState => {
	const q = clamp01(k);
	const position = a.position.clone().lerp(b.position, q);
	const quaternion = a.quaternion.clone().slerp(b.quaternion, q);
	const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
	return {position, quaternion, forward, azimuth: Math.atan2(-forward.x, -forward.z), fov: a.fov + (b.fov - a.fov) * q};
};

// ---------- тряска ----------
// Добавить тряску: amount — амплитуда в блоках (0.05 — лёгкая, 0.3 — удар), freq — частота.
export const shake = (cam: CameraState, amount: number, t: number, seed = 1, freq = 30): CameraState => {
	if (amount <= 0) return cam;
	const position = cam.position.clone();
	position.x += noise1(t * freq, seed) * amount;
	position.y += noise1(t * freq * 0.93, seed + 1) * amount;
	position.z += noise1(t * freq * 1.07, seed + 2) * amount;
	// лёгкий наклон горизонта вместе с дрожью
	const roll = noise1(t * freq * 0.8, seed + 3) * amount * 0.04;
	const quaternion = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
	return {...cam, position, quaternion};
};

// ---------- слежение ----------
export type FollowOpts = {
	// смещение камеры от цели в системе цели: [вправо, вверх, назад] относительно heading
	offset?: Vec3;
	// куда смотреть: смещение точки взгляда от цели
	lookOffset?: Vec3;
	// запаздывание, секунды (0 — жёстко привязана)
	lag?: number;
	// функция направления движения цели (радианы, как rotationY персонажа); если нет — камера не вращается вместе с целью
	heading?: (t: number) => number;
	fov?: number;
};

// Камера, которая летит за движущейся целью с запаздыванием. target(t) — положение цели.
// Запаздывание считается усреднением прошлых положений цели — без накопления состояния.
export const followCam = (target: (t: number) => Vec3, opts: FollowOpts = {}): CamFn => {
	const {offset = [0, 3, 8], lookOffset = [0, 1.2, 0], lag = 0.35, heading, fov = DEFAULT_FOV} = opts;
	const N = 10;
	const lagged = <T,>(t: number, f: (time: number) => T, mix: (acc: number[], v: T, w: number) => void, size: number) => {
		const acc = new Array<number>(size).fill(0);
		if (lag <= 0) {
			mix(acc, f(t), 1);
			return acc;
		}
		let total = 0;
		for (let i = 0; i < N; i++) {
			// экспоненциальные веса: недавние положения важнее
			const dt = (i / (N - 1)) * lag * 2.5;
			const w = Math.exp(-dt / lag);
			mix(acc, f(t - dt), w);
			total += w;
		}
		return acc.map((v) => v / total);
	};
	return (t) => {
		const p = lagged(
			t,
			target,
			(acc, v, w) => {
				acc[0] += v[0] * w;
				acc[1] += v[1] * w;
				acc[2] += v[2] * w;
			},
			3,
		);
		let hx = 0;
		let hz = 1;
		if (heading) {
			const h = lagged(
				t,
				heading,
				(acc, v, w) => {
					acc[0] += Math.sin(v) * w;
					acc[1] += Math.cos(v) * w;
				},
				2,
			);
			const len = Math.hypot(h[0], h[1]) || 1;
			hx = h[0] / len;
			hz = h[1] / len;
		}
		// базис цели: вперёд (hx, hz), вправо — перпендикуляр
		const rx = hz;
		const rz = -hx;
		const now = target(t);
		const pos: Vec3 = [p[0] + rx * offset[0] - hx * offset[2], p[1] + offset[1], p[2] + rz * offset[0] - hz * offset[2]];
		// смотрим ближе к настоящему положению цели, чем к запаздывающему: цель не уходит из кадра
		const look: Vec3 = [
			(now[0] + p[0]) / 2 + rx * lookOffset[0] + hx * lookOffset[2],
			(now[1] + p[1]) / 2 + lookOffset[1],
			(now[2] + p[2]) / 2 + rz * lookOffset[0] + hz * lookOffset[2],
		];
		return lookCam(pos, look, fov);
	};
};

// ---------- проекция на экран ----------
export type ScreenPoint = {
	// пиксели кадра 1920x1080: (0, 0) — левый верхний угол
	x: number;
	y: number;
	// точка позади камеры — рисовать не надо
	behind: boolean;
	// расстояние от камеры вдоль взгляда, блоки
	depth: number;
	// сколько пикселей занимает 1 блок на этой глубине (для масштаба подписей)
	pxPerBlock: number;
};

// Где на экране видна мировая точка (для DOM-подписей, привязанных к 3D)
export const projectToScreen = (cam: CameraState, world: Vec3 | THREE.Vector3, width = WIDTH, height = HEIGHT): ScreenPoint => {
	const p = world instanceof THREE.Vector3 ? world.clone() : new THREE.Vector3(...world);
	p.sub(cam.position).applyQuaternion(cam.quaternion.clone().invert());
	const depth = -p.z;
	const f = height / 2 / Math.tan((cam.fov * DEG) / 2);
	const safe = Math.max(depth, 1e-4);
	return {
		x: width / 2 + (p.x / safe) * f,
		y: height / 2 - (p.y / safe) * f,
		behind: depth <= 0.05,
		depth,
		pxPerBlock: f / safe,
	};
};

// Точка в мире, которая видна в заданном месте кадра на заданной глубине.
// sx, sy — координаты кадра от -1 до 1 (0, 0 — центр; +y вверх). Удобно ставить салюты и вспышки «в кадр».
export const screenToWorld = (cam: CameraState, sx: number, sy: number, depth: number, aspect = WIDTH / HEIGHT): THREE.Vector3 => {
	const halfH = depth * Math.tan((cam.fov * DEG) / 2);
	const halfW = halfH * aspect;
	const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
	const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
	return cam.position
		.clone()
		.addScaledVector(cam.forward, depth)
		.addScaledVector(right, sx * halfW)
		.addScaledVector(up, sy * halfH);
};
