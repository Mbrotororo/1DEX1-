import {angleDelta, spline, type Vec3} from '../anim';

// Движение персонажа по ключевым точкам. ЧИСТЫЙ модуль.
// Положение идёт по плавному сплайну, направление берётся из скорости,
// а фаза шагов — из пройденного расстояния, чтобы ноги не «скользили».

export type PathKey = {
	t: number;
	pos: Vec3;
};

export type PathState = {
	position: Vec3;
	// куда смотрит (rotationY для персонажа), радианы; на стоянке — последнее направление движения
	heading: number;
	// скорость, блоков в секунду (в плоскости xz)
	speed: number;
	// пройденный путь с начала, блоки
	distance: number;
	// фаза шага для walk()/run(): distance * π / stride
	phase: number;
	// 0..1: движется ли (плавно) — удобно смешивать walk и idle
	moving: number;
};

export type Path = {
	at: (t: number) => PathState;
	start: number;
	end: number;
};

// keys — точки маршрута по времени. opts.stride — длина шага в блоках
// (ходьба ≈ 0.95, бег ≈ 1.5, спринт ≈ 2.2); opts.linear — ломаная без сглаживания.
export const makePath = (keys: PathKey[], opts: {stride?: number; linear?: boolean} = {}): Path => {
	if (keys.length === 0) throw new Error('makePath: нужен хотя бы один ключ');
	const sorted = [...keys].sort((a, b) => a.t - b.t);
	const stride = opts.stride ?? 0.95;
	const start = sorted[0].t;
	const end = sorted[sorted.length - 1].t;
	const ch = (i: number) => sorted.map((k) => [k.t, k.pos[i]] as [number, number]);
	const xs = ch(0);
	const ys = ch(1);
	const zs = ch(2);
	const lin = (t: number, c: [number, number][]) => {
		if (t <= c[0][0]) return c[0][1];
		for (let i = 1; i < c.length; i++) {
			if (t <= c[i][0]) return c[i - 1][1] + ((c[i][1] - c[i - 1][1]) * (t - c[i - 1][0])) / (c[i][0] - c[i - 1][0]);
		}
		return c[c.length - 1][1];
	};
	const sample = opts.linear ? lin : spline;
	const posAt = (t: number): Vec3 => [sample(t, xs), sample(t, ys), sample(t, zs)];

	// таблица с шагом 1/60 с: пройденный путь и направление
	const DT = 1 / 60;
	const n = Math.max(2, Math.ceil((end - start) / DT) + 1);
	const dist = new Float32Array(n);
	const head = new Float32Array(n);
	const spd = new Float32Array(n);
	let prev = posAt(start);
	let lastHeading = NaN;
	for (let i = 0; i < n; i++) {
		const t = start + i * DT;
		const p = posAt(t);
		const step = Math.hypot(p[0] - prev[0], p[2] - prev[2]);
		dist[i] = (i > 0 ? dist[i - 1] : 0) + step;
		// направление — по отрезку ±2 шага вокруг момента
		const a = posAt(t - DT * 2);
		const b = posAt(t + DT * 2);
		const vx = b[0] - a[0];
		const vz = b[2] - a[2];
		const v = Math.hypot(vx, vz) / (DT * 4);
		spd[i] = v;
		if (v > 0.25) {
			const h = Math.atan2(vx, vz);
			// разворачиваем угол, чтобы не было скачка через ±π
			lastHeading = Number.isNaN(lastHeading) ? h : lastHeading + angleDelta(lastHeading, h);
		}
		head[i] = lastHeading;
		prev = p;
	}
	// до первого движения — направление первого движения
	let first = 0;
	while (first < n && Number.isNaN(head[first])) first++;
	const firstHeading = first < n ? head[first] : 0;
	for (let i = 0; i < first; i++) head[i] = firstHeading;

	const table = (arr: Float32Array, t: number) => {
		const f = Math.min(n - 1, Math.max(0, (t - start) / DT));
		const i = Math.min(n - 2, Math.floor(f));
		return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
	};
	// сглаженное значение: среднее по окну
	const smoothed = (arr: Float32Array, t: number, win: number) => {
		let s = 0;
		const K = 5;
		for (let j = 0; j < K; j++) s += table(arr, t + ((j / (K - 1)) * 2 - 1) * win);
		return s / K;
	};

	return {
		start,
		end,
		at: (t: number) => {
			const position = posAt(t);
			const distance = table(dist, t);
			const speed = smoothed(spd, t, 0.06);
			return {
				position,
				heading: smoothed(head, t, 0.1),
				speed,
				distance,
				phase: (distance * Math.PI) / stride,
				moving: Math.min(1, speed / 1.2),
			};
		},
	};
};
