import {B, VoxelWorld, buildVoxelMeshes, fbm2, hash3, once, spruceTree, strata, type BakedLight} from '../../core';
import {CANDLES, HANGING_LANTERNS, STANDING_LANTERNS, type V3} from './anchors';
import {HB} from './blocks';

// Дом из вокселей: первый этаж (прихожая + лестница), коридор второго этажа, комната.
// Два мира: интерьер (тёмный, свет запечён от фонарей/свечей/окон) и улица (снег, ели, дневной свет).
// Двери, часы, мебель с ПК и прочий реквизит — отдельные модели (src/props), здесь для них только место.

// Запечённый свет интерьера: фонари, свечи, свет из окон
const lanternLights: BakedLight[] = [
	...HANGING_LANTERNS.map((l): BakedLight => ({pos: [l.mount[0], l.mount[1] - l.chain - 0.35, l.mount[2]], radius: 8.5, color: '#ffa452', intensity: 1.15})),
	...STANDING_LANTERNS.map((p): BakedLight => ({pos: [p[0], p[1] + 0.3, p[2]], radius: 6, color: '#ffa452', intensity: 0.9})),
	...CANDLES.map((p): BakedLight => ({pos: [p[0], p[1] + 0.45, p[2]], radius: 3.2, color: '#ffb35c', intensity: 0.75})),
];
const windowLights: BakedLight[] = [
	// холодный дневной свет из окон прихожей
	{pos: [0.7, 2.0, 1.9], radius: 5.5, color: '#9cb8e6', intensity: 0.65},
	{pos: [7.0, 2.0, 6.3], radius: 5.5, color: '#a6bfe8', intensity: 0.6},
	{pos: [11.0, 2.0, 6.3], radius: 5.5, color: '#a6bfe8', intensity: 0.6},
	// полоска света под входной дверью
	{pos: [2.5, 0.25, 6.7], radius: 2.6, color: '#c8dcff', intensity: 0.6},
	// закат из окна комнаты
	{pos: [30.2, 7.0, 5.5], radius: 10.5, color: '#ff8a46', intensity: 1.35},
	// настольная лампа
	{pos: [30.3, 6.5, 3.1], radius: 4.5, color: '#ffc070', intensity: 0.8},
];
export const BAKED_LIGHTS: BakedLight[] = [...lanternLights, ...windowLights];

// Общий свет интерьера (очень тёмный и тёплый — остальное дают источники)
export const INTERIOR_AMBIENT = 0.17;
export const INTERIOR_AMBIENT_COLOR = '#d0b090';

const buildInterior = () => {
	const w = new VoxelWorld([-2, -2, -2], [33, 10, 12]);
	const S = B.sprucePlanks;
	// 1. Оболочка: две сплошные коробки (первый этаж и «крыло» со вторым этажом)
	w.fill(-1, -1, -1, 15, 9, 7, S);
	w.fill(15, -1, -1, 31, 9, 10, S);

	// 2. Вырезаем комнаты
	w.fill(0, 0, 0, 14, 3, 6, 0); // прихожая
	w.fill(5, 0, 0, 13, 8, 2, 0); // лестничный пролёт
	w.fill(14, 5, 0, 19, 8, 2, 0); // коридор
	w.fill(21, 5, 1, 30, 8, 9, 0); // комната

	// 3. Полы и потолки
	w.fill(0, -1, 0, 14, -1, 6, B.darkPlanks);
	w.fill(14, 4, 0, 19, 4, 2, B.darkPlanks);
	w.fill(21, 4, 1, 30, 4, 9, S);

	// 4. Прихожая: стены
	// северная стена: за часами штукатурка с тёмной панелью внизу
	w.fill(-1, 0, -1, 4, 0, -1, HB.panel);
	w.fill(0, 1, -1, 4, 3, -1, HB.plaster);
	// западная стена: панель внизу, доски выше, окно 2×2
	w.fill(-1, 0, 0, -1, 0, 6, HB.panel);
	w.fill(-1, 1, 1, -1, 2, 2, HB.windowX);
	// южная (входная) стена: кирпич вокруг двери, дальше доски с окнами
	w.fill(-1, 0, 7, 4, 3, 7, HB.bricks);
	w.fill(2, 0, 7, 2, 1, 7, 0); // дверной проём
	w.fill(1, 2, 7, 3, 2, 7, HB.darkLogX); // перемычка
	w.fill(5, 0, 7, 14, 0, 7, HB.panel);
	w.fill(6, 1, 7, 7, 2, 7, HB.windowZ);
	w.fill(10, 1, 7, 11, 2, 7, HB.windowZ);
	// восточная стена
	w.fill(15, 0, 0, 15, 0, 6, HB.panel);
	// столбы из тёмного дуба по углам и между окнами
	for (const [x, z] of [
		[-1, -1],
		[-1, 3],
		[-1, 7],
		[5, 7],
		[9, 7],
		[12, 7],
		[15, 7],
		[15, -1],
		[15, 3],
		[4, -1],
	]) {
		w.fill(x, 0, z, x, 3, z, HB.darkLog);
	}
	// балки под потолком прихожей (поперёк, вдоль z) и балка по краю лестничного проёма
	for (const x of [4, 8, 12]) w.fill(x, 3, 3, x, 3, 6, HB.darkLogZ);
	w.fill(4, 4, 3, 14, 4, 3, HB.darkLogX);
	// потолок прихожей — ель (там, где он есть)
	w.fill(0, 4, 0, 4, 4, 6, S);
	w.fill(5, 4, 4, 14, 4, 6, S);

	// 5. Лестница: 9 ступеней по 0.5 блока (полублок / полный блок), под ней — сплошной массив
	for (let k = 0; k < 9; k++) {
		const x = 5 + k;
		const top = 0.5 * (k + 1);
		const full = Math.floor(top);
		if (full > 0) w.fill(x, 0, 0, x, full - 1, 2, S);
		// верхняя клетка ступени: с подступенком, по середине (z = 1) — дорожка
		if (top > full) {
			w.fill(x, full, 0, x, full, 2, HB.stepSlab);
			w.set(x, full, 1, HB.stepSlabRunner);
		} else {
			w.fill(x, full - 1, 0, x, full - 1, 2, HB.step);
			w.set(x, full - 1, 1, HB.stepRunner);
		}
	}
	// встроенные полки и сундук под лестницей (смотрят в прихожую)
	w.fill(10, 0, 2, 13, 1, 2, HB.bookshelf);
	w.set(8, 0, 2, B.chest);
	// стены пролёта: северная — доски с балкой на уровне второго этажа, южная (над потолком прихожей) — штукатурка
	w.fill(5, 4, -1, 19, 4, -1, HB.darkLogX);
	w.fill(5, 5, -1, 19, 8, -1, HB.plaster);
	w.fill(5, 5, 3, 19, 8, 3, HB.plaster);
	w.fill(14, 5, -1, 19, 5, -1, HB.panel);
	w.fill(14, 5, 3, 19, 5, 3, HB.panel);
	for (const x of [9, 13, 16, 20]) {
		w.fill(x, 4, -1, x, 8, -1, HB.darkLog);
		if (x > 9) w.fill(x, 5, 3, x, 8, 3, HB.darkLog);
	}
	w.fill(5, 9, -1, 19, 9, 3, S);

	// 6. Прихожая: мебель из блоков
	w.fill(14, 0, 4, 14, 1, 6, HB.bookshelf); // стеллаж у восточной стены
	w.fill(1, 0, 4, 13, 0, 5, HB.runner); // дорожка
	w.set(2, 0, 6, HB.mat); // коврик у двери

	// 7. Коридор: дорожка и стена с дверью в комнату
	w.fill(14, 5, 1, 19, 5, 1, HB.runner);
	w.fill(20, 5, 0, 20, 8, 2, S);
	w.fill(20, 5, 1, 20, 6, 1, 0); // проём двери комнаты

	// 8. Комната: стены
	w.fill(20, 5, 0, 31, 5, 0, HB.panel);
	w.fill(20, 5, 10, 31, 5, 10, HB.panel);
	w.fill(20, 5, 2, 20, 5, 9, HB.panel);
	w.fill(31, 5, 0, 31, 5, 10, HB.panel);
	w.fill(21, 6, 0, 26, 8, 0, HB.plaster); // за постером
	w.fill(20, 7, 0, 20, 7, 2, HB.darkLogZ); // перемычка над дверью
	// окно за столом с рамой из тёмного дуба
	w.fill(31, 6, 4, 31, 7, 6, HB.windowX);
	w.fill(31, 8, 3, 31, 8, 7, HB.darkLogZ);
	for (const [x, z] of [
		[20, 0],
		[20, 10],
		[31, 0],
		[31, 10],
		[31, 3],
		[31, 7],
		[26, 10],
		[20, 5],
		[27, 0],
	]) {
		w.fill(x, 5, z, x, 8, z, HB.darkLog);
	}
	// балки потолка
	for (const x of [23, 28]) w.fill(x, 8, 1, x, 8, 9, HB.darkLogZ);
	w.fill(21, 9, 1, 30, 9, 9, S);

	// 9. Комната: мебель из блоков
	w.fill(27, 5, 1, 30, 7, 1, HB.bookshelf); // северная стена
	w.fill(30, 5, 8, 30, 6, 9, HB.bookshelf); // справа от стола
	w.fill(27, 5, 9, 29, 6, 9, HB.bookshelf); // южная стена
	w.fill(21, 5, 9, 21, 6, 9, HB.bookshelf); // угол у штатива
	w.set(26, 5, 9, B.chestNz); // тумбочка у кровати
	// кровать — модель (props/decor Bed), место x = 24..26, z = 7.1..10
	// ковёр
	for (let x = 23; x <= 28; x++) {
		for (let z = 3; z <= 6; z++) {
			const edge = x === 23 || x === 28 || z === 3 || z === 6;
			w.set(x, 5, z, edge ? HB.rugBorder : HB.rugCenter);
		}
	}
	return w;
};

// Улица: снежная земля, тропинка, ели. Под домом пусто.
const buildExterior = () => {
	// севернее дома (z < −14) ничего не видно ни из одного окна — там мир не строим
	const w = new VoxelWorld([-44, -6, -14], [96, 34, 76]);
	// равнина у дома, дальше — пологие холмы
	const height = (x: number, z: number) => {
		const d = Math.max(0, Math.hypot((x - 15) * 0.8, z - 5) - 22);
		const hills = fbm2(x * 0.035, z * 0.035, 3, 7) * Math.min(1, d / 20) * 12;
		return -1 + Math.round(hills);
	};
	w.heightmap(height, {block: strata(B.snowyGrass), depth: 2});
	// под домом — пусто (там стоит интерьер)
	w.fill(-1, -6, -1, 15, 34, 7, 0);
	w.fill(15, -6, -1, 31, 34, 10, 0);
	// сугробы-слои
	for (let x = -30; x <= 70; x++) {
		for (let z = -12; z <= 50; z++) {
			if (hash3(x, 0, z, 41) < 0.06) {
				const top = w.topAt(x, z);
				if (top !== null && w.get(x, top, z) === B.snowyGrass) w.setIfAir(x, top + 1, z, B.snowLayer2);
			}
		}
	}
	// забор вдоль двора
	for (let x = -8; x <= 12; x++) if (x < 1 || x > 3) w.set(x, 0, 17, B.spruceFence);
	// ели: двор у входа, за окном комнаты и вдали
	const trees: [number, number, number][] = [
		[-6, 12, 9],
		[8, 13, 7],
		[13, 21, 10],
		[-12, 23, 11],
		[4, 28, 9],
		[-3, 34, 10],
		[19, 30, 12],
		[38, -4, 9],
		[41, 9, 10],
		[46, 2, 12],
		[52, 13, 11],
		[58, -6, 13],
		[63, 6, 12],
		[70, 18, 13],
		[36, 15, 8],
		[75, -2, 14],
		[-14, 3, 9],
		[-20, 14, 10],
		[24, 40, 12],
		[-8, 46, 12],
	];
	trees.forEach(([x, z, h], i) => {
		const top = w.topAt(x, z);
		if (top === null) return;
		spruceTree(w, x, top + 1, z, {height: h, snowy: true, seed: i});
	});
	return w;
};

export type HouseSet = {
	interior: VoxelWorld;
	exterior: VoxelWorld;
	meshes: ReturnType<typeof buildVoxelMeshes>;
	extMeshes: ReturnType<typeof buildVoxelMeshes>;
};

// Дом строится один раз на вкладку (общий для обеих сцен ролика)
export const getHouse = once((): HouseSet => {
	const interior = buildInterior();
	const exterior = buildExterior();
	const meshes = buildVoxelMeshes(interior, {ambient: INTERIOR_AMBIENT, ambientColor: INTERIOR_AMBIENT_COLOR, lights: BAKED_LIGHTS, ao: 1, cull: {bottom: true, sides: true, top: true}});
	const extMeshes = buildVoxelMeshes(exterior, {ambient: 1, cull: {bottom: true, sides: true}});
	return {interior, exterior, meshes, extMeshes};
});

// Точка над полом комнаты/прихожей, удобная для отладки
export const houseCenter: V3 = [15, 3, 4];
