import React from 'react';
import {clamp01, easeOutBack, easeOutCubic, smooth} from '../lib/anim';
import {hash3} from '../lib/rng';
import {ADMINS, CHAT, GHOST, ME, NICK_COLORS, T} from './script';
import {DirtBg, FONT, McPanel, NickAvatar, RED, SkinFigure, SkinHead, Vignette, YELLOW, mcShadow, outline} from './ui';

type P = {t: number};

const fill: React.CSSProperties = {position: 'absolute', inset: 0, overflow: 'hidden'};

// Дрожание камеры: детерминированное, от времени
export const shake = (t: number, amp: number) => {
	if (amp <= 0) return 'none';
	const x = Math.sin(t * 71.3) * 0.6 + Math.sin(t * 133.7) * 0.4;
	const y = Math.cos(t * 83.1) * 0.6 + Math.sin(t * 117.9) * 0.4;
	return `translate(${x * amp}px, ${y * amp}px)`;
};

// ================= 0. Хук: «участников: 11» =================

export const Hook: React.FC<P> = ({t}) => {
	const k = easeOutBack(t / 0.35);
	// глитч: короткие сдвиги каналов в случайные кадры
	const g = hash3(Math.floor(t * 30), 3, 1) > 0.72 ? 1 : 0;
	const off = g * (8 + hash3(Math.floor(t * 30), 4, 1) * 18);
	const noise: React.ReactNode[] = [];
	for (let i = 0; i < 70; i++) {
		const f = Math.floor(t * 15);
		const x = hash3(i, f, 11) * 1080;
		const y = hash3(i, f, 12) * 1920;
		const w = 20 + hash3(i, f, 13) * 140;
		noise.push(
			<div key={i} style={{position: 'absolute', left: x, top: y, width: w, height: 6, background: `rgba(255,255,255,${0.03 + hash3(i, f, 14) * 0.07})`}} />,
		);
	}
	const big = (color: string, dx: number): React.CSSProperties => ({
		position: 'absolute',
		left: 0,
		right: 0,
		top: 560,
		textAlign: 'center',
		fontFamily: FONT,
		fontSize: 520,
		lineHeight: 1,
		fontWeight: 700,
		color,
		transform: `translateX(${dx}px) scale(${k})`,
		mixBlendMode: 'screen',
	});
	return (
		<div style={{...fill, background: '#050507'}}>
			{noise}
			<div style={{position: 'absolute', left: 0, right: 0, top: 380, textAlign: 'center', fontFamily: FONT, fontSize: 92, color: '#d8d8d8', textShadow: mcShadow(8), opacity: clamp01(t / 0.2)}}>
				УЧАСТНИКОВ:
			</div>
			<div style={big('#00e5ff', -off)}>11</div>
			<div style={big(RED, off)}>11</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 1110, textAlign: 'center', fontFamily: FONT, fontSize: 56, color: '#8a8a8a', opacity: clamp01((t - 2.4) / 0.2)}}>
				админов: 10
			</div>
			<Vignette />
		</div>
	);
};

// ================= Список админов =================

const ROW_H = 92;

const Row: React.FC<{nick: string; status: string; statusColor: string; appear: number; height?: number; glow?: number; strike?: number}> = ({
	nick,
	status,
	statusColor,
	appear,
	height = 1,
	glow = 0,
	strike = 0,
}) => {
	const a = easeOutCubic(appear);
	return (
		<div
			style={{
				height: ROW_H * height,
				overflow: 'hidden',
				opacity: a,
				transform: `translateX(${(1 - a) * -80}px)`,
			}}
		>
			<div
				style={{
					height: ROW_H - 10,
					display: 'flex',
					alignItems: 'center',
					gap: 24,
					padding: '0 18px',
					background: glow > 0 ? `rgba(120,0,0,${0.35 + 0.35 * glow})` : 'rgba(0,0,0,0.55)',
					boxShadow: glow > 0 ? `0 0 ${30 * glow}px rgba(255,40,40,${0.8 * glow})` : 'none',
					border: '3px solid #2b2b2b',
				}}
			>
				{nick === ME ? <SkinHead s={8} eyes={glow} /> : <NickAvatar nick={nick} size={64} color={NICK_COLORS[nick] ?? '#888'} />}
				<div
					style={{
						flex: 1,
						fontFamily: FONT,
						fontSize: 50,
						color: glow > 0 ? '#ff8080' : NICK_COLORS[nick] ?? '#fff',
						textShadow: mcShadow(5),
						textDecoration: strike > 0.5 ? 'line-through' : 'none',
					}}
				>
					{nick}
				</div>
				<div style={{fontFamily: FONT, fontSize: 36, color: statusColor, textShadow: mcShadow(4)}}>{status}</div>
			</div>
		</div>
	);
};

const PanelFrame: React.FC<{title: string; count: string; countColor: string; countPulse?: number; children: React.ReactNode}> = ({
	title,
	count,
	countColor,
	countPulse = 0,
	children,
}) => (
	<McPanel style={{position: 'absolute', left: 40, right: 40, top: 110, padding: 26}}>
		<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20}}>
			<div style={{fontFamily: FONT, fontSize: 54, color: '#3f3f3f'}}>{title}</div>
			<div
				style={{
					fontFamily: FONT,
					fontSize: 64,
					fontWeight: 700,
					color: countColor,
					textShadow: mcShadow(5),
					transform: `scale(${1 + 0.25 * countPulse})`,
				}}
			>
				{count}
			</div>
		</div>
		<div style={{background: '#1d1d1d', padding: 14}}>{children}</div>
	</McPanel>
);

export const Panel: React.FC<P & {from: number}> = ({t, from}) => {
	const lt = t - from;
	const shown = ADMINS.filter((_, i) => lt >= 0.2 + i * 0.32).length;
	const pulse = Math.max(0, 1 - Math.abs(t - 8.75) / 0.25);
	return (
		<div style={fill}>
			<DirtBg />
			<PanelFrame title="АДМИНЫ СЕРВЕРА" count={`${shown} / 10`} countColor={pulse > 0 ? YELLOW : '#fff'} countPulse={pulse}>
				{ADMINS.map((n, i) => (
					<Row key={n} nick={n} status="не в сети" statusColor="#9a9a9a" appear={(lt - 0.2 - i * 0.32) / 0.25} />
				))}
			</PanelFrame>
			<Vignette k={0.7} />
		</div>
	);
};

export const PanelEnd: React.FC<P> = ({t}) => {
	const leave = clamp01((t - T.kostyaLeaves) / 0.6);
	const join = clamp01((t - T.secondJoins) / 0.35);
	const pulse11 = Math.max(0, 1 - Math.abs(t - 53.95) / 0.3);
	const glow = join > 0 ? 0.6 + 0.4 * Math.sin(t * 9) : 0;
	const cta = clamp01((t - T.cta) / 0.3);
	return (
		<div style={{...fill, transform: shake(t, join > 0 && t < T.secondJoins + 0.5 ? 14 : 0)}}>
			<DirtBg />
			<PanelFrame title="ЧАТ АДМИНОВ" count="11" countColor={RED} countPulse={pulse11}>
				{ADMINS.map((n) => (
					<Row key={n} nick={n} status="не в сети" statusColor="#9a9a9a" appear={1} />
				))}
				<Row
					nick={GHOST}
					status={leave > 0 ? 'вышел' : 'не в сети'}
					statusColor={leave > 0 ? RED : '#9a9a9a'}
					appear={1 - smooth((leave - 0.4) / 0.6)}
					height={1 - smooth((leave - 0.4) / 0.6)}
					strike={leave}
				/>
				{join > 0 ? <Row nick={ME} status="в сети" statusColor={RED} appear={join} glow={glow} /> : null}
			</PanelFrame>
			{cta > 0 ? (
				<div style={{position: 'absolute', left: 0, right: 0, top: 560, display: 'flex', justifyContent: 'center', transform: `scale(${easeOutBack(cta)})`}}>
					<div
						style={{
							fontFamily: FONT,
							fontSize: 74,
							color: '#fff',
							textShadow: mcShadow(6),
							background: '#7a1010',
							border: '6px solid #000',
							boxShadow: 'inset 6px 6px 0 #c84040, inset -6px -6px 0 #3a0505, 0 0 60px rgba(255,40,40,0.6)',
							padding: '30px 60px',
						}}
					>
						ПОДПИСАТЬСЯ
					</div>
				</div>
			) : null}
			<Vignette k={0.8} />
		</div>
	);
};

// ================= Часы и рестарт =================

export const Clock: React.FC<P> = ({t}) => {
	const after = t >= T.clockFlip;
	const flip = Math.max(0, 1 - (t - T.clockFlip) / 0.25);
	const prog = clamp01((t - 11.2) / 6.6);
	const left = Math.ceil((1 - prog) * 600);
	const mm = String(Math.floor(left / 60)).padStart(2, '0');
	const ss = String(left % 60).padStart(2, '0');
	const zero = clamp01((t - 15.0) / 0.2);
	return (
		<div style={fill}>
			<DirtBg dim={0.82} />
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 260,
					textAlign: 'center',
					fontFamily: FONT,
					fontSize: 300,
					fontWeight: 700,
					color: after ? YELLOW : '#e8e8e8',
					textShadow: mcShadow(16),
					transform: `scale(${1 + flip * 0.12})`,
				}}
			>
				{after ? '03:00' : '02:59'}
			</div>
			<McPanel style={{position: 'absolute', left: 90, right: 90, top: 720, padding: 30}}>
				<div style={{fontFamily: FONT, fontSize: 50, color: '#3f3f3f', marginBottom: 18}}>
					{after ? 'РЕСТАРТ СЕРВЕРА…' : 'СЕРВЕР: ОНЛАЙН'}
				</div>
				<div style={{height: 54, background: '#1d1d1d', border: '4px solid #000', position: 'relative'}}>
					<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, background: '#5ec43a', boxShadow: 'inset 0 -10px 0 #3c8a22'}} />
				</div>
				<div style={{display: 'flex', justifyContent: 'space-between', marginTop: 18, fontFamily: FONT, fontSize: 46}}>
					<span style={{color: '#3f3f3f'}}>осталось {after ? `${mm}:${ss}` : '—'}</span>
					<span style={{color: zero > 0 ? '#b00000' : '#3f3f3f', opacity: after ? 1 : 0}}>игроков: 0</span>
				</div>
			</McPanel>
			<Vignette k={0.75} />
		</div>
	);
};

// ================= Чат админов (окно) =================

const EARLIER = [
	{nick: 'Vovan', text: 'всем споки'},
	{nick: 'Mira', text: 'рестарт в 3, не забудьте'},
	{nick: '[Сервер]', text: 'Перезагрузка в 03:00'},
];

const ChatLine: React.FC<{nick: string; text: string; appear: number; size?: number; danger?: number}> = ({nick, text, appear, size = 46, danger = 0}) => {
	const isServer = nick.startsWith('[');
	return (
		<div
			style={{
				fontFamily: FONT,
				fontSize: size,
				lineHeight: 1.25,
				color: '#fff',
				textShadow: mcShadow(4),
				padding: '6px 14px',
				opacity: clamp01(appear / 0.15),
				transform: `translateY(${(1 - easeOutCubic(appear / 0.25)) * 30}px)`,
				background: danger > 0 ? `rgba(160,0,0,${0.55 * danger})` : 'transparent',
			}}
		>
			{isServer ? (
				<span style={{color: YELLOW}}>
					{nick} {text}
				</span>
			) : (
				<>
					<span style={{color: NICK_COLORS[nick] ?? '#fff'}}>&lt;{nick}&gt;</span> {text}
				</>
			)}
		</div>
	);
};

export const ChatWindow: React.FC<P & {typing?: boolean; danger?: number}> = ({t, typing = false, danger = 0}) => {
	const msgs = CHAT.filter((m) => m.at <= t);
	const typingK = typing ? clamp01((t - T.typingStart) / 0.2) : 0;
	const dots = '.'.repeat(1 + (Math.floor(t * 3) % 3));
	const cursor = Math.floor(t * 2) % 2 === 0;
	return (
		<McPanel style={{position: 'absolute', left: 40, right: 40, top: 110, padding: 22}}>
			<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
				<div style={{fontFamily: FONT, fontSize: 52, color: '#3f3f3f'}}>ЧАТ АДМИНОВ</div>
				<div style={{fontFamily: FONT, fontSize: 40, color: '#8b0000'}}>11 участников</div>
			</div>
			<div style={{height: 860, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 12, overflow: 'hidden'}}>
				{EARLIER.map((m, i) => (
					<div key={i} style={{opacity: 0.45}}>
						<ChatLine nick={m.nick} text={m.text} appear={1} />
					</div>
				))}
				<div style={{fontFamily: FONT, fontSize: 34, color: '#777', textAlign: 'center', padding: '10px 0'}}>— 03:02 —</div>
				{msgs.map((m) => (
					<ChatLine key={m.at} nick={m.nick} text={m.text} appear={t - m.at} danger={m.nick === ME ? danger : 0} />
				))}
			</div>
			<div style={{marginTop: 16, height: 76, background: '#000', border: '4px solid #a0a0a0', display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: FONT, fontSize: 46, color: '#fff'}}>
				&gt; {cursor ? '_' : ''}
			</div>
			<div style={{height: 64, marginTop: 10, fontFamily: FONT, fontSize: 44, color: RED, opacity: typingK, textShadow: mcShadow(3)}}>
				{ME} печатает{dots}
			</div>
		</McPanel>
	);
};

export const Chat: React.FC<P & {typing?: boolean; danger?: number; dimBg?: number}> = ({t, typing, danger = 0}) => {
	const heart = typing ? clamp01((t - T.typingStart) / 3.4) : 0;
	return (
		<div style={{...fill, transform: shake(t, heart * 6)}}>
			<DirtBg dim={0.85} />
			<ChatWindow t={t} typing={typing} danger={danger} />
			{danger > 0 ? <div style={{...fill, background: `rgba(120,0,0,${0.25 * danger})`}} /> : null}
			<Vignette k={0.75 + heart * 0.2} />
		</div>
	);
};

// ================= Спавн ночью =================

const BLOCK = 90;
const GROUND_Y = 1180;
const PLATFORM_Y = GROUND_Y - BLOCK;
const TORCH_X = [250, 540, 830];

const Torch: React.FC<{x: number; lit: number; smoke: number; t: number; i: number}> = ({x, lit, smoke, t, i}) => {
	const flick = 0.9 + 0.1 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 7.3 + i);
	return (
		<>
			{/* свет от факела */}
			<div
				style={{
					position: 'absolute',
					left: x - 330,
					top: PLATFORM_Y - 260 - 330,
					width: 660,
					height: 660,
					borderRadius: '50%',
					background: 'radial-gradient(circle, rgba(255,190,90,0.45) 0%, rgba(255,140,40,0.12) 40%, rgba(0,0,0,0) 70%)',
					opacity: lit * flick,
				}}
			/>
			{/* столб-забор */}
			<div style={{position: 'absolute', left: x - 12, top: PLATFORM_Y - 180, width: 24, height: 180, background: '#6b4a2b', boxShadow: 'inset -6px 0 0 #4a321c'}} />
			{/* факел */}
			<div style={{position: 'absolute', left: x - 8, top: PLATFORM_Y - 250, width: 16, height: 70, background: '#7a5530'}} />
			<div
				style={{
					position: 'absolute',
					left: x - 14,
					top: PLATFORM_Y - 282,
					width: 28,
					height: 32,
					background: '#ffd84a',
					boxShadow: 'inset 0 -12px 0 #ff8a1a, 0 0 30px 8px rgba(255,170,60,0.8)',
					opacity: lit * flick,
				}}
			/>
			{/* дымок после того, как погас */}
			{smoke > 0 && smoke < 1
				? [0, 1, 2].map((j) => (
						<div
							key={j}
							style={{
								position: 'absolute',
								left: x - 10 + Math.sin(j * 2 + t * 3) * 14,
								top: PLATFORM_Y - 290 - smoke * 120 - j * 40,
								width: 20,
								height: 20,
								background: '#9a9a9a',
								opacity: (1 - smoke) * 0.7,
							}}
						/>
					))
				: null}
		</>
	);
};

export const Spawn: React.FC<P & {figure?: 'none' | 'far' | 'near'}> = ({t, figure = 'none'}) => {
	const lits = T.torchesOut.map((at) => 1 - clamp01((t - at) / 0.12));
	// дым живёт ~1 с после того, как факел погас
	const smokes = T.torchesOut.map((at) => clamp01((t - at) / 1.0));
	const dark = 0.15 + 0.18 * T.torchesOut.filter((at) => t >= at).length;

	const stars: React.ReactNode[] = [];
	for (let i = 0; i < 70; i++) {
		const x = hash3(i, 1, 21) * 1080;
		const y = hash3(i, 2, 21) * 820;
		const s = hash3(i, 3, 21) > 0.8 ? 8 : 5;
		const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash3(i, 4, 21) * 3) + i);
		stars.push(<div key={i} style={{position: 'absolute', left: x, top: y, width: s, height: s, background: '#dfe6ff', opacity: 0.3 + 0.6 * tw}} />);
	}

	const trees: React.ReactNode[] = [];
	for (let i = 0; i < 9; i++) {
		const x = i * 125 - 30 + hash3(i, 0, 5) * 40;
		const h = 3 + Math.floor(hash3(i, 1, 5) * 3);
		trees.push(
			<div key={i}>
				<div style={{position: 'absolute', left: x + 45, top: GROUND_Y - h * 60, width: 30, height: h * 60, background: '#0b0d12'}} />
				<div style={{position: 'absolute', left: x, top: GROUND_Y - h * 60 - 120, width: 120, height: 150, background: '#0a1410'}} />
			</div>,
		);
	}

	const ground: React.ReactNode[] = [];
	for (let y = 0; y < 9; y++) {
		for (let x = 0; x < 12; x++) {
			const n = hash3(x, y, 31);
			const top = y === 0;
			ground.push(
				<div
					key={`${x}-${y}`}
					style={{
						position: 'absolute',
						left: x * BLOCK,
						top: GROUND_Y + y * BLOCK,
						width: BLOCK,
						height: BLOCK,
						background: top ? `linear-gradient(#3f7a2a 0 24%, hsl(25,32%,${26 + n * 6}%) 24%)` : `hsl(25,30%,${22 + n * 6}%)`,
						boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.25)',
					}}
				/>,
			);
		}
	}

	const platform: React.ReactNode[] = [];
	for (let x = 2; x < 10; x++) {
		const n = hash3(x, 9, 41);
		platform.push(
			<div
				key={x}
				style={{
					position: 'absolute',
					left: x * BLOCK - 45,
					top: PLATFORM_Y,
					width: BLOCK,
					height: BLOCK,
					background: `hsl(0,0%,${44 + n * 8}%)`,
					boxShadow: 'inset 0 0 0 3px #3b3b3b, inset 0 -45px 0 0 rgba(0,0,0,0.12)',
				}}
			/>,
		);
	}

	// фигура: дальний и ближний план — это одна сцена, просто камера наезжает
	const zoom = figure === 'near' ? 2.6 : 1;
	const figS = 7;
	const figW = 14 * figS;
	const figH = 32 * figS;
	const figAppear = figure === 'far' ? clamp01((t - T.figureFar) / 1.4) : figure === 'near' ? 1 : 0;
	const eyes = figure === 'near' ? clamp01((t - T.figureNear - 0.3) / 0.6) : figure === 'far' ? 0.4 * figAppear : 0;
	const breathe = figure === 'near' ? 1 + 0.015 * Math.sin(t * 2) : 1;

	return (
		<div style={{...fill, background: 'linear-gradient(#03040a, #0d1430 60%, #151b38)'}}>
			<div style={{...fill, transform: `scale(${zoom * breathe})`, transformOrigin: `540px ${PLATFORM_Y - figH + 40}px`}}>
				{stars}
				{/* квадратная луна */}
				<div style={{position: 'absolute', left: 760, top: 150, width: 130, height: 130, background: '#e9ecf5', boxShadow: '0 0 80px 20px rgba(200,210,255,0.25), inset -26px -26px 0 #c9cee0'}} />
				{trees}
				{ground}
				{platform}
				{TORCH_X.map((x, i) => (
					<Torch key={i} x={x} lit={lits[i]} smoke={smokes[i]} t={t} i={i} />
				))}
				<div style={{...fill, background: `rgba(0,0,0,${dark})`}} />
				{figAppear > 0 ? (
					<div
						style={{
							position: 'absolute',
							left: 540 - figW / 2,
							top: PLATFORM_Y - figH,
							opacity: figAppear,
							filter: `brightness(${figure === 'near' ? 0.42 : 0.12})`,
						}}
					>
						<SkinFigure s={figS} />
					</div>
				) : null}
				{eyes > 0 ? (
					<div style={{position: 'absolute', left: 540 - figW / 2 + 3 * figS, top: PLATFORM_Y - figH}}>
						<div style={{position: 'relative', width: 8 * figS, height: 8 * figS}}>
							{[1, 5].map((c) => (
								<div
									key={c}
									style={{
										position: 'absolute',
										left: c * figS,
										top: 4 * figS,
										width: 2 * figS,
										height: figS,
										background: '#fff',
										opacity: eyes,
										boxShadow: `0 0 12px 4px rgba(255,255,255,${0.7 * eyes})`,
									}}
								/>
							))}
						</div>
					</div>
				) : null}
			</div>
			<MiniChat t={t} />
			<Vignette k={0.9} />
		</div>
	);
};

// Чат поверх игры, как в Minecraft: последние сообщения слева снизу
const MiniChat: React.FC<P> = ({t}) => {
	const msgs = CHAT.filter((m) => m.at <= t).slice(-2);
	return (
		<div style={{position: 'absolute', left: 30, right: 30, top: 1250}}>
			{msgs.map((m) => (
				<div key={m.at} style={{background: 'rgba(0,0,0,0.55)', marginBottom: 6}}>
					<ChatLine nick={m.nick} text={m.text} appear={t - m.at} size={44} />
				</div>
			))}
		</div>
	);
};

// ================= Консоль сервера =================

export const Console: React.FC<P> = ({t}) => {
	const cmd = 'list';
	const typed = cmd.slice(0, Math.max(0, Math.floor((t - T.listTyped) / 0.12) + 1));
	const answered = t >= T.onlineZero;
	const flash = answered ? Math.max(0, 1 - (t - T.onlineZero) / 0.3) : 0;
	const cursor = Math.floor(t * 2.5) % 2 === 0;
	const line = (c: string, s: React.ReactNode, key: string) => (
		<div key={key} style={{color: c, marginBottom: 14}}>
			{s}
		</div>
	);
	return (
		<div style={{...fill, background: '#07090b', transform: shake(t, flash * 18)}}>
			<div style={{position: 'absolute', left: 60, right: 60, top: 240, fontFamily: FONT, fontSize: 54, lineHeight: 1.25}}>
				{line('#6b6b6b', '[03:04] Сервер остановлен', 'a')}
				{line('#6b6b6b', '[03:04] Рестарт через 06:00', 'b')}
				{line('#6b6b6b', '[03:04] Порт закрыт', 'c')}
				{line('#55ff55', <>&gt; {typed}{!answered && cursor ? '_' : ''}</>, 'd')}
				{answered
					? line(
							RED,
							<span style={{fontSize: 74, textShadow: `0 0 ${30 * flash + 10}px rgba(255,40,40,0.7)`}}>
								Игроков онлайн: 0 из 100
							</span>,
							'e',
						)
					: null}
				{answered ? line('#55ff55', <>&gt; {cursor ? '_' : ''}</>, 'f') : null}
			</div>
			{flash > 0 ? <div style={{...fill, background: `rgba(255,255,255,${flash * 0.25})`}} /> : null}
			<Vignette k={0.8} />
		</div>
	);
};

// ================= Скример =================

export const Jumpscare: React.FC<P> = ({t}) => {
	const lt = t - T.jumpscare;
	const z = 0.85 + easeOutCubic(lt / 0.25) * 0.3 + lt * 0.05;
	const white = lt < 0.07 ? 1 : 0;
	return (
		<div style={{...fill, background: '#000', transform: shake(t, 40)}}>
			<div style={{position: 'absolute', left: 540 - 480, top: 520 - 480, transform: `scale(${z})`, filter: 'brightness(0.9) contrast(1.3) sepia(0.8) hue-rotate(-40deg) saturate(2.5)'}}>
				<SkinHead s={120} />
			</div>
			{/* глаза поверх фильтра, чтобы светились белым */}
			<div style={{position: 'absolute', left: 540 - 480, top: 520 - 480, transform: `scale(${z})`}}>
				<div style={{position: 'relative', width: 960, height: 960}}>
					{[1, 5].map((c) => (
						<div key={c} style={{position: 'absolute', left: c * 120, top: 4 * 120, width: 240, height: 120, background: '#fff', boxShadow: '0 0 80px 30px rgba(255,255,255,0.8)'}} />
					))}
				</div>
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 1150, textAlign: 'center', fontFamily: FONT, fontSize: 120, fontWeight: 700, color: RED, textShadow: outline(6)}}>
				&lt;{ME}&gt;
			</div>
			{white ? <div style={{...fill, background: '#fff'}} /> : null}
		</div>
	);
};
