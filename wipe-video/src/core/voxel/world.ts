import {BLOCKS, OCCLUDES} from './blocks';

// Мир из блоков: плотный массив в заданных границах. Блок с индексом (x, y, z)
// занимает куб [x..x+1] × [y..y+1] × [z..z+1]; y — вверх.
// ЧИСТЫЙ модуль (без three).

export type BlockInst = {x: number; y: number; z: number; id: number; band?: number; shade?: number};

export class VoxelWorld {
	readonly min: [number, number, number];
	readonly max: [number, number, number];
	readonly sx: number;
	readonly sy: number;
	readonly sz: number;
	readonly data: Uint8Array;

	// Границы включительно: new VoxelWorld([-80, -8, -80], [79, 40, 79])
	constructor(min: [number, number, number], max: [number, number, number]) {
		this.min = [Math.floor(min[0]), Math.floor(min[1]), Math.floor(min[2])];
		this.max = [Math.floor(max[0]), Math.floor(max[1]), Math.floor(max[2])];
		this.sx = this.max[0] - this.min[0] + 1;
		this.sy = this.max[1] - this.min[1] + 1;
		this.sz = this.max[2] - this.min[2] + 1;
		if (this.sx <= 0 || this.sy <= 0 || this.sz <= 0) throw new Error('VoxelWorld: пустые границы');
		this.data = new Uint8Array(this.sx * this.sy * this.sz);
	}

	inside(x: number, y: number, z: number) {
		return x >= this.min[0] && x <= this.max[0] && y >= this.min[1] && y <= this.max[1] && z >= this.min[2] && z <= this.max[2];
	}

	// индекс в массиве (без проверки границ)
	index(x: number, y: number, z: number) {
		return ((y - this.min[1]) * this.sz + (z - this.min[2])) * this.sx + (x - this.min[0]);
	}

	// id блока; за границами мира — 0 (воздух)
	get(x: number, y: number, z: number): number {
		if (!this.inside(x, y, z)) return 0;
		return this.data[this.index(x, y, z)];
	}

	// Поставить блок (id = 0 — убрать). За границами мира молча игнорируется.
	set(x: number, y: number, z: number, id: number): this {
		x = Math.floor(x);
		y = Math.floor(y);
		z = Math.floor(z);
		if (this.inside(x, y, z)) this.data[this.index(x, y, z)] = id;
		return this;
	}

	// Поставить, только если там воздух
	setIfAir(x: number, y: number, z: number, id: number): this {
		if (this.get(x, y, z) === 0) this.set(x, y, z, id);
		return this;
	}

	isSolid(x: number, y: number, z: number) {
		return OCCLUDES[this.get(x, y, z)];
	}

	// Сплошной параллелепипед (границы включительно, порядок углов любой)
	fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): this {
		const ax = Math.max(Math.min(x0, x1), this.min[0]);
		const bx = Math.min(Math.max(x0, x1), this.max[0]);
		const ay = Math.max(Math.min(y0, y1), this.min[1]);
		const by = Math.min(Math.max(y0, y1), this.max[1]);
		const az = Math.max(Math.min(z0, z1), this.min[2]);
		const bz = Math.min(Math.max(z0, z1), this.max[2]);
		for (let y = ay; y <= by; y++) {
			for (let z = az; z <= bz; z++) {
				const row = this.index(ax, y, z);
				for (let x = 0; x <= bx - ax; x++) this.data[row + x] = id;
			}
		}
		return this;
	}

	// Заменить в области блоки from на to (from может быть списком)
	replace(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, from: number | number[], to: number): this {
		const set = new Set(Array.isArray(from) ? from : [from]);
		for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
			for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
					if (set.has(this.get(x, y, z))) this.set(x, y, z, to);
				}
			}
		}
		return this;
	}

	// Пустая коробка: шесть стенок толщиной в 1 блок
	hollowBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): this {
		const ax = Math.min(x0, x1);
		const bx = Math.max(x0, x1);
		const ay = Math.min(y0, y1);
		const by = Math.max(y0, y1);
		const az = Math.min(z0, z1);
		const bz = Math.max(z0, z1);
		this.fill(ax, ay, az, bx, ay, bz, id);
		this.fill(ax, by, az, bx, by, bz, id);
		this.fill(ax, ay, az, ax, by, bz, id);
		this.fill(bx, ay, az, bx, by, bz, id);
		this.fill(ax, ay, az, bx, by, az, id);
		this.fill(ax, ay, bz, bx, by, bz, id);
		return this;
	}

	// Только четыре стены (без пола и потолка)
	walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): this {
		const ax = Math.min(x0, x1);
		const bx = Math.max(x0, x1);
		const az = Math.min(z0, z1);
		const bz = Math.max(z0, z1);
		this.fill(ax, y0, az, ax, y1, bz, id);
		this.fill(bx, y0, az, bx, y1, bz, id);
		this.fill(ax, y0, az, bx, y1, az, id);
		this.fill(ax, y0, bz, bx, y1, bz, id);
		return this;
	}

	// Шар (или эллипсоид: r — число или [rx, ry, rz]) с центром в (cx, cy, cz) — координаты блока-центра.
	// opts.hollow — только оболочка; opts.keep — не затирать уже стоящие блоки.
	sphere(cx: number, cy: number, cz: number, r: number | [number, number, number], id: number, opts: {hollow?: boolean; keep?: boolean} = {}): this {
		const [rx, ry, rz] = typeof r === 'number' ? [r, r, r] : r;
		for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
			for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
				for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
					const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
					if (d > 1) continue;
					if (opts.hollow) {
						const inner = ((x - cx) / (rx - 1)) ** 2 + ((y - cy) / (ry - 1)) ** 2 + ((z - cz) / (rz - 1)) ** 2;
						if (inner <= 1 && rx > 1 && ry > 1 && rz > 1) continue;
					}
					if (opts.keep) this.setIfAir(x, y, z, id);
					else this.set(x, y, z, id);
				}
			}
		}
		return this;
	}

	// Вертикальный цилиндр (башня): центр (cx, cz), слои y0..y1, радиус r; hollow — только стенка
	cylinder(cx: number, y0: number, y1: number, cz: number, r: number, id: number, opts: {hollow?: boolean} = {}): this {
		for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
			for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
				const d = Math.hypot(x - cx, z - cz);
				if (d > r + 0.3) continue;
				if (opts.hollow && d < r - 0.7) continue;
				for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, z, id);
			}
		}
		return this;
	}

	// Рельеф по карте высот. height(x, z) — y верхнего блока колонки; block(x, y, z, top) — какой блок ставить
	// (по умолчанию — трава/земля/камень). Заполняет колонку от top вниз на depth блоков (или до дна мира).
	heightmap(
		height: (x: number, z: number) => number,
		opts: {
			block?: (x: number, y: number, z: number, top: number) => number;
			depth?: number;
			x0?: number;
			x1?: number;
			z0?: number;
			z1?: number;
		} = {},
	): this {
		const x0 = Math.max(opts.x0 ?? this.min[0], this.min[0]);
		const x1 = Math.min(opts.x1 ?? this.max[0], this.max[0]);
		const z0 = Math.max(opts.z0 ?? this.min[2], this.min[2]);
		const z1 = Math.min(opts.z1 ?? this.max[2], this.max[2]);
		const block = opts.block ?? defaultStrata;
		for (let z = z0; z <= z1; z++) {
			for (let x = x0; x <= x1; x++) {
				const top = Math.min(this.max[1], Math.floor(height(x, z)));
				const bottom = Math.max(this.min[1], opts.depth === undefined ? this.min[1] : top - opts.depth + 1);
				for (let y = bottom; y <= top; y++) {
					const id = block(x, y, z, top);
					if (id !== 0) this.data[this.index(x, y, z)] = id;
				}
			}
		}
		return this;
	}

	// y верхнего непустого блока в колонке (или null, если колонка пуста). solidOnly — только полные кубы.
	topAt(x: number, z: number, solidOnly = true): number | null {
		x = Math.floor(x);
		z = Math.floor(z);
		if (x < this.min[0] || x > this.max[0] || z < this.min[2] || z > this.max[2]) return null;
		for (let y = this.max[1]; y >= this.min[1]; y--) {
			const id = this.data[this.index(x, y, z)];
			if (id !== 0 && (!solidOnly || OCCLUDES[id])) return y;
		}
		return null;
	}

	// Высота, на которой стоит персонаж в точке (x, z): верх верхнего твёрдого блока. fallback — если колонка пуста.
	groundAt(x: number, z: number, fallback = 0): number {
		const top = this.topAt(x, z);
		return top === null ? fallback : top + 1;
	}

	// Обойти все непустые блоки
	forEach(cb: (x: number, y: number, z: number, id: number) => void): void {
		let i = 0;
		for (let y = this.min[1]; y <= this.max[1]; y++) {
			for (let z = this.min[2]; z <= this.max[2]; z++) {
				for (let x = this.min[0]; x <= this.max[0]; x++, i++) {
					const id = this.data[i];
					if (id !== 0) cb(x, y, z, id);
				}
			}
		}
	}

	// Список блоков (для InstancedBlocks). filter — какие брать.
	collect(filter?: (x: number, y: number, z: number, id: number) => boolean): BlockInst[] {
		const out: BlockInst[] = [];
		this.forEach((x, y, z, id) => {
			if (!filter || filter(x, y, z, id)) out.push({x, y, z, id});
		});
		return out;
	}

	count(): number {
		let n = 0;
		for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) n++;
		return n;
	}

	// Вставить другой мир со сдвигом (воздух не переносится)
	paste(other: VoxelWorld, dx = 0, dy = 0, dz = 0): this {
		other.forEach((x, y, z, id) => this.set(x + dx, y + dy, z + dz, id));
		return this;
	}

	clone(): VoxelWorld {
		const w = new VoxelWorld(this.min, this.max);
		w.data.set(this.data);
		return w;
	}
}

// Слои по умолчанию для heightmap: трава, 3 блока земли, ниже камень
const GRASS = BLOCKS.find((b) => b.name === 'grass')!.id;
const DIRT = BLOCKS.find((b) => b.name === 'dirt')!.id;
const STONE = BLOCKS.find((b) => b.name === 'stone')!.id;
export const defaultStrata = (_x: number, y: number, _z: number, top: number) => (y === top ? GRASS : y >= top - 3 ? DIRT : STONE);

// ---------- полосы (bands) для волны появления/распада ----------
// Каждому блоку — целый номер полосы 0..N. VoxelMesh умеет показывать только полосы из диапазона,
// а bandBlocks отдаёт блоки одной полосы для поблочной анимации через InstancedBlocks.
export type Bands = {world: VoxelWorld; data: Int16Array; min: number; max: number};

export const makeBands = (world: VoxelWorld, band: (x: number, y: number, z: number, id: number) => number): Bands => {
	const data = new Int16Array(world.data.length).fill(-1);
	let min = Infinity;
	let max = -Infinity;
	let i = 0;
	for (let y = world.min[1]; y <= world.max[1]; y++) {
		for (let z = world.min[2]; z <= world.max[2]; z++) {
			for (let x = world.min[0]; x <= world.max[0]; x++, i++) {
				const id = world.data[i];
				if (id === 0) continue;
				const b = Math.max(0, Math.min(32000, Math.round(band(x, y, z, id))));
				data[i] = b;
				if (b < min) min = b;
				if (b > max) max = b;
			}
		}
	}
	if (min === Infinity) {
		min = 0;
		max = 0;
	}
	return {world, data, min, max};
};

// Блоки по полосам: result[b] — блоки полосы b. По умолчанию только «оболочка» полосы:
// кубы, у которых есть сосед-воздух или сосед из другой полосы (их видно, когда полоса на фронте волны).
// all: true — все кубы полосы (тяжелее, но без дыр при любой анимации).
export const bandBlocks = (bands: Bands, opts: {all?: boolean; maxPerBand?: number} = {}): BlockInst[][] => {
	const {world, data} = bands;
	const out: BlockInst[][] = Array.from({length: bands.max + 1}, () => []);
	const {sx, sy, sz} = world;
	const stepY = sx * sz;
	let i = 0;
	for (let yy = 0; yy < sy; yy++) {
		for (let zz = 0; zz < sz; zz++) {
			for (let xx = 0; xx < sx; xx++, i++) {
				const id = world.data[i];
				if (id === 0) continue;
				const def = BLOCKS[id];
				// анимируются только кубы; растения и решётки просто исчезают вместе с полосой
				if (def.shape !== 'cube') continue;
				const b = data[i];
				let exposed = opts.all === true;
				if (!exposed) {
					const open = (j: number, ok: boolean) => !ok || !OCCLUDES[world.data[j]] || data[j] !== b;
					exposed =
						open(i - 1, xx > 0) ||
						open(i + 1, xx < sx - 1) ||
						open(i - sx, zz > 0) ||
						open(i + sx, zz < sz - 1) ||
						open(i - stepY, yy > 0) ||
						open(i + stepY, yy < sy - 1);
				}
				if (!exposed) continue;
				if (opts.maxPerBand !== undefined && out[b].length >= opts.maxPerBand) continue;
				out[b].push({x: xx + world.min[0], y: yy + world.min[1], z: zz + world.min[2], id, band: b});
			}
		}
	}
	return out;
};
