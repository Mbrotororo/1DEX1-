import type * as THREE from 'three';
import {hash3} from '../rng';
import {dataTexture} from '../textures';

// Скины 64x64, нарисованные кодом (раскладка — как у обычного скина игрока).
// Каждая часть тела красится по граням: front/back/right/left/top/bottom.

type Rgb = number[];
type Face = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
// x, y — пиксель на грани (0,0 — левый верх, если смотреть на грань снаружи); w, h — размер грани
type PartPainter = (face: Face, x: number, y: number, w: number, h: number) => Rgb | null;

const S = 64;

class SkinCanvas {
	data = new Uint8Array(S * S * 4);
	set(x: number, y: number, c: Rgb | null) {
		if (!c || x < 0 || y < 0 || x >= S || y >= S) return;
		const i = (y * S + x) * 4;
		this.data[i] = c[0];
		this.data[i + 1] = c[1];
		this.data[i + 2] = c[2];
		this.data[i + 3] = c[3] ?? 255;
	}
	rect(x0: number, y0: number, w: number, h: number, face: Face, paint: PartPainter) {
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(x0 + x, y0 + y, paint(face, x, y, w, h));
	}
	// развёртка коробки w×h×d с левым верхним углом (u, v) — как в skinBox
	part(u: number, v: number, w: number, h: number, d: number, paint: PartPainter) {
		this.rect(u + d, v, w, d, 'top', paint);
		this.rect(u + d + w, v, w, d, 'bottom', paint);
		this.rect(u, v + d, d, h, 'right', paint);
		this.rect(u + d, v + d, w, h, 'front', paint);
		this.rect(u + d + w, v + d, d, h, 'left', paint);
		this.rect(u + d + w + d, v + d, w, h, 'back', paint);
	}
}

export type SkinBuild = 'classic' | 'slim' | 'skeleton';
export type Skin = {
	map: THREE.Texture;
	// что светится само (глаза) — или null
	emissive: THREE.Texture | null;
	build: SkinBuild;
	// есть ли второй слой (шляпа/куртка)
	overlay: boolean;
};

const k = (c: Rgb, f: number): Rgb => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
const noisy = (c: Rgb, x: number, y: number, seed: number, amount = 0.12) => k(c, 1 - amount / 2 + hash3(x, y, 3, seed) * amount);

// раскладка частей тела: [u, v, w, h, d]
const layout = (arm: number, limb = 4, limbD = 4) => ({
	head: [0, 0, 8, 8, 8],
	hat: [32, 0, 8, 8, 8],
	body: [16, 16, 8, 12, 4],
	jacket: [16, 32, 8, 12, 4],
	armR: [40, 16, arm, 12, limbD],
	armL: [32, 48, arm, 12, limbD],
	legR: [0, 16, limb, 12, limbD],
	legL: [16, 48, limb, 12, limbD],
});

const finish = (c: SkinCanvas, e: SkinCanvas | null, build: SkinBuild, overlay: boolean): Skin => ({
	map: dataTexture(c.data, S, S, true),
	emissive: e ? dataTexture(e.data, S, S, true) : null,
	build,
	overlay,
});

// ---------- грифер: тёмное худи, красные светящиеся глаза, красная бандана ----------
const makeGriefer = (): Skin => {
	const c = new SkinCanvas();
	const e = new SkinCanvas();
	const L = layout(4);
	const HOOD: Rgb = [30, 30, 38];
	const HOOD_D: Rgb = [20, 20, 27];
	const FACE: Rgb = [58, 46, 52];
	const RED: Rgb = [200, 28, 30];
	const RED_D: Rgb = [140, 16, 22];
	const PANTS: Rgb = [24, 24, 30];
	const BOOT: Rgb = [84, 16, 20];

	c.part(L.head[0], L.head[1], 8, 8, 8, (face, x, y) => {
		if (face !== 'front') return noisy(face === 'top' ? HOOD : HOOD_D, x, y, 1);
		// тень капюшона, глаза, бандана
		if (y <= 1) return noisy(HOOD, x, y, 1);
		if (x === 0 || x === 7) return noisy(HOOD_D, x, y, 1);
		if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return [255, 44, 40];
		if (y === 2 && (x === 1 || x === 5)) return [70, 20, 26];
		if (y === 2 && (x === 2 || x === 6)) return [40, 14, 20];
		if (y >= 5) return (x + y) % 3 === 0 ? RED_D : RED;
		return noisy(FACE, x, y, 2, 0.08);
	});
	// глаза светятся
	[1, 2, 5, 6].forEach((x) => e.set(L.head[0] + 8 + x, L.head[1] + 8 + 3, [255, 60, 50]));
	// второй слой головы: край капюшона и узел банданы сзади
	c.part(L.hat[0], L.hat[1], 8, 8, 8, (face, x, y) => {
		if (face === 'front') return y === 0 || x === 0 || x === 7 ? k(HOOD, 1.25) : null;
		if (face === 'top') return noisy(k(HOOD, 1.12), x, y, 3);
		if (face === 'back') return y >= 5 && y <= 6 && x >= 3 && x <= 4 ? RED : noisy(k(HOOD, 1.08), x, y, 3);
		if (face === 'bottom') return null;
		return noisy(k(HOOD, 1.08), x, y, 3);
	});
	c.part(L.body[0], L.body[1], 8, 12, 4, (face, x, y) => {
		if (face === 'front') {
			// карман худи и шнурки
			if ((x === 3 || x === 4) && y >= 1 && y <= 4) return [150, 150, 160];
			if (y >= 7 && y <= 9 && x >= 1 && x <= 6) return HOOD_D;
			if (y === 11) return k(HOOD_D, 0.8);
		}
		if (face === 'back' && y >= 3 && y <= 6 && x >= 2 && x <= 5) return (x + y) % 2 === 0 ? RED_D : HOOD;
		return noisy(HOOD, x, y, 4);
	});
	const arm: PartPainter = (face, x, y, _w, h) => {
		if (face === 'bottom') return FACE;
		if (y === 3) return RED;
		if (y >= h - 2) return noisy(FACE, x, y, 5, 0.06);
		if (y === h - 3) return HOOD_D;
		return noisy(HOOD, x, y, 5);
	};
	c.part(L.armR[0], L.armR[1], 4, 12, 4, arm);
	c.part(L.armL[0], L.armL[1], 4, 12, 4, arm);
	const leg: PartPainter = (face, x, y, _w, h) => {
		if (face === 'bottom') return k(BOOT, 0.7);
		if (y >= h - 3) return y === h - 3 ? k(BOOT, 1.25) : BOOT;
		return noisy(PANTS, x, y, 6);
	};
	c.part(L.legR[0], L.legR[1], 4, 12, 4, leg);
	c.part(L.legL[0], L.legL[1], 4, 12, 4, leg);
	return finish(c, e, 'classic', true);
};

// ---------- зомби ----------
const makeZombie = (): Skin => {
	const c = new SkinCanvas();
	const L = layout(4);
	const SKIN: Rgb = [84, 138, 70];
	const SKIN_D: Rgb = [62, 108, 52];
	const SHIRT: Rgb = [34, 146, 150];
	const PANTS: Rgb = [62, 56, 150];
	c.part(L.head[0], L.head[1], 8, 8, 8, (face, x, y) => {
		if (face === 'front') {
			if (y === 4 && (x === 1 || x === 2 || x === 5 || x === 6)) return [16, 16, 16];
			if (y === 5 && (x === 3 || x === 4)) return SKIN_D;
			if (y === 6 && x >= 2 && x <= 5) return [44, 76, 38];
		}
		const blotch = hash3(x >> 1, y >> 1, face.length, 11);
		return noisy(blotch < 0.3 ? SKIN_D : SKIN, x, y, 12, 0.1);
	});
	c.part(L.body[0], L.body[1], 8, 12, 4, (face, x, y) => {
		if (face === 'front' && y <= 1 && x >= 3 && x <= 4) return SKIN;
		if (y >= 10 && hash3(x, y, 1, 13) < 0.4) return k(SHIRT, 0.7);
		return noisy(SHIRT, x, y, 13);
	});
	const arm: PartPainter = (face, x, y) => {
		if (y <= 3 && face !== 'bottom') return noisy(SHIRT, x, y, 14);
		return noisy(hash3(x, y >> 1, 2, 14) < 0.25 ? SKIN_D : SKIN, x, y, 14, 0.1);
	};
	c.part(L.armR[0], L.armR[1], 4, 12, 4, arm);
	c.part(L.armL[0], L.armL[1], 4, 12, 4, arm);
	const leg: PartPainter = (face, x, y, _w, h) => {
		if (y >= h - 2 || face === 'bottom') return [60, 60, 66];
		return noisy(PANTS, x, y, 15);
	};
	c.part(L.legR[0], L.legR[1], 4, 12, 4, leg);
	c.part(L.legL[0], L.legL[1], 4, 12, 4, leg);
	return finish(c, null, 'classic', false);
};

// ---------- скелет: тонкие кости 2x2 ----------
const makeSkeleton = (): Skin => {
	const c = new SkinCanvas();
	const L = layout(2, 2, 2);
	const BONE: Rgb = [204, 204, 200];
	const BONE_D: Rgb = [150, 150, 148];
	const DARK: Rgb = [52, 52, 54];
	c.part(L.head[0], L.head[1], 8, 8, 8, (face, x, y) => {
		if (face === 'front') {
			if ((y === 3 || y === 4) && (x === 1 || x === 2 || x === 5 || x === 6)) return DARK;
			if (y === 5 && (x === 3 || x === 4)) return BONE_D;
			if (y === 6 && x >= 1 && x <= 6) return x % 2 === 0 ? DARK : BONE;
		}
		return noisy(BONE, x, y, 21, 0.1);
	});
	c.part(L.body[0], L.body[1], 8, 12, 4, (face, x, y) => {
		// рёбра: светлые полосы на тёмном фоне, посередине позвоночник
		if (face === 'top' || face === 'bottom') return BONE_D;
		const spine = face === 'front' || face === 'back' ? x === 3 || x === 4 : false;
		if (y % 3 === 0 && y < 9) return noisy(BONE, x, y, 22, 0.08);
		if (y >= 10) return noisy(BONE, x, y, 22, 0.08);
		if (spine) return BONE_D;
		return DARK;
	});
	const limb: PartPainter = (_face, x, y, _w, h) => {
		if (y === 0 || y === h - 1) return BONE;
		return noisy(y === Math.floor(h / 2) ? BONE_D : BONE, x, y, 23, 0.1);
	};
	c.part(L.armR[0], L.armR[1], 2, 12, 2, limb);
	c.part(L.armL[0], L.armL[1], 2, 12, 2, limb);
	c.part(L.legR[0], L.legR[1], 2, 12, 2, limb);
	c.part(L.legL[0], L.legL[1], 2, 12, 2, limb);
	return finish(c, null, 'skeleton', false);
};

const cache = new Map<string, Skin>();
const MAKERS = {griefer: makeGriefer, zombie: makeZombie, skeleton: makeSkeleton};
export type SkinName = keyof typeof MAKERS;

// Нарисованный кодом скин (строится один раз): getSkin('griefer' | 'zombie' | 'skeleton')
export const getSkin = (name: SkinName): Skin => {
	let s = cache.get(name);
	if (!s) {
		s = MAKERS[name]();
		cache.set(name, s);
	}
	return s;
};

// Скин из загруженной картинки (skin.png): imageSkin(assets.skin, 'slim')
export const imageSkin = (map: THREE.Texture, build: SkinBuild = 'slim'): Skin => ({map, emissive: null, build, overlay: true});
