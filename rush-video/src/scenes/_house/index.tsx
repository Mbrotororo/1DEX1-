import React from 'react';
import {Environment, VoxelMesh, flyCam, shots, type SceneDef, type SceneProps} from '../../core';
import {HOUSE_ENV} from '../../sets/house/env';
import {getHouse} from '../../sets/house/world';
import {BEATS} from './beats';

const camera = shots([
	{from: 0, cam: flyCam([{t: 0, pos: [3.5, 1.2, 2.0], look: [2.5, 1.0, 7], fov: 70}])},
	{from: 1, cam: flyCam([{t: 0, pos: [2.5, 1.6, 6.2], look: [3, 1.5, 0], fov: 70}])},
	{from: 2, cam: flyCam([{t: 0, pos: [1.0, 1.0, 5.5], look: [10, 2.5, 1.5], fov: 70}])},
	{from: 3, cam: flyCam([{t: 0, pos: [21.4, 7.6, 1.7], look: [27.5, 5.6, 6.2], fov: 70}])},
	{from: 4, cam: flyCam([{t: 0, pos: [22.7, 6.64, 8.0], look: [28.3, 6.05, 4.85], fov: 60}])},
	{from: 5, cam: flyCam([{t: 0, pos: [18.5, 6.6, 1.5], look: [9, 4, 1.5], fov: 70}])},
]);

const World: React.FC<SceneProps> = ({t, cam}) => {
	const set = getHouse();
	const env = t >= 3 && t < 5 ? HOUSE_ENV.bedroom : HOUSE_ENV.hallway;
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint="#ffffff" />
			<VoxelMesh meshes={set.extMeshes} tint={env.tint} />
		</>
	);
};

export const scene: SceneDef = {id: 'house', duration: BEATS.end, camera, World};
