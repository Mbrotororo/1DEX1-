import {clamp01, easeOutCubic} from '../core/anim';
import {blitPixels, getDirt, getGrassIcon, getStone, getWallpaper, tile} from './art';
import {screenAssets} from './assets';
import {fillRect, withAlpha, type Ctx} from './draw';
import {drawGame} from './game';
import {drawPixelText, pixelWidthOn} from './pixelfont';

// Интерфейс Minecraft (масштаб интерфейса 3, как в игре при 720p): загрузка, главное меню,
// «Сетевая игра» со строкой сервера HolyWorld, подключение. Шрифт — пиксельный шрифт ядра.

const U = 3; // логических px на пиксель интерфейса игры

// ---------- кнопка ----------
export type McButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';

// Кнопка в стиле игры. label = null — надпись-заглушка (seed — какая)
export const mcButton = (ctx: Ctx, x: number, y: number, w: number, h: number, label: string | null, state: McButtonState = 'normal', seed = 0) => {
	// камень + рамка
	tile(ctx, getStone(), x, y, w, h, U, state === 'disabled' ? 0.55 : 0.12);
	if (state === 'hover' || state === 'pressed') {
		ctx.fillStyle = state === 'pressed' ? 'rgba(70,90,190,0.45)' : 'rgba(110,130,230,0.38)';
		ctx.fillRect(x, y, w, h);
	}
	// фаска: светлый верх-лево, тёмный низ-право
	fillRect(ctx, x, y, w, U, 'rgba(255,255,255,0.35)');
	fillRect(ctx, x, y, U, h, 'rgba(255,255,255,0.25)');
	fillRect(ctx, x, y + h - U * 2, w, U * 2, 'rgba(0,0,0,0.38)');
	fillRect(ctx, x + w - U, y, U, h, 'rgba(0,0,0,0.3)');
	// контур
	ctx.strokeStyle = state === 'hover' || state === 'pressed' ? '#ffffff' : '#000000';
	ctx.lineWidth = U;
	ctx.strokeRect(x - U / 2, y - U / 2, w + U, h + U);
	const color = state === 'disabled' ? '#a0a0a0' : state === 'hover' || state === 'pressed' ? '#ffffa0' : '#e0e0e0';
	const ty = y + h / 2 - 3.5 * U - U * 0.5 + (state === 'pressed' ? U * 0.5 : 0);
	if (label) drawPixelText(ctx, label, x + w / 2, ty, {px: U, color, align: 'center'});
	else mcGreek(ctx, x + w / 2, ty + U * 2, w * 0.55, color, seed, 'center');
};

// Пиксельная «заглушка» текста (на месте второстепенных надписей)
export const mcGreek = (ctx: Ctx, x: number, y: number, maxW: number, color: string, seed: number, align: 'left' | 'center' = 'left', alpha = 0.7) => {
	const words = [0, 1, 2].map((i) => Math.round((12 + ((seed * 37 + i * 53) % 23)) / U) * U);
	let total = 0;
	const use: number[] = [];
	for (const w of words) {
		if (total + w > maxW) break;
		use.push(w);
		total += w + U * 3;
	}
	total -= U * 3;
	let cx = align === 'center' ? x - total / 2 : x;
	withAlpha(ctx, alpha, () => {
		for (const w of use) {
			fillRect(ctx, cx + U, y + U, w, U * 4, '#2a2a2a');
			fillRect(ctx, cx, y, w, U * 4, color);
			cx += w + U * 3;
		}
	});
};

// ---------- загрузка ----------
// Экран загрузки: красный фон, значок травы, полоса прогресса p 0..1
export const drawMcLoading = (ctx: Ctx, p: number) => {
	fillRect(ctx, 0, 0, 1280, 720, '#ef323d');
	ctx.drawImage(getGrassIcon(), 640 - 90, 210, 180, 180);
	const bw = 600;
	const bx = 640 - bw / 2;
	const by = 470;
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 3;
	ctx.strokeRect(bx, by, bw, 30);
	fillRect(ctx, bx + 6, by + 6, (bw - 12) * clamp01(p), 18, '#ffffff');
};

// Прогресс загрузки «рывками» (как у игры): чистая функция k 0..1
export const loadingCurve = (k: number) => {
	const x = clamp01(k);
	return clamp01(x * 0.82 + Math.sin(x * 9.3) * 0.05 + (x > 0.92 ? (x - 0.92) * 2.2 : 0));
};

// ---------- главное меню ----------
// Кнопки главного меню (логические px): x, y, w, h
export const MC_MENU = {
	single: [340, 324, 600, 60],
	multi: [340, 396, 600, 60],
	realms: [340, 468, 600, 60],
	options: [340, 576, 294, 60],
	quit: [646, 576, 294, 60],
} as const;

const panorama = (ctx: Ctx, t: number, dark = 0.25) => {
	// панорама: обои, медленно плывут
	const w = 1280 * 1.3;
	const off = ((t * 14) % (w - 1280)) | 0;
	blitPixels(ctx, getWallpaper(), -off, -40, w, 720 * 1.3);
	ctx.fillStyle = `rgba(0,0,0,${dark})`;
	ctx.fillRect(0, 0, 1280, 720);
};

export const drawMcMenu = (ctx: Ctx, t: number, hoverMulti: boolean, press = 0) => {
	panorama(ctx, t, 0.22);
	// заголовок: значок травы и «Minecraft» пиксельным шрифтом (не логотип игры)
	const title = 'Minecraft';
	const px = 9;
	const tw = pixelWidthOn(ctx, title, px);
	const iw = 120;
	const x0 = 640 - (tw + iw + 24) / 2;
	ctx.drawImage(getGrassIcon(), x0, 92, iw, iw);
	drawPixelText(ctx, title, x0 + iw + 24 + 4, 128 + 4, {px, color: '#3a3a3a', shadow: null});
	drawPixelText(ctx, title, x0 + iw + 24, 128, {px, color: '#f0f0f0', shadow: '#555555'});
	const b = MC_MENU;
	mcButton(ctx, ...b.single, null, 'normal', 1);
	mcButton(ctx, ...b.multi, 'Сетевая игра', hoverMulti ? (press > 0 ? 'pressed' : 'hover') : 'normal');
	mcButton(ctx, ...b.realms, null, 'normal', 2);
	mcButton(ctx, ...b.options, null, 'normal', 3);
	mcButton(ctx, ...b.quit, null, 'normal', 4);
};

// ---------- список серверов ----------
export const MC_LIST = {
	// строка HolyWorld
	row: [182, 108, 916, 108],
	connect: [178, 564, 300, 60],
	direct: [490, 564, 300, 60],
	add: [802, 564, 300, 60],
} as const;

const pingBars = (ctx: Ctx, x: number, y: number, level = 5, color = '#3cd23c') => {
	for (let i = 0; i < 5; i++) {
		const h = (i + 1) * 2 * U;
		fillRect(ctx, x + i * 2 * U, y + 8 * U - h, U, h, i < level ? color : '#2b2b2b');
	}
};

export type McListState = {selected: boolean; hoverRow: boolean; hoverConnect: boolean; press: number};

export const drawMcServers = (ctx: Ctx, t: number, st: McListState) => {
	tile(ctx, getDirt(), 0, 0, 1280, 720, U * 2, 0.55);
	// заголовок
	drawPixelText(ctx, 'Сетевая игра', 640, 36, {px: U, color: '#ffffff', align: 'center'});
	// тёмная область списка
	fillRect(ctx, 0, 84, 1280, 456, 'rgba(0,0,0,0.55)');
	fillRect(ctx, 0, 84, 1280, U, 'rgba(0,0,0,0.6)');
	fillRect(ctx, 0, 537, 1280, U, 'rgba(255,255,255,0.12)');
	const [rx, ry, rw, rh] = MC_LIST.row;
	// строка HolyWorld
	if (st.selected) {
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = U;
		ctx.strokeRect(rx - U * 1.5, ry - U * 1.5, rw + U * 3, rh + U * 3);
		fillRect(ctx, rx, ry, rw, rh, '#000000');
	}
	const a = screenAssets();
	const ix = rx + U;
	const iy = ry + U;
	const is = 96;
	if (a) {
		const k = Math.min(is / a.holyworld.width, is / a.holyworld.height);
		const w = a.holyworld.width * k;
		const h = a.holyworld.height * k;
		ctx.drawImage(a.holyworld, ix + (is - w) / 2, iy + (is - h) / 2, w, h);
	}
	if (st.hoverRow) {
		// наведение на значок: затемнение и стрелка «играть»
		fillRect(ctx, ix, iy, is, is, 'rgba(160,160,160,0.45)');
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.moveTo(ix + 36, iy + 24);
		ctx.lineTo(ix + 66, iy + 48);
		ctx.lineTo(ix + 36, iy + 72);
		ctx.closePath();
		ctx.fill();
	}
	const tx = ix + is + U * 3;
	drawPixelText(ctx, 'HolyWorld', tx, ry + U * 2, {px: U, color: '#ffffff'});
	const motd = 'Лайт Анархия · ';
	drawPixelText(ctx, motd, tx, ry + U * 14, {px: U, color: '#ffaa00'});
	drawPixelText(ctx, 'ВАЙП', tx + pixelWidthOn(ctx, motd, U) + U, ry + U * 14, {px: U, color: '#ff5555'});
	drawPixelText(ctx, 'mc.holyworld.ru', tx, ry + U * 24, {px: U, color: '#8f8f8f'});
	// онлайн и пинг (онлайн чуть растёт со временем)
	const online = `${2187 + Math.floor(t * 3) % 40}/5000`;
	drawPixelText(ctx, online, rx + rw - U * 19, ry + U * 2, {px: U, color: '#aaaaaa', align: 'right'});
	pingBars(ctx, rx + rw - U * 12, ry + U * 1);
	// ещё два сервера — без читаемых надписей
	for (let i = 0; i < 2; i++) {
		const y = ry + rh + 12 + i * (rh + 12);
		tile(ctx, getStone(), ix, y + U, is, is, U * 2, 0.25);
		fillRect(ctx, ix + 30, y + 30, 36, 36, 'rgba(0,0,0,0.35)');
		mcGreek(ctx, tx, y + U * 3, 260, '#ffffff', 11 + i, 'left', 0.75);
		mcGreek(ctx, tx, y + U * 15, 380, '#8f8f8f', 21 + i, 'left', 0.8);
		pingBars(ctx, rx + rw - U * 12, y + U * 1, 4 - i, i ? '#e0d040' : '#3cd23c');
	}
	// кнопки
	const L = MC_LIST;
	mcButton(ctx, ...L.connect, 'Подключиться', !st.selected ? 'disabled' : st.hoverConnect ? (st.press > 0 ? 'pressed' : 'hover') : 'normal');
	mcButton(ctx, ...L.direct, null, 'normal', 5);
	mcButton(ctx, ...L.add, null, 'normal', 6);
	for (let i = 0; i < 4; i++) mcButton(ctx, 178 + i * 234, 636, 222, 60, null, i < 2 && !st.selected ? 'disabled' : 'normal', 7 + i);
};

// ---------- подключение ----------
// Экран подключения (без текста): земля, логотип сервера, бегущие квадраты. k — сколько прошло, с
export const drawMcConnecting = (ctx: Ctx, k: number) => {
	tile(ctx, getDirt(), 0, 0, 1280, 720, U * 2, 0.55);
	const a = screenAssets();
	if (a) {
		// логотип чуть «выезжает» в начале
		const h = 190 + 10 * easeOutCubic(clamp01(k / 0.25));
		const w = (a.holyworld.width / a.holyworld.height) * h;
		ctx.drawImage(a.holyworld, 640 - w / 2, 230 - h / 2 + 20, w, h);
	}
	for (let i = 0; i < 3; i++) {
		const ph = (k * 3.2 - i * 0.22) % 1;
		const lift = ph > 0 && ph < 0.5 ? Math.sin(ph * Math.PI * 2) * 12 : 0;
		fillRect(ctx, 640 - 39 + i * 30, 430 - lift, 18, 18, i === Math.floor(k * 3.2) % 3 ? '#ffffff' : '#a8a8a8');
	}
};

// Игровой мир (после подключения)
export const drawMcGame = (ctx: Ctx, t: number) => drawGame(ctx, t, 0, 0, 1280, 720);
