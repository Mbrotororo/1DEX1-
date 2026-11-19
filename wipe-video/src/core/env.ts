import {hexToRgb, lerp, rgbToHex, type Vec3} from './anim';

// Окружение сцены: небо, туман, общий оттенок мира и свет для персонажей.
// ЧИСТЫЕ данные; рисует всё это <Environment/>.

export type EnvState = {
	// небо: цвет в зените и у горизонта
	skyTop: string;
	skyHorizon: string;
	// туман (линейный): цвет и расстояния начала/конца в блоках
	fogColor: string;
	fogNear: number;
	fogFar: number;
	// общий оттенок мира — множитель цвета блоков (VoxelMesh tint, InstancedBlocks tint)
	tint: string;
	// свет для персонажей и предметов (Lambert): цвет и силы рассеянного, «солнечного» и заполняющего от камеры
	lightColor: string;
	ambient: number;
	sun: number;
	fill: number;
	// направление НА солнце/луну (откуда светит), вектор
	sunDir: Vec3;
	// видимость диска солнца, луны, звёзд и облаков (0..1)
	sunDisc: number;
	moonDisc: number;
	stars: number;
	clouds: number;
	cloudColor: string;
};

const DAY_SUN: Vec3 = [0.19, 0.86, 0.47];

export const ENV = {
	// ясный тёплый день
	day: {
		skyTop: '#3f8fe8',
		skyHorizon: '#b9dcff',
		fogColor: '#bcdcfb',
		fogNear: 70,
		fogFar: 260,
		tint: '#ffffff',
		lightColor: '#ffffff',
		ambient: 0.26,
		sun: 0.86,
		fill: 0.3,
		sunDir: DAY_SUN,
		sunDisc: 1,
		moonDisc: 0,
		stars: 0,
		clouds: 0.75,
		cloudColor: '#ffffff',
	},
	// пасмурно: свинцовое небо
	overcast: {
		skyTop: '#6f7c8c',
		skyHorizon: '#a3adb8',
		fogColor: '#a3adb8',
		fogNear: 35,
		fogFar: 170,
		tint: '#c4ccd6',
		lightColor: '#d3dae4',
		ambient: 0.4,
		sun: 0.5,
		fill: 0.3,
		sunDir: DAY_SUN,
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0.5,
		cloudColor: '#8d98a5',
	},
	// метель: всё тонет в бело-сером
	blizzard: {
		skyTop: '#9aa5b3',
		skyHorizon: '#c6cfd9',
		fogColor: '#c9d2dc',
		fogNear: 6,
		fogFar: 70,
		tint: '#d6dde6',
		lightColor: '#dfe6ee',
		ambient: 0.5,
		sun: 0.4,
		fill: 0.3,
		sunDir: DAY_SUN,
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0,
		cloudColor: '#c6cfd9',
	},
	// белая мгла: почти чистый белый кадр
	whiteout: {
		skyTop: '#f4f8fc',
		skyHorizon: '#ffffff',
		fogColor: '#fbfdff',
		fogNear: 1,
		fogFar: 26,
		tint: '#ffffff',
		lightColor: '#ffffff',
		ambient: 0.62,
		sun: 0.4,
		fill: 0.34,
		sunDir: DAY_SUN,
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0,
		cloudColor: '#ffffff',
	},
	// ясное морозное утро
	frostyMorning: {
		skyTop: '#4f9ff2',
		skyHorizon: '#dcefff',
		fogColor: '#dcedfc',
		fogNear: 80,
		fogFar: 300,
		tint: '#f6faff',
		lightColor: '#f6faff',
		ambient: 0.3,
		sun: 0.84,
		fill: 0.3,
		sunDir: [0.42, 0.62, 0.66],
		sunDisc: 1,
		moonDisc: 0,
		stars: 0,
		clouds: 0.45,
		cloudColor: '#ffffff',
	},
	// зимний закат: золотой свет, розово-оранжевый горизонт
	sunset: {
		skyTop: '#3c4c9c',
		skyHorizon: '#ff9c6a',
		fogColor: '#f0a688',
		fogNear: 60,
		fogFar: 260,
		tint: '#ffd3ad',
		lightColor: '#ffcfa3',
		ambient: 0.3,
		sun: 0.8,
		fill: 0.32,
		sunDir: [-0.74, 0.24, 0.62],
		sunDisc: 1,
		moonDisc: 0,
		stars: 0.15,
		clouds: 0.5,
		cloudColor: '#ffc4a4',
	},
	// ночь: синева, луна и звёзды
	night: {
		skyTop: '#05081e',
		skyHorizon: '#232a6a',
		fogColor: '#141a44',
		fogNear: 50,
		fogFar: 240,
		tint: '#6672b4',
		lightColor: '#8f9cff',
		ambient: 0.34,
		sun: 0.5,
		fill: 0.4,
		sunDir: [-0.5, 0.62, 0.6],
		sunDisc: 0,
		moonDisc: 1,
		stars: 1,
		clouds: 0.12,
		cloudColor: '#39407e',
	},
	// подземелье: темнота, свет дают запечённые факелы (ambient в buildVoxelMeshes)
	dungeon: {
		skyTop: '#060403',
		skyHorizon: '#0c0806',
		fogColor: '#0d0906',
		fogNear: 14,
		fogFar: 64,
		tint: '#ffffff',
		lightColor: '#ffd2a0',
		ambient: 0.3,
		sun: 0.42,
		fill: 0.46,
		sunDir: [0.2, 0.9, 0.3],
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0,
		cloudColor: '#000000',
	},
	// чёрная пустота (хук, титры)
	voidBlack: {
		skyTop: '#000000',
		skyHorizon: '#02030a',
		fogColor: '#01020a',
		fogNear: 6,
		fogFar: 46,
		tint: '#7f8cc0',
		lightColor: '#9aa6e0',
		ambient: 0.3,
		sun: 0.5,
		fill: 0.36,
		sunDir: [-0.3, 0.8, 0.5],
		sunDisc: 0,
		moonDisc: 0,
		stars: 0,
		clouds: 0,
		cloudColor: '#000000',
	},
} satisfies Record<string, EnvState>;

export type EnvName = keyof typeof ENV;

const mixColor = (a: string, b: string, k: number) => {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	return rgbToHex([lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)]);
};

// Смешать два окружения (k: 0 → a, 1 → b)
export const mixEnv = (a: EnvState, b: EnvState, k: number): EnvState => {
	const q = Math.min(1, Math.max(0, k));
	if (q === 0) return a;
	if (q === 1) return b;
	return {
		skyTop: mixColor(a.skyTop, b.skyTop, q),
		skyHorizon: mixColor(a.skyHorizon, b.skyHorizon, q),
		fogColor: mixColor(a.fogColor, b.fogColor, q),
		fogNear: lerp(a.fogNear, b.fogNear, q),
		fogFar: lerp(a.fogFar, b.fogFar, q),
		tint: mixColor(a.tint, b.tint, q),
		lightColor: mixColor(a.lightColor, b.lightColor, q),
		ambient: lerp(a.ambient, b.ambient, q),
		sun: lerp(a.sun, b.sun, q),
		fill: lerp(a.fill, b.fill, q),
		sunDir: [lerp(a.sunDir[0], b.sunDir[0], q), lerp(a.sunDir[1], b.sunDir[1], q), lerp(a.sunDir[2], b.sunDir[2], q)],
		sunDisc: lerp(a.sunDisc, b.sunDisc, q),
		moonDisc: lerp(a.moonDisc, b.moonDisc, q),
		stars: lerp(a.stars, b.stars, q),
		clouds: lerp(a.clouds, b.clouds, q),
		cloudColor: mixColor(a.cloudColor, b.cloudColor, q),
	};
};

// Окружение по ключам времени: [[t0, env0], [t1, env1], ...] — между ключами плавно смешивается
export const envTrack = (t: number, keys: [number, EnvState][]): EnvState => {
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) {
		if (t <= keys[i][0]) {
			const k = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
			return mixEnv(keys[i - 1][1], keys[i][1], k * k * (3 - 2 * k));
		}
	}
	return keys[keys.length - 1][1];
};
