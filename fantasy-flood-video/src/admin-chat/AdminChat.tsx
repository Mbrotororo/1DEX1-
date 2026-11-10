import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {easeOutBack} from '../lib/anim';
import {Chat, Clock, Console, Hook, Jumpscare, Panel, PanelEnd, Spawn} from './Scenes';
import {DURATION_S, FPS, SCENES, SUBS, T} from './script';
import {FONT, RED, YELLOW, outline} from './ui';

// ---------- Шрифт Pixelify Sans (кириллица + латиница) ----------
const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const useFont = () => {
	const [handle] = useState(() => delayRender('Pixelify Sans'));
	useEffect(() => {
		const faces = (['400', '700'] as const).flatMap((w) => [
			new FontFace('Pixelify', `url(${staticFile(`fonts/pixelify-sans-cyrillic-${w}-normal.woff2`)})`, {unicodeRange: CYR, weight: w}),
			new FontFace('Pixelify', `url(${staticFile(`fonts/pixelify-sans-latin-${w}-normal.woff2`)})`, {weight: w}),
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

// ---------- Субтитры: 2–4 слова, *красный*, ^жёлтый^ ----------
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

const Subtitles: React.FC<{t: number}> = ({t}) => {
	let cur = -1;
	SUBS.forEach((s, i) => {
		if (s.at <= t) cur = i;
	});
	if (cur < 0 || !SUBS[cur].text) return null;
	const k = easeOutBack((t - SUBS[cur].at) / 0.18, 2.2);
	return (
		<div
			style={{
				position: 'absolute',
				left: 50,
				right: 50,
				top: 1500,
				textAlign: 'center',
				fontFamily: FONT,
				fontWeight: 400,
				fontSize: 92,
				lineHeight: 1.1,
				color: '#fff',
				textShadow: outline(3),
				filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.95)) drop-shadow(0 0 4px #000)',
				transform: `scale(${0.8 + 0.2 * k})`,
			}}
		>
			{renderSub(SUBS[cur].text)}
		</div>
	);
};

// ---------- Звук: только звуки Minecraft + свой фоновый гул ----------
type Sfx = {at: number; src: string; volume?: number; rate?: number; dur?: number};
const SFX: Sfx[] = [
	{at: 0, src: 'mob/warden/heartbeat_1', volume: 1},
	{at: 0.15, src: 'random/click', volume: 0.6, rate: 0.6},
	{at: 1.2, src: 'mob/warden/heartbeat_2', volume: 1},
	{at: 2.4, src: 'note/bass', volume: 1, rate: 0.5},
	// список админов
	...Array.from({length: 10}, (_, i) => ({at: 3.8 + i * 0.32, src: 'random/click', volume: 0.35, rate: 1.1 + i * 0.03})),
	{at: 8.6, src: 'random/orb', volume: 0.5, rate: 0.7},
	{at: 8.0, src: 'ambient/cave/cave1', volume: 0.6},
	// часы
	{at: T.clockFlip, src: 'note/bass', volume: 1, rate: 0.6},
	{at: T.clockFlip, src: 'random/click', volume: 0.7},
	{at: 15.0, src: 'note/pling', volume: 0.35, rate: 0.5},
	// чат
	{at: 18.3, src: 'random/pop', volume: 0.8, rate: 1.6},
	{at: 19.8, src: 'mob/warden/heartbeat_3', volume: 0.9},
	{at: 22.0, src: 'ambient/cave/cave13', volume: 0.7},
	{at: 23.2, src: 'note/bass', volume: 1, rate: 0.5},
	{at: 24.4, src: 'random/pop', volume: 0.7, rate: 1.6},
	{at: 25.6, src: 'random/pop', volume: 0.7, rate: 1.5},
	{at: 26.2, src: 'random/pop', volume: 0.7, rate: 1.6},
	// факелы гаснут
	...T.torchesOut.map((at) => ({at, src: 'random/fizz', volume: 0.9, rate: 0.9})),
	// консоль
	...[0, 1, 2, 3].map((i) => ({at: T.listTyped + i * 0.12, src: 'random/click', volume: 0.4, rate: 1.8})),
	{at: T.onlineZero, src: 'note/bass', volume: 1, rate: 0.5},
	{at: T.onlineZero, src: 'mob/warden/listening_1', volume: 0.8},
	// фигура
	{at: T.figureFar, src: 'random/pop', volume: 0.7, rate: 1.6},
	{at: T.figureFar + 0.2, src: 'mob/warden/nearby_close_1', volume: 0.9},
	{at: T.figureNear, src: 'random/pop', volume: 0.7, rate: 1.6},
	{at: T.figureNear + 0.8, src: 'mob/warden/listening_1', volume: 0.9, rate: 0.8},
	{at: 40.0, src: 'ambient/cave/cave7', volume: 0.7},
	// «1DEX1 печатает…» — сердце всё чаще
	{at: 41.6, src: 'mob/warden/heartbeat_1', volume: 1},
	{at: 42.6, src: 'mob/warden/heartbeat_2', volume: 1},
	{at: 43.4, src: 'mob/warden/heartbeat_3', volume: 1},
	{at: 44.0, src: 'mob/warden/heartbeat_4', volume: 1},
	{at: 44.5, src: 'mob/warden/heartbeat_1', volume: 1},
	// тишина 45.0–46.5, потом сообщение и скример
	{at: T.ghostMessage, src: 'random/pop', volume: 1, rate: 0.8},
	{at: T.jumpscare, src: 'mob/endermen/stare', volume: 1},
	{at: T.jumpscare, src: 'mob/warden/listening_angry_1', volume: 1},
	{at: 48.6, src: 'note/bass', volume: 1, rate: 0.5},
	// утро: костя вышел, второй 1DEX1 зашёл
	{at: T.kostyaLeaves, src: 'random/fizz', volume: 0.6, rate: 0.7},
	{at: 53.8, src: 'note/bass', volume: 1, rate: 0.5},
	{at: T.secondJoins, src: 'random/orb', volume: 1, rate: 0.5},
	{at: T.secondJoins, src: 'mob/warden/nearby_close_1', volume: 0.9},
	{at: T.cta, src: 'random/levelup', volume: 0.6, rate: 0.8},
];

const Soundtrack: React.FC = () => {
	const total = DURATION_S * FPS;
	// гул: тише во время тишины перед скримером
	const droneVol = (f: number) => {
		const s = f / FPS;
		if (s >= 45 && s < 46.5) return 0;
		const fadeIn = interpolate(s, [0, 2], [0, 0.55], {extrapolateRight: 'clamp'});
		const fadeOut = interpolate(s, [58.5, 60], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
		return fadeIn * fadeOut;
	};
	return (
		<>
			<Audio src={staticFile('admin-chat/drone.ogg')} volume={droneVol} endAt={total} />
			{SFX.map((e, i) => (
				<Sequence key={i} from={Math.round(e.at * FPS)} durationInFrames={e.dur ? Math.round(e.dur * FPS) : undefined} layout="none">
					<Audio src={staticFile(`sounds/${e.src}.ogg`)} volume={e.volume ?? 0.6} playbackRate={e.rate ?? 1} />
				</Sequence>
			))}
		</>
	);
};

// ---------- Ролик ----------
export const AdminChat: React.FC = () => {
	useFont();
	const frame = useCurrentFrame();
	const t = frame / FPS;
	let idx = 0;
	SCENES.forEach((s, i) => {
		if (s.at <= t) idx = i;
	});
	const scene = SCENES[idx];

	let body: React.ReactNode = null;
	switch (scene.kind) {
		case 'hook':
			body = <Hook t={t} />;
			break;
		case 'panel':
			body = <Panel t={t} from={scene.at} />;
			break;
		case 'clock':
			body = <Clock t={t} />;
			break;
		case 'chat':
			body = <Chat t={t} />;
			break;
		case 'spawn':
			body = <Spawn t={t} />;
			break;
		case 'console':
			body = <Console t={t} />;
			break;
		case 'figure':
			body = <Spawn t={t} figure={t < T.figureNear ? 'far' : 'near'} />;
			break;
		case 'typing':
			body = <Chat t={t} typing />;
			break;
		case 'silence':
			body = <AbsoluteFill style={{background: '#000'}} />;
			break;
		case 'scare':
			body =
				t >= T.jumpscare && t < T.jumpscareEnd ? (
					<Jumpscare t={t} />
				) : (
					<Chat t={t} danger={t < T.jumpscare ? 1 : 0.6 + 0.4 * Math.sin(t * 8)} />
				);
			break;
		case 'panelEnd':
			body = <PanelEnd t={t} />;
			break;
	}

	return (
		<AbsoluteFill style={{background: '#000', fontFamily: FONT}}>
			{body}
			<Subtitles t={t} />
			<Soundtrack />
		</AbsoluteFill>
	);
};
