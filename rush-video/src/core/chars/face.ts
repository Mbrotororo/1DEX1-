import type * as THREE from 'three';
import {clamp, clamp01, lerp} from '../anim';
import {hash1} from '../rng';
import {dataTexture} from '../textures';
import type {Skin} from './skins';

// Мимика героя. Передняя грань головы рисуется в свою текстуру 32x32: лицо скина, увеличенное
// в 4 раза (без сглаживания), плюс пиксельные накладки с шагом 1/4 пикселя скина — веки, белки,
// зрачки, рот. Раскладка лица — под скин 1DEX1: глаза в строке 5 (x = 1,2 и 5,6) под чёлкой,
// светлая строка 6, рот — строка 7. Чёлка (второй слой) рисуется поверх как обычно; при шоке
// в ней прорезаются «окна» над распахнутыми глазами.

export type FaceState = {
	// усталость: тяжёлые полуприкрытые веки (уголки вниз), мешки под глазами
	tired: number;
	// шок: глаза — белые прямоугольники с маленькими зрачками (залезают под чёлку), рот «О»
	shock: number;
	// радость: глаза «^^», улыбка, румянец (от 0.5 — глаза-дуги)
	joy: number;
	// решимость: прищур, внутренние уголки ниже, рот — короткая черта
	focus: number;
	// моргание: 1 — глаза закрыты
	blink: number;
	// открытый рот 0..1 (вздох, речь); при шоке открывается сам
	mouth: number;
	// взгляд −1..1: lookX > 0 — к левому плечу героя (+x персонажа), lookY > 0 — вверх
	lookX: number;
	lookY: number;
};

export const FACE_NEUTRAL: FaceState = {tired: 0, shock: 0, joy: 0, focus: 0, blink: 0, mouth: 0, lookX: 0, lookY: 0};

const full = (f: Partial<FaceState>): FaceState => ({...FACE_NEUTRAL, ...f});

// Смешать два выражения (k: 0 → a, 1 → b)
export const mixFace = (a: Partial<FaceState>, b: Partial<FaceState>, k: number): FaceState => {
	const A = full(a);
	const B = full(b);
	const q = clamp01(k);
	const out = {...A};
	for (const key of Object.keys(A) as (keyof FaceState)[]) out[key] = lerp(A[key], B[key], q);
	return out;
};

// Кривая одного моргания: 0 → 1 (закрыты) → 0 за dur секунд с началом в at
export const blinkAt = (t: number, at: number, dur = 0.16): number => {
	const q = (t - at) / dur;
	if (q <= 0 || q >= 1) return 0;
	// закрывается быстрее, чем открывается
	return q < 0.4 ? q / 0.4 : 1 - (q - 0.4) / 0.6;
};

// Сам моргает примерно раз в period секунд (детерминированно, seed — свой у каждого героя)
export const autoBlink = (t: number, seed = 1, period = 3.2, dur = 0.16): number => {
	const i = Math.floor(t / period);
	let v = 0;
	for (const n of [i - 1, i]) {
		const at = n * period + (0.15 + hash1(n, seed) * 0.6) * period;
		v = Math.max(v, blinkAt(t, at, dur));
	}
	return v;
};

// ---------- геометрия выражения (всё в субпикселях: 4 на пиксель скина) ----------

const R = 4;
const N = 8 * R;
// раскладка лица героя (пиксели скина на передней грани головы)
const EYE_ROW = 5;
const EYE_X = [1, 2]; // левый (по кадру) глаз; правый — зеркально: 5, 6
const SKIN_PX: [number, number] = [3, 5];

type Geo = {
	mode: number; // 0 — тёмные глаза скина, 1 — белые (шок), 2 — дуги «^^»
	x0: number; // глаз в «u»: от внешнего края (u мал) к внутреннему; левый глаз: столбец = u
	x1: number;
	y0: number;
	y1: number;
	lid: number; // нижний край верхнего века (строка; = y0 — века не видно)
	shO: number; // глаз скошен: сдвиг вниз у внешнего / внутреннего уголка (строки)
	shI: number;
	low: number; // нижнее веко поднято на столько строк (прищур)
	lx: number; // сдвиг взгляда, субпиксели
	ly: number;
	pupil: number;
	bags: number; // 0..3 — сила мешков
	blush: number;
	mouth: number; // 0 нет, 1 «О», 2 улыбка, 3 черта, 4 открытая улыбка
	mw: number;
	mh: number;
};

const geoOf = (f: FaceState): Geo => {
	const s = clamp01(f.shock);
	const tr = clamp01(f.tired);
	const j = clamp01(f.joy);
	const fo = clamp01(f.focus);
	const b = clamp01(f.blink);
	const m = clamp01(f.mouth);
	const caret = j >= 0.5 && s < 0.3;
	const white = !caret && s >= 0.3;
	const mode = caret ? 2 : white ? 1 : 0;
	// шок раздувает глаз: шире и выше (под чёлку), вытянутый прямоугольник ~11x7 субпикселей
	const x0 = 4 - Math.round(s * 2);
	const x1 = 12 + Math.round(s * 1.2);
	const y0 = 20 - Math.round(s * 2.4);
	const y1 = 24 + Math.round(s * 1.2);
	// веки: усталость и прищур закрывают, шок открывает, моргание закрывает до конца
	let close = clamp01(tr * 0.62 + fo * 0.3 - s * 0.6);
	close += (1 - close) * b;
	const lid = Math.round(y0 + close * (y1 - y0));
	const open = 1 - b;
	// скос: усталость опускает внешние уголки, решимость — внутренние
	const shO = Math.round(tr * 1.2 * open);
	const shI = Math.round(fo * 2.2 * open);
	const low = Math.round(fo * 1.2 * open);
	// взгляд: тёмный глаз сдвигается целиком, у белого бегает зрачок
	const lx = Math.round(clamp(f.lookX, -1, 1) * 3);
	const ly = Math.round(-clamp(f.lookY, -1, 1) * 2);
	const pupil = s > 0.75 ? 2 : 3;
	const bags = Math.round(clamp01((tr - 0.25) / 0.75) * 3);
	const blush = j >= 0.45 ? Math.round(clamp01((j - 0.45) / 0.55) * 2) + 1 : 0;
	// рот
	const mo = Math.max(m, white ? 0.4 + 0.6 * s : 0);
	let mouth = 0;
	let mw = 0;
	let mh = 0;
	if (j >= 0.4 && !white) mouth = mo >= 0.3 ? 4 : 2;
	else if (mo >= 0.12) {
		mouth = 1;
		mw = mo >= 0.6 ? 6 : 4;
		mh = 1 + Math.round(mo * 3);
	} else if (fo >= 0.4) mouth = 3;
	return {mode, x0, x1, y0, y1, lid, shO, shI, low, lx, ly, pupil, bags, blush, mouth, mw, mh};
};

const keyOf = (g: Geo) => `${g.mode},${g.x0},${g.x1},${g.y0},${g.y1},${g.lid},${g.shO},${g.shI},${g.low},${g.lx},${g.ly},${g.pupil},${g.bags},${g.blush},${g.mouth},${g.mw},${g.mh}`;

// ---------- пиксели скина ----------

type Rgba = [number, number, number, number];
const pixCache = new WeakMap<THREE.Texture, Uint8ClampedArray>();

// RGBA скина 64x64, строка 0 — верх
const skinPixels = (map: THREE.Texture): Uint8ClampedArray | null => {
	const hit = pixCache.get(map);
	if (hit) return hit;
	const img = map.image as {data?: ArrayLike<number>; width: number; height: number} | CanvasImageSource | undefined;
	if (!img) return null;
	const w = (img as {width: number}).width;
	const h = (img as {height: number}).height;
	if (w !== 64 || h !== 64) return null;
	let px: Uint8ClampedArray;
	const data = (img as {data?: ArrayLike<number>}).data;
	if (data) {
		// DataTexture ядра хранит строки снизу вверх
		px = new Uint8ClampedArray(w * h * 4);
		for (let y = 0; y < h; y++) for (let i = 0; i < w * 4; i++) px[y * w * 4 + i] = data[(h - 1 - y) * w * 4 + i];
	} else {
		if (typeof document === 'undefined') return null;
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const ctx = c.getContext('2d', {willReadFrequently: true});
		if (!ctx) return null;
		ctx.drawImage(img as CanvasImageSource, 0, 0);
		px = ctx.getImageData(0, 0, w, h).data;
	}
	pixCache.set(map, px);
	return px;
};

const at = (px: Uint8ClampedArray, x: number, y: number): Rgba => {
	const i = (y * 64 + x) * 4;
	return [px[i], px[i + 1], px[i + 2], px[i + 3]];
};
const mix = (a: Rgba, b: number[], k: number): Rgba => [
	Math.round(a[0] + (b[0] - a[0]) * k),
	Math.round(a[1] + (b[1] - a[1]) * k),
	Math.round(a[2] + (b[2] - a[2]) * k),
	a[3],
];
const mul = (a: Rgba, f: number): Rgba => [Math.round(a[0] * f), Math.round(a[1] * f), Math.round(a[2] * f), a[3]];

// белок чуть холоднее белого: в тёплом свете интерьера остаётся белым, а не кремовым
const WHITE: Rgba = [236, 242, 255, 255];
const PUPIL: Rgba = [14, 10, 10, 255];
const LASH: Rgba = [30, 18, 18, 255];
const MOUTH: Rgba = [40, 16, 16, 255];
const MOUTH_IN: Rgba = [118, 40, 44, 255];
const TEETH: Rgba = [240, 236, 228, 255];
const BAG = [96, 62, 84];
const BLUSH = [238, 104, 118];

// ---------- рисование ----------

// glow — маска свечения белков (шок): белки читаются белыми и в тёплом тёмном свете
type Painted = {face: Uint8Array; hat: Uint8Array | null; glow: Uint8Array | null};

const paint = (px: Uint8ClampedArray, g: Geo): Painted => {
	const face = new Uint8Array(N * N * 4);
	const glow = g.mode === 1 ? new Uint8Array(N * N * 4) : null;
	const put = (x: number, y: number, c: Rgba) => {
		if (x < 0 || y < 0 || x >= N || y >= N) return;
		const i = (y * N + x) * 4;
		face[i] = c[0];
		face[i + 1] = c[1];
		face[i + 2] = c[2];
		face[i + 3] = 255;
		if (glow) {
			const w = c === WHITE ? 255 : 0;
			glow[i] = w;
			glow[i + 1] = w;
			glow[i + 2] = w;
			glow[i + 3] = 255;
		}
	};
	const get = (x: number, y: number): Rgba => {
		const i = (y * N + x) * 4;
		return [face[i], face[i + 1], face[i + 2], 255];
	};
	const skin = at(px, 8 + SKIN_PX[0], 8 + SKIN_PX[1]);
	const eyeOut = at(px, 8 + EYE_X[0], 8 + EYE_ROW);
	const eyeIn = at(px, 8 + EYE_X[1], 8 + EYE_ROW);
	// лицо скина x4, глаза стёрты цветом кожи
	for (let y = 0; y < N; y++) {
		for (let x = 0; x < N; x++) {
			const sx = x >> 2;
			const sy = y >> 2;
			const eye = sy === EYE_ROW && (sx === EYE_X[0] || sx === EYE_X[1] || sx === 7 - EYE_X[0] || sx === 7 - EYE_X[1]);
			put(x, y, eye ? skin : at(px, 8 + sx, 8 + sy));
		}
	}
	const lid = mul(skin, 0.86);
	// столбец текстуры для u глаза: левый глаз — как есть, правый — зеркально; плюс взгляд
	const colOf = (u: number, right: boolean, shift: number) => (right ? N - 1 - u : u) + shift;

	for (const right of [false, true]) {
		const shiftX = g.mode === 1 ? 0 : g.mode === 2 ? Math.round(g.lx / 2) : g.lx;
		const shiftY = g.mode === 1 ? 0 : g.ly;
		const w = g.x1 - g.x0;
		// скос столбца глаза (строки вниз)
		const shear = (u: number) => Math.round(lerp(g.shO, g.shI, w > 1 ? (u - g.x0) / (w - 1) : 0));
		// мешки под глазами (под нижним краем глаза)
		if (g.bags > 0) {
			for (let u = g.x0 + 1; u < g.x1 - 1; u++) {
				const x = colOf(u, right, shiftX);
				const y = g.y1 + shiftY + shear(u);
				put(x, y, mix(get(x, y), BAG, 0.18 * g.bags));
				put(x, y + 1, mix(get(x, y + 1), BAG, 0.07 * g.bags));
			}
		}
		if (g.mode === 2) {
			// глаза-дуги «^^»
			const rows: number[][] = [
				[2, 3, 4, 5],
				[1, 2, 5, 6],
				[0, 1, 6, 7],
			];
			const c0 = g.x0 + Math.floor((w - 8) / 2);
			rows.forEach((cols, r) => cols.forEach((du) => put(colOf(c0 + du, right, shiftX), 21 + r + shiftY, LASH)));
			continue;
		}
		const bottom = g.y1 - g.low;
		for (let u = g.x0; u < g.x1; u++) {
			const lidY = g.lid;
			const x = colOf(u, right, shiftX);
			const sh = shear(u);
			// над скошенным глазом — кожа (веко)
			for (let row = g.y0; row < g.y0 + sh; row++) put(x, row + shiftY, lid);
			for (let row = g.y0; row < bottom; row++) {
				const y = row + shiftY + sh;
				let c: Rgba;
				if (lidY > g.y0 && row < lidY - 1) c = lid;
				else if (lidY > g.y0 && row === lidY - 1) c = LASH;
				else if (g.mode === 1) c = WHITE;
				else c = u >= g.x1 - 4 ? eyeIn : eyeOut;
				put(x, y, c);
			}
			// закрытый глаз — ресницы по нижнему краю
			if (lidY >= bottom) put(x, bottom - 1 + shiftY + sh, LASH);
			// под белым глазом — тень нижнего века (белок не сливается с бледной кожей)
			else if (g.mode === 1) {
				const y = bottom + shiftY + sh;
				put(x, y, mul(get(x, y), 0.62));
			}
		}
		if (g.mode === 1) {
			// зрачок: по центру белка + взгляд, не вылезает за белок
			const c0 = colOf(g.x0, right, 0);
			const c1 = colOf(g.x1 - 1, right, 0);
			const left = Math.min(c0, c1) + 1;
			const rightEdge = Math.max(c0, c1) - 1;
			const top = Math.max(g.y0, g.lid);
			const bot = bottom - 2;
			const p = g.pupil;
			if (bot - top + 1 >= p) {
				const cx = Math.round((left + rightEdge + 1) / 2 - p / 2 + g.lx);
				const cy = Math.round((top + bot + 1) / 2 - p / 2 + g.ly);
				const px0 = clamp(cx, left, rightEdge - p + 1);
				const py0 = clamp(cy, top, bot - p + 1);
				for (let dy = 0; dy < p; dy++) for (let dx = 0; dx < p; dx++) put(px0 + dx, py0 + dy, PUPIL);
			}
		}
	}
	// румянец
	if (g.blush > 0) {
		for (const x0 of [1, N - 5]) {
			for (let x = x0; x < x0 + 4; x++) {
				put(x, 25, mix(get(x, 25), BLUSH, 0.22 * g.blush));
				put(x, 26, mix(get(x, 26), BLUSH, 0.16 * g.blush));
			}
		}
	}
	// рот (центр — между столбцами 15 и 16)
	if (g.mouth === 1) {
		const top = g.mh >= 3 ? 27 : 28;
		const x0 = 16 - g.mw / 2;
		for (let y = top; y < top + g.mh; y++) {
			for (let x = x0; x < x0 + g.mw; x++) {
				const edge = x === x0 || x === x0 + g.mw - 1 || y === top || y === top + g.mh - 1;
				// уголки «О» скруглены
				const corner = (x === x0 || x === x0 + g.mw - 1) && (y === top || y === top + g.mh - 1) && g.mh >= 3;
				if (corner) continue;
				put(x, y, edge || g.mh < 3 ? MOUTH : MOUTH_IN);
			}
		}
	} else if (g.mouth === 2) {
		put(12, 28, MOUTH);
		put(19, 28, MOUTH);
		for (let x = 13; x <= 18; x++) put(x, 29, MOUTH);
	} else if (g.mouth === 3) {
		for (let x = 13; x <= 18; x++) put(x, 29, MOUTH);
	} else if (g.mouth === 4) {
		for (let x = 12; x <= 19; x++) put(x, 27, MOUTH);
		for (let x = 12; x <= 19; x++) put(x, 28, x === 12 || x === 19 ? MOUTH : TEETH);
		for (let x = 12; x <= 19; x++) put(x, 29, x === 12 || x === 19 ? MOUTH : MOUTH_IN);
		for (let x = 13; x <= 18; x++) put(x, 30, MOUTH);
	}

	// чёлка: «окна» над белыми глазами, если они залезли под второй слой
	let hat: Uint8Array | null = null;
	if (g.mode === 1 && g.y0 < 21) {
		hat = new Uint8Array(N * N * 4);
		for (let hy = 0; hy < N; hy++) {
			for (let hx = 0; hx < N; hx++) {
				const c = at(px, 40 + (hx >> 2), 8 + (hy >> 2));
				// центр субпикселя чёлки в координатах лица (чёлка шире лица: 9 пикселей на 8)
				const fx = (((hx + 0.5) / R) * 1.125 - 0.5) * R;
				const fy = (((hy + 0.5) / R) * 1.125 - 0.5) * R;
				let cut = false;
				for (const right of [false, true]) {
					const a = right ? N - g.x1 : g.x0;
					const b = right ? N - g.x0 : g.x1;
					if (fx >= a && fx < b && fy >= g.y0 && fy < g.y1) cut = true;
				}
				const i = (hy * N + hx) * 4;
				hat[i] = c[0];
				hat[i + 1] = c[1];
				hat[i + 2] = c[2];
				hat[i + 3] = cut ? 0 : c[3];
			}
		}
	}
	return {face, hat, glow};
};

// ---------- кэш текстур ----------

// face — передняя грань головы, hat — чёлка с «окнами» (или null), glow — маска свечения белков (или null)
export type FaceTextures = {face: THREE.Texture; hat: THREE.Texture | null; glow: THREE.Texture | null};
const cache = new Map<string, FaceTextures>();
const MAX_CACHED = 48;

const toTexture = (data: Uint8Array, u0: number): THREE.Texture => {
	const tex = dataTexture(data, N, N, true);
	// UV грани в атласе скина 64x64 → вся текстура 32x32
	tex.repeat.set(8, 8);
	tex.offset.set(-u0 / 8, -6);
	return tex;
};

// Текстуры лица (и чёлки, если в ней прорезаны окна) для выражения. Выражение квантуется
// до субпикселей, одинаковые картинки берутся из кэша (последние 48, лишние освобождаются).
export const faceTextures = (skin: Skin, state: Partial<FaceState>): FaceTextures | null => {
	const px = skinPixels(skin.map);
	if (!px) return null;
	const g = geoOf(full(state));
	const key = `${skin.map.uuid}|${keyOf(g)}`;
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const p = paint(px, g);
	const made: FaceTextures = {face: toTexture(p.face, 8), hat: p.hat ? toTexture(p.hat, 40) : null, glow: p.glow ? toTexture(p.glow, 8) : null};
	cache.set(key, made);
	while (cache.size > MAX_CACHED) {
		const oldest = cache.keys().next().value as string;
		const old = cache.get(oldest);
		cache.delete(oldest);
		old?.face.dispose();
		old?.hat?.dispose();
		old?.glow?.dispose();
	}
	return made;
};
