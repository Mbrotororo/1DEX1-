import React, {useMemo} from 'react';
import * as THREE from 'three';
import {DEG} from '../anim';
import type {CameraState} from '../camera';
import {HEIGHT} from '../../timeline';
import {HUD_ORDER, HudContext} from './VoxelText';

// «Экранный» 3D-слой: группа приклеена к камере, координаты внутри — пиксели кадра 1920x1080:
// (0, 0) — центр кадра, +x вправо, +y вверх, +z на зрителя. Объёмные буквы и логотипы
// внутри слоя всегда рисуются поверх мира (перед слоем очищается буфер глубины).

const HUD_DIST = 4;

export const HudLayer: React.FC<{cam: CameraState; children?: React.ReactNode}> = ({cam, children}) => {
	const scale = (2 * HUD_DIST * Math.tan((cam.fov * DEG) / 2)) / HEIGHT;
	// невидимый треугольник: перед его отрисовкой чистим глубину, чтобы мир не перекрывал слой
	const clearer = useMemo(() => {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
		const mat = new THREE.MeshBasicMaterial({transparent: true, colorWrite: false, depthWrite: false, depthTest: false});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.frustumCulled = false;
		mesh.renderOrder = HUD_ORDER;
		mesh.onBeforeRender = (renderer) => renderer.clearDepth();
		return mesh;
	}, []);
	return (
		<HudContext.Provider value={true}>
			<primitive object={clearer} />
			<group position={[cam.position.x, cam.position.y, cam.position.z]} quaternion={cam.quaternion.clone()}>
				<group position={[0, 0, -HUD_DIST]} scale={scale}>
					{children}
				</group>
			</group>
		</HudContext.Provider>
	);
};

// Объёмный логотип из картинки: стопка слоёв друг за другом (как баннер сервера в старом ролике).
// Размеры — в единицах родителя (в HudLayer — пиксели кадра).
export const ExtrudedLogo: React.FC<{
	texture: THREE.Texture;
	height: number;
	// сколько слоёв и шаг между ними
	layers?: number;
	step?: number;
	// цвет боковины
	side?: string;
	back?: string;
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: number;
	opacity?: number;
}> = ({texture, height, layers = 22, step = 1.1, side = '#7a3210', back = '#4a1c08', position, rotation, scale = 1, opacity = 1}) => {
	const hud = React.useContext(HudContext);
	const img = texture.image as {width: number; height: number};
	const w = (height * img.width) / img.height;
	const order = hud ? HUD_ORDER + 1 : 0;
	if (scale <= 0.001) return null;
	return (
		<group position={position} rotation={rotation} scale={scale}>
			{Array.from({length: layers}, (_, i) => (
				<mesh key={i} position={[0, 0, -(i + 1) * step]} renderOrder={order}>
					<planeGeometry args={[w, height]} />
					<meshBasicMaterial map={texture} color={i === layers - 1 ? back : side} alphaTest={0.55} side={THREE.DoubleSide} fog={false} transparent={hud} />
				</mesh>
			))}
			<mesh renderOrder={order + 1}>
				<planeGeometry args={[w, height]} />
				<meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} fog={false} />
			</mesh>
		</group>
	);
};
