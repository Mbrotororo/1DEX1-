// Сервер 1DEX1 SHOP: отдаёт сайт и обслуживает аккаунты, баланс, кейсы, задания и покупки.
// Запуск: npm start (из папки 1dex1-shop). Нужен Node.js 22.13 или новее, больше ничего.
// Настройки — переменные окружения или файл server/.env (пример — server/.env.example).
import {createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual} from 'node:crypto';
import {createReadStream, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {brotliCompressSync, constants as ZLIB, gzipSync} from 'node:zlib';
import {CASE, CASHBACK, PROMOS, TASKS} from '../js/data.js';
import {q, saleOver, tx} from './db.js';
import {mailConfigured, sendCode} from './mail.js';
import {tellOwner} from './telegram.js';

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
const NICK_GAP = 30 * DAY; // ник можно менять раз в 30 дней
const MSK = 3 * 3600e3;
const dayStart = (t) => Math.floor((t + MSK) / DAY) * DAY - MSK; // начало суток по Москве
const money = (kop) => (kop / 100).toFixed(2).replace('.', ',').replace(',00', '');
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

// почта для показа: r***x@gmail.com
const maskEmail = (email) => {
	const [name, domain] = String(email).split('@');
	return `${name[0]}***${name.length > 2 ? name.at(-1) : ''}@${domain}`;
};
// подтвердить почту и выдать номер игрока по порядку: 1, 2, 3…
const markVerified = (id) => q('UPDATE users SET verified = 1, num = COALESCE(num, (SELECT COALESCE(MAX(num), 0) + 1 FROM users)) WHERE id = ?').run(id);
// найти аккаунт по нику или почте
const userByLogin = (login) => {
	const name = String(login || '')
		.trim()
		.toLowerCase();
	return name ? q('SELECT * FROM users WHERE nick = ? OR email = ?').get(name, name) : null;
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
		id: u.num, // номер игрока по порядку регистрации
		nick: u.nick,
		email: u.email,
		avatar: u.avatar,
		verified: Boolean(u.verified),
		balance: rub(u.balance),
		bonusCases: u.bonus_cases,
		caseAt: u.case_at || 0,
		createdAt: iso(u.created_at),
		admin: u.role === 'admin' || undefined,
		nickNextAt: u.nick_changed_at ? u.nick_changed_at + NICK_GAP : 0, // раньше этого времени ник не сменить
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
	until: p.sale_until || undefined,
	downloadable: Boolean(p.link || p.file),
});

// =====================================================================
//  API: каждый обработчик возвращает [код ответа, данные]
// =====================================================================
const routes = new Map();
const route = (method, path, handler, {auth = false, admin = false, maxBody = 600_000} = {}) => routes.set(`${method} ${path}`, {handler, auth, admin, maxBody});
const isAdmin = (user) => user?.role === 'admin';

route('GET', 'health', () => [200, {ok: true, app: '1dex1-shop', mail: mailConfigured}]);
route('GET', 'me', ({user}) => [200, {user: user ? userJson(user.id) : null}]);

// --- регистрация: аккаунт создаётся неподтверждённым, на почту уходит код ---
// =====================================================================
//  ЗАЩИТА ОТ БОТОВ при регистрации. Галочка «Я не робот»: браузер получает задачу и
//  перебирает числа, пока отпечаток sha-256 не начнётся с POW_BITS нулевых битов
//  (человеку — доля секунды, боту на тысячи аккаунтов — дорого). Плюс скрытое поле-ловушка:
//  люди его не видят, а боты заполняют. Плюс не больше 10 регистраций в час с одного адреса.
// =====================================================================
const POW_BITS = 15; // в среднем ~33 тысячи попыток: телефон справляется меньше чем за секунду
const POW_TTL = 10 * 60e3;
const POW_SECRET = process.env.POW_SECRET || randomBytes(32).toString('hex');
const powSig = (s) => createHmac('sha256', POW_SECRET).update(s).digest('hex').slice(0, 32);
const powUsed = new Map(); // задача -> до какого времени помнить, чтобы не решали одну дважды
const zeroBits = (buf, bits) => {
	for (let i = 0; i < bits; i++) if (buf[i >> 3] & (0x80 >> (i & 7))) return false;
	return true;
};
const powOk = (challenge, nonce) => {
	const [salt, exp, bits, sig] = String(challenge || '').split('.');
	if (!salt || !sig || !/^\d{1,12}$/.test(String(nonce ?? ''))) return false;
	const good = Buffer.from(powSig(`${salt}.${exp}.${bits}`));
	if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), good)) return false;
	if (Number(exp) < Date.now() || Number(bits) < POW_BITS || powUsed.has(salt)) return false;
	if (!zeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest(), Number(bits))) return false;
	powUsed.set(salt, Number(exp));
	return true;
};
setInterval(() => {
	for (const [salt, exp] of powUsed) if (exp < Date.now()) powUsed.delete(salt);
}, 600e3).unref();
route('GET', 'challenge', ({ip}) => {
	if (limited(`challenge:${ip}`, 60, 600e3)) return [429, {error: 'too_many'}];
	const head = `${randomBytes(12).toString('hex')}.${Date.now() + POW_TTL}.${POW_BITS}`;
	return [200, {challenge: `${head}.${powSig(head)}`, bits: POW_BITS}];
});

route('POST', 'register', async ({body, ip}) => {
	const nick = String(body.nick || '').trim();
	const email = String(body.email || '')
		.trim()
		.toLowerCase();
	const password = String(body.password || '');
	if (!NICK_RE.test(nick)) return [400, {error: 'nick', field: 'nick'}];
	if (!EMAIL_RE.test(email) || email.length > 120) return [400, {error: 'email', field: 'email'}];
	if (password.length < 6 || password.length > 200) return [400, {error: 'password', field: 'password'}];
	if (body.website) return [400, {error: 'robot'}]; // поле-ловушка заполнено — это бот
	if (limited(`reg:${ip}`, 10, 3600e3)) return [429, {error: 'too_many'}];
	if (!powOk(body.challenge, body.nonce)) return [400, {error: 'robot'}];
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
	return [200, {verify: true, login: nick, email}];
});

// --- свободен ли ник (подсказка при вводе; занятость ещё раз проверяет register) ---
route('POST', 'nick', ({body, ip}) => {
	const nick = String(body.nick || '').trim();
	if (!NICK_RE.test(nick)) return [400, {error: 'nick'}];
	if (limited(`nick:${ip}`, 120, 600e3)) return [429, {error: 'too_many'}];
	// ник в базе без учёта регистра; неподтверждённый аккаунт старше суток ник не держит
	const u = q('SELECT verified, created_at FROM users WHERE nick = ?').get(nick);
	return [200, {free: !(u && (u.verified || Date.now() - u.created_at <= DAY))}];
});

// --- смена ника: раз в 30 дней, ник свободен (без учёта регистра) ---
route(
	'POST',
	'nick/change',
	({body, user}) => {
		const nick = String(body.nick || '').trim();
		if (!NICK_RE.test(nick)) return [400, {error: 'nick'}];
		const me = q('SELECT nick, nick_changed_at FROM users WHERE id = ?').get(user.id);
		if (nick === me.nick) return [400, {error: 'nick_same'}];
		if (me.nick_changed_at && Date.now() < me.nick_changed_at + NICK_GAP) return [429, {error: 'nick_wait', next: me.nick_changed_at + NICK_GAP}];
		const other = q('SELECT id, verified, created_at FROM users WHERE nick = ? AND id != ?').get(nick, user.id);
		if (other) {
			if (!other.verified && Date.now() - other.created_at > DAY) q('DELETE FROM users WHERE id = ?').run(other.id);
			else return [409, {error: 'nick_taken'}];
		}
		q('UPDATE users SET nick = ?, nick_changed_at = ? WHERE id = ?').run(nick, Date.now(), user.id);
		return [200, {ok: true}];
	},
	{auth: true},
);

// --- новый код на почту ---
route('POST', 'resend', async ({body, ip}) => {
	const login = String(body.login || body.email || '')
		.trim()
		.toLowerCase();
	if (limited(`resend:${ip}`, 6, 15 * 60e3) || limited(`resend:${login}`, 4, 15 * 60e3)) return [429, {error: 'too_many'}];
	const user = userByLogin(login);
	// код отправляем заново, только если его уже ждут (после регистрации или пароля при входе)
	const last = user && q('SELECT sent_at FROM email_codes WHERE user_id = ?').get(user.id);
	if (!last) return [200, {ok: true}]; // не говорим, есть ли такой аккаунт
	if (Date.now() - last.sent_at < RESEND_GAP) return [429, {error: 'too_many', wait: RESEND_GAP - (Date.now() - last.sent_at)}];
	try {
		await issueCode(user, lang(body));
	} catch (err) {
		console.error('Письмо не отправлено:', err.message);
		return [502, {error: 'mail'}];
	}
	return [200, {ok: true}];
});

// --- код из письма: заканчивает регистрацию или вход ---
// Админы по почте: ADMIN_EMAILS в server/.env (через запятую). Аккаунт с такой почтой, как только
// она подтверждена кодом из письма, сам получает доступ в админку — команда в консоли не нужна.
// Код приходит только на эту почту, поэтому чужой человек так админом не станет.
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean);
const grantAdmins = () => {
	if (!ADMIN_EMAILS.length) return;
	q(`UPDATE users SET role = 'admin' WHERE verified = 1 AND role IS NOT 'admin' AND lower(email) IN (${ADMIN_EMAILS.map(() => '?').join(', ')})`).run(...ADMIN_EMAILS);
};
grantAdmins();

route('POST', 'verify', ({body, res, ip}) => {
	const code = String(body.code || '').replace(/\D/g, '');
	if (limited(`verify:${ip}`, 30, 15 * 60e3)) return [429, {error: 'too_many'}];
	const user = userByLogin(body.login || body.email);
	const row = user && q('SELECT * FROM email_codes WHERE user_id = ?').get(user.id);
	if (!row) return [400, {error: 'bad_code'}];
	if (row.expires_at < Date.now()) return [400, {error: 'code_expired'}];
	if (row.tries >= 5) return [429, {error: 'too_many'}];
	if (sha(code) !== row.code) {
		q('UPDATE email_codes SET tries = tries + 1 WHERE user_id = ?').run(user.id);
		return [400, {error: 'bad_code'}];
	}
	if (!user.verified) markVerified(user.id);
	grantAdmins();
	q('DELETE FROM email_codes WHERE user_id = ?').run(user.id);
	startSession(res, user.id);
	return [200, {user: userJson(user.id)}];
});

// --- вход: ник (или почта) и пароль, потом код из письма ---
route('POST', 'login', async ({body, ip}) => {
	if (limited(`login:${ip}`, 20, 15 * 60e3)) return [429, {error: 'too_many'}];
	const user = userByLogin(body.login);
	if (!user || !(await checkPass(body.password, user.pass))) return [401, {error: 'bad_login'}];
	// пароль верный — на почту уходит код (если свежий уже отправлен меньше минуты назад, ждём его)
	const last = q('SELECT sent_at, expires_at FROM email_codes WHERE user_id = ?').get(user.id);
	if (!last || Date.now() - last.sent_at > RESEND_GAP || last.expires_at < Date.now()) {
		try {
			await issueCode(user, lang(body));
		} catch (err) {
			console.error('Письмо не отправлено:', err.message);
			return [502, {error: 'mail'}];
		}
	}
	return [200, {verify: true, login: user.nick, email: maskEmail(user.email)}];
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
route('GET', 'products', () => [
	200,
	{
		products: q('SELECT * FROM products WHERE active = 1 ORDER BY sort, created_at DESC')
			.all()
			.filter((p) => !saleOver(p))
			.map(productJson),
	},
]);
// Промокод из data.js (там он хранится отпечатком): {code, percent} или null
const promoOf = (code) => {
	const c = String(code || '').trim().toUpperCase();
	if (!c) return null;
	const row = q('SELECT * FROM promos WHERE code = ?').get(c);
	if (row) {
		// код из админки главнее: можно выключить, ограничить сроком и числом применений
		if (!row.active) return null;
		if (row.until && Date.now() > Date.parse(`${row.until}T23:59:59.999+03:00`)) return null;
		if (row.max_uses && q('SELECT COUNT(*) AS n FROM orders WHERE promo = ?').get(c).n >= row.max_uses) return null;
		return {code: c, percent: row.percent};
	}
	const hash = sha(`1dex1-promo:${c}`);
	const p = PROMOS.find((x) => x.hash === hash);
	return p ? {code: c, percent: p.percent} : null;
};
// Сообщение владельцу в Telegram о покупке (если бот настроен — см. server/telegram.js)
const PAID_WITH = {balance: 'с баланса', coupon: 'купоном из кейса', card: 'картой', sbp: 'по СБП'};
const tellPurchase = (user, s) => {
	const today = q("SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS s FROM orders WHERE created_at >= ? AND paid_with != 'free'").get(dayStart(Date.now()));
	tellOwner(
		[
			`🛒 Покупка: ${s.title}`,
			`Игрок: ${user.nick}${user.num ? ` (ID ${user.num})` : ''}`,
			`Оплата: ${PAID_WITH[s.paidWith] || s.paidWith} — ${money(s.price)} ₽${s.promo ? ` (промокод ${s.promo.code}, −${s.promo.percent}%)` : ''}`,
			s.cashback ? `Кэшбэк игроку: +${money(s.cashback)} ₽` : '',
			`Сегодня продаж: ${today.n} на ${money(today.s)} ₽`,
		]
			.filter(Boolean)
			.join('\n'),
	);
};
route(
	'POST',
	'buy',
	({body, user}) => {
		let sold = null; // что продали — для уведомления после успешной покупки
		const result = tx(() => {
			const p = q('SELECT * FROM products WHERE id = ? AND active = 1').get(String(body.productId || ''));
			if (!p || p.price === null || p.status !== 'ready') return [404, {error: 'server'}];
			if (saleOver(p)) return [410, {error: 'ended'}];
			if (q('SELECT 1 FROM orders WHERE user_id = ? AND product_id = ?').get(user.id, p.id)) return [409, {error: 'owned'}];
			const coupon = body.coupon && p.kind === 'rp' ? q("SELECT id FROM coupons WHERE user_id = ? AND kind = 'rp' AND order_id IS NULL ORDER BY id LIMIT 1").get(user.id) : null;
			const usePromo = Boolean(body.promo) && !coupon && p.price > 0;
			const promo = usePromo ? promoOf(body.promo) : null;
			if (usePromo && !promo) return [404, {error: 'promo_bad'}];
			const now = Date.now();
			let paidWith = 'balance';
			let price = p.price;
			let cashback = 0;
			if (price === 0) paidWith = 'free';
			else if (coupon) {
				paidWith = 'coupon';
				price = 0;
			} else {
				if (promo) price = Math.round((price * (100 - promo.percent)) / 100); // копейки
				if (q('SELECT balance FROM users WHERE id = ?').get(user.id).balance < price) return [402, {error: 'balance'}];
				cashback = Math.round((price * CASHBACK) / 100);
				q('UPDATE users SET balance = balance - ? + ? WHERE id = ?').run(price, cashback, user.id);
				q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, 'purchase', ?, ?)").run(user.id, -price, p.title, now);
				if (cashback) q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, 'cashback', ?, ?)").run(user.id, cashback, p.title, now);
			}
			const order = q('INSERT INTO orders (user_id, product_id, price, paid_with, promo, cashback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, p.id, price, paidWith, promo?.code ?? null, cashback, now);
			if (coupon) q('UPDATE coupons SET order_id = ? WHERE id = ?').run(order.lastInsertRowid, coupon.id);
			if (paidWith !== 'free') sold = {title: p.title, price, paidWith, promo, cashback};
			return [200, {ok: true}];
		});
		if (sold) tellPurchase(user, sold);
		return result;
	},
	{auth: true},
);
// Пополнение баланса подключится вместе с платёжной системой
route('POST', 'topup', () => [501, {error: 'payments_soon'}], {auth: true});
// Оплата товара картой или по СБП: здесь будет создание платежа в платёжном сервисе
// (ответ {url} — страница оплаты). Пока сервис не подключён — «скоро».
route(
	'POST',
	'pay',
	({body}) => {
		const p = q('SELECT * FROM products WHERE id = ? AND active = 1').get(String(body.productId || ''));
		if (!p || p.price === null || p.status !== 'ready') return [404, {error: 'server'}];
		if (saleOver(p)) return [410, {error: 'ended'}];
		if (body.promo && !promoOf(body.promo)) return [404, {error: 'promo_bad'}];
		return [501, {error: 'card_soon'}];
	},
	{auth: true},
);
// Промокод: проверить и сказать скидку (саму скидку сервер считает при покупке)
route('POST', 'promo', ({body}) => {
	if (!String(body.code || '').trim()) return [400, {error: 'promo_empty'}];
	const promo = promoOf(body.code);
	return promo ? [200, promo] : [404, {error: 'promo_bad'}];
});

// =====================================================================
//  АДМИНКА — только для аккаунтов с ролью admin (выдаёт команда на сервере:
//  npm run admin -- user admin Ник). Продажи, товары, промокоды, игроки.
// =====================================================================
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9-]{2,40}$/;
const PROMO_RE = /^[A-Z0-9_-]{3,24}$/;
const kopIn = (v) => {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
	return Number.isFinite(n) && n >= 0 && n <= 1e6 ? Math.round(n * 100) : NaN;
};
const textIn = (v, max) => String(v ?? '').trim().slice(0, max);
const urlOk = (v) => !v || /^https:\/\/[^\s"'<>]+$/.test(v);

route(
	'GET',
	'admin/summary',
	() => {
		const now = Date.now();
		const sales = (from) => {
			const r = q("SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS s FROM orders WHERE created_at >= ? AND paid_with != 'free'").get(from);
			return {count: r.n, sum: rub(r.s)};
		};
		return [
			200,
			{
				sales: {today: sales(dayStart(now)), week: sales(dayStart(now) - 6 * DAY), month: sales(dayStart(now) - 29 * DAY), all: sales(0)},
				users: {
					all: q('SELECT COUNT(*) AS n FROM users WHERE verified = 1').get().n,
					today: q('SELECT COUNT(*) AS n FROM users WHERE verified = 1 AND created_at >= ?').get(dayStart(now)).n,
				},
				orders: q(
					'SELECT o.id, o.price, o.paid_with, o.promo, o.cashback, o.created_at, u.nick, u.num, p.title FROM orders o JOIN users u ON u.id = o.user_id JOIN products p ON p.id = o.product_id ORDER BY o.id DESC LIMIT 50',
				)
					.all()
					.map((o) => ({id: o.id, price: rub(o.price), paidWith: o.paid_with, promo: o.promo, cashback: rub(o.cashback), at: iso(o.created_at), nick: o.nick, num: o.num, title: o.title})),
			},
		];
	},
	{admin: true},
);

route(
	'GET',
	'admin/products',
	() => [
		200,
		{
			products: q(
				"SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.paid_with != 'free') AS sold, (SELECT COALESCE(SUM(o.price), 0) FROM orders o WHERE o.product_id = p.id) AS revenue FROM products p ORDER BY p.sort, p.created_at DESC",
			)
				.all()
				.map((p) => ({...productJson(p), until: p.sale_until || '', link: p.link || '', file: p.file || '', active: Boolean(p.active), sort: p.sort, sold: p.sold, revenue: rub(p.revenue)})),
		},
	],
	{admin: true},
);
route(
	'POST',
	'admin/product',
	({body}) => {
		const id = textIn(body.id, 40);
		if (!ID_RE.test(id)) return [400, {error: 'admin_id'}];
		const old = q('SELECT * FROM products WHERE id = ?').get(id);
		if (body.isNew && old) return [409, {error: 'admin_exists'}];
		const kind = body.kind === 'rp' ? 'rp' : 'mod';
		const title = textIn(body.title, 80);
		if (!title) return [400, {error: 'admin_title'}];
		const price = kopIn(body.price);
		if (Number.isNaN(price)) return [400, {error: 'admin_price'}];
		const until = textIn(body.until, 10) || null;
		if (until && !DAY_RE.test(until)) return [400, {error: 'admin_date'}];
		// картинку и ссылку форма может не прислать (картинка грузится отдельно) — тогда остаются прежние
		const link = body.link === undefined ? old?.link ?? null : textIn(body.link, 500) || null;
		const cover = body.cover === undefined ? old?.cover ?? null : textIn(body.cover, 300) || null;
		if (!urlOk(link) || (cover && !cover.startsWith('img/') && !urlOk(cover))) return [400, {error: 'admin_url'}];
		const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
			.map((t) => textIn(t, 24))
			.filter(Boolean)
			.slice(0, 8);
		q(`INSERT INTO products (id, kind, status, title, title_en, descr, descr_en, tags, price, cover, link, sale_until, active, sort, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, status = excluded.status, title = excluded.title, title_en = excluded.title_en,
				descr = excluded.descr, descr_en = excluded.descr_en, tags = excluded.tags, price = excluded.price, cover = excluded.cover,
				link = excluded.link, sale_until = excluded.sale_until, active = excluded.active, sort = excluded.sort`).run(
			id,
			kind,
			body.status === 'soon' ? 'soon' : 'ready',
			title,
			textIn(body.titleEn, 80) || null,
			textIn(body.desc, 600),
			textIn(body.descEn, 600) || null,
			JSON.stringify(tags),
			price,
			cover,
			link,
			until,
			body.active === false ? 0 : 1,
			Number.isInteger(Number(body.sort)) ? Number(body.sort) : 0,
			old?.created_at || Date.now(),
		);
		return [200, {ok: true}];
	},
	{admin: true},
);
// Загрузка из админки: файл товара (отдаётся только купившим) или картинка-обложка
const UPLOAD = {
	file: {exts: ['.jar', '.zip', '.mrpack', '.7z', '.rar'], max: 30 * 1024 * 1024},
	cover: {exts: ['.webp', '.png', '.jpg', '.jpeg', '.gif'], max: 5 * 1024 * 1024},
};
route(
	'POST',
	'admin/upload',
	({body}) => {
		const kind = UPLOAD[body.what] ? body.what : null;
		const p = q('SELECT * FROM products WHERE id = ?').get(String(body.id || ''));
		if (!kind || !p) return [400, {error: 'admin_upload'}];
		const ext = extname(String(body.name || '')).toLowerCase();
		if (!UPLOAD[kind].exts.includes(ext)) return [400, {error: 'admin_ext', exts: UPLOAD[kind].exts}];
		const data = Buffer.from(String(body.data || ''), 'base64');
		if (!data.length || data.length > UPLOAD[kind].max) return [400, {error: 'admin_size'}];
		if (kind === 'file') {
			mkdirSync(FILES, {recursive: true});
			const name = `${p.id}${ext}`;
			writeFileSync(resolve(FILES, name), data);
			if (p.file && p.file !== name) {
				try {
					unlinkSync(resolve(FILES, p.file));
				} catch {
					// старого файла уже нет
				}
			}
			q('UPDATE products SET file = ? WHERE id = ?').run(name, p.id);
			return [200, {ok: true, file: name}];
		}
		const dir = resolve(ROOT, 'img', 'products');
		mkdirSync(dir, {recursive: true});
		const name = `${p.id}-${Date.now().toString(36)}${ext}`; // новое имя — браузеры сразу покажут новую картинку
		writeFileSync(resolve(dir, name), data);
		if (p.cover?.startsWith(`img/products/${p.id}-`)) {
			try {
				unlinkSync(resolve(ROOT, p.cover));
			} catch {
				// старой картинки уже нет
			}
		}
		const cover = `img/products/${name}`;
		q('UPDATE products SET cover = ? WHERE id = ?').run(cover, p.id);
		return [200, {ok: true, cover}];
	},
	{admin: true, maxBody: 42 * 1024 * 1024},
);

route(
	'GET',
	'admin/promos',
	() => [
		200,
		{
			promos: q('SELECT * FROM promos ORDER BY created_at DESC')
				.all()
				.map((r) => ({code: r.code, percent: r.percent, maxUses: r.max_uses, until: r.until || '', active: Boolean(r.active), used: q('SELECT COUNT(*) AS n FROM orders WHERE promo = ?').get(r.code).n})),
			// как часто применяли коды (и из админки, и из js/data.js)
			usage: q('SELECT promo AS code, COUNT(*) AS n, COALESCE(SUM(price), 0) AS s FROM orders WHERE promo IS NOT NULL GROUP BY promo ORDER BY n DESC')
				.all()
				.map((r) => ({code: r.code, count: r.n, sum: rub(r.s)})),
			hidden: PROMOS.length, // сколько кодов-отпечатков в js/data.js
		},
	],
	{admin: true},
);
route(
	'POST',
	'admin/promo',
	({body}) => {
		const code = textIn(body.code, 24).toUpperCase();
		if (!PROMO_RE.test(code)) return [400, {error: 'admin_code'}];
		const percent = Number(body.percent);
		if (!Number.isInteger(percent) || percent < 1 || percent > 90) return [400, {error: 'admin_percent'}];
		const maxUses = body.maxUses === '' || body.maxUses === null || body.maxUses === undefined ? null : Number(body.maxUses);
		if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return [400, {error: 'admin_uses'}];
		const until = textIn(body.until, 10) || null;
		if (until && !DAY_RE.test(until)) return [400, {error: 'admin_date'}];
		q(`INSERT INTO promos (code, percent, max_uses, until, active, created_at) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (code) DO UPDATE SET percent = excluded.percent, max_uses = excluded.max_uses, until = excluded.until, active = excluded.active`).run(
			code,
			percent,
			maxUses,
			until,
			body.active === false ? 0 : 1,
			Date.now(),
		);
		return [200, {ok: true}];
	},
	{admin: true},
);
route(
	'POST',
	'admin/promo/delete',
	({body}) => {
		q('DELETE FROM promos WHERE code = ?').run(String(body.code || ''));
		return [200, {ok: true}];
	},
	{admin: true},
);

route(
	'GET',
	'admin/users',
	({query}) => {
		const s = textIn(query.get('q'), 60);
		const like = `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
		const rows = s
			? q("SELECT * FROM users WHERE nick LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR num = ? ORDER BY id DESC LIMIT 50").all(like, like, Number(s) || -1)
			: q('SELECT * FROM users ORDER BY id DESC LIMIT 50').all();
		return [
			200,
			{
				users: rows.map((u) => {
					const o = q("SELECT COUNT(*) AS n, COALESCE(SUM(price), 0) AS s FROM orders WHERE user_id = ? AND paid_with != 'free'").get(u.id);
					return {num: u.num, nick: u.nick, email: u.email, verified: Boolean(u.verified), admin: u.role === 'admin', balance: rub(u.balance), createdAt: iso(u.created_at), orders: o.n, spent: rub(o.s)};
				}),
			},
		];
	},
	{admin: true},
);
route(
	'POST',
	'admin/user/balance',
	({body}) =>
		tx(() => {
			const u = q('SELECT * FROM users WHERE nick = ?').get(String(body.nick || ''));
			if (!u) return [404, {error: 'admin_user'}];
			const sign = Number(body.amount) < 0 ? -1 : 1;
			const amount = kopIn(Math.abs(Number(body.amount)));
			if (!amount || Number.isNaN(amount)) return [400, {error: 'admin_price'}];
			if (sign < 0 && u.balance < amount) return [400, {error: 'balance'}];
			q('UPDATE users SET balance = balance + ? WHERE id = ?').run(sign * amount, u.id);
			q("INSERT INTO ledger (user_id, amount, kind, title, created_at) VALUES (?, ?, 'admin', ?, ?)").run(u.id, sign * amount, textIn(body.note, 80) || null, Date.now());
			return [200, {ok: true, balance: rub(u.balance + sign * amount)}];
		}),
	{admin: true},
);

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
const readBody = (req, max = 600_000) =>
	new Promise((ok, fail) => {
		let size = 0;
		const chunks = [];
		req.on('data', (c) => {
			size += c.length;
			if (size > max) {
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
	// после раскодирования «..%2f» превращается в «../» — такие пути не отдаём совсем,
	// и проверяем уже итоговый путь: он должен лежать внутри разрешённой папки сайта
	const safe = !rel.includes('\0') && !rel.includes('\\') && !rel.split('/').includes('..');
	const real = relative(ROOT, file).split(sep).join('/');
	const allowed = safe && PUBLIC.some((p) => (p.endsWith('/') ? real.startsWith(p) : real === p));
	let st = null;
	if (allowed && file.startsWith(ROOT + sep)) {
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
	const ext = extname(file).toLowerCase();
	// повторный заход: файл не менялся — браузер берёт его из своего кэша
	const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
	const headers = {
		'Content-Type': MIME[ext] || 'application/octet-stream',
		'Cache-Control': rel === 'index.html' ? 'no-cache' : 'public, max-age=3600',
		ETag: etag,
		Vary: 'Accept-Encoding',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
	};
	if (req.headers['if-none-match'] === etag) {
		res.writeHead(304, headers);
		return res.end();
	}
	// текстовые файлы (страница, стили, скрипты) сжимаются в 4–5 раз; сжатые копии держим в памяти
	const accept = String(req.headers['accept-encoding'] || '');
	const kind = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
	if (kind && COMPRESSIBLE.has(ext) && st.size > 1024) {
		let c = PACKED.get(file);
		if (!c || c.mtime !== st.mtimeMs) PACKED.set(file, (c = {mtime: st.mtimeMs}));
		c[kind] ||= kind === 'br' ? brotliCompressSync(readFileSync(file), {params: {[ZLIB.BROTLI_PARAM_QUALITY]: 9}}) : gzipSync(readFileSync(file), {level: 9});
		res.writeHead(200, {...headers, 'Content-Encoding': kind, 'Content-Length': c[kind].length});
		return res.end(req.method === 'HEAD' ? undefined : c[kind]);
	}
	res.writeHead(200, {...headers, 'Content-Length': st.size});
	if (req.method === 'HEAD') return res.end();
	createReadStream(file).pipe(res);
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);
const PACKED = new Map(); // файл -> {mtime, br, gzip}

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
		// админка: проверяем права до чтения тела запроса (там бывают большие файлы)
		if (r.admin && !isAdmin(user)) return json(res, user ? 403 : 401, {error: user ? 'forbidden' : 'login'});
		let body = {};
		if (req.method === 'POST') {
			// защита от подделки запросов с чужих сайтов: только JSON и только со своего адреса
			if (!String(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, {error: 'json'});
			const origin = req.headers.origin;
			if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, {error: 'origin'});
			body = await readBody(req, r.maxBody);
		}
		if (r.auth && !user) return json(res, 401, {error: 'login'});
		const [status, data] = await r.handler({req, res, body, user, ip, query: url.searchParams});
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
