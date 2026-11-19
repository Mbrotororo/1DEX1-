import {clamp01, easeInOutCubic, easeOutCubic} from '../core/anim';
import {hash1} from '../core/rng';
import {UI_FONT} from './assets';

// Общие помощники рисования экранов. Логический экран — 1280x720 (16:9); холст любого размера
// получает масштаб через paintScreen(). Всё — чистые функции времени.

export const SW = 1280;
export const SH = 720;

export type Ctx = CanvasRenderingContext2D;
// Функция экрана: рисует кадр в логических координатах 1280x720 в момент t (секунды)
export type ScreenDraw = (ctx: Ctx, t: number) => void;

// Нарисовать экран на холст любого размера (16:9): масштаб, сброс состояния, чёрный фон
export const paintScreen = (ctx: Ctx, draw: ScreenDraw, t: number) => {
	const c = ctx.canvas;
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.setTransform(c.width / SW, 0, 0, c.height / SH, 0, 0);
	ctx.imageSmoothingEnabled = true;
	draw(ctx, t);
	ctx.restore();
};

// ---------- фигуры ----------
export const rrect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
};
export const fillRR = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) => {
	ctx.fillStyle = color;
	rrect(ctx, x, y, w, h, r);
	ctx.fill();
};
export const fillRect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
	ctx.fillStyle = color;
	ctx.fillRect(x, y, w, h);
};
export const circle = (ctx: Ctx, x: number, y: number, r: number, color: string) => {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
};
export const ring = (ctx: Ctx, x: number, y: number, r: number, width: number, color: string) => {
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.stroke();
};
export const withAlpha = (ctx: Ctx, a: number, fn: () => void) => {
	if (a <= 0.001) return;
	ctx.save();
	ctx.globalAlpha *= Math.min(1, a);
	fn();
	ctx.restore();
};

// ---------- текст интерфейса (Inter) ----------
export type TextOpts = {size?: number; weight?: number; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; alpha?: number; maxWidth?: number};
export const uiFont = (weight: number, size: number) => `${weight} ${size}px ${UI_FONT}, sans-serif`;
export const text = (ctx: Ctx, s: string, x: number, y: number, o: TextOpts = {}) => {
	const {size = 14, weight = 400, color = '#ffffff', align = 'left', baseline = 'middle', alpha = 1, maxWidth} = o;
	if (alpha <= 0) return;
	ctx.save();
	ctx.globalAlpha *= alpha;
	ctx.font = uiFont(weight, size);
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.textBaseline = baseline;
	ctx.fillText(s, x, y, maxWidth);
	ctx.restore();
};
export const textW = (ctx: Ctx, s: string, size: number, weight = 400) => {
	ctx.save();
	ctx.font = uiFont(weight, size);
	const w = ctx.measureText(s).width;
	ctx.restore();
	return w;
};

// «Нечитаемый текст»: слова-плашки на месте второстепенных подписей (в кадре нет лишних надписей).
// (x, y) — левый край и середина строки; h — высота строчных букв; seed — какие слова.
export const greek = (ctx: Ctx, x: number, y: number, maxW: number, h: number, color: string, seed: number, opts: {words?: number; alpha?: number} = {}) => {
	const {words = 3, alpha = 1} = opts;
	ctx.save();
	ctx.globalAlpha *= alpha;
	ctx.fillStyle = color;
	let cx = x;
	for (let i = 0; i < words; i++) {
		const w = h * (1.6 + hash1(i, seed) * 3.6);
		if (cx + w > x + maxW) break;
		rrect(ctx, cx, y - h / 2, w, h, h / 2);
		ctx.fill();
		cx += w + h * 0.9;
	}
	ctx.restore();
	return cx - x;
};

// ---------- курсор и клики ----------
export type CursorKey = {t: number; x: number; y: number};
export type Click = {t: number; x: number; y: number};

// Положение курсора по ключам: между ключами — плавно, с лёгкой дугой (как рукой)
export const cursorAt = (keys: CursorKey[], t: number): [number, number] => {
	if (t <= keys[0].t) return [keys[0].x, keys[0].y];
	for (let i = 1; i < keys.length; i++) {
		const a = keys[i - 1];
		const b = keys[i];
		if (t < b.t) {
			const k = easeInOutCubic((t - a.t) / (b.t - a.t));
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const arc = Math.sin(Math.PI * k) * 0.12;
			return [a.x + dx * k - dy * arc, a.y + dy * k + dx * arc];
		}
	}
	const l = keys[keys.length - 1];
	return [l.x, l.y];
};

// Нажата ли кнопка мыши (для «вдавленного» вида кнопок): 1 сразу после клика, гаснет за 0.12 с
export const pressAt = (clicks: Click[], t: number) => {
	let p = 0;
	for (const c of clicks) if (t >= c.t && t < c.t + 0.12) p = Math.max(p, 1 - (t - c.t) / 0.12);
	return p;
};

// Сколько секунд прошло после последнего клика рядом с точкой (Infinity — не было)
export const sinceClick = (clicks: Click[], t: number) => {
	let s = Infinity;
	for (const c of clicks) if (t >= c.t) s = Math.min(s, t - c.t);
	return s;
};

// Круги-«волны» от кликов
export const drawRipples = (ctx: Ctx, clicks: Click[], t: number, color = '#ffffff') => {
	for (const c of clicks) {
		const dt = t - c.t;
		if (dt < 0 || dt > 0.45) continue;
		const k = dt / 0.45;
		const r = 8 + easeOutCubic(k) * 30;
		withAlpha(ctx, (1 - k) * 0.85, () => ring(ctx, c.x, c.y, r, 3 * (1 - k) + 1, color));
		withAlpha(ctx, (1 - k) * 0.35, () => circle(ctx, c.x, c.y, r * 0.55, color));
	}
};

// Пиксельная стрелка курсора: B — контур, W — заливка
const ARROW = [
	'B...........',
	'BB..........',
	'BWB.........',
	'BWWB........',
	'BWWWB.......',
	'BWWWWB......',
	'BWWWWWB.....',
	'BWWWWWWB....',
	'BWWWWWWWB...',
	'BWWWWWWWWB..',
	'BWWWWWWWWWB.',
	'BWWWWWWBBBBB',
	'BWWWBWWB....',
	'BWWBBWWB....',
	'BWB..BWWB...',
	'BB...BWWB...',
	'B.....BWWB..',
	'......BWWB..',
	'.......BB...',
];

// Курсор: (x, y) — кончик стрелки; press 0..1 — чуть сжимается при клике
export const drawCursor = (ctx: Ctx, x: number, y: number, press = 0, scale = 1.6, alpha = 1) => {
	if (alpha <= 0) return;
	const m = ctx.getTransform();
	const s = Math.hypot(m.a, m.b);
	const p = Math.max(1, Math.round(scale * s * (1 - press * 0.12)));
	const ox = Math.round(m.e + x * s);
	const oy = Math.round(m.f + y * s);
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha *= alpha;
	// мягкая тень
	ctx.fillStyle = 'rgba(0,0,0,0.28)';
	ARROW.forEach((row, r) => [...row].forEach((c, i) => c !== '.' && ctx.fillRect(ox + i * p + p, oy + r * p + p * 1.5, p, p)));
	ARROW.forEach((row, r) =>
		[...row].forEach((c, i) => {
			if (c === '.') return;
			ctx.fillStyle = c === 'B' ? '#000000' : '#ffffff';
			ctx.fillRect(ox + i * p, oy + r * p, p, p);
		}),
	);
	ctx.restore();
};

// ---------- анимации окон ----------
// Появление окна: масштаб от 0.94 и прозрачность за dur секунд (как alt-tab/открытие)
export const windowIn = (t: number, at: number, dur = 0.14) => {
	const k = easeOutCubic(clamp01((t - at) / dur));
	return {k, scale: 0.94 + 0.06 * k, alpha: k};
};
// Выполнить fn с масштабом вокруг точки (cx, cy)
export const scaled = (ctx: Ctx, s: number, cx: number, cy: number, fn: () => void) => {
	ctx.save();
	ctx.translate(cx, cy);
	ctx.scale(s, s);
	ctx.translate(-cx, -cy);
	fn();
	ctx.restore();
};
