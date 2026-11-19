// Звуки сцены a-home (локальное время = глобальное, 0–16). Только оригинальные звуки Minecraft.
// Моменты — из beats.ts (шаги считаются там же по маршрутам героя, чтобы совпадать с ногами).
import {sfx} from '../../core/sfx';
import {BAG_DUR, BEATS, BOOK_LANDS, BOOKS, RUN_STEPS, SNOW_STEPS, WOOD_STEPS_IN} from './beats';

// момент, когда рука хватает лямку (hurlBackpack k = 0.3)
const BAG_GRAB_T = BEATS.bagFrom + 0.3 * BAG_DUR;

const s = sfx();
const pick = (i: number, n: number) => 1 + (((i * 7) % n) + n) % n;
// лёгкий разброс высоты по номеру
const vary = (i: number, amt = 0.08) => 1 + (((i * 37) % 11) / 10 - 0.5) * amt;

// ---------- A1: двор, дверь, ветер, усталые шаги ----------
// ветер за закрытой дверью — глухо (гул полёта на элитрах, низкие частоты)
s.add(0.0, 'item/elytra/elytra_loop', 0.24, {lowpass: 700, fadeIn: 0.4, dur: 1.35, fade: 0.3});
// шаги по снегу снаружи (до открытия двери — приглушённо, но слышно)
s.seq(SNOW_STEPS, (i) => `step/snow${pick(i, 4)}`, 1.0, (i) => ({rate: 0.92 * vary(i), lowpass: SNOW_STEPS[i] < BEATS.doorOpen ? 3200 : 6000}));
// дверь открывается (щелчок замка — на старте движения), в проём врывается ветер со снегом
s.add(BEATS.doorOpen - 0.01, 'random/click', 0.25, {rate: 1.4});
s.add(BEATS.doorOpen, 'block/wooden_door/open1', 0.75, {rate: 0.9});
s.add(BEATS.doorOpen + 0.02, 'item/elytra/elytra_loop', 0.35, {lowpass: 3000, fadeIn: 0.1, dur: 1.9, fade: 0.8});
s.add(BEATS.doorOpen + 0.05, 'entity/wind_charge/wind_burst1', 0.3, {rate: 0.9, lowpass: 4000});
s.add(BEATS.doorOpen + 0.1, 'block/powder_snow/step1', 0.3, {rate: 0.8});
// усталые шаги по дереву
s.seq(WOOD_STEPS_IN, (i) => `step/wood${pick(i, 6)}`, 0.36, (i) => ({rate: 0.86 * vary(i)}));
// дверь сама закрылась
s.add(BEATS.doorClose + BEATS.doorCloseDur - 0.04, 'block/wooden_door/close1', 0.7, {rate: 0.92});

// ---------- A2: вздох, пар ----------
s.add(BEATS.sigh + 0.05, 'mob/horse/breathe2', 1.4, {rate: 1.05, lowpass: 1800, fade: 0.3});
s.add(BEATS.exhale - 0.03, 'mob/horse/breathe1', 1.6, {rate: 0.78, lowpass: 1600, fade: 0.4});

// ---------- A3–A4: часы тикают, маркер скрипит ----------
// тик-так на каждое мигание двоеточия (0.5 с), к записке — чаще и тревожнее
s.every(5.5, 7.0, 0.5, 'random/click', 0.65, (i) => ({rate: i % 2 ? 1.75 : 2.05, lowpass: 4200}));
s.every(7.0, 7.96, 0.25, 'random/click', 0.45, (i) => ({rate: i % 2 ? 1.85 : 2.2, lowpass: 4200}));
// скрип маркера по бумаге (исходники тихие, около −22 дБ) — громче тиканья, которое к записке чуть стихает
s.add(BEATS.circle, 'ui/cartography_table/drawmap1', 1.2, {rate: 1.25});
s.add(BEATS.circle + 0.3, 'ui/cartography_table/drawmap2', 1.0, {rate: 1.35, dur: 0.4, fade: 0.12});

// ---------- A5: шок ----------
// удар: музыка сама бьёт в 8.0 — эффект не громче 0.6
// короткий хвост: после удара — почти тишина (QUIET 8.05–9.2), слышны «сердце» музыки и дробь
s.add(BEATS.shock, 'random/explode1', 0.5, {rate: 0.55, lowpass: 900, dur: 0.7, fade: 0.5});
s.add(BEATS.shock, 'entity/player/attack/knockback1', 0.45, {rate: 0.8});
// звон в ушах (тон ~1.5 и 2.8 кГц): заполняет тишину 8.3–8.6 и гаснет до «сердца» музыки (8.8).
// У resonate.ogg первые 0.5 с — тишина, тон нарастает к 1.9 с и резко падает на 1.94–2.0 с:
// берём нарастание (1.2–1.93 с), а вместо провала — тот же хвост (с 1.98 с) громче, внахлёст
s.add(BEATS.shock + 0.03, 'block/bell/resonate', 0.5, {rate: 1.6, offset: 1.2, fadeIn: 0.04, dur: 0.46, fade: 0.05});
s.add(BEATS.shock + 0.47, 'block/bell/resonate', 3.0, {rate: 1.6, offset: 1.98, fadeIn: 0.03, dur: 0.45, fade: 0.3});
// надпись влетает с ударом
s.add(BEATS.title, 'random/anvil_land', 0.22, {rate: 1.5});
s.add(BEATS.title, 'entity/player/attack/strong1', 0.55, {rate: 0.9});

// ---------- A6: шапка ----------
s.add(BEATS.hatFrom + 0.12, 'item/armor/equip_leather1', 0.45, {rate: 1.1});
s.add(BEATS.hatRelease - 0.03, 'entity/player/attack/sweep1', 0.62, {rate: 1.15});
s.add(BEATS.hatLand, 'dig/cloth1', 0.6, {rate: 0.95});
s.add(BEATS.hatLand + 0.01, 'step/snow2', 0.25, {rate: 1.3});

// ---------- A7: рюкзак, замедление, удар 11.2, книги ----------
// схватил лямку и сорвал рюкзак (уже в кадре A7)
s.add(BEATS.bagFrom + 0.02, 'item/armor/equip_leather2', 0.5, {rate: 0.9});
s.add(BAG_GRAB_T - 0.01, 'item/armor/equip_leather4', 0.45, {rate: 1.1});
s.add(BEATS.bagRelease - 0.04, 'entity/player/attack/sweep3', 0.7, {rate: 0.85});
// замедление: растянутый низкий «вжух» и шелест страниц
s.add(BEATS.bagRelease + 0.04, 'entity/player/attack/sweep4', 0.45, {rate: 0.45, fadeIn: 0.05, fade: 0.3});
// шелест страниц: offset 0.26 — главный «хлоп» листов (0.42 с исходника) приходится на 11.04, до удара о пол
s.add(BEATS.bagRelease + 0.17, 'item/book/open_flip1', 0.6, {rate: 0.6, offset: 0.26});
// рюкзак налетает на камеру
s.add(11.04, 'entity/player/attack/sweep2', 0.45, {rate: 0.7, lowpass: 3500});
// удар об пол (доля 11.2)
s.add(BEATS.bagLand, 'damage/fallbig', 1.2, {rate: 0.85});
s.add(BEATS.bagLand, 'dig/wood2', 0.8, {rate: 0.75});
s.add(BEATS.bagLand + 0.01, 'item/armor/equip_leather3', 0.35, {rate: 0.75});
// книги шлёпаются вокруг: отчётливые шлепки поверх хвоста тарелки (исходник тихий, около −18 дБ);
// offset 0.074 срезает тишину в начале файла — шлепок ровно в момент касания пола;
// тетради — тот же звук выше (и чуть громче: первые падают на самый громкий хвост тарелки);
// панорама — с какой стороны от камеры (z ≈ 5.3, кадр смотрит в −x) падает
BOOK_LANDS.forEach((at, i) => {
	const b = BOOKS[i];
	const pan = Math.max(-0.5, Math.min(0.5, (5.3 - b.land[2]) * 0.45));
	s.add(at, 'item/book/close_put1', b.notebook ? 1.55 : 1.4, {rate: b.notebook ? 1.25 : vary(i, 0.2), offset: 0.074, pan});
});

// ---------- A8: рывок, лестница, коридор, дверь, прыжок ----------
s.add(BEATS.turn + 0.04, 'entity/player/attack/sweep5', 0.35, {rate: 1.4});
s.add(BEATS.turn + 0.06, 'step/wood3', 0.5, {rate: 0.8});
// топот: по полу, по ступеням (громче, глуше), по коридору; за закрытой дверью комнаты — приглушённо
RUN_STEPS.forEach((st, i) => {
	const behindDoor = st.t >= BEATS.room && st.t < BEATS.slam - 0.02;
	const vol = st.stairs ? 0.8 : 0.7;
	s.add(st.t, `step/wood${pick(i, 6)}`, vol * vary(i, 0.15), {rate: (st.stairs ? 0.95 : 1.05) * vary(i), lowpass: behindDoor ? 1200 : undefined});
	if (st.stairs) s.add(st.t + 0.005, `step/ladder${pick(i, 5)}`, 0.3, {rate: 0.9});
});
// дверь с размаху о стену (громче стоп-аккорда музыки) — ОДИН удар ровно в slam:
// у open2 скрип на 0.14 с исходника (идёт во время распахивания) и стук на 0.237 с — стук совмещён с ударом;
// у door_close первый щелчок (защёлка) пропущен (offset), остаётся только громкий второй удар (0.15 с исходника)
s.add(BEATS.slam - 0.19, 'block/wooden_door/open2', 0.5, {rate: 1.2});
s.add(BEATS.slam - 0.02, 'random/door_close', 0.85, {rate: 0.75, offset: 0.13});
s.add(BEATS.slam, 'damage/fallbig', 0.7, {rate: 1.25});
// прыжок «рыбкой» и «вжух»-переход
s.add(BEATS.dive - 0.02, 'entity/player/attack/sweep6', 0.55, {rate: 0.85});
s.add(BEATS.dive + 0.05, 'mob/phantom/flap1', 0.25, {rate: 1.4});
s.add(BEATS.end - 0.2, 'entity/player/attack/sweep7', 0.45, {rate: 1.3});

export const events = s.events;
