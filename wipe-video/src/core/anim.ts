// Маленькие помощники для анимации. Всё считается от времени в секундах.
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
// обратная интерполяция: где v между a и b (0..1, с обрезкой)
export const invLerp = (a: number, b: number, v: number) => (a === b ? (v >= b ? 1 : 0) : clamp01((v - a) / (b - a)));
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, v));

export const smooth = (x: number) => {
	const k = clamp01(x);
	return k * k * (3 - 2 * k);
};
export const smoother = (x: number) => {
	const k = clamp01(x);
	return k * k * k * (k * (k * 6 - 15) + 10);
};
export const linear = (x: number) => clamp01(x);
export const easeInQuad = (x: number) => clamp01(x) ** 2;
export const easeOutQuad = (x: number) => 1 - (1 - clamp01(x)) ** 2;
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInCubic = (x: number) => Math.pow(clamp01(x), 3);
export const easeInOutCubic = (x: number) => {
	const k = clamp01(x);
	return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
export const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x)));
export const easeInBack = (x: number, overshoot = 1.70158) => {
	const k = clamp01(x);
	return (overshoot + 1) * k * k * k - overshoot * k * k;
};
export const easeOutBack = (x: number, overshoot = 1.70158) => {
	const k = clamp01(x) - 1;
	return 1 + (overshoot + 1) * k * k * k + overshoot * k * k;
};
export const easeOutElastic = (x: number) => {
	const k = clamp01(x);
	if (k === 0 || k === 1) return k;
	return Math.pow(2, -10 * k) * Math.sin(((k * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
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

// «Окно»: 0 → 1 за fadeIn после start, держится, 1 → 0 за fadeOut перед end
export const pulse = (t: number, start: number, end: number, fadeIn = 0.2, fadeOut = fadeIn) =>
	smooth(prog(t, start, fadeIn)) * (1 - smooth(prog(t, end - fadeOut, fadeOut)));

// Затухающий «удар»: 1 в момент at, далее exp(-rate * dt); до at — 0
export const impulse = (t: number, at: number, rate = 6) => (t < at ? 0 : Math.exp(-(t - at) * rate));

// Затухающая пружина: 0 до at, колеблется вокруг 0 после (для отдачи/подпрыгивания)
export const spring = (t: number, at: number, freq = 18, damp = 8) =>
	t < at ? 0 : Math.exp(-(t - at) * damp) * Math.cos((t - at) * freq);

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
	if (n === 1 || t <= keys[0][0]) return keys[0][1];
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
	return (2 * k3 - 3 * k2 + 1) * v0 + (k3 - 2 * k2 + k) * m0 + (-2 * k3 + 3 * k2) * v1 + (k3 - k2) * m1;
};

// Кратчайшая разница углов (радианы) и интерполяция угла
export const angleDelta = (a: number, b: number) => {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
};
export const lerpAngle = (a: number, b: number, k: number) => a + angleDelta(a, b) * k;

export const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];
export const v3lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const v3add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const v3sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const v3scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const v3len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const v3dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Цвета: '#rrggbb' <-> [r, g, b] 0..1 (в sRGB, как пишутся в CSS)
export type RGB = [number, number, number];
export const hexToRgb = (hex: string): RGB => {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const rgbToHex = (c: RGB) =>
	'#' +
	c
		.map((v) =>
			Math.round(clamp01(v) * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('');
// Смешать два цвета '#rrggbb' (в sRGB — как на глаз в CSS)
export const mixHex = (a: string, b: string, k: number) => {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	return rgbToHex([lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)]);
};
