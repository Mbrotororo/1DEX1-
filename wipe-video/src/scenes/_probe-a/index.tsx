import React, {useMemo} from 'react';
import {
	BandWave, BlobShadow, Caption, Countdown, ENV, Environment, Fade, Flash, FlakeStream, HudLayer, NameTag, PixelItem, Player,
	PotionSwirl, SPEED_POTION, Snowfall, SpeedLines, Stamp, Trail, VoxelText, WaterSurface,
	DEG, clamp01, drink, easeInOutCubic, easeOutBack, easeOutCubic, envTrack, fadeFrom, flyCam, followCam, hash3, headTop, idle, impulse,
	lerp, makePath, mixPose, once, orbitCam, potionArt, prog, pulse, shake, shots, smooth, sprint, textWidth,
	type CameraState, type FlakeSource, type SceneDef, type SceneProps, type Vec3,
} from '../../core';
import {BEATS} from './beats';
import {LAKE, getNew, getOld, oldGround} from './world';

// ---------- маршрут героя ----------
const START: [number, number] = [7.5, 7.5];
const path = makePath(
	[
		{t: BEATS.sprint, pos: [START[0], 0, START[1]]},
		{t: 4.8, pos: [11, 0, 15]},
		{t: 5.6, pos: [2, 0, 22]},
		{t: 6.4, pos: [-10, 0, 20]},
		{t: 7.2, pos: [-19, 0, 10]},
		{t: 8.0, pos: [-17, 0, -3]},
		{t: 8.7, pos: [-8, 0, -8]},
		{t: BEATS.arrive, pos: [-1, 0, -3]},
	],
	{stride: 2.2},
);

// makePath вне своих ключей отдаёт moving > 0 — обнуляем сами
const movingAt = (time: number): number => (time <= path.start || time >= path.end ? 0 : path.at(time).moving);

// герой в момент time: ступни на рельефе (ступеньки сглажены усреднением по времени)
const heroAt = (time: number): Vec3 => {
	const p = path.at(time).position;
	let y = 0;
	for (let i = 0; i < 5; i++) {
		const q = path.at(time + (i - 2) * 0.02).position;
		y += oldGround(q[0], q[2]);
	}
	return [p[0], y / 5, p[2]];
};

// ---------- камера ----------
const fly = flyCam([
	{t: 0, pos: [-66, 44, 84], look: [0, 8, 0], fov: 52},
	{t: 3, pos: [-22, 17, 42], look: [7, 5, -2], fov: 44},
]);
const startHeading = path.at(BEATS.sprint + 0.02).heading;
// крупный план: герой пьёт зелье (строится лениво — нужна высота площадки)
const getCloseUp = once(() => {
	const y = oldGround(START[0], START[1]);
	const az = startHeading / DEG;
	return orbitCam([
		{t: 0, az: az + 34, el: 6, dist: 4.6, target: [START[0], y + 1.25, START[1]], fov: 42},
		{t: 1, az: az + 16, el: 9, dist: 3.6, target: [START[0], y + 1.3, START[1]], fov: 40},
	]);
});
const chase = followCam((t) => heroAt(t), {
	offset: [1.6, 2.1, 5.2],
	lookOffset: [0, 1.2, 2],
	lag: 0.3,
	heading: (t) => path.at(t).heading,
	fov: 60,
});
const side = followCam((t) => heroAt(t), {
	offset: [5.5, 0.9, -1],
	lookOffset: [0, 0.9, 0],
	lag: 0.05,
	heading: (t) => path.at(t).heading,
	fov: 40,
});
const wide = flyCam([
	{t: 0, pos: [-40, 62, 96], look: [0, 0, 8], fov: 50},
	{t: 0.8, pos: [-30, 60, 98], look: [0, 0, 6], fov: 50},
]);
const orbit = orbitCam([
	{t: 0, az: 20, el: 34, dist: 74, target: [0, 4, 0], fov: 44},
	{t: 4, az: 62, el: 20, dist: 52, target: [3, 6, -3], fov: 40},
]);
// удар FOV в момент рывка
const punch = (c: CameraState, t: number): CameraState => ({...c, fov: c.fov + 16 * impulse(t, BEATS.sprint, 3.5)});
const chaseShot = (_ts: number, t: number) => punch(shake(chase(t), 0.04 * movingAt(t) + 0.3 * impulse(t, BEATS.sprint, 5), t), t);
const camera = shots([
	{from: 0, cam: (ts) => fly(ts)},
	{from: BEATS.closeUp, cam: (ts) => getCloseUp()(ts)},
	{from: BEATS.sprint, cam: chaseShot},
	{from: BEATS.wide, cam: (ts) => wide(ts)},
	{from: BEATS.side, cam: (_ts, t) => side(t)},
	{from: BEATS.chase2, cam: chaseShot},
	{from: BEATS.zero, cam: (ts) => orbit(ts)},
]);

const SPAN = 4;
const WIND: Vec3 = [8, 1.6, 2.5];
const fit = (text: string, width: number) => Math.floor((width / textWidth(text)) * 2) / 2;

// ---------- старый мир: распад ----------
const OldWorld: React.FC<SceneProps> = ({t, cam, assets}) => {
	const set = getOld();
	const max = set.bands.max;
	const env0 = envTrack(t, [[BEATS.overcast, ENV.day], [BEATS.closeUp + 0.5, ENV.overcast], [BEATS.blizzard + 1, ENV.blizzard], [BEATS.zero, ENV.whiteout]]);
	// на общем плане метель не должна съедать мир: отодвигаем туман
	const env = t >= BEATS.wide && t < BEATS.side ? {...env0, fogNear: 70, fogFar: 320} : env0;
	const snowCover = prog(t, BEATS.closeUp + 1, 4);
	const front = lerp(max + 1, -SPAN, prog(t, BEATS.dissolveFrom, BEATS.dissolveTo - BEATS.dissolveFrom));

	const flakes = useMemo(() => {
		const out: FlakeSource[] = [];
		const dur = BEATS.dissolveTo - BEATS.dissolveFrom;
		set.shell.forEach((list, band) => {
			const at = BEATS.dissolveFrom + ((max + 1 - band) / (max + 1 + SPAN)) * dur;
			list.forEach((blk, i) => {
				if (i % 3 === 0) out.push({pos: [blk.x + 0.5, blk.y + 0.5, blk.z + 0.5], at: at + hash3(blk.x, blk.y, blk.z, 7) * 0.5});
			});
		});
		return out;
	}, [set, max]);

	const st = path.at(t);
	const pos = heroAt(t);
	const kDrink = prog(t, BEATS.drink, 0.9);
	let pose = mixPose(idle(t), drink(kDrink), kDrink > 0 && kDrink < 1 ? 1 : 0);
	const moving = movingAt(t);
	pose = mixPose(pose, sprint(st.phase), moving);
	const yaw = t < BEATS.sprint ? startHeading : st.heading;
	const heroVisible = t >= BEATS.closeUp - 1;
	// послеобразы скорости
	const ghosts = [1, 2, 3].map((k) => {
		const tk = t - k * 0.055;
		const sk = path.at(tk);
		return {pos: heroAt(tk), yaw: sk.heading, phase: sk.phase, opacity: (0.34 - k * 0.08) * movingAt(tk)};
	});

	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<BandWave
				meshes={set.meshes}
				shell={set.shell}
				mode="dissolve"
				front={front}
				span={SPAN}
				stagger={0.6}
				tint={env.tint}
				snowCover={snowCover}
				mixColor="#ffffff"
				animate={(b, p, out) => {
					const h = hash3(b.x, b.y, b.z, 6);
					const flyK = smooth((p - 0.3) / 0.7);
					out.mix = clamp01(p * 3.2);
					out.s = 1 - flyK * 0.86 - (p >= 1 ? 1 : 0);
					out.x = WIND[0] * flyK * flyK * (0.5 + h);
					out.y = WIND[1] * flyK * flyK * 2;
					out.z = WIND[2] * flyK * flyK * (0.5 + h);
					out.rx = flyK * (h * 5 - 2);
				}}
			/>
			<FlakeStream t={t} sources={flakes} wind={WIND} life={1.8} size={0.16} />
			{heroVisible ? (
				<>
					<BlobShadow x={pos[0]} z={pos[2]} y={pos[1]} />
					<Player
						skin={assets.skin}
						position={pos}
						rotationY={yaw}
						pose={pose}
						
						handR={t < BEATS.sprint ? <PixelItem art={potionArt(SPEED_POTION)} held /> : undefined}
					/>
					{ghosts.map((g, i) =>
						g.opacity > 0.01 ? (
							<Player key={i} skin={assets.skin} position={g.pos} rotationY={g.yaw} pose={sprint(g.phase)} opacity={g.opacity} />
						) : null,
					)}
					<NameTag text="1DEX1" position={headTop(pos)} cam={cam} />
					<PotionSwirl t={t} center={pos} color={SPEED_POTION} amount={pulse(t, BEATS.drink + 0.6, BEATS.arrive, 0.3, 0.5)} />
					<Trail t={t} from={BEATS.sprint} to={BEATS.arrive} rate={50} origin={(time) => heroAt(time)} colors={t < BEATS.blizzard ? ['#d8cfae', '#b9ad88', '#8f8a70'] : ['#ffffff', '#e6eef6']} />
				</>
			) : null}
			<Snowfall
				t={t}
				center={[cam.position.x, cam.position.y, cam.position.z]}
				count={3500}
				density={prog(t, BEATS.overcast, 4)}
				wind={[lerp(1.5, 10, prog(t, BEATS.closeUp, 4)), -3, 2.5]}
			/>
		</>
	);
};

// ---------- новый мир: сборка из снега ----------
const NewWorld: React.FC<SceneProps> = ({t, cam}) => {
	const set = getNew();
	const max = set.bands.max;
	const env = envTrack(t, [[BEATS.zero, ENV.whiteout], [BEATS.assembleTo - 0.5, ENV.frostyMorning]]);
	const front = lerp(-1, max + SPAN + 1, easeInOutCubic(prog(t, BEATS.assembleFrom, BEATS.assembleTo - BEATS.assembleFrom)));
	// озеро появляется, когда волна прошла его
	const lakeK = prog(t, BEATS.assembleFrom + 1.6, 0.5);
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<BandWave
				meshes={set.meshes}
				shell={set.shell}
				mode="assemble"
				front={front}
				span={SPAN}
				tint={env.tint}
				mixColor="#ffffff"
				animate={(b, p, out) => {
					const h = hash3(b.x, b.y, b.z, 5);
					out.y = (1 - easeOutCubic(p)) * (7 + h * 8);
					out.s = p <= 0 ? 0 : easeOutBack(p, 1.2);
					out.mix = 1 - smooth((p - 0.55) / 0.45);
				}}
			/>
			{lakeK > 0 ? (
				<WaterSurface t={t} x0={LAKE.x - LAKE.r - 3} z0={LAKE.z - LAKE.r - 3} x1={LAKE.x + LAKE.r + 3} z1={LAKE.z + LAKE.r + 3} y={-0.12} tint={env.tint} opacity={0.72 * lakeK} />
			) : null}
			<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={2500} density={lerp(1, 0.25, prog(t, BEATS.zero, 3))} wind={[2, -3, 1]} />
		</>
	);
};

const World: React.FC<SceneProps> = (props) => {
	const {t, cam} = props;
	const removed = 'СКОРОСТЬ III — УДАЛЕНО';
	const newGen = 'НОВАЯ ГЕНЕРАЦИЯ МИРА';
	return (
		<>
			{t < BEATS.zero ? <OldWorld {...props} /> : <NewWorld {...props} />}
			<HudLayer cam={cam}>
				<VoxelText text="21 НОЯБРЯ" t={t} px={16} depth={2.2} top="#ffffff" bottom="#9fd0ff" body="#1b3a6e" appearAt={BEATS.title1} exitAt={BEATS.titlesOut} position={[0, 60, 0]} rotation={[0.06, 0, 0]} />
				<VoxelText text="ВСЁ ИСЧЕЗНЕТ" t={t} px={13} depth={2.2} top="#ffffff" bottom="#ff8a7a" body="#6e1010" appearAt={BEATS.title2} exitAt={BEATS.titlesOut + 0.1} enter="pop" position={[0, -150, 0]} scale={1 + impulse(t, BEATS.title2 + 0.3, 8) * 0.15} />
				<VoxelText text={removed} t={t} px={fit(removed, 1700)} depth={2.2} top="#ffffff" bottom="#ff5a4a" body="#5a0c0c" appearAt={BEATS.removed} exitAt={BEATS.removedOut} stagger={0.02} position={[0, -330, 0]} />
				<VoxelText text={newGen} t={t} px={fit(newGen, 1700)} depth={2.2} top="#ffffff" bottom="#9fd0ff" body="#1b3a6e" appearAt={BEATS.newGen} stagger={0.03} position={[0, -360, 0]} rotation={[0.05, 0, 0]} />
			</HudLayer>
		</>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => {
	return (
		<>
			<SpeedLines t={t} amount={t >= BEATS.sprint && t < BEATS.zero ? movingAt(t) * 0.9 : 0} />
			{t < BEATS.zero + 0.4 ? <Countdown label="ДО ВАЙПА" remaining={Math.max(0, 10 - t)} urgent={prog(t, 7, 1)} x={960} y={210} /> : null}
			<Caption t={t} from={0.2} to={2.8} x={960} y={950} size={60} color="#ffffff" color2="#ffe9a8">
				ПОСЛЕДНИЙ ДЕНЬ СТАРОГО МИРА
			</Caption>
			<Stamp t={t} at={BEATS.stamp} strikeAt={BEATS.stamp + 0.35} to={BEATS.zero - 0.2} x={960} y={800} size={90}>
				СКОРОСТЬ III
			</Stamp>
			<Caption t={t} from={BEATS.stamp + 0.5} to={BEATS.zero - 0.1} x={960} y={920} size={50} color="#ffe95a">
				МАКСИМУМ — СКОРОСТЬ II
			</Caption>
			<Flash t={t} at={BEATS.zero} dur={0.9} color="#ffffff" peak={1} />
			<Fade color="#ffffff" opacity={fadeFrom(t, 0.4)} />
		</>
	);
};

export const scene: SceneDef = {id: 'probe-a', duration: BEATS.end, camera, World, Overlay};
