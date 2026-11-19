import {tileIndex, WOOL_COLORS} from './tiles';

// Реестр блоков. Блок — это номер (id) + описание: какие тайлы на гранях,
// в каком слое рисуется и какой формы. id = 0 — воздух.
// ЧИСТЫЙ модуль (без three).

export type BlockLayer = 'opaque' | 'cutout' | 'translucent';
// cube — полный куб; cross — растение из двух скрещённых плоскостей;
// pane — тонкая решётка, соединяется с соседями; box — произвольный параллелепипед внутри клетки
export type BlockShape = 'cube' | 'cross' | 'pane' | 'box';

export type BlockSpec = {
	// один тайл на все грани
	all?: string;
	// или по группам: верх / низ / бока
	top?: string;
	bottom?: string;
	side?: string;
	// или точечно: +x, -x, +z, -z
	px?: string;
	nx?: string;
	pz?: string;
	nz?: string;
	layer?: BlockLayer;
	shape?: BlockShape;
	// для shape: 'box' — [x0, y0, z0, x1, y1, z1] в долях клетки (0..1)
	box?: [number, number, number, number, number, number];
	// яркость «собственного свечения» 0..1: блок не темнеет от запечённого света
	emissive?: number;
	// можно ли засыпать блок снегом (VoxelMesh snowCover); по умолчанию — да для кубов
	snow?: boolean;
};

export type BlockDef = {
	id: number;
	name: string;
	// тайлы граней в порядке +x, -x, +y, -y, +z, -z
	faces: number[];
	layer: BlockLayer;
	shape: BlockShape;
	box: [number, number, number, number, number, number];
	// полный непрозрачный куб: закрывает грани соседей и даёт тень в углах (AO)
	occludes: boolean;
	emissive: number;
	snow: boolean;
};

const AIR: BlockDef = {
	id: 0,
	name: 'air',
	faces: [0, 0, 0, 0, 0, 0],
	layer: 'opaque',
	shape: 'cube',
	box: [0, 0, 0, 1, 1, 1],
	occludes: false,
	emissive: 0,
	snow: false,
};

export const BLOCKS: BlockDef[] = [AIR];
const BY_NAME = new Map<string, BlockDef>([['air', AIR]]);
// быстрые таблицы для мешера
export const OCCLUDES: boolean[] = [false];

// Зарегистрировать блок, вернуть его id. Можно вызывать и из своей сцены/набора
// (на верхнем уровне модуля, вместе с defineTile для своих текстур).
export const defineBlock = (name: string, spec: BlockSpec): number => {
	if (BY_NAME.has(name)) throw new Error(`Блок "${name}" уже есть`);
	if (BLOCKS.length >= 255) throw new Error('Слишком много блоков (максимум 254)');
	const side = spec.side ?? spec.all;
	const names = [spec.px ?? side, spec.nx ?? side, spec.top ?? spec.all ?? side, spec.bottom ?? spec.all ?? spec.top ?? side, spec.pz ?? side, spec.nz ?? side];
	if (names.some((n) => n === undefined)) throw new Error(`Блок "${name}": не заданы тайлы`);
	const shape = spec.shape ?? 'cube';
	const layer = spec.layer ?? (shape === 'cube' || shape === 'box' ? 'opaque' : 'cutout');
	const def: BlockDef = {
		id: BLOCKS.length,
		name,
		faces: names.map((n) => tileIndex(n as string)),
		layer,
		shape,
		box: spec.box ?? [0, 0, 0, 1, 1, 1],
		occludes: shape === 'cube' && layer === 'opaque',
		emissive: spec.emissive ?? 0,
		snow: spec.snow ?? (shape === 'cube' && layer === 'opaque' && !spec.emissive),
	};
	BLOCKS.push(def);
	OCCLUDES.push(def.occludes);
	BY_NAME.set(name, def);
	return def.id;
};

export const blockByName = (name: string): BlockDef => {
	const def = BY_NAME.get(name);
	if (!def) throw new Error(`Нет блока "${name}"`);
	return def;
};
export const blockName = (id: number) => BLOCKS[id]?.name ?? '?';

// ---------- стандартный набор ----------
const slabBottom: BlockSpec['box'] = [0, 0, 0, 1, 0.5, 1];
const slabTop: BlockSpec['box'] = [0, 0.5, 0, 1, 1, 1];

const log = (side: string, top: string) => ({top, bottom: top, side});
const logX = (side: string, top: string) => ({all: side, px: top, nx: top});
const logZ = (side: string, top: string) => ({all: side, pz: top, nz: top});

const SPECS = {
	// земля
	grass: {top: 'grass_top', bottom: 'dirt', side: 'grass_side'},
	dirt: {all: 'dirt'},
	snowyGrass: {top: 'snow', bottom: 'dirt', side: 'snowy_grass_side'},
	snow: {all: 'snow'},
	sand: {all: 'sand'},
	gravel: {all: 'gravel'},
	path: {top: 'path_top', bottom: 'dirt', side: 'dirt'},
	farmland: {top: 'farmland_top', bottom: 'dirt', side: 'dirt'},
	// камень и руды
	stone: {all: 'stone'},
	cobble: {all: 'cobble'},
	coalOre: {all: 'ore_coal'},
	ironOre: {all: 'ore_iron'},
	goldOre: {all: 'ore_gold'},
	diamondOre: {all: 'ore_diamond'},
	redstoneOre: {all: 'ore_redstone'},
	bedrock: {all: 'bedrock'},
	obsidian: {all: 'obsidian'},
	deepslate: {all: 'deepslate'},
	deepslateBricks: {all: 'deepslate_bricks'},
	tuff: {all: 'tuff'},
	tuffBricks: {all: 'tuff_bricks'},
	chiseledTuff: {all: 'chiseled_tuff', top: 'tuff', bottom: 'tuff'},
	stoneBricks: {all: 'stone_bricks'},
	mossyStoneBricks: {all: 'mossy_stone_bricks'},
	crackedStoneBricks: {all: 'cracked_stone_bricks'},
	// лёд и вода
	ice: {all: 'ice', snow: false},
	packedIce: {all: 'packed_ice', snow: false},
	blueIce: {all: 'blue_ice', snow: false},
	water: {all: 'water', layer: 'translucent', snow: false},
	// деревья
	oakLog: log('oak_log_side', 'oak_log_top'),
	oakLogX: logX('oak_log_side', 'oak_log_top'),
	oakLogZ: logZ('oak_log_side', 'oak_log_top'),
	oakLeaves: {all: 'oak_leaves'},
	oakPlanks: {all: 'oak_planks'},
	darkPlanks: {all: 'dark_planks'},
	spruceLog: log('spruce_log_side', 'spruce_log_top'),
	spruceLogX: logX('spruce_log_side', 'spruce_log_top'),
	spruceLogZ: logZ('spruce_log_side', 'spruce_log_top'),
	spruceLeaves: {all: 'spruce_leaves'},
	snowySpruceLeaves: {top: 'snow', bottom: 'spruce_leaves', side: 'snowy_spruce_leaves_side'},
	sprucePlanks: {all: 'spruce_planks'},
	birchLog: log('birch_log_side', 'birch_log_top'),
	birchLeaves: {all: 'birch_leaves'},
	cherryLog: log('cherry_log_side', 'cherry_log_top'),
	cherryLeaves: {all: 'cherry_leaves'},
	// постройки
	glass: {all: 'glass', snow: false},
	window: {all: 'window', snow: false},
	windowLit: {all: 'window_lit', emissive: 1},
	doorTop: {all: 'door_top', top: 'oak_planks', bottom: 'oak_planks', snow: false},
	doorBottom: {all: 'door_bottom', top: 'oak_planks', bottom: 'oak_planks', snow: false},
	chest: {all: 'chest_side', top: 'chest_top', bottom: 'chest_top', pz: 'chest_front', snow: false},
	chestNz: {all: 'chest_side', top: 'chest_top', bottom: 'chest_top', nz: 'chest_front', snow: false},
	chestPx: {all: 'chest_side', top: 'chest_top', bottom: 'chest_top', px: 'chest_front', snow: false},
	chestNx: {all: 'chest_side', top: 'chest_top', bottom: 'chest_top', nx: 'chest_front', snow: false},
	bookshelf: {side: 'bookshelf', top: 'oak_planks', bottom: 'oak_planks'},
	craftingTable: {side: 'crafting_side', top: 'crafting_top', bottom: 'oak_planks'},
	hay: {side: 'hay_side', top: 'hay_top', bottom: 'hay_top'},
	// медь (4 стадии окисления)
	copper: {all: 'copper'},
	exposedCopper: {all: 'exposed_copper'},
	weatheredCopper: {all: 'weathered_copper'},
	oxidizedCopper: {all: 'oxidized_copper'},
	cutCopper: {all: 'cut_copper'},
	exposedCutCopper: {all: 'cut_exposed_copper'},
	weatheredCutCopper: {all: 'cut_weathered_copper'},
	oxidizedCutCopper: {all: 'cut_oxidized_copper'},
	chiseledCopper: {all: 'chiseled_copper'},
	exposedChiseledCopper: {all: 'chiseled_exposed_copper'},
	weatheredChiseledCopper: {all: 'chiseled_weathered_copper'},
	oxidizedChiseledCopper: {all: 'chiseled_oxidized_copper'},
	copperGrate: {all: 'copper_grate', layer: 'cutout'},
	exposedCopperGrate: {all: 'exposed_copper_grate', layer: 'cutout'},
	weatheredCopperGrate: {all: 'weathered_copper_grate', layer: 'cutout'},
	oxidizedCopperGrate: {all: 'oxidized_copper_grate', layer: 'cutout'},
	copperBulb: {all: 'copper_bulb'},
	copperBulbLit: {all: 'copper_bulb_lit', emissive: 1},
	oxidizedCopperBulb: {all: 'oxidized_copper_bulb'},
	oxidizedCopperBulbLit: {all: 'oxidized_copper_bulb_lit', emissive: 1},
	ironBars: {all: 'iron_bars', shape: 'pane'},
	// ценное и светящееся
	goldBlock: {all: 'gold_block'},
	diamondBlock: {all: 'diamond_block'},
	ironBlock: {all: 'iron_block'},
	glowstone: {all: 'glowstone', emissive: 1},
	lanternBlock: {all: 'lantern_glow', emissive: 1, box: [0.3125, 0, 0.3125, 0.6875, 0.5, 0.6875], shape: 'box'},
	// растения
	poppy: {all: 'poppy', shape: 'cross'},
	dandelion: {all: 'dandelion', shape: 'cross'},
	cornflower: {all: 'cornflower', shape: 'cross'},
	pinkFlower: {all: 'pink_flower', shape: 'cross'},
	tallGrass: {all: 'tall_grass', shape: 'cross'},
	deadBush: {all: 'dead_bush', shape: 'cross'},
	wheat: {all: 'wheat', shape: 'cross'},
	// полублоки, слои, столбики
	snowLayer: {all: 'snow', shape: 'box', box: [0, 0, 0, 1, 0.125, 1]},
	snowLayer2: {all: 'snow', shape: 'box', box: [0, 0, 0, 1, 0.375, 1]},
	stoneBrickSlab: {all: 'stone_bricks', shape: 'box', box: slabBottom},
	stoneBrickSlabTop: {all: 'stone_bricks', shape: 'box', box: slabTop},
	cobbleSlab: {all: 'cobble', shape: 'box', box: slabBottom},
	oakSlab: {all: 'oak_planks', shape: 'box', box: slabBottom},
	oakSlabTop: {all: 'oak_planks', shape: 'box', box: slabTop},
	darkSlab: {all: 'dark_planks', shape: 'box', box: slabBottom},
	darkSlabTop: {all: 'dark_planks', shape: 'box', box: slabTop},
	spruceSlab: {all: 'spruce_planks', shape: 'box', box: slabBottom},
	spruceSlabTop: {all: 'spruce_planks', shape: 'box', box: slabTop},
	cutCopperSlab: {all: 'cut_copper', shape: 'box', box: slabBottom},
	oxidizedCutCopperSlab: {all: 'cut_oxidized_copper', shape: 'box', box: slabBottom},
	tuffBrickSlab: {all: 'tuff_bricks', shape: 'box', box: slabBottom},
	deepslateBrickSlab: {all: 'deepslate_bricks', shape: 'box', box: slabBottom},
	oakFence: {all: 'oak_planks', shape: 'box', box: [0.375, 0, 0.375, 0.625, 1, 0.625]},
	spruceFence: {all: 'spruce_planks', shape: 'box', box: [0.375, 0, 0.375, 0.625, 1, 0.625]},
	stoneBrickWall: {all: 'stone_bricks', shape: 'box', box: [0.25, 0, 0.25, 0.75, 1, 0.75]},
	ironPost: {all: 'iron_block', shape: 'box', box: [0.4375, 0, 0.4375, 0.5625, 1, 0.5625]},
	redCarpet: {all: 'red_wool', shape: 'box', box: [0, 0, 0, 1, 0.0625, 1]},
	whiteCarpet: {all: 'white_wool', shape: 'box', box: [0, 0, 0, 1, 0.0625, 1]},
} satisfies Record<string, BlockSpec>;

const WOOL_SPECS = Object.fromEntries(Object.keys(WOOL_COLORS).map((c) => [`${c}_wool`, {all: `${c}_wool`, snow: false}])) as Record<string, BlockSpec>;

type WoolName = 'whiteWool' | 'redWool' | 'greenWool' | 'blueWool' | 'yellowWool' | 'orangeWool' | 'purpleWool' | 'pinkWool' | 'cyanWool' | 'blackWool' | 'grayWool' | 'lightBlueWool';

const camel = (s: string) => s.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase());

// Номера стандартных блоков: B.stone, B.oakPlanks, B.redWool ...
export const B = (() => {
	const ids: Record<string, number> = {air: 0};
	for (const [name, spec] of Object.entries(SPECS)) ids[name] = defineBlock(name, spec as BlockSpec);
	for (const [name, spec] of Object.entries(WOOL_SPECS)) ids[camel(name)] = defineBlock(camel(name), spec);
	return ids as {[K in keyof typeof SPECS | WoolName | 'air']: number};
})();

export type BlockName = keyof typeof B;
