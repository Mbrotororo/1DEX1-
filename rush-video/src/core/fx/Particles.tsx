import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {clamp01, type Vec3} from '../anim';
import {mulberry32} from '../rng';

// Частицы-кубики. Положение каждой частицы — формула от времени, никакой «живой» физики.

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export type ParticleOut = {
	x: number;
	y: number;
	z: number;
	// размер кубика в блоках (0 — не видно)
	s: number;
	rx: number;
	ry: number;
	rz: number;
};

export type ParticlesProps = {
	// сколько частиц
	count: number;
	seed?: number;
	// палитра: каждая частица берёт случайный цвет из списка
	colors: string[];
	// формула частицы: i — номер, r — восемь её личных случайных чисел 0..1, out — куда писать
	fn: (i: number, r: Float32Array, out: ParticleOut) => void;
	// светящиеся (аддитивные) частицы
	additive?: boolean;
	opacity?: number;
	// выключить целиком (ничего не считается)
	active?: boolean;
	fog?: boolean;
	renderOrder?: number;
};

const RAND = 8;
const out: ParticleOut = {x: 0, y: 0, z: 0, s: 0, rx: 0, ry: 0, rz: 0};

// Универсальный рой кубиков: опиши формулу одной частицы — остальное сделает компонент
export const Particles: React.FC<ParticlesProps> = ({count, seed = 1, colors, fn, additive = false, opacity = 1, active = true, fog = true, renderOrder = 0}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const colored = useRef('');
	const rand = useMemo(() => {
		const rnd = mulberry32(seed);
		const arr: Float32Array[] = [];
		for (let i = 0; i < count; i++) {
			const r = new Float32Array(RAND);
			for (let j = 0; j < RAND; j++) r[j] = rnd();
			arr.push(r);
		}
		return arr;
	}, [count, seed]);
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const mat = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				transparent: additive || opacity < 1,
				blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
				depthWrite: !additive && opacity >= 1,
				fog: fog && !additive,
			}),
		[additive, fog, opacity < 1],
	);
	mat.opacity = opacity;
	const colorKey = colors.join(',') + count;

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		if (colored.current !== colorKey) {
			for (let i = 0; i < count; i++) mesh.setColorAt(i, tmpColor.set(colors[Math.floor(rand[i][7] * colors.length) % colors.length]));
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			colored.current = colorKey;
		}
		if (!active) return;
		for (let i = 0; i < count; i++) {
			out.x = out.y = out.z = out.s = out.rx = out.ry = out.rz = 0;
			fn(i, rand[i], out);
			if (out.s <= 0.0001) {
				dummy.position.set(0, 0, 0);
				dummy.scale.setScalar(0);
			} else {
				dummy.position.set(out.x, out.y, out.z);
				dummy.rotation.set(out.rx, out.ry, out.rz);
				dummy.scale.setScalar(out.s);
			}
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		dummy.rotation.set(0, 0, 0);
		mesh.instanceMatrix.needsUpdate = true;
	});

	return <instancedMesh key={count} ref={ref} args={[geo, mat, count]} frustumCulled={false} visible={active} renderOrder={renderOrder} />;
};

// ---------- разовый выброс ----------
export type BurstProps = {
	t: number;
	// момент выброса
	at: number;
	origin: Vec3;
	count: number;
	seed?: number;
	colors: string[];
	// скорость разлёта [мин, макс], блоков в секунду
	speed: [number, number];
	// 'sphere' — во все стороны, 'up' — фонтаном вверх, 'ring' — кольцом по земле, 'cone' — конусом вдоль dir
	shape: 'sphere' | 'up' | 'ring' | 'cone';
	// для 'cone': направление и раствор (радианы)
	dir?: Vec3;
	angle?: number;
	gravity?: number;
	drag?: number;
	life?: [number, number];
	size?: [number, number];
	// частицы стартуют не разом, а в течение этого времени
	spreadDelay?: number;
	// разброс точки старта (блоки)
	spawn?: number;
	additive?: boolean;
};

// Разлетающиеся кубики (брызги, пыль, осколки, салют)
export const Burst: React.FC<BurstProps> = ({
	t,
	at,
	origin,
	count,
	seed = 1,
	colors,
	speed,
	shape,
	dir = [0, 1, 0],
	angle = 0.5,
	gravity = -14,
	drag = 1.2,
	life = [0.5, 1],
	size = [0.12, 0.26],
	spreadDelay = 0,
	spawn = 0,
	additive = false,
}) => {
	const active = t >= at && t <= at + life[1] + spreadDelay;
	const basis = useMemo(() => {
		const d = new THREE.Vector3(...dir).normalize();
		const a = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
		const u = new THREE.Vector3().crossVectors(d, a).normalize();
		const v = new THREE.Vector3().crossVectors(d, u);
		return {d, u, v};
	}, [dir[0], dir[1], dir[2]]);
	return (
		<Particles
			count={count}
			seed={seed}
			colors={colors}
			additive={additive}
			active={active}
			fn={(_i, r, o) => {
				const tau = t - at - r[5] * spreadDelay;
				const lifeI = life[0] + r[3] * (life[1] - life[0]);
				const k = tau / lifeI;
				if (tau <= 0 || k >= 1) return;
				const a = r[0] * Math.PI * 2;
				const v = speed[0] + r[1] * (speed[1] - speed[0]);
				let dx = 0;
				let dy = 0;
				let dz = 0;
				if (shape === 'sphere') {
					const y = r[2] * 2 - 1;
					const rad = Math.sqrt(1 - y * y);
					dx = Math.cos(a) * rad;
					dy = y;
					dz = Math.sin(a) * rad;
				} else if (shape === 'up') {
					const rad = 0.15 + r[2] * 0.55;
					dx = Math.cos(a) * rad;
					dy = 1;
					dz = Math.sin(a) * rad;
				} else if (shape === 'ring') {
					dx = Math.cos(a);
					dy = 0.15 + r[2] * 0.35;
					dz = Math.sin(a);
				} else {
					const spread = Math.tan(angle) * Math.sqrt(r[2]);
					dx = basis.d.x + (basis.u.x * Math.cos(a) + basis.v.x * Math.sin(a)) * spread;
					dy = basis.d.y + (basis.u.y * Math.cos(a) + basis.v.y * Math.sin(a)) * spread;
					dz = basis.d.z + (basis.u.z * Math.cos(a) + basis.v.z * Math.sin(a)) * spread;
				}
				// торможение об воздух + гравитация
				const d = drag > 0 ? (1 - Math.exp(-drag * tau)) / drag : tau;
				o.x = origin[0] + (r[4] - 0.5) * spawn + dx * v * d;
				o.y = origin[1] + (r[5] - 0.5) * spawn + dy * v * d + 0.5 * gravity * tau * tau;
				o.z = origin[2] + (r[6] - 0.5) * spawn + dz * v * d;
				const spin = (r[6] - 0.5) * 8;
				o.rx = tau * spin;
				o.ry = tau * spin * 0.7;
				o.s = (size[0] + r[4] * (size[1] - size[0])) * Math.sqrt(1 - k);
			}}
		/>
	);
};

// ---------- шлейф за движущейся точкой ----------
export type TrailProps = {
	t: number;
	// на каком отрезке времени испускать
	from: number;
	to: number;
	// частиц в секунду
	rate?: number;
	// где находится источник в момент time (например, ноги бегущего героя)
	origin: (time: number) => Vec3;
	colors: string[];
	life?: [number, number];
	size?: [number, number];
	// разброс вокруг источника и скорость подъёма
	spread?: number;
	rise?: number;
	// снос (ветер), блоков в секунду
	drift?: Vec3;
	seed?: number;
	additive?: boolean;
};

// Пыль из-под ног, брызги по воде, след снежка — частицы рождаются вдоль пути источника
export const Trail: React.FC<TrailProps> = ({t, from, to, rate = 30, origin, colors, life = [0.35, 0.7], size = [0.1, 0.22], spread = 0.3, rise = 0.8, drift = [0, 0, 0], seed = 1, additive = false}) => {
	const count = Math.max(1, Math.ceil((to - from) * rate));
	const active = t >= from && t <= to + life[1];
	return (
		<Particles
			count={count}
			seed={seed}
			colors={colors}
			additive={additive}
			active={active}
			fn={(i, r, o) => {
				const born = from + (i + r[0]) / rate;
				const tau = t - born;
				const lifeI = life[0] + r[1] * (life[1] - life[0]);
				if (tau <= 0 || tau >= lifeI || born > to) return;
				const k = tau / lifeI;
				const p = origin(born);
				o.x = p[0] + (r[2] - 0.5) * spread + drift[0] * tau + (r[5] - 0.5) * tau * 0.8;
				o.y = p[1] + r[3] * spread * 0.5 + rise * tau * (0.5 + r[6]) + drift[1] * tau;
				o.z = p[2] + (r[4] - 0.5) * spread + drift[2] * tau + (r[6] - 0.5) * tau * 0.8;
				o.rx = tau * (r[5] - 0.5) * 6;
				o.ry = tau * (r[6] - 0.5) * 6;
				o.s = (size[0] + r[4] * (size[1] - size[0])) * Math.sin(Math.PI * Math.sqrt(k));
			}}
		/>
	);
};

// ---------- мерцающие искры в объёме ----------
export type SparklesProps = {
	t: number;
	center: Vec3;
	// размеры области [x, y, z], блоки
	box?: Vec3;
	count?: number;
	colors?: string[];
	size?: number;
	// как быстро мигают и всплывают
	speed?: number;
	rise?: number;
	// общая сила 0..1 (плавное появление/исчезновение)
	amount?: number;
	seed?: number;
};

export const Sparkles: React.FC<SparklesProps> = ({t, center, box = [2, 2, 2], count = 30, colors = ['#fff6c8', '#ffe27a', '#ffffff'], size = 0.1, speed = 1, rise = 0.3, amount = 1, seed = 1}) => (
	<Particles
		count={count}
		seed={seed}
		colors={colors}
		additive
		active={amount > 0.01}
		fn={(_i, r, o) => {
			// у каждой искры свой цикл: вспыхнула — погасла — появилась в новом месте
			const period = (0.6 + r[3] * 0.9) / speed;
			const phase = (t / period + r[4]) % 1;
			const cycle = Math.floor(t / period + r[4]);
			const j = (n: number) => ((Math.sin((cycle + 1) * 12.9898 * (n + 1) + r[n] * 78.233) * 43758.5453) % 1 + 1) % 1;
			o.x = center[0] + (j(0) - 0.5) * box[0];
			o.y = center[1] + (j(1) - 0.5) * box[1] + phase * rise;
			o.z = center[2] + (j(2) - 0.5) * box[2];
			o.rx = o.ry = t * 2 + r[5] * 6;
			o.s = size * (0.5 + r[6]) * Math.sin(Math.PI * phase) * amount;
		}}
	/>
);

// ---------- спиральки эффекта зелья ----------
export const PotionSwirl: React.FC<{t: number; center: Vec3; color?: string; amount?: number; height?: number; radius?: number; count?: number; seed?: number}> = ({
	t,
	center,
	color = '#33ccff',
	amount = 1,
	height = 2,
	radius = 0.55,
	count = 22,
	seed = 3,
}) => (
	<Particles
		count={count}
		seed={seed}
		colors={[color, '#ffffff', color]}
		additive
		active={amount > 0.01}
		fn={(i, r, o) => {
			const phase = (t * (0.5 + r[0] * 0.4) + i / count + r[1]) % 1;
			const a = i * 2.399 + t * (2.4 + r[2]);
			const rad = radius * (0.7 + r[3] * 0.6) * (1 - phase * 0.3);
			o.x = center[0] + Math.cos(a) * rad;
			o.y = center[1] + phase * height;
			o.z = center[2] + Math.sin(a) * rad;
			o.rx = o.ry = t * 3 + i;
			o.s = (0.06 + r[4] * 0.07) * Math.sin(Math.PI * phase) * amount;
		}}
	/>
);

// ---------- фиолетовые частицы телепорта ----------
// mode 'out' — герой исчезает (частицы разлетаются), 'in' — появляется (слетаются к точке)
export const PortalParticles: React.FC<{t: number; at: number; origin: Vec3; mode?: 'in' | 'out'; count?: number; duration?: number; seed?: number}> = ({
	t,
	at,
	origin,
	mode = 'in',
	count = 48,
	duration = 0.9,
	seed = 5,
}) => (
	<Particles
		count={count}
		seed={seed}
		colors={['#b84dff', '#7a2fd6', '#e59bff', '#4a1a8a']}
		additive
		active={t >= at && t <= at + duration}
		fn={(_i, r, o) => {
			const tau = t - at - r[5] * duration * 0.35;
			const life = duration * (0.45 + r[4] * 0.2);
			const k = tau / life;
			if (tau <= 0 || k >= 1) return;
			const q = mode === 'in' ? 1 - k : k;
			const a = r[0] * Math.PI * 2;
			const y = r[1] * 2 - 0.1;
			const rad = (0.3 + r[2] * 1.9) * q * q;
			o.x = origin[0] + Math.cos(a + q * 2) * rad;
			o.y = origin[1] + y + (mode === 'in' ? q * 0.8 : q * 1.4) * (r[3] - 0.3);
			o.z = origin[2] + Math.sin(a + q * 2) * rad;
			o.rx = o.rz = tau * 5;
			o.s = (0.07 + r[6] * 0.09) * Math.sin(Math.PI * clamp01(k));
		}}
	/>
);
