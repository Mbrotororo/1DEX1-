// Управление магазином из консоли (на сервере, в папке 1dex1-shop):
//
//   npm run admin -- product add --id rp-night --kind rp --title "Ночной пак" --price 99 \
//        --desc "Тёмное небо и звёзды" --tags 1.21,Optifine --cover img/rp-night.png \
//        --file ~/packs/night.zip            (или --link https://… — внешняя ссылка)
//        [--title-en "Night pack"] [--desc-en "…"] [--status soon] [--sort 1]
//        [--until 2027-02-20]   эксклюзив: продаётся до этого дня включительно, потом пропадает
//   npm run admin -- product import     перенести товары из js/data.js в базу
//        (обновляет название, описание, цену, картинку и срок; загруженные файлы не трогает)
//   npm run admin -- promo hash КОД     отпечаток промокода для PROMOS в js/data.js
//   npm run admin -- product list
//   npm run admin -- product hide <id>  |  product show <id>  |  product remove <id>
//   npm run admin -- product price <id> <рубли>
//
//   npm run admin -- user admin <ник>             дать доступ в админку на сайте (unadmin — забрать)
//   npm run admin -- telegram chatid              номер чата для уведомлений (сначала напиши боту)
//   npm run admin -- telegram test                тестовое уведомление в Telegram
//
//   npm run admin -- user list
//   npm run admin -- user topup <ник> <рубли>     пополнение (пока нет оплаты — вручную)
//   npm run admin -- user credit <ник> <рубли> [--note "за конкурс"]   начисление
//   npm run admin -- user verify <ник>            подтвердить почту вручную
//   npm run admin -- user delete <ник> --yes      удалить аккаунт со всеми данными (по просьбе игрока)
//
// --price без значения или 0 — бесплатно; --price later — «цена позже».
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync} from 'node:fs';
import {basename, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DB_PATH, q} from './db.js';
import {hasToken, recentChats, telegramConfigured, tellOwner} from './telegram.js';

const FILES = resolve(fileURLToPath(new URL('.', import.meta.url)), 'files');
const [, , what, action, ...rest] = process.argv;
const opts = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
	if (rest[i].startsWith('--')) {
		const key = rest[i].slice(2);
		const next = rest[i + 1];
		opts[key] = next !== undefined && !next.startsWith('--') ? (i++, next) : true;
	} else args.push(rest[i]);
}
const fail = (msg) => {
	console.error(`Ошибка: ${msg}`);
	process.exit(1);
};
const kop = (v) => {
	const n = Number(String(v).replace(',', '.'));
	if (!Number.isFinite(n) || n < 0) fail(`не понял сумму «${v}»`);
	return Math.round(n * 100);
};
const day = (v) => {
	if (v === undefined || v === null || v === '' || v === true) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) fail(`дата «${v}»: нужно ГГГГ-ММ-ДД, например 2027-02-20`);
	return String(v);
};
// Сохранить товар (новый или обновить старый); файл, если не передан, остаётся прежним
const saveProduct = (p) =>
	q(`INSERT INTO products (id, kind, status, title, title_en, descr, descr_en, tags, price, cover, link, file, sale_until, sort, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, status = excluded.status, title = excluded.title, title_en = excluded.title_en,
			descr = excluded.descr, descr_en = excluded.descr_en, tags = excluded.tags, price = excluded.price, cover = excluded.cover,
			link = excluded.link, file = COALESCE(excluded.file, products.file), sale_until = excluded.sale_until, sort = excluded.sort, active = 1`).run(
		p.id,
		p.kind,
		p.status,
		p.title,
		p.titleEn,
		p.desc,
		p.descEn,
		JSON.stringify(p.tags),
		p.price,
		p.cover,
		p.link,
		p.file,
		p.until,
		p.sort,
		Date.now(),
	);
const userBy = (nick) => q('SELECT * FROM users WHERE nick = ?').get(nick) || fail(`нет пользователя ${nick}`);
const table = (rows) => (rows.length ? console.table(rows) : console.log('(пусто)'));

if (what === 'product' && action === 'add') {
	const id = String(opts.id || '').trim();
	if (!/^[a-z0-9-]{2,40}$/.test(id)) fail('--id: латиница, цифры и дефис, например rp-night');
	if (!['mod', 'rp'].includes(opts.kind)) fail('--kind: mod или rp');
	if (!opts.title) fail('нужно --title');
	let price = null;
	if (opts.price === true || opts.price === undefined) price = 0;
	else if (opts.price !== 'later') price = kop(opts.price);
	let file = null;
	if (opts.file) {
		const src = resolve(String(opts.file));
		if (!existsSync(src)) fail(`нет файла ${src}`);
		mkdirSync(FILES, {recursive: true});
		file = `${id}${extname(src)}`;
		copyFileSync(src, resolve(FILES, file));
	}
	saveProduct({
		id,
		kind: opts.kind,
		status: opts.status === 'soon' ? 'soon' : 'ready',
		title: String(opts.title),
		titleEn: opts['title-en'] ? String(opts['title-en']) : null,
		desc: opts.desc ? String(opts.desc) : '',
		descEn: opts['desc-en'] ? String(opts['desc-en']) : null,
		tags: opts.tags ? String(opts.tags).split(',').map((s) => s.trim()).filter(Boolean) : [],
		price,
		cover: opts.cover ? String(opts.cover) : null,
		link: opts.link ? String(opts.link) : null,
		file,
		until: day(opts.until),
		sort: Number(opts.sort) || 0,
	});
	console.log(`Товар ${id} сохранён${file ? `, файл: server/files/${file}` : ''}.`);
} else if (what === 'product' && action === 'import') {
	const {PRODUCTS} = await import('../js/data.js');
	PRODUCTS.forEach((p, i) => {
		if (!/^[a-z0-9-]{2,40}$/.test(p.id || '')) fail(`id «${p.id}»: латиница, цифры и дефис`);
		if (!['mod', 'rp'].includes(p.kind)) fail(`${p.id}: kind — mod или rp`);
		saveProduct({
			id: p.id,
			kind: p.kind,
			status: p.status === 'soon' ? 'soon' : 'ready',
			title: String(p.title || p.id),
			titleEn: p.titleEn || null,
			desc: p.desc || '',
			descEn: p.descEn || null,
			tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
			price: typeof p.price === 'number' ? kop(p.price) : null,
			cover: p.cover || null,
			link: p.link || null,
			file: null,
			until: day(p.until),
			sort: i,
		});
		console.log(`  ${p.id} — ${p.title}${p.until ? ` (до ${p.until})` : ''}`);
	});
	console.log(`Готово: ${PRODUCTS.length} товар(ов) из js/data.js в базе.`);
} else if (what === 'promo' && action === 'hash') {
	const code = String(args[0] || '').trim().toUpperCase();
	if (!code) fail('укажи код: promo hash КОД');
	const hash = createHash('sha256').update(`1dex1-promo:${code}`).digest('hex');
	console.log(`Добавь в PROMOS (js/data.js), percent — скидка в процентах:\n\t{hash: '${hash}', percent: 10},`);
} else if (what === 'product' && action === 'list') {
	table(q('SELECT id, kind, status, title, price / 100.0 AS rub, active, COALESCE(sale_until, \'—\') AS until, COALESCE(file, link, \'—\') AS download FROM products ORDER BY sort, created_at DESC').all());
} else if (what === 'product' && ['hide', 'show', 'remove'].includes(action)) {
	const id = args[0] || fail('укажи id товара');
	const sql = {hide: 'UPDATE products SET active = 0 WHERE id = ?', show: 'UPDATE products SET active = 1 WHERE id = ?', remove: 'DELETE FROM products WHERE id = ? AND NOT EXISTS (SELECT 1 FROM orders WHERE product_id = products.id)'}[action];
	const r = q(sql).run(id);
	if (!r.changes) fail(action === 'remove' ? 'товар не найден или его уже покупали (тогда используй hide)' : 'товар не найден');
	console.log('Готово.');
} else if (what === 'product' && action === 'price') {
	const [id, value] = args;
	const r = q('UPDATE products SET price = ? WHERE id = ?').run(value === 'later' ? null : kop(value), id);
	if (!r.changes) fail('товар не найден');
	console.log('Цена изменена.');
} else if (what === 'user' && (action === 'admin' || action === 'unadmin')) {
	const u = userBy(args[0] || fail('укажи ник'));
	q('UPDATE users SET role = ? WHERE id = ?').run(action === 'admin' ? 'admin' : null, u.id);
	console.log(action === 'admin' ? `${u.nick} теперь админ: в профиле на сайте появится кнопка «Админка».` : `${u.nick} больше не админ.`);
} else if (what === 'telegram' && action === 'chatid') {
	if (!hasToken) fail('сначала впиши TELEGRAM_BOT_TOKEN в server/.env (токен даёт @BotFather)');
	const chats = await recentChats().catch((err) => fail(err.message));
	if (!chats.length) console.log('Боту ещё никто не писал. Напиши ему /start в Telegram и запусти команду снова.');
	else chats.forEach((c) => console.log(`TELEGRAM_CHAT_ID=${c.id}    ${c.name}`));
} else if (what === 'telegram' && action === 'test') {
	if (!telegramConfigured) fail('нужны TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в server/.env');
	console.log((await tellOwner('✅ 1DEX1 SHOP: уведомления о покупках работают.')) ? 'Отправлено — проверь Telegram.' : 'Не отправилось, причина выше.');
} else if (what === 'user' && action === 'list') {
	table(q("SELECT num AS id, nick, email, CASE verified WHEN 1 THEN 'да' ELSE 'нет' END AS verified, balance / 100.0 AS rub, bonus_cases AS cases, datetime(created_at / 1000, 'unixepoch') AS created FROM users ORDER BY num IS NULL, num, id").all());
} else if (what === 'user' && (action === 'topup' || action === 'credit')) {
	const [nick, value] = args;
	const u = userBy(nick);
	const amount = kop(value);
	q('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, u.id);
	q('INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, ?, ?, ?)').run(u.id, amount, action === 'topup' ? 'topup' : 'admin', opts.note ? String(opts.note) : null, Date.now());
	console.log(`${u.nick}: +${amount / 100} ₽, баланс ${(u.balance + amount) / 100} ₽.`);
} else if (what === 'user' && action === 'verify') {
	const u = userBy(args[0]);
	q('UPDATE users SET verified = 1, num = COALESCE(num, (SELECT COALESCE(MAX(num), 0) + 1 FROM users)) WHERE id = ?').run(u.id);
	console.log(`Почта ${u.email} подтверждена.`);
} else if (what === 'user' && action === 'delete') {
	const u = userBy(args[0]);
	if (opts.yes !== true) fail(`это удалит ${u.nick} (${u.email}), баланс, покупки и историю навсегда. Чтобы подтвердить, добавь --yes`);
	q('DELETE FROM users WHERE id = ?').run(u.id); // остальное удаляется само (ON DELETE CASCADE)
	console.log(`Аккаунт ${u.nick} удалён.`);
} else {
	console.log(`База: ${DB_PATH}\nКоманды — в начале файла ${basename(fileURLToPath(import.meta.url))} и в README.`);
}
