import React, {useLayoutEffect, useRef} from 'react';
import {clamp01, easeInCubic, easeOutBack, easeOutCubic, hexToRgb, impulse, prog, rgbToHex, type Vec3} from '../anim';
import {projectToScreen, type CameraState} from '../camera';
import {artPixels, resolveArt, type ItemArt, type ItemName} from '../items/art';
import {hash3, noise1} from '../rng';
import {layoutText} from './font';
import {HEIGHT, WIDTH} from '../../timeline';

// Плоский пиксельный интерфейс поверх 3D (DOM). Координаты — пиксели кадра 1920x1080:
// (0, 0) — левый верхний угол, x вправо, y вниз. Всё анимируется только от времени t.

// безопасная зона: отступ от краёв кадра, внутри которого должен жить весь текст
export const SAFE = 80;

// ---------- пиксельный текст ----------
// Плоские надписи рисуются ТЕМ ЖЕ растровым шрифтом, что и объёмные (hud/font.ts): он полный
// (вся кириллица, цифры, знаки) и читается в любом размере. Каждая надпись — маленький <canvas>,
// растянутый без сглаживания.

type TextStyle = {text: string; color: string; color2?: string; outline: number; outlineColor: string; drop: number; bold: boolean};

// размеры холста надписи в пикселях шрифта
const textBox = (text: string, outline: number, drop: number, bold: boolean) => {
	const layout = layoutText(text);
	const w = layout.width + (bold ? 1 : 0);
	return {layout, w, cw: Math.max(1, w + outline * 2), ch: 11 + outline * 2 + drop};
};

const drawText = (ctx: CanvasRenderingContext2D, st: TextStyle) => {
	const {layout, cw, ch} = textBox(st.text, st.outline, st.drop, st.bold);
	const o = st.outline;
	const mask = new Uint8Array(cw * ch);
	for (const p of layout.pixels) {
		const row = o + 2 + (6 - p.y);
		const col = o + p.x;
		if (row < 0 || row >= ch) continue;
		mask[row * cw + col] = 1;
		if (st.bold && col + 1 < cw) mask[row * cw + col + 1] = 1;
	}
	ctx.clearRect(0, 0, cw, ch);
	// обводка: буква, «раздутая» на outline пикселей во все стороны, плюс тень вниз
	if (o > 0 || st.drop > 0) {
		ctx.fillStyle = st.outlineColor;
		for (let r = 0; r < ch; r++) {
			for (let c = 0; c < cw; c++) {
				let hit = false;
				for (let dy = -o - st.drop; dy <= o && !hit; dy++) {
					for (let dx = -o; dx <= o && !hit; dx++) {
						const rr = r + dy;
						const cc = c + dx;
						if (rr >= 0 && rr < ch && cc >= 0 && cc < cw && mask[rr * cw + cc]) hit = true;
					}
				}
				if (hit) ctx.fillRect(c, r, 1, 1);
			}
		}
	}
	const a = hexToRgb(st.color);
	const b = hexToRgb(st.color2 ?? st.color);
	for (let r = 0; r < ch; r++) {
		// градиент сверху вниз по высоте заглавной буквы
		const k = clamp01((r - o - 2) / 6);
		ctx.fillStyle = rgbToHex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
		for (let c = 0; c < cw; c++) if (mask[r * cw + c]) ctx.fillRect(c, r, 1, 1);
	}
};

// Маленький холст, нарисованный синхронно (до снимка кадра) и растянутый «пикселями»
const PixelCanvas: React.FC<{w: number; h: number; draw: (ctx: CanvasRenderingContext2D) => void; deps: string; style?: React.CSSProperties}> = ({w, h, draw, deps, style}) => {
	const ref = useRef<HTMLCanvasElement>(null);
	useLayoutEffect(() => {
		const ctx = ref.current?.getContext('2d');
		if (ctx) draw(ctx);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [deps, w, h]);
	return <canvas ref={ref} width={w} height={h} style={{imageRendering: 'pixelated', display: 'block', ...style}} />;
};

// Ширина надписи в пикселях кадра при данном кегле (без обводки)
export const pixelTextWidth = (text: string, size: number, bold = false) => ((layoutText(text).width + (bold ? 1 : 0)) * size) / 10;

export type PixelTextProps = {
	// текст надписи (строка; числа и строки-дети склеиваются)
	children?: React.ReactNode;
	// точка привязки в пикселях кадра
	x: number;
	y: number;
	// что привязано к точке по горизонтали (по вертикали — всегда середина заглавной буквы)
	align?: 'center' | 'left' | 'right';
	// кегль в пикселях кадра: один пиксель шрифта = size / 10, заглавная буква высотой 0.7 * size.
	// Чтобы пиксели были ровными, бери кратное 10 (40, 50, 60, 80 ...).
	size?: number;
	color?: string;
	// второй цвет — градиент сверху (color) вниз (color2)
	color2?: string;
	// обводка в пикселях шрифта (0, 1, 2) и её цвет
	outline?: number;
	outlineColor?: string;
	// «тень» вниз в пикселях шрифта (толстая нижняя кромка)
	drop?: number;
	// жирный: штрихи на пиксель толще
	bold?: boolean;
	opacity?: number;
	scale?: number;
	// поворот, градусы
	rotate?: number;
	// что нарисовать поверх надписи в её рамке (например, полосу зачёркивания)
	decor?: React.ReactNode;
	style?: React.CSSProperties;
};

const childText = (children: React.ReactNode): string =>
	React.Children.toArray(children)
		.map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
		.join('');

// Строка пиксельного текста с тёмной обводкой — читается на любом фоне
export const PixelText: React.FC<PixelTextProps> = ({
	children,
	x,
	y,
	align = 'center',
	size = 60,
	color = '#ffffff',
	color2,
	outline = 1,
	outlineColor = '#10121c',
	drop = 1,
	bold = false,
	opacity = 1,
	scale = 1,
	rotate = 0,
	decor,
	style,
}) => {
	const text = childText(children);
	if (opacity <= 0.003 || scale <= 0.003 || text.length === 0) return null;
	const unit = size / 10;
	const {w, cw, ch} = textBox(text, outline, drop, bold);
	const st: TextStyle = {text, color, color2, outline, outlineColor, drop, bold};
	// точка привязки внутри холста (в пикселях кадра): по горизонтали — по align, по вертикали — середина заглавных
	const ax = (outline + (align === 'center' ? w / 2 : align === 'right' ? w : 0)) * unit;
	const ay = (outline + 5.5) * unit;
	return (
		<div
			style={{
				position: 'absolute',
				left: x - ax,
				top: y - ay,
				width: cw * unit,
				height: ch * unit,
				transform: scale === 1 && rotate === 0 ? undefined : `scale(${scale}) rotate(${rotate}deg)`,
				transformOrigin: `${ax}px ${ay}px`,
				opacity,
				...style,
			}}
		>
			<PixelCanvas w={cw} h={ch} draw={(ctx) => drawText(ctx, st)} deps={JSON.stringify(st)} style={{width: cw * unit, height: ch * unit}} />
			{decor}
		</div>
	);
};

// ---------- Pixelify Sans (запасной веб-шрифт) ----------
// Мягкий пиксельный шрифт для мелких служебных подписей. Основной шрифт интерфейса — PixelText:
// у Pixelify Sans «С» почти не отличается от «О», а «2» и «5» — как на калькуляторе.
export const FONT = '"Pixelify Sans", sans-serif';

// Обводка и тень через text-shadow
export const outlineShadow = (width: number, color = '#10121c', drop = 0) => {
	const parts: string[] = [];
	for (let i = 0; i < 16 && width > 0; i++) {
		const a = (i / 16) * Math.PI * 2;
		parts.push(`${(Math.cos(a) * width).toFixed(2)}px ${(Math.sin(a) * width).toFixed(2)}px 0 ${color}`);
	}
	if (drop > 0) parts.push(`0px ${drop + width}px 0 ${color}`);
	return parts.join(', ');
};

export const SansText: React.FC<{
	children?: React.ReactNode;
	x: number;
	y: number;
	align?: 'center' | 'left' | 'right';
	size?: number;
	color?: string;
	outline?: number;
	outlineColor?: string;
	weight?: 500 | 700;
	opacity?: number;
	scale?: number;
	rotate?: number;
	style?: React.CSSProperties;
}> = ({children, x, y, align = 'center', size = 40, color = '#ffffff', outline, outlineColor = '#10121c', weight = 700, opacity = 1, scale = 1, rotate = 0, style}) => {
	if (opacity <= 0.003 || scale <= 0.003) return null;
	const o = outline ?? Math.max(1.5, size / 18);
	const tx = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0%';
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				transform: `translate(${tx}, -50%) scale(${scale}) rotate(${rotate}deg)`,
				transformOrigin: align === 'center' ? '50% 50%' : align === 'right' ? '100% 50%' : '0% 50%',
				fontFamily: FONT,
				fontWeight: weight,
				fontSize: size,
				lineHeight: 1,
				color,
				opacity,
				whiteSpace: 'nowrap',
				textShadow: outlineShadow(o, outlineColor, o),
				...style,
			}}
		>
			{children}
		</div>
	);
};

// Огибающая появления/исчезновения надписи: 0 до from, «выстрел» с перелётом, 1, сжатие к to
export const captionEnv = (t: number, from: number, to: number, inDur = 0.28, outDur = 0.22) => {
	if (t < from || t > to) return {scale: 0, opacity: 0};
	const a = prog(t, from, inDur);
	const b = prog(t, to - outDur, outDur);
	return {scale: easeOutBack(a, 2.4) * (1 - easeInCubic(b) * 0.35), opacity: Math.min(1, a * 3) * (1 - easeInCubic(b))};
};

export type CaptionProps = Omit<PixelTextProps, 'opacity' | 'scale'> & {
	t: number;
	// когда появляется и когда исчезает (локальное время сцены)
	from: number;
	to: number;
	// лёгкое покачивание после появления
	wobble?: number;
	// дополнительный масштаб (например 1 + impulse(t, at) * 0.2)
	scale?: number;
};

// Подпись, которая «выстреливает» в момент from и убирается в to
export const Caption: React.FC<CaptionProps> = ({t, from, to, wobble = 0, scale = 1, rotate = 0, ...rest}) => {
	const env = captionEnv(t, from, to);
	if (env.opacity <= 0) return null;
	const sway = wobble ? Math.sin((t - from) * 2.2) * wobble : 0;
	return <PixelText {...rest} scale={env.scale * scale} opacity={env.opacity} rotate={rotate + sway} />;
};

// Штамп: надпись «впечатывается» с ударом; strikeAt — зачёркивается красной полосой.
export const Stamp: React.FC<
	Omit<PixelTextProps, 'opacity' | 'scale' | 'decor'> & {
		t: number;
		at: number;
		// когда убрать (если не задано — остаётся)
		to?: number;
		// зачеркнуть: момент, когда полоса начинает чертиться
		strikeAt?: number;
		strikeColor?: string;
	}
> = ({t, at, to, strikeAt, strikeColor = '#ff3b30', size = 80, rotate = -4, ...rest}) => {
	if (t < at || (to !== undefined && t > to)) return null;
	const a = prog(t, at, 0.16);
	const out = to !== undefined ? 1 - easeInCubic(prog(t, to - 0.2, 0.2)) : 1;
	// прилетает крупной и «шлёпается» на место
	const scale = (1 + (1 - easeOutCubic(a)) * 1.6 + impulse(t, at + 0.16, 14) * 0.08) * (0.7 + 0.3 * out);
	const strike = strikeAt !== undefined ? easeOutCubic(prog(t, strikeAt, 0.18)) : 0;
	const unit = size / 10;
	const o = rest.outline ?? 1;
	// полоса идёт по середине заглавных букв, чуть выступая за края надписи
	const line =
		strike > 0 ? (
			<div
				style={{
					position: 'absolute',
					left: -1.5 * unit,
					top: (o + 5.5 - 0.75) * unit,
					width: `calc(${100 * strike}% + ${3 * unit * strike}px)`,
					height: 1.5 * unit,
					background: strikeColor,
					boxShadow: `0 0 0 ${unit * 0.6}px #10121c`,
				}}
			/>
		) : null;
	return <PixelText {...rest} size={size} rotate={rotate} scale={scale} opacity={Math.min(1, a * 2) * out} decor={line} />;
};

// 75 -> "01:15"
export const formatClock = (seconds: number) => {
	const s = Math.max(0, Math.ceil(seconds - 1e-6));
	return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// Таймер обратного отсчёта: «ДО ВАЙПА 00:07». remaining — сколько секунд осталось (дробное: по нему считается «тик»).
// urgent 0..1 — краснеет и пульсирует сильнее.
export const Countdown: React.FC<{label?: string; remaining: number; x?: number; y?: number; size?: number; urgent?: number; opacity?: number; scale?: number}> = ({
	label,
	remaining,
	x = WIDTH / 2,
	y = 150,
	size = 90,
	urgent = 0,
	opacity = 1,
	scale = 1,
}) => {
	// «тик»: цифры вздрагивают в начале каждой секунды
	const since = remaining > 0 ? Math.ceil(remaining) - remaining : 1;
	const tick = Math.exp(-clamp01(since) * 9);
	const u = clamp01(urgent);
	const color = rgbToHex([1, 1 - u * 0.73, 1 - u * 0.77]);
	return (
		<>
			{label ? (
				<PixelText x={x} y={y - size * 0.86} size={size * 0.5} color="#e8eef6" opacity={opacity} scale={scale}>
					{label}
				</PixelText>
			) : null}
			<PixelText x={x} y={y} size={size} color={color} opacity={opacity} scale={scale * (1 + tick * (0.1 + 0.14 * u))}>
				{formatClock(remaining)}
			</PixelText>
		</>
	);
};

// Число со счётчиком: value округляется; pop — масштаб-вспышка (например impulse(t, at))
export const Counter: React.FC<Omit<PixelTextProps, 'children'> & {value: number; prefix?: string; suffix?: string; digits?: number; pop?: number}> = ({value, prefix = '', suffix = '', digits = 0, pop = 0, scale = 1, ...rest}) => (
	<PixelText {...rest} scale={scale * (1 + pop * 0.25)}>{`${prefix}${value.toFixed(digits)}${suffix}`}</PixelText>
);

// ---------- иконки предметов ----------
// Плоская иконка предмета (тот же рисунок, что и у 3D-предмета). x, y — центр иконки.
export const ItemIcon: React.FC<{art: ItemName | ItemArt; x: number; y: number; size?: number; opacity?: number; scale?: number; rotate?: number; shadow?: boolean; style?: React.CSSProperties}> = ({
	art,
	x,
	y,
	size = 64,
	opacity = 1,
	scale = 1,
	rotate = 0,
	shadow = true,
	style,
}) => {
	if (opacity <= 0.003 || scale <= 0.003) return null;
	const def = resolveArt(art);
	const {data, w, h} = artPixels(def);
	const k = size / Math.max(w, h);
	return (
		<PixelCanvas
			w={w}
			h={h}
			deps={def.rows.join('') + JSON.stringify(def.palette)}
			draw={(ctx) => {
				const img = ctx.createImageData(w, h);
				img.data.set(data);
				ctx.putImageData(img, 0, 0);
			}}
			style={{
				position: 'absolute',
				left: x - (w * k) / 2,
				top: y - (h * k) / 2,
				width: w * k,
				height: h * k,
				opacity,
				transform: `scale(${scale}) rotate(${rotate}deg)`,
				filter: shadow ? `drop-shadow(0 ${Math.max(2, size / 16)}px 0 rgba(0,0,0,0.45))` : undefined,
				...style,
			}}
		/>
	);
};

// Ряд сердец как в игре. value — здоровье в сердцах (с шагом 0.5), max — сколько всего.
// x, y — центр ряда. shake 0..1 — тряска от урона; flash 0..1 — белая вспышка контура.
export const Hearts: React.FC<{value: number; max?: number; x?: number; y?: number; size?: number; t?: number; shake?: number; flash?: number; opacity?: number; lowPulse?: boolean}> = ({
	value,
	max = 10,
	x = WIDTH / 2,
	y = HEIGHT - 130,
	size = 54,
	t = 0,
	shake = 0,
	flash = 0,
	opacity = 1,
	lowPulse = true,
}) => {
	if (opacity <= 0.003) return null;
	const gap = size * 0.06;
	const total = max * size + (max - 1) * gap;
	const hearts = [];
	for (let i = 0; i < max; i++) {
		const fill = value - i;
		const art: ItemName = fill >= 1 ? 'heartFull' : fill >= 0.5 ? 'heartHalf' : 'heartEmpty';
		// при малом здоровье сердца подпрыгивают по очереди, как в игре
		const low = lowPulse && value <= max * 0.3 ? Math.max(0, Math.sin(t * 12 + i * 1.3)) * size * 0.06 : 0;
		const jx = shake > 0 ? noise1(t * 40, i * 7 + 1) * shake * size * 0.22 : 0;
		const jy = shake > 0 ? noise1(t * 40, i * 7 + 2) * shake * size * 0.22 : 0;
		hearts.push(
			<ItemIcon
				key={i}
				art={art}
				x={x - total / 2 + size / 2 + i * (size + gap) + jx}
				y={y + jy - low}
				size={size}
				opacity={opacity}
				style={flash > 0.01 ? {filter: `brightness(${1 + flash * 1.8}) drop-shadow(0 ${size / 16}px 0 rgba(0,0,0,0.45))`} : undefined}
			/>,
		);
	}
	return <>{hearts}</>;
};

// «Часики» перезарядки: круглый циферблат, сектор убывает по мере progress 0 → 1 (1 — готово).
export const CooldownClock: React.FC<{x: number; y: number; size?: number; progress: number; color?: string; opacity?: number; scale?: number}> = ({x, y, size = 96, progress, color = '#ffffff', opacity = 1, scale = 1}) => {
	if (opacity <= 0.003 || scale <= 0.003) return null;
	const p = clamp01(progress);
	const deg = p * 360;
	const rim = Math.max(4, size / 12);
	return (
		<div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, opacity, transform: `scale(${scale})`}}>
			{/* тёмный циферблат с оставшимся сектором */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: '50%',
					background: `conic-gradient(rgba(16,18,28,0.85) ${deg}deg, ${color} ${deg}deg)`,
					border: `${rim}px solid #10121c`,
					boxSizing: 'border-box',
					boxShadow: `0 ${rim / 2}px 0 rgba(0,0,0,0.45)`,
				}}
			/>
			{/* стрелка */}
			<div
				style={{
					position: 'absolute',
					left: size / 2 - rim / 2,
					top: rim * 1.6,
					width: rim,
					height: size / 2 - rim * 1.6,
					background: '#10121c',
					transformOrigin: '50% 100%',
					transform: `rotate(${deg}deg)`,
				}}
			/>
			<div style={{position: 'absolute', left: size / 2 - rim * 0.8, top: size / 2 - rim * 0.8, width: rim * 1.6, height: rim * 1.6, borderRadius: '50%', background: '#10121c'}} />
		</div>
	);
};

// Элемент, привязанный к точке в 3D: дети рисуются вокруг экранной проекции точки at.
// Внутри используй координаты относительно этой точки (x = 0, y = 0 — сама точка).
export const WorldLabel: React.FC<{
	cam: CameraState;
	at: Vec3;
	// сдвиг на экране, пиксели
	dx?: number;
	dy?: number;
	// держать в пределах безопасной зоны кадра
	clamp?: boolean;
	children?: React.ReactNode;
}> = ({cam, at, dx = 0, dy = 0, clamp = true, children}) => {
	const p = projectToScreen(cam, at);
	if (p.behind) return null;
	let x = p.x + dx;
	let y = p.y + dy;
	if (clamp) {
		x = Math.min(WIDTH - SAFE, Math.max(SAFE, x));
		y = Math.min(HEIGHT - SAFE, Math.max(SAFE, y));
	}
	return <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0}}>{children}</div>;
};

// Заливка всего кадра цветом (затемнение, белая вспышка). opacity 0..1.
export const Fade: React.FC<{color?: string; opacity: number}> = ({color = '#000000', opacity}) =>
	opacity <= 0.003 ? null : <div style={{position: 'absolute', inset: 0, background: color, opacity: clamp01(opacity)}} />;

// Короткая вспышка: 1 в момент at и затухает за dur
export const Flash: React.FC<{t: number; at: number; dur?: number; color?: string; peak?: number}> = ({t, at, dur = 0.4, color = '#ffffff', peak = 1}) => (
	<Fade color={color} opacity={t < at ? 0 : peak * Math.pow(1 - prog(t, at, dur), 2)} />
);

// Проявление из цвета в начале сцены (1 → 0 за dur) и уход в цвет в конце (0 → 1 к end)
export const fadeFrom = (t: number, dur: number) => 1 - easeOutCubic(prog(t, 0, dur));
export const fadeTo = (t: number, end: number, dur: number) => easeInCubic(prog(t, end - dur, dur));

// Виньетка: затемнение (или иней — светлым цветом) по краям кадра. amount 0..1.
export const Vignette: React.FC<{amount?: number; color?: string; inner?: number}> = ({amount = 0.5, color = '#000000', inner = 45}) =>
	amount <= 0.003 ? null : (
		<div style={{position: 'absolute', inset: 0, opacity: clamp01(amount), background: `radial-gradient(ellipse at center, transparent ${inner}%, ${color} 118%)`}} />
	);

// Киношные чёрные полосы сверху и снизу. amount 0..1 (1 — полосы по 110 px).
export const Letterbox: React.FC<{amount: number; height?: number; color?: string}> = ({amount, height = 110, color = '#000000'}) => {
	const h = clamp01(amount) * height;
	if (h < 0.5) return null;
	return (
		<>
			<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: h, background: color}} />
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: color}} />
		</>
	);
};

// Линии скорости по краям кадра. amount 0..1; линии «мигают» 30 раз в секунду.
export const SpeedLines: React.FC<{t: number; amount: number; color?: string; count?: number; cx?: number; cy?: number; seed?: number}> = ({t, amount, color = '#ffffff', count = 46, cx = WIDTH / 2, cy = HEIGHT / 2, seed = 1}) => {
	if (amount <= 0.01) return null;
	const tick = Math.floor(t * 30);
	const R = Math.hypot(WIDTH, HEIGHT) / 2;
	const lines = [];
	for (let i = 0; i < count; i++) {
		const a = ((i + hash3(i, tick, 1, seed)) / count) * Math.PI * 2;
		const len = (0.16 + hash3(i, tick, 2, seed) * 0.3) * R * (0.5 + amount * 0.5);
		const inner = R * (0.5 + hash3(i, tick, 3, seed) * 0.26 - amount * 0.1);
		const w = 3 + hash3(i, tick, 4, seed) * 7;
		lines.push(
			<div
				key={i}
				style={{
					position: 'absolute',
					left: cx,
					top: cy - w / 2,
					width: len,
					height: w,
					transformOrigin: '0 50%',
					transform: `rotate(${a}rad) translateX(${inner}px)`,
					background: `linear-gradient(90deg, transparent, ${color})`,
					opacity: (0.35 + hash3(i, tick, 5, seed) * 0.5) * clamp01(amount),
				}}
			/>,
		);
	}
	return <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>{lines}</div>;
};
