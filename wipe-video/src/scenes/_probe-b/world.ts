import {B, VoxelWorld, buildVoxelMeshes, collectLights, fbm2, hash3, newYearTree, once, spruceTree, strata, type BlockInst, type Vec3} from '../../core';

// --- Подземелье: зал 24x8x24, коридор с лестницей, комната хранилища за воротами ---

export const ROOM = {x0: -12, x1: 11, z0: -12, z1: 11, floor: 0, top: 8};
export const GATE: Vec3 = [-2, 1, -13];
export const VAULT_POS: Vec3 = [0.5, 2, -18.5];
export const SPAWNER_POS: Vec3 = [-5.5, 1, -4.5];
export const LEDGE: Vec3 = [8.5, 4, -9.5];

// факелы коридора: клетка и направление от стены
export const TORCHES: {pos: Vec3; wall: [number, number]}[] = [
	{pos: [1.5, 3, 14.5], wall: [-1, 0]},
	{pos: [-1.5, 3, 17.5], wall: [1, 0]},
	{pos: [1.5, 6, 21.5], wall: [-1, 0]},
	{pos: [-1.5, 9, 25.5], wall: [1, 0]},
];
export const LANTERNS: Vec3[] = [
	[-3.5, 7, -15.5],
	[4.5, 7, -21.5],
];

const STAGES = [B.copper, B.exposedCopper, B.weatheredCopper, B.oxidizedCopper];
const CUT = [B.cutCopper, B.exposedCutCopper, B.weatheredCutCopper, B.oxidizedCutCopper];

export const getDungeon = once(() => {
	const w = new VoxelWorld([-16, -2, -25], [15, 13, 30]);
	// сплошной туф, из него вырезаются помещения
	w.fill(-16, -2, -25, 15, 13, 30, B.tuff);
	const {x0, x1, z0, z1, top} = ROOM;
	w.fill(x0, 1, z0, x1, top, z1, B.air);

	// пол: туфовые кирпичи с медными дорожками
	for (let x = x0; x <= x1; x++) {
		for (let z = z0; z <= z1; z++) {
			const h = hash3(x, 0, z, 11);
			let id: number = B.tuffBricks;
			if ((x + 100) % 6 === 0 || (z + 100) % 6 === 0) id = CUT[Math.floor(h * 4)];
			else if (h > 0.93) id = B.chiseledTuff;
			w.set(x, 0, z, id);
			// потолок
			w.set(x, top + 1, z, (x + z + 200) % 5 === 0 ? B.oxidizedCutCopper : B.tuffBricks);
		}
	}
	// стены: пояса меди разной окисленности, лампы, решётки
	const wallBlock = (a: number, y: number): number => {
		const h = hash3(a, y, 7, 3);
		if (y === 1) return B.chiseledTuff;
		if (y === 4) return STAGES[Math.floor(h * 4)];
		if (y === 7) return CUT[2 + Math.floor(h * 2)];
		if (y === 5 && (a + 120) % 6 === 0) return h > 0.5 ? B.copperBulbLit : B.oxidizedCopperBulbLit;
		if (y === 3 && (a + 123) % 6 === 0) return B.copperGrate;
		return B.tuffBricks;
	};
	for (let y = 1; y <= top; y++) {
		for (let x = x0; x <= x1; x++) {
			w.set(x, y, z0 - 1, wallBlock(x, y));
			w.set(x, y, z1 + 1, wallBlock(x + 50, y));
		}
		for (let z = z0; z <= z1; z++) {
			w.set(x0 - 1, y, z, wallBlock(z + 100, y));
			w.set(x1 + 1, y, z, wallBlock(z + 150, y));
		}
	}
	// колонны: медь зеленеет кверху
	for (const [px, pz] of [
		[-11, -11],
		[-11, 9],
		[9, 9],
	]) {
		for (let y = 1; y <= top; y++) {
			const stage = Math.min(3, Math.floor(((y - 1) / top) * 4 + hash3(px, y, pz, 5) * 0.8));
			w.fill(px, y, pz, px + 1, y, pz + 1, y === 1 || y === top ? B.chiseledCopper : STAGES[stage]);
		}
	}
	// лампы в потолке
	for (const [lx, lz] of [
		[-4, -4],
		[3, -4],
		[-4, 3],
		[3, 3],
		[0, 0],
	]) {
		w.set(lx, top + 1, lz, B.copperBulbLit);
	}
	// уступ лучника
	w.fill(7, 1, -12, 11, 3, -8, B.tuffBricks);
	w.fill(7, 3, -12, 11, 3, -8, B.cutCopper);
	w.set(7, 3, -8, B.oxidizedCopperBulbLit);
	// решётка в полу (под ней пусто)
	w.fill(-2, 0, -2, 1, 0, 1, B.weatheredCopperGrate);
	w.fill(-2, -1, -2, 1, -1, 1, B.air);
	// железные прутья-ограждение у спавнера
	w.fill(-9, 1, -2, -9, 2, 1, B.ironBars);

	// коридор и лестница вверх
	w.fill(-2, 1, 12, 1, 4, 18, B.air);
	for (let i = 0; i <= 6; i++) {
		const z = 19 + i;
		w.fill(-2, i + 1, z, 1, i + 5, z, B.air);
		w.fill(-2, 1, z, 1, i, z, B.tuffBricks);
		w.fill(-2, i, z, 1, i, z, i % 2 ? B.cutCopper : B.tuffBricks);
	}
	w.fill(-2, 8, 26, 1, 11, 29, B.air);
	w.fill(-2, 7, 26, 1, 7, 29, B.tuffBricks);
	// стены коридора
	for (let z = 12; z <= 29; z++) {
		for (let y = 1; y <= 12; y++) {
			for (const x of [-3, 2]) {
				if (w.get(x, y, z) === B.tuff) w.set(x, y, z, hash3(x, y, z, 9) > 0.8 ? B.exposedCopper : B.tuffBricks);
			}
		}
	}

	// проём ворот и комната хранилища
	w.fill(-2, 1, -13, 1, 4, -13, B.air);
	w.fill(-5, 1, -23, 4, 6, -14, B.air);
	for (let x = -5; x <= 4; x++) {
		for (let z = -23; z <= -14; z++) {
			w.set(x, 0, z, (x + z + 100) % 2 ? B.cutCopper : B.exposedCutCopper);
			w.set(x, 7, z, B.oxidizedCutCopper);
		}
	}
	for (let y = 1; y <= 6; y++) {
		for (let x = -5; x <= 4; x++) w.set(x, y, -24, y === 3 ? B.chiseledCopper : B.tuffBricks);
		for (let z = -23; z <= -14; z++) {
			w.set(-6, y, z, y === 3 ? B.weatheredChiseledCopper : B.tuffBricks);
			w.set(5, y, z, y === 3 ? B.oxidizedChiseledCopper : B.tuffBricks);
		}
	}
	// постамент и золото
	w.fill(-1, 1, -20, 1, 1, -18, B.cutCopper);
	w.fill(-4, 1, -23, -3, 1, -22, B.goldBlock);
	w.set(-4, 2, -23, B.goldBlock);
	w.fill(3, 1, -23, 4, 1, -22, B.goldBlock);
	w.set(4, 2, -22, B.goldBlock);
	w.set(-5, 4, -19, B.copperBulbLit);
	w.set(4, 4, -19, B.copperBulbLit);

	const lights = [
		...collectLights(w, (id) => {
			if (id === B.copperBulbLit) return {radius: 8, color: '#ffb468', intensity: 1};
			if (id === B.oxidizedCopperBulbLit) return {radius: 7, color: '#8fe6c8', intensity: 0.9};
			return null;
		}),
		...TORCHES.map((tc) => ({pos: [tc.pos[0], tc.pos[1] + 0.6, tc.pos[2]] as Vec3, radius: 8, color: '#ffa858', intensity: 1.1})),
		...LANTERNS.map((p) => ({pos: [p[0], p[1] - 1.6, p[2]] as Vec3, radius: 8, color: '#ffc070', intensity: 1})),
	];
	const meshes = buildVoxelMeshes(w, {
		ambient: 0.22,
		ambientColor: '#b9a08a',
		lights,
		shadows: true,
		ao: 1,
		cull: {bottom: true, sides: true, top: true},
	});
	console.log(`[probe-b] подземелье: ${JSON.stringify(meshes.stats)}, источников ${lights.length}`);
	return {world: w, meshes, lights};
});

// --- Улица: заснеженная поляна, ёлка ---

export const ICE_CENTER: Vec3 = [5.5, 1, 0.5];
export const ICE_RADIUS = 5.5;
export const TREE_AT: Vec3 = [-9, 1, -12];
// точка телепорта (высота уточняется по рельефу при постройке)
export const GRIEF_B: Vec3 = [27.5, 1, -5.5];

export const getOutdoor = once(() => {
	const w = new VoxelWorld([-44, -3, -44], [44, 26, 44]);
	const height = (x: number, z: number) => {
		const d = Math.hypot(x - 2, z);
		const hills = Math.round(fbm2(x * 0.045, z * 0.045, 3, 4) * 9 - 3);
		// ровная площадка в центре
		const k = Math.min(1, Math.max(0, (d - 13) / 10));
		return Math.round(hills * k);
	};
	w.heightmap(height, {block: strata(B.snowyGrass), depth: 3});
	for (let i = 0; i < 70; i++) {
		const x = Math.round(-40 + hash3(i, 1, 0, 8) * 80);
		const z = Math.round(-40 + hash3(i, 2, 0, 8) * 80);
		if (Math.hypot(x - 2, z) < 14) continue;
		const top = w.topAt(x, z);
		if (top !== null) spruceTree(w, x, top + 1, z, {snowy: true});
	}
	const tree = newYearTree(w, TREE_AT[0], w.groundAt(TREE_AT[0], TREE_AT[2]), TREE_AT[2], {height: 12, radius: 4, snowy: true});
	// блоки ледяного пятна: вынимаем из мира, рисуем отдельно
	const iceBlocks: BlockInst[] = [];
	for (let x = -2; x <= 12; x++) {
		for (let z = -7; z <= 7; z++) {
			if (Math.hypot(x + 0.5 - ICE_CENTER[0], z + 0.5 - ICE_CENTER[2]) > ICE_RADIUS) continue;
			const top = w.topAt(x, z);
			if (top === null) continue;
			iceBlocks.push({x, y: top, z, id: w.get(x, top, z)});
		}
	}
	const dusk = buildVoxelMeshes(w, {cull: {bottom: true, sides: true}});
	const night = buildVoxelMeshes(w, {
		ambient: 0.4,
		ambientColor: '#8d9cff',
		lights: [{pos: [TREE_AT[0] + 0.5, 6, TREE_AT[2] + 0.5], radius: 14, color: '#ffd9a0', intensity: 1}],
		cull: {bottom: true, sides: true},
	});
	// вариант с вынутым пятном (для закатной части)
	const holed = w.clone();
	for (const b of iceBlocks) holed.set(b.x, b.y, b.z, B.air);
	const duskHoled = buildVoxelMeshes(holed, {cull: {bottom: true, sides: true}});
	GRIEF_B[1] = w.groundAt(GRIEF_B[0], GRIEF_B[2]);
	console.log(`[probe-b] улица: ${JSON.stringify(dusk.stats)}, пятно ${iceBlocks.length} блоков`);
	return {world: w, dusk, duskHoled, night, tree, iceBlocks};
});
