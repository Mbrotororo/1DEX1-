import React, {useMemo} from 'react';
import * as THREE from 'three';
import {PX, type Skin, type Vec3} from '../../core';
import {skinBox} from '../../core/chars/Humanoid';

// Правая рука героя отдельно от тела (рука + рукав со скина, тонкие руки 3×12×4 px) — для крупного плана
// «кулак жмёт кнопку ПК»: сидя до кнопки на корпусе не дотянуться, а целый «дублёр» лезет в кадр.
// fist — точка кулака (низ руки) в мире, dir — направление от кулака к плечу, roll — поворот вокруг оси руки.

const geos = (() => {
	let g: {arm: THREE.BufferGeometry; sleeve: THREE.BufferGeometry} | null = null;
	return () => {
		if (!g) {
			// низ руки (кулак) — в начале координат, рука уходит в +y
			const arm = skinBox(3, 12, 4, 40, 16);
			arm.translate(0, 6, 0);
			const sleeve = skinBox(3, 12, 4, 40, 32, 0.26);
			sleeve.translate(0, 6, 0);
			g = {arm, sleeve};
		}
		return g;
	};
})();

const UP = new THREE.Vector3(0, 1, 0);

export const HeroArm: React.FC<{skin: Skin; fist: Vec3; dir: Vec3; roll?: number; segments?: number}> = ({skin, fist, dir, roll = 0, segments = 1}) => {
	const mats = useMemo(
		() => ({
			base: new THREE.MeshLambertMaterial({map: skin.map}),
			overlay: new THREE.MeshLambertMaterial({map: skin.map, alphaTest: 0.5, side: THREE.DoubleSide}),
		}),
		[skin],
	);
	const g = geos();
	const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
	const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
	q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
	return (
		<group position={fist} quaternion={q} scale={PX}>
			{/* segments > 1 — рука длиннее (продолжение рукава уходит за кадр) */}
			{Array.from({length: segments}, (_, i) => (
				<group key={i} position={[0, i * 11.9, 0]}>
					<mesh geometry={g.arm} material={mats.base} />
					<mesh geometry={g.sleeve} material={mats.overlay} />
				</group>
			))}
		</group>
	);
};
