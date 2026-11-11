import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {easeOutBack, smooth} from '../lib/anim';
import {SCENES, SceneFn} from './scenes';
import {SCENES2} from './scenes2';
import {PART2} from './story2';
import {FPS, PART1, Story, TimedBeat} from './story';

// Общий «движок» серии «Не свети»: субтитры, надписи, камера, звук.
// Каждая часть передаёт сюда свой сюжет, сцены и фоновые дорожки.

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

const Subtitles: React.FC<{t: number; story: Story}> = ({t, story}) => {
	let c: TimedBeat['chunks'][number] | null = null;
	for (const b of story.beats) for (const x of b.chunks) if (x.at <= t && t < x.end + 0.08) c = x;
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
const Label: React.FC<{t: number; story: Story}> = ({t, story}) => {
	let cur: TimedBeat | null = null;
	for (const b of story.beats) {
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

export type BedDef = {src: string; from: number; to: number; vol: number; fade?: number};

const Bed: React.FC<BedDef> = ({src, from, to, vol, fade = 2}) => {
	const dur = Math.max(1, at(to) - at(from));
	return (
		<Sequence from={at(from)} durationInFrames={dur} layout="none">
			<Audio src={staticFile(`sunflower/${src}.ogg`)} loop volume={(f) => vol * Math.min(1, f / (fade * FPS), (dur - f) / (fade * FPS))} />
		</Sequence>
	);
};

export type Mix = {voice?: string; voiceVol?: number; gain?: number};

const Soundtrack: React.FC<{story: Story; beds: BedDef[]; drone: (s: number) => number; mix: Mix}> = ({story, beds, drone, mix}) => {
	// под голосом фон и эффекты тише, шёпот-эффекты ещё тише (реплики читает диктор)
	const g = mix.voice ? mix.gain ?? 0.55 : 1;
	return (
		<>
			{mix.voice ? <Audio src={staticFile(mix.voice)} volume={mix.voiceVol ?? 1} /> : null}
			<Audio
				src={staticFile('sunflower/drone.ogg')}
				loop
				volume={(f) => {
					const s = f / FPS;
					const out = interpolate(s, [story.duration - 2, story.duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
					return drone(s) * out * g;
				}}
			/>
			{beds.map((b, i) => (
				<Bed key={i} {...b} vol={b.vol * g} />
			))}
			{story.beats.flatMap((b, bi) =>
				(b.sfx ?? []).map((s, si) => (
					<Sequence key={`${bi}-${si}`} from={at(b.at + (s.at ?? 0))} layout="none">
						<Audio src={staticFile(`sunflower/${s.src}.ogg`)} volume={(s.volume ?? 0.7) * (mix.voice ? (s.src === 'whisper' ? 0.35 : 0.8) : 1)} playbackRate={s.rate ?? 1} />
					</Sequence>
				)),
			)}
		</>
	);
};

// ---------- Серия ----------
const shakeXY = (t: number, amp: number) => (amp > 0 ? `translate(${Math.sin(t * 71) * amp}px, ${Math.cos(t * 83) * amp}px)` : '');

export const makeEpisode = (story: Story, scenes: Record<string, SceneFn>, beds: BedDef[], drone: (s: number) => number, mix: Mix = {}): React.FC => {
	const Episode: React.FC = () => {
		useFont();
		const frame = useCurrentFrame();
		const t = frame / FPS;
		const span = story.spans.find((s) => s.at <= t && t < s.end) ?? story.spans[story.spans.length - 1];
		const lt = t - span.at;
		const dur = span.end - span.at;
		const out = scenes[span.id]({t, lt, dur, span});
		const [z0, z1, ox, oy] = out.zoom ?? [1, 1, 540, 960];
		const z = z0 + (z1 - z0) * smooth(lt / dur);
		// короткое затемнение на стыке сцен — мягкая склейка
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
				<Label t={t} story={story} />
				<Subtitles t={t} story={story} />
				<Soundtrack story={story} beds={beds} drone={drone} mix={mix} />
			</AbsoluteFill>
		);
	};
	return Episode;
};

// ---------- Часть 1 ----------
const P1 = PART1;
const night1 = {from: P1.spanOf('towerDusk').at + 3, to: P1.spanOf('dawn').at + 1};

export const NeSveti = makeEpisode(
	P1,
	SCENES,
	[
		{src: 'wind', from: 0, to: night1.from + 2, vol: 0.35},
		{src: 'crickets', from: night1.from, to: P1.spanOf('thingSpeaks').at, vol: 0.4},
		// сверчки замолкают, когда приходит Оно, и возвращаются под утро
		{src: 'crickets', from: P1.spanOf('wait').at + 3, to: night1.to, vol: 0.25},
		{src: 'wind', from: P1.spanOf('dawn').at, to: P1.spanOf('end').at, vol: 0.3},
	],
	(s) => (s < night1.from ? 0.25 : s < P1.spanOf('dawn').at ? 0.55 : 0.35),
);

// ---------- Часть 2: «Обмен» ----------
const P2 = PART2;
const night2 = {from: P2.spanOf('rule1b').at, to: P2.spanOf('dawn2').at + 1};

export const NeSveti2 = makeEpisode(
	P2,
	SCENES2,
	[
		{src: 'crickets', from: 0, to: P2.spanOf('dream').at, vol: 0.35, fade: 1},
		{src: 'wind', from: P2.spanOf('farmer').at, to: night2.from + 1, vol: 0.3},
		{src: 'crickets', from: night2.from, to: P2.spanOf('thing').at, vol: 0.4},
		// когда приходит Оно, сверчки молчат; после обмена возвращаются
		{src: 'crickets', from: P2.spanOf('exchange').at + 2, to: night2.to, vol: 0.25},
		{src: 'wind', from: P2.spanOf('dawn2').at, to: P2.spanOf('end2').at, vol: 0.3},
	],
	(s) => (s < P2.spanOf('walkIn').at ? 0.3 : s < P2.spanOf('dawn2').at ? 0.55 : 0.35),
	{voice: 'sunflower/voice2.ogg'},
);
