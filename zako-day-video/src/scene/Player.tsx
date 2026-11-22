import React, {useMemo} from 'react';
import * as THREE from 'three';

// 3D-модель игрока Minecraft со скином 64x64 (руки обычные или тонкие — slim).
// Все размеры внутри модели — в пикселях скина, персонаж смотрит в сторону +z.

// Масштаб как в игре: 32 пикселя роста -> 1.875 блока
export const PLAYER_SCALE = 0.9375 / 16;
export const PLAYER_HEIGHT = 32 * PLAYER_SCALE;
const TEX = 64;

// Раскладка UV как в игре: (u, v) — левый верхний угол развёртки части тела
const skinBox = (w: number, h: number, d: number, u: number, v: number, inflate = 0) => {
	const geo = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
	const rect = (x: number, y: number, rw: number, rh: number, flipY = false) => {
		const x1 = x / TEX;
		const x2 = (x + rw) / TEX;
		const y1 = 1 - y / TEX;
		const y2 = 1 - (y + rh) / TEX;
		// порядок вершин грани: левый верх, правый верх, левый низ, правый низ
		return flipY ? [x1, y2, x2, y2, x1, y1, x2, y1] : [x1, y1, x2, y1, x1, y2, x2, y2];
	};
	const faces = [
		rect(u + d + w, v + d, d, h), // +x — левая сторона персонажа
		rect(u, v + d, d, h), // -x — правая сторона
		rect(u + d, v, w, d), // верх
		rect(u + d + w, v, w, d, true), // низ
		rect(u + d, v + d, w, h), // перед
		rect(u + d + w + d, v + d, w, h), // спина
	];
	geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(faces.flat()), 2));
	return geo;
};

export type PlayerPose = {
	headYaw: number;
	headPitch: number;
	// руки: [вращение вперёд/назад (X), в сторону (Z)]
	armR: [number, number];
	armL: [number, number];
	// ноги: [вперёд/назад (X), разворот (Y)]
	legR: [number, number];
	legL: [number, number];
};

export const IDLE_POSE: PlayerPose = {
	headYaw: 0,
	headPitch: 0,
	armR: [0, 0],
	armL: [0, 0],
	legR: [0, 0],
	legL: [0, 0],
};

export const Player: React.FC<{
	skin: THREE.Texture;
	position: [number, number, number];
	rotationY: number;
	pose: PlayerPose;
	squash?: number;
	scale?: number;
	slim?: boolean;
	// наклон всего тела: [вперёд/назад (X), вбок (Z)] — например, лечь в кровать
	tilt?: [number, number];
}> = ({skin, position, rotationY, pose, squash = 1, scale = 1, slim = false, tilt = [0, 0]}) => {
	const ARM_W = slim ? 3 : 4;
	const geo = useMemo(
		() => ({
			head: skinBox(8, 8, 8, 0, 0),
			hat: skinBox(8, 8, 8, 32, 0, 0.5),
			body: skinBox(8, 12, 4, 16, 16),
			jacket: skinBox(8, 12, 4, 16, 32, 0.26),
			armR: skinBox(ARM_W, 12, 4, 40, 16),
			sleeveR: skinBox(ARM_W, 12, 4, 40, 32, 0.26),
			armL: skinBox(ARM_W, 12, 4, 32, 48),
			sleeveL: skinBox(ARM_W, 12, 4, 48, 48, 0.26),
			legR: skinBox(4, 12, 4, 0, 16),
			pantsR: skinBox(4, 12, 4, 0, 32, 0.26),
			legL: skinBox(4, 12, 4, 16, 48),
			pantsL: skinBox(4, 12, 4, 0, 48, 0.26),
		}),
		[ARM_W],
	);
	const base = useMemo(() => new THREE.MeshLambertMaterial({map: skin}), [skin]);
	const overlay = useMemo(
		() => new THREE.MeshLambertMaterial({map: skin, alphaTest: 0.5, side: THREE.DoubleSide}),
		[skin],
	);

	const k = PLAYER_SCALE * scale;
	const armX = 4 + ARM_W / 2;

	return (
		<group position={position} rotation={[tilt[0], rotationY, tilt[1], 'YXZ']} scale={[k, k * squash, k]}>
			{/* голова */}
			<group position={[0, 24, 0]} rotation={[pose.headPitch, pose.headYaw, 0, 'YXZ']}>
				<mesh geometry={geo.head} material={base} position={[0, 4, 0]} />
				<mesh geometry={geo.hat} material={overlay} position={[0, 4, 0]} />
			</group>
			{/* тело */}
			<mesh geometry={geo.body} material={base} position={[0, 18, 0]} />
			<mesh geometry={geo.jacket} material={overlay} position={[0, 18, 0]} />
			{/* правая рука */}
			<group position={[-armX, 22, 0]} rotation={[pose.armR[0], 0, pose.armR[1]]}>
				<mesh geometry={geo.armR} material={base} position={[0, -4, 0]} />
				<mesh geometry={geo.sleeveR} material={overlay} position={[0, -4, 0]} />
			</group>
			{/* левая рука */}
			<group position={[armX, 22, 0]} rotation={[pose.armL[0], 0, pose.armL[1]]}>
				<mesh geometry={geo.armL} material={base} position={[0, -4, 0]} />
				<mesh geometry={geo.sleeveL} material={overlay} position={[0, -4, 0]} />
			</group>
			{/* правая нога */}
			<group position={[-1.99, 12, 0]} rotation={[pose.legR[0], pose.legR[1], 0, 'YXZ']}>
				<mesh geometry={geo.legR} material={base} position={[0, -6, 0]} />
				<mesh geometry={geo.pantsR} material={overlay} position={[0, -6, 0]} />
			</group>
			{/* левая нога */}
			<group position={[1.99, 12, 0]} rotation={[pose.legL[0], pose.legL[1], 0, 'YXZ']}>
				<mesh geometry={geo.legL} material={base} position={[0, -6, 0]} />
				<mesh geometry={geo.pantsL} material={overlay} position={[0, -6, 0]} />
			</group>
		</group>
	);
};
