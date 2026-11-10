// Подвал: большая надпись «1DEX1 SHOP» из блоков. Блоки светятся под курсором,
// ломаются кликом (трещины -> осколки, как в Minecraft) и через 3 секунды
// плавно появляются снова.
import {CROSSHAIR, wordPixels} from './pixel.js';

const RESPAWN = 3;
const APPEAR = 0.7;
const CRACK = 0.16;

// Три стадии трещин: каждая строка — ряд из пяти «пикселей» внутри блока
const CRACKS = [
	['..#..', '..#..', '.##..', '.#...', '.....'],
	['..#.#', '..##.', '.##..', '##.#.', '#..#.'],
	['#.#.#', '.###.', '###.#', '##.##', '#.##.'],
];

const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const easeOutCubic = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export const initFootWord = (canvas, {on = () => {}, reducedMotion = false} = {}) => {
	const ctx = canvas.getContext('2d');
	let cells = [];
	let cols = 1;
	let rows = 7;
	let cell = 10;
	let mouse = null;
	let visible = false;
	let t = 0;
	const particles = [];

	// На широком экране надпись в одну строку, на телефоне — в две
	const layout = (wide) => {
		const lines = wide ? ['1DEX1 SHOP'] : ['1DEX1', 'SHOP'];
		const words = lines.map(wordPixels);
		cols = Math.max(...words.map((w) => w.width));
		rows = lines.length * 7 + (lines.length - 1) * 2;
		cells = [];
		words.forEach((w, line) => {
			const offset = Math.floor((cols - w.width) / 2);
			for (const p of w.pixels) {
				cells.push({gx: p.x + offset, gy: line * 9 + (6 - p.y), glow: 0, crackAt: -1, brokenAt: -1});
			}
		});
	};

	const resize = () => {
		const w = canvas.clientWidth;
		if (!w) return;
		layout(w >= 560);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		cell = w / cols;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(cell * rows * dpr);
		canvas.style.height = `${cell * rows}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		draw();
	};

	const cellAt = (x, y) => {
		const gx = Math.floor(x / cell);
		const gy = Math.floor(y / cell);
		return cells.find((c) => c.gx === gx && c.gy === gy);
	};
	const alive = (c) => c && c.brokenAt < 0 && c.crackAt < 0;

	const colorOf = (g) =>
		// тёмный блок -> фиолетовый -> салатовый
		g < 0.5 ? mix([34, 27, 58], [154, 107, 255], g * 2) : mix([154, 107, 255], [184, 255, 61], (g - 0.5) * 2);

	const shatter = (c) => {
		c.brokenAt = t;
		c.crackAt = -1;
		const col = colorOf(Math.max(c.glow, 0.45));
		for (let i = 0; i < 8; i++) {
			particles.push({
				x: (c.gx + 0.2 + Math.random() * 0.6) * cell,
				y: (c.gy + 0.2 + Math.random() * 0.6) * cell,
				vx: (Math.random() - 0.5) * cell * 7,
				vy: -(1 + Math.random() * 5) * cell,
				life: 0.5 + Math.random() * 0.4,
				size: cell * (0.16 + Math.random() * 0.16),
				col,
			});
		}
		on('break');
	};

	const draw = () => {
		const w = canvas.clientWidth;
		const h = cell * rows;
		ctx.clearRect(0, 0, w, h);
		const gap = Math.max(1, cell * 0.08);
		const px = (cell - gap) / 5;
		for (const c of cells) {
			const cx = (c.gx + 0.5) * cell;
			const cy = (c.gy + 0.5) * cell;
			let target = reducedMotion ? 0 : (Math.sin(t * 1.4 - c.gx * 0.45) * 0.5 + 0.5) * 0.16;
			if (mouse) {
				const d = Math.hypot(mouse.x - cx, mouse.y - cy) / (cell * 3.2);
				target = Math.max(target, 1 - Math.min(1, d));
			}
			c.glow += (target - c.glow) * (target > c.glow ? 0.5 : 0.06);

			let alpha = 1;
			if (c.brokenAt >= 0) {
				const since = t - c.brokenAt;
				if (since < RESPAWN) continue;
				alpha = easeOutCubic((since - RESPAWN) / APPEAR);
				if (since >= RESPAWN + APPEAR) c.brokenAt = -1;
			}
			const x = c.gx * cell + gap / 2;
			const y = c.gy * cell + gap / 2;
			ctx.globalAlpha = alpha;
			ctx.fillStyle = `rgb(${colorOf(c.glow)})`;
			ctx.fillRect(x, y, cell - gap, cell - gap);

			if (c.crackAt >= 0) {
				// трещины становятся гуще, потом блок рассыпается
				const k = (t - c.crackAt) / CRACK;
				if (k >= 1) {
					shatter(c);
				} else {
					const stage = CRACKS[Math.min(2, Math.floor(k * 3))];
					ctx.fillStyle = 'rgba(8,5,16,.62)';
					stage.forEach((line, r) => {
						for (let i = 0; i < 5; i++) if (line[i] === '#') ctx.fillRect(x + i * px, y + r * px, px, px);
					});
				}
			}
		}
		ctx.globalAlpha = 1;
		for (let i = particles.length - 1; i >= 0; i--) {
			const p = particles[i];
			p.life -= 1 / 60;
			if (p.life <= 0) {
				particles.splice(i, 1);
				continue;
			}
			p.vy += cell * 22 * (1 / 60);
			p.x += p.vx / 60;
			p.y += p.vy / 60;
			ctx.globalAlpha = Math.min(1, p.life * 3);
			ctx.fillStyle = `rgb(${p.col})`;
			ctx.fillRect(p.x, p.y, p.size, p.size);
		}
		ctx.globalAlpha = 1;
	};

	const loop = () => {
		if (visible) {
			t += 1 / 60;
			draw();
		}
		requestAnimationFrame(loop);
	};

	const local = (e) => {
		const r = canvas.getBoundingClientRect();
		return {x: e.clientX - r.left, y: e.clientY - r.top};
	};
	canvas.addEventListener('pointermove', (e) => {
		mouse = local(e);
		// над блоком появляется прицел
		canvas.style.cursor = alive(cellAt(mouse.x, mouse.y)) ? CROSSHAIR : '';
	});
	canvas.addEventListener('pointerleave', () => {
		mouse = null;
		canvas.style.cursor = '';
	});
	let downAt = null;
	canvas.addEventListener('pointerdown', (e) => (downAt = local(e)));
	canvas.addEventListener('pointerup', (e) => {
		const p = local(e);
		if (!downAt || Math.hypot(p.x - downAt.x, p.y - downAt.y) > 10) return;
		const c = cellAt(p.x, p.y);
		if (alive(c)) c.crackAt = t;
		if (e.pointerType !== 'mouse') mouse = null;
	});

	new ResizeObserver(resize).observe(canvas);
	new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);
	resize();
	requestAnimationFrame(loop);
};
