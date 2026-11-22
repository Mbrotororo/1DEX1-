import * as THREE from 'three';
import {hash3} from './rng';
import {createWorldTextures, planksTexture, shade, toTexture} from './textures';

// Дополнительные текстуры для комнат и арен. Тоже нарисованы кодом 16x16.
const S = 16;

const wool = (base: number[], seed: number) =>
	toTexture(S, S, (x, y) => {
		// у шерсти мелкий «вязаный» узор
		const knit = (x + (y >> 1)) % 4 === 0 ? 0.92 : 1;
		const r = hash3(x, y, 30, seed);
		return shade(base, knit * (r < 0.15 ? 0.9 : r > 0.85 ? 1.06 : 1));
	});

const stoneBricks = () =>
	toTexture(S, S, (x, y) => {
	const row = y >> 2;
	const off = row % 2 === 0 ? 0 : 4;
	if (y % 4 === 3 || (x + off) % 8 === 7) return [88, 88, 88];
	const r = hash3(x, y, 31, 7);
	return shade([122, 121, 122], 0.92 + r * 0.14);
});

// буквы TNT 3x5 для боковой текстуры динамита
const TNT_LETTERS = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.', '.#..#..#..#.'];

const tntSide = () =>
	toTexture(S, S, (x, y) => {
		if (y >= 5 && y <= 10) {
			const lx = x - 2;
			const ly = y - 5;
			if (ly >= 0 && ly < 5 && lx >= 0 && lx < 12 && TNT_LETTERS[ly][lx] === '#') return [30, 30, 30];
			return y === 5 || y === 10 ? [200, 200, 200] : [232, 232, 232];
		}
		const stripe = x % 4 === 0 ? 0.8 : 1;
		return shade([219, 45, 32], stripe * (0.94 + hash3(x, y, 32, 3) * 0.1));
	});

const tntTop = () =>
	toTexture(S, S, (x, y) => {
		const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
		if (d < 1.5) return [40, 40, 40];
		if (d > 6.5) return [178, 45, 32];
		return shade([170, 170, 170], 0.9 + hash3(x, y, 33, 4) * 0.15);
	});

const bookshelf = () =>
	toTexture(S, S, (x, y) => {
		if (y === 0 || y === 15 || y === 7 || y === 8) return shade([184, 148, 95], 0.85);
		if (x === 0 || x === 15) return shade([184, 148, 95], 0.75);
		const book = Math.floor((x + (y > 7 ? 2 : 0)) / 2);
		const colors = [
			[150, 40, 40],
			[50, 80, 150],
			[70, 120, 50],
			[160, 120, 50],
			[110, 60, 130],
			[60, 60, 60],
			[170, 90, 40],
			[40, 110, 120],
		];
		const c = colors[Math.floor(hash3(book, y > 7 ? 1 : 0, 34, 5) * colors.length)];
		const top = y === 1 || y === 9;
		return shade(c, top ? 1.2 : x % 2 === 0 ? 1 : 0.85);
	});

const snow = () => toTexture(S, S, (x, y) => shade([243, 250, 252], 0.95 + hash3(x, y, 35, 6) * 0.06));

const glowstone = () =>
	toTexture(S, S, (x, y) => {
		const r = hash3(x >> 1, y >> 1, 36, 8);
		const base = r < 0.3 ? [254, 224, 140] : r < 0.6 ? [204, 156, 80] : [250, 200, 110];
		return shade(base, 0.95 + hash3(x, y, 37, 8) * 0.1);
	});

const blackConcrete = () => toTexture(S, S, (x, y) => shade([22, 24, 30], 0.95 + hash3(x, y, 38, 9) * 0.1));

const chestSide = () =>
	toTexture(S, S, (x, y) => {
		if (y === 0 || y === 15 || x === 0 || x === 15 || y === 5) return [70, 45, 18];
		if (y >= 4 && y <= 7 && x >= 7 && x <= 8) return [200, 200, 210];
		return shade([160, 110, 50], 0.92 + hash3(x >> 2, y, 39, 10) * 0.14);
	});

const chestTop = () =>
	toTexture(S, S, (x, y) => {
		if (y === 0 || y === 15 || x === 0 || x === 15) return [70, 45, 18];
		return shade([160, 110, 50], 0.92 + hash3(x >> 2, y, 40, 11) * 0.14);
	});

// стекло с прозрачной серединой: сквозь окно видно небо (HTML-фон за 3D)
const clearGlass = () =>
	toTexture(S, S, (x, y) => {
		if (x === 0 || y === 0 || x === 15 || y === 15) return [222, 238, 248, 255];
		if ((x + y) % 9 === 0 || (x + y) % 9 === 1) return [255, 255, 255, 90];
		return [190, 225, 250, 26];
	});

export const createTextures = () => {
	const world = createWorldTextures();
	return {
		...world,
		spruce: planksTexture([115, 85, 52], 41),
		woolRed: wool([161, 39, 34], 42),
		woolWhite: wool([234, 236, 237], 43),
		woolPurple: wool([122, 42, 173], 44),
		woolOrange: wool([240, 118, 19], 45),
		woolGray: wool([62, 68, 71], 46),
		stoneBricks: stoneBricks(),
		tntSide: tntSide(),
		tntTop: tntTop(),
		bookshelf: bookshelf(),
		snow: snow(),
		glowstone: glowstone(),
		black: blackConcrete(),
		chestSide: chestSide(),
		chestTop: chestTop(),
		clearGlass: clearGlass(),
	};
};

export type Textures = ReturnType<typeof createTextures>;

const basic = (map: THREE.Texture, opts: THREE.MeshBasicMaterialParameters = {}) =>
	new THREE.MeshBasicMaterial({map, vertexColors: true, ...opts});

// Материалы блоков. Порядок граней куба: +x, -x, +y (верх), -y (низ), +z, -z
export const makeBlockMaterials = (tex: Textures) => {
	const grassSide = basic(tex.grassSide);
	const logSide = basic(tex.logSide);
	const logTop = basic(tex.logTop);
	const tntSide = basic(tex.tntSide);
	const tntTop = basic(tex.tntTop);
	const bookshelf = basic(tex.bookshelf);
	const planks = basic(tex.planks);
	const chestSide = basic(tex.chestSide);
	return {
		grass: [grassSide, grassSide, basic(tex.grassTop), basic(tex.dirt), grassSide, grassSide],
		dirt: basic(tex.dirt),
		stone: basic(tex.stone),
		cobble: basic(tex.cobble),
		log: [logSide, logSide, logTop, logTop, logSide, logSide],
		leaves: basic(tex.leaves),
		planks,
		darkPlanks: basic(tex.darkPlanks),
		spruce: basic(tex.spruce),
		stoneBricks: basic(tex.stoneBricks),
		woolRed: basic(tex.woolRed),
		woolWhite: basic(tex.woolWhite),
		woolPurple: basic(tex.woolPurple),
		woolOrange: basic(tex.woolOrange),
		woolGray: basic(tex.woolGray),
		tnt: [tntSide, tntSide, tntTop, tntTop, tntSide, tntSide],
		bookshelf: [bookshelf, bookshelf, planks, planks, bookshelf, bookshelf],
		snow: basic(tex.snow),
		glowstone: new THREE.MeshBasicMaterial({map: tex.glowstone}),
		black: basic(tex.black),
		chest: [chestSide, chestSide, basic(tex.chestTop), basic(tex.chestTop), chestSide, chestSide],
		glass: basic(tex.clearGlass, {transparent: true, depthWrite: false}),
		ore: basic(tex.ores.diamond),
	} satisfies Record<string, THREE.Material | THREE.Material[]>;
};

export type BlockMaterials = ReturnType<typeof makeBlockMaterials>;
export type BlockType = keyof BlockMaterials;
