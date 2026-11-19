import * as THREE from 'three';
import {layoutText} from '../core/hud/font';
import {hash3} from '../core/rng';

// Набор для блочного реквизита: модели из коробок (одна слитая геометрия с цветами вершин),
// общие материалы, текстуры с пиксельным текстом. Единица модели — пиксель (1/16 блока), если не сказано иное.

export const P16 = 1 / 16;

// Коробка: [x0, y0, z0, x1, y1, z1, цвет] — углы в пикселях; 8-й элемент — разброс яркости 0..1 (фактура)
export type Bx = [number, number, number, number, number, number, string, number?];

const tmpC = new THREE.Color();

// Грани коробки: нормаль и 4 вершины (против часовой снаружи)
const FACES: {n: [number, number, number]; v: [number, number, number][]}[] = [
	{n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]},
	{n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]},
	{n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]},
	{n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]},
	{n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]},
	{n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]},
];

// Слить коробки в одну геометрию (позиции в пикселях * unit). Цвет — в атрибуте color (линейный).
export const boxGeometry = (boxes: Bx[], unit = P16, seed = 0): THREE.BufferGeometry => {
	const n = boxes.length * 24;
	const pos = new Float32Array(n * 3);
	const nor = new Float32Array(n * 3);
	const col = new Float32Array(n * 3);
	const idx: number[] = [];
	let v = 0;
	boxes.forEach((b, bi) => {
		const [x0, y0, z0, x1, y1, z1, c, jit = 0] = b;
		tmpC.set(c);
		const k = jit > 0 ? 1 - jit / 2 + hash3(bi, Math.round(x0 * 7), Math.round(z0 * 5), seed) * jit : 1;
		for (const f of FACES) {
			const base = v;
			for (const p of f.v) {
				pos[v * 3] = (p[0] ? x1 : x0) * unit;
				pos[v * 3 + 1] = (p[1] ? y1 : y0) * unit;
				pos[v * 3 + 2] = (p[2] ? z1 : z0) * unit;
				nor[v * 3] = f.n[0];
				nor[v * 3 + 1] = f.n[1];
				nor[v * 3 + 2] = f.n[2];
				col[v * 3] = tmpC.r * k;
				col[v * 3 + 1] = tmpC.g * k;
				col[v * 3 + 2] = tmpC.b * k;
				v++;
			}
			idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
		}
	});
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	geo.setIndex(idx);
	geo.computeBoundingSphere();
	return geo;
};

// Кэш геометрий по ключу (модель строится один раз на вкладку)
const geoCache = new Map<string, THREE.BufferGeometry>();
export const cachedGeo = (key: string, make: () => THREE.BufferGeometry) => {
	let g = geoCache.get(key);
	if (!g) {
		g = make();
		geoCache.set(key, g);
	}
	return g;
};

// Общие материалы: освещаемый с цветами вершин и «светящийся» (не зависит от света)
let vcLambert: THREE.MeshLambertMaterial | null = null;
export const vcMat = () => (vcLambert ??= new THREE.MeshLambertMaterial({vertexColors: true}));
let vcBasic: THREE.MeshBasicMaterial | null = null;
export const vcGlowMat = () => (vcBasic ??= new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}));

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();
export const lambert = (color: string) => {
	let m = lambertCache.get(color);
	if (!m) {
		m = new THREE.MeshLambertMaterial({color});
		lambertCache.set(color, m);
	}
	return m;
};

// Цвет по тону (0..1) — для RGB-подсветки
export const hueColor = (h: number, s = 1, l = 0.55, out = new THREE.Color()) => out.setHSL(((h % 1) + 1) % 1, s, l);

// Перекрасить цвета вершин геометрии: fn(номер коробки) -> цвет THREE.Color или null (не трогать)
export const recolorBoxes = (geo: THREE.BufferGeometry, count: number, fn: (i: number, out: THREE.Color) => boolean) => {
	const attr = geo.getAttribute('color') as THREE.BufferAttribute;
	const arr = attr.array as Float32Array;
	const c = new THREE.Color();
	for (let i = 0; i < count; i++) {
		if (!fn(i, c)) continue;
		for (let k = 0; k < 24; k++) {
			arr[(i * 24 + k) * 3] = c.r;
			arr[(i * 24 + k) * 3 + 1] = c.g;
			arr[(i * 24 + k) * 3 + 2] = c.b;
		}
	}
	attr.needsUpdate = true;
};

// ---------- текст пиксельным шрифтом ядра на холсте ----------

export type TextLine = {
	text: string;
	// левый край и базовая линия (низ заглавных) в пикселях шрифта на холсте
	x: number;
	y: number;
	color: string;
	// размер пикселя шрифта (по умолчанию 1)
	px?: number;
	// «рукописный» сдвиг: строки пикселей слегка гуляют
	wobble?: number;
	// жирность: дорисовать пиксель справа
	bold?: boolean;
	// зазор между пикселями (в пикселях холста) — «светодиоды»
	gap?: number;
};

// Нарисовать строку шрифтом ядра на 2D-контексте. s — масштаб холста (экранных пикселей на пиксель шрифта).
export const drawPixelText = (ctx: CanvasRenderingContext2D, line: TextLine, s: number) => {
	const layout = layoutText(line.text);
	const px = line.px ?? 1;
	ctx.fillStyle = line.color;
	for (const p of layout.pixels) {
		const w = line.wobble ? (hash3(p.glyph, 0, 0, 77) - 0.5) * line.wobble : 0;
		const x = (line.x + p.x * px) * s;
		const y = (line.y - (p.y + 1) * px + w) * s;
		const g = line.gap ?? 0;
		ctx.fillRect(Math.round(x + g / 2), Math.round(y + g / 2), Math.ceil(px * s * (line.bold ? 2 : 1)) - g, Math.ceil(px * s) - g);
	}
};

export const pixelTextWidth = (text: string, px = 1) => layoutText(text).width * px;

// Холст -> текстура (гладкая, с мипмапами: чётко на крупном плане и без ряби издалека)
export const canvasTexture = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, pixelated = false) => {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
	draw(ctx);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	if (pixelated) {
		tex.magFilter = THREE.NearestFilter;
		tex.minFilter = THREE.NearestFilter;
		tex.generateMipmaps = false;
	} else {
		tex.magFilter = THREE.LinearFilter;
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.generateMipmaps = true;
		tex.anisotropy = 4;
	}
	tex.needsUpdate = true;
	return tex;
};

const texCache = new Map<string, THREE.Texture>();
export const cachedTex = (key: string, make: () => THREE.Texture) => {
	let t = texCache.get(key);
	if (!t) {
		t = make();
		texCache.set(key, t);
	}
	return t;
};

// Пиксельная текстура по строкам-картинке ('.' — прозрачно)
export const spriteTexture = (rows: string[], palette: Record<string, string>) => {
	const h = rows.length;
	const w = rows[0].length;
	return canvasTexture(
		w,
		h,
		(ctx) => {
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const ch = rows[y][x];
					const c = palette[ch];
					if (!c) continue;
					ctx.fillStyle = c;
					ctx.fillRect(x, y, 1, 1);
				}
			}
		},
		true,
	);
};
