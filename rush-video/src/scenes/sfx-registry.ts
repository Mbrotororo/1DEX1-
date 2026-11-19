import type {SfxEvent} from '../core/sfx';
import {events as aHome} from './a-home/sfx';
import {events as bRoom} from './b-room/sfx';

// Звуки всех сцен таймлайна (локальное время каждой). ЧИСТЫЙ модуль: его читают Node-скрипты
// (scripts/fetch-sounds.ts и scripts/mix-audio.ts). Служебные сцены (_example и др.) сводятся отдельно: --scene=example.
export const SCENE_SFX: Record<string, SfxEvent[]> = {
	'a-home': aHome,
	'b-room': bRoom,
};
