// Раздел «Сотрудничество»: значки визуалов летают вокруг аватарки, как в невесомости,
// внутри рамки виджета и не вылетают за неё. У каждого значка круглый хитбокс: они
// отталкиваются друг от друга, от аватарки и от краёв. По умолчанию значки чуть в тени;
// под курсором значок замирает, светлеет и увеличивается, клик открывает сайт визуала.

const SIZE = 42; // диаметр значка
const SPEED = 28; // скорость полёта, пикселей в секунду
const PAD = 14; // отступ от рамки виджета
const NEAR = 38; // за сколько пикселей до рамки, аватарки или соседа значок начинает плавно отворачивать
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const turnTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from)); // кратчайший поворот
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

export const initCollab = (space, avatar, items, {reducedMotion = false} = {}) => {
	if (!space || !avatar || !items.length) return;
	const bodies = items.map((it) => {
		const a = document.createElement('a');
		a.className = 'visual';
		a.href = it.url;
		a.target = '_blank';
		a.rel = 'noopener';
		a.dataset.name = it.name; // подпись для читалок экрана ставит app.js на языке сайта
		a.innerHTML = `<span class="visual__in"><span class="visual__ava${it.pixel ? ' is-pixel' : ''}${it.fit === 'contain' ? ' is-contain' : ''}"><img src="${esc(it.logo)}" alt="" loading="lazy" decoding="async"></span><span class="visual__name px">${esc(it.name)}</span></span>`;
		space.append(a);
		const b = {el: a, name: a.querySelector('.visual__name'), size: SIZE, r: SIZE / 2, hw: SIZE / 2, x: 0, y: 0, vx: 0, vy: 0, ang: Math.random() * Math.PI * 2, turn: 0, hover: false};
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
		const size = Math.round(W < 520 ? SIZE * 0.9 : SIZE); // на узком экране значки чуть мельче
		for (const b of bodies) {
			b.size = size;
			b.r = size / 2;
			b.el.style.setProperty('--s', `${size}px`);
			// подпись бывает шире кружка — по бокам держим место и под неё
			b.hw = Math.max(b.r, b.name.offsetWidth / 2 + 2);
		}
	};
	// пределы для центра значка: внутри рамки, снизу место под подпись
	const lim = (b) => ({x0: PAD + b.hw, x1: W - PAD - b.hw, y0: PAD + b.r, y1: H - PAD - b.r - 18});

	// начальная расстановка: каждый раз случайная, но каждый значок — в самом свободном из 40 мест
	// (подальше от аватарки, краёв и уже поставленных значков), летят в случайные стороны
	const place = () => {
		measure();
		const done = [];
		for (const b of bodies) {
			const L = lim(b);
			let best = null;
			for (let k = 0; k < 40; k++) {
				b.x = L.x0 + Math.random() * Math.max(0, L.x1 - L.x0);
				b.y = L.y0 + Math.random() * Math.max(0, L.y1 - L.y0);
				let room = Math.min(gapTo(b, A.x, A.y, A.r).gap, b.x - L.x0 + 24, L.x1 - b.x + 24, b.y - L.y0 + 24, L.y1 - b.y + 24);
				for (const o of done) {
					const sep = Math.max(Math.abs(b.x - o.x) - b.hw - o.hw - 6, Math.abs(b.y - o.y) - 19);
					room = Math.min(room, gapTo(b, o.x, o.y, o.r + 8).gap, gapTo(o, b.x, b.y, b.r + 8).gap, sep);
				}
				if (!best || room > best.room) best = {x: b.x, y: b.y, room};
			}
			b.x = best.x;
			b.y = best.y;
			b.ang = Math.random() * Math.PI * 2;
			b.turn = 0;
			b.vx = Math.cos(b.ang) * SPEED;
			b.vy = Math.sin(b.ang) * SPEED;
			done.push(b);
		}
	};
	// Подпись под значком — прямоугольник: насколько и куда вытолкнуть значок,
	// чтобы подпись не заходила на круг (cx, cy, cr). null — не задевает.
	const labelHit = (b, cx, cy, cr) => {
		const top = b.y + b.r + 4;
		const px = clamp(cx, b.x - b.hw, b.x + b.hw);
		const py = clamp(cy, top, top + 15);
		const dx = px - cx;
		const dy = py - cy;
		const d = Math.hypot(dx, dy);
		if (d >= cr) return null;
		if (d < 1e-3) return {nx: 0, ny: cy < top + 9 ? 1 : -1, depth: cr};
		return {nx: dx / d, ny: dy / d, depth: cr - d};
	};
	// Зазор от значка (кружок и подпись под ним) до круга (cx, cy, cr) и направление «прочь» от круга.
	const gapTo = (b, cx, cy, cr) => {
		const dx = b.x - cx;
		const dy = b.y - cy;
		const dc = Math.hypot(dx, dy) || 1;
		const top = b.y + b.r + 4;
		const lx = clamp(cx, b.x - b.hw, b.x + b.hw) - cx;
		const ly = clamp(cy, top, top + 15) - cy;
		const dl = Math.hypot(lx, ly);
		if (dl > 1e-3 && dl < dc - b.r) return {gap: dl - cr, nx: lx / dl, ny: ly / dl};
		return {gap: dc - b.r - cr, nx: dx / dc, ny: dy / dc};
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

	// рамка: значок отскакивает внутрь и дальше летит от края (а не рулит обратно в стенку)
	const keepIn = (b) => {
		const L = lim(b);
		let hit = false;
		if (b.x < L.x0) [b.x, b.vx, hit] = [L.x0, Math.abs(b.vx), true];
		if (b.x > L.x1) [b.x, b.vx, hit] = [L.x1, -Math.abs(b.vx), true];
		if (b.y < L.y0) [b.y, b.vy, hit] = [L.y0, Math.abs(b.vy), true];
		if (b.y > L.y1) [b.y, b.vy, hit] = [L.y1, -Math.abs(b.vy), true];
		if (hit && !b.hover) b.ang = Math.atan2(b.vy, b.vx);
	};

	const step = (dt) => {
		for (const b of bodies) {
			if (b.hover) {
				// под курсором замирает, чтобы по нему было легко попасть
				const k = Math.exp(-12 * dt);
				b.vx *= k;
				b.vy *= k;
			} else {
				// блуждает: скорость поворота сама плавно меняется — путь из мягких дуг, без рывков
				b.turn += -b.turn * 1.1 * dt + (Math.random() - 0.5) * 3.2 * Math.sqrt(dt);
				b.ang += b.turn * dt;
				// рядом с рамкой, аватаркой и соседями заранее плавно отворачивает, а не бьётся и не ползёт вдоль края
				// (подпись под значком тоже считается — иначе она цепляла бы аватарку и значок дёргался)
				const L = lim(b);
				const near = (gap) => Math.max(0, 1 - gap / NEAR) ** 2;
				let fx = Math.cos(b.ang) + (near(b.x - L.x0) - near(L.x1 - b.x)) * 2.2;
				let fy = Math.sin(b.ang) + (near(b.y - L.y0) - near(L.y1 - b.y)) * 2.2;
				const ga = gapTo(b, A.x, A.y, A.r);
				fx += ga.nx * near(ga.gap) * 2.2;
				fy += ga.ny * near(ga.gap) * 2.2;
				for (const o of bodies) {
					if (o === b) continue;
					// ближе всего: мой значок к его кружку, его подпись к моему кружку или подписи друг к другу
					let g = gapTo(b, o.x, o.y, o.r + 8);
					const g2 = gapTo(o, b.x, b.y, b.r + 8);
					if (g2.gap < g.gap) g = {gap: g2.gap, nx: -g2.nx, ny: -g2.ny};
					const sx = Math.abs(b.x - o.x) - b.hw - o.hw - 6;
					const sy = Math.abs(b.y - o.y) - 19;
					const gl = Math.max(sx, sy);
					if (gl < g.gap) g = sx > sy ? {gap: gl, nx: Math.sign(b.x - o.x) || 1, ny: 0} : {gap: gl, nx: 0, ny: Math.sign(b.y - o.y) || 1};
					fx += g.nx * near(g.gap) * 1.4;
					fy += g.ny * near(g.gap) * 1.4;
				}
				b.ang += turnTo(b.ang, Math.atan2(fy, fx)) * (1 - Math.exp(-4 * dt));
				// скорость плавно догоняет направление
				const k = 1 - Math.exp(-2 * dt);
				b.vx += (Math.cos(b.ang) * SPEED - b.vx) * k;
				b.vy += (Math.sin(b.ang) * SPEED - b.vy) * k;
			}
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			// рамка виджета: значок отскакивает и не вылетает
			keepIn(b);
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
		// подписи двух значков не налезают друг на друга: расталкиваем по оси, где налезают меньше
		for (let i = 0; i < bodies.length; i++) {
			for (let j = i + 1; j < bodies.length; j++) {
				const a = bodies[i];
				const b = bodies[j];
				const ox = a.hw + b.hw + 6 - Math.abs(b.x - a.x);
				const oy = 19 - Math.abs(b.y - a.y);
				if (ox <= 0 || oy <= 0) continue;
				const hit = ox < oy ? {nx: Math.sign(b.x - a.x) || 1, ny: 0, depth: ox} : {nx: 0, ny: Math.sign(b.y - a.y) || 1, depth: oy};
				const wa = a.hover ? 0 : b.hover ? 1 : 0.5;
				if (wa > 0) push(a, {nx: -hit.nx, ny: -hit.ny, depth: hit.depth}, wa);
				if (wa < 1) push(b, hit, 1 - wa);
			}
		}
		// после всех толчков ещё раз держим значки внутри рамки
		for (const b of bodies) keepIn(b);
	};

	// На телефоне «Сотрудничество» — отдельный экран, и пока он скрыт, ширина рамки 0.
	// Тогда ничего не трогаем: иначе все значки сжались бы в один угол. Расставим, когда откроют.
	const shown = () => space.offsetWidth > 10;
	let placed = false;
	const fit = () => {
		if (!shown()) return false;
		if (!placed) {
			place();
			placed = true;
		} else {
			measure();
			for (const b of bodies) {
				const L = lim(b);
				b.x = clamp(b.x, L.x0, L.x1);
				b.y = clamp(b.y, L.y0, L.y1);
			}
		}
		draw();
		return true;
	};
	fit();
	// пиксельный шрифт подписей грузится позже — тогда подписи шире, перемеряем
	document.fonts?.ready.then(fit);
	new ResizeObserver(fit).observe(space);
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
			fit(); // раздел мог быть скрыт (другой экран на телефоне) — размеры обновляем
			last = performance.now();
			requestAnimationFrame(loop);
		}
	}).observe(space);
};
