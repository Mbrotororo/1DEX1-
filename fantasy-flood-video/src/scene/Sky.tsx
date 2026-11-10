import React, {useMemo} from 'react';
import * as THREE from 'three';
import {cameraAt, type CameraState} from '../lib/camera';
import {mulberry32} from '../lib/rng';
import type {WorldTextures} from '../lib/textures';

// Ночное небо: квадратные мерцающие звёзды и пиксельная луна
const R = 520;

const starGeometry = (seed: number, count: number) => {
	const rnd = mulberry32(seed);
	const pos = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const y = rnd() * 1.5 - 0.6;
		const a = rnd() * Math.PI * 2;
		const r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
		pos[i * 3] = Math.cos(a) * r * R;
		pos[i * 3 + 1] = Math.min(1, y) * R;
		pos[i * 3 + 2] = Math.sin(a) * r * R;
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	return geo;
};

const LAYERS = [
	{seed: 1, count: 260, size: 2.5, color: '#aab4ff', speed: 1.3, phase: 0},
	{seed: 2, count: 170, size: 3.5, color: '#ffffff', speed: 2.1, phase: 2},
	{seed: 3, count: 70, size: 5, color: '#dcd6ff', speed: 0.9, phase: 4},
];

// Небо почти «приклеено» к камере (на 93%): звёзды и луна медленно плывут
// вместе, а луна всё время остаётся в левом верхнем углу кадра.
const FOLLOW = 0.93;
const REF_TIME = 2.5;

export const Sky: React.FC<{t: number; tex: WorldTextures; cam: CameraState}> = ({t, tex, cam}) => {
	const geos = useMemo(() => LAYERS.map((l) => starGeometry(l.seed, l.count)), []);
	const ref = useMemo(() => cameraAt(REF_TIME), []);
	// луна: левый верхний угол кадра в опорный момент
	const moonDir = useMemo(
		() => new THREE.Vector3(-0.47, 0.2, -1).normalize().multiplyScalar(R * 0.9).applyQuaternion(ref.quaternion),
		[ref],
	);
	const skyQuat = useMemo(() => new THREE.Quaternion(), []);
	skyQuat.copy(cam.quaternion).multiply(ref.quaternion.clone().invert());
	skyQuat.slerpQuaternions(new THREE.Quaternion(), skyQuat.clone(), FOLLOW);
	return (
		<>
			<primitive object={tex.sky} attach="background" />
			<group position={cam.position} quaternion={skyQuat}>
			{LAYERS.map((l, i) => (
				<points key={l.seed} geometry={geos[i]} frustumCulled={false}>
					<pointsMaterial
						size={l.size}
						sizeAttenuation={false}
						color={l.color}
						transparent
						opacity={0.55 + 0.4 * Math.sin(t * l.speed + l.phase)}
						depthWrite={false}
					/>
				</points>
			))}
			<sprite position={moonDir} scale={150} renderOrder={-2}>
				<spriteMaterial map={tex.glow} color="#8f9cff" transparent opacity={0.3} depthWrite={false} />
			</sprite>
			<sprite position={moonDir} scale={42} renderOrder={-1}>
				<spriteMaterial map={tex.moon} transparent depthWrite={false} />
			</sprite>
			</group>
		</>
	);
};
