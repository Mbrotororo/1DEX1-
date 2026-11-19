import {BEAT, FINAL_BUILD, HEADPHONES_BUILD, PC_START, POGNALI_HIT, REC_START, ROOM_HIT} from '../../music/grid';

// Тайминг сцены b-room: все моменты времени (секунды, ЛОКАЛЬНОЕ время сцены = глобальное − 16).
// Чистые данные — их импортируют и картинка (index.tsx), и звук (sfx.ts).
// Склейки и удары — на долях музыки (сетка 0.4 с от глобальных 9.6), см. src/music/grid.ts.

// начало сцены в глобальном времени
export const SCENE_START = 16;
// глобальное → локальное (с отсечкой хвостов двоичной арифметики)
export const local = (g: number) => Math.round((g - SCENE_START) * 1e6) / 1e6;
// доля n от начала сцены (локально): beat(4) = 1.6
export const beat = (n: number) => Math.round(n * BEAT * 1e6) / 1e6;

export const BEATS = {
	// ---- B1: общий план, прыжок в кресло (0–1.6) ----
	// выход из белой вспышки (стык с a-home)
	whiteOut: local(ROOM_HIT),
	whiteDur: 0.16,
	// два шага от двери к точке прыжка
	run: 0,
	// толчок прыжка (diveIntoChair k = 0)
	dive: 0.2,
	// длительность прыжка: плюхнулся при k = 0.75 → 0.2 + 0.6 = 0.8 (доля)
	diveDur: 0.8,
	land: beat(2),
	// кресло откатывается к столу и крутится
	rollEnd: 1.45,
	spinEnd: 1.52,

	// ---- B2: кнопка ПК → корпус → лицо (1.6–3.2) ----
	b2: beat(4),
	// рука тянется, палец жмёт кнопку, отпускает
	reach: 1.62,
	press: 1.86,
	release: 1.98,
	// питание: вентиляторы, индикатор
	power: 1.96,
	// план корпуса: RGB бежит волной 2.0–2.6
	b2pc: beat(5),
	rgbFrom: 2.0,
	rgbDur: 0.6,
	// лицо в темноте (подсветка RGB), монитор загорается на 2.6
	b2face: beat(6),
	monitorOn: 2.6,

	// ---- B3: экран, рабочий стол → Minecraft → сервер (3.2–5.6) ----
	b3: local(PC_START),
	// вставка: лицо в красном свете загрузки (нетерпение)
	b3face: beat(10),
	b3back: beat(11),
	mcClick: 3.6,
	loadFrom: 3.8,
	menuClick: 4.78,
	rowClick: 5.0,
	connectClick: 5.2,

	// ---- B4: Discord (5.6–7.2) ----
	b4: beat(14),
	voiceClick: 6.0,

	// ---- B5: наушники (7.2–8.4) ----
	b5: beat(18),
	// тянется к подставке, схватил, надевает (надел — на долю 8.0)
	hpReach: 7.24,
	hpGrab: 7.46,
	// headphonesOn: k = 0.7 в момент hpOn → старт = hpOn − 0.7 · hpDur
	hpDur: 1.0,
	hpOn: local(HEADPHONES_BUILD),

	// ---- B6: OBS (8.4–10.4) ----
	b6: beat(21),
	recClick: local(REC_START),

	// ---- B7: через видоискатель камеры на штативе (10.4–14.0) ----
	b7: local(FINAL_BUILD),
	// разворот кресла к камере
	turnFrom: 10.66,
	turnTo: 11.16,
	// машет (27.2 глобально)
	wave: beat(28),
	// «ПОГНАЛИ НА ВАЙП!» — самый большой удар
	pognali: local(POGNALI_HIT),
	// «HolyWorld · Лайт Анархия»
	subtitle: beat(30),
	// уход в чёрное
	fadeFrom: 13.65,
	end: 14,
};

// Планы сцены: имя и начало (локально). Каждое начало — на доле.
export const SHOT_LIST = [
	{name: 'b1', from: 0},
	{name: 'b2btn', from: BEATS.b2},
	{name: 'b2pc', from: BEATS.b2pc},
	{name: 'b2face', from: BEATS.b2face},
	{name: 'b3', from: BEATS.b3},
	{name: 'b3face', from: BEATS.b3face},
	{name: 'b3b', from: BEATS.b3back},
	{name: 'b4', from: BEATS.b4},
	{name: 'b5', from: BEATS.b5},
	{name: 'b6', from: BEATS.b6},
	{name: 'b7', from: BEATS.b7},
] as const;

export type ShotName = (typeof SHOT_LIST)[number]['name'];

// Моменты кликов мыши (звук и вздрагивание руки) — совпадают со сценарием экранов (src/screens/sequence.ts)
export const CLICKS = {
	mcDouble: [BEATS.mcClick - 0.05, BEATS.mcClick + 0.05],
	menu: BEATS.menuClick,
	row: BEATS.rowClick,
	connect: BEATS.connectClick,
	voice: BEATS.voiceClick,
	rec: BEATS.recClick,
};
