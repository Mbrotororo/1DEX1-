// Маленькие помощники для анимации. Всё считается от времени в секундах.
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const smooth = (x: number) => {
	const k = clamp01(x);
	return k * k * (3 - 2 * k);
};
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInCubic = (x: number) => Math.pow(clamp01(x), 3);
export const easeInOutCubic = (x: number) => {
	const k = clamp01(x);
	return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
export const easeOutBack = (x: number, overshoot = 1.70158) => {
	const k = clamp01(x) - 1;
	return 1 + (overshoot + 1) * k * k * k + overshoot * k * k;
};
export const easeOutBounce = (x: number) => {
	let k = clamp01(x);
	const n = 7.5625;
	const d = 2.75;
	if (k < 1 / d) return n * k * k;
	if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
	if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
	return n * (k -= 2.625 / d) * k + 0.984375;
};

// Прогресс 0..1 начиная с момента start за длительность dur
export const prog = (t: number, start: number, dur: number) => clamp01((t - start) / dur);

export type Ease = (x: number) => number;
export type Key = [time: number, value: number, ease?: Ease];

// Кусочная анимация по ключам: ease относится к отрезку, который
// заканчивается в этом ключе.
export const track = (t: number, keys: Key[]): number => {
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) {
		const [t1, v1, ease] = keys[i];
		if (t <= t1) {
			const [t0, v0] = keys[i - 1];
			const k = (t - t0) / (t1 - t0);
			return lerp(v0, v1, (ease ?? smooth)(k));
		}
	}
	return keys[keys.length - 1][1];
};

// Плавный монотонный сплайн по ключам (для камеры): без рывков и перелётов
export const spline = (t: number, keys: [number, number][]): number => {
	const n = keys.length;
	if (t <= keys[0][0]) return keys[0][1];
	if (t >= keys[n - 1][0]) return keys[n - 1][1];
	let i = 0;
	while (i < n - 2 && t > keys[i + 1][0]) i++;
	const slope = (j: number) => (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0]);
	const tangent = (j: number) => {
		if (j === 0 || j === n - 1) return 0;
		const a = slope(j - 1);
		const b = slope(j);
		if (a * b <= 0) return 0;
		const m = (a + b) / 2;
		const lim = 3 * Math.min(Math.abs(a), Math.abs(b));
		return Math.sign(m) * Math.min(Math.abs(m), lim);
	};
	const [t0, v0] = keys[i];
	const [t1, v1] = keys[i + 1];
	const h = t1 - t0;
	const k = (t - t0) / h;
	const m0 = tangent(i) * h;
	const m1 = tangent(i + 1) * h;
	const k2 = k * k;
	const k3 = k2 * k;
	return (
		(2 * k3 - 3 * k2 + 1) * v0 +
		(k3 - 2 * k2 + k) * m0 +
		(-2 * k3 + 3 * k2) * v1 +
		(k3 - k2) * m1
	);
};
