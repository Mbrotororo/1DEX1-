// Сервер 1DEX1 SHOP: отдаёт сайт и обслуживает аккаунты, баланс, кейсы, задания и покупки.
// Запуск: npm start (из папки 1dex1-shop). Нужен Node.js 22.13 или новее, больше ничего.
// Настройки — переменные окружения или файл server/.env (пример — server/.env.example).
import {createHash, randomBytes, randomInt, scrypt, timingSafeEqual} from 'node:crypto';
import {createReadStream, statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {CASE, TASKS} from '../js/data.js';
import {q, tx} from './db.js';
import {mailConfigured, sendCode} from './mail.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FILES = resolve(ROOT, 'server', 'files');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1'; // 1 — сайт работает по https
const DAY = 864e5;
const SESSION_DAYS = 30;
const CODE_TTL = 15 * 60e3; // код из письма действует 15 минут
const RESEND_GAP = 60e3; // новый код — не чаще раза в минуту
const LINK_TASK_DELAY = 5e3; // «подписаться»: забрать кейс можно через 5 секунд после перехода
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const scryptAsync = promisify(scrypt);
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const rub = (kop) => kop / 100;
const iso = (ms) => new Date(ms).toISOString();
const lang = (body) => (body?.lang === 'en' ? 'en' : 'ru');

// ---------- пароли: scrypt с солью ----------
const hashPass = async (pw) => {
	const salt = randomBytes(16).toString('hex');
	const key = await scryptAsync(pw, salt, 64);
	return `scrypt$${salt}$${key.toString('hex')}`;
};
const checkPass = async (pw, stored) => {
	const [, salt, hex] = String(stored).split('$');
	if (!salt || !hex) return false;
	const key = await scryptAsync(String(pw), salt, 64);
	const want = Buffer.from(hex, 'hex');
	return want.length === key.length && timingSafeEqual(want, key);
};

// ---------- защита от перебора: не больше max запросов за окно ----------
const hits = new Map();
const limited = (key, max, windowMs) => {
	const now = Date.now();
	const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
	list.push(now);
	hits.set(key, list);
	return list.length > max;
};
setInterval(() => {
	const now = Date.now();
	for (const [k, list] of hits) if (!list.some((t) => now - t < 3600e3)) hits.delete(k);
}, 600e3).unref();

// ---------- вход: токен в cookie, в базе — его хэш ----------
const cookies = (header = '') =>
	Object.fromEntries(
		header
			.split(';')
			.map((p) => p.trim().split('='))
			.filter(([k]) => k)
			.map(([k, ...v]) => [k, v.join('=')]),
	);
const setCookie = (res, value, maxAge) => res.setHeader('Set-Cookie', `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`);
const sessionUser = (req) => {
	const token = cookies(req.headers.cookie).sid;
	if (!token) return null;
	return q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.verified = 1').get(sha(token), Date.now()) || null;
};
const startSession = (res, userId) => {
	const token = randomBytes(32).toString('base64url');
	q('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + SESSION_DAYS * DAY);
	q('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
	setCookie(res, token, SESSION_DAYS * 86400);
};

// ---------- код подтверждения почты ----------
const issueCode = async (user, l) => {
	const code = String(randomInt(0, 1e6)).padStart(6, '0');
	const now = Date.now();
	q('INSERT INTO email_codes (user_id, code, expires_at, sent_at, tries) VALUES (?, ?, ?, ?, 0) ON CONFLICT (user_id) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, sent_at = excluded.sent_at, tries = 0').run(user.id, sha(code), now + CODE_TTL, now);
	await sendCode(user.email, user.nick, code, l);
};

// ---------- что отдаём сайту ----------
const taskStates = (u) => {
	const rows = new Map(q('SELECT task, opened_at, claimed_at FROM tasks WHERE user_id = ?').all(u.id).map((r) => [r.task, r]));
	const paid = q("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND paid_with = 'balance' AND price > 0").get(u.id).n;
	const topups = rub(q("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE user_id = ? AND kind = 'topup'").get(u.id).s);
	const out = {};
	for (const task of TASKS) {
		const row = rows.get(task.id) || {};
		let state = 'todo';
		const progress = task.kind === 'topup' ? topups : undefined;
		if (row.claimed_at) state = 'claimed';
		else if (task.kind === 'link') state = row.opened_at ? 'opened' : 'todo';
		else if (task.kind === 'purchase') state = paid > 0 ? 'ready' : 'todo';
		else if (task.kind === 'topup') state = topups >= task.amount ? 'ready' : 'todo';
		out[task.id] = {state, progress};
	}
	return out;
};
const userJson = (id) => {
	const u = q('SELECT * FROM users WHERE id = ?').get(id);
	if (!u) return null;
	return {
		nick: u.nick,
		email: u.email,
		avatar: u.avatar,
		verified: Boolean(u.verified),
		balance: rub(u.balance),
		bonusCases: u.bonus_cases,
		caseAt: u.case_at || 0,
		createdAt: iso(u.created_at),
		history: q('SELECT id, amount, kind, title, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50')
			.all(u.id)
			.map((h) => ({id: `l${h.id}`, amount: rub(h.amount), kind: h.kind, title: h.title, at: iso(h.created_at)})),
		coupons: q('SELECT id, kind, created_at FROM coupons WHERE user_id = ? AND order_id IS NULL ORDER BY id DESC')
			.all(u.id)
			.map((c) => ({id: `c${c.id}`, kind: c.kind, at: iso(c.created_at)})),
		orders: q('SELECT o.id, o.product_id, o.price, o.created_at, p.title, p.title_en FROM orders o JOIN products p ON p.id = o.product_id WHERE o.user_id = ? ORDER BY o.id DESC')
			.all(u.id)
			.map((o) => ({id: `o${o.id}`, productId: o.product_id, title: o.title, titleEn: o.title_en, price: rub(o.price), at: iso(o.created_at)})),
		tasks: taskStates(u),
	};
};
const productJson = (p) => ({
	id: p.id,
	kind: p.kind,
	status: p.status,
	title: p.title,
	titleEn: p.title_en,
	desc: p.descr,
	descEn: p.descr_en,
	tags: JSON.parse(p.tags || '[]'),
	price: p.price === null ? null : rub(p.price),
	cover: p.cover,
	downloadable: Boolean(p.link || p.file),
});

// =====================================================================
//  API: каждый обработчик возвращает [код ответа, данные]
// =====================================================================
const routes = new Map();
const route = (method, path, handler, {auth = false} = {}) => routes.set(`${method} ${path}`, {handler, auth});

route('GET', 'health', () => [200, {ok: true, app: '1dex1-shop', mail: mailConfigured}]);
route('GET', 'me', ({user}) => [200, {user: user ? userJson(user.id) : null}]);

// --- регистрация: аккаунт создаётся неподтверждённым, на почту уходит код ---
route('POST', 'register', async ({body, ip}) => {
	const nick = String(body.nick || '').trim();
	const email = String(body.email || '')
		.trim()
		.toLowerCase();
	const password = String(body.password || '');
	if (!NICK_RE.test(nick)) return [400, {error: 'nick', field: 'nick'}];
	if (!EMAIL_RE.test(email) || email.length > 120) return [400, {error: 'email', field: 'email'}];
	if (password.length < 6 || password.length > 200) return [400, {error: 'password', field: 'password'}];
	if (limited(`reg:${ip}`, 10, 3600e3)) return [429, {error: 'too_many'}];
	const byEmail = q('SELECT * FROM users WHERE email = ?').get(email);
	if (byEmail?.verified) return [409, {error: 'email_taken', field: 'email'}];
	const byNick = q('SELECT * FROM users WHERE nick = ?').get(nick);
	if (byNick && byNick.id !== byEmail?.id) {
		// ник держит чужой неподтверждённый аккаунт старше суток — освобождаем
		if (!byNick.verified && Date.now() - byNick.created_at > DAY) q('DELETE FROM users WHERE id = ?').run(byNick.id);
		else return [409, {error: 'nick_taken', field: 'nick'}];
	}
	const pass = await hashPass(password);
	let id = byEmail?.id;
	if (id) q('UPDATE users SET nick = ?, pass = ?, created_at = ? WHERE id = ?').run(nick, pass, Date.now(), id);
	else id = Number(q('INSERT INTO users (nick, email, pass, created_at) VALUES (?, ?, ?, ?)').run(nick, email, pass, Date.now()).lastInsertRowid);
	try {
		await issueCode({id, nick, email}, lang(body));
	} catch (err) {
		console.error('Письмо не отправлено:', err.message);
		return [502, {error: 'mail'}];
	}
	return [200, {verify: true, email}];
});

// --- новый код на почту ---
route('POST', 'resend', async ({body, ip}) => {
	const email = String(body.email || '')
		.trim()
		.toLowerCase();
	if (limited(`resend:${ip}`, 6, 15 * 60e3) || limited(`resend:${email}`, 4, 15 * 60e3)) return [429, {error: 'too_many'}];
	const user = q('SELECT * FROM users WHERE email = ? AND verified = 0').get(email);
	if (!user) return [200, {ok: true}]; // не говорим, есть ли такая почта
	const last = q('SELECT sent_at FROM email_codes WHERE user_id = ?').get(user.id);
	if (last && Date.now() - last.sent_at < RESEND_GAP) return [429, {error: 'too_many', wait: RESEND_GAP - (Date.now() - last.sent_at)}];
	try {
		await issueCode(user, lang(body));
	} catch (err) {
		console.error('Письмо не отправлено:', err.message);
		return [502, {error: 'mail'}];
	}
	return [200, {ok: true}];
});

// --- код из письма: почта подтверждена, сразу входим ---
route('POST', 'verify', ({body, res, ip}) => {
	const email = String(body.email || '')
		.trim()
		.toLowerCase();
	const code = String(body.code || '').replace(/\D/g, '');
	if (limited(`verify:${ip}`, 30, 15 * 60e3)) return [429, {error: 'too_many'}];
	const user = q('SELECT * FROM users WHERE email = ?').get(email);
	const row = user && q('SELECT * FROM email_codes WHERE user_id = ?').get(user.id);
	if (!row) return [400, {error: 'bad_code'}];
	if (row.expires_at < Date.now()) return [400, {error: 'code_expired'}];
	if (row.tries >= 5) return [429, {error: 'too_many'}];
	if (sha(code) !== row.code) {
		q('UPDATE email_codes SET tries = tries + 1 WHERE user_id = ?').run(user.id);
		return [400, {error: 'bad_code'}];
	}
	q('UPDATE users SET verified = 1 WHERE id = ?').run(user.id);
	q('DELETE FROM email_codes WHERE user_id = ?').run(user.id);
	startSession(res, user.id);
	return [200, {user: userJson(user.id)}];
});

// --- вход по нику или почте ---
route('POST', 'login', async ({body, res, ip}) => {
	const name = String(body.login || '')
		.trim()
		.toLowerCase();
	if (limited(`login:${ip}`, 20, 15 * 60e3)) return [429, {error: 'too_many'}];
	const user = q('SELECT * FROM users WHERE nick = ? OR email = ?').get(name, name);
	if (!user || !(await checkPass(body.password, user.pass))) return [401, {error: 'bad_login'}];
	if (!user.verified) {
		const last = q('SELECT sent_at FROM email_codes WHERE user_id = ?').get(user.id);
		if (!last || Date.now() - last.sent_at > RESEND_GAP) {
			try {
				await issueCode(user, lang(body));
			} catch (err) {
				console.error('Письмо не отправлено:', err.message);
			}
		}
		return [403, {error: 'not_verified', email: user.email}];
	}
	startSession(res, user.id);
	return [200, {user: userJson(user.id)}];
});

route('POST', 'logout', ({req, res}) => {
	const token = cookies(req.headers.cookie).sid;
	if (token) q('DELETE FROM sessions WHERE token = ?').run(sha(token));
	setCookie(res, '', 0);
	return [200, {user: null}];
});

route(
	'POST',
	'password',
	async ({body, user}) => {
		const next = String(body.newPassword || '');
		if (next.length < 6 || next.length > 200) return [400, {error: 'new_password'}];
		if (!(await checkPass(body.oldPassword, user.pass))) return [400, {error: 'old_password'}];
		q('UPDATE users SET pass = ? WHERE id = ?').run(await hashPass(next), user.id);
		return [200, {ok: true}];
	},
	{auth: true},
);

route(
	'POST',
	'avatar',
	({body, user}) => {
		const avatar = String(body.avatar || '');
		if (avatar.length > 400_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) return [400, {error: 'avatarFormat'}];
		q('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, user.id);
		return [200, {ok: true}];
	},
	{auth: true},
);

// --- кейс: сначала ежедневный, потом бесплатные за задания. Награду выбирает сервер ---
route(
	'POST',
	'case/open',
	({user}) =>
		tx(() => {
			const u = q('SELECT * FROM users WHERE id = ?').get(user.id);
			const now = Date.now();
			const wait = CASE.cooldownHours * 3600e3;
			let source;
			if (!u.case_at || now - u.case_at >= wait) {
				source = 'daily';
				q('UPDATE users SET case_at = ? WHERE id = ?').run(now, u.id);
			} else if (u.bonus_cases > 0) {
				source = 'bonus';
				q('UPDATE users SET bonus_cases = bonus_cases - 1 WHERE id = ?').run(u.id);
			} else return [429, {error: 'wait', next: u.case_at + wait}];
			const weights = CASE.loot.map((l) => Math.round(l.chance * 100));
			let roll = randomInt(weights.reduce((a, b) => a + b, 0));
			const prize = CASE.loot.find((_, i) => (roll -= weights[i]) < 0);
			if (prize.kind === 'money') {
				q('UPDATE users SET balance = balance + ? WHERE id = ?').run(prize.amount * 100, u.id);
				q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, 'case', ?, ?)").run(u.id, prize.amount * 100, 'Ежедневный кейс', now);
			} else q('INSERT INTO coupons (user_id, kind, created_at) VALUES (?, ?, ?)').run(u.id, prize.kind, now);
			q('INSERT INTO case_opens (user_id, source, prize, created_at) VALUES (?, ?, ?, ?)').run(u.id, source, prize.id, now);
			return [200, {prize, source}];
		}),
	{auth: true},
);

// --- задания ---
route(
	'POST',
	'tasks/open',
	({body, user}) => {
		const task = TASKS.find((x) => x.id === body.task && x.kind === 'link');
		if (!task) return [400, {error: 'server'}];
		q('INSERT INTO tasks (user_id, task, opened_at) VALUES (?, ?, ?) ON CONFLICT (user_id, task) DO UPDATE SET opened_at = COALESCE(tasks.opened_at, excluded.opened_at)').run(user.id, task.id, Date.now());
		return [200, {ok: true}];
	},
	{auth: true},
);
route(
	'POST',
	'tasks/claim',
	({body, user}) =>
		tx(() => {
			const task = TASKS.find((x) => x.id === body.task);
			if (!task) return [400, {error: 'server'}];
			const state = taskStates(user)[task.id].state;
			if (state === 'claimed') return [409, {error: 'not_done'}];
			if (task.kind === 'link') {
				const row = q('SELECT opened_at FROM tasks WHERE user_id = ? AND task = ?').get(user.id, task.id);
				if (!row?.opened_at || Date.now() - row.opened_at < LINK_TASK_DELAY) return [400, {error: 'not_done'}];
			} else if (state !== 'ready') return [400, {error: 'not_done'}];
			q('INSERT INTO tasks (user_id, task, claimed_at) VALUES (?, ?, ?) ON CONFLICT (user_id, task) DO UPDATE SET claimed_at = excluded.claimed_at').run(user.id, task.id, Date.now());
			q('UPDATE users SET bonus_cases = bonus_cases + ? WHERE id = ?').run(task.reward, user.id);
			return [200, {ok: true}];
		}),
	{auth: true},
);

// --- +5 ₽ за все достижения, один раз ---
route(
	'POST',
	'reward/achievements',
	({user}) =>
		tx(() => {
			if (q("SELECT 1 FROM tasks WHERE user_id = ? AND task = 'achievements'").get(user.id)) return [409, {error: 'already'}];
			const now = Date.now();
			q("INSERT INTO tasks (user_id, task, claimed_at) VALUES (?, 'achievements', ?)").run(user.id, now);
			q('UPDATE users SET balance = balance + 500 WHERE id = ?').run(user.id);
			q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, 500, 'reward', 'Награда за все достижения', ?)").run(user.id, now);
			return [200, {ok: true}];
		}),
	{auth: true},
);

// --- товары и покупки ---
route('GET', 'products', () => [200, {products: q('SELECT * FROM products WHERE active = 1 ORDER BY sort, created_at DESC').all().map(productJson)}]);
route(
	'POST',
	'buy',
	({body, user}) =>
		tx(() => {
			const p = q('SELECT * FROM products WHERE id = ? AND active = 1').get(String(body.productId || ''));
			if (!p || p.price === null || p.status !== 'ready') return [404, {error: 'server'}];
			if (q('SELECT 1 FROM orders WHERE user_id = ? AND product_id = ?').get(user.id, p.id)) return [409, {error: 'owned'}];
			const now = Date.now();
			let paidWith = 'balance';
			let price = p.price;
			const coupon = body.coupon && p.kind === 'rp' ? q("SELECT id FROM coupons WHERE user_id = ? AND kind = 'rp' AND order_id IS NULL ORDER BY id LIMIT 1").get(user.id) : null;
			if (price === 0) paidWith = 'free';
			else if (coupon) {
				paidWith = 'coupon';
				price = 0;
			} else {
				if (q('SELECT balance FROM users WHERE id = ?').get(user.id).balance < price) return [402, {error: 'balance'}];
				q('UPDATE users SET balance = balance - ? WHERE id = ?').run(price, user.id);
				q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, 'purchase', ?, ?)").run(user.id, -price, p.title, now);
			}
			const order = q('INSERT INTO orders (user_id, product_id, price, paid_with, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, p.id, price, paidWith, now);
			if (coupon) q('UPDATE coupons SET order_id = ? WHERE id = ?').run(order.lastInsertRowid, coupon.id);
			return [200, {ok: true}];
		}),
	{auth: true},
);
// Пополнение баланса подключится вместе с платёжной системой
route('POST', 'topup', () => [501, {error: 'payments_soon'}], {auth: true});

// --- скачивание: только тем, кто купил ---
const download = (req, res, user, productId) => {
	if (!user) return json(res, 401, {error: 'login'});
	const p = q('SELECT * FROM products WHERE id = ?').get(productId);
	const owned = p && q('SELECT 1 FROM orders WHERE user_id = ? AND product_id = ?').get(user.id, p.id);
	if (!owned) return json(res, 403, {error: 'not_owned'});
	if (p.file) {
		const file = resolve(FILES, p.file);
		let st;
		try {
			st = file.startsWith(FILES + sep) && statSync(file);
		} catch {
			st = null;
		}
		if (!st?.isFile()) return json(res, 404, {error: 'server'});
		res.writeHead(200, {
			'Content-Type': 'application/octet-stream',
			'Content-Length': st.size,
			'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(p.file)}`,
			'Cache-Control': 'private, no-store',
		});
		return createReadStream(file).pipe(res);
	}
	if (p.link) {
		res.writeHead(302, {Location: p.link, 'Cache-Control': 'no-store'});
		return res.end();
	}
	return json(res, 404, {error: 'server'});
};

// =====================================================================
//  HTTP
// =====================================================================
const json = (res, status, data) => {
	const body = JSON.stringify(data);
	res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store'});
	res.end(body);
};
const readBody = (req) =>
	new Promise((ok, fail) => {
		let size = 0;
		const chunks = [];
		req.on('data', (c) => {
			size += c.length;
			if (size > 600_000) {
				fail(new Error('too big'));
				req.destroy();
			} else chunks.push(c);
		});
		req.on('end', () => {
			try {
				ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
			} catch {
				fail(new Error('bad json'));
			}
		});
		req.on('error', fail);
	});

// Файлы сайта: отдаём только папки сайта, никогда — server/ и базу
const PUBLIC = ['index.html', 'css/', 'js/', 'img/', 'fonts/', 'vendor/'];
const MIME = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};
const serveStatic = (req, res, pathname) => {
	let rel;
	try {
		rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
	} catch {
		return json(res, 400, {error: 'bad path'});
	}
	const file = resolve(ROOT, rel);
	const allowed = PUBLIC.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
	let st = null;
	if (allowed && !rel.includes('\0') && file.startsWith(ROOT + sep)) {
		try {
			st = statSync(file);
		} catch {
			st = null;
		}
	}
	if (!st?.isFile()) {
		res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
		return res.end('Не найдено');
	}
	res.writeHead(200, {
		'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
		'Content-Length': st.size,
		'Cache-Control': rel === 'index.html' ? 'no-cache' : 'public, max-age=3600',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
	});
	if (req.method === 'HEAD') return res.end();
	createReadStream(file).pipe(res);
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
	if (!url.pathname.startsWith('/api/')) {
		if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error: 'method'});
		return serveStatic(req, res, url.pathname);
	}
	const path = url.pathname.slice(5);
	try {
		const user = sessionUser(req);
		if (req.method === 'GET' && path.startsWith('download/')) return download(req, res, user, decodeURIComponent(path.slice(9)));
		const r = routes.get(`${req.method} ${path}`);
		if (!r) return json(res, 404, {error: 'not_found'});
		let body = {};
		if (req.method === 'POST') {
			// защита от подделки запросов с чужих сайтов: только JSON и только со своего адреса
			if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, {error: 'json'});
			const origin = req.headers.origin;
			if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, {error: 'origin'});
			body = await readBody(req);
		}
		if (r.auth && !user) return json(res, 401, {error: 'login'});
		const [status, data] = await r.handler({req, res, body, user, ip});
		// после изменений сразу отдаём свежие данные пользователя
		if (status < 400 && user && r.auth && !('user' in data)) data.user = userJson(user.id);
		return json(res, status, data);
	} catch (err) {
		console.error(err);
		if (!res.headersSent) json(res, 500, {error: 'server'});
	}
});

server.listen(PORT, HOST, () => {
	console.log(`1DEX1 SHOP: http://localhost:${PORT}`);
	if (!mailConfigured) console.log('Почта не настроена: коды подтверждения пишутся сюда и в server/data/outbox.log');
});
