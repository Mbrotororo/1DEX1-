// Команды владельца в Telegram-боте: управлять магазином прямо из чата с ботом.
// Бот слушает только твой чат (TELEGRAM_CHAT_ID в server/.env) — чужие сообщения не читает.
// Список команд — в HELP ниже; в Telegram он же появляется в меню бота (кнопка «Меню»).

import {PROMOS} from '../js/data.js';
import {q, tx} from './db.js';

const DAY = 864e5;
const MSK = 3 * 3600e3;
const dayStart = (t) => Math.floor((t + MSK) / DAY) * DAY - MSK; // начало суток по Москве
const money = (kop) => `${(kop / 100).toFixed(2).replace('.', ',').replace(',00', '')} ₽`;
const kopIn = (s) => {
	const n = Number(String(s).replace(',', '.'));
	return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROMO_RE = /^[A-Z0-9_-]{3,24}$/;
const when = (ms) => new Date(ms + MSK).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2.$1');
const sales = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'продажа' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'продажи' : 'продаж'}`;
const PAID = {balance: 'баланс', coupon: 'купон', card: 'карта', sbp: 'СБП'};

// Команды для меню бота в Telegram (видны только в твоём чате)
export const COMMANDS = [
	['stats', 'Продажи и игроки'],
	['sales', 'Последние покупки'],
	['products', 'Товары: id, цена, продажи'],
	['promo', 'Промокоды (или создать: /promo КОД 20)'],
	['user', 'Игрок: /user Ник'],
	['give', 'Баланс: /give Ник 50'],
	['help', 'Все команды'],
];

const HELP = `Команды магазина 1DEX1 SHOP:

📊 /stats — продажи за сегодня, 7 и 30 дней, игроки
🧾 /sales — последние 10 покупок

📦 /products — товары: id, цена, сколько продано
/price pvp-ai 29 — новая цена (later — «Цена позже», 0 — бесплатно)
/hide pvp-ai — спрятать товар, /show pvp-ai — показать

🏷 /promo — все промокоды и сколько их применили
/promo WINTER 20 — промокод на −20%
/promo WINTER 20 100 2027-01-31 — не больше 100 раз и до 31 января
/promo_off WINTER — выключить, /promo_on WINTER — включить
/promo_del WINTER — удалить

👤 /user Ник — игрок: ID, почта, баланс, покупки (можно почту или #ID)
💰 /give Ник 50 за конкурс — начислить 50 ₽ (−50 — списать); текст после суммы игрок увидит в истории`;

const stats = () => {
	const now = Date.now();
	const s = (from) => q("SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS s FROM orders WHERE created_at >= ? AND paid_with != 'free'").get(from);
	const line = (name, r) => `${name}: ${sales(r.n)} на ${money(r.s)}`;
	const users = q('SELECT COUNT(*) AS n FROM users WHERE verified = 1').get().n;
	const fresh = q('SELECT COUNT(*) AS n FROM users WHERE verified = 1 AND created_at >= ?').get(dayStart(now)).n;
	const top = q("SELECT p.title, COUNT(*) AS n FROM orders o JOIN products p ON p.id = o.product_id WHERE o.created_at >= ? AND o.paid_with != 'free' GROUP BY o.product_id ORDER BY n DESC LIMIT 1").get(dayStart(now) - 29 * DAY);
	return [
		'📊 Продажи',
		line('Сегодня', s(dayStart(now))),
		line('7 дней', s(dayStart(now) - 6 * DAY)),
		line('30 дней', s(dayStart(now) - 29 * DAY)),
		line('Всего', s(0)),
		'',
		`👥 Игроков: ${users} (сегодня +${fresh})`,
		top ? `🔥 Топ за 30 дней: ${top.title} — ${sales(top.n)}` : '',
	]
		.filter((x) => x !== '')
		.join('\n');
};

const lastSales = () => {
	const rows = q("SELECT o.price, o.paid_with, o.promo, o.created_at, u.nick, p.title FROM orders o JOIN users u ON u.id = o.user_id JOIN products p ON p.id = o.product_id WHERE o.paid_with != 'free' ORDER BY o.id DESC LIMIT 10").all();
	if (!rows.length) return 'Покупок пока нет.';
	return ['🧾 Последние покупки (время московское):', ...rows.map((o) => `${when(o.created_at)} · ${o.nick} · ${o.title} · ${money(o.price)} (${PAID[o.paid_with] || o.paid_with}${o.promo ? `, ${o.promo}` : ''})`)].join('\n');
};

const products = () => {
	const rows = q("SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.paid_with != 'free') AS sold FROM products p ORDER BY p.sort, p.created_at DESC").all();
	if (!rows.length) return 'Товаров в базе нет. Перенести из js/data.js: npm run admin -- product import';
	return [
		'📦 Товары (id — для команд /price, /hide, /show):',
		...rows.map((p) => `${p.id} — ${p.title} · ${p.price === null ? 'цена позже' : p.price === 0 ? 'бесплатно' : money(p.price)} · продано ${p.sold}${p.active ? '' : ' · скрыт'}${p.file || p.link ? '' : ' · нет файла'}`),
	].join('\n');
};

const productBy = (id) => q('SELECT * FROM products WHERE id = ?').get(String(id || '').toLowerCase());

const price = ([id, value]) => {
	const p = productBy(id);
	if (!p) return 'Нет такого товара. Список id: /products';
	if (value === undefined) return `Как: /price ${p.id} 29`;
	const kop = /^later$/i.test(value) ? null : kopIn(value);
	if (Number.isNaN(kop) || kop < 0 || kop > 1e8) return 'Цена — число, например 29 или 19.90 (later — «Цена позже»)';
	q('UPDATE products SET price = ? WHERE id = ?').run(kop, p.id);
	return `✅ ${p.title}: ${kop === null ? 'цена позже' : kop === 0 ? 'бесплатно' : money(kop)}`;
};
const show = ([id], on) => {
	const p = productBy(id);
	if (!p) return 'Нет такого товара. Список id: /products';
	q('UPDATE products SET active = ? WHERE id = ?').run(on ? 1 : 0, p.id);
	return on ? `✅ ${p.title} снова в магазине` : `🙈 ${p.title} спрятан (у купивших остаётся)`;
};

const promoList = () => {
	const rows = q('SELECT * FROM promos ORDER BY created_at DESC').all();
	const used = (code) => q('SELECT COUNT(*) AS n FROM orders WHERE promo = ?').get(code).n;
	const lines = rows.map((r) => `${r.active ? '🟢' : '⚪️'} ${r.code} −${r.percent}% · применили ${used(r.code)}${r.max_uses ? ` из ${r.max_uses}` : ''}${r.until ? ` · до ${r.until}` : ''}`);
	// коды из js/data.js (там они отпечатком) — видны только по применениям
	const other = q('SELECT promo, COUNT(*) AS n FROM orders WHERE promo IS NOT NULL GROUP BY promo').all().filter((r) => !rows.some((x) => x.code.toUpperCase() === r.promo));
	return [
		'🏷 Промокоды:',
		...(lines.length ? lines : ['(созданных здесь или в админке пока нет)']),
		...(other.length ? ['', 'Коды из js/data.js:', ...other.map((r) => `${r.promo} · применили ${r.n}`)] : PROMOS.length ? ['', `Ещё кодов в js/data.js: ${PROMOS.length}`] : []),
		'',
		'Создать: /promo КОД 20 (скидка %), можно ещё лимит и срок: /promo КОД 20 100 2027-01-31',
	].join('\n');
};
const promoSet = ([code, percent, ...rest]) => {
	const c = String(code || '').toUpperCase();
	if (!PROMO_RE.test(c)) return 'Код: латиница, цифры, «-» и «_», от 3 до 24 символов. Пример: /promo WINTER 20';
	const pct = Number(percent);
	if (!Number.isInteger(pct) || pct < 1 || pct > 90) return 'Скидка — целое число от 1 до 90. Пример: /promo WINTER 20';
	let maxUses = null;
	let until = null;
	for (const a of rest) {
		if (DAY_RE.test(a)) until = a;
		else if (/^\d+$/.test(a) && Number(a) > 0) maxUses = Number(a);
		else return `Не понял «${a}». Лимит — число, срок — дата ГГГГ-ММ-ДД.`;
	}
	q(`INSERT INTO promos (code, percent, max_uses, until, active, created_at) VALUES (?, ?, ?, ?, 1, ?)
		ON CONFLICT (code) DO UPDATE SET percent = excluded.percent, max_uses = excluded.max_uses, until = excluded.until, active = 1`).run(c, pct, maxUses, until, Date.now());
	return `✅ Промокод ${c}: −${pct}%${maxUses ? `, не больше ${maxUses} раз` : ''}${until ? `, до ${until} включительно` : ''}. На сайте он нигде не показывается — скажи его зрителям сам.`;
};
const promoToggle = ([code], on) => {
	const r = q('UPDATE promos SET active = ? WHERE code = ?').run(on ? 1 : 0, String(code || ''));
	if (!r.changes) return 'Нет такого промокода. Список: /promo';
	return on ? `🟢 ${String(code).toUpperCase()} снова работает` : `⚪️ ${String(code).toUpperCase()} выключен`;
};
const promoDel = ([code]) => {
	const r = q('DELETE FROM promos WHERE code = ?').run(String(code || ''));
	return r.changes ? `🗑 ${String(code).toUpperCase()} удалён` : 'Нет такого промокода. Список: /promo';
};

const findUser = (s) => {
	const v = String(s || '').trim();
	if (!v) return null;
	if (/^#?\d+$/.test(v) && v.startsWith('#')) return q('SELECT * FROM users WHERE num = ?').get(Number(v.slice(1)));
	return q('SELECT * FROM users WHERE nick = ? OR email = ?').get(v.replace(/^@/, ''), v.toLowerCase()) || (/^\d+$/.test(v) ? q('SELECT * FROM users WHERE num = ?').get(Number(v)) : null);
};
const userInfo = ([who]) => {
	const u = findUser(who);
	if (!u) return who ? 'Нет такого игрока.' : 'Как: /user Ник (или почта, или #ID)';
	const o = q("SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS s FROM orders WHERE user_id = ? AND paid_with != 'free'").get(u.id);
	const list = q('SELECT p.title FROM orders o JOIN products p ON p.id = o.product_id WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 5').all(u.id);
	return [
		`👤 ${u.nick}${u.role === 'admin' ? ' (админ)' : ''}`,
		`ID: ${u.num ?? '— (почта не подтверждена)'}`,
		`Почта: ${u.email}`,
		`Баланс: ${money(u.balance)}`,
		`Покупок: ${o.n} на ${money(o.s)}${list.length ? ` — ${list.map((x) => x.title).join(', ')}` : ''}`,
		`С нами с ${new Date(u.created_at + MSK).toISOString().slice(0, 10)}`,
	].join('\n');
};
const give = ([who, amount, ...note]) => {
	if (!who || amount === undefined) return 'Как: /give Ник 50 за конкурс (−50 — списать)';
	const u = findUser(who);
	if (!u) return 'Нет такого игрока.';
	const kop = kopIn(amount);
	if (!kop || Number.isNaN(kop) || Math.abs(kop) > 1e7) return 'Сумма — число, например 50 или −20.';
	return tx(() => {
		const now = q('SELECT balance FROM users WHERE id = ?').get(u.id).balance;
		if (now + kop < 0) return `На балансе у ${u.nick} только ${money(now)} — столько не списать.`;
		q('UPDATE users SET balance = balance + ? WHERE id = ?').run(kop, u.id);
		q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, 'admin', ?, ?)").run(u.id, kop, note.join(' ').slice(0, 80) || null, Date.now());
		return `${kop > 0 ? '💰 Начислено' : '➖ Списано'} ${money(Math.abs(kop))} игроку ${u.nick}. Теперь на балансе ${money(now + kop)}.`;
	});
};

const ROUTES = {
	start: () => `Привет! Я бот магазина 1DEX1 SHOP: присылаю тебе каждую покупку и слушаюсь команд.\n\n${HELP}`,
	help: () => HELP,
	stats,
	sales: lastSales,
	products,
	price,
	hide: (a) => show(a, false),
	show: (a) => show(a, true),
	promo: (a) => (a.length ? promoSet(a) : promoList()),
	promo_off: (a) => promoToggle(a, false),
	promo_on: (a) => promoToggle(a, true),
	promo_del: promoDel,
	user: userInfo,
	give,
};

// Текст сообщения → ответ (или null, если это не команда)
export const botCommand = (text) => {
	const m = String(text || '')
		.trim()
		.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
	if (!m) return 'Это не команда. Все команды: /help';
	const fn = ROUTES[m[1].toLowerCase()];
	if (!fn) return 'Не знаю такой команды. Все команды: /help';
	const args = (m[2] || '')
		.replace(/[−–—]/g, '-') // минус с телефона бывает «длинным»
		.split(/\s+/)
		.filter(Boolean);
	return fn(args);
};
