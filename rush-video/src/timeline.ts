// Тайминг ролика. ЧИСТЫЕ ДАННЫЕ: без React и three, импортируется и из Node-скриптов.
// Длительности сцен зафиксированы ТЗ (SPEC.md) — авторы сцен их не меняют.
export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type SceneSlot = {id: string; start: number; duration: number};

const DURATIONS: [id: string, duration: number][] = [
	['a-home', 16], // прихожая: пришёл из школы, 16:00, шок, бросил вещи, бегом наверх
	['b-room', 14], // комната: кресло, компьютер, Minecraft, Discord, OBS, запись
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

// Длина всего ролика, секунды (30)
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

// Угловой значок сервера в этом ролике не показывается (FROM = TO = конец ролика)
export const BADGE_FROM = DURATION_S;
export const BADGE_TO = DURATION_S;
