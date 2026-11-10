// «Чат админов» — вертикальная страшилка для 1DEX1 (идея №5 из content-plan/PLAN.md).
// Весь сценарий в одном месте: сцены, субтитры, сообщения чата. Время в секундах.

export const FPS = 30;
export const DURATION_S = 60;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type SceneKind =
	| 'hook'
	| 'panel'
	| 'clock'
	| 'chat'
	| 'spawn'
	| 'console'
	| 'figure'
	| 'typing'
	| 'silence'
	| 'scare'
	| 'panelEnd';

// Сцены идут подряд: каждая длится до начала следующей
export const SCENES: {at: number; kind: SceneKind}[] = [
	{at: 0, kind: 'hook'},
	{at: 3.6, kind: 'panel'},
	{at: 10, kind: 'clock'},
	{at: 18, kind: 'chat'},
	{at: 26, kind: 'spawn'},
	{at: 30, kind: 'console'},
	{at: 33.4, kind: 'figure'},
	{at: 38.5, kind: 'typing'},
	{at: 45, kind: 'silence'},
	{at: 46.5, kind: 'scare'},
	{at: 51, kind: 'panelEnd'},
];

// Ключевые моменты, к которым привязаны анимации и звуки
export const T = {
	clockFlip: 10.6,
	torchesOut: [27.4, 28.2, 29.0],
	listTyped: 30.25,
	onlineZero: 31.5,
	figureFar: 33.6,
	figureNear: 35.8,
	typingStart: 41.6,
	ghostMessage: 46.5,
	jumpscare: 47.0,
	jumpscareEnd: 48.4,
	kostyaLeaves: 51.6,
	secondJoins: 54.6,
	cta: 57.4,
};

// Субтитры: 2–4 слова. *слово* — красный (страшное), ^слово^ — жёлтый (важное).
// Каждый субтитр висит до начала следующего; пустой текст — пауза.
export const SUBS: {at: number; text: string}[] = [
	{at: 0.15, text: 'В ЧАТЕ АДМИНОВ'},
	{at: 1.2, text: '*ОДИННАДЦАТЬ* ЧЕЛОВЕК.'},
	{at: 2.4, text: 'НАС — ^ДЕСЯТЬ.^'},

	{at: 3.6, text: 'Я — ^1DEX1.^'},
	{at: 4.8, text: 'ДЕРЖУ СЕРВЕР'},
	{at: 5.8, text: 'С ДРУЗЬЯМИ.'},
	{at: 7.0, text: 'АДМИНОВ РОВНО ^ДЕСЯТЬ.^'},
	{at: 8.6, text: 'Я СЧИТАЛ.'},

	{at: 10.0, text: 'КАЖДУЮ НОЧЬ ^В ТРИ^'},
	{at: 11.4, text: 'СЕРВЕР УХОДИТ'},
	{at: 12.4, text: 'НА ^РЕСТАРТ.^'},
	{at: 13.6, text: 'ДЕСЯТЬ МИНУТ'},
	{at: 15.0, text: 'НА НЁМ ^НИКОГО.^'},
	{at: 16.4, text: 'ДАЖЕ НАС.'},

	{at: 18.0, text: '03:02. НОВОЕ СООБЩЕНИЕ.'},
	{at: 19.8, text: 'ОТ ^КОСТИ.^'},
	{at: 20.8, text: 'ЕГО ЗАБАНИЛИ'},
	{at: 22.0, text: 'МЕСЯЦ НАЗАД.'},
	{at: 23.2, text: 'АККАУНТ *УДАЛЁН.*'},
	{at: 24.6, text: ''},

	{at: 26.0, text: '«Я НА СПАВНЕ.'},
	{at: 27.2, text: 'ФАКЕЛЫ ^ГАСНУТ».^'},
	{at: 29.4, text: ''},

	{at: 30.0, text: 'ЗАХОЖУ В КОНСОЛЬ.'},
	{at: 31.5, text: 'ОНЛАЙН: *НОЛЬ.*'},

	{at: 33.4, text: '«ТУТ КТО-ТО СТОИТ».'},
	{at: 35.8, text: '«У НЕГО'},
	{at: 36.6, text: '*ТВОЙ СКИН,* 1DEX1».'},

	{at: 38.5, text: 'Я НЕ НА СЕРВЕРЕ.'},
	{at: 40.0, text: 'Я ДАЖЕ ^НЕ В ИГРЕ.^'},
	{at: 41.6, text: 'НО ВНИЗУ ПИШЕТ:'},
	{at: 43.0, text: '*«1DEX1 ПЕЧАТАЕТ…»*'},
	{at: 45.0, text: ''},

	{at: 48.6, text: 'Я ЭТО *НЕ ПИСАЛ.*'},

	{at: 51.0, text: 'УТРОМ КОСТЯ ^ВЫШЕЛ.^'},
	{at: 52.6, text: 'НО НАС ВСЁ ЕЩЁ'},
	{at: 53.8, text: '*ОДИННАДЦАТЬ.*'},
	{at: 55.2, text: 'И 1DEX1'},
	{at: 56.0, text: 'ТЕПЕРЬ *ДВОЕ.*'},
	{at: 57.4, text: 'ПОДПИШИСЬ,'},
	{at: 58.4, text: 'ПОКА ТЫ ^В СПИСКЕ.^'},
];

// Админы сервера (вымышленные ники). Первый — сам 1DEX1, у него настоящий скин.
export const ADMINS = [
	'1DEX1',
	'Mira',
	'Tolik_PvP',
	'Lesha_Red',
	'Nastya_mc',
	'Vovan',
	'Zhenya_Craft',
	'Dimon_TNT',
	'Polina_Kot',
	'Grisha_Builder',
];
export const GHOST = 'Kostya_Stroit';
export const ME = '1DEX1';

// Сообщения в чате админов
export type ChatMsg = {at: number; nick: string; text: string};
export const CHAT: ChatMsg[] = [
	{at: 18.3, nick: GHOST, text: 'кто-нибудь онлайн?'},
	{at: 24.4, nick: 'Mira', text: 'костя?? как ты зашёл'},
	{at: 25.6, nick: 'Tolik_PvP', text: 'это не смешно'},
	{at: 26.2, nick: GHOST, text: 'я на спавне. факелы гаснут'},
	{at: 33.6, nick: GHOST, text: 'тут кто-то стоит'},
	{at: 35.9, nick: GHOST, text: 'у него твой скин, 1DEX1'},
	{at: T.ghostMessage, nick: ME, text: 'заходи. мы ждём.'},
];

// Цвета ников в чате (как цветные ники на серверах)
export const NICK_COLORS: Record<string, string> = {
	'1DEX1': '#c9a8ff',
	Mira: '#55ffff',
	Tolik_PvP: '#ffaa00',
	Lesha_Red: '#ff5555',
	Nastya_mc: '#ff55ff',
	Vovan: '#55ff55',
	Zhenya_Craft: '#5555ff',
	Dimon_TNT: '#ff7755',
	Polina_Kot: '#ffff55',
	Grisha_Builder: '#aaaaaa',
	Kostya_Stroit: '#e0e0e0',
};
