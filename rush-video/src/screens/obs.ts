import {clamp01} from '../core/anim';
import {noise1} from '../core/rng';
import {drawRecIcon} from './art';
import {circle, fillRR, fillRect, greek, rrect, text, textW, type Ctx} from './draw';
import {drawGame} from './game';

// Окно программы записи в духе OBS (тёмная тема): превью с игрой, доки сцен/источников/микшера,
// «Управление» с кнопкой «Начать запись» → «Остановить запись», внизу красная точка и счётчик REC.

const COL = {
	bg: '#1c1c22',
	dock: '#25252d',
	title: '#2d2d37',
	line: '#3a3a46',
	btn: '#3a3b48',
	btnHover: '#4a4c5e',
	text: '#e6e6ee',
	muted: '#9a9cab',
	accent: '#3b5bd6',
	red: '#e5383b',
};

// Кнопка записи (x, y, w, h) — для ключей курсора
export const OBS_REC_BUTTON: [number, number, number, number] = [1026, 528, 240, 34];

export type ObsState = {
	// момент начала записи (Infinity — ещё не начата)
	recFrom: number;
	hoverRec: boolean;
	press: number;
};

// «REC 00:00:00» — счётчик секунд записи
export const recClock = (sec: number) => {
	const s = Math.max(0, Math.floor(sec));
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};

const dock = (ctx: Ctx, x: number, y: number, w: number, h: number, seed: number) => {
	fillRect(ctx, x, y, w, h, COL.dock);
	fillRect(ctx, x, y, w, 24, COL.title);
	greek(ctx, x + 10, y + 12, w * 0.5, 6, COL.muted, seed, {words: 2});
	ctx.strokeStyle = COL.line;
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
};

// Нижняя полоска дока с кнопками «+ − …»
const dockTools = (ctx: Ctx, x: number, y: number, n: number) => {
	for (let i = 0; i < n; i++) {
		const bx = x + 8 + i * 26;
		fillRR(ctx, bx, y, 20, 18, 3, COL.btn);
		fillRect(ctx, bx + 5, y + 8, 10, 2, COL.muted);
		if (i === 0) fillRect(ctx, bx + 9, y + 4, 2, 10, COL.muted);
	}
};

const obsButton = (ctx: Ctx, x: number, y: number, w: number, h: number, label: string | null, seed: number, opts: {hover?: boolean; press?: number; rec?: boolean} = {}) => {
	const fill = opts.rec ? '#5a1d24' : opts.hover ? COL.btnHover : COL.btn;
	fillRR(ctx, x, y, w, h, 4, fill);
	ctx.strokeStyle = opts.rec ? COL.red : opts.hover ? '#6c7090' : '#4a4b5a';
	ctx.lineWidth = opts.rec ? 2 : 1;
	rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
	ctx.stroke();
	if (opts.press) {
		ctx.fillStyle = `rgba(0,0,0,${0.25 * opts.press})`;
		rrect(ctx, x, y, w, h, 4);
		ctx.fill();
	}
	if (label) text(ctx, label, x + w / 2 + (opts.rec ? 9 : 0), y + h / 2 + 1, {size: 16, weight: 600, color: COL.text, align: 'center'});
	else greek(ctx, x + w / 2 - 50, y + h / 2, 100, 7, COL.muted, seed, {words: 2});
};

export const drawObs = (ctx: Ctx, t: number, st: ObsState) => {
	const rec = t >= st.recFrom;
	const recT = t - st.recFrom;
	fillRect(ctx, 0, 0, 1280, 720, COL.bg);
	// заголовок окна и меню
	fillRect(ctx, 0, 0, 1280, 26, '#16161b');
	drawRecIcon(ctx, 14, 13, 16);
	greek(ctx, 30, 13, 300, 6, COL.muted, 90, {words: 4});
	ctx.strokeStyle = '#b8b8c4';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(1170, 13);
	ctx.lineTo(1180, 13);
	ctx.rect(1208, 8, 10, 10);
	ctx.moveTo(1246, 8);
	ctx.lineTo(1256, 18);
	ctx.moveTo(1256, 8);
	ctx.lineTo(1246, 18);
	ctx.stroke();
	fillRect(ctx, 0, 26, 1280, 24, '#202027');
	for (let i = 0; i < 7; i++) greek(ctx, 12 + i * 70, 38, 56, 6, COL.muted, 91 + i, {words: 1});
	// превью: чёрное поле, кадр игры 16:9 по центру
	fillRect(ctx, 6, 54, 1268, 400, '#0d0d10');
	const ph = 392;
	const pw = (ph * 16) / 9;
	const px = 640 - pw / 2;
	const py = 58;
	drawGame(ctx, t, px, py, pw, ph);
	ctx.strokeStyle = 'rgba(255,255,255,0.08)';
	ctx.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
	// доки
	const dy = 462;
	const dh = 232;
	dock(ctx, 6, dy, 226, dh, 100);
	// сцены: одна выбрана
	fillRect(ctx, 7, dy + 30, 224, 28, COL.accent);
	greek(ctx, 18, dy + 44, 120, 7, '#ffffff', 101, {words: 2});
	greek(ctx, 18, dy + 72, 120, 7, COL.text, 102, {words: 2, alpha: 0.7});
	dockTools(ctx, 6, dy + dh - 26, 4);
	dock(ctx, 238, dy, 260, dh, 103);
	// источники: Minecraft (захват игры), микрофон, картинка
	fillRect(ctx, 239, dy + 30, 258, 28, '#33364a');
	fillRR(ctx, 248, dy + 37, 18, 13, 2, COL.muted);
	fillRect(ctx, 252, dy + 51, 10, 2, COL.muted);
	text(ctx, 'Minecraft', 274, dy + 45, {size: 14, weight: 500, color: COL.text});
	for (let i = 0; i < 2; i++) {
		const y = dy + 72 + i * 28;
		circle(ctx, 257, y, 5, COL.muted);
		greek(ctx, 274, y, 110, 7, COL.text, 104 + i, {words: 2, alpha: 0.7});
	}
	// глаз и замок справа у источников
	for (let i = 0; i < 3; i++) {
		const y = dy + 44 + i * 28;
		ctx.strokeStyle = COL.muted;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.ellipse(458, y, 7, 4, 0, 0, Math.PI * 2);
		ctx.stroke();
		circle(ctx, 458, y, 2, COL.muted);
		fillRR(ctx, 476, y - 2, 9, 7, 1, COL.muted);
	}
	dockTools(ctx, 238, dy + dh - 26, 5);
	dock(ctx, 504, dy, 330, dh, 106);
	// микшер: два канала с бегущими уровнями
	for (let i = 0; i < 2; i++) {
		const y = dy + 44 + i * 82;
		greek(ctx, 516, y, 120, 7, COL.text, 107 + i, {words: 2, alpha: 0.8});
		greek(ctx, 770, y, 50, 6, COL.muted, 109 + i, {words: 1});
		const mx = 516;
		const mw = 304;
		const g = ctx.createLinearGradient(mx, 0, mx + mw, 0);
		g.addColorStop(0, '#2f7a3a');
		g.addColorStop(0.7, '#8a8a2a');
		g.addColorStop(1, '#8a2a2a');
		fillRect(ctx, mx, y + 14, mw, 9, '#141418');
		ctx.save();
		ctx.globalAlpha = 0.35;
		ctx.fillStyle = g;
		ctx.fillRect(mx, y + 14, mw, 9);
		ctx.restore();
		const lvl = clamp01(0.45 + noise1(t * 6, 120 + i) * 0.28 + (i === 0 ? 0.08 : -0.12));
		const g2 = ctx.createLinearGradient(mx, 0, mx + mw, 0);
		g2.addColorStop(0, '#4cd964');
		g2.addColorStop(0.7, '#e6e04a');
		g2.addColorStop(1, '#ff4a4a');
		ctx.fillStyle = g2;
		ctx.fillRect(mx, y + 14, mw * lvl, 9);
		// ползунок громкости
		fillRect(ctx, mx, y + 36, mw, 3, '#4a4b5a');
		fillRect(ctx, mx, y + 36, mw * 0.78, 3, COL.accent);
		circle(ctx, mx + mw * 0.78, y + 37.5, 7, '#d8d8e2');
	}
	dock(ctx, 840, dy, 176, dh, 111);
	fillRR(ctx, 852, dy + 36, 152, 28, 4, COL.btn);
	greek(ctx, 862, dy + 50, 90, 7, COL.text, 112, {words: 1, alpha: 0.8});
	fillRR(ctx, 852, dy + 74, 152, 28, 4, '#1a1a20');
	greek(ctx, 862, dy + 88, 60, 7, COL.text, 113, {words: 1, alpha: 0.7});
	// управление
	dock(ctx, 1022, dy, 252, dh, 114);
	const [bx, by, bw, bh] = OBS_REC_BUTTON;
	obsButton(ctx, bx, dy + 30, bw, bh, null, 115);
	if (rec) {
		// «Остановить запись» + пауза рядом
		obsButton(ctx, bx, by, bw - 42, bh, 'Остановить запись', 0, {rec: true, press: st.press});
		const pulse = 0.65 + 0.35 * Math.cos(recT * Math.PI * 2);
		const lw = textW(ctx, 'Остановить запись', 16, 600);
		circle(ctx, bx + (bw - 42) / 2 - lw / 2 - 4, by + bh / 2 + 1, 5.5, `rgba(229,56,59,${pulse})`);
		fillRR(ctx, bx + bw - 36, by, 36, bh, 4, COL.btn);
		fillRect(ctx, bx + bw - 23, by + 10, 3.5, 14, COL.text);
		fillRect(ctx, bx + bw - 16, by + 10, 3.5, 14, COL.text);
	} else obsButton(ctx, bx, by, bw, bh, 'Начать запись', 0, {hover: st.hoverRec, press: st.press});
	for (let i = 0; i < 3; i++) obsButton(ctx, bx, by + 40 + i * 40, bw, bh, null, 116 + i);
	// строка состояния: REC и счётчик
	fillRect(ctx, 0, 696, 1280, 24, '#16161b');
	greek(ctx, 900, 708, 110, 6, COL.muted, 120, {words: 2});
	const recOn = rec ? (Math.floor(recT * 2) % 2 === 0 ? 1 : 0.55) : 0;
	circle(ctx, 1080, 708, 6, rec ? `rgba(229,56,59,${recOn})` : '#5a5a66');
	text(ctx, `REC ${recClock(rec ? recT : 0)}`, 1094, 709, {size: 15, weight: 600, color: rec ? '#ffffff' : COL.muted});
	greek(ctx, 1210, 708, 60, 6, COL.muted, 121, {words: 1});
};
