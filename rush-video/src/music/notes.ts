// Помощники нотной записи для score.ts. ЧИСТЫЙ модуль (Node-скрипты сведения тоже его грузят).
import type {NoteEvent, NoteInst} from '../core/sfx';
import {STEP} from './grid';

// Высота семпла при rate = 1 (MIDI): нотные блоки Minecraft звучат от фа-диеза.
// Проверено спектром семплов: harp/bit/pling/iron_xylophone — F#4, bass/didgeridoo — F#2,
// guitar — F#3, flute/cow_bell — F#5, bell/chime/xylophone — F#6, banjo — F#4.
export const BASE: Record<NoteInst, number> = {
	harp: 66,
	bass: 42,
	bd: 0,
	snare: 0,
	hat: 0,
	bell: 90,
	flute: 78,
	chime: 90,
	guitar: 54,
	xylophone: 90,
	iron_xylophone: 66,
	cow_bell: 78,
	didgeridoo: 42,
	bit: 66,
	banjo: 66,
	pling: 66,
};

// Длина семплов при rate = 1, секунды (нужна, чтобы обрезать хвосты до нужного момента)
export const SAMPLE_LEN: Record<NoteInst, number> = {
	harp: 0.563,
	bass: 0.5,
	bd: 0.122,
	snare: 0.057,
	hat: 0.06,
	bell: 0.436,
	flute: 0.615,
	chime: 1.103,
	guitar: 0.567,
	xylophone: 0.138,
	iron_xylophone: 0.584,
	cow_bell: 0.17,
	didgeridoo: 0.428,
	bit: 0.38,
	banjo: 0.464,
	pling: 0.646,
};

const NAMES: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};

// 'A4' -> 69, 'C#5' -> 73, 'Bb3' -> 58 (до первой октавы C4 = 60)
export const midi = (name: string): number => {
	const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
	if (!m) throw new Error(`music: не нота "${name}"`);
	return NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
};

export type Pitch = number | string;
const toMidi = (p: Pitch) => (typeof p === 'number' ? p : midi(p));

// Детерминированный хэш -> [0, 1) (вместо случайности: каждый запуск даёт одну и ту же дорожку)
export const hash01 = (a: number, b = 0): number => {
	let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
};

const INST_ID: Record<NoteInst, number> = Object.fromEntries(Object.keys(BASE).map((k, i) => [k, i + 1])) as Record<NoteInst, number>;

export type PlayOpts = {
	pan?: number;
	reverb?: number;
	// длина ноты (сек): обрезать с затуханием release
	len?: number;
	release?: number;
	// нота обязана отзвучать к этому моменту (обрезка хвоста)
	endBy?: number;
	// насколько «оживлять» громкость (доля, по умолчанию 0.08 = ±8 %)
	human?: number;
};

// Сборщик партитуры
export class Score {
	readonly events: NoteEvent[] = [];
	// общий множитель громкости для следующих нот (раздел/слой)
	gain = 1;

	// Одна нота. pitch — MIDI-номер или имя ('A4'); у барабанов (bd/snare/hat) — сдвиг в полутонах
	play(at: number, inst: NoteInst, pitch: Pitch, volume: number, o: PlayOpts = {}): this {
		const note = inst === 'bd' || inst === 'snare' || inst === 'hat' ? (pitch as number) : toMidi(pitch) - BASE[inst];
		const t = Math.round(at * 1e6) / 1e6;
		// живость: громкость чуть гуляет, но одинаково при каждом запуске
		const h = hash01(Math.round(t * 1000), INST_ID[inst] * 131 + Math.round(note * 7) + 1000);
		const vol = volume * this.gain * (1 + (o.human ?? 0.08) * (h * 2 - 1));
		const natural = SAMPLE_LEN[inst] / Math.pow(2, note / 12);
		let dur: number | undefined;
		let fade: number | undefined;
		if (o.len !== undefined && o.len < natural) {
			const rel = o.release ?? 0.05;
			dur = o.len + rel;
			fade = rel;
		}
		if (o.endBy !== undefined && t + (dur ?? natural) > o.endBy) {
			dur = Math.max(0.01, o.endBy - t);
			fade = Math.min(dur, 0.06);
		}
		this.events.push({at: t, inst, note, volume: Math.round(vol * 1e4) / 1e4, pan: o.pan, reverb: o.reverb, dur, fade});
		return this;
	}

	// Аккорд: несколько нот одновременно (громкость — на каждую ноту)
	chord(at: number, inst: NoteInst, pitches: Pitch[], volume: number, o: PlayOpts = {}): this {
		for (const p of pitches) this.play(at, inst, p, volume, o);
		return this;
	}

	// Мелодия строкой по шестнадцатым (шаг STEP = 0.1 с): нота — начало, '-' — тянуть, '.' — пауза.
	// Пример такта: 'A4 - A4 C5 - A4 E5 - D5 - C5 - A4 - G4 -'. Длина ноты = её шаги (обрезка с release).
	line(start: number, inst: NoteInst, text: string, volume: number, o: PlayOpts & {step?: number; legato?: number} = {}): this {
		const step = o.step ?? STEP;
		const tokens = text.trim().split(/\s+/);
		tokens.forEach((tok, i) => {
			if (tok === '-' || tok === '.') return;
			let n = 1;
			while (tokens[i + n] === '-') n++;
			// несколько нот разом: 'A4+C5+E5'
			const at = start + i * step;
			const len = n * step * (o.legato ?? 0.9);
			for (const p of tok.split('+')) this.play(at, inst, p, volume, {...o, len});
		});
		return this;
	}

	// Ударные строкой по шестнадцатым: 'X' — акцент, 'x' — обычный, 'o' — тихий (призрак), '.' — пусто
	drums(start: number, inst: NoteInst, text: string, volume: number, o: PlayOpts & {note?: number} = {}): this {
		const steps = text.replace(/\s+/g, '');
		for (let i = 0; i < steps.length; i++) {
			const c = steps[i];
			const k = c === 'X' ? 1.25 : c === 'x' ? 1 : c === 'o' ? 0.45 : 0;
			if (k > 0) this.play(start + i * STEP, inst, o.note ?? 0, volume * k, o);
		}
		return this;
	}

	// Готовая партитура по времени
	sorted(): NoteEvent[] {
		return [...this.events].sort((a, b) => a.at - b.at);
	}
}
