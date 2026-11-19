import {clamp01, easeOutBack, easeOutCubic} from '../core/anim';
import {hash1} from '../core/rng';
import {drawChatIcon, drawDotAvatar, drawHeroAvatar, drawHeroFace} from './art';
import {circle, fillRR, fillRect, greek, ring, rrect, text, withAlpha, type Ctx} from './draw';

// Окно мессенджера в духе Discord (тёмная тема, сине-фиолетовые акценты): сервер 1DEX1, текстовый канал
// «общий», голосовой «запись». После клика по «запись» герой появляется в канале с зелёным кольцом.

const COL = {
	rail: '#1e1f22',
	side: '#2b2d31',
	main: '#313338',
	panel: '#232428',
	sel: '#404249',
	hover: '#35373c',
	text: '#dbdee1',
	head: '#f2f3f5',
	muted: '#949ba4',
	faint: '#6d6f78',
	blurple: '#5865f2',
	green: '#23a55a',
	red: '#da373c',
};

// Строка голосового канала «запись» (центр) — для ключей курсора
export const CHAT_VOICE_ROW: [number, number] = [190, 262];
export const CHAT_TEXT_ROW: [number, number] = [190, 150];

export type ChatState = {
	// 0..1 — герой зашёл в голосовой канал (анимация появления)
	joined: number;
	// говорит ли сейчас (зелёное кольцо) 0..1
	speaking: number;
	// курсор над строкой «запись»
	hoverVoice: boolean;
	press: number;
};

// Голосовая активность «как в разговоре»: детерминированно от времени
export const speakingAt = (t: number, from: number) => {
	if (t < from) return 0;
	const slot = Math.floor((t - from) * 5);
	const on = hash1(slot, 71) > 0.18 ? 1 : 0;
	return on;
};

const speaker = (ctx: Ctx, x: number, y: number, s: number, color: string) => {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(x - s * 0.5, y - s * 0.2);
	ctx.lineTo(x - s * 0.2, y - s * 0.2);
	ctx.lineTo(x + s * 0.15, y - s * 0.5);
	ctx.lineTo(x + s * 0.15, y + s * 0.5);
	ctx.lineTo(x - s * 0.2, y + s * 0.2);
	ctx.lineTo(x - s * 0.5, y + s * 0.2);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = color;
	ctx.lineWidth = s * 0.12;
	ctx.beginPath();
	ctx.arc(x + s * 0.2, y, s * 0.32, -0.9, 0.9);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(x + s * 0.2, y, s * 0.58, -0.9, 0.9);
	ctx.stroke();
};

const hash = (ctx: Ctx, x: number, y: number, color: string) => text(ctx, '#', x, y + 1, {size: 22, weight: 500, color, align: 'center'});

const chevron = (ctx: Ctx, x: number, y: number, s: number, color: string, down = true) => {
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	if (down) {
		ctx.moveTo(x - s, y - s / 2);
		ctx.lineTo(x, y + s / 2);
		ctx.lineTo(x + s, y - s / 2);
	} else {
		ctx.moveTo(x - s / 2, y - s);
		ctx.lineTo(x + s / 2, y);
		ctx.lineTo(x - s / 2, y + s);
	}
	ctx.stroke();
};

// Значки-«пиктограммы» на панели: микрофон, наушники, шестерёнка
const mic = (ctx: Ctx, x: number, y: number, color: string) => {
	fillRR(ctx, x - 4, y - 9, 8, 13, 4, color);
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x, y - 1, 7, 0.15 * Math.PI, 0.85 * Math.PI);
	ctx.moveTo(x, y + 6);
	ctx.lineTo(x, y + 10);
	ctx.stroke();
};
const phones = (ctx: Ctx, x: number, y: number, color: string) => {
	ctx.strokeStyle = color;
	ctx.lineWidth = 2.4;
	ctx.beginPath();
	ctx.arc(x, y + 1, 8, Math.PI, 0);
	ctx.stroke();
	fillRR(ctx, x - 10, y, 5, 9, 2, color);
	fillRR(ctx, x + 5, y, 5, 9, 2, color);
};
const gear = (ctx: Ctx, x: number, y: number, color: string) => {
	for (let i = 0; i < 8; i++) {
		const a = (i * Math.PI) / 4;
		circle(ctx, x + Math.cos(a) * 7, y + Math.sin(a) * 7, 2.6, color);
	}
	circle(ctx, x, y, 7, color);
	circle(ctx, x, y, 3, COL.panel);
};

export const drawChat = (ctx: Ctx, t: number, st: ChatState) => {
	const j = clamp01(st.joined);
	// заголовок окна
	fillRect(ctx, 0, 0, 1280, 26, COL.rail);
	ctx.strokeStyle = '#b5bac1';
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
	// полоса серверов
	fillRect(ctx, 0, 26, 80, 694, COL.rail);
	drawChatIcon(ctx, 40, 64, 50, 0.32);
	fillRect(ctx, 22, 100, 36, 2, '#35363c');
	// сервер 1DEX1 (выбран): лицо героя, белая метка слева
	ctx.save();
	rrect(ctx, 14, 112, 52, 52, 16);
	ctx.clip();
	fillRect(ctx, 14, 112, 52, 52, '#6b4fa8');
	drawHeroFace(ctx, 18, 116, 44);
	ctx.restore();
	fillRR(ctx, -4, 118, 8, 40, 4, '#ffffff');
	const others = ['#3ba55d', '#e67e22', '#2d8cf0'];
	others.forEach((c, i) => {
		const y = 200 + i * 62;
		circle(ctx, 40, y, 26, c);
		// простые пиктограммы вместо букв
		fillRR(ctx, 30, y - 9, 20, 18, 4, 'rgba(255,255,255,0.85)');
		fillRect(ctx, 34, y - 4, 12, 3, c);
		fillRect(ctx, 34, y + 2, 8, 3, c);
	});
	circle(ctx, 40, 386, 26, COL.main);
	fillRect(ctx, 30, 385, 20, 3, COL.green);
	fillRect(ctx, 38.5, 376, 3, 20, COL.green);

	// боковая панель каналов
	fillRect(ctx, 80, 26, 270, 694, COL.side);
	text(ctx, '1DEX1', 98, 54, {size: 19, weight: 700, color: COL.head});
	chevron(ctx, 324, 54, 6, COL.head);
	fillRect(ctx, 80, 80, 270, 1.5, 'rgba(0,0,0,0.35)');
	// категория 1
	chevron(ctx, 94, 108, 4, COL.muted);
	greek(ctx, 104, 108, 140, 7, COL.muted, 31, {words: 2});
	// «общий»: выбран, пока герой не зашёл в голосовой
	const [, ty] = CHAT_TEXT_ROW;
	if (j < 0.5) fillRR(ctx, 88, ty - 17, 254, 34, 6, COL.sel);
	hash(ctx, 108, ty, j < 0.5 ? COL.head : COL.muted);
	text(ctx, 'общий', 128, ty, {size: 18, weight: 500, color: j < 0.5 ? COL.head : COL.muted});
	hash(ctx, 108, ty + 38, COL.faint);
	greek(ctx, 128, ty + 38, 150, 8, COL.faint, 32, {words: 2});
	// категория 2 — голосовые
	chevron(ctx, 94, 226, 4, COL.muted);
	greek(ctx, 104, 226, 140, 7, COL.muted, 33, {words: 2});
	const [, vy] = CHAT_VOICE_ROW;
	if (j >= 0.5) fillRR(ctx, 88, vy - 17, 254, 34, 6, COL.sel);
	else if (st.hoverVoice) fillRR(ctx, 88, vy - 17, 254, 34, 6, st.press > 0 ? COL.sel : COL.hover);
	speaker(ctx, 108, vy, 18, j >= 0.5 || st.hoverVoice ? COL.head : COL.muted);
	text(ctx, 'запись', 128, vy, {size: 18, weight: 500, color: j >= 0.5 || st.hoverVoice ? COL.head : COL.muted});
	// участник 1DEX1 под каналом
	const rowH = 38 * easeOutCubic(j);
	if (j > 0) {
		withAlpha(ctx, clamp01(j * 1.6), () => {
			const ay = vy + 19 + rowH / 2;
			const sp = st.speaking * clamp01(j * 2 - 1);
			if (sp > 0) withAlpha(ctx, sp, () => ring(ctx, 140, ay, 14.5, 2.5, COL.green));
			drawHeroAvatar(ctx, 140, ay, 12 * (0.6 + 0.4 * easeOutBack(j)));
			text(ctx, '1DEX1', 164, ay, {size: 16, weight: 600, color: sp > 0 ? COL.head : COL.text});
		});
	}
	// категория 3 (сдвигается вниз)
	chevron(ctx, 94, 312 + rowH, 4, COL.muted);
	greek(ctx, 104, 312 + rowH, 120, 7, COL.muted, 34, {words: 2});
	speaker(ctx, 108, 346 + rowH, 18, COL.faint);
	greek(ctx, 128, 346 + rowH, 120, 8, COL.faint, 35, {words: 1});

	// панель «голос подключён»
	if (j > 0) {
		const py = 608 + (1 - easeOutCubic(clamp01(j * 1.5))) * 60;
		ctx.save();
		ctx.beginPath();
		ctx.rect(80, 560, 270, 104);
		ctx.clip();
		fillRect(ctx, 80, py, 270, 58, COL.panel);
		fillRect(ctx, 88, py, 254, 1, 'rgba(255,255,255,0.06)');
		// индикатор связи
		for (let i = 0; i < 3; i++) fillRR(ctx, 96 + i * 6, py + 24 - i * 5, 4, 8 + i * 5, 1, COL.green);
		greek(ctx, 122, py + 20, 120, 8, COL.green, 36, {words: 2});
		text(ctx, 'запись / 1DEX1', 122, py + 40, {size: 13, weight: 400, color: COL.muted});
		// «повесить трубку»
		fillRR(ctx, 304, py + 18, 26, 22, 6, 'rgba(255,255,255,0.05)');
		ctx.strokeStyle = COL.text;
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.arc(317, py + 34, 8, Math.PI * 1.15, Math.PI * 1.85);
		ctx.stroke();
		ctx.lineCap = 'butt';
		ctx.restore();
	}
	// панель пользователя
	fillRect(ctx, 80, 664, 270, 56, COL.panel);
	drawHeroAvatar(ctx, 106, 692, 16);
	circle(ctx, 118, 704, 6.5, COL.panel);
	circle(ctx, 118, 704, 4.5, COL.green);
	text(ctx, '1DEX1', 132, 684, {size: 15, weight: 700, color: COL.head});
	greek(ctx, 132, 702, 70, 6, COL.muted, 37, {words: 1});
	mic(ctx, 262, 692, '#b5bac1');
	phones(ctx, 292, 690, '#b5bac1');
	gear(ctx, 322, 692, '#b5bac1');

	// основная область: текстовый канал → голосовой вид
	drawTextView(ctx, t);
	if (j > 0) withAlpha(ctx, clamp01(j * 1.4), () => drawVoiceView(ctx, st));
};

// Текстовый канал «общий»: сообщения-заглушки
const drawTextView = (ctx: Ctx, _t: number) => {
	fillRect(ctx, 350, 26, 930, 694, COL.main);
	hash(ctx, 372, 54, COL.faint);
	text(ctx, 'общий', 390, 54, {size: 18, weight: 700, color: COL.head});
	fillRect(ctx, 350, 80, 930, 1.5, 'rgba(0,0,0,0.3)');
	// значки справа в шапке + поиск
	for (let i = 0; i < 4; i++) fillRR(ctx, 900 + i * 34, 45, 20, 18, 4, '#b5bac1');
	fillRR(ctx, 1046, 40, 220, 28, 6, COL.panel);
	greek(ctx, 1056, 54, 120, 7, COL.faint, 38, {words: 1});
	// участники справа
	fillRect(ctx, 1040, 81, 240, 639, COL.side);
	greek(ctx, 1058, 110, 100, 7, COL.muted, 39, {words: 2});
	drawHeroAvatar(ctx, 1076, 146, 16);
	circle(ctx, 1088, 158, 6, COL.side);
	circle(ctx, 1088, 158, 4.2, COL.green);
	text(ctx, '1DEX1', 1102, 146, {size: 16, weight: 600, color: COL.text});
	const mcol = ['#e67e22', '#3ba55d', '#2d8cf0', '#eb459e'];
	for (let i = 0; i < 4; i++) {
		const y = 192 + i * 46;
		drawDotAvatar(ctx, 1076, y, 16, mcol[i]);
		greek(ctx, 1102, y, 110, 8, COL.muted, 40 + i, {words: 1, alpha: 0.9});
	}
	// сообщения
	const msgs = [
		{y: 120, c: '#e67e22', lines: [380, 240]},
		{y: 232, c: '#3ba55d', lines: [520]},
		{y: 310, c: '#2d8cf0', lines: [300, 450, 210]},
		{y: 446, c: '#eb459e', lines: [420]},
	];
	msgs.forEach((m, i) => {
		drawDotAvatar(ctx, 390, m.y + 18, 20, m.c);
		greek(ctx, 424, m.y + 6, 120, 9, m.c, 50 + i, {words: 1});
		greek(ctx, 540, m.y + 6, 80, 7, COL.faint, 60 + i, {words: 2});
		m.lines.forEach((w, k) => greek(ctx, 424, m.y + 32 + k * 24, w, 8, COL.text, 70 + i * 5 + k, {words: 8, alpha: 0.55}));
	});
	// поле ввода
	fillRR(ctx, 366, 650, 658, 50, 8, '#383a40');
	circle(ctx, 394, 675, 11, '#b5bac1');
	fillRect(ctx, 388, 674, 12, 2.4, '#383a40');
	fillRect(ctx, 392.8, 669, 2.4, 12, '#383a40');
	greek(ctx, 418, 675, 220, 8, COL.faint, 80, {words: 3});
	for (let i = 0; i < 3; i++) circle(ctx, 940 + i * 30, 675, 9, '#b5bac1');
};

// Голосовой канал «запись»: плитка с аватаром героя и кнопки внизу
const drawVoiceView = (ctx: Ctx, st: ChatState) => {
	fillRect(ctx, 350, 26, 930, 694, '#0f1012');
	speaker(ctx, 374, 56, 20, COL.head);
	text(ctx, 'запись', 394, 56, {size: 18, weight: 700, color: COL.head});
	const j = clamp01(st.joined);
	const cx = 815;
	const cy = 340;
	const s = 0.9 + 0.1 * easeOutCubic(j);
	const w = 600 * s;
	const h = 338 * s;
	fillRR(ctx, cx - w / 2, cy - h / 2, w, h, 12, '#3b2d5c');
	const grad = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
	grad.addColorStop(0, 'rgba(120,90,190,0.35)');
	grad.addColorStop(1, 'rgba(20,15,40,0.35)');
	ctx.fillStyle = grad;
	rrect(ctx, cx - w / 2, cy - h / 2, w, h, 12);
	ctx.fill();
	const sp = st.speaking * clamp01(j * 2 - 1);
	const r = 74 * s;
	if (sp > 0) {
		withAlpha(ctx, sp, () => {
			// зелёное кольцо и мягкое свечение
			withAlpha(ctx, 0.35, () => ring(ctx, cx, cy, r + 12, 10, COL.green));
			ring(ctx, cx, cy, r + 5, 5, COL.green);
		});
		// рамка плитки тоже зеленеет, когда говорит
		withAlpha(ctx, sp, () => {
			ctx.strokeStyle = COL.green;
			ctx.lineWidth = 3;
			rrect(ctx, cx - w / 2, cy - h / 2, w, h, 12);
			ctx.stroke();
		});
	}
	drawHeroAvatar(ctx, cx, cy, r);
	// имя в плашке
	const nw = 90;
	fillRR(ctx, cx - w / 2 + 14, cy + h / 2 - 44, nw, 30, 6, 'rgba(0,0,0,0.55)');
	text(ctx, '1DEX1', cx - w / 2 + 14 + nw / 2, cy + h / 2 - 29, {size: 16, weight: 600, color: '#ffffff', align: 'center'});
	// кнопки управления
	const by = 640;
	const btn: [string, string][] = [
		['#2b2d31', 'cam'],
		['#2b2d31', 'share'],
		['#2b2d31', 'mic'],
		[COL.red, 'end'],
	];
	btn.forEach(([c, kind], i) => {
		const x = cx - 105 + i * 70;
		circle(ctx, x, by, 26, c);
		if (kind === 'mic') mic(ctx, x, by, '#ffffff');
		else if (kind === 'end') {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 4;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.arc(x, by + 9, 11, Math.PI * 1.2, Math.PI * 1.8);
			ctx.stroke();
			ctx.lineCap = 'butt';
		} else fillRR(ctx, x - 11, by - 8, 22, 16, 4, '#ffffff');
	});
};
