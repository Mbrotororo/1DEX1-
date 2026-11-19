import type {NoteEvent} from '../core/sfx';

// Музыка ролика из нотных блоков. at — ГЛОБАЛЬНОЕ время (сек), inst — инструмент
// (семпл 'note/…' из ассетов Minecraft), note — полутоны от базовой ноты семпла (0 — как записан).
// Сведение: scripts/mix-audio.ts. Пока пусто — мелодию пишет автор музыки.
export const SCORE: NoteEvent[] = [];

// Общая громкость музыки относительно эффектов (музыка тише эффектов)
export const MUSIC_GAIN = 0.6;
