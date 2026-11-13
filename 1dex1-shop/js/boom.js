// Взрыв криппера: кусок сайта разлетается блоками, на его месте — тёмная воронка,
// а через пару секунд блоки слетаются обратно, и сайт снова целый.
// Цвет каждого блока берём с того места сайта, где он был: фон, буквы, иконка или
// пиксель картинки — поэтому разлетается именно то, что там было.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

// любой цвет CSS → {r, g, b, a} (холст сам переводит oklch, color-mix и прочее в обычный RGB)
let probe = null;
const cache = new Map();
const rgba = (css) => {
	if (cache.has(css)) return cache.get(css);
	if (!probe) {
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		probe = c.getContext('2d', {willReadFrequently: true});
	}
	probe.clearRect(0, 0, 1, 1);
	probe.fillStyle = '#000';
	probe.fillStyle = css;
	probe.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
	const out = {r, g, b, a: a / 255};
	cache.set(css, out);
	return out;
};
const css = ({r, g, b}) => `rgb(${r},${g},${b})`;

// пиксель картинки (уменьшенная копия, чтобы не читать большие файлы)
const imgCache = new WeakMap();
const imgPixel = (img, x, y) => {
	let d = imgCache.get(img);
	if (d === undefined) {
		d = null;
		try {
			if (img.complete && img.naturalWidth) {
				const W = 48;
				const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
				const c = document.createElement('canvas');
				c.width = W;
				c.height = H;
				const g = c.getContext('2d', {willReadFrequently: true});
				g.drawImage(img, 0, 0, W, H);
				d = {W, H, px: g.getImageData(0, 0, W, H).data};
			}
		} catch {
			d = null; // картинка с чужого сайта — пиксели не прочитать
		}
		imgCache.set(img, d);
	}
	if (!d) return null;
	const r = img.getBoundingClientRect();
	const u = clamp((x - r.left) / r.width, 0, 0.999);
	const v = clamp((y - r.top) / r.height, 0, 0.999);
	const i = (Math.floor(v * d.H) * d.W + Math.floor(u * d.W)) * 4;
	return {r: d.px[i], g: d.px[i + 1], b: d.px[i + 2], a: 1};
};
const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const SKY = [{r: 26, g: 16, b: 51}, {r: 42, g: 26, b: 79}, {r: 18, g: 12, b: 34}];

// что видно в этой точке сайта
const colorAt = (x, y, base) => {
	const el = document.elementFromPoint(x, y); // прослойки с pointer-events: none сюда не попадают
	if (!el) return base;
	if (el.tagName === 'IMG') {
		const c = imgPixel(el, x, y);
		if (c) return c;
	}
	if (el.tagName === 'CANVAS') return SKY[Math.floor(Math.random() * SKY.length)]; // 3D-сцена: тёмное небо
	const st = getComputedStyle(el);
	if (el instanceof SVGElement && st.fill && st.fill !== 'none') {
		const c = rgba(st.fill);
		if (c.a > 0.4) return c;
	}
	if (ownText(el) && Math.random() < 0.3) return rgba(st.color); // кусочек букв
	for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
		const c = rgba(getComputedStyle(e).backgroundColor);
		if (c.a > 0.4) return c;
	}
	return base;
};

// cx, cy — центр взрыва на экране; R — радиус воронки
// speed — только для проверки: замедлить сцену
export const siteBoom = (cx, cy, R, {lock = () => {}, speed = 1} = {}) => {
	const W = document.documentElement.clientWidth;
	const H = window.innerHeight;
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const cell = Math.round(clamp(R / 8.5, 10, 16));
	const base = rgba(getComputedStyle(document.body).backgroundColor);
	// неровный край воронки
	const ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
	const rim = (a) => R * (0.8 + 0.12 * Math.sin(a * 3 + ph[0]) + 0.08 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 9 + ph[2]));
	const blocks = [];
	const scorch = [];
	for (let gy = Math.floor((cy - R * 1.3) / cell); gy <= Math.ceil((cy + R * 1.3) / cell); gy++) {
		for (let gx = Math.floor((cx - R * 1.3) / cell); gx <= Math.ceil((cx + R * 1.3) / cell); gx++) {
			const x = gx * cell;
			const y = gy * cell;
			const mx = x + cell / 2;
			const my = y + cell / 2;
			if (mx < 0 || my < 0 || mx > W || my > H) continue;
			const d = Math.hypot(mx - cx, my - cy);
			const a = Math.atan2(my - cy, mx - cx);
			const edge = rim(a);
			if (d > edge) {
				// вокруг воронки — копоть
				if (d < edge + cell * 1.6) scorch.push({x, y, k: (1 - (d - edge) / (cell * 1.6)) * (0.6 + Math.random() * 0.4)});
				continue;
			}
			const c = colorAt(mx, my, base);
			const k = 1 - (d / R) * 0.55; // у центра летит сильнее
			const sp = (380 + Math.random() * 520) * k;
			blocks.push({
				hx: x,
				hy: y,
				color: css(c),
				light: `rgba(255,255,255,${(0.16 + Math.random() * 0.1).toFixed(2)})`,
				pit: `rgb(${4 + Math.floor((1 - d / R) * 4 + Math.random() * 5)},${3 + Math.floor(Math.random() * 3)},${8 + Math.floor((1 - d / R) * 6 + Math.random() * 6)})`,
				vx: Math.cos(a) * sp + (Math.random() - 0.5) * 120,
				vy: Math.sin(a) * sp - (220 + Math.random() * 380) * k,
				w: (Math.random() - 0.5) * 16, // вращение, рад/с
				z: Math.random() * 0.9, // летит к тебе — растёт
				// обратно: сначала края, потом середина — воронка зарастает снаружи внутрь
				back: 1.3 + (1 - d / R) * 0.55 + Math.random() * 0.25,
				ember: d / edge > 0.72 ? Math.random() * 0.5 + 0.5 : 0, // у края воронки тлеет
				flick: Math.random() * 6,
				dur: 0.55 + Math.random() * 0.2,
				home: false,
			});
		}
	}
	// клубы дыма
	const puffs = Array.from({length: 16}, () => {
		const a = Math.random() * Math.PI * 2;
		const r = Math.random() * R * 0.45;
		return {x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: Math.cos(a) * (30 + Math.random() * 60), vy: -30 - Math.random() * 50, s0: R * (0.18 + Math.random() * 0.15), s1: R * (0.45 + Math.random() * 0.3), life: 0.8 + Math.random() * 0.6, delay: Math.random() * 0.15, g: 200 + Math.floor(Math.random() * 40), rot: Math.random() * 0.6};
	});

	const cv = document.createElement('canvas');
	cv.className = 'dex-boom';
	cv.setAttribute('aria-hidden', 'true');
	cv.width = Math.round(W * dpr);
	cv.height = Math.round(H * dpr);
	document.body.append(cv);
	const g = cv.getContext('2d');
	lock(true);
	const G = 1500;
	const end = Math.max(...blocks.map((b) => b.back + b.dur), 1.6) + 0.5;
	const t0 = performance.now();
	const pos = (b, t) => ({x: b.hx + b.vx * t, y: b.hy + b.vy * t + 0.5 * G * t * t, rot: b.w * t, s: 1 + b.z * Math.min(1, t / 0.6)});
	const frame = () => {
		const t = ((performance.now() - t0) / 1000) * speed;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);
		// копоть тает, пока блоки возвращаются
		const soot = 1 - clamp((t - 1.5) / 1.3, 0, 1);
		if (soot > 0) {
			for (const c of scorch) {
				g.fillStyle = `rgba(14,8,6,${(c.k * 0.6 * soot).toFixed(3)})`;
				g.fillRect(c.x, c.y, cell, cell);
			}
		}
		// воронка: тёмные клетки там, где блоков ещё нет; по краю — тлеющие угли
		for (const b of blocks) {
			if (b.home) continue;
			g.fillStyle = b.pit;
			g.fillRect(b.hx, b.hy, cell, cell);
			const glow = b.ember * (1 - clamp(t / 1.7, 0, 1)) * (0.75 + 0.25 * Math.sin(t * 14 + b.flick));
			if (glow > 0.02) {
				g.fillStyle = `rgba(255,${Math.round(90 + b.flick * 18)},30,${(glow * 0.85).toFixed(3)})`;
				g.fillRect(b.hx + 1, b.hy + 1, cell - 2, cell - 2);
			}
		}
		// огненная вспышка в первые доли секунды
		if (t < 0.3) {
			const f = 1 - t / 0.3;
			const fire = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
			fire.addColorStop(0, `rgba(255,244,200,${(0.95 * f).toFixed(3)})`);
			fire.addColorStop(0.35, `rgba(255,170,60,${(0.75 * f).toFixed(3)})`);
			fire.addColorStop(1, 'rgba(255,90,20,0)');
			g.fillStyle = fire;
			g.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
		}
		// блоки: летят, кувыркаясь, потом слетаются на свои места
		for (const b of blocks) {
			if (b.home) continue;
			let p;
			if (t < b.back) p = pos(b, t);
			else {
				const u = clamp((t - b.back) / b.dur, 0, 1);
				if (u >= 1) {
					b.home = true;
					continue;
				}
				b.from ||= pos(b, b.back);
				const e = smooth(u);
				p = {x: b.from.x + (b.hx - b.from.x) * e, y: b.from.y + (b.hy - b.from.y) * e - Math.sin(u * Math.PI) * R * 0.25, rot: b.from.rot * (1 - e), s: b.from.s + (1 - b.from.s) * e};
			}
			const c = (cell * p.s) / 2;
			g.save();
			g.translate(p.x + cell / 2, p.y + cell / 2);
			g.rotate(p.rot);
			g.fillStyle = b.color;
			g.fillRect(-c, -c, c * 2, c * 2);
			// грани блока: светлые сверху и слева, тёмные снизу и справа
			const e = Math.max(1, c * 0.22);
			g.fillStyle = b.light;
			g.fillRect(-c, -c, c * 2, e);
			g.fillRect(-c, -c, e, c * 2);
			g.fillStyle = 'rgba(0,0,0,.32)';
			g.fillRect(-c, c - e, c * 2, e);
			g.fillRect(c - e, -c, e, c * 2);
			g.restore();
		}
		// дым: серые квадраты растут и тают
		for (const q of puffs) {
			const k = (t - q.delay) / q.life;
			if (k <= 0 || k >= 1) continue;
			const s = q.s0 + (q.s1 - q.s0) * Math.sqrt(k);
			g.save();
			g.translate(q.x + q.vx * t, q.y + q.vy * t);
			g.rotate(q.rot * k);
			const a = 0.6 * (1 - k) ** 1.5;
			g.fillStyle = `rgba(${q.g},${q.g},${q.g + 6},${a.toFixed(3)})`;
			g.fillRect(-s / 2, -s / 2, s, s);
			g.fillStyle = `rgba(255,255,255,${(a * 0.35).toFixed(3)})`; // светлая середина клуба
			g.fillRect(-s / 4, -s / 4, s / 2, s / 2);
			g.restore();
		}
		if (t < end) requestAnimationFrame(frame);
		else {
			cv.remove();
			lock(false);
		}
	};
	requestAnimationFrame(frame);
	return end;
};
