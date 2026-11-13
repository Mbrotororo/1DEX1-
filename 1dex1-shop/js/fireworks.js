// Салют после покупки: ракеты взлетают снизу со свистом и рассыпаются пиксельными
// искрами — шар, кольцо, «ива» и последним — сердце. Цвета — из палитры сайта.

const PAL = [
	['#b8ff3d', '#e2ffab'],
	['#9a6bff', '#c3a6ff'],
	['#ffc83d', '#ffe59a'],
	['#ff5a9e', '#ffb3d1'],
	['#4de1ff', '#b3f3ff'],
	['#ff7a3d', '#ffd0a8'],
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const fireworks = ({shots = 7, reducedMotion = false, onLaunch = () => {}, onPop = () => {}} = {}) => {
	const W = document.documentElement.clientWidth;
	const H = window.innerHeight;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const cv = document.createElement('canvas');
	cv.className = 'dex-fireworks';
	cv.setAttribute('aria-hidden', 'true');
	cv.width = Math.round(W * dpr);
	cv.height = Math.round(H * dpr);
	document.body.append(cv);
	const g = cv.getContext('2d');
	const px = Math.max(3, Math.round(Math.min(W, H) / 220)); // размер искры
	const S = Math.min(W, H) * 0.42; // сила взрыва: на телефоне салюты меньше
	if (reducedMotion) shots = Math.min(shots, 3);
	const plan = Array.from({length: shots}, (_, i) => ({
		at: i * 0.42 + Math.random() * 0.22,
		x: W * (0.14 + Math.random() * 0.72),
		y: H * (0.16 + Math.random() * 0.3),
		shape: i === shots - 1 ? 'heart' : pick(['ball', 'ring', 'ball', 'willow']),
		pal: i === shots - 1 ? ['#ff5a9e', '#ffb3d1'] : pick(PAL),
		done: false,
	}));
	const rockets = [];
	const sparks = [];
	const RG = 700; // тяжесть для ракет
	const burst = (x, y, shape, pal) => {
		onPop();
		const n = shape === 'heart' ? 64 : shape === 'ring' ? 56 : 72;
		for (let i = 0; i < n; i++) {
			let vx;
			let vy;
			if (shape === 'ring') {
				const a = (i / n) * Math.PI * 2;
				vx = Math.cos(a) * S * 1.05;
				vy = Math.sin(a) * S * 1.05;
			} else if (shape === 'heart') {
				const t = (i / n) * Math.PI * 2;
				vx = ((16 * Math.sin(t) ** 3) / 16) * S * 1.1;
				vy = (-(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16) * S * 1.1;
			} else {
				// шар: точки внутри круга — как сфера, видимая спереди
				const a = Math.random() * Math.PI * 2;
				const r = Math.sqrt(Math.random()) * (shape === 'willow' ? 0.7 : 1.05);
				vx = Math.cos(a) * r * S;
				vy = Math.sin(a) * r * S;
			}
			const life = shape === 'willow' ? 2 + Math.random() * 0.6 : 1.2 + Math.random() * 0.6;
			sparks.push({x, y, vx, vy, life, max: life, c: Math.random() < 0.7 ? pal[0] : pal[1], g: shape === 'willow' ? 150 : 90, s: px, tw: Math.random() < 0.5});
		}
		// вспышка в центре
		sparks.push({x, y, vx: 0, vy: 0, life: 0.18, max: 0.18, c: '#ffffff', g: 0, s: px * 7, tw: false});
	};
	const t0 = performance.now();
	let last = t0;
	const frame = () => {
		const nowMs = performance.now();
		const t = (nowMs - t0) / 1000;
		const dt = Math.min(0.05, (nowMs - last) / 1000);
		last = nowMs;
		for (const p of plan) {
			if (p.done || t < p.at) continue;
			p.done = true;
			if (reducedMotion) burst(p.x, p.y, p.shape, p.pal);
			else {
				onLaunch();
				rockets.push({x: p.x + (Math.random() - 0.5) * W * 0.1, y: H + 10, vx: 0, vy: -Math.sqrt(2 * RG * (H + 10 - p.y)), p});
			}
		}
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		g.globalCompositeOperation = 'lighter';
		for (let i = rockets.length - 1; i >= 0; i--) {
			const r = rockets[i];
			r.vx += ((r.p.x - r.x) * 2 - r.vx) * dt;
			r.vy += RG * dt;
			r.x += r.vx * dt;
			r.y += r.vy * dt;
			// хвост ракеты
			sparks.push({x: r.x + (Math.random() - 0.5) * 2, y: r.y + 4, vx: (Math.random() - 0.5) * 20, vy: 30 + Math.random() * 40, life: 0.35, max: 0.35, c: '#ffd9a0', g: 40, s: Math.max(2, px - 1), tw: false});
			g.fillStyle = '#fff6d8';
			g.fillRect(r.x - px / 2, r.y - px, px, px * 2);
			if (r.vy > -40) {
				rockets.splice(i, 1);
				burst(r.x, r.y, r.p.shape, r.p.pal);
			}
		}
		for (let i = sparks.length - 1; i >= 0; i--) {
			const s = sparks[i];
			s.life -= dt;
			if (s.life <= 0) {
				sparks.splice(i, 1);
				continue;
			}
			const drag = Math.exp(-1.7 * dt);
			s.vx *= drag;
			s.vy = s.vy * drag + s.g * dt;
			s.x += s.vx * dt;
			s.y += s.vy * dt;
			let a = s.life / s.max;
			if (s.tw && a < 0.45 && Math.random() < 0.45) a *= 0.25; // мерцает перед тем, как погаснуть
			g.globalAlpha = Math.min(1, a * 1.2);
			g.fillStyle = s.c;
			g.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
			if (s.s <= px * 2) {
				// мягкое свечение вокруг искры
				g.globalAlpha = a * 0.22;
				g.fillRect(s.x - s.s * 1.2, s.y - s.s * 1.2, s.s * 2.4, s.s * 2.4);
			}
		}
		g.globalAlpha = 1;
		g.globalCompositeOperation = 'source-over';
		if (plan.every((p) => p.done) && !rockets.length && !sparks.length) cv.remove();
		else requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
};
