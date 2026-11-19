import React, {useMemo} from 'react';
import * as THREE from 'three';
import {PX, mixHex} from '../../core';

// Блики монитора в глазах (кладётся в headSlot: начало — центр головы, x — к левому плечу, z — вперёд).
// Глаза скина 1DEX1 — строка 5 лица (центр y = −1.5 px), x = ±2 px; передняя грань головы — z = 4 px.
export const EyeGlints: React.FC<{t: number; on: number; color: string}> = ({on, color}) => {
	const mat = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false, transparent: true, depthWrite: false}), []);
	mat.color.set(mixHex('#ffffff', color, 0.35));
	mat.opacity = 0.9 * on;
	if (on <= 0.01) return null;
	const s = PX * 0.42;
	return (
		<group>
			{[-1, 1].map((side) => (
				<mesh key={side} material={mat} position={[(side * 2 + 0.45) * PX, -1.28 * PX, 4.03 * PX]}>
					<planeGeometry args={[s, s * 0.8]} />
				</mesh>
			))}
		</group>
	);
};
