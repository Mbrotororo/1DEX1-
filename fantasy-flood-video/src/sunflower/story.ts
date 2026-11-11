// «Не свети» — вертикальная страшилка про ночного сторожа подсолнухового поля.
// Весь текст и порядок сцен здесь. Тайминги считаются автоматически из длины фраз,
// под темп диктора ~150 слов в минуту, чтобы потом можно было наложить озвучку.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type SceneId = string;

export type Sfx = {src: string; at?: number; volume?: number; rate?: number};

// Одна фраза диктора. ^слово^ — жёлтый, *слово* — красный.
// label — маленькая надпись сверху кадра (как ключевое слово в референсе).
export type Beat = {scene: SceneId; text: string; label?: string; pause?: number; sfx?: Sfx[]};

export const BEATS: Beat[] = [
	{scene: 'hook', text: 'Ночью подсолнухи ^опускают головы.^', sfx: [{src: 'hit', volume: 0.7}]},
	{scene: 'hook', text: 'Все. *Кроме одного.*', pause: 0.6, sfx: [{src: 'stinger', at: 0.5, volume: 0.9}]},

	{scene: 'offer', text: 'Мне предложили ^двадцать пять тысяч^ за одну ночь.', label: '25 000 ₽', sfx: [{src: 'coin', at: 0.6}]},
	{scene: 'field', text: 'Охранять ^поле подсолнухов^ от воров.', label: 'СТОРОЖ'},
	{scene: 'field', text: 'Перед уборкой их срезают ^мешками.^'},
	{scene: 'farmer', text: 'Фермер встретил меня ^у края поля.^'},
	{scene: 'items', text: 'Выдал ^фонарь,^ ^термос^ и ^рацию.^', sfx: [{src: 'pop', at: 0.3}, {src: 'pop', at: 0.9}, {src: 'pop', at: 1.4}]},
	{scene: 'farmer', text: 'И назвал ^три правила.^', pause: 0.4},

	{scene: 'rule1', text: 'Первое: ^не свети^ фонарём в поле.', label: 'ПРАВИЛО 1', sfx: [{src: 'click', at: 0.2}]},
	{scene: 'rule1', text: 'Только себе ^под ноги.^'},
	{scene: 'rule2', text: 'Второе: в первом ряду ^сорок^ подсолнухов.', label: 'ПРАВИЛО 2'},
	{scene: 'rule2', text: 'Каждый час ^пересчитывай.^'},
	{scene: 'rule3', text: 'Третье: если из поля ^позовут по имени^ —', label: 'ПРАВИЛО 3'},
	{scene: 'rule3', text: '*не отвечай.*', pause: 0.4, sfx: [{src: 'hit', volume: 0.6}]},
	{scene: 'farmerFace', text: 'Я засмеялся.'},
	{scene: 'farmerFace', text: 'Он — ^нет.^', pause: 0.5},

	{scene: 'towerDusk', text: 'Я залез на ^вышку^ у края поля.', label: 'ВЫШКА'},
	{scene: 'towerDusk', text: 'К полуночи все подсолнухи ^опустили головы.^', pause: 0.3},
	{scene: 'count40', text: 'Я пересчитал первый ряд.'},
	{scene: 'count40', text: '^Сорок.^', pause: 0.4},

	{scene: 'seryoga', text: 'В час ночи пришёл парень ^с термосом.^', sfx: [{src: 'steps', at: 0}]},
	{scene: 'seryoga', text: 'Сказал, что сторожит ^соседнее поле.^'},
	{scene: 'seryoga', text: 'Звали ^Серёга.^'},
	{scene: 'tea', text: 'Мы пили чай ^и молчали.^', pause: 0.4},

	{scene: 'count39', text: 'В два я снова ^пересчитал ряд.^'},
	{scene: 'count39', text: '*Тридцать девять.*', sfx: [{src: 'hit', volume: 0.8}]},
	{scene: 'count39', text: 'Одного ^не хватало.^', pause: 0.3},
	{scene: 'seryogaFace', text: 'Серёга сказал: ^не свети.^'},
	{scene: 'seryogaFace', text: 'Что бы ни было — ^не свети.^', pause: 0.5},

	{scene: 'call', text: 'Потом из поля ^позвали меня.^', label: '…', sfx: [{src: 'whisper', at: 0.2, volume: 0.9}]},
	{scene: 'call', text: '*Голосом мамы.*', sfx: [{src: 'whisper', at: 0, volume: 1, rate: 0.85}]},
	{scene: 'call', text: 'Я ^чуть не ответил.^'},
	{scene: 'shoulder', text: 'Серёга сжал моё плечо ^до боли.^', pause: 0.4, sfx: [{src: 'grab', at: 0.2}]},

	{scene: 'bend', text: 'Стебли начали ^наклоняться.^', sfx: [{src: 'rustle', at: 0}, {src: 'rustle', at: 1.0, rate: 0.9}]},
	{scene: 'bend', text: 'Ряд за рядом. ^В нашу сторону.^', sfx: [{src: 'rustle', at: 0.3, rate: 1.1}, {src: 'rustle', at: 1.3}]},
	{scene: 'thing', text: 'Между рядами шло что-то ^высокое.^', sfx: [{src: 'steps', at: 0, rate: 0.7}]},
	{scene: 'thing', text: '*Медленное.*', pause: 0.5, sfx: [{src: 'heart', at: 0}]},
	{scene: 'thingSpeaks', text: 'Оно встало у первого ряда'},
	{scene: 'thingSpeaks', text: 'и сказало ^голосом Серёги:^'},
	{scene: 'thingSpeaks', text: '*«Посвети, я ногу подвернул».*', pause: 0.6, sfx: [{src: 'whisper', at: 0, volume: 1, rate: 0.75}, {src: 'stinger', at: 1.6, volume: 0.8}]},
	{scene: 'lookRight', text: 'Я посмотрел направо.'},
	{scene: 'lookRight', text: 'Серёга сидел рядом'},
	{scene: 'lookRight', text: 'и ^качал головой.^', pause: 0.5},

	{scene: 'wait', text: 'До рассвета я держал фонарь ^выключенным.^'},
	{scene: 'wait', text: 'Шаги ходили ^вокруг вышки.^', sfx: [{src: 'steps', at: 0, rate: 0.8}, {src: 'steps', at: 1.4, rate: 0.75}]},
	{scene: 'wait', text: 'Под утро ^стихли.^', pause: 0.8},

	{scene: 'dawn', text: 'Утром приехал фермер ^с деньгами.^', label: 'УТРО', sfx: [{src: 'birds', at: 0, volume: 0.6}]},
	{scene: 'dawn', text: 'Я спросил про Серёгу ^с соседнего поля.^'},
	{scene: 'farmerDawn', text: 'Фермер ^перестал улыбаться.^', pause: 0.3},
	{scene: 'forest', text: 'Соседнего поля ^нет.^'},
	{scene: 'forest', text: 'Там ^лес.^', pause: 0.4, sfx: [{src: 'hit', volume: 0.6}]},
	{scene: 'farmerTruth', text: 'Серёгой звали ^сторожа.^'},
	{scene: 'farmerTruth', text: 'Пять лет назад ^он посветил^ в поле.'},
	{scene: 'farmerTruth', text: 'Его так и ^не нашли.^', pause: 0.5},
	{scene: 'thermos', text: 'На ступеньке вышки стоял ^термос.^'},
	{scene: 'thermos', text: 'Полный ^семечек.^', pause: 0.4, sfx: [{src: 'seeds', at: 0}]},

	{scene: 'finalCount', text: 'Я пересчитал первый ряд.'},
	{scene: 'finalCount', text: '^Сорок.^ Все опустили головы.', pause: 0.2},
	{scene: 'finalFace', text: '*Кроме последнего.*', sfx: [{src: 'hit', volume: 0.7}]},
	{scene: 'finalFace', text: 'Он смотрел на меня'},
	{scene: 'finalFace', text: 'и ^тихо сказал:^', pause: 1.0},
	{scene: 'end', text: '*«Не свети».*', pause: 2.2, sfx: [{src: 'whisper', at: 0, volume: 1, rate: 0.9}]},
];

// ---------- Автоматический тайминг ----------

const SEC_PER_WORD = 0.36;
const END_PAUSE = 0.3; // после точки, тире, двоеточия
const COMMA_PAUSE = 0.12;

export type Chunk = {at: number; end: number; text: string};
export type TimedBeat = Beat & {at: number; end: number; chunks: Chunk[]};

// Делим фразу на куски по 2–3 слова, не разрывая выделение ^…^ / *…*
const splitChunks = (text: string): string[] => {
	const words = text.split(/\s+/).filter(Boolean);
	const out: string[] = [];
	let cur: string[] = [];
	let open: string | null = null;
	for (const w of words) {
		cur.push(w);
		for (const ch of w) if (ch === '^' || ch === '*') open = open === ch ? null : ch;
		const strongEnd = /[.!?:—…»]$/.test(w.replace(/[*^]/g, ''));
		if (!open && (cur.length >= 3 || (strongEnd && cur.length >= 1) || (/,$/.test(w.replace(/[*^]/g, '')) && cur.length >= 2))) {
			out.push(cur.join(' '));
			cur = [];
		}
	}
	if (cur.length) out.push(cur.join(' '));
	// одиночное слово приклеиваем к предыдущему куску, если тот не закончил фразу
	const merged: string[] = [];
	for (const c of out) {
		const prev = merged[merged.length - 1];
		const n = c.split(' ').length;
		const prevClean = prev?.replace(/[*^]/g, '') ?? '';
		if (prev && n === 1 && prev.split(' ').length <= 3 && (c === '—' || !/[.!?:…»]$/.test(prevClean))) {
			merged[merged.length - 1] = `${prev} ${c}`;
		} else merged.push(c);
	}
	return merged;
};

const chunkDur = (c: string) => {
	const clean = c.replace(/[*^]/g, '');
	const n = clean.split(/\s+/).filter((w) => w !== '—').length;
	let d = 0.2 + n * SEC_PER_WORD;
	if (/[.!?:—…»]$/.test(clean)) d += END_PAUSE;
	else if (/,$/.test(clean)) d += COMMA_PAUSE;
	return d;
};

export type Story = {
	beats: TimedBeat[];
	spans: SceneSpan[];
	duration: number;
	spanOf: (id: SceneId) => SceneSpan;
};
export type SceneSpan = {id: SceneId; at: number; end: number; beats: TimedBeat[]};

// voice — тайминги настоящей озвучки (из распознавания), тогда субтитры идут по голосу.
export type VoiceAlign = ({at: number; end: number} | null)[][];

export const buildStory = (beats: Beat[], voice?: {align: VoiceAlign; end: number}): Story => {
	let t = 0.1;
	const timed: TimedBeat[] = [];
	beats.forEach((b, bi) => {
		const at = t;
		const chunks: Chunk[] = [];
		splitChunks(b.text).forEach((c, ci) => {
			const v = voice?.align[bi]?.[ci];
			if (v) {
				chunks.push({at: v.at, end: v.end, text: c});
				t = v.end;
			} else {
				const d = chunkDur(c);
				chunks.push({at: t, end: t + d, text: c});
				t += d;
			}
		});
		if (voice) {
			timed.push({...b, at: chunks[0].at, end: t, chunks});
			t += b.pause ?? 0.1;
		} else {
			t += b.pause ?? 0.1;
			timed.push({...b, at, end: t, chunks});
		}
	});
	if (voice) {
		// субтитр держится до следующего, если пауза короткая; сцена — до начала следующей фразы
		const all = timed.flatMap((b) => b.chunks);
		all.forEach((c, i) => {
			const next = all[i + 1];
			c.end = next && next.at - c.end < 1.0 ? next.at : c.end + 0.35;
		});
		timed.forEach((b, i) => {
			b.end = timed[i + 1] ? timed[i + 1].at : Math.max(voice.end, b.chunks[b.chunks.length - 1].end) + (b.pause ?? 0.5);
		});
		timed[0].at = 0;
		t = timed[timed.length - 1].end;
	}
	const duration = Math.ceil(t + 0.5);
	// подряд идущие фразы с одной сценой склеиваются в один кусок
	const spans: SceneSpan[] = [];
	for (const b of timed) {
		const last = spans[spans.length - 1];
		if (last && last.id === b.scene) {
			last.end = b.end;
			last.beats.push(b);
		} else spans.push({id: b.scene, at: b.at, end: b.end, beats: [b]});
	}
	spans[spans.length - 1].end = duration;
	const spanOf = (id: SceneId) => {
		const s = spans.find((x) => x.id === id);
		if (!s) throw new Error(`Нет сцены ${id}`);
		return s;
	};
	return {beats: timed, spans, duration, spanOf};
};

// Первая часть «Не свети»
export const PART1 = buildStory(BEATS);
