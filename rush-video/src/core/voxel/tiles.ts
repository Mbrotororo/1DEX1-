import {hash3, mulberry32} from '../rng';

// Все текстуры блоков нарисованы кодом (16x16 пикселей), а не взяты из игры.
// ЧИСТЫЙ модуль (без three): тайл — это Uint8Array RGBA, строка 0 — верх картинки.

export const TILE = 16;
export type Rgb = number[];
export type Painter = (x: number, y: number) => Rgb;

export type TileDef = {name: string; index: number; data: Uint8Array; cutout: boolean};

const TILES: TileDef[] = [];
const BY_NAME = new Map<string, TileDef>();
let frozen = false;

// Атлас уже собран — новые тайлы добавлять поздно
export const freezeTiles = () => {
	frozen = true;
};
export const allTiles = () => TILES;
export const tileIndex = (name: string) => {
	const t = BY_NAME.get(name);
	if (!t) throw new Error(`Нет тайла "${name}"`);
	return t.index;
};
export const tileData = (name: string) => {
	const t = BY_NAME.get(name);
	if (!t) throw new Error(`Нет тайла "${name}"`);
	return t.data;
};

// Зарегистрировать тайл 16x16. painter(x, y) -> [r, g, b] или [r, g, b, a] (0..255), y = 0 — верх.
// Вызывать на верхнем уровне модуля (до первого кадра), имя должно быть уникальным.
export const defineTile = (name: string, paint: Painter): number => {
	if (BY_NAME.has(name)) throw new Error(`Тайл "${name}" уже есть`);
	if (frozen) throw new Error(`Тайл "${name}": атлас уже собран, defineTile нужно вызывать при загрузке модуля`);
	const data = new Uint8Array(TILE * TILE * 4);
	let cutout = false;
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			const c = paint(x, y);
			const i = (y * TILE + x) * 4;
			data[i] = Math.max(0, Math.min(255, Math.round(c[0])));
			data[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
			data[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
			data[i + 3] = c[3] === undefined ? 255 : Math.round(c[3]);
			if (data[i + 3] < 255) cutout = true;
		}
	}
	const def = {name, index: TILES.length, data, cutout};
	TILES.push(def);
	BY_NAME.set(name, def);
	return def.index;
};

// Тайл по строкам-картинке: каждый символ — цвет из палитры, '.' — прозрачно
export const defineSpriteTile = (name: string, rows: string[], palette: Record<string, Rgb>) =>
	defineTile(name, (x, y) => {
		const c = palette[rows[y]?.[x] ?? '.'];
		return c ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0];
	});

// ---------- помощники художника ----------
export const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
export const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
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
const SNOW = [
	[250, 253, 255],
	[241, 248, 252],
	[232, 243, 250],
	[250, 253, 255],
	[244, 250, 253],
];

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
const snowPx = (x: number, y: number, seed: number) => {
	const blob = hash3(x >> 1, y >> 1, 5, seed);
	const fine = hash3(x, y, 6, seed);
	return pick(SNOW, blob * 0.55 + fine * 0.45);
};
// ---------- земля и камень ----------
defineTile('dirt', (x, y) => dirtPx(x, y, 11));
defineTile('grass_top', (x, y) => grassTopPx(x, y, 12));
defineTile('grass_side', (x, y) => {
	const depth = 2 + Math.floor(hash3(x, 0, 8, 13) * 3);
	if (y < depth) return grassTopPx(x, y, 14);
	if (y === depth) return shade(dirtPx(x, y, 11), 0.82);
	return dirtPx(x, y, 11);
});
defineTile('snow', (x, y) => snowPx(x, y, 60));
defineTile('snowy_grass_side', (x, y) => {
	const depth = 3 + Math.floor(hash3(x, 0, 8, 61) * 3);
	if (y < depth) return snowPx(x, y, 62);
	if (y === depth) return [206, 222, 236];
	if (y === depth + 1) return shade(dirtPx(x, y, 11), 0.8);
	return dirtPx(x, y, 11);
});
defineTile('stone', (x, y) => stonePx(x, y, 15));

const cobble = (seed: number, base: Rgb, edge: Rgb, count = 11): Painter => {
	const rnd = mulberry32(seed);
	const seeds: {x: number; y: number; k: number}[] = [];
	for (let i = 0; i < count; i++) seeds.push({x: rnd() * TILE, y: rnd() * TILE, k: 0.82 + rnd() * 0.36});
	const nearest = (x: number, y: number) => {
		let best = 0;
		let bd = 1e9;
		for (let i = 0; i < seeds.length; i++) {
			// расстояние с заворачиванием, чтобы текстура тайлилась
			let dx = Math.abs(x - seeds[i].x);
			let dy = Math.abs(y - seeds[i].y);
			dx = Math.min(dx, TILE - dx);
			dy = Math.min(dy, TILE - dy);
			const d = dx * dx + dy * dy * 1.6;
			if (d < bd) {
				bd = d;
				best = i;
			}
		}
		return best;
	};
	return (x, y) => {
		const a = nearest(x, y);
		const isEdge = a !== nearest((x + 1) % TILE, y) || a !== nearest(x, (y + 1) % TILE);
		if (isEdge) return edge;
		return shade(base, seeds[a].k + hash3(x, y, 7, seed) * 0.06);
	};
};
defineTile('cobble', cobble(21, [128, 128, 128], [72, 72, 72]));

const ore = (color: Rgb, seed: number): Painter => {
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
	return (x, y) => {
		const k = spots.get(`${x},${y}`);
		if (k !== undefined) return shade(color, k);
		// тёмная обводка вокруг вкраплений руды
		if (spots.has(`${x},${y - 1}`) || spots.has(`${x - 1},${y}`)) return shade(stonePx(x, y, seed), 0.78);
		return stonePx(x, y, seed);
	};
};
defineTile('ore_coal', ore([44, 44, 44], 31));
defineTile('ore_iron', ore([216, 175, 147], 32));
defineTile('ore_gold', ore([252, 238, 75], 33));
defineTile('ore_diamond', ore([93, 236, 245], 34));
defineTile('ore_redstone', ore([240, 20, 20], 35));

defineTile('sand', (x, y) => {
	const r = hash3(x, y, 9, 63);
	const k = r < 0.1 ? 0.9 : r < 0.3 ? 0.95 : r > 0.92 ? 1.06 : 1;
	return shade([222, 209, 162], k);
});
defineTile('gravel', (x, y) => {
	const blob = hash3((x + (y >> 1)) >> 1, y >> 1, 10, 64);
	const fine = hash3(x, y, 11, 64);
	const base = blob < 0.3 ? [108, 103, 101] : blob < 0.65 ? [131, 126, 124] : [150, 142, 138];
	return shade(base, 0.92 + fine * 0.16);
});
defineTile('path_top', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return shade([148, 121, 65], 0.82 + hash3(x, y, 1, 65) * 0.1);
	const r = hash3(x, y, 12, 65);
	return shade([170, 140, 78], r < 0.15 ? 0.86 : r > 0.85 ? 1.08 : 1);
});
defineTile('farmland_top', (x, y) => {
	// влажная грядка: тёмные борозды
	const furrow = x % 4 === 1 || x % 4 === 2;
	const r = hash3(x, y, 13, 66);
	return shade(furrow ? [70, 42, 20] : [94, 58, 30], 0.9 + r * 0.2);
});
defineTile('bedrock', (x, y) => {
	const blob = hash3(x >> 1, y >> 1, 14, 67);
	const fine = hash3(x, y, 15, 67);
	const v = blob * 0.6 + fine * 0.4;
	return v < 0.3 ? [40, 40, 40] : v < 0.55 ? [78, 78, 78] : v < 0.85 ? [104, 104, 104] : [140, 140, 140];
});
defineTile('obsidian', (x, y) => {
	const r = hash3(x, y, 16, 68);
	const blob = hash3(x >> 1, (y + x) >> 2, 17, 68);
	if (r > 0.93) return [70, 46, 104];
	if (blob > 0.8) return [36, 22, 54];
	return r < 0.3 ? [14, 10, 22] : [22, 16, 34];
});
defineTile('deepslate', (x, y) => {
	const streak = hash3(x >> 2, y, 18, 69);
	const fine = hash3(x, y, 19, 69);
	return shade([78, 78, 82], 0.82 + streak * 0.24 + fine * 0.1);
});
defineTile('tuff', (x, y) => {
	const blob = hash3((x + y) >> 1, (y - x + 16) >> 2, 20, 70);
	const fine = hash3(x, y, 21, 70);
	const base = blob < 0.25 ? [92, 94, 86] : blob < 0.7 ? [108, 110, 102] : [124, 125, 116];
	return shade(base, 0.93 + fine * 0.14);
});

// ---------- лёд и вода ----------
defineTile('ice', (x, y) => {
	const streak = (x + y * 2) % 11 === 0 || (x * 2 + y + 5) % 13 === 0;
	const r = hash3(x, y, 22, 71);
	if (streak) return [208, 230, 255];
	return shade([146, 186, 248], 0.96 + r * 0.08);
});
defineTile('packed_ice', (x, y) => {
	const blob = hash3((x + (y >> 1)) >> 1, y >> 1, 23, 72);
	const r = hash3(x, y, 24, 72);
	const base = blob < 0.35 ? [126, 164, 232] : blob < 0.75 ? [142, 180, 244] : [164, 198, 250];
	return shade(base, 0.97 + r * 0.06);
});
defineTile('blue_ice', (x, y) => {
	const wave = Math.sin((x + y * 0.6) * 0.9) + Math.sin((x * 0.4 - y) * 1.1);
	const r = hash3(x, y, 25, 73);
	const base = wave > 0.9 ? [150, 196, 255] : wave < -0.9 ? [92, 148, 240] : [112, 170, 250];
	return shade(base, 0.97 + r * 0.06);
});
defineTile('water', (x, y) => {
	const W = (2 * Math.PI) / TILE;
	const v = Math.sin(W * (x + 2 * y)) + Math.sin(W * (2 * x - y)) + Math.sin(W * (3 * x + y)) * 0.6 + (hash3(x, y, 16, 40) - 0.5) * 0.5;
	const a = 190;
	if (v > 2.0) return [112, 168, 250, a];
	if (v > 1.1) return [84, 140, 240, a];
	if (v > -1.2) return [63, 118, 228, a];
	return [55, 106, 216, a];
});

// ---------- дерево ----------
const logSide = (base: Rgb, seed: number): Painter => (x, y) => {
	const col = hash3(x, y >> 2, 9, seed);
	const fine = hash3(x, y, 10, seed);
	const k = col < 0.25 ? 0.72 : col < 0.5 ? 0.88 : col > 0.85 ? 1.14 : 1;
	return shade(base, k * (0.96 + fine * 0.08));
};
const logTop = (bark: Rgb, light: Rgb, dark: Rgb, seed: number): Painter => (x, y) => {
	const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
	if (d > 7) return shade(bark, 0.85 + hash3(x, y, 11, seed) * 0.2);
	const ring = Math.floor(d) % 2 === 0;
	return shade(ring ? light : dark, 0.96 + hash3(x, y, 12, seed) * 0.08);
};
const leaves = (base: Rgb, seed: number): Painter => (x, y) => {
	const r = hash3(x, y, 13, seed);
	const k = r < 0.14 ? 0.5 : r < 0.36 ? 0.76 : r > 0.86 ? 1.22 : r > 0.62 ? 1.08 : 0.94;
	return shade(base, k);
};
const planks = (base: Rgb, seed: number): Painter => (x, y) => {
	const board = y >> 2;
	if (y % 4 === 3) return shade(base, 0.72);
	const joint = (board * 7 + 3) % 16;
	if (x === joint) return shade(base, 0.78);
	const k = 0.94 + hash3(x >> 2, board, 5, seed) * 0.1 + hash3(x, y, 6, seed) * 0.05;
	return shade(base, k);
};

const OAK: Rgb = [184, 148, 95];
defineTile('oak_log_side', logSide([102, 80, 50], 16));
defineTile('oak_log_top', logTop([102, 80, 50], [184, 148, 95], [158, 124, 74], 17));
defineTile('oak_leaves', leaves([62, 122, 36], 18));
defineTile('oak_planks', planks(OAK, 19));
defineTile('dark_planks', planks([92, 64, 36], 20));

defineTile('spruce_log_side', logSide([58, 40, 24], 80));
defineTile('spruce_log_top', logTop([58, 40, 24], [130, 98, 58], [108, 80, 46], 81));
const spruceLeaves = leaves([44, 86, 56], 82);
defineTile('spruce_leaves', spruceLeaves);
defineTile('spruce_planks', planks([124, 92, 54], 83));
// еловая хвоя под снегом: сверху неровная снежная шапка
defineTile('snowy_spruce_leaves_side', (x, y) => {
	const depth = 3 + Math.floor(hash3(x >> 1, 0, 8, 84) * 4);
	if (y < depth) return snowPx(x, y, 85);
	if (y === depth) return [200, 220, 232];
	return spruceLeaves(x, y);
});

defineTile('birch_log_side', (x, y) => {
	const fine = hash3(x, y, 10, 86);
	// чёрные чёрточки на белой коре
	const dash = hash3(x >> 2, y, 26, 86);
	if (dash > 0.86 && (x & 3) !== 3) return [44, 42, 40];
	if (dash < 0.1) return [196, 196, 186];
	return shade([222, 222, 214], 0.96 + fine * 0.06);
});
defineTile('birch_log_top', logTop([210, 210, 200], [200, 180, 126], [176, 156, 104], 87));
defineTile('birch_leaves', leaves([100, 150, 62], 88));

defineTile('cherry_log_side', logSide([56, 30, 40], 89));
defineTile('cherry_log_top', logTop([56, 30, 40], [226, 164, 158], [204, 138, 136], 90));
defineTile('cherry_leaves', (x, y) => {
	const r = hash3(x, y, 13, 91);
	if (r < 0.1) return [196, 108, 150];
	if (r < 0.3) return [228, 142, 180];
	if (r > 0.93) return [255, 232, 240];
	if (r > 0.7) return [250, 190, 214];
	return [240, 166, 198];
});

// ---------- постройки ----------
defineTile('glass', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [226, 240, 250];
	const streak = (x + y) % 7 === 0 || (x + y) % 7 === 1;
	return streak ? [214, 236, 252] : [150, 200, 238];
});
// окно с переплётом (как в домике из старого ролика)
defineTile('window', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [226, 240, 250];
	if (x === 7 || x === 8 || y === 7 || y === 8) return [150, 120, 80];
	const streak = (x + y) % 7 === 0 || (x + y) % 7 === 1;
	return streak ? [214, 236, 252] : [150, 200, 238];
});
// тёплое светящееся окно (ночные сцены)
defineTile('window_lit', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [120, 84, 44];
	if (x === 7 || x === 8 || y === 7 || y === 8) return [120, 84, 44];
	const d = Math.hypot(x - 7.5, y - 7.5) / 10;
	return mixRgb([255, 236, 150], [255, 180, 70], d);
});
defineTile('door_top', (x, y) => {
	if (x === 0 || x === 15 || y === 0) return [86, 62, 32];
	if (x >= 3 && x <= 12 && y >= 3 && y <= 11) {
		if (x === 7 || x === 8 || y === 7) return [104, 76, 40];
		return [150, 200, 238];
	}
	return shade([142, 106, 58], 0.95 + hash3(x, y >> 2, 14, 22) * 0.1);
});
defineTile('door_bottom', (x, y) => {
	if (x === 0 || x === 15 || y === 15) return [86, 62, 32];
	if ((x === 12 || x === 13) && (y === 1 || y === 2)) return [214, 214, 222];
	if (y === 6 || y === 11) return [104, 76, 40];
	return shade([142, 106, 58], 0.95 + hash3(x, y >> 2, 15, 22) * 0.1);
});

const bricks = (base: (x: number, y: number) => Rgb, mortar: Rgb, seed: number, rows = 2): Painter => (x, y) => {
	const h = TILE / rows;
	const row = Math.floor(y / h);
	const ly = y % h;
	const lx = (x + (row % 2) * 8) % 16;
	const brick = Math.floor((x + (row % 2) * 8) / 16) + row * 3;
	if (ly === h - 1 || lx === 15) return mortar;
	const tone = 0.92 + hash3(brick, row, 27, seed) * 0.16;
	let k = tone;
	if (ly === 0 || lx === 0) k *= 1.1;
	if (ly === h - 2 || lx === 14) k *= 0.88;
	return shade(base(x, y), k);
};
const stoneBrick = bricks((x, y) => shade(stonePx(x, y, 92), 0.98), [84, 84, 84], 92);
defineTile('stone_bricks', stoneBrick);
defineTile('mossy_stone_bricks', (x, y) => {
	const c = stoneBrick(x, y);
	const moss = hash3(x >> 1, y >> 1, 28, 93) * 0.6 + hash3(x, y, 29, 93) * 0.4;
	const low = y > 9 || x < 4 ? 0.12 : 0;
	if (moss + low > 0.62) return shade([92, 126, 60], 0.85 + hash3(x, y, 30, 93) * 0.3);
	return c;
});
defineTile('cracked_stone_bricks', (x, y) => {
	const c = stoneBrick(x, y);
	// ломаные трещины
	const crackA = Math.abs(x - (4 + Math.floor(y / 3) * 2 + (y % 3 === 1 ? 1 : 0))) < 1 && y > 0 && y < 7;
	const crackB = Math.abs(y - (11 + Math.floor(x / 4) - (x % 4 === 2 ? 1 : 0))) < 1 && x > 6 && x < 15;
	if (crackA || crackB) return [58, 58, 58];
	return c;
});
defineTile(
	'deepslate_bricks',
	bricks((x, y) => shade([74, 74, 78], 0.92 + hash3(x, y, 31, 94) * 0.16), [36, 36, 40], 94),
);
const tuffPx = (x: number, y: number) => shade([110, 112, 104], 0.92 + hash3(x, y, 32, 95) * 0.16);
defineTile('tuff_bricks', bricks(tuffPx, [70, 72, 66], 95));
defineTile('chiseled_tuff', (x, y) => {
	// рамка и резная полоса с «глазками» посередине
	if (x === 0 || y === 0) return shade(tuffPx(x, y), 1.12);
	if (x === 15 || y === 15) return shade(tuffPx(x, y), 0.72);
	if (y >= 5 && y <= 10) {
		if (y === 5 || y === 10) return [66, 68, 62];
		const cell = (x - 1) % 5;
		if ((y === 7 || y === 8) && (cell === 1 || cell === 2)) return [58, 60, 54];
		return shade(tuffPx(x, y), 0.86);
	}
	return tuffPx(x, y);
});

// ---------- медь ----------
// level: 0 — новая, 1 — потемневшая, 2 — зеленеющая, 3 — бирюзовая патина
const COPPER: Rgb[] = [
	[196, 110, 80],
	[164, 124, 100],
	[110, 152, 112],
	[82, 164, 136],
];
const COPPER_LIGHT: Rgb[] = [
	[232, 144, 104],
	[190, 150, 122],
	[136, 178, 132],
	[110, 196, 160],
];
const COPPER_DARK: Rgb[] = [
	[150, 76, 58],
	[124, 90, 74],
	[80, 116, 88],
	[58, 124, 104],
];
const copperPx = (level: number, x: number, y: number, seed: number): Rgb => {
	const streak = hash3((x + y) >> 1, (x - y + 16) >> 2, 33, seed);
	const fine = hash3(x, y, 34, seed);
	let c = streak < 0.25 ? COPPER_DARK[level] : streak > 0.78 ? COPPER_LIGHT[level] : COPPER[level];
	// пятна окисления на промежуточных стадиях
	if (level === 1 && fine > 0.9) c = [120, 150, 120];
	if (level === 2 && fine > 0.92) c = [170, 128, 98];
	return shade(c, 0.95 + fine * 0.1);
};
const copperBlock = (level: number, seed: number): Painter => (x, y) => {
	if (x === 0 || y === 0) return shade(COPPER_LIGHT[level], 0.98);
	if (x === 15 || y === 15) return shade(COPPER_DARK[level], 0.9);
	return copperPx(level, x, y, seed);
};
const cutCopper = (level: number, seed: number): Painter => (x, y) => {
	// четыре плитки 8x8 с фаской
	const lx = x % 8;
	const ly = y % 8;
	if (lx === 7 || ly === 7) return shade(COPPER_DARK[level], 0.72);
	if (lx === 0 || ly === 0) return COPPER_LIGHT[level];
	if (lx === 6 || ly === 6) return shade(COPPER_DARK[level], 0.95);
	return copperPx(level, x, y, seed);
};
const chiseledCopper = (level: number, seed: number): Painter => (x, y) => {
	const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
	if (d > 7) return x === 0 || y === 0 ? COPPER_LIGHT[level] : shade(COPPER_DARK[level], 0.85);
	if (d > 5 && d < 6) return shade(COPPER_DARK[level], 0.7);
	if (d > 2 && d < 3) return shade(COPPER_DARK[level], 0.75);
	if (d < 1) return COPPER_LIGHT[level];
	return copperPx(level, x, y, seed);
};
const copperGrate = (level: number, seed: number): Painter => (x, y) => {
	// решётка: рамка и перекладины, между ними — дырки
	const frame = x === 0 || y === 0 || x === 15 || y === 15;
	const bar = x % 5 === 0 || y % 5 === 0;
	if (!frame && !bar) return [0, 0, 0, 0];
	const c = copperPx(level, x, y, seed);
	const k = x % 5 === 0 && y % 5 === 0 ? 1.15 : frame ? 0.9 : 1;
	return [c[0] * k, c[1] * k, c[2] * k, 255];
};
const copperBulb = (level: number, lit: boolean, seed: number): Painter => (x, y) => {
	const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
	if (d > 7) return x === 0 || y === 0 ? COPPER_LIGHT[level] : shade(COPPER_DARK[level], 0.85);
	if (d > 4) {
		// медная оправа с заклёпками по углам
		if ((x === 2 || x === 13) && (y === 2 || y === 13)) return COPPER_LIGHT[level];
		if (d < 5) return shade(COPPER_DARK[level], 0.7);
		return copperPx(level, x, y, seed);
	}
	const r = Math.hypot(x - 7.5, y - 7.5) / 5.5;
	if (lit) return mixRgb([255, 250, 214], [255, 190, 84], Math.min(1, r));
	return mixRgb([112, 70, 40], [72, 44, 28], Math.min(1, r));
};
const COPPER_NAMES = ['copper', 'exposed_copper', 'weathered_copper', 'oxidized_copper'];
COPPER_NAMES.forEach((name, level) => {
	defineTile(name, copperBlock(level, 100 + level));
	defineTile(`cut_${name}`, cutCopper(level, 110 + level));
	defineTile(`chiseled_${name}`, chiseledCopper(level, 120 + level));
	defineTile(`${name}_grate`, copperGrate(level, 130 + level));
});
defineTile('copper_bulb', copperBulb(0, false, 140));
defineTile('copper_bulb_lit', copperBulb(0, true, 140));
defineTile('oxidized_copper_bulb', copperBulb(3, false, 141));
defineTile('oxidized_copper_bulb_lit', copperBulb(3, true, 141));

defineTile('iron_bars', (x, y) => {
	const bar = x % 4 === 1 || x % 4 === 2;
	const rail = y === 1 || y === 14;
	if (!bar && !rail) return [0, 0, 0, 0];
	const light = x % 4 === 1;
	const c: Rgb = rail ? [110, 112, 116] : light ? [168, 170, 176] : [120, 122, 128];
	return [c[0], c[1], c[2], 255];
});

// ---------- ценное и светящееся ----------
defineTile('gold_block', (x, y) => {
	if (x === 0 || y === 0) return [255, 246, 150];
	if (x === 15 || y === 15) return [214, 150, 26];
	const streak = (x + y) % 6;
	const r = hash3(x, y, 35, 150);
	if (streak === 0) return [255, 240, 120];
	return shade([250, 208, 52], 0.95 + r * 0.1);
});
defineTile('diamond_block', (x, y) => {
	if (x === 0 || y === 0) return [200, 252, 248];
	if (x === 15 || y === 15) return [42, 160, 172];
	const streak = (x + y) % 6;
	const r = hash3(x, y, 35, 151);
	if (streak === 0) return [176, 250, 244];
	return shade([98, 228, 220], 0.95 + r * 0.1);
});
defineTile('iron_block', (x, y) => {
	if (x === 0 || y === 0) return [245, 245, 245];
	if (x === 15 || y === 15) return [150, 150, 150];
	if (y % 4 === 3) return [190, 190, 190];
	return shade([222, 222, 222], 0.97 + hash3(x, y, 35, 152) * 0.06);
});
defineTile('glowstone', (x, y) => {
	const blob = hash3((x + (y >> 1)) >> 1, y >> 1, 36, 153);
	const r = hash3(x, y, 37, 153);
	if (blob < 0.18) return [150, 104, 52];
	if (blob > 0.7 || r > 0.9) return [255, 244, 180];
	return shade([250, 208, 110], 0.94 + r * 0.12);
});
defineTile('lantern_glow', (x, y) => {
	const d = Math.hypot(x - 7.5, y - 7.5) / 10;
	return mixRgb([255, 240, 170], [255, 170, 60], Math.min(1, d));
});

// ---------- шерсть (флаги, гирлянды, ковры) ----------
const wool = (base: Rgb, seed: number): Painter => (x, y) => {
	const weave = (x + y * 3) % 4 === 0 ? 0.9 : (x * 3 + y) % 5 === 0 ? 1.08 : 1;
	return shade(base, weave * (0.96 + hash3(x, y, 38, seed) * 0.08));
};
export const WOOL_COLORS: Record<string, Rgb> = {
	white: [236, 238, 238],
	red: [176, 38, 34],
	green: [86, 128, 28],
	blue: [52, 64, 170],
	yellow: [250, 200, 38],
	orange: [240, 118, 20],
	purple: [124, 44, 176],
	pink: [240, 142, 172],
	cyan: [22, 138, 146],
	black: [24, 24, 30],
	gray: [72, 80, 84],
	light_blue: [62, 176, 220],
};
Object.entries(WOOL_COLORS).forEach(([name, c], i) => defineTile(`${name}_wool`, wool(c, 160 + i)));

defineTile('hay_side', (x, y) => {
	if (y === 3 || y === 12) return [150, 60, 30];
	if (y === 4 || y === 13) return [110, 44, 22];
	const strand = hash3(x, y >> 2, 39, 180);
	return shade([206, 168, 34], strand < 0.3 ? 0.84 : strand > 0.8 ? 1.12 : 1);
});
defineTile('hay_top', (x, y) => {
	const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
	const ring = Math.floor(d) % 2 === 0;
	return shade(ring ? [216, 178, 44] : [184, 146, 28], 0.95 + hash3(x, y, 40, 181) * 0.1);
});

// ---------- мебель ----------
const chest = (latch: boolean, seed: number): Painter => (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [56, 36, 12];
	if (y === 5) return [56, 36, 12];
	if (latch && x >= 7 && x <= 8 && y >= 4 && y <= 7) return y === 4 ? [240, 240, 244] : [176, 176, 186];
	if (x === 1 || y === 1 || y === 6) return [190, 136, 50];
	return shade([164, 114, 38], 0.93 + hash3(x >> 2, y, 41, seed) * 0.14);
};
defineTile('chest_front', chest(true, 190));
defineTile('chest_side', chest(false, 191));
defineTile('chest_top', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [56, 36, 12];
	if (x === 1 || y === 1) return [190, 136, 50];
	return shade([164, 114, 38], 0.93 + hash3(x >> 2, y, 41, 192) * 0.14);
});
const BOOKS: Rgb[] = [
	[170, 40, 36],
	[46, 86, 170],
	[60, 130, 50],
	[190, 150, 40],
	[120, 60, 150],
	[200, 200, 190],
];
defineTile('bookshelf', (x, y) => {
	const plank = planks(OAK, 19);
	if (y < 2 || y === 8 || y === 15 || x === 0 || x === 15) return plank(x, y);
	const shelf = y < 8 ? 0 : 1;
	const book = Math.floor((x - 1) / 2);
	const tall = hash3(book, shelf, 42, 193);
	const top = shelf === 0 ? 2 : 9;
	if (y === top && tall < 0.4) return [48, 30, 14];
	const c = pick(BOOKS, hash3(book, shelf, 43, 193));
	return shade(c, (x - 1) % 2 === 0 ? 1 : 0.78);
});
defineTile('crafting_top', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [70, 46, 22];
	if (x === 5 || x === 10 || y === 5 || y === 10) return [96, 66, 32];
	return shade([170, 126, 72], 0.94 + hash3(x, y, 44, 194) * 0.1);
});
defineTile('crafting_side', (x, y) => {
	const plank = planks(OAK, 19);
	if (y < 3) return shade([112, 78, 40], 0.9 + hash3(x, y, 45, 195) * 0.2);
	// молоток и пила
	if (x >= 3 && x <= 4 && y >= 5 && y <= 12) return [90, 62, 30];
	if (x >= 2 && x <= 6 && y >= 5 && y <= 6) return [170, 170, 178];
	if (x >= 9 && x <= 13 && y === 13 - (x - 9)) return [170, 170, 178];
	if (x >= 9 && x <= 12 && y === 12 - (x - 9)) return [120, 120, 128];
	return plank(x, y);
});

// ---------- растения (крест из двух плоскостей) ----------
const PLANT_COLORS: Record<string, Rgb> = {
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
	w: [220, 187, 101],
	W: [240, 214, 130],
	d: [166, 140, 47],
	s: [120, 98, 60],
	S: [90, 72, 44],
	p: [240, 166, 198],
	P: [255, 214, 232],
};
defineSpriteTile(
	'poppy',
	[
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
	],
	PLANT_COLORS,
);
defineSpriteTile(
	'dandelion',
	[
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
	],
	PLANT_COLORS,
);
defineSpriteTile(
	'cornflower',
	[
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
	],
	PLANT_COLORS,
);
defineSpriteTile(
	'tall_grass',
	[
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
	],
	PLANT_COLORS,
);
defineSpriteTile(
	'wheat',
	[
		'..W...w...W..w..',
		'..w..Ww..Ww..W..',
		'.Ww..wd..wd.Ww..',
		'.wd.Wwd.Wwd.wd.W',
		'.wd.wd..wd..wd.w',
		'Wwd.wd.Wwd.Wwd.w',
		'wd..wd.wd..wd.Ww',
		'wd.Wd..wd.Wwd.wd',
		'.d.wd..d..wd..d.',
		'.d.wd..d..d...d.',
		'.d..d..d..d...d.',
		'.d..d..d..d...d.',
		'.g..d..g..d...g.',
		'.g..g..g..g...g.',
		'.g..g..g..g...g.',
		'.g..g..g..g...g.',
	],
	PLANT_COLORS,
);
defineSpriteTile(
	'dead_bush',
	[
		'................',
		'................',
		'................',
		'..s.......s.....',
		'...s..s..s......',
		'...s..s.s...s...',
		'....s.sS...s....',
		'.s...sS..ss.....',
		'..ss..S.s.......',
		'....s.Ss........',
		'.....sS.........',
		'......S..s......',
		'......Sss.......',
		'......S.........',
		'......S.........',
		'......S.........',
	],
	PLANT_COLORS,
);
defineSpriteTile(
	'pink_flower',
	[
		'................',
		'................',
		'................',
		'................',
		'................',
		'......pP.p......',
		'.....pPyPp......',
		'......pPp.......',
		'...p...g........',
		'..pPp..g..pP....',
		'...p...gG.pyp...',
		'...g...g...p....',
		'...gG..g...g....',
		'....g.Gg..Gg....',
		'....g..g..g.....',
		'....g..g..g.....',
	],
	PLANT_COLORS,
);
