import React, {useMemo} from 'react';
import * as THREE from 'three';
import {PLAYER_SCALE} from './Player';

// Свинка, факелы и мягкие тени под персонажами.

const PINK = '#f0a8a4';
const PINK_DARK = '#e08a86';

export const Pig: React.FC<{
	skin: THREE.Texture;
	position: [number, number, number];
	rotationY: number;
	scale: number;
	// фаза шага / гребли лапами
	legSwing: number;
	headYaw: number;
	tilt: number;
}> = ({skin, position, rotationY, scale, legSwing, headYaw, tilt}) => {
	const pink = useMemo(() => new THREE.MeshLambertMaterial({map: skin}), [skin]);
	const snout = useMemo(() => new THREE.MeshLambertMaterial({color: PINK_DARK}), []);
	const white = useMemo(() => new THREE.MeshLambertMaterial({color: '#ffffff'}), []);
	const black = useMemo(() => new THREE.MeshLambertMaterial({color: '#1b1414'}), []);
	const nostril = useMemo(() => new THREE.MeshLambertMaterial({color: '#8f5050'}), []);
	const k = PLAYER_SCALE * scale;

	const leg = (x: number, z: number, phase: number) => (
		<group position={[x, 6, z]} rotation={[Math.sin(legSwing + phase) * 0.6, 0, 0]}>
			<mesh material={pink} position={[0, -3, 0]}>
				<boxGeometry args={[4, 6, 4]} />
			</mesh>
		</group>
	);

	return (
		<group position={position} rotation={[tilt, rotationY, 0, 'YXZ']} scale={k}>
			{leg(-3, 5, 0)}
			{leg(3, 5, Math.PI)}
			{leg(-3, -6, Math.PI)}
			{leg(3, -6, 0)}
			<mesh material={pink} position={[0, 10, 0]}>
				<boxGeometry args={[10, 8, 16]} />
			</mesh>
			<group position={[0, 12, 7]} rotation={[0, headYaw, 0]}>
				<mesh material={pink} position={[0, 0, 4]}>
					<boxGeometry args={[8, 8, 8]} />
				</mesh>
				<mesh material={snout} position={[0, -1.5, 8.5]}>
					<boxGeometry args={[4, 3, 1]} />
				</mesh>
				{[-1, 1].map((s) => (
					<React.Fragment key={s}>
						<mesh material={white} position={[s * 3.5, 1.5, 8.05]}>
							<boxGeometry args={[1, 1, 0.2]} />
						</mesh>
						<mesh material={black} position={[s * 2.5, 1.5, 8.05]}>
							<boxGeometry args={[1, 1, 0.2]} />
						</mesh>
						<mesh material={nostril} position={[s * 1.5, -1.5, 9.05]}>
							<boxGeometry args={[1, 1, 0.2]} />
						</mesh>
					</React.Fragment>
				))}
			</group>
		</group>
	);
};

export const PIG_COLOR = PINK;

// Факел: палочка с огоньком и тёплым свечением. scale = 0 — потух.
export const Torch: React.FC<{
	position: [number, number, number];
	glow: THREE.Texture;
	scale: number;
	flicker: number;
}> = ({position, glow, scale, flicker}) => {
	const stick = useMemo(() => new THREE.MeshBasicMaterial({color: '#6b4a25'}), []);
	const flame = useMemo(() => new THREE.MeshBasicMaterial({color: '#ffe27a'}), []);
	if (scale <= 0) return null;
	return (
		<group position={position} scale={scale}>
			<mesh material={stick} position={[0, 0.31, 0]}>
				<boxGeometry args={[0.125, 0.62, 0.125]} />
			</mesh>
			<mesh material={flame} position={[0, 0.66, 0]}>
				<boxGeometry args={[0.15, 0.15, 0.15]} />
			</mesh>
			<sprite position={[0, 0.7, 0]} scale={3.4 + flicker * 0.5} renderOrder={2}>
				<spriteMaterial
					map={glow}
					color="#ff9a2e"
					transparent
					opacity={0.5 + flicker * 0.12}
					depthWrite={false}
					blending={THREE.AdditiveBlending}
				/>
			</sprite>
		</group>
	);
};

// Мягкая круглая тень на земле
export const BlobShadow: React.FC<{
	glow: THREE.Texture;
	x: number;
	z: number;
	size: number;
	opacity: number;
}> = ({glow, x, z, size, opacity}) => {
	if (opacity <= 0.01) return null;
	return (
		<mesh position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} scale={size} renderOrder={1}>
			<planeGeometry args={[1, 1]} />
			<meshBasicMaterial map={glow} color="#000000" transparent opacity={opacity} depthWrite={false} />
		</mesh>
	);
};

// Ракета салюта: яркая точка со шлейфом, взлетает к месту взрыва
const TRAIL = 12;

export const Rocket: React.FC<{
	t: number;
	at: number;
	origin: [number, number, number];
	color: string;
}> = ({t, at, origin, color}) => {
	const mat = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			}),
		[color],
	);
	const start = at - 0.62;
	if (t < start || t >= at) return null;
	const cubes = [];
	for (let i = 0; i < TRAIL; i++) {
		const tau = (t - start - i * 0.018) / 0.62;
		if (tau <= 0) continue;
		// взлёт с замедлением + лёгкое покачивание
		const e = 1 - Math.pow(1 - tau, 2);
		const y = origin[1] - 26 * (1 - e);
		const wobble = Math.sin(tau * 22) * 0.25 * (1 - tau);
		cubes.push(
			<mesh key={i} material={mat} position={[origin[0] + wobble, y, origin[2] + wobble]} scale={0.42 * (1 - i / TRAIL)}>
				<boxGeometry args={[1, 1, 1]} />
			</mesh>,
		);
	}
	return <>{cubes}</>;
};
