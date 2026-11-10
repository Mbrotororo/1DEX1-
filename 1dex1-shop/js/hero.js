// 3D-сцена первого экрана: парящий остров, твой скин, сундук и логотип 1DEX1
// из блоков. Блоки логотипа можно ломать кликом.
import * as THREE from '../vendor/three.module.min.js';
import {wordPixels} from './pixel.js';

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
	return 1 + 2.7 * k * k * k + 1.7 * k * k;
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
	const noise = Array.from({length: 16 * 16 * 8}, () => r());
	const n = (x, y, layer) => noise[(layer * 256 + y * 16 + x) % noise.length];
	const speckled = (base, layer, lo = 0.84, hi = 1.12) => (x, y) => {
		const v = n(x, y, layer);
		return shade(base, v < 0.16 ? lo : v > 0.86 ? hi : v > 0.55 ? 1.04 : 1);
	};
	const grass = speckled([98, 178, 66], 0);
	const dirt = speckled([128, 92, 64], 1);
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
		stone: pixelTexture(speckled([122, 118, 134], 4, 0.86, 1.1)),
		logSide: pixelTexture((x, y) => {
			const v = n(x, y >> 2, 5);
			return shade([98, 74, 48], v < 0.25 ? 0.74 : v > 0.8 ? 1.14 : 1);
		}),
		logTop: pixelTexture((x, y) => {
			const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
			if (d > 7) return [84, 62, 40];
			return Math.floor(d) % 2 ? [156, 122, 74] : [184, 148, 96];
		}),
		leaves: pixelTexture((x, y) => {
			const v = n(x, y, 6);
			return shade([62, 128, 44], v < 0.16 ? 0.55 : v < 0.4 ? 0.8 : v > 0.85 ? 1.22 : 1);
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

// ---------- сама сцена ----------
const VOXEL = 0.44;
const WORD_Y = 4.4;
// буквы толще одного блока, чтобы был виден объём
const WORD_DEPTH = 1.8;

export const initHero = (canvas, {onBreak = () => {}, reducedMotion = false} = {}) => {
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

	// всё, что реагирует на мышь, лежит в одной группе
	const world = new THREE.Group();
	scene.add(world);

	const box = new THREE.BoxGeometry(1, 1, 1);
	const dummy = new THREE.Object3D();
	const lambert = (map) => new THREE.MeshLambertMaterial({map});

	// --- остров ---
	const rand = rng(11);
	const cells = {grass: [], dirt: [], stone: []};
	const radii = [3.7, 3.0, 2.2, 1.4, 0.7];
	radii.forEach((radius, layer) => {
		for (let x = -4; x <= 4; x++) {
			for (let z = -4; z <= 4; z++) {
				const d = Math.hypot(x, z) + (rand() - 0.5) * 0.8;
				if (d > radius) continue;
				const kind = layer === 0 ? 'grass' : layer < 2 || (layer === 2 && rand() < 0.5) ? 'dirt' : 'stone';
				cells[kind].push([x, -layer - 0.5, z]);
			}
		}
	});
	const grassSide = lambert(tex.grassSide);
	const blockMats = {
		grass: [grassSide, grassSide, lambert(tex.grassTop), lambert(tex.dirt), grassSide, grassSide],
		dirt: lambert(tex.dirt),
		stone: lambert(tex.stone),
	};
	const addBlocks = (list, material) => {
		const mesh = new THREE.InstancedMesh(box, material, list.length);
		list.forEach((p, i) => {
			dummy.position.set(p[0], p[1], p[2]);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.setScalar(1);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		});
		world.add(mesh);
		return mesh;
	};
	Object.keys(cells).forEach((k) => addBlocks(cells[k], blockMats[k]));

	// --- дерево ---
	const logSide = lambert(tex.logSide);
	const logTop = lambert(tex.logTop);
	const tree = {x: -2, z: -2};
	addBlocks(
		[0, 1].map((y) => [tree.x, y + 0.5, tree.z]),
		[logSide, logSide, logTop, logTop, logSide, logSide],
	);
	const leaves = [];
	for (let dy = 0; dy < 3; dy++) {
		const rad = dy === 2 ? 0 : 1;
		for (let dx = -rad; dx <= rad; dx++) {
			for (let dz = -rad; dz <= rad; dz++) {
				if (dy === 1 && Math.abs(dx) === 1 && Math.abs(dz) === 1 && rand() < 0.6) continue;
				leaves.push([tree.x + dx, 1.5 + dy, tree.z + dz]);
			}
		}
	}
	addBlocks(leaves, lambert(tex.leaves));

	// --- сундук магазина ---
	const chestSide = lambert(tex.chestSide);
	const chest = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.82, 0.88), [
		chestSide,
		chestSide,
		lambert(tex.chestTop),
		chestSide,
		lambert(tex.chestFront),
		chestSide,
	]);
	chest.position.set(-1.5, 0.41, 1.5);
	chest.rotation.y = 0.35;
	world.add(chest);

	// --- игрок со скином ---
	const skin = new THREE.TextureLoader().load('img/skin.png');
	skin.magFilter = THREE.NearestFilter;
	skin.minFilter = THREE.NearestFilter;
	skin.generateMipmaps = false;
	skin.colorSpace = THREE.SRGBColorSpace;
	const player = buildPlayer(skin);
	const PLAYER_SCALE = 2.7 / 32;
	player.root.scale.setScalar(PLAYER_SCALE);
	player.root.position.set(0.5, 0, 1.1);
	world.add(player.root);

	// --- логотип 1DEX1 из блоков ---
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
		return {
			x: (p.x - word.width / 2 + 0.5) * VOXEL,
			y: WORD_Y + (p.y + 0.5) * VOXEL,
			color,
			phase: p.x * 0.35,
			hover: 0,
			brokenAt: -1,
			scale: 1,
		};
	});
	const wordMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel}), voxels.length);
	voxels.forEach((v, i) => wordMesh.setColorAt(i, v.color));
	wordMesh.instanceColor.needsUpdate = true;
	wordMesh.frustumCulled = false;
	world.add(wordMesh);

	// --- осколки от сломанных блоков ---
	const DEBRIS = 96;
	const debris = Array.from({length: DEBRIS}, () => ({life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, size: 0}));
	const debrisMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({map: tex.voxel}), DEBRIS);
	debrisMesh.frustumCulled = false;
	const white = new THREE.Color('#ffffff');
	for (let i = 0; i < DEBRIS; i++) debrisMesh.setColorAt(i, white);
	world.add(debrisMesh);
	let debrisCursor = 0;

	// --- парящие блоки вокруг ---
	const floatRand = rng(23);
	const floatMats = [lambert(tex.amethyst), lambert(tex.lime), lambert(tex.gold)];
	const floaters = [];
	for (let i = 0; i < 14; i++) {
		const mesh = new THREE.Mesh(box, floatMats[i % 3 === 0 ? 0 : i % 3 === 1 ? (i % 2 ? 1 : 0) : 2]);
		mesh.scale.setScalar(0.6 + floatRand() * 1.1);
		scene.add(mesh);
		floaters.push({
			mesh,
			base: new THREE.Vector3(),
			far: floatRand(),
			phase: floatRand() * 6.28,
			speed: 0.2 + floatRand() * 0.4,
			rx: (floatRand() - 0.5) * 0.5,
			ry: (floatRand() - 0.5) * 0.6,
		});
	}
	// Блоки расставляются по экрану так, чтобы не закрывать текст слева и логотип
	// Свободные места на экране (координаты -1..1): [x0, x1, y0, y1]
	const SLOTS_WIDE = [
		[-0.95, -0.2, 0.56, 0.7], // над текстом
		[-0.95, -0.1, -0.92, -0.66], // под текстом
		[-0.1, 0.1, -0.5, 0.2], // между текстом и островом
		[0.74, 0.97, -0.62, 0.2], // справа от острова
		[0.1, 0.3, -0.72, -0.2], // слева от острова
		[0.0, 0.28, -0.95, -0.8], // внизу по центру
		[-0.6, -0.3, 0.56, 0.7],
	];
	const SLOTS_NARROW = [
		[-0.96, -0.58, -0.9, 0.1],
		[0.58, 0.96, -0.9, 0.1],
		[-0.96, -0.62, 0.1, 0.5],
		[0.62, 0.96, 0.1, 0.5],
	];
	const placeFloaters = (dist, wide) => {
		const r = rng(101);
		const slots = wide ? SLOTS_WIDE : SLOTS_NARROW;
		const point = new THREE.Vector2();
		floaters.forEach((f, i) => {
			const [x0, x1, y0, y1] = slots[i % slots.length];
			point.set(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0));
			f.mesh.visible = wide || i < 8;
			const dir = new THREE.Vector3(point.x, point.y, 0.5).unproject(camera).sub(camera.position).normalize();
			f.base.copy(camera.position).addScaledVector(dir, dist + 4 + f.far * 26);
		});
	};
	scene.fog = new THREE.Fog(0x0e0a1c, 30, 80);

	// --- звёзды ---
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

	// ---------- кадрирование: сцена занимает правую часть экрана ----------
	const BOX = {w: 15.8, h: 13.4, cy: 1.2};
	const viewDir = new THREE.Vector3(0.2, 0.2, 1).normalize();
	let width = 1;
	let height = 1;
	const frame = () => {
		const wide = width >= 900;
		const rect = wide ? {x0: 0.47, x1: 0.98, y0: 0.13, y1: 0.93} : {x0: 0.03, x1: 0.97, y0: 0.1, y1: 0.99};
		const aspect = width / height;
		const tan = Math.tan((camera.fov * Math.PI) / 360);
		const rw = rect.x1 - rect.x0;
		const rh = rect.y1 - rect.y0;
		// на телефоне сцена не наклоняется за мышью, запас по ширине нужен меньше
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
		// дымка: дальние блоки растворяются в фоне, сам остров остаётся чётким
		scene.fog.near = dist + 7;
		scene.fog.far = dist + 52;
		placeFloaters(dist, wide);
	};
	const resize = () => {
		const r = canvas.getBoundingClientRect();
		width = Math.max(1, r.width);
		height = Math.max(1, r.height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 900 ? 1.5 : 2));
		renderer.setSize(width, height, false);
		frame();
		needsRender = true;
	};

	// ---------- мышь: наклон сцены, наведение и ломание блоков ----------
	const pointer = new THREE.Vector2(0.3, 0.1); // в координатах -1..1
	let pointerInside = false;
	let hovered = -1;
	const raycaster = new THREE.Raycaster();
	const pick = () => {
		if (!pointerInside) return -1;
		raycaster.setFromCamera(pointer, camera);
		const hit = raycaster.intersectObject(wordMesh, false)[0];
		return hit && voxels[hit.instanceId].brokenAt < 0 ? hit.instanceId : -1;
	};
	const setPointer = (e) => {
		const r = canvas.getBoundingClientRect();
		pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
		pointerInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
		needsRender = true;
	};
	// слушаем весь первый экран: текст лежит поверх канваса
	const zone = canvas.parentElement;
	zone.addEventListener('pointermove', setPointer);
	zone.addEventListener('pointerleave', () => {
		pointerInside = false;
		hovered = -1;
		canvas.style.cursor = '';
	});

	let now = 0;
	let jumpAt = -10;
	let broken = 0;
	const breakVoxel = (i) => {
		const v = voxels[i];
		v.brokenAt = now;
		v.hover = 0;
		broken++;
		jumpAt = now;
		for (let k = 0; k < 9; k++) {
			const d = debris[debrisCursor];
			debrisMesh.setColorAt(debrisCursor, v.color);
			debrisCursor = (debrisCursor + 1) % DEBRIS;
			d.life = 0.7 + Math.random() * 0.5;
			d.pos.set(v.x + (Math.random() - 0.5) * 0.3, v.y + (Math.random() - 0.5) * 0.3, -1 + Math.random() * 0.3);
			d.vel.set((Math.random() - 0.5) * 4.5, 1.5 + Math.random() * 4, 1 + Math.random() * 3.5);
			d.spin = (Math.random() - 0.5) * 12;
			d.size = 0.1 + Math.random() * 0.12;
		}
		debrisMesh.instanceColor.needsUpdate = true;
		onBreak(broken);
	};
	let downAt = null;
	zone.addEventListener('pointerdown', (e) => {
		downAt = [e.clientX, e.clientY];
		setPointer(e);
	});
	zone.addEventListener('pointerup', (e) => {
		if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
		// по кнопкам и ссылкам поверх сцены блоки не ломаем
		if (e.target.closest('a, button')) return;
		setPointer(e);
		const i = pick();
		if (i >= 0) breakVoxel(i);
		if (e.pointerType !== 'mouse') pointerInside = false;
	});

	// ---------- анимация ----------
	const RESPAWN = 4.2;
	const headWorld = new THREE.Vector3();
	let tilt = {x: 0, y: 0};
	let look = {yaw: 0, pitch: 0};
	let needsRender = true;

	const update = (dt) => {
		const idle = reducedMotion ? 0 : now;

		// сцена плавно поворачивается за курсором
		const tx = pointerInside ? pointer.x : 0.15;
		const ty = pointerInside ? pointer.y : 0;
		const k = 1 - Math.exp(-dt * 4);
		tilt.y = lerp(tilt.y, tx * 0.28 + Math.sin(idle * 0.35) * 0.06, k);
		tilt.x = lerp(tilt.x, -ty * 0.1, k);
		world.rotation.set(tilt.x, tilt.y - 0.2, 0);
		world.position.y = Math.sin(idle * 0.8) * 0.18;

		// наведение на блок
		const h = pick();
		if (h !== hovered) {
			hovered = h;
			canvas.style.cursor = h >= 0 ? 'pointer' : '';
		}

		// блоки логотипа
		for (let i = 0; i < voxels.length; i++) {
			const v = voxels[i];
			if (v.brokenAt >= 0) {
				const since = now - v.brokenAt;
				if (since > RESPAWN + 0.4) v.brokenAt = -1;
				v.scale = since < RESPAWN ? 0 : easeOutBack((since - RESPAWN) / 0.4);
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

		// игрок: дышит, машет рукой, подпрыгивает, когда ломают блок, и следит за курсором
		const p = player.parts;
		const jump = clamp((now - jumpAt) / 0.42, 0, 1);
		player.root.position.y = Math.sin(jump * Math.PI) * 0.55;
		const cycle = idle % 7;
		const waving = clamp(cycle / 0.25, 0, 1) * (1 - clamp((cycle - 1.5) / 0.3, 0, 1));
		const cheer = jump < 1 ? Math.sin(jump * Math.PI) : 0;
		const sway = Math.sin(idle * 2) * 0.05;
		p.armR.rotation.set(lerp(sway, -2.9, cheer), 0, lerp(lerp(0.04, -2.45 + Math.sin(idle * 15) * 0.35, waving), -0.3, cheer));
		p.armL.rotation.set(lerp(-sway, -2.9, cheer), 0, lerp(-0.04, 0.3, cheer));
		p.legR.rotation.x = cheer * 0.3;
		p.legL.rotation.x = -cheer * 0.3;
		p.body.scale.y = 1 + Math.sin(idle * 2) * 0.012;

		player.root.rotation.y = 0.15;
		p.head.getWorldPosition(headWorld).project(camera);
		const lx = pointerInside ? clamp((pointer.x - headWorld.x) * 1.4, -1, 1) : 0;
		const ly = pointerInside ? clamp((pointer.y - headWorld.y) * 0.9, -0.5, 0.6) : cheer * 0.5;
		look.yaw = lerp(look.yaw, lx, k * 1.6);
		look.pitch = lerp(look.pitch, -ly, k * 1.6);
		p.head.rotation.set(look.pitch, look.yaw - tilt.y * 0.4, 0);

		// парящие блоки
		for (const f of floaters) {
			f.mesh.position.set(f.base.x, f.base.y + Math.sin(idle * f.speed + f.phase) * 0.8, f.base.z);
			f.mesh.rotation.set(idle * f.rx + f.phase, idle * f.ry + f.phase, 0);
		}
		starMat.opacity = 0.62 + Math.sin(idle * 1.2) * 0.18;
	};

	let running = true;
	let last = performance.now();
	const loop = (t) => {
		requestAnimationFrame(loop);
		const dt = Math.min(0.05, (t - last) / 1000);
		last = t;
		if (!running) return;
		now += dt;
		// с отключёнными анимациями рисуем только после действий человека
		const active = !reducedMotion || needsRender || now - jumpAt < 6 || hovered >= 0;
		if (!active) return;
		needsRender = false;
		update(dt);
		renderer.render(scene, camera);
	};

	new ResizeObserver(resize).observe(canvas);
	resize();
	new IntersectionObserver(([e]) => (running = e.isIntersecting)).observe(canvas);
	document.addEventListener('visibilitychange', () => (last = performance.now()));
	requestAnimationFrame(loop);

	return {breakRandom: () => breakVoxel(Math.floor(Math.random() * voxels.length))};
};
