import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import {useCurrentFrame} from 'remotion';
import {actorAt} from './lib/actors';
import {CAMERA_FOV, cameraAt} from './lib/camera';
import type {WorldTextures} from './lib/textures';
import {FPS, HEIGHT, T, WATER_MAX, WIDTH} from './lib/timeline';
import {PLAYER_POS, SOURCE_POS} from './lib/world';
import {Blocks, Plants} from './scene/Blocks';
import {FantasyLogo, logoHeight} from './scene/FantasyLogo';
import {Banner, Titles} from './scene/Hud';
import {Bubbles, Burst} from './scene/Particles';
import {Boat, Player} from './scene/Player';
import {Sky} from './scene/Sky';
import {VoxelText} from './scene/VoxelText';
import {Water} from './scene/Water';

export type Assets = {
	skin: THREE.Texture;
	holyworld: THREE.Texture;
	tex: WorldTextures;
};

// «Экранный» слой стоит на этом расстоянии перед камерой
const HUD_DIST = 4;
const HUD_SCALE = (2 * HUD_DIST * Math.tan((CAMERA_FOV * Math.PI) / 360)) / HEIGHT;

// Свет подобран под затенение блоков: верх яркий, бока темнее
const LIGHT_DIR: [number, number, number] = [0.19, 0.86, 0.47];

const DUST = ['#6aa43e', '#86603f', '#9c7a52', '#5a8f34'];
const SPLASH = ['#3f76e4', '#6096f4', '#9ec4ff', '#ffffff'];
const SPARKS = ['#9692ee', '#c9c6ff', '#ffffff'];
// Салют в финале. Позиция задаётся в координатах кадра (-1..1 от центра),
// чтобы вспышки не попадали на луну, баннер и надписи.
const firework = (at: number, sx: number, sy: number, colors: string[], seed: number) => {
	const cam = cameraAt(at);
	const depth = 55;
	const halfH = depth * Math.tan((CAMERA_FOV * Math.PI) / 360);
	const halfW = (halfH * WIDTH) / HEIGHT;
	const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
	const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
	const p = cam.position
		.clone()
		.addScaledVector(cam.forward, depth)
		.addScaledVector(right, sx * halfW)
		.addScaledVector(up, sy * halfH);
	return {at, origin: [p.x, p.y, p.z] as [number, number, number], colors, seed};
};
const FIREWORKS = [
	firework(T.finale + 0.9, -0.1, 0.42, ['#9692ee', '#c9c6ff', '#ffffff'], 71),
	firework(T.finale + 1.5, -0.93, 0.08, ['#ffb02e', '#ff6a1f', '#fff1a8'], 72),
	firework(T.finale + 2.15, 0.62, 0.6, ['#35c6f0', '#9eeaff', '#ffffff'], 73),
];

export const Scene: React.FC<{assets: Assets}> = ({assets}) => {
	const frame = useCurrentFrame();
	const t = frame / FPS;
	const {tex} = assets;

	const cam = cameraAt(t);
	const camera = useThree((s) => s.camera);
	useLayoutEffect(() => {
		camera.position.copy(cam.position);
		camera.quaternion.copy(cam.quaternion);
		camera.updateMatrixWorld();
	});

	const actor = actorAt(t, cam.azimuth);
	const landOrigin = useMemo<[number, number, number]>(() => [PLAYER_POS.x, 0.1, PLAYER_POS.z], []);
	const strikeOrigin = useMemo<[number, number, number]>(() => [SOURCE_POS.x, 0.2, SOURCE_POS.z], []);
	const logoOrigin = useMemo<[number, number, number]>(() => [SOURCE_POS.x, logoHeight(T.voxEnd), SOURCE_POS.z], []);
	const finaleOrigin = useMemo<[number, number, number]>(() => [SOURCE_POS.x, WATER_MAX + 4.8, SOURCE_POS.z], []);

	return (
		<>
			<Sky t={t} tex={tex} cam={cam} />
			<ambientLight intensity={0.24 * Math.PI} />
			<directionalLight position={LIGHT_DIR} intensity={0.88 * Math.PI} />
			{/* мягкий свет «от камеры», чтобы игрок и логотип не темнели при облёте */}
			<directionalLight position={[-cam.forward.x, -cam.forward.y, -cam.forward.z]} intensity={0.3 * Math.PI} />

			{/* мир */}
			<Blocks t={t} tex={tex} />
			<Plants t={t} tex={tex} />

			{/* игрок и лодка */}
			{actor.boat.scale > 0 ? (
				<Boat
					planks={tex.planks}
					position={actor.boat.position}
					rotationY={actor.boat.rotationY}
					scale={actor.boat.scale * actor.scale}
					tilt={actor.boat.tilt}
					row={actor.boat.row}
				/>
			) : null}
			{actor.visible ? (
				<>
					<Player
						skin={assets.skin}
						position={actor.position}
						rotationY={actor.rotationY}
						squash={actor.squash}
						scale={actor.scale}
						pose={actor}
					/>
					{/* ник над головой, всегда повёрнут к камере */}
					<group
						position={[actor.position[0], actor.headTop + 0.42 * actor.scale, actor.position[2]]}
						quaternion={cam.quaternion}
						scale={actor.scale}
					>
						<mesh position={[0, 0.3, -0.03]} scale={t >= T.nameIn ? 1 : 0}>
							<planeGeometry args={[2.9, 0.86]} />
							<meshBasicMaterial color="#000000" transparent opacity={0.38} depthWrite={false} />
						</mesh>
						<VoxelText
							text="1DEX1"
							t={t}
							px={0.085}
							depth={1}
							top="#ffffff"
							bottom="#e2d4ff"
							body="#3b2a6e"
							appearAt={T.nameIn}
							stagger={0.04}
							wobble={0}
						/>
					</group>
				</>
			) : null}

			{/* логотип FantasyVisual и вода */}
			<FantasyLogo t={t} tex={tex} azimuth={cam.azimuth} forward={cam.forward} />
			<Bubbles t={t} />
			<Water t={t} tex={tex} />

			{/* частицы */}
			<Burst t={t} at={T.playerLand} origin={landOrigin} count={28} seed={11} colors={DUST} speed={[2, 5.5]} shape="ring" gravity={-7} life={[0.35, 0.75]} size={[0.1, 0.22]} />
			<Burst t={t} at={T.voxEnd} origin={logoOrigin} count={46} seed={12} colors={SPARKS} speed={[5, 12]} shape="sphere" gravity={-2} drag={3} life={[0.4, 0.9]} size={[0.1, 0.24]} additive />
			<Burst t={t} at={T.strike + 0.06} origin={strikeOrigin} count={70} seed={13} colors={SPARKS} speed={[8, 18]} shape="ring" gravity={-6} drag={3.2} life={[0.4, 0.85]} size={[0.12, 0.3]} additive />
			<Burst t={t} at={T.waterStart} origin={strikeOrigin} count={90} seed={14} colors={SPLASH} speed={[5, 15]} shape="up" gravity={-24} drag={0.4} life={[0.6, 1.35]} size={[0.14, 0.34]} spreadDelay={0.35} />
			<Burst t={t} at={T.boatIn} origin={landOrigin} count={22} seed={15} colors={SPLASH} speed={[2, 5]} shape="ring" gravity={-9} life={[0.3, 0.6]} size={[0.08, 0.2]} />
			<Burst t={t} at={T.finale} origin={finaleOrigin} count={60} seed={16} colors={SPARKS} speed={[6, 14]} shape="sphere" gravity={-2} drag={2.6} life={[0.5, 1.1]} size={[0.12, 0.28]} additive />
			{FIREWORKS.map((f) => (
				<Burst key={f.seed} t={t} at={f.at} origin={f.origin} count={130} seed={f.seed} colors={f.colors} speed={[9, 21]} shape="sphere" gravity={-4} drag={2.4} life={[0.8, 1.6]} size={[0.2, 0.46]} additive />
			))}

			{/* экранный слой: баннер сервера и надписи */}
			<group position={cam.position} quaternion={cam.quaternion}>
				<group position={[0, 0, -HUD_DIST]} scale={HUD_SCALE}>
					<Banner t={t} logo={assets.holyworld} />
					<Titles t={t} />
				</group>
			</group>
		</>
	);
};
