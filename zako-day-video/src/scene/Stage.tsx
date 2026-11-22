import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {HEIGHT, WIDTH} from '../lib/timeline';

export type Vec3 = [number, number, number];

export type Cam = {
	pos: Vec3;
	look: Vec3;
	fov?: number;
	// дрожание камеры (0..1)
	shake?: number;
	t?: number;
};

// Ориентация камеры (нужна, чтобы ники и спрайты смотрели в камеру)
export const camQuat = (cam: Cam) => {
	const m = new THREE.Matrix4().lookAt(
		new THREE.Vector3(...cam.pos),
		new THREE.Vector3(...cam.look),
		new THREE.Vector3(0, 1, 0),
	);
	return new THREE.Quaternion().setFromRotationMatrix(m);
};

const CameraRig: React.FC<{cam: Cam}> = ({cam}) => {
	const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
	useLayoutEffect(() => {
		const k = cam.shake ?? 0;
		const t = cam.t ?? 0;
		const jx = k * 0.08 * Math.sin(t * 61.3);
		const jy = k * 0.08 * Math.sin(t * 47.9 + 1.3);
		camera.position.set(cam.pos[0] + jx, cam.pos[1] + jy, cam.pos[2]);
		camera.up.set(0, 1, 0);
		camera.lookAt(cam.look[0] + jx, cam.look[1] + jy, cam.look[2]);
		const fov = cam.fov ?? 45;
		if (camera.fov !== fov) {
			camera.fov = fov;
			camera.updateProjectionMatrix();
		}
		camera.updateMatrixWorld();
	});
	return null;
};

// 3D-слой сцены: прозрачный холст поверх HTML-фона (небо, градиент).
export const Stage: React.FC<{cam: Cam; children: React.ReactNode; light?: number}> = ({
	cam,
	children,
	light = 1,
}) => {
	const fill = useMemo(() => {
		const d = new THREE.Vector3(...cam.pos).sub(new THREE.Vector3(...cam.look)).normalize();
		return [d.x, d.y, d.z] as Vec3;
	}, [cam.pos, cam.look]);
	return (
		<ThreeCanvas
			width={WIDTH}
			height={HEIGHT}
			flat
			camera={{fov: cam.fov ?? 45, near: 0.05, far: 500}}
			gl={{antialias: true, alpha: true}}
			style={{position: 'absolute', inset: 0}}
		>
			<CameraRig cam={cam} />
			<ambientLight intensity={0.42 * Math.PI * light} />
			<directionalLight position={[0.35, 0.86, 0.47]} intensity={0.7 * Math.PI * light} />
			{/* мягкий свет «от камеры», чтобы лица персонажей не уходили в тень */}
			<directionalLight position={fill} intensity={0.35 * Math.PI * light} />
			{children}
		</ThreeCanvas>
	);
};
