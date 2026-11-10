import * as THREE from 'three';
import {hash3, mulberry32} from './rng';

// Все текстуры блоков нарисованы кодом (16x16 пикселей), а не взяты из игры.
type Painter = (x: number, y: number) => number[];

const S = 16;

const toTexture = (w: number, h: number, paint: Painter, pixelated = true) => {
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
	const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
	tex.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	return tex;
};

const shade = (c: number[], k: number): [number, number, number] => [
	Math.min(255, Math.max(0, Math.round(c[0] * k))),
	Math.min(255, Math.max(0, Math.round(c[1] * k))),
	Math.min(255, Math.max(0, Math.round(c[2] * k))),
];

const pick = <V,>(arr: V[], r: number): V => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

// ---------- палитры ----------
const DIRT = [
	[134, 96, 67],
	[121, 85, 58],
	[150, 108, 74],
	[134, 96, 67],
	[104, 73, 50],
	[121, 85, 58],
];
const STONE = [
	[127, 127, 127],
	[118, 118, 118],
	[136, 136, 136],
	[127, 127, 127],
	[106, 106, 106],
];
const GRASS = [106, 164, 62];

const dirtPx = (x: number, y: number, seed: number) => pick(DIRT, hash3(x, y, 1, seed));

const stonePx = (x: number, y: number, seed: number) => {
	// полосатые «пятна» как у камня: соседние по горизонтали пиксели похожи
	const blob = hash3(x >> 1, y, 2, seed);
	const fine = hash3(x, y, 3, seed);
	return pick(STONE, blob * 0.7 + fine * 0.3);
};

const grassTopPx = (x: number, y: number, seed: number) => {
	const r = hash3(x, y, 4, seed);
	const k = r < 0.12 ? 0.8 : r < 0.3 ? 0.9 : r > 0.9 ? 1.12 : r > 0.7 ? 1.05 : 1;
	return shade(GRASS, k);
};

const oreTexture = (ore: number[], seed: number) => {
	const rnd = mulberry32(seed);
	const spots = new Map<string, number>();
	for (let i = 0; i < 6; i++) {
		const cx = 2 + Math.floor(rnd() * 12);
		const cy = 2 + Math.floor(rnd() * 12);
		const pts = [
			[0, 0],
			[1, 0],
			[0, 1],
			[rnd() < 0.5 ? -1 : 1, rnd() < 0.5 ? 1 : -1],
		];
		const n = 2 + Math.floor(rnd() * 3);
		for (let j = 0; j < n; j++) {
			const [dx, dy] = pts[j];
			spots.set(`${cx + dx},${cy + dy}`, j === 0 ? 1.15 : j === 1 ? 1 : 0.8);
		}
	}
	return toTexture(S, S, (x, y) => {
		const k = spots.get(`${x},${y}`);
		if (k !== undefined) return shade(ore, k);
		// тёмная обводка вокруг вкраплений руды
		if (spots.has(`${x},${y - 1}`) || spots.has(`${x - 1},${y}`)) {
			return shade(stonePx(x, y, seed), 0.78);
		}
		return stonePx(x, y, seed);
	});
};

const planksTexture = (base: number[], seed: number) =>
	toTexture(S, S, (x, y) => {
		const board = y >> 2;
		if (y % 4 === 3) return shade(base, 0.72);
		const joint = (board * 7 + 3) % 16;
		if (x === joint) return shade(base, 0.78);
		const k = 0.94 + hash3(x >> 2, board, 5, seed) * 0.1 + hash3(x, y, 6, seed) * 0.05;
		return shade(base, k);
	});

const cobbleTexture = (seed: number) => {
	const rnd = mulberry32(seed);
	const seeds: {x: number; y: number; k: number}[] = [];
	for (let i = 0; i < 11; i++) {
		seeds.push({x: rnd() * S, y: rnd() * S, k: 0.82 + rnd() * 0.36});
	}
	const nearest = (x: number, y: number) => {
		let best = 0;
		let bd = 1e9;
		for (let i = 0; i < seeds.length; i++) {
			// расстояние с заворачиванием, чтобы текстура тайлилась
			let dx = Math.abs(x - seeds[i].x);
			let dy = Math.abs(y - seeds[i].y);
			dx = Math.min(dx, S - dx);
			dy = Math.min(dy, S - dy);
			const d = dx * dx + dy * dy * 1.6;
			if (d < bd) {
				bd = d;
				best = i;
			}
		}
		return best;
	};
	return toTexture(S, S, (x, y) => {
		const a = nearest(x, y);
		const edge = a !== nearest((x + 1) % S, y) || a !== nearest(x, (y + 1) % S);
		if (edge) return [72, 72, 72];
		return shade([128, 128, 128], seeds[a].k + hash3(x, y, 7, seed) * 0.06);
	});
};

const plantTexture = (rows: string[], palette: Record<string, number[]>) =>
	toTexture(S, S, (x, y) => {
		const ch = rows[y]?.[x] ?? '.';
		const c = palette[ch];
		return c ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0];
	});

const POPPY = [
	'................',
	'................',
	'................',
	'................',
	'......rr.r......',
	'.....rRRrRr.....',
	'.....RRkkRr.....',
	'.....rRkkRR.....',
	'......rRRr......',
	'.......gG.......',
	'.......g........',
	'....G..g..g.....',
	'.....G.gGg......',
	'......GgG.......',
	'.......g........',
	'.......g........',
];
const DANDELION = [
	'................',
	'................',
	'................',
	'................',
	'................',
	'................',
	'......yYy.......',
	'.....yYoYy......',
	'......yYy.......',
	'.......g........',
	'.......g........',
	'.......gG.......',
	'.....G.g........',
	'......Gg........',
	'.......g........',
	'.......g........',
];
const CORNFLOWER = [
	'................',
	'................',
	'................',
	'................',
	'.....b.Bb.......',
	'......BbBb......',
	'.....bBcBB......',
	'......bBb.......',
	'.......g........',
	'.......gG.......',
	'.......g........',
	'......Gg........',
	'.......g..G.....',
	'.......gGG......',
	'.......g........',
	'.......g........',
];
const TALL_GRASS = [
	'................',
	'................',
	'................',
	'....g...........',
	'....g.....G.....',
	'.G..gG....G.....',
	'.G...g..g.G..g..',
	'.Gg..g..g.Gg.g..',
	'..g..gG.gG.g.g..',
	'..g.G.g.g..gG...',
	'..gGG.g.gG.gg.G.',
	'...gG.gGg..g..G.',
	'...gg.gGgG.gGg..',
	'...Gg.ggg.GgGg..',
	'....g.Ggg.ggg...',
	'....gggGggGgg...',
];

const PLANT_COLORS: Record<string, number[]> = {
	g: [72, 132, 44],
	G: [98, 160, 58],
	r: [176, 24, 24],
	R: [226, 44, 36],
	k: [40, 20, 20],
	y: [240, 196, 30],
	Y: [255, 228, 60],
	o: [232, 150, 20],
	b: [50, 86, 196],
	B: [84, 126, 236],
	c: [36, 52, 130],
};

export type WorldTextures = ReturnType<typeof createWorldTextures>;

export const createWorldTextures = () => {
	const dirt = toTexture(S, S, (x, y) => dirtPx(x, y, 11));
	const grassTop = toTexture(S, S, (x, y) => grassTopPx(x, y, 12));
	const grassSide = toTexture(S, S, (x, y) => {
		const depth = 2 + Math.floor(hash3(x, 0, 8, 13) * 3);
		if (y < depth) return grassTopPx(x, y, 14);
		if (y === depth) return shade(dirtPx(x, y, 11), 0.82);
		return dirtPx(x, y, 11);
	});
	const stone = toTexture(S, S, (x, y) => stonePx(x, y, 15));

	const logSide = toTexture(S, S, (x, y) => {
		const col = hash3(x, y >> 2, 9, 16);
		const fine = hash3(x, y, 10, 16);
		const base = [102, 80, 50];
		const k = col < 0.25 ? 0.72 : col < 0.5 ? 0.88 : col > 0.85 ? 1.14 : 1;
		return shade(base, k * (0.96 + fine * 0.08));
	});
	const logTop = toTexture(S, S, (x, y) => {
		const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
		if (d > 7) return shade([102, 80, 50], 0.85 + hash3(x, y, 11, 17) * 0.2);
		const ring = Math.floor(d) % 2 === 0;
		return shade(ring ? [184, 148, 95] : [158, 124, 74], 0.96 + hash3(x, y, 12, 17) * 0.08);
	});
	const leaves = toTexture(S, S, (x, y) => {
		const r = hash3(x, y, 13, 18);
		const base = [62, 122, 36];
		const k = r < 0.14 ? 0.5 : r < 0.36 ? 0.76 : r > 0.86 ? 1.22 : r > 0.62 ? 1.08 : 0.94;
		return shade(base, k);
	});

	const planks = planksTexture([184, 148, 95], 19);
	const darkPlanks = planksTexture([112, 82, 48], 20);
	const cobble = cobbleTexture(21);

	const glass = toTexture(S, S, (x, y) => {
		if (x === 0 || y === 0 || x === 15 || y === 15) return [226, 240, 250];
		if (x === 7 || x === 8 || y === 7 || y === 8) return [150, 120, 80];
		const streak = (x + y) % 7 === 0 || (x + y) % 7 === 1;
		return streak ? [214, 236, 252] : [150, 200, 238];
	});
	const doorTop = toTexture(S, S, (x, y) => {
		if (x === 0 || x === 15 || y === 0) return [86, 62, 32];
		if (x >= 3 && x <= 12 && y >= 3 && y <= 11) {
			if (x === 7 || x === 8 || y === 7) return [104, 76, 40];
			return [150, 200, 238];
		}
		return shade([142, 106, 58], 0.95 + hash3(x, y >> 2, 14, 22) * 0.1);
	});
	const doorBottom = toTexture(S, S, (x, y) => {
		if (x === 0 || x === 15 || y === 15) return [86, 62, 32];
		if ((x === 12 || x === 13) && (y === 1 || y === 2)) return [214, 214, 222];
		if (y === 6 || y === 11) return [104, 76, 40];
		return shade([142, 106, 58], 0.95 + hash3(x, y >> 2, 15, 22) * 0.1);
	});

	const ores = {
		coal: oreTexture([44, 44, 44], 31),
		iron: oreTexture([216, 175, 147], 32),
		gold: oreTexture([252, 238, 75], 33),
		diamond: oreTexture([93, 236, 245], 34),
		redstone: oreTexture([240, 20, 20], 35),
	};

	// шкурка свинки
	const pig = toTexture(S, S, (x, y) => {
		const r = hash3(x, y, 19, 50);
		return shade([240, 168, 164], r < 0.15 ? 0.92 : r > 0.85 ? 1.05 : 1);
	});

	const poppy = plantTexture(POPPY, PLANT_COLORS);
	const dandelion = plantTexture(DANDELION, PLANT_COLORS);
	const cornflower = plantTexture(CORNFLOWER, PLANT_COLORS);
	const tallGrass = plantTexture(TALL_GRASS, PLANT_COLORS);

	// --- вода: 32 зацикленных кадра «ряби» ---
	const WATER_FRAMES = 32;
	const waterStill: THREE.DataTexture[] = [];
	const W = (2 * Math.PI) / S;
	for (let f = 0; f < WATER_FRAMES; f++) {
		const ph = (2 * Math.PI * f) / WATER_FRAMES;
		waterStill.push(
			toTexture(S, S, (x, y) => {
				const v =
					Math.sin(W * (x + 2 * y) + ph) +
					Math.sin(W * (2 * x - y) - ph * 2) +
					Math.sin(W * (3 * x + y) + ph) * 0.6 +
					(hash3(x, y, 16, 40) - 0.5) * 0.5;
				if (v > 2.0) return [92, 148, 244];
				if (v > 1.1) return [74, 130, 236];
				if (v > -1.2) return [63, 118, 228];
				return [55, 106, 216];
			}),
		);
	}
	// текущая вода (водопады): вертикальные струйки
	const waterFlow = toTexture(S, S * 2, (x, y) => {
		const col = hash3(x, 0, 17, 41);
		const dash = hash3(x, y >> 2, 18, 41);
		let c: number[] = [63, 118, 228];
		if (col < 0.25) c = [56, 108, 218];
		else if (col > 0.8) c = [74, 130, 236];
		if (dash > 0.93) c = [120, 172, 250];
		else if (dash < 0.08) c = [50, 98, 208];
		return [c[0], c[1], c[2]];
	});
	waterFlow.wrapT = THREE.RepeatWrapping;
	waterFlow.wrapS = THREE.RepeatWrapping;
	for (const t of waterStill) {
		t.wrapS = THREE.RepeatWrapping;
		t.wrapT = THREE.RepeatWrapping;
	}

	// мягкое свечение (для логотипа, вспышек)
	const glow = toTexture(
		64,
		64,
		(x, y) => {
			const d = Math.hypot(x - 31.5, y - 31.5) / 32;
			const a = Math.pow(Math.max(0, 1 - d), 2.2);
			return [255, 255, 255, Math.round(a * 255)];
		},
		false,
	);

	// пиксельная луна
	const MOON = [
		'..####..',
		'.######.',
		'##o#####',
		'####o###',
		'#####oo#',
		'#o######',
		'.###o##.',
		'..####..',
	];
	const moon = toTexture(8, 8, (x, y) => {
		const ch = MOON[y][x];
		if (ch === '.') return [0, 0, 0, 0];
		return ch === 'o' ? [176, 184, 214, 255] : [226, 230, 246, 255];
	});

	// небо: вертикальный градиент
	const sky = toTexture(
		1,
		256,
		(_x, y) => {
			const k = y / 255;
			const top = [5, 8, 30];
			const mid = [16, 18, 62];
			const bot = [44, 30, 104];
			const a = k < 0.55 ? top : mid;
			const b = k < 0.55 ? mid : bot;
			const q = k < 0.55 ? k / 0.55 : (k - 0.55) / 0.45;
			return [
				Math.round(a[0] + (b[0] - a[0]) * q),
				Math.round(a[1] + (b[1] - a[1]) * q),
				Math.round(a[2] + (b[2] - a[2]) * q),
			];
		},
		false,
	);

	return {
		dirt,
		grassTop,
		grassSide,
		stone,
		logSide,
		logTop,
		leaves,
		planks,
		darkPlanks,
		cobble,
		glass,
		doorTop,
		doorBottom,
		ores,
		poppy,
		dandelion,
		cornflower,
		tallGrass,
		pig,
		waterStill,
		waterFlow,
		glow,
		moon,
		sky,
	};
};

// Куб с «запечённым» затенением граней как в Minecraft:
// верх светлый, бока темнее, низ самый тёмный (значения в линейном цвете).
export const FACE_SHADE = {px: 0.36, nx: 0.3, py: 1, ny: 0.22, pz: 0.62, nz: 0.5};

export const shadedBox = (
	w = 1,
	h = 1,
	d = 1,
	shades: number[] = [
		FACE_SHADE.px,
		FACE_SHADE.nx,
		FACE_SHADE.py,
		FACE_SHADE.ny,
		FACE_SHADE.pz,
		FACE_SHADE.nz,
	],
) => {
	const geo = new THREE.BoxGeometry(w, h, d);
	const colors = new Float32Array(24 * 3);
	for (let face = 0; face < 6; face++) {
		for (let v = 0; v < 4; v++) {
			const i = (face * 4 + v) * 3;
			colors[i] = colors[i + 1] = colors[i + 2] = shades[face];
		}
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return geo;
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
