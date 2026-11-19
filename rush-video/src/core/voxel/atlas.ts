import * as THREE from 'three';
import {allTiles, freezeTiles, TILE} from './tiles';

// Все тайлы блоков упакованы в ОДНУ текстуру-атлас (16 тайлов в ряд).
// Фильтр — ближайший пиксель; мип-уровни собраны вручную до 1 пикселя на тайл,
// поэтому соседние тайлы никогда не «протекают» друг в друга, а дальние блоки не рябят.

export const ATLAS_COLS = 16;

export type Atlas = {
	texture: THREE.DataTexture;
	cols: number;
	rows: number;
};

let cached: Atlas | null = null;

const toLinear = (v: number) => Math.pow(v / 255, 2.2);
const toSrgb = (v: number) => Math.round(Math.pow(v, 1 / 2.2) * 255);

// следующий мип-уровень: усреднение 2x2 в линейном цвете; прозрачные пиксели цвет не портят
const downsample = (src: Uint8Array, w: number, h: number) => {
	const nw = w >> 1;
	const nh = h >> 1;
	const out = new Uint8Array(nw * nh * 4);
	for (let y = 0; y < nh; y++) {
		for (let x = 0; x < nw; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let dy = 0; dy < 2; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					const i = ((y * 2 + dy) * w + x * 2 + dx) * 4;
					const al = src[i + 3] / 255;
					r += toLinear(src[i]) * al;
					g += toLinear(src[i + 1]) * al;
					b += toLinear(src[i + 2]) * al;
					a += al;
				}
			}
			const o = (y * nw + x) * 4;
			if (a > 0) {
				out[o] = toSrgb(r / a);
				out[o + 1] = toSrgb(g / a);
				out[o + 2] = toSrgb(b / a);
			}
			// у «дырявых» тайлов (решётки, растения) вдали сохраняем силуэт: порог ниже половины
			const cover = a / 4;
			out[o + 3] = cover >= 0.999 ? 255 : cover >= 0.34 ? 255 : 0;
		}
	}
	return out;
};

// Атлас строится один раз при первом обращении (в браузере, не при загрузке модуля)
export const getAtlas = (): Atlas => {
	if (cached) return cached;
	freezeTiles();
	const tiles = allTiles();
	const cols = ATLAS_COLS;
	let rows = 1;
	while (rows * cols < tiles.length) rows *= 2;
	const w = cols * TILE;
	const h = rows * TILE;
	const data = new Uint8Array(w * h * 4);
	for (const tile of tiles) {
		const col = tile.index % cols;
		const row = Math.floor(tile.index / cols);
		for (let y = 0; y < TILE; y++) {
			// строки DataTexture идут снизу вверх: верх тайла (y = 0) кладём в верхнюю строку ячейки
			const dst = ((row * TILE + (TILE - 1 - y)) * w + col * TILE) * 4;
			data.set(tile.data.subarray(y * TILE * 4, (y + 1) * TILE * 4), dst);
		}
	}
	const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestMipmapLinearFilter;
	texture.generateMipmaps = false;
	// мип-уровни 0..4 (16 → 1 пиксель на тайл)
	const mips: {data: Uint8Array; width: number; height: number}[] = [{data, width: w, height: h}];
	let cur = data;
	let cw = w;
	let ch = h;
	for (let level = 1; level <= 4; level++) {
		cur = downsample(cur, cw, ch);
		cw >>= 1;
		ch >>= 1;
		mips.push({data: cur, width: cw, height: ch});
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	texture.mipmaps = mips as any;
	texture.needsUpdate = true;
	cached = {texture, cols, rows};
	return cached;
};
