import React, {useEffect, useState} from 'react';
import {staticFile, useDelayRender} from 'remotion';

// Видоискатель камеры (DOM, Overlay): тонкие перекрестья в углах, «● REC» с мигающей точкой слева сверху,
// бегущий тайм-код справа сверху, «1080p 60fps» слева снизу. Всё — чистая функция времени t.
// Координаты — пиксели кадра 1920x1080. Шрифт — Inter (public/fonts), грузится до снимка кадра.

// ---------- шрифт Inter (латиница + кириллица, 300/400/500) ----------
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const INTER_WEIGHTS = [300, 400, 500];

let interLoad: Promise<void> | null = null;
let interReady = false;
const loadInter = (): Promise<void> => {
	if (!interLoad) {
		const faces: FontFace[] = [];
		for (const w of INTER_WEIGHTS) {
			faces.push(new FontFace('Inter', `url(${staticFile(`fonts/inter-latin-${w}-normal.woff2`)}) format('woff2')`, {weight: String(w), unicodeRange: LATIN}));
			faces.push(new FontFace('Inter', `url(${staticFile(`fonts/inter-cyrillic-${w}-normal.woff2`)}) format('woff2')`, {weight: String(w), unicodeRange: CYRILLIC}));
		}
		interLoad = Promise.all(faces.map((f) => f.load())).then((loaded) => {
			for (const f of loaded) (document.fonts as unknown as {add: (face: FontFace) => void}).add(f);
			interReady = true;
		});
	}
	return interLoad;
};

// Шрифт Inter: кадр не снимается, пока шрифт не загружен. Вызывать в компоненте, который пишет текст Inter.
export const useInterFont = (): void => {
	const {delayRender, continueRender, cancelRender} = useDelayRender();
	const [handle] = useState(() => (interReady ? null : delayRender('Загрузка шрифта Inter')));
	useEffect(() => {
		if (handle === null) return;
		loadInter()
			.then(() => continueRender(handle))
			.catch((err) => cancelRender(err));
	}, [handle, continueRender, cancelRender]);
};

export const UI_FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";

// ---------- тайм-код ----------
// 83.4167 -> "00:01:23.416" (часы:минуты:секунды.миллисекунды; отрицательное — нули)
export const formatTimecode = (sec: number): string => {
	const ms = Math.max(0, Math.floor(sec * 1000 + 1e-6));
	const h = Math.floor(ms / 3600000);
	const m = Math.floor(ms / 60000) % 60;
	const s = Math.floor(ms / 1000) % 60;
	const p2 = (n: number) => String(n).padStart(2, '0');
	return `${p2(h)}:${p2(m)}:${p2(s)}.${String(ms % 1000).padStart(3, '0')}`;
};

export type ViewfinderProps = {
	// время сцены, секунды
	t: number;
	// момент начала записи (тайм-код = t - start, до него — нули)
	start?: number;
	// общая прозрачность 0..1 (появление/уход)
	opacity?: number;
	// подпись слева снизу
	label?: string;
	// цвет линий и текста
	color?: string;
	// точка у REC: круг (как ● в ТЗ) или квадрат (как в примере)
	dot?: 'circle' | 'square';
	// мигание точки: период, секунды (0 — не мигает)
	blink?: number;
	// маленькое перекрестье в центре кадра
	center?: boolean;
	// значок батареи справа снизу
	battery?: boolean;
	// масштаб всего видоискателя (1 — как в примере)
	scale?: number;
};

// Перекрестье в углу (x, y): две тонкие линии от края кадра до x/y ± arm; sx, sy — с какой стороны край
const CornerCross: React.FC<{x: number; y: number; sx: number; sy: number; arm: number; color: string; w: number}> = ({x, y, sx, sy, arm, color, w}) => {
	const shadow = '0 0 2px rgba(0,0,0,0.55)';
	const left = sx > 0 ? 0 : x - arm;
	const top = sy > 0 ? 0 : y - arm;
	return (
		<>
			<div style={{position: 'absolute', left, top: y - w / 2, width: sx > 0 ? x + arm : 1920 - left, height: w, background: color, boxShadow: shadow}} />
			<div style={{position: 'absolute', left: x - w / 2, top, width: w, height: sy > 0 ? y + arm : 1080 - top, background: color, boxShadow: shadow}} />
		</>
	);
};

export const Viewfinder: React.FC<ViewfinderProps> = ({
	t,
	start = 0,
	opacity = 1,
	label = '1080p  60fps',
	color = '#dedede',
	dot = 'circle',
	blink = 1,
	center = true,
	battery = false,
	scale = 1,
}) => {
	useInterFont();
	if (opacity <= 0.003) return null;
	const rec = t - start;
	// точка горит первую половину периода, считая от старта записи
	const dotOn = blink <= 0 || rec < 0 || ((rec / blink) % 1 + 1) % 1 < 0.5;
	const k = scale;
	const m = 48 * k;
	const arm = 88 * k;
	const lw = Math.max(1.5, 2 * k);
	const text: React.CSSProperties = {
		position: 'absolute',
		fontFamily: UI_FONT,
		color,
		whiteSpace: 'pre',
		lineHeight: 1,
		textShadow: '0 1px 2px rgba(0,0,0,0.65), 0 0 1px rgba(0,0,0,0.5)',
		fontVariantNumeric: 'tabular-nums',
		letterSpacing: '0.01em',
	};
	const dotSize = 26 * k;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity, pointerEvents: 'none'}}>
			<CornerCross x={m} y={m} sx={1} sy={1} arm={arm} color={color} w={lw} />
			<CornerCross x={1920 - m} y={m} sx={-1} sy={1} arm={arm} color={color} w={lw} />
			<CornerCross x={m} y={1080 - m} sx={1} sy={-1} arm={arm} color={color} w={lw} />
			<CornerCross x={1920 - m} y={1080 - m} sx={-1} sy={-1} arm={arm} color={color} w={lw} />
			{center ? (
				<>
					<div style={{position: 'absolute', left: 960 - 22 * k, top: 540 - lw / 2, width: 44 * k, height: lw, background: color, opacity: 0.55}} />
					<div style={{position: 'absolute', left: 960 - lw / 2, top: 540 - 22 * k, width: lw, height: 44 * k, background: color, opacity: 0.55}} />
				</>
			) : null}
			{/* ● REC */}
			<div
				style={{
					position: 'absolute',
					left: 74 * k,
					top: 88 * k - dotSize / 2,
					width: dotSize,
					height: dotSize,
					borderRadius: dot === 'circle' ? '50%' : 2 * k,
					background: '#d8141c',
					boxShadow: '0 0 6px rgba(255,40,40,0.45)',
					opacity: dotOn ? 1 : 0,
				}}
			/>
			<div style={{...text, left: 114 * k, top: 88 * k - 17 * k, fontSize: 34 * k, fontWeight: 400}}>REC</div>
			{/* тайм-код */}
			<div style={{...text, right: 84 * k, top: 88 * k - 18 * k, fontSize: 36 * k, fontWeight: 400}}>{formatTimecode(rec)}</div>
			{/* формат */}
			<div style={{...text, left: 80 * k, top: 1080 - 82 * k - 14 * k, fontSize: 28 * k, fontWeight: 400}}>{label}</div>
			{battery ? <Battery x={1920 - 84 * k} y={1080 - 82 * k} k={k} color={color} /> : null}
		</div>
	);
};

// Значок батареи (правый край в x, центр по y)
const Battery: React.FC<{x: number; y: number; k: number; color: string}> = ({x, y, k, color}) => {
	const w = 52 * k;
	const h = 24 * k;
	return (
		<div style={{position: 'absolute', left: x - w - 5 * k, top: y - h / 2, width: w, height: h, border: `${2 * k}px solid ${color}`, borderRadius: 4 * k, boxSizing: 'border-box', padding: 3 * k, boxShadow: '0 0 2px rgba(0,0,0,0.55)'}}>
			<div style={{width: '72%', height: '100%', background: color, borderRadius: 1.5 * k}} />
			<div style={{position: 'absolute', right: -6 * k, top: h / 2 - 6 * k - 2 * k, width: 4 * k, height: 12 * k, background: color, borderRadius: 1 * k}} />
		</div>
	);
};
