// Опорные точки дома: где что стоит, куда ставить героя и камеры. ЧИСТЫЕ ДАННЫЕ (без React и three).
// Единица — блок, y — вверх. Блок (x, y, z) занимает куб [x..x+1]×[y..y+1]×[z..z+1].
// Повороты rotationY — как у Humanoid: 0 — лицом в +z, PI/2 — лицом в +x, PI — в −z, −PI/2 — в −x.
// План дома — в README.md рядом.

export type V3 = [number, number, number];

const HALF_PI = Math.PI / 2;

// ---------- этажи и комнаты (клетки включительно) ----------
// Первый этаж: пол — блоки y = −1, герой стоит на y = 0, потолок — блоки y = 4.
export const FLOOR_Y = 0;
// Второй этаж (коридор и комната): пол — блоки y = 4, герой стоит на y = 5, потолок — блоки y = 9.
export const UP_Y = 5;

export const ROOMS = {
	hall: {x0: 0, x1: 14, z0: 0, z1: 6, y0: 0, y1: 3},
	// лестничный пролёт: ступени x = 5..13, ширина z = 0..2, над ними открыто до потолка y = 9
	stairwell: {x0: 5, x1: 13, z0: 0, z1: 2, y0: 0, y1: 8},
	corridor: {x0: 14, x1: 19, z0: 0, z1: 2, y0: 5, y1: 8},
	bedroom: {x0: 21, x1: 30, z0: 1, z1: 9, y0: 5, y1: 8},
} as const;

// ---------- лестница ----------
// 9 ступеней по x = 5..13, каждая глубиной 1 блок и высотой 0.5; верх ступени k — 0.5·(k+1).
// Площадка наверху — x = 14 (уже пол коридора, y = 5).
export const STAIRS = {x0: 5, steps: 9, rise: 0.5, z0: 0, z1: 2, centerZ: 1.5};

// Высота, на которой стоит герой на лестнице в точке x (плавно, по линии носков ступеней)
export const stairFootY = (x: number) => {
	if (x <= 4.5) return FLOOR_Y;
	if (x >= 14.5) return UP_Y;
	return Math.min(UP_Y, Math.max(FLOOR_Y, (x - 4.5) * 0.5));
};

// Маршрут вверх по лестнице (для makePath): низ у первой ступени → площадка наверху, по середине пролёта
export const STAIRS_PATH: V3[] = [
	[4.0, 0, 1.5],
	...Array.from({length: 9}, (_, k): V3 => [5.5 + k, 0.5 * (k + 1), 1.5]),
	[14.6, 5, 1.5],
];

// Маршрут по коридору второго этажа до двери комнаты и внутрь (камера может ехать перед героем задом по +x)
export const CORRIDOR_PATH: V3[] = [
	[14.6, 5, 1.5],
	[17.0, 5, 1.5],
	[19.4, 5, 1.5],
	[20.5, 5, 1.5],
	[22.2, 5, 1.6],
];

// ---------- входная дверь (первый этаж, южная стена z = 7, проём x = 2, y = 0..1) ----------
// Полотно — от петли вдоль +x, открывается ВНУТРЬ (в −z). Снаружи (z > 8) — зимний двор.
export const FRONT_DOOR = {
	// низ оси петли (западный край проёма, внутренняя сторона стены)
	hinge: [2.02, 0, 7.1] as V3,
	// поворот закрытого полотна (полотно вдоль +x)
	yaw: 0,
	// угол полного открытия, рад (положительный — внутрь дома)
	angle: 1.75,
	// центр проёма у пола (снаружи и внутри)
	outside: [2.5, 0, 9.2] as V3,
	threshold: [2.5, 0, 7.5] as V3,
	inside: [2.5, 0, 6.2] as V3,
	// куда смотрит входящий герой
	enterHeading: Math.PI,
};

// Коврик у двери (центр, на полу)
export const DOORMAT: V3 = [2.5, 0, 6.35];

// ---------- прихожая: где стоит герой ----------
// Пришёл и остановился: смотрит на север (на часы и записку)
export const HERO_STOP: V3 = [2.5, 0, 3.6];
export const HERO_STOP_HEADING = Math.PI;
// Маршрут от двери до места остановки (медленно, устало)
export const ENTER_PATH: V3[] = [
	[2.5, 0, 9.4],
	[2.5, 0, 7.6],
	[2.5, 0, 5.6],
	[2.5, 0, 3.6],
];
// Точка броска рюкзака (герой стоит, бросает по +x вдоль прихожей) и куда рюкзак падает
export const THROW_FROM: V3 = [3.2, 0, 4.4];
export const BACKPACK_LAND: V3 = [8.6, 0, 4.9];
// Откуда стартует бег к лестнице
export const RUN_START: V3 = [3.2, 0, 4.0];

// ---------- часы и записка на северной стене (лицевая плоскость стены z = 0) ----------
// Электронные часы: центр циферблата; лицом в +z
export const CLOCK = {
	center: [1.85, 2.38, 0.0] as V3,
	rotationY: 0,
	// размер корпуса, блоки
	width: 0.9,
	height: 0.44,
	// откуда снимать крупный план (камера в 1 блоке перед часами)
	closeCam: [1.85, 2.3, 1.15] as V3,
};
// Пробковая доска с запиской: центр доски; лицом в +z
export const CORK = {
	center: [3.35, 2.0, 0.0] as V3,
	rotationY: 0,
	width: 1.0,
	height: 0.8,
	// центр надписи «13:00» (для наезда камеры)
	time: [3.35, 1.84, 0.06] as V3,
	closeCam: [3.35, 2.0, 1.05] as V3,
};

// ---------- вешалка и обувница на западной стене (лицевая плоскость x = 0) ----------
export const COAT_HOOKS = {
	// центр планки
	center: [0.0, 1.78, 5.0] as V3,
	// лицом в +x
	rotationY: HALF_PI,
	// кончики крючков (мир), слева направо от двери вглубь: z = 5.6, 5.2, 4.8, 4.4
	hooks: [
		[0.24, 1.72, 5.6],
		[0.24, 1.72, 5.2],
		[0.24, 1.72, 4.8],
		[0.24, 1.72, 4.4],
	] as V3[],
};
// Шапка на крючке (номер 1): положение и поворот для <Beanie mode="loose" />
export const BEANIE_ON_HOOK = {position: [0.2, 1.57, 4.8] as V3, rotation: [0.0, HALF_PI, -0.32] as V3, hook: 2};
export const SHOE_BENCH = {position: [0.32, 0, 5.0] as V3, rotationY: HALF_PI};

// ---------- окна ----------
export const WINDOWS = {
	// прихожая: южная стена (z = 7), два окна 2×2; западная стена (x = −1), окно 2×2
	hallSouthA: {cells: [6, 1, 7, 7, 2, 7], center: [7.0, 2.0, 7.0] as V3, facing: [0, 0, 1] as V3},
	hallSouthB: {cells: [10, 1, 7, 11, 2, 7], center: [11.0, 2.0, 7.0] as V3, facing: [0, 0, 1] as V3},
	hallWest: {cells: [-1, 1, 1, -1, 2, 2], center: [0.0, 2.0, 2.0] as V3, facing: [-1, 0, 0] as V3},
	// комната: восточная стена (x = 31), окно 3×2 за столом — за ним закат
	bedroom: {cells: [31, 6, 4, 31, 7, 6], center: [31.0, 7.0, 5.5] as V3, facing: [1, 0, 0] as V3},
};

// ---------- коридор второго этажа и дверь комнаты ----------
// Дверь в комнату: проём x = 20, z = 1, y = 5..6. Петля у северного края, полотно открывается в комнату (+x)
// и на полном открытии ложится на северную стену комнаты (удар о стену).
export const BEDROOM_DOOR = {
	hinge: [20.91, 5, 1.1] as V3,
	// закрытое полотно идёт от петли вдоль +z
	yaw: -HALF_PI,
	// полный угол открытия (до стены), рад
	angle: HALF_PI,
	// перед дверью в коридоре / сразу за ней в комнате
	before: [19.6, 5, 1.5] as V3,
	after: [21.8, 5, 1.6] as V3,
};

// ---------- комната ----------
// Стол у окна (восточная стена): столешница x = 29.55..30.95, z = 2.75..7.25, верх на высоте 5.875
export const DESK = {
	position: [30.25, 5, 5.0] as V3,
	// стол стоит лицом к −x (сидящий смотрит в +x)
	rotationY: -HALF_PI,
	top: 5 + 14 / 16,
	width: 4.5,
	depth: 1.4,
};
// Монитор: центр экрана, размеры экрана (16:9), куда смотрит экран (нормаль)
export const MONITOR = {
	position: [30.55, DESK.top, 5.0] as V3,
	rotationY: -HALF_PI,
	screenCenter: [30.47, 6.52, 5.0] as V3,
	screenWidth: 1.2,
	screenHeight: 0.675,
	facing: [-1, 0, 0] as V3,
};
// Клавиатура, мышь, коврик
export const KEYBOARD = {position: [29.93, DESK.top, 5.0] as V3, rotationY: -HALF_PI};
export const MOUSEPAD = {position: [29.95, DESK.top, 6.2] as V3, rotationY: -HALF_PI};
export const MOUSE = {position: [29.92, DESK.top, 6.25] as V3, rotationY: -HALF_PI};
// Системный блок на столе справа (южный край стола): стекло смотрит в комнату (−x), перед — на юг (+z)
export const PC = {
	position: [30.3, DESK.top, 6.78] as V3,
	rotationY: 0,
	// кнопка питания (мир): сверху у переднего края
	button: [30.3, DESK.top + 0.94, 7.12] as V3,
};
// Подставка с наушниками (слева на столе), лампа, микрофон
export const HEADPHONE_STAND = {position: [30.2, DESK.top, 3.35] as V3, rotationY: -HALF_PI};
// где наушники висят на подставке (центр оголовья) — для анимации «снял с подставки»
export const HEADPHONES_ON_STAND: V3 = [30.2, DESK.top + 0.352, 3.35];
export const DESK_LAMP = {position: [30.6, DESK.top, 2.98] as V3, rotationY: -HALF_PI - 0.5, bulb: [30.32, DESK.top + 0.62, 3.1] as V3};
export const MICROPHONE = {position: [30.45, DESK.top, 4.0] as V3, rotationY: -HALF_PI + 0.35};

// Игровое кресло: центр крестовины на полу, сиденье смотрит в +x (к столу)
export const CHAIR = {
	position: [28.35, UP_Y, 5.0] as V3,
	rotationY: HALF_PI,
	// высота сиденья над полом (верх подушки), блоки
	seatHeight: 0.5,
	// где стоит персонаж в позе sit(): положение и поворот (см. GamingChair.seated)
	sitPosition: [28.19, UP_Y + 0.5, 5.0] as V3,
	sitRotationY: HALF_PI,
};
// Куда герой прыгает в кресло (старт прыжка у двери) — B1
export const CHAIR_JUMP_FROM: V3 = [23.0, UP_Y, 3.0];

// Кровать (модель Bed): центр низа, изголовье у южной стены (+z); верх матраса — top
export const BED = {position: [25.0, UP_Y, 8.55] as V3, rotationY: 0, width: 2, length: 2.9, top: UP_Y + 10 / 16, pillow: [25.0, 5.75, 9.7] as V3};

// Постер HolyWorld на северной стене (лицевая плоскость z = 1), центр
export const POSTER = {center: [25.5, 7.05, 1.0] as V3, rotationY: 0, width: 1.6, height: 1.48};

// Камера на штативе у южной стены (перед полками): смотрит на кресло и стол — B7 снимается «через» неё.
// Модель: объектив в локальном +z на высоте 25.2 px и выносе 8.6 px от центра штатива.
const TRIPOD_POS: V3 = [27.05, UP_Y, 8.2];
const TRIPOD_YAW = Math.atan2(28.3 - TRIPOD_POS[0], 5.0 - TRIPOD_POS[2]);
const LENS_OUT = 8.6 / 16 + 0.06;
export const TRIPOD = {
	position: TRIPOD_POS,
	// поворот всей модели (объектив смотрит в +z модели)
	rotationY: TRIPOD_YAW,
	// центр объектива (мир) и точка, куда он смотрит (лицо сидящего героя)
	lens: [TRIPOD_POS[0] + Math.sin(TRIPOD_YAW) * LENS_OUT, UP_Y + 25.2 / 16, TRIPOD_POS[2] + Math.cos(TRIPOD_YAW) * LENS_OUT] as V3,
	look: [28.3, 6.15, 5.0] as V3,
};
// Готовая камера «через видоискатель» (позиция, точка взгляда, fov): герой в кресле — средним планом, справа монитор
export const TRIPOD_VIEW = {pos: TRIPOD.lens, look: [28.55, 6.0, 5.0] as V3, fov: 40};

// Общий план комнаты от двери (B1)
export const BEDROOM_WIDE = {pos: [21.4, 7.6, 1.7] as V3, look: [27.5, 5.6, 6.2] as V3, fov: 62};

// ---------- свет (для запекания и для персонажей) ----------
export type LightSpot = {pos: V3; radius: number; color: string; intensity: number};

// Подвесные фонари (точка крепления на потолке и длина цепи)
export const HANGING_LANTERNS: {mount: V3; chain: number}[] = [
	{mount: [2.5, 4, 4.5], chain: 0.55},
	{mount: [9.5, 4, 4.6], chain: 0.55},
	// над лестницей, с высокого потолка пролёта
	{mount: [9.5, 9, 1.1], chain: 3.0},
	{mount: [17.0, 9, 1.5], chain: 0.5},
	{mount: [25.5, 9, 5.0], chain: 0.75},
];
// Фонари, стоящие на мебели (центр низа)
export const STANDING_LANTERNS: V3[] = [
	[14.5, 2, 5.5],
	[30.5, 8, 1.5],
	[21.5, 7, 9.5],
];
// Свечи (центр низа)
export const CANDLES: V3[] = [
	[0.28, 0.5, 4.45],
	[0.3, 0.5, 4.7],
	[26.78, 6, 9.5],
	[28.3, 8, 1.45],
	[29.0, 8, 1.55],
	[27.6, 7, 9.5],
];

// Картины (центр, лицом в rotationY): коридор — южная стена (z = 3), прихожая — над стеллажом под лестницей
export const PAINTINGS: {position: V3; rotationY: number; width: number; height: number; seed: number}[] = [
	{position: [17.0, 6.75, 3.0], rotationY: Math.PI, width: 1.3, height: 0.8, seed: 1},
	{position: [7.2, 2.35, 0.0], rotationY: 0, width: 1.0, height: 0.7, seed: 2},
];

// Мелкий уют (центр низа): книги на стеллаже прихожей, цветок у окна, кружка и книги на столе, цветок в комнате
export const DECOR = {
	hallBooks: [14.45, 2, 4.45] as V3,
	hallPlant: [12.9, 0, 6.45] as V3,
	nightBooks: [26.3, 6, 9.45] as V3,
	mug: [29.9, DESK.top, 3.95] as V3,
	roomPlant: [21.55, 5, 7.6] as V3,
};

// ---------- проверенные точки камер (галерея scenes/_house): {pos, look, fov} для lookCam/flyCam ----------
export type CamSpot = {pos: V3; look: V3; fov: number};
export const CAMS: Record<string, CamSpot> = {
	// A1: прихожая от двери, низко (видны дорожка, лестница, стеллажи, записка)
	hallWide: {pos: [1.2, 0.9, 6.4], look: [9, 1.6, 1.2], fov: 62},
	// A1: камера у пола в прихожей смотрит на входную дверь (полоска света под дверью, проём)
	frontDoorLow: {pos: [3.9, 0.45, 3.0], look: [2.5, 1.1, 7.2], fov: 58},
	// A3/A4: крупно часы и записка (камера в ~1 блоке от стены)
	clockClose: {pos: [1.9, 2.32, 1.2], look: [1.85, 2.38, 0], fov: 40},
	noteClose: {pos: [3.3, 1.94, 1.0], look: [3.3, 1.92, 0], fov: 40},
	// A6: вешалка
	hooks: {pos: [1.9, 1.45, 3.7], look: [0.1, 1.2, 5.2], fov: 50},
	// A7: камера на полу у места падения рюкзака
	floorBag: {pos: [6.4, 0.22, 5.3], look: [9.6, 0.3, 4.5], fov: 56},
	// A8: у первой ступени, низко, вверх по лестнице
	stairsBottom: {pos: [3.6, 0.45, 1.3], look: [12, 4.0, 1.4], fov: 60},
	// A8: коридор, камера смотрит назад на лестницу (ехать по x от 16.6 до 19.3 — задом перед бегущим)
	corridorBack: {pos: [16.6, 6.35, 1.5], look: [11, 5.5, 1.5], fov: 64},
	// A8: дверь комнаты из коридора
	bedroomDoor: {pos: [17.2, 6.1, 2.2], look: [21.5, 6.0, 1.4], fov: 58},
	// B2: стол и ПК, кнопка питания крупно, лицо в свете монитора
	desk: {pos: [28.3, 6.55, 3.3], look: [30.4, 6.05, 5.7], fov: 50},
	pcButton: {pos: [29.75, 7.13, 7.62], look: [30.3, 6.81, 7.12], fov: 40},
	faceAtMonitor: {pos: [29.8, 6.5, 5.45], look: [28.3, 6.25, 4.95], fov: 50},
};
