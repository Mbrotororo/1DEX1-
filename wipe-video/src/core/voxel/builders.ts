import {hash3} from '../rng';
import {B} from './blocks';
import type {VoxelWorld} from './world';

// Готовые «строители»: деревья и новогодняя ёлка. Пишут блоки прямо в VoxelWorld.
// (x, y, z) — блок основания ствола (нижний блок ствола).

type TreeOpts = {height?: number; seed?: number; log?: number; leaves?: number};

// Дуб (как в старом ролике): ствол + шапка листвы в 4 слоя
export const oakTree = (w: VoxelWorld, x: number, y: number, z: number, opts: TreeOpts = {}) => {
	const {height = 5, seed = 0, log = B.oakLog, leaves = B.oakLeaves} = opts;
	const top = y + height - 1;
	for (let dy = -1; dy <= 2; dy++) {
		const radius = dy <= 0 ? 2 : 1;
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dz = -radius; dz <= radius; dz++) {
				const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
				if (corner && (dy === 2 || hash3(x + dx, dy, z + dz, 4 + seed) < 0.55)) continue;
				w.setIfAir(x + dx, top + dy, z + dz, leaves);
			}
		}
	}
	for (let i = 0; i < height; i++) w.set(x, y + i, z, log);
};

// Берёза: выше и уже дуба
export const birchTree = (w: VoxelWorld, x: number, y: number, z: number, opts: TreeOpts = {}) =>
	oakTree(w, x, y, z, {height: 6 + Math.floor(hash3(x, y, z, 5 + (opts.seed ?? 0)) * 2), log: B.birchLog, leaves: B.birchLeaves, ...opts});

// Ель: конус из слоёв хвои. snowy — со снежными шапками на лапах.
export const spruceTree = (w: VoxelWorld, x: number, y: number, z: number, opts: TreeOpts & {snowy?: boolean} = {}) => {
	const {height = 8, seed = 0, log = B.spruceLog, snowy = false} = opts;
	const leaves = opts.leaves ?? (snowy ? B.snowySpruceLeaves : B.spruceLeaves);
	const top = y + height - 1;
	// сверху вниз: радиусы 0,1,0?,1,2,1,2,3...
	let radius = 0;
	let grow = 1;
	for (let ly = top + 1; ly >= y + 2; ly--) {
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dz = -radius; dz <= radius; dz++) {
				if (radius > 0 && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
				if (radius > 1 && Math.abs(dx) + Math.abs(dz) === radius * 2 - 1 && hash3(x + dx, ly, z + dz, 6 + seed) < 0.4) continue;
				w.setIfAir(x + dx, ly, z + dz, leaves);
			}
		}
		// «ярусы»: радиус растёт, потом сбрасывается на шаг назад
		if (radius >= grow) {
			radius = Math.max(1, grow - 1);
			grow = Math.min(grow + 1, 3);
		} else {
			radius++;
		}
	}
	for (let i = 0; i < height; i++) w.set(x, y + i, z, log);
};

// Вишня: изогнутый ствол и широкая розовая крона
export const cherryTree = (w: VoxelWorld, x: number, y: number, z: number, opts: TreeOpts = {}) => {
	const {height = 5, seed = 0, log = B.cherryLog, leaves = B.cherryLeaves} = opts;
	const dir = hash3(x, y, z, 7 + seed) < 0.5 ? 1 : -1;
	const alongX = hash3(x, y, z, 8 + seed) < 0.5;
	// ствол, наверху уходит в сторону веткой
	const crowns: [number, number, number][] = [];
	for (let i = 0; i < height; i++) w.set(x, y + i, z, log);
	const bx = x + (alongX ? dir * 2 : 0);
	const bz = z + (alongX ? 0 : dir * 2);
	w.set(x + (alongX ? dir : 0), y + height - 1, z + (alongX ? 0 : dir), log);
	w.set(bx, y + height, bz, log);
	crowns.push([x - (alongX ? dir : 0), y + height + 1, z - (alongX ? 0 : dir)], [bx, y + height + 2, bz]);
	for (const [cx, cy, cz] of crowns) {
		for (let dy = -1; dy <= 1; dy++) {
			const radius = dy === 0 ? 3 : 2;
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dz = -radius; dz <= radius; dz++) {
					const d = Math.hypot(dx, dz);
					if (d > radius + 0.3) continue;
					if (d > radius - 0.8 && hash3(cx + dx, cy + dy, cz + dz, 9 + seed) < 0.3) continue;
					w.setIfAir(cx + dx, cy + dy, cz + dz, leaves);
				}
			}
		}
	}
	w.set(x, y + height, z, log);
};

export type TreeLight = {pos: [number, number, number]; color: string; phase: number};
export type NewYearTree = {
	// огоньки гирлянды (мировые координаты центров), цвет и фаза мигания
	lights: TreeLight[];
	// где стоит звезда (центр)
	star: [number, number, number];
	// верхушка (y верхнего блока)
	top: number;
};

const GARLAND = ['#ff3b30', '#ffd60a', '#34c759', '#0a84ff', '#ff9f0a', '#ff6ad5'];

// Большая новогодняя ёлка: ровный конус хвои + список огоньков гирлянды и место для звезды.
// Сами огоньки и звезду рисует <TreeLights/> (умеет мигать).
export const newYearTree = (w: VoxelWorld, x: number, y: number, z: number, opts: {height?: number; radius?: number; seed?: number; snowy?: boolean} = {}): NewYearTree => {
	const {height = 12, radius = 4, seed = 0, snowy = true} = opts;
	const lights: TreeLight[] = [];
	const trunk = 2;
	for (let i = 0; i < height - 1; i++) w.set(x, y + i, z, B.spruceLog);
	for (let ly = trunk; ly < height; ly++) {
		const k = (ly - trunk) / (height - 1 - trunk);
		// ярусы: радиус плавно убывает и «дышит» через слой
		const r = Math.max(0.6, radius * (1 - k) + (ly % 2 === 0 ? 0.45 : -0.25));
		const ri = Math.ceil(r);
		for (let dx = -ri; dx <= ri; dx++) {
			for (let dz = -ri; dz <= ri; dz++) {
				const d = Math.hypot(dx, dz);
				if (d > r + 0.2) continue;
				if (dx === 0 && dz === 0 && ly < height - 1) continue;
				const edge = d > r - 0.9;
				const above = Math.max(0.6, radius * (1 - (ly + 1 - trunk) / (height - 1 - trunk)) + ((ly + 1) % 2 === 0 ? 0.45 : -0.25));
				const open = d > above + 0.2;
				w.setIfAir(x + dx, y + ly, z + dz, snowy && open ? B.snowySpruceLeaves : B.spruceLeaves);
				// огоньки — на внешних лапах, вразнобой
				if (edge && hash3(x + dx, ly, z + dz, 20 + seed) < 0.3) {
					const n = Math.max(d, 0.001);
					lights.push({
						pos: [x + 0.5 + dx + (dx / n) * 0.56, y + ly + 0.45, z + 0.5 + dz + (dz / n) * 0.56],
						color: GARLAND[Math.floor(hash3(dx, ly, dz, 21 + seed) * GARLAND.length)],
						phase: hash3(dx, ly, dz, 22 + seed),
					});
				}
			}
		}
	}
	w.setIfAir(x, y + height - 1, z, B.spruceLeaves);
	return {lights, star: [x + 0.5, y + height + 0.55, z + 0.5], top: y + height - 1};
};
