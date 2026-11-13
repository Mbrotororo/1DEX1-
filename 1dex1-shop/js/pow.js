// Галочка «Я не робот»: браузер решает небольшую задачу — подбирает число, при котором
// отпечаток sha-256 строки «задача:число» начинается с нужного количества нулевых битов.
// Человеку это доля секунды, а боту, который регистрирует тысячи аккаунтов, — дорого.
// Свой быстрый sha-256 (строки латиницей и цифрами): встроенный в браузер работает через
// Promise и в таком переборе в разы медленнее. Начало строки одинаковое — его считаем один раз.

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Uint32Array(64);
const ror = (x, n) => (x >>> n) | (x << (32 - n));

// Один блок (16 слов из words, начиная с off) — меняет состояние st (8 чисел)
const compress = (st, words, off) => {
	for (let t = 0; t < 16; t++) W[t] = words[off + t];
	for (let t = 16; t < 64; t++) {
		const x = W[t - 15];
		const y = W[t - 2];
		W[t] = (W[t - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + W[t - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) | 0;
	}
	let [a, b, c, d, e, f, g, h] = st;
	for (let t = 0; t < 64; t++) {
		const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
		const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
		h = g;
		g = f;
		f = e;
		e = (d + t1) | 0;
		d = c;
		c = b;
		b = a;
		a = (t1 + t2) | 0;
	}
	st[0] = (st[0] + a) | 0;
	st[1] = (st[1] + b) | 0;
	st[2] = (st[2] + c) | 0;
	st[3] = (st[3] + d) | 0;
	st[4] = (st[4] + e) | 0;
	st[5] = (st[5] + f) | 0;
	st[6] = (st[6] + g) | 0;
	st[7] = (st[7] + h) | 0;
};
// Строка -> слова по 4 байта (только ASCII)
const toWords = (str, words) => {
	words.fill(0);
	for (let i = 0; i < str.length; i++) words[i >> 2] |= (str.charCodeAt(i) & 0xff) << (24 - (i & 3) * 8);
	return words;
};

// Хвост сообщения после уже посчитанного начала (done байт, состояние mid) -> первые 32 бита отпечатка
const TAIL = new Uint32Array(32);
const ST = new Int32Array(8);
const finish = (mid, done, tail) => {
	const len = tail.length;
	const blocks = ((len + 8) >> 6) + 1;
	toWords(tail, TAIL);
	TAIL[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
	TAIL[blocks * 16 - 1] = (done + len) * 8;
	ST.set(mid);
	for (let b = 0; b < blocks; b++) compress(ST, TAIL, b * 16);
	return ST[0] >>> 0;
};
// Начало строки (целые блоки по 64 байта) -> {mid, done, rest}
const prepare = (str) => {
	const done = str.length - (str.length % 64);
	const mid = new Int32Array(INIT);
	const block = new Uint32Array(16);
	for (let i = 0; i < done; i += 64) compress(mid, toWords(str.slice(i, i + 64), block), 0);
	return {mid, done, rest: str.slice(done)};
};

// Первые 32 бита sha-256 от строки (для проверки)
export const sha256Head = (str) => {
	const {mid, done, rest} = prepare(str);
	return finish(mid, done, rest);
};

// Подобрать число для задачи. Считает кусочками, чтобы страница не подвисала.
export const solve = async (challenge, bits, signal) => {
	const {mid, done, rest} = prepare(`${challenge}:`);
	const shift = 32 - bits;
	for (let nonce = 0; ; ) {
		for (let i = 0; i < 4000; i++, nonce++) if (finish(mid, done, rest + nonce) >>> shift === 0) return String(nonce);
		if (signal?.aborted) throw new Error('aborted');
		await new Promise((r) => setTimeout(r));
	}
};
