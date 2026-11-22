import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {Assets} from '../assets';
import {easeInOutCubic, easeOutBack, easeOutCubic, lerp, prog, smooth} from '../lib/anim';
import {idle, withHandsUp} from '../lib/poses';
import {cue, FPS, type Line} from '../lib/timeline';
import {Burst} from '../scene/Particles';
import {Nametag} from '../scene/Nametag';
import {Player, PLAYER_HEIGHT, IDLE_POSE} from '../scene/Player';
import {camQuat, Stage, type Cam} from '../scene/Stage';
import {fill, Voxels, type Block} from '../scene/Voxels';
import {Notification, Outline, Sfx, Sky} from '../ui/kit';

// Сцена 2: Zako спит, телефон разрывается от уведомлений про дюп,
// на слове «динамита» он в шоке вылетает из кровати.

// Комната: пол x -1..5, z -1..4; задняя стена z=-2, левая x=-2, правая x=6
export const BEDROOM: Block[] = (() => {
	const b: Block[] = [];
	b.push(...fill('planks', -1, -1, -1, 5, -1, 4));
	b.push(...fill('spruce', -2, -1, -2, 6, 4, -2).filter((w) => !(w.y >= 1 && w.y <= 2 && w.x >= 1 && w.x <= 2)));
	b.push(...fill('glass', 1, 1, -2, 2, 2, -2));
	b.push(...fill('spruce', -2, -1, -1, -2, 4, 5));
	b.push(...fill('spruce', 6, -1, -1, 6, 4, 5));
	b.push(...fill('darkPlanks', -2, 4, -1, 6, 4, 5));
	// бревенчатые колонны в углах
	b.push(...fill('log', -2, -1, -2, -2, 4, -2), ...fill('log', 6, -1, -2, 6, 4, -2));
	// кровать: голова у стены (z=-1), ноги к камере
	b.push({x: -1, y: 0, z: -1, type: 'darkPlanks', size: [1, 0.25, 2]});
	b.push({x: -1, y: 0.25, z: -0.62, type: 'woolRed', size: [1, 0.32, 1.62]});
	b.push({x: -1, y: 0.25, z: -1, type: 'woolWhite', size: [1, 0.3, 0.38]});
	b.push({x: -1, y: 0, z: -1, type: 'darkPlanks', size: [1, 0.85, 0.12]});
	// тумбочка-сундук с лампой
	b.push({x: 0, y: 0, z: -1, type: 'chest', size: [0.9, 0.85, 0.9]});
	b.push({x: 0.3, y: 0.85, z: -0.7, type: 'glowstone', size: [0.3, 0.3, 0.3]});
	// стол с компом
	b.push({x: 3, y: 0.82, z: -1, type: 'spruce', size: [2, 0.13, 1]});
	b.push({x: 3.05, y: 0, z: -0.95, type: 'darkPlanks', size: [0.14, 0.82, 0.14]});
	b.push({x: 4.81, y: 0, z: -0.95, type: 'darkPlanks', size: [0.14, 0.82, 0.14]});
	b.push({x: 3.05, y: 0, z: -0.19, type: 'darkPlanks', size: [0.14, 0.82, 0.14]});
	b.push({x: 4.81, y: 0, z: -0.19, type: 'darkPlanks', size: [0.14, 0.82, 0.14]});
	b.push({x: 3.4, y: 0.95, z: -0.9, type: 'black', size: [1.2, 0.72, 0.08]});
	b.push({x: 3.92, y: 0.95, z: -0.85, type: 'black', size: [0.16, 0.1, 0.16]});
	b.push({x: 3.55, y: 0.95, z: -0.45, type: 'woolGray', size: [0.85, 0.04, 0.26]});
	// книжные полки и ковёр
	b.push(...fill('bookshelf', 5, 0, -1, 5, 1, -1));
	b.push({x: 0.2, y: 0, z: 1.3, type: 'woolPurple', size: [2.6, 0.05, 1.8]});
	b.push({x: 5, y: 0, z: 2, type: 'chest'});
	return b;
})();

// Экран монитора: тёмный мессенджер с горящим чатом
const makeScreen = () => {
	const c = document.createElement('canvas');
	c.width = 384;
	c.height = 224;
	const g = c.getContext('2d')!;
	g.fillStyle = '#17212b';
	g.fillRect(0, 0, 384, 224);
	g.fillStyle = '#232e3c';
	g.fillRect(0, 0, 384, 40);
	g.fillStyle = '#ffffff';
	g.font = '700 22px Rubik';
	g.fillText('Грыжа Zako', 14, 28);
	const msgs = ['ДЮП ТНТ!!!', 'эко всё', '/sorry когда', 'ZAKO ПОМОГИ'];
	msgs.forEach((m, i) => {
		g.fillStyle = i % 2 ? '#2b5278' : '#182533';
		g.fillRect(14 + (i % 2) * 120, 52 + i * 42, 250, 34);
		g.fillStyle = '#ffffff';
		g.font = '500 20px Rubik';
		g.fillText(m, 26 + (i % 2) * 120, 76 + i * 42);
	});
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
};

// Сообщения, которые сыплются на «в телеге уже пожар»
const SPAM = [
	{title: 'Чат Грыжа Zako', text: 'ZAKO, ТНТ ДЮПАЮТ!!!'},
	{title: 'Чат Грыжа Zako', text: 'эко всё, расходимся'},
	{title: 'Чат Грыжа Zako', text: 'когда /sorry???'},
	{title: 'Чат Грыжа Zako', text: 'у меня 9999 динамита'},
];

export const BedroomScene: React.FC<{line: Line; assets: Assets}> = ({line, assets}) => {
	const t = useCurrentFrame() / FPS;
	const screen = useMemo(() => makeScreen(), []);
	const tWake = cue(line, 'просып');
	const t12 = cue(line, '12');
	const tFire = cue(line, 'телеге');
	const tTnt = cue(line, 'динамита');

	// Zako: лежит -> на «динамита» подпрыгивает и встаёт на пол
	const jump = prog(t, tTnt - 0.05, 0.55);
	const up = easeOutCubic(jump);
	const lieTilt = -Math.PI / 2;
	const tilt = lerp(lieTilt, 0, easeOutBack(jump, 1.2));
	const pos: [number, number, number] = [
		lerp(-0.5, 0.75, up),
		lerp(0.68, 0, up) + Math.sin(Math.PI * jump) * 1.1,
		lerp(0.95, 1.4, up),
	];
	const panic = smooth(prog(t, tTnt + 0.35, 0.2));
	let pose = jump > 0 ? withHandsUp(idle(t), panic, t) : {...IDLE_POSE, headYaw: t > tWake + 0.2 ? Math.sin(t * 3) * 0.25 : 0};
	if (jump > 0 && jump < 1) pose = {...pose, legR: [-0.6, 0], legL: [0.4, 0]};
	const face = t >= tTnt - 0.05 ? 'shock' : t >= tWake + 0.15 ? (Math.abs(t - (tFire + 0.4)) < 0.06 ? 'blink' : 'normal') : 'blink';

	// камера: сверху на кровать, на прыжке — наезд и тряска
	const zoom = easeInOutCubic(prog(t, tTnt + 0.1, 0.5));
	const cam: Cam = {
		pos: [lerp(3.4, 3.0, zoom), lerp(3.1, 2.2, zoom), lerp(4.3, 4.1, zoom)],
		look: [lerp(0.4, 0.75, zoom), lerp(0.55, 1.15, zoom), lerp(0.2, 1.2, zoom)],
		fov: 52,
		shake: Math.max(0, 1 - prog(t, tTnt + 0.3, 0.6)) * (t > tTnt + 0.3 ? 1 : 0),
		t,
	};
	const quat = useMemo(() => camQuat(cam), [cam.pos[0], cam.pos[1], cam.pos[2], cam.look[0]]);
	const headTop: [number, number, number] =
		jump > 0 ? [pos[0], pos[1] + PLAYER_HEIGHT + 0.3, pos[2]] : [pos[0], pos[1] + 0.4, pos[2] - PLAYER_HEIGHT + 0.2];

	// часы «12:00» на слове «12»
	const clock = easeOutBack(prog(t, t12, 0.3), 2);
	const clockOut = prog(t, tFire - 0.1, 0.2);

	return (
		<AbsoluteFill>
			<Sky t={t + 20} top="#7cc4ff" bottom="#d9f1ff" />
			<Stage cam={cam}>
				<Voxels blocks={BEDROOM} materials={assets.mat} />
				<mesh position={[4, 1.31, -0.815]}>
					<planeGeometry args={[1.08, 0.62]} />
					<meshBasicMaterial map={screen} />
				</mesh>
				<Player skin={assets.zako[face]} position={pos} rotationY={0} pose={pose} tilt={[tilt, 0]} />
				<Nametag text="Zako" position={headTop} quaternion={quat} height={0.22} visible={t < tTnt} />
				<Burst
					t={t}
					at={tTnt + 0.5}
					origin={[0.75, 0.05, 1.4]}
					count={22}
					seed={21}
					colors={['#b8945f', '#8f6f44', '#d7b886']}
					speed={[1.5, 3.5]}
					shape="ring"
					gravity={-8}
					life={[0.3, 0.6]}
					size={[0.05, 0.1]}
				/>
			</Stage>

			{/* «Zzz», пока спит */}
			{t < tWake + 0.1
				? [0, 1, 2].map((i) => {
						const k = ((t * 0.9 + i / 3) % 1 + 1) % 1;
						return (
							<Outline
								key={i}
								size={54 + i * 10}
								style={{position: 'absolute', left: 330 + i * 40 + Math.sin(k * 6) * 10, top: 760 - k * 180, opacity: 1 - k}}
							>
								Z
							</Outline>
						);
					})
				: null}

			{/* часы */}
			{t >= t12 ? (
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 330,
						display: 'flex',
						justifyContent: 'center',
						transform: `scale(${clock * (1 - clockOut)})`,
					}}
				>
					<div
						style={{
							background: '#111',
							border: '10px solid #444',
							borderRadius: 26,
							padding: '6px 34px',
							fontFamily: 'Rubik',
							fontWeight: 900,
							fontSize: 140,
							color: '#ff3b30',
							letterSpacing: 8,
						}}
					>
						12:00
					</div>
				</div>
			) : null}

			{/* уведомления сыплются */}
			{SPAM.map((m, i) => (
				<Notification key={i} t={t} at={tFire + i * 0.28} title={m.title} text={m.text} index={i} out={tTnt - 0.05} />
			))}

			{/* «!!!» на шоке */}
			{t >= tTnt + 0.1 ? (
				<Outline
					size={210}
					color="#ff2d2d"
					stroke={24}
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 230,
						textAlign: 'center',
						transform: `scale(${easeOutBack(prog(t, tTnt + 0.1, 0.25), 3)}) rotate(${Math.sin(t * 30) * 4}deg)`,
					}}
				>
					!!!
				</Outline>
			) : null}

			<Sfx at={tWake + 0.1} src="note/pling" volume={0.5} rate={1.2} />
			<Sfx at={t12} src="note/bell" volume={0.45} />
			{SPAM.map((_, i) => (
				<Sfx key={i} at={tFire + i * 0.28} src="note/hat" volume={0.6} rate={1.3 + i * 0.1} />
			))}
			<Sfx at={tTnt} src="mob/villager/no1" volume={0.7} />
			<Sfx at={tTnt + 0.5} src="damage/fallsmall" volume={0.6} />
		</AbsoluteFill>
	);
};
