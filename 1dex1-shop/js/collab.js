// Раздел «Сотрудничество»: логотипы визуалов летают вокруг аватарки, как в невесомости.
// У каждого круглый хитбокс: они отталкиваются друг от друга, от аватарки и от краёв.
// Три слоя: ближний — крупный, средний и дальний — мельче, темнее и размыты, будто в тени.
// Под курсором логотип замирает, светлеет и увеличивается, клик открывает сайт визуала.

const LAYERS = [
	{size: 76, speed: 30}, // ближний
	{size: 56, speed: 22}, // средний
	{size: 40, speed: 15}, // дальний
];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

export const initCollab = (space, avatar, items, {reducedMotion = false} = {}) => {
	if (!space || !avatar || !items.length) return;
	const bodies = [];
	LAYERS.forEach((layer, depth) => {
		items.forEach((it) => {
			const a = document.createElement('a');
			a.className = 'visual';
			a.dataset.layer = depth;
			a.href = it.url;
			a.target = '_blank';
			a.rel = 'noopener';
			// дальние копии — для красоты: читалке экрана хватает ближних
			if (depth) {
				a.tabIndex = -1;
				a.setAttribute('aria-hidden', 'true');
			} else a.setAttribute('aria-label', `${it.name} — открыть сайт`);
			a.innerHTML = `<span class="visual__in"><span class="visual__ava${it.pixel ? ' is-pixel' : ''}${it.fit === 'contain' ? ' is-contain' : ''}"><img src="${esc(it.logo)}" alt="" loading="lazy" decoding="async"></span>${depth ? '' : `<span class="visual__name px">${esc(it.name)}</span>`}</span>`;
			space.append(a);
			const b = {el: a, depth, base: layer.size, size: layer.size, r: layer.size / 2, speed: layer.speed, x: 0, y: 0, vx: 0, vy: 0, ang: Math.random() * Math.PI * 2, hover: false};
			a.addEventListener('pointerenter', () => (b.hover = true));
			a.addEventListener('pointerleave', () => (b.hover = false));
			a.addEventListener('focus', () => (b.hover = true));
			a.addEventListener('blur', () => (b.hover = false));
			bodies.push(b);
		});
	});

	let W = 1;
	let H = 1;
	let A = {x: 0, y: 0, r: 0}; // аватарка — неподвижный круг посередине
	const measure = () => {
		const r = space.getBoundingClientRect();
		W = r.width;
		H = r.height;
		const ar = avatar.getBoundingClientRect();
		A = {x: ar.left - r.left + ar.width / 2, y: ar.top - r.top + ar.height / 2, r: ar.width / 2 + 12};
		// на узком экране логотипы чуть мельче
		const k = W < 520 ? 0.8 : 1;
		for (const b of bodies) {
			b.size = Math.round(b.base * k);
			b.r = b.size / 2;
			b.el.style.setProperty('--s', `${b.size}px`);
		}
	};
	const free = (b, list) => Math.hypot(b.x - A.x, b.y - A.y) > A.r + b.r + 6 && list.every((o) => o.depth !== b.depth || Math.hypot(o.x - b.x, o.y - b.y) > o.r + b.r + 6);
	// начальная расстановка: вокруг аватарки, не друг на друге
	const place = () => {
		measure();
		const done = [];
		bodies.forEach((b, i) => {
			for (let t = 0; t < 80; t++) {
				const ang = (i / bodies.length) * Math.PI * 2 + Math.random() * 0.9;
				const dist = A.r + b.r + 16 + Math.random() * Math.max(30, Math.min(W / 2, H) * 0.55);
				b.x = clamp(A.x + Math.cos(ang) * dist * clamp(W / H, 1, 2.6), b.r, W - b.r);
				b.y = clamp(A.y + Math.sin(ang) * dist * 0.85, b.r, H - b.r - 16);
				if (free(b, done)) break;
			}
			b.vx = Math.cos(b.ang) * b.speed;
			b.vy = Math.sin(b.ang) * b.speed;
			done.push(b);
		});
	};
	const draw = () => {
		for (const b of bodies) b.el.style.transform = `translate3d(${(b.x - b.r).toFixed(1)}px,${(b.y - b.r).toFixed(1)}px,0)`;
	};

	const step = (dt) => {
		for (const b of bodies) {
			if (b.hover) {
				// под курсором замирает, чтобы по нему было легко попасть
				const k = Math.exp(-12 * dt);
				b.vx *= k;
				b.vy *= k;
			} else {
				// плывёт, плавно меняя направление, скорость держится около своей
				b.ang += (Math.random() - 0.5) * 2.4 * dt;
				b.vx += Math.cos(b.ang) * b.speed * 0.9 * dt;
				b.vy += Math.sin(b.ang) * b.speed * 0.9 * dt;
				const sp = Math.hypot(b.vx, b.vy);
				if (sp > b.speed) {
					const k = 1 - (1 - b.speed / sp) * (1 - Math.exp(-2.5 * dt));
					b.vx *= k;
					b.vy *= k;
				}
			}
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			// края пространства (снизу место под подпись)
			const bottom = H - b.r - (b.depth ? 0 : 18);
			if (b.x < b.r) [b.x, b.vx] = [b.r, Math.abs(b.vx)];
			if (b.x > W - b.r) [b.x, b.vx] = [W - b.r, -Math.abs(b.vx)];
			if (b.y < b.r) [b.y, b.vy] = [b.r, Math.abs(b.vy)];
			if (b.y > bottom) [b.y, b.vy] = [bottom, -Math.abs(b.vy)];
			// аватарка: отскок от круга
			const dx = b.x - A.x;
			const dy = b.y - A.y;
			const d = Math.hypot(dx, dy) || 1;
			const min = A.r + b.r;
			if (d < min) {
				const nx = dx / d;
				const ny = dy / d;
				b.x = A.x + nx * min;
				b.y = A.y + ny * min;
				const vn = b.vx * nx + b.vy * ny;
				if (vn < 0) {
					b.vx -= 2 * vn * nx;
					b.vy -= 2 * vn * ny;
				}
				b.ang = Math.atan2(b.vy, b.vx);
			}
		}
		// столкновения внутри одного слоя: упругий удар, тяжелее тот, кто крупнее;
		// логотип под курсором стоит на месте, как стена
		for (let i = 0; i < bodies.length; i++) {
			for (let j = i + 1; j < bodies.length; j++) {
				const a = bodies[i];
				const b = bodies[j];
				if (a.depth !== b.depth) continue;
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const d = Math.hypot(dx, dy) || 1;
				const overlap = a.r + b.r - d;
				if (overlap <= 0) continue;
				const nx = dx / d;
				const ny = dy / d;
				const ma = a.hover ? Infinity : a.r * a.r;
				const mb = b.hover ? Infinity : b.r * b.r;
				const wa = ma === Infinity ? 0 : mb === Infinity ? 1 : mb / (ma + mb);
				const wb = 1 - wa;
				a.x -= nx * overlap * wa;
				a.y -= ny * overlap * wa;
				b.x += nx * overlap * wb;
				b.y += ny * overlap * wb;
				const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
				if (rel < 0) {
					a.vx += nx * rel * wa * 2;
					a.vy += ny * rel * wa * 2;
					b.vx -= nx * rel * wb * 2;
					b.vy -= ny * rel * wb * 2;
					a.ang = Math.atan2(a.vy, a.vx);
					b.ang = Math.atan2(b.vy, b.vx);
				}
			}
		}
	};

	place();
	draw();
	if (reducedMotion) return;

	// считаем, только пока раздел на экране
	let visible = false;
	let last = 0;
	const loop = (t) => {
		if (!visible) return;
		const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
		last = t;
		step(dt);
		draw();
		requestAnimationFrame(loop);
	};
	new IntersectionObserver(([e]) => {
		const was = visible;
		visible = e.isIntersecting;
		if (visible && !was) {
			last = performance.now();
			requestAnimationFrame(loop);
		}
	}).observe(space);
	new ResizeObserver(() => {
		const oldW = W;
		const oldH = H;
		measure();
		// растянуть расстановку под новый размер
		for (const b of bodies) {
			b.x = clamp((b.x / oldW) * W, b.r, W - b.r);
			b.y = clamp((b.y / oldH) * H, b.r, H - b.r);
		}
		draw();
	}).observe(space);
};
