// 3D-сцена первого экрана.
// - Остров плавно поворачивается на 90° в каждую сторону (всего 180°).
// - Клик по блоку острова: персонаж подходит и добывает его, через 5 секунд блок вырастает.
// - Кубики и персонаж подчиняются гравитации и имеют твёрдые невидимые хитбоксы:
//   не проходят сквозь друг друга, остров, название и кнопки, стоят на них.
// - Персонажа можно схватить и унести. Поставленный на кнопку или текст,
//   он стоит, машет, приседает, сидит со свисающими ногами или ложится.
//   Поставленный на остров — спрыгивает на верх и идёт на своё место.
// - Блоки названия 1DEX1 ломаются кликом и через 3 секунды вырастают снова.
import * as THREE from '../vendor/three.module.min.js';
import {CROSSHAIR, wordPixels} from './pixel.js';

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
		chestSide: pixelTexture((x, y) => {
			if (x === 0 || x === 15 || y === 0 || y === 15) return [44, 26, 92];
			if (y === 5) return [34, 20, 70];
			const v = n(x, y, 3);
			return shade([122, 82, 214], v < 0.2 ? 0.86 : v > 0.85 ? 1.1 : 1);
		}),
		chestFront: pixelTexture((x, y) => {
			if (x === 0 || x === 15 || y === 0 || y === 15) return [44, 26, 92];
			if (x >= 6 && x <= 9 && y >= 3 && y <= 8) return x === 6 || x === 9 || y === 3 || y === 8 ? [179, 125, 0] : [255, 200, 61];
			if (y === 5) return [34, 20, 70];
			const v = n(x, y, 4);
			return shade([122, 82, 214], v < 0.2 ? 0.86 : v > 0.85 ? 1.1 : 1);
		}),
		chestTop: pixelTexture((x, y) => {
			if (x === 0 || x === 15 || y === 0 || y === 15) return [44, 26, 92];
			const v = n(x, y, 5);
			return shade([138, 96, 232], v < 0.2 ? 0.88 : v > 0.85 ? 1.1 : 1);
		}),
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

// ---------- константы сцены ----------
const VOXEL = 0.44;
const WORD_Y = 4.4;
const WORD_DEPTH = 1.8; // буквы толще одного блока, чтобы был виден объём
const RESPAWN = 3; // блок названия вырастает через 3 секунды
const APPEAR = 0.7;
const BLOCK_RESPAWN = 5; // блок острова вырастает через 5 секунд
const SWAY = Math.PI / 2; // остров поворачивается на 90° в каждую сторону
const SWAY_SPEED = 0.26; // полный цикл туда-обратно — около 24 секунд
const HOME = new THREE.Vector3(0, 0, 0.4); // где стоит персонаж
const BODY = 1.35; // центр тела над ногами
const ISLAND_R = 3.4; // радиус верхушки острова, по которой можно ходить
const PLAYER_SCALE = 2.7 / 32;
const MINE_TIME = 1.1;
const KNOCK = 520; // скорость, с которой кубик отлетает от острова, px/s

// on(событие): 'break' — сломан блок названия, 'mine' — добыт блок острова,
// 'drag' — перенесён кубик, 'treasure' — кубик спрятан в сундук, 'tickle' — пять кликов по скину
export const initHero = (canvas, {on = () => {}, reducedMotion = false} = {}) => {
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'});
	} catch (err) {
		return null;
	}
	renderer.toneMapping = THREE.NoToneMapping;
	renderer.setClearColor(0x000000, 0);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
	const tex = makeTextures();

	scene.add(new THREE.AmbientLight(0xbfb4ff, 1.25));
	const key = new THREE.DirectionalLight(0xffffff, 2.6);
	key.position.set(-4, 8, 5);
	scene.add(key);
	const rim = new THREE.DirectionalLight(0x9a6bff, 1.6);
	rim.position.set(5, 2, -6);
	scene.add(rim);

	// world наклоняется за курсором; island внутри него поворачивается
	const world = new THREE.Group();
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
	// слои сверху вниз: трава, земля, камень с рудами; книзу остров сужается
	const radii = [3.75, 3.3, 2.75, 2.15, 1.5, 0.85];
	radii.forEach((radius, layer) => {
		for (let x = -4; x <= 4; x++) {
			for (let z = -4; z <= 4; z++) {
				const d = Math.hypot(x, z) + (rand() - 0.5) * 0.7;
				if (d > radius) continue;
				let type = layer === 0 ? 'grass' : layer === 1 ? 'dirt' : layer === 2 ? (rand() < 0.55 ? 'dirt' : 'stone') : 'stone';
				if (type === 'stone') {
					const o = rand();
					if (o < 0.08) type = 'coal';
					else if (o < 0.13) type = 'iron';
					else if (o < 0.16 && layer >= 3) type = 'gold';
					else if (o < 0.19 && layer >= 4) type = 'amethystOre';
				}
				addBlock(type, x, -layer - 0.5, z);
			}
		}
	});

	// дуб: ствол из трёх брёвен и крона из двух слоёв листвы (как в Minecraft).
	// Стоит у дальнего края: остров поворачивается только на 180°, поэтому дерево
	// никогда не закрывает персонажа и не залезает в название.
	const TREE = {x: -1, z: -3};
	for (let y = 0; y < 3; y++) addBlock('log', TREE.x, y + 0.5, TREE.z);
	for (let dx = -2; dx <= 2; dx++) {
		for (let dz = -2; dz <= 2; dz++) {
			if (dx === 0 && dz === 0) continue;
			if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // скруглённые углы
			if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && rand() < 0.18) continue;
			addBlock('leaves', TREE.x + dx, 2.5, TREE.z + dz);
		}
	}
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && rand() < 0.5) continue;
			addBlock('leaves', TREE.x + dx, 3.5, TREE.z + dz);
		}
	}
	// куст из листвы
	addBlock('leaves', 2, 0.5, -2);
	addBlock('leaves', 3, 0.5, -1);

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
		amethystOre: lambert(tex.amethystOre),
		log: [logSide, logSide, logTop, logTop, logSide, logSide],
		leaves: lambert(tex.leaves),
	};
	// цвет осколков при добыче
	const BLOCK_COLOR = {
		grass: '#5fae3f',
		dirt: '#7d5a3e',
		stone: '#7c7888',
		coal: '#38363f',
		iron: '#c9a585',
		gold: '#ffc83d',
		amethystOre: '#9a6bff',
		log: '#6a4a2a',
		leaves: '#3e842c',
	};

	const setBlock = (b, s) => {
		b.scale = s;
		dummy.position.copy(b.pos);
		dummy.rotation.set(0, 0, 0);
		// совсем 0 нельзя: у луча-указателя ломается математика попадания
		dummy.scale.setScalar(Math.max(s, 0.0001));
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

	// --- цветы и трава на скрещённых плоскостях ---
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
	const CHEST_CELL = {x: -2, z: 1};
	const plants = [];
	for (const b of blocks) {
		if (b.type !== 'grass') continue;
		const {x, z} = b.pos;
		if (Math.hypot(x - HOME.x, z - HOME.z) < 1.4) continue; // место персонажа
		if (x === CHEST_CELL.x && z === CHEST_CELL.z) continue;
		if (blockAt.has(`${x},0.5,${z}`)) continue; // занято деревом или кустом
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

	// --- сундук магазина ---
	const chestSide = lambert(tex.chestSide);
	const chest = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.82, 0.88), [chestSide, chestSide, lambert(tex.chestTop), chestSide, lambert(tex.chestFront), chestSide]);
	chest.position.set(CHEST_CELL.x, 0.41, CHEST_CELL.z);
	chest.rotation.y = 0.3;
	island.add(chest);

	// ================= ПЕРСОНАЖ =================
	const skin = new THREE.TextureLoader().load('img/skin.png');
	skin.magFilter = THREE.NearestFilter;
	skin.minFilter = THREE.NearestFilter;
	skin.generateMipmaps = false;
	skin.colorSpace = THREE.SRGBColorSpace;
	const player = buildPlayer(skin);
	player.root.scale.setScalar(PLAYER_SCALE);
	player.root.position.set(0, -BODY, 0);
	// поворачиваем персонажа вокруг центра тела, а не вокруг ног: так он красиво кувыркается
	const pivot = new THREE.Group();
	pivot.rotation.order = 'YXZ';
	pivot.add(player.root);
	world.add(pivot);

	// mode: idle | walk | mine | land — на острове (3D); free — снят с острова (2D-тело PB ниже)
	const P = {mode: 'idle', pos: HOME.clone(), face: 0.15, target: HOME.clone(), task: null, mineT: 0, landT: 0, walkPhase: 0};

	// ================= НАЗВАНИЕ 1DEX1 ИЗ БЛОКОВ =================
	const word = wordPixels('1DEX1');
	const wordRand = rng(5);
	const colTop = new THREE.Color('#f3ecff');
	const colBottom = new THREE.Color('#8f5cff');
	const voxels = word.pixels.map((p) => {
		const roll = wordRand();
		const color = colTop.clone().lerp(colBottom, p.row / 6);
		// немного «руды»: салатовые и золотые блоки
		if (roll < 0.07) color.set('#b8ff3d');
		else if (roll < 0.13) color.set('#ffc83d');
		return {x: (p.x - word.width / 2 + 0.5) * VOXEL, y: WORD_Y + (p.y + 0.5) * VOXEL, color, phase: p.x * 0.35, hover: 0, brokenAt: -1, scale: 1};
	});
	const wordMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel}), voxels.length);
	voxels.forEach((v, i) => wordMesh.setColorAt(i, v.color));
	wordMesh.instanceColor.needsUpdate = true;
	wordMesh.frustumCulled = false;
	world.add(wordMesh);

	// ================= ОСКОЛКИ =================
	const DEBRIS = 140;
	const debris = Array.from({length: DEBRIS}, () => ({life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, size: 0}));
	const debrisMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel}), DEBRIS);
	debrisMesh.frustumCulled = false;
	const white = new THREE.Color('#ffffff');
	for (let i = 0; i < DEBRIS; i++) debrisMesh.setColorAt(i, white);
	world.add(debrisMesh);
	let debrisCursor = 0;
	const debrisColor = new THREE.Color();
	// pos — в координатах world
	const spawnDebris = (pos, color, count, power = 1) => {
		debrisColor.set(color);
		for (let k = 0; k < count; k++) {
			const d = debris[debrisCursor];
			debrisMesh.setColorAt(debrisCursor, debrisColor);
			debrisCursor = (debrisCursor + 1) % DEBRIS;
			d.life = 0.6 + Math.random() * 0.5;
			d.pos.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + (Math.random() - 0.5) * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
			d.vel.set((Math.random() - 0.5) * 4.5 * power, (1.5 + Math.random() * 4) * power, (Math.random() - 0.2) * 3.5 * power);
			d.spin = (Math.random() - 0.5) * 12;
			d.size = 0.09 + Math.random() * 0.12;
		}
		debrisMesh.instanceColor.needsUpdate = true;
	};

	// ================= КУБИКИ =================
	// Кубики живут «на экране»: координаты в пикселях + своя глубина в 3D.
	// Хитбокс — квадрат по передней грани кубика, его не видно.
	const floatRand = rng(23);
	const floatMats = [lambert(tex.amethyst), lambert(tex.lime), lambert(tex.gold)];
	const floaters = [];
	for (let i = 0; i < 14; i++) {
		const mesh = new THREE.Mesh(box, floatMats[i % 3 === 0 ? 0 : i % 3 === 1 ? (i % 2 ? 1 : 0) : 2]);
		scene.add(mesh);
		floaters.push({
			kind: 'cube',
			mesh,
			index: i,
			size: 0.7 + floatRand() * 1.0,
			far: floatRand(),
			depth: 40,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			hw: 10,
			hh: 10,
			invMass: 1,
			rotX: floatRand() * 6.28,
			rotY: floatRand() * 6.28,
			spin: 0,
			held: false,
			grounded: false,
			support: null,
			storedAt: -1,
			storeFrom: new THREE.Vector3(),
			respawned: false,
			shown: true,
		});
	}
	// Откуда кубики падают при загрузке (координаты -1..1): [x0, x1, y0, y1]
	const SLOTS_WIDE = [
		[-0.95, -0.2, 0.56, 0.7],
		[-0.1, 0.1, 0.3, 0.7],
		[0.74, 0.97, 0.2, 0.6],
		[-0.6, -0.3, 0.56, 0.7],
		[0.1, 0.3, 0.2, 0.6],
		[-0.95, -0.7, -0.2, 0.3],
		[0.0, 0.28, -0.4, 0.0],
	];
	const SLOTS_NARROW = [
		[-0.96, -0.62, 0.2, 0.6],
		[0.62, 0.96, 0.2, 0.6],
		[-0.96, -0.66, -0.4, 0.1],
		[0.66, 0.96, -0.4, 0.1],
	];
	scene.fog = new THREE.Fog(0x0e0a1c, 30, 80);

	// ================= ЗВЁЗДЫ =================
	const starRand = rng(31);
	const starPos = new Float32Array(420 * 3);
	for (let i = 0; i < 420; i++) {
		starPos[i * 3] = (starRand() - 0.5) * 190;
		starPos[i * 3 + 1] = (starRand() - 0.5) * 110;
		starPos[i * 3 + 2] = -50 - starRand() * 60;
	}
	const starGeo = new THREE.BufferGeometry();
	starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
	const starMat = new THREE.PointsMaterial({color: 0xcfc4ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false});
	scene.add(new THREE.Points(starGeo, starMat));

	// ================= КАДРИРОВАНИЕ =================
	const BOX = {w: 15.8, h: 13.4, cy: 1.2};
	const viewDir = new THREE.Vector3(0.2, 0.2, 1).normalize();
	let width = 1;
	let height = 1;
	let viewDist = 30;
	let viewWide = true;
	let focal = 600; // пикселей на единицу при глубине 1
	let gap = 38; // «сантиметр» на экране

	const placeFloater = (f, r) => {
		const slots = viewWide ? SLOTS_WIDE : SLOTS_NARROW;
		const [x0, x1, y0, y1] = slots[f.index % slots.length];
		const nx = x0 + r() * (x1 - x0);
		const ny = y0 + r() * (y1 - y0);
		f.x = ((nx + 1) / 2) * width;
		f.y = ((1 - ny) / 2) * height;
		f.vx = 0;
		f.vy = 0;
	};
	const placeFloaters = () => {
		const r = rng(101);
		floaters.forEach((f) => {
			f.shown = viewWide || f.index < 8;
			f.depth = viewDist + 4 + f.far * 26;
			f.held = false;
			placeFloater(f, r);
		});
	};

	const frame = () => {
		const wide = width >= 900;
		const rect = wide ? {x0: 0.47, x1: 0.98, y0: 0.13, y1: 0.93} : {x0: 0.03, x1: 0.97, y0: 0.1, y1: 0.99};
		const aspect = width / height;
		const tan = Math.tan((camera.fov * Math.PI) / 360);
		const rw = rect.x1 - rect.x0;
		const rh = rect.y1 - rect.y0;
		const boxW = wide ? BOX.w : BOX.w - 1.2;
		const dist = Math.max(boxW / (rw * aspect), BOX.h / rh) / (2 * tan);
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
		scene.fog.near = dist + 7;
		scene.fog.far = dist + 52;
		viewDist = dist;
		viewWide = wide;
		focal = height / 2 / tan;
		gap = Math.min(38, width * 0.045);
		placeFloaters();
	};
	const resize = () => {
		const r = canvas.getBoundingClientRect();
		width = Math.max(1, r.width);
		height = Math.max(1, r.height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 900 ? 1.5 : 2));
		renderer.setSize(width, height, false);
		frame();
		// при смене размера персонаж возвращается домой
		if (P.mode === 'free') {
			P.mode = 'idle';
			P.pos.copy(HOME);
		}
	};

	// экранные пиксели (относительно канваса) <-> 3D
	const toPx = (v) => {
		v.project(camera);
		return {x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height};
	};
	const rayDir = new THREE.Vector3();
	const pxToWorld = (x, y, depth, out) => {
		rayDir.set((x / width) * 2 - 1, -((y / height) * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
		return out.copy(camera.position).addScaledVector(rayDir, depth);
	};

	// ================= УКАЗАТЕЛЬ =================
	const zone = canvas.parentElement; // слушаем весь первый экран
	const content = zone.querySelector('.hero__content');
	const pointer = new THREE.Vector2(0.3, 0.1); // -1..1
	const pointerPx = {x: 0, y: 0};
	let pointerInside = false;
	let hovered = -1;
	let drag = null;
	let pointerId = null;
	const raycaster = new THREE.Raycaster();

	const setPointer = (e) => {
		const r = canvas.getBoundingClientRect();
		pointerPx.x = e.clientX - r.left;
		pointerPx.y = e.clientY - r.top;
		pointer.set((pointerPx.x / r.width) * 2 - 1, -((pointerPx.y / r.height) * 2 - 1));
		pointerInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
	};
	const setCursor = (value) => {
		if (zone.style.cursor !== value) zone.style.cursor = value;
	};
	const castRay = () => raycaster.setFromCamera(pointer, camera);

	const pickVoxel = () => {
		castRay();
		const hit = raycaster.intersectObject(wordMesh, false)[0];
		return hit && voxels[hit.instanceId].brokenAt < 0 ? hit.instanceId : -1;
	};
	const pickFloater = () => {
		let best = null;
		let bestD = Infinity;
		for (const f of floaters) {
			if (!f.shown || f.storedAt >= 0) continue;
			const dx = Math.abs(pointerPx.x - f.x);
			const dy = Math.abs(pointerPx.y - f.y);
			if (dx < f.hw * 1.2 && dy < f.hh * 1.2 && dx + dy < bestD) {
				best = f;
				bestD = dx + dy;
			}
		}
		return best;
	};
	const pickPlayer = () => {
		castRay();
		return raycaster.intersectObject(player.root, true).length > 0;
	};
	const pickBlock = () => {
		castRay();
		const hit = raycaster.intersectObjects(islandMeshes, false)[0];
		if (!hit) return null;
		const b = hit.object.userData.blocks[hit.instanceId];
		return b && b.minedAt < 0 ? b : null;
	};
	const playerFree = () => P.mode === 'idle' || P.mode === 'walk';

	let now = 0;
	let jumpAt = -10;
	let chestBumpAt = -10;
	let broken = 0;
	let tickles = 0;

	const breakVoxel = (i) => {
		const v = voxels[i];
		v.brokenAt = now;
		v.hover = 0;
		broken++;
		if (P.mode === 'idle') jumpAt = now;
		spawnDebris(tmp.set(v.x, v.y, -1), `#${v.color.getHexString()}`, 9);
		on('break', broken);
	};

	// --- добыча блоков острова ---
	const activeBlocks = new Set();
	const blockWorld = (b, out) => {
		out.copy(b.pos);
		island.localToWorld(out);
		return world.worldToLocal(out);
	};
	const startMining = (b) => {
		if (!playerFree() || P.task) return;
		const at = blockWorld(b, new THREE.Vector3());
		// встаём рядом с блоком, со стороны персонажа
		let dx = P.pos.x - at.x;
		let dz = P.pos.z - at.z;
		let len = Math.hypot(dx, dz);
		if (len < 0.3) {
			dx = 0;
			dz = 1;
			len = 1;
		}
		const stand = new THREE.Vector3(at.x + (dx / len) * 1.15, 0, at.z + (dz / len) * 1.15);
		const r = Math.hypot(stand.x, stand.z);
		if (r > ISLAND_R - 0.4) stand.multiplyScalar((ISLAND_R - 0.4) / r);
		stand.y = 0;
		P.task = {block: b, at};
		P.target.copy(stand);
		P.mode = 'walk';
		activeBlocks.add(b);
	};
	const finishMining = () => {
		const b = P.task.block;
		b.minedAt = now;
		activeBlocks.add(b);
		spawnDebris(P.task.at, BLOCK_COLOR[b.type], 12, 0.8);
		on('mine');
		P.task = null;
		P.mode = 'walk';
		P.target.copy(HOME);
	};

	// ================= ПЕРСОНАЖ ВНЕ ОСТРОВА (2D-тело) =================
	// Размеры хитбокса для каждой позы, в единицах мира: [полуширина, полувысота]
	const POSE_BOX = {stand: [0.42, 1.35], wave: [0.42, 1.35], air: [0.42, 1.35], held: [0.42, 1.35], crouch: [0.42, 1.25], sit: [0.42, 0.845], lie: [1.35, 0.6]};
	const PB = {kind: 'player', x: 0, y: 0, vx: 0, vy: 0, hw: 10, hh: 30, invMass: 0.25, held: false, grounded: false, support: null, pose: 'stand', poseT: 0, poseDur: 1.5, lieDir: 1, airT: 0, sneak: 0, drop: 0, lie: 0};
	let playerK = 20; // пикселей на единицу мира на глубине персонажа
	let playerDepth = 30;
	const fitPoseBox = () => {
		const bottom = PB.y + PB.hh;
		const [w, h] = POSE_BOX[PB.pose];
		PB.hw = w * playerK;
		PB.hh = h * playerK;
		PB.y = bottom - PB.hh;
	};
	const setPose = (pose, dur) => {
		PB.pose = pose;
		PB.poseT = 0;
		PB.poseDur = dur;
		if (pose === 'lie') PB.lieDir = Math.random() < 0.5 ? -1 : 1;
		fitPoseBox();
	};
	// стоя на чём-то, персонаж сам выбирает, чем заняться
	const nextPose = () => {
		const supportWidth = PB.support ? PB.support.maxX - PB.support.minX : 0;
		const options = [
			['stand', 3],
			['wave', 2.6],
			['crouch', 2.2],
			['sit', 6],
		];
		if (supportWidth > PB.hw * 2 * 3.4) options.push(['lie', 6]);
		const pick = options[Math.floor(Math.random() * options.length)];
		setPose(pick[0], pick[1] * (0.8 + Math.random() * 0.4));
	};

	const startPlayerDrag = () => {
		if (P.task) {
			activeBlocks.add(P.task.block);
			P.task = null;
		}
		// с острова — в «экранный» режим, с той же точки, где он стоял
		if (P.mode !== 'free') {
			const c = toPx(pivot.getWorldPosition(new THREE.Vector3()));
			PB.x = c.x;
			PB.y = c.y;
			PB.vx = 0;
			PB.vy = 0;
			PB.pose = 'held';
			fitPoseBox();
			PB.y = c.y;
			P.mode = 'free';
		}
		PB.held = true;
		setPose('held', 0);
		drag.ox = PB.x - pointerPx.x;
		drag.oy = PB.y - pointerPx.y;
		drag.started = true;
	};
	// персонаж встал на верх острова — возвращаемся в 3D и идём домой
	const islandTop = new THREE.Plane();
	const landOnIsland = () => {
		// точка верха острова прямо под ногами (по лучу из камеры)
		const up = new THREE.Vector3(0, 1, 0).transformDirection(world.matrixWorld);
		islandTop.setFromNormalAndCoplanarPoint(up, world.localToWorld(new THREE.Vector3(0, 0, 0)));
		const fw = pxToWorld(PB.x, PB.y + PB.hh, playerDepth, new THREE.Vector3());
		const ray = new THREE.Ray(camera.position.clone(), fw.sub(camera.position).normalize());
		const hit = ray.intersectPlane(islandTop, new THREE.Vector3());
		const feet = hit ? world.worldToLocal(hit) : world.worldToLocal(pxToWorld(PB.x, PB.y + PB.hh, playerDepth, new THREE.Vector3()));
		const r = Math.hypot(feet.x, feet.z);
		if (r > ISLAND_R - 0.3) feet.multiplyScalar((ISLAND_R - 0.3) / r);
		P.pos.set(feet.x, 0, feet.z);
		P.mode = 'land';
		P.landT = 0;
		P.face = 0.15;
		jumpAt = now;
	};
	const tickle = () => {
		if (P.mode === 'free') {
			if (PB.grounded && !PB.held) {
				PB.vy = -620;
				setPose('air', 0);
			}
		} else if (playerFree() || P.mode === 'land') {
			jumpAt = now;
		}
		if (++tickles === 5) on('tickle');
	};

	// --- кубик: спрятать в сундук или выбить из руки ---
	const releaseCapture = () => {
		if (pointerId !== null && zone.hasPointerCapture?.(pointerId)) zone.releasePointerCapture(pointerId);
	};
	const storeFloater = (f) => {
		f.held = false;
		f.storedAt = now;
		f.storeFrom.copy(f.mesh.position);
		chestBumpAt = now;
		if (drag && drag.f === f) {
			if (drag.moved > 12) on('drag');
			drag = null;
			releaseCapture();
		}
		on('treasure');
	};
	const knockOut = (f) => {
		f.held = false;
		if (drag && drag.f === f) {
			if (drag.moved > 12) on('drag');
			drag = null;
			releaseCapture();
		}
	};

	// --- события ---
	zone.addEventListener('pointermove', (e) => {
		setPointer(e);
		if (!drag) return;
		drag.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
		if (drag.kind === 'player' && !drag.started && drag.moved > 6) startPlayerDrag();
	});
	zone.addEventListener('pointerleave', () => {
		if (drag) return;
		pointerInside = false;
		hovered = -1;
		setCursor('');
	});
	let downAt = null;
	zone.addEventListener('pointerdown', (e) => {
		if (e.target.closest('a, button')) return;
		downAt = [e.clientX, e.clientY];
		setPointer(e);
		if (pickVoxel() >= 0) return;
		const f = pickFloater();
		if (f) {
			f.held = true;
			drag = {kind: 'floater', f, ox: f.x - pointerPx.x, oy: f.y - pointerPx.y, moved: 0};
		} else if (pickPlayer()) {
			drag = {kind: 'player', moved: 0, started: false};
		} else {
			return;
		}
		pointerId = e.pointerId;
		zone.setPointerCapture?.(e.pointerId);
		e.preventDefault(); // иначе браузер начинает выделять текст
	});
	zone.addEventListener('pointerup', (e) => {
		const d = drag;
		drag = null;
		releaseCapture();
		if (d?.kind === 'floater') {
			d.f.held = false;
			if (d.moved > 12) on('drag');
			return;
		}
		if (d?.kind === 'player' && d.started) {
			PB.held = false;
			setPose('air', 0);
			return;
		}
		if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
		if (e.target.closest('a, button')) return;
		setPointer(e);
		const i = pickVoxel();
		if (i >= 0) breakVoxel(i);
		else if (pickPlayer()) tickle();
		else {
			const b = pickBlock();
			if (b) startMining(b);
		}
		if (e.pointerType !== 'mouse') pointerInside = false;
	});
	zone.addEventListener('pointercancel', () => {
		if (drag?.kind === 'floater') drag.f.held = false;
		if (drag?.kind === 'player' && drag.started) PB.held = false;
		drag = null;
	});
	// на телефоне палец на кубике или персонаже двигает их, а не страницу
	zone.addEventListener(
		'touchstart',
		(e) => {
			const t = e.touches[0];
			if (!t || e.target.closest('a, button')) return;
			setPointer(t);
			if (pickVoxel() < 0 && (pickFloater() || pickPlayer())) e.preventDefault();
		},
		{passive: false},
	);

	// ================= НЕВИДИМЫЕ ХИТБОКСЫ =================
	// силуэт острова целиком — от него кубики отскакивают
	const ISLAND_HULL_PTS = [];
	for (let i = 0; i < 14; i++) {
		const a = (i / 14) * Math.PI * 2;
		ISLAND_HULL_PTS.push(new THREE.Vector3(Math.cos(a) * 3.9, 1.0, Math.sin(a) * 3.9));
		ISLAND_HULL_PTS.push(new THREE.Vector3(Math.cos(a) * 3.6, -2, Math.sin(a) * 3.6));
		ISLAND_HULL_PTS.push(new THREE.Vector3(Math.cos(a) * 1.4, -6, Math.sin(a) * 1.4));
	}
	// без дерева — это силуэт, в который упирается персонаж: снаружи его ничто не загораживает
	const ISLAND_BODY_PTS = ISLAND_HULL_PTS.map((v) => v.clone().setY(v.y === 1.0 ? 0.05 : v.y));
	for (const dx of [-2.5, 2.5]) for (const dz of [-2.5, 2.5]) ISLAND_HULL_PTS.push(new THREE.Vector3(TREE.x + dx, 4.1, TREE.z + dz));
	const PLAYER_HULL_PTS = [];
	for (const x of [-7, 7]) for (const y of [0, 17, 33]) for (const z of [-4, 4]) PLAYER_HULL_PTS.push(new THREE.Vector3(x, y, z));
	const wordHalf = (word.width * VOXEL) / 2 + 0.1;
	const LOGO_HULL_PTS = [];
	for (const x of [-wordHalf, wordHalf]) for (const y of [WORD_Y + 0.05, WORD_Y + 7 * VOXEL]) for (const z of [-1.4, -0.6]) LOGO_HULL_PTS.push(new THREE.Vector3(x, y, z));
	const hullOf = (pts, obj) => convexHull(pts.map((p) => toPx(obj.localToWorld(tmp.copy(p)))));
	const rectPoly = (x0, y0, x1, y1) => [
		{x: x0, y: y0},
		{x: x1, y: y0},
		{x: x1, y: y1},
		{x: x0, y: y1},
	];
	const withBounds = (s) => {
		let minX = Infinity;
		let maxX = -Infinity;
		for (const p of s.poly) {
			minX = Math.min(minX, p.x);
			maxX = Math.max(maxX, p.x);
		}
		s.minX = minX;
		s.maxX = maxX;
		return s;
	};
	// Виджеты первого экрана (название и кнопка) — твёрдые платформы.
	// Для текста берём рамку самих букв, а не всего блока.
	const widgetRects = () => {
		if (!viewWide || !content) return [];
		const r = canvas.getBoundingClientRect();
		const out = [];
		const add = (rect, inset = 0) => {
			if (!rect || rect.width < 4) return;
			out.push(rectPoly(rect.left - r.left, rect.top - r.top + inset, rect.right - r.left, rect.bottom - r.top));
		};
		const h1 = content.querySelector('h1');
		if (h1) {
			const range = document.createRange();
			range.selectNodeContents(h1);
			const tr = range.getBoundingClientRect();
			add(tr, tr.height * 0.13);
		}
		content.querySelectorAll('.btn').forEach((b) => add(b.getBoundingClientRect()));
		const hint = content.querySelector('.hero__hint');
		if (hint) {
			const range = document.createRange();
			range.selectNodeContents(hint);
			add(range.getBoundingClientRect());
		}
		return out;
	};

	// ================= 2D-ФИЗИКА =================
	const GRAVITY = 2300; // px/s²
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

	const pushOut = (b, nx, ny, depth, support, bounce) => {
		b.x += nx * depth;
		b.y += ny * depth;
		if (b.held) return;
		const vn = b.vx * nx + b.vy * ny;
		if (vn < 0) {
			b.vx -= nx * vn * (1 + bounce);
			b.vy -= ny * vn * (1 + bounce);
		}
		if (ny < -0.6) {
			b.grounded = true;
			b.support = support;
		}
	};

	const chestPx = {x: 0, y: 0, r: 0};
	const stepPhysics = (dt, statics) => {
		const bodies = floaters.filter((f) => f.shown && f.storedAt < 0);
		for (const f of bodies) {
			f.hw = f.hh = (f.size * 0.5 * focal) / f.depth;
			f.invMass = f.held ? 0 : 1;
		}
		if (P.mode === 'free') {
			fitPoseBox();
			PB.invMass = PB.held ? 0 : 0.25;
			bodies.push(PB);
		}
		const top = viewWide ? 72 : 6;
		const floor = {kind: 'floor', minX: 0, maxX: width};

		// движение: в руке тело идёт за пальцем, иначе падает с гравитацией
		for (const b of bodies) {
			if (b.held && drag && (drag.f === b || (drag.kind === 'player' && b === PB))) {
				const tx = pointerPx.x + drag.ox;
				const ty = pointerPx.y + drag.oy;
				const k = 1 - Math.exp(-dt * 30);
				const nx = lerp(b.x, tx, k);
				const ny = lerp(b.y, ty, k);
				// запоминаем скорость руки, чтобы тело можно было бросить
				b.vx = lerp(b.vx, (nx - b.x) / dt, 0.35);
				b.vy = lerp(b.vy, (ny - b.y) / dt, 0.35);
				b.x = nx;
				b.y = ny;
			} else {
				b.vy += GRAVITY * dt;
				const sp = Math.hypot(b.vx, b.vy);
				if (sp > 2600) {
					b.vx *= 2600 / sp;
					b.vy *= 2600 / sp;
				}
				b.x += b.vx * dt;
				b.y += b.vy * dt;
			}
			b.wasGrounded = b.grounded;
			b.grounded = false;
			b.support = null;
		}

		for (let it = 0; it < 6; it++) {
			// тела и неподвижные препятствия
			for (const b of bodies) {
				const isCube = b.kind === 'cube';
				// сундук ловит кубик, который к нему поднесли
				if (isCube && b.held && it === 0 && Math.hypot(b.x - chestPx.x, b.y - chestPx.y) < b.hw + chestPx.r * 2 + gap + 16) {
					storeFloater(b);
					continue;
				}
				if (isCube && b.storedAt >= 0) continue;
				for (const s of statics) {
					if (isCube && s.cubes === 'repel') {
						// остров откидывает кубик, подошедший ближе чем на сантиметр
						if (it !== 0) continue;
						const h = hullDistance(b.x, b.y, s.poly);
						const clearance = h.dist - b.hw * 1.1;
						if (clearance >= gap) continue;
						if (b.held) knockOut(b);
						b.x += h.nx * (gap - clearance);
						b.y += h.ny * (gap - clearance);
						const vn = b.vx * h.nx + b.vy * h.ny;
						if (vn < KNOCK) {
							b.vx += h.nx * (KNOCK - vn);
							b.vy += h.ny * (KNOCK - vn);
						}
						b.spin += 3;
						continue;
					}
					if (isCube ? s.cubes !== 'solid' : !s.player) continue;
					const m = boxPoly(b, s.poly);
					if (m) pushOut(b, m.nx, m.ny, m.depth, s, isCube ? 0.15 : 0.05);
				}
				// края первого экрана
				if (b.x - b.hw < 0) pushOut(b, 1, 0, b.hw - b.x, null, 0.3);
				if (b.x + b.hw > width) pushOut(b, -1, 0, b.x + b.hw - width, null, 0.3);
				if (b.y - b.hh < top) pushOut(b, 0, 1, top - (b.y - b.hh), null, 0.2);
				if (b.y + b.hh > height) pushOut(b, 0, -1, b.y + b.hh - height, floor, 0.12);
			}
			// тела друг с другом: не проходят насквозь, лёгкое уступает тяжёлому
			for (let i = 0; i < bodies.length; i++) {
				for (let j = i + 1; j < bodies.length; j++) {
					const a = bodies[i];
					const b = bodies[j];
					const sum = a.invMass + b.invMass;
					if (sum === 0) continue;
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const ox = a.hw + b.hw - Math.abs(dx);
					const oy = a.hh + b.hh - Math.abs(dy);
					if (ox <= 0 || oy <= 0) continue;
					let nx = 0;
					let ny = 0;
					let depth;
					if (ox < oy) {
						nx = dx < 0 ? -1 : 1;
						depth = ox;
					} else {
						ny = dy < 0 ? -1 : 1;
						depth = oy;
					}
					a.x -= (nx * depth * a.invMass) / sum;
					a.y -= (ny * depth * a.invMass) / sum;
					b.x += (nx * depth * b.invMass) / sum;
					b.y += (ny * depth * b.invMass) / sum;
					const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
					if (rel < 0) {
						const j2 = (-(1.1) * rel) / sum;
						a.vx -= nx * j2 * a.invMass;
						a.vy -= ny * j2 * a.invMass;
						b.vx += nx * j2 * b.invMass;
						b.vy += ny * j2 * b.invMass;
					}
					// кто сверху — тот стоит на другом
					if (ny < 0) {
						b.grounded = true;
						b.support = {kind: a.kind, minX: a.x - a.hw, maxX: a.x + a.hw};
					} else if (ny > 0) {
						a.grounded = true;
						a.support = {kind: b.kind, minX: b.x - b.hw, maxX: b.x + b.hw};
					}
				}
			}
		}

		// трение и покой: стоящее тело перестаёт дрожать
		for (const b of bodies) {
			if (b.held) continue;
			if (b.grounded) {
				b.vx *= Math.exp(-dt * (b.kind === 'cube' ? 7 : 12));
				if (Math.abs(b.vy) < 40) b.vy = 0;
				if (Math.abs(b.vx) < 6) b.vx = 0;
			}
			if (b.kind === 'cube') b.spin = Math.max(b.spin * Math.exp(-dt * 2), b.grounded ? 0 : Math.hypot(b.vx, b.vy) / 300);
		}
	};

	// ================= ПЕРСОНАЖ НА ОСТРОВЕ (3D) =================
	const stepIslandPlayer = (dt) => {
		const k = 1 - Math.exp(-dt * 10);
		switch (P.mode) {
			case 'land': {
				P.landT += dt;
				if (P.landT > 0.5) {
					P.mode = 'walk';
					P.target.copy(HOME);
				}
				break;
			}
			case 'walk': {
				const dx = P.target.x - P.pos.x;
				const dz = P.target.z - P.pos.z;
				const dist = Math.hypot(dx, dz);
				if (dist < 0.03) {
					P.pos.x = P.target.x;
					P.pos.z = P.target.z;
					if (P.task) {
						P.mode = 'mine';
						P.mineT = 0;
					} else {
						P.mode = 'idle';
					}
				} else {
					const step = Math.min(dist, 2.6 * dt);
					P.pos.x += (dx / dist) * step;
					P.pos.z += (dz / dist) * step;
					P.face = Math.atan2(dx, dz);
					P.walkPhase += dt * 11;
				}
				P.pos.y = 0;
				break;
			}
			case 'mine': {
				P.mineT += dt;
				P.face = Math.atan2(P.task.at.x - P.pos.x, P.task.at.z - P.pos.z);
				// каждый удар — пара крошек
				const hitsBefore = Math.floor((P.mineT - dt) / 0.28);
				if (Math.floor(P.mineT / 0.28) > hitsBefore) spawnDebris(P.task.at, BLOCK_COLOR[P.task.block.type], 2, 0.4);
				if (P.mineT >= MINE_TIME) finishMining();
				break;
			}
			case 'idle': {
				P.pos.lerp(HOME, k);
				P.face = 0.15;
				break;
			}
			default:
		}
	};

	// поза рук и ног (плавно перетекают друг в друга)
	const pose = {armRx: 0, armRz: 0, armLx: 0, armLz: 0, legR: 0, legL: 0, sneak: 0, drop: 0, roll: 0, tiltZ: 0};
	const look = {yaw: 0, pitch: 0};
	const headWorld = new THREE.Vector3();
	const animatePlayer = (dt, idle) => {
		const t = now;
		const k = 1 - Math.exp(-dt * 12);
		const p = player.parts;
		const jump = clamp((now - jumpAt) / 0.42, 0, 1);
		const cheer = jump < 1 && P.mode !== 'free' ? Math.sin(jump * Math.PI) : 0;
		const target = {armRx: 0, armRz: 0.04, armLx: 0, armLz: -0.04, legR: 0, legL: 0, sneak: 0, drop: 0, roll: 0, tiltZ: 0};
		const sway = Math.sin(idle * 2) * 0.05;
		const wave = (amount) => Object.assign(target, {armRx: sway, armRz: lerp(0.04, -2.45 + Math.sin(idle * 15) * 0.35, amount), armLx: -sway});
		const state = P.mode === 'free' ? PB.pose : P.mode;
		switch (state) {
			case 'walk': {
				const s = Math.sin(P.walkPhase);
				Object.assign(target, {armRx: -s * 0.55, armLx: s * 0.55, legR: s * 0.7, legL: -s * 0.7});
				break;
			}
			case 'mine': {
				// удар киркой: рука взлетает и падает вниз
				const ph = (P.mineT / 0.28) % 1;
				Object.assign(target, {armRx: ph < 0.45 ? -2.3 : -0.5, armRz: 0.1});
				break;
			}
			case 'held':
				Object.assign(target, {armRx: -2.8 + Math.sin(t * 14) * 0.25, armRz: -0.3, armLx: -2.8 + Math.cos(t * 14) * 0.25, armLz: 0.3, legR: Math.sin(t * 9) * 0.4 + 0.2, legL: -Math.sin(t * 9) * 0.4 + 0.2, tiltZ: clamp(-PB.vx * 0.0005, -0.5, 0.5)});
				break;
			case 'air':
				Object.assign(target, {armRx: -2.6, armRz: -0.4, armLx: -2.6, armLz: 0.4, legR: 0.3, legL: -0.3});
				break;
			case 'wave':
				wave(1);
				break;
			case 'crouch':
				// присел, как на Shift в Minecraft
				Object.assign(target, {armRx: 0.45 + sway, armLx: 0.45 - sway, sneak: 1, drop: 0.13});
				break;
			case 'sit':
				// сидит на краю, ноги свисают и болтаются
				Object.assign(target, {armRx: -0.35, armLx: -0.35, armRz: 0.12, armLz: -0.12, legR: -1.25 + Math.sin(t * 2.4) * 0.28, legL: -1.25 - Math.sin(t * 2.4) * 0.28, drop: 1.01});
				break;
			case 'lie':
				Object.assign(target, {armRz: 0.08, armLz: -0.08, roll: PB.lieDir * (Math.PI / 2)});
				break;
			default: {
				// стоит: дышит и время от времени машет рукой
				const cycle = idle % 7;
				const waving = P.mode === 'idle' ? clamp(cycle / 0.25, 0, 1) * (1 - clamp((cycle - 1.5) / 0.3, 0, 1)) : 0;
				wave(waving);
			}
		}
		if (cheer > 0) {
			Object.assign(target, {armRx: lerp(target.armRx, -2.9, cheer), armRz: lerp(target.armRz, -0.3, cheer), armLx: lerp(target.armLx, -2.9, cheer), armLz: lerp(target.armLz, 0.3, cheer), legR: cheer * 0.3, legL: -cheer * 0.3});
		}
		for (const key of Object.keys(pose)) pose[key] = lerp(pose[key], target[key], state === 'mine' ? 1 - Math.exp(-dt * 30) : k);
		p.armR.rotation.set(pose.armRx, 0, pose.armRz);
		p.armL.rotation.set(pose.armLx, 0, pose.armLz);
		p.legR.rotation.x = pose.legR;
		p.legL.rotation.x = pose.legL;
		p.body.scale.y = 1 + Math.sin(idle * 2) * 0.012;
		// присед: корпус наклоняется вперёд вокруг центра, плечи и голова уходят вперёд, бёдра назад
		const s = pose.sneak;
		const lean = 0.45 * s;
		p.body.rotation.x = lean;
		p.head.position.set(0, 18 + 6 * Math.cos(lean), 6 * Math.sin(lean));
		p.armR.position.set(p.armR.position.x, 18 + 4 * Math.cos(lean), 4 * Math.sin(lean));
		p.armL.position.set(p.armL.position.x, 18 + 4 * Math.cos(lean), 4 * Math.sin(lean));
		p.legR.position.set(p.legR.position.x, 18 - 6 * Math.cos(lean), -6 * Math.sin(lean));
		p.legL.position.set(p.legL.position.x, 18 - 6 * Math.cos(lean), -6 * Math.sin(lean));
		player.root.position.y = -BODY - pose.drop;

		// где стоит персонаж
		if (P.mode === 'free') {
			// по экранной точке находим место в 3D на глубине острова
			const feetY = PB.y + PB.hh;
			const centerAbove = PB.pose === 'lie' ? 0.6 : BODY;
			const local = world.worldToLocal(pxToWorld(PB.x, feetY - centerAbove * playerK, playerDepth, new THREE.Vector3()));
			pivot.position.copy(local);
			pivot.rotation.set(0, lerpAngle(pivot.rotation.y, 0.15, 1 - Math.exp(-dt * 10)), pose.roll + pose.tiltZ);
		} else {
			const onGround = P.mode === 'idle' || P.mode === 'walk' || P.mode === 'land' || P.mode === 'mine';
			const hop = onGround ? Math.sin(jump * Math.PI) * 0.55 + (P.mode === 'walk' ? Math.abs(Math.sin(P.walkPhase)) * 0.06 : 0) : 0;
			pivot.position.set(P.pos.x, P.pos.y + BODY + hop, P.pos.z);
			pivot.rotation.set(0, lerpAngle(pivot.rotation.y, P.face, 1 - Math.exp(-dt * 10)), pose.roll + pose.tiltZ);
		}

		// голова следит за курсором
		p.head.getWorldPosition(headWorld).project(camera);
		const lx = pointerInside ? clamp((pointer.x - headWorld.x) * 1.4, -1, 1) : 0;
		const ly = pointerInside ? clamp((pointer.y - headWorld.y) * 0.9, -0.5, 0.6) : cheer * 0.5;
		const lookK = 1 - Math.exp(-dt * 6);
		const busy = P.mode === 'walk' || P.mode === 'mine' || (P.mode === 'free' && PB.pose === 'lie');
		look.yaw = lerp(look.yaw, busy ? 0 : lx, lookK);
		look.pitch = lerp(look.pitch, P.mode === 'mine' ? 0.4 : busy ? 0 : -ly + s * 0.3, lookK);
		p.head.rotation.set(look.pitch, look.yaw - (P.mode === 'idle' ? tilt.y * 0.4 : 0), 0);
	};

	// ================= ГЛАВНЫЙ ЦИКЛ =================
	const tilt = {x: 0, y: 0};
	let swayPhase = 0;

	const update = (dt) => {
		const idle = reducedMotion ? 0 : now;
		const k = 1 - Math.exp(-dt * 4);

		// сцена слегка поворачивается за курсором (пока ничего не тащат)
		if (!drag) {
			const tx = pointerInside ? pointer.x : 0.15;
			const ty = pointerInside ? pointer.y : 0;
			tilt.y = lerp(tilt.y, tx * 0.28, k);
			tilt.x = lerp(tilt.x, -ty * 0.1, k);
		}
		world.rotation.set(tilt.x, tilt.y - 0.2, 0);
		world.position.y = Math.sin(idle * 0.8) * 0.18;
		// остров качается на ±90°, пока персонаж спокойно стоит на месте
		if (P.mode === 'idle' && !reducedMotion) swayPhase += dt * SWAY_SPEED;
		island.rotation.y = Math.sin(swayPhase) * SWAY;
		world.updateMatrixWorld(true);

		// масштаб персонажа на экране
		const homeWorld = world.localToWorld(tmp.copy(HOME).add(tmp2.set(0, BODY, 0)));
		playerDepth = camera.position.distanceTo(homeWorld);
		playerK = focal / playerDepth;

		stepIslandPlayer(dt);

		// блоки острова: добытые исчезают и через 5 секунд вырастают снова
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
			} else if (P.mode === 'mine' && P.task?.block === b) {
				s = 1 - 0.07 * Math.abs(Math.sin(P.mineT * 22));
			} else if (!P.task || P.task.block !== b) {
				activeBlocks.delete(b);
			}
			setBlock(b, s);
		}
		for (const pl of plants) pl.mesh.visible = pl.block.scale > 0.6;

		// сундук подпрыгивает, когда в него прячут кубик
		const bump = clamp((now - chestBumpAt) / 0.35, 0, 1);
		chest.scale.setScalar(1 + Math.sin(bump * Math.PI) * 0.25);

		// хитбоксы на экране
		world.updateMatrixWorld(true);
		const cw = chest.getWorldPosition(new THREE.Vector3());
		const cp = toPx(cw.clone());
		chestPx.x = cp.x;
		chestPx.y = cp.y;
		chestPx.r = (0.5 * focal) / camera.position.distanceTo(cw);
		const statics = [
			withBounds({kind: 'island', poly: hullOf(ISLAND_HULL_PTS, island), cubes: 'repel', player: false}),
			withBounds({kind: 'island', poly: hullOf(ISLAND_BODY_PTS, island), cubes: null, player: true}),
			withBounds({kind: 'logo', poly: hullOf(LOGO_HULL_PTS, world), cubes: 'solid', player: true}),
			...widgetRects().map((poly) => withBounds({kind: 'widget', poly, cubes: 'solid', player: true})),
		];
		if (P.mode !== 'free') statics.push(withBounds({kind: 'player', poly: hullOf(PLAYER_HULL_PTS, player.root), cubes: 'solid', player: false}));

		// физика: два шага за кадр, чтобы быстрые броски не пролетали сквозь препятствия
		const sub = dt / 2;
		stepPhysics(sub, statics);
		stepPhysics(sub, statics);

		// персонаж вне острова: встал на верх острова — идёт домой, иначе выбирает позу
		if (P.mode === 'free' && !PB.held) {
			if (PB.grounded && PB.support?.kind === 'island') {
				landOnIsland();
			} else if (!PB.grounded) {
				PB.airT += dt;
				if (PB.airT > 0.12 && PB.pose !== 'air') setPose('air', 0);
			} else {
				PB.airT = 0;
				if (PB.pose === 'air' || PB.pose === 'held') setPose('stand', 1.2);
				PB.poseT += dt;
				if (PB.poseT > PB.poseDur) nextPose();
			}
		}
		animatePlayer(dt, idle);

		// что под курсором
		if (drag) {
			setCursor(drag.kind === 'player' && !drag.started ? 'grab' : 'grabbing');
		} else if (pointerInside) {
			hovered = pickVoxel();
			let cur = '';
			if (hovered >= 0) cur = CROSSHAIR;
			else if (pickFloater() || pickPlayer()) cur = 'grab';
			else if (playerFree() && !P.task && pickBlock()) cur = CROSSHAIR;
			setCursor(cur);
		} else {
			hovered = -1;
		}

		// блоки названия
		for (let i = 0; i < voxels.length; i++) {
			const v = voxels[i];
			if (v.brokenAt >= 0) {
				const since = now - v.brokenAt;
				if (since > RESPAWN + APPEAR) v.brokenAt = -1;
				v.scale = since < RESPAWN ? 0 : easeOutCubic((since - RESPAWN) / APPEAR);
			} else {
				v.scale = 1;
			}
			v.hover = lerp(v.hover, i === hovered ? 1 : 0, 1 - Math.exp(-dt * 14));
			const wave = Math.sin(idle * 1.6 + v.phase) * 0.07;
			dummy.position.set(v.x, v.y + wave, -1 + v.hover * 0.32);
			dummy.rotation.set(0, 0, 0);
			const s = VOXEL * v.scale * (1 + v.hover * 0.12);
			dummy.scale.set(s, s, s * WORD_DEPTH);
			dummy.updateMatrix();
			wordMesh.setMatrixAt(i, dummy.matrix);
		}
		wordMesh.instanceMatrix.needsUpdate = true;

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
			} else {
				dummy.scale.setScalar(0);
			}
			dummy.updateMatrix();
			debrisMesh.setMatrixAt(i, dummy.matrix);
		}
		debrisMesh.instanceMatrix.needsUpdate = true;

		// кубики в 3D: в полёте крутятся, приземлившись — встают ровно, гранью вниз
		const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
		for (const f of floaters) {
			let scale = f.size;
			if (f.storedAt >= 0) {
				// кубик улетает в сундук и через 5 секунд появляется на новом месте
				const since = now - f.storedAt;
				if (since < 0.3) {
					f.mesh.position.lerpVectors(f.storeFrom, cw, since / 0.3);
					scale *= 1 - since / 0.3;
				} else if (since < 5) {
					scale = 0;
				} else {
					if (!f.respawned) {
						placeFloater(f, Math.random);
						f.respawned = true;
					}
					scale *= easeOutCubic((since - 5) / 0.8);
					if (since > 5.8) {
						f.storedAt = -1;
						f.respawned = false;
					}
				}
			}
			if (f.storedAt < 0 || now - f.storedAt >= 5) pxToWorld(f.x, f.y, f.depth, f.mesh.position);
			if (f.grounded && f.spin < 0.4) {
				const kk = 1 - Math.exp(-dt * 10);
				f.rotX = lerp(f.rotX, snap(f.rotX), kk);
				f.rotY = lerp(f.rotY, snap(f.rotY), kk);
			} else {
				f.rotX += f.spin * dt;
				f.rotY += f.spin * 0.7 * dt;
			}
			f.mesh.rotation.set(f.rotX, f.rotY, 0);
			f.mesh.visible = f.shown && scale > 0.001;
			f.mesh.scale.setScalar(Math.max(0.001, scale));
		}
		starMat.opacity = 0.62 + Math.sin(idle * 1.2) * 0.18;
	};

	let running = true;
	let last = performance.now();
	const loop = (t) => {
		requestAnimationFrame(loop);
		const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
		last = t;
		if (!running) return;
		now += dt;
		update(dt);
		renderer.render(scene, camera);
	};

	new ResizeObserver(resize).observe(canvas);
	resize();
	new IntersectionObserver(([e]) => (running = e.isIntersecting)).observe(canvas);
	document.addEventListener('visibilitychange', () => (last = performance.now()));
	requestAnimationFrame(loop);

	// Для проверки сайта (адрес с ?debug): где на экране кубики, сундук, персонаж и блоки
	const page = (pt) => {
		const r = canvas.getBoundingClientRect();
		return {x: r.left + pt.x, y: r.top + pt.y};
	};
	return {
		positions: () => ({
			floaters: floaters.filter((f) => f.shown && f.storedAt < 0).map((f) => ({...page(f), hw: f.hw, grounded: f.grounded})),
			chest: page(chestPx),
			player: page(toPx(pivot.getWorldPosition(new THREE.Vector3()))),
			grass: (() => {
				const g = blocks.filter((b) => b.type === 'grass' && b.minedAt < 0 && Math.hypot(b.pos.x, b.pos.z - 0.4) > 1.5);
				let best = null;
				let bestZ = -Infinity;
				for (const b of g) {
					const w = island.localToWorld(tmp.copy(b.pos).add(tmp2.set(0, 0.5, 0)));
					if (w.z > bestZ) {
						bestZ = w.z;
						best = toPx(w.clone());
					}
				}
				return page(best);
			})(),
			widgets: widgetRects().map((poly) => ({...page(poly[0]), w: poly[1].x - poly[0].x, h: poly[2].y - poly[0].y})),
			// насколько тела залезли друг в друга (должно быть около нуля)
			maxOverlap: (() => {
				const l = floaters.filter((f) => f.shown && f.storedAt < 0);
				if (P.mode === 'free') l.push(PB);
				let worst = 0;
				for (let i = 0; i < l.length; i++) {
					for (let j = i + 1; j < l.length; j++) {
						const ox = l[i].hw + l[j].hw - Math.abs(l[i].x - l[j].x);
						const oy = l[i].hh + l[j].hh - Math.abs(l[i].y - l[j].y);
						if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
					}
				}
				return worst;
			})(),
		}),
		state: () => ({mode: P.mode, pose: PB.pose, grounded: PB.grounded, support: PB.support?.kind || null, pos: P.pos.toArray().map((v) => +v.toFixed(2)), pb: [Math.round(PB.x), Math.round(PB.y)], mined: blocks.filter((b) => b.minedAt >= 0).length, sway: +island.rotation.y.toFixed(2)}),
	};
};
