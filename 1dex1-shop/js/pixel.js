// Пиксельная графика без картинок: буквы логотипа, иконки и обложки
// рисуются из маленьких «карт», где каждый символ — один пиксель.

// Буквы 5x7 для объёмного логотипа и подвала
export const GLYPHS = {
	'1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
	D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
	E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
	X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
};

// Список пикселей слова: [{x, y, row}] — y растёт вверх
export const wordPixels = (word) => {
	const out = [];
	let cursor = 0;
	for (const ch of word) {
		const rows = GLYPHS[ch];
		if (!rows) {
			cursor += 4;
			continue;
		}
		rows.forEach((line, r) => {
			[...line].forEach((c, i) => {
				if (c === '#') out.push({x: cursor + i, y: rows.length - 1 - r, row: r});
			});
		});
		cursor += rows[0].length + 1;
	}
	return {pixels: out, width: cursor - 1, height: 7};
};

// SVG из пиксельной карты. palette: {символ: цвет}, '.' — прозрачно
export const pixelSvg = (rows, palette, cls = '') => {
	const h = rows.length;
	const w = rows[0].length;
	let rects = '';
	rows.forEach((line, y) => {
		// соседние пиксели одного цвета склеиваем в одну полоску
		let x = 0;
		while (x < w) {
			const ch = line[x];
			let run = 1;
			while (x + run < w && line[x + run] === ch) run++;
			if (palette[ch]) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${palette[ch]}"/>`;
			x += run;
		}
	});
	return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
};

const C = {
	p: '#9a6bff', // фиолетовый
	P: '#c3a6ff',
	q: '#5b34c9',
	l: '#b8ff3d', // салатовый
	L: '#e2ffab',
	m: '#6fae12',
	g: '#ffc83d', // золотой
	G: '#ffe59a',
	h: '#b37d00',
	w: '#f5f2ff',
	k: '#0c0914',
	s: '#746c8f',
	S: '#aaa3c2',
	d: '#2c2444',
	r: '#ff5a5a',
	b: '#6a4a2a',
	B: '#8f6a40',
};

// ---------- иконки достижений (9x9) ----------
export const ICONS = {
	pick: ['..SSSSS..', '.S....wS.', '......bS.', '.....b.S.', '....b..S.', '...b.....', '..b......', '.b.......', 'b........'],
	boom: ['r...g...r', '.r.ggg.r.', '..gGGGg..', '.ggGwGgg.', 'gGGwwwGGg', '.ggGwGgg.', '..gGGGg..', '.r.ggg.r.', 'r...g...r'],
	heart: ['.........', '.ll...ll.', 'lLLl.lLLl', 'lLLLlLLLl', 'lLLLLLLLl', '.lLLLLLl.', '..lLLLl..', '...lLl...', '....l....'],
	server: ['.ddddddd.', 'dSSSSSSSd', 'dS.l.g.Sd', 'dSSSSSSSd', '.ddddddd.', 'dSSSSSSSd', 'dS.l.g.Sd', 'dSSSSSSSd', '.ddddddd.'],
	bulb: ['...ggg...', '..gGGGg..', '.gGGwGGg.', '.gGGGGGg.', '.gGGGGGg.', '..gGGGg..', '...SSS...', '...SSS...', '....S....'],
	play: ['.........', '.rrrrrrr.', 'rrrwrrrrr', 'rrrwwrrrr', 'rrrwwwrrr', 'rrrwwrrrr', 'rrrwrrrrr', '.rrrrrrr.', '.........'],
	plane: ['........p', '......ppP', '....ppPPP', '..ppPPPP.', 'ppPPqPPP.', '..pqqPP..', '...qqP...', '...qP....', '...q.....'],
	bedrock: ['dsdSddsdd', 'sddsdSdds', 'ddSddsddS', 'sdddSddsd', 'dSdsdddSd', 'ddsddSdds', 'Sdddsdddd', 'dsdSddsdS', 'ddsdddSdd'],
	eye: ['.........', '..PPPPP..', '.PwwwwwP.', 'PwwpppwwP', 'PwwpkpwwP', 'PwwpppwwP', '.PwwwwwP.', '..PPPPP..', '.........'],
	lock: ['...ddd...', '..d...d..', '..d...d..', '.ddddddd.', '.dsssssd.', '.dssdssd.', '.dssdssd.', '.dsssssd.', '.ddddddd.'],
	home: ['....p....', '...ppp...', '..ppppp..', '.ppppppp.', 'ppppppppp', '.pPPPPPp.', '.pPPkPPp.', '.pPPkPPp.', '.pppkppp.'],
	chest: ['.........', '.qqqqqqq.', 'qpppppppq', 'qpppppppq', 'qqqqgqqqq', 'qpppgpppq', 'qpppppppq', 'qpppppppq', '.qqqqqqq.'],
	trophy: ['ggggggggg', 'g.gGGGg.g', 'g.gGGGg.g', '.ggGGGgg.', '..gGGGg..', '...ggg...', '....g....', '...ggg...', '..ggggg..'],
};

export const icon = (name, cls = 'pxi') => pixelSvg(ICONS[name] || ICONS.lock, C, cls);

// ---------- обложки товаров (12x12), пока нет своих картинок ----------
const MYSTERY = [
	'qqqqqqqqqqqq',
	'qPppppppppPq',
	'qpp......ppq',
	'qp..gggg..pq',
	'qp.gg..gg.pq',
	'qp.....gg.pq',
	'qp....gg..pq',
	'qp...gg...pq',
	'qp........pq',
	'qp...gg...pq',
	'qPp......pPq',
	'qqqqqqqqqqqq',
];
const PALETTE_ART = [
	'dddddddddddd',
	'dlLllldpPppd',
	'dLllmldPppqd',
	'dllmlldppqpd',
	'dlmllldpqppd',
	'dmllmldqppqd',
	'dddddddddddd',
	'dgGggdsSssdd',
	'dGgghdSsssdd',
	'dgghgdssSsdd',
	'dghggdsssSdd',
	'dddddddddddd',
];

// Три расцветки, чтобы соседние карточки не были одинаковыми
const TINTS = [
	{},
	{p: '#b8ff3d', P: '#e2ffab', q: '#6fae12', g: '#f5f2ff'},
	{p: '#ffc83d', P: '#ffe59a', q: '#b37d00', g: '#2a1a5c'},
];

// У ресурс-паков цвета четырёх «текстур» меняются местами
const GROUPS = [
	['l', 'L', 'm'],
	['p', 'P', 'q'],
	['g', 'G', 'h'],
];
const rotated = (shift) => {
	const out = {};
	GROUPS.forEach((group, i) => group.forEach((ch, j) => (out[ch] = C[GROUPS[(i + shift) % 3][j]])));
	return out;
};

export const coverArt = (kind, index) => {
	if (kind === 'mod') return pixelSvg(MYSTERY, {...C, '.': '#171226', ...TINTS[index % 3]}, 'cover-art');
	return pixelSvg(PALETTE_ART, {...C, ...rotated(index % 3)}, 'cover-art');
};
