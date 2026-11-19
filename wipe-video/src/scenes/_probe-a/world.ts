import {
	B, VoxelWorld, bandBlocks, buildVoxelMeshes, cherryTree, clamp01, fbm2, hash3, hashRange, makeBands, oakTree, once,
	smooth, spruceTree, strata,
} from '../../core';

// ---------- старый мир: океан, пляж, острые горы, база ----------
export const OLD_HALF = 72; // мир 144x144
export const BAND_W = 3; // ширина полосы волны, блоки
export const DEPTH = 5; // глубина заполнения рельефа

// высота верхнего блока суши/дна; уровень моря — блок y = 0
const oldHeight = (x: number, z: number): number => {
	const d = Math.hypot(x, z);
	const n = fbm2(x * 0.045 + 10, z * 0.045 - 4, 4, 11);
	// центральный остров с базой
	const island = 3 + n * 4 - Math.max(0, d - 20) * 0.45;
	// кольцо острых гор
	const ridge = 1 - Math.abs(fbm2(x * 0.03, z * 0.03, 4, 5) * 2 - 1);
	const mask = smooth(clamp01((d - 38) / 16));
	const mountains = Math.pow(ridge, 2.2) * 46 * mask - 6;
	return Math.round(Math.max(-6, island, mountains));
};

const oldBlock = (x: number, y: number, z: number, top: number): number => {
	if (top <= 1) return y >= top - 2 ? B.sand : B.stone; // пляж и дно
	if (top >= 24) return y === top ? B.snow : B.stone; // снежные шапки
	if (top >= 13) return y === top && hash3(x, y, z, 3) < 0.25 ? B.gravel : B.stone;
	return y === top ? B.grass : y >= top - 3 ? B.dirt : B.stone;
};

export const HOUSE = {x0: 4, x1: 10, z0: -5, z1: 1};

export const getOld = once(() => {
	const world = new VoxelWorld([-OLD_HALF, -8, -OLD_HALF], [OLD_HALF - 1, 46, OLD_HALF - 1]);
	world.heightmap(oldHeight, {block: oldBlock, depth: DEPTH});
	// вода: от дна до уровня моря
	for (let z = -OLD_HALF; z < OLD_HALF; z++) {
		for (let x = -OLD_HALF; x < OLD_HALF; x++) {
			const top = world.topAt(x, z);
			if (top !== null && top < 0) world.fill(x, top + 1, z, x, 0, z, B.water);
		}
	}

	// площадка базы
	const y0 = world.topAt(7, -2) ?? 4;
	world.fill(2, y0 - 3, -7, 19, y0 - 1, 4, B.dirt);
	world.fill(2, y0, -7, 19, y0, 4, B.grass);
	world.fill(2, y0 + 1, -7, 19, y0 + 14, 4, 0);

	// домик из досок
	const {x0, x1, z0, z1} = HOUSE;
	world.fill(x0, y0, z0, x1, y0, z1, B.oakPlanks);
	world.walls(x0, y0 + 1, z0, x1, y0 + 3, z1, B.oakPlanks);
	for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) world.fill(cx, y0 + 1, cz, cx, y0 + 3, cz, B.oakLog);
	for (let i = 0; i < 4; i++) world.fill(x0 - 1 + i, y0 + 4 + i, z0 - 1 + i, x1 + 1 - i, y0 + 4 + i, z1 + 1 - i, B.darkPlanks);
	world.set(7, y0 + 1, z1, B.doorBottom).set(7, y0 + 2, z1, B.doorTop);
	world.set(5, y0 + 2, z1, B.window).set(9, y0 + 2, z1, B.window).set(x0, y0 + 2, -2, B.window).set(x1, y0 + 2, -2, B.windowLit);
	world.set(12, y0 + 1, 2, B.chest).set(13, y0 + 1, 2, B.craftingTable);

	// грядка пшеницы с канавкой воды
	world.fill(13, y0, -5, 18, y0, -1, B.farmland);
	world.fill(13, y0, -3, 18, y0, -3, B.water);
	for (let x = 13; x <= 18; x++) for (let z = -5; z <= -1; z++) if (z !== -3) world.set(x, y0 + 1, z, B.wheat);
	for (let x = 12; x <= 19; x++) world.set(x, y0 + 1, -6, B.oakFence);

	// дубы
	for (let i = 0; i < 150; i++) {
		const x = Math.round(hashRange(-OLD_HALF + 4, OLD_HALF - 5, i, 1));
		const z = Math.round(hashRange(-OLD_HALF + 4, OLD_HALF - 5, i, 2));
		if (x >= 0 && x <= 21 && z >= -9 && z <= 6) continue;
		const top = world.topAt(x, z);
		if (top !== null && world.get(x, top, z) === B.grass) oakTree(world, x, top + 1, z, {seed: i});
	}
	// цветы и трава
	const plants = [B.poppy, B.dandelion, B.cornflower, B.pinkFlower, B.tallGrass, B.tallGrass, B.tallGrass];
	for (let i = 0; i < 900; i++) {
		const x = Math.round(hashRange(-40, 40, i, 7));
		const z = Math.round(hashRange(-40, 40, i, 8));
		const top = world.topAt(x, z);
		if (top !== null && world.get(x, top, z) === B.grass) world.setIfAir(x, top + 1, z, plants[i % plants.length]);
	}

	const bands = makeBands(world, (x, _y, z) => (Math.hypot(x, z) + (fbm2(x * 0.15, z * 0.15, 2, 21) - 0.5) * 7) / BAND_W);
	const meshes = buildVoxelMeshes(world, {bands, cull: {bottom: true}});
	const shell = bandBlocks(bands);

	// высота земли без деревьев и построек (groundAt вернул бы верх кроны)
	const terrain = new Set<number>([B.grass, B.dirt, B.sand, B.stone, B.snow, B.gravel, B.farmland]);
	const size = OLD_HALF * 2;
	const ground = new Int16Array(size * size);
	for (let z = -OLD_HALF; z < OLD_HALF; z++) {
		for (let x = -OLD_HALF; x < OLD_HALF; x++) {
			let g = 1;
			for (let y = 46; y >= -8; y--) {
				if (terrain.has(world.get(x, y, z))) {
					g = y + 1;
					break;
				}
			}
			ground[(z + OLD_HALF) * size + (x + OLD_HALF)] = Math.max(g, 1); // по воде — бежит по поверхности
		}
	}
	console.log('[probe] old world', JSON.stringify(meshes.stats), 'bands', bands.max, 'shell total', shell.reduce((a, l) => a + l.length, 0), 'max per 4 bands', Math.max(...shell.map((_, i) => shell.slice(i, i + 4).reduce((a, l) => a + l.length, 0))));
	return {world, bands, meshes, shell, y0, ground};
});

// высота, на которой стоит персонаж в точке (x, z): земля без деревьев
export const oldGround = (x: number, z: number): number => {
	const ix = Math.max(-OLD_HALF, Math.min(OLD_HALF - 1, Math.floor(x)));
	const iz = Math.max(-OLD_HALF, Math.min(OLD_HALF - 1, Math.floor(z)));
	return getOld().ground[(iz + OLD_HALF) * OLD_HALF * 2 + (ix + OLD_HALF)];
};
// то же через ядро (верх кроны под деревом) — для сравнения
export const oldGroundCore = (x: number, z: number): number => getOld().world.groundAt(Math.floor(x), Math.floor(z), 1);

// ---------- новый мир: поменьше, пологий, ели, вишни, башня ----------
export const NEW_HALF = 34;
export const LAKE = {x: -13, z: 11, r: 7};

const newHeight = (x: number, z: number): number => {
	const hills = fbm2(x * 0.05 + 3, z * 0.05 + 9, 3, 31) * 6;
	const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
	const bowl = smooth(clamp01((LAKE.r + 3 - dl) / 5)) * 9;
	return Math.round(1 + hills - bowl);
};

export const getNew = once(() => {
	const world = new VoxelWorld([-NEW_HALF, -5, -NEW_HALF], [NEW_HALF - 1, 34, NEW_HALF - 1]);
	world.heightmap(newHeight, {block: strata(B.snowyGrass), depth: 4});
	// вишнёвая роща: обычная трава
	world.replace(6, -5, 8, 30, 12, 30, B.snowyGrass, B.grass);

	for (let i = 0; i < 60; i++) {
		const x = Math.round(hashRange(-NEW_HALF + 4, NEW_HALF - 5, i, 41));
		const z = Math.round(hashRange(-NEW_HALF + 4, NEW_HALF - 5, i, 42));
		const top = world.topAt(x, z);
		if (top === null) continue;
		const id = world.get(x, top, z);
		if (Math.hypot(x - 8, z + 8) < 8) continue; // место под башню
		if (id === B.snowyGrass && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + 2) spruceTree(world, x, top + 1, z, {snowy: true, height: 7 + (i % 4)});
		else if (id === B.grass) cherryTree(world, x, top + 1, z, {seed: i});
	}

	// башня из каменных кирпичей
	const ty = (world.topAt(8, -8) ?? 2) + 1;
	world.cylinder(8, ty - 3, ty + 13, -8, 4, B.stoneBricks, {hollow: true});
	world.cylinder(8, ty + 13, ty + 13, -8, 5, B.stoneBricks);
	for (let a = 0; a < 16; a++) {
		const bx = Math.round(8 + Math.cos((a / 16) * Math.PI * 2) * 5);
		const bz = Math.round(-8 + Math.sin((a / 16) * Math.PI * 2) * 5);
		if (a % 2 === 0) world.set(bx, ty + 14, bz, B.stoneBricks);
	}
	world.set(8, ty + 6, -4, B.windowLit).set(8, ty + 10, -4, B.windowLit).set(12, ty + 8, -8, B.windowLit);
	world.set(8, ty, -4, 0).set(8, ty + 1, -4, 0);
	world.replace(4, ty - 3, -12, 12, ty + 12, -4, B.stoneBricks, B.mossyStoneBricks);
	world.replace(4, ty + 3, -12, 12, ty + 13, -4, B.mossyStoneBricks, B.stoneBricks);

	const bands = makeBands(world, (x, _y, z) => (Math.hypot(x, z) + (fbm2(x * 0.15, z * 0.15, 2, 22) - 0.5) * 5) / 2);
	const meshes = buildVoxelMeshes(world, {bands, cull: {bottom: true}});
	const shell = bandBlocks(bands);
	console.log('[probe] new world', JSON.stringify(meshes.stats), 'bands', bands.max, 'shell total', shell.reduce((a, l) => a + l.length, 0), 'max per 4 bands', Math.max(...shell.map((_, i) => shell.slice(i, i + 4).reduce((a, l) => a + l.length, 0))));
	return {world, bands, meshes, shell, ty};
});
