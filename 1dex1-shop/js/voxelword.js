// Надпись «1DEX1 SHOP» из множества маленьких блоков — для первого экрана и подвала.
// Буквы берутся из настоящего шрифта сайта (Rubik Mono One): текст рисуется на скрытом холсте
// и разбивается на клетки, каждая закрашенная клетка — блок. Клик ломает сразу кучку блоков,
// они разлетаются и быстро вырастают снова: сначала по краям, потом в середине.

export const VOXEL_FONT = '"Rubik Mono One", "Arial Black", sans-serif';

// дождаться шрифта (если не загрузится — буквы будут из запасного шрифта)
export const fontReady = () => {
	if (!document.fonts?.load) return Promise.resolve();
	return Promise.race([document.fonts.load(`400 64px ${VOXEL_FONT}`).catch(() => null), new Promise((r) => setTimeout(r, 2500))]);
};

// Разбить строки текста на клетки.
// rows — высота заглавной буквы в блоках. Возвращает {cells, width, height}:
// у клетки x, y — центр (начало координат — середина надписи, y вверх), gx, gy — номер клетки,
// ty — 0 у верха строки и 1 у низа (для градиента), seed — случайное число клетки.
export const rasterize = (lines, rows) => {
	const S = 6; // пикселей холста на клетку: по ним считается, закрашена ли клетка
	const c = document.createElement('canvas');
	const g = c.getContext('2d', {willReadFrequently: true});
	g.font = `400 100px ${VOXEL_FONT}`;
	const cap = g.measureText('H').actualBoundingBoxAscent || 72;
	const font = `400 ${(100 * rows * S) / cap}px ${VOXEL_FONT}`;
	g.font = font;
	const widths = lines.map((l) => g.measureText(l).width);
	const gap = Math.round(rows * 0.42); // между строками, в клетках
	const lineH = rows + gap;
	const W = Math.ceil(Math.max(...widths) / S) + 4;
	const H = lines.length * lineH - gap + 4;
	c.width = W * S;
	c.height = H * S;
	g.font = font;
	g.fillStyle = '#fff';
	g.textBaseline = 'alphabetic';
	lines.forEach((l, i) => g.fillText(l, (c.width - widths[i]) / 2, (2 + i * lineH + rows) * S));
	const px = g.getImageData(0, 0, c.width, c.height).data;
	const raw = [];
	for (let gy = 0; gy < H; gy++) {
		for (let gx = 0; gx < W; gx++) {
			let sum = 0;
			for (let y = 1; y < S; y += 2) for (let x = 1; x < S; x += 2) sum += px[((gy * S + y) * c.width + gx * S + x) * 4 + 3];
			if (sum / ((S / 2) * (S / 2) * 255) > 0.5) raw.push({gx, gy});
		}
	}
	if (!raw.length) return {cells: [], width: 1, height: 1};
	const minX = Math.min(...raw.map((p) => p.gx));
	const maxX = Math.max(...raw.map((p) => p.gx));
	const minY = Math.min(...raw.map((p) => p.gy));
	const maxY = Math.max(...raw.map((p) => p.gy));
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	let seed = 9;
	const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const cells = raw.map(({gx, gy}) => {
		const line = Math.min(lines.length - 1, Math.floor((gy - 2) / lineH));
		const ty = Math.min(1, Math.max(0, (gy - 2 - line * lineH) / Math.max(1, rows - 1)));
		return {gx, gy, x: gx - cx, y: cy - gy, ty, line, seed: rand()};
	});
	return {cells, width: maxX - minX + 1, height: maxY - minY + 1, cx, cy};
};

// Быстрый поиск клетки по координатам надписи
export const cellIndex = (word) => {
	const map = new Map();
	word.cells.forEach((v, i) => map.set(`${v.gx},${v.gy}`, i));
	// ближайшая к точке (x, y) клетка, которую можно сломать (в пределах max клеток)
	return (list, x, y, max = 0.8) => {
		const gx = Math.round(x + word.cx);
		const gy = Math.round(word.cy - y);
		let best = -1;
		let bestD = max;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const i = map.get(`${gx + dx},${gy + dy}`);
				if (i === undefined || list[i].brokenAt >= 0) continue;
				const d = Math.hypot(list[i].x - x, list[i].y - y);
				if (d < bestD) {
					best = i;
					bestD = d;
				}
			}
		}
		return best;
	};
};

// Сломать блоки вокруг точки (x, y). Ломаются волной от центра, вырастают с краёв к центру.
// Возвращает сломанные блоки (для осколков).
export const burst = (list, x, y, now, radius, {regrow = 1.05, spread = 0.55} = {}) => {
	const out = [];
	for (const v of list) {
		if (v.brokenAt >= 0) continue;
		const d = Math.hypot(v.x - x, v.y - y) / radius;
		if (d + (v.seed - 0.5) * 0.4 > 1) continue; // неровный край пролома
		v.brokenAt = now + d * 0.09;
		v.regrowAt = v.brokenAt + regrow + (1 - d) * spread + v.seed * 0.25;
		out.push(v);
	}
	return out;
};

const easeOutBack = (x) => {
	const k = Math.min(1, Math.max(0, x)) - 1;
	return 1 + 2.4 * k * k * k + 1.4 * k * k;
};

// Размер блока сейчас: 1 — целый, 0 — сломан, между — вырастает (чуть «выпрыгивая»).
// phase: 'whole' | 'gone' | 'grow' — пригодится, чтобы рисовать разлетающиеся куски.
export const APPEAR = 0.32;
export const voxelState = (v, now) => {
	if (v.brokenAt < 0 || now < v.brokenAt) return 1;
	if (now < v.regrowAt) return 0;
	const k = (now - v.regrowAt) / APPEAR;
	if (k >= 1) {
		v.brokenAt = -1;
		return 1;
	}
	return Math.max(0.0001, easeOutBack(k));
};
