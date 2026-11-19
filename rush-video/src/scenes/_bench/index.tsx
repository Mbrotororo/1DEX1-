import React, {useMemo} from 'react';
import {
	B,
	BandWave,
	ENV,
	Environment,
	FlakeStream,
	InstancedBlocks,
	Snowfall,
	VoxelMesh,
	VoxelWorld,
	bandBlocks,
	birchTree,
	buildVoxelMeshes,
	fbm2,
	hash3,
	lerp,
	makeBands,
	oakTree,
	once,
	orbitCam,
	smooth,
	spruceTree,
	type BlockInst,
	type FlakeSource,
	type SceneDef,
	type SceneProps,
} from '../../core';

// Замер производительности ядра (не входит в ролик). Фазы по секундам:
//  0..1 — рельеф 160x160 с деревьями одной геометрией (VoxelMesh);
//  1..2 — плюс 3000 анимированных блоков (InstancedBlocks);
//  2..3 — плюс 3000 хлопьев снега (Snowfall);
//  3..4 — волна распада по полосам (BandWave + FlakeStream) и снег.
// Запуск: npm run shots -- --scene=bench --bench 0.5   (и 1.5, 2.5, 3.5)

const getTerrain = once(() => {
	const started = performance.now();
	const world = new VoxelWorld([-80, -10, -80], [79, 40, 79]);
	const height = (x: number, z: number) => Math.round(fbm2(x * 0.03, z * 0.03, 4, 3) * 26 - 8);
	world.heightmap(height, {depth: 6});
	let trees = 0;
	for (let x = -76; x <= 75; x++) {
		for (let z = -76; z <= 75; z++) {
			if (hash3(x, 5, z, 9) > 0.012) continue;
			const top = world.topAt(x, z);
			if (top === null || world.get(x, top, z) !== B.grass) continue;
			const r = hash3(x, 6, z, 9);
			if (r < 0.4) spruceTree(world, x, top + 1, z, {snowy: r < 0.2});
			else if (r < 0.7) oakTree(world, x, top + 1, z);
			else birchTree(world, x, top + 1, z);
			trees++;
		}
	}
	const bands = makeBands(world, (x, _y, z) => (Math.hypot(x, z) + (fbm2(x * 0.1, z * 0.1, 2, 4) - 0.5) * 10) / 3);
	const meshes = buildVoxelMeshes(world, {bands, cull: {bottom: true}});
	const shell = bandBlocks(bands);
	const blocks = world.count();
	const idx = (g: {getIndex: () => {count: number} | null} | null | undefined) => (g?.getIndex()?.count ?? 0) / 6;
	console.log(`bench: обычных граней ${idx(meshes.opaque?.main) + idx(meshes.cutout?.main)}, швов между полосами ${idx(meshes.opaque?.seam)}`);
	console.log(
		`bench: мир 160x160, ${blocks} блоков, ${trees} деревьев, ${meshes.stats.quads} граней, сборка геометрии ${meshes.stats.ms} мс, всего ${Math.round(performance.now() - started)} мс; полос ${bands.max + 1}`,
	);
	return {world, meshes, shell, bands};
});

const World: React.FC<SceneProps> = ({t, cam}) => {
	const terrain = getTerrain();
	const env = ENV.day;
	// 3000 блоков-«фонтанов» над центром
	const loose = useMemo(() => {
		const out: BlockInst[] = [];
		const ids = [B.snow, B.stone, B.oakLeaves, B.dirt, B.ice, B.cobble];
		for (let i = 0; i < 3000; i++) out.push({x: Math.round((hash3(i, 1, 0, 1) - 0.5) * 90), y: 26, z: Math.round((hash3(i, 2, 0, 1) - 0.5) * 90), id: ids[i % ids.length]});
		return out;
	}, []);
	const max = terrain.bands.max;
	const wave = t >= 3;
	const front = wave ? lerp(max + 1, max * 0.35, t - 3) : max + 1;
	const flakes = useMemo(() => {
		const out: FlakeSource[] = [];
		terrain.shell.forEach((list, band) => {
			const at = 3 + (max + 1 - band) / (max * 0.65 + 1);
			list.forEach((b, i) => {
				if (i % 4 === 0) out.push({pos: [b.x + 0.5, b.y + 0.5, b.z + 0.5], at});
			});
		});
		return out;
	}, [terrain, max]);
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<BandWave
				meshes={terrain.meshes}
				shell={terrain.shell}
				mode="dissolve"
				front={front}
				span={4}
				tint={env.tint}
				animate={(b, p, out) => {
					const fly = smooth((p - 0.3) / 0.7);
					out.mix = Math.min(1, p * 3);
					out.s = 1 - fly * 0.9;
					out.x = fly * fly * 6 * (0.5 + hash3(b.x, b.y, b.z, 1));
					out.y = fly * fly * 3;
				}}
			/>
			{t >= 1 ? (
				<InstancedBlocks
					blocks={loose}
					animate={(b, i, out) => {
						const ph = t * 2 + i * 0.37;
						out.y = Math.sin(ph) * 4;
						out.rx = ph;
						out.ry = ph * 0.7;
						out.s = 0.6 + 0.3 * Math.sin(ph * 1.3 + b.x);
						out.mix = 0.5 + 0.5 * Math.sin(ph);
					}}
				/>
			) : null}
			{t >= 2 ? <Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={3000} box={[60, 40, 60]} /> : null}
			{wave ? <FlakeStream t={t} sources={flakes} /> : null}
		</>
	);
};

// VoxelMesh использован напрямую только для проверки типов импорта
void VoxelMesh;

export const scene: SceneDef = {
	id: 'bench',
	duration: 4,
	camera: orbitCam([
		{t: 0, az: 30, el: 26, dist: 150, target: [0, 6, 0], fov: 50},
		{t: 4, az: 60, el: 24, dist: 140, target: [0, 6, 0], fov: 50},
	]),
	World,
};
