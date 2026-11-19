import * as THREE from 'three';
import {hash3, noise2} from '../rng';
import {BLOCKS, OCCLUDES, type BlockDef} from './blocks';
import {ATLAS_COLS} from './atlas';
import type {Bands, VoxelWorld} from './world';

// Сборка мира в слитую геометрию: только видимые грани, запечённое затенение граней,
// тени в углах (AO) и, по желанию, свет от точечных источников (факелы, лампы).

// Затенение граней как в Minecraft: верх светлый, бока темнее, низ самый тёмный
// (значения в линейном цвете). Порядок: +x, -x, +y, -y, +z, -z.
export const FACE_SHADE = {px: 0.36, nx: 0.3, py: 1, ny: 0.22, pz: 0.62, nz: 0.5};
export const FACE_SHADES = [FACE_SHADE.px, FACE_SHADE.nx, FACE_SHADE.py, FACE_SHADE.ny, FACE_SHADE.pz, FACE_SHADE.nz];

// Точечный источник света для запекания
export type BakedLight = {
	// где стоит (координаты мира, можно дробные)
	pos: [number, number, number];
	// на каком расстоянии (в блоках) свет сходит на нет
	radius: number;
	// цвет '#rrggbb' (по умолчанию тёплый факельный)
	color?: string;
	// яркость (1 — стена рядом с факелом светится в полную силу)
	intensity?: number;
};

export type MeshOptions = {
	// полосы для волны появления/распада (см. makeBands)
	bands?: Bands;
	// общий свет 0..1+ (1 — день; для подземелья 0.15..0.35) и его оттенок
	ambient?: number;
	ambientColor?: string;
	// запекаемые источники света
	lights?: BakedLight[];
	// свет не проходит сквозь стены (по умолчанию true)
	shadows?: boolean;
	// сила теней в углах 0..1 (по умолчанию 1)
	ao?: number;
	// не строить грани на границе мира: низ и/или боковые стороны (их всё равно не видно)
	cull?: {bottom?: boolean; sides?: boolean; top?: boolean};
};

export type VoxelMeshes = {
	opaque: THREE.BufferGeometry | null;
	cutout: THREE.BufferGeometry | null;
	translucent: THREE.BufferGeometry | null;
	// диапазон номеров полос [min, max]
	bandMin: number;
	bandMax: number;
	stats: {quads: number; ms: number; blocks: number};
	dispose: () => void;
};

type FaceDef = {
	n: [number, number, number];
	o: [number, number, number];
	u: [number, number, number];
	v: [number, number, number];
};

// Грань: начало o, оси u и v (u × v = нормаль). Вершины: o, o+u, o+u+v, o+v.
const FACES: FaceDef[] = [
	{n: [1, 0, 0], o: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0]},
	{n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0]},
	{n: [0, 1, 0], o: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1]},
	{n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1]},
	{n: [0, 0, 1], o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0]},
	{n: [0, 0, -1], o: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0]},
];
const CORNERS: [number, number][] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];
const AO_CURVE = [0.4, 0.62, 0.82, 1];

// Растущий буфер вершин одного слоя
class Layer {
	pos = new Float32Array(4096 * 3);
	uv = new Float32Array(4096 * 4);
	col = new Float32Array(4096 * 3);
	fx = new Float32Array(4096 * 4);
	idx = new Uint32Array(4096 * 6);
	verts = 0;
	indices = 0;

	private grow() {
		const cap = (this.pos.length / 3) * 2;
		const g = <A extends Float32Array | Uint32Array>(a: A, size: number): A => {
			const n = new (a.constructor as {new (n: number): A})(size);
			n.set(a);
			return n;
		};
		this.pos = g(this.pos, cap * 3);
		this.uv = g(this.uv, cap * 4);
		this.col = g(this.col, cap * 3);
		this.fx = g(this.fx, cap * 4);
		this.idx = g(this.idx, (cap / 4) * 6 * 2);
	}

	// одна четырёхугольная грань; flip — другая диагональ (для правильной интерполяции AO)
	quad(p: number[], uv: number[], tile: number, c: number[], snowTh: number, snowKind: number, band: number, nband: number, flip: boolean) {
		if (this.verts + 4 > this.pos.length / 3 || this.indices + 6 > this.idx.length) this.grow();
		const v = this.verts;
		const tx = tile % ATLAS_COLS;
		const ty = Math.floor(tile / ATLAS_COLS);
		for (let k = 0; k < 4; k++) {
			this.pos[(v + k) * 3] = p[k * 3];
			this.pos[(v + k) * 3 + 1] = p[k * 3 + 1];
			this.pos[(v + k) * 3 + 2] = p[k * 3 + 2];
			this.uv[(v + k) * 4] = uv[k * 2];
			this.uv[(v + k) * 4 + 1] = uv[k * 2 + 1];
			this.uv[(v + k) * 4 + 2] = tx;
			this.uv[(v + k) * 4 + 3] = ty;
			this.col[(v + k) * 3] = c[k * 3];
			this.col[(v + k) * 3 + 1] = c[k * 3 + 1];
			this.col[(v + k) * 3 + 2] = c[k * 3 + 2];
			this.fx[(v + k) * 4] = snowTh;
			this.fx[(v + k) * 4 + 1] = snowKind;
			this.fx[(v + k) * 4 + 2] = band;
			this.fx[(v + k) * 4 + 3] = nband;
		}
		const i = this.indices;
		if (flip) {
			this.idx[i] = v + 1;
			this.idx[i + 1] = v + 2;
			this.idx[i + 2] = v + 3;
			this.idx[i + 3] = v + 1;
			this.idx[i + 4] = v + 3;
			this.idx[i + 5] = v;
		} else {
			this.idx[i] = v;
			this.idx[i + 1] = v + 1;
			this.idx[i + 2] = v + 2;
			this.idx[i + 3] = v;
			this.idx[i + 4] = v + 2;
			this.idx[i + 5] = v + 3;
		}
		this.verts += 4;
		this.indices += 6;
	}

	build(): THREE.BufferGeometry | null {
		if (this.verts === 0) return null;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.verts * 3), 3));
		geo.setAttribute('aUv', new THREE.BufferAttribute(this.uv.slice(0, this.verts * 4), 4));
		geo.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.verts * 3), 3));
		geo.setAttribute('aFx', new THREE.BufferAttribute(this.fx.slice(0, this.verts * 4), 4));
		geo.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.indices), 1));
		geo.computeBoundingSphere();
		geo.computeBoundingBox();
		return geo;
	}
}

type LightRt = {x: number; y: number; z: number; r: number; cr: number; cg: number; cb: number};

// Порог снега для блока: мелкий шум + крупные пятна, чтобы снег ложился «языками»
export const snowThreshold = (x: number, y: number, z: number) => hash3(x, y, z, 901) * 0.55 + noise2(x * 0.09 + y * 0.31, z * 0.09, 902) * 0.45;

export const buildVoxelMeshes = (world: VoxelWorld, opts: MeshOptions = {}): VoxelMeshes => {
	const started = typeof performance !== 'undefined' ? performance.now() : 0;
	const {sx, sy, sz, data} = world;
	const [ox, oy, oz] = world.min;
	const stepY = sx * sz;
	const bandData = opts.bands?.data ?? null;
	if (opts.bands && opts.bands.world !== world) throw new Error('buildVoxelMeshes: bands построены для другого мира');
	const ambient = opts.ambient ?? 1;
	const amb = new THREE.Color(opts.ambientColor ?? '#ffffff');
	const ambR = amb.r * ambient;
	const ambG = amb.g * ambient;
	const ambB = amb.b * ambient;
	const aoK = opts.ao ?? 1;
	const aoCurve = AO_CURVE.map((v) => 1 - (1 - v) * aoK);
	const shadows = opts.shadows ?? true;
	const cull = opts.cull ?? {};
	const lights: LightRt[] = (opts.lights ?? []).map((l) => {
		const c = new THREE.Color(l.color ?? '#ffb060');
		const k = l.intensity ?? 1;
		return {x: l.pos[0], y: l.pos[1], z: l.pos[2], r: l.radius, cr: c.r * k, cg: c.g * k, cb: c.b * k};
	});
	const hasLights = lights.length > 0;

	const layers = {opaque: new Layer(), cutout: new Layer(), translucent: new Layer()};
	let quads = 0;
	let blocks = 0;

	const solidAt = (x: number, y: number, z: number) => {
		if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return false;
		return OCCLUDES[data[(y * sz + z) * sx + x]];
	};

	// виден ли источник из точки (луч по клеткам, шаг полблока)
	const lit = (px: number, py: number, pz: number, l: LightRt) => {
		const dx = l.x - px;
		const dy = l.y - py;
		const dz = l.z - pz;
		const dist = Math.hypot(dx, dy, dz);
		const steps = Math.ceil(dist * 2);
		// клетка самого источника не считается (свет может «сидеть» внутри светящегося блока)
		const lx = Math.floor(l.x - ox);
		const ly = Math.floor(l.y - oy);
		const lz = Math.floor(l.z - oz);
		for (let s = 1; s < steps; s++) {
			const k = s / steps;
			const cx = Math.floor(px + dx * k - ox);
			const cy = Math.floor(py + dy * k - oy);
			const cz = Math.floor(pz + dz * k - oz);
			if (cx === lx && cy === ly && cz === lz) continue;
			if (solidAt(cx, cy, cz)) return false;
		}
		return true;
	};

	const P = new Array<number>(12);
	const UV = new Array<number>(8);
	const C = new Array<number>(12);
	const visibleLights: LightRt[] = [];

	// свет в вершинах грани: общий свет × затенение грани × AO + точечные источники
	const shadeFace = (f: number, wx: number, wy: number, wz: number, ao: number[] | null, emissive: number, shadeK: number) => {
		const face = FACES[f];
		const base = FACE_SHADES[f] * shadeK;
		visibleLights.length = 0;
		if (hasLights) {
			// центр грани, чуть вынесенный наружу
			const cx = wx + 0.5 + face.n[0] * 0.55;
			const cy = wy + 0.5 + face.n[1] * 0.55;
			const cz = wz + 0.5 + face.n[2] * 0.55;
			for (const l of lights) {
				const dx = l.x - cx;
				const dy = l.y - cy;
				const dz = l.z - cz;
				const d2 = dx * dx + dy * dy + dz * dz;
				if (d2 > (l.r + 1) * (l.r + 1)) continue;
				// источник позади грани её не освещает
				if (dx * face.n[0] + dy * face.n[1] + dz * face.n[2] < -0.2) continue;
				if (shadows && !lit(cx, cy, cz, l)) continue;
				visibleLights.push(l);
			}
		}
		for (let k = 0; k < 4; k++) {
			const a = ao ? aoCurve[ao[k]] : 1;
			let r = ambR * base * a;
			let g = ambG * base * a;
			let b = ambB * base * a;
			if (visibleLights.length > 0) {
				const vx = P[k * 3] + face.n[0] * 0.3;
				const vy = P[k * 3 + 1] + face.n[1] * 0.3;
				const vz = P[k * 3 + 2] + face.n[2] * 0.3;
				for (const l of visibleLights) {
					const dx = l.x - vx;
					const dy = l.y - vy;
					const dz = l.z - vz;
					const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
					if (d >= l.r) continue;
					const att = (1 - d / l.r) ** 2;
					const lambert = 0.45 + 0.55 * Math.max(0, (dx * face.n[0] + dy * face.n[1] + dz * face.n[2]) / (d + 1e-4));
					const w = att * lambert * (0.5 + 0.5 * a);
					r += l.cr * w;
					g += l.cg * w;
					b += l.cb * w;
				}
			}
			if (emissive > 0) {
				r = Math.max(r, emissive);
				g = Math.max(g, emissive);
				b = Math.max(b, emissive);
			}
			C[k * 3] = r;
			C[k * 3 + 1] = g;
			C[k * 3 + 2] = b;
		}
	};

	const ao = [3, 3, 3, 3];

	let i = 0;
	for (let y = 0; y < sy; y++) {
		for (let z = 0; z < sz; z++) {
			for (let x = 0; x < sx; x++, i++) {
				const id = data[i];
				if (id === 0) continue;
				blocks++;
				const def: BlockDef = BLOCKS[id];
				const layer = layers[def.layer];
				const band = bandData ? bandData[i] : 0;
				const wx = x + ox;
				const wy = y + oy;
				const wz = z + oz;

				if (def.shape === 'cross') {
					// два скрещённых листа; затенение — как у верхней грани, чуть темнее
					const lo = 0.1;
					const hi = 0.9;
					const planes = [
						[lo, lo, hi, hi],
						[lo, hi, hi, lo],
					];
					for (const [ax, az, bx, bz] of planes) {
						P[0] = wx + ax;
						P[1] = wy;
						P[2] = wz + az;
						P[3] = wx + bx;
						P[4] = wy;
						P[5] = wz + bz;
						P[6] = wx + bx;
						P[7] = wy + 1;
						P[8] = wz + bz;
						P[9] = wx + ax;
						P[10] = wy + 1;
						P[11] = wz + az;
						UV[0] = 0;
						UV[1] = 0;
						UV[2] = 1;
						UV[3] = 0;
						UV[4] = 1;
						UV[5] = 1;
						UV[6] = 0;
						UV[7] = 1;
						shadeFace(2, wx, wy - 0.4, wz, null, def.emissive, 0.86);
						layer.quad(P, UV, def.faces[4], C, 2, 0, band, -1, false);
						quads++;
					}
					continue;
				}

				if (def.shape === 'pane') {
					// тонкая решётка: тянется к соседним стенам/решёткам, иначе — крестом
					const link = (dx: number, dz: number) => {
						const nx = x + dx;
						const nz = z + dz;
						if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) return false;
						const nid = data[(y * sz + nz) * sx + nx];
						return nid === id || OCCLUDES[nid];
					};
					const alongX = link(-1, 0) || link(1, 0);
					const alongZ = link(0, -1) || link(0, 1);
					const planes: number[][] = [];
					if (alongX || !alongZ) planes.push([0, 0.5, 1, 0.5]);
					if (alongZ || !alongX) planes.push([0.5, 0, 0.5, 1]);
					for (const [ax, az, bx, bz] of planes) {
						P[0] = wx + ax;
						P[1] = wy;
						P[2] = wz + az;
						P[3] = wx + bx;
						P[4] = wy;
						P[5] = wz + bz;
						P[6] = wx + bx;
						P[7] = wy + 1;
						P[8] = wz + bz;
						P[9] = wx + ax;
						P[10] = wy + 1;
						P[11] = wz + az;
						UV[0] = 0;
						UV[1] = 0;
						UV[2] = 1;
						UV[3] = 0;
						UV[4] = 1;
						UV[5] = 1;
						UV[6] = 0;
						UV[7] = 1;
						shadeFace(az === bz ? 4 : 0, wx, wy, wz, null, def.emissive, az === bz ? 1 : 1.5);
						layer.quad(P, UV, def.faces[4], C, 2, 0, band, -1, false);
						quads++;
					}
					continue;
				}

				const isBox = def.shape === 'box';
				const bx = def.box;
				const topOpen = y === sy - 1 || !OCCLUDES[data[i + stepY]];
				const snowTh = def.snow ? snowThreshold(wx, wy, wz) : 2;

				for (let f = 0; f < 6; f++) {
					const face = FACES[f];
					const nx = x + face.n[0];
					const ny = y + face.n[1];
					const nz = z + face.n[2];
					const outside = nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz;
					let nband = -1;
					if (outside) {
						if (f === 3 ? cull.bottom : f === 2 ? cull.top : cull.sides) continue;
					} else {
						const j = (ny * sz + nz) * sx + nx;
						const nid = data[j];
						if (nid !== 0) {
							const sameBand = !bandData || bandData[j] === band;
							if (isBox) {
								// грань полублока прячется, только если она вплотную к полному кубу
								const flush = f === 0 ? bx[3] === 1 : f === 1 ? bx[0] === 0 : f === 2 ? bx[4] === 1 : f === 3 ? bx[1] === 0 : f === 4 ? bx[5] === 1 : bx[2] === 0;
								if (flush && OCCLUDES[nid]) {
									if (sameBand) continue;
									nband = bandData![j];
								}
							} else if (OCCLUDES[nid] || nid === id) {
								// сосед закрывает грань (или это такой же прозрачный блок — внутренние грани не нужны)
								if (sameBand) continue;
								nband = bandData![j];
							}
						}
					}

					// вершины и локальные UV
					for (let k = 0; k < 4; k++) {
						const [du, dv] = CORNERS[k];
						let px = face.o[0] + face.u[0] * du + face.v[0] * dv;
						let py = face.o[1] + face.u[1] * du + face.v[1] * dv;
						let pz = face.o[2] + face.u[2] * du + face.v[2] * dv;
						let lu = du;
						let lv = dv;
						if (isBox) {
							px = px === 0 ? bx[0] : bx[3];
							py = py === 0 ? bx[1] : bx[4];
							pz = pz === 0 ? bx[2] : bx[5];
							// UV — по реальному положению вершины, чтобы текстура не сжималась
							const along = (axis: number[], p: number[]) => {
								const c = axis[0] !== 0 ? p[0] : axis[1] !== 0 ? p[1] : p[2];
								return axis[0] + axis[1] + axis[2] > 0 ? c : 1 - c;
							};
							lu = along(face.u, [px, py, pz]);
							lv = along(face.v, [px, py, pz]);
						}
						P[k * 3] = wx + px;
						P[k * 3 + 1] = wy + py;
						P[k * 3 + 2] = wz + pz;
						UV[k * 2] = lu;
						UV[k * 2 + 1] = lv;
					}

					// тени в углах: смотрим три соседа каждой вершины в слое перед гранью
					let flip = false;
					if (!isBox && def.occludes) {
						for (let k = 0; k < 4; k++) {
							const [du, dv] = CORNERS[k];
							const su = du === 1 ? 1 : -1;
							const sv = dv === 1 ? 1 : -1;
							const ax = nx + face.u[0] * su;
							const ay = ny + face.u[1] * su;
							const az = nz + face.u[2] * su;
							const s1 = solidAt(ax, ay, az) ? 1 : 0;
							const s2 = solidAt(nx + face.v[0] * sv, ny + face.v[1] * sv, nz + face.v[2] * sv) ? 1 : 0;
							const cn = solidAt(ax + face.v[0] * sv, ay + face.v[1] * sv, az + face.v[2] * sv) ? 1 : 0;
							ao[k] = s1 && s2 ? 0 : 3 - s1 - s2 - cn;
						}
						flip = ao[0] + ao[2] < ao[1] + ao[3];
						shadeFace(f, wx, wy, wz, ao, def.emissive, 1);
					} else {
						shadeFace(f, wx, wy, wz, null, def.emissive, 1);
					}
					if (hasLights && !flip) {
						// диагональ выбираем и по свету, чтобы пятно от факела не ломалось
						const l0 = C[0] + C[1] + C[2] + C[6] + C[7] + C[8];
						const l1 = C[3] + C[4] + C[5] + C[9] + C[10] + C[11];
						if (ao[0] + ao[2] === ao[1] + ao[3]) flip = l0 < l1;
					}

					const snowKind = snowTh > 1 ? 0 : f === 2 ? 1 : f !== 3 && topOpen && !isBox ? 0.5 : 0;
					layer.quad(P, UV, def.faces[f], C, snowTh, snowKind, band, nband, flip);
					quads++;
				}
			}
		}
	}

	const geos = {opaque: layers.opaque.build(), cutout: layers.cutout.build(), translucent: layers.translucent.build()};
	return {
		...geos,
		bandMin: opts.bands?.min ?? 0,
		bandMax: opts.bands?.max ?? 0,
		stats: {quads, blocks, ms: typeof performance !== 'undefined' ? Math.round(performance.now() - started) : 0},
		dispose: () => {
			geos.opaque?.dispose();
			geos.cutout?.dispose();
			geos.translucent?.dispose();
		},
	};
};

// Найти в мире светящиеся блоки и вернуть источники света для запекания.
// pick(id) — параметры света для блока (или null, если этот блок не светит).
export const collectLights = (world: VoxelWorld, pick: (id: number, x: number, y: number, z: number) => Omit<BakedLight, 'pos'> | null): BakedLight[] => {
	const out: BakedLight[] = [];
	world.forEach((x, y, z, id) => {
		const l = pick(id, x, y, z);
		if (l) out.push({...l, pos: [x + 0.5, y + 0.5, z + 0.5]});
	});
	return out;
};
