// Раздел «Сотрудничество»: значки визуалов летают вокруг аватарки, как в невесомости,
// внутри рамки виджета и не вылетают за неё. У каждого значка круглый хитбокс: они
// отталкиваются друг от друга, от аватарки и от краёв. По умолчанию значки чуть в тени;
// под курсором значок замирает, светлеет и увеличивается, клик открывает сайт визуала.

const SIZE = 84; // диаметр значка
const SPEED = 28; // скорость полёта, пикселей в секунду
const PAD = 14; // отступ от рамки виджета
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

export const initCollab = (space, avatar, items, {reducedMotion = false} = {}) => {
	if (!space || !avatar || !items.length) return;
	const bodies = items.map((it) => {
		const a = document.createElement('a');
		a.className = 'visual';
		a.href = it.url;
		a.target = '_blank';
		a.rel = 'noopener';
		a.setAttribute('aria-label', `${it.name} — открыть сайт`);
		a.innerHTML = `<span class="visual__in"><span class="visual__ava${it.pixel ? ' is-pixel' : ''}${it.fit === 'contain' ? ' is-contain' : ''}"><img src="${esc(it.logo)}" alt="" loading="lazy" decoding="async"></span><span class="visual__name px">${esc(it.name)}</span></span>`;
		space.append(a);
		const b = {el: a, name: a.querySelector('.visual__name'), size: SIZE, r: SIZE / 2, hw: SIZE / 2, x: 0, y: 0, vx: 0, vy: 0, ang: Math.random() * Math.PI * 2, hover: false};
		a.addEventListener('pointerenter', () => (b.hover = true));
		a.addEventListener('pointerleave', () => (b.hover = false));
		a.addEventListener('focus', () => (b.hover = true));
		a.addEventListener('blur', () => (b.hover = false));
		return b;
	});

	let W = 1;
	let H = 1;
	let A = {x: 0, y: 0, r: 0}; // аватарка — неподвижный круг посередине
	const measure = () => {
		const r = space.getBoundingClientRect();
		W = r.width;
		H = r.height;
		const ar = avatar.getBoundingClientRect();
		A = {x: ar.left - r.left + ar.width / 2, y: ar.top - r.top + ar.height / 2, r: ar.width / 2 + 10};
		const size = Math.round(W < 520 ? SIZE * 0.8 : SIZE); // на узком экране значки чуть мельче
		for (const b of bodies) {
			b.size = size;
			b.r = size / 2;
			b.el.style.setProperty('--s', `${size}px`);
			// подпись бывает шире кружка — по бокам держим место и под неё
			b.hw = Math.max(b.r, b.name.offsetWidth / 2 + 2);
		}
	};
	// пределы для центра значка: внутри рамки, снизу место под подпись
	const lim = (b) => ({x0: PAD + b.hw, x1: W - PAD - b.hw, y0: PAD + b.r, y1: H - PAD - b.r - 20});

	// начальная расстановка: по кругу вокруг аватарки, на равных углах
	const place = () => {
		measure();
		const start = Math.random() * Math.PI * 2;
		bodies.forEach((b, i) => {
			const ang = start + (i / bodies.length) * Math.PI * 2;
			const L = lim(b);
			const reach = A.r + b.r + 24;
			b.x = clamp(A.x + Math.cos(ang) * reach * 1.9, L.x0, L.x1);
			b.y = clamp(A.y + Math.sin(ang) * reach * 0.9, L.y0, L.y1);
			b.ang = ang + Math.PI / 2;
			b.vx = Math.cos(b.ang) * SPEED;
			b.vy = Math.sin(b.ang) * SPEED;
		});
	};
	// Подпись под значком — прямоугольник: насколько и куда вытолкнуть значок,
	// чтобы подпись не заходила на круг (cx, cy, cr). null — не задевает.
	const labelHit = (b, cx, cy, cr) => {
		const top = b.y + b.r + 4;
		const px = clamp(cx, b.x - b.hw, b.x + b.hw);
		const py = clamp(cy, top, top + 18);
		const dx = px - cx;
		const dy = py - cy;
		const d = Math.hypot(dx, dy);
		if (d >= cr) return null;
		if (d < 1e-3) return {nx: 0, ny: cy < top + 9 ? 1 : -1, depth: cr};
		return {nx: dx / d, ny: dy / d, depth: cr - d};
	};
	const push = (b, hit, share = 1) => {
		b.x += hit.nx * hit.depth * share;
		b.y += hit.ny * hit.depth * share;
		const vn = b.vx * hit.nx + b.vy * hit.ny;
		if (vn < 0) {
			b.vx -= 2 * vn * hit.nx;
			b.vy -= 2 * vn * hit.ny;
		}
		b.ang = Math.atan2(b.vy, b.vx);
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
				// плывёт, плавно меняя направление; скорость держится около SPEED
				b.ang += (Math.random() - 0.5) * 2.4 * dt;
				b.vx += Math.cos(b.ang) * SPEED * 0.9 * dt;
				b.vy += Math.sin(b.ang) * SPEED * 0.9 * dt;
				const sp = Math.hypot(b.vx, b.vy);
				if (sp > SPEED) {
					const k = 1 - (1 - SPEED / sp) * (1 - Math.exp(-2.5 * dt));
					b.vx *= k;
					b.vy *= k;
				}
			}
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			// рамка виджета: значок отскакивает и не вылетает
			const L = lim(b);
			if (b.x < L.x0) [b.x, b.vx] = [L.x0, Math.abs(b.vx)];
			if (b.x > L.x1) [b.x, b.vx] = [L.x1, -Math.abs(b.vx)];
			if (b.y < L.y0) [b.y, b.vy] = [L.y0, Math.abs(b.vy)];
			if (b.y > L.y1) [b.y, b.vy] = [L.y1, -Math.abs(b.vy)];
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
			// подпись тоже не заходит на аватарку
			const lh = labelHit(b, A.x, A.y, A.r);
			if (lh) push(b, lh);
		}
		// столкновения значков: упругий удар; значок под курсором стоит на месте, как стена
		for (let i = 0; i < bodies.length; i++) {
			for (let j = i + 1; j < bodies.length; j++) {
				const a = bodies[i];
				const b = bodies[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const d = Math.hypot(dx, dy) || 1;
				const overlap = a.r + b.r + 8 - d;
				if (overlap <= 0) continue;
				const nx = dx / d;
				const ny = dy / d;
				const wa = a.hover ? 0 : b.hover ? 1 : 0.5;
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
		// подпись одного значка не наезжает на кружок другого
		for (const a of bodies) {
			for (const b of bodies) {
				if (a === b) continue;
				const hit = labelHit(a, b.x, b.y, b.r + 4);
				if (!hit) continue;
				const wa = a.hover ? 0 : b.hover ? 1 : 0.5;
				push(a, hit, wa);
				if (wa < 1) push(b, {nx: -hit.nx, ny: -hit.ny, depth: hit.depth}, 1 - wa);
			}
		}
		// после всех толчков ещё раз держим значки внутри рамки
		for (const b of bodies) {
			const L = lim(b);
			if (b.x < L.x0) [b.x, b.vx] = [L.x0, Math.abs(b.vx)];
			if (b.x > L.x1) [b.x, b.vx] = [L.x1, -Math.abs(b.vx)];
			if (b.y < L.y0) [b.y, b.vy] = [L.y0, Math.abs(b.vy)];
			if (b.y > L.y1) [b.y, b.vy] = [L.y1, -Math.abs(b.vy)];
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
		measure();
		for (const b of bodies) {
			const L = lim(b);
			b.x = clamp(b.x, L.x0, L.x1);
			b.y = clamp(b.y, L.y0, L.y1);
		}
		draw();
	}).observe(space);
};
