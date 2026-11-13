// ============================================================
//  ВСЁ СОДЕРЖИМОЕ САЙТА — В ЭТОМ ФАЙЛЕ.
//  Меняешь здесь — меняется на сайте. Код трогать не нужно.
// ============================================================

export const SITE = {
	name: '1DEX1 SHOP',
	youtube: 'https://www.youtube.com/@hw1DEX1',
	youtubeHandle: '@hw1DEX1',
	telegram: 'https://t.me/hw1DEX1',
	telegramHandle: '@hw1DEX1',
	// Личный Telegram для рекламы и сотрудничества: показывается в разделе «Сотрудничество»,
	// кнопка «Написать в Telegram» ведёт на t.me/этот ник. Пусто — кнопка неактивна.
	contact: '@RodionDex',
};

// Документы в подвале (соглашение, политика конфиденциальности, оферта) — тексты в js/legal.js.
// Перед подключением оплаты впиши owner (кто продаёт: например «Самозанятый Иванов Иван Иванович»)
// и inn (ИНН) — они появятся в оферте. email — почта для обращений (лучше отдельная, не личная).
// Пустые поля на сайте не показываются. updated — дата редакции: меняй, когда правишь тексты.
export const LEGAL = {
	updated: '2026-11-11',
	owner: '',
	ownerEn: '', // то же латиницей для английской версии, например «Self-employed Ivan Ivanov»
	inn: '',
	email: '',
	telegram: '@RodionDex',
};

// Визуалы, с которыми сотрудничаешь: их логотипы летают вокруг аватарки
// в разделе «Сотрудничество», клик открывает сайт. Логотипы лежат в img/visuals/.
export const VISUALS = [
	{name: 'AuraVisual', url: 'https://auravisuals.space/', logo: 'img/visuals/aura.svg', fit: 'contain'},
	{name: 'FadingVisual', url: 'https://fadingvisual.xyz/', logo: 'img/visuals/fading.jpg'},
	{name: 'FantasyVisual', url: 'https://fantasyvisuals.cc/', logo: 'img/visuals/fantasy.png', fit: 'contain', pixel: true},
];

// Слова в бегущей строке под первым экраном — для русской и английской версии
export const MARQUEE = {
	ru: ['Магазин', 'Моды', 'РП'],
	en: ['Shop', 'Mods', 'RP'],
};

// ------------------------------------------------------------
//  ТОВАРЫ. Сайт без сервера берёт их отсюда. Когда сайт запущен с сервером (папка server/),
//  товары берутся из базы данных — перенести этот список в базу одной командой:
//  npm run admin -- product import   (файлы к товарам — product add --file, см. README).
//
//  Порядок в списке — порядок в магазине. Чтобы добавить товар, скопируй любой
//  из них и поменяй поля.
//
//  titleEn, descEn — название и описание для английской версии (можно не писать)
//  kind:   'mod' — мод, 'rp' — ресурс-пак
//  status: 'soon' — в разработке, 'ready' — готов
//  price:  число в рублях или null (покажет «Цена позже»)
//  cover:  путь к картинке, например 'img/products/my-mod.webp', или null
//  link:   ссылка «Купить / Скачать» или null (покажет «Скоро»)
//  tags:   короткие пометки: версия игры, загрузчик, сервер
//  until:  эксклюзив — продаётся до этого дня включительно (по Москве), например '2027-02-20';
//          на карточке пометка «Эксклюзив · до 20 февраля», потом товар сам пропадает
//          из магазина (у купивших остаётся в профиле). Без срока — не пиши это поле.
// ------------------------------------------------------------
export const PRODUCTS = [
	{
		id: 'pvp-ai',
		kind: 'mod',
		status: 'ready',
		title: 'PvP AI',
		desc: 'PvP AI — мод, который анализирует, кто победит.',
		descEn: 'PvP AI is a mod that analyzes who is going to win.',
		tags: ['1.21.11', 'Fabric'],
		price: 29,
		cover: 'img/products/pvp-ai.webp',
		link: null,
	},
	{
		id: 'new-year-mod',
		kind: 'mod',
		status: 'ready',
		title: 'Новогодний мод',
		titleEn: 'New Year mod',
		desc: 'Визуальный новогодний мод: делает мир в новогоднем настроении.',
		descEn: 'A visual New Year mod that puts the whole world in a New Year mood.',
		tags: ['1.21.11', 'Fabric'],
		price: 49,
		cover: 'img/products/new-year.webp',
		link: null,
		until: '2027-02-20',
	},
	{
		id: 'rp-1dex1',
		kind: 'rp',
		status: 'ready',
		title: 'Ресурс-пак 1DEX1',
		titleEn: '1DEX1 resource pack',
		desc: 'Мой ресурс-пак из роликов: новые текстуры оружия, брони и зелий.',
		descEn: 'My resource pack from the videos: new textures for weapons, armor and potions.',
		tags: ['1.21.11', 'Fabric'],
		price: 19,
		cover: 'img/products/rp-1dex1.webp',
		link: null,
	},
];

// КЭШБЭК: сколько процентов от покупки возвращается на баланс сайта (0 — выключить).
// Начисляется за платные покупки (с баланса, а потом и картой / по СБП), не за купон из кейса.
export const CASHBACK = 5;

// ------------------------------------------------------------
//  ПРОМОКОДЫ — скидка на любой платный товар (в окне покупки поле «Промокод»).
//  На сайте нигде не перечислены: о коде знают те, кому ты его сказал.
//  Код хранится не текстом, а отпечатком (hash), чтобы его не было видно в коде сайта.
//  Отпечаток нового кода: npm run admin -- promo hash КОД  (большие и маленькие буквы не важны)
//  percent — скидка в процентах.
// ------------------------------------------------------------
export const PROMOS = [
	{hash: '358f8eb92fc8894a2b4f717b5ceee5deb0abe9542ec48df6bb29086eef31da6f', percent: 10},
];

// ------------------------------------------------------------
//  ЕЖЕДНЕВНЫЙ КЕЙС. Открывается раз в cooldownHours часов.
//  chance — шанс в процентах (сумма может быть любой, считается доля).
//  kind:   'money' — деньги на баланс (amount — сколько рублей),
//          'rp'    — купон на любой ресурс-пак бесплатно
//  rarity: цвет в списке наград: common, uncommon, rare, legendary
//  Тексты наград — в js/i18n.js (ключи loot.<id>), там же английская версия.
//  Если сайт запущен с сервером, награду выбирает сервер по этим же шансам.
// ------------------------------------------------------------
export const CASE = {
	cooldownHours: 24,
	loot: [
		{id: 'rub5', kind: 'money', amount: 5, chance: 55, rarity: 'common'},
		{id: 'rub10', kind: 'money', amount: 10, chance: 27, rarity: 'uncommon'},
		{id: 'rub15', kind: 'money', amount: 15, chance: 13, rarity: 'rare'},
		{id: 'rp', kind: 'rp', chance: 5, rarity: 'legendary'},
	],
};

// ------------------------------------------------------------
//  ЗАДАНИЯ. За каждое выполненное — бесплатный кейс (reward — сколько кейсов).
//  kind:  'link'     — подписаться: открыть ссылку (youtube / telegram из SITE)
//                      и вернуться за наградой,
//         'purchase' — купить любой платный товар,
//         'topup'    — пополнить баланс в сумме от amount рублей.
//  Тексты заданий — в js/i18n.js (ключи task.<id>.t и task.<id>.d).
// ------------------------------------------------------------
export const TASKS = [
	{id: 'youtube', kind: 'link', link: 'youtube', reward: 1},
	{id: 'telegram', kind: 'link', link: 'telegram', reward: 1},
	{id: 'buy', kind: 'purchase', reward: 1},
	{id: 'topup50', kind: 'topup', amount: 50, reward: 1},
];
