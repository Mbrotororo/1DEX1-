// Описание звуков сцены. ЧИСТЫЙ модуль: его импортируют и сцены, и Node-скрипты
// (scripts/fetch-sounds.ts, scripts/mix-audio.ts). Никакого React/three.
//
// Время события — локальное время сцены в секундах. Имя звука — путь в ассетах
// Minecraft без расширения, например 'random/pop' или 'mob/zombie/say1'
// (поиск имён: npm run sounds -- --find zombie).

export type SfxEvent = {
	// когда начать (сек, локальное время сцены; у музыки — глобальное)
	at: number;
	// путь звука в ассетах Mojang без '.ogg'
	src: string;
	// громкость 0..1+ (по умолчанию 0.5)
	volume?: number;
	// скорость/высота (1 — как есть, 2 — на октаву выше и вдвое короче)
	rate?: number;
	// обрезать до этой длины (сек, уже с учётом rate)
	dur?: number;
	// плавное появление (сек)
	fadeIn?: number;
	// плавное затухание в конце (сек); работает и без dur — тогда в конце самого звука
	fade?: number;
	// панорама: -1 слева … 0 центр … 1 справа
	pan?: number;
	// сколько отправить в реверберацию 0..1 (пещера/подземелье)
	reverb?: number;
	// срез высоких частот, Гц (приглушить, «звук издалека/из-за стены»)
	lowpass?: number;
	// пропустить столько секунд от начала исходного файла
	offset?: number;
};

export type SfxOpts = Omit<SfxEvent, 'at' | 'src'>;

// Построитель списка событий сцены
export class Sfx {
	readonly events: SfxEvent[] = [];
	private defaults: SfxOpts;

	constructor(defaults: SfxOpts = {}) {
		this.defaults = defaults;
	}

	// Один звук
	add(at: number, src: string, volume = 0.5, opts: SfxOpts = {}): this {
		if (!Number.isFinite(at)) throw new Error(`sfx: время не число для "${src}"`);
		this.events.push({...this.defaults, volume, ...opts, at, src});
		return this;
	}

	// Несколько звуков подряд: times — список моментов; src — имя или функция от номера
	seq(times: number[], src: string | ((i: number) => string), volume = 0.5, opts: SfxOpts | ((i: number) => SfxOpts) = {}): this {
		times.forEach((at, i) => {
			this.add(at, typeof src === 'string' ? src : src(i), volume, typeof opts === 'function' ? opts(i) : opts);
		});
		return this;
	}

	// Повторять звук каждые every секунд на отрезке [from, to)
	every(from: number, to: number, every: number, src: string | ((i: number) => string), volume = 0.5, opts: SfxOpts | ((i: number) => SfxOpts) = {}): this {
		const times: number[] = [];
		for (let i = 0; from + i * every < to - 1e-6; i++) times.push(from + i * every);
		return this.seq(times, src, volume, opts);
	}

	// Зациклить длинный звук (атмосфера, ветер) на отрезке [from, to):
	// куски длиной len секунд внахлёст с плавными стыками; на концах — fade.
	loop(from: number, to: number, src: string, len: number, volume = 0.3, opts: SfxOpts & {cross?: number; edge?: number} = {}): this {
		const {cross = Math.min(0.6, len * 0.25), edge = 0.5, ...rest} = opts;
		const step = len - cross;
		for (let at = from; at < to - 1e-6; at += step) {
			const dur = Math.min(len, to - at);
			const first = at === from;
			const last = at + step >= to - 1e-6;
			this.add(at, src, volume, {...rest, dur, fadeIn: first ? edge : cross, fade: last ? Math.min(edge, dur) : cross});
		}
		return this;
	}

	// Шаги на отрезке [from, to): material — 'grass' | 'snow' | 'stone' | 'wood' | 'sand' | 'gravel' ...
	// (звуки step/<material>1..N). interval — секунды между шагами (ходьба ≈ 0.42, бег ≈ 0.3, спринт ≈ 0.22).
	steps(from: number, to: number, material: string, interval = 0.4, volume = 0.35, opts: SfxOpts & {variants?: number} = {}): this {
		const {variants = 4, ...rest} = opts;
		let i = 0;
		for (let at = from; at < to - 1e-6; at += interval, i++) {
			// псевдослучайные вариант и высота, чтобы шаги не звучали как метроном
			const h = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
			const variant = 1 + ((i * 7 + Math.floor(h * 3)) % variants);
			this.add(at, `step/${material}${variant}`, volume * (0.85 + h * 0.3), {rate: 0.92 + h * 0.16, ...rest});
		}
		return this;
	}

	// Добавить готовые события (например, из общего набора) со сдвигом по времени
	merge(events: SfxEvent[], shift = 0): this {
		for (const e of events) this.events.push({...e, at: e.at + shift});
		return this;
	}
}

export const sfx = (defaults: SfxOpts = {}) => new Sfx(defaults);

// Музыка: нотные блоки. at — ГЛОБАЛЬНОЕ время ролика, note — полутоны от базовой ноты семпла
// (0 — как записан; 12 — октава вверх; можно дробные и отрицательные).
export type NoteInst =
	| 'harp'
	| 'bass'
	| 'bd'
	| 'snare'
	| 'hat'
	| 'bell'
	| 'flute'
	| 'chime'
	| 'guitar'
	| 'xylophone'
	| 'iron_xylophone'
	| 'cow_bell'
	| 'didgeridoo'
	| 'bit'
	| 'banjo'
	| 'pling';

export type NoteEvent = {
	at: number;
	inst: NoteInst;
	note: number;
	volume?: number;
	pan?: number;
	// обрезать ноту (сек) с затуханием fade
	dur?: number;
	fade?: number;
	reverb?: number;
};

// Какому файлу в ассетах Mojang соответствует инструмент
export const NOTE_SAMPLES: Record<NoteInst, string> = {
	harp: 'note/harp',
	bass: 'note/bass',
	bd: 'note/bd',
	snare: 'note/snare',
	hat: 'note/hat',
	bell: 'note/bell',
	flute: 'note/flute',
	chime: 'note/icechime',
	guitar: 'note/guitar',
	xylophone: 'note/xylobone',
	iron_xylophone: 'note/iron_xylophone',
	cow_bell: 'note/cow_bell',
	didgeridoo: 'note/didgeridoo',
	bit: 'note/bit',
	banjo: 'note/banjo',
	pling: 'note/pling',
};

export const noteToSfx = (n: NoteEvent): SfxEvent => ({
	at: n.at,
	src: NOTE_SAMPLES[n.inst],
	volume: n.volume ?? 0.5,
	rate: Math.pow(2, n.note / 12),
	pan: n.pan,
	dur: n.dur,
	fade: n.fade,
	reverb: n.reverb,
});
