// Таймлайн строится сам из сценария и длительностей озвучки:
// каждая сцена = пауза + реплика + хвост. Поменял текст -> npm run voice -> всё сдвинулось.
import script from '../script.json';
import voice from '../voice.json';
import words from '../words.json';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// пауза перед репликой и после неё (сек)
const LEAD = 0.2;
const TAIL = 0.3;
// сценам, где после текста нужно время на гэг, добавляем хвост
const EXTRA: Record<string, number> = {
	title: 0.1,
	outro: 1.6,
};

export type Word = {w: string; s: number; e: number};

export type Line = {
	id: string;
	scene: string;
	text: string;
	// начало сцены и её длина в секундах от начала ролика
	start: number;
	dur: number;
	// момент начала реплики внутри сцены
	voiceAt: number;
	voiceDur: number;
	words: Word[];
};

const durations = voice.durations as Record<string, number>;
const wordMap = words as Record<string, Word[]>;

export const LINES: Line[] = (() => {
	let acc = 0;
	return script.lines.map((l) => {
		const voiceDur = durations[l.id];
		const dur = LEAD + voiceDur + TAIL + (EXTRA[l.scene] ?? 0);
		const line: Line = {
			id: l.id,
			scene: l.scene,
			text: l.text,
			start: acc,
			dur,
			voiceAt: LEAD,
			voiceDur,
			words: wordMap[l.id] ?? [],
		};
		acc += dur;
		return line;
	});
})();

export const DURATION_S = LINES[LINES.length - 1].start + LINES[LINES.length - 1].dur;

export const lineOf = (scene: string): Line => {
	const l = LINES.find((x) => x.scene === scene);
	if (!l) throw new Error(`Нет сцены ${scene}`);
	return l;
};

// Время (внутри сцены), когда звучит слово, начинающееся на prefix.
// nth — какое по счёту совпадение взять. Нужно, чтобы гэги попадали в слова.
export const cue = (line: Line, prefix: string, nth = 0, edge: 's' | 'e' = 's'): number => {
	const p = prefix.toLowerCase();
	const found = line.words.filter((w) => w.w.toLowerCase().replace(/[«»"]/g, '').startsWith(p));
	const w = found[nth];
	if (!w) throw new Error(`Слово «${prefix}» не найдено в реплике ${line.id}`);
	return line.voiceAt + w[edge];
};
