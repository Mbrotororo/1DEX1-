import {clamp01, hexToRgb, lerp, type RGB} from '../core/anim';
import {fbm2, hash3, noise1} from '../core/rng';
import {once} from '../core/scene';
import {blitPixels} from './art';
import type {Ctx} from './draw';

// Кадр игры: заснеженный спавн глазами игрока. Простая псевдо-3D отрисовка кубов на маленький холст
// 480x270, затем растягивается без сглаживания — получается «пиксельный» игровой кадр.

type Cube = {x: number; y: number; z: number; kind: 'brick' | 'log' | 'leaf' | 'lantern' | 'chisel'};

const GW = 480;
const GH = 270;

const getWorld = once(() => {
	const cubes: Cube[] = [];
	const occ = new Set<string>();
	const put = (x: number, y: number, z: number, kind: Cube['kind']) => {
		const k = `${x},${y},${z}`;
		if (occ.has(k)) return;
		occ.add(k);
		cubes.push({x, y, z, kind});
	};
	// площадка спавна 9x9 из каменного кирпича, в центре — резной камень
	for (let x = -4; x <= 4; x++) for (let z = 5; z <= 13; z++) put(x, 0, z, Math.abs(x) <= 1 && Math.abs(z - 9) <= 1 ? 'chisel' : 'brick');
	// столбы с фонарями по углам
	for (const [x, z] of [[-4, 5], [4, 5], [-4, 13], [4, 13]]) {
		for (let y = 1; y <= 2; y++) put(x, y, z, 'brick');
		put(x, 3, z, 'lantern');
	}
	// ели
	const trees: [number, number, number][] = [[-8, 4, 6], [8, 7, 7], [-10, 12, 7], [11, 14, 6], [-6, 19, 8], [6, 21, 7], [-14, 24, 8], [15, 26, 8], [0, 28, 9], [-9, 0, 6]];
	for (const [tx, tz, h] of trees) {
		for (let y = 0; y < h; y++) put(tx, y, tz, 'log');
		for (let y = 2; y <= h; y++) {
			const r = Math.max(0, Math.floor((h - y) / 2.2));
			for (let dx = -r; dx <= r; dx++)
				for (let dz = -r; dz <= r; dz++) {
					if (Math.abs(dx) + Math.abs(dz) > r + (y % 2)) continue;
					if (dx === 0 && dz === 0 && y < h) continue;
					put(tx + dx, y, tz + dz, 'leaf');
				}
		}
		put(tx, h + 1, tz, 'leaf');
	}
	return {cubes, occ};
});

const COL: Record<Cube['kind'], {top: RGB; side: RGB}> = {
	brick: {top: hexToRgb('#e9eef8'), side: hexToRgb('#8b8d93')},
	chisel: {top: hexToRgb('#b9bcc4'), side: hexToRgb('#9a9ca3')},
	log: {top: hexToRgb('#6b4f33'), side: hexToRgb('#4b3523')},
	leaf: {top: hexToRgb('#f3f7ff'), side: hexToRgb('#2f4c3b')},
	lantern: {top: hexToRgb('#ffd27a'), side: hexToRgb('#ffb84a')},
};
const SKY_TOP = hexToRgb('#6f9ad8');
const SKY_LOW = hexToRgb('#dce8f6');
const FOG = hexToRgb('#d9e4f2');

// цвета 0..1 -> CSS
const rgb = (c: RGB) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
const mixc = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const mulc = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

const getCanvas = once(() => {
	const c = document.createElement('canvas');
	c.width = GW;
	c.height = GH;
	return {c, ctx: c.getContext('2d')!, last: NaN};
});

// Отрисовать кадр игры в момент t на внутренний холст 480x270 (повторный вызов с тем же t — бесплатно)
export const renderGame = (t: number): HTMLCanvasElement => {
	const g = getCanvas();
	if (g.last === t) return g.c;
	g.last = t;
	const ctx = g.ctx;
	const {cubes, occ} = getWorld();
	// камера игрока: медленно оглядывается
	const yaw = 0.22 * Math.sin(t * 0.45) + noise1(t * 0.3, 5) * 0.04;
	const pitch = 0.2 + noise1(t * 0.25, 6) * 0.02;
	const cam = {x: 0.5, y: 3.4 + Math.sin(t * 2.2) * 0.012, z: -1.5};
	const f = GW * 0.62;
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const cp = Math.cos(pitch);
	const sp = Math.sin(pitch);
	const proj = (x: number, y: number, z: number): [number, number, number] => {
		const dx = x - cam.x;
		const dy = y - cam.y;
		const dz = z - cam.z;
		const x1 = dx * cy - dz * sy;
		const z1 = dx * sy + dz * cy;
		const y2 = dy * cp + z1 * sp;
		const z2 = -dy * sp + z1 * cp;
		return [GW / 2 + (f * x1) / z2, GH / 2 - (f * y2) / z2, z2];
	};
	// небо
	const horizon = GH / 2 - f * Math.tan(pitch);
	const sky = ctx.createLinearGradient(0, 0, 0, horizon);
	sky.addColorStop(0, rgb(SKY_TOP));
	sky.addColorStop(1, rgb(SKY_LOW));
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, GW, GH);
	// облака-блоки
	ctx.fillStyle = 'rgba(255,255,255,0.85)';
	for (let i = 0; i < 7; i++) {
		const x = ((hash3(i, 0, 0, 61) * 900 + t * 6 - yaw * f) % 900) - 200;
		const y = 12 + hash3(i, 1, 0, 61) * 50;
		const w = 40 + hash3(i, 2, 0, 61) * 70;
		ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 10);
		ctx.fillRect(Math.round(x + w * 0.2), Math.round(y - 6), Math.round(w * 0.5), 6);
	}
	// дальние холмы по углу взгляда
	for (let sx = 0; sx < GW; sx += 2) {
		const ang = yaw + Math.atan((sx - GW / 2) / f);
		const hFar = 10 + fbm2(Math.floor(ang * 40) * 0.12, 1, 3, 62) * 34;
		const hNear = 4 + fbm2(Math.floor(ang * 30) * 0.15, 5, 3, 63) * 16;
		ctx.fillStyle = '#b8c6de';
		ctx.fillRect(sx, horizon - hFar, 2, hFar + 2);
		ctx.fillStyle = '#e8eef8';
		ctx.fillRect(sx, horizon - hFar, 2, 3);
		ctx.fillStyle = '#9fb0cc';
		ctx.fillRect(sx, horizon - hNear, 2, hNear + 2);
		ctx.fillStyle = '#eef3fb';
		ctx.fillRect(sx, horizon - hNear, 2, 2);
	}
	// снежная земля
	const gnd = ctx.createLinearGradient(0, horizon, 0, GH);
	gnd.addColorStop(0, rgb(FOG));
	gnd.addColorStop(1, '#f4f7fd');
	ctx.fillStyle = gnd;
	ctx.fillRect(0, horizon, GW, GH - horizon);
	// швы блоков на земле рядом с камерой
	ctx.strokeStyle = 'rgba(150,170,205,0.35)';
	ctx.lineWidth = 1;
	for (let z = 0; z <= 22; z++) {
		const a = proj(-30, 0, z);
		const b = proj(30, 0, z);
		if (a[2] < 0.3) continue;
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
	}
	for (let x = -14; x <= 15; x++) {
		const a = proj(x, 0, 0);
		const b = proj(x, 0, 22);
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
	}
	// кубы: от дальних к ближним, только видимые грани
	const order = cubes
		.map((c) => ({c, d: (c.x + 0.5 - cam.x) ** 2 + (c.y + 0.5 - cam.y) ** 2 + (c.z + 0.5 - cam.z) ** 2}))
		.sort((a, b) => b.d - a.d);
	const has = (x: number, y: number, z: number) => occ.has(`${x},${y},${z}`);
	const glows: [number, number, number][] = [];
	for (const {c, d} of order) {
		const col = COL[c.kind];
		const fog = clamp01((Math.sqrt(d) - 16) / 40) * 0.7;
		const faces: [number, number, number][][] = [];
		const shades: RGB[] = [];
		const {x, y, z} = c;
		if (cam.y > y + 1 && !has(x, y + 1, z)) {
			faces.push([[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]);
			shades.push(c.kind === 'brick' && hash3(x, y, z, 64) > 0.7 ? mulc(col.side, 1.15) : col.top);
		}
		if (cam.z < z && !has(x, y, z - 1)) {
			faces.push([[x, y, z], [x + 1, y, z], [x + 1, y + 1, z], [x, y + 1, z]]);
			shades.push(mulc(col.side, 0.86));
		}
		if (cam.x < x && !has(x - 1, y, z)) {
			faces.push([[x, y, z], [x, y, z + 1], [x, y + 1, z + 1], [x, y + 1, z]]);
			shades.push(mulc(col.side, 0.68));
		}
		if (cam.x > x + 1 && !has(x + 1, y, z)) {
			faces.push([[x + 1, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z]]);
			shades.push(mulc(col.side, 0.74));
		}
		faces.forEach((face, i) => {
			const p = face.map(([a, b, cc]) => proj(a, b, cc));
			if (p.some((q) => q[2] < 0.25)) return;
			const n = hash3(x, y + i, z, 65) * 0.1 - 0.05;
			ctx.fillStyle = rgb(mixc(mulc(shades[i], 1 + n), FOG, c.kind === 'lantern' ? 0 : fog));
			ctx.beginPath();
			p.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
			ctx.closePath();
			ctx.fill();
			if (fog < 0.5 && c.kind !== 'leaf') {
				ctx.strokeStyle = 'rgba(40,40,50,0.18)';
				ctx.stroke();
			}
		});
		if (c.kind === 'lantern') glows.push(proj(x + 0.5, y + 0.5, z + 0.5));
	}
	// ореолы фонарей
	ctx.globalCompositeOperation = 'lighter';
	for (const [gx, gy, gz] of glows) {
		if (gz < 0.3) continue;
		const r = (f * 1.4) / gz;
		const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
		grad.addColorStop(0, 'rgba(255,190,90,0.55)');
		grad.addColorStop(1, 'rgba(255,190,90,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
	}
	ctx.globalCompositeOperation = 'source-over';
	// прицел
	ctx.fillStyle = 'rgba(255,255,255,0.85)';
	ctx.fillRect(GW / 2 - 4, GH / 2 - 0.5, 9, 1);
	ctx.fillRect(GW / 2 - 0.5, GH / 2 - 4, 1, 9);
	return g.c;
};

// Нарисовать кадр игры в прямоугольник экрана
export const drawGame = (ctx: Ctx, t: number, x: number, y: number, w: number, h: number) => {
	blitPixels(ctx, renderGame(t), x, y, w, h);
};
