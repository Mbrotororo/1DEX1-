import {defineBlock, defineTile, mixRgb, shade} from '../../core';
import {hash3} from '../../core/rng';

// Свои текстуры и блоки дома (регистрируются при загрузке модуля). Префикс hs_ — чтобы не пересечься с чужими.

type Rgb = number[];
const pick = (arr: Rgb[], r: number) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

// красный кирпич с серым швом
defineTile('hs_bricks', (x, y) => {
	const row = y >> 2;
	const ly = y & 3;
	const off = (row & 1) * 4;
	const lx = (x + off) & 7;
	const brick = ((x + off) >> 3) + row * 5;
	if (ly === 3 || lx === 7) return shade([126, 112, 104], 0.9 + hash3(x, y, 1, 501) * 0.15);
	const base = pick(
		[
			[150, 72, 52],
			[138, 64, 46],
			[162, 84, 60],
			[128, 58, 44],
		],
		hash3(brick, row, 2, 502),
	);
	let k = 0.93 + hash3(x, y, 3, 503) * 0.12;
	if (ly === 0) k *= 1.08;
	if (ly === 2) k *= 0.9;
	return shade(base, k);
});

// тёплая светлая штукатурка
defineTile('hs_plaster', (x, y) => {
	const blob = hash3(x >> 1, y >> 1, 4, 504);
	const fine = hash3(x, y, 5, 505);
	const c: Rgb = [214, 200, 178];
	if (fine > 0.97) return shade(c, 0.86);
	return shade(c, 0.95 + blob * 0.05 + fine * 0.03);
});

// тёмный дуб: бревно (бок и торец) и вертикальные доски панели
defineTile('hs_dark_log_side', (x, y) => {
	const col = hash3(x, y >> 2, 6, 506);
	const k = col < 0.25 ? 0.7 : col < 0.5 ? 0.86 : col > 0.85 ? 1.15 : 1;
	return shade([62, 44, 28], k * (0.95 + hash3(x, y, 7, 507) * 0.1));
});
defineTile('hs_dark_log_top', (x, y) => {
	const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
	if (d > 6.5) return shade([62, 44, 28], 0.85 + hash3(x, y, 8, 508) * 0.2);
	return shade(Math.floor(d) % 2 === 0 ? [104, 76, 46] : [86, 62, 36], 0.95 + hash3(x, y, 9, 509) * 0.1);
});
defineTile('hs_panel', (x, y) => {
	// вертикальные доски по 4 пикселя
	const board = x >> 2;
	if ((x & 3) === 3) return [44, 30, 18];
	const k = 0.9 + hash3(board, y >> 3, 10, 510) * 0.14 + hash3(x, y, 11, 511) * 0.06;
	return shade([92, 64, 38], k);
});

// книжная полка в еловой раме: книги разной высоты, наклонённые, тёмная глубина
const BOOKS: Rgb[] = [
	[150, 40, 34],
	[44, 78, 140],
	[58, 112, 52],
	[178, 140, 44],
	[110, 56, 132],
	[196, 188, 168],
	[120, 70, 40],
	[40, 96, 104],
];
const spruceFrame = (x: number, y: number): Rgb => {
	const k = 0.92 + hash3(x >> 2, y, 12, 512) * 0.1;
	return shade([112, 80, 46], k);
};
defineTile('hs_bookshelf', (x, y) => {
	if (y < 1 || y === 8 || y === 15 || x === 0 || x === 15) return spruceFrame(x, y);
	if (y === 7 || y === 14) return shade([84, 58, 32], 0.95);
	const shelf = y < 8 ? 0 : 1;
	const top = shelf === 0 ? 1 : 9;
	// книги шириной 1–2 пикселя
	let cx = 1;
	let i = 0;
	while (cx < 15) {
		const w = hash3(i, shelf, 13, 513) < 0.55 ? 2 : 1;
		if (x >= cx && x < cx + w) {
			const h = hash3(i, shelf, 14, 514);
			const gap = hash3(i, shelf, 15, 515) < 0.12;
			const bookTop = top + (h < 0.35 ? 2 : h < 0.7 ? 1 : 0);
			if (gap || y < bookTop) return [26, 18, 10];
			const c = pick(BOOKS, hash3(i, shelf, 16, 516));
			const band = y === bookTop + 1 && hash3(i, shelf, 17, 517) > 0.5;
			return shade(band ? mixRgb(c, [230, 200, 120], 0.6) : c, x === cx ? 1 : 0.8);
		}
		cx += w;
		i++;
	}
	return [26, 18, 10];
});

// окно: еловая рама по краю, стекло прозрачное, иней по углам, пара бликов
defineTile('hs_window', (x, y) => {
	if (x === 0 || y === 0 || x === 15 || y === 15) return [96, 68, 40, 255];
	if (x === 1 || y === 1 || x === 14 || y === 14) return [70, 48, 28, 255];
	const dc = Math.min(Math.hypot(x - 2, y - 2), Math.hypot(x - 13, y - 2), Math.hypot(x - 2, y - 13), Math.hypot(x - 13, y - 13));
	const frost = dc + hash3(x, y, 18, 518) * 2.2;
	if (frost < 2.6) return [236, 244, 252, 255];
	if (frost < 3.4 && hash3(x, y, 19, 519) > 0.5) return [206, 224, 240, 255];
	// блики
	if ((x + y === 9 || x + y === 10) && x > 3 && x < 8) return [220, 236, 250, 255];
	return [0, 0, 0, 0];
});

// ковёр: кайма и середина (каждый блок — свой узор, складываются в лоскутный ковёр)
defineTile('hs_rug_border', (x, y) => {
	// бесшовная кайма: тёмно-красная основа, решётка маленьких золотых ромбиков с периодом 8 px
	const d = Math.abs((x & 7) - 3.5) + Math.abs((y & 7) - 3.5);
	if (d < 1.1) return [214, 170, 88];
	if (d < 2.1) return [58, 26, 34];
	if (d > 6.4) return [70, 22, 22];
	return shade([116, 32, 28], 0.92 + hash3(x, y, 20, 520) * 0.12);
});
defineTile('hs_rug_center', (x, y) => {
	const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
	const ring = Math.floor(d) % 5;
	if (ring === 0) return [204, 164, 84];
	if (ring === 1) return [46, 52, 92];
	if (Math.min(x, y, 15 - x, 15 - y) === 0) return [90, 26, 26];
	return shade([150, 46, 38], 0.92 + hash3(x, y, 21, 521) * 0.12);
});
// дорожка в прихожей: бордовая с золотыми полосками по краям (по оси z) и ромбами
defineTile('hs_runner', (x, y) => {
	if (y === 0 || y === 15) return [70, 24, 22];
	if (y === 1 || y === 14) return [190, 146, 70];
	const d = Math.abs(((x + 4) % 8) - 3.5) + Math.abs(y - 7.5);
	if (d < 1.5) return [204, 168, 88];
	if (d < 2.5) return [52, 40, 70];
	return shade([118, 34, 32], 0.92 + hash3(x, y, 22, 522) * 0.12);
});
// коврик у двери: жёсткий кокос с тёмной каймой
defineTile('hs_mat', (x, y) => {
	if (Math.min(x, y, 15 - x, 15 - y) < 2) return shade([58, 40, 26], 0.9 + hash3(x, y, 23, 523) * 0.2);
	const k = (x + y) % 3 === 0 ? 0.82 : 1;
	return shade([150, 110, 64], k * (0.9 + hash3(x, y, 24, 524) * 0.2));
});

// плед в фиолетовую клетку (как рубашка героя), бок кровати и подушка
const PLAID_A: Rgb = [108, 90, 145];
const PLAID_B: Rgb = [62, 50, 104];
const PLAID_C: Rgb = [140, 120, 180];
const plaid = (x: number, y: number): Rgb => {
	const a = (x & 7) < 2;
	const b = (y & 7) < 2;
	let c = a && b ? PLAID_B : a || b ? mixRgb(PLAID_A, PLAID_B, 0.5) : PLAID_A;
	if ((x & 7) === 5 || (y & 7) === 5) c = mixRgb(c, PLAID_C, 0.45);
	return shade(c, 0.95 + hash3(x, y, 25, 525) * 0.08);
};
defineTile('hs_quilt', plaid);
defineTile('hs_bed_side', (x, y) => {
	// видны нижние 9 строк (полублок 9/16): плед свисает, ниже — тёмная рама
	if (y < 12) return y === 11 ? shade(plaid(x, y), 0.7) : plaid(x, y);
	if (y === 12) return [58, 40, 24];
	return shade([84, 58, 34], 0.92 + hash3(x >> 2, y, 26, 526) * 0.12);
});
defineTile('hs_bed_head', (x, y) => {
	// подушка в южной половине (y >= 8 — юг на верхней грани)
	if (y >= 8 && y <= 14 && x >= 1 && x <= 14) {
		const edge = y === 8 || y === 14 || x === 1 || x === 14;
		return shade([232, 228, 236], edge ? 0.82 : 0.96 + hash3(x, y, 27, 527) * 0.05);
	}
	// отогнутый край пледа
	if (y >= 5 && y <= 7) return shade([226, 220, 230], y === 7 ? 0.8 : 0.95);
	return plaid(x, y);
});

// подступенок: тёмные доски, светлый кант носка ступени каждые 8 пикселей (видна то верхняя, то нижняя половина)
defineTile('hs_riser', (x, y) => {
	const r = y & 7;
	if (r === 0) return shade([132, 96, 58], 0.95 + hash3(x, y, 28, 528) * 0.1);
	if (r === 1) return [40, 27, 16];
	if ((x & 7) === 7 && r > 1) return [46, 32, 20];
	return shade([76, 52, 32], 0.9 + hash3(x >> 3, y >> 3, 29, 529) * 0.12 + hash3(x, y, 30, 530) * 0.05);
});
// подступенок под дорожкой: дорожка свисает с носка
defineTile('hs_riser_runner', (x, y) => {
	const r = y & 7;
	if (x === 0 || x === 15) return shade([76, 52, 32], 0.95);
	if (x === 1 || x === 14) return [70, 24, 22];
	if (x === 2 || x === 13) return [190, 146, 70];
	if (r === 0) return [150, 44, 38];
	if (r === 7) return [72, 20, 18];
	return shade([118, 34, 32], 0.9 + hash3(x, y, 31, 531) * 0.12);
});

// ---------- блоки ----------
const carpet = (tile: string) => ({all: tile, shape: 'box' as const, box: [0, 0, 0, 1, 1 / 16, 1] as [number, number, number, number, number, number], snow: false});

export const HB = {
	bricks: defineBlock('hsBricks', {all: 'hs_bricks'}),
	plaster: defineBlock('hsPlaster', {all: 'hs_plaster'}),
	panel: defineBlock('hsPanel', {all: 'hs_panel', top: 'dark_planks', bottom: 'dark_planks'}),
	darkLog: defineBlock('hsDarkLog', {side: 'hs_dark_log_side', top: 'hs_dark_log_top', bottom: 'hs_dark_log_top'}),
	darkLogX: defineBlock('hsDarkLogX', {all: 'hs_dark_log_side', px: 'hs_dark_log_top', nx: 'hs_dark_log_top'}),
	darkLogZ: defineBlock('hsDarkLogZ', {all: 'hs_dark_log_side', pz: 'hs_dark_log_top', nz: 'hs_dark_log_top'}),
	bookshelf: defineBlock('hsBookshelf', {side: 'hs_bookshelf', top: 'spruce_planks', bottom: 'spruce_planks'}),
	// окно — тонкая рама посередине толщины стены (видно откос), стекло прозрачное
	windowZ: defineBlock('hsWindowZ', {all: 'hs_window', shape: 'box', box: [0, 0, 0.44, 1, 1, 0.56], layer: 'cutout', snow: false}),
	windowX: defineBlock('hsWindowX', {all: 'hs_window', shape: 'box', box: [0.44, 0, 0, 0.56, 1, 1], layer: 'cutout', snow: false}),
	rugBorder: defineBlock('hsRugBorder', carpet('hs_rug_border')),
	rugCenter: defineBlock('hsRugCenter', carpet('hs_rug_center')),
	runner: defineBlock('hsRunner', carpet('hs_runner')),
	mat: defineBlock('hsMat', {all: 'hs_mat', shape: 'box', box: [0.06, 0, 0.1, 0.94, 1 / 16, 0.9], snow: false}),
	bed: defineBlock('hsBed', {top: 'hs_quilt', side: 'hs_bed_side', bottom: 'dark_planks', shape: 'box', box: [0, 0, 0, 1, 9 / 16, 1], snow: false}),
	bedHead: defineBlock('hsBedHead', {top: 'hs_bed_head', side: 'hs_bed_side', bottom: 'dark_planks', shape: 'box', box: [0, 0, 0, 1, 9 / 16, 1], snow: false}),
	// ступени лестницы: целый блок и полублок, с подступенком (−x) и дорожкой по середине
	step: defineBlock('hsStep', {all: 'spruce_planks', nx: 'hs_riser'}),
	stepSlab: defineBlock('hsStepSlab', {all: 'spruce_planks', nx: 'hs_riser', shape: 'box', box: [0, 0, 0, 1, 0.5, 1]}),
	stepRunner: defineBlock('hsStepRunner', {all: 'spruce_planks', top: 'hs_runner', nx: 'hs_riser_runner'}),
	stepSlabRunner: defineBlock('hsStepSlabRunner', {all: 'spruce_planks', top: 'hs_runner', nx: 'hs_riser_runner', shape: 'box', box: [0, 0, 0, 1, 0.5, 1]}),
	// подоконник/полка: полублок сверху клетки
	shelf: defineBlock('hsShelf', {all: 'spruce_planks', shape: 'box', box: [0, 0.75, 0, 1, 0.875, 1], snow: false}),
};
