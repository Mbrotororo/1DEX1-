import type {EnvState} from '../../core/env';

// Окружения дома (ЧИСТЫЕ данные). Интерьер запечён тёмным (ambient 0.17 + фонари), поэтому:
//  - tint здесь — оттенок УЛИЦЫ за окнами и дверью (House передаёт его только уличному мешу);
//  - свет (lightColor/ambient/sun/fill) — для героя и реквизита, подобран под запечённые фонари;
//  - небо и туман видны только в окнах и в открытой двери.
// 16:00, конец ноября: солнце садится. В прихожей — холодный дневной свет снаружи и тёплые фонари,
// в комнате окно смотрит прямо на закат.

export const HOUSE_ENV = {
	// прихожая и лестница: снаружи холодный зимний день под вечер, внутри тёплые фонари
	hallway: {
		skyTop: '#6f8fbf',
		skyHorizon: '#e9d6cf',
		fogColor: '#d9d3d6',
		fogNear: 26,
		fogFar: 120,
		tint: '#e4ecfa',
		lightColor: '#ffcf9e',
		ambient: 0.2,
		sun: 0.42,
		fill: 0.2,
		// «ключевой» свет — как от подвесного фонаря сверху-спереди
		sunDir: [0.25, 0.85, 0.45],
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0.35,
		cloudColor: '#e9e4ea',
	},
	// коридор второго этажа: только фонари
	upstairs: {
		skyTop: '#6f8fbf',
		skyHorizon: '#e9d6cf',
		fogColor: '#2a1d14',
		fogNear: 30,
		fogFar: 120,
		tint: '#e4ecfa',
		lightColor: '#ffc68c',
		ambient: 0.2,
		sun: 0.4,
		fill: 0.2,
		sunDir: [0.2, 0.9, 0.3],
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0,
		cloudColor: '#000000',
	},
	// комната: за окном (восток дома, +x) низкое оранжевое солнце; оно же — контровой/ключевой свет из окна
	bedroom: {
		skyTop: '#46508e',
		skyHorizon: '#ff9d66',
		fogColor: '#e7a183',
		fogNear: 30,
		fogFar: 150,
		tint: '#ffc9a8',
		lightColor: '#ffc28c',
		ambient: 0.22,
		sun: 0.5,
		fill: 0.18,
		sunDir: [0.94, 0.16, 0.3],
		sunDisc: 1,
		moonDisc: 0,
		stars: 0,
		clouds: 0.45,
		cloudColor: '#ffb48c',
	},
	// комната, крупные планы у стола с включённым монитором: закат слабее, синий свет экрана читается на лице
	desk: {
		skyTop: '#46508e',
		skyHorizon: '#ff9d66',
		fogColor: '#e7a183',
		fogNear: 30,
		fogFar: 150,
		tint: '#ffc9a8',
		lightColor: '#ffbf8a',
		ambient: 0.15,
		sun: 0.2,
		fill: 0.12,
		sunDir: [0.94, 0.16, 0.3],
		sunDisc: 1,
		moonDisc: 0,
		stars: 0,
		clouds: 0.45,
		cloudColor: '#ffb48c',
	},
} satisfies Record<string, EnvState>;

export type HouseEnvName = keyof typeof HOUSE_ENV;
