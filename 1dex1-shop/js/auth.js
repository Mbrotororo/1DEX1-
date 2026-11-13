// Аккаунты, баланс, кейсы, задания и покупки.
//
// Два режима работы — остальной сайт пользуется одними и теми же функциями:
//  • С СЕРВЕРОМ (папка server/, запуск: npm start). Всё хранится в SQL-базе на сервере,
//    при регистрации на почту приходит код — без него аккаунт не заработает. Награду
//    из кейса и выполнение заданий проверяет сервер.
//  • БЕЗ СЕРВЕРА (просто открытые файлы сайта, например на GitHub Pages). Аккаунты
//    живут в браузере посетителя (localStorage), почта не проверяется.
// Режим определяется сам: если по адресу api/health отвечает сервер магазина — с сервером.

import {CASE, PRODUCTS, PROMOS, TASKS} from './data.js';

export let serverMode = false;
let cached = null; // текущий пользователь (или null), чтобы current() отвечал мгновенно

const listeners = new Set();
export const onAuth = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(cached));
export const current = () => cached;

// =====================================================================
//  С СЕРВЕРОМ
// =====================================================================
const api = async (path, body) => {
	try {
		const res = await fetch(`api/${path}`, body === undefined ? {credentials: 'same-origin'} : {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
		let data = null;
		try {
			data = await res.json();
		} catch {
			// не JSON — ошибка сервера
		}
		if (!res.ok || !data) return {error: data?.error || 'server', ...data};
		if ('user' in data) {
			cached = data.user;
			emit();
		}
		return data;
	} catch {
		return {error: 'network'};
	}
};

// =====================================================================
//  БЕЗ СЕРВЕРА (localStorage)
// =====================================================================
const USERS = 'dex.users';
const SESSION = 'dex.session';
const read = (key, fallback) => {
	try {
		return JSON.parse(localStorage.getItem(key)) ?? fallback;
	} catch {
		return fallback;
	}
};
const write = (key, value) => {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
};
// Пароль не хранится в открытом виде: только хэш с «солью»
const hashPassword = async (password, salt) => {
	const text = `${salt}:${password}`;
	if (window.crypto?.subtle) {
		const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
		return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	return `x${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
};
const makeSalt = () => {
	const bytes = new Uint8Array(12);
	crypto.getRandomValues(bytes);
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const money = (v) => Math.round(v * 100) / 100;
const localProducts = () => PRODUCTS.map((p) => ({...p, price: typeof p.price === 'number' ? p.price : null}));

// задания: в каком состоянии у этого пользователя
const taskStates = (u) => {
	const out = {};
	const paid = (u.orders || []).filter((o) => o.price > 0).length;
	for (const task of TASKS) {
		const rec = u.tasks?.[task.id] || {};
		let state = 'todo';
		const progress = task.kind === 'topup' ? money(u.topups || 0) : undefined;
		if (rec.claimed) state = 'claimed';
		else if (task.kind === 'link') state = rec.opened ? 'opened' : 'todo';
		else if (task.kind === 'purchase') state = paid > 0 ? 'ready' : 'todo';
		else if (task.kind === 'topup') state = progress >= task.amount ? 'ready' : 'todo';
		out[task.id] = {state, progress};
	}
	return out;
};
// номер игрока по порядку регистрации (у старых аккаунтов — по дате создания)
const numOf = (u, users) => u.num || Object.values(users).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).indexOf(u) + 1;
const publicUser = (u, users = read(USERS, {})) =>
	u && {
		id: numOf(u, users),
		nick: u.nick,
		email: u.email,
		avatar: u.avatar,
		verified: true,
		balance: u.balance || 0,
		bonusCases: u.bonusCases || 0,
		caseAt: u.caseAt || 0,
		createdAt: u.createdAt,
		history: u.history || [],
		coupons: (u.coupons || []).filter((c) => !c.used),
		orders: u.orders || [],
		tasks: taskStates(u),
	};
const localSession = () => {
	const key = read(SESSION, null);
	const users = read(USERS, {});
	return {key, users, user: key ? users[key] : null};
};
const localSave = (users) => {
	if (!write(USERS, users)) return false;
	cached = publicUser(localSession().user) || null;
	emit();
	return true;
};

// =====================================================================
//  ОБЩИЕ ФУНКЦИИ
// =====================================================================

// Запуск: узнать режим и загрузить вошедшего пользователя
export const init = async () => {
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 2500);
		const res = await fetch('api/health', {cache: 'no-store', signal: ctrl.signal});
		clearTimeout(timer);
		const data = res.ok ? await res.json() : null;
		serverMode = data?.app === '1dex1-shop';
	} catch {
		serverMode = false;
	}
	if (serverMode) {
		const data = await api('me');
		cached = data.user || null;
	} else cached = publicUser(localSession().user) || null;
	emit();
};

// Регистрация. С сервером ответ {verify: true, login, email} — дальше нужен код из письма.
export const register = async ({nick, email, password}, lang) => {
	nick = String(nick || '').trim();
	email = String(email || '').trim().toLowerCase();
	password = String(password || '');
	if (!NICK_RE.test(nick)) return {error: 'nick', field: 'nick'};
	if (!EMAIL_RE.test(email)) return {error: 'email', field: 'email'};
	if (password.length < 6) return {error: 'password', field: 'password'};
	if (serverMode) return api('register', {nick, email, password, lang});

	const users = read(USERS, {});
	const key = nick.toLowerCase();
	if (users[key]) return {error: 'nick_taken', field: 'nick'};
	if (Object.values(users).some((u) => u.email === email)) return {error: 'email_taken', field: 'email'};
	const salt = makeSalt();
	const num = Object.values(users).reduce((max, u) => Math.max(max, numOf(u, users)), 0) + 1;
	users[key] = {num, nick, email, salt, hash: await hashPassword(password, salt), avatar: null, balance: 0, createdAt: new Date().toISOString()};
	if (!write(USERS, users) || !write(SESSION, key)) return {error: 'save'};
	localSave(users);
	return {user: cached};
};

// Свободен ли ник: {free: true | false} или {error}. Подсказка при вводе; саму занятость
// ещё раз проверяет регистрация (большие и маленькие буквы не различаются: Nick = nick).
export const nickFree = async (nick) => {
	nick = String(nick || '').trim();
	if (!NICK_RE.test(nick)) return {error: 'nick'};
	if (serverMode) return api('nick', {nick});
	return {free: !read(USERS, {})[nick.toLowerCase()]};
};

// Код из письма: заканчивает регистрацию или вход (только с сервером)
export const verifyEmail = ({login, code}) => api('verify', {login, code: String(code || '').replace(/\D/g, '')});
export const resendCode = ({login}, lang) => api('resend', {login, lang});

// Вход: ник и пароль. С сервером ответ {verify: true, login, email} — на почту ушёл код
export const login = async ({login: name, password}, lang) => {
	name = String(name || '').trim().toLowerCase();
	password = String(password || '');
	if (serverMode) return api('login', {login: name, password, lang});
	const users = read(USERS, {});
	const key = users[name] ? name : Object.keys(users).find((k) => users[k].email === name);
	const user = key && users[key];
	if (!user || user.hash !== (await hashPassword(password, user.salt))) return {error: 'bad_login'};
	write(SESSION, key);
	cached = publicUser(user);
	emit();
	return {user: cached};
};

export const logout = async () => {
	if (serverMode) await api('logout', {});
	else {
		try {
			localStorage.removeItem(SESSION);
		} catch {
			// нечего удалять
		}
	}
	cached = null;
	emit();
};

export const changePassword = async ({oldPassword, newPassword}) => {
	newPassword = String(newPassword || '');
	if (newPassword.length < 6) return {error: 'new_password', field: 'new'};
	if (newPassword === oldPassword) return {error: 'same_password', field: 'new'};
	if (serverMode) {
		const res = await api('password', {oldPassword, newPassword});
		return res.error === 'old_password' ? {...res, field: 'old'} : res;
	}
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	if (user.hash !== (await hashPassword(String(oldPassword || ''), user.salt))) return {error: 'old_password', field: 'old'};
	user.salt = makeSalt();
	user.hash = await hashPassword(newPassword, user.salt);
	return write(USERS, users) ? {ok: true} : {error: 'save'};
};

// Сменить аватарку
export const update = async ({avatar}) => {
	if (serverMode) return api('avatar', {avatar});
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	user.avatar = avatar;
	return localSave(users) ? {ok: true} : {error: 'save'};
};

// Открыть кейс: сначала ежедневный, если он ещё не готов — бесплатный за задания
export const openCase = async () => {
	if (serverMode) return api('case/open', {});
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	const now = Date.now();
	const wait = CASE.cooldownHours * 3600e3;
	if (!user.caseAt || now - user.caseAt >= wait) user.caseAt = now;
	else if (user.bonusCases > 0) user.bonusCases--;
	else return {error: 'wait', next: user.caseAt + wait};
	let roll = Math.random() * CASE.loot.reduce((sum, l) => sum + l.chance, 0);
	const prize = CASE.loot.find((l) => (roll -= l.chance) < 0) || CASE.loot[0];
	const id = `case-${now}`;
	const at = new Date(now).toISOString();
	if (prize.kind === 'money') {
		user.history ||= [];
		user.balance = money((user.balance || 0) + prize.amount);
		user.history.unshift({id, amount: prize.amount, kind: 'case', at});
	} else {
		user.coupons ||= [];
		user.coupons.unshift({id, kind: prize.kind, at});
	}
	if (!localSave(users)) return {error: 'save'};
	return {prize, user: cached};
};

// Задание «подписаться»: посетитель открыл ссылку — запоминаем, потом можно забрать кейс
export const openTask = async (id) => {
	if (serverMode) return api('tasks/open', {task: id});
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	user.tasks ||= {};
	user.tasks[id] = {...user.tasks[id], opened: user.tasks[id]?.opened || Date.now()};
	return localSave(users) ? {user: cached} : {error: 'save'};
};

// Забрать награду за задание: +1 бесплатный кейс
export const claimTask = async (id) => {
	if (serverMode) return api('tasks/claim', {task: id});
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	const task = TASKS.find((x) => x.id === id);
	const state = taskStates(user)[id]?.state;
	if (!task || state === 'claimed') return {error: 'not_done'};
	if (task.kind === 'link' ? state !== 'opened' : state !== 'ready') return {error: 'not_done'};
	user.tasks ||= {};
	user.tasks[id] = {...user.tasks[id], claimed: Date.now()};
	user.bonusCases = (user.bonusCases || 0) + task.reward;
	return localSave(users) ? {user: cached} : {error: 'save'};
};

// +5 ₽ за все достижения — один раз на аккаунт
export const claimAchievements = async () => {
	if (serverMode) return api('reward/achievements', {});
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	user.history ||= [];
	if (user.history.some((h) => h.id === 'all-achievements')) return {error: 'already'};
	user.balance = money((user.balance || 0) + 5);
	user.history.unshift({id: 'all-achievements', amount: 5, kind: 'reward', at: new Date().toISOString()});
	return localSave(users) ? {ok: true, user: cached} : {error: 'save'};
};

// Товары: с сервером — из базы, без сервера — из data.js
export const loadProducts = async () => {
	if (!serverMode) return localProducts();
	const data = await api('products');
	return data.products || [];
};

// Оплата картой или по СБП. С сервером — ссылка на страницу платёжного сервиса ({url}),
// пока он не подключён — ошибка card_soon (без сервера оплаты картой нет вовсе).
export const pay = async (productId, method, promoCode) => (serverMode ? api('pay', {productId, method, promo: promoCode}) : {error: 'card_soon'});

// Промокод: ответ {code, percent} или ошибка promo_bad. Коды в data.js хранятся отпечатком
// (sha-256 от «1dex1-promo:КОД»), сервер проверяет так же — и сам считает скидку при покупке.
const promoCodeOf = (code) => String(code || '').trim().toUpperCase();
const findPromo = async (code) => {
	const c = promoCodeOf(code);
	if (!c || !window.crypto?.subtle) return null;
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`1dex1-promo:${c}`));
	const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
	const p = PROMOS.find((x) => x.hash === hash);
	return p ? {code: c, percent: p.percent} : null;
};
export const promo = async (code, productId) => {
	if (!promoCodeOf(code)) return {error: 'promo_empty'};
	if (serverMode) return api('promo', {code, productId});
	return (await findPromo(code)) || {error: 'promo_bad'};
};
// Цена со скидкой, до копеек (так же считает сервер)
export const discounted = (price, percent) => Math.round(price * (100 - percent)) / 100;

// Купить товар: за баланс, по купону (ресурс-пак) или бесплатно
export const buy = async (productId, {coupon = false, promo: promoCode = ''} = {}) => {
	if (serverMode) return api('buy', {productId, coupon, promo: promoCode});
	const promoHit = promoCode ? await findPromo(promoCode) : null;
	if (promoCode && !promoHit) return {error: 'promo_bad'};
	const {users, user} = localSession();
	if (!user) return {error: 'login'};
	const p = localProducts().find((x) => x.id === productId);
	if (!p || p.price === null) return {error: 'server'};
	user.orders ||= [];
	if (user.orders.some((o) => o.productId === productId)) return {error: 'owned'};
	const at = new Date().toISOString();
	let price = p.price;
	const free = (user.coupons || []).find((c) => !c.used && c.kind === 'rp');
	if (coupon && p.kind === 'rp' && free) {
		free.used = productId;
		price = 0;
	} else if (price > 0) {
		if (promoHit) price = discounted(price, promoHit.percent);
		if ((user.balance || 0) < price) return {error: 'balance'};
		user.balance = money(user.balance - price);
		user.history ||= [];
		user.history.unshift({id: `buy-${Date.now()}`, amount: -price, kind: 'purchase', title: p.title, at});
	}
	user.orders.unshift({id: `o-${Date.now()}`, productId, title: p.title, titleEn: p.titleEn, price: p.price && price, link: p.link, at});
	return localSave(users) ? {user: cached} : {error: 'save'};
};

// Ссылка на скачивание купленного товара
export const downloadUrl = (order) => (serverMode ? `api/download/${encodeURIComponent(order.productId)}` : order.link || null);

// Картинка из галереи -> квадрат 256x256 (обрезка по центру), чтобы занимала мало места
export const fileToAvatar = (file) =>
	new Promise((resolve, reject) => {
		if (!file || !file.type.startsWith('image/')) return reject(new Error('avatar'));
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('avatarRead'));
		reader.onload = () => {
			const img = new Image();
			img.onerror = () => reject(new Error('avatarFormat'));
			img.onload = () => {
				const size = 256;
				const side = Math.min(img.width, img.height);
				const canvas = document.createElement('canvas');
				canvas.width = canvas.height = size;
				canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
				resolve(canvas.toDataURL('image/jpeg', 0.86));
			};
			img.src = reader.result;
		};
		reader.readAsDataURL(file);
	});
