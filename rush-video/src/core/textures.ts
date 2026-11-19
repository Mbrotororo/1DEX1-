import * as THREE from 'three';

// Служебные текстуры (свечение, луна, солнце) и помощники. Всё создаётся лениво, один раз.

type Painter = (x: number, y: number) => number[];

// Текстура из функции-художника; y = 0 — верх картинки
export const paintTexture = (w: number, h: number, paint: Painter, pixelated = true) => {
	const data = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const c = paint(x, y);
			// DataTexture хранит строки снизу вверх — переворачиваем
			const i = ((h - 1 - y) * w + x) * 4;
			data[i] = c[0];
			data[i + 1] = c[1];
			data[i + 2] = c[2];
			data[i + 3] = c[3] ?? 255;
		}
	}
	return dataTexture(data, w, h, pixelated, true);
};

// Текстура из готовых RGBA-байтов (строка 0 — верх, если flip = false — как есть)
export const dataTexture = (data: Uint8Array, w: number, h: number, pixelated = true, alreadyFlipped = false) => {
	let buf = data;
	if (!alreadyFlipped) {
		buf = new Uint8Array(data.length);
		for (let y = 0; y < h; y++) buf.set(data.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
	}
	const tex = new THREE.DataTexture(buf, w, h, THREE.RGBAFormat);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
	tex.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	return tex;
};

// Текстура из загруженной картинки (скин, логотип сервера)
export const imageTexture = (img: HTMLImageElement, pixelated: boolean) => {
	const tex = new THREE.Texture(img);
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

const once = <T,>(make: () => T) => {
	let v: T | undefined;
	return () => (v === undefined ? (v = make()) : v);
};

const MOON = ['..####..', '.######.', '##o#####', '####o###', '#####oo#', '#o######', '.###o##.', '..####..'];

// Общие текстуры ядра: TEX.glow(), TEX.moon() ...
export const TEX = {
	// мягкое круглое свечение (для факелов, вспышек, теней)
	glow: once(() =>
		paintTexture(
			64,
			64,
			(x, y) => {
				const d = Math.hypot(x - 31.5, y - 31.5) / 32;
				const a = Math.pow(Math.max(0, 1 - d), 2.2);
				return [255, 255, 255, Math.round(a * 255)];
			},
			false,
		),
	),
	// пиксельная луна
	moon: once(() =>
		paintTexture(8, 8, (x, y) => {
			const ch = MOON[y][x];
			if (ch === '.') return [0, 0, 0, 0];
			return ch === 'o' ? [176, 184, 214, 255] : [226, 230, 246, 255];
		}),
	),
	// квадратное солнце с тёплой каймой
	sun: once(() =>
		paintTexture(8, 8, (x, y) => {
			const edge = x === 0 || y === 0 || x === 7 || y === 7;
			return edge ? [255, 226, 130, 255] : [255, 250, 214, 255];
		}),
	),
	// белый пиксель (для плашек и однотонных плоскостей)
	white: once(() => paintTexture(1, 1, () => [255, 255, 255, 255])),
	// кольцо (ударная волна): мягкий обод
	ring: once(() =>
		paintTexture(
			64,
			64,
			(x, y) => {
				const d = Math.hypot(x - 31.5, y - 31.5) / 32;
				const a = Math.max(0, 1 - Math.abs(d - 0.82) / 0.16);
				return [255, 255, 255, Math.round(a * a * 255)];
			},
			false,
		),
	),
};
