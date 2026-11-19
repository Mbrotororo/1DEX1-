import React, {useMemo} from 'react';
import {B, BlobShadow, ENV, Environment, Humanoid, PixelText, Snowfall, VoxelMesh, VoxelWorld, buildVoxelMeshes, fbm2, flyCam, idle, oakTree, once, spruceTree, type EnvName, type SceneDef, type SceneProps} from '../../core';

// Галерея окружений (не входит в ролик): по секунде на каждый пресет ENV.
// Смотреть: npm run shots -- --scene=envs --sheet

const NAMES = Object.keys(ENV) as EnvName[];

const getSet = once(() => {
	const w = new VoxelWorld([-60, -4, -60], [59, 20, 59]);
	w.heightmap((x, z) => Math.round(fbm2(x * 0.04, z * 0.04, 3, 2) * 8 - 4), {depth: 3});
	for (let i = 0; i < 40; i++) {
		const x = Math.round((fbm2(i * 3.1, 1, 1, 5) - 0.5) * 200) % 55;
		const z = Math.round((fbm2(1, i * 2.7, 1, 6) - 0.5) * 200) % 55;
		const top = w.topAt(x, z);
		if (top === null || Math.hypot(x, z) < 6) continue;
		if (i % 2) spruceTree(w, x, top + 1, z, {snowy: true});
		else oakTree(w, x, top + 1, z);
	}
	w.set(3, w.groundAt(3, 2), 2, B.glowstone);
	return {world: w, meshes: buildVoxelMeshes(w, {cull: {bottom: true}})};
});

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const set = getSet();
	const name = NAMES[Math.min(NAMES.length - 1, Math.floor(t))];
	const env = ENV[name];
	const y = useMemo(() => set.world.groundAt(0, 0), [set]);
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint={env.tint} snowCover={name === 'blizzard' || name === 'whiteout' || name === 'frostyMorning' ? 1 : 0} />
			<BlobShadow x={0.5} z={0.5} y={y} />
			<Humanoid skin={assets.skin} position={[0.5, y, 0.5]} rotationY={cam.azimuth - 0.3} pose={idle(t)} />
			{name === 'blizzard' || name === 'whiteout' ? <Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={2500} wind={[6, -3, 1]} /> : null}
		</>
	);
};

export const scene: SceneDef = {
	id: 'envs',
	duration: NAMES.length,
	// камера смотрит в сторону солнца/луны каждого пресета
	camera: (t) => {
		const env = ENV[NAMES[Math.min(NAMES.length - 1, Math.floor(t))]];
		const [sx, , sz] = env.sunDir;
		const len = Math.hypot(sx, sz) || 1;
		return flyCam([{t: 0, pos: [0.5 - (sx / len) * 9, 5.5, 0.5 - (sz / len) * 9], look: [0.5 + (sx / len) * 30, 14, 0.5 + (sz / len) * 30], fov: 62}])(t);
	},
	World,
	Overlay: ({t}) => (
		<PixelText x={960} y={990} size={70} color="#ffffff" color2="#ffe95a">
			{`ENV.${NAMES[Math.min(NAMES.length - 1, Math.floor(t))]}`}
		</PixelText>
	),
};
