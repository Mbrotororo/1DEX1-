// 3D-сцена первого экрана.
// - Остров очень медленно поворачивается сам, персонаж стоит на нём и поворачивается вместе с ним.
// - Клик по блоку острова: персонаж идёт к сундуку, достаёт кирку, добывает блок, если дотянется,
//   кладёт кирку обратно. Кирка растёт: камень — каменная, железо — железная, алмаз — алмазная.
//   Уголь зажигает факелы на дереве. Добытый блок вырастает через 5 секунд.
// - Персонажа можно снять с острова: он летает в невесомости поверх сайта, сам садится на текст
//   и кнопки, летит за посетителем, когда тот листает страницу, и показывает эмоции в облачке.
//   Его можно отлепить и плавно бросить. Сверху на острове — спрыгивает на траву.
// - С алмазной киркой он ломает стену (бегущую строку) и может летать по всему сайту.
// - Посередине экрана — большая надпись «1DEX1 SHOP» из множества салатовых блоков (буквы из шрифта
//   сайта), кубики смотрят прямо на зрителя. Клик ломает кучку блоков, они быстро вырастают. Остров справа.
// - Сзади галактика, а звёзды по всему фону медленно вращаются вокруг её ядра.
// - На краю острова — портал в Незер. Клик по порталу: персонаж заходит в него; летающего персонажа
//   можно в него закинуть. За порталом — большой адский остров. В нём есть древние обломки:
//   алмазной киркой персонаж добывает их и получает незеритовую кирку. Ей он ломает портал
//   в Незер на главном острове — на его месте появляется портал в Энд, а за ним — остров Энда.
import * as THREE from '../vendor/three.module.min.js';
import {t} from './i18n.js';
import {CROSSHAIR, icon} from './pixel.js';
import {burst, cellIndex, rasterize, voxelState} from './voxelword.js';

// ---------- маленькие помощники ----------
const rng = (seed) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutBack = (x) => {
	const k = clamp(x, 0, 1) - 1;
	return 1 + 2.4 * k * k * k + 1.4 * k * k;
};
// поворот к углу по кратчайшему пути
const lerpAngle = (a, b, k) => {
	let d = (b - a) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * k;
};

// Пиксельная текстура 16x16, нарисованная кодом
const pixelTexture = (paint, size = 16) => {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const g = c.getContext('2d');
	const img = g.createImageData(size, size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const col = paint(x, y);
			const i = (y * size + x) * 4;
			img.data[i] = col[0];
			img.data[i + 1] = col[1];
			img.data[i + 2] = col[2];
			img.data[i + 3] = col[3] ?? 255;
		}
	}
	g.putImageData(img, 0, 0);
	const tex = new THREE.CanvasTexture(c);
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
};
const shade = (c, k) => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];

const makeTextures = () => {
	const r = rng(7);
	const noise = Array.from({length: 16 * 16 * 12}, () => r());
	const n = (x, y, layer) => noise[(layer * 256 + y * 16 + x) % noise.length];
	const speckled = (base, layer, lo = 0.84, hi = 1.12) => (x, y) => {
		const v = n(x, y, layer);
		return shade(base, v < 0.16 ? lo : v > 0.86 ? hi : v > 0.55 ? 1.04 : 1);
	};
	const grass = speckled([98, 178, 66], 0);
	const dirt = speckled([128, 92, 64], 1);
	const stone = speckled([124, 120, 134], 4, 0.86, 1.1);
	// руда: камень с пятнами цвета
	const ore = (color, layer) =>
		pixelTexture((x, y) => {
			const v = n(x, y, layer);
			const spot = n(x >> 1, y >> 1, layer + 1) > 0.78 && v > 0.2;
			return spot ? shade(color, v > 0.7 ? 1.18 : 0.92) : stone(x, y);
		});
	// незерак с рудой (кварц, золото)
	const netherrackPx = (x, y) => {
		const v = n(x, y, 4);
		const w = n(x >> 1, y, 9);
		return shade([112, 52, 50], v < 0.18 ? 0.7 : v > 0.84 ? 1.22 : w > 0.7 ? 0.86 : 1);
	};
	const netherOre = (color, layer) =>
		pixelTexture((x, y) => {
			const v = n(x, y, layer);
			const spot = n(x >> 1, y >> 1, layer + 1) > 0.76 && v > 0.2;
			return spot ? shade(color, v > 0.7 ? 1.12 : 0.9) : netherrackPx(x, y);
		});
	// растения: прозрачный фон, рисуются на двух скрещённых плоскостях
	const plant = (paint) =>
		pixelTexture((x, y) => {
			const c = paint(x, y);
			return c ? [...c, 255] : [0, 0, 0, 0];
		});
	const stem = (x, y) => (x === 7 || x === 8) && y >= 7;
	// доски сундука: тёмная рамка, полосы досок и неровный цвет дерева
	const chestWood = (x, y, layer, k = 1) => {
		if (x === 0 || x === 15 || y === 0 || y === 15) return shade([66, 40, 14], k);
		if (y % 5 === 0) return shade([122, 78, 28], k);
		const v = n(x, y, layer);
		return shade([182, 124, 50], k * (v < 0.18 ? 0.86 : v > 0.82 ? 1.1 : (x + y * 3) % 7 === 0 ? 0.93 : 1));
	};
	return {
		// блок логотипа: светлый, с тёмной рамкой — цвет задаётся отдельно
		voxel: pixelTexture((x, y) => {
			const edge = x === 0 || y === 0 || x === 15 || y === 15;
			const v = n(x, y, 2);
			const k = edge ? 0.86 : v < 0.12 ? 0.93 : v > 0.9 ? 1 : 0.97;
			return shade([255, 255, 255], k);
		}),
		grassTop: pixelTexture(grass),
		grassSide: pixelTexture((x, y) => {
			const depth = 2 + Math.floor(n(x, 0, 3) * 3);
			if (y < depth) return grass(x, y);
			if (y === depth) return shade(dirt(x, y), 0.8);
			return dirt(x, y);
		}),
		dirt: pixelTexture(dirt),
		stone: pixelTexture(stone),
		coal: ore([38, 36, 44], 8),
		iron: ore([214, 172, 140], 9),
		goldOre: ore([255, 206, 70], 10),
		diamondOre: ore([92, 236, 230], 12),
		amethystOre: ore([170, 120, 255], 6),
		logSide: pixelTexture((x, y) => {
			const v = n(x, y >> 2, 5);
			const groove = x % 4 === 0;
			return shade([104, 78, 50], groove ? 0.72 : v < 0.25 ? 0.82 : v > 0.8 ? 1.12 : 1);
		}),
		logTop: pixelTexture((x, y) => {
			const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
			if (d > 6.5) return [84, 62, 40];
			return Math.floor(d) % 2 ? [158, 124, 76] : [186, 150, 98];
		}),
		leaves: pixelTexture((x, y) => {
			const v = n(x, y, 6);
			return shade([64, 132, 46], v < 0.14 ? 0.5 : v < 0.38 ? 0.78 : v > 0.86 ? 1.25 : v > 0.66 ? 1.08 : 0.95);
		}),
		amethyst: pixelTexture((x, y) => {
			const v = n(x, y, 7);
			const edge = x === 0 || y === 0 || x === 15 || y === 15;
			return shade([154, 107, 255], edge ? 0.62 : v < 0.2 ? 0.76 : v > 0.88 ? 1.4 : 1);
		}),
		lime: pixelTexture((x, y) => {
			const v = n(x, y, 0);
			const edge = x === 0 || y === 0 || x === 15 || y === 15;
			return shade([184, 255, 61], edge ? 0.6 : v < 0.2 ? 0.8 : v > 0.9 ? 1.2 : 1);
		}),
		gold: pixelTexture((x, y) => {
			const v = n(x, y, 1);
			const edge = x === 0 || y === 0 || x === 15 || y === 15;
			return shade([255, 200, 61], edge ? 0.62 : (x + y) % 7 === 0 ? 1.25 : v < 0.2 ? 0.82 : 1);
		}),
		// сундук деревянный, жёлто-коричневый, как в Minecraft, с серебристой защёлкой
		chestSide: pixelTexture((x, y) => chestWood(x, y, 3)),
		chestFront: pixelTexture((x, y) => {
			if (x >= 6 && x <= 9 && y <= 4) return x === 6 || x === 9 || y === 4 ? [58, 58, 64] : y === 0 ? [236, 236, 240] : [190, 190, 198];
			return chestWood(x, y, 4);
		}),
		chestTop: pixelTexture((x, y) => chestWood(x, y, 5, 1.08)),
		poppy: plant((x, y) => {
			const d = Math.hypot(x - 7.5, y - 5);
			if (d < 1.2) return [40, 18, 18];
			if (d < 3.4 && y <= 7) return n(x, y, 11) > 0.75 ? [255, 92, 80] : [214, 32, 36];
			if (stem(x, y) || (y === 11 && (x === 5 || x === 6)) || (y === 10 && x === 4)) return [56, 124, 38];
			return null;
		}),
		dandelion: plant((x, y) => {
			const d = Math.hypot(x - 7.5, y - 6);
			if (d < 2.6 && y <= 8) return d < 1 ? [255, 160, 30] : [255, 220, 60];
			if (stem(x, y) || (y === 12 && (x === 9 || x === 10))) return [74, 140, 44];
			return null;
		}),
		// ---------- Незер ----------
		obsidian: pixelTexture((x, y) => {
			const v = n(x, y, 3);
			return v > 0.88 ? [86, 58, 134] : v > 0.64 ? [40, 27, 64] : v < 0.12 ? [9, 6, 16] : [22, 15, 36];
		}),
		netherrack: pixelTexture(netherrackPx),
		quartzOre: netherOre([238, 228, 212], 6),
		netherGold: netherOre([255, 204, 70], 7),
		magma: pixelTexture((x, y) => {
			const v = n(x, y, 8);
			const crack = Math.abs(Math.sin(x * 0.9 + n(x >> 2, y >> 2, 9) * 4) + Math.sin(y * 0.8)) < 0.4;
			return crack ? shade([255, 140, 34], v > 0.5 ? 1.12 : 1) : shade([92, 34, 22], v < 0.3 ? 0.8 : 1);
		}),
		glowstone: pixelTexture((x, y) => {
			const v = n(x, y, 10);
			return v > 0.7 ? [255, 238, 176] : v > 0.4 ? [248, 194, 100] : v > 0.15 ? [198, 136, 66] : [142, 92, 46];
		}),
		crimsonStem: pixelTexture((x, y) => {
			const v = n(x, y >> 2, 11);
			return shade([126, 40, 64], x % 4 === 0 ? 0.68 : v < 0.25 ? 0.82 : v > 0.8 ? 1.2 : 1);
		}),
		crimsonTop: pixelTexture((x, y) => {
			const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
			if (d > 6.5) return [98, 30, 50];
			return Math.floor(d) % 2 ? [178, 72, 98] : [142, 52, 74];
		}),
		wartBlock: pixelTexture((x, y) => {
			const v = n(x, y, 12);
			return shade([152, 22, 28], v < 0.18 ? 0.6 : v > 0.82 ? 1.28 : v > 0.55 ? 1.06 : 0.92);
		}),
		shroomlight: pixelTexture((x, y) => {
			const v = n(x, y, 13);
			return v > 0.75 ? [255, 224, 154] : v > 0.35 ? [255, 168, 82] : [216, 112, 52];
		}),
		lava: pixelTexture((x, y) => {
			const v = n(x, y, 14);
			const w = Math.sin(x * 0.7 + y * 0.35) * 0.5 + 0.5;
			return v > 0.82 ? [255, 238, 122] : w > 0.6 ? [255, 152, 32] : [230, 92, 20];
		}),
		// древние обломки: бурые, с волнистыми прожилками; сверху — кольца
		ancientDebrisSide: pixelTexture((x, y) => {
			const band = Math.sin(y * 1.25 + Math.sin(x * 0.8) * 1.3);
			const v = n(x, y, 15);
			return shade(band > 0.45 ? [140, 104, 90] : band < -0.5 ? [62, 42, 38] : [98, 70, 60], v < 0.15 ? 0.85 : v > 0.88 ? 1.12 : 1);
		}),
		ancientDebrisTop: pixelTexture((x, y) => {
			const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
			return d > 6.5 ? [70, 48, 42] : Math.floor(d) % 2 ? [124, 92, 78] : [88, 62, 54];
		}),
		// ---------- Энд ----------
		endStone: pixelTexture((x, y) => {
			const v = n(x, y, 16);
			return shade([222, 224, 166], v < 0.14 ? 0.86 : v > 0.86 ? 1.06 : (x * 3 + y) % 9 === 0 ? 0.92 : 1);
		}),
		endFrameSide: pixelTexture((x, y) => {
			if (y < 4) return shade([58, 104, 86], y === 0 ? 1.2 : n(x, y, 17) > 0.7 ? 1.1 : 1);
			if (y === 4) return [40, 70, 58];
			return shade([214, 214, 168], n(x, y, 18) < 0.15 ? 0.88 : 1);
		}),
		endFrameTop: pixelTexture((x, y) => {
			const d = Math.hypot(x - 7.5, y - 7.5);
			if (d < 4.2) return d < 3 ? [26, 44, 38] : [36, 62, 52];
			return shade([62, 110, 92], x === 0 || y === 0 || x === 15 || y === 15 ? 0.7 : n(x, y, 19) > 0.8 ? 1.12 : 1);
		}),
		bedrock: pixelTexture((x, y) => {
			const v = n(x, y, 20);
			return v > 0.7 ? [124, 124, 128] : v > 0.35 ? [82, 82, 86] : [42, 42, 46];
		}),
		chorus: pixelTexture((x, y) => shade([132, 90, 140], n(x, y, 21) < 0.2 ? 0.75 : n(x, y, 21) > 0.85 ? 1.2 : 1)),
		chorusFlower: pixelTexture((x, y) => shade([200, 164, 214], n(x, y, 22) < 0.2 ? 0.8 : n(x, y, 22) > 0.8 ? 1.12 : 1)),
		crimsonRoots: plant((x, y) => {
			for (const b of [3, 6, 9, 12]) {
				const top = 5 + ((b * 3) % 5);
				const lean = Math.round((y - 15) * ((b % 3) - 1) * 0.25);
				if (x === b + lean && y >= top) return y < top + 2 ? [222, 64, 84] : [150, 30, 52];
			}
			return null;
		}),
		grassTuft: plant((x, y) => {
			const blades = [2, 5, 7, 10, 12, 14];
			for (const b of blades) {
				const top = 4 + ((b * 7) % 6);
				const lean = Math.round((y - 15) * ((b % 3) - 1) * 0.15);
				if (x === b + lean && y >= top) return shade([92, 168, 58], y < top + 2 ? 1.2 : 1);
			}
			return null;
		}),
	};
};

// Развёртка скина Minecraft (64x64) на коробку
const skinBox = (w, h, d, u, v, inflate = 0) => {
	const geo = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
	const T = 64;
	const rect = (x, y, rw, rh, flip = false) => {
		const x1 = x / T;
		const x2 = (x + rw) / T;
		const y1 = 1 - y / T;
		const y2 = 1 - (y + rh) / T;
		return flip ? [x1, y2, x2, y2, x1, y1, x2, y1] : [x1, y1, x2, y1, x1, y2, x2, y2];
	};
	const faces = [
		rect(u + d + w, v + d, d, h),
		rect(u, v + d, d, h),
		rect(u + d, v, w, d),
		rect(u + d + w, v, w, d, true),
		rect(u + d, v + d, w, h),
		rect(u + d + w + d, v + d, w, h),
	];
	geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(faces.flat()), 2));
	return geo;
};

const buildPlayer = (skin) => {
	const base = new THREE.MeshLambertMaterial({map: skin});
	const over = new THREE.MeshLambertMaterial({map: skin, alphaTest: 0.5, side: THREE.DoubleSide});
	const root = new THREE.Group();
	const part = (pivot, offset, baseGeo, overGeo) => {
		const g = new THREE.Group();
		g.position.set(...pivot);
		const a = new THREE.Mesh(baseGeo, base);
		const b = new THREE.Mesh(overGeo, over);
		a.position.set(...offset);
		b.position.set(...offset);
		g.add(a, b);
		root.add(g);
		return g;
	};
	const AW = 3; // тонкие руки, как у твоего скина
	const ax = 4 + AW / 2;
	const parts = {
		head: part([0, 24, 0], [0, 4, 0], skinBox(8, 8, 8, 0, 0), skinBox(8, 8, 8, 32, 0, 0.5)),
		body: part([0, 18, 0], [0, 0, 0], skinBox(8, 12, 4, 16, 16), skinBox(8, 12, 4, 16, 32, 0.26)),
		armR: part([-ax, 22, 0], [0, -4, 0], skinBox(AW, 12, 4, 40, 16), skinBox(AW, 12, 4, 40, 32, 0.26)),
		armL: part([ax, 22, 0], [0, -4, 0], skinBox(AW, 12, 4, 32, 48), skinBox(AW, 12, 4, 48, 48, 0.26)),
		legR: part([-1.99, 12, 0], [0, -6, 0], skinBox(4, 12, 4, 0, 16), skinBox(4, 12, 4, 0, 32, 0.26)),
		legL: part([1.99, 12, 0], [0, -6, 0], skinBox(4, 12, 4, 16, 48), skinBox(4, 12, 4, 0, 48, 0.26)),
	};
	parts.head.rotation.order = 'YXZ';
	return {root, parts};
};

// Выпуклая оболочка набора точек на экране (для невидимых хитбоксов)
const convexHull = (pts) => {
	const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
	if (p.length < 3) return p;
	const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower = [];
	for (const q of p) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
		lower.push(q);
	}
	const upper = [];
	for (let i = p.length - 1; i >= 0; i--) {
		const q = p[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
		upper.push(q);
	}
	upper.pop();
	lower.pop();
	return lower.concat(upper);
};

// Расстояние от точки до края оболочки (минус — точка внутри) и направление наружу
const hullDistance = (x, y, hull) => {
	if (!hull.length) return {dist: Infinity, nx: 0, ny: -1};
	let inside = true;
	let best = Infinity;
	let bx = 0;
	let by = 0;
	for (let i = 0; i < hull.length; i++) {
		const a = hull[i];
		const b = hull[(i + 1) % hull.length];
		const ex = b.x - a.x;
		const ey = b.y - a.y;
		const len2 = ex * ex + ey * ey || 1;
		const t = clamp(((x - a.x) * ex + (y - a.y) * ey) / len2, 0, 1);
		const cx = a.x + ex * t;
		const cy = a.y + ey * t;
		const d = Math.hypot(x - cx, y - cy);
		if (d < best) {
			best = d;
			bx = cx;
			by = cy;
		}
		if (ex * (y - a.y) - ey * (x - a.x) < 0) inside = false;
	}
	let nx = x - bx;
	let ny = y - by;
	const len = Math.hypot(nx, ny);
	if (len < 1e-4) {
		// точка ровно на краю — толкаем от центра оболочки
		const c = hull.reduce((s, q) => ({x: s.x + q.x / hull.length, y: s.y + q.y / hull.length}), {x: 0, y: 0});
		nx = x - c.x;
		ny = y - c.y;
	} else if (inside) {
		nx = -nx;
		ny = -ny;
	}
	const nl = Math.hypot(nx, ny) || 1;
	return {dist: inside ? -best : best, nx: nx / nl, ny: ny / nl};
};

// Пересечение прямоугольника и выпуклого многоугольника (теорема о разделяющей оси).
// Возвращает, куда и насколько вытолкнуть прямоугольник.
const boxPoly = (b, poly) => {
	if (!poly.length) return null;
	let best = Infinity;
	let bnx = 0;
	let bny = 0;
	let cx = 0;
	let cy = 0;
	for (const p of poly) {
		cx += p.x / poly.length;
		cy += p.y / poly.length;
	}
	const test = (ax, ay) => {
		const bc = b.x * ax + b.y * ay;
		const br = b.hw * Math.abs(ax) + b.hh * Math.abs(ay);
		let pmin = Infinity;
		let pmax = -Infinity;
		for (const p of poly) {
			const d = p.x * ax + p.y * ay;
			if (d < pmin) pmin = d;
			if (d > pmax) pmax = d;
		}
		const overlap = Math.min(bc + br - pmin, pmax - (bc - br));
		if (overlap <= 0) return false;
		if (overlap < best) {
			best = overlap;
			const dir = (b.x - cx) * ax + (b.y - cy) * ay;
			bnx = dir < 0 ? -ax : ax;
			bny = dir < 0 ? -ay : ay;
		}
		return true;
	};
	if (!test(1, 0) || !test(0, 1)) return null;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const c = poly[(i + 1) % poly.length];
		const ex = c.x - a.x;
		const ey = c.y - a.y;
		const len = Math.hypot(ex, ey);
		if (len < 1e-6) continue;
		if (!test(-ey / len, ex / len)) return null;
	}
	return {nx: bnx, ny: bny, depth: best};
};

// Мягкое круглое свечение (факелы, ядро галактики)
const glowTexture = () => {
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const g = c.getContext('2d');
	const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	grad.addColorStop(0, 'rgba(255,255,255,1)');
	grad.addColorStop(0.35, 'rgba(255,255,255,.45)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 64, 64);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
};

// ---------- кирки ----------
// Кирка из пикселей, как в Minecraft: h — головка, H — блик, s/S — рукоять
const PICKAXE = ['..hhhhhhh..', '.hHHHHHHHh.', 'hHh.hSh.hHh', 'hh...S...hh', 'h....s....h', '.....S.....', '.....s.....', '.....S.....', '.....s.....', '.....S.....'];
export const TIERS = [
	{id: 'wood', head: '#9c7440', hi: '#c69a5c'},
	{id: 'stone', head: '#76767c', hi: '#a9a9b0'},
	{id: 'iron', head: '#cfcfd6', hi: '#ffffff'},
	{id: 'diamond', head: '#26cfc0', hi: '#a6fff2'},
	{id: 'netherite', head: '#4b4150', hi: '#8f8098'},
];
// какую кирку нужно иметь, чтобы добыть блок, и что даёт добыча
const NEED = {iron: 1, gold: 2, diamond: 2, ancientDebris: 3};
const UPGRADE = {stone: 1, iron: 2, diamond: 3, ancientDebris: 4};

// ---------- константы сцены ----------
const WORD_DEPTH = 1.8;
const BLOCK_RESPAWN = 5; // блок острова вырастает через 5 секунд
const SWAY = Math.PI / 3; // остров поворачивается на 60° в каждую сторону
const SWAY_SPEED = 0.045; // очень медленно: полный круг туда и обратно — около двух минут
const HOME = new THREE.Vector3(0, 0, 0.6); // где стоит персонаж (на острове)
const BODY = 1.35; // центр тела над ногами
let STAND_R = 3.0; // по какому кругу на верхушке острова можно ходить (в Незере — шире)
const PLAYER_SCALE = 2.7 / 32;
const MINE_TIME = 1.0;
const REACH = 6.2; // как далеко персонаж дотягивается киркой
const WALK_SPEED = 2.8;
const PROGRESS_KEY = 'dex.progress';
const CHEST_TAKE = 1.75; // сколько секунд достаёт кирку из сундука
const CHEST_PUT = 1.15; // и сколько кладёт обратно
const SKY_SPIN = 0.011; // скорость вращения звёзд на фоне
const smooth = (t, a, b) => {
	const x = clamp((t - a) / (b - a), 0, 1);
	return x * x * (3 - 2 * x);
};

const loadProgress = () => {
	try {
		const p = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
		// endPortal — портал в Незер сломан незеритовой киркой, на его месте портал в Энд
		return {tier: clamp(p.tier | 0, 0, 4), torches: clamp(p.torches | 0, 0, 4), endPortal: Boolean(p.endPortal)};
	} catch {
		return {tier: 0, torches: 0, endPortal: false};
	}
};
const saveProgress = (p) => {
	try {
		localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
	} catch {
		// приватный режим — прогресс живёт до закрытия вкладки
	}
};

// on(событие, данные):
//  'break' — сломан блок названия, 'mine' — добыт блок острова, 'tier' — новая кирка,
//  'torch' — факел на дереве, 'need' / 'far' / 'busy' — почему блок не добыть,
//  'drag' — персонажа подняли, 'diamond' — алмазная кирка, 'wallNeed' — стену не сломать,
//  'free' — стена сломана, 'tickle' — пять кликов по скину
export const initHero = (canvas, {on = () => {}, reducedMotion = false, wall = null, sky = null} = {}) => {
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'});
	} catch (err) {
		return null;
	}
	renderer.toneMapping = THREE.NoToneMapping;
	renderer.setClearColor(0x000000, 0);

	// Чёткость картинки: на телефонах и слабых устройствах меньше пикселей.
	// Если в первые секунды сцена тормозит, чёткость снижается ещё.
	const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
	let slowDevice = false;
	const pixelRatio = (w) => Math.min(window.devicePixelRatio || 1, slowDevice ? 1 : w < 900 ? (weak ? 1.25 : 1.5) : 1.75);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
	const tex = makeTextures();
	const glow = glowTexture();
	const progress = loadProgress();

	const amb = new THREE.AmbientLight(0xbfb4ff, 1.25);
	scene.add(amb);
	const key = new THREE.DirectionalLight(0xffffff, 2.6);
	key.position.set(-4, 8, 5);
	scene.add(key);
	const rim = new THREE.DirectionalLight(0x9a6bff, 1.6);
	rim.position.set(5, 2, -6);
	scene.add(rim);

	// world не зависит от мыши; island внутри него сам качается вместе с персонажем
	const world = new THREE.Group();
	world.rotation.set(0, -0.2, 0);
	scene.add(world);
	const island = new THREE.Group();
	world.add(island);

	const box = new THREE.BoxGeometry(1, 1, 1);
	const dummy = new THREE.Object3D();
	const tmp = new THREE.Vector3();
	const tmp2 = new THREE.Vector3();
	const lambert = (map) => new THREE.MeshLambertMaterial({map});

	// ================= ОСТРОВ =================
	const blocks = [];
	const blockAt = new Map();
	const addBlock = (type, x, y, z) => {
		const k = `${x},${y},${z}`;
		if (blockAt.has(k)) return blockAt.get(k);
		const b = {type, pos: new THREE.Vector3(x, y, z), minedAt: -1, scale: 1};
		blocks.push(b);
		blockAt.set(k, b);
		return b;
	};

	const rand = rng(11);
	const radii = [3.75, 3.3, 2.75, 2.15, 1.5, 0.85];
	radii.forEach((radius, layer) => {
		for (let x = -4; x <= 4; x++) {
			for (let z = -4; z <= 4; z++) {
				const d = Math.hypot(x, z) + (rand() - 0.5) * 0.7;
				if (d > radius) continue;
				let type = layer === 0 ? 'grass' : layer === 1 ? 'dirt' : layer === 2 ? (rand() < 0.45 ? 'dirt' : 'stone') : 'stone';
				if (type === 'stone') {
					const o = rand();
					if (o < 0.08) type = 'coal';
					else if (o < 0.12 && layer >= 3) type = 'iron';
					else if (o < 0.15 && layer >= 4) type = 'amethystOre';
				}
				addBlock(type, x, -layer - 0.5, z);
			}
		}
	});
	// Гарантированные руды на видимой стороне острова, до которых можно дотянуться:
	// камень и уголь повыше, железо, золото и алмазы — глубже.
	const exposed = (y) =>
		blocks
			.filter((b) => b.pos.y === y && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !blockAt.has(`${b.pos.x + dx},${y},${b.pos.z + dz}`)))
			.sort((a, b) => b.pos.z + b.pos.x * 0.3 - (a.pos.z + a.pos.x * 0.3));
	['stone', 'coal', 'iron', 'stone', 'coal'].forEach((type, i) => {
		const b = exposed(-2.5)[i * 2];
		if (b) b.type = type;
	});
	['diamond', 'iron', 'gold', 'diamond', 'coal'].forEach((type, i) => {
		const b = exposed(-3.5)[i * 2];
		if (b) b.type = type;
	});

	// Портал в Незер — на краю острова справа сзади, повёрнут к центру острова.
	// rot — поворот вокруг вертикали; рамка 4×5 блоков по PORTAL_S.
	const PORTAL_O = {x: 2.3, z: -1.3, rot: -0.6};
	const PORTAL_S = 0.8;
	// портал в Энд (появляется на месте сломанного портала в Незер) — плоский, в земле
	const END_O = {x: 1.7, z: -1.1, rot: -0.6};
	// расстояние по земле от точки до рамки портала
	const portalDist = (o, x, z) => {
		const tx = Math.cos(o.rot);
		const tz = -Math.sin(o.rot);
		const dx = x - o.x;
		const dz = z - o.z;
		const along = clamp(dx * tx + dz * tz, -1.6, 1.6);
		return Math.hypot(dx - along * tx, dz - along * tz);
	};
	// персонаж обходит рамку: два столба и середина
	const portalObstacles = (o) => [-1, 0, 1].map((k) => ({x: o.x + Math.cos(o.rot) * 1.2 * k, z: o.z - Math.sin(o.rot) * 1.2 * k, r: 0.55}));

	// Дуб, как в Minecraft: ствол из пяти брёвен, два широких слоя листвы,
	// слой поуже и «крестик» на макушке. Нижние листья выше головы персонажа.
	const TREE = {x: -1, z: -2};
	for (let y = 0; y < 5; y++) addBlock('log', TREE.x, y + 0.5, TREE.z);
	const leaf = (dx, y, dz) => (y < 4 && portalDist(PORTAL_O, TREE.x + dx, TREE.z + dz) < 1.1 ? null : addBlock('leaves', TREE.x + dx, y, TREE.z + dz));
	for (const y of [3.5, 4.5]) {
		for (let dx = -2; dx <= 2; dx++) {
			for (let dz = -2; dz <= 2; dz++) {
				if (dx === 0 && dz === 0) continue; // там ствол
				if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rand() < (y === 4.5 ? 0.75 : 0.45)) continue;
				leaf(dx, y, dz);
			}
		}
	}
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && rand() < 0.5) continue;
			leaf(dx, 5.5, dz);
		}
	}
	for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) leaf(dx, 6.5, dz);
	// куст
	const BUSHES = [
		{x: -3, z: -1},
		{x: 2, z: 2},
	].filter((b) => blockAt.has(`${b.x},-0.5,${b.z}`));
	for (const bsh of BUSHES) addBlock('leaves', bsh.x, 0.5, bsh.z);

	const grassSide = lambert(tex.grassSide);
	const logSide = lambert(tex.logSide);
	const logTop = lambert(tex.logTop);
	const MATS = {
		grass: [grassSide, grassSide, lambert(tex.grassTop), lambert(tex.dirt), grassSide, grassSide],
		dirt: lambert(tex.dirt),
		stone: lambert(tex.stone),
		coal: lambert(tex.coal),
		iron: lambert(tex.iron),
		gold: lambert(tex.goldOre),
		diamond: lambert(tex.diamondOre),
		amethystOre: lambert(tex.amethystOre),
		log: [logSide, logSide, logTop, logTop, logSide, logSide],
		leaves: lambert(tex.leaves),
	};
	const BLOCK_COLOR = {
		grass: '#5fae3f', dirt: '#7d5a3e', stone: '#7c7888', coal: '#38363f', iron: '#c9a585', gold: '#ffc83d', diamond: '#3fe6d8', amethystOre: '#9a6bff', log: '#6a4a2a', leaves: '#3e842c',
		netherrack: '#73342f', quartzOre: '#e8dccb', netherGold: '#ffc83d', ancientDebris: '#6a4a3e', magma: '#ff8a22', glowstone: '#ffd27a', shroomlight: '#ffaa55', wartBlock: '#98161c', crimsonStem: '#7e2840',
		endStone: '#dedfa6', obsidian: '#2a1d40', bedrock: '#555558',
	};

	const setBlock = (b, s) => {
		b.scale = s;
		dummy.position.copy(b.pos);
		dummy.rotation.set(0, 0, 0);
		dummy.scale.setScalar(Math.max(s, 0.0001)); // совсем 0 нельзя: ломается попадание лучом
		dummy.updateMatrix();
		b.mesh.setMatrixAt(b.index, dummy.matrix);
		b.mesh.instanceMatrix.needsUpdate = true;
	};
	const islandMeshes = [];
	const byType = new Map();
	for (const b of blocks) {
		if (!byType.has(b.type)) byType.set(b.type, []);
		byType.get(b.type).push(b);
	}
	for (const [type, list] of byType) {
		const mesh = new THREE.InstancedMesh(box, MATS[type], list.length);
		mesh.userData.blocks = list;
		list.forEach((b, i) => {
			b.mesh = mesh;
			b.index = i;
			setBlock(b, 1);
		});
		island.add(mesh);
		islandMeshes.push(mesh);
	}

	// --- цветы и трава ---
	const crossGeo = (() => {
		const g = new THREE.BufferGeometry();
		const h = 0.42;
		const H = 0.85;
		g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-h, 0, -h, h, 0, h, h, H, h, -h, H, -h, -h, 0, h, h, 0, -h, h, H, -h, -h, H, h]), 3));
		g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), 2));
		g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
		return g;
	})();
	const plantMat = (map) => new THREE.MeshBasicMaterial({map, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xd8d8d8});
	const PLANT_MATS = {poppy: plantMat(tex.poppy), dandelion: plantMat(tex.dandelion), tuft: plantMat(tex.grassTuft)};
	const CHEST = {x: -2, z: 1, rot: 0.3};
	const plants = [];
	for (const b of blocks) {
		if (b.type !== 'grass') continue;
		const {x, z} = b.pos;
		if (Math.hypot(x - HOME.x, z - HOME.z) < 1.4) continue;
		if (Math.hypot(x - CHEST.x, z - CHEST.z) < 1.2) continue;
		if (portalDist(PORTAL_O, x, z) < 1.0 || Math.hypot(x - END_O.x, z - END_O.z) < 1.8) continue;
		if (blockAt.has(`${x},0.5,${z}`)) continue;
		const roll = rand();
		if (roll > 0.42) continue;
		const kind = roll < 0.24 ? 'tuft' : roll < 0.34 ? 'poppy' : 'dandelion';
		const m = new THREE.Mesh(crossGeo, PLANT_MATS[kind]);
		m.position.set(x + (rand() - 0.5) * 0.2, 0, z + (rand() - 0.5) * 0.2);
		m.rotation.y = rand() * Math.PI;
		m.scale.setScalar(0.8 + rand() * 0.3);
		island.add(m);
		plants.push({mesh: m, block: b});
	}

	// --- сундук с открывающейся крышкой: в нём лежит кирка ---
	const chestSide = lambert(tex.chestSide);
	const chestTop = lambert(tex.chestTop);
	const chest = new THREE.Group();
	chest.position.set(CHEST.x, 0, CHEST.z);
	chest.rotation.y = CHEST.rot;
	const chestBase = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.58, 0.88), [chestSide, chestSide, chestTop, chestSide, lambert(tex.chestFront), chestSide]);
	chestBase.position.y = 0.29;
	const lid = new THREE.Group();
	lid.position.set(0, 0.58, -0.44); // петли сзади
	const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.24, 0.88), [chestSide, chestSide, chestTop, chestSide, chestSide, chestSide]);
	lidMesh.position.set(0, 0.12, 0.44);
	lid.add(lidMesh);
	chest.add(chestBase, lid);
	island.add(chest);
	// куда встаёт персонаж, чтобы открыть сундук
	const CHEST_SPOT = new THREE.Vector3(CHEST.x + Math.sin(CHEST.rot) * 0.9, 0, CHEST.z + Math.cos(CHEST.rot) * 0.9);

	// --- факелы на стволе: появляются за добытый уголь ---
	const torches = [];
	const stickMat = new THREE.MeshLambertMaterial({color: '#7a5530'});
	const flameMat = new THREE.MeshBasicMaterial({color: '#ffd45a'});
	[[0.62, 0, 0, -0.35], [-0.62, 0, 0, 0.35], [0, 0.62, 0.35, 0], [0, -0.62, -0.35, 0]].forEach(([dx, dz, tx, tz]) => {
		const g = new THREE.Group();
		g.position.set(TREE.x + dx, 1.7, TREE.z + dz);
		g.rotation.set(tx, 0, tz);
		const stick = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.11), stickMat);
		stick.position.y = 0.25;
		const flame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), flameMat);
		flame.position.y = 0.56;
		const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: '#ff9a2e', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending}));
		halo.position.y = 0.58;
		halo.scale.setScalar(1.4);
		g.add(stick, flame, halo);
		g.visible = false;
		island.add(g);
		torches.push({group: g, halo});
	});
	const showTorches = () => torches.forEach((t, i) => (t.group.visible = i < progress.torches));
	showTorches();

	// препятствия на верхушке острова: персонаж их обходит
	// препятствия; портал добавляется ниже (в Незер или в Энд — смотря что стоит)
	const OVER_BASE_OBSTACLES = [{x: TREE.x, z: TREE.z, r: 0.8}, {x: CHEST.x, z: CHEST.z, r: 0.85}, ...BUSHES.map((b) => ({x: b.x, z: b.z, r: 0.75}))];
	const OBSTACLES = [...OVER_BASE_OBSTACLES];

	// ================= ПЕРСОНАЖ =================
	const skin = new THREE.TextureLoader().load('img/skin.png');
	skin.magFilter = THREE.NearestFilter;
	skin.minFilter = THREE.NearestFilter;
	skin.generateMipmaps = false;
	skin.colorSpace = THREE.SRGBColorSpace;

	// материалы кирки общие: цвет меняется вместе с уровнем
	const pickMats = {h: new THREE.MeshLambertMaterial(), H: new THREE.MeshLambertMaterial(), s: new THREE.MeshLambertMaterial({color: '#6e4b26'}), S: new THREE.MeshLambertMaterial({color: '#4f3418'})};
	const paintPickaxe = () => {
		pickMats.h.color.set(TIERS[progress.tier].head);
		pickMats.H.color.set(TIERS[progress.tier].hi);
	};
	paintPickaxe();
	const buildPickaxe = () => {
		const g = new THREE.Group();
		const rows = PICKAXE.length;
		for (const role of Object.keys(pickMats)) {
			const cells = [];
			PICKAXE.forEach((line, y) => [...line].forEach((ch, x) => ch === role && cells.push([x - 5, rows - 1 - y]))); // рукоять по центру
			const m = new THREE.InstancedMesh(box, pickMats[role], cells.length);
			cells.forEach(([x, y], i) => {
				dummy.position.set(x, y, 0);
				dummy.rotation.set(0, 0, 0);
				dummy.scale.setScalar(1);
				dummy.updateMatrix();
				m.setMatrixAt(i, dummy.matrix);
			});
			g.add(m);
		}
		return g;
	};
	// Персонаж-скелет. Два экземпляра: один стоит на острове, второй летает по сайту.
	const makeRig = () => {
		const rig = buildPlayer(skin);
		const pivot = new THREE.Group();
		pivot.rotation.order = 'YXZ';
		pivot.add(rig.root);
		// кирка в правой руке, как в Minecraft: рукоять зажата в кулаке и смотрит вперёд-вверх,
		// плоскость кирки вертикальная, лезвие головки идёт вверх и вниз
		const pick = buildPickaxe();
		const tilt = 0.12; // рукоять поперёк кулака, чуть вверх
		const along = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)); // вдоль рукояти
		const blade = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)); // вдоль головки
		pick.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(blade, along, new THREE.Vector3(1, 0, 0)));
		pick.scale.setScalar(0.8);
		// третья клетка рукояти — в середине кулака (низ руки)
		pick.position.set(0, -8.6, 0.2).addScaledVector(along, -2 * 0.8);
		pick.visible = false;
		rig.parts.armR.add(pick);
		return {...rig, pivot, pick};
	};
	const rig = makeRig();
	rig.root.scale.setScalar(PLAYER_SCALE);
	island.add(rig.pivot); // стоит на острове и качается вместе с ним

	// mode: idle | walk | chest | mine | land | portal | breakPortal — на острове; free — снят с острова и летает по сайту
	const P = {mode: 'idle', pos: HOME.clone(), face: 0.15, path: [], queue: [], actT: 0, walkPhase: 0, holding: false, landT: 0};

	// всё, что стоит на обычном острове, — в своей группе: за порталом её сменяет другой мир
	const overGround = new THREE.Group();
	for (const c of [...island.children]) if (c !== rig.pivot) overGround.add(c);
	island.add(overGround);

	// ================= ПОРТАЛЫ =================
	// В Незер — рамка из обсидиана 4×5, внутри переливается фиолетовая завеса.
	// В Энд — плоский, в земле: рамка из 12 блоков с глазами Края, внутри — звёздная бездна.
	// to — куда ведёт портал; spot — где встать, чтобы зайти; mid и corners — для броска персонажа.
	const pixelCanvasTex = (size) => {
		const c = document.createElement('canvas');
		c.width = c.height = size;
		const t2 = new THREE.CanvasTexture(c);
		t2.magFilter = THREE.NearestFilter;
		t2.minFilter = THREE.NearestFilter;
		t2.generateMipmaps = false;
		t2.colorSpace = THREE.SRGBColorSpace;
		return {ctx: c.getContext('2d'), tex: t2};
	};
	const portalPx = pixelCanvasTex(16);
	const portalImg = portalPx.ctx.createImageData(16, 16);
	const paintPortal = (time) => {
		const d = portalImg.data;
		for (let y = 0; y < 16; y++) {
			for (let x = 0; x < 16; x++) {
				const v = Math.sin(x * 0.55 + time * 2.1) + Math.sin(y * 0.42 - time * 1.6 + x * 0.25) + Math.sin((x - y) * 0.33 + time * 1.2);
				const k = (v + 3) / 6;
				const i = (y * 16 + x) * 4;
				d[i] = 72 + k * 140;
				d[i + 1] = 14 + k * 112;
				d[i + 2] = 150 + k * 105;
				d[i + 3] = 200 + k * 52;
			}
		}
		portalPx.ctx.putImageData(portalImg, 0, 0);
		portalPx.tex.needsUpdate = true;
	};
	paintPortal(0);
	// бездна портала в Энд: тёмно-бирюзовая дымка, поверх три слоя звёзд плывут с разной скоростью
	const voidPx = pixelCanvasTex(32);
	const voidImg = voidPx.ctx.createImageData(32, 32);
	const STAR_C = [[255, 255, 255], [159, 232, 216], [201, 166, 255], [125, 211, 255], [232, 255, 208]];
	const voidStars = Array.from({length: 64}, (_, i) => ({x: (i * 37) % 32, y: (i * 53 + i * i) % 32, layer: i % 3, c: STAR_C[i % 5]}));
	const paintVoid = (time) => {
		const d = voidImg.data;
		for (let y = 0; y < 32; y++) {
			for (let x = 0; x < 32; x++) {
				const neb = Math.sin(x * 0.31 + time * 0.4) * Math.sin(y * 0.27 - time * 0.3) * 0.5 + 0.5;
				const i = (y * 32 + x) * 4;
				d[i] = 5 + neb * 10;
				d[i + 1] = 8 + neb * 30;
				d[i + 2] = 16 + neb * 34;
				d[i + 3] = 255;
			}
		}
		for (const st of voidStars) {
			const sp = [0.5, 1.1, 1.9][st.layer];
			const x = Math.floor((st.x + time * sp) % 32);
			const y = Math.floor((st.y + time * sp * 0.55) % 32);
			const i = (y * 32 + x) * 4;
			const k = [0.55, 0.78, 1][st.layer];
			d[i] = st.c[0] * k;
			d[i + 1] = st.c[1] * k;
			d[i + 2] = st.c[2] * k;
		}
		voidPx.ctx.putImageData(voidImg, 0, 0);
		voidPx.tex.needsUpdate = true;
	};
	paintVoid(0);
	const portalMat = new THREE.MeshBasicMaterial({map: portalPx.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false});
	const voidMat = new THREE.MeshBasicMaterial({map: voidPx.tex});
	const obsidianMat = lambert(tex.obsidian);
	const sparkMats = {nether: new THREE.MeshBasicMaterial({color: '#d4b4ff'}), end: new THREE.MeshBasicMaterial({color: '#9ff0d8'})};
	const portals = [];
	const addSparks = (g, kind, area) => {
		const sparks = new THREE.InstancedMesh(box, sparkMats[kind], 10);
		sparks.frustumCulled = false;
		const sp = Array.from({length: 10}, () => ({x: (Math.random() - 0.5) * area.w, y: area.y0 + Math.random() * (area.y1 - area.y0), z: (Math.random() - 0.5) * area.d, v: 0.3 + Math.random() * 0.5, ph: Math.random() * 6}));
		g.add(sparks);
		return {sparks, sp, area};
	};
	const buildNetherPortal = (parent, o, to) => {
		const g = new THREE.Group();
		g.position.set(o.x, 0, o.z);
		g.rotation.y = o.rot;
		const cells = [];
		for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) if (i === 0 || i === 3 || j === 0 || j === 4) cells.push([i, j]);
		const frameMesh = new THREE.InstancedMesh(box, obsidianMat, cells.length);
		cells.forEach(([i, j], k) => {
			dummy.position.set((i - 1.5) * PORTAL_S, (j + 0.5) * PORTAL_S, 0);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.setScalar(PORTAL_S);
			dummy.updateMatrix();
			frameMesh.setMatrixAt(k, dummy.matrix);
		});
		const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * PORTAL_S, 3 * PORTAL_S), portalMat);
		plane.position.set(0, 2.5 * PORTAL_S, 0);
		const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: '#9a4bff', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending}));
		halo.position.set(0, 2.5 * PORTAL_S, 0);
		halo.scale.set(3.6, 4.4, 1);
		g.add(frameMesh, plane, halo);
		parent.add(g);
		const S = PORTAL_S;
		const p = {
			kind: 'nether',
			to,
			o,
			open: true,
			appearAt: -1,
			group: g,
			plane,
			frameMesh,
			...addSparks(g, 'nether', {w: 2.1, d: 0.9, y0: 0.7, y1: 3.4}),
			pick: [frameMesh, plane],
			center: new THREE.Vector3(o.x, 0, o.z),
			spot: new THREE.Vector3(o.x + Math.sin(o.rot) * 1.15, 0, o.z + Math.cos(o.rot) * 1.15),
			mid: new THREE.Vector3(0, 2.5 * S, 0),
			corners: [[-S, S, 0], [S, S, 0], [S, 4 * S, 0], [-S, 4 * S, 0]].map((v) => new THREE.Vector3(...v)),
			parent,
		};
		portals.push(p);
		return p;
	};
	const END_S = 0.52; // блок рамки портала в Энд (на главном острове)
	const EXIT_S = 0.6; // блок бедроковой чаши выхода из Энда
	const endFrameSide = lambert(tex.endFrameSide);
	const endFrameMats = [endFrameSide, endFrameSide, lambert(tex.endFrameTop), lambert(tex.endStone), endFrameSide, endFrameSide];
	const bedrockMat = lambert(tex.bedrock);
	const eyeMat = new THREE.MeshLambertMaterial({color: '#2f8f62', emissive: '#0d3a26'});
	const hitMat = new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false});
	const eggMat = new THREE.MeshLambertMaterial({color: '#1d0f2b', emissive: '#14052a'});
	const eggSpotMat = new THREE.MeshBasicMaterial({color: '#7b3fc4'});
	const stickMat2 = new THREE.MeshLambertMaterial({color: '#7a5530'});
	const flameMat2 = new THREE.MeshBasicMaterial({color: '#ffd45a'});
	// 12 блоков рамки: квадрат 5×5 без углов
	const RING = [];
	for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if ((i === 0 || i === 4 || j === 0 || j === 4) && !((i === 0 || i === 4) && (j === 0 || j === 4))) RING.push([i, j]);
	// по кругу, чтобы рамка вырастала блок за блоком друг за другом
	RING.sort((a, b) => Math.atan2(a[1] - 2, a[0] - 2) - Math.atan2(b[1] - 2, b[0] - 2));
	const glowSprite = (color, opacity) => new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending}));

	// Портал в Энд. style 'frame' — рамка из 12 блоков с глазами Края (главный остров);
	// 'exit' — выход из Энда: бедроковая чаша, посередине колонна с факелами и яйцом дракона на ней.
	// Выход закрыт, пока не разбито яйцо.
	const buildEndPortal = (parent, o, to, style = 'frame') => {
		const exit = style === 'exit';
		const S = exit ? EXIT_S : END_S;
		const frameH = exit ? S : 0.8 * S;
		const y = exit ? 0.7 * S : 0.62 * S; // высота бездны
		const g = new THREE.Group();
		g.position.set(o.x, 0, o.z);
		g.rotation.y = o.rot;
		const frameMesh = new THREE.InstancedMesh(box, exit ? bedrockMat : endFrameMats, RING.length);
		frameMesh.frustumCulled = false;
		const eyes = exit ? null : new THREE.InstancedMesh(box, eyeMat, RING.length);
		if (eyes) eyes.frustumCulled = false;
		const plane = new THREE.Mesh(new THREE.PlaneGeometry(3 * S, 3 * S), voidMat);
		plane.rotation.x = -Math.PI / 2;
		plane.position.y = y;
		const glowTop = glowSprite('#7dffd8', 0.3);
		glowTop.position.set(0, y + 0.25, 0);
		glowTop.scale.set(5 * S, 1.4, 1);
		const beam = glowSprite('#c4fff0', 0);
		beam.position.set(0, y + 3.2, 0);
		beam.scale.set(1.5, 7.5, 1);
		beam.visible = false;
		// портал плоский и сбоку почти не виден — клики ловит невидимая коробка на всю рамку
		const hit = new THREE.Mesh(new THREE.BoxGeometry(5 * S, exit ? 5.2 * S : 1.3, 5 * S), hitMat);
		hit.position.y = exit ? 2.6 * S : 0.5;
		g.add(frameMesh, plane, glowTop, beam, hit);
		if (eyes) g.add(eyes);
		let egg = null;
		if (exit) {
			// колонна из бедрока и четыре факела на ней
			const pillar = new THREE.InstancedMesh(box, bedrockMat, 4);
			for (let k = 0; k < 4; k++) {
				dummy.position.set(0, (k + 0.5) * S, 0);
				dummy.rotation.set(0, 0, 0);
				dummy.scale.setScalar(S);
				dummy.updateMatrix();
				pillar.setMatrixAt(k, dummy.matrix);
			}
			g.add(pillar);
			for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const tg = new THREE.Group();
				tg.position.set(dx * 0.62 * S, 2.9 * S, dz * 0.62 * S);
				tg.rotation.set(dz * 0.35, 0, -dx * 0.35);
				const stick = new THREE.Mesh(box, stickMat2);
				stick.scale.set(0.08, 0.36, 0.08);
				stick.position.y = 0.18;
				const flame = new THREE.Mesh(box, flameMat2);
				flame.scale.setScalar(0.12);
				flame.position.y = 0.4;
				const halo = glowSprite('#ff9a2e', 0.6);
				halo.position.y = 0.42;
				halo.scale.setScalar(0.9);
				tg.add(stick, flame, halo);
				g.add(tg);
			}
			// яйцо дракона на колонне: чёрное, с фиолетовыми крапинками, рядом мерцает
			egg = new THREE.Group();
			egg.position.set(0, 4 * S, 0);
			[[0.5, 0.24], [0.42, 0.2], [0.28, 0.16]].reduce((yy, [w, h]) => {
				const m = new THREE.Mesh(box, eggMat);
				m.scale.set(w, h, w);
				m.position.y = yy + h / 2;
				egg.add(m);
				return yy + h;
			}, 0);
			for (const [sx, sy, sz] of [[0.26, 0.12, 0.1], [-0.2, 0.3, 0.22], [0.1, 0.44, -0.22], [-0.26, 0.16, -0.12]]) {
				const sp = new THREE.Mesh(box, eggSpotMat);
				sp.scale.setScalar(0.06);
				sp.position.set(sx, sy, sz);
				egg.add(sp);
			}
			const eggGlow = glowSprite('#b06bff', 0.35);
			eggGlow.position.y = 0.3;
			eggGlow.scale.setScalar(1.3);
			egg.add(eggGlow);
			g.add(egg);
		}
		parent.add(g);
		// встаёт с той стороны, что ближе к середине острова
		const toward = new THREE.Vector2(-o.x, -o.z).normalize();
		const reach = exit ? 2.3 : 1.9;
		const p = {
			kind: 'end',
			style,
			to,
			o,
			S,
			frameH,
			y,
			group: g,
			plane,
			frameMesh,
			eyes,
			glowTop,
			beam,
			egg,
			open: !exit,
			appearAt: -1,
			fxStage: 0,
			...addSparks(g, 'end', {w: 2.6 * S, d: 2.6 * S, y0: y, y1: y + 1.8}),
			pick: [hit],
			center: new THREE.Vector3(o.x, 0, o.z),
			spot: new THREE.Vector3(o.x + toward.x * reach, 0, o.z + toward.y * reach),
			mid: new THREE.Vector3(0, y, 0),
			corners: [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]].map(([a, b]) => new THREE.Vector3(a * S, y, b * S)),
			parent,
		};
		p.animate = (t) => animateEndPortal(p, t);
		p.animate(Infinity);
		portals.push(p);
		return p;
	};
	// Появление портала в Энд (t — секунды с начала, Infinity — готовое состояние).
	// Рамка: блоки по кругу вырастают из земли, потом по очереди загораются глаза Края.
	// Потом бездна разливается от середины, вверх бьёт столб света.
	const surfaceStart = (p) => (p.style === 'frame' ? 1.9 : 0.25);
	const appearTime = (p) => surfaceStart(p) + 1.5;
	const animateEndPortal = (p, t) => {
		const S = p.S;
		const done = t === Infinity;
		if (p.style === 'frame') {
			RING.forEach(([i, j], k) => {
				const kk = done ? 1 : clamp((t - k * 0.08) / 0.35, 0, 1);
				const e = Math.max(0.001, done ? 1 : easeOutBack(kk));
				dummy.rotation.set(0, 0, 0);
				dummy.position.set((i - 2) * S, p.frameH / 2 - (1 - kk) * p.frameH * 1.2, (j - 2) * S);
				dummy.scale.set(S * e, p.frameH * e, S * e);
				dummy.updateMatrix();
				p.frameMesh.setMatrixAt(k, dummy.matrix);
				const ek = done ? 1 : clamp((t - 1.05 - k * 0.06) / 0.22, 0, 1);
				const es = Math.max(0.001, done ? 1 : easeOutBack(ek));
				dummy.position.set((i - 2) * S, p.frameH + 0.09 * S, (j - 2) * S);
				dummy.scale.set(0.42 * S * es, 0.18 * S * es, 0.42 * S * es);
				dummy.updateMatrix();
				p.eyes.setMatrixAt(k, dummy.matrix);
			});
			p.frameMesh.instanceMatrix.needsUpdate = true;
			p.eyes.instanceMatrix.needsUpdate = true;
		} else if (done) {
			RING.forEach(([i, j], k) => {
				dummy.rotation.set(0, 0, 0);
				dummy.position.set((i - 2) * S, p.frameH / 2, (j - 2) * S);
				dummy.scale.setScalar(S);
				dummy.updateMatrix();
				p.frameMesh.setMatrixAt(k, dummy.matrix);
			});
			p.frameMesh.instanceMatrix.needsUpdate = true;
		}
		// бездна: от середины к краям
		const t0 = surfaceStart(p);
		const sv = done ? (p.open ? 1 : 0) : clamp((t - t0) / 0.6, 0, 1);
		p.plane.visible = sv > 0;
		p.plane.scale.setScalar(Math.max(0.001, done ? sv : easeOutBack(sv)));
		p.glowTop.visible = sv > 0;
		p.glowTop.material.opacity = 0.3 * sv;
		p.sparks.visible = sv >= 1;
		// столб света
		const bt = done ? -1 : t - t0;
		const bo = bt >= 0 && bt < 1.4 ? Math.sin((bt / 1.4) * Math.PI) * 0.9 : 0;
		p.beam.material.opacity = bo;
		p.beam.visible = bo > 0.01;
	};
	// закрыть выход из Энда (при каждом входе в Энд): яйцо на месте, бездны нет
	const closeExit = (p) => {
		p.open = false;
		p.appearAt = -1;
		p.egg.visible = true;
		p.egg.rotation.set(0, 0, 0);
		p.animate(Infinity);
	};
	// на главном острове: портал в Незер, а после того как его сломают незеритовой киркой — портал в Энд
	const portalOver = buildNetherPortal(overGround, PORTAL_O, 'nether');
	const portalEndOver = buildEndPortal(overGround, END_O, 'end');
	portalOver.group.visible = !progress.endPortal;
	portalEndOver.group.visible = progress.endPortal;
	const overObstacles = () => [...OVER_BASE_OBSTACLES, ...(progress.endPortal ? [{x: END_O.x, z: END_O.z, r: 1.35}] : portalObstacles(PORTAL_O))];
	OBSTACLES.splice(0, OBSTACLES.length, ...overObstacles());

	// ================= МИРЫ =================
	// Каждый мир — своя группа на острове. Незер и Энд строятся при первом входе:
	// пока туда не заглянули, они не занимают память и не замедляют загрузку.
	const BASIC = (map) => new THREE.MeshBasicMaterial({map});
	const hullRing = (r0, r1, r2, y2) => {
		const out = [];
		for (let i = 0; i < 16; i++) {
			const a = (i / 16) * Math.PI * 2;
			out.push(new THREE.Vector3(Math.cos(a) * r0, 0.05, Math.sin(a) * r0));
			out.push(new THREE.Vector3(Math.cos(a) * r1, -2, Math.sin(a) * r1));
			out.push(new THREE.Vector3(Math.cos(a) * r2, y2, Math.sin(a) * r2));
		}
		return out;
	};
	// блоки мира: по одному InstancedMesh на тип; блоки можно добывать, они вырастают снова
	const meshBlocks = (list, mats, parent) => {
		const groups = new Map();
		for (const b of list) {
			b.minedAt = -1;
			b.scale = 1;
			if (!groups.has(b.type)) groups.set(b.type, []);
			groups.get(b.type).push(b);
		}
		const meshes = [];
		for (const [type, bl] of groups) {
			const mesh = new THREE.InstancedMesh(box, mats[type], bl.length);
			mesh.userData.blocks = bl;
			bl.forEach((b, i) => {
				b.mesh = mesh;
				b.index = i;
				setBlock(b, 1);
			});
			parent.add(mesh);
			meshes.push(mesh);
		}
		return meshes;
	};
	const blockSet = () => {
		const list = [];
		const at = new Map();
		const key = (x, y, z) => `${x},${y},${z}`;
		const add = (type, x, y, z) => {
			const k = key(x, y, z);
			if (at.has(k)) {
				at.get(k).type = type;
				return at.get(k);
			}
			const b = {type, pos: new THREE.Vector3(x, y, z)};
			list.push(b);
			at.set(k, b);
			return b;
		};
		// блоки на краю слоя, видные спереди (ближе к зрителю — первыми)
		const exposedAt = (y) =>
			list
				.filter((b) => b.pos.y === y && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !at.has(key(b.pos.x + dx, y, b.pos.z + dz))))
				.sort((a, b) => b.pos.z + b.pos.x * 0.3 - (a.pos.z + a.pos.x * 0.3));
		return {list, at, key, add, exposedAt};
	};

	// --- Незер: большой остров из незерака с кварцем, золотом, магмой и древними обломками,
	// багровый гриб с грибосветами, лавопад, светокамень снизу и портал домой ---
	const buildNether = () => {
		const ground = new THREE.Group();
		island.add(ground);
		const N_PORTAL = {x: 2.8, z: -2.6, rot: -0.55};
		const N_TREE = {x: -2, z: -2};
		const LAVA_AT = {x: -3, z: 4};
		const nr = rng(23);
		const B = blockSet();
		[5.6, 5.1, 4.5, 3.8, 3.0, 2.2, 1.3].forEach((radius, layer) => {
			for (let x = -6; x <= 6; x++) {
				for (let z = -6; z <= 6; z++) {
					const d = Math.hypot(x, z) + (nr() - 0.5) * 0.7;
					if (d > radius) continue;
					let type = 'netherrack';
					const o = nr();
					if (layer === 0) {
						if (o < 0.04) type = 'magma';
					} else if (o < 0.07) type = 'quartzOre';
					else if (o < 0.1) type = 'netherGold';
					else if (o < 0.13 && layer > 1) type = 'magma';
					B.add(type, x, -layer - 0.5, z);
				}
			}
		});
		// древние обломки (из них незерит): на краю острова спереди — их видно сверху, и до них можно дотянуться
		const edge = B.exposedAt(-0.5).filter((b) => Math.hypot(b.pos.x - LAVA_AT.x, b.pos.z - LAVA_AT.z) > 1.5);
		[edge[1], edge[5], edge[9]].forEach((b) => b && (b.type = 'ancientDebris'));
		B.add('lava', LAVA_AT.x, -0.5, LAVA_AT.z);
		for (const [x, z] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) B.add('glowstone', x, -7.5, z);
		B.add('glowstone', 0, -8.5, 0);
		for (let y = 0; y < 5; y++) B.add('crimsonStem', N_TREE.x, y + 0.5, N_TREE.z);
		const cap = (dx, y, dz) => B.add(nr() < 0.13 ? 'shroomlight' : 'wartBlock', N_TREE.x + dx, y, N_TREE.z + dz);
		for (const y of [3.5, 4.5]) {
			for (let dx = -2; dx <= 2; dx++) {
				for (let dz = -2; dz <= 2; dz++) {
					if (dx === 0 && dz === 0) continue;
					if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && nr() < 0.6) continue;
					if (y === 3.5 && Math.abs(dx) < 2 && Math.abs(dz) < 2) continue; // снизу шапка полая
					cap(dx, y, dz);
				}
			}
		}
		for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cap(dx, 5.5, dz);
		cap(0, 6.5, 0);
		const stemSide = lambert(tex.crimsonStem);
		const stemTop = lambert(tex.crimsonTop);
		const debrisSide = lambert(tex.ancientDebrisSide);
		const debrisTop = lambert(tex.ancientDebrisTop);
		const meshes = meshBlocks(
			B.list,
			{
				netherrack: lambert(tex.netherrack),
				quartzOre: lambert(tex.quartzOre),
				netherGold: lambert(tex.netherGold),
				ancientDebris: [debrisSide, debrisSide, debrisTop, debrisTop, debrisSide, debrisSide],
				magma: BASIC(tex.magma),
				glowstone: BASIC(tex.glowstone),
				shroomlight: BASIC(tex.shroomlight),
				lava: BASIC(tex.lava),
				wartBlock: lambert(tex.wartBlock),
				crimsonStem: [stemSide, stemSide, stemTop, stemTop, stemSide, stemSide],
			},
			ground,
		);
		// багровые корни — один InstancedMesh на все (одна отрисовка вместо десятков)
		const spots = B.list.filter((b) => {
			if (b.type !== 'netherrack' || b.pos.y !== -0.5) return false;
			const {x, z} = b.pos;
			if (Math.hypot(x + 0.4, z - 0.5) < 1.3 || portalDist(N_PORTAL, x, z) < 1.2 || B.at.has(B.key(x, 0.5, z))) return false;
			return nr() < 0.16;
		});
		const roots = new THREE.InstancedMesh(crossGeo, plantMat(tex.crimsonRoots), spots.length);
		spots.forEach((b, i) => {
			dummy.position.set(b.pos.x + (nr() - 0.5) * 0.2, 0, b.pos.z + (nr() - 0.5) * 0.2);
			dummy.rotation.set(0, nr() * Math.PI, 0);
			dummy.scale.setScalar(0.75 + nr() * 0.3);
			dummy.updateMatrix();
			roots.setMatrixAt(i, dummy.matrix);
		});
		ground.add(roots);
		// лавопад с края острова
		const lavaTex = tex.lava.clone();
		lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
		lavaTex.repeat.set(1, 6);
		lavaTex.needsUpdate = true;
		const lavaFall = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 6), new THREE.MeshBasicMaterial({map: lavaTex, side: THREE.DoubleSide}));
		lavaFall.position.set(LAVA_AT.x, -3, LAVA_AT.z + 0.52);
		ground.add(lavaFall);
		// искры-угольки и красное зарево (не качаются вместе с островом); на телефоне искр меньше
		const fx = new THREE.Group();
		world.add(fx);
		const EMB = innerWidth < 900 ? 55 : 100;
		const pos = new Float32Array(EMB * 3);
		const col = new Float32Array(EMB * 3);
		const c = new THREE.Color();
		for (let i = 0; i < EMB; i++) {
			pos[i * 3] = (nr() - 0.5) * 22;
			pos[i * 3 + 1] = (nr() - 0.5) * 20;
			pos[i * 3 + 2] = (nr() - 0.5) * 12 - 2;
			c.set(['#ff7a1f', '#ffb02e', '#ff4a1a', '#ffd36b'][Math.floor(nr() * 4)]);
			col.set([c.r, c.g, c.b], i * 3);
		}
		const emberGeo = new THREE.BufferGeometry();
		emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		emberGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
		fx.add(new THREE.Points(emberGeo, new THREE.PointsMaterial({size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false})));
		const redGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: '#ff3a12', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending}));
		redGlow.position.set(0, -2, -16);
		redGlow.scale.setScalar(24);
		fx.add(redGlow);
		const portal = buildNetherPortal(ground, N_PORTAL, 'over');
		return {
			id: 'nether',
			ground,
			fx,
			blocks: B.list,
			meshes,
			portal,
			home: new THREE.Vector3(-0.4, 0, 0.5),
			standR: 4.5,
			obstacles: () => [{x: N_TREE.x, z: N_TREE.z, r: 0.8}, ...portalObstacles(N_PORTAL)],
			box: {w: 14.5, h: 16.5, cy: -0.9},
			view: [0.2, 0.5, 1],
			hull: hullRing(5.8, 5.2, 2.2, -8),
			light: ['#ffb49c', '#ffd8b8', '#ff5a1f'],
			sky: ['#ffd2a6', '#ffb27a', '#ff8a4a', '#ff5a2a', '#ffd36b', '#ff9a5a'],
			css: 'is-nether',
			tick: (dt) => {
				lavaTex.offset.y = (lavaTex.offset.y - dt * 0.55) % 1;
				for (let i = 0; i < EMB; i++) {
					pos[i * 3 + 1] += dt * (0.4 + (i % 7) * 0.08);
					if (pos[i * 3 + 1] > 10) pos[i * 3 + 1] = -10;
				}
				emberGeo.attributes.position.needsUpdate = true;
			},
		};
	};

	// --- Энд: остров из камня Края, обсидиановые колонны с кристаллами Края, хорус.
	// На краю — выход домой: бедроковая чаша с яйцом дракона на колонне. Разбил яйцо — выход открылся ---
	const buildEnd = () => {
		const ground = new THREE.Group();
		island.add(ground);
		const er = rng(41);
		const B = blockSet();
		[5.0, 4.4, 3.6, 2.6, 1.5].forEach((radius, layer) => {
			for (let x = -6; x <= 6; x++) {
				for (let z = -6; z <= 6; z++) {
					const d = Math.hypot(x, z) + (er() - 0.5) * 0.8;
					if (d <= radius) B.add('endStone', x, -layer - 0.5, z);
				}
			}
		});
		const PILLARS = [
			{x: -3, z: -2, h: 5},
			{x: 3, z: -3, h: 6},
			{x: -1, z: -4, h: 4},
		];
		for (const p of PILLARS) for (let y = 0; y < p.h; y++) B.add('obsidian', p.x, y + 0.5, p.z);
		const meshes = meshBlocks(B.list, {endStone: lambert(tex.endStone), obsidian: obsidianMat, bedrock: lambert(tex.bedrock)}, ground);
		// кристаллы Края на колоннах: светятся, вращаются в клетке
		const crystalMat = new THREE.MeshBasicMaterial({color: '#ffb3e6'});
		const cageMat = new THREE.MeshBasicMaterial({color: '#e8d6ff', wireframe: true});
		const crystals = PILLARS.map((p) => {
			const g = new THREE.Group();
			g.position.set(p.x, p.h + 0.9, p.z);
			const core = new THREE.Mesh(box, crystalMat);
			core.scale.setScalar(0.42);
			const cage = new THREE.Mesh(box, cageMat);
			cage.scale.setScalar(0.85);
			const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: '#ff6ad5', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending}));
			halo.scale.setScalar(2.4);
			g.add(core, cage, halo);
			ground.add(g);
			return {g, core, cage, base: p.h + 0.9};
		});
		// хорус: фиолетовые стебли с цветами
		const chorusParts = [];
		const grow = (x, y, z, n, dir) => {
			for (let i = 0; i < n; i++) chorusParts.push([x, y + i * 0.5, z, 'stem']);
			const top = y + n * 0.5;
			if (dir) {
				chorusParts.push([x + dir[0] * 0.5, top - 0.5, z + dir[1] * 0.5, 'stem']);
				chorusParts.push([x + dir[0] * 0.5, top, z + dir[1] * 0.5, 'flower']);
			}
			chorusParts.push([x, top, z, 'flower']);
		};
		grow(-3.5, 0.25, -0.2, 3, [0, 1]);
		grow(0.5, 0.25, -2.6, 5, [-1, 0]);
		const chorusMat = {stem: lambert(tex.chorus), flower: lambert(tex.chorusFlower)};
		for (const kind of ['stem', 'flower']) {
			const parts = chorusParts.filter((p) => p[3] === kind);
			const m = new THREE.InstancedMesh(box, chorusMat[kind], parts.length);
			parts.forEach(([x, y, z], i) => {
				dummy.position.set(x, y, z);
				dummy.rotation.set(0, 0, 0);
				dummy.scale.setScalar(kind === 'flower' ? 0.5 : 0.42);
				dummy.updateMatrix();
				m.setMatrixAt(i, dummy.matrix);
			});
			ground.add(m);
		}
		// фиолетовые пылинки вокруг
		const fx = new THREE.Group();
		world.add(fx);
		const DUST = innerWidth < 900 ? 40 : 70;
		const pos = new Float32Array(DUST * 3);
		for (let i = 0; i < DUST; i++) pos.set([(er() - 0.5) * 22, (er() - 0.5) * 18, (er() - 0.5) * 12 - 2], i * 3);
		const dustGeo = new THREE.BufferGeometry();
		dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		fx.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({color: '#c9a6ff', size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false})));
		// выход — на самом краю острова спереди справа; открывается, когда разбито яйцо на колонне
		const portal = buildEndPortal(ground, {x: 2.4, z: 2.3, rot: 0.2}, 'over', 'exit');
		return {
			id: 'end',
			ground,
			fx,
			blocks: B.list,
			meshes,
			portal,
			home: new THREE.Vector3(-0.6, 0, 1.6),
			standR: 4,
			// появляется посреди острова: выхода пока нет
			arrive: new THREE.Vector3(-0.6, 0, 1.6),
			obstacles: () => [...PILLARS.map((p) => ({x: p.x, z: p.z, r: 0.75})), {x: -3.5, z: -0.2, r: 0.6}, {x: 0.5, z: -2.6, r: 0.6}, {x: 2.4, z: 2.3, r: 1.75}],
			box: {w: 13.5, h: 16, cy: 0.4},
			view: [0.2, 0.42, 1],
			hull: hullRing(5.2, 4.6, 1.8, -5.5),
			light: ['#d9c8ff', '#fff4e0', '#b06bff'],
			sky: ['#ffffff', '#efe6ff', '#d4b8ff', '#b48aff', '#f0c6ff', '#d9fff1'],
			css: 'is-end',
			tick: (dt, idle) => {
				for (const c of crystals) {
					c.g.position.y = c.base + Math.sin(idle * 1.6 + c.base) * 0.18;
					c.core.rotation.set(idle * 1.3, idle * 1.7, 0);
					c.cage.rotation.set(-idle * 0.9, idle * 0.6, idle * 0.4);
				}
				for (let i = 0; i < DUST; i++) {
					pos[i * 3 + 1] += dt * 0.25;
					if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = -9;
				}
				dustGeo.attributes.position.needsUpdate = true;
			},
		};
	};

	// ================= ПЕРЕХОД МЕЖДУ МИРАМИ =================
	let worldId = 'over';
	const worlds = {over: {id: 'over', ground: overGround, fx: null, blocks, meshes: islandMeshes, home: HOME.clone(), standR: 3.0, obstacles: overObstacles, view: [0.2, 0.2, 1], light: ['#bfb4ff', '#ffffff', '#9a6bff'], sky: null, css: ''}};
	const ensureWorld = (id) => {
		if (!worlds[id]) worlds[id] = id === 'nether' ? buildNether() : buildEnd();
		return worlds[id];
	};
	let warp = null; // {at, to, swapped} — вспышка портала, на её пике мир меняется
	let portalShrink = 1;
	const portalHere = () => (worldId === 'over' ? (progress.endPortal ? portalEndOver : portalOver) : worlds[worldId].portal);
	const NETHER_KEY = 'dex.nether';
	let visitedNether = false;
	try {
		visitedNether = localStorage.getItem(NETHER_KEY) === '1';
	} catch {
		// приватный режим
	}
	const warpFx = document.createElement('div');
	warpFx.className = 'hero-warp';
	warpFx.setAttribute('aria-hidden', 'true');
	canvas.parentElement.append(warpFx);
	const startWarp = () => {
		if (warp && !warp.swapped) return; // уже летит; на «хвосте» вспышки после прибытия — можно снова
		warp = {at: now, to: portalHere().to, swapped: false};
		const z = canvas.parentElement;
		z.classList.remove('is-warping', 'warp-end');
		void z.offsetWidth; // перезапуск анимации
		z.classList.add('is-warping');
		z.classList.toggle('warp-end', portalHere().kind === 'end');
		on('portal', warp.to);
	};
	const switchWorld = (to) => {
		worlds.over.box ||= {...BOX};
		worlds.over.hull ||= [...ISLAND_PTS];
		const W = ensureWorld(to);
		// добытые блоки старого мира сразу вырастают
		for (const b of activeBlocks) {
			b.minedAt = -1;
			setBlock(b, 1);
		}
		activeBlocks.clear();
		worldId = to;
		for (const w of Object.values(worlds)) {
			w.ground.visible = w === W;
			if (w.fx) w.fx.visible = w === W;
		}
		galaxy.visible = to === 'over';
		HOME.copy(W.home);
		STAND_R = W.standR;
		OBSTACLES.splice(0, OBSTACLES.length, ...W.obstacles());
		Object.assign(BOX, W.box);
		viewDir.set(...W.view).normalize();
		ISLAND_PTS.splice(0, ISLAND_PTS.length, ...W.hull);
		amb.color.set(W.light[0]);
		key.color.set(W.light[1]);
		rim.color.set(W.light[2]);
		skyColors = W.sky || SKY_COLORS;
		const z = canvas.parentElement;
		z.classList.remove('is-nether', 'is-end');
		if (W.css) z.classList.add(W.css);
		frame();
		widgetsAt = -1;
		// персонаж выходит из портала другого мира (в Энде выход закрыт — появляется посреди острова)
		const p = portalHere();
		if (p.style === 'exit') closeExit(p);
		P.mode = 'idle';
		P.queue = [walkTo(HOME)];
		P.pos.copy(W.arrive || p.spot);
		P.face = Math.atan2(p.spot.x - p.center.x, p.spot.z - p.center.z);
		P.holding = false;
		portalShrink = 1;
		popAt = now;
		if (to === 'nether' && !visitedNether) {
			visitedNether = true;
			try {
				localStorage.setItem(NETHER_KEY, '1');
			} catch {
				// приватный режим
			}
		}
		say(to === 'nether' ? oneOf('say.nether', 'say.hot') : to === 'end' ? 'say.end' : 'say.homeBack', 1.8);
		on('world', to);
	};
	// незеритовой киркой ломает портал в Незер — на его месте появляется портал в Энд
	const breakNetherPortal = () => {
		const p = portalOver;
		for (let i = 0; i < 26; i++) {
			const at = islandToWorldLocal(p.group.localToWorld(tmp.set((Math.random() - 0.5) * 2.6, Math.random() * 3.8, 0)), tmp2);
			spawnDebris(at, i % 3 ? '#2a1d40' : '#9a4bff', 1, 0.9, 1);
		}
		const c = toPx(p.group.localToWorld(tmp.copy(p.mid)));
		const r = canvas.getBoundingClientRect();
		flash(r.left + c.x, r.top + c.y);
		p.group.visible = false;
		portalMat.opacity = 1;
		progress.endPortal = true;
		saveProgress(progress);
		portalEndOver.group.visible = true;
		portalEndOver.appearAt = now;
		portalEndOver.fxStage = 0;
		portalEndOver.animate(0);
		OBSTACLES.splice(0, OBSTACLES.length, ...overObstacles());
		say('say.endPortal', 2);
		on('endPortal');
	};
	// разбил яйцо дракона на колонне — выход из Энда открывается
	const openEndExit = () => {
		const p = portalHere();
		const at = world.worldToLocal(p.egg.getWorldPosition(new THREE.Vector3()));
		for (let i = 0; i < 18; i++) spawnDebris(at, i % 3 ? '#1d0f2b' : '#9a4bff', 1, 0.8, 1);
		const c = toPx(p.egg.getWorldPosition(tmp));
		const r = canvas.getBoundingClientRect();
		flash(r.left + c.x, r.top + c.y);
		p.egg.visible = false;
		p.open = true;
		p.appearAt = now;
		p.fxStage = 0;
		say('say.eggBroken', 1.8);
		on('egg');
	};
	// клик по порталу: персонаж идёт и заходит в него; летающий — летит в портал.
	// С незеритовой киркой портал в Незер на главном острове он ломает.
	const enterPortal = () => {
		if (warp && !warp.swapped) return;
		const ph = portalHere();
		if (!ph.open) {
			// выход из Энда закрыт: сначала разбить яйцо дракона
			if (P.mode === 'free') return warn('away');
			if (busy()) return warn('busy');
			P.queue = [walkTo(ph.spot), {type: 'breakEgg'}];
			say('say.breakEgg', 1.5);
			return;
		}
		const breaking = worldId === 'over' && !progress.endPortal && progress.tier >= 4;
		if (P.mode === 'free') {
			if (breaking) return warn('away');
			const c = portalCenterDoc();
			PB.held = false;
			PB.perch = null;
			PB.seek = null;
			setPose('fly');
			PB.auto = {x: c.x, y: c.y, then: 'portal'};
			return;
		}
		if (busy()) return warn('busy');
		if (breaking) {
			P.queue = [walkTo(CHEST_SPOT), {type: 'chest', take: true}, walkTo(portalOver.spot), {type: 'breakPortal'}, walkTo(CHEST_SPOT), {type: 'chest', take: false}, walkTo(HOME)];
			say('say.breakPortal', 1.5);
			return;
		}
		P.queue = [walkTo(portalHere().spot), {type: 'portal'}];
		say(portalHere().to === 'over' ? 'say.homeGo' : portalHere().to === 'end' ? 'say.endGo' : 'say.portalGo', 1.4);
	};
	const portalCenterDoc = () => {
		const o = docOffset();
		const p = portalHere();
		const c = toPx(p.group.localToWorld(tmp.copy(p.mid)));
		return {x: c.x + o.x, y: c.y + o.y};
	};
	// завеса портала на странице (для броска летающего персонажа)
	const portalPolyDoc = () => {
		const o = docOffset();
		const p = portalHere();
		const pts = p.corners.map((v) => toPx(p.group.localToWorld(tmp.copy(v))));
		return convexHull(pts).map((q) => ({x: q.x + o.x, y: q.y + o.y}));
	};
	// летающий персонаж над завесой портала? У плоского портала (Энд) считается точка у ног —
	// иначе он «затягивался», когда его просто ставили на остров рядом с порталом
	const overPortalNow = () => {
		const ph = portalHere();
		if (!ph.open || !zone.getClientRects().length) return false;
		const pp = portalPolyDoc();
		if (pp.length < 3) return false;
		if (ph.kind === 'end') return hullDistance(PB.x, PB.y + PB.hh * 0.6, pp).dist < 0;
		return !!boxPoly({x: PB.x, y: PB.y, hw: PB.hw * 0.8, hh: PB.hh * 0.7}, pp);
	};
	// летающего персонажа закинули в портал
	const enterFromFree = () => {
		flash(PB.x - scrollX, PB.y - scrollY);
		P.mode = 'idle';
		P.queue = [];
		P.holding = false;
		P.pos.copy(portalHere().spot);
		PB.held = false;
		PB.auto = null;
		PB.perch = null;
		PB.seek = null;
		PB.spin = 0;
		PB.spinV = 0;
		drag = null;
		overlay.classList.remove('is-on');
		startWarp();
	};

	// ================= БОЛЬШАЯ НАДПИСЬ «1DEX1 SHOP» ПОСЕРЕДИНЕ =================
	// Висит перед камерой, поэтому всегда в одном месте экрана: на компьютере — посередине
	// слева от острова, на телефоне — сверху. Повёрнута так, что передние грани кубиков
	// смотрят прямо на зрителя.
	// Буквы из шрифта сайта, разбитые на множество маленьких блоков (voxelword.js).
	// На компьютере — в одну строку, на телефоне — в две.
	const bigGroup = new THREE.Group();
	camera.add(bigGroup);
	scene.add(camera);
	const bigTop = new THREE.Color('#d2ff66');
	const bigBottom = new THREE.Color('#58a80a');
	const BIG_MAX = 2400;
	const bigMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel, emissive: '#1f2b0e'}), BIG_MAX);
	bigMesh.setColorAt(0, bigTop);
	bigMesh.count = 0;
	bigMesh.frustumCulled = false;
	bigGroup.add(bigMesh);
	let BIG = {cells: [], width: 1, height: 1, cx: 0, cy: 0};
	let bigVoxels = [];
	let bigFind = () => -1;
	let bigWide = null;
	let bigCell = 0.3; // размер блока большой надписи в единицах мира (считается в frame)
	const bigBase = new THREE.Vector3(); // где надпись висит без покачивания
	const glintColor = new THREE.Color();

	// Ломающиеся надписи: unit — размер блока, z — глубина, amp — волна, lift — выезд под курсором
	// glint — по надписи время от времени пробегает блик
	const SETS = [{mesh: bigMesh, list: bigVoxels, unit: 1, z: 0, amp: 0.3, lift: 1.6, glint: true}];
	const buildBig = (wide) => {
		if (bigWide === wide) return;
		bigWide = wide;
		BIG = rasterize(wide ? ['1DEX1 SHOP'] : ['1DEX1', 'SHOP'], 10); // меньше 10 рядов — у «E» слипаются перекладины
		bigFind = cellIndex(BIG);
		bigVoxels = BIG.cells.slice(0, BIG_MAX).map((c) => ({
			...c,
			color: bigTop.clone().lerp(bigBottom, c.ty).multiplyScalar(0.93 + c.seed * 0.12),
			phase: c.x * 0.11 + c.line * 1.4,
			hover: 0,
			hoverTarget: 0,
			brokenAt: -1,
			regrowAt: 0,
			scale: 1,
		}));
		bigVoxels.forEach((v, i) => bigMesh.setColorAt(i, v.color));
		bigMesh.count = bigVoxels.length;
		bigMesh.instanceColor.needsUpdate = true;
		SETS[0].list = bigVoxels;
		SETS[0].bounded = false;
	};

	// ================= ОСКОЛКИ =================
	const DEBRIS = 260;
	const debris = Array.from({length: DEBRIS}, () => ({life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, size: 0}));
	const debrisMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel}), DEBRIS);
	debrisMesh.frustumCulled = false;
	for (let i = 0; i < DEBRIS; i++) debrisMesh.setColorAt(i, new THREE.Color('#ffffff'));
	world.add(debrisMesh);
	let debrisCursor = 0;
	const debrisColor = new THREE.Color();
	// pos — в координатах world
	const spawnDebris = (pos, color, count, power = 1, size = 1) => {
		debrisColor.set(color);
		for (let k = 0; k < count; k++) {
			const d = debris[debrisCursor];
			debrisMesh.setColorAt(debrisCursor, debrisColor);
			debrisCursor = (debrisCursor + 1) % DEBRIS;
			d.life = 0.6 + Math.random() * 0.5;
			d.pos.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + (Math.random() - 0.5) * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
			d.vel.set((Math.random() - 0.5) * 4.5 * power, (1.5 + Math.random() * 4) * power, (Math.random() - 0.2) * 3.5 * power);
			d.spin = (Math.random() - 0.5) * 12;
			d.size = (0.09 + Math.random() * 0.12) * size;
		}
		debrisMesh.instanceColor.needsUpdate = true;
	};
	const islandToWorldLocal = (v, out) => world.worldToLocal(island.localToWorld(out.copy(v)));

	// ================= ГАЛАКТИКА НА ФОНЕ =================
	// Спиральные рукава из звёзд медленно вращаются вокруг яркого ядра.
	const galaxy = new THREE.Group();
	galaxy.position.set(-3, -2, -82);
	galaxy.rotation.set(-1.18, 0.2, 0);
	scene.add(galaxy);
	const disk = new THREE.Group();
	galaxy.add(disk);
	{
		const gr = rng(77);
		const N = innerWidth < 900 ? 1500 : 2600; // на телефоне звёзд в галактике меньше
		const pos = new Float32Array(N * 3);
		const col = new Float32Array(N * 3);
		const c = new THREE.Color();
		const palette = ['#ffffff', '#e4dbff', '#c3a6ff', '#c3a6ff', '#9a6bff', '#9a6bff', '#b8ff3d', '#ffe59a'];
		for (let i = 0; i < N; i++) {
			const arm = i % 3;
			const r = 1.2 + Math.pow(gr(), 0.85) * 40;
			const spread = (gr() - 0.5) * (0.7 + r * 0.045) + (gr() - 0.5) * 0.5;
			const a = (arm / 3) * Math.PI * 2 + r * 0.17 + spread;
			pos[i * 3] = Math.cos(a) * r;
			pos[i * 3 + 1] = Math.sin(a) * r;
			pos[i * 3 + 2] = (gr() - 0.5) * (2.2 - Math.min(1.6, r * 0.04));
			const inner = r < 7;
			c.set(inner ? (gr() < 0.6 ? '#ffe59a' : '#ffffff') : palette[Math.floor(gr() * palette.length)]);
			const fade = 0.35 + 0.45 * (1 - r / 42);
			col[i * 3] = c.r * fade;
			col[i * 3 + 1] = c.g * fade;
			col[i * 3 + 2] = c.b * fade;
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
		disk.add(new THREE.Points(geo, new THREE.PointsMaterial({size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending})));
		const core = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: '#9a6bff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending}));
		core.scale.setScalar(26);
		galaxy.add(core);
	}

	// ================= КАДРИРОВАНИЕ =================
	const BOX = {w: 11.5, h: 14.6, cy: 0.5}; // от низа острова до макушки дерева
	const viewDir = new THREE.Vector3(0.2, 0.2, 1).normalize();
	let width = 1;
	let height = 1;
	let focal = 600;

	const frame = () => {
		const wide = width >= 900;
		buildBig(wide);
		// остров: на компьютере справа, на телефоне под большой надписью
		const rect = wide ? {x0: 0.63, x1: 0.985, y0: 0.07, y1: 0.97} : {x0: 0.04, x1: 0.96, y0: 0.26, y1: 0.995};
		const aspect = width / height;
		const tan = Math.tan((camera.fov * Math.PI) / 360);
		const rw = rect.x1 - rect.x0;
		const rh = rect.y1 - rect.y0;
		const dist = Math.max(BOX.w / (rw * aspect), BOX.h / rh) / (2 * tan);
		const visH = 2 * dist * tan;
		const visW = visH * aspect;
		const target = new THREE.Vector3(0, BOX.cy, 0);
		camera.position.copy(target).addScaledVector(viewDir, dist);
		camera.lookAt(target);
		camera.updateMatrixWorld();
		const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
		const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
		const cx = (rect.x0 + rect.x1) / 2;
		const cy = (rect.y0 + rect.y1) / 2;
		const shift = right.multiplyScalar((0.5 - cx) * visW).add(up.multiplyScalar((cy - 0.5) * visH));
		camera.position.add(shift);
		camera.lookAt(target.add(shift));
		camera.aspect = aspect;
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld();
		focal = height / 2 / tan;
		// большая надпись: на компьютере посередине слева от острова, на телефоне — сверху
		const L = wide ? {cx: 0.35, cy: 0.42, w: 0.58, h: 0.2} : {cx: 0.5, cy: 0.14, w: 0.68, h: 0.22};
		const d = dist * 0.8;
		const viewH = 2 * d * tan;
		const viewW = viewH * aspect;
		bigCell = Math.min((L.w * viewW) / BIG.width, (L.h * viewH) / BIG.height);
		const bx = (L.cx - 0.5) * viewW;
		const by = (0.5 - L.cy) * viewH;
		bigBase.set(bx, by, -d);
		bigGroup.position.copy(bigBase);
		bigGroup.scale.setScalar(bigCell);
		// передние грани кубиков повёрнуты прямо к камере, то есть к зрителю
		bigGroup.rotation.set(Math.atan2(by, d), Math.atan2(-bx, d), 0);
		camera.updateMatrixWorld(true);
	};

	// экранные пиксели канваса <-> 3D
	const toPx = (v) => {
		v.project(camera);
		return {x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height};
	};

	// ================= ЗВЁЗДЫ ПО ВСЕМУ ФОНУ =================
	// Отдельный 2D-холст под текстом: квадратные пиксельные звёзды заполняют весь первый экран
	// и медленно вращаются вокруг ядра галактики. Звёзды лежат в круге, который накрывает
	// все углы экрана при любом повороте.
	const skyCtx = sky ? sky.getContext('2d') : null;
	const SKY_COLORS = ['#ffffff', '#ece6ff', '#cdb8ff', '#a883ff', '#d4ff8a', '#ffe7a3'];
	let skyColors = SKY_COLORS;
	const SKY_WEIGHTS = [0.42, 0.24, 0.14, 0.1, 0.05, 0.05];
	const skyC = {x: 0, y: 0};
	let skyW = 1;
	let skyH = 1;
	let skyStars = null;
	const buildSky = () => {
		if (!skyCtx) return;
		const r = sky.getBoundingClientRect();
		skyW = Math.max(1, Math.round(r.width));
		skyH = Math.max(1, Math.round(r.height));
		// один пиксель холста = один пиксель страницы: на телефоне звёзды остаются чёткими квадратами
		sky.width = skyW;
		sky.height = skyH;
		const core = toPx(galaxy.getWorldPosition(new THREE.Vector3()));
		const cr = canvas.getBoundingClientRect();
		skyC.x = clamp(core.x + cr.left - r.left, 0, skyW);
		skyC.y = clamp(core.y + cr.top - r.top, 0, skyH);
		const R = Math.max(...[[0, 0], [skyW, 0], [0, skyH], [skyW, skyH]].map(([x, y]) => Math.hypot(x - skyC.x, y - skyC.y))) + 6;
		const count = Math.min(14000, Math.round((Math.PI * R * R) / 1000));
		const sr = rng(91);
		const stars = {x: new Float32Array(count), y: new Float32Array(count), a: new Float32Array(count), tw: new Float32Array(count), ph: new Float32Array(count), size: new Uint8Array(count), groups: SKY_COLORS.map(() => [])};
		for (let i = 0; i < count; i++) {
			const rr = R * Math.sqrt(sr());
			const ang = sr() * Math.PI * 2;
			stars.x[i] = Math.cos(ang) * rr;
			stars.y[i] = Math.sin(ang) * rr;
			const b = sr();
			stars.size[i] = b > 0.988 ? 3 : b > 0.9 ? 2 : 1;
			stars.a[i] = b > 0.9 ? 0.75 + sr() * 0.25 : 0.22 + sr() * 0.48;
			stars.tw[i] = 0.5 + sr() * 2.2;
			stars.ph[i] = sr() * Math.PI * 2;
			let pick = sr();
			let g = 0;
			while (g < SKY_WEIGHTS.length - 1 && (pick -= SKY_WEIGHTS[g]) > 0) g++;
			stars.groups[g].push(i);
		}
		skyStars = stars;
	};
	const drawSky = (t) => {
		if (!skyStars) return;
		const g = skyCtx;
		g.clearRect(0, 0, skyW, skyH);
		const th = reducedMotion ? 0 : t * SKY_SPIN;
		const c = Math.cos(th);
		const s = Math.sin(th);
		const {x: X, y: Y, a: A, tw: TW, ph: PH, size: SZ, groups} = skyStars;
		for (let k = 0; k < groups.length; k++) {
			g.fillStyle = skyColors[k];
			for (const i of groups[k]) {
				const x = Math.round(skyC.x + X[i] * c - Y[i] * s);
				if (x < -2 || x > skyW + 2) continue;
				const y = Math.round(skyC.y + X[i] * s + Y[i] * c);
				if (y < -2 || y > skyH + 2) continue;
				g.globalAlpha = reducedMotion ? A[i] : A[i] * (0.62 + 0.38 * Math.sin(t * TW[i] + PH[i]));
				const z = SZ[i];
				if (z === 3) {
					// яркая звезда — пиксельный крестик
					g.fillRect(x - 1, y, 3, 1);
					g.fillRect(x, y - 1, 1, 3);
				} else g.fillRect(x, y, z, z);
			}
		}
		g.globalAlpha = 1;
	};

	// ================= ПРОСЛОЙКА ПОВЕРХ ВСЕГО САЙТА =================
	// Снятый с острова персонаж рисуется на отдельном прозрачном холсте поверх страницы,
	// поэтому может летать над любыми блоками. Клики сквозь холст проходят.
	const overlay = document.createElement('canvas');
	overlay.className = 'dex-overlay';
	overlay.setAttribute('aria-hidden', 'true');
	document.body.append(overlay);
	// второй холст WebGL создаётся, только когда персонажа впервые снимают с острова
	let r2 = null;
	let r2Failed = false;
	const ensureOverlay = () => {
		if (r2 || r2Failed) return r2;
		try {
			r2 = new THREE.WebGLRenderer({canvas: overlay, antialias: true, alpha: true});
			r2.setClearColor(0x000000, 0);
			resizeOverlay();
		} catch {
			r2Failed = true; // без второго холста персонажа просто нельзя снять с острова
		}
		return r2;
	};
	const oScene = new THREE.Scene();
	oScene.add(new THREE.AmbientLight(0xbfb4ff, 1.35));
	const oKey = new THREE.DirectionalLight(0xffffff, 2.4);
	oKey.position.set(-0.4, 0.8, 1);
	oScene.add(oKey);
	const oCam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
	oCam.position.set(0, 0, 1000);
	const oRig = makeRig();
	oScene.add(oRig.pivot);
	let vw = 1;
	let vh = 1;
	const resizeOverlay = () => {
		vw = document.documentElement.clientWidth;
		vh = window.innerHeight;
		if (!r2) return;
		r2.setPixelRatio(pixelRatio(vw));
		r2.setSize(vw, vh, false);
		oCam.left = 0;
		oCam.right = vw;
		oCam.top = 0;
		oCam.bottom = -vh;
		oCam.updateProjectionMatrix();
	};
	resizeOverlay();
	addEventListener('resize', resizeOverlay);
	addEventListener('resize', () => measureChrome());

	// ================= КООРДИНАТЫ =================
	// Персонаж вне острова живёт в координатах документа (пиксели от начала страницы).
	const docOffset = () => {
		const r = canvas.getBoundingClientRect();
		return {x: r.left + scrollX, y: r.top + scrollY};
	};
	const pointerDoc = {x: -1e4, y: -1e4};
	let lastClient = null;
	const pointerNdc = new THREE.Vector2(0, 0); // для канваса острова
	let pointerInHero = false;
	const updatePointer = (cx, cy) => {
		lastClient = [cx, cy];
		pointerDoc.x = cx + scrollX;
		pointerDoc.y = cy + scrollY;
		const r = canvas.getBoundingClientRect();
		pointerNdc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
		pointerInHero = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
	};
	addEventListener('scroll', () => lastClient && updatePointer(...lastClient), {passive: true});

	// ================= ДЕЙСТВИЯ НА ОСТРОВЕ =================
	const zone = canvas.parentElement;
	const raycaster = new THREE.Raycaster();
	const castRay = () => raycaster.setFromCamera(pointerNdc, camera);
	// блок надписи под курсором: {set, i, x, y} (x, y — точка на надписи, в блоках) или null.
	// Луч пересекается с передней плоскостью надписи — быстрее, чем проверять каждый блок.
	const bigInv = new THREE.Matrix4();
	const rayO = new THREE.Vector3();
	const rayD = new THREE.Vector3();
	const pickVoxel = () => {
		if (!bigVoxels.length) return null;
		castRay();
		bigInv.copy(bigGroup.matrixWorld).invert();
		rayO.copy(raycaster.ray.origin).applyMatrix4(bigInv);
		rayD.copy(raycaster.ray.origin).add(raycaster.ray.direction).applyMatrix4(bigInv).sub(rayO);
		if (Math.abs(rayD.z) < 1e-6) return null;
		const k = (WORD_DEPTH / 2 - rayO.z) / rayD.z;
		if (k < 0) return null;
		const x = rayO.x + rayD.x * k;
		const y = rayO.y + rayD.y * k;
		const i = bigFind(bigVoxels, x, y, 1.15);
		return i < 0 ? null : {set: SETS[0], i, x, y};
	};
	const pickPlayer = () => {
		if (P.mode === 'free' || P.mode === 'portal' || (warp && !warp.swapped)) return false; // в портале его не схватить
		castRay();
		return raycaster.intersectObject(rig.root, true).length > 0;
	};
	const pickPortal = () => {
		castRay();
		return raycaster.intersectObjects(portalHere().pick, false).length > 0;
	};
	const pickBlock = () => {
		castRay();
		const hit = raycaster.intersectObjects(worlds[worldId].meshes, false)[0];
		if (!hit) return null;
		const b = hit.object.userData.blocks[hit.instanceId];
		return b && b.minedAt < 0 && b.type !== 'lava' ? b : null; // лаву не добыть
	};
	const busy = () => P.mode !== 'idle' || P.queue.length > 0;

	let now = 0;
	let jumpAt = -10;
	let broken = 0;
	let tickles = 0;

	// клик ломает кучку блоков вокруг точки, они разлетаются осколками и быстро вырастают
	const breakVoxel = ({x, y}) => {
		const hit = burst(bigVoxels, x, y, now, bigWide ? 3.3 : 2.8);
		if (!hit.length) return;
		broken++;
		if (P.mode === 'idle') jumpAt = now;
		const step = Math.max(1, Math.ceil(hit.length / 28)); // осколков не больше ~28
		hit.forEach((v, k) => {
			v.hover = 0;
			if (k % step) return;
			const at = world.worldToLocal(bigGroup.localToWorld(tmp.set(v.x, v.y, 0)));
			spawnDebris(at, `#${v.color.getHexString()}`, 1, 0.6, bigCell * 6);
		});
		on('break', broken);
	};

	// --- путь по верхушке острова в обход дерева, сундука и куста ---
	const pushOutOfObstacles = (p) => {
		for (const o of OBSTACLES) {
			const dx = p.x - o.x;
			const dz = p.z - o.z;
			const d = Math.hypot(dx, dz);
			const need = o.r + 0.45;
			if (d < need) {
				const k = d < 1e-3 ? 1 : need / d;
				p.x = o.x + (d < 1e-3 ? need : dx * k);
				p.z = o.z + (d < 1e-3 ? 0 : dz * k);
			}
		}
		const r = Math.hypot(p.x, p.z);
		if (r > STAND_R) p.multiplyScalar(STAND_R / r);
		p.y = 0;
		return p;
	};
	const planPath = (from, to) => {
		for (const o of OBSTACLES) {
			const ex = to.x - from.x;
			const ez = to.z - from.z;
			const len2 = ex * ex + ez * ez || 1;
			const t = clamp(((o.x - from.x) * ex + (o.z - from.z) * ez) / len2, 0, 1);
			const cx = from.x + ex * t;
			const cz = from.z + ez * t;
			const d = Math.hypot(o.x - cx, o.z - cz);
			if (d < o.r + 0.4 && t > 0.02 && t < 0.98) {
				// обходим препятствие сбоку
				let nx = cx - o.x;
				let nz = cz - o.z;
				const nl = Math.hypot(nx, nz);
				if (nl < 1e-3) {
					nx = -ez;
					nz = ex;
				}
				const k = (o.r + 0.85) / (Math.hypot(nx, nz) || 1);
				const detour = pushOutOfObstacles(new THREE.Vector3(o.x + nx * k, 0, o.z + nz * k));
				return [detour, to.clone()];
			}
		}
		return [to.clone()];
	};
	const walkTo = (to) => ({type: 'walk', to: to.clone()});

	// где встать, чтобы добыть блок, и дотянется ли персонаж
	const standFor = (b) => {
		const p = new THREE.Vector3(b.pos.x, 0, b.pos.z);
		if (b.pos.y >= -0.5) {
			// блок на верхушке или выше — встаём рядом, а не на него
			let dx = P.pos.x - b.pos.x;
			let dz = P.pos.z - b.pos.z;
			const len = Math.hypot(dx, dz);
			if (len < 0.3) {
				dx = -b.pos.x || 0;
				dz = -b.pos.z || 1;
			}
			const l = Math.hypot(dx, dz) || 1;
			p.x += (dx / l) * 1.2;
			p.z += (dz / l) * 1.2;
		}
		return pushOutOfObstacles(p);
	};
	const canReach = (b, stand) => tmp.set(stand.x, 2.3, stand.z).distanceTo(b.pos) <= REACH;

	let lastWarn = 0;
	const warn = (event, data) => {
		if (now - lastWarn < 1.2) return;
		lastWarn = now;
		on(event, data);
	};
	const startMining = (b) => {
		if (P.mode === 'free') return warn('away');
		if (busy()) return warn('busy');
		const stand = standFor(b);
		if (!canReach(b, stand)) return warn('far');
		const need = NEED[b.type] || 0;
		if (progress.tier < need) return warn('need', TIERS[need].id);
		// дома: сходить к сундуку за киркой, добыть блок, вернуть кирку, вернуться на место.
		// В Незере и Энде сундука нет — кирка у него с собой
		if (worldId === 'over') P.queue = [walkTo(CHEST_SPOT), {type: 'chest', take: true}, walkTo(stand), {type: 'mine', block: b}, walkTo(CHEST_SPOT), {type: 'chest', take: false}, walkTo(HOME)];
		else P.queue = [walkTo(stand), {type: 'mine', block: b, carry: true}, walkTo(HOME)];
		activeBlocks.add(b);
	};
	const finishMining = (b) => {
		b.minedAt = now;
		activeBlocks.add(b);
		spawnDebris(islandToWorldLocal(b.pos, tmp2), BLOCK_COLOR[b.type], 12, 0.8);
		on('mine', b.type);
		const up = UPGRADE[b.type];
		if (up && progress.tier < up) {
			progress.tier = up;
			paintPickaxe();
			saveProgress(progress);
			on('tier', TIERS[up].id);
			say(up === 3 ? 'say.diamond' : up === 4 ? 'say.netherite' : 'say.yay', 1.6);
			if (up === 3) on('diamond');
			if (up === 4) on('netherite');
		}
		if (b.type === 'coal' && progress.torches < 4) {
			progress.torches++;
			showTorches();
			saveProgress(progress);
			on('torch', progress.torches);
		}
	};
	const activeBlocks = new Set();

	// ================= ПЕРСОНАЖ ВНЕ ОСТРОВА =================
	// Хитбокс для каждой позы: полуширина и полувысота в единицах мира
	const TALL = [0.42, 1.35];
	const WIDE = [0.5, 1.35];
	const SIT = [0.42, 0.845];
	const FLAT = [1.35, 0.6];
	const POSE_BOX = {stand: TALL, wave: TALL, look: TALL, dance: TALL, rage: TALL, float: WIDE, held: WIDE, reach: WIDE, fly: WIDE, wall: WIDE, crouch: [0.42, 1.25], sit: SIT, sitHappy: SIT, doze: SIT, lie: FLAT, sleep: FLAT};
	// perch — на каком виджете сидит; seek — к какому летит, чтобы сесть; auto — полёт к стене;
	// calm — сколько секунд спокойно летает; idleT — сколько секунд его никто не трогал
	const PB = {x: 0, y: 0, vx: 0, vy: 0, hw: 10, hh: 30, held: false, perch: null, perchX: 0, outT: 0, seek: null, seekAt: 0, seekTry: 0, auto: null, pose: 'float', poseT: 0, poseDur: 3, lieDir: 1, calm: 0, idleT: 0, spin: 0, spinV: 0, dizzy: 0, hop: 0, greetAt: -99, zzzAt: 0, lastPerch: null, lastPerchAt: -99, clearOfIsland: false, pickX: 0, pickY: 0};
	let playerK = 20; // пикселей на единицу мира
	let freeWorld = false; // стена сломана — можно летать по всему сайту
	const fitPoseBox = () => {
		const bottom = PB.y + PB.hh;
		const [w, h] = POSE_BOX[PB.pose];
		PB.hw = w * playerK;
		PB.hh = h * playerK;
		PB.y = bottom - PB.hh;
	};
	const setPose = (pose, dur = 0) => {
		if (PB.pose === pose && !dur) return;
		PB.pose = pose;
		PB.poseT = 0;
		PB.poseDur = dur;
		if (pose === 'lie' || pose === 'sleep') PB.lieDir = Math.random() < 0.5 ? -1 : 1;
		fitPoseBox();
	};

	// ================= ТАНЦЫ =================
	// Танцует, когда сам захочет: на острове время от времени, если ничем не занят,
	// и иногда — сидя на тексте (поза «dance» среди поз на виджете). Темп — 120 ударов в минуту.
	const DANCES = ['bob', 'floss', 'shuffle', 'hands', 'robot', 'arms'];
	const ROBOT = [
		{armRx: -1.57, armRz: 0.05, armLx: 0, armLz: -0.05, headYaw: 0.55},
		{armRx: 0, armRz: 0.05, armLx: -1.57, armLz: -0.05, headYaw: -0.55},
		{armRx: -1.57, armRz: -0.9, armLx: -1.57, armLz: 0.9, headYaw: 0},
		{armRx: -3.0, armRz: 0.05, armLx: 0.35, armLz: -0.05, headYaw: 0.3},
	];
	const dance = {until: -1, next: 14 + Math.random() * 16, start: 0, offset: 0};
	const freshDance = () => {
		dance.start = now;
		dance.offset = Math.floor(Math.random() * DANCES.length) * 8; // каждый раз начинает с другого движения
	};
	const dancingOnIsland = () => now < dance.until;
	// каждые 8 ударов — новое движение
	const danceTarget = () => {
		const beat = (now - dance.start) * 2 + dance.offset;
		const n = Math.floor(beat);
		const hit = Math.exp(-(beat - n) * 7); // толчок на каждый удар
		const sw = Math.sin(beat * Math.PI); // туда-сюда: полный цикл за две доли
		const cw = Math.cos(beat * Math.PI);
		switch (DANCES[Math.floor(beat / 8) % DANCES.length]) {
			case 'bob': // качает головой и по очереди выбрасывает кулаки вверх
				return {armRx: -1.7 - (n % 2 ? 0 : hit) * 1.1, armLx: -1.7 - (n % 2 ? hit : 0) * 1.1, armRz: 0.3, armLz: -0.3, drop: -hit * 0.1, headPitch: hit * 0.45 - 0.1, legRz: 0.06, legLz: -0.06};
			case 'floss': // руки вместе вбок и то перед собой, то за спиной, бёдра в другую сторону
				return {armRz: sw * 0.75, armLz: sw * 0.75, armRx: cw * 0.5, armLx: cw * 0.5, hipX: -sw * 0.2, tiltZ: -sw * 0.07, legRz: -sw * 0.1, legLz: -sw * 0.1, headYaw: sw * 0.2};
			case 'shuffle': // «бегущий человек»: шаги на месте, руки в такт
				return {legR: sw > 0 ? -sw * 0.85 : -sw * 0.2, legL: sw < 0 ? sw * 0.85 : sw * 0.2, armRx: -0.35 + sw * 0.85, armLx: -0.35 - sw * 0.85, armRz: 0.1, armLz: -0.1, drop: -Math.abs(cw) * 0.1, hipX: sw * 0.05, headPitch: hit * 0.2};
			case 'hands': // руки вверх, как на концерте, качается
				return {armRx: -2.75, armLx: -2.75, armRz: -0.2 + sw * 0.35, armLz: 0.2 + sw * 0.35, tiltZ: sw * 0.1, hipX: sw * 0.12, drop: -hit * 0.1, headPitch: -0.25 + hit * 0.25};
			case 'robot': // робот: на каждый удар — новая поза рывком
				return {...ROBOT[n % ROBOT.length], drop: -hit * 0.04, snap: true};
			default: // волна руками: руки в стороны, волна бежит от одной к другой
				return {armRz: -1.45 + Math.sin(beat * Math.PI * 2) * 0.35, armLz: 1.45 + Math.sin(beat * Math.PI * 2 - 1.4) * 0.35, armRx: 0, armLx: 0, tiltZ: sw * 0.1, hipX: sw * 0.08, headYaw: sw * 0.3, drop: -hit * 0.05};
		}
	};

	// ================= ЗЛОСТЬ =================
	// Стена сломана, персонаж сидит на тексте, его 5 раз быстро тыкнули. Сцена как в кино,
	// по ключевым кадрам с плавными кривыми:
	//  • обычная: сидит и трясётся → медленно встаёт → наливается силой и вырастает во весь
	//    экран → 2–4 удара в случайном порядке и в разных местах экрана: правой рукой, левой,
	//    головой, ногой. От каждого удара — своя трещина, они остаются по всему экрану;
	//  • редкая (BREAKOUT_CHANCE): три раза бьёт головой в одно место — трещина растёт, на
	//    третий раз стекло лопается и осколки падают, а он хватается руками за края дыры
	//    и вылезает из экрана к тебе.
	const BREAKOUT_CHANCE = 0.07;
	let rage = null; // {t, plan, next, ev, cracks: [холсты трещин этой сцены]}
	const rageTaps = [];
	const startRage = (kind) => {
		const breakout = kind === 'breakout' || (kind !== 'strikes' && Math.random() < BREAKOUT_CHANCE);
		rage = {t: 0, plan: breakout ? planBreakout() : planStrikes(), next: 0, ev: 0, cracks: [], hole: null};
		PB.idleT = 0;
		setPose('rage');
		say('icon:angry', 1.1);
		on('rage');
	};
	const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2); // плавный разгон и торможение
	const hitOut = (x) => 1 - (1 - x) ** 5; // удар: сразу быстро, в конце тормозит
	const easeIn = (x) => x * x * x; // разгон — прыжок из экрана
	const P0 = {armRx: 0, armRz: 0, armLx: 0, armLz: 0, legR: 0, legL: 0, legRz: 0, legLz: 0, drop: 0, tiltZ: 0, headPitch: 0, headYaw: 0, hipX: 0};
	const pz = (o) => ({...P0, ...o});
	const mix = (a, b, k) => {
		const o = {};
		for (const key of Object.keys(P0)) o[key] = lerp(a[key], b[key], k);
		return o;
	};
	const SIT_ANGRY = pz({armRx: -0.35, armRz: 0.14, armLx: -0.35, armLz: -0.14, legR: -1.25, legL: -1.25, drop: 1.01, headPitch: 0.32});
	const SIT_CALM = {...SIT_ANGRY, headPitch: 0.05};
	const STAND = pz({armRx: -0.12, armRz: 0.32, armLx: -0.12, armLz: -0.32, legRz: 0.06, legLz: -0.06, headPitch: 0.28});
	const POWER = pz({armRx: -0.28, armRz: 0.72, armLx: -0.28, armLz: -0.72, legRz: 0.13, legLz: -0.13, drop: 0.04, headPitch: 0.16});
	const RELAX = pz({armRx: -0.25, armRz: 0.15, armLx: -0.25, armLz: -0.15, legRz: 0.06, legLz: -0.06, headPitch: 0.12});
	// замах и удар для каждого вида: поза, поворот корпуса, наклон к экрану, выпад
	const STRIKE = {
		punchR: {
			wind: pz({armRx: 1.3, armRz: 0.5, armLx: -1.35, armLz: -0.12, legR: -0.25, legL: 0.2, legRz: 0.13, legLz: -0.13, drop: 0.14, tiltZ: -0.07, headPitch: 0.2, headYaw: 0.15, hipX: -0.06}),
			hit: pz({armRx: -1.57, armLx: 0.6, armLz: -0.28, legR: 0.22, legL: -0.25, legRz: 0.13, legLz: -0.13, drop: 0.05, tiltZ: 0.05, headPitch: 0.06, headYaw: -0.05, hipX: 0.08}),
			twist: [-0.62, 0.24],
			lean: [0, 0.05],
			lunge: 1.13,
		},
		punchL: {
			wind: pz({armLx: 1.3, armLz: -0.5, armRx: -1.35, armRz: 0.12, legL: -0.25, legR: 0.2, legRz: 0.13, legLz: -0.13, drop: 0.14, tiltZ: 0.07, headPitch: 0.2, headYaw: -0.15, hipX: 0.06}),
			hit: pz({armLx: -1.57, armRx: 0.6, armRz: 0.28, legL: 0.22, legR: -0.25, legRz: 0.13, legLz: -0.13, drop: 0.05, tiltZ: -0.05, headPitch: 0.06, headYaw: 0.05, hipX: -0.08}),
			twist: [0.62, -0.24],
			lean: [0, 0.05],
			lunge: 1.13,
		},
		head: {
			wind: pz({armRx: 0.35, armRz: 0.55, armLx: 0.35, armLz: -0.55, legRz: 0.12, legLz: -0.12, drop: 0.06, headPitch: -0.45}),
			hit: pz({armRx: -0.7, armRz: 0.35, armLx: -0.7, armLz: -0.35, legRz: 0.12, legLz: -0.12, drop: 0.02, headPitch: 0.5}),
			twist: [0, 0],
			lean: [-0.28, 0.5],
			lunge: 1.17,
		},
		kick: {
			wind: pz({legR: 0.95, legL: 0.05, armRx: -0.4, armRz: 0.95, armLx: -0.4, armLz: -0.95, legLz: -0.08, drop: 0.08, tiltZ: 0.06, headPitch: 0.2, hipX: 0.05}),
			hit: pz({legR: -1.57, legL: 0.12, armRx: -0.6, armRz: 1.0, armLx: -0.6, armLz: -1.0, legLz: -0.08, drop: -0.06, tiltZ: -0.04, headPitch: 0.25, hipX: -0.04}),
			twist: [0.25, -0.1],
			lean: [-0.08, 0.12],
			lunge: 1.1,
		},
	};
	// ключевой кадр: [секунда, поза, кривая к нему, рост, поворот, выпад, сдвиг по X и Y (доли экрана), наклон к экрану]
	const kf = (t, pose, ease, grow, twist = 0, lunge = 1, ox = 0, oy = 0, lean = 0) => [t, pose, ease, grow, twist, lunge, ox, oy, lean];
	const intro = () => [kf(0, SIT_ANGRY, inOut, 0), kf(0.8, SIT_ANGRY, inOut, 0), kf(1.7, STAND, inOut, 0), kf(2.85, POWER, inOut, 1)];
	// один удар: замах (заодно переходит на новое место экрана) → удар → держит
	const addStrike = (keys, hits, t, kind, ox, oy, extra = {}) => {
		const s = STRIKE[kind];
		const wind = extra.wind ?? 0.55 + Math.random() * 0.2;
		keys.push(kf(t + wind, s.wind, inOut, 1, s.twist[0], 0.98, ox, oy, s.lean[0] - (extra.harder ? 0.08 : 0)));
		const hitT = t + wind + 0.13;
		keys.push(kf(hitT, s.hit, hitOut, 1, s.twist[1], s.lunge + (extra.harder ? 0.05 : 0), ox, oy, s.lean[1] + (extra.harder ? 0.08 : 0)));
		hits.push({t: hitT, kind, stage: extra.stage || 0});
		keys.push(kf(hitT + 0.32, mix(s.hit, POWER, 0.18), inOut, 1, s.twist[1] * 0.5, 1.02, ox, oy, s.lean[1] * 0.2));
		return hitT + 0.32;
	};
	const outro = (keys, t) => {
		keys.push(kf(t + 0.5, RELAX, inOut, 1));
		keys.push(kf(t + 1.35, SIT_CALM, inOut, 0));
		keys.push(kf(t + 1.55, SIT_CALM, inOut, 0));
		return t + 1.55;
	};
	const planStrikes = () => {
		const keys = intro();
		const hits = [];
		let t = 2.85;
		const n = 2 + Math.floor(Math.random() * 3); // 2–4 удара
		const kinds = Object.keys(STRIKE);
		let prev = '';
		for (let i = 0; i < n; i++) {
			let kind = kinds[Math.floor(Math.random() * kinds.length)];
			if (kind === prev && Math.random() < 0.7) kind = kinds[(kinds.indexOf(kind) + 1 + Math.floor(Math.random() * 3)) % kinds.length];
			prev = kind;
			// каждый раз — другое место экрана; для удара ногой чуть выше, чтобы ступня попала в экран
			const ox = (Math.random() - 0.5) * 0.72;
			const oy = kind === 'kick' ? -0.1 : (Math.random() - 0.5) * 0.14;
			t = addStrike(keys, hits, t, kind, ox, oy) + Math.random() * 0.15;
		}
		return {keys, hits, events: [], end: outro(keys, t)};
	};
	const LOOK = pz({armRx: -0.2, armRz: 0.4, armLx: -0.2, armLz: -0.4, legRz: 0.1, legLz: -0.1, headPitch: 0.05});
	// руки вперёд-вверх — ладони ложатся на края дыры по бокам от головы; смотрит прямо на тебя
	const REACH = pz({armRx: -2.1, armRz: 0.14, armLx: -2.1, armLz: -0.14, legRz: 0.1, legLz: -0.1, headPitch: -0.18, drop: 0.02});
	// упирается в края и подтягивается: руки опускаются, корпус идёт к тебе
	const CLIMB = pz({armRx: -1.25, armRz: 0.55, armLx: -1.25, armLz: -0.55, legR: -0.5, legL: 0.2, headPitch: -0.32, drop: -0.08});
	const LEAP = pz({armRx: -2.4, armRz: 0.5, armLx: -2.4, armLz: -0.5, legR: -0.4, legL: -0.4, headPitch: -0.1, drop: -0.15});
	const planBreakout = () => {
		const keys = intro();
		const hits = [];
		let t = 2.85;
		// бьёт головой в одну точку на ~40% высоты экрана (не у самого верха): сдвигаем его вниз
		const oy = 0.4 - 0.6 + (0.375 * giantH() * STRIKE.head.lunge * Math.cos(STRIKE.head.lean[1])) / vh;
		keys[keys.length - 1][7] = oy;
		t = addStrike(keys, hits, t, 'head', 0, oy, {wind: 0.6, stage: 1});
		t = addStrike(keys, hits, t + 0.1, 'head', 0, oy, {wind: 0.55, stage: 2});
		t = addStrike(keys, hits, t + 0.1, 'head', 0, oy, {wind: 0.75, stage: 3, harder: true});
		// стекло посыпалось — смотрит в дыру; потом хватается за края и вылезает к тебе
		keys.push(kf(t + 0.85, LOOK, inOut, 1));
		keys.push(kf(t + 1.85, REACH, inOut, 1, 0, 1.3, 0, 0, 0.35));
		keys.push(kf(t + 2.65, CLIMB, inOut, 1, 0, 1.6, 0, 0, 0.5));
		keys.push(kf(t + 3.3, LEAP, easeIn, 1, 0, 2.9, 0, 0, 0.78));
		// дыра «раскрывается» до всего экрана, пока он вылезает: сначала видно только то, что в дыре
		return {keys, hits, events: [{t: t + 1.8, ev: 'grab'}, {t: t + 3.3, ev: 'out'}], end: t + 3.3, breakout: true, open: [t + 1.5, t + 3.2]};
	};
	// где он сейчас в сцене: поза, рост, поворот, выпад, сдвиг, наклон
	const rageAt = (T, t) => {
		const K = rage.plan.keys;
		let k = 0;
		while (k < K.length - 2 && T >= K[k + 1][0]) k++;
		const a = K[k];
		const b = K[Math.min(k + 1, K.length - 1)];
		const e = b[2](clamp((T - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1));
		const pose = mix(a[1], b[1], e);
		// дрожит от злости, пока сидит и пока наливается силой; дышит тяжело
		const tremble = (1 - smooth(T, 1.4, 1.9)) + smooth(T, 2.4, 2.8) * (1 - smooth(T, 2.85, 3.0));
		pose.tiltZ += Math.sin(t * 47) * 0.028 * tremble;
		pose.headYaw += Math.sin(t * 31) * 0.035 * tremble;
		const v = (i) => lerp(a[i], b[i], e);
		return {pose, grow: v(3), twist: v(4), lunge: v(5), ox: v(6), oy: v(7), lean: v(8)};
	};
	// огонь вокруг: спрайты в слое поверх сайта, позади и чуть впереди персонажа
	const FLAMES = 90;
	let flames = null;
	const ensureFlames = () => {
		if (flames) return flames;
		const tex = glowTexture();
		flames = Array.from({length: FLAMES}, () => {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, color: 0xff7a1a, transparent: true, depthWrite: false, opacity: 0}));
			s.visible = false;
			oScene.add(s);
			return {s, life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, size: 1};
		});
		return flames;
	};
	const FIRE = [new THREE.Color(0xfff2a8), new THREE.Color(0xffa424), new THREE.Color(0xff3d14), new THREE.Color(0x7a1206)];
	const fireColor = new THREE.Color();
	let tinted = false;
	const tint = (v) => {
		if (!v && !tinted) return;
		tinted = v > 0;
		oRig.root.traverse((o) => o.material?.emissive?.setRGB(0.26 * v, 0.025 * v, 0)); // лёгкий красный отсвет, скин остаётся узнаваемым
	};
	const giantH = () => Math.min(vh * 1.05, vw * 1.6); // рост великана на экране, пикселей
	// точка на экране: кулак, голова или ступня — туда приходится удар
	const LIMB = {punchR: ['armR', -11], punchL: ['armL', -11], kick: ['legR', -11], head: ['head', 4]};
	const limbPoint = (kind) => {
		oRig.root.updateMatrixWorld(true);
		const [part, y] = LIMB[kind];
		const w = oRig.parts[part].localToWorld(tmp.set(0, y, 0));
		return {x: clamp(w.x, 24, vw - 24), y: clamp(-w.y, 24, vh - 24)};
	};
	const endRage = () => {
		rage?.front?.cv.remove();
		rage = null;
		oRig.pivot.scale.setScalar(1);
		tint(0);
		if (flames) for (const f of flames) {
			f.life = 0;
			f.s.visible = false;
		}
	};
	let spawnAcc = 0;
	const stepRage = (dt) => {
		const list = flames;
		if (!rage) {
			tint(0);
			if (list) for (const f of list) f.s.visible = false;
			return;
		}
		rage.t += dt;
		const T = rage.t;
		const plan = rage.plan;
		const {grow, twist, lunge, ox, oy, lean} = rageAt(T, now);
		const bigK = Math.max(1, giantH() / (2.7 * playerK));
		const R = (1 + (bigK - 1) * grow) * lunge;
		const p = oRig.pivot.position;
		p.set(lerp(p.x, vw / 2 + ox * vw, grow), lerp(p.y, -vh * (0.6 + oy), grow), 0);
		oRig.pivot.scale.setScalar(R);
		oRig.pivot.rotation.set(lerp(0.12, 0, grow) + lean, lerp(0.2, 0, grow) + twist, oRig.pivot.rotation.z * (1 - grow));
		const heat = smooth(T, 0.15, 1.3) * (1 - smooth(T, plan.end - 1.1, plan.end - 0.25));
		tint(heat * (0.75 + Math.sin(T * 18) * 0.25));
		// огонь: языки пламени по краям фигуры, снизу вверх
		const fl = ensureFlames();
		const unit = playerK * R;
		spawnAcc += dt * (40 + 80 * grow) * heat;
		for (const f of fl) {
			if (f.life <= 0 && spawnAcc >= 1) {
				spawnAcc -= 1;
				const side = Math.random() < 0.5 ? -1 : 1;
				f.max = f.life = 0.35 + Math.random() * 0.4;
				f.x = side * (0.42 + Math.random() * 0.28);
				f.y = -BODY + Math.random() * 3.0;
				if (f.y > 1.0) f.x *= 0.85; // у головы — ближе
				f.z = Math.random() < 0.8 ? -40 : 40;
				f.vx = side * Math.random() * 0.25;
				f.vy = 1.8 + Math.random() * 1.8;
				f.size = 0.22 + Math.random() * 0.3;
			}
			if (f.life > 0) {
				f.life -= dt;
				f.x += f.vx * dt;
				f.y += f.vy * dt;
				const a = 1 - f.life / f.max; // 0 — родился, 1 — погас
				const i = Math.min(2.999, a * 3);
				fireColor.copy(FIRE[Math.floor(i)]).lerp(FIRE[Math.floor(i) + 1], i % 1);
				f.s.material.color.copy(fireColor);
				f.s.material.opacity = Math.sin(Math.min(1, a * 1.4) * Math.PI) * (f.z > 0 ? 0.55 : 0.9);
				f.s.position.set(p.x + f.x * unit, p.y + f.y * unit, f.z);
				f.s.scale.setScalar(f.size * unit * (1 - a * 0.5));
				f.s.visible = true;
			} else f.s.visible = false;
		}
		// удары: трещина там, куда пришёлся кулак, голова или ступня
		while (rage.next < plan.hits.length && T >= plan.hits[rage.next].t) {
			const h = plan.hits[rage.next++];
			const pt = limbPoint(h.kind);
			if (plan.breakout) {
				if (h.stage === 1) rage.at = pt; // все три удара головой — в одну точку
				const at = rage.at || pt;
				if (h.stage < 3) rage.cracks.push(crackScreen(at.x, at.y, {size: h.stage === 1 ? 0.32 : 0.6, life: 0}));
				else {
					// стекло лопнуло: дыра, осколки падают, вокруг — большая трещина
					const r = giantH() * 0.2;
					const rim = holeRim(at.x, at.y, r);
					for (const c of rage.cracks) c.remove();
					rage.cracks = [crackScreen(at.x, at.y, {hole: r, rim, life: 0})];
					shatterGlass(at.x, at.y, r, rim);
					rage.front = makeFront(rim, at.x, at.y);
					on('shatter');
					// дальше голова — в середине дыры: подгоняем сдвиг для оставшихся ключей
					const H = giantH();
					for (const kf of plan.keys) {
						if (kf[0] <= h.t) continue;
						kf[6] = (at.x - vw / 2) / vw;
						kf[7] = (at.y + 0.375 * H * kf[5] * Math.cos(kf[8])) / vh - 0.6;
					}
				}
			} else rage.cracks.push(crackScreen(pt.x, pt.y, {size: 0.62 + Math.random() * 0.3, life: 0})); // остаются все — экран в паутине
			on('rageHit', h.kind);
		}
		while (rage.ev < plan.events.length && T >= plan.events[rage.ev].t) {
			const ev = plan.events[rage.ev++].ev;
			if (ev === 'grab') {
				// схватился за края — стекло вокруг дрогнуло
				shake([...rage.cracks, rage.front.cv, overlay]);
				on('rageHit', 'grab');
			}
			if (ev === 'out') {
				// выпрыгнул из экрана: вспышка, трещины тают, а он снова маленький на своём месте
				flashScreen(0.95, 900);
				for (const c of rage.cracks) fadeCrack(c, 900);
				endRage();
				setPose('sitHappy', 4);
				PB.idleT = 0;
				PB.hop = 0.42;
				say('say.hi', 1.8);
				return;
			}
		}
		if (rage.front) {
			// вылезает: окно «перед стеклом» растёт от дыры до всего экрана
			const [a, b] = plan.open;
			const k = clamp((T - a) / (b - a), 0, 1);
			rage.front.k = 1 + k * k * 7;
		}
		if (T >= plan.end) {
			// трещины держатся ещё несколько секунд и тают по одной, в том порядке, как появились
			rage.cracks.forEach((c, i) => setTimeout(() => fadeCrack(c), 3200 + i * 450));
			endRage();
			setPose('sit', 6);
			PB.idleT = 0;
			say('say.phew', 1.8);
		}
	};

	// Он вылезает из экрана: поверх стекла рисуем копию его кадра, обрезанную по краю дыры.
	// В дыре он перед стеклом (на нём нет трещин, вокруг — темнота внутри телефона), остальное
	// тело ещё за треснувшим стеклом. Пока лезет, окно растёт — и он целиком снаружи.
	const makeFront = (rim, cx, cy) => {
		const cv = document.createElement('canvas');
		cv.className = 'dex-front';
		cv.setAttribute('aria-hidden', 'true');
		document.body.append(cv);
		return {cv, g: cv.getContext('2d'), rim, cx, cy, k: 1};
	};
	const drawFront = () => {
		const f = rage.front;
		const {cv, g} = f;
		if (cv.width !== overlay.width || cv.height !== overlay.height) {
			cv.width = overlay.width;
			cv.height = overlay.height;
		}
		const sc = overlay.width / Math.max(1, vw);
		g.clearRect(0, 0, cv.width, cv.height);
		g.save();
		g.beginPath();
		f.rim.forEach((q, i) => {
			const x = (f.cx + (q.x - f.cx) * f.k) * sc;
			const y = (f.cy + (q.y - f.cy) * f.k) * sc;
			if (i) g.lineTo(x, y);
			else g.moveTo(x, y);
		});
		g.closePath();
		g.clip();
		g.drawImage(overlay, 0, 0);
		g.restore();
	};

	const flashScreen = (power, ms, cx = null, cy = null) => {
		const flash = document.createElement('div');
		flash.className = 'dex-flash';
		flash.style.animationDuration = `${ms}ms`;
		flash.style.background =
			cx === null
				? `rgba(255,255,255,${power})`
				: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,255,255,${power}), rgba(255,255,255,${power * 0.3}) 18%, rgba(255,255,255,0) 45%)`;
		document.body.append(flash);
		setTimeout(() => flash.remove(), ms + 100);
	};
	// Стекло разбито — сайт не листается: ни колесом, ни клавишами, ни полосой прокрутки,
	// ни пальцем на телефоне. Отпускает, когда последняя трещина начинает таять.
	let glassLocked = false;
	const SCROLL_KEYS = new Set([' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End']);
	const blockScroll = (e) => {
		if (e.cancelable) e.preventDefault();
	};
	const blockKeys = (e) => {
		if (SCROLL_KEYS.has(e.key) && !e.target.closest?.('input, textarea, select, [contenteditable]')) e.preventDefault();
	};
	const lockGlass = (on) => {
		if (on === glassLocked) return;
		glassLocked = on;
		document.documentElement.classList.toggle('is-glass', on);
		const m = on ? 'addEventListener' : 'removeEventListener';
		window[m]('wheel', blockScroll, {passive: false});
		window[m]('touchmove', blockScroll, {passive: false});
		window[m]('keydown', blockKeys);
	};
	const fadeCrack = (cv, ms = 1700) => {
		cv.style.transition = `opacity ${ms}ms ease`;
		cv.classList.add('is-fading');
		setTimeout(() => cv.remove(), ms + 100);
		if (!document.querySelector('canvas.dex-crack:not(.is-fading)')) lockGlass(false);
	};
	const shake = (els) => {
		if (reducedMotion) return;
		for (const el of els) {
			el.classList.remove('is-shake');
			void el.offsetWidth;
			el.classList.add('is-shake');
			setTimeout(() => el.classList.remove('is-shake'), 500);
		}
	};
	// неровный край дыры: точки по кругу со случайным радиусом
	const holeRim = (cx, cy, r, n = 15) =>
		Array.from({length: n}, (_, i) => {
			const a = ((i + (Math.random() - 0.5) * 0.6) / n) * Math.PI * 2;
			const rr = r * (0.82 + Math.random() * 0.36);
			return {x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, a};
		});

	// Трещина на экране, как на настоящем разбитом стекле: от точки удара — лучи (у центра
	// толще, к краю тоньше, с изломами), между ними изломанные кольца и ответвления; у центра —
	// раздавленная зона и пятно протёкшей матрицы. Осколки по-разному ловят свет, у каждой
	// трещины — тень и светлая грань. size — насколько большая; hole — радиус дыры (стекло
	// выбито, трещины идут от её края); life — через сколько мс таять (0 — уберёт сцена).
	const crackScreen = (cx, cy, {size = 1, hole = 0, life = 5000, rim = null} = {}) => {
		const w = document.documentElement.clientWidth;
		const h = window.innerHeight;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		lockGlass(true);
		const cv = document.createElement('canvas');
		cv.className = 'dex-crack';
		cv.setAttribute('aria-hidden', 'true');
		cv.width = Math.round(w * dpr);
		cv.height = Math.round(h * dpr);
		const g = cv.getContext('2d');
		g.scale(dpr, dpr);
		g.lineCap = 'round';
		g.lineJoin = 'round';
		const rnd = Math.random;
		const far = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * size;
		const edge = hole ? rim || holeRim(cx, cy, hole) : null;
		// лучи
		const rays = [];
		const n = Math.round((15 + Math.floor(rnd() * 7)) * (0.55 + 0.45 * Math.min(1, size)));
		for (let i = 0; i < n; i++) {
			let a = ((i + (rnd() - 0.5) * 0.7) / n) * Math.PI * 2;
			const len = far * (rnd() < 0.45 ? 0.85 + rnd() * 0.4 : 0.25 + rnd() * 0.5) + hole;
			let x = cx;
			let y = cy;
			let d = 0;
			if (hole) {
				// от края дыры
				const r0 = hole * (0.85 + rnd() * 0.3);
				x = cx + Math.cos(a) * r0;
				y = cy + Math.sin(a) * r0;
				d = r0;
			}
			const pts = [{x, y, d}];
			while (d < len) {
				const st = (6 + rnd() * 14) * (1 + (d / Math.max(far, 1)) * 2.2); // у центра изломы мельче
				d += st;
				a += (rnd() - 0.5) * 0.18;
				x += Math.cos(a) * st;
				y += Math.sin(a) * st;
				pts.push({x, y, d});
			}
			rays.push({pts, w0: (1.6 + rnd() * 1.7) * (hole ? 1.15 : 1)});
		}
		const onRay = (ray, r) => ray.pts.find((q) => q.d >= r) || null;
		const lines = rays.map((r) => ({pts: r.pts, w0: r.w0, w1: 0.35}));
		// кольца: изломанные дуги между соседними лучами, чуть выгнутые наружу
		const rings = [];
		for (let r = (hole || 0) + 14 + rnd() * 8; r < (far + hole) * 0.75; r *= 1.45 + rnd() * 0.35) rings.push(r);
		rings.forEach((r, k) => {
			for (let i = 0; i < rays.length; i++) {
				if (rnd() < 0.15 + k * 0.1) continue;
				const A = onRay(rays[i], r * (0.9 + rnd() * 0.2));
				const B = onRay(rays[(i + 1) % rays.length], r * (0.9 + rnd() * 0.2));
				if (!A || !B) continue;
				const out = 0.04 + rnd() * 0.06;
				const mx = (A.x + B.x) / 2 + (rnd() - 0.5) * r * 0.1;
				const my = (A.y + B.y) / 2 + (rnd() - 0.5) * r * 0.1;
				const wk = Math.max(0.5, 1.7 - k * 0.28);
				lines.push({pts: [A, {x: mx + (mx - cx) * out, y: my + (my - cy) * out}, B], w0: wk, w1: wk * 0.6});
			}
		});
		// ответвления
		for (const ray of rays) {
			for (const q of ray.pts) {
				if (q.d < (hole || 0) + 30 || rnd() > 0.07) continue;
				let a = Math.atan2(q.y - cy, q.x - cx) + (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.7);
				let x = q.x;
				let y = q.y;
				const pts = [{x, y}];
				for (let d = 0, bl = 25 + rnd() * 140 * Math.min(1, size + 0.3); d < bl; ) {
					const st = 6 + rnd() * 14;
					d += st;
					a += (rnd() - 0.5) * 0.3;
					x += Math.cos(a) * st;
					y += Math.sin(a) * st;
					pts.push({x, y});
				}
				lines.push({pts, w0: 0.95, w1: 0.25});
			}
		}
		// раздавленная зона у центра: мелкая сетка (у дыры — по её краю)
		for (let i = 0; i < (hole ? 110 : 80); i++) {
			const a = rnd() * Math.PI * 2;
			const r0 = hole ? hole * (0.95 + rnd() * 0.35) : rnd() ** 0.7 * 24;
			const x = cx + Math.cos(a) * r0;
			const y = cy + Math.sin(a) * r0;
			const b = rnd() * Math.PI * 2;
			const l = 3 + rnd() * 10;
			lines.push({pts: [{x, y}, {x: x + Math.cos(b) * l, y: y + Math.sin(b) * l}], w0: 0.7, w1: 0.5});
		}
		// 1) осколки: каждый кусок стекла чуть иначе ловит свет — где-то блик, где-то тень
		for (let k = 0; k < Math.min(5, rings.length); k++) {
			for (let i = 0; i < rays.length; i++) {
				const j = (i + 1) % rays.length;
				const a0 = k === 0 ? (hole ? rays[i].pts[0] : {x: cx, y: cy}) : onRay(rays[i], rings[k - 1]);
				const b0 = k === 0 ? (hole ? rays[j].pts[0] : {x: cx, y: cy}) : onRay(rays[j], rings[k - 1]);
				const a1 = onRay(rays[i], rings[k]);
				const b1 = onRay(rays[j], rings[k]);
				if (!a0 || !a1 || !b0 || !b1) continue;
				const gr = g.createLinearGradient(a0.x, a0.y, b1.x, b1.y);
				const v = (0.03 + rnd() * 0.13) * (1 - k * 0.12);
				const c = rnd() < 0.55 ? '255,255,255' : '0,0,0';
				gr.addColorStop(0, `rgba(${c},${v.toFixed(3)})`);
				gr.addColorStop(1, `rgba(${c},0)`);
				g.fillStyle = gr;
				g.beginPath();
				g.moveTo(a0.x, a0.y);
				g.lineTo(a1.x, a1.y);
				g.lineTo(b1.x, b1.y);
				g.lineTo(b0.x, b0.y);
				g.closePath();
				g.fill();
			}
		}
		// 2) под стеклом протекла матрица: тёмное пятно с цветной каймой (у дыры — нет, там стекла уже нет)
		if (!hole) {
			for (let i = 0; i < 7; i++) {
				const a = rnd() * Math.PI * 2;
				const r0 = rnd() * 14 * size;
				const x = cx + Math.cos(a) * r0;
				const y = cy + Math.sin(a) * r0;
				const R = (12 + rnd() * 26) * (0.6 + 0.4 * Math.min(1, size));
				const gr = g.createRadialGradient(x, y, 0, x, y, R);
				gr.addColorStop(0, 'rgba(4,2,10,.92)');
				gr.addColorStop(0.65, 'rgba(4,2,10,.55)');
				gr.addColorStop(0.85, i % 2 ? 'rgba(255,40,190,.22)' : 'rgba(40,220,255,.2)');
				gr.addColorStop(1, 'rgba(0,0,0,0)');
				g.fillStyle = gr;
				g.beginPath();
				g.arc(x, y, R, 0, Math.PI * 2);
				g.fill();
			}
		}
		// 3) трещины: мягкое свечение, тень со сдвигом, светлая грань поверх — проходами, чтобы грани лежали сверху
		const passes = [
			(t, wd) => [`rgba(255,255,255,0.06)`, wd * 4.5, 0, 0],
			(t, wd) => [`rgba(0,0,0,0.62)`, wd + 1.3, 0.8, 1],
			(t, wd) => [`rgba(255,255,255,${(0.95 - t * 0.4).toFixed(2)})`, wd * 0.72, 0, 0],
		];
		for (const pass of passes) {
			for (const L of lines) {
				const N = L.pts.length;
				for (let j = 1; j < N; j++) {
					const t = (j - 1) / Math.max(1, N - 1);
					const [color, lw, ox, oy] = pass(t, L.w0 + (L.w1 - L.w0) * t);
					g.strokeStyle = color;
					g.lineWidth = lw;
					g.beginPath();
					g.moveTo(L.pts[j - 1].x + ox, L.pts[j - 1].y + oy);
					g.lineTo(L.pts[j].x + ox, L.pts[j].y + oy);
					g.stroke();
				}
			}
		}
		if (hole) {
			// 4а) край выбитой дыры: внутри пусто, по краю — толстый скол стекла с бликом
			g.save();
			g.beginPath();
			edge.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
			g.closePath();
			g.globalCompositeOperation = 'destination-out';
			g.fill();
			g.globalCompositeOperation = 'source-over';
			const v = g.createRadialGradient(cx, cy, hole * 0.15, cx, cy, hole * 1.2);
			v.addColorStop(0, 'rgba(1,0,4,.97)');
			v.addColorStop(0.75, 'rgba(5,3,12,.94)');
			v.addColorStop(1, 'rgba(24,18,40,.9)');
			g.fillStyle = v;
			g.fill();
			// пара «битых» цветных полос матрицы у края дыры
			g.clip();
			for (let i = 0; i < 3; i++) {
				const x = cx + (rnd() - 0.5) * hole * 1.6;
				g.fillStyle = ['rgba(120,60,255,.35)', 'rgba(40,220,200,.28)', 'rgba(255,60,140,.3)'][i];
				g.fillRect(x, cy - hole * 1.3, 1 + rnd() * 2, hole * 2.6);
			}
			g.restore();
			g.beginPath();
			edge.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
			g.closePath();
			g.strokeStyle = 'rgba(0,0,0,.55)';
			g.lineWidth = 5;
			g.stroke();
			g.strokeStyle = 'rgba(210,235,255,.95)';
			g.lineWidth = 1.8;
			g.stroke();
		} else {
			// 4б) скол в точке удара
			const chip = g.createRadialGradient(cx, cy, 0, cx, cy, 16);
			chip.addColorStop(0, 'rgba(255,255,255,.95)');
			chip.addColorStop(0.5, 'rgba(255,255,255,.35)');
			chip.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = chip;
			g.beginPath();
			g.arc(cx, cy, 16 * Math.max(0.6, Math.min(1, size)), 0, Math.PI * 2);
			g.fill();
		}
		cv.dataset.rim = hole ? '1' : '';
		cv._rim = edge;
		document.body.append(cv);
		flashScreen(hole ? 0.9 : 0.85 * Math.min(1, size + 0.3), 600, cx, cy);
		shake([overlay, ...document.querySelectorAll('canvas.dex-crack')]);
		if (life) setTimeout(() => fadeCrack(cv), life);
		return cv;
	};

	// Стекло лопнуло: куски стекла из дыры (с бликами и сколами по краям) отрываются
	// и плавно падают вниз и к тебе, кувыркаясь, и тают.
	const shatterGlass = (cx, cy, r, rim = null) => {
		const box = document.createElement('div');
		box.className = 'dex-shards';
		box.setAttribute('aria-hidden', 'true');
		document.body.append(box);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const outer = (rim || holeRim(cx, cy, r, 13)).map((q) => ({x: cx + (q.x - cx) * 1.02, y: cy + (q.y - cy) * 1.02, a: q.a}));
		const n = outer.length;
		const inner = outer.map((q, i) => {
			const rr = r * (0.38 + Math.random() * 0.2);
			const a = q.a + (Math.random() - 0.5) * 0.3;
			return {x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr};
		});
		const center = {x: cx + (Math.random() - 0.5) * r * 0.1, y: cy + (Math.random() - 0.5) * r * 0.1};
		const polys = [];
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			polys.push([center, inner[i], inner[j]]);
			// внешний кусок иногда ломается ещё на два
			if (Math.random() < 0.5) polys.push([inner[i], outer[i], outer[j], inner[j]]);
			else {
				const m = {x: (outer[i].x + outer[j].x) / 2, y: (outer[i].y + outer[j].y) / 2};
				polys.push([inner[i], outer[i], m], [inner[i], m, outer[j], inner[j]]);
			}
		}
		for (const poly of polys) {
			const xs = poly.map((q) => q.x);
			const ys = poly.map((q) => q.y);
			const x0 = Math.min(...xs) - 3;
			const y0 = Math.min(...ys) - 3;
			const bw = Math.max(...xs) + 3 - x0;
			const bh = Math.max(...ys) + 3 - y0;
			const c = document.createElement('canvas');
			c.width = Math.ceil(bw * dpr);
			c.height = Math.ceil(bh * dpr);
			c.style.cssText = `left:${x0}px;top:${y0}px;width:${bw}px;height:${bh}px`;
			const g = c.getContext('2d');
			g.scale(dpr, dpr);
			const path = (dx = 0, dy = 0) => {
				g.beginPath();
				poly.forEach((q, i) => (i ? g.lineTo(q.x - x0 + dx, q.y - y0 + dy) : g.moveTo(q.x - x0 + dx, q.y - y0 + dy)));
				g.closePath();
			};
			// толщина стекла: сдвинутая зеленоватая кромка под куском
			path(1.6, 1.6);
			g.strokeStyle = 'rgba(140,200,190,.3)';
			g.lineWidth = 2;
			g.stroke();
			path();
			// стекло: лёгкий голубоватый оттенок, блик наискосок, светлые грани и тёмная кромка
			g.fillStyle = 'rgba(200,228,255,.17)';
			g.fill();
			// мелкие царапины и сколы на поверхности
			g.save();
			g.clip();
			g.lineWidth = 0.6;
			for (let k = 0; k < 3; k++) {
				const sx = Math.random() * bw;
				const sy = Math.random() * bh;
				const sa = Math.random() * Math.PI;
				const sl = 6 + Math.random() * Math.max(bw, bh) * 0.5;
				g.strokeStyle = `rgba(255,255,255,${(0.1 + Math.random() * 0.18).toFixed(2)})`;
				g.beginPath();
				g.moveTo(sx, sy);
				g.lineTo(sx + Math.cos(sa) * sl, sy + Math.sin(sa) * sl);
				g.stroke();
			}
			g.restore();
			path();
			const a = Math.random() * Math.PI;
			const sh = g.createLinearGradient(bw / 2 - Math.cos(a) * bw, bh / 2 - Math.sin(a) * bh, bw / 2 + Math.cos(a) * bw, bh / 2 + Math.sin(a) * bh);
			sh.addColorStop(0, 'rgba(255,255,255,0)');
			sh.addColorStop(0.45, 'rgba(255,255,255,.05)');
			sh.addColorStop(0.52, `rgba(255,255,255,${(0.3 + Math.random() * 0.35).toFixed(2)})`);
			sh.addColorStop(0.6, 'rgba(255,255,255,.05)');
			sh.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = sh;
			g.fill();
			g.lineJoin = 'round';
			g.strokeStyle = 'rgba(0,0,0,.45)';
			g.lineWidth = 2.4;
			g.stroke();
			g.strokeStyle = 'rgba(235,248,255,.9)';
			g.lineWidth = 1.1;
			g.stroke();
			box.append(c);
			// падение: отлетает от центра дыры, потом вниз, кувыркается и приближается к тебе
			const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
			const my = ys.reduce((s, v) => s + v, 0) / ys.length;
			const dirX = (mx - cx) / r;
			const dirY = (my - cy) / r;
			const near = Math.hypot(dirX, dirY); // 0 — у центра, 1 — у края дыры
			const dur = 1500 + Math.random() * 800;
			const T = dur / 1000;
			const vx = dirX * (70 + Math.random() * 130);
			const vy = dirY * (40 + Math.random() * 70) - 50 - Math.random() * 70;
			const gpx = vh * 1.5; // «тяжесть»
			// у каждого куска своё вращение — одно на всё падение, без рывков
			const spin = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 200);
			const rx = (Math.random() - 0.5) * 200;
			const ry = (Math.random() - 0.5) * 200;
			const at = (k) => {
				const t = T * k;
				return `translate3d(${(vx * t).toFixed(1)}px,${(vy * t + 0.5 * gpx * t * t).toFixed(1)}px,${(170 * k).toFixed(0)}px) rotate(${(spin * k).toFixed(1)}deg) rotateX(${(rx * k).toFixed(1)}deg) rotateY(${(ry * k).toFixed(1)}deg) scale(${(1 + k * 0.3).toFixed(3)})`;
			};
			// сначала кусок чуть «отходит» к тебе и повисает, потом плавно валится вниз
			const frames = [{transform: 'none', opacity: 1}];
			frames.push({transform: `translate3d(${(dirX * 3).toFixed(1)}px,${(dirY * 3).toFixed(1)}px,24px) rotateX(${(rx * 0.04).toFixed(1)}deg) rotateY(${(ry * 0.04).toFixed(1)}deg)`, opacity: 1, offset: 0.1});
			for (let k = 1; k <= 8; k++) frames.push({transform: at(k / 8), opacity: k === 8 ? 0 : k > 6 ? 0.7 : 1, offset: 0.1 + (0.9 * k) / 8});
			c.animate(frames, {duration: reducedMotion ? 400 : dur, delay: near * 260 + Math.random() * 140, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards'});
		}
		setTimeout(() => box.remove(), 3000);
	};

	// --- облачко с эмоцией над головой ---
	const bubble = document.createElement('div');
	bubble.className = 'dex-bubble';
	bubble.setAttribute('aria-hidden', 'true');
	document.body.append(bubble);
	const talk = {at: -99, dur: 0};
	const say = (what, dur = 1.7) => {
		if (what.startsWith('icon:')) bubble.innerHTML = icon(what.slice(5));
		else bubble.textContent = what.startsWith('say.') ? t(what) : what; // текст — на языке сайта
		talk.at = now;
		talk.dur = dur;
	};
	const oneOf = (...list) => list[Math.floor(Math.random() * list.length)];

	// позы на виджете: [поза, сколько секунд, как часто выпадает]
	const PERCH_POSES = [
		['sit', 7, 3],
		['sitHappy', 4.5, 2],
		['look', 3.6, 1.2],
		['crouch', 2.6, 1],
		['stand', 3, 0.8],
		['wave', 2.4, 1],
		['dance', 4.2, 1.1],
		['lie', 7, 1.4],
	];
	const wideEnough = (w) => w.right - w.left > FLAT[0] * 2 * playerK * 1.1;
	const perchPose = () => {
		const list = PERCH_POSES.filter(([name]) => name !== PB.pose && (name !== 'lie' || wideEnough(PB.perch)));
		let roll = Math.random() * list.reduce((sum, o) => sum + o[2], 0);
		const pick = list.find((o) => (roll -= o[2]) <= 0) || list[0];
		setPose(pick[0], pick[1] * (0.8 + Math.random() * 0.4));
		if (pick[0] === 'dance') freshDance();
		if (pick[0] === 'sitHappy' || pick[0] === 'dance') say('icon:note', 1.8);
		else if (pick[0] === 'look' && Math.random() < 0.5) say('?', 1.4);
	};

	// --- виджеты сайта, на которые можно сесть (в координатах документа) ---
	let widgets = [];
	let widgetsAt = -1;
	const WIDGETS = [
		['.hero__content .btn', false],
		['.section .head__label', false],
		['.section h2', true],
		['#shop-tabs', false],
		['#shop-grid > *', false],
		['#cases .case', false],
		['#collab .collab', false],
		['.social', false],
		['.social .btn', false],
		['.foot__word', false],
		['.foot__links button', false],
		// телефон: товары, список разделов, вопросы
		['.mcard', false],
		['.mrows', false],
		['.mhead h2', true],
		['.faq__item', false],
		['.case h3', true],
		['.tasks__head h3', true],
	];
	const collectWidgets = () => {
		const out = [];
		for (const [sel, isText] of WIDGETS) {
			document.querySelectorAll(sel).forEach((el) => {
				if (el.closest('.visually-hidden')) return; // невидимый текст — не сиденье
				let r;
				if (isText) {
					const range = document.createRange();
					range.selectNodeContents(el);
					r = range.getBoundingClientRect();
				} else r = el.getBoundingClientRect();
				if (r.width < 8 || r.height < 6) return;
				const inset = isText ? r.height * 0.13 : 0;
				out.push({el, left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY + inset, bottom: r.bottom + scrollY});
			});
		}
		// большая «1DEX1 SHOP» из блоков тоже подходит (если первый экран сейчас показан)
		if (!zone.getClientRects().length) return out;
		const o = docOffset();
		const big = [];
		for (const x of [-BIG.width / 2, BIG.width / 2]) for (const y of [-BIG.height / 2, BIG.height / 2]) big.push(toPx(bigGroup.localToWorld(tmp.set(x, y, 0))));
		out.push({el: bigMesh, left: Math.min(...big.map((p) => p.x)) + o.x, right: Math.max(...big.map((p) => p.x)) + o.x, top: Math.min(...big.map((p) => p.y)) + o.y, bottom: Math.max(...big.map((p) => p.y)) + o.y});
		return out;
	};

	// --- силуэт острова: в него персонаж не проходит, сверху — встаёт на траву ---
	const ISLAND_PTS = [];
	for (let i = 0; i < 16; i++) {
		const a = (i / 16) * Math.PI * 2;
		ISLAND_PTS.push(new THREE.Vector3(Math.cos(a) * 3.9, 0.05, Math.sin(a) * 3.9));
		ISLAND_PTS.push(new THREE.Vector3(Math.cos(a) * 3.6, -2, Math.sin(a) * 3.6));
		ISLAND_PTS.push(new THREE.Vector3(Math.cos(a) * 1.4, -6, Math.sin(a) * 1.4));
	}
	const islandPolyDoc = () => {
		const o = docOffset();
		return convexHull(ISLAND_PTS.map((p) => toPx(island.localToWorld(tmp.copy(p))))).map((p) => ({x: p.x + o.x, y: p.y + o.y}));
	};

	// где верх силуэта острова над точкой x (null — остров не под ней)
	const hullTopAt = (poly, x) => {
		let top = null;
		for (let i = 0; i < poly.length; i++) {
			const a = poly[i];
			const c = poly[(i + 1) % poly.length];
			if ((a.x - x) * (c.x - x) > 0 || a.x === c.x) continue;
			const y = a.y + ((x - a.x) / (c.x - a.x)) * (c.y - a.y);
			if (top === null || y < top) top = y;
		}
		return top;
	};

	// пределы полёта: до поломки стены — только первый экран
	const bounds = () => {
		const top = 70;
		const right = document.documentElement.clientWidth;
		if (freeWorld) return {left: 0, right, top, bottom: document.documentElement.scrollHeight - 4};
		const hero = zone.getBoundingClientRect();
		const wallR = wall && wall.isConnected ? wall.getBoundingClientRect() : null;
		return {left: 0, right, top: Math.max(hero.top + scrollY, 0) + top, bottom: (wallR ? wallR.top : hero.bottom) + scrollY};
	};

	// Видимая сейчас часть страницы (под шапкой и над нижней панелью телефона),
	// куда он может долететь. null — сейчас ему не видно ни одного места.
	let topbarH = 64;
	let hotbarH = 0;
	const measureChrome = () => {
		const tb = document.querySelector('.topbar');
		topbarH = tb ? tb.getBoundingClientRect().bottom : 64;
		const hb = document.querySelector('.hotbar');
		hotbarH = hb && getComputedStyle(hb).display !== 'none' ? Math.max(0, innerHeight - hb.getBoundingClientRect().top) : 0;
	};
	const visibleBand = (B) => {
		const top = Math.max(B.top, scrollY + topbarH + 6);
		const bottom = Math.min(B.bottom, scrollY + innerHeight - hotbarH - 6);
		return bottom - top > 2.9 * playerK ? {top, bottom} : null;
	};

	// --- куда сесть ---
	let reachableNow = [];
	const findWidget = (ref) => widgets.find((x) => x.el === ref.el && Math.abs(x.top - ref.top) < 400) || null;
	// виджет прямо под ногами (когда его несут или отпускают). Ноги могут уже чуть
	// заходить на текст — главное, чтобы туловище было над его верхним краем.
	const seatUnderFeet = (range) => {
		let best = null;
		let bestGap = Infinity;
		const feet = PB.y + PB.hh;
		for (const w of reachableNow) {
			if (PB.x < w.left + PB.hw * 0.3 || PB.x > w.right - PB.hw * 0.3) continue;
			const gap = w.top - feet;
			if (PB.y > w.top - 4 || gap > range || Math.abs(gap) >= bestGap) continue;
			best = w;
			bestGap = Math.abs(gap);
		}
		return best;
	};
	// ближайший видимый виджет, к которому можно долететь, не задев остров
	const pathHitsIsland = (poly, x1, y1, x2, y2) => {
		for (let i = 1; i <= 10; i++) {
			const t = i / 11;
			if (hullDistance(lerp(x1, x2, t), lerp(y1, y2, t), poly).dist < PB.hw) return true;
		}
		return false;
	};
	const findSeat = (band, radius, poly) => {
		let best = null;
		let bestD = radius;
		const sitH = SIT[1] * 2 * playerK;
		for (const w of reachableNow) {
			if (w.el === PB.lastPerch && now - PB.lastPerchAt < 12) continue; // только что сняли — туда не сразу
			if (w.right - w.left < SIT[0] * 2 * playerK * 1.2) continue;
			if (w.top - sitH < band.top || w.top > band.bottom - 4) continue;
			const sx = clamp(PB.x, w.left + PB.hw, w.right - PB.hw);
			const sy = w.top - PB.hh;
			const d = Math.hypot(sx - PB.x, sy - PB.y);
			if (d >= bestD || pathHitsIsland(poly, PB.x, PB.y, sx, sy)) continue;
			best = {el: w.el, top: w.top, offX: sx - w.left};
			bestD = d;
		}
		return best;
	};
	// сесть на виджет: первым делом садится, свесив ноги
	const perchOn = (w, x) => {
		PB.perch = w;
		PB.seek = null;
		PB.auto = null;
		PB.perchX = x - w.left;
		PB.vx = 0;
		PB.vy = 0;
		PB.outT = 0;
		setPose('sit', 6 + Math.random() * 3);
		PB.y = w.top - PB.hh;
	};
	// слезть с виджета; delay — через сколько секунд снова искать, где сесть
	const unperch = (delay) => {
		if (PB.perch) {
			PB.lastPerch = PB.perch.el;
			PB.lastPerchAt = now;
		}
		PB.perch = null;
		PB.seek = null;
		PB.seekAt = now + delay;
		PB.calm = 0;
		setPose('float');
	};

	// снять с острова
	const leaveIsland = () => {
		ensureOverlay();
		const c = toPx(rig.pivot.getWorldPosition(new THREE.Vector3()));
		const o = docOffset();
		P.mode = 'free';
		P.queue = [];
		P.holding = false;
		PB.pose = 'held';
		PB.x = c.x + o.x;
		PB.y = c.y + o.y;
		fitPoseBox();
		PB.y = c.y + o.y;
		PB.vx = 0;
		PB.vy = 0;
		PB.perch = null;
		PB.seek = null;
		PB.auto = null;
		PB.spin = 0;
		PB.spinV = 0;
		PB.dizzy = 0;
		PB.idleT = 0;
		PB.seekAt = now + 5;
		PB.clearOfIsland = false; // пока его не отнесли от острова, обратно не садится
		PB.pickX = PB.x;
		PB.pickY = PB.y;
		overlay.classList.add('is-on');
	};
	// поставить на верх острова и отправить домой
	const islandTop = new THREE.Plane();
	const landOnIsland = () => {
		const o = docOffset();
		const fx = PB.x - o.x;
		const fy = PB.y + PB.hh - o.y;
		const ndc = new THREE.Vector2((fx / width) * 2 - 1, -((fy / height) * 2 - 1));
		raycaster.setFromCamera(ndc, camera);
		islandTop.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), island.localToWorld(new THREE.Vector3(0, 0, 0)));
		const hit = raycaster.ray.intersectPlane(islandTop, new THREE.Vector3());
		const feet = hit ? island.worldToLocal(hit) : HOME.clone();
		pushOutOfObstacles(feet);
		P.pos.copy(feet);
		P.mode = 'land';
		P.landT = 0;
		P.face = 0.15;
		P.queue = [walkTo(HOME)];
		jumpAt = now;
		PB.held = false;
		PB.auto = null;
		PB.perch = null;
		PB.seek = null;
		PB.spin = 0;
		PB.spinV = 0;
		overlay.classList.remove('is-on');
		if (Math.random() < 0.5) say(oneOf('say.home', 'icon:heart'), 1.5);
	};

	// --- стена (бегущая строка «Магазин · Моды · РП») ---
	let wallStage = 0;
	const crackWall = (stage) => {
		if (!wall) return;
		wall.classList.remove('crack-1', 'crack-2', 'crack-3');
		if (stage) wall.classList.add(`crack-${stage}`);
	};
	const shatterWall = () => {
		if (!wall) return;
		const r = wall.getBoundingClientRect();
		const colors = ['#161126', '#2b2343', '#f5f2ff', '#9a6bff', '#b8ff3d', '#ffc83d', '#3d3260'];
		const shards = [];
		for (let i = 0; i < 70; i++) {
			const s = document.createElement('i');
			s.className = 'wall-shard';
			const size = 8 + Math.random() * 16;
			s.style.cssText = `left:${r.left + scrollX + Math.random() * r.width}px;top:${r.top + scrollY + Math.random() * r.height}px;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random() * colors.length)]}`;
			document.body.append(s);
			shards.push({el: s, vx: (Math.random() - 0.5) * 500, vy: -200 - Math.random() * 420, rot: (Math.random() - 0.5) * 720, x: 0, y: 0, a: 0});
		}
		const t0 = performance.now();
		const tick = (t) => {
			const dt = (t - t0) / 1000;
			for (const s of shards) {
				s.el.style.transform = `translate(${s.vx * dt}px,${s.vy * dt + 900 * dt * dt}px) rotate(${s.rot * dt}deg)`;
				s.el.style.opacity = String(Math.max(0, 1 - dt / 1.3));
			}
			if (dt < 1.35) requestAnimationFrame(tick);
			else shards.forEach((s) => s.el.remove());
		};
		requestAnimationFrame(tick);
		wall.classList.add('is-gone');
		crackWall(0);
	};
	if (wall) {
		wall.style.cursor = CROSSHAIR;
		wall.addEventListener('click', (e) => {
			if (freeWorld) return;
			if (progress.tier < 3) return warn('wallNeed', TIERS[progress.tier].id);
			if (P.mode === 'free') {
				// уже летает — летит к стене сразу, даже если сидел на виджете
				PB.held = false;
				PB.perch = null;
				PB.seek = null;
				setPose('fly');
				PB.auto = {x: e.clientX + scrollX, y: wall.getBoundingClientRect().top + scrollY - PB.hh - 4, then: 'wall'};
				P.holding = true;
				say('say.break', 1.4);
				return;
			}
			if (P.mode !== 'idle' && P.mode !== 'walk') return warn('busy');
			// идёт к сундуку за алмазной киркой и летит ломать стену
			P.queue = [walkTo(CHEST_SPOT), {type: 'chest', take: true}, {type: 'leap', x: e.clientX + scrollX}];
			if (P.mode === 'walk') P.path = [];
			P.mode = 'idle';
		});
	}

	// ================= УКАЗАТЕЛЬ: КЛИКИ И ПЕРЕТАСКИВАНИЕ =================
	// drag: {x0, y0, started, free} — free: схватили персонажа вне острова.
	// Пока мышь не сдвинулась, это клик (персонаж реагирует), сдвинулась — его несут.
	let drag = null;
	let suppressClick = false;
	const trail = []; // последние положения руки — из них скорость броска
	const hitFree = () => P.mode === 'free' && !tp && !rage && Math.abs(pointerDoc.x - PB.x) < PB.hw + 8 && Math.abs(pointerDoc.y - PB.y) < PB.hh + 8;
	const startDrag = () => {
		if (P.mode !== 'free') leaveIsland();
		if (PB.perch) {
			PB.lastPerch = PB.perch.el;
			PB.lastPerchAt = now;
		}
		if (PB.auto || PB.pose === 'wall') {
			// не дали доломать стену — кирку убирает, трещины пропадают
			crackWall(0);
			wallStage = 0;
			P.holding = false;
		}
		PB.held = true;
		PB.perch = null;
		PB.seek = null;
		PB.auto = null;
		PB.spinV = 0;
		PB.idleT = 0;
		setPose('held');
		drag.ox = PB.x - pointerDoc.x;
		drag.oy = PB.y - pointerDoc.y;
		drag.started = true;
		trail.length = 0;
		if (!r2) {
			// без прослойки летать нельзя — вернуть на место
			landOnIsland();
			drag = null;
			return;
		}
		if (Math.random() < 0.45) say(oneOf('say.hey', '!', 'say.oops'), 1.1);
		on('drag');
	};
	// отпустили: если рука двигалась — летит с той же скоростью и плавно тормозит
	const release = (t1) => {
		PB.held = false;
		PB.thrownAt = now; // в ближайшие секунды портал его примет: значит, закинули
		const recent = trail.filter((p) => t1 - p.t < 110);
		let vx = 0;
		let vy = 0;
		if (recent.length >= 2 && t1 - recent[recent.length - 1].t < 70) {
			const a = recent[0];
			const b = recent[recent.length - 1];
			const sec = Math.max(16, b.t - a.t) / 1000;
			vx = (b.x - a.x) / sec;
			vy = (b.y - a.y) / sec;
		}
		const sp = Math.hypot(vx, vy);
		if (sp > 2600) {
			vx *= 2600 / sp;
			vy *= 2600 / sp;
		}
		PB.calm = 0;
		// аккуратно отпустили прямо над текстом или кнопкой — садится на них
		if (sp < 420) {
			const seat = seatUnderFeet(60);
			if (seat) {
				perchOn(seat, PB.x);
				return;
			}
		}
		PB.vx = vx;
		PB.vy = vy;
		PB.seekAt = now + (sp > 700 ? 8 : 5); // после броска сначала просто летает
		setPose('float');
		if (sp > 700) {
			PB.spinV = Math.sign(vx || vy || 1) * Math.min(12, sp / 220); // кувыркается
			say(oneOf('say.wee', 'say.yoho', 'say.fly'), 1.4);
		}
	};
	// просто ткнули в персонажа
	const poke = () => {
		PB.idleT = 0;
		if (++tickles === 5) on('tickle');
		if (PB.perch && freeWorld && !rage) {
			rageTaps.push(now);
			while (rageTaps.length && now - rageTaps[0] > 3) rageTaps.shift();
			if (rageTaps.length >= 5) {
				rageTaps.length = 0;
				startRage();
				return;
			}
			if (rageTaps.length >= 3) {
				// уже бесится: третий и четвёртый тычок — предупреждает
				PB.hop = 0.42;
				say(rageTaps.length === 3 ? '...' : 'icon:angry', 1.2);
				if (PB.pose === 'sleep' || PB.pose === 'doze' || PB.pose === 'lie') setPose('sit', 5);
				return;
			}
		}
		if (PB.perch) {
			PB.hop = 0.42;
			if (PB.pose === 'sleep' || PB.pose === 'doze') {
				say('!', 1);
				setPose('sit', 5);
				return;
			}
			const r = Math.random();
			if (r < 0.34) say('say.giggle', 1.3);
			else if (r < 0.67) {
				say('icon:heart', 1.6);
				setPose('wave', 2.2);
			} else say('!', 1);
		} else {
			PB.spinV = (Math.random() < 0.5 ? -1 : 1) * 8;
			say(oneOf('say.wee', 'say.giggle'), 1.3);
		}
	};

	// персонаж вне острова: хватаем его где угодно на странице
	document.addEventListener(
		'pointerdown',
		(e) => {
			updatePointer(e.clientX, e.clientY);
			if (!hitFree()) return;
			drag = {x0: e.clientX, y0: e.clientY, started: false, free: true};
			suppressClick = true;
			e.preventDefault();
			e.stopPropagation();
		},
		{capture: true},
	);
	document.addEventListener(
		'click',
		(e) => {
			if (!suppressClick) return;
			suppressClick = false;
			e.preventDefault();
			e.stopPropagation();
		},
		{capture: true},
	);
	document.addEventListener(
		'touchstart',
		(e) => {
			const t = e.touches[0];
			if (!t) return;
			updatePointer(t.clientX, t.clientY);
			if (hitFree() || (pointerInHero && pickPlayer())) e.preventDefault();
		},
		{passive: false, capture: true},
	);
	addEventListener('pointermove', (e) => {
		updatePointer(e.clientX, e.clientY);
		if (!drag) return;
		if (!drag.started && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) startDrag();
		if (drag?.started) {
			// браузер склеивает движения мыши в одно событие на кадр — берём все настоящие точки
			const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
			for (const c of raw.length ? raw : [e]) trail.push({t: c.timeStamp, x: c.clientX + scrollX, y: c.clientY + scrollY});
			while (trail.length > 24) trail.shift();
		}
	});
	let downAt = null;
	// остров: схватить персонажа, сломать блок названия, добыть блок
	zone.addEventListener('pointerdown', (e) => {
		if (e.target.closest('a, button')) return;
		updatePointer(e.clientX, e.clientY);
		downAt = [e.clientX, e.clientY];
		if (pickVoxel()) return;
		if (pickPlayer()) {
			drag = {x0: e.clientX, y0: e.clientY, started: false, free: false};
			e.preventDefault(); // иначе браузер начинает выделять текст
		}
	});
	zone.addEventListener('pointerup', (e) => {
		if (drag?.started || drag?.free) return; // перетаскивание или клик по летающему персонажу
		drag = null;
		if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
		if (e.target.closest('a, button')) return;
		updatePointer(e.clientX, e.clientY);
		const hit = pickVoxel();
		if (hit) breakVoxel(hit);
		else if (pickPlayer()) {
			if (P.mode === 'idle') jumpAt = now;
			if (++tickles === 5) on('tickle');
			if (Math.random() < 0.6) say(oneOf('say.giggle', 'icon:heart', 'say.hi'), 1.4);
		} else if (pickPortal()) enterPortal();
		else {
			const b = pickBlock();
			if (b) startMining(b);
		}
	});
	addEventListener('pointerup', (e) => {
		if (drag?.started && P.mode === 'free' && PB.held) release(e.timeStamp);
		else if (drag && drag.free && !drag.started && P.mode === 'free') poke();
		drag = null;
	});
	addEventListener('pointercancel', () => {
		if (P.mode === 'free' && PB.held) {
			PB.held = false;
			PB.seekAt = now + 4;
			setPose('float');
		}
		drag = null;
	});

	// ================= ТЕЛЕФОН: ТЕЛЕПОРТ МЕЖДУ ЭКРАНАМИ =================
	// На телефоне Главная, Магазин и Кейсы — отдельные экраны. Персонаж не летит через весь сайт,
	// а телепортируется: вспышка там, где был, и через миг — вспышка там, где появился.
	// Пока стена цела, дальше первого экрана ему нельзя: телепорт домой на остров,
	// а когда возвращаешься на Главную — появляется на острове со вспышкой.
	const TP_GAP = 320; // сколько миллисекунд его нет между вспышками
	let tp = null; // {until} — летающий персонаж исчез и ждёт, когда появиться
	let tpHome = false; // телепортировался на остров, пока открыт другой экран
	let islandTpAt = 0; // когда показать его на острове со вспышкой
	let popAt = -99; // когда появился: «выпрыгивает» из вспышки
	const TP_COLORS = ['#ffffff', '#e6d9ff', '#c3a6ff', '#9a6bff', '#5b34c9', '#b8ff3d'];
	const flash = (x, y) => {
		const size = Math.max(64, playerK * 4.2);
		const el = document.createElement('div');
		el.className = 'tp-flash';
		el.setAttribute('aria-hidden', 'true');
		el.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--s:${size.toFixed(0)}px`;
		let html = '<b></b>';
		for (let i = 0; i < 16; i++) {
			const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
			const d = size * (0.45 + Math.random() * 0.5);
			const c = TP_COLORS[Math.floor(Math.random() * TP_COLORS.length)];
			html += `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 1.25).toFixed(0)}px;--c:${c};--d:${(Math.random() * 0.08).toFixed(2)}s"></i>`;
		}
		el.innerHTML = html;
		document.body.append(el);
		setTimeout(() => el.remove(), 900);
	};
	// мгновенно домой на остров (без прыжка и без ходьбы)
	const homeNow = () => {
		P.pos.copy(HOME);
		P.mode = 'idle';
		P.queue = [];
		P.holding = false;
		P.face = 0.15;
		PB.held = false;
		PB.auto = null;
		PB.perch = null;
		PB.seek = null;
		PB.spin = 0;
		PB.spinV = 0;
		if (PB.pose === 'wall') crackWall(0);
		overlay.classList.remove('is-on');
	};
	// появиться на новом экране: сразу сесть на виджет, который виден, или парить посередине
	const appear = () => {
		measureChrome();
		widgets = collectWidgets();
		widgetsAt = now;
		const B = bounds();
		const band = visibleBand(B) || {top: scrollY + topbarH + 6, bottom: scrollY + innerHeight - hotbarH - 6};
		reachableNow = widgets.filter((w) => w.top >= B.top - 10 && w.top <= B.bottom - 10);
		setPose('float');
		PB.x = clamp(vw * (0.25 + Math.random() * 0.5), PB.hw + 8, vw - PB.hw - 8);
		PB.y = band.top + (band.bottom - band.top) * 0.4;
		PB.vx = 0;
		PB.vy = 0;
		PB.lastPerch = null;
		const seat = findSeat(band, 4000, zone.getClientRects().length ? islandPolyDoc() : []);
		const w = seat && findWidget(seat);
		if (w) perchOn(w, w.left + seat.offX);
		PB.seekAt = now + 3;
		PB.calm = 1;
		PB.idleT = 0;
		PB.clearOfIsland = false; // появился над островом — сам на него не спрыгивает
		PB.pickX = PB.x;
		PB.pickY = PB.y;
		popAt = now;
		flash(PB.x - scrollX, PB.y - scrollY);
		if (Math.random() < 0.6) say(oneOf('say.tp', 'say.hi', 'icon:heart'), 1.4);
	};
	// app.js сообщает о смене экрана до того, как экран поменялся (координаты ещё старые)
	addEventListener('dex:page', (e) => {
		const {from, to} = e.detail || {};
		if (!from || from === to) return;
		if (P.mode === 'free') {
			if (!tp) flash(PB.x - scrollX, PB.y - scrollY);
			drag = null;
			talk.at = -99;
			if (freeWorld) {
				PB.held = false;
				PB.perch = null;
				PB.seek = null;
				PB.auto = null;
				PB.spin = 0;
				PB.spinV = 0;
				tp = {until: performance.now() + TP_GAP};
			} else {
				tp = null;
				homeNow();
				tpHome = true;
				if (to === 'home') islandTpAt = performance.now() + TP_GAP;
			}
		} else if (to === 'home' && tpHome) islandTpAt = performance.now() + TP_GAP;
	});

	// ================= ПЕРСОНАЖ НА ОСТРОВЕ: ОЧЕРЕДЬ ДЕЙСТВИЙ =================
	const stepIsland = (dt) => {
		if (P.mode === 'land') {
			P.landT += dt;
			if (P.landT < 0.5) return;
			P.mode = 'idle';
		}
		if (P.mode === 'idle' && P.queue.length) {
			const a = P.queue[0];
			if (a.type === 'walk') {
				P.path = planPath(P.pos, a.to);
				P.mode = 'walk';
			} else if (a.type === 'chest') {
				P.mode = 'chest';
				P.actT = 0;
			} else if (a.type === 'mine') {
				P.mode = 'mine';
				P.actT = 0;
				if (a.carry) P.holding = true;
			} else if (a.type === 'portal') {
				// заходит в портал
				P.mode = 'portal';
				P.actT = 0;
				a.from = P.pos.clone();
				a.to = new THREE.Vector3(portalHere().center.x, 0, portalHere().center.z);
			} else if (a.type === 'breakPortal') {
				P.mode = 'breakPortal';
				P.actT = 0;
			} else if (a.type === 'breakEgg') {
				P.mode = 'breakEgg';
				P.actT = 0;
				P.holding = true;
			} else if (a.type === 'leap') {
				// прыжок с острова к стене — с алмазной киркой в руке
				P.queue = [];
				leaveIsland();
				P.holding = true;
				PB.pose = 'fly';
				fitPoseBox();
				const wr = wall.getBoundingClientRect();
				PB.auto = {x: clamp(a.x, 40, document.documentElement.clientWidth - 40), y: wr.top + scrollY - PB.hh - 4, then: 'wall'};
				return;
			}
		}
		switch (P.mode) {
			case 'walk': {
				const target = P.path[0];
				if (!target) {
					P.mode = 'idle';
					P.queue.shift();
					break;
				}
				const dx = target.x - P.pos.x;
				const dz = target.z - P.pos.z;
				const dist = Math.hypot(dx, dz);
				if (dist < 0.04) {
					P.pos.x = target.x;
					P.pos.z = target.z;
					P.path.shift();
					if (!P.path.length) {
						P.mode = 'idle';
						P.queue.shift();
					}
				} else {
					const step = Math.min(dist, WALK_SPEED * dt);
					P.pos.x += (dx / dist) * step;
					P.pos.z += (dz / dist) * step;
					P.face = Math.atan2(dx, dz);
					P.walkPhase += dt * 11;
				}
				break;
			}
			case 'chest': {
				// открыть сундук левой рукой, правой достать кирку и показать её (или положить обратно), закрыть
				P.actT += dt;
				P.face = Math.atan2(CHEST.x - P.pos.x, CHEST.z - P.pos.z);
				const a = P.queue[0];
				if (P.actT > (a.take ? 0.6 : 0.5) && P.holding !== a.take) P.holding = a.take;
				if (a.take && !a.shown && P.actT > 0.95) {
					// кирка в поднятой руке блестит
					a.shown = true;
					spawnDebris(world.worldToLocal(rig.pick.localToWorld(tmp2.set(0, 8, 0))), TIERS[progress.tier].hi, 8, 0.3, 0.35);
				}
				if (P.actT > (a.take ? CHEST_TAKE : CHEST_PUT)) {
					P.mode = 'idle';
					P.queue.shift();
				}
				break;
			}
			case 'mine': {
				P.actT += dt;
				const b = P.queue[0].block;
				P.face = Math.atan2(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
				const hitsBefore = Math.floor((P.actT - dt) / 0.25);
				if (Math.floor(P.actT / 0.25) > hitsBefore) spawnDebris(islandToWorldLocal(b.pos, tmp2), BLOCK_COLOR[b.type], 2, 0.4);
				if (P.actT >= MINE_TIME) {
					finishMining(b);
					if (P.queue[0].carry) P.holding = false;
					P.mode = 'idle';
					P.queue.shift();
				}
				break;
			}
			case 'portal': {
				// шагает в завесу портала и уменьшается в ней, потом — вспышка и другой мир
				const a = P.queue[0];
				P.actT += dt;
				const k = Math.min(1, P.actT / 0.6);
				P.pos.lerpVectors(a.from, a.to, k * k);
				P.face = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
				P.walkPhase += dt * 9;
				portalShrink = 1 - 0.75 * k;
				if (k >= 1 && !a.warped) {
					a.warped = true;
					startWarp();
				}
				break;
			}
			case 'breakEgg': {
				// бьёт по яйцу дракона: яйцо шатается, летят осколки — и оно разбивается
				const ph = portalHere();
				P.actT += dt;
				P.face = Math.atan2(ph.center.x - P.pos.x, ph.center.z - P.pos.z);
				ph.egg.rotation.z = Math.sin(P.actT * 32) * 0.1 * Math.min(1, P.actT * 2);
				const hitsBefore = Math.floor((P.actT - dt) / 0.3);
				if (Math.floor(P.actT / 0.3) > hitsBefore) {
					spawnDebris(world.worldToLocal(ph.egg.getWorldPosition(new THREE.Vector3())), Math.random() < 0.4 ? '#9a4bff' : '#1d0f2b', 4, 0.5);
					on('wallHit');
				}
				if (P.actT >= 1.4) {
					openEndExit();
					P.holding = false;
					P.mode = 'idle';
					P.queue.shift();
				}
				break;
			}
			case 'breakPortal': {
				// бьёт незеритовой киркой по обсидиану: осколки, завеса тускнеет — и портал рассыпается
				P.actT += dt;
				const c = portalOver.center;
				P.face = Math.atan2(c.x - P.pos.x, c.z - P.pos.z);
				const hitsBefore = Math.floor((P.actT - dt) / 0.3);
				if (Math.floor(P.actT / 0.3) > hitsBefore) {
					const at = islandToWorldLocal(portalOver.group.localToWorld(tmp.set((Math.random() - 0.5) * 2.4, 0.6 + Math.random() * 2.6, 0)), tmp2);
					spawnDebris(at, Math.random() < 0.3 ? '#9a4bff' : '#2a1d40', 4, 0.6);
					on('wallHit');
				}
				portalMat.opacity = 1 - Math.min(0.7, P.actT / 2.4);
				if (P.actT >= 1.8) {
					breakNetherPortal();
					P.mode = 'idle';
					P.queue.shift();
				}
				break;
			}
			case 'idle':
				if (!P.queue.length) P.face = worldId === 'over' ? 0.15 : 0.35;
				break;
			default:
		}
		// крышка сундука: открывается в начале, закрывается, когда кирку уже достал или положил
		let open = 0;
		if (P.mode === 'chest') {
			const t = P.actT;
			open = P.queue[0]?.take ? smooth(t, 0.02, 0.3) * (1 - smooth(t, 1.4, 1.7)) : smooth(t, 0.02, 0.28) * (1 - smooth(t, 0.66, 0.98));
		}
		lid.rotation.x = lerp(lid.rotation.x, -1.3 * open, 1 - Math.exp(-dt * 20));
	};

	// ================= ПЕРСОНАЖ ВНЕ ОСТРОВА: ПОЛЁТ =================
	// Порядок важности: несут в руке → летит к стене → ломает стену → сидит на виджете →
	// летит к виджету, чтобы сесть → просто парит в невесомости и держится рядом с посетителем.
	const stepFree = (dt) => {
		// на телефоне открыт другой экран, а стена ещё цела — персонажу некуда лететь, он идёт домой
		if (!freeWorld && !zone.getClientRects().length) {
			landOnIsland();
			drag = null;
			return;
		}
		// телепорт между экранами: пока его нет — ждёт, потом появляется на новом экране
		if (tp) {
			if (performance.now() < tp.until) return;
			tp = null;
			appear();
			return;
		}
		if (!widgetsAt || now - widgetsAt > 0.25) {
			widgets = collectWidgets();
			widgetsAt = now;
		}
		fitPoseBox();
		const B = bounds();
		const band = visibleBand(B);
		const islandPoly = zone.getClientRects().length ? islandPolyDoc() : [];
		reachableNow = widgets.filter((w) => w.top >= B.top - 10 && w.top <= B.bottom - 10);
		// остров тоже «хочет» принять персонажа: насколько ноги над травой
		const islandTopY = hullTopAt(islandPoly, PB.x);
		const islandGap = islandTopY === null ? null : islandTopY - (PB.y + PB.hh);
		if (Math.hypot(PB.x - PB.pickX, PB.y - PB.pickY) > 80 && (islandGap === null || islandGap > 30)) PB.clearOfIsland = true;
		PB.idleT += dt;
		PB.hop = Math.max(0, PB.hop - dt);
		PB.dizzy = Math.max(0, PB.dizzy - dt);

		if (PB.held && drag) {
			// в руке: следует за курсором и никуда сам не садится
			const tx = pointerDoc.x + drag.ox;
			const ty = pointerDoc.y + drag.oy;
			const k = 1 - Math.exp(-dt * 30);
			const nx = lerp(PB.x, tx, k);
			const ny = lerp(PB.y, ty, k);
			PB.vx = lerp(PB.vx, (nx - PB.x) / dt, 0.3);
			PB.vy = lerp(PB.vy, (ny - PB.y) / dt, 0.3);
			PB.x = nx;
			PB.y = ny;
			PB.idleT = 0;
			// над порталом не спрыгивает: отпустишь — уйдёт в портал
			const overPortal = overPortalNow();
			// поднесли к острову — сам спрыгивает на траву
			if (!overPortal && PB.clearOfIsland && islandGap !== null && islandGap < 16 && islandGap > -PB.hh) {
				landOnIsland();
				drag = null;
				return;
			}
			// над текстом или островом тянется ногами — «хочет сесть»
			const wantsIsland = PB.clearOfIsland && islandGap !== null && islandGap > 0 && islandGap < 110;
			setPose(wantsIsland || seatUnderFeet(90) ? 'reach' : 'held');
		} else if (PB.auto) {
			// автопилот: летит к стене
			const dx = PB.auto.x - PB.x;
			const dy = PB.auto.y - PB.y;
			const d = Math.hypot(dx, dy);
			const sp = Math.min(900, d * 3.2);
			PB.vx = lerp(PB.vx, (dx / (d || 1)) * sp, 1 - Math.exp(-dt * 5));
			PB.vy = lerp(PB.vy, (dy / (d || 1)) * sp, 1 - Math.exp(-dt * 5));
			PB.x += PB.vx * dt;
			PB.y += PB.vy * dt;
			if (d < 8) {
				const then = PB.auto.then;
				PB.auto = null;
				PB.vx = 0;
				PB.vy = 0;
				if (then === 'wall') {
					PB.pose = 'wall';
					PB.poseT = 0;
				} else if (then === 'portal') {
					enterFromFree();
					return;
				}
			}
		} else if (PB.pose === 'wall') {
			// ломает стену алмазной киркой: три удара — трещины — осколки
			PB.poseT += dt;
			const stage = Math.min(3, Math.floor(PB.poseT / 0.45) + 1);
			if (stage !== wallStage) {
				wallStage = stage;
				crackWall(stage);
				on('wallHit');
			}
			if (PB.poseT > 1.5) {
				shatterWall();
				freeWorld = true;
				P.holding = false;
				wallStage = 0;
				setPose('float');
				PB.vy = 60;
				PB.calm = 0;
				PB.seekAt = now + 2.5;
				say('say.free', 1.8);
				on('free');
			}
		} else if (PB.perch) {
			// сидит на виджете: держится за его верх, даже если страница поменялась
			const w = findWidget(PB.perch);
			if (!w) unperch(1);
			else {
				PB.perch = w;
				PB.x = clamp(w.left + PB.perchX, w.left + PB.hw * 0.5, w.right - PB.hw * 0.5);
				PB.y = w.top - PB.hh;
				PB.vx = 0;
				PB.vy = 0;
				// посетитель пролистал страницу — летит за ним
				const out = band && (w.top < band.top + 10 || w.top - SIT[1] * 2 * playerK > band.bottom);
				PB.outT = out ? PB.outT + dt : 0;
				if (PB.outT > 0.3) {
					unperch(0.9);
					if (Math.random() < 0.6) say(oneOf('say.wait', 'say.withYou', 'say.fly'), 1.5);
				} else {
					PB.poseT += dt;
					const near = Math.hypot(pointerDoc.x - PB.x, pointerDoc.y - PB.y) < 170;
					if (rage) {
						// злится — ничего другого не делает
					} else if (PB.pose === 'sleep' || PB.pose === 'doze') {
						if (now > PB.zzzAt) {
							PB.zzzAt = now + 2.8;
							say('Zzz', 1.9);
						}
					} else if (PB.idleT > 30) {
						// долго никто не трогал — засыпает
						setPose(wideEnough(w) ? 'sleep' : 'doze');
						PB.zzzAt = now + 0.6;
					} else if (near && now - PB.greetAt > 16 && PB.pose !== 'wave') {
						PB.greetAt = now;
						setPose('wave', 2.4);
						say('say.hi', 1.6);
					} else if (PB.poseT > PB.poseDur) perchPose();
				}
			}
		} else if (PB.seek) {
			// увидел текст — летит к нему, на подлёте вытягивает ноги
			const w = findWidget(PB.seek);
			const lost = !w || !band || w.top - SIT[1] * 2 * playerK < band.top - 20 || w.top > band.bottom + 20;
			if (lost) {
				PB.seek = null;
				PB.seekAt = now + 0.5;
			} else {
				PB.seek.top = w.top;
				const tx = clamp(w.left + PB.seek.offX, w.left + PB.hw * 0.6, w.right - PB.hw * 0.6);
				const ty = w.top - PB.hh;
				const dx = tx - PB.x;
				const dy = ty - PB.y;
				const d = Math.hypot(dx, dy) || 1;
				const sp = Math.min(560, d * 2.8 + 25);
				const k = 1 - Math.exp(-dt * 4.5);
				PB.vx = lerp(PB.vx, (dx / d) * sp, k);
				PB.vy = lerp(PB.vy, (dy / d) * sp, k);
				PB.x += PB.vx * dt;
				PB.y += PB.vy * dt;
				setPose(d < 120 ? 'reach' : 'fly');
				if (d < 6) perchOn(w, tx);
			}
		} else {
			// невесомость: плавно тормозит после броска и чуть дрейфует
			PB.calm += dt;
			const damp = Math.exp(-1.15 * dt);
			PB.vx *= damp;
			PB.vy *= damp;
			PB.vx += Math.sin(now * 0.7 + 1.3) * 7 * dt;
			PB.vy += Math.cos(now * 0.9) * 7 * dt;
			// держится в видимой части страницы: листаешь — летит следом
			let following = false;
			if (band && PB.calm > 0.35) {
				const lo = band.top + PB.hh;
				const hi = band.bottom - PB.hh;
				let want = 0;
				if (PB.y < lo) want = Math.min(1000, (lo - PB.y) * 2.6 + 70);
				else if (PB.y > hi) want = -Math.min(1000, (PB.y - hi) * 2.6 + 70);
				if (want && (want > 0 ? PB.vy < want : PB.vy > want)) PB.vy = lerp(PB.vy, want, 1 - Math.exp(-dt * 3.5));
				following = want !== 0;
			}
			// успокоился — ищет, где сесть: сначала совсем рядом, потом подальше
			const speed = Math.hypot(PB.vx, PB.vy);
			if (band && !following && now > PB.seekAt && speed < 260 && PB.dizzy <= 0 && now - PB.seekTry > 0.4) {
				PB.seekTry = now;
				PB.seek = findSeat(band, now - PB.seekAt < 3 ? 320 : 900, islandPoly);
				if (PB.seek && Math.random() < 0.3) say(oneOf('!', 'say.sitHere'), 1.3);
			}
			PB.x += PB.vx * dt;
			PB.y += PB.vy * dt;
			setPose(following && Math.abs(PB.vy) > 260 ? 'fly' : 'float');
		}

		// закинули в портал (бросок или отпустили над ним) или отправили кликом — телепорт в другой мир.
		// Просто пролетая мимо, в портал не затягивает.
		const toPortal = PB.auto?.then === 'portal' || (!PB.auto && now - (PB.thrownAt ?? -99) < 1.6);
		if (!PB.held && !warp && toPortal && overPortalNow()) {
			enterFromFree();
			return;
		}
		// остров: сверху — спрыгивает на траву, в бок — не пускает (кроме полёта в портал)
		if (!PB.perch && P.mode === 'free' && PB.auto?.then !== 'portal') {
			const m = boxPoly(PB, islandPoly);
			if (m && PB.clearOfIsland) {
				if (m.ny < -0.55 && !PB.auto && !PB.seek && PB.pose !== 'wall') {
					landOnIsland();
					drag = null;
					return;
				}
				PB.x += m.nx * m.depth;
				PB.y += m.ny * m.depth;
				const vn = PB.vx * m.nx + PB.vy * m.ny;
				if (vn < 0) {
					PB.vx -= m.nx * vn * 1.4;
					PB.vy -= m.ny * vn * 1.4;
				}
			}
		}
		// пределы: до поломки стены — первый экран, после — весь сайт. Сильный удар — «Ой!»
		const bump = (v) => {
			if (Math.abs(v) > 1000 && !PB.held) {
				PB.dizzy = 1.4;
				say('say.oops', 1.1);
			}
		};
		if (PB.x - PB.hw < B.left) {
			bump(PB.vx);
			PB.x = B.left + PB.hw;
			PB.vx = Math.abs(PB.vx) * 0.55;
		}
		if (PB.x + PB.hw > B.right) {
			bump(PB.vx);
			PB.x = B.right - PB.hw;
			PB.vx = -Math.abs(PB.vx) * 0.55;
		}
		if (PB.y - PB.hh < B.top) {
			bump(PB.vy);
			PB.y = B.top + PB.hh;
			PB.vy = Math.abs(PB.vy) * 0.55;
		}
		if (PB.y + PB.hh > B.bottom) {
			bump(PB.vy);
			PB.y = B.bottom - PB.hh;
			PB.vy = -Math.abs(PB.vy) * 0.55;
		}
		// кувырок после броска: крутится, замедляется и встаёт ровно
		if (PB.spinV) {
			PB.spin += PB.spinV * dt;
			PB.spinV *= Math.exp(-1.4 * dt);
			if (Math.abs(PB.spinV) < 2) PB.spinV = 0;
		} else if (PB.spin) {
			const level = Math.round(PB.spin / (Math.PI * 2)) * Math.PI * 2;
			PB.spin = lerp(PB.spin, level, 1 - Math.exp(-dt * 6));
			if (Math.abs(PB.spin - level) < 0.01) PB.spin = 0;
		}
	};

	// ================= АНИМАЦИЯ СКЕЛЕТА =================
	const pose = {armRx: 0, armRz: 0, armLx: 0, armLz: 0, legR: 0, legL: 0, legRz: 0, legLz: 0, hipX: 0, sneak: 0, drop: 0, roll: 0, tiltZ: 0, headPitch: 0, headYaw: 0};
	const look = {yaw: 0, pitch: 0};
	const headPos = new THREE.Vector3();
	const CARRY = -0.38; // рука с киркой чуть вперёд
	// ключевые позы у сундука
	const K_REST = {armRx: 0, armRz: 0.04, armLx: 0, armLz: -0.04, sneak: 0, drop: 0, headPitch: 0};
	const K_REACH = {armRx: -0.55, armRz: 0.05, armLx: -1.75, armLz: -0.15, sneak: 1, drop: 0.22, headPitch: 0.55}; // левая держит крышку, правая в сундуке
	const K_SHOW = {armRx: -1.85, armRz: -0.5, armLx: 0.1, armLz: -0.08, sneak: 0, drop: 0, headPitch: -0.3}; // поднял кирку сбоку от головы и смотрит на неё
	const K_HOLD = {...K_REST, armRx: CARRY};
	const mixPose = (a, b, k) => {
		const o = {};
		for (const key of Object.keys(a)) o[key] = lerp(a[key], b[key], k);
		return o;
	};
	const chestPose = () => {
		const t = P.actT;
		if (P.queue[0]?.take) {
			if (t < 0.66) return mixPose(K_REST, K_REACH, smooth(t, 0, 0.3));
			if (t < 1.38) {
				const o = mixPose(K_REACH, K_SHOW, smooth(t, 0.66, 0.95));
				o.armRx += Math.sin(t * 10) * 0.06 * smooth(t, 0.95, 1.05);
				return o;
			}
			return mixPose(K_SHOW, K_HOLD, smooth(t, 1.38, 1.7));
		}
		if (t < 0.62) return mixPose(K_HOLD, K_REACH, smooth(t, 0, 0.3));
		return mixPose(K_REACH, K_REST, smooth(t, 0.62, 1.0));
	};
	const animateRig = (R, dt, idle, cam, pointerVec) => {
		const t = now;
		const k = 1 - Math.exp(-dt * 12);
		const p = R.parts;
		const jump = clamp((now - jumpAt) / 0.42, 0, 1);
		const cheer = jump < 1 && P.mode !== 'free' ? Math.sin(jump * Math.PI) : 0;
		const target = {armRx: 0, armRz: 0.04, armLx: 0, armLz: -0.04, legR: 0, legL: 0, legRz: 0, legLz: 0, hipX: 0, sneak: 0, drop: 0, roll: 0, tiltZ: 0, headPitch: 0, headYaw: 0};
		const sway = Math.sin(idle * 2) * 0.05;
		// на острове под музыку танцует, если ничем не занят
		const state = P.mode === 'free' ? PB.pose : P.mode === 'idle' && !P.queue.length && !P.holding && dancingOnIsland() ? 'dance' : P.mode;
		let snap = false; // «робот»: позы меняются рывком, без плавности
		const swing = (period) => {
			const ph = (P.actT / period) % 1;
			return ph < 0.45 ? -2.3 : -0.5;
		};
		switch (state) {
			case 'portal':
			case 'walk': {
				const s = Math.sin(P.walkPhase);
				Object.assign(target, {armRx: P.holding ? CARRY + s * 0.12 : -s * 0.55, armLx: s * 0.55, legR: s * 0.7, legL: -s * 0.7});
				break;
			}
			case 'chest':
				Object.assign(target, chestPose());
				break;
			case 'mine': {
				const b = P.queue[0]?.block;
				const down = b && b.pos.y < -0.5;
				Object.assign(target, {armRx: swing(0.25), armRz: 0.1, sneak: down ? 0.6 : 0, headPitch: down ? 0.7 : 0.2});
				break;
			}
			case 'breakPortal':
			case 'breakEgg':
				Object.assign(target, {armRx: swing(0.3), armRz: 0.1, headPitch: -0.2});
				break;
			case 'wall': {
				const ph = (PB.poseT / 0.45) % 1;
				Object.assign(target, {armRx: ph < 0.5 ? -2.6 : -0.3, armRz: 0.1, headPitch: 0.5});
				break;
			}
			case 'held':
				// болтается в руке: руки вверх, ноги дрыгаются
				Object.assign(target, {armRx: -2.8 + Math.sin(t * 14) * 0.25, armRz: -0.3, armLx: -2.8 + Math.cos(t * 14) * 0.25, armLz: 0.3, legR: Math.sin(t * 9) * 0.4 + 0.2, legL: -Math.sin(t * 9) * 0.4 + 0.2, tiltZ: clamp(-PB.vx * 0.0005, -0.5, 0.5)});
				break;
			case 'float':
				// плывёт в невесомости, раскинув руки
				Object.assign(target, {armRx: Math.sin(t * 1.4) * 0.3, armRz: -1.1 + Math.sin(t * 1.6) * 0.18, armLx: -Math.sin(t * 1.4) * 0.3, armLz: 1.1 - Math.sin(t * 1.6) * 0.18, legR: Math.sin(t * 1.2) * 0.35, legL: -Math.sin(t * 1.2) * 0.35, tiltZ: Math.sin(t * 0.8) * 0.14 + clamp(-PB.vx * 0.0003, -0.3, 0.3)});
				if (P.holding) Object.assign(target, {armRx: -1.2, armRz: 0});
				break;
			case 'fly':
				// летит по делу: руки вперёд по ходу полёта, ноги вместе
				Object.assign(target, {armRx: -2.9 + Math.sin(t * 9) * 0.1, armRz: -0.12, armLx: -2.9 - Math.sin(t * 9) * 0.1, armLz: 0.12, legR: 0.25 + Math.sin(t * 10) * 0.2, legL: 0.25 - Math.sin(t * 10) * 0.2, tiltZ: clamp(-PB.vx * 0.0006, -0.5, 0.5)});
				if (P.holding) Object.assign(target, {armRx: -1.3, armRz: 0});
				break;
			case 'reach':
				// тянется сесть: ноги вперёд, руки к краю
				Object.assign(target, {armRx: -0.9, armLx: -0.9, armRz: 0.2, armLz: -0.2, legR: -1.0, legL: -1.0, headPitch: 0.45});
				break;
			case 'wave':
				Object.assign(target, {armRx: sway, armRz: -2.45 + Math.sin(idle * 15) * 0.35, armLx: -sway});
				break;
			case 'look':
				// ладонь ко лбу, смотрит по сторонам
				Object.assign(target, {armRx: -2.35, armRz: 0.55, armLx: -sway, headYaw: Math.sin(t * 1.7) * 0.9});
				break;
			case 'dance': {
				const d = danceTarget();
				snap = Boolean(d.snap);
				delete d.snap;
				Object.assign(target, d);
				break;
			}
			case 'rage':
				// позы злости уже плавные (ключевые кадры) — тело следует за ними без запаздывания
				Object.assign(target, rage ? rageAt(rage.t, t).pose : SIT_CALM);
				snap = true;
				break;
			case 'crouch':
				Object.assign(target, {armRx: 0.45 + sway, armLx: 0.45 - sway, sneak: 1, drop: 0.13});
				break;
			case 'sit':
				// сидит на краю, ноги свисают и болтаются
				Object.assign(target, {armRx: -0.35, armLx: -0.35, armRz: 0.12, armLz: -0.12, legR: -1.25 + Math.sin(t * 2.4) * 0.28, legL: -1.25 - Math.sin(t * 2.4) * 0.28, drop: 1.01});
				break;
			case 'sitHappy':
				// радуется: упёрся руками сзади, быстро болтает ногами и качает головой
				Object.assign(target, {armRx: 0.55, armLx: 0.55, armRz: 0.25, armLz: -0.25, legR: -1.3 + Math.sin(t * 7) * 0.5, legL: -1.3 - Math.sin(t * 7) * 0.5, drop: 1.01, headPitch: -0.15 + Math.sin(t * 3.5) * 0.1});
				break;
			case 'doze':
				// задремал сидя: голова клонится
				Object.assign(target, {armRx: -0.2, armLx: -0.2, legR: -1.3, legL: -1.3, drop: 1.01, headPitch: 0.55 + Math.sin(t * 1.3) * 0.12});
				break;
			case 'lie':
				Object.assign(target, {armRz: 0.08, armLz: -0.08, roll: PB.lieDir * (Math.PI / 2)});
				break;
			case 'sleep':
				Object.assign(target, {armRx: -0.2, armRz: 0.1, armLz: -0.1, legR: 0.15, legL: -0.1, roll: PB.lieDir * (Math.PI / 2), headPitch: 0.25});
				break;
			default: {
				// стоит: дышит и время от времени машет рукой
				const cycle = idle % 7;
				const waving = P.mode === 'idle' && !P.queue.length && !P.holding ? clamp(cycle / 0.25, 0, 1) * (1 - clamp((cycle - 1.5) / 0.3, 0, 1)) : 0;
				Object.assign(target, {armRx: P.holding ? CARRY : sway, armRz: lerp(0.04, -2.45 + Math.sin(idle * 15) * 0.35, waving), armLx: -sway});
			}
		}
		if (cheer > 0) Object.assign(target, {armRx: lerp(target.armRx, -2.9, cheer), armRz: lerp(target.armRz, -0.3, cheer), armLx: lerp(target.armLx, -2.9, cheer), armLz: lerp(target.armLz, 0.3, cheer), legR: cheer * 0.3, legL: -cheer * 0.3});
		const fast = state === 'mine' || state === 'wall';
		for (const key of Object.keys(pose)) pose[key] = lerp(pose[key], target[key], snap ? 1 - Math.exp(-dt * 40) : fast && key === 'armRx' ? 1 - Math.exp(-dt * 30) : k);
		p.armR.rotation.set(pose.armRx, 0, pose.armRz);
		p.armL.rotation.set(pose.armLx, 0, pose.armLz);
		p.legR.rotation.set(pose.legR, 0, pose.legRz);
		p.legL.rotation.set(pose.legL, 0, pose.legLz);
		p.body.scale.y = 1 + Math.sin(idle * 2) * 0.012;
		// присед: корпус наклоняется вперёд, плечи и голова уходят вперёд, бёдра назад
		const lean = 0.45 * pose.sneak;
		p.body.rotation.x = lean;
		p.head.position.set(0, 18 + 6 * Math.cos(lean), 6 * Math.sin(lean));
		p.armR.position.set(p.armR.position.x, 18 + 4 * Math.cos(lean), 4 * Math.sin(lean));
		p.armL.position.set(p.armL.position.x, 18 + 4 * Math.cos(lean), 4 * Math.sin(lean));
		p.legR.position.set(p.legR.position.x, 18 - 6 * Math.cos(lean), -6 * Math.sin(lean));
		p.legL.position.set(p.legL.position.x, 18 - 6 * Math.cos(lean), -6 * Math.sin(lean));
		R.pick.visible = P.holding;

		// голова следит за курсором (кроме дел, сна и осмотра по сторонам)
		p.head.getWorldPosition(headPos).project(cam);
		const lx = pointerVec ? clamp((pointerVec.x - headPos.x) * 1.4, -1, 1) : 0;
		const ly = pointerVec ? clamp((pointerVec.y - headPos.y) * 0.9, -0.5, 0.6) : cheer * 0.5;
		const lookK = 1 - Math.exp(-dt * 6);
		const busyHead = ['walk', 'mine', 'chest', 'lie', 'wall', 'sleep', 'doze'].includes(state);
		const ownHead = state === 'look' || state === 'dance' || state === 'rage'; // голова двигается сама: осматривается, качает в такт, злится
		look.yaw = lerp(look.yaw, busyHead ? 0 : ownHead ? pose.headYaw : lx, ownHead && snap ? 1 : lookK);
		look.pitch = lerp(look.pitch, busyHead || ownHead ? pose.headPitch : -ly + pose.sneak * 0.3 + pose.headPitch, lookK);
		// после сильного удара кружится голова
		const dizzy = P.mode === 'free' ? clamp(PB.dizzy, 0, 1) : 0;
		p.head.rotation.set(look.pitch + Math.cos(t * 11) * 0.25 * dizzy, look.yaw + Math.sin(t * 11) * 0.55 * dizzy, 0);
		return {jump, cheer};
	};

	// ================= ГЛАВНЫЙ ЦИКЛ =================
	let swayPhase = 0;
	let heroVisible = true;
	let portalHintAt = 9;
	let hopPx = 0;
	let closeup = null; // только для проверки: камера крупно у персонажа
	const pointerOverlay = new THREE.Vector2();
	const setGlobalCursor = (v) => {
		if (document.documentElement.style.cursor !== v) document.documentElement.style.cursor = v;
	};
	const setCursor = (value) => {
		if (zone.style.cursor !== value) zone.style.cursor = value;
	};

	const update = (dt) => {
		const idle = reducedMotion ? 0 : now;
		// портал: на пике вспышки мир меняется
		if (warp) {
			const k = now - warp.at;
			if (!warp.swapped && k >= 0.45) {
				warp.swapped = true;
				switchWorld(warp.to);
			}
			if (k >= 1.05) {
				canvas.parentElement.classList.remove('is-warping');
				warp = null;
			}
		}
		// завеса портала: переливается только та, что сейчас на экране
		if (frameNo % 6 === 0) (portalHere().kind === 'nether' ? paintPortal : paintVoid)(idle);
		const ph = portalHere();
		ph.sp.forEach((sp, i) => {
			sp.y += sp.v * dt;
			if (sp.y > ph.area.y1) sp.y = ph.area.y0;
			dummy.position.set(sp.x + Math.sin(idle * 2 + sp.ph) * 0.1, sp.y, sp.z);
			dummy.rotation.set(idle + sp.ph, idle * 0.7, 0);
			dummy.scale.setScalar(0.06 + 0.035 * Math.sin(idle * 5 + sp.ph));
			dummy.updateMatrix();
			ph.sparks.setMatrixAt(i, dummy.matrix);
		});
		ph.sparks.instanceMatrix.needsUpdate = true;
		// появление порталов в Энд: рамка растёт, глаза загораются, бездна разливается, столб света
		for (const p of portals) {
			if (p.appearAt < 0 || !p.parent.visible) continue;
			const t = now - p.appearAt;
			const t0 = surfaceStart(p);
			const g = (x, y, z) => world.worldToLocal(p.group.localToWorld(tmp.set(x, y, z)));
			if (p.fxStage === 0) {
				p.fxStage = 1;
				if (p.style === 'frame') for (const [i, j] of RING) spawnDebris(g((i - 2) * p.S, 0.1, (j - 2) * p.S), '#dedfa6', 2, 0.35, 0.8);
			}
			if (p.fxStage === 1 && p.style === 'frame' && t > 1.05) {
				p.fxStage = 2;
				for (const [i, j] of RING) spawnDebris(g((i - 2) * p.S, p.frameH + 0.1, (j - 2) * p.S), '#5dffb0', 1, 0.3, 0.6);
			}
			if (p.fxStage < 3 && t > t0) {
				p.fxStage = 3;
				for (let i = 0; i < 16; i++) spawnDebris(g(0, p.y + 0.1, 0), i % 2 ? '#9ff0d8' : '#c9a6ff', 1, 0.7, 0.7);
				const c = toPx(p.group.localToWorld(tmp.set(0, p.y, 0)));
				const r = canvas.getBoundingClientRect();
				flash(r.left + c.x, r.top + c.y);
			}
			if (t >= appearTime(p)) {
				p.appearAt = -1;
				p.animate(Infinity);
			} else p.animate(t);
		}
		worlds[worldId].tick?.(dt, idle);
		// захотел потанцевать: на острове, когда ничем не занят, раз в полминуты-минуту, 6–12 секунд
		const islandFree = P.mode === 'idle' && !P.queue.length && !P.holding && !warp;
		if (islandFree && heroVisible && now > dance.next && !dancingOnIsland()) {
			freshDance();
			dance.until = now + 6 + Math.random() * 6;
			dance.next = dance.until + 25 + Math.random() * 35;
			say('icon:note', 1.8);
		} else if (!islandFree && dancingOnIsland()) dance.until = -1; // занялся делом — танец закончился
		if (worldId === 'over' && !visitedNether && P.mode === 'idle' && !P.queue.length && heroVisible && now > portalHintAt) {
			// подсказка: что там, в портале?
			portalHintAt = now + 32 + Math.random() * 20;
			say('say.portal', 2.4);
		}
		world.position.y = Math.sin(idle * 0.8) * 0.18;
		// остров сам очень медленно качается на ±60°, мышь на это не влияет
		if (!reducedMotion) swayPhase += dt * SWAY_SPEED;
		island.rotation.y = Math.sin(swayPhase) * SWAY;
		disk.rotation.z = idle * 0.035; // галактика вращается
		// большая надпись плавно покачивается вверх-вниз
		bigGroup.position.set(bigBase.x, bigBase.y + Math.sin(idle * 0.9) * 0.3 * bigCell, bigBase.z);
		world.updateMatrixWorld(true);

		const homeWorld = island.localToWorld(tmp.copy(HOME).add(tmp2.set(0, BODY, 0)));
		playerK = focal / camera.position.distanceTo(homeWorld);

		if (P.mode !== 'free') stepIsland(dt);
		else stepFree(dt);

		// блоки острова: добытые исчезают и через 5 секунд вырастают снова
		const mining = P.mode === 'mine' ? P.queue[0]?.block : null;
		for (const b of activeBlocks) {
			let s = 1;
			if (b.minedAt >= 0) {
				const since = now - b.minedAt;
				if (since < BLOCK_RESPAWN) s = 0;
				else {
					s = easeOutBack((since - BLOCK_RESPAWN) / 0.5);
					if (since > BLOCK_RESPAWN + 0.5) {
						b.minedAt = -1;
						s = 1;
						activeBlocks.delete(b);
					}
				}
			} else if (b === mining) {
				s = 1 - 0.07 * Math.abs(Math.sin(P.actT * 25));
			} else if (!P.queue.some((a) => a.block === b)) {
				activeBlocks.delete(b);
			}
			setBlock(b, s);
		}
		for (const pl of plants) pl.mesh.visible = pl.block.scale > 0.6;
		for (const tr of torches) tr.halo.material.opacity = 0.6 + Math.sin(now * 13 + tr.group.position.x * 5) * 0.12;

		// скелет: на острове — в 3D-сцене, вне острова — на прослойке поверх сайта
		const islandHidden = islandTpAt > 0 && performance.now() < islandTpAt;
		if (islandTpAt && !islandHidden && P.mode !== 'free' && heroVisible) {
			islandTpAt = 0;
			tpHome = false;
			popAt = now;
			const c = toPx(rig.pivot.getWorldPosition(tmp));
			const r = canvas.getBoundingClientRect();
			flash(r.left + c.x, r.top + c.y);
			if (Math.random() < 0.5) say(oneOf('say.tp', 'icon:heart'), 1.4);
		}
		const pop = easeOutBack(clamp((now - popAt) / 0.28, 0, 1)) || 0.001;
		rig.pivot.visible = P.mode !== 'free' && !islandHidden && !(warp && !warp.swapped);
		oRig.pivot.visible = P.mode === 'free' && !tp;
		rig.pivot.scale.setScalar(P.mode !== 'free' ? Math.max(0.001, pop * (P.mode === 'portal' ? portalShrink : 1)) : 1);
		if (P.mode !== 'free') {
			const {jump} = animateRig(rig, dt, idle, camera, pointerInHero ? pointerNdc : null);
			rig.root.position.y = -BODY - pose.drop;
			rig.root.position.x = pose.hipX;
			const onGround = P.mode !== 'free';
			const hop = onGround ? Math.sin(jump * Math.PI) * 0.55 + (P.mode === 'walk' ? Math.abs(Math.sin(P.walkPhase)) * 0.06 : 0) : 0;
			rig.pivot.position.set(P.pos.x, BODY + hop, P.pos.z);
			rig.pivot.rotation.set(0, lerpAngle(rig.pivot.rotation.y, P.face, 1 - Math.exp(-dt * 10)), pose.roll + pose.tiltZ);
		} else {
			pointerOverlay.set(((pointerDoc.x - scrollX) / vw) * 2 - 1, -(((pointerDoc.y - scrollY) / vh) * 2 - 1));
			animateRig(oRig, dt, idle, oCam, pointerOverlay);
			const s = PLAYER_SCALE * playerK * pop;
			oRig.root.scale.setScalar(s);
			oRig.root.position.y = (-BODY - pose.drop) * playerK;
			oRig.root.position.x = pose.hipX * playerK;
			const centerAbove = PB.pose === 'lie' || PB.pose === 'sleep' ? 0.6 : BODY;
			const feetY = PB.y + PB.hh;
			hopPx = PB.hop > 0 ? Math.sin((1 - PB.hop / 0.42) * Math.PI) * 0.45 * playerK : 0; // подпрыгнул от тычка
			oRig.pivot.position.set(PB.x - scrollX, -(feetY - centerAbove * playerK - scrollY) + hopPx, 0);
			oRig.pivot.rotation.set(0.12, 0.2, pose.roll + pose.tiltZ + PB.spin);
			oRig.pivot.scale.setScalar(1);
			stepRage(dt);
		}
		if (rage && P.mode !== 'free') {
			// вернулся домой посреди сцены — убираем трещины и осколки, чтобы ничего не зависло
			for (const c of rage.cracks) fadeCrack(c, 600);
			endRage();
		}

		// облачко с эмоцией: над головой — и на острове, и в полёте
		const tb = now - talk.at;
		if (tb < talk.dur) {
			let bx = null;
			let by = 0;
			if (P.mode === 'free' && rage && rage.t > 0.75) bx = null;
			else if (P.mode === 'free') {
				bx = PB.x - scrollX;
				by = PB.y - PB.hh - scrollY - hopPx - 6;
			} else if (heroVisible) {
				const hp = toPx(rig.parts.head.localToWorld(tmp.set(0, 11, 0)));
				const r = canvas.getBoundingClientRect();
				bx = hp.x + r.left;
				by = hp.y + r.top - 4;
			}
			if (bx === null) bubble.style.opacity = '0';
			else {
				const sc = tb < 0.18 ? easeOutBack(tb / 0.18) : clamp((talk.dur - tb) / 0.18, 0, 1);
				bubble.style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(3)})`;
				bubble.style.opacity = '1';
			}
		} else if (bubble.style.opacity !== '0') bubble.style.opacity = '0';

		// курсор: прицел над тем, что можно сломать или добыть
		if (drag?.started) setGlobalCursor('grabbing');
		else if (hitFree()) setGlobalCursor('grab');
		else setGlobalCursor('');
		if (heroVisible && pointerInHero && !drag) {
			const hovered = pickVoxel();
			let cur = '';
			if (hovered) cur = CROSSHAIR;
			else if (pickPlayer()) cur = 'grab';
			else if (pickPortal()) cur = 'pointer';
			else if (!busy()) {
				const b = pickBlock();
				if (b && canReach(b, standFor(b))) cur = CROSSHAIR;
			}
			setCursor(cur);
			// блоки вокруг курсора приподнимаются бугорком
			for (const set of SETS) set.list.forEach((v) => (v.hoverTarget = hovered ? Math.max(0, 1 - Math.hypot(v.x - hovered.x, v.y - hovered.y) / 2.6) : 0));
		} else for (const set of SETS) set.list.forEach((v) => (v.hoverTarget = 0));

		// блик: раз в 5 секунд за 2,2 секунды пробегает по надписи слева направо, чуть наискосок
		const sweep = (idle % 5) / 2.2;
		const glintAt = sweep <= 1 && !reducedMotion ? sweep * 1.4 - 0.2 : null;

		// блоки надписей: своя волна, но не вращаются
		for (const set of SETS) {
			const {list, mesh, unit, z, amp, lift} = set;
			if (set.glint) {
				for (let i = 0; i < list.length; i++) {
					const v = list[i];
					const xn = (v.x + BIG.width / 2) / BIG.width + (v.y / BIG.height) * 0.16;
					const g = glintAt === null ? 0 : Math.exp(-((xn - glintAt) ** 2) / 0.0035);
					mesh.setColorAt(i, glintColor.copy(v.color).multiplyScalar(1 + g * 0.65));
				}
				mesh.instanceColor.needsUpdate = true;
			}
			for (let i = 0; i < list.length; i++) {
				const v = list[i];
				v.scale = voxelState(v, now);
				v.hover = lerp(v.hover, v.hoverTarget || 0, 1 - Math.exp(-dt * 14));
				const wave = Math.sin(idle * 1.6 + v.phase) * amp;
				dummy.position.set(v.x, v.y + wave, z + v.hover * lift);
				dummy.rotation.set(0, 0, 0);
				const sc = unit * v.scale * (1 + v.hover * 0.12);
				dummy.scale.set(sc, sc, sc * WORD_DEPTH);
				dummy.updateMatrix();
				mesh.setMatrixAt(i, dummy.matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;
			// границы для попадания курсором считаем по настоящим положениям блоков
			if (!set.bounded) {
				mesh.computeBoundingSphere();
				set.bounded = true;
			}
		}

		// осколки
		for (let i = 0; i < DEBRIS; i++) {
			const d = debris[i];
			if (d.life > 0) {
				d.life -= dt;
				d.vel.y -= 14 * dt;
				d.pos.addScaledVector(d.vel, dt);
				dummy.position.copy(d.pos);
				dummy.rotation.set(d.spin * d.life, d.spin * d.life * 0.7, 0);
				dummy.scale.setScalar(d.life > 0 ? d.size * Math.min(1, d.life * 3) : 0);
			} else dummy.scale.setScalar(0);
			dummy.updateMatrix();
			debrisMesh.setMatrixAt(i, dummy.matrix);
		}
		debrisMesh.instanceMatrix.needsUpdate = true;
	};

	const resize = () => {
		const r = canvas.getBoundingClientRect();
		// первый экран скрыт (на телефоне открыт другой раздел) — размеры не трогаем, иначе
		// летающий персонаж, которому масштаб берётся отсюда, становится крошечным
		if (r.width < 2 || r.height < 2) return;
		width = Math.max(1, r.width);
		height = Math.max(1, r.height);
		renderer.setPixelRatio(pixelRatio(width));
		renderer.setSize(width, height, false);
		frame();
		buildSky();
		measureChrome();
		widgetsAt = -1;
	};

	let last = performance.now();
	let frameNo = 0;
	const perf = {frames: 0, time: 0};
	// Телефон в покое рисует 30 кадров в секунду — вдвое меньше работы видеочипу и батарее.
	// Пока персонажа тянут или он летает по сайту — все 60, чтобы двигался плавно.
	const coarse = matchMedia('(pointer: coarse)').matches;
	let lastDraw = 0;
	const loop = (t) => {
		requestAnimationFrame(loop);
		if (coarse && !drag && P.mode !== 'free' && !warp && t - lastDraw < 30) return;
		lastDraw = t;
		const raw = (t - last) / 1000;
		const dt = Math.min(0.05, Math.max(0.001, raw));
		last = t;
		// пока персонаж летает по сайту, сцена считается, даже если первый экран прокручен
		if (!heroVisible && P.mode !== 'free') return;
		frameNo++;
		// первые ~3 секунды на экране меряем скорость: меньше 40 кадров в секунду — снижаем чёткость
		if (!slowDevice && heroVisible && perf.frames < 180 && raw < 0.5) {
			perf.frames++;
			perf.time += raw;
			if (perf.frames === 180 && perf.time / perf.frames > 0.025 && renderer.getPixelRatio() > 1) {
				slowDevice = true;
				resize();
				resizeOverlay();
			}
		}
		now += dt;
		update(dt);
		if (closeup) {
			// камера смотрит на персонажа спереди-сбоку
			const c = rig.pivot.getWorldPosition(new THREE.Vector3());
			const f = rig.pivot.getWorldDirection(new THREE.Vector3()).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), closeup.yaw);
			camera.position.copy(c).addScaledVector(f, closeup.dist).add(new THREE.Vector3(0, closeup.h, 0));
			camera.lookAt(c.x, c.y + 0.1, c.z);
			camera.updateMatrixWorld();
		}
		if (heroVisible) {
			renderer.render(scene, camera);
			if (frameNo % 2 === 0) drawSky(now); // звёзды двигаются медленно — хватает 30 кадров в секунду
		}
		if (r2 && P.mode === 'free') {
			r2.render(oScene, oCam);
			if (rage?.front) drawFront(); // сразу после кадра — пока буфер WebGL ещё не очищен
		}
		else if (r2 && overlay.classList.contains('is-on')) overlay.classList.remove('is-on');
	};

	new ResizeObserver(resize).observe(canvas);
	resize();
	new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(canvas);
	document.addEventListener('visibilitychange', () => (last = performance.now()));
	requestAnimationFrame(loop);

	// Для проверки сайта (адрес с ?debug)
	const page = (pt) => {
		const r = canvas.getBoundingClientRect();
		return {x: r.left + pt.x, y: r.top + pt.y};
	};
	return {
		tier: () => TIERS[progress.tier].id,
		world: () => worldId,
		debug: {
			portal: () => {
				enterPortal();
				return worldId;
			},
			portalPx: () => {
				const c = portalCenterDoc();
				return {x: c.x - scrollX, y: c.y - scrollY};
			},
			progress: () => ({...progress}),
			frames: () => frameNo,
			pick: (x, y) => {
				updatePointer(x, y);
				return {voxel: !!pickVoxel(), player: pickPlayer(), portal: pickPortal(), busy: busy(), mode: P.mode, warp: !!warp};
			},
			blockPx: (type) => {
				const b = worlds[worldId].blocks.find((x) => x.type === type && x.minedAt < 0 && canReach(x, standFor(x)) && (() => {
					const w = island.localToWorld(tmp.copy(x.pos));
					const toCam = camera.position.clone().sub(w).normalize();
					return toCam.z > 0.3 && w.z > 0.5;
				})());
				return b ? page(toPx(island.localToWorld(tmp.copy(b.pos)))) : null;
			},
			player: () => (P.mode === 'free' ? {x: PB.x - scrollX, y: PB.y - scrollY} : page(toPx(rig.pivot.getWorldPosition(new THREE.Vector3())))),
			state: () => ({mode: P.mode, queue: P.queue.map((a) => a.type), holding: P.holding, tier: progress.tier, torches: progress.torches, pose: PB.pose, perch: PB.perch ? PB.perch.el.className || PB.perch.el.tagName : null, seek: !!PB.seek, pos: P.pos.toArray().map((v) => +v.toFixed(2)), free: freeWorld, sway: +island.rotation.y.toFixed(2), speed: Math.round(Math.hypot(PB.vx, PB.vy)), spin: +PB.spin.toFixed(2), docY: Math.round(PB.y), say: now - talk.at < talk.dur ? bubble.textContent || 'icon' : ''}),
			closeup: (on, yaw = 0.6, dist = 4.2, h = 0.5) => {
				closeup = on ? {yaw, dist, h} : null;
				if (!on) frame();
			},
			chest: () => {
				// только сходить к сундуку за киркой и обратно
				if (busy() || P.mode === 'free') return false;
				P.queue = [walkTo(CHEST_SPOT), {type: 'chest', take: true}, {type: 'chest', take: false}, walkTo(HOME)];
				return true;
			},
			idle: (sec) => (PB.idleT = sec),
			rage: (kind) => {
				if (P.mode !== 'free') return false;
				startRage(kind);
				return true;
			},
			rageT: () => (rage ? +rage.t.toFixed(2) : null),
			ragePlan: () => (rage ? {hits: rage.plan.hits.map((h) => ({t: +h.t.toFixed(2), kind: h.kind, stage: h.stage})), events: rage.plan.events, end: +rage.plan.end.toFixed(2)} : null),
			dance: (sec = 8) => {
				freshDance();
				dance.until = now + sec;
				return true;
			},
			word: () => {
				const c = page(toPx(bigGroup.localToWorld(new THREE.Vector3(0, 0, 0))));
				return {blocks: bigVoxels.length, width: BIG.width, height: BIG.height, cell: +bigCell.toFixed(3), center: {x: Math.round(c.x), y: Math.round(c.y)}, broken: bigVoxels.filter((v) => v.brokenAt >= 0).length};
			},
			// снять с острова и отпустить парить; открыть весь сайт, как после поломки стены
			takeOff: () => {
				if (P.mode !== 'free') leaveIsland();
				PB.held = false;
				setPose('float');
				if (!r2) P.mode = 'idle';
				return P.mode === 'free';
			},
			unlockWorld: () => {
				if (!freeWorld) shatterWall();
				freeWorld = true;
			},
			tp: () => ({tp: !!tp, tpHome, islandTpAt: islandTpAt > 0, visible: P.mode === 'free' ? oRig.pivot.visible : rig.pivot.visible, k: +playerK.toFixed(1)}),
			mine: (type) => {
				const b = worlds[worldId].blocks.find((x) => x.type === type && x.minedAt < 0 && canReach(x, standFor(x)));
				if (b) startMining(b);
				return !!b;
			},
			setTier: (t) => {
				progress.tier = t;
				paintPickaxe();
				saveProgress(progress);
			},
			widgets: () => collectWidgets().map((w) => ({el: (w.el.className || w.el.tagName || '').toString().slice(0, 30), left: w.left - scrollX, top: w.top - scrollY, w: w.right - w.left})),
		},
	};
};
