import React from 'react';
import {
	B,
	BlobShadow,
	ENV,
	Environment,
	Glow,
	Lantern,
	Player,
	VoxelMesh,
	VoxelWorld,
	buildVoxelMeshes,
	cheer,
	flyCam,
	idle,
	lookCam,
	mixPose,
	once,
	prog,
	shake,
	shots,
	smooth,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {Viewfinder} from '../../core/hud/rec';
import {PC_TIMING, ScreenPOV, ScreenQuad, drawPC, pcGlowColor, pcPOV, useScreenTexture} from '../../screens';

// Служебная сцена «screens»: экраны ПК.
// 0–7.2 — экран во весь кадр (POV): B3 → B4 → B6 по готовому сценарию (время ПК = 3.2 + t);
// 7.2–12 — тот же экран текстурой на 3D-мониторе (время ПК = 2.3 + …): включение, рабочий стол, игра, Discord;
// 12–16 — герой перед монитором с игрой, поверх — видоискатель камеры.

const BEATS = {
	pov: 0,
	mon: 7.2,
	rec: 12,
	cheer: 13.6,
	end: 16,
};

// время сценария ПК (локальное время b-room) для момента сцены
const pcTime = (t: number) => {
	if (t < BEATS.mon) return PC_TIMING.b3 + t;
	if (t < BEATS.rec) return 2.3 + (t - BEATS.mon);
	return PC_TIMING.b7 + (t - BEATS.rec);
};

const LIGHTS: Vec3[] = [
	[-3.5, 2.6, -2.5],
	[3.5, 2.2, -2.5],
];
const MONITOR: Vec3 = [0.5, 1.42, -1.55];

const getRoom = once(() => {
	const w = new VoxelWorld([-7, -2, -6], [7, 6, 7]);
	w.fill(-6, -1, -5, 6, -1, 6, B.darkPlanks);
	w.fill(-6, 0, -4, 6, 5, -4, B.sprucePlanks);
	for (const x of [-6, -2, 3, 6]) w.fill(x, 0, -4, x, 5, -4, B.spruceLog);
	w.fill(-5, 0, -3, -3, 2, -3, B.bookshelf);
	w.fill(4, 0, -3, 5, 2, -3, B.bookshelf);
	// стол: столешница-полублок на ножках-заборах
	w.fill(-1, 0, -2, 2, 0, -2, B.darkSlabTop);
	w.fill(-1, 0, -1, 2, 0, -1, B.air);
	w.set(-2, 0, -2, B.oakFence);
	w.set(3, 0, -2, B.oakFence);
	w.fill(-1, -1, 0, 1, -1, 2, B.purpleWool);
	const lights = LIGHTS.map((p) => ({pos: p, radius: 7, color: '#ffa04a', intensity: 1.1}));
	lights.push({pos: [MONITOR[0], MONITOR[1], MONITOR[2] + 0.8] as Vec3, radius: 4, color: '#9fb6ff', intensity: 0.5});
	return buildVoxelMeshes(w, {ambient: 0.22, ambientColor: '#a89a8a', lights, cull: {bottom: true}});
});

// 7.2–12: облёт монитора от общего к крупному
const monCam = flyCam([
	{t: 0, pos: [-2.2, 2.3, 2.6], look: [0.4, 1.35, -1.6], fov: 44},
	{t: 2.4, pos: [-0.6, 1.8, 1.0], look: [0.5, 1.42, -1.6], fov: 40},
	{t: 4.8, pos: [0.55, 1.5, -0.3], look: [0.5, 1.42, -1.6], fov: 40},
]);
// 12–16: камера на штативе сбоку-сзади
const recCam = (ts: number) => shake(lookCam([2.7, 1.9, 2.9], [0.3, 1.25, -0.9], 42), 0.008, ts, 7, 1.3);

const camera = shots([
	{from: BEATS.pov, cam: () => lookCam([0.5, 1.5, 0.5], [0.5, 1.42, -1.6], 40)},
	{from: BEATS.mon, cam: (ts) => monCam(ts)},
	{from: BEATS.rec, cam: (ts) => recCam(ts)},
]);

const Monitor3D: React.FC<{t: number}> = ({t}) => {
	const pt = pcTime(t);
	const tex = useScreenTexture(drawPC, pt);
	const on = smooth(prog(pt, PC_TIMING.screenOn, 0.3));
	const glow = pcGlowColor(pt);
	const [x, y, z] = MONITOR;
	return (
		<group position={[x, y, z]}>
			{/* корпус, ножка, подставка */}
			<mesh position={[0, 0, -0.04]}>
				<boxGeometry args={[1.28, 0.76, 0.06]} />
				<meshStandardMaterial color="#16171c" roughness={0.6} />
			</mesh>
			<mesh position={[0, -0.4, -0.08]}>
				<boxGeometry args={[0.1, 0.3, 0.06]} />
				<meshStandardMaterial color="#202128" />
			</mesh>
			<mesh position={[0, -0.41, -0.02]}>
				<boxGeometry args={[0.45, 0.02, 0.25]} />
				<meshStandardMaterial color="#202128" />
			</mesh>
			<ScreenQuad texture={tex} width={1.2} position={[0, 0, 0.0]} brightness={0.06 + 0.94 * on} />
			{on > 0.01 ? <Glow position={[0, 0, 0.15]} color={glow} size={2.4} opacity={0.2 * on} /> : null}
			{on > 0.01 ? <pointLight position={[0, 0, 0.7]} color={glow} intensity={on * 2.2} distance={3.2} decay={1.4} /> : null}
		</group>
	);
};

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const meshes = getRoom();
	const env = {...ENV.dungeon, lightColor: '#ffc890', ambient: 0.4, sun: 0.45, fill: 0.3, fogNear: 30, fogFar: 90};
	const k = smooth(prog(t, BEATS.cheer, 0.3));
	const pose = mixPose(idle(t), cheer(t), k);
	// герой стоит перед столом спиной к камере, на «ура» поворачивается к ней
	const yaw = Math.PI + k * 2.2;
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={meshes} tint="#ffffff" />
			{LIGHTS.map((p, i) => (
				<React.Fragment key={i}>
					<Lantern position={p} t={t} seed={i} />
					<Glow position={[p[0], p[1] + 0.3, p[2]]} size={1.6} color="#ffb25a" opacity={0.5} />
				</React.Fragment>
			))}
			<Monitor3D t={t} />
			{t >= BEATS.rec ? (
				<>
					<BlobShadow x={0.5} z={0.2} y={0.02} />
					<Player skin={assets.skin} position={[0.5, 0, 0.2]} rotationY={yaw} pose={pose} />
				</>
			) : null}
		</>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => {
	if (t < BEATS.mon) {
		const pt = pcTime(t);
		return <ScreenPOV draw={drawPC} t={pt} {...pcPOV(pt)} />;
	}
	if (t >= BEATS.rec) return <Viewfinder t={t} start={BEATS.rec} />;
	return null;
};

export const scene: SceneDef = {id: 'screens', duration: BEATS.end, camera, World, Overlay};
