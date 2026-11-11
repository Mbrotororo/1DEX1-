// Документы сайта. Каждый отвечает за своё и открывается в отдельном окне по своей кнопке в подвале:
//   terms   — пользовательское соглашение: правила сайта, аккаунт, кейсы, задания, достижения;
//   privacy — политика конфиденциальности: какие данные хранятся и как защищены;
//   offer   — публичная оферта: покупка товаров, баланс, лицензия, возврат денег.
// Данные продавца (ФИО, ИНН, почта) — в data.js (LEGAL). Это шаблон: перед подключением оплаты
// стоит показать документы юристу.
import {LEGAL, SITE} from './data.js';

const contactsRu = () => [`Telegram: ${LEGAL.telegram}`, LEGAL.email && `почта: ${LEGAL.email}`].filter(Boolean).join(', ');
const contactsEn = () => [`Telegram: ${LEGAL.telegram}`, LEGAL.email && `email: ${LEGAL.email}`].filter(Boolean).join(', ');
const sellerRu = () => [LEGAL.owner, LEGAL.inn && `ИНН ${LEGAL.inn}`].filter(Boolean).join(', ');
const sellerEn = () => [LEGAL.ownerEn || LEGAL.owner, LEGAL.inn && `Tax ID (INN) ${LEGAL.inn}`].filter(Boolean).join(', ');

// Документ: title — заголовок, lead — за что отвечает документ, sections — разделы;
// в разделе list: 'ul' — перечень без номеров
const RU = () => ({
	terms: {
		title: 'Пользовательское соглашение',
		lead: 'Правила сайта: аккаунт, кейсы, задания, достижения и что на сайте запрещено.',
		sections: [
			{
				h: 'Общие положения',
				items: [
					`Соглашение регулирует использование сайта ${SITE.name} (далее — Сайт): аккаунта, кейсов, заданий и достижений.`,
					'Пользуясь Сайтом, ты принимаешь это Соглашение. Если ты с ним не согласен — не пользуйся Сайтом.',
				],
			},
			{
				h: 'Аккаунт',
				items: [
					'Для регистрации нужны ник, действующая почта и пароль. Почта подтверждается кодом из письма, вход в аккаунт — тоже по коду.',
					'Ты отвечаешь за сохранность пароля и доступ к своей почте. Действия, совершённые в твоём аккаунте, считаются совершёнными тобой.',
					'Один человек — один аккаунт. Ник не должен быть оскорбительным и не должен выдавать тебя за другого человека.',
					'Если тебе меньше 14 лет, пользоваться Сайтом можно с согласия родителей или законных представителей.',
				],
			},
			{
				h: 'Кейсы, задания и достижения',
				items: [
					'Кейсы, задания и достижения — бесплатные игровые механики Сайта.',
					'Ежедневный кейс открывается раз в 24 часа, дополнительные кейсы выдаются за выполненные задания. Шансы наград указаны на Сайте рядом с кейсом.',
					'Награды из кейсов, заданий и достижений можно использовать только на Сайте.',
					'Запрещено получать награды обманом: заводить несколько аккаунтов, использовать ботов и ошибки Сайта, подделывать запросы. За это награды и аккаунт могут быть аннулированы.',
				],
			},
			{
				h: 'Что запрещено',
				list: 'ul',
				items: [
					'взламывать Сайт или мешать его работе;',
					'собирать данные других пользователей;',
					'использовать ошибки Сайта для выгоды — о найденной ошибке лучше написать нам;',
					'выдавать себя за администрацию Сайта или за автора канала;',
					'использовать Сайт для незаконных действий.',
				],
			},
			{
				h: 'Интеллектуальная собственность',
				items: [
					'Дизайн, тексты, графика и анимации Сайта принадлежат их авторам и охраняются законом. Копировать их без разрешения нельзя.',
					'Minecraft — товарный знак Mojang Synergies AB и Microsoft. Сайт неофициальный, не одобрен Mojang или Microsoft и не связан с ними.',
				],
			},
			{
				h: 'Ответственность',
				items: [
					'Сайт предоставляется «как есть». Мы стараемся, чтобы всё работало, но не гарантируем отсутствие перерывов и ошибок.',
					'Мы не отвечаем за сайты и сервисы, на которые ведут ссылки с Сайта (YouTube, Telegram, сайты визуалов).',
				],
			},
			{
				h: 'Блокировка и удаление аккаунта',
				items: ['За нарушение Соглашения аккаунт может быть ограничен или удалён.', 'Ты можешь удалить свой аккаунт в любой момент — для этого напиши нам.'],
			},
			{
				h: 'Изменения и контакты',
				items: ['Соглашение может меняться. Новая редакция действует с момента публикации на Сайте; дата редакции указана вверху.', `Вопросы и обращения: ${contactsRu()}.`],
			},
		],
	},
	privacy: {
		title: 'Политика конфиденциальности',
		lead: 'Какие данные о тебе хранит сайт, зачем они нужны и как они защищены.',
		sections: [
			{
				h: 'Общие положения',
				items: [
					`Политика объясняет, какие данные собирает сайт ${SITE.name} (далее — Сайт), зачем и как их защищает. Она составлена с учётом Федерального закона № 152-ФЗ «О персональных данных».`,
					'Регистрируясь на Сайте, ты даёшь согласие на обработку своих данных на условиях этой Политики.',
				],
			},
			{
				h: 'Какие данные мы собираем',
				list: 'ul',
				items: [
					'ник и адрес почты;',
					'пароль — только в зашифрованном виде (хэш): сам пароль не видит никто, включая администратора;',
					'аватарку, если ты её загрузил;',
					'баланс, историю операций, покупки, открытые кейсы и выполненные задания;',
					'технические данные — IP-адрес и время запросов, чтобы защищать Сайт от взлома и перебора паролей;',
					'cookie входа и данные в памяти браузера: язык сайта, прогресс игры на первом экране, достижения.',
				],
			},
			{
				h: 'Зачем',
				items: [
					'Чтобы создать аккаунт, подтвердить почту и пускать тебя в аккаунт по коду; выдавать покупки и награды; отвечать на обращения; защищать Сайт от взлома и обмана.',
					'Мы не используем данные для рекламы и не продаём их.',
				],
			},
			{
				h: 'Кому передаются данные',
				list: 'ul',
				items: [
					'почтовому сервису — только адрес почты, чтобы отправить письмо с кодом;',
					'платёжному сервису — при оплате и только в объёме, нужном для платежа (данные карты вводятся на стороне платёжного сервиса, Сайт их не получает);',
					'государственным органам — только в случаях, предусмотренных законом.',
				],
			},
			{
				h: 'Хранение и защита',
				items: [
					'Данные хранятся на сервере Сайта, доступ к ним есть только у администратора. Пароли хранятся в виде хэша, вход защищён cookie, недоступной скриптам страницы.',
					'Данные хранятся, пока существует аккаунт. После удаления аккаунта они удаляются в течение 30 дней, кроме сведений о платежах, которые закон требует хранить дольше.',
				],
			},
			{
				h: 'Cookie и память браузера',
				items: [
					'Cookie «sid» нужна, чтобы ты оставался в аккаунте: без неё вход невозможен. Рекламных и аналитических cookie на Сайте нет.',
					'В памяти браузера хранятся язык, прогресс и достижения. Их можно удалить, очистив данные Сайта в настройках браузера.',
				],
			},
			{
				h: 'Твои права',
				items: ['Ты можешь узнать, какие данные о тебе хранятся, исправить их, удалить аккаунт вместе с данными и отозвать согласие на обработку. Для этого напиши нам.'],
			},
			{
				h: 'Дети',
				items: ['Если тебе меньше 14 лет, регистрируйся только с согласия родителей или законных представителей.'],
			},
			{
				h: 'Изменения и контакты',
				items: ['Политика может меняться. Новая редакция действует с момента публикации на Сайте.', `Контакты: ${contactsRu()}.`],
			},
		],
	},
	offer: {
		title: 'Публичная оферта',
		lead: 'Условия покупки: товары, цены, баланс, лицензия и возврат денег.',
		sections: [
			{
				h: 'Общие положения',
				items: [
					`Этот документ — публичная оферта (статья 437 Гражданского кодекса РФ) ${sellerRu() ? `продавца ${sellerRu()}` : 'продавца'} (далее — Продавец) о продаже цифровых товаров на сайте ${SITE.name} (далее — Сайт).`,
					'Акцепт оферты — оплата товара или пополнение баланса. С этого момента договор между Продавцом и покупателем считается заключённым.',
					'Если покупателю нет 18 лет, покупка совершается с разрешения родителей или законных представителей.',
				],
			},
			{
				h: 'Товары',
				items: [
					'Товары — цифровые файлы: моды и ресурс-паки для Minecraft. Описание, версия игры и цена указаны в карточке товара.',
					'Товар передаётся в электронном виде: сразу после оплаты он появляется в профиле в разделе «Покупки» с кнопкой «Скачать».',
				],
			},
			{
				h: 'Цены, баланс и оплата',
				items: [
					'Цены указаны в рублях. Цена может меняться, но не для уже оплаченного заказа.',
					'Баланс — внутренний счёт покупателя на Сайте. Он пополняется через платёжный сервис; данные карты Продавец не получает.',
					'Товары оплачиваются с баланса. Деньги с баланса нельзя вывести или перевести другому пользователю — только вернуть по разделу «Возврат».',
					'Рубли и купоны из кейсов, заданий и достижений — подарок Продавца: ими можно оплачивать товары, но их нельзя вывести или вернуть деньгами. Ресурс-пак можно получить бесплатно по купону из кейса.',
				],
			},
			{
				h: 'Лицензия',
				items: [
					'Покупатель получает простую неисключительную лицензию на личное некоммерческое использование товара.',
					'Запрещено перепродавать товар, выкладывать его в открытый доступ, передавать другим лицам и выдавать за свой.',
				],
			},
			{
				h: 'Возврат',
				items: [
					'Если товар не скачивается или не работает на версии игры, указанной в описании, напиши нам: мы поможем, заменим файл или вернём деньги.',
					'Неизрасходованные деньги, внесённые пополнением баланса, можно вернуть по заявлению тем же способом, которым они были внесены.',
					'Заявление рассматривается в течение 10 дней.',
				],
			},
			{
				h: 'Ответственность',
				items: [
					'Перед установкой мода или ресурс-пака сделай копию своих миров. Использовать моды на серверах можно только по правилам этих серверов.',
					'Продавец не отвечает за несовместимость товара с модами, серверами и сборками, не указанными в описании, и за последствия установки без соблюдения инструкции.',
					'Ответственность Продавца по договору ограничена ценой товара.',
				],
			},
			{
				h: 'Прочее',
				items: [
					'Отношения сторон регулируются законодательством Российской Федерации. Споры решаются переговорами, а если договориться не удалось — в порядке, установленном законом.',
					`Контакты: ${contactsRu()}.`,
					...(sellerRu() ? [`Продавец: ${sellerRu()}.`] : []),
				],
			},
		],
	},
});

const EN = () => ({
	terms: {
		title: 'Terms of use',
		lead: 'Site rules: your account, cases, quests, achievements and what is not allowed.',
		sections: [
			{
				h: 'General',
				items: [
					`These Terms govern the use of the ${SITE.name} website (the “Site”): accounts, cases, quests and achievements.`,
					'By using the Site you accept these Terms. If you do not agree, do not use the Site.',
				],
			},
			{
				h: 'Account',
				items: [
					'To sign up you need a nickname, a working email address and a password. The email is confirmed with a code, and signing in also requires a code from the email.',
					'You are responsible for keeping your password and email access safe. Actions taken in your account are considered your own.',
					'One person — one account. A nickname must not be offensive or impersonate another person.',
					'If you are under 14, you may use the Site with the consent of your parents or legal guardians.',
				],
			},
			{
				h: 'Cases, quests and achievements',
				items: [
					'Cases, quests and achievements are free game mechanics of the Site.',
					'The daily case opens once every 24 hours; extra cases are given for completed quests. The chances of rewards are shown next to the case.',
					'Rewards from cases, quests and achievements can only be used on the Site.',
					'Getting rewards by cheating is forbidden: multiple accounts, bots, exploiting bugs, forging requests. Such rewards and the account may be cancelled.',
				],
			},
			{
				h: 'Not allowed',
				list: 'ul',
				items: [
					'hacking the Site or disrupting it;',
					'collecting other users’ data;',
					'exploiting Site bugs for gain — please report them to us instead;',
					'pretending to be the Site administration or the channel author;',
					'using the Site for illegal activities.',
				],
			},
			{
				h: 'Intellectual property',
				items: [
					'The Site design, texts, graphics and animations belong to their authors and are protected by law. Do not copy them without permission.',
					'Minecraft is a trademark of Mojang Synergies AB and Microsoft. The Site is unofficial and is not approved by or associated with Mojang or Microsoft.',
				],
			},
			{
				h: 'Liability',
				items: [
					'The Site is provided “as is”. We do our best to keep everything working but do not guarantee the absence of interruptions and errors.',
					'We are not responsible for websites and services linked from the Site (YouTube, Telegram, visuals websites).',
				],
			},
			{
				h: 'Suspension and deletion',
				items: ['An account may be restricted or deleted for violating these Terms.', 'You can delete your account at any time — just write to us.'],
			},
			{
				h: 'Changes and contacts',
				items: ['These Terms may change. A new version takes effect once published on the Site; its date is shown at the top.', `Questions and requests: ${contactsEn()}.`],
			},
		],
	},
	privacy: {
		title: 'Privacy policy',
		lead: 'What data the site keeps about you, why it needs it and how it is protected.',
		sections: [
			{
				h: 'General',
				items: [
					`This Policy explains what data the ${SITE.name} website (the “Site”) collects, why, and how it is protected. It follows Russian Federal Law No. 152-FZ “On Personal Data”.`,
					'By signing up you consent to the processing of your data under this Policy.',
				],
			},
			{
				h: 'What we collect',
				list: 'ul',
				items: [
					'your nickname and email address;',
					'your password — only as a hash: nobody, including the administrator, can see the password itself;',
					'your avatar, if you upload one;',
					'your balance, transaction history, purchases, opened cases and completed quests;',
					'technical data — IP address and request times, to protect the Site from hacking and password guessing;',
					'the sign-in cookie and data in your browser storage: site language, game progress on the first screen, achievements.',
				],
			},
			{
				h: 'Why',
				items: [
					'To create your account, confirm your email and let you sign in with a code; to deliver purchases and rewards; to answer your requests; to protect the Site from hacking and fraud.',
					'We do not use your data for advertising and do not sell it.',
				],
			},
			{
				h: 'Who receives the data',
				list: 'ul',
				items: [
					'the email service — only your email address, to send the code;',
					'the payment service — when you pay, and only what the payment requires (card details are entered on the payment service side, the Site never receives them);',
					'government authorities — only where the law requires it.',
				],
			},
			{
				h: 'Storage and protection',
				items: [
					'Data is stored on the Site server and only the administrator can access it. Passwords are stored as hashes; sign-in uses a cookie that page scripts cannot read.',
					'Data is kept while the account exists. After the account is deleted, it is erased within 30 days, except payment records that the law requires to keep longer.',
				],
			},
			{
				h: 'Cookies and browser storage',
				items: [
					'The “sid” cookie keeps you signed in; signing in is impossible without it. The Site uses no advertising or analytics cookies.',
					'Your browser storage keeps the language, progress and achievements. You can remove them by clearing the Site data in your browser settings.',
				],
			},
			{
				h: 'Your rights',
				items: ['You can find out what data about you is stored, correct it, delete your account with the data and withdraw your consent. Just write to us.'],
			},
			{
				h: 'Children',
				items: ['If you are under 14, sign up only with the consent of your parents or legal guardians.'],
			},
			{
				h: 'Changes and contacts',
				items: ['This Policy may change. A new version takes effect once published on the Site.', `Contacts: ${contactsEn()}.`],
			},
		],
	},
	offer: {
		title: 'Public offer',
		lead: 'Purchase terms: products, prices, balance, license and refunds.',
		sections: [
			{
				h: 'General',
				items: [
					`This document is a public offer (Article 437 of the Civil Code of the Russian Federation) by ${sellerEn() ? `the seller ${sellerEn()}` : 'the seller'} (the “Seller”) to sell digital products on the ${SITE.name} website (the “Site”).`,
					'The offer is accepted by paying for a product or topping up the balance. From that moment the contract between the Seller and the buyer is concluded.',
					'If the buyer is under 18, purchases are made with the permission of their parents or legal guardians.',
				],
			},
			{
				h: 'Products',
				items: [
					'Products are digital files: mods and resource packs for Minecraft. The description, game version and price are shown on the product card.',
					'Products are delivered electronically: right after payment they appear in your profile under Purchases with a Download button.',
				],
			},
			{
				h: 'Prices, balance and payment',
				items: [
					'Prices are in rubles. A price may change, but not for an order that is already paid.',
					'The balance is the buyer’s internal account on the Site. It is topped up through a payment service; the Seller never receives card details.',
					'Products are paid from the balance. Money on the balance cannot be withdrawn or transferred to other users — only refunded under the Refunds section.',
					'Rubles and coupons from cases, quests and achievements are a gift from the Seller: they can pay for products but cannot be withdrawn or refunded as money. A resource pack can be taken for free with a case coupon.',
				],
			},
			{
				h: 'License',
				items: [
					'The buyer receives a simple non-exclusive license for personal non-commercial use of the product.',
					'Reselling, publishing openly, passing to others or presenting the product as your own is forbidden.',
				],
			},
			{
				h: 'Refunds',
				items: [
					'If a product cannot be downloaded or does not work on the game version stated in its description, write to us: we will help, replace the file or refund the money.',
					'Unspent money added by topping up the balance can be refunded on request in the same way it was paid.',
					'Requests are reviewed within 10 days.',
				],
			},
			{
				h: 'Liability',
				items: [
					'Back up your worlds before installing a mod or resource pack. Use mods on servers only according to their rules.',
					'The Seller is not responsible for incompatibility with mods, servers and modpacks not listed in the description, or for installation without following the instructions.',
					'The Seller’s liability under the contract is limited to the price of the product.',
				],
			},
			{
				h: 'Other',
				items: [
					'The relationship is governed by the law of the Russian Federation. Disputes are settled by negotiation, and failing that, as provided by law.',
					`Contacts: ${contactsEn()}.`,
					...(sellerEn() ? [`Seller: ${sellerEn()}.`] : []),
				],
			},
		],
	},
});

export const DOCS = ['terms', 'privacy', 'offer'];
export const getDoc = (id, lang) => (lang === 'en' ? EN() : RU())[id];
