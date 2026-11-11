// Достижения: 8 обычных и 2 секретных. Хранятся в браузере посетителя
// (localStorage), сервер для них не нужен.
import {icon} from './pixel.js';

const KEY = 'dex.achievements.v2';

export const ACHIEVEMENTS = [
	{id: 'kirka', icon: 'pick', title: 'Кирка в деле', desc: 'Сломай блок в названии магазина'},
	{id: 'mason', icon: 'boom', title: 'Каменотёс', desc: 'Сломай 30 блоков на сайте'},
	{id: 'telekinesis', icon: 'cube', title: 'Телекинез', desc: 'Сними персонажа с острова'},
	{id: 'showcase', icon: 'chest', title: 'Витрина', desc: 'Загляни в разделы «Моды» и «РП»'},
	{id: 'newcomer', icon: 'home', title: 'Новосёл', desc: 'Зарегистрируйся в магазине'},
	{id: 'face', icon: 'face', title: 'Своё лицо', desc: 'Поставь аватарку в профиле'},
	{id: 'contact', icon: 'plane', title: 'На связи', desc: 'Открой YouTube или Telegram'},
	{id: 'digger', icon: 'shovel', title: 'Землекоп', desc: 'Сломай блок в самом низу сайта'},
	{id: 'treasure', icon: 'gem', title: 'Алмазы!', desc: 'Добудь алмаз и получи алмазную кирку', hidden: true},
	{id: 'tickle', icon: 'feather', title: 'Щекотка', desc: 'Пять раз ткни в скин', hidden: true},
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
	el.innerHTML = `<span class="toast__icon">${icon(a.icon)}</span><span class="toast__text"><b class="px">${a.hidden ? 'Секретное достижение!' : 'Достижение получено!'}</b><span>${a.title}</span></span>`;
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

// Обычное короткое сообщение (например «Аватарка обновлена»)
export const notify = (text) => {
	const el = document.createElement('div');
	el.className = 'toast toast--plain';
	el.setAttribute('role', 'status');
	el.textContent = text;
	toastHost().append(el);
	setTimeout(() => el.classList.add('out'), 2400);
	setTimeout(() => el.remove(), 2900);
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
