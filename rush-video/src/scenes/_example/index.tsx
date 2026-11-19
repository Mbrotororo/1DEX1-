import React from 'react';
import {
	B,
	BlobShadow,
	Caption,
	ENV,
	Environment,
	Fade,
	NameTag,
	Player,
	Snowfall,
	VoxelMesh,
	VoxelWorld,
	buildVoxelMeshes,
	envTrack,
	fadeFrom,
	headTop,
	idle,
	makePath,
	mixPose,
	once,
	orbitCam,
	prog,
	smooth,
	spruceTree,
	strata,
	walk,
	wave,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {BEATS} from './beats';

// Минимальная сцена-образец: мир, герой идёт по маршруту и машет, снег, подпись.

// 1. Мир строится ОДИН раз при первом обращении (а не при загрузке модуля)
const getSet = once(() => {
	const world = new VoxelWorld([-16, -3, -16], [15, 12, 15]);
	world.heightmap(() => 0, {block: strata(B.snowyGrass)});
	spruceTree(world, -5, 1, -6, {snowy: true});
	return {world, meshes: buildVoxelMeshes(world, {cull: {bottom: true}})};
});

// 2. Маршрут героя: положение — сплайн по ключам, фаза шагов — из пройденного пути
const path = makePath([
	{t: BEATS.walkFrom, pos: [-6, 1, 3]},
	{t: BEATS.walkTo, pos: [0, 1, 0]},
]);

// 3. Камера — чистая функция времени
const camera = orbitCam([
	{t: 0, az: 25, el: 14, dist: 13, target: [-2, 2.2, 1]},
	{t: BEATS.end, az: 50, el: 10, dist: 8, target: [0, 2.4, 0]},
]);

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const set = getSet();
	// окружение плавно меняется: ясное утро -> метель
	const env = envTrack(t, [
		[BEATS.snow, ENV.frostyMorning],
		[BEATS.end, ENV.blizzard],
	]);
	const st = path.at(t);
	const pos: Vec3 = st.position;
	const waving = smooth(prog(t, BEATS.wave, 0.2));
	// идёт -> стоит -> машет; после остановки поворачивается к камере
	const pose = mixPose(mixPose(idle(t), walk(st.phase), st.moving), wave(t), waving);
	const yaw = st.heading + (cam.azimuth - st.heading) * smooth(prog(t, BEATS.walkTo, 0.4));
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint={env.tint} snowCover={prog(t, BEATS.snow, 1.5)} />
			<BlobShadow x={pos[0]} z={pos[2]} y={pos[1]} />
			<Player skin={assets.skin} position={pos} rotationY={yaw} pose={pose} />
			<NameTag text="1DEX1" position={headTop(pos)} cam={cam} />
			<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} density={prog(t, BEATS.snow, 1)} />
		</>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => (
	<>
		<Caption t={t} from={BEATS.caption} to={BEATS.end - 0.5} x={960} y={900} size={80} color="#ffffff" color2="#9fd0ff">
			ПРИМЕР СЦЕНЫ
		</Caption>
		<Fade color="#ffffff" opacity={fadeFrom(t, 0.5)} />
	</>
);

export const scene: SceneDef = {id: 'example', duration: BEATS.end, camera, World, Overlay};
