// Аккаунты: регистрация, вход, выход, аватарка и баланс.
//
// ВАЖНО: у сайта пока нет сервера, поэтому аккаунты хранятся в браузере
// посетителя (localStorage). Аккаунт, созданный на одном устройстве, не виден
// на другом. Когда появится сервер, менять нужно только этот файл: остальной
// сайт пользуется функциями register / login / logout / current / update.

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

// Пароль не хранится в открытом виде: сохраняется только его хэш с «солью»
const hashPassword = async (password, salt) => {
	const text = `${salt}:${password}`;
	if (window.crypto?.subtle) {
		const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
		return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	// запасной вариант для старых браузеров
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
	(window.crypto || {getRandomValues: (a) => a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256)))}).getRandomValues(bytes);
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const listeners = new Set();
export const onAuth = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(current()));

const publicUser = (u) =>
	u && {nick: u.nick, email: u.email, avatar: u.avatar, balance: u.balance || 0, history: u.history || [], coupons: u.coupons || [], caseAt: u.caseAt || 0, createdAt: u.createdAt};

export const current = () => {
	const key = read(SESSION, null);
	return key ? publicUser(read(USERS, {})[key]) || null : null;
};

export const register = async ({nick, email, password}) => {
	nick = String(nick || '').trim();
	email = String(email || '').trim().toLowerCase();
	password = String(password || '');
	if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return {error: 'Ник: от 3 до 16 символов — латиница, цифры и «_»', field: 'nick'};
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return {error: 'Проверь почту: в ней ошибка', field: 'email'};
	if (password.length < 6) return {error: 'Пароль: минимум 6 символов', field: 'password'};

	const users = read(USERS, {});
	const key = nick.toLowerCase();
	if (users[key]) return {error: 'Такой ник уже занят', field: 'nick'};
	if (Object.values(users).some((u) => u.email === email)) return {error: 'Эта почта уже зарегистрирована', field: 'email'};

	const salt = makeSalt();
	users[key] = {nick, email, salt, hash: await hashPassword(password, salt), avatar: null, balance: 0, createdAt: new Date().toISOString()};
	if (!write(USERS, users)) return {error: 'Браузер не дал сохранить аккаунт. Выключи приватный режим и попробуй ещё раз.'};
	write(SESSION, key);
	emit();
	return {user: current()};
};

export const login = async ({login: name, password}) => {
	name = String(name || '').trim().toLowerCase();
	const users = read(USERS, {});
	const key = users[name] ? name : Object.keys(users).find((k) => users[k].email === name);
	const user = key && users[key];
	if (!user || user.hash !== (await hashPassword(String(password || ''), user.salt))) {
		return {error: 'Неверный ник или пароль'};
	}
	write(SESSION, key);
	emit();
	return {user: current()};
};

export const logout = () => {
	try {
		localStorage.removeItem(SESSION);
	} catch {
		// нечего удалять
	}
	emit();
};

// Смена пароля: нужен старый пароль
export const changePassword = async ({oldPassword, newPassword}) => {
	const key = read(SESSION, null);
	const users = read(USERS, {});
	const user = key && users[key];
	if (!user) return {error: 'Сначала войди в аккаунт'};
	if (user.hash !== (await hashPassword(String(oldPassword || ''), user.salt))) return {error: 'Старый пароль не подходит', field: 'old'};
	newPassword = String(newPassword || '');
	if (newPassword.length < 6) return {error: 'Новый пароль: минимум 6 символов', field: 'new'};
	if (newPassword === oldPassword) return {error: 'Новый пароль совпадает со старым', field: 'new'};
	user.salt = makeSalt();
	user.hash = await hashPassword(newPassword, user.salt);
	if (!write(USERS, users)) return {error: 'Браузер не дал сохранить пароль'};
	return {ok: true};
};

// Зачислить деньги на баланс. id защищает от повторного начисления одной и той же награды.
export const credit = ({id, amount, title}) => {
	const key = read(SESSION, null);
	const users = read(USERS, {});
	const user = key && users[key];
	if (!user) return false;
	user.history ||= [];
	if (user.history.some((h) => h.id === id)) return false;
	user.balance = Math.round(((user.balance || 0) + amount) * 100) / 100;
	user.history.unshift({id, amount, title, at: new Date().toISOString()});
	const ok = write(USERS, users);
	if (ok) emit();
	return ok;
};

// Ежедневный кейс: открыть можно раз в cooldownHours часов. Награда выпадает по шансам
// из loot: деньги сразу идут на баланс, ресурс-пак — купоном в профиль.
// Когда появится сервер, награду должен выбирать он, а не браузер.
export const openCase = ({loot, cooldownHours, title}) => {
	const key = read(SESSION, null);
	const users = read(USERS, {});
	const user = key && users[key];
	if (!user) return {error: 'login'};
	const now = Date.now();
	const wait = cooldownHours * 3600e3;
	if (user.caseAt && now - user.caseAt < wait) return {error: 'wait', next: user.caseAt + wait};
	let roll = Math.random() * loot.reduce((sum, l) => sum + l.chance, 0);
	const prize = loot.find((l) => (roll -= l.chance) < 0) || loot[0];
	const id = `case-${now}`;
	const at = new Date(now).toISOString();
	user.caseAt = now;
	if (prize.kind === 'money') {
		user.history ||= [];
		user.balance = Math.round(((user.balance || 0) + prize.amount) * 100) / 100;
		user.history.unshift({id, amount: prize.amount, title, kind: 'case', at});
	} else {
		user.coupons ||= [];
		user.coupons.unshift({id, kind: prize.kind, title: prize.title, at});
	}
	if (!write(USERS, users)) return {error: 'save'};
	emit();
	return {prize, next: now + wait};
};

// Изменить свой профиль (сейчас — только аватарку)
export const update = (patch) => {
	const key = read(SESSION, null);
	const users = read(USERS, {});
	if (!key || !users[key]) return false;
	if ('avatar' in patch) users[key].avatar = patch.avatar;
	const ok = write(USERS, users);
	if (ok) emit();
	return ok;
};

// Картинка из галереи -> квадрат 256x256 (обрезка по центру), чтобы занимала мало места
export const fileToAvatar = (file) =>
	new Promise((resolve, reject) => {
		if (!file || !file.type.startsWith('image/')) return reject(new Error('Выбери картинку'));
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('Не получилось прочитать файл'));
		reader.onload = () => {
			const img = new Image();
			img.onerror = () => reject(new Error('Этот формат картинки не подходит'));
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
