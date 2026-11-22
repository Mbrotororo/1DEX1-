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
