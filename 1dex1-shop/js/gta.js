// В честь выхода GTA 6: полоска розыска (звёзды загораются, пока ломаешь остров), деньги из
// кейса-кейса и надпись «Миссия выполнена!». Остров, машина, лежак, Майами на фоне и знак
// «GTA 6» из блоков — в js/hero.js (флаг GTA). Включается в js/data.js: SEASON = 'gta'.
import {onLang, t} from './i18n.js';
import {icon} from './pixel.js';

const rnd = (a, b) => a + Math.random() * (b - a);
let hud = null;
let shown = 0;
let heroOn = true; // первый экран с островом виден — розыск про него, без острова звёзды прячутся

const paint = () => {
	const on = shown > 0 && heroOn;
	hud.classList.toggle('is-on', on);
	document.documentElement.classList.toggle('gta-hud', on); // всплывашки на ПК опускаются под звёзды
};

export const initGta = () => {
	document.documentElement.classList.add('gta');
	hud = document.createElement('div');
	hud.className = 'gta-wanted';
	hud.setAttribute('aria-hidden', 'true');
	document.body.append(hud);
	setWanted(0);
	onLang(() => setWanted(shown)); // «Розыск» / «Wanted» — сразу на новом языке
	const hero = document.querySelector('.hero');
	if (hero && 'IntersectionObserver' in window) {
		new IntersectionObserver(([e]) => {
			heroOn = e.isIntersecting;
			paint();
		}).observe(hero);
	}
};

// сколько звёзд розыска горит (0–5); только что загоревшаяся звезда быстро мигает
export const setWanted = (n) => {
	if (!hud) return;
	n = Math.max(0, Math.min(5, n | 0));
	const fresh = n > shown ? n - 1 : -1;
	hud.innerHTML = `<span class="gta-wanted__t px">${t('gta.wanted')}</span>${Array.from({length: 5}, (_, i) => icon('star', i < n ? (i === fresh ? 'pxi is-lit is-fresh' : 'pxi is-lit') : 'pxi')).join('')}`;
	shown = n;
	paint();
};

// из открытого кейса разлетаются купюры
export const cashBurst = (host, reducedMotion = false) => {
	if (!host || reducedMotion) return;
	const box = document.createElement('div');
	box.className = 'gta-cash';
	box.setAttribute('aria-hidden', 'true');
	box.innerHTML = Array.from({length: 18}, () => {
		const a = rnd(-Math.PI * 0.92, -Math.PI * 0.08);
		const d = rnd(60, 160);
		return `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px;--r:${rnd(-120, 120).toFixed(0)}deg;--d:${rnd(0, 0.18).toFixed(2)}s"></i>`;
	}).join('');
	host.append(box);
	setTimeout(() => box.remove(), 2000);
};

// «Миссия выполнена!» и под ней — что выпало
export const missionBanner = (sub = '') => {
	const el = document.createElement('div');
	el.className = 'gta-mission';
	el.setAttribute('role', 'status');
	el.innerHTML = `<span>${t('gta.mission')}</span>${sub ? `<small></small>` : ''}`;
	if (sub) el.querySelector('small').textContent = sub;
	document.body.append(el);
	setTimeout(() => el.remove(), 2900);
};
