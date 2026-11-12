// Пиксельная графика без картинок: буквы логотипа, иконки и обложки
// рисуются из маленьких «карт», где каждый символ — один пиксель.

// Буквы 5x7 для объёмного логотипа и подвала
export const GLYPHS = {
	'1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
	D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
	E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
	X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
	S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
	H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
	O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
	P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
	// кириллица для «ЖИЗНЬ»
	Ж: ['#.#.#', '#.#.#', '#.#.#', '.###.', '#.#.#', '#.#.#', '#.#.#'],
	И: ['#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#'],
	З: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
	Ь: ['#....', '#....', '#....', '####.', '#...#', '#...#', '####.'],
};
GLYPHS.Н = GLYPHS.H;

// Список пикселей слова: [{x, y, row}] — y растёт вверх. Пробел занимает 3 пикселя.
export const wordPixels = (word) => {
	const out = [];
	let cursor = 0;
	for (const ch of word) {
		const rows = GLYPHS[ch];
		if (!rows) {
			cursor += 3;
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

// Курсор-прицел, как в Minecraft: появляется над блоками, которые можно сломать
const crosshairSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" shape-rendering="crispEdges">' +
	'<path d="M13 4h6v9h9v6h-9v9h-6v-9H4v-6h9z" fill="#0c0914"/>' +
	'<path d="M15 6h2v9h9v2h-9v9h-2v-9H6v-2h9z" fill="#fff"/></svg>';
export const CROSSHAIR = `url("data:image/svg+xml,${encodeURIComponent(crosshairSvg)}") 16 16, crosshair`;

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

// ---------- иконки (9x9) ----------
export const ICONS = {
	// достижения
	pick: ['..SSSSS..', '.S....wS.', '......bS.', '.....b.S.', '....b..S.', '...b.....', '..b......', '.b.......', 'b........'],
	boom: ['r...g...r', '.r.ggg.r.', '..gGGGg..', '.ggGwGgg.', 'gGGwwwGGg', '.ggGwGgg.', '..gGGGg..', '.r.ggg.r.', 'r...g...r'],
	cube: ['...PPP...', '.PPPPPPP.', 'PPPPPPPPP', 'pPPPPPPPq', 'pppPPPqqq', 'pppppqqqq', 'pppppqqqq', '.ppppqqq.', '...ppq...'],
	chest: ['.........', '.qqqqqqq.', 'qpppppppq', 'qpppppppq', 'qqqqgqqqq', 'qpppgpppq', 'qpppppppq', 'qpppppppq', '.qqqqqqq.'],
	home: ['....p....', '...ppp...', '..ppppp..', '.ppppppp.', 'ppppppppp', '.pPPPPPp.', '.pPPkPPp.', '.pPPkPPp.', '.pppkppp.'],
	face: ['.ggggggg.', 'ggggggggg', 'ggkgggkgg', 'ggkgggkgg', 'ggggggggg', 'gkgggggkg', 'ggkkkkkgg', 'ggggggggg', '.ggggggg.'],
	plane: ['........p', '......ppP', '....ppPPP', '..ppPPPP.', 'ppPPqPPP.', '..pqqPP..', '...qqP...', '...qP....', '...q.....'],
	shovel: ['.......SS', '......SwS', '.....bSS.', '....b....', '...b.....', '.sb......', 'sSs......', 'sSSs.....', '.ss......'],
	gem: ['....l....', '...lLl...', '..lLLLl..', '.lLLwLLl.', 'lLLwLLLLl', '.lLLLLLl.', '..lLLLl..', '...lLl...', '....l....'],
	// портал в Незер: рамка из обсидиана, внутри — фиолетовая завеса
	portal: ['.ddddddd.', '.dqpPpqd.', '.dpPqPpd.', '.dqpPpqd.', '.dpqPqpd.', '.dPpqpPd.', '.dqPpPqd.', '.dpqpqpd.', '.ddddddd.'],
	feather: ['......PPP', '.....PwwP', '....PwwP.', '...PwwP..', '..PwwP...', '.PwPP....', '.PP......', 'p........', '.........'],
	// интерфейс
	lock: ['...ddd...', '..d...d..', '..d...d..', '.ddddddd.', '.dsssssd.', '.dssdssd.', '.dssdssd.', '.dsssssd.', '.ddddddd.'],
	trophy: ['ggggggggg', 'g.gGGGg.g', 'g.gGGGg.g', '.ggGGGgg.', '..gGGGg..', '...ggg...', '....g....', '...ggg...', '..ggggg..'],
	user: ['...ppp...', '..pPPPp..', '..pPPPp..', '..pPPPp..', '...ppp...', '.ppppppp.', 'pPPPPPPPp', 'pPPPPPPPp', 'ppppppppp'],
	camera: ['.........', '..www....', 'wwwwwwwww', 'wwwkkkwww', 'wwkwwwkww', 'wwkwwwkww', 'wwwkkkwww', 'wwwwwwwww', '.........'],
	// эмоции персонажа
	heart: ['.rr...rr.', 'rwrr.rrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....', '.........'],
	note: ['...pppppp', '...pppppp', '...p....p', '...p....p', '...p....p', '.ppp..ppp', 'pppp.pppp', 'pppp.pppp', '.pp...pp.'],
	coin: ['..ggggg..', '.gGGGGGg.', 'gGGhhhGGg', 'gGhGGGGGg', 'gGhGGGGGg', 'gGhGGGGGg', 'gGGhhhGGg', '.gGGGGGg.', '..ggggg..'],
	play: ['.........', '.rrrrrrr.', 'rrrwrrrrr', 'rrrwwrrrr', 'rrrwwwrrr', 'rrrwwrrrr', 'rrrwrrrrr', '.rrrrrrr.', '.........'],
};

export const icon = (name, cls = 'pxi') => pixelSvg(ICONS[name] || ICONS.lock, C, cls);

// ---------- иконки нижней панели: одноцветные, цвет берут из текста ----------
const NAV = {
	home: ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '.##...##.', '.##...##.', '.##...##.'],
	shop: ['####.####', '####.####', '####.####', '####.####', '.........', '####.####', '####.####', '####.####', '####.####'],
	// кейс всегда золотой, как акцент
	case: ['.ggggggg.', 'gGGGGGGGg', 'ggggggggg', 'hhhhwhhhh', 'ggggwgggg', 'ggggggggg', 'ggggggggg', 'hhhhhhhhh', '.hhhhhhh.'],
	user: ['...###...', '..#####..', '..#####..', '..#####..', '...###...', '.........', '.#######.', '#########', '#########'],
	// документы в подвале: лист с текстом, щит с замочной скважиной, сумка покупки
	terms: ['######...', '#....##..', '#.##.#.#.', '#....####', '#.#####.#', '#.......#', '#.####..#', '#.......#', '#########'],
	privacy: ['#########', '####.####', '###...###', '####.####', '####.####', '.#######.', '..#####..', '...###...', '....#....'],
	offer: ['..#####..', '..#...#..', '#########', '#########', '##.###.##', '#########', '#########', '#########', '.#######.'],
};
export const navIcon = (name) => pixelSvg(NAV[name], {...C, '#': 'currentColor'}, 'pxi');

// ---------- кейс: сундук с крышкой (16 клеток в ширину) ----------
const CASE_LID = ['.kkkkkkkkkkkkkk.', 'kGPPPPPPPPPPPPGk', 'kgppppppppppppgk', 'kgppppppppppppgk', 'kgqqqqqqqqqqqqhk', 'kkkkkkkkkkkkkkkk'];
const CASE_BASE = ['kgpppppkkpppppgk', 'kgppppkGgkppppgk', 'kgppppkghkppppgk', 'kgpppppkkpppppgk', 'kgppppppppppppgk', 'kgppppppppppppgk', 'kgqqqqqqqqqqqqhk', 'kGhhhhhhhhhhhhhk', '.kkkkkkkkkkkkkk.'];
export const caseArt = () =>
	`<span class="case__lid">${pixelSvg(CASE_LID, C)}</span><span class="case__base">${pixelSvg(CASE_BASE, C)}</span>`;


// ---------- обложки товаров (12x12), если у товара нет своей картинки ----------
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
