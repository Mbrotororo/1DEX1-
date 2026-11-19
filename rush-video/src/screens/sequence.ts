import {clamp, clamp01, easeInOutCubic, easeOutCubic, lerp, mixHex} from '../core/anim';
import {noise1} from '../core/rng';
import {drawChat, speakingAt, CHAT_VOICE_ROW} from './discord';
import {DESKTOP_ICONS, drawDesktop, drawTaskbar} from './desktop';
import {cursorAt, drawCursor, drawRipples, fillRect, pressAt, scaled, windowIn, withAlpha, type Click, type Ctx, type CursorKey, type ScreenDraw} from './draw';
import {MC_LIST, MC_MENU, drawMcConnecting, drawMcGame, drawMcLoading, drawMcMenu, drawMcServers, loadingCurve} from './minecraft';
import {OBS_REC_BUTTON, drawObs} from './obs';

// Готовый сценарий экрана ПК для сцены b-room (SPEC §3, B2–B7). Время — ЛОКАЛЬНОЕ время сцены b-room.
// drawPC(ctx, t) рисует то, что на мониторе в момент t; курсор, клики, окна — по таблице PC_TIMING.

export type PcTiming = {
	// экран загорается (до этого чёрный)
	screenOn: number;
	// рабочий стол виден полностью
	desktop: number;
	// B3: начало плана «экран во весь кадр», курсор летит к Minecraft
	b3: number;
	// двойной клик по значку Minecraft (середина двойного клика)
	mcClick: number;
	// загрузка игры: полоса от loadFrom до loadTo, затем главное меню
	loadFrom: number;
	loadTo: number;
	// клик «Сетевая игра»
	menuClick: number;
	// клик по строке HolyWorld (выделение)
	rowClick: number;
	// клик «Подключиться»
	connectClick: number;
	// мир загрузился (кадр игры)
	connected: number;
	// B4: окно Discord поверх игры
	b4: number;
	// клик по голосовому каналу «запись»
	voiceClick: number;
	// B6: окно OBS
	b6: number;
	// клик «Начать запись»
	recClick: number;
	// B7: OBS свёрнут, на мониторе снова игра
	b7: number;
};

export const PC_TIMING: PcTiming = {
	screenOn: 2.6,
	desktop: 2.95,
	b3: 3.2,
	mcClick: 3.6,
	loadFrom: 3.8,
	loadTo: 4.6,
	menuClick: 4.78,
	rowClick: 5.0,
	connectClick: 5.2,
	connected: 5.44,
	b4: 5.6,
	voiceClick: 6.0,
	b6: 8.4,
	recClick: 9.2,
	b7: 10.4,
};

const center = (r: readonly [number, number, number, number]): [number, number] => [r[0] + r[2] / 2, r[1] + r[3] / 2];

export type PcScript = {
	timing: PcTiming;
	keys: CursorKey[];
	clicks: Click[];
	// когда курсор виден
	cursorVisible: (t: number) => number;
};

// Сценарий курсора и кликов по таблице времени
export const makePcScript = (T: PcTiming = PC_TIMING): PcScript => {
	const [mx, my] = DESKTOP_ICONS.mc;
	const multi = center(MC_MENU.multi);
	const row = [MC_LIST.row[0] + 420, MC_LIST.row[1] + 52] as [number, number];
	const conn = center(MC_LIST.connect);
	const [vx, vy] = CHAT_VOICE_ROW;
	const rec = center(OBS_REC_BUTTON);
	const keys: CursorKey[] = [
		{t: T.screenOn, x: 760, y: 440},
		{t: T.b3 + 0.02, x: 760, y: 440},
		{t: T.mcClick - 0.07, x: mx + 4, y: my + 2},
		{t: T.mcClick + 0.15, x: mx + 4, y: my + 2},
		// меню: курсор появляется в центре
		{t: T.loadTo, x: 760, y: 520},
		{t: T.menuClick - 0.03, x: multi[0] + 30, y: multi[1] + 4},
		{t: T.menuClick + 0.06, x: multi[0] + 30, y: multi[1] + 4},
		{t: T.rowClick - 0.03, x: row[0], y: row[1]},
		{t: T.rowClick + 0.03, x: row[0], y: row[1]},
		{t: T.connectClick - 0.03, x: conn[0] + 20, y: conn[1] + 6},
		{t: T.connectClick + 0.1, x: conn[0] + 20, y: conn[1] + 6},
		// Discord
		{t: T.b4, x: 780, y: 470},
		{t: T.voiceClick - 0.04, x: vx + 10, y: vy + 4},
		{t: T.voiceClick + 0.08, x: vx + 10, y: vy + 4},
		{t: T.voiceClick + 0.7, x: vx + 120, y: vy + 70},
		// OBS
		{t: T.b6, x: 700, y: 330},
		{t: T.b6 + 0.25, x: 760, y: 360},
		{t: T.recClick - 0.04, x: rec[0] + 30, y: rec[1] + 5},
		{t: T.recClick + 0.1, x: rec[0] + 30, y: rec[1] + 5},
		{t: T.recClick + 0.8, x: rec[0] - 60, y: rec[1] - 110},
	];
	const clicks: Click[] = [
		{t: T.mcClick - 0.05, x: mx + 4, y: my + 2},
		{t: T.mcClick + 0.05, x: mx + 4, y: my + 2},
		{t: T.menuClick, x: multi[0] + 30, y: multi[1] + 4},
		{t: T.rowClick, x: row[0], y: row[1]},
		{t: T.connectClick, x: conn[0] + 20, y: conn[1] + 6},
		{t: T.voiceClick, x: vx + 10, y: vy + 4},
		{t: T.recClick, x: rec[0] + 30, y: rec[1] + 5},
	];
	const cursorVisible = (t: number) => {
		if (t < T.screenOn + 0.2) return 0;
		if (t < T.mcClick + 0.12) return 1;
		if (t < T.loadTo + 0.02) return 0;
		if (t < T.connectClick + 0.12) return 1;
		if (t < T.b4) return 0;
		return t < T.b7 ? 1 : 0;
	};
	return {timing: T, keys, clicks, cursorVisible};
};

// Какой экран сейчас (для подсветки/цвета)
export type PcScreen = 'off' | 'desktop' | 'loading' | 'menu' | 'servers' | 'connecting' | 'game' | 'chat' | 'obs';
export const pcScreenAt = (t: number, T: PcTiming = PC_TIMING): PcScreen => {
	if (t < T.screenOn) return 'off';
	if (t < T.mcClick + 0.1) return 'desktop';
	if (t < T.loadTo) return 'loading';
	if (t < T.menuClick + 0.07) return 'menu';
	if (t < T.connectClick + 0.08) return 'servers';
	if (t < T.connected) return 'connecting';
	if (t < T.b4) return 'game';
	if (t < T.b6) return 'chat';
	if (t < T.b7) return 'obs';
	return 'game';
};

// Нарисовать экран ПК в момент t по сценарию script
export const drawPcWith = (ctx: Ctx, t: number, script: PcScript) => {
	const T = script.timing;
	const scr = pcScreenAt(t, T);
	const clicks = script.clicks;
	const press = pressAt(clicks, t);
	const [cx, cy] = cursorAt(script.keys, t);
	if (scr === 'off') {
		fillRect(ctx, 0, 0, 1280, 720, '#000000');
		return;
	}
	const near = (x: number, y: number, r: readonly [number, number, number, number]) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
	if (scr === 'desktop') {
		const [mx, my] = DESKTOP_ICONS.mc;
		const overMc = Math.abs(cx - mx) < 50 && Math.abs(cy - my) < 50;
		drawDesktop(ctx, t, {selected: t >= T.mcClick - 0.05 ? 'mc' : null, hover: overMc ? 'mc' : null, running: []});
		// загорание экрана
		const on = clamp01((t - T.screenOn) / (T.desktop - T.screenOn));
		if (on < 1) withAlpha(ctx, 1 - easeOutCubic(on), () => fillRect(ctx, 0, 0, 1280, 720, '#000000'));
	} else if (scr === 'loading') {
		// окно игры раскрывается из значка
		const open = easeInOutCubic(clamp01((t - (T.mcClick + 0.1)) / Math.max(0.05, T.loadFrom - T.mcClick - 0.1)));
		if (open < 1) {
			drawDesktop(ctx, t, {selected: 'mc', running: ['mc'], active: 'mc'});
			const [mx, my] = DESKTOP_ICONS.mc;
			const w = lerp(90, 1280, open);
			const h = lerp(70, 720, open);
			const x = lerp(mx - 45, 0, open);
			const y = lerp(my - 35, 0, open);
			ctx.save();
			ctx.beginPath();
			ctx.rect(x, y, w, h);
			ctx.clip();
			ctx.translate(x, y);
			ctx.scale(w / 1280, h / 720);
			drawMcLoading(ctx, 0);
			ctx.restore();
			withAlpha(ctx, 1 - open, () => fillRect(ctx, x, y, w, h, 'rgba(255,255,255,0.25)'));
		} else drawMcLoading(ctx, loadingCurve((t - T.loadFrom) / (T.loadTo - T.loadFrom)));
	} else if (scr === 'menu') {
		const over = near(cx, cy, MC_MENU.multi);
		drawMcMenu(ctx, t, over, over ? press : 0);
		const k = clamp01((t - T.loadTo) / 0.08);
		if (k < 1) withAlpha(ctx, 1 - k, () => drawMcLoading(ctx, 1));
	} else if (scr === 'servers') {
		drawMcServers(ctx, t, {selected: t >= T.rowClick, hoverRow: near(cx, cy, MC_LIST.row) && t < T.rowClick + 0.12, hoverConnect: near(cx, cy, MC_LIST.connect), press});
	} else if (scr === 'connecting') {
		drawMcConnecting(ctx, t - T.connectClick);
	} else if (scr === 'game') {
		drawMcGame(ctx, t);
		const k = clamp01((t - T.connected) / 0.12);
		if (t < T.b4 && k < 1) withAlpha(ctx, 1 - k, () => drawMcConnecting(ctx, t - T.connectClick));
		if (t >= T.b7) {
			// OBS сворачивается
			const out = clamp01((t - T.b7) / 0.18);
			if (out < 1)
				withAlpha(ctx, 1 - out, () =>
					scaled(ctx, 1 - 0.15 * easeOutCubic(out), 640, 900, () => drawObs(ctx, t, {recFrom: T.recClick, hoverRec: false, press: 0})),
				);
		}
	} else if (scr === 'chat') {
		const joined = clamp01((t - T.voiceClick - 0.06) / 0.3);
		const [vx, vy] = CHAT_VOICE_ROW;
		const hoverVoice = Math.abs(cx - vx) < 130 && Math.abs(cy - vy) < 17;
		const draw = () => drawChat(ctx, t, {joined, speaking: speakingAt(t, T.voiceClick + 0.35), hoverVoice, press: hoverVoice ? press : 0});
		const w = windowIn(t, T.b4);
		if (w.k < 1) {
			drawMcGame(ctx, t);
			drawTaskbar(ctx, t, {running: ['mc', 'chat'], active: 'chat'});
			withAlpha(ctx, w.alpha, () => scaled(ctx, w.scale, 640, 400, draw));
		} else draw();
	} else if (scr === 'obs') {
		const draw = () => drawObs(ctx, t, {recFrom: T.recClick, hoverRec: near(cx, cy, OBS_REC_BUTTON), press: near(cx, cy, OBS_REC_BUTTON) ? press : 0});
		const w = windowIn(t, T.b6);
		if (w.k < 1) {
			drawChat(ctx, t, {joined: 1, speaking: speakingAt(t, T.voiceClick + 0.35), hoverVoice: false, press: 0});
			withAlpha(ctx, w.alpha, () => scaled(ctx, w.scale, 640, 400, draw));
		} else draw();
	}
	// курсор и клики поверх всего
	const vis = script.cursorVisible(t);
	if (vis > 0) {
		// волны только от кликов на текущем экране
		drawRipples(ctx, clicks.filter((c) => pcScreenAt(c.t, T) === scr), t, scr === 'chat' ? '#c9cdff' : '#ffffff');
		drawCursor(ctx, cx, cy, press, 1.6, vis);
	}
};

// Готовый сценарий по PC_TIMING
export const PC_SCRIPT = makePcScript(PC_TIMING);

// Экран ПК в момент t (локальное время b-room) — передавай в ScreenPOV / useScreenTexture
export const drawPC: ScreenDraw = (ctx, t) => drawPcWith(ctx, t, PC_SCRIPT);

// То же, но время зажато в план (удобно, если план длиннее/короче)
const within = (from: keyof PcTiming, to: keyof PcTiming): ScreenDraw => (ctx, t) => drawPC(ctx, clamp(t, PC_TIMING[from], PC_TIMING[to] - 1e-3));
export const drawB3 = within('b3', 'b4');
export const drawB4 = within('b4', 'b6');
export const drawB6 = within('b6', 'b7');

// Цвет свечения монитора (отсвет на лице/столе) — под то, что сейчас на экране
const GLOW: Record<PcScreen, string> = {
	off: '#000000',
	desktop: '#a9b4ff',
	loading: '#ff7a7a',
	menu: '#b4c4ff',
	servers: '#c9a98a',
	connecting: '#c9a98a',
	game: '#d8e6ff',
	chat: '#8e96ff',
	obs: '#9aa2c8',
};
export const pcGlowColor = (t: number, T: PcTiming = PC_TIMING) => {
	const a = GLOW[pcScreenAt(t, T)];
	const b = GLOW[pcScreenAt(t - 0.15, T)];
	return mixHex(b, a, 0.5);
};

// Камера для ScreenPOV: медленный наезд в каждом плане и «оператор следит за курсором»
export type PovCamera = {zoom: number; focus: [number, number]; tilt: [number, number]};
export const pcPOV = (t: number, script: PcScript = PC_SCRIPT): PovCamera => {
	const T = script.timing;
	// сглаженный курсор (среднее за последние 0.4 с)
	let ax = 0;
	let ay = 0;
	for (let i = 0; i < 8; i++) {
		const [x, y] = cursorAt(script.keys, t - i * 0.05);
		ax += x / 8;
		ay += y / 8;
	}
	let from = T.b3;
	let to = T.b4;
	let z0 = 1.0;
	let z1 = 1.1;
	let anchor: [number, number] = [640, 360];
	let follow = 0.35;
	if (t >= T.b6) {
		from = T.b6;
		to = T.b7;
		z0 = 1.08;
		z1 = 1.5;
		anchor = [1010, 560];
		follow = 0.25;
	} else if (t >= T.b4) {
		from = T.b4;
		to = T.b6;
		z0 = 1.06;
		z1 = 1.28;
		anchor = [520, 330];
		follow = 0.3;
	}
	const k = easeInOutCubic(clamp01((t - from) / (to - from)));
	const zoom = lerp(z0, z1, k);
	const focus: [number, number] = [lerp(anchor[0], ax, follow), lerp(anchor[1], ay, follow)];
	const tilt: [number, number] = [lerp(4, 1.5, k) + noise1(t * 0.3, 140) * 0.6, 1.8 + noise1(t * 0.27, 141) * 0.4];
	return {zoom, focus, tilt};
};
