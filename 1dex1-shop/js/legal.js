// Документы сайта: пользовательское соглашение, политика конфиденциальности, публичная оферта.
// Открываются в окне по кнопкам в подвале. Данные продавца (ФИО, ИНН, почта) — в data.js (LEGAL).
// Это шаблон: перед подключением оплаты стоит показать документы юристу.
import {LEGAL, SITE} from './data.js';

const contactsRu = () => [`Telegram: ${LEGAL.telegram}`, LEGAL.email && `почта: ${LEGAL.email}`].filter(Boolean).join(', ');
const contactsEn = () => [`Telegram: ${LEGAL.telegram}`, LEGAL.email && `email: ${LEGAL.email}`].filter(Boolean).join(', ');
const sellerRu = () => [LEGAL.owner, LEGAL.inn && `ИНН ${LEGAL.inn}`].filter(Boolean).join(', ');
const sellerEn = () => [LEGAL.ownerEn || LEGAL.owner, LEGAL.inn && `Tax ID (INN) ${LEGAL.inn}`].filter(Boolean).join(', ');

// Документ: title — заголовок, sections — разделы; в разделе list: 'ul' — простой список без номеров
const RU = () => ({
	terms: {
		title: 'Пользовательское соглашение',
		sections: [
			{
				h: 'Общие положения',
				items: [
					`Соглашение регулирует использование сайта ${SITE.name} (далее — Сайт) и его сервисов: аккаунта, кейсов, заданий, достижений и магазина.`,
					'Пользуясь Сайтом, ты принимаешь это Соглашение и Политику конфиденциальности. Если ты не согласен с ними — не пользуйся Сайтом.',
					'Покупка товаров регулируется Публичной офертой.',
				],
			},
			{
				h: 'Аккаунт',
				items: [
					'Для регистрации нужны ник, действующая почта и пароль. Почта подтверждается кодом из письма, вход в аккаунт — тоже по коду.',
					'Ты отвечаешь за сохранность пароля и доступ к своей почте. Действия, совершённые в твоём аккаунте, считаются совершёнными тобой.',
					'Один человек — один аккаунт. Ник не должен быть оскорбительным и не должен выдавать тебя за другого человека.',
					'Если тебе меньше 14 лет, пользоваться Сайтом можно с согласия родителей или законных представителей. До 18 лет покупки совершаются с их разрешения.',
				],
			},
			{
				h: 'Баланс, кейсы, задания и достижения',
				items: [
					'Баланс — внутренний счёт Сайта в рублях. Его можно тратить только на товары Сайта; вывести деньги с баланса или перевести их другому пользователю нельзя, кроме возврата по Оферте.',
					'Кейсы, задания и достижения — бесплатные игровые механики. Награды из них (рубли на балансе, купоны) не являются деньгами и не обмениваются на деньги.',
					'Шансы наград в кейсе указаны на Сайте. Ежедневный кейс открывается раз в 24 часа, дополнительные — за выполненные задания.',
					'Запрещено получать награды обманом: заводить несколько аккаунтов, использовать ботов и ошибки Сайта, подделывать запросы. За это награды и аккаунт могут быть аннулированы.',
				],
			},
			{
				h: 'Правила',
				items: [
					'Запрещено взламывать Сайт или мешать его работе, собирать данные других пользователей и использовать Сайт для незаконных действий.',
					'Запрещено распространять купленные файлы, выкладывать их в открытый доступ и выдавать за свои.',
				],
			},
			{
				h: 'Интеллектуальная собственность',
				items: [
					'Моды, ресурс-паки, дизайн, тексты и графика Сайта принадлежат их авторам и охраняются законом. Покупка даёт право на личное использование на условиях Оферты.',
					'Minecraft — товарный знак Mojang Synergies AB и Microsoft. Сайт и товары неофициальные, не одобрены Mojang или Microsoft и не связаны с ними.',
				],
			},
			{
				h: 'Ответственность',
				items: [
					'Сайт предоставляется «как есть». Мы стараемся, чтобы всё работало, но не гарантируем отсутствие перерывов и ошибок.',
					'Моды и ресурс-паки устанавливаются на твой риск: перед установкой сделай копию своих миров. Использовать моды на серверах можно только по правилам этих серверов.',
					'Мы не отвечаем за сайты и сервисы, на которые ведут ссылки с Сайта (YouTube, Telegram, сайты визуалов).',
				],
			},
			{
				h: 'Блокировка и удаление аккаунта',
				items: [
					'За нарушение Соглашения аккаунт может быть ограничен или удалён.',
					'Чтобы удалить аккаунт, напиши нам. Неизрасходованные деньги, внесённые пополнением, можно вернуть по Оферте; награды из кейсов, заданий и достижений при удалении не возвращаются.',
				],
			},
			{
				h: 'Изменения и контакты',
				items: ['Соглашение может меняться. Новая редакция действует с момента публикации на Сайте; дата редакции указана вверху.', `Вопросы и обращения: ${contactsRu()}.`],
			},
		],
	},
	privacy: {
		title: 'Политика конфиденциальности',
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
		sections: [
			{
				h: 'Общие положения',
				items: [
					`Этот документ — публичная оферта (статья 437 Гражданского кодекса РФ) ${sellerRu() ? `продавца ${sellerRu()}` : 'продавца'} (далее — Продавец) о продаже цифровых товаров на сайте ${SITE.name} (далее — Сайт).`,
					'Акцепт оферты — оплата товара или пополнение баланса. С этого момента договор между Продавцом и покупателем считается заключённым.',
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
				h: 'Цены и оплата',
				items: [
					'Цены указаны в рублях. Цена может меняться, но не для уже оплаченного заказа.',
					'Товар оплачивается с баланса Сайта. Баланс пополняется через платёжный сервис; данные карты Продавец не получает.',
					'Ресурс-пак можно получить бесплатно по купону из кейса.',
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
					'Неизрасходованные деньги, внесённые пополнением баланса, можно вернуть по заявлению тем же способом, которым они были внесены. Награды из кейсов, заданий и достижений не возвращаются и не выводятся.',
					'Заявление рассматривается в течение 10 дней.',
				],
			},
			{
				h: 'Ответственность',
				items: [
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
		sections: [
			{
				h: 'General',
				items: [
					`These Terms govern the use of the ${SITE.name} website (the “Site”) and its services: accounts, cases, quests, achievements and the shop.`,
					'By using the Site you accept these Terms and the Privacy policy. If you do not agree, do not use the Site.',
					'Purchases are governed by the Public offer.',
				],
			},
			{
				h: 'Account',
				items: [
					'To sign up you need a nickname, a working email address and a password. The email is confirmed with a code, and signing in also requires a code from the email.',
					'You are responsible for keeping your password and email access safe. Actions taken in your account are considered your own.',
					'One person — one account. A nickname must not be offensive or impersonate another person.',
					'If you are under 14, you may use the Site with the consent of your parents or legal guardians. Under 18, purchases are made with their permission.',
				],
			},
			{
				h: 'Balance, cases, quests and achievements',
				items: [
					'The balance is an internal Site account in rubles. It can only be spent on Site products; it cannot be withdrawn or transferred to other users, except for refunds under the Offer.',
					'Cases, quests and achievements are free game mechanics. Their rewards (rubles on the balance, coupons) are not money and cannot be exchanged for money.',
					'The chances of case rewards are shown on the Site. The daily case opens once every 24 hours; extra cases are given for completed quests.',
					'Getting rewards by cheating is forbidden: multiple accounts, bots, exploiting bugs, forging requests. Such rewards and the account may be cancelled.',
				],
			},
			{
				h: 'Rules',
				items: [
					'Do not hack the Site or disrupt it, collect other users’ data or use the Site for illegal activities.',
					'Do not redistribute purchased files, publish them openly or present them as your own.',
				],
			},
			{
				h: 'Intellectual property',
				items: [
					'Mods, resource packs, the Site design, texts and graphics belong to their authors and are protected by law. A purchase grants the right to personal use under the Offer.',
					'Minecraft is a trademark of Mojang Synergies AB and Microsoft. The Site and its products are unofficial and are not approved by or associated with Mojang or Microsoft.',
				],
			},
			{
				h: 'Liability',
				items: [
					'The Site is provided “as is”. We do our best to keep everything working but do not guarantee the absence of interruptions and errors.',
					'You install mods and resource packs at your own risk: back up your worlds first. Use mods on servers only according to their rules.',
					'We are not responsible for websites and services linked from the Site (YouTube, Telegram, visuals websites).',
				],
			},
			{
				h: 'Suspension and deletion',
				items: [
					'An account may be restricted or deleted for violating these Terms.',
					'To delete your account, write to us. Unspent money added by top-ups can be refunded under the Offer; rewards from cases, quests and achievements are not refunded.',
				],
			},
			{
				h: 'Changes and contacts',
				items: ['These Terms may change. A new version takes effect once published on the Site; its date is shown at the top.', `Questions and requests: ${contactsEn()}.`],
			},
		],
	},
	privacy: {
		title: 'Privacy policy',
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
		sections: [
			{
				h: 'General',
				items: [
					`This document is a public offer (Article 437 of the Civil Code of the Russian Federation) by ${sellerEn() ? `the seller ${sellerEn()}` : 'the seller'} (the “Seller”) to sell digital products on the ${SITE.name} website (the “Site”).`,
					'The offer is accepted by paying for a product or topping up the balance. From that moment the contract between the Seller and the buyer is concluded.',
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
				h: 'Prices and payment',
				items: [
					'Prices are in rubles. A price may change, but not for an order that is already paid.',
					'Products are paid from the Site balance. The balance is topped up through a payment service; the Seller never receives card details.',
					'A resource pack can be taken for free with a case coupon.',
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
					'Unspent money added by topping up the balance can be refunded on request in the same way it was paid. Rewards from cases, quests and achievements are not refunded or withdrawn.',
					'Requests are reviewed within 10 days.',
				],
			},
			{
				h: 'Liability',
				items: [
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
