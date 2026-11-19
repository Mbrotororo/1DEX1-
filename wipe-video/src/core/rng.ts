// Детерминированный генератор случайных чисел: каждый кадр должен
// рендериться одинаково, поэтому Math.random() нигде не используется.
export const mulberry32 = (seed: number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

// Хэш целочисленных координат -> [0, 1)
export const hash3 = (x: number, y: number, z: number, seed = 0): number => {
	let h =
		(Math.imul(x | 0, 374761393) +
			Math.imul(y | 0, 668265263) +
			Math.imul(z | 0, 2147483647) +
			Math.imul(seed | 0, 1274126177)) |
		0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
};

// Хэш одного целого -> [0, 1)
export const hash1 = (i: number, seed = 0) => hash3(i, 0, 0, seed);

// Случайное число из диапазона по хэшу
export const hashRange = (a: number, b: number, i: number, seed = 0) => a + (b - a) * hash3(i, 1, 2, seed);

const fade = (f: number) => f * f * (3 - 2 * f);

// Плавный шум от времени (-1..1): для тряски камеры, покачиваний, мерцания
export const noise1 = (t: number, seed = 0) => {
	const i = Math.floor(t);
	const f = t - i;
	const a = hash3(i, seed, 0, 77) * 2 - 1;
	const b = hash3(i + 1, seed, 0, 77) * 2 - 1;
	return a + (b - a) * fade(f);
};

// Плавный 2D-шум (0..1) для карт высот и пятен
export const noise2 = (x: number, y: number, seed = 0) => {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const fx = fade(x - xi);
	const fy = fade(y - yi);
	const a = hash3(xi, yi, 0, seed);
	const b = hash3(xi + 1, yi, 0, seed);
	const c = hash3(xi, yi + 1, 0, seed);
	const d = hash3(xi + 1, yi + 1, 0, seed);
	return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

// Плавный 3D-шум (0..1)
export const noise3 = (x: number, y: number, z: number, seed = 0) => {
	const zi = Math.floor(z);
	const fz = fade(z - zi);
	const a = noise2(x + zi * 37.7, y + zi * 17.3, seed);
	const b = noise2(x + (zi + 1) * 37.7, y + (zi + 1) * 17.3, seed);
	return a + (b - a) * fz;
};

// Фрактальный шум (0..1): несколько октав noise2
export const fbm2 = (x: number, y: number, octaves = 4, seed = 0, gain = 0.5, lacunarity = 2) => {
	let sum = 0;
	let amp = 1;
	let norm = 0;
	let fx = x;
	let fy = y;
	for (let o = 0; o < octaves; o++) {
		sum += noise2(fx, fy, seed + o * 101) * amp;
		norm += amp;
		amp *= gain;
		fx *= lacunarity;
		fy *= lacunarity;
	}
	return sum / norm;
};
