// Тайминг ролика. ЧИСТЫЕ ДАННЫЕ: без React и three, импортируется и из Node-скриптов.
// Длительности сцен зафиксированы ТЗ (SPEC.md §2) — авторы сцен их не меняют.
export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type SceneSlot = {id: string; start: number; duration: number};

const DURATIONS: [id: string, duration: number][] = [
	['s1-hook', 8],
	['s2-oldworld', 22],
	['s3-wipe', 20],
	['s4-newworld', 20],
	['s5-dungeon', 40],
	['s6-reward', 15],
	['s7-pvp', 30],
	['s8-pearl', 10],
	['s9-finale', 15],
];

export const SCENES: SceneSlot[] = (() => {
	let start = 0;
	return DURATIONS.map(([id, duration]) => {
		const slot = {id, start, duration};
		start += duration;
		return slot;
	});
})();

export type SceneId = (typeof DURATIONS)[number][0];

// Длина всего ролика, секунды (180)
export const DURATION_S = SCENES.reduce((s, c) => s + c.duration, 0);

export const sceneSlot = (id: string): SceneSlot => {
	const slot = SCENES.find((s) => s.id === id);
	if (!slot) throw new Error(`Нет сцены "${id}" в timeline.ts`);
	return slot;
};

// Глобальное время начала сцены, секунды
export const sceneStart = (id: string) => sceneSlot(id).start;
export const sceneDuration = (id: string) => sceneSlot(id).duration;

// Какая сцена идёт в глобальный момент tGlobal и её локальное время
export const sceneAt = (tGlobal: number): {slot: SceneSlot; index: number; t: number} => {
	let index = SCENES.length - 1;
	for (let i = 0; i < SCENES.length; i++) {
		if (tGlobal < SCENES[i].start + SCENES[i].duration) {
			index = i;
			break;
		}
	}
	const slot = SCENES[index];
	return {slot, index, t: tGlobal - slot.start};
};

// Угловой значок сервера виден со s2 по s8 включительно
export const BADGE_FROM = sceneStart('s2-oldworld');
export const BADGE_TO = sceneStart('s9-finale');
