import React from 'react';
import {B, BLOCKS, ENV, Environment, NameTag, VoxelMesh, VoxelWorld, buildVoxelMeshes, lookCam, once, type SceneDef, type SceneProps} from '../../core';

// Витрина блоков (не входит в ролик): все блоки реестра с подписями.
// Смотреть: npm run shots -- --scene=blocks --full 0.5 1.5 2.5   (по четыре ряда блоков на кадр)

const COLS = 12;
const STEP = 3;
// сколько рядов блоков на одном плане
const ROWS_PER_SHOT = 4;

const getSet = once(() => {
	const items = BLOCKS.filter((b) => b.id !== 0);
	const rows = Math.ceil(items.length / COLS);
	const w = new VoxelWorld([-2, -1, -2], [Math.ceil(COLS * STEP) + 2, 3, Math.ceil(rows * STEP) + 2]);
	w.fill(w.min[0], -1, w.min[2], w.max[0], -1, w.max[2], B.stone);
	const places = items.map((b, i) => {
		const x = Math.round((i % COLS) * STEP);
		const z = Math.round(Math.floor(i / COLS) * STEP);
		w.set(x, 0, z, b.id);
		return {name: b.name, x, z, i};
	});
	return {meshes: buildVoxelMeshes(w, {ao: 0.6}), places, rows, width: COLS * STEP, depth: rows * STEP};
});

const World: React.FC<SceneProps> = ({t, cam}) => {
	const set = getSet();
	return (
		<>
			<Environment env={{...ENV.day, clouds: 0, fogNear: 200, fogFar: 400}} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} />
			{set.places.map((p) => (
				<NameTag key={p.name} text={p.name} position={[p.x + 0.5, 1.1 + (p.i % 2) * 0.5, p.z + 0.5]} cam={cam} size={0.028} minPx={1.5} lift={0.05} />
			))}
		</>
	);
};

const getShots = () => Math.ceil(getSet().rows / ROWS_PER_SHOT);

export const scene: SceneDef = {
	id: 'blocks',
	// по секунде на план: кадры в моменты 0.5, 1.5, 2.5 ...
	duration: 3,
	camera: (t) => {
		const shot = Math.min(getShots() - 1, Math.floor(t));
		const cz = (shot * ROWS_PER_SHOT + (ROWS_PER_SHOT - 1) / 2) * STEP + 0.5;
		const cx = ((COLS - 1) * STEP) / 2 + 0.5;
		return lookCam([cx, 46, cz + 24], [cx, 0, cz + 0.6], 21);
	},
	World,
};
