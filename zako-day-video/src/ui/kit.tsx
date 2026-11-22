import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {easeOutBack, prog} from '../lib/anim';
import {FPS} from '../lib/timeline';

// Обводка текста как в мемах/TikTok
export const Outline: React.FC<{
	children: React.ReactNode;
	size: number;
	color?: string;
	stroke?: number;
	weight?: number;
	style?: React.CSSProperties;
}> = ({children, size, color = '#fff', stroke, weight = 900, style}) => (
	<div
		style={{
			fontFamily: 'Rubik',
			fontWeight: weight,
			fontSize: size,
			color,
			WebkitTextStroke: `${stroke ?? Math.round(size * 0.15)}px #000`,
			paintOrder: 'stroke fill',
			lineHeight: 1,
			textShadow: `0 ${Math.round(size * 0.08)}px 0 rgba(0,0,0,0.45)`,
			...style,
		}}
	>
		{children}
	</div>
);

// Звук Minecraft в момент at (сек, от начала сцены)
export const Sfx: React.FC<{at: number; src: string; volume?: number; rate?: number}> = ({
	at,
	src,
	volume = 0.5,
	rate = 1,
}) => (
	<Sequence from={Math.max(0, Math.round(at * FPS))} layout="none" name={src}>
		<Audio src={staticFile(`sounds/${src}.ogg`)} volume={volume} playbackRate={rate} />
	</Sequence>
);

// Небо: градиент + пиксельные облака, плывущие вправо
export const Sky: React.FC<{t: number; top?: string; bottom?: string; clouds?: boolean}> = ({
	t,
	top = '#5aa7ff',
	bottom = '#bfe4ff',
	clouds = true,
}) => {
	const list = [
		{x: 80, y: 180, w: 300, h: 70, v: 22},
		{x: 640, y: 330, w: 380, h: 80, v: 16},
		{x: -120, y: 560, w: 260, h: 60, v: 26},
		{x: 520, y: 760, w: 320, h: 70, v: 18},
	];
	return (
		<div style={{position: 'absolute', inset: 0, background: `linear-gradient(${top}, ${bottom})`}}>
			{clouds
				? list.map((c, i) => {
						const x = ((c.x + t * c.v + 400) % 1480) - 400;
						return (
							<div key={i} style={{position: 'absolute', left: x, top: c.y, width: c.w, height: c.h}}>
								<div style={{position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.92)'}} />
								<div
									style={{
										position: 'absolute',
										left: c.w * 0.2,
										top: -c.h * 0.45,
										width: c.w * 0.45,
										height: c.h * 0.5,
										background: 'rgba(255,255,255,0.92)',
									}}
								/>
							</div>
						);
					})
				: null}
		</div>
	);
};

// Уведомление в стиле мессенджера, выезжает сверху
export const Notification: React.FC<{
	t: number;
	at: number;
	title: string;
	text: string;
	index?: number;
	accent?: string;
	out?: number;
}> = ({t, at, title, text, index = 0, accent = '#2aabee', out}) => {
	if (t < at) return null;
	const k = easeOutBack(prog(t, at, 0.3), 1.4);
	const gone = out !== undefined ? prog(t, out, 0.25) : 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: 60,
				right: 60,
				top: 120 + index * 150,
				transform: `translateY(${(1 - k) * -260 - gone * 400}px)`,
				opacity: 1 - gone,
				background: 'rgba(28, 34, 44, 0.94)',
				borderRadius: 34,
				padding: '22px 30px',
				display: 'flex',
				gap: 24,
				alignItems: 'center',
				boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
				fontFamily: 'Rubik',
			}}
		>
			<div
				style={{
					width: 84,
					height: 84,
					borderRadius: 42,
					background: accent,
					flexShrink: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: '#fff',
					fontWeight: 900,
					fontSize: 44,
				}}
			>
				{title[0]}
			</div>
			<div style={{minWidth: 0}}>
				<div style={{color: '#9fd8ff', fontWeight: 700, fontSize: 36}}>{title}</div>
				<div style={{color: '#fff', fontWeight: 500, fontSize: 40, marginTop: 4, whiteSpace: 'nowrap'}}>{text}</div>
			</div>
		</div>
	);
};
