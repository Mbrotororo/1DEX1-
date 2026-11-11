// Достижения: 8 обычных и 2 секретных. Хранятся в браузере посетителя
// (localStorage), сервер для них не нужен.
import {t} from './i18n.js';
import {icon} from './pixel.js';

const KEY = 'dex.achievements.v2';

// Названия и описания — в js/i18n.js (ключи a.<id>.t и a.<id>.d), на двух языках
export const ACHIEVEMENTS = [
	{id: 'kirka', icon: 'pick'},
	{id: 'mason', icon: 'boom'},
	{id: 'telekinesis', icon: 'cube'},
	{id: 'showcase', icon: 'chest'},
	{id: 'newcomer', icon: 'home'},
	{id: 'face', icon: 'face'},
	{id: 'contact', icon: 'plane'},
	{id: 'digger', icon: 'shovel'},
	{id: 'treasure', icon: 'gem', hidden: true},
	{id: 'tickle', icon: 'feather', hidden: true},
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

const unlocked = load();
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const count = () => unlocked.size;
export const has = (id) => unlocked.has(id);

const toastHost = () => document.getElementById('toasts');

const showToast = (a) => {
	const el = document.createElement('div');
	el.className = 'toast';
	el.setAttribute('role', 'status');
	el.innerHTML = `<span class="toast__icon">${icon(a.icon)}</span><span class="toast__text"><b class="px">${t(a.hidden ? 'toast.achSecret' : 'toast.ach')}</b><span>${t(`a.${a.id}.t`)}</span></span>`;
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

// Список для окна «Достижения»
export const renderList = (host) => {
	host.innerHTML = ACHIEVEMENTS.map((a) => {
		const open = unlocked.has(a.id);
		const secret = a.hidden && !open;
		return `<li class="ach ${open ? 'is-open' : ''}">
			<span class="ach__icon">${icon(open ? a.icon : 'lock')}</span>
			<span class="ach__text"><b>${secret ? '???' : t(`a.${a.id}.t`)}</b><span>${secret ? t('ach.secret') : t(`a.${a.id}.d`)}</span></span>
			<span class="ach__state px">${t(open ? 'ach.got' : 'ach.locked')}</span>
		</li>`;
	}).join('');
};
