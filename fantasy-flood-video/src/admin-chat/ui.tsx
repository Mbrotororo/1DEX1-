import React from 'react';
import {staticFile} from 'remotion';
import {hash3} from '../lib/rng';

export const FONT = "'Pixelify', 'DejaVu Sans Mono', monospace";
export const RED = '#ff3b3b';
export const YELLOW = '#ffd23f';

// Жёсткая чёрная обводка для пиксельного текста (как тень в Minecraft, только со всех сторон)
export const outline = (px: number, color = '#000') =>
	[
		[px, 0],
		[-px, 0],
		[0, px],
		[0, -px],
		[px, px],
		[-px, px],
		[px, -px],
		[-px, -px],
	]
		.map(([x, y]) => `${x}px ${y}px 0 ${color}`)
		.join(', ');

// Тень как у текста в Minecraft: сдвиг вниз-вправо
export const mcShadow = (px: number) => `${px}px ${px}px 0 rgba(0,0,0,0.85)`;

// ---------- Скин игрока (вид спереди) ----------

const SKIN = staticFile('skin.png');

type Part = {x: number; y: number; w: number; h: number};
// Координаты передних граней на развёртке скина 64×64 (тонкие руки)
const FRONT = {
	head: {x: 8, y: 8, w: 8, h: 8},
	hat: {x: 40, y: 8, w: 8, h: 8},
	body: {x: 20, y: 20, w: 8, h: 12},
	jacket: {x: 20, y: 36, w: 8, h: 12},
	armR: {x: 44, y: 20, w: 3, h: 12},
	sleeveR: {x: 44, y: 36, w: 3, h: 12},
	armL: {x: 36, y: 52, w: 3, h: 12},
	sleeveL: {x: 52, y: 52, w: 3, h: 12},
	legR: {x: 4, y: 20, w: 4, h: 12},
	pantsR: {x: 4, y: 36, w: 4, h: 12},
	legL: {x: 20, y: 52, w: 4, h: 12},
	pantsL: {x: 4, y: 52, w: 4, h: 12},
} satisfies Record<string, Part>;

const SkinPart: React.FC<{p: Part; s: number; left: number; top: number}> = ({p, s, left, top}) => (
	<div
		style={{
			position: 'absolute',
			left,
			top,
			width: p.w * s,
			height: p.h * s,
			backgroundImage: `url(${SKIN})`,
			backgroundSize: `${64 * s}px ${64 * s}px`,
			backgroundPosition: `${-p.x * s}px ${-p.y * s}px`,
			imageRendering: 'pixelated',
		}}
	/>
);

// Голова со слоем «шапки». s — размер одного пикселя скина.
export const SkinHead: React.FC<{s: number; eyes?: number}> = ({s, eyes = 0}) => (
	<div style={{position: 'relative', width: 8 * s, height: 8 * s}}>
		<SkinPart p={FRONT.head} s={s} left={0} top={0} />
		<SkinPart p={FRONT.hat} s={s} left={0} top={0} />
		{eyes > 0 ? <GlowEyes s={s} k={eyes} /> : null}
	</div>
);

// Светящиеся белые глаза поверх лица (k — яркость 0..1)
const GlowEyes: React.FC<{s: number; k: number}> = ({s, k}) => (
	<>
		{[1, 5].map((col) => (
			<div
				key={col}
				style={{
					position: 'absolute',
					left: col * s,
					top: 4 * s,
					width: 2 * s,
					height: s,
					background: '#fff',
					opacity: k,
					boxShadow: `0 0 ${s * 1.5}px ${s * 0.6}px rgba(255,255,255,${0.8 * k})`,
				}}
			/>
		))}
	</>
);

// Игрок целиком: 16 пикселей в ширину, 32 в высоту
export const SkinFigure: React.FC<{s: number; eyes?: number}> = ({s, eyes = 0}) => (
	<div style={{position: 'relative', width: 14 * s, height: 32 * s}}>
		<div style={{position: 'absolute', left: 3 * s, top: 0}}>
			<SkinHead s={s} eyes={eyes} />
		</div>
		<SkinPart p={FRONT.armR} s={s} left={0} top={8 * s} />
		<SkinPart p={FRONT.sleeveR} s={s} left={0} top={8 * s} />
		<SkinPart p={FRONT.body} s={s} left={3 * s} top={8 * s} />
		<SkinPart p={FRONT.jacket} s={s} left={3 * s} top={8 * s} />
		<SkinPart p={FRONT.armL} s={s} left={11 * s} top={8 * s} />
		<SkinPart p={FRONT.sleeveL} s={s} left={11 * s} top={8 * s} />
		<SkinPart p={FRONT.legR} s={s} left={3 * s} top={20 * s} />
		<SkinPart p={FRONT.pantsR} s={s} left={3 * s} top={20 * s} />
		<SkinPart p={FRONT.legL} s={s} left={7 * s} top={20 * s} />
		<SkinPart p={FRONT.pantsL} s={s} left={7 * s} top={20 * s} />
	</div>
);

// Аватар для остальных админов: пиксельная «голова» по нику, без чужих скинов
export const NickAvatar: React.FC<{nick: string; size: number; color: string}> = ({nick, size, color}) => {
	const seed = [...nick].reduce((a, c) => a + c.charCodeAt(0), 0);
	const px = size / 8;
	const cells: React.ReactNode[] = [];
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			const hair = y < 2 || (y < 3 && (x === 0 || x === 7));
			const eye = y === 4 && (x === 2 || x === 5);
			const n = hash3(x, y, seed);
			const bg = hair ? color : eye ? '#1b1b1b' : `hsl(28, 45%, ${58 + n * 10}%)`;
			cells.push(
				<div
					key={`${x}-${y}`}
					style={{position: 'absolute', left: x * px, top: y * px, width: px + 0.5, height: px + 0.5, background: bg, filter: hair ? `brightness(${0.75 + n * 0.3})` : undefined}}
				/>,
			);
		}
	}
	return <div style={{position: 'relative', width: size, height: size}}>{cells}</div>;
};

// ---------- Панель в стиле интерфейса Minecraft ----------

export const McPanel: React.FC<{
	style?: React.CSSProperties;
	children: React.ReactNode;
}> = ({style, children}) => (
	<div
		style={{
			background: '#c6c6c6',
			border: '6px solid #000',
			boxShadow: 'inset 6px 6px 0 #fff, inset -6px -6px 0 #555',
			padding: 22,
			...style,
		}}
	>
		{children}
	</div>
);

// Тёмная «землистая» подложка меню Minecraft, нарисованная кодом
export const DirtBg: React.FC<{dim?: number}> = ({dim = 0.75}) => {
	const N = 18;
	const cell = 1080 / N;
	const cells: React.ReactNode[] = [];
	for (let y = 0; y < Math.ceil(1920 / cell); y++) {
		for (let x = 0; x < N; x++) {
			const n = hash3(x, y, 7);
			const l = 18 + Math.floor(n * 4) * 3;
			cells.push(
				<div
					key={`${x}-${y}`}
					style={{position: 'absolute', left: x * cell, top: y * cell, width: cell + 1, height: cell + 1, background: `hsl(25, 28%, ${l}%)`}}
				/>,
			);
		}
	}
	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
			{cells}
			<div style={{position: 'absolute', inset: 0, background: `rgba(0,0,0,${dim})`}} />
		</div>
	);
};

// Виньетка по краям кадра
export const Vignette: React.FC<{k?: number}> = ({k = 0.85}) => (
	<div
		style={{
			position: 'absolute',
			inset: 0,
			background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${k}) 100%)`,
			pointerEvents: 'none',
		}}
	/>
);
