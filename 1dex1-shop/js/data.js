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

// Визуалы, с которыми сотрудничаешь: их логотипы летают вокруг аватарки
// в разделе «Сотрудничество», клик открывает сайт. Логотипы лежат в img/visuals/.
export const VISUALS = [
	{name: 'Aura', url: 'https://auravisuals.space/', logo: 'img/visuals/aura.svg', fit: 'contain'},
	{name: 'FadingVisual', url: 'https://fadingvisual.xyz/', logo: 'img/visuals/fading.jpg'},
	{name: 'Fantasy', url: 'https://fantasyvisuals.cc/', logo: 'img/visuals/fantasy.png', fit: 'contain', pixel: true},
];

// Слова в бегущей строке под первым экраном
export const MARQUEE = ['Магазин', 'Моды', 'РП'];

// ------------------------------------------------------------
//  ТОВАРЫ. Сейчас список пустой — на сайте стоит заглушка «Товаров пока нет».
//  Чтобы добавить товар, скопируй пример ниже внутрь квадратных скобок
//  и убери две косые черты в начале каждой строки.
//
//  kind:   'mod' — мод, 'rp' — ресурс-пак
//  status: 'soon' — в разработке, 'ready' — готов
//  price:  число в рублях или null (покажет «Цена позже»)
//  cover:  путь к картинке, например 'img/my-mod.png', или null
//  link:   ссылка «Купить / Скачать» или null (покажет «Скоро»)
//  tags:   короткие пометки: версия игры, загрузчик, сервер
// ------------------------------------------------------------
export const PRODUCTS = [
	// {
	// 	id: 'mod-1',
	// 	kind: 'mod',
	// 	status: 'soon',
	// 	title: 'Название мода',
	// 	desc: 'Короткое описание в одну-две строки.',
	// 	tags: ['1.21', 'Fabric'],
	// 	price: null,
	// 	cover: null,
	// 	link: null,
	// },
];

// ------------------------------------------------------------
//  ЕЖЕДНЕВНЫЙ КЕЙС. Открывается раз в cooldownHours часов.
//  chance — шанс в процентах (сумма может быть любой, считается доля).
//  kind:   'money' — деньги на баланс (amount — сколько рублей),
//          'rp'    — купон на любой ресурс-пак бесплатно
//  rarity: цвет в списке наград: common, uncommon, rare, legendary
// ------------------------------------------------------------
export const CASE = {
	title: 'Ежедневный кейс',
	cooldownHours: 24,
	loot: [
		{id: 'rub5', kind: 'money', amount: 5, title: '+5 ₽ на баланс', chance: 55, rarity: 'common'},
		{id: 'rub10', kind: 'money', amount: 10, title: '+10 ₽ на баланс', chance: 27, rarity: 'uncommon'},
		{id: 'rub15', kind: 'money', amount: 15, title: '+15 ₽ на баланс', chance: 13, rarity: 'rare'},
		{id: 'rp', kind: 'rp', title: 'Любой ресурс-пак бесплатно', chance: 5, rarity: 'legendary'},
	],
};
