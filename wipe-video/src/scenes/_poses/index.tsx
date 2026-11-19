import React, {useMemo} from 'react';
import {
	B,
	BlobShadow,
	ENV,
	Environment,
	Humanoid,
	NameTag,
	PixelItem,
	SpeedLines,
	Trail,
	VoxelMesh,
	VoxelWorld,
	aimBow,
	buildVoxelMeshes,
	cheer,
	drink,
	fall,
	fbm2,
	followCam,
	frozenPose,
	headTop,
	hold,
	idle,
	jump,
	lookAround,
	makePath,
	once,
	orbitCam,
	run,
	scared,
	shadowFor,
	shots,
	shoulder,
	sit,
	smash,
	sprint,
	swing,
	throwing,
	walk,
	wave,
	zombieArms,
	type Pose,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';

// Галерея поз (не входит в ролик) и пример бега по маршруту с камерой-преследователем.
// Смотреть: npm run shots -- --scene=poses --sheet --step=0.5

const POSES: [name: string, pose: (t: number, k: number) => Pose][] = [
	['idle', (t) => idle(t)],
	['walk', (t) => walk(t * 7)],
	['run', (t) => run(t * 10)],
	['sprint', (t) => sprint(t * 14)],
	['jump', (_t, k) => jump(k)],
	['fall', (t) => fall(t)],
	['swing', (_t, k) => swing(k)],
	['smash', (_t, k) => smash(k)],
	['drink', (_t, k) => drink(k)],
	['throwing', (_t, k) => throwing(k)],
	['wave', (t) => wave(t)],
	['cheer', (t) => cheer(t)],
	['scared', (t) => scared(t)],
	['sit', () => sit()],
	['zombieArms', (t) => zombieArms(t * 5)],
	['aimBow', () => aimBow()],
	['hold', () => hold()],
	['shoulder', (t) => shoulder(t)],
	['frozenPose', () => frozenPose()],
	['lookAround', (t, k) => lookAround(t, k)],
];

const getSet = once(() => {
	const w = new VoxelWorld([-70, -3, -40], [69, 12, 39]);
	w.heightmap((x, z) => (Math.abs(z) < 12 && Math.abs(x) < 16 ? 0 : Math.round(fbm2(x * 0.05, z * 0.05, 3, 4) * 5 - 2)), {depth: 3, block: (_x, y, _z, top) => (y === top ? B.snowyGrass : B.dirt)});
	return {world: w, meshes: buildVoxelMeshes(w, {cull: {bottom: true}})};
});

const SPLIT = 3;
const path = makePath(
	[
		{t: SPLIT, pos: [-40, 0, 20]},
		{t: SPLIT + 1, pos: [-18, 0, 26]},
		{t: SPLIT + 2, pos: [6, 0, 16]},
		{t: SPLIT + 3, pos: [26, 0, 26]},
		{t: SPLIT + 4, pos: [50, 0, 18]},
	],
	{stride: 2.2},
);
const runnerAt = (t: number): Vec3 => {
	const p = path.at(t).position;
	return [p[0], getSet().world.groundAt(p[0], p[2]), p[2]];
};

const galleryCam = orbitCam([
	{t: 0, az: -14, el: 16, dist: 19, target: [0, 2.2, -1], fov: 46},
	{t: SPLIT, az: 14, el: 18, dist: 19, target: [0, 2.2, -1], fov: 46},
]);
const chaseCam = followCam(runnerAt, {offset: [2.5, 2.4, 7], lookOffset: [0, 1.1, 2], lag: 0.3, heading: (t) => path.at(t).heading, fov: 60});
const camera = shots([
	{from: 0, cam: (ts) => galleryCam(ts)},
	{from: SPLIT, cam: (_ts, t) => chaseCam(t)},
]);

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const set = getSet();
	const env = ENV.frostyMorning;
	const k = (t * 0.6) % 1;
	const grid = useMemo(() => POSES.map((_p, i) => [(i % 7) * 3.6 - 10.8, 0, Math.floor(i / 7) * -4 + 3] as Vec3), []);
	if (t >= SPLIT) {
		const st = path.at(t);
		const pos = runnerAt(t);
		return (
			<>
				<Environment env={env} cam={cam} t={t} />
				<VoxelMesh meshes={set.meshes} tint={env.tint} />
				<BlobShadow x={pos[0]} z={pos[2]} y={pos[1]} />
				<Humanoid skin={assets.skin} position={pos} rotationY={st.heading} pose={sprint(st.phase)} />
				{/* послеобразы: тот же герой в недавних точках пути, всё прозрачнее */}
				{[1, 2, 3].map((i) => {
					const past = path.at(t - i * 0.05);
					return <Humanoid key={i} skin={assets.skin} position={runnerAt(t - i * 0.05)} rotationY={past.heading} pose={sprint(past.phase)} opacity={0.32 - i * 0.08} />;
				})}
				<Trail t={t} from={SPLIT} to={SPLIT + 4} rate={60} origin={(time) => { const p = runnerAt(time); return [p[0], p[1] + 0.1, p[2]]; }} colors={['#ffffff', '#e8f0f8']} life={[0.4, 0.9]} size={[0.14, 0.32]} />
			</>
		);
	}
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint={env.tint} />
			{POSES.map(([name, pose], i) => {
				const p = pose(t, k);
				// у «jump» и «fall» поднимаем над землёй, у последнего — кувырок
				const lift = name === 'jump' ? Math.sin(k * Math.PI) * 1.2 : name === 'fall' ? 0.8 : 0;
				const pos: Vec3 = [grid[i][0], 1 + lift, grid[i][2]];
				const sh = shadowFor(lift);
				return (
					<React.Fragment key={name}>
						<BlobShadow x={pos[0]} z={pos[2]} y={1} size={sh.size} opacity={sh.opacity} />
						<Humanoid
							skin={assets.skin}
							position={pos}
							pose={p}
							tumble={name === 'fall' ? [t * 3, 0] : [0, 0]}
							handR={name === 'swing' ? <PixelItem art="diamondSword" held /> : name === 'drink' ? <PixelItem art="emptyBottle" held /> : undefined}
							handL={name === 'aimBow' ? <PixelItem art="bow" held /> : undefined}
						/>
						<NameTag text={name} position={headTop(pos, 1, 1, p)} cam={cam} />
					</React.Fragment>
				);
			})}
		</>
	);
};

export const scene: SceneDef = {
	id: 'poses',
	duration: SPLIT + 4,
	camera,
	World,
	Overlay: ({t}) => <SpeedLines t={t} amount={t >= SPLIT ? 0.7 : 0} />,
};
