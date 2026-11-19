import {blitPixels, drawChatIcon, drawRecIcon, getGrassIcon, getWallpaper} from './art';
import {circle, fillRR, greek, rrect, text, withAlpha, type Ctx} from './draw';

// Рабочий стол: зимние обои, значки Minecraft / Discord / OBS Studio слева, панель задач снизу.

export type AppId = 'mc' | 'chat' | 'rec';

// Центры значков на рабочем столе (логические px) — для ключей курсора
export const DESKTOP_ICONS: Record<AppId, [number, number]> = {
	mc: [84, 84],
	chat: [84, 222],
	rec: [84, 360],
};
const LABELS: Record<AppId, string> = {mc: 'Minecraft', chat: 'Discord', rec: 'OBS Studio'};

export const drawAppIcon = (ctx: Ctx, app: AppId | 'folder', x: number, y: number, size: number) => {
	if (app === 'mc') ctx.drawImage(getGrassIcon(), x - size / 2, y - size / 2, size, size);
	else if (app === 'chat') drawChatIcon(ctx, x, y, size * 0.92, 0.5);
	else if (app === 'rec') drawRecIcon(ctx, x, y, size * 0.92);
	else {
		// папка
		fillRR(ctx, x - size * 0.42, y - size * 0.3, size * 0.4, size * 0.2, size * 0.05, '#e0a92e');
		fillRR(ctx, x - size * 0.42, y - size * 0.2, size * 0.84, size * 0.52, size * 0.06, '#f6c445');
	}
};

export type DesktopState = {
	// выделенный значок (после первого клика)
	selected?: AppId | null;
	// значок под курсором
	hover?: AppId | null;
	// запущенные приложения (точка на панели задач)
	running?: AppId[];
	// активное окно (подсвеченная иконка на панели)
	active?: AppId | null;
};

export const drawDesktop = (ctx: Ctx, t: number, st: DesktopState = {}) => {
	blitPixels(ctx, getWallpaper(), 0, 0, 1280, 720);
	// значки
	(Object.keys(DESKTOP_ICONS) as AppId[]).forEach((id) => {
		const [x, y] = DESKTOP_ICONS[id];
		const sel = st.selected === id;
		const hov = st.hover === id;
		if (sel || hov) {
			fillRR(ctx, x - 64, y - 60, 128, 130, 8, sel ? 'rgba(120,170,255,0.34)' : 'rgba(255,255,255,0.16)');
			if (sel) {
				ctx.strokeStyle = 'rgba(170,205,255,0.75)';
				ctx.lineWidth = 1.5;
				rrect(ctx, x - 64, y - 60, 128, 130, 8);
				ctx.stroke();
			}
		}
		// мягкая тень под значком
		withAlpha(ctx, 0.3, () => {
			ctx.save();
			ctx.translate(x, y + 30);
			ctx.scale(1, 0.3);
			circle(ctx, 0, 0, 30, '#000000');
			ctx.restore();
		});
		drawAppIcon(ctx, id, x, y - 10, 72);
		text(ctx, LABELS[id], x + 1.5, y + 49.5, {size: 18, weight: 600, color: 'rgba(0,0,0,0.65)', align: 'center'});
		text(ctx, LABELS[id], x, y + 48, {size: 18, weight: 600, color: '#ffffff', align: 'center'});
	});
	drawTaskbar(ctx, t, st);
};

// Панель задач (низ экрана, 52 px)
export const drawTaskbar = (ctx: Ctx, _t: number, st: DesktopState = {}) => {
	const y0 = 668;
	ctx.fillStyle = 'rgba(22,26,38,0.86)';
	ctx.fillRect(0, y0, 1280, 52);
	ctx.fillStyle = 'rgba(255,255,255,0.09)';
	ctx.fillRect(0, y0, 1280, 1);
	const cy = y0 + 26;
	const icons: (AppId | 'start' | 'folder')[] = ['start', 'folder', 'mc', 'chat', 'rec'];
	const step = 50;
	const x0 = 640 - ((icons.length - 1) * step) / 2 + 60;
	// поиск — плашка без текста
	fillRR(ctx, x0 - 50 - 170, cy - 16, 150, 32, 16, 'rgba(255,255,255,0.10)');
	ctx.strokeStyle = 'rgba(255,255,255,0.75)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x0 - 50 - 152, cy - 2, 6, 0, Math.PI * 2);
	ctx.moveTo(x0 - 50 - 147.5, cy + 2.5);
	ctx.lineTo(x0 - 50 - 143, cy + 7);
	ctx.stroke();
	greek(ctx, x0 - 50 - 134, cy, 90, 7, 'rgba(255,255,255,0.35)', 3, {words: 2});
	icons.forEach((id, i) => {
		const x = x0 + i * step - step;
		const run = id !== 'start' && id !== 'folder' && (st.running ?? []).includes(id);
		const act = id === st.active;
		if (act) fillRR(ctx, x - 21, cy - 21, 42, 42, 6, 'rgba(255,255,255,0.12)');
		if (id === 'start') {
			// кнопка меню: круг с точкой (не чужой логотип)
			circle(ctx, x, cy, 13, '#6fb4ff');
			circle(ctx, x, cy, 5, '#ffffff');
		} else drawAppIcon(ctx, id, x, cy, 32);
		if (run) fillRR(ctx, x - (act ? 8 : 3), y0 + 46, act ? 16 : 6, 3, 1.5, act ? '#7cc0ff' : 'rgba(255,255,255,0.6)');
	});
	// трей: стрелка, сеть, звук
	ctx.strokeStyle = 'rgba(255,255,255,0.85)';
	ctx.lineWidth = 2;
	const tx = 1150;
	ctx.beginPath();
	ctx.moveTo(tx - 5, cy + 3);
	ctx.lineTo(tx, cy - 3);
	ctx.lineTo(tx + 5, cy + 3);
	ctx.stroke();
	for (let r = 1; r <= 3; r++) {
		ctx.beginPath();
		ctx.arc(tx + 40, cy + 7, r * 4.5, -Math.PI * 0.75, -Math.PI * 0.25);
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.moveTo(tx + 72, cy - 3);
	ctx.lineTo(tx + 76, cy - 3);
	ctx.lineTo(tx + 82, cy - 8);
	ctx.lineTo(tx + 82, cy + 8);
	ctx.lineTo(tx + 76, cy + 3);
	ctx.lineTo(tx + 72, cy + 3);
	ctx.closePath();
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(tx + 84, cy, 6, -0.8, 0.8);
	ctx.stroke();
};
