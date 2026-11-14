// Новогодний стиль сайта: снегопад, гирлянды, северное сияние за островом, отсчёт до
// Нового года (в полночь — салют и «С Новым годом!»), снег из кейса-подарка.
// Снег, сугробы и снеговики — в js/snowyard.js.
// Включается в js/data.js: SEASON = 'newyear'. Выключил — этот файл ничего не делает.
import {fireworks} from './fireworks.js';
import {onLang, t} from './i18n.js';
import {fireworkSound} from './sound.js';
import {initSnowYard} from './snowyard.js';

const BULBS = ['#ff4d5e', '#ffc83d', '#b8ff3d', '#4de1ff', '#c3a6ff'];
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- гирлянда: провод и мигающие лампочки ----------
const garland = (host, mod) => {
	if (!host) return;
	const el = document.createElement('div');
	el.className = `ny-garland ${mod}`;
	el.setAttribute('aria-hidden', 'true');
	host.append(el);
	let count = -1;
	const fill = () => {
		const n = Math.ceil(el.clientWidth / 60);
		if (n === count) return;
		count = n;
		el.innerHTML = Array.from({length: n}, (_, i) => `<i style="left:${i * 60 + 27}px;--c:${BULBS[i % BULBS.length]};--d:${((i * 0.37) % 1.6).toFixed(2)}s"></i>`).join('');
	};
	fill();
	new ResizeObserver(fill).observe(el);
};

// ---------- северное сияние за островом ----------
const aurora = () => {
	const sky = document.getElementById('hero-sky');
	if (!sky) return;
	const a = document.createElement('div');
	a.className = 'ny-aurora';
	a.setAttribute('aria-hidden', 'true');
	a.innerHTML = '<i></i><i></i><i></i>';
	sky.after(a);
};

// ---------- «С Новым годом!» в полночь ----------
const banner = () => {
	const el = document.createElement('div');
	el.className = 'ny-banner';
	el.setAttribute('role', 'status');
	el.innerHTML = `<span>${t('ny.happy')}</span><small>${new Date().getFullYear()}</small>`;
	document.body.append(el);
	setTimeout(() => el.remove(), 6600);
};

// ---------- снег из открытого кейса-подарка ----------
export const snowBurst = (host, reducedMotion = false) => {
	if (!host || reducedMotion) return;
	const box = document.createElement('div');
	box.className = 'ny-burst';
	box.setAttribute('aria-hidden', 'true');
	box.innerHTML = Array.from({length: 28}, () => {
		const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
		const d = rnd(50, 150);
		return `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px;--s:${Math.random() < 0.3 ? 6 : 4}px;--d:${rnd(0, 0.15).toFixed(2)}s"></i>`;
	}).join('');
	host.append(box);
	setTimeout(() => box.remove(), 1800);
};

export const initNewYear = ({reducedMotion = false, hero = () => null, celebrate = () => {}, debug = false} = {}) => {
	document.documentElement.classList.add('ny');
	garland(document.querySelector('.topbar'), 'ny-garland--top');
	garland(document.querySelector('.hotbar'), 'ny-garland--bar');
	aurora();

	// ---------- отсчёт до Нового года (по часам посетителя) ----------
	const content = document.querySelector('.hero__content');
	const count = document.createElement('div');
	count.className = 'ny-count';
	count.setAttribute('role', 'timer');
	count.innerHTML = '<span class="ny-count__t px"></span><b class="ny-count__v"></b>';
	content?.insertBefore(count, content.querySelector('.hero__cta'));
	const title = count.querySelector('.ny-count__t');
	const value = count.querySelector('.ny-count__v');
	let target = new Date(new Date().getFullYear() + 1, 0, 1);
	const two = (v) => String(v).padStart(2, '0');
	const show = (shots) => {
		banner();
		fireworks({shots, reducedMotion, onLaunch: () => fireworkSound('launch'), onPop: () => fireworkSound('pop')});
		if (!reducedMotion) setTimeout(() => fireworks({shots: Math.round(shots * 0.6), reducedMotion, onLaunch: () => fireworkSound('launch'), onPop: () => fireworkSound('pop')}), 3200);
		celebrate();
	};
	const paint = () => {
		const now = new Date();
		if (now.getMonth() === 0) {
			// январь: вместо отсчёта — поздравление
			count.classList.add('is-happy');
			title.textContent = t('ny.happy');
			value.textContent = String(now.getFullYear());
			return;
		}
		const ms = target - now;
		if (ms <= 0) {
			// полночь, сайт открыт — салют!
			show(16);
			target = new Date(now.getFullYear() + 1, 0, 1);
			return paint();
		}
		count.classList.remove('is-happy');
		const s = Math.floor(ms / 1000);
		title.textContent = t('ny.count');
		value.textContent = `${Math.floor(s / 86400)} ${t('ny.d')} ${two(Math.floor(s / 3600) % 24)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
	};
	paint();
	setInterval(paint, 1000);
	onLang(paint);
	// 1 января зашёл на сайт — салют один раз за визит
	if (new Date().getMonth() === 0 && new Date().getDate() === 1) {
		let seen = false;
		try {
			seen = sessionStorage.getItem('dex.ny') === '1';
			sessionStorage.setItem('dex.ny', '1');
		} catch {
			// приватный режим
		}
		if (!seen) setTimeout(() => show(8), 1800);
	}

	// снег оседает на карточках и кнопках; из него можно лепить снеговиков
	initSnowYard({reducedMotion, hero, debug});

	if (debug) window.__ny = {midnight: () => show(16), burst: snowBurst};
};
