import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {Assets} from '../assets';
import {easeInOutCubic, easeOutBack, lerp, prog, smooth} from '../lib/anim';
import {idle, withWave} from '../lib/poses';
import {cue, FPS, type Line} from '../lib/timeline';
import {Burst} from '../scene/Particles';
import {Nametag} from '../scene/Nametag';
import {Player, PLAYER_HEIGHT} from '../scene/Player';
import {camQuat, Stage, type Cam} from '../scene/Stage';
import {fill, Voxels, type Block} from '../scene/Voxels';
import {Outline, Sfx, Sky} from '../ui/kit';

// Сцена 1: «Один день из жизни Zako». Zako стоит на летающем острове,
// камера отъезжает от лица, потом появляется F3-экран с бешеным FPS,
// а на слове «сон» Zako засыпает стоя.

const ISLAND: Block[] = (() => {
	const b: Block[] = [];
	b.push(...fill('grass', -3, -1, -3, 3, -1, 3));
	b.push(...fill('dirt', -2, -2, -2, 2, -2, 2));
	b.push(...fill('dirt', -3, -2, -1, -3, -2, 1), ...fill('dirt', 3, -2, -1, 3, -2, 1));
	b.push(...fill('dirt', -1, -2, -3, 1, -2, -3), ...fill('dirt', -1, -2, 3, 1, -2, 3));
	b.push(...fill('stone', -1, -3, -1, 1, -3, 1), {x: 0, y: -4, z: 0, type: 'stone'});
	b.push({x: 2, y: -3, z: 0, type: 'stone'}, {x: 0, y: -3, z: 2, type: 'dirt'});
	// дерево
	b.push(...fill('log', -2, 0, -2, -2, 3, -2));
	b.push(...fill('leaves', -4, 3, -4, 0, 4, 0).filter((l) => !(l.x === -2 && l.z === -2 && l.y === 3)));
	b.push(...fill('leaves', -3, 5, -3, -1, 5, -1));
	// сундук и блок алмазной руды для красоты
	b.push({x: 2, y: 0, z: -2, type: 'chest'}, {x: 2, y: 0, z: 1, type: 'ore'});
	return b;
})();

const ZZZ = ['Z', 'z', 'Z'];

export const TitleScene: React.FC<{line: Line; assets: Assets}> = ({line, assets}) => {
	const t = useCurrentFrame() / FPS;
	const tOpt = cue(line, 'оптимиз');
	const tMine = cue(line, 'майнкрафт');
	const tSleep = cue(line, 'сон');

	// камера: от лица — назад и чуть вбок, потом медленный облёт
	const pull = easeInOutCubic(prog(t, 0.05, 2.4));
	const orbit = 0.35 + pull * -0.75 + t * 0.05;
	const dist = lerp(2.6, 6.4, pull);
	const lookY = lerp(1.68, 1.2, pull);
	const cam: Cam = {
		pos: [0.5 + Math.sin(orbit) * dist, lerp(1.72, 2.7, pull), 0.5 + Math.cos(orbit) * dist],
		look: [0.5, lookY, 0.5],
		fov: 46,
	};
	const quat = useMemo(() => camQuat(cam), [cam.pos[0], cam.pos[1], cam.pos[2]]);

	// эмоции: машет, радуется на «оптимизирует», засыпает на «сон»
	let pose = withWave(idle(t), t, 0.35, 1.5);
	const sleepK = smooth(prog(t, tSleep, 0.35));
	pose = {...pose, headPitch: pose.headPitch + sleepK * 0.45, headYaw: pose.headYaw * (1 - sleepK)};
	const face = t >= tSleep ? 'blink' : t >= tOpt && t < tSleep ? 'happy' : Math.abs(t - 2.9) < 0.07 ? 'blink' : 'normal';

	// надписи
	const line1 = easeOutBack(prog(t, 0.15, 0.35), 2);
	const line2 = easeOutBack(prog(t, 0.45, 0.45), 2.6);
	const titleOut = easeInOutCubic(prog(t, tOpt - 0.2, 0.4));
	const hud = prog(t, tOpt, 0.15);
	// FPS разгоняется с 60 до 999
	const fps = Math.round(lerp(60, 999, Math.pow(prog(t, tOpt, tMine - tOpt + 0.6), 0.6)));

	return (
		<AbsoluteFill>
			<Sky t={t} />
			<Stage cam={cam}>
				<Voxels blocks={ISLAND} materials={assets.mat} />
				<Player skin={assets.zako[face]} position={[0.5, 0, 0.5]} rotationY={0.25} pose={pose} />
				<Nametag text="Zako" position={[0.5, PLAYER_HEIGHT + 0.32, 0.5]} quaternion={quat} visible={pull > 0.35} />
				<Burst
					t={t}
					at={0.5}
					origin={[0.5, 1.2, 0.5]}
					count={36}
					seed={3}
					colors={['#ff9a1f', '#ffd23a', '#ffffff']}
					speed={[2, 4.5]}
					shape="sphere"
					gravity={-3}
					drag={2}
					life={[0.5, 1]}
					size={[0.05, 0.1]}
				/>
			</Stage>

			{/* «Z z Z» над головой, когда засыпает */}
			{ZZZ.map((z, i) => {
				const at = tSleep + 0.1 + i * 0.22;
				if (t < at) return null;
				const k = prog(t, at, 1.2);
				return (
					<Outline
						key={i}
						size={70 + i * 18}
						color="#ffffff"
						style={{
							position: 'absolute',
							left: 600 + i * 55 + Math.sin(k * 6) * 14,
							top: 560 - i * 70 - k * 120,
							opacity: 1 - k * 0.6,
						}}
					>
						{z}
					</Outline>
				);
			})}

			{/* заголовок */}
			<div
				style={{
					position: 'absolute',
					top: 150,
					left: 0,
					right: 0,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					transform: `translateY(${-titleOut * 700}px)`,
				}}
			>
				<Outline size={74} style={{transform: `scale(${line1})`}}>
					ОДИН ДЕНЬ ИЗ ЖИЗНИ
				</Outline>
				<Outline size={230} color="#ff9a1f" stroke={30} style={{transform: `scale(${line2}) rotate(-3deg)`, marginTop: 10}}>
					ZAKO
				</Outline>
			</div>

			{/* F3-экран: FPS улетает в небо */}
			{t >= tOpt ? (
				<div
					style={{
						position: 'absolute',
						top: 150,
						left: 50,
						fontFamily: 'Rubik',
						fontWeight: 700,
						fontSize: 46,
						lineHeight: 1.35,
						color: '#fff',
						opacity: hud,
						textShadow: '4px 4px 0 #3f3f3f',
					}}
				>
					<div style={{background: 'rgba(80,80,80,0.55)', padding: '2px 14px', display: 'inline-block'}}>
						Minecraft 1.21.11 (ZakoOpt)
					</div>
					<br />
					<div
						style={{
							background: 'rgba(80,80,80,0.55)',
							padding: '2px 14px',
							display: 'inline-block',
							color: fps > 900 ? '#7dff6a' : '#fff',
							fontSize: 46 + (fps > 900 ? Math.abs(Math.sin(t * 9)) * 10 : 0),
						}}
					>
						{fps} fps
					</div>
				</div>
			) : null}

			<Sfx at={0.15} src="random/pop" volume={0.6} rate={1.2} />
			<Sfx at={0.45} src="random/pop" volume={0.8} rate={0.85} />
			<Sfx at={0.5} src="random/orb" volume={0.35} />
			<Sfx at={tOpt} src="random/click" volume={0.5} />
			<Sfx at={tMine + 0.3} src="random/levelup" volume={0.35} />
			<Sfx at={tSleep + 0.05} src="note/bass" volume={0.6} rate={0.7} />
		</AbsoluteFill>
	);
};
