// Снег на сайте под Новый год.
// Снежинки падают поверх сайта и оседают на карточках, кнопках и плашках — сугробы
// понемногу растут. Снег можно собрать: зажми на сугробе и веди — получится снежок; чем
// больше снега собрал, тем он больше (до предела). Отпусти — снежок упадёт на ближайшую
// карточку или кнопку ниже. Три снежка друг на друге — снеговик (5 видов: в цилиндре,
// Санта, с ведром и метлой, в ушанке, снежный голем с тыквой). Снежок или голову снеговика
// можно снова взять. Снег с надписи «1DEX1 SHOP» и с острова не собрать — это 3D-сцены.
// Снеговики запоминаются (в браузере) и стоят на своих местах, пока не наступит весна.
import {notify} from './achievements.js';
import {t} from './i18n.js';

const PX = 2; // ширина столбика сугроба, px
const SEL = '.card, .mcard, .btn, .ny-count, .label';
const SKIP = 'dialog, .topbar, .hotbar, .adm';
const KEY = 'dex.snowmen';
const HINT_KEY = 'dex.snowhint';
const TYPES = ['classic', 'santa', 'bucket', 'ushanka', 'golem'];
const MAX_STACKS = 16;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const load = () => {
	try {
		return JSON.parse(localStorage.getItem(KEY) || '[]');
	} catch {
		return [];
	}
};

export const initSnowYard = ({reducedMotion = false, hero = () => null, debug = false} = {}) => {
	const cv = document.createElement('canvas');
	cv.className = 'ny-snow';
	cv.setAttribute('aria-hidden', 'true');
	document.body.append(cv);
	const g = cv.getContext('2d');
	let W = 0;
	let H = 0;
	let dpr = 1;
	const maxR = () => (W < 700 ? 16 : 20); // самый большой снежок — не слишком огромный

	// ---------- снежинки ----------
	const big = document.createElement('canvas');
	big.width = big.height = 7;
	const bg = big.getContext('2d');
	bg.fillStyle = '#f4faff';
	for (const [x, y] of [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [1, 1], [5, 1], [1, 5], [5, 5]]) bg.fillRect(x, y, 1, 1);
	const flakes = [];
	const flake = (anywhere) => {
		const r = Math.random();
		const s = r < 0.55 ? 1 : r < 0.87 ? 2 : 3;
		return {x: rnd(0, W), y: anywhere ? rnd(0, H) : rnd(-30, -8), s, vy: 20 + s * 14 + rnd(0, 18), ph: rnd(0, 6.3), sw: rnd(0.6, 1.8), amp: rnd(6, 22), a: rnd(0.5, 1)};
	};
	const resize = () => {
		W = document.documentElement.clientWidth;
		H = innerHeight;
		dpr = Math.min(2, devicePixelRatio || 1);
		cv.width = Math.round(W * dpr);
		cv.height = Math.round(H * dpr);
		const n = reducedMotion ? 0 : Math.round(Math.min(170, Math.max(40, (W * H) / 9000)));
		while (flakes.length < n) flakes.push(flake(true));
		flakes.length = n;
	};
	resize();
	addEventListener('resize', resize);

	// ---------- сугробы на карточках, кнопках и плашках ----------
	const drifts = new WeakMap();
	let surfaces = []; // {el, key, d, r}
	const keyOf = (el) => {
		if (el.id) return `#${el.id}`;
		if (el.classList.contains('ny-count')) return 'count';
		if (el.classList.contains('btn--hero')) return 'cta';
		if (el.dataset.product) return `m:${el.dataset.product}`;
		if (el.dataset.id) return `i:${el.dataset.id}`;
		if (el.classList.contains('case')) return 'case';
		if (el.classList.contains('tasks')) return 'tasks';
		if (el.classList.contains('social')) return `social:${[...document.querySelectorAll('.social')].indexOf(el)}`;
		return null; // такие места не запоминаются между заходами
	};
	const limit = (d, i) => d.cap * Math.min(1, (Math.min(i, d.cols - 1 - i) + 1) / 5); // к краям сугроб ниже
	const makeDrift = (el, w) => {
		const small = el.matches('.btn, .label');
		const cols = Math.max(4, Math.ceil(w / PX));
		const d = {cols, w, cap: small ? clamp(w * 0.06, 5, 10) : clamp(w * 0.05, 8, 18), h: new Float32Array(cols), drip: new Uint8Array(cols)};
		for (let i = 0; i < cols; i++) {
			d.h[i] = Math.max(0, Math.min(limit(d, i), d.cap * 0.35 + rnd(-1, 1)));
			if (Math.random() < 0.16) d.drip[i] = 1 + Math.floor(Math.random() * 4);
		}
		return d;
	};
	// ширина изменилась — переносим снег на новое число столбиков
	const fit = (d, w) => {
		const cols = Math.max(4, Math.ceil(w / PX));
		if (cols === d.cols) return d;
		const h = new Float32Array(cols);
		const drip = new Uint8Array(cols);
		for (let i = 0; i < cols; i++) {
			const j = Math.min(d.cols - 1, Math.floor((i / cols) * d.cols));
			h[i] = d.h[j];
			drip[i] = d.drip[j];
		}
		Object.assign(d, {cols, w, h, drip});
		return d;
	};
	const refresh = () => {
		const next = [];
		for (const el of document.querySelectorAll(SEL)) {
			if (el.closest(SKIP)) continue;
			const r = el.getBoundingClientRect();
			if (r.width < 24 || r.height < 8) continue; // скрыто (другой экран на телефоне)
			let d = drifts.get(el);
			if (!d) drifts.set(el, (d = makeDrift(el, r.width)));
			else fit(d, r.width);
			next.push({el, key: keyOf(el), d, r});
		}
		surfaces = next;
		attachPending();
	};
	const add = (d, i, a) => {
		for (const [k, part] of [[i, 0.6], [i - 1, 0.2], [i + 1, 0.2]]) if (k >= 0 && k < d.cols) d.h[k] = Math.min(limit(d, k), d.h[k] + a * part);
	};
	// осыпается: острые пики расползаются в стороны
	const relax = (d) => {
		for (let i = 1; i < d.cols - 1; i++) {
			const avg = (d.h[i - 1] + d.h[i + 1]) / 2;
			const diff = d.h[i] - avg;
			if (Math.abs(diff) > 1.2) d.h[i] -= diff * 0.18;
		}
	};
	const take = (d, x0, x1, amount) => {
		let got = 0;
		for (let i = Math.max(0, Math.floor(x0 / PX)); i <= Math.min(d.cols - 1, Math.floor(x1 / PX)); i++) {
			const a = Math.min(d.h[i], amount);
			d.h[i] -= a;
			got += a * PX;
		}
		return got;
	};

	// ---------- снежки и снеговики ----------
	let stacks = []; // {el, key, fx, balls: [радиусы снизу вверх], type, born}
	const falling = []; // летят вниз: {x, y — в координатах страницы, r, vy}
	let held = null; // в руке: {x, y, vol, r}
	const sparks = [];
	let pending = load(); // сохранённые снеговики ждут, когда появятся их карточки
	let lastType = -1;
	let made = false;
	const save = () => {
		try {
			localStorage.setItem(KEY, JSON.stringify(stacks.filter((s) => s.key).map((s) => ({k: s.key, fx: +s.fx.toFixed(3), b: s.balls.map((r) => +r.toFixed(1)), t: s.type}))));
		} catch {
			// приватный режим: снеговики живут до закрытия вкладки
		}
	};
	function attachPending() {
		if (!pending.length) return;
		pending = pending.filter((p) => {
			const s = surfaces.find((x) => x.key === p.k);
			if (!s) return true;
			stacks.push({el: s.el, key: p.k, fx: p.fx, balls: p.b, type: p.t || null, born: -9});
			return false;
		});
	}
	const surfaceOf = (el) => surfaces.find((s) => s.el === el);
	// центры шаров стопки на экране (снизу вверх)
	const ballsOf = (st, s) => {
		const out = [];
		let y = s.r.top;
		const x = s.r.left + st.fx * s.r.width;
		st.balls.forEach((r, i) => {
			y = i === 0 ? s.r.top - r * 0.9 : y - st.balls[i - 1] * 0.8 - r * 0.8;
			out.push({x, y, r});
		});
		return out;
	};
	const trim = () => {
		while (stacks.length > MAX_STACKS) {
			const i = stacks.findIndex((s) => !s.type);
			stacks.splice(i >= 0 ? i : 0, 1);
		}
	};
	const finish = (st) => {
		st.balls.sort((a, b) => b - a); // самый большой — внизу
		let k = Math.floor(Math.random() * TYPES.length);
		if (k === lastType) k = (k + 1 + Math.floor(Math.random() * (TYPES.length - 1))) % TYPES.length;
		lastType = k;
		st.type = TYPES[k];
		st.born = performance.now() / 1000;
		const s = surfaceOf(st.el);
		if (s) for (const b of ballsOf(st, s)) for (let i = 0; i < 8; i++) sparks.push({x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r), vx: rnd(-40, 40), vy: rnd(-70, -10), life: rnd(0.5, 0.9)});
		if (!made) {
			made = true;
			notify(t('ny.snowman'));
		}
		save();
	};
	const crumbs = (x, y, n = 10) => {
		for (let i = 0; i < n; i++) sparks.push({x, y, vx: rnd(-60, 60), vy: rnd(-90, -10), life: rnd(0.3, 0.6), snow: true});
	};

	// ---------- что под курсором ----------
	const hitDrift = (x, y) => {
		for (const s of surfaces) {
			const {r, d} = s;
			if (x < r.left || x >= r.right) continue;
			const i = Math.floor((x - r.left) / PX);
			if (d.h[i] >= 1.5 && y >= r.top - d.h[i] - 5 && y <= r.top + 2) return s;
		}
		return null;
	};
	const hitStack = (x, y) => {
		for (let k = stacks.length - 1; k >= 0; k--) {
			const s = surfaceOf(stacks[k].el);
			if (!s) continue;
			const bs = ballsOf(stacks[k], s);
			const top = bs[bs.length - 1];
			if (Math.hypot(x - top.x, y - top.y) < top.r + 6) return {k, top};
		}
		return null;
	};

	// ---------- руками: взять снег, отпустить снежок ----------
	let ptr = {x: 0, y: 0};
	let suppressClick = false;
	let scooped = false;
	const volOf = (r) => Math.PI * r * r;
	const grab = (x, y) => {
		if (hero()?.occupiedAt?.(x, y)) return false; // тут персонаж — клик ему
		const st = hitStack(x, y);
		if (st) {
			// берём верхний шар: у снеговика пропадают шапка и лицо
			const stack = stacks[st.k];
			const r = stack.balls.pop();
			stack.type = null;
			if (!stack.balls.length) stacks.splice(st.k, 1);
			held = {x, y, vol: volOf(r), r};
			save();
			return true;
		}
		const s = hitDrift(x, y);
		if (!s) return false;
		const got = take(s.d, x - s.r.left - 5, x - s.r.left + 5, 3);
		held = {x, y, vol: Math.max(volOf(4), got * 4), r: 4};
		crumbs(x, y, 6);
		scooped = true;
		try {
			localStorage.setItem(HINT_KEY, '1');
		} catch {
			// неважно
		}
		return true;
	};
	const release = () => {
		if (!held) return;
		if (held.r < 4.5) crumbs(held.x, held.y, 8); // слишком мало снега — рассыпался
		else falling.push({x: held.x, y: held.y + scrollY, r: held.r, vy: 0});
		held = null;
		document.body.classList.remove('ny-grabbing');
		setTimeout(() => (suppressClick = false), 350);
	};
	document.addEventListener(
		'pointerdown',
		(e) => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			if (!grab(e.clientX, e.clientY)) return;
			ptr = {x: e.clientX, y: e.clientY};
			suppressClick = true;
			document.body.classList.add('ny-grabbing');
			e.preventDefault();
			e.stopPropagation();
		},
		{capture: true},
	);
	addEventListener('pointermove', (e) => {
		ptr = {x: e.clientX, y: e.clientY};
		if (!held && e.pointerType === 'mouse') document.body.classList.toggle('ny-grab', Boolean(hitStack(e.clientX, e.clientY) || hitDrift(e.clientX, e.clientY)));
	});
	addEventListener('pointerup', release);
	addEventListener('pointercancel', release);
	document.addEventListener(
		'click',
		(e) => {
			if (!suppressClick) return;
			suppressClick = false;
			e.preventDefault();
			e.stopPropagation();
		},
		{capture: true},
	);
	// на телефоне: палец на сугробе или снежке не листает страницу
	document.addEventListener(
		'touchstart',
		(e) => {
			const p = e.touches[0];
			if (p && !hero()?.occupiedAt?.(p.clientX, p.clientY) && (hitStack(p.clientX, p.clientY) || hitDrift(p.clientX, p.clientY))) e.preventDefault();
		},
		{passive: false, capture: true},
	);
	document.addEventListener('touchmove', (e) => held && e.cancelable && e.preventDefault(), {passive: false});

	// подсказка один раз: как лепить снеговика
	let hinted = false;
	try {
		hinted = localStorage.getItem(HINT_KEY) === '1';
	} catch {
		// неважно
	}
	if (!hinted && !pending.length)
		setTimeout(() => {
			if (scooped) return;
			notify(t('ny.snowHint'));
			try {
				localStorage.setItem(HINT_KEY, '1');
			} catch {
				// неважно
			}
		}, 25000);

	// ---------- рисование ----------
	const C = {snow: '#eef6ff', top: '#ffffff', shade: '#bcd8f2', coal: '#1b1720', carrot: '#ff8a2e', stick: '#6e4b26'};
	const rect = (x, y, w, h, c) => {
		g.fillStyle = c;
		g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
	};
	const drawDrift = (s) => {
		const {r, d} = s;
		const top = Math.round(r.top);
		const right = Math.round(r.right);
		let i = 0;
		while (i < d.cols) {
			const hi = Math.round(d.h[i]);
			let j = i + 1;
			while (j < d.cols && Math.round(d.h[j]) === hi) j++;
			if (hi >= 1) {
				const x = Math.round(r.left + i * PX);
				const w = Math.min(Math.round(r.left + j * PX), right) - x;
				if (w > 0) {
					rect(x, top - hi, w, hi + 2, C.snow); // лежит на краю и прикрывает рамку
					rect(x, top - hi, w, Math.min(2, hi), C.top);
					rect(x, top + 2, w, 1, C.shade);
				}
			}
			i = j;
		}
		// сосульки
		for (let k = 0; k < d.cols; k++) {
			if (!d.drip[k] || d.h[k] < 3) continue;
			const x = Math.round(r.left + k * PX);
			rect(x, top + 2, PX, d.drip[k], C.snow);
			rect(x, top + 2 + d.drip[k], PX, 1, C.shade);
		}
	};
	const ball = (x, y, r) => {
		const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
		gr.addColorStop(0, '#ffffff');
		gr.addColorStop(0.6, '#eef5ff');
		gr.addColorStop(1, '#c4d8ef');
		g.fillStyle = gr;
		g.beginPath();
		g.arc(x, y, r, 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = 'rgba(140,175,215,.55)';
		g.lineWidth = 1;
		g.stroke();
	};
	const line = (x0, y0, x1, y1, w, c) => {
		g.strokeStyle = c;
		g.lineWidth = w;
		g.lineCap = 'round';
		g.beginPath();
		g.moveTo(x0, y0);
		g.lineTo(x1, y1);
		g.stroke();
	};
	const poly = (pts, c) => {
		g.fillStyle = c;
		g.beginPath();
		pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
		g.closePath();
		g.fill();
	};
	const scarf = (hx, hy, R, c, stripe) => {
		rect(hx - R * 0.95, hy + R * 0.72, R * 1.9, R * 0.32, c);
		rect(hx + R * 0.3, hy + R * 0.95, R * 0.32, R * 0.85, c);
		rect(hx + R * 0.3, hy + R * 1.3, R * 0.32, R * 0.1, stripe);
		rect(hx - R * 0.95, hy + R * 0.83, R * 1.9, R * 0.08, stripe);
	};
	const drawSnowman = (st, bs) => {
		const [b, m, h] = bs;
		const R = h.r;
		const M = m.r;
		const golem = st.type === 'golem';
		// руки-ветки
		const aw = Math.max(1.5, M * 0.12);
		for (const s of [-1, 1]) {
			const x0 = m.x + s * M * 0.85;
			const y0 = m.y - M * 0.15;
			const x1 = m.x + s * M * 1.9;
			const y1 = m.y - M * 0.85;
			line(x0, y0, x1, y1, aw, C.stick);
			line(x0 + (x1 - x0) * 0.65, y0 + (y1 - y0) * 0.65, x0 + (x1 - x0) * 0.65 + s * M * 0.15, y0 + (y1 - y0) * 0.65 - M * 0.35, aw * 0.8, C.stick);
			if (st.type === 'ushanka') {
				g.fillStyle = '#d42a3a';
				g.beginPath();
				g.arc(x1, y1, Math.max(2, M * 0.2), 0, Math.PI * 2);
				g.fill();
			}
		}
		if (st.type === 'bucket') {
			// метла в правой руке
			line(m.x + M * 1.95, m.y - M * 1.9, m.x + M * 1.55, b.y + b.r * 0.7, aw, C.stick);
			poly([[m.x + M * 1.95, m.y - M * 1.75], [m.x + M * 1.6, m.y - M * 2.7], [m.x + M * 2.45, m.y - M * 2.6]], '#e8c26a');
		}
		ball(b.x, b.y, b.r);
		ball(m.x, m.y, M);
		if (!golem) ball(h.x, h.y, R);
		// пуговицы
		const bt = Math.max(2, M * 0.16);
		for (const y of [m.y - M * 0.35, m.y + M * 0.15, b.y - b.r * 0.45]) rect(m.x - bt / 2, y - bt / 2, bt, bt, C.coal);
		if (golem) {
			// голова — вырезанная тыква, как у снежного голема
			const S = R * 1.9;
			rect(h.x - S / 2, h.y - S / 2, S, S, '#e2892b');
			for (const k of [-0.25, 0.25]) rect(h.x + k * S - S * 0.04, h.y - S / 2, S * 0.08, S, '#c96f1a');
			rect(h.x - S * 0.06, h.y - S / 2 - S * 0.14, S * 0.12, S * 0.16, '#4c8a2e');
			for (const k of [-1, 1]) rect(h.x + k * S * 0.22 - S * 0.09, h.y - S * 0.2, S * 0.18, S * 0.16, '#3a1d06');
			rect(h.x - S * 0.3, h.y + S * 0.12, S * 0.6, S * 0.12, '#3a1d06');
			rect(h.x - S * 0.18, h.y + S * 0.24, S * 0.36, S * 0.08, '#3a1d06');
		} else {
			// лицо: глаза-угольки, морковка, улыбка
			const e = Math.max(2, R * 0.17);
			for (const s of [-1, 1]) rect(h.x + s * R * 0.33 - e / 2, h.y - R * 0.2 - e / 2, e, e, C.coal);
			poly([[h.x - R * 0.04, h.y - R * 0.04], [h.x + R * 0.72, h.y + R * 0.08], [h.x - R * 0.04, h.y + R * 0.18]], C.carrot);
			const md = Math.max(1.5, R * 0.1);
			for (let i = 0; i < 5; i++) {
				const k = i / 4 - 0.5;
				rect(h.x + k * R * 0.75 - md / 2, h.y + R * 0.38 + k * k * R * 0.5 - md / 2 - R * 0.12, md, md, C.coal);
			}
		}
		// шапки и шарфы
		if (st.type === 'classic') {
			rect(h.x - R * 0.85, h.y - R * 0.98, R * 1.7, R * 0.22, '#1b1720');
			rect(h.x - R * 0.55, h.y - R * 1.8, R * 1.1, R * 0.86, '#1b1720');
			rect(h.x - R * 0.56, h.y - R * 1.1, R * 1.12, R * 0.16, '#d42a3a');
			scarf(h.x, h.y, R, '#d42a3a', '#f4f8ff');
		} else if (st.type === 'santa') {
			poly([[h.x - R * 0.85, h.y - R * 0.62], [h.x + R * 0.85, h.y - R * 0.62], [h.x + R * 0.55, h.y - R * 1.3], [h.x + R * 1.15, h.y - R * 1.75], [h.x - R * 0.2, h.y - R * 1.55]], '#d42a3a');
			rect(h.x - R * 0.95, h.y - R * 0.78, R * 1.9, R * 0.3, '#f4f8ff');
			g.fillStyle = '#f4f8ff';
			g.beginPath();
			g.arc(h.x + R * 1.15, h.y - R * 1.75, R * 0.22, 0, Math.PI * 2);
			g.fill();
			scarf(h.x, h.y, R, '#2f9e44', '#f4f8ff');
		} else if (st.type === 'bucket') {
			poly([[h.x - R * 0.78, h.y - R * 0.55], [h.x + R * 0.78, h.y - R * 0.68], [h.x + R * 0.52, h.y - R * 1.55], [h.x - R * 0.45, h.y - R * 1.45]], '#8aa0b8');
			poly([[h.x - R * 0.8, h.y - R * 0.5], [h.x + R * 0.8, h.y - R * 0.63], [h.x + R * 0.79, h.y - R * 0.76], [h.x - R * 0.79, h.y - R * 0.63]], '#5d7189');
		} else if (st.type === 'ushanka') {
			rect(h.x - R * 0.85, h.y - R * 1.2, R * 1.7, R * 0.7, '#6b4a2f');
			for (const s of [-1, 1]) rect(h.x + s * R * 0.82 - R * 0.17, h.y - R * 0.65, R * 0.34, R * 0.8, '#6b4a2f');
			rect(h.x - R * 0.9, h.y - R * 0.66, R * 1.8, R * 0.22, '#8c6a48');
			rect(h.x - R * 0.08, h.y - R * 1.02, R * 0.16, R * 0.16, '#d42a3a');
			scarf(h.x, h.y, R, '#3d7fd6', '#f4f8ff');
		} else if (golem) scarf(h.x, h.y + R * 0.1, R, '#9a6bff', '#f4f8ff');
	};
	const drawStack = (st, s, nowSec) => {
		let bs = ballsOf(st, s);
		const k = st.type ? clamp((nowSec - st.born) / 0.45, 0, 1) : 1;
		if (k < 1) {
			// только что собрался — «подпрыгивает»
			const sc = 1 + Math.sin(k * Math.PI) * 0.12;
			const base = s.r.top;
			bs = bs.map((b) => ({x: b.x, y: base + (b.y - base) * sc, r: b.r * sc}));
		}
		// тень на карточке
		g.fillStyle = 'rgba(0,0,0,.22)';
		g.beginPath();
		g.ellipse(bs[0].x, s.r.top + 1, bs[0].r * 0.85, Math.max(2, bs[0].r * 0.18), 0, 0, Math.PI * 2);
		g.fill();
		if (st.type && bs.length === 3) drawSnowman(st, bs);
		else for (const b of bs) ball(b.x, b.y, b.r);
	};

	// ---------- кадр ----------
	let last = performance.now();
	let lastScroll = scrollY;
	let refreshAt = 0;
	let growAt = 0;
	const frame = (ms) => {
		requestAnimationFrame(frame);
		const dt = Math.min(0.05, (ms - last) / 1000);
		last = ms;
		const nowSec = ms / 1000;
		if (ms > refreshAt) {
			refreshAt = ms + 700;
			refresh();
		} else for (const s of surfaces) s.r = s.el.getBoundingClientRect();
		const ds = scrollY - lastScroll;
		lastScroll = scrollY;
		// сугробы понемногу растут сами и осыпаются
		if (ms > growAt) {
			growAt = ms + 250;
			for (const s of surfaces) {
				for (let n = Math.ceil(s.d.cols / 24); n > 0; n--) add(s.d, Math.floor(Math.random() * s.d.cols), 0.3);
				relax(s.d);
			}
		}
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		const seen = surfaces.filter((s) => s.r.bottom > -40 && s.r.top - 40 < H);
		for (const s of seen) drawDrift(s);
		// снеговики и снежки на карточках
		for (let k = stacks.length - 1; k >= 0; k--) {
			const st = stacks[k];
			if (!st.el.isConnected) {
				// карточку перерисовали — ищем такую же по ключу, иначе снеговик пропал
				const s = st.key && surfaces.find((x) => x.key === st.key);
				if (s) st.el = s.el;
				else if (!st.key) stacks.splice(k, 1);
				continue;
			}
			const s = surfaceOf(st.el);
			if (s && s.r.bottom > -60 && s.r.top - 140 < H) drawStack(st, s, nowSec);
		}
		// снежок в руке: собирает снег с сугробов, над которыми проходит
		if (held) {
			held.x = ptr.x;
			held.y = ptr.y;
			if (held.r < maxR()) {
				for (const s of seen) {
					const {r, d} = s;
					if (held.x < r.left || held.x > r.right || held.y + held.r < r.top - d.cap - 4 || held.y - held.r > r.top + 4) continue;
					const got = take(d, held.x - r.left - held.r * 0.7, held.x - r.left + held.r * 0.7, dt * 26);
					if (got > 0) {
						held.vol += got * 3.2;
						if (Math.random() < 0.3) crumbs(held.x, held.y + held.r, 1);
					}
				}
			}
			held.r = Math.min(maxR(), Math.sqrt(held.vol / Math.PI));
			ball(held.x, held.y, held.r);
		}
		// летят вниз и ложатся на карточку, кнопку или другой снежок
		for (let i = falling.length - 1; i >= 0; i--) {
			const f = falling[i];
			const prev = f.y - scrollY + f.r;
			f.vy += 1800 * dt;
			f.y += f.vy * dt;
			const vy = f.y - scrollY;
			const bottom = vy + f.r;
			let landed = false;
			// на стопку снежков
			for (const st of stacks) {
				const s = surfaceOf(st.el);
				if (!s) continue;
				const bs = ballsOf(st, s);
				const top = bs[bs.length - 1];
				if (Math.abs(f.x - top.x) > Math.max(top.r, f.r) * 0.9) continue;
				const rest = top.y - top.r * 0.8;
				if (bottom >= rest && vy <= top.y + 2) {
					if (st.balls.length >= 3) {
						f.x += (f.x < top.x ? -1 : 1) * (f.r + top.r); // на снеговика не ложится — скатывается вбок
						break;
					}
					st.balls.push(f.r);
					if (st.balls.length === 3) finish(st);
					else save();
					landed = true;
					break;
				}
			}
			if (!landed) {
				for (const s of surfaces) {
					const {r} = s;
					if (f.x < r.left + 4 || f.x > r.right - 4) continue;
					if (prev <= r.top + 3 && bottom >= r.top) {
						stacks.push({el: s.el, key: s.key, fx: (f.x - r.left) / r.width, balls: [f.r], type: null, born: -9});
						trim();
						save();
						crumbs(f.x, r.top, 5);
						landed = true;
						break;
					}
				}
			}
			if (landed || vy > H + 300) falling.splice(i, 1);
			else ball(f.x, vy, f.r);
		}
		// искорки и снежная крошка
		for (let i = sparks.length - 1; i >= 0; i--) {
			const p = sparks[i];
			p.life -= dt;
			if (p.life <= 0) {
				sparks.splice(i, 1);
				continue;
			}
			p.vy += (p.snow ? 400 : 60) * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			g.globalAlpha = Math.min(1, p.life * 2);
			if (p.snow) rect(p.x, p.y, 2, 2, '#f4faff');
			else {
				rect(p.x - 2, p.y, 5, 1, '#fff6c8');
				rect(p.x, p.y - 2, 1, 5, '#fff6c8');
			}
		}
		g.globalAlpha = 1;
		// снежинки: падают, а коснувшись сугроба — остаются в нём
		for (let i = 0; i < flakes.length; i++) {
			const f = flakes[i];
			f.y += f.vy * dt - ds * (0.12 + f.s * 0.08);
			f.ph += f.sw * dt;
			const x = f.x + Math.sin(f.ph) * f.amp;
			if (f.y > H + 12 || f.y < -40) {
				flakes[i] = flake(f.y < -40);
				if (f.y < -40) flakes[i].y = H + 5;
				continue;
			}
			let fell = false;
			for (const s of seen) {
				const {r, d} = s;
				if (x < r.left || x >= r.right || f.y < r.top - d.cap - 2 || f.y > r.top + 3) continue;
				const col = Math.floor((x - r.left) / PX);
				if (f.y >= r.top - d.h[col] - 1) {
					add(d, col, f.s * 0.5 + 0.3);
					fell = true;
					break;
				}
			}
			if (fell) {
				flakes[i] = flake(false);
				continue;
			}
			g.globalAlpha = f.a;
			if (f.s === 3) g.drawImage(big, Math.round(x) - 3, Math.round(f.y) - 3);
			else rect(x, f.y, f.s + 1, f.s + 1, '#f4faff');
		}
		g.globalAlpha = 1;
	};
	requestAnimationFrame(frame);

	if (debug)
		window.__snow = {
			// засыпать всё снегом до предела
			fill: () => surfaces.forEach((s) => s.d.h.forEach((_, i) => (s.d.h[i] = limit(s.d, i)))),
			// слепить снеговика на месте с ключом key (например 'count' или 'i:new-year-mod')
			make: (key, sizes = [18, 13, 10], fx = 0.5, type = null) => {
				const s = surfaces.find((x) => x.key === key);
				if (!s) return false;
				const st = {el: s.el, key, fx, balls: [...sizes], type: null, born: -9};
				stacks.push(st);
				finish(st);
				if (type) st.type = type;
				save();
				return st.type;
			},
			clear: () => {
				stacks = [];
				save();
			},
			state: () => ({surfaces: surfaces.length, stacks: stacks.map((s) => ({key: s.key, balls: s.balls.map((r) => Math.round(r)), type: s.type})), held: held ? Math.round(held.r) : null, falling: falling.length}),
			depth: (key) => {
				const s = surfaces.find((x) => x.key === key);
				return s ? Math.round(s.d.h.reduce((a, b) => a + b, 0) / s.d.cols * 10) / 10 : null;
			},
			drop: (x, y, r) => falling.push({x, y: y + scrollY, r, vy: 0}),
		};
};
