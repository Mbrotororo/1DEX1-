// Новогодний стиль сайта: снегопад, гирлянды, северное сияние за островом, отсчёт до
// Нового года (в полночь — салют и «С Новым годом!»), снег из кейса-подарка.
// Включается в js/data.js: SEASON = 'newyear'. Выключил — этот файл ничего не делает.
import {fireworks} from './fireworks.js';
import {onLang, t} from './i18n.js';
import {fireworkSound} from './sound.js';

const BULBS = ['#ff4d5e', '#ffc83d', '#b8ff3d', '#4de1ff', '#c3a6ff'];
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- снегопад: пиксельные снежинки поверх сайта ----------
const snowfall = () => {
	const cv = document.createElement('canvas');
	cv.className = 'ny-snow';
	cv.setAttribute('aria-hidden', 'true');
	document.body.append(cv);
	const g = cv.getContext('2d');
	// большая снежинка 7×7 — заранее нарисованная
	const big = document.createElement('canvas');
	big.width = big.height = 7;
	const bg = big.getContext('2d');
	bg.fillStyle = '#f4faff';
	for (const [x, y] of [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [1, 1], [5, 1], [1, 5], [5, 5]]) bg.fillRect(x, y, 1, 1);
	let W = 0;
	let H = 0;
	let dpr = 1;
	const flakes = [];
	const make = (anywhere) => {
		const r = Math.random();
		const s = r < 0.55 ? 1 : r < 0.87 ? 2 : 3; // 3 — большая снежинка
		return {x: rnd(0, W), y: anywhere ? rnd(0, H) : rnd(-30, -8), s, vy: 20 + s * 14 + rnd(0, 18), ph: rnd(0, 6.3), sw: rnd(0.6, 1.8), amp: rnd(6, 22), a: rnd(0.5, 1)};
	};
	const resize = () => {
		W = document.documentElement.clientWidth;
		H = innerHeight;
		dpr = Math.min(2, devicePixelRatio || 1);
		cv.width = Math.round(W * dpr);
		cv.height = Math.round(H * dpr);
		const n = Math.round(Math.min(170, Math.max(40, (W * H) / 9000)));
		while (flakes.length < n) flakes.push(make(true));
		flakes.length = n;
	};
	resize();
	addEventListener('resize', resize);
	let last = performance.now();
	let lastScroll = scrollY;
	const frame = (ms) => {
		const dt = Math.min(0.05, (ms - last) / 1000);
		last = ms;
		// листаешь страницу — снег немного «отстаёт»: видно глубину
		const ds = scrollY - lastScroll;
		lastScroll = scrollY;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		for (let i = 0; i < flakes.length; i++) {
			const f = flakes[i];
			f.y += f.vy * dt - ds * (0.12 + f.s * 0.08);
			f.ph += f.sw * dt;
			if (f.y > H + 12 || f.y < -40) {
				flakes[i] = make(f.y < -40 ? true : false);
				if (f.y < -40) flakes[i].y = H + 5;
				continue;
			}
			const x = Math.round(f.x + Math.sin(f.ph) * f.amp);
			const y = Math.round(f.y);
			g.globalAlpha = f.a;
			if (f.s === 3) g.drawImage(big, x - 3, y - 3);
			else {
				g.fillStyle = '#f4faff';
				g.fillRect(x, y, f.s + 1, f.s + 1);
			}
		}
		g.globalAlpha = 1;
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
};

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

export const initNewYear = ({reducedMotion = false, celebrate = () => {}, debug = false} = {}) => {
	document.documentElement.classList.add('ny');
	if (!reducedMotion) snowfall();
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

	if (debug) window.__ny = {midnight: () => show(16), burst: snowBurst};
};
