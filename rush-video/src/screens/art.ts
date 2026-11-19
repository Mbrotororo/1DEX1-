import {clamp01, hexToRgb, lerp, type RGB} from '../core/anim';
import {fbm2, hash3} from '../core/rng';
import {once} from '../core/scene';
import {screenAssets} from './assets';
import {circle, fillRR, rrect, type Ctx} from './draw';

// Пиксельные картинки экранов: обои (зимний пейзаж), текстуры земли и камня, значки приложений,
// лицо героя (аватар), кадр игры (заснеженный спавн). Статичное строится один раз (once).

const canvas = (w: number, h: number) => {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
};

const mix = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
// цвет '#rrggbb' -> [r, g, b] 0..255
const C = (hex: string): RGB => mul(hexToRgb(hex), 255);

// Холст из попиксельной функции
const paintPixels = (w: number, h: number, fn: (x: number, y: number) => RGB | null) => {
	const c = canvas(w, h);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(w, h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const col = fn(x, y);
			if (!col) continue;
			const i = (y * w + x) * 4;
			img.data[i] = col[0];
			img.data[i + 1] = col[1];
			img.data[i + 2] = col[2];
			img.data[i + 3] = 255;
		}
	ctx.putImageData(img, 0, 0);
	return c;
};

// Растянуть пиксельную картинку без сглаживания
export const blitPixels = (ctx: Ctx, src: CanvasImageSource, x: number, y: number, w: number, h: number, sx = 0, sy = 0, sw?: number, sh?: number) => {
	const prev = ctx.imageSmoothingEnabled;
	ctx.imageSmoothingEnabled = false;
	if (sw !== undefined && sh !== undefined) ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
	else ctx.drawImage(src, x, y, w, h);
	ctx.imageSmoothingEnabled = prev;
};

// ---------- обои: зимний пейзаж на закате (320x180 пикселей-«точек») ----------
const SKY: RGB[] = ['#24305f', '#33437a', '#4a5791', '#6a6ea6', '#9283b0', '#c093a8', '#e7a59a', '#f6bd94', '#ffd5a2'].map(C);

export const getWallpaper = once(() => {
	const W = 320;
	const H = 180;
	const farTop = (x: number) => 104 - Math.round(fbm2(Math.floor(x / 4) * 0.09, 3.1, 3, 11) * 46);
	const midTop = (x: number) => 128 - Math.round(fbm2(Math.floor(x / 6) * 0.11, 7.7, 3, 12) * 28);
	const nearTop = (x: number) => 156 - (fbm2(Math.floor(x / 10) * 0.13, 1.3, 2, 13) > 0.55 ? 10 : 0);
	// ели на среднем плане
	const trees: {x: number; h: number}[] = [];
	for (let i = 0, x = 6; x < W; i++) {
		trees.push({x, h: 14 + Math.floor(hash3(i, 1, 2, 31) * 12)});
		x += 9 + Math.floor(hash3(i, 2, 3, 31) * 26);
	}
	const sun = {x: 232, y: 96, r: 8};
	return paintPixels(W, H, (x, y) => {
		// небо полосами с дизерингом
		const f = clamp01(y / 118) * (SKY.length - 1);
		const i0 = Math.floor(f);
		const dither = ((x + y) & 1) === 0 ? 0.25 : -0.25;
		let col = SKY[Math.min(SKY.length - 1, Math.max(0, Math.round(f + dither * (f - i0 > 0.3 && f - i0 < 0.7 ? 1 : 0))))];
		// солнце и ореол
		const ds = Math.max(Math.abs(x - sun.x), Math.abs(y - sun.y));
		if (ds <= sun.r) col = C('#fff3d6');
		else if (ds <= sun.r + 6) col = mix(col, C('#ffe2b0'), 0.45 * (1 - (ds - sun.r) / 6));
		// облака-блоки
		const cl = fbm2(Math.floor(x / 6) * 0.35 + 3, Math.floor(y / 3) * 0.6, 2, 14);
		if (y > 18 && y < 70 && cl > 0.66) col = mix(col, C('#f7d7d2'), 0.55);
		// дальние горы
		const ft = farTop(x);
		if (y >= ft) {
			const snow = y - ft < 5 + (Math.floor(x / 4) % 3);
			col = snow ? C('#dfe2f4') : mix(C('#8f93c2'), C('#b9a7c4'), clamp01((y - ft) / 40));
			col = mix(col, C('#e9b7a6'), 0.25);
		}
		// средние холмы (снег) и ели
		const mt = midTop(x);
		if (y >= mt) {
			const d = y - mt;
			col = d < 6 ? C('#eef2ff') : mix(C('#cdd5ef'), C('#8e95c0'), clamp01((d - 6) / 30));
			if (hash3(Math.floor(x / 2), Math.floor(y / 2), 0, 15) > 0.85) col = mul(col, 0.94);
		}
		for (const tr of trees) {
			const base = midTop(tr.x) + 1;
			const dx = x - tr.x;
			const dy = base - y;
			if (dy < 0 || dy > tr.h || Math.abs(dx) > 6) continue;
			if (dy < 3 && dx === 0) col = C('#4d3626');
			else if (dy >= 2) {
				const hw = Math.floor((tr.h - dy) / 3.2) + 1;
				const hwUp = Math.floor((tr.h - dy - 1) / 3.2) + 1;
				if (Math.abs(dx) <= hw) col = Math.abs(dx) > hwUp || dy === tr.h ? C('#f2f6ff') : hash3(x, y, 1, 16) > 0.8 ? C('#3b5a45') : C('#2a4334');
			}
		}
		// передний план: заснеженные блоки 10x10
		const nt = nearTop(x);
		if (y >= nt) {
			const bx = Math.floor(x / 10);
			const by = Math.floor((y - nt) / 10);
			const lx = x % 10;
			const ly = (y - nt) % 10;
			const n = hash3(x, y, 2, 17);
			if (by === 0 && ly < 3 + (n > 0.7 ? 1 : 0)) col = n > 0.85 ? C('#dfe8fb') : C('#f7f9ff');
			else if (by === 0) col = n > 0.6 ? C('#7a5638') : C('#6a4a31');
			else col = n > 0.5 ? C('#5f6066') : C('#6e6f76');
			if (lx === 0 || ly === 0) col = mul(col, 0.88);
			col = mul(col, 1 - by * 0.12 - (hash3(bx, by, 3, 18) * 0.06));
		}
		// лёгкая виньетка снизу
		return mul(col, 1 - clamp01((y - 150) / 60) * 0.35);
	});
});

// ---------- текстуры 16x16 ----------
export const getDirt = once(() =>
	paintPixels(16, 16, (x, y) => {
		const n = hash3(x, y, 0, 41);
		const base = n > 0.82 ? C('#5d4130') : n > 0.55 ? C('#866043') : n > 0.25 ? C('#79553a') : C('#966c4a');
		return hash3(x, y, 1, 42) > 0.93 ? C('#9e9e9e') : base;
	}),
);
export const getStone = once(() =>
	paintPixels(16, 16, (x, y) => {
		const n = hash3(x, y, 0, 43);
		return n > 0.8 ? C('#8a8a8a') : n > 0.45 ? C('#7d7d7d') : n > 0.15 ? C('#737373') : C('#666666');
	}),
);

// Замостить область текстурой (тексель = texel логических px), с затемнением dark 0..1
export const tile = (ctx: Ctx, src: HTMLCanvasElement, x: number, y: number, w: number, h: number, texel: number, dark = 0) => {
	const ts = src.width * texel;
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	for (let ty = y; ty < y + h; ty += ts) for (let tx = x; tx < x + w; tx += ts) blitPixels(ctx, src, tx, ty, ts + 0.5, ts + 0.5);
	if (dark > 0) {
		ctx.fillStyle = `rgba(0,0,0,${dark})`;
		ctx.fillRect(x, y, w, h);
	}
	ctx.restore();
};

// ---------- значок «блок травы» (изометрия), 96x96 ----------
export const getGrassIcon = once(() => {
	const S = 96;
	const c = canvas(S, S);
	const ctx = c.getContext('2d')!;
	const N = 8;
	const cx = S / 2;
	const top = 6;
	const a = 41;
	const hgt = 46;
	// вершины: верх-ромб и две боковые грани; тексель — параллелограмм
	const P = (u: number, v: number, face: 0 | 1 | 2): [number, number] => {
		if (face === 0) return [cx + (u - v) * (a / N), top + (u + v) * (a / N) * 0.5];
		if (face === 1) return [cx - a + u * (a / N), top + a * 0.5 + u * (a / N) * 0.5 + v * (hgt / N)];
		return [cx + u * (a / N), top + a + -u * (a / N) * 0.5 + v * (hgt / N)];
	};
	for (const face of [0, 1, 2] as const)
		for (let v = 0; v < N; v++)
			for (let u = 0; u < N; u++) {
				const n = hash3(u, v, face, 51);
				let col: RGB;
				if (face === 0) col = n > 0.7 ? C('#7fbf4a') : n > 0.3 ? C('#6aa83b') : C('#5b9632');
				else if (v < 2 || (v === 2 && n > 0.55)) col = n > 0.5 ? C('#6aa83b') : C('#5b9632');
				else col = n > 0.75 ? C('#5d4130') : n > 0.35 ? C('#866043') : C('#79553a');
				col = mul(col, face === 0 ? 1 : face === 1 ? 0.8 : 0.62);
				const p = [P(u, v, face), P(u + 1, v, face), P(u + 1, v + 1, face), P(u, v + 1, face)];
				ctx.fillStyle = `rgb(${col.map((v) => Math.round(v)).join(',')})`;
				ctx.beginPath();
				p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
				ctx.closePath();
				ctx.fill();
				ctx.strokeStyle = ctx.fillStyle;
				ctx.lineWidth = 0.6;
				ctx.stroke();
			}
	return c;
});

// ---------- значки приложений (векторные, упрощённые, не настоящие логотипы) ----------
// «Чат»: фиолетовый круг с белым «геймпадом-смайликом»
export const drawChatIcon = (ctx: Ctx, x: number, y: number, size: number, rounded = 0.5) => {
	const r = size / 2;
	fillRR(ctx, x - r, y - r, size, size, size * rounded, '#5865f2');
	const w = size * 0.56;
	const h = size * 0.36;
	const top = y - h * 0.55;
	ctx.fillStyle = '#ffffff';
	// корпус с «ручками» снизу
	rrect(ctx, x - w / 2, top, w, h, h * 0.42);
	ctx.fill();
	circle(ctx, x - w * 0.36, top + h * 0.82, h * 0.3, '#ffffff');
	circle(ctx, x + w * 0.36, top + h * 0.82, h * 0.3, '#ffffff');
	// глаза
	circle(ctx, x - w * 0.19, top + h * 0.5, h * 0.15, '#5865f2');
	circle(ctx, x + w * 0.19, top + h * 0.5, h * 0.15, '#5865f2');
};

// «Запись»: тёмный круг с тремя точками
export const drawRecIcon = (ctx: Ctx, x: number, y: number, size: number) => {
	const r = size / 2;
	circle(ctx, x, y, r, '#e9e9ee');
	circle(ctx, x, y, r * 0.9, '#2b2a30');
	for (let i = 0; i < 3; i++) {
		const a = -Math.PI / 2 + (i * Math.PI * 2) / 3 + 0.35;
		const px = x + Math.cos(a) * r * 0.42;
		const py = y + Math.sin(a) * r * 0.42;
		circle(ctx, px, py, r * 0.25, '#e9e9ee');
		circle(ctx, px + Math.cos(a + 1.6) * r * 0.06, py + Math.sin(a + 1.6) * r * 0.06, r * 0.1, '#2b2a30');
	}
};

// Лицо героя из скина (8x8 + слой шапки), size — сторона квадрата
export const drawHeroFace = (ctx: Ctx, x: number, y: number, size: number) => {
	const a = screenAssets();
	if (!a) {
		ctx.fillStyle = '#2a2230';
		ctx.fillRect(x, y, size, size);
		return;
	}
	blitPixels(ctx, a.skin, x, y, size, size, 8, 8, 8, 8);
	blitPixels(ctx, a.skin, x, y, size, size, 40, 8, 8, 8);
};

// Круглый аватар героя (фон — фиолетовый, как худи)
export const drawHeroAvatar = (ctx: Ctx, x: number, y: number, r: number) => {
	ctx.save();
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.clip();
	ctx.fillStyle = '#6b4fa8';
	ctx.fillRect(x - r, y - r, r * 2, r * 2);
	drawHeroFace(ctx, x - r * 0.78, y - r * 0.82, r * 1.56);
	ctx.restore();
};

// Простой кружок-аватар с цветом (другие участники)
export const drawDotAvatar = (ctx: Ctx, x: number, y: number, r: number, color: string) => {
	circle(ctx, x, y, r, color);
	circle(ctx, x, y - r * 0.18, r * 0.32, 'rgba(255,255,255,0.85)');
	ctx.save();
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.clip();
	circle(ctx, x, y + r * 0.72, r * 0.55, 'rgba(255,255,255,0.85)');
	ctx.restore();
};
