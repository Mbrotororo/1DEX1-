// Пиксель-арт предметов (свой, в духе игры). ЧИСТЫЙ модуль: один и тот же рисунок
// идёт и в 3D (PixelItem), и в DOM-интерфейс (ItemIcon).
// Строка 0 — верх; символ — цвет из палитры; '.' — прозрачно.

export type ItemArt = {
	rows: string[];
	palette: Record<string, string>;
	// точка хвата (пиксель от левого нижнего угла) — где предмет зажат в кулаке
	grip?: [number, number];
	// инструмент/оружие: держится рукоятью, остриё вперёд; иначе — просто в ладони
	tool?: boolean;
};

const K = '#1b1b22';

const sword = (light: string, mid: string, dark: string): ItemArt => ({
	rows: [
		'.............KKK',
		'............KLMK',
		'...........KLMDK',
		'..........KLMDK.',
		'.........KLMDK..',
		'........KLMDK...',
		'..KK...KLMDK....',
		'..KGK.KLMDK.....',
		'...KGKLMDK......',
		'....KGGDK.......',
		'.....KGGK.......',
		'....KHKGGK......',
		'...KHK.KGK......',
		'..KHK...KK......',
		'.KPK............',
		'.KK.............',
	],
	palette: {K, L: light, M: mid, D: dark, G: '#3d3a36', H: '#7a5a34', P: '#4a4640'},
	grip: [3, 3],
	tool: true,
});

const potion = (liquid: string, light: string, dark: string): ItemArt => ({
	rows: [
		'................',
		'......KKKK......',
		'......KCCK......',
		'......KGGK......',
		'.....KGWWGK.....',
		'....KGLLLLGK....',
		'...KGLLLLLLGK...',
		'...KGLHLLLLGK...',
		'..KGLHLLLLLLGK..',
		'..KGLHLLLLLLGK..',
		'..KGLLLLLLLDGK..',
		'..KGLLLLLLDDGK..',
		'...KGLLLLDDGK...',
		'...KGGGGGGGGK...',
		'....KKKKKKKK....',
		'................',
	],
	palette: {K: '#3a3d4a', C: '#8a5a2e', G: '#cfe4ee', W: '#f4fbff', L: liquid, H: light, D: dark},
	grip: [8, 5],
});

const heart = (left: string, right: string, shine: string): ItemArt => ({
	rows: ['.KK...KK.', 'KLLK.KRRK', 'KLSLKRRRK', 'KLLLLRRRK', 'KLLLLRRRK', '.KLLLRRK.', '..KLLRK..', '...KLK...', '....K....'],
	palette: {K: '#1a0508', L: left, R: right, S: shine},
});

export const ART = {
	ironSword: sword('#f4f4f4', '#c4c8cc', '#8a9096'),
	diamondSword: sword('#b8fff4', '#4ee0d4', '#1f9a98'),
	// булава: тяжёлое навершие на ветряном стержне
	mace: {
		rows: [
			'.........KKKKK..',
			'........KDDDDDK.',
			'.......KDLLLDDDK',
			'.......KDLDDDDSK',
			'.......KDLDDPDSK',
			'.......KDDDPDDSK',
			'.......KDDDDDSSK',
			'........KDSSSSK.',
			'.......KHKKKKK..',
			'......KHBK......',
			'.....KHBK.......',
			'....KHBK........',
			'...KHBK.........',
			'..KHBK..........',
			'.KCBK...........',
			'.KKK............',
		],
		palette: {K, D: '#5d6672', L: '#b9c4d0', S: '#394049', P: '#8f6ad8', H: '#cfe6f6', B: '#8aa9c4', C: '#5a6f86'},
		grip: [3, 3],
		tool: true,
	},
	snowball: {
		rows: [
			'................',
			'................',
			'................',
			'.....KKKKKK.....',
			'....KWWWWWWK....',
			'...KWWLLWWWWK...',
			'...KWLLWWWWWK...',
			'...KWWWWWWWSK...',
			'...KWWWWWWWSK...',
			'...KWWWWWWSSK...',
			'...KSWWWWSSSK...',
			'....KSSSSSSK....',
			'.....KKKKKK.....',
			'................',
			'................',
			'................',
		],
		palette: {K: '#8fa4ba', W: '#f2f8fc', L: '#ffffff', S: '#c9d9e8'},
		grip: [8, 5],
	},
	enderPearl: {
		rows: [
			'................',
			'................',
			'................',
			'.....KKKKKK.....',
			'....KTTTTTTK....',
			'...KTHHTTTTDK...',
			'...KTHTTTTDDK...',
			'...KTTTEETDDK...',
			'...KTTTEETDDK...',
			'...KTTTTTDDDK...',
			'...KDTTTDDDDK...',
			'....KDDDDDDK....',
			'.....KKKKKK.....',
			'................',
			'................',
			'................',
		],
		palette: {K: '#07221f', T: '#1f8274', H: '#9af0de', D: '#12564e', E: '#0b3a36'},
		grip: [8, 5],
	},
	trialKey: {
		rows: [
			'................',
			'.........KKKKK..',
			'........KOLLOOK.',
			'.......KOLKKKOOK',
			'.......KOK...KOK',
			'.......KOK...KDK',
			'.......KOOKKKODK',
			'......KOLOOODDK.',
			'.....KOLOKKKKK..',
			'....KOLOK.......',
			'...KOLOK........',
			'..KOLOKOK.......',
			'.KOLOK.KDK......',
			'.KOOK...K.......',
			'.KDK............',
			'..K.............',
		],
		palette: {K: '#2a1508', O: '#e08648', L: '#f8c08c', D: '#a8582a'},
		grip: [4, 4],
	},
	enchantedBook: {
		rows: [
			'................',
			'................',
			'...KKKKKKKKKK...',
			'..KBBBBBBBBBBK..',
			'..KBbbbbbbbBBK..',
			'..KBbBBBBBbBBK..',
			'..KBbBYYBBbBBK..',
			'..KBbBYYBBbBBK..',
			'..KBbBBBBBbBBK..',
			'..KBbbbbbbbBRK..',
			'..KBBBBBBBBBRK..',
			'..KWWWWWWWWWRK..',
			'..KKKKKKKKKKRK..',
			'............RR..',
			'............R...',
			'................',
		],
		palette: {K: '#2a1420', B: '#7a3b8f', b: '#a55cc0', Y: '#ffd95a', W: '#f0e8d8', R: '#d02c3c'},
		grip: [8, 5],
	},
	bow: {
		rows: [
			'...........KKKKK',
			'.........KKBBBSK',
			'........KBBKKSK.',
			'.......KBKK.S...',
			'......KBK..S....',
			'.....KBK..S.....',
			'....KBK..S......',
			'....KBK.S.......',
			'...KBK.S........',
			'...KBKS.........',
			'..KBKS..........',
			'..KBS...........',
			'.KBSK...........',
			'.KSK............',
			'KSK.............',
			'KK..............',
		],
		palette: {K: '#2a1c0c', B: '#8a6030', S: '#e8e8e8'},
		grip: [5, 9],
		tool: true,
	},
	arrow: {
		rows: [
			'.............KKK',
			'............KIIK',
			'...........KSIIK',
			'..........KSKKK.',
			'.........KSK....',
			'........KSK.....',
			'.......KSK......',
			'......KSK.......',
			'.....KSK........',
			'..K.KSK.........',
			'.KFKSK..........',
			'KFFSK...........',
			'.KSFFK..........',
			'KSKFK...........',
			'KK.K............',
			'................',
		],
		palette: {K: '#2a1c0c', I: '#d8dce0', S: '#8a6030', F: '#f0f0f0'},
		grip: [7, 7],
		tool: true,
	},
	fireworkRocket: {
		rows: [
			'................',
			'.......KK.......',
			'......KRRK......',
			'.....KRRRRK.....',
			'.....KRWRRK.....',
			'.....KWRRWK.....',
			'.....KRRWRK.....',
			'.....KRWRRK.....',
			'.....KWRRWK.....',
			'.....KRRWRK.....',
			'.....KKKKKK.....',
			'......KSK.......',
			'......KSK.......',
			'......KSK.......',
			'......KSK.......',
			'.......K........',
		],
		palette: {K: '#2a1c1c', R: '#d8342c', W: '#f4f0e8', S: '#8a6030'},
		grip: [7, 3],
	},
	diamond: {
		rows: [
			'................',
			'................',
			'................',
			'.....KKKKKK.....',
			'....KLLLLDDK....',
			'...KLWLLLDDDK...',
			'..KLWLLLLDDDDK..',
			'..KLLLLLDDDDDK..',
			'...KLLLDDDDDK...',
			'....KLLDDDDK....',
			'.....KLDDDK.....',
			'......KDDK......',
			'.......KK.......',
			'................',
			'................',
			'................',
		],
		palette: {K: '#0c3a40', L: '#8ff4ea', W: '#ffffff', D: '#34c4c0'},
		grip: [8, 5],
	},
	goldIngot: {
		rows: [
			'................',
			'................',
			'................',
			'................',
			'......KKKKKKKK..',
			'.....KLLLLLLYK..',
			'....KLLLLLLYDK..',
			'...KLLLLLLYDDK..',
			'..KYYYYYYYDDK...',
			'..KYYYYYYDDK....',
			'..KDDDDDDDK.....',
			'..KKKKKKKK......',
			'................',
			'................',
			'................',
			'................',
		],
		palette: {K: '#5a3a08', L: '#fff08a', Y: '#f8c832', D: '#c88a14'},
		grip: [8, 6],
	},
	emptyBottle: potion('#e6f3fa', '#f8fdff', '#cfe4ee'),
	heartFull: heart('#e8242c', '#e8242c', '#ff9aa0'),
	heartHalf: heart('#e8242c', '#3c1a1e', '#ff9aa0'),
	heartEmpty: heart('#3c1a1e', '#3c1a1e', '#55282c'),
} satisfies Record<string, ItemArt>;

export type ItemName = keyof typeof ART;

// Зелье с жидкостью любого цвета: potionArt('#38c8ff') — голубое зелье скорости
export const potionArt = (color: string): ItemArt => {
	const n = parseInt(color.replace('#', ''), 16);
	const ch = (v: number, k: number) => Math.max(0, Math.min(255, Math.round(v * k + (k > 1 ? 40 : 0))));
	const hex = (k: number) =>
		'#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v, k).toString(16).padStart(2, '0')).join('');
	return potion(color, hex(1.25), hex(0.7));
};

// Цвет зелья Скорости (как в игре — голубой)
export const SPEED_POTION = '#33ccff';

export const artSize = (art: ItemArt): [number, number] => [art.rows[0].length, art.rows.length];

// RGBA-байты рисунка (строка 0 — верх)
export const artPixels = (art: ItemArt): {data: Uint8Array; w: number; h: number} => {
	const [w, h] = artSize(art);
	const data = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const hex = art.palette[art.rows[y][x] ?? '.'];
			if (!hex) continue;
			const n = parseInt(hex.replace('#', ''), 16);
			const i = (y * w + x) * 4;
			data[i] = (n >> 16) & 255;
			data[i + 1] = (n >> 8) & 255;
			data[i + 2] = n & 255;
			data[i + 3] = 255;
		}
	}
	return {data, w, h};
};

export const resolveArt = (art: ItemName | ItemArt): ItemArt => (typeof art === 'string' ? ART[art] : art);
