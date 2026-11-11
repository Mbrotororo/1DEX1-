// 3D-сцена первого экрана.
// - Остров очень медленно поворачивается сам, персонаж стоит на нём и поворачивается вместе с ним.
// - Клик по блоку острова: персонаж идёт к сундуку, достаёт кирку, добывает блок, если дотянется,
//   кладёт кирку обратно. Кирка растёт: камень — каменная, железо — железная, алмаз — алмазная.
//   Уголь зажигает факелы на дереве. Добытый блок вырастает через 5 секунд.
// - Персонажа можно снять с острова: он летает в невесомости поверх сайта, сам садится на текст
//   и кнопки, летит за посетителем, когда тот листает страницу, и показывает эмоции в облачке.
//   Его можно отлепить и плавно бросить. Сверху на острове — спрыгивает на траву.
// - С алмазной киркой он ломает стену (бегущую строку) и может летать по всему сайту.
// - Посередине экрана — большая надпись «1DEX1 SHOP» из салатовых блоков, остров справа.
//   Над островом — «ЖИЗНЬ 1DEX1». Блоки обеих надписей ломаются кликом и вырастают снова.
// - Сзади галактика, а звёзды по всему фону медленно вращаются вокруг её ядра.
import * as THREE from '../vendor/three.module.min.js';
import {CROSSHAIR, icon, wordPixels} from './pixel.js';

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
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
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
	{id: 'wood', name: 'деревянная', head: '#9c7440', hi: '#c69a5c'},
	{id: 'stone', name: 'каменная', head: '#76767c', hi: '#a9a9b0'},
	{id: 'iron', name: 'железная', head: '#cfcfd6', hi: '#ffffff'},
	{id: 'diamond', name: 'алмазная', head: '#26cfc0', hi: '#a6fff2'},
];
// какую кирку нужно иметь, чтобы добыть блок, и что даёт добыча
const NEED = {iron: 1, gold: 2, diamond: 2};
const UPGRADE = {stone: 1, iron: 2, diamond: 3};

// ---------- константы сцены ----------
const VOXEL = 0.27; // размер блока названия
const WORD_Y = 7.3; // название висит над деревом и не крутится вместе с островом
// Название из двух строк одного размера: «ЖИЗНЬ» белыми блоками сверху, «1DEX1» салатовыми снизу
const TITLE = [
	{text: 'ЖИЗНЬ', line: 1, top: '#ffffff', bottom: '#f1eefa'},
	{text: '1DEX1', line: 0, top: '#d2ff70', bottom: '#98e024'},
];
const LINE_GAP = 2; // пустых клеток между строками
const TITLE_TOP = WORD_Y + (7 * 2 + LINE_GAP) * VOXEL;
const WORD_DEPTH = 1.8;
const RESPAWN = 3; // блок названия вырастает через 3 секунды
const APPEAR = 0.7;
const BLOCK_RESPAWN = 5; // блок острова вырастает через 5 секунд
const SWAY = Math.PI / 3; // остров поворачивается на 60° в каждую сторону
const SWAY_SPEED = 0.045; // очень медленно: полный круг туда и обратно — около двух минут
const HOME = new THREE.Vector3(0, 0, 0.6); // где стоит персонаж (на острове)
const BODY = 1.35; // центр тела над ногами
const STAND_R = 3.0; // по какому кругу на верхушке острова можно ходить
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
		return {tier: clamp(p.tier | 0, 0, 3), torches: clamp(p.torches | 0, 0, 4)};
	} catch {
		return {tier: 0, torches: 0};
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

	scene.add(new THREE.AmbientLight(0xbfb4ff, 1.25));
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

	// Дуб, как в Minecraft: ствол из пяти брёвен, два широких слоя листвы,
	// слой поуже и «крестик» на макушке. Нижние листья выше головы персонажа.
	const TREE = {x: -1, z: -2};
	for (let y = 0; y < 5; y++) addBlock('log', TREE.x, y + 0.5, TREE.z);
	const leaf = (dx, y, dz) => addBlock('leaves', TREE.x + dx, y, TREE.z + dz);
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
		{x: 2, z: -2},
		{x: 3, z: -1},
	];
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
	const BLOCK_COLOR = {grass: '#5fae3f', dirt: '#7d5a3e', stone: '#7c7888', coal: '#38363f', iron: '#c9a585', gold: '#ffc83d', diamond: '#3fe6d8', amethystOre: '#9a6bff', log: '#6a4a2a', leaves: '#3e842c'};

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
	const OBSTACLES = [{x: TREE.x, z: TREE.z, r: 0.8}, {x: CHEST.x, z: CHEST.z, r: 0.85}, ...BUSHES.map((b) => ({x: b.x, z: b.z, r: 0.75}))];

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

	// mode: idle | walk | chest | mine | land — на острове; free — снят с острова и летает по сайту
	const P = {mode: 'idle', pos: HOME.clone(), face: 0.15, path: [], queue: [], actT: 0, walkPhase: 0, holding: false, landT: 0};

	// ================= НАЗВАНИЕ «ЖИЗНЬ 1DEX1» ИЗ БЛОКОВ =================
	const voxels = [];
	let titleW = 0;
	for (const t of TITLE) {
		const word = wordPixels(t.text);
		titleW = Math.max(titleW, word.width);
		const top = new THREE.Color(t.top);
		const bottom = new THREE.Color(t.bottom);
		const baseY = WORD_Y + t.line * (7 + LINE_GAP) * VOXEL;
		for (const p of word.pixels) {
			voxels.push({x: (p.x - word.width / 2 + 0.5) * VOXEL, y: baseY + (p.y + 0.5) * VOXEL, color: top.clone().lerp(bottom, p.row / 6), phase: p.x * 0.35 + t.line * 1.4, hover: 0, brokenAt: -1, scale: 1});
		}
	}
	// лёгкое собственное свечение, чтобы белый был белым, а салатовый — ярким под фиолетовым светом сцены
	const wordMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel, emissive: '#2a2a2a'}), voxels.length);
	voxels.forEach((v, i) => wordMesh.setColorAt(i, v.color));
	wordMesh.instanceColor.needsUpdate = true;
	wordMesh.frustumCulled = false;
	world.add(wordMesh);

	// ================= БОЛЬШАЯ НАДПИСЬ «1DEX1 SHOP» ПОСЕРЕДИНЕ =================
	// Висит перед камерой, поэтому всегда в одном месте экрана: на компьютере — посередине
	// слева от острова, на телефоне — сверху. Чуть наклонена, чтобы были видны верх и бока блоков.
	const BIG = wordPixels('1DEX1 SHOP');
	const bigGroup = new THREE.Group();
	camera.add(bigGroup);
	scene.add(camera);
	const bigTop = new THREE.Color('#ccff5c');
	const bigBottom = new THREE.Color('#62b20c');
	const bigVoxels = BIG.pixels.map((p) => ({x: p.x - BIG.width / 2 + 0.5, y: p.y - 3, color: bigTop.clone().lerp(bigBottom, p.row / 6), phase: p.x * 0.28, hover: 0, brokenAt: -1, scale: 1}));
	const bigMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel, emissive: '#1f2b0e'}), bigVoxels.length);
	bigVoxels.forEach((v, i) => bigMesh.setColorAt(i, v.color));
	bigMesh.instanceColor.needsUpdate = true;
	bigMesh.frustumCulled = false;
	bigGroup.add(bigMesh);
	let bigCell = 0.3; // размер блока большой надписи в единицах мира (считается в frame)

	// Все ломающиеся надписи: unit — размер блока, z — глубина, amp — волна, lift — выезд под курсором
	const SETS = [
		{mesh: wordMesh, list: voxels, unit: VOXEL, z: -1, amp: 0.07, lift: 0.32},
		{mesh: bigMesh, list: bigVoxels, unit: 1, z: 0, amp: 0.22, lift: 0.9},
	];

	// ================= ОСКОЛКИ =================
	const DEBRIS = 140;
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
	const BOX = {w: 11.5, h: 18.4, cy: 2.95}; // от низа острова до верха названия
	const viewDir = new THREE.Vector3(0.2, 0.2, 1).normalize();
	let width = 1;
	let height = 1;
	let focal = 600;

	const frame = () => {
		const wide = width >= 900;
		// остров: на компьютере справа, на телефоне под большой надписью
		const rect = wide ? {x0: 0.63, x1: 0.985, y0: 0.07, y1: 0.97} : {x0: 0.04, x1: 0.96, y0: 0.22, y1: 0.995};
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
		const L = wide ? {cx: 0.36, cy: 0.42, w: 0.5} : {cx: 0.5, cy: 0.11, w: 0.86};
		const d = dist * 0.8;
		const viewH = 2 * d * tan;
		const viewW = viewH * aspect;
		bigCell = Math.min((L.w * viewW) / BIG.width, (0.2 * viewH) / 7);
		bigGroup.position.set((L.cx - 0.5) * viewW, (0.5 - L.cy) * viewH, -d);
		bigGroup.scale.setScalar(bigCell);
		bigGroup.rotation.set(0.32, -0.08, 0);
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
			g.fillStyle = SKY_COLORS[k];
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
	// блок любой из надписей под курсором: {set, i} или null
	const pickVoxel = () => {
		castRay();
		for (const set of SETS) {
			const hit = raycaster.intersectObject(set.mesh, false)[0];
			if (hit && set.list[hit.instanceId].brokenAt < 0) return {set, i: hit.instanceId};
		}
		return null;
	};
	const pickPlayer = () => {
		if (P.mode === 'free') return false;
		castRay();
		return raycaster.intersectObject(rig.root, true).length > 0;
	};
	const pickBlock = () => {
		castRay();
		const hit = raycaster.intersectObjects(islandMeshes, false)[0];
		if (!hit) return null;
		const b = hit.object.userData.blocks[hit.instanceId];
		return b && b.minedAt < 0 ? b : null;
	};
	const busy = () => P.mode !== 'idle' || P.queue.length > 0;

	let now = 0;
	let jumpAt = -10;
	let broken = 0;
	let tickles = 0;

	const breakVoxel = ({set, i}) => {
		const v = set.list[i];
		v.brokenAt = now;
		v.hover = 0;
		broken++;
		if (P.mode === 'idle') jumpAt = now;
		const big = set.mesh === bigMesh;
		const at = big ? world.worldToLocal(bigGroup.localToWorld(tmp.set(v.x, v.y, 0))) : tmp.set(v.x, v.y, -1);
		spawnDebris(at, `#${v.color.getHexString()}`, big ? 12 : 9, 1, big ? (bigCell / VOXEL) * 0.8 : 0.7);
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
		if (progress.tier < need) return warn('need', TIERS[need].name);
		// сходить к сундуку за киркой, добыть блок, вернуть кирку, вернуться домой
		P.queue = [walkTo(CHEST_SPOT), {type: 'chest', take: true}, walkTo(stand), {type: 'mine', block: b}, walkTo(CHEST_SPOT), {type: 'chest', take: false}, walkTo(HOME)];
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
			on('tier', TIERS[up].name);
			say(up === 3 ? 'Алмазная!' : 'Ура!', 1.6);
			if (up === 3) on('diamond');
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
	const POSE_BOX = {stand: TALL, wave: TALL, look: TALL, dance: TALL, float: WIDE, held: WIDE, reach: WIDE, fly: WIDE, wall: WIDE, crouch: [0.42, 1.25], sit: SIT, sitHappy: SIT, doze: SIT, lie: FLAT, sleep: FLAT};
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

	// --- облачко с эмоцией над головой ---
	const bubble = document.createElement('div');
	bubble.className = 'dex-bubble';
	bubble.setAttribute('aria-hidden', 'true');
	document.body.append(bubble);
	const talk = {at: -99, dur: 0};
	const say = (what, dur = 1.7) => {
		if (what.startsWith('icon:')) bubble.innerHTML = icon(what.slice(5));
		else bubble.textContent = what;
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
		['.social', false],
		['.social .btn', false],
		['.foot__word', false],
		['.foot__links a', false],
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
		// название «ЖИЗНЬ 1DEX1» из блоков тоже подходит (садится на верхнюю строку)
		const o = docOffset();
		const pts = [];
		for (const x of [-titleW * VOXEL * 0.5, titleW * VOXEL * 0.5]) for (const y of [WORD_Y + 0.1, TITLE_TOP]) pts.push(toPx(world.localToWorld(tmp.set(x, y, -1))));
		out.push({el: wordMesh, left: Math.min(...pts.map((p) => p.x)) + o.x, right: Math.max(...pts.map((p) => p.x)) + o.x, top: Math.min(...pts.map((p) => p.y)) + o.y, bottom: Math.max(...pts.map((p) => p.y)) + o.y});
		// и большая «1DEX1 SHOP»
		const big = [];
		for (const x of [-BIG.width / 2, BIG.width / 2]) for (const y of [-3.5, 3.5]) big.push(toPx(bigGroup.localToWorld(tmp.set(x, y, 0))));
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
		if (Math.random() < 0.5) say(oneOf('Дома!', 'icon:heart'), 1.5);
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
			if (progress.tier < 3) return warn('wallNeed', TIERS[progress.tier].name);
			if (P.mode === 'free') {
				// уже летает — летит к стене сразу, даже если сидел на виджете
				PB.held = false;
				PB.perch = null;
				PB.seek = null;
				setPose('fly');
				PB.auto = {x: e.clientX + scrollX, y: wall.getBoundingClientRect().top + scrollY - PB.hh - 4, then: 'wall'};
				P.holding = true;
				say('Ломаю!', 1.4);
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
	const hitFree = () => P.mode === 'free' && Math.abs(pointerDoc.x - PB.x) < PB.hw + 8 && Math.abs(pointerDoc.y - PB.y) < PB.hh + 8;
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
		if (Math.random() < 0.45) say(oneOf('Эй!', '!', 'Ой!'), 1.1);
		on('drag');
	};
	// отпустили: если рука двигалась — летит с той же скоростью и плавно тормозит
	const release = (t1) => {
		PB.held = false;
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
			say(oneOf('Уиии!', 'Йо-хо!', 'Лечу!'), 1.4);
		}
	};
	// просто ткнули в персонажа
	const poke = () => {
		PB.idleT = 0;
		if (++tickles === 5) on('tickle');
		if (PB.perch) {
			PB.hop = 0.42;
			if (PB.pose === 'sleep' || PB.pose === 'doze') {
				say('!', 1);
				setPose('sit', 5);
				return;
			}
			const r = Math.random();
			if (r < 0.34) say('Хи-хи', 1.3);
			else if (r < 0.67) {
				say('icon:heart', 1.6);
				setPose('wave', 2.2);
			} else say('!', 1);
		} else {
			PB.spinV = (Math.random() < 0.5 ? -1 : 1) * 8;
			say(oneOf('Уиии!', 'Хи-хи'), 1.3);
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
			if (Math.random() < 0.6) say(oneOf('Хи-хи', 'icon:heart', 'Привет!'), 1.4);
		} else {
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
					P.mode = 'idle';
					P.queue.shift();
				}
				break;
			}
			case 'idle':
				if (!P.queue.length) P.face = 0.15;
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
		if (!widgetsAt || now - widgetsAt > 0.25) {
			widgets = collectWidgets();
			widgetsAt = now;
		}
		fitPoseBox();
		const B = bounds();
		const band = visibleBand(B);
		const islandPoly = islandPolyDoc();
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
			// поднесли к острову — сам спрыгивает на траву
			if (PB.clearOfIsland && islandGap !== null && islandGap < 16 && islandGap > -PB.hh) {
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
				say('Свобода!', 1.8);
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
					if (Math.random() < 0.6) say(oneOf('Подожди!', 'Я с тобой!', 'Лечу!'), 1.5);
				} else {
					PB.poseT += dt;
					const near = Math.hypot(pointerDoc.x - PB.x, pointerDoc.y - PB.y) < 170;
					if (PB.pose === 'sleep' || PB.pose === 'doze') {
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
						say('Привет!', 1.6);
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
				if (PB.seek && Math.random() < 0.3) say(oneOf('!', 'Сяду тут'), 1.3);
			}
			PB.x += PB.vx * dt;
			PB.y += PB.vy * dt;
			setPose(following && Math.abs(PB.vy) > 260 ? 'fly' : 'float');
		}

		// остров: сверху — спрыгивает на траву, в бок — не пускает
		if (!PB.perch && P.mode === 'free') {
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
				say('Ой!', 1.1);
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
	const pose = {armRx: 0, armRz: 0, armLx: 0, armLz: 0, legR: 0, legL: 0, sneak: 0, drop: 0, roll: 0, tiltZ: 0, headPitch: 0, headYaw: 0};
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
		const target = {armRx: 0, armRz: 0.04, armLx: 0, armLz: -0.04, legR: 0, legL: 0, sneak: 0, drop: 0, roll: 0, tiltZ: 0, headPitch: 0, headYaw: 0};
		const sway = Math.sin(idle * 2) * 0.05;
		const state = P.mode === 'free' ? PB.pose : P.mode;
		const swing = (period) => {
			const ph = (P.actT / period) % 1;
			return ph < 0.45 ? -2.3 : -0.5;
		};
		switch (state) {
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
				const b = Math.sin(t * 7);
				Object.assign(target, {armRx: -1.5 + b * 1.1, armLx: -1.5 - b * 1.1, armRz: 0.2, armLz: -0.2, legR: b * 0.3, legL: -b * 0.3, drop: -Math.abs(b) * 0.12, tiltZ: Math.sin(t * 3.5) * 0.16});
				break;
			}
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
		for (const key of Object.keys(pose)) pose[key] = lerp(pose[key], target[key], fast && key === 'armRx' ? 1 - Math.exp(-dt * 30) : k);
		p.armR.rotation.set(pose.armRx, 0, pose.armRz);
		p.armL.rotation.set(pose.armLx, 0, pose.armLz);
		p.legR.rotation.x = pose.legR;
		p.legL.rotation.x = pose.legL;
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
		look.yaw = lerp(look.yaw, busyHead ? 0 : state === 'look' ? pose.headYaw : lx, lookK);
		look.pitch = lerp(look.pitch, busyHead || state === 'look' ? pose.headPitch : -ly + pose.sneak * 0.3 + pose.headPitch, lookK);
		// после сильного удара кружится голова
		const dizzy = P.mode === 'free' ? clamp(PB.dizzy, 0, 1) : 0;
		p.head.rotation.set(look.pitch + Math.cos(t * 11) * 0.25 * dizzy, look.yaw + Math.sin(t * 11) * 0.55 * dizzy, 0);
		return {jump, cheer};
	};

	// ================= ГЛАВНЫЙ ЦИКЛ =================
	let swayPhase = 0;
	let heroVisible = true;
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
		world.position.y = Math.sin(idle * 0.8) * 0.18;
		// остров сам очень медленно качается на ±60°, мышь на это не влияет
		if (!reducedMotion) swayPhase += dt * SWAY_SPEED;
		island.rotation.y = Math.sin(swayPhase) * SWAY;
		disk.rotation.z = idle * 0.035; // галактика вращается
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
		rig.pivot.visible = P.mode !== 'free';
		oRig.pivot.visible = P.mode === 'free';
		if (P.mode !== 'free') {
			const {jump} = animateRig(rig, dt, idle, camera, pointerInHero ? pointerNdc : null);
			rig.root.position.y = -BODY - pose.drop;
			const onGround = P.mode !== 'free';
			const hop = onGround ? Math.sin(jump * Math.PI) * 0.55 + (P.mode === 'walk' ? Math.abs(Math.sin(P.walkPhase)) * 0.06 : 0) : 0;
			rig.pivot.position.set(P.pos.x, BODY + hop, P.pos.z);
			rig.pivot.rotation.set(0, lerpAngle(rig.pivot.rotation.y, P.face, 1 - Math.exp(-dt * 10)), pose.roll + pose.tiltZ);
		} else {
			pointerOverlay.set(((pointerDoc.x - scrollX) / vw) * 2 - 1, -(((pointerDoc.y - scrollY) / vh) * 2 - 1));
			animateRig(oRig, dt, idle, oCam, pointerOverlay);
			const s = PLAYER_SCALE * playerK;
			oRig.root.scale.setScalar(s);
			oRig.root.position.y = (-BODY - pose.drop) * playerK;
			const centerAbove = PB.pose === 'lie' || PB.pose === 'sleep' ? 0.6 : BODY;
			const feetY = PB.y + PB.hh;
			hopPx = PB.hop > 0 ? Math.sin((1 - PB.hop / 0.42) * Math.PI) * 0.45 * playerK : 0; // подпрыгнул от тычка
			oRig.pivot.position.set(PB.x - scrollX, -(feetY - centerAbove * playerK - scrollY) + hopPx, 0);
			oRig.pivot.rotation.set(0.12, 0.2, pose.roll + pose.tiltZ + PB.spin);
		}

		// облачко с эмоцией: над головой — и на острове, и в полёте
		const tb = now - talk.at;
		if (tb < talk.dur) {
			let bx = null;
			let by = 0;
			if (P.mode === 'free') {
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
			else if (!busy()) {
				const b = pickBlock();
				if (b && canReach(b, standFor(b))) cur = CROSSHAIR;
			}
			setCursor(cur);
			for (const set of SETS) set.list.forEach((v, i) => (v.hoverTarget = hovered && hovered.set === set && hovered.i === i ? 1 : 0));
		} else for (const set of SETS) set.list.forEach((v) => (v.hoverTarget = 0));

		// блоки надписей: своя волна, но не вращаются
		for (const set of SETS) {
			const {list, mesh, unit, z, amp, lift} = set;
			for (let i = 0; i < list.length; i++) {
				const v = list[i];
				if (v.brokenAt >= 0) {
					const since = now - v.brokenAt;
					if (since > RESPAWN + APPEAR) v.brokenAt = -1;
					v.scale = since < RESPAWN ? 0 : easeOutCubic((since - RESPAWN) / APPEAR);
				} else v.scale = 1;
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
	const loop = (t) => {
		requestAnimationFrame(loop);
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
		if (r2 && P.mode === 'free') r2.render(oScene, oCam);
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
		tier: () => TIERS[progress.tier].name,
		debug: {
			blockPx: (type) => {
				const b = blocks.find((x) => x.type === type && x.minedAt < 0 && canReach(x, standFor(x)) && (() => {
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
			mine: (type) => {
				const b = blocks.find((x) => x.type === type && x.minedAt < 0 && canReach(x, standFor(x)));
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
