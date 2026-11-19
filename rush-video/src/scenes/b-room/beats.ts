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
	// полёт продолжается из a-home («рыбкой», тело горизонтально); в воздухе — разворот спиной к креслу
	twistFrom: 0.4,
	twistTo: 0.72,
	// плюхнулся в кресло — на долю
	land: beat(2),
	// кресло откатывается к столу и крутится
	rollEnd: 1.5,
	spinEnd: 1.56,

	// ---- B2: кнопка ПК → корпус → лицо (1.6–3.2) ----
	b2: beat(4),
	// рука входит в кадр, жмёт кнопку, отпускает
	reach: 1.62,
	press: 1.78,
	release: 1.88,
	// питание: кнопка загорается, вентиляторы (горит ≥ 7 кадров до склейки 2.0)
	power: 1.88,
	// план корпуса: RGB бежит волной ~2.0–2.6 (стартует с питанием, к склейке уже видна)
	b2pc: beat(5),
	rgbFrom: 1.96,
	rgbDur: 0.64,
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

	// ---- B5: наушники (7.2–8.4): 7.2 сбоку у подставки, 7.6 лицо крупно ----
	b5: beat(18),
	// кресло докатывается к подставке, рука тянется, хватает (наушники — из руки дальше)
	hpRollTo: 7.34,
	hpGrab: 7.42,
	b5face: beat(19),
	// headphonesOn: k = 0.7 в момент hpOn → старт = hpOn − 0.7 · hpDur
	hpDur: 1.0,
	hpOn: local(HEADPHONES_BUILD),

	// ---- B6: OBS (8.4–10.4), весь план — экран: курсор к «Начать запись», клик → «Остановить запись» ----
	b6: beat(21),
	recClick: local(REC_START),

	// ---- B7: через видоискатель камеры на штативе (10.4–14.0) ----
	b7: local(FINAL_BUILD),
	// последний клик мышью (сворачивает OBS) до разворота
	b7Click: 10.56,
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
	{name: 'b5face', from: BEATS.b5face},
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
	final: BEATS.b7Click,
};
