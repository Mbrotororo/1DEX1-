// Тайминг ролика. Все значения в секундах — меняй тут, чтобы сдвинуть сцены.
export const FPS = 60;
export const DURATION_S = 16;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const T = {
	// 1. Мир собирается из блоков
	islandStart: 0.25,
	trees: 1.55,
	house: 1.7,
	plants: 2.25,
	bannerIn: 0.4,
	titleWorldIn: 1.1,
	titleWorldOut: 2.7,

	// 2. Появляется игрок
	playerFall: 2.85,
	playerLand: 3.3,
	nameIn: 3.45,
	waveStart: 3.55,
	waveEnd: 4.4,
	armUp: 4.5,

	// 3. Собирается логотип FantasyVisual
	logoPlate: 5.0,
	voxStart: 5.35,
	voxEnd: 6.95,
	titleLogoIn: 5.9,
	titleLogoOut: 8.05,

	// 4. Заряд и удар
	charge: 7.6,
	strike: 8.3,

	// 5. Вода растекается
	waterStart: 8.4,
	cellDt: 0.09,
	boatIn: 8.95,
	sitStart: 9.0,
	sitEnd: 9.4,
	titleFloodIn: 9.6,

	// 6. Уровень воды растёт
	riseStart: 10.2,
	riseEnd: 13.0,
	titleAllIn: 11.3,

	// 7. Финал
	finale: 13.0,
	titleWithIn: 13.35,
};

// Высота воды в конце (в блоках над травой)
export const WATER_MAX = 9.6;
// Высота «лужи» сразу после растекания
export const WATER_SHALLOW = 0.8;
