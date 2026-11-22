import * as THREE from 'three';

// Эмоции персонажей. У скина Minecraft лицо — 8x8 пикселей, поэтому эмоция —
// это несколько перекрашенных пикселей на копии скина (координаты в развёртке 64x64).
export type Emotion = 'normal' | 'blink' | 'shock' | 'angry' | 'happy';

type Px = [x: number, y: number, color: string];

// Zako: глаза — одиночные пиксели (9,10) и (14,10), рот с зубами в строке 13
const ZAKO: Record<Exclude<Emotion, 'normal'>, Px[]> = {
	blink: [
		[9, 10, '#7a4436'],
		[10, 10, '#7a4436'],
		[13, 10, '#7a4436'],
		[14, 10, '#7a4436'],
	],
	shock: [
		[9, 9, '#ffffff'],
		[10, 9, '#ffffff'],
		[10, 10, '#ffffff'],
		[9, 10, '#1a1918'],
		[13, 9, '#ffffff'],
		[14, 9, '#ffffff'],
		[13, 10, '#ffffff'],
		[14, 10, '#1a1918'],
		[10, 13, '#3a0d0d'],
		[11, 13, '#6b1818'],
		[12, 13, '#6b1818'],
		[13, 13, '#3a0d0d'],
	],
	angry: [
		[8, 9, '#3b241a'],
		[9, 9, '#3b241a'],
		[10, 10, '#3b241a'],
		[13, 10, '#3b241a'],
		[14, 9, '#3b241a'],
		[15, 9, '#3b241a'],
		[10, 13, '#110601'],
		[11, 13, '#ffffe0'],
		[12, 13, '#ffffe0'],
		[13, 13, '#110601'],
	],
	happy: [
		[9, 10, '#d48977'],
		[9, 9, '#1a1918'],
		[8, 10, '#1a1918'],
		[10, 10, '#1a1918'],
		[14, 10, '#d48977'],
		[14, 9, '#1a1918'],
		[13, 10, '#1a1918'],
		[15, 10, '#1a1918'],
	],
};

// 1DEX1: глаза под чёлкой — (10,12) и (13,12), рот в строке 14
const IDEX: Record<Exclude<Emotion, 'normal'>, Px[]> = {
	blink: [
		[10, 12, '#a06d56'],
		[13, 12, '#a06d56'],
		[10, 13, '#ca9378'],
		[13, 13, '#ca9378'],
	],
	shock: [
		[10, 12, '#ffffff'],
		[13, 12, '#ffffff'],
		[10, 13, '#060404'],
		[13, 13, '#060404'],
		[11, 14, '#5c1a1a'],
		[12, 14, '#5c1a1a'],
	],
	angry: [
		[9, 12, '#060404'],
		[14, 12, '#060404'],
		[11, 15, '#7a4a3a'],
		[12, 15, '#7a4a3a'],
	],
	happy: [
		[10, 12, '#ca9378'],
		[13, 12, '#ca9378'],
		[10, 13, '#060404'],
		[13, 13, '#060404'],
		[10, 14, '#ca9378'],
		[13, 14, '#ca9378'],
		[11, 15, '#8a4a3a'],
		[12, 15, '#8a4a3a'],
	],
};

export const FACE_EDITS = {zako: ZAKO, idex: IDEX};
export type Who = keyof typeof FACE_EDITS;

const skinTexture = (canvas: HTMLCanvasElement) => {
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.magFilter = THREE.NearestFilter;
	tex.minFilter = THREE.NearestFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	return tex;
};

export type SkinSet = Record<Emotion, THREE.Texture>;

export const makeSkinSet = (img: HTMLImageElement, who: Who): SkinSet => {
	const build = (edits: Px[]) => {
		const c = document.createElement('canvas');
		c.width = 64;
		c.height = 64;
		const g = c.getContext('2d')!;
		g.drawImage(img, 0, 0);
		for (const [x, y, color] of edits) {
			g.fillStyle = color;
			g.fillRect(x, y, 1, 1);
		}
		return skinTexture(c);
	};
	const e = FACE_EDITS[who];
	return {
		normal: build([]),
		blink: build(e.blink),
		shock: build(e.shock),
		angry: build(e.angry),
		happy: build(e.happy),
	};
};
