import {B, VoxelWorld, bandBlocks, birchTree, buildVoxelMeshes, cherryTree, fbm2, hash3, makeBands, oakTree, once, smooth, spruceTree} from '../../core';

// Миры демо-сцены. Всё тяжёлое строится один раз при первом обращении (once).

export const ISLAND_R = 34;

const islandHeight = (x: number, z: number) => {
	const d = Math.hypot(x, z);
	const hills = fbm2(x * 0.055 + 3, z * 0.055 + 7, 3, 5) * 9 - 3;
	// в центре ровная площадка, у (15, 9) — чаша озера
	const flat = smooth((d - 5) / 9);
	const lake = Math.exp(-((x - 15) ** 2 + (z - 9) ** 2) / 55) * 6;
	return Math.round(hills * flat - lake);
};

export const getIsland = once(() => {
	const world = new VoxelWorld([-38, -12, -38], [37, 26, 37]);
	const edge = (x: number, z: number) => ISLAND_R + (fbm2(x * 0.1, z * 0.1, 2, 9) - 0.5) * 8;
	world.heightmap(islandHeight, {
		block: (x, y, z, top) => {
			const d = Math.hypot(x, z);
			const r = edge(x, z);
			if (d > r) return 0;
			// низ острова — неровная «чаша»
			const under = -3 - (1 - (d / r) ** 2) * 8 + hash3(x, 0, z, 3) * 2;
			if (y < under) return 0;
			const sandy = top <= -1 && Math.hypot(x - 15, z - 9) < 9;
			if (y === top) return sandy ? B.sand : B.grass;
			if (y >= top - 3) return sandy ? B.sand : B.dirt;
			const ore = hash3(x, y, z, 4);
			return ore < 0.03 ? B.coalOre : ore < 0.05 ? B.ironOre : ore < 0.058 ? B.diamondOre : B.stone;
		},
	});
	// озеро: вода до уровня -1
	for (let x = 4; x <= 26; x++) {
		for (let z = -2; z <= 20; z++) {
			const top = world.topAt(x, z);
			if (top === null) continue;
			for (let y = top + 1; y <= -1; y++) world.set(x, y, z, B.water);
		}
	}
	// деревья четырёх пород и цветы
	const ground = (x: number, z: number) => world.groundAt(x, z, 0);
	for (let x = -30; x <= 30; x += 1) {
		for (let z = -30; z <= 30; z += 1) {
			const top = world.topAt(x, z);
			if (top === null || world.get(x, top, z) !== B.grass) continue;
			const d = Math.hypot(x, z);
			if (d < 9 || d > 29) continue;
			const r = hash3(x, 7, z, 11);
			if (r < 0.012) {
				const kind = Math.atan2(z, x);
				if (kind > 1.6) spruceTree(world, x, top + 1, z, {snowy: true, height: 7 + Math.floor(hash3(x, 1, z, 12) * 3)});
				else if (kind > 0.2) birchTree(world, x, top + 1, z);
				else if (kind > -1.4) cherryTree(world, x, top + 1, z);
				else oakTree(world, x, top + 1, z);
			} else if (r < 0.1 && world.get(x, top + 1, z) === 0) {
				const f = hash3(x, 2, z, 13);
				world.set(x, top + 1, z, f < 0.5 ? B.tallGrass : f < 0.65 ? B.poppy : f < 0.8 ? B.dandelion : f < 0.9 ? B.cornflower : B.pinkFlower);
			}
		}
	}
	// домик у центра: брёвна по углам, доски, окна, дверь, ступенчатая крыша
	const hx = -8;
	const hz = -7;
	const gy = ground(hx + 2, hz + 2);
	world.fill(hx - 1, gy - 1, hz - 1, hx + 5, gy - 1, hz + 4, B.cobble);
	for (let y = 0; y < 3; y++) {
		world.walls(hx, gy + y, hz, hx + 4, gy + y, hz + 3, B.oakPlanks);
		for (const [cx, cz] of [
			[hx, hz],
			[hx + 4, hz],
			[hx, hz + 3],
			[hx + 4, hz + 3],
		])
			world.set(cx, gy + y, cz, B.oakLog);
	}
	// дверной проём пустой: саму дверь рисует <Door/> (она открывается)
	world.fill(hx + 2, gy, hz + 3, hx + 2, gy + 1, hz + 3, 0);
	world.set(hx + 1, gy + 1, hz + 3, B.window).set(hx + 3, gy + 1, hz + 3, B.window).set(hx + 4, gy + 1, hz + 1, B.windowLit);
	for (let step = 0; step < 3; step++) world.fill(hx - 1 + step, gy + 3 + step, hz - 1 + step, hx + 5 - step, gy + 3 + step, hz + 4 - step, B.darkPlanks);
	// двор: сундук, верстак, полка, сено, грядка, дорожка, забор, полублоки
	world.set(hx + 7, gy, hz + 3, B.craftingTable).set(hx + 8, gy, hz + 3, B.bookshelf).set(hx + 6, gy, hz + 1, B.hay);
	for (let x = 0; x < 4; x++) {
		for (let z = 0; z < 3; z++) {
			world.set(-2 + x, gy - 1, -9 + z, B.farmland);
			world.set(-2 + x, gy, -9 + z, B.wheat);
		}
	}
	for (let z = -3; z <= 6; z++) world.set(hx + 2, ground(hx + 2, z) - 1, z, B.path);
	for (let x = -3; x <= 2; x++) world.set(x, gy, -10, B.oakFence);
	world.set(4, ground(4, -4), -4, B.stoneBrickSlab).set(5, ground(5, -4), -4, B.stoneBricks).set(6, ground(6, -4), -4, B.mossyStoneBricks).set(7, ground(7, -4), -4, B.glowstone);
	world.set(5, ground(5, -4), -4, B.redCarpet);

	// полосы: кольца от центра к краю, край неровный
	const bands = makeBands(world, (x, _y, z) => (Math.hypot(x, z) + (fbm2(x * 0.15, z * 0.15, 2, 21) - 0.5) * 7) / 1.7);
	const meshes = buildVoxelMeshes(world, {bands});
	const shell = bandBlocks(bands);
	return {world, bands, meshes, shell, ground, house: [hx, gy, hz] as [number, number, number]};
});

// Комната подземелья: медь, туф, запечённый свет от ламп и факелов
export const DUNGEON = {x0: -7, x1: 7, z0: -6, z1: 6, h: 6};

export const getDungeon = once(() => {
	const {x0, x1, z0, z1, h} = DUNGEON;
	const world = new VoxelWorld([x0 - 2, -2, z0 - 2], [x1 + 2, h + 1, z1 + 6]);
	world.fill(x0 - 1, -1, z0 - 1, x1 + 1, h, z1 + 5, B.tuffBricks);
	world.fill(x0, 0, z0, x1, h - 1, z1, 0);
	// пол в шашечку, стены с поясами
	for (let x = x0; x <= x1; x++) {
		for (let z = z0; z <= z1; z++) world.set(x, -1, z, (x + z) % 2 === 0 ? B.oxidizedCutCopper : B.weatheredCutCopper);
	}
	for (let x = x0 - 1; x <= x1 + 1; x++) {
		for (const z of [z0 - 1, z1 + 1]) {
			world.set(x, 0, z, B.chiseledTuff);
			world.set(x, 3, z, x % 3 === 0 ? B.copperBulbLit : B.exposedCopper);
			world.set(x, h - 1, z, B.chiseledCopper);
		}
	}
	for (let z = z0; z <= z1; z++) {
		for (const x of [x0 - 1, x1 + 1]) {
			world.set(x, 0, z, B.chiseledTuff);
			world.set(x, 3, z, z % 3 === 0 ? B.oxidizedCopperBulbLit : B.weatheredCopper);
			world.set(x, h - 1, z, B.oxidizedChiseledCopper);
		}
	}
	// колонны, решётки, прутья
	for (const [cx, cz] of [
		[x0 + 2, z0 + 2],
		[x1 - 2, z0 + 2],
		[x0 + 2, z1 - 2],
		[x1 - 2, z1 - 2],
	]) {
		world.fill(cx, 0, cz, cx, h - 1, cz, B.cutCopper);
		world.set(cx, 2, cz, B.oxidizedCopperGrate).set(cx, 0, cz, B.deepslateBricks);
	}
	for (let x = -1; x <= 1; x++) world.set(x, 0, z0, B.ironBars).set(x, 1, z0, B.ironBars);
	// проём в дальней стене (его закрывает решётка-ворота) и коридор за ним
	world.fill(-1, 0, z1 + 1, 1, 2, z1 + 4, 0);
	world.fill(-1, -1, z1 + 1, 1, -1, z1 + 4, B.cutCopper);
	// золото и постамент
	world.set(4, 0, -3, B.goldBlock).set(5, 0, -3, B.goldBlock).set(4, 1, -3, B.goldBlock).set(-5, 0, -4, B.obsidian).set(-5, 0, 3, B.bedrock);
	world.fill(-1, 0, -1, 1, 0, 1, B.tuffBricks);
	world.set(0, 0, 0, B.chiseledTuff);
	// бассейн в полу (поверхность рисует WaterSurface)
	world.fill(3, -1, 2, 5, -1, 4, 0);
	world.fill(3, -2, 2, 5, -2, 4, B.oxidizedCopper);
	const lights = [
		...[x0 + 2, x1 - 2].flatMap((x) => [z0 + 2, z1 - 2].map((z) => ({pos: [x + 0.5, 3.5, z + (z < 0 ? 1.5 : -0.5)] as [number, number, number], radius: 9, color: '#ffa858', intensity: 1.1}))),
		{pos: [0.5, 4.5, 0.5] as [number, number, number], radius: 8, color: '#ffd27a', intensity: 0.7},
		{pos: [0.5, 1.5, z1 + 3.5] as [number, number, number], radius: 6, color: '#7fe0c8', intensity: 0.9},
	];
	const meshes = buildVoxelMeshes(world, {ambient: 0.22, ambientColor: '#b9a08a', lights, cull: {bottom: true, sides: true, top: true}});
	return {world, meshes, lights};
});
