// Достижения в стиле Minecraft. Хранятся в браузере посетителя (localStorage),
// сервер для них не нужен.
import {icon} from './pixel.js';

const KEY = 'dex.achievements';

export const ACHIEVEMENTS = [
	{id: 'miner', icon: 'pick', title: 'Шахтёр', desc: 'Сломай блок в логотипе'},
	{id: 'wrecker', icon: 'boom', title: 'Разрушитель', desc: 'Сломай 25 блоков'},
	{id: 'want', icon: 'heart', title: 'Хочу!', desc: 'Отметь товар кнопкой «Хочу»'},
	{id: 'ip', icon: 'server', title: 'Свой на сервере', desc: 'Скопируй IP сервера'},
	{id: 'idea', icon: 'bulb', title: 'Изобретатель', desc: 'Собери идею для мода'},
	{id: 'video', icon: 'play', title: 'Зритель', desc: 'Открой любой ролик'},
	{id: 'tg', icon: 'plane', title: 'Подписчик', desc: 'Загляни в Telegram-канал'},
	{id: 'bedrock', icon: 'bedrock', title: 'До бедрока', desc: 'Долистай сайт до самого низа'},
	{id: 'secret', icon: 'eye', title: 'Любопытный', desc: 'Найди секрет в консоли браузера', hidden: true},
];

const load = () => {
	try {
		return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
	} catch {
		return new Set();
	}
};
const save = (set) => {
	try {
		localStorage.setItem(KEY, JSON.stringify([...set]));
	} catch {
		// приватный режим: достижения живут до закрытия вкладки
	}
};

let unlocked = load();
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const count = () => unlocked.size;
export const has = (id) => unlocked.has(id);

const toastHost = () => document.getElementById('toasts');

const showToast = (a) => {
	const el = document.createElement('div');
	el.className = 'toast';
	el.setAttribute('role', 'status');
	el.innerHTML = `<span class="toast__icon">${icon(a.icon)}</span><span class="toast__text"><b class="px">Достижение получено!</b><span>${a.title}</span></span>`;
	toastHost().append(el);
	setTimeout(() => el.classList.add('out'), 4200);
	setTimeout(() => el.remove(), 4700);
};

export const unlock = (id) => {
	if (unlocked.has(id)) return false;
	const a = ACHIEVEMENTS.find((x) => x.id === id);
	if (!a) return false;
	unlocked.add(id);
	save(unlocked);
	showToast(a);
	listeners.forEach((fn) => fn());
	return true;
};

// Обычное короткое сообщение (например «IP скопирован»)
export const notify = (text) => {
	const el = document.createElement('div');
	el.className = 'toast toast--plain';
	el.setAttribute('role', 'status');
	el.textContent = text;
	toastHost().append(el);
	setTimeout(() => el.classList.add('out'), 2200);
	setTimeout(() => el.remove(), 2700);
};

export const reset = () => {
	unlocked = new Set();
	save(unlocked);
	listeners.forEach((fn) => fn());
};

// Список для окна «Достижения»
export const renderList = (host) => {
	host.innerHTML = ACHIEVEMENTS.map((a) => {
		const open = unlocked.has(a.id);
		const secret = a.hidden && !open;
		return `<li class="ach ${open ? 'is-open' : ''}">
			<span class="ach__icon">${icon(open ? a.icon : 'lock')}</span>
			<span class="ach__text"><b>${secret ? '???' : a.title}</b><span>${secret ? 'Секретное достижение' : a.desc}</span></span>
			<span class="ach__state px">${open ? 'получено' : 'закрыто'}</span>
		</li>`;
	}).join('');
};
