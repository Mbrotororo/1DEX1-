// Тайминг сцены a-home (глобально 0–16 = локально 0–16): все моменты, маршруты героя, замедление.
// ЧИСТЫЕ ДАННЫЕ: без React и three — их читают и картинка (index.tsx), и звук (sfx.ts).
// После 9.6 все склейки и удары — на сетке музыки 0.4 с (src/music/grid.ts).
import {makePath, type PathKey} from '../../core/chars/path';
import {BACKPACK_HIT, DOOR_SLAM, LEAD_IN, ROOM_HIT, RUSH_START, SHOCK_HIT, beatTime} from '../../music/grid';
import {BACKPACK_LAND, HERO_STOP, stairFootY, type V3} from '../../sets/house/anchors';

export const BEATS = {
	// ---- A1: дверь, вход (0–3.6)
	fadeIn: 0.5,
	snowFrom: 0.3,
	snowTo: 1.1,
	doorOpen: 1.2,
	doorOpenDur: 0.75,
	walkIn: 1.5,
	captionFrom: 1.4,
	captionTo: 3.4,
	doorClose: 3.0,
	doorCloseDur: 0.42,
	// ---- A2: крупно лицо (3.6–5.6)
	a2: 3.6,
	slowBlink: 4.05,
	sigh: 4.1,
	sighDur: 1.7,
	// выдох (sigh 0.5..0.8): пар изо рта
	exhale: 4.95,
	// ---- A3: поднимает глаза, часы (5.6–6.8)
	a3: 5.6,
	// второе моргание — перед тем, как поднять глаза
	blink2: 5.4,
	lookUp: 5.55,
	clock: 6.0,
	// ---- A4: записка, круг маркером (6.8–8.0)
	a4: 6.8,
	circle: 7.1,
	circleDur: 0.6,
	// ---- A5: шок (8.0–9.6)
	shock: SHOCK_HIT,
	title: 8.25,
	titleOut: 9.46,
	// ---- A6: шапка на крючок (9.6–10.4)
	a6: RUSH_START,
	hatFrom: RUSH_START,
	hatRelease: beatTime(1),
	hatLand: 10.2,
	// ---- A7: рюкзак через прихожую (10.4–12.0)
	a7: beatTime(2),
	// рывок рюкзака начинается в конце A6: лямку хватает уже в кадре A7 (~10.43)
	bagFrom: 10.25,
	bagRelease: 10.6,
	slowFrom: 10.6,
	slowTo: 11.1,
	// камера A7 перестаёт тянуться за рюкзаком и замирает: рюкзак падает в неподвижный кадр
	landTurn: 10.9,
	landHold: 11.08,
	bagLand: BACKPACK_HIT,
	// ---- A8: бег наверх (12.0–16.0)
	turn: LEAD_IN,
	stairs: beatTime(7),
	corridor: beatTime(11),
	// склейка в комнату: дверь ещё закрыта, через 0.4 с она распахивается с ударом
	room: beatTime(13),
	slam: DOOR_SLAM,
	dive: beatTime(15),
	end: ROOM_HIT,
};

// Длительности действий (поз), подобраны так, чтобы выпуск/удар попадал на свой момент
// flingHat: выпуск при k = 0.6 → ровно в hatRelease
export const HAT_DUR = (BEATS.hatRelease - BEATS.hatFrom) / 0.6;
// hurlBackpack: выпуск при k = 0.6 → ровно в bagRelease (время «сюжетное», см. story)
export const BAG_DUR = (BEATS.bagRelease - BEATS.bagFrom) / 0.6;
// doorShove: удар при k ≈ 0.42 → ровно в slam
export const SHOVE_DUR = 0.45;
export const SHOVE_FROM = BEATS.slam - 0.42 * SHOVE_DUR;

// ---------- замедление в A7 ----------
// Скорость «сюжетного» времени: 1 вне окна, SLOW_RATE внутри (плавные края).
const SLOW_RATE = 0.28;
const SLOW_EDGE = 0.08;
const sm = (x: number) => {
	const q = Math.min(1, Math.max(0, x));
	return q * q * (3 - 2 * q);
};
const slowW = (t: number) => sm((t - BEATS.slowFrom) / SLOW_EDGE) * (1 - sm((t - (BEATS.slowTo - SLOW_EDGE)) / SLOW_EDGE));
// сюжетное время: t − (1 − rate)·∫w (интеграл — Симпсон с фиксированным шагом, чистая функция)
export const story = (t: number): number => {
	const a = BEATS.slowFrom;
	if (t <= a) return t;
	const b = Math.min(t, BEATS.slowTo + 0.01);
	const n = 48;
	const h = (b - a) / n;
	let s = slowW(a) + slowW(b);
	for (let i = 1; i < n; i++) s += slowW(a + i * h) * (i % 2 ? 4 : 2);
	return t - (1 - SLOW_RATE) * ((s * h) / 3);
};
// насколько сейчас замедлено (0..1) — для смаза/звука
export const slowAmount = (t: number) => slowW(t);

// ---------- маршруты героя ----------
// A1: подходит по снегу к двери, стоит в проёме (силуэт), плетётся внутрь
export const ENTER_KEYS: PathKey[] = [
	{t: 0.0, pos: [2.5, 0, 10.7]},
	{t: 1.1, pos: [2.5, 0, 8.95]},
	{t: 1.5, pos: [2.5, 0, 8.82]},
	{t: 2.4, pos: [2.5, 0, 7.35]},
	{t: 3.3, pos: [2.5, 0, 5.85]},
	{t: 4.1, pos: [2.5, 0, 4.95]},
];
export const ENTER = makePath(ENTER_KEYS, {stride: 0.72});

// A2–A5: стоит перед часами и запиской
export const STAND: V3 = HERO_STOP;
export const STAND_YAW = Math.PI + 0.1;
// A6–A7: место, откуда бросает шапку и рюкзак (между HERO_STOP и THROW_FROM)
export const ACT: V3 = [2.9, 0, 4.05];

// A8: разворот → к лестнице → вверх по ступеням → коридор → в дверь комнаты
const stairKeys = (): PathKey[] => {
	const keys: PathKey[] = [];
	const x0 = 5.0;
	const x1 = 14.6;
	const t0 = 12.43;
	const t1 = 14.0;
	for (let x = x0; x <= x1 + 1e-6; x += 0.8) {
		const k = (x - x0) / (x1 - x0);
		keys.push({t: t0 + k * (t1 - t0), pos: [x, stairFootY(x), 1.5]});
	}
	return keys;
};
export const RUN_KEYS: PathKey[] = [
	{t: BEATS.turn, pos: [ACT[0], 0, ACT[2]]},
	{t: 12.17, pos: [3.4, 0, 3.05]},
	{t: 12.31, pos: [4.2, 0, 2.0]},
	...stairKeys(),
	{t: 14.6, pos: [17.35, 5, 1.5]},
	{t: 15.2, pos: [20.25, 5, 1.5]},
	{t: 15.42, pos: [21.3, 5, 1.55]},
	{t: 15.6, pos: [22.1, 5, 1.65]},
];
export const RUN = makePath(RUN_KEYS, {stride: 1.5});
// прыжок в комнату (после dive): откуда и куда (за кадром он долетает до кресла в b-room)
export const DIVE_FROM: V3 = [22.1, 5, 1.65];
export const DIVE_TO: V3 = [25.0, 5, 2.9];
export const DIVE_DUR = 0.62;

// ---------- рюкзак ----------
// чуть левее линии «камера — герой» (по сравнению с BACKPACK_LAND), чтобы лежащий рюкзак не закрывал героя
export const BAG_REST: V3 = [BACKPACK_LAND[0] - 0.15, 0.27, BACKPACK_LAND[2] + 0.62];
// клапан (горловина) лежащего рюкзака — к камере на полу (+x)
export const BAG_REST_YAW = -1.75;

// ---------- книги и тетради: вылетают из рюкзака в замедлении (born, T — сюжетное время), падают вокруг
export type BookDef = {born: number; land: V3; T: number; h: number; seed: number; notebook: boolean; rz: number; turns: number; up: boolean};
export const BOOKS: BookDef[] = [
	{born: 10.655, land: [7.45, 0.05, 4.25], T: 0.34, h: 0.55, seed: 1, notebook: false, rz: 0.7, turns: 1.5, up: true},
	{born: 10.665, land: [7.95, 0.025, 6.0], T: 0.32, h: 0.4, seed: 2, notebook: true, rz: -0.5, turns: 1.0, up: true},
	// эта пролетает мимо объектива (справа) и падает за камерой
	{born: 10.68, land: [11.0, 0.05, 4.6], T: 0.4, h: 0.45, seed: 3, notebook: false, rz: 2.0, turns: 2.0, up: false},
	{born: 10.695, land: [9.35, 0.025, 4.3], T: 0.36, h: 0.6, seed: 5, notebook: true, rz: 1.2, turns: 1.5, up: true},
	{born: 10.71, land: [9.5, 0.05, 6.1], T: 0.38, h: 0.7, seed: 4, notebook: false, rz: -1.1, turns: 2.5, up: true},
];
// сюжетное → экранное время (обратная к story, бисекция)
export const storyInv = (s: number): number => {
	let a = s;
	let b = s + 1;
	for (let i = 0; i < 40; i++) {
		const m = (a + b) / 2;
		if (story(m) < s) a = m;
		else b = m;
	}
	return (a + b) / 2;
};
// когда книги падают на пол (экранное время)
export const BOOK_LANDS = BOOKS.map((b) => storyInv(b.born + b.T));

// ---------- шаги для звука: моменты, когда ступня встаёт на пол ----------
// В позах ходьбы ноги разведены сильнее всего при sin(phase) = ±1 → шаг при phase = π/2 + kπ.
type PathLike = {at: (t: number) => {phase: number; moving: number; position: V3}};
const footfalls = (path: PathLike, from: number, to: number, minMoving = 0.3): {t: number; pos: V3}[] => {
	const out: {t: number; pos: V3}[] = [];
	const dt = 1 / 240;
	let prev = Math.floor((path.at(from).phase - Math.PI / 2) / Math.PI);
	for (let t = from + dt; t <= to; t += dt) {
		const st = path.at(t);
		const n = Math.floor((st.phase - Math.PI / 2) / Math.PI);
		if (n !== prev && st.moving >= minMoving) out.push({t: Math.round(t * 1000) / 1000, pos: st.position});
		prev = n;
	}
	return out;
};

// снаружи по снегу (до порога z ≈ 7.9) и дальше по дереву
const enterSteps = footfalls(ENTER, 0.05, 3.62, 0.2);
export const SNOW_STEPS = enterSteps.filter((s) => s.pos[2] > 7.9).map((s) => s.t);
export const WOOD_STEPS_IN = enterSteps.filter((s) => s.pos[2] <= 7.9).map((s) => s.t);
// бег: пол прихожей, лестница, коридор (до двери)
const runSteps = footfalls(RUN, BEATS.turn, BEATS.slam + 0.3, 0.3);
export const RUN_STEPS = runSteps.map((s) => ({t: s.t, stairs: s.pos[0] > 4.8 && s.pos[0] < 14.4, up: s.pos[1] > 4.9}));

// проверка: на кадрах звук совпадает с картинкой — выпуски и удары
export const HITS = [BEATS.shock, BEATS.title, BEATS.hatRelease, BEATS.hatLand, BEATS.bagRelease, BEATS.bagLand, BEATS.slam];
