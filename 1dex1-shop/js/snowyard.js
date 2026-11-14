// Снег на сайте под Новый год.
// Снежинки падают поверх сайта и оседают на карточках, кнопках и плашках — сугробы
// понемногу растут. На компьютере снег можно собрать: зажми на сугробе и веди — получится
// снежок; чем больше снега собрал, тем он больше (до предела). Отпусти — снежок упадёт на
// карточку или кнопку ниже, а если отпустить на ходу — полетит, как брошенный. Три снежка
// друг на друге — снеговик (5 видов: в цилиндре, Санта, с ведром и метлой, в ушанке,
// снежный голем с тыквой). Снеговики ходят по своей карточке, их можно взять и
// перетащить; попадёшь в снеговика снежком — развалится. Через 30 секунд снеговик тает,
// и на его месте остаётся горка снега. На телефоне снег только лежит — лепить нельзя.
// Снег с надписи «1DEX1 SHOP» и с острова не собрать — это 3D-сцены.
import {notify} from './achievements.js';
import {t} from './i18n.js';

const PX = 2; // ширина столбика сугроба, px
const SEL = '.card, .mcard, .btn, .ny-count, .label';
const SKIP = 'dialog, .topbar, .hotbar, .adm';
const HINT_KEY = 'dex.snowhint';
const TYPES = ['classic', 'santa', 'bucket', 'ushanka', 'golem'];
const MAX_STACKS = 16;
const LIFE = 30; // сколько секунд живёт снеговик, потом тает
const MELT = 2.4; // сколько тает
const G = 1800; // тяжесть для снежков, px/с²
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

export const initSnowYard = ({reducedMotion = false, hero = () => null, debug = false} = {}) => {
	const cv = document.createElement('canvas');
	cv.className = 'ny-snow';
	cv.setAttribute('aria-hidden', 'true');
	document.body.append(cv);
	const main = cv.getContext('2d');
	let g = main; // куда рисуем сейчас: общий холст или холст карточки
	let W = 0;
	let H = 0;
	let dpr = 1;
	const maxR = () => 20; // самый большой снежок — не слишком огромный
	// на телефоне снег только лежит: ни снежков, ни снеговиков
	const phoneMQ = matchMedia('(max-width: 899px)');
	const toys = () => !phoneMQ.matches;
	try {
		localStorage.removeItem('dex.snowmen'); // раньше снеговики запоминались — теперь они тают
	} catch {
		// неважно
	}

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
		// карточку убрали со страницы — убираем и её холст
		for (const [el, pad] of pads) {
			if (surfaces.some((x) => x.el === el)) continue;
			pad.cv.remove();
			pads.delete(el);
		}
	};
	// Сугроб и снеговики каждой карточки — на своём холсте, прикреплённом к странице прямо над
	// карточкой: при прокрутке он едет вместе с ней, без отставания. По бокам — поля для рук и
	// метлы, сверху — место для снеговика в шапке, снизу — для сосулек. Не шире экрана.
	const PAD = 56;
	const ZONE = 150;
	const LIP = 14;
	const layer = document.createElement('div');
	layer.className = 'ny-drifts';
	layer.setAttribute('aria-hidden', 'true');
	document.body.append(layer);
	const pads = new Map(); // карточка -> {cv, ctx, x, y, w, k, on, ox, oy}
	const placePad = (s) => {
		let pad = pads.get(s.el);
		if (!pad) {
			const c = document.createElement('canvas');
			layer.append(c);
			pad = {cv: c, ctx: c.getContext('2d'), x: null, y: null, w: 0, k: 0, on: true};
			pads.set(s.el, pad);
		}
		const x0 = Math.max(0, Math.floor(s.r.left - PAD));
		const w = Math.max(1, Math.min(W, Math.ceil(s.r.right + PAD)) - x0);
		const h = ZONE + LIP;
		const k = Math.min(2, devicePixelRatio || 1);
		if (pad.w !== w || pad.k !== k) {
			Object.assign(pad, {w, k});
			pad.cv.width = Math.round(w * k);
			pad.cv.height = Math.round(h * k);
			pad.cv.style.width = `${w}px`;
			pad.cv.style.height = `${h}px`;
		}
		// место на странице: меняется, только когда карточка сдвинулась (прокрутка его не трогает)
		const x = Math.round(x0 + scrollX);
		const y = Math.round(s.r.top + scrollY - ZONE);
		if (pad.x !== x || pad.y !== y) {
			pad.x = x;
			pad.y = y;
			pad.cv.style.transform = `translate(${x}px,${y}px)`;
		}
		if (!pad.on) {
			pad.cv.style.display = '';
			pad.on = true;
		}
		pad.ox = x - scrollX; // левый верхний угол холста на экране
		pad.oy = y - scrollY;
		return pad;
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
	// стопка на карточке: {el, key, fx — где на карточке (0…1), balls — радиусы снизу вверх,
	//   type — вид снеговика (null — просто снежки), born — когда собрался, dir, phase, walk, melt}
	let stacks = [];
	const flying = []; // летят: снежки {x, y — страница, r, vx, vy} и снеговики {man, x, y, vx, vy}
	const chunks = []; // куски развалившегося снеговика
	let held = null; // в руке: снежок {x, y, vol, r} или снеговик {man, dx, dy}
	const sparks = [];
	let lastType = -1;
	let made = false;
	const nowS = () => performance.now() / 1000;
	const surfaceOf = (el) => surfaces.find((s) => s.el === el);
	// центры шаров стопки (снизу вверх), если основание — в точке (x, top)
	const ballsAt = (balls, x, top) => {
		const out = [];
		let y = top;
		balls.forEach((r, i) => {
			y = i === 0 ? top - r * 0.9 : y - balls[i - 1] * 0.8 - r * 0.8;
			out.push({x, y, r});
		});
		return out;
	};
	const baseOf = (st, s) => ({x: s.r.left + st.fx * s.r.width, y: s.r.top});
	const ballsOf = (st, s) => {
		const b = baseOf(st, s);
		return ballsAt(st.balls, b.x, b.y);
	};
	const trim = () => {
		while (stacks.length > MAX_STACKS) {
			const i = stacks.findIndex((s) => !s.type);
			stacks.splice(i >= 0 ? i : 0, 1);
		}
	};
	const sparkle = (bs) => {
		for (const b of bs) for (let i = 0; i < 8; i++) sparks.push({x: b.x + rnd(-b.r, b.r), y: b.y + rnd(-b.r, b.r), vx: rnd(-40, 40), vy: rnd(-70, -10), life: rnd(0.5, 0.9)});
	};
	const finish = (st) => {
		st.balls.sort((a, b) => b - a); // самый большой — внизу
		let k = Math.floor(Math.random() * TYPES.length);
		if (k === lastType) k = (k + 1 + Math.floor(Math.random() * (TYPES.length - 1))) % TYPES.length;
		lastType = k;
		Object.assign(st, {type: TYPES[k], born: nowS(), dir: Math.random() < 0.5 ? -1 : 1, phase: 0, walk: rnd(2, 4), melt: 0});
		const s = surfaceOf(st.el);
		if (s) sparkle(ballsOf(st, s));
		if (!made) {
			made = true;
			notify(t('ny.snowman'));
		}
	};
	const crumbs = (x, y, n = 10) => {
		for (let i = 0; i < n; i++) sparks.push({x, y, vx: rnd(-60, 60), vy: rnd(-90, -10), life: rnd(0.3, 0.6), snow: true});
	};
	// горка снега: прибавляем к сугробу холмик (может быть выше обычного сугроба)
	const heap = (s, x, size) => {
		const d = s.d;
		const half = clamp(size * 1.6, 8, 34);
		const peak = clamp(size * 0.9, 5, 22);
		for (let i = Math.floor((x - half - s.r.left) / PX); i <= Math.ceil((x + half - s.r.left) / PX); i++) {
			if (i < 0 || i >= d.cols) continue;
			const k = (s.r.left + i * PX - x) / half;
			d.h[i] = Math.max(d.h[i], peak * (1 - k * k) + rnd(-0.6, 0.6));
		}
	};
	// снеговик развалился от снежка: шары разлетаются кусками, шапка отлетает, остаётся горка
	const smash = (st, s) => {
		const bs = ballsOf(st, s);
		for (const b of bs) {
			for (let i = 0; i < 4; i++) chunks.push({x: b.x + rnd(-b.r, b.r) * 0.4, y: b.y + rnd(-b.r, b.r) * 0.4, r: b.r * rnd(0.35, 0.55), vx: rnd(-160, 160), vy: rnd(-260, -60), life: rnd(0.6, 0.9)});
			crumbs(b.x, b.y, 6);
		}
		const top = bs[bs.length - 1];
		chunks.push({hat: st.type, x: top.x, y: top.y - top.r, r: top.r, vx: rnd(-90, 90), vy: -320, life: 1, spin: rnd(-9, 9)});
		heap(s, baseOf(st, s).x, bs[0].r * 0.8);
		stacks.splice(stacks.indexOf(st), 1);
	};
	const melted = (st, s) => {
		heap(s, baseOf(st, s).x, st.balls[0]);
		stacks.splice(stacks.indexOf(st), 1);
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
	// снеговик (за любой шар) или верхний снежок стопки
	const hitStack = (x, y) => {
		for (let k = stacks.length - 1; k >= 0; k--) {
			const st = stacks[k];
			const s = surfaceOf(st.el);
			if (!s || st.melt) continue;
			const bs = ballsOf(st, s);
			const list = st.type ? bs : [bs[bs.length - 1]];
			if (list.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + 6)) return {st, s, bs};
		}
		return null;
	};

	// ---------- руками: взять снег, снежок или снеговика, отпустить, бросить ----------
	let ptr = {x: 0, y: 0};
	const trail = []; // последние положения руки — из них скорость броска
	let suppressClick = false;
	let scooped = false;
	const volOf = (r) => Math.PI * r * r;
	const grab = (x, y) => {
		if (!toys() || hero()?.occupiedAt?.(x, y)) return false; // тут персонаж — клик ему
		const hit = hitStack(x, y);
		if (hit) {
			const {st, s, bs} = hit;
			if (st.type) {
				// снеговика берём целиком и несём
				const b = baseOf(st, s);
				stacks.splice(stacks.indexOf(st), 1);
				held = {man: st, dx: b.x - x, dy: b.y - y};
			} else {
				const r = st.balls.pop();
				if (!st.balls.length) stacks.splice(stacks.indexOf(st), 1);
				held = {x, y, vol: volOf(r), r};
			}
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
	const throwSpeed = () => {
		const tNow = performance.now();
		const recent = trail.filter((p) => tNow - p.t < 110);
		if (recent.length < 2) return {vx: 0, vy: 0};
		const a = recent[0];
		const b = recent[recent.length - 1];
		const sec = Math.max(16, b.t - a.t) / 1000;
		let vx = (b.x - a.x) / sec;
		let vy = (b.y - a.y) / sec;
		const sp = Math.hypot(vx, vy);
		if (sp > 1800) {
			vx *= 1800 / sp;
			vy *= 1800 / sp;
		}
		return sp < 120 ? {vx: 0, vy: 0} : {vx, vy};
	};
	const release = () => {
		if (!held) return;
		const {vx, vy} = throwSpeed();
		if (held.man) flying.push({man: held.man, x: ptr.x + held.dx, y: ptr.y + held.dy + scrollY, vx, vy});
		else if (held.r < 4.5) crumbs(held.x, held.y, 8); // слишком мало снега — рассыпался
		else flying.push({x: held.x, y: held.y + scrollY, r: held.r, vx, vy});
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
			trail.length = 0;
			suppressClick = true;
			document.body.classList.add('ny-grabbing');
			e.preventDefault();
			e.stopPropagation();
		},
		{capture: true},
	);
	addEventListener('pointermove', (e) => {
		ptr = {x: e.clientX, y: e.clientY};
		if (held) {
			trail.push({x: e.clientX, y: e.clientY, t: performance.now()});
			if (trail.length > 12) trail.shift();
		} else if (e.pointerType === 'mouse' && toys()) document.body.classList.toggle('ny-grab', Boolean(hitStack(e.clientX, e.clientY) || hitDrift(e.clientX, e.clientY)));
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

	// планшет с широким экраном: палец на сугробе, снежке или снеговике не листает страницу
	document.addEventListener(
		'touchstart',
		(e) => {
			const p = e.touches[0];
			if (p && toys() && !hero()?.occupiedAt?.(p.clientX, p.clientY) && (hitStack(p.clientX, p.clientY) || hitDrift(p.clientX, p.clientY))) e.preventDefault();
		},
		{passive: false, capture: true},
	);
	document.addEventListener('touchmove', (e) => held && e.cancelable && e.preventDefault(), {passive: false});

	// подсказка один раз: как лепить снеговика (только на компьютере)
	let hinted = false;
	try {
		hinted = localStorage.getItem(HINT_KEY) === '1';
	} catch {
		// неважно
	}
	if (!hinted)
		setTimeout(() => {
			if (scooped || !toys()) return;
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
	// снеговик целиком: основание в точке (x, top); dir — куда смотрит, tilt — покачивание, squash — тает
	const drawMan = (man, x, top, {dir = 1, tilt = 0, squash = 0, shadow = true} = {}) => {
		const bsx = ballsAt(man.balls, x, top);
		if (shadow) {
			g.fillStyle = 'rgba(0,0,0,.22)';
			g.beginPath();
			g.ellipse(x, top + 1, bsx[0].r * (0.85 + squash * 0.4), Math.max(2, bsx[0].r * 0.18), 0, 0, Math.PI * 2);
			g.fill();
		}
		g.save();
		g.translate(x, top);
		g.rotate(tilt);
		g.scale(dir * (1 + squash * 0.3), 1 - squash * 0.85);
		g.translate(-x, -top);
		if (man.type && bsx.length === 3) drawSnowman(man, bsx);
		else for (const b of bsx) ball(b.x, b.y, b.r);
		g.restore();
	};
	const drawStack = (st, s, t) => {
		const b = baseOf(st, s);
		if (!st.type) {
			drawMan(st, b.x, b.y);
			return;
		}
		const pop = clamp((t - st.born) / 0.45, 0, 1);
		const walking = st.walk > 0 && !st.melt;
		const bounce = walking ? Math.abs(Math.sin(st.phase)) * 2 : 0;
		const squash = st.melt ? clamp((t - st.melt) / MELT, 0, 1) : 0;
		g.save();
		if (pop < 1) {
			// только что собрался — «подпрыгивает»
			const sc = 1 + Math.sin(pop * Math.PI) * 0.12;
			g.translate(b.x, b.y);
			g.scale(sc, sc);
			g.translate(-b.x, -b.y);
		}
		drawMan(st, b.x, b.y - bounce, {dir: st.dir, tilt: walking ? Math.sin(st.phase) * 0.08 : 0, squash});
		g.restore();
		// тает — капает
		if (squash > 0 && Math.random() < 0.3) crumbs(b.x + rnd(-st.balls[0], st.balls[0]), b.y - 2, 1);
	};
	const drawChunk = (c) => {
		if (c.hat) {
			// отлетевшая шапка
			const col = {classic: '#1b1720', santa: '#d42a3a', bucket: '#8aa0b8', ushanka: '#6b4a2f', golem: '#e2892b'}[c.hat] || '#d42a3a';
			g.save();
			g.translate(c.x, c.y);
			g.rotate(c.spin * (1 - c.life));
			rect(-c.r * 0.7, -c.r * 0.5, c.r * 1.4, c.r * 0.8, col);
			g.restore();
		} else ball(c.x, c.y, c.r * Math.max(0.2, c.life));
	};

	// ---------- кадр ----------
	let last = performance.now();
	let refreshAt = 0;
	let growAt = 0;
	const frame = (ms) => {
		requestAnimationFrame(frame);
		const dt = Math.min(0.05, (ms - last) / 1000);
		last = ms;
		const t = ms / 1000;
		if (ms > refreshAt) {
			refreshAt = ms + 700;
			refresh();
		} else for (const s of surfaces) s.r = s.el.getBoundingClientRect();
		// сугробы понемногу растут сами и осыпаются
		if (ms > growAt) {
			growAt = ms + 250;
			for (const s of surfaces) {
				for (let n = Math.ceil(s.d.cols / 24); n > 0; n--) add(s.d, Math.floor(Math.random() * s.d.cols), 0.3);
				relax(s.d);
			}
		}
		g = main;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		const seen = surfaces.filter((s) => s.r.bottom > -40 && s.r.top - 40 < H);
		// снеговики: ходят по своей карточке, через 30 секунд тают
		if (!toys()) stacks = [];
		for (const st of [...stacks]) {
			if (!st.el.isConnected) {
				// карточку перерисовали — ищем такую же по ключу; новая может ещё «выезжать» с анимацией,
				// поэтому ждём до 4 секунд, а не убираем снеговика сразу
				const s = st.key && surfaces.find((x) => x.key === st.key && x.el.isConnected);
				st.lost ||= t;
				if (s) {
					st.el = s.el;
					st.lost = 0;
				} else if (t - st.lost > 4) stacks.splice(stacks.indexOf(st), 1);
				continue;
			}
			st.lost = 0;
			const s = surfaceOf(st.el);
			if (!s) continue;
			if (st.type) {
				if (!st.melt && t - st.born > LIFE) st.melt = t;
				if (st.melt && t - st.melt > MELT) {
					melted(st, s);
					continue;
				}
				if (!st.melt && !reducedMotion) {
					st.walk -= dt;
					if (st.walk < -rnd(0.8, 1.6)) st.walk = rnd(2, 5); // постоял — снова пошёл
					if (st.walk > 0) {
						st.phase += dt * 7;
						const margin = (st.balls[0] + 4) / s.r.width;
						st.fx += (st.dir * 16 * dt) / s.r.width;
						if (st.fx < margin) {
							st.fx = margin;
							st.dir = 1;
						} else if (st.fx > 1 - margin) {
							st.fx = 1 - margin;
							st.dir = -1;
						}
						// встретил другого снеговика — разворачивается
						for (const o of stacks) {
							if (o === st || o.el !== st.el || !o.type) continue;
							const gap = (o.fx - st.fx) * s.r.width;
							if (Math.abs(gap) < st.balls[0] + o.balls[0] && Math.sign(gap) === st.dir) st.dir = -st.dir;
						}
					}
				}
			}
		}
		// карточки у экрана: сугроб и снеговики рисуем на холсте самой карточки
		for (const s of surfaces) {
			if (s.r.bottom < -ZONE || s.r.top - ZONE > H + 120) {
				const pad = pads.get(s.el);
				if (pad?.on) {
					pad.cv.style.display = 'none';
					pad.on = false;
				}
				continue;
			}
			const pad = placePad(s);
			g = pad.ctx;
			g.setTransform(1, 0, 0, 1, 0, 0);
			g.clearRect(0, 0, pad.cv.width, pad.cv.height);
			g.setTransform(pad.k, 0, 0, pad.k, -pad.ox * pad.k, -pad.oy * pad.k);
			drawDrift(s);
			for (const st of stacks) if (st.el === s.el && !st.lost) drawStack(st, s, t);
		}
		g = main;
		// в руке
		if (held?.man) {
			// снеговика несут: болтается за руку
			const sw = clamp((trail.length > 1 ? trail[trail.length - 1].x - trail[trail.length - 2].x : 0) * 0.02, -0.3, 0.3);
			drawMan(held.man, ptr.x + held.dx, ptr.y + held.dy, {dir: held.man.dir, tilt: -sw, shadow: false});
		} else if (held) {
			// снежок собирает снег с сугробов, над которыми проходит
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
		// летят: падают или брошены — попал в снеговика, лёг на стопку, на карточку или улетел
		for (let i = flying.length - 1; i >= 0; i--) {
			const f = flying[i];
			const man = f.man;
			const r0 = man ? man.balls[0] : f.r;
			const prev = f.y - scrollY + (man ? 0 : f.r);
			f.vx *= Math.exp(-0.5 * dt);
			f.vy += G * dt;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			const vy = f.y - scrollY;
			const bottom = vy + (man ? 0 : f.r);
			let done = false;
			if (!man) {
				// попал в снеговика — тот разваливается
				for (const st of stacks) {
					if (!st.type || st.melt) continue;
					const s = surfaceOf(st.el);
					if (!s) continue;
					if (ballsOf(st, s).some((b) => Math.hypot(f.x - b.x, vy - b.y) < f.r + b.r * 0.9)) {
						smash(st, s);
						crumbs(f.x, vy, 10);
						done = true;
						break;
					}
				}
				// лёг на стопку снежков
				if (!done) {
					for (const st of stacks) {
						if (st.type) continue;
						const s = surfaceOf(st.el);
						if (!s) continue;
						const bs2 = ballsOf(st, s);
						const top = bs2[bs2.length - 1];
						if (Math.abs(f.x - top.x) > Math.max(top.r, f.r) * 0.9 || f.vy < 0) continue;
						if (bottom >= top.y - top.r * 0.8 && vy <= top.y + 2) {
							st.balls.push(f.r);
							if (st.balls.length === 3) finish(st);
							done = true;
							break;
						}
					}
				}
			}
			if (!done && f.vy > 0) {
				for (const s of surfaces) {
					const {r} = s;
					const half = man ? r0 * 0.6 : 4;
					if (f.x < r.left + half || f.x > r.right - half) continue;
					if (prev <= r.top + 3 && bottom >= r.top) {
						const fx = (f.x - r.left) / r.width;
						if (man) stacks.push(Object.assign(man, {el: s.el, key: s.key, fx}));
						else stacks.push({el: s.el, key: s.key, fx, balls: [f.r], type: null});
						trim();
						crumbs(f.x, r.top, 5);
						done = true;
						break;
					}
				}
			}
			if (done || vy > H + 300 || f.x < -200 || f.x > W + 200) flying.splice(i, 1);
			else if (man) drawMan(man, f.x, vy, {dir: man.dir, shadow: false});
			else ball(f.x, vy, f.r);
		}
		// куски развалившегося снеговика
		for (let i = chunks.length - 1; i >= 0; i--) {
			const c = chunks[i];
			c.life -= dt;
			if (c.life <= 0) {
				chunks.splice(i, 1);
				continue;
			}
			c.vy += G * 0.6 * dt;
			c.x += c.vx * dt;
			c.y += c.vy * dt;
			drawChunk(c);
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
			f.y += f.vy * dt;
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
				const st = {el: s.el, key, fx, balls: [...sizes], type: null};
				stacks.push(st);
				finish(st);
				if (type) st.type = type;
				return st.type;
			},
			clear: () => {
				stacks = [];
			},
			// состарить всех снеговиков на sec секунд (проверить таяние)
			age: (sec) => stacks.forEach((s) => s.type && (s.born -= sec)),
			// бросить снежок из точки (x, y) со скоростью (vx, vy)
			throw: (x, y, vx, vy, r = 12) => flying.push({x, y: y + scrollY, r, vx, vy}),
			state: () => ({surfaces: surfaces.length, stacks: stacks.map((s) => ({key: s.key, balls: s.balls.map((r) => Math.round(r)), type: s.type, fx: +s.fx.toFixed(3), melt: Boolean(s.melt)})), held: held ? (held.man ? 'man' : Math.round(held.r)) : null, flying: flying.length, chunks: chunks.length}),
			// где стоит снеговик (точка на экране — середина среднего шара)
			manAt: (i = 0) => {
				const st = stacks.filter((s) => s.type)[i];
				const s = st && surfaceOf(st.el);
				if (!s) return null;
				const bs2 = ballsOf(st, s);
				return {x: Math.round(bs2[1].x), y: Math.round(bs2[1].y), base: Math.round(bs2[0].y + bs2[0].r)};
			},
			depth: (key) => {
				const s = surfaces.find((x) => x.key === key);
				return s ? Math.round((s.d.h.reduce((a, b) => a + b, 0) / s.d.cols) * 10) / 10 : null;
			},
			peak: (key) => {
				const s = surfaces.find((x) => x.key === key);
				return s ? Math.round(Math.max(...s.d.h)) : null;
			},
		};
};
