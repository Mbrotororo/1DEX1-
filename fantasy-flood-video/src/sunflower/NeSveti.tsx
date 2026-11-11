import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {easeOutBack, smooth} from '../lib/anim';
import {SCENES} from './scenes';
import {DURATION_S, FPS, SPANS, TIMED, spanOf} from './story';

const FONT = "'Montserrat', 'DejaVu Sans', sans-serif";
const YELLOW = '#ffc94a';
const RED = '#ff4d4d';

// ---------- Шрифт Montserrat ----------
const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const useFont = () => {
	const [handle] = useState(() => delayRender('Montserrat'));
	useEffect(() => {
		const faces = (['800', '900'] as const).flatMap((w) => [
			new FontFace('Montserrat', `url(${staticFile(`fonts/montserrat-cyrillic-${w}-normal.woff2`)})`, {unicodeRange: CYR, weight: w}),
			new FontFace('Montserrat', `url(${staticFile(`fonts/montserrat-latin-${w}-normal.woff2`)})`, {weight: w}),
		]);
		Promise.all(faces.map((f) => f.load()))
			.then((loaded) => {
				loaded.forEach((f) => (document.fonts as unknown as Set<FontFace>).add(f));
				continueRender(handle);
			})
			.catch((err) => {
				console.error(err);
				continueRender(handle);
			});
	}, [handle]);
};

// ---------- Субтитры ----------
const renderSub = (text: string) => {
	const out: React.ReactNode[] = [];
	const re = /\*([^*]+)\*|\^([^^]+)\^|([^*^]+)/g;
	let m: RegExpExecArray | null;
	let i = 0;
	while ((m = re.exec(text))) {
		if (m[1]) out.push(<span key={i++} style={{color: RED}}>{m[1]}</span>);
		else if (m[2]) out.push(<span key={i++} style={{color: YELLOW}}>{m[2]}</span>);
		else out.push(<span key={i++}>{m[3]}</span>);
	}
	return out;
};

const CHUNKS = TIMED.flatMap((b) => b.chunks);

const Subtitles: React.FC<{t: number}> = ({t}) => {
	const c = CHUNKS.find((x) => x.at <= t && t < x.end + 0.08) ?? null;
	if (!c) return null;
	const k = easeOutBack((t - c.at) / 0.16, 2);
	return (
		<div
			style={{
				position: 'absolute',
				left: 60,
				right: 60,
				top: 1390,
				textAlign: 'center',
				fontFamily: FONT,
				fontWeight: 900,
				fontSize: 78,
				lineHeight: 1.12,
				textTransform: 'uppercase',
				color: '#fff',
				textShadow: '0 4px 0 rgba(0,0,0,0.55), 0 0 22px rgba(0,0,0,0.85)',
				transform: `scale(${0.82 + 0.18 * k})`,
			}}
		>
			{renderSub(c.text)}
		</div>
	);
};

// Ключевое слово сверху кадра
const Label: React.FC<{t: number}> = ({t}) => {
	let cur: (typeof TIMED)[number] | null = null;
	for (const b of TIMED) {
		if (b.label && b.at <= t && t < b.end + 0.6) cur = b;
	}
	if (!cur?.label) return null;
	const k = smooth((t - cur.at) / 0.4);
	const big = /₽/.test(cur.label);
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				top: big ? 200 : 120,
				textAlign: 'center',
				fontFamily: FONT,
				fontWeight: 900,
				fontSize: big ? 150 : 70,
				letterSpacing: big ? 2 : 8,
				color: big ? '#f1cf7a' : 'rgba(235,225,205,0.7)',
				textShadow: big ? '0 6px 30px rgba(0,0,0,0.5)' : '0 2px 12px rgba(0,0,0,0.6)',
				opacity: k,
				transform: `translateY(${(1 - k) * 20}px)`,
			}}
		>
			{cur.label}
		</div>
	);
};

// ---------- Звук ----------
const at = (s: number) => Math.round(s * FPS);
const night = {from: spanOf('towerDusk').at + 3, to: spanOf('dawn').at + 1};
const dawnAt = spanOf('dawn').at;
const endAt = spanOf('end').at;

const Bed: React.FC<{src: string; from: number; to: number; vol: number; fade?: number}> = ({src, from, to, vol, fade = 2}) => {
	const dur = Math.max(1, at(to) - at(from));
	return (
		<Sequence from={at(from)} durationInFrames={dur} layout="none">
			<Audio
				src={staticFile(`sunflower/${src}.ogg`)}
				loop
				volume={(f) => vol * Math.min(1, f / (fade * FPS), (dur - f) / (fade * FPS))}
			/>
		</Sequence>
	);
};

const Soundtrack: React.FC = () => (
	<>
		<Audio
			src={staticFile('sunflower/drone.ogg')}
			volume={(f) => {
				const s = f / FPS;
				const base = s < night.from ? 0.25 : s < dawnAt ? 0.55 : 0.35;
				const out = interpolate(s, [DURATION_S - 2, DURATION_S], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
				return base * out;
			}}
		/>
		<Bed src="wind" from={0} to={night.from + 2} vol={0.35} />
		<Bed src="crickets" from={night.from} to={spanOf('thingSpeaks').at} vol={0.4} />
		{/* сверчки замолкают, когда приходит Оно, и возвращаются под утро */}
		<Bed src="crickets" from={spanOf('wait').at + 3} to={night.to} vol={0.25} />
		<Bed src="wind" from={dawnAt} to={endAt} vol={0.3} />
		{TIMED.flatMap((b, bi) =>
			(b.sfx ?? []).map((s, si) => (
				<Sequence key={`${bi}-${si}`} from={at(b.at + (s.at ?? 0))} layout="none">
					<Audio src={staticFile(`sunflower/${s.src}.ogg`)} volume={s.volume ?? 0.7} playbackRate={s.rate ?? 1} />
				</Sequence>
			)),
		)}
	</>
);

// ---------- Ролик ----------
const shakeXY = (t: number, amp: number) => (amp > 0 ? `translate(${Math.sin(t * 71) * amp}px, ${Math.cos(t * 83) * amp}px)` : '');

export const NeSveti: React.FC = () => {
	useFont();
	const frame = useCurrentFrame();
	const t = frame / FPS;
	const span = SPANS.find((s) => s.at <= t && t < s.end) ?? SPANS[SPANS.length - 1];
	const lt = t - span.at;
	const dur = span.end - span.at;
	const out = SCENES[span.id]({t, lt, dur, span});
	const [z0, z1, ox, oy] = out.zoom ?? [1, 1, 540, 960];
	const z = z0 + (z1 - z0) * smooth(lt / dur);
	// короткое затемнение на стыке сцен — как мягкая склейка
	const fadeIn = Math.min(1, lt / 0.12);
	return (
		<AbsoluteFill style={{background: '#000', fontFamily: FONT}}>
			<AbsoluteFill style={{transform: `${shakeXY(t, out.shake ?? 0)} scale(${z})`, transformOrigin: `${ox}px ${oy}px`, opacity: fadeIn}}>
				<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
					{out.svg}
				</svg>
			</AbsoluteFill>
			{out.tint ? <AbsoluteFill style={{background: out.tint}} /> : null}
			<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.65) 100%)'}} />
			{out.hud}
			<Label t={t} />
			<Subtitles t={t} />
			<Soundtrack />
		</AbsoluteFill>
	);
};
