import {clamp01, easeInOutCubic, easeOutCubic} from './anim';
import {hash3} from './rng';
import {T, WATER_MAX, WATER_SHALLOW} from './timeline';

// ---------------- Небольшой обычный мир ----------------
// Остров 14x14 блоков. Блок с индексом (x, y, z) занимает куб [x..x+1].
// Поверхность травы — на высоте y = 0.
export const HALF = 7;
export const DEPTH = 9;

export type BlockType =
	| 'grass'
	| 'dirt'
	| 'stone'
	| 'coal'
	| 'iron'
	| 'gold'
	| 'diamond'
	| 'redstone'
	| 'log'
	| 'leaves'
	| 'planks'
	| 'darkPlanks'
	| 'cobble'
	| 'glass'
	| 'doorTop'
	| 'doorBottom';

export type Block = {type: BlockType; x: number; y: number; z: number; appearAt: number};

export type PlantKind = 'poppy' | 'dandelion' | 'cornflower' | 'tallGrass';
export type Plant = {kind: PlantKind; x: number; z: number; appearAt: number; washAt: number};

// Где стоит игрок (центр клетки)
export const PLAYER_POS = {x: 2.5, z: 2.5};
// Где пасётся свинка и где стоят факелы у домика
export const PIG_POS = {x: -1.5, z: 4.5};
export const TORCHES: {x: number; z: number}[] = [
	{x: 1.5, z: -1.5},
	{x: 4.5, z: -1.5},
];
// Над этой точкой висит логотип и отсюда растекается вода
export const SOURCE_POS = {x: 0, z: 0};

const TREES = [
	{x: -4, z: -4, trunk: 5},
	{x: -5, z: 3, trunk: 4},
];
const HOUSE = {x0: 1, x1: 5, z0: -6, z1: -3};

// Когда вода доходит до клетки (x, z)
export const waterArrival = (x: number, z: number) =>
	T.waterStart + (Math.abs(x + 0.5) + Math.abs(z + 0.5) - 1) * T.cellDt;

// Общий уровень воды, когда мир начинает заполняться
export const waterLevel = (t: number) => {
	if (t <= T.riseStart) return WATER_SHALLOW;
	const k = easeInOutCubic(clamp01((t - T.riseStart) / (T.riseEnd - T.riseStart)));
	return WATER_SHALLOW + (WATER_MAX - WATER_SHALLOW) * k;
};

// Высота воды в клетке (0 = воды ещё нет)
export const waterTopAt = (x: number, z: number, t: number) => {
	const tau = t - waterArrival(x, z);
	if (tau <= 0) return 0;
	if (t >= T.riseStart) return waterLevel(t);
	return WATER_SHALLOW * easeOutCubic(tau / 0.3);
};

const buildWorld = () => {
	const blocks: Block[] = [];
	const taken = new Set<string>();
	const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
	const put = (type: BlockType, x: number, y: number, z: number, appearAt: number) => {
		const k = key(x, y, z);
		if (taken.has(k)) return;
		taken.add(k);
		blocks.push({type, x, y, z, appearAt});
	};

	// --- сам остров: трава, земля, камень с рудами (только видимая оболочка) ---
	for (let x = -HALF; x < HALF; x++) {
		for (let z = -HALF; z < HALF; z++) {
			const dirtDepth = 2 + Math.floor(hash3(x, 0, z, 1) * 2.2);
			for (let y = -1; y >= -DEPTH; y--) {
				const shell =
					x === -HALF || x === HALF - 1 || z === -HALF || z === HALF - 1 || y === -1 || y === -DEPTH;
				if (!shell) continue;
				let type: BlockType = 'stone';
				if (y === -1) type = 'grass';
				else if (y >= -1 - dirtDepth) type = 'dirt';
				else {
					const r = hash3(x, y, z, 2);
					const deep = -y / DEPTH;
					if (r < 0.07) type = 'coal';
					else if (r < 0.12) type = 'iron';
					else if (r < 0.145 && deep > 0.6) type = 'gold';
					else if (r < 0.175 && deep > 0.65) type = 'redstone';
					else if (r < 0.2 && deep > 0.75) type = 'diamond';
				}
				const layer = y + DEPTH;
				const appearAt =
					T.islandStart + layer * 0.115 + hash3(x, y, z, 3) * 0.14 + (Math.abs(x) + Math.abs(z)) * 0.006;
				put(type, x, y, z, appearAt);
			}
		}
	}

	// --- деревья ---
	TREES.forEach((tree, ti) => {
		const base = T.trees + ti * 0.18;
		for (let y = 0; y < tree.trunk; y++) {
			put('log', tree.x, y, tree.z, base + y * 0.06);
		}
		const top = tree.trunk - 1;
		for (let dy = -1; dy <= 2; dy++) {
			const radius = dy <= 0 ? 2 : 1;
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dz = -radius; dz <= radius; dz++) {
					const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
					if (corner && (dy === 2 || hash3(tree.x + dx, dy, tree.z + dz, 4 + ti) < 0.55)) continue;
					const lx = tree.x + dx;
					const lz = tree.z + dz;
					if (lx < -HALF || lx >= HALF || lz < -HALF || lz >= HALF) continue;
					put(
						'leaves',
						lx,
						top + dy,
						lz,
						base + 0.28 + (dy + 1) * 0.07 + hash3(lx, dy, lz, 5) * 0.16,
					);
				}
			}
		}
	});

	// --- домик ---
	const h = HOUSE;
	for (let y = 0; y <= 2; y++) {
		for (let x = h.x0; x <= h.x1; x++) {
			for (let z = h.z0; z <= h.z1; z++) {
				const onX = x === h.x0 || x === h.x1;
				const onZ = z === h.z0 || z === h.z1;
				if (!onX && !onZ) continue;
				let type: BlockType = onX && onZ ? 'log' : 'planks';
				if (z === h.z1 && x === 3) type = y === 0 ? 'doorBottom' : y === 1 ? 'doorTop' : 'planks';
				if (y === 1 && z === h.z1 && (x === 2 || x === 4)) type = 'glass';
				if (y === 1 && x === h.x1 && (z === -5 || z === -4)) type = 'glass';
				put(type, x, y, z, T.house + y * 0.11 + hash3(x, y, z, 6) * 0.1);
			}
		}
	}
	// крыша ступеньками
	for (let step = 0; step < 3; step++) {
		for (let x = h.x0 - 1 + step; x <= h.x1 + 1 - step; x++) {
			for (let z = h.z0 - 1 + step; z <= h.z1 + 1 - step; z++) {
				put('darkPlanks', x, 3 + step, z, T.house + 0.36 + step * 0.1 + hash3(x, step, z, 7) * 0.1);
			}
		}
	}

	// --- цветы и трава ---
	const plants: Plant[] = [];
	const free = (x: number, z: number) => {
		if (TREES.some((t) => t.x === x && t.z === z)) return false;
		if (x >= h.x0 - 1 && x <= h.x1 + 1 && z >= h.z0 - 1 && z <= h.z1 + 1) return false;
		// место для игрока и лодки
		if (Math.abs(x + 0.5 - PLAYER_POS.x) < 2.2 && Math.abs(z + 0.5 - PLAYER_POS.z) < 2.2) return false;
		// место для свинки
		if (Math.abs(x + 0.5 - PIG_POS.x) < 1.6 && Math.abs(z + 0.5 - PIG_POS.z) < 1.6) return false;
		// место, куда бьёт луч
		if (Math.abs(x + 0.5) < 1.2 && Math.abs(z + 0.5) < 1.2) return false;
		return true;
	};
	for (let x = -HALF; x < HALF; x++) {
		for (let z = -HALF; z < HALF; z++) {
			if (!free(x, z)) continue;
			const r = hash3(x, 0, z, 8);
			if (r > 0.34) continue;
			const k = hash3(x, 1, z, 9);
			const kind: PlantKind =
				r < 0.2 ? 'tallGrass' : k < 0.4 ? 'poppy' : k < 0.75 ? 'dandelion' : 'cornflower';
			plants.push({
				kind,
				x,
				z,
				appearAt: T.plants + hash3(x, 2, z, 10) * 0.35,
				washAt: waterArrival(x, z) + 0.1,
			});
		}
	}

	return {blocks, plants};
};

export const WORLD = buildWorld();
