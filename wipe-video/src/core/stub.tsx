import React, {useMemo} from 'react';
import {orbitCam} from './camera';
import {BlobShadow, NameTag} from './chars/extras';
import {Humanoid, headTop} from './chars/Humanoid';
import {idle} from './chars/poses';
import {ENV} from './env';
import {Environment} from './Environment';
import {Snowfall} from './fx/Snow';
import {PixelText} from './hud/dom';
import {VoxelText} from './hud/VoxelText';
import type {SceneDef, SceneProps} from './scene';
import {B} from './voxel/blocks';
import {spruceTree} from './voxel/builders';
import {buildVoxelMeshes} from './voxel/mesher';
import {VoxelMesh} from './voxel/VoxelMesh';
import {VoxelWorld} from './voxel/world';

// Заглушка сцены: снежная площадка, герой с ником и объёмное название сцены.
// Нужна, чтобы весь ролик рендерился с первого дня; автор сцены заменяет её своей.

const StubWorld: React.FC<SceneProps & {id: string}> = ({t, cam, assets, id}) => {
	const meshes = useMemo(() => {
		const w = new VoxelWorld([-14, -3, -14], [13, 12, 13]);
		w.heightmap(() => -1, {block: (_x, y, _z, top) => (y === top ? B.snowyGrass : B.dirt)});
		spruceTree(w, -7, 0, -6, {snowy: true});
		spruceTree(w, 8, 0, -4, {snowy: true, height: 7});
		return buildVoxelMeshes(w, {cull: {bottom: true}});
	}, []);
	const env = ENV.frostyMorning;
	const pos: [number, number, number] = [0, 0, 0];
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={meshes} tint={env.tint} />
			<BlobShadow x={0} z={0} />
			<Humanoid skin={assets.skin} position={pos} rotationY={cam.azimuth} pose={idle(t)} />
			<NameTag text="1DEX1" position={headTop(pos)} cam={cam} />
			<VoxelText text={id} t={t} px={0.16} top="#ffffff" bottom="#9fd0ff" body="#1b3a6e" appearAt={0.3} position={[0, 4.2, -3]} rotation={[0, cam.azimuth, 0]} />
			<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={600} density={0.6} />
		</>
	);
};

export const makeStubScene = (id: string): SceneDef => ({
	id,
	camera: orbitCam([
		{t: 0, az: 20, el: 14, dist: 15, target: [0, 2.2, 0]},
		{t: 40, az: 140, el: 18, dist: 13, target: [0, 2.2, 0]},
	]),
	World: (props) => <StubWorld {...props} id={id} />,
	Overlay: () => (
		<PixelText x={960} y={980} size={50} color="#ffe95a">
			{`ЗАГЛУШКА: ${id}`}
		</PixelText>
	),
});
