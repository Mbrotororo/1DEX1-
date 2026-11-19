import type {NoteEvent} from '../core/sfx';
import {BACKPACK_HIT, FINAL_CHORD, POGNALI_HIT, REC_START, ROOM_HIT, RUSH_START, SHOCK_HIT, STEP, VIDEO_END, barTime} from './grid';
import {Score, hash01, midi, type Pitch} from './notes';

// Музыка ролика из нотных блоков. at — ГЛОБАЛЬНОЕ время (сек), inst — инструмент
// (семпл 'note/…' из ассетов Minecraft), note — полутоны от базовой ноты семпла (0 — как записан).
// Сведение: scripts/mix-audio.ts. Сетка и акценты — в ./grid.ts.
//
// Тональность — ля минор. Гармония:
//   0–8      Am | F | C | G | E7      (по 1.6 с, 75 BPM) -> 8.0 удар (A)
//   9.6–16   Am | F | C | G·E          (такты 1–4; 15.2 стоп-аккорд E)
//   16–24    Am | F | C | G | Am       (такты 5–9; 19.2–24 легко, под интерфейс ПК)
//   24–29.6  F·G | Am (с 25.2) ·F | G (брейк) Am (27.6) ·F | G | A (мажор, 29.6)
// Формула «фа–соль–ля» (VI–VII–I) звучит трижды: 25.2, 27.6 и в финале — в мажор.

// Аккорды: бас (низ/октава выше), гитара (трезвучие у ля малой октавы)
type Chord = {low: Pitch; high: Pitch; gtr: Pitch[]};
const CH: Record<string, Chord> = {
	Am: {low: 'A2', high: 'A3', gtr: ['A3', 'C4', 'E4']},
	F: {low: 'F2', high: 'F3', gtr: ['A3', 'C4', 'F4']},
	C: {low: 'C2', high: 'C3', gtr: ['G3', 'C4', 'E4']},
	G: {low: 'G2', high: 'G3', gtr: ['G3', 'B3', 'D4']},
	E: {low: 'E2', high: 'E3', gtr: ['G#3', 'B3', 'E4']},
	A: {low: 'A2', high: 'A3', gtr: ['A3', 'C#4', 'E4']},
};

// Гармония быстрой части: [время, аккорд] — партии берут аккорд отсюда
const HARMONY: [number, keyof typeof CH][] = [
	[9.2, 'E'],
	[9.6, 'Am'],
	[11.2, 'F'],
	[12.8, 'C'],
	[14.4, 'G'],
	[15.2, 'E'],
	[16.0, 'Am'],
	[17.6, 'F'],
	[19.2, 'C'],
	[20.8, 'G'],
	[22.4, 'Am'],
	[24.0, 'F'],
	[24.8, 'G'],
	[25.2, 'Am'],
	[26.4, 'F'],
	[27.2, 'G'],
	[27.6, 'Am'],
	[28.4, 'F'],
	[28.8, 'G'],
	[29.6, 'A'],
];
const chordAt = (t: number): Chord => {
	let c = HARMONY[0][1];
	for (const [at, name] of HARMONY) if (t >= at - 1e-6) c = name;
	return CH[c];
};

const s = new Score();

// ---------------------------------------------------------------- 0–8: устал, грустно
{
	// громкость вступления относительно быстрой части (≈ −6 LU)
	s.gain = 1.35;
	const end = SHOCK_HIT;
	const rv = 0.3;
	// арфа: ломаный аккорд восьмыми (0.4 с); на часах (5.6–6.8) реже, к 8.0 — разгон шестнадцатыми
	const harp: [number, string, number][] = [
		[0.0, 'A3', 0.55], [0.4, 'E4', 0.42], [0.8, 'A4', 0.45], [1.2, 'C5', 0.4],
		[1.6, 'F3', 0.55], [2.0, 'C4', 0.42], [2.4, 'F4', 0.45], [2.8, 'A4', 0.4],
		[3.2, 'C4', 0.55], [3.6, 'G4', 0.42], [4.0, 'C5', 0.45], [4.4, 'E5', 0.36],
		[4.8, 'G3', 0.55], [5.2, 'D4', 0.4], [5.6, 'G4', 0.36], [6.0, 'B4', 0.28],
		[6.4, 'B3', 0.5], [6.8, 'E4', 0.42], [7.2, 'G#4', 0.46], [7.4, 'B4', 0.5], [7.6, 'D5', 0.56], [7.8, 'E5', 0.62],
	];
	for (const [t, n, v] of harp) s.play(t, 'harp', n, v * 1.6, {reverb: rv, pan: -0.15, endBy: end});
	// колокольчик: печальная мелодия сверху
	const bell: [number, string, number][] = [
		[0.8, 'E6', 0.5], [1.6, 'C6', 0.55], [2.4, 'A5', 0.5], [2.8, 'B5', 0.4], [3.2, 'C6', 0.55],
		[4.0, 'E6', 0.6], [4.8, 'D6', 0.55], [5.6, 'B5', 0.45], [6.4, 'G#5', 0.55], [7.2, 'B5', 0.5], [7.6, 'D6', 0.55],
	];
	for (const [t, n, v] of bell) s.play(t, 'bell', n, v * 1.55, {reverb: rv + 0.1, pan: 0.15, endBy: end});
	// мягкий бас на смене аккорда
	const bass: [number, string][] = [[0.0, 'A2'], [1.6, 'F2'], [3.2, 'C3'], [4.8, 'G2'], [6.4, 'E2'], [7.2, 'E2']];
	for (const [t, n] of bass) s.play(t, 'bass', n, 0.28, {reverb: 0.15, endBy: end});
	// искры льдинок: начало и вершина мелодии
	s.play(0.0, 'chime', 'A6', 0.5, {reverb: 0.5, pan: 0.3});
	s.play(4.0, 'chime', 'E6', 0.4, {reverb: 0.5, pan: 0.3, endBy: end});
	s.gain = 1;
}

// ---------------------------------------------------------------- 8.0: удар шока, затем почти тишина
{
	const t = SHOCK_HIT;
	// удар шока — по громкости как «ПОГНАЛИ»
	s.gain = 1.3;
	s.play(t, 'bd', 0, 1.0, {human: 0});
	s.play(t, 'bd', -5, 0.8, {human: 0});
	s.play(t, 'bass', 'A1', 0.9, {human: 0});
	s.play(t, 'bass', 'A2', 0.5, {human: 0});
	s.play(t, 'didgeridoo', 'A1', 0.35, {human: 0, reverb: 0.3});
	s.play(t, 'snare', -9, 0.6, {human: 0, reverb: 0.8});
	let at = t;
	for (let k = 0; k < 14; k++) {
		s.play(at, 'hat', -8 + (k % 3), 0.7 * Math.pow(0.76, k), {reverb: 0.8, human: 0, pan: k % 2 ? 0.3 : -0.3});
		at += 0.018 + 0.01 * hash01(k, 80);
	}
	// яркое: открытая квинта ля–ми наверху
	s.chord(t, 'bell', ['A5', 'E6', 'A6'], 0.55, {human: 0, reverb: 0.6});
	s.play(t, 'chime', 'A6', 0.5, {human: 0, reverb: 0.6});
	s.gain = 1;
	// «сердце»: тук-тук
	s.play(8.8, 'bd', -7, 0.5, {human: 0});
	s.play(8.96, 'bd', -7, 0.36, {human: 0});
	// разгон в 9.6: дробь малого, бас ми, взлёт bit
	[0.3, 0.42, 0.58, 0.78].forEach((v, i) => s.play(9.2 + i * STEP, 'snare', i, v, {human: 0}));
	s.play(9.2, 'bass', 'E2', 0.5);
	s.play(9.4, 'bass', 'E3', 0.42);
	s.line(9.2, 'bit', 'E4 G#4 B4 D5', 0.55, {pan: 0.1});
}

// ---------------------------------------------------------------- 9.6–29.6: бегом!
const bar = barTime;

// «Тарелка» из нотных блоков: низкий малый + частая затухающая дробь хэта (шипящий хвост)
// + льдинка в тон аккорда. Интервалы дроби чуть разные (хэш), чтобы не гудело.
const crash = (t: number, v = 1, top: Pitch = 'A6') => {
	s.play(t, 'snare', -9, 0.9 * v, {reverb: 0.85, human: 0});
	let at = t;
	for (let k = 0; k < 12; k++) {
		s.play(at, 'hat', -7 + (k % 3), 0.8 * v * Math.pow(0.74, k), {reverb: 0.7, human: 0, pan: k % 2 ? 0.3 : -0.3});
		at += 0.018 + 0.01 * hash01(k, Math.round(t * 10));
	}
	s.play(t, 'chime', top, 0.5 * v, {reverb: 0.5, human: 0, pan: 0.25});
};

// Октава вниз/вверх: oct('A2', -1) = A1
const oct = (p: Pitch, k: number) => (typeof p === 'number' ? p : midi(p)) + 12 * k;

// Акцент на доле: тарелка + бочка пониже + бас с нижней октавой + аккорд гитары
const accent = (t: number, v: number, top: Pitch = 'A6') => {
	const c = chordAt(t);
	crash(t, v, top);
	s.play(t, 'bd', -4, 0.7 * v, {human: 0});
	s.play(t, 'bass', oct(c.low, -1), 0.6 * v, {human: 0});
	s.play(t, 'bass', c.low, 0.45 * v, {human: 0});
	s.chord(t, 'guitar', c.gtr, 0.3 * v, {len: 0.22, human: 0, pan: -0.3});
};

// Ударные одного такта: бочка / малый / хэт строками по шестнадцатым
const KICK = 0.78;
const SNARE = 0.9;
const HAT = 0.2;
const kit = (n: number, kick: string, snare: string, hat: string, v = 1) => {
	const t = bar(n);
	s.drums(t, 'bd', kick, KICK * v);
	// малый: два слоя — щелчок и «тело» пониже
	s.drums(t, 'snare', snare, SNARE * v);
	s.drums(t, 'snare', snare, 0.45 * v, {note: -6});
	s.drums(t, 'hat', hat, HAT * v, {note: 3, pan: 0.22});
};
// Нарастающая дробь малого: шаги такта, громкость от v0 до v1
const snareRamp = (t0: number, steps: number[], v0: number, v1: number) => {
	steps.forEach((i, k) => {
		const v = SNARE * (v0 + ((v1 - v0) * k) / Math.max(1, steps.length - 1));
		s.play(t0 + i * STEP, 'snare', 0, v, {human: 0.04});
		s.play(t0 + i * STEP, 'snare', -6, v * 0.55, {human: 0.04});
	});
};
const H16 = 'oxXx oxXx oxXx oxXx';
const H8 = '..x. ..x. ..x. ..x.';

// Бас: октавы восьмыми по гармонии; from/to — шаги внутри такта
const bassOct = (n: number, from = 0, to = 16, v = 1) => {
	for (let i = from; i < to; i += 2) {
		const t = bar(n) + i * STEP;
		const c = chordAt(t);
		const up = (i / 2) % 2 === 1;
		s.play(t, 'bass', up ? c.high : c.low, (up ? 0.42 : 0.56) * v, {len: 0.17, release: 0.04});
	}
};

// Гитара: аккорд на слабые восьмые («ска»-подыгрыш)
const skank = (n: number, steps = [2, 6, 10, 14], v = 1) => {
	for (const i of steps) {
		const t = bar(n) + i * STEP;
		s.chord(t, 'guitar', chordAt(t).gtr, 0.3 * v, {len: 0.11, release: 0.05, pan: -0.3});
	}
};

// Ведущий голос: pling + bit в унисон (+ ксилофон октавой выше в припевах)
const lead = (t: number, text: string, v = 1, xylo = false) => {
	s.line(t, 'pling', text, 0.42 * v, {reverb: 0.15});
	s.line(t, 'bit', text, 0.5 * v, {reverb: 0.1, pan: 0.05});
	if (xylo) {
		const up = text.replace(/([A-G][#b]?)(\d)/g, (_, n: string, o: string) => `${n}${Number(o) + 1}`);
		s.line(t, 'xylophone', up, 0.4 * v, {pan: 0.2});
	}
};

// --- такт 1 (9.6, Am): грув; с 10.6 стоп под замедление, дробь в удар 11.2
accent(RUSH_START, 0.8);
kit(1, 'X...x...x.......', '....x...........', '..x...x.........');
bassOct(1, 0, 10);
skank(1, [2, 6]);
s.drums(10.8, 'snare', 'oxxX', 0.36);

// --- такт 2 (11.2, F): удар рюкзака; 12.0 затакт мелодии
accent(BACKPACK_HIT, 1);
kit(2, 'X...x...x...x...', '....x.......x...', H8);
bassOct(2);
skank(2);
lead(bar(2) + 8 * STEP, 'A4 - B4 - C5 - D5 -', 0.9);

// --- такт 3 (12.8, C): мелодия
kit(3, 'x...x...x...x...', '....x.......x...', H16);
bassOct(3);
skank(3);
lead(bar(3), 'E5 - - E5 - - G5 - E5 - D5 - C5 - D5 -', 0.9);

// --- такт 4 (14.4, G -> 15.2 E): стоп-аккорд на двери, сбивка «томами» в 16.0
kit(4, 'x...x...X.......', '....x.....xx....', 'oxXx oxXx x... ....');
bassOct(4, 0, 8);
s.play(bar(4, 3), 'bass', 'E2', 0.75);
s.play(bar(4, 3), 'bass', 'E1', 0.45);
skank(4, [2, 6]);
s.chord(bar(4, 3), 'guitar', CH.E.gtr, 0.34, {len: 0.25});
lead(bar(4), 'D5 - - D5 - - B4 - E5 - . . . . . .', 0.9);
s.play(bar(4, 3), 'snare', -9, 0.4, {reverb: 0.7, human: 0});
// «томы»: бочка повыше
[[12, 10], [13, 10], [14, 6], [15, 3]].forEach(([i, p]) => s.play(bar(4) + i * STEP, 'bd', p, 0.62));

// --- такты 5–6 (16.0, Am | F): припев, полный состав
accent(ROOM_HIT, 1.2);
s.chord(bar(5), 'bell', ['A5', 'E6'], 0.35, {reverb: 0.4});
for (const n of [5, 6]) {
	kit(n, 'x...x...x...x.x.', '....x.......x..o', H16);
	bassOct(n);
	skank(n);
}
// сбивка в конце 6-го такта перед «компьютером»
s.drums(bar(6) + 13 * STEP, 'snare', 'xxx', 0.4);
lead(bar(5), 'A4 - A4 C5 - A4 E5 - D5 - C5 - A4 - G4 -', 1, true);
lead(bar(6), 'A4 - A4 C5 - A4 F5 - E5 - C5 - A4 - C5 -', 1, true);

// --- такты 7–9 (19.2, C | G | Am): экран ПК — легко, слабые доли свободны под клики
for (const n of [7, 8, 9]) {
	const v = 0.8;
	kit(n, n === 8 ? 'x.......x.....x.' : 'x.......x.......', '................', n === 9 ? '..x...x.oxox oxXx' : H8, v);
	// бас: синкопа, без октав
	for (const [i, hi] of [[0, false], [6, false], [8, true], [14, false]] as [number, boolean][]) {
		const t = bar(n) + i * STEP;
		s.play(t, 'bass', hi ? chordAt(t).high : chordAt(t).low, 0.48, {len: 0.3});
	}
}
// «компьютерное» арпеджио шестнадцатыми (громче только на 1 и 3 — на 2 и 4 клики)
const ARP: Record<number, string[]> = {7: ['C4', 'E4', 'G4', 'C5'], 8: ['B3', 'D4', 'G4', 'B4'], 9: ['A3', 'C4', 'E4', 'A4']};
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 1];
for (const n of [7, 8, 9]) {
	ARP_ORDER.forEach((k, i) => s.play(bar(n) + i * STEP, 'bit', ARP[n][k], i % 8 === 0 ? 0.36 : 0.24, {len: 0.07, release: 0.03, pan: 0.3}));
}
// мелодия вполголоса: спуск секвенцией
s.line(bar(7), 'pling', 'E5 - - - - - D5 - C5 - - - - - - -', 0.34, {reverb: 0.25, pan: -0.1});
s.line(bar(8), 'pling', 'D5 - - - - - C5 - B4 - - - - - - -', 0.34, {reverb: 0.25, pan: -0.1});
s.line(bar(9), 'pling', 'C5 - - - - - B4 - A4 - - - - - - -', 0.34, {reverb: 0.25, pan: -0.1});

// --- такт 10 (24.0, F·G -> 25.2 Am): наушники, малый разгон, акцент на «Начать запись»
kit(10, 'x...x...x...X.x.', '................', '..x...x...x. oxXx');
snareRamp(bar(10), [0, 2, 4, 6, 8, 10, 11], 0.3, 1.0);
for (let i = 0; i < 12; i += 2) {
	const t = bar(10) + i * STEP;
	s.play(t, 'bass', chordAt(t).low, 0.45 + i * 0.02, {len: 0.17});
	s.chord(t, 'guitar', chordAt(t).gtr, 0.14 + i * 0.012, {len: 0.1, pan: -0.3});
}
lead(bar(10), 'A4 - A4 - C5 - C5 - D5 - D5 - E5 - - -', 0.85);
accent(REC_START, 1, 'E6');
skank(10, [14]);

// --- такт 11 (25.6, Am -> 26.4 F): тема и финальный разгон
kit(11, 'x...x...x...x...', '....x...........', H16);
snareRamp(bar(11), [8, 10, 12, 14, 15], 0.45, 1.0);
bassOct(11);
skank(11);
lead(bar(11), 'A4 - A4 C5 - A4 E5 - F4 - A4 - C5 - F5 -', 1);

// --- такт 12 (27.2): брейк на долю, 27.6 «ПОГНАЛИ», последний припев
[0.4, 0.55, 0.72, 0.9].forEach((v, i) => s.play(bar(12) + i * STEP, 'snare', i * 2, v * SNARE, {human: 0}));
s.play(bar(12), 'bass', 'G2', 0.5, {len: 0.3});
s.line(bar(12), 'pling', 'G5 - - -', 0.4, {reverb: 0.2});
accent(POGNALI_HIT, 1.45);
s.chord(POGNALI_HIT, 'bell', ['A5', 'E6', 'A6'], 0.45, {reverb: 0.45});
kit(12, '....X...x...x...', '........x.......', '.... oxXx oxXx oxXx');
bassOct(12, 4, 16);
skank(12, [4, 6, 10, 14]);
// тема с удара: на долю позже такта (удар 27.6 — «раз» последней фразы)
lead(POGNALI_HIT, 'A4 - A4 C5 - A4 E5 - D5 - C5 -', 1.05, true);

// --- такт 13 (28.8, G -> 29.6 A мажор): каденция и финальный аккорд
kit(13, 'x...x...........', 'x...xxxX........', 'oxXx ....');
bassOct(13, 0, 8);
skank(13, [2]);
lead(bar(13), 'B4 - D5 - D5 E5 F5 G5', 1.05, true);
{
	// сведение гасит последние 0.6 с ролика (с 29.4) — аккорд громче, чтобы удар остался ударом
	const t = FINAL_CHORD;
	const k = 1.7;
	accent(t, 1.5);
	s.play(t, 'bd', 0, 1.0 * k, {human: 0});
	s.chord(t, 'guitar', ['A4'], 0.3 * k, {human: 0, pan: -0.3});
	s.chord(t, 'pling', ['C#5', 'E5', 'A5'], 0.38 * k, {human: 0, reverb: 0.3});
	s.chord(t, 'bit', ['A4', 'C#5', 'E5'], 0.36 * k, {human: 0});
	s.chord(t, 'bell', ['A5', 'C#6', 'E6'], 0.42 * k, {human: 0, reverb: 0.4, endBy: VIDEO_END});
	s.play(t, 'xylophone', 'A6', 0.4 * k, {human: 0});
}

export const SCORE: NoteEvent[] = s.sorted();

// Общая громкость музыки относительно эффектов (музыка тише эффектов)
export const MUSIC_GAIN = 0.38;
