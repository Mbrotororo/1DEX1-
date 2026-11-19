import React from 'react';
import {
	B,
	BlobShadow,
	ENV,
	Environment,
	Glow,
	Lantern,
	Player,
	PixelText,
	VoxelMesh,
	VoxelWorld,
	buildVoxelMeshes,
	flyCam,
	idle,
	impulse,
	lookCam,
	once,
	prog,
	shake,
	shots,
	smooth,
	type CameraState,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {POST, focusDist, mixPost, post, rackFocus, type PostSettings} from '../../core/post';

// Служебная сцена «look»: проверка постобработки. Своя маленькая тёплая комната (без src/sets),
// герой, фонари. 0–3 крупный план с сильной резкостью, 3–6 перевод фокуса на фон, 6–8 общий план со
// свечением фонарей, 8–9.6 шок со вспышкой, 9.6–17.6 пресеты по секунде (первый — постобработка
// выключена, второй — POST.none: кадры должны совпасть), 17.6–19 «вжух»-смаз.

const BEATS = {
	close: 0,
	rack: 3,
	rackFrom: 3.6,
	rackTo: 5.2,
	wide: 6,
	shock: 8,
	presets: 9.6,
	whip: 17.6,
	end: 25,
};

// null — постобработка выключена (эталон для сравнения с POST.none)
const PRESETS: [string, PostSettings | null][] = [
	['OFF', null],
	['NONE', POST.none],
	['WARMINTERIOR', POST.warmInterior],
	['CLOSEUP', POST.closeUp],
	['SCREENPOV', POST.screenPOV],
	['COLDDAY', POST.coldDay],
	['SHOCK', POST.shock],
	['HAPPY', POST.happy],
];

const LANTERNS: Vec3[] = [
	[-3.5, 3.2, -6.5],
	[3.5, 3.2, -6.5],
	[-6.5, 2.2, 2.5],
	[6.5, 1.2, -2.5],
];

// комната строится один раз
const getRoom = once(() => {
	const w = new VoxelWorld([-9, -2, -9], [9, 8, 9]);
	w.fill(-8, -1, -8, 8, -1, 8, B.darkPlanks);
	w.walls(-8, 0, -8, 8, 6, 8, B.sprucePlanks);
	w.fill(-8, 7, -8, 8, 7, 8, B.darkPlanks);
	for (const x of [-8, -4, 0, 4, 8]) {
		w.fill(x, 0, -8, x, 6, -8, B.spruceLog);
		w.fill(x, 0, 8, x, 6, 8, B.spruceLog);
	}
	for (const z of [-4, 0, 4]) {
		w.fill(-8, 0, z, -8, 6, z, B.spruceLog);
		w.fill(8, 0, z, 8, 6, z, B.spruceLog);
	}
	// балки потолка
	for (const z of [-5, -1, 3]) w.fill(-7, 6, z, 7, 6, z, B.spruceLogX);
	// книжные полки у задней стены
	w.fill(-7, 0, -7, -5, 2, -7, B.bookshelf);
	w.fill(-2, 0, -7, 2, 2, -7, B.bookshelf);
	w.fill(5, 0, -7, 7, 2, -7, B.bookshelf);
	w.fill(-7, 0, -6, -7, 1, -3, B.bookshelf);
	// окно слева и сундук, верстак
	w.fill(-8, 2, -2, -8, 3, -1, B.windowLit);
	w.set(6, 0, -5, B.chest);
	w.set(7, 0, -5, B.craftingTable);
	// ковёр под героем
	w.fill(-2, 0, -2, 2, 0, 2, B.redCarpet);
	w.fill(-1, 0, -1, 1, 0, 1, B.redCarpet);
	// кирпичная колонна-камин справа
	w.fill(6, 0, 1, 7, 5, 2, B.stoneBricks);
	const lights = LANTERNS.map((p) => ({pos: p, radius: 9, color: '#ffa04a', intensity: 1.25}));
	lights.push({pos: [-7.2, 2.5, -1.5] as Vec3, radius: 6, color: '#9fc4ff', intensity: 0.6});
	return buildVoxelMeshes(w, {ambient: 0.2, ambientColor: '#a89a8a', lights, cull: {bottom: true}});
});

const HERO: Vec3 = [0, 0, 0];
const HEAD: Vec3 = [0, 1.62, 0];

const closeCam = flyCam([
	{t: 0, pos: [0.42, 1.66, 1.35], look: [0, 1.58, 0], fov: 40},
	{t: 3, pos: [0.3, 1.62, 1.18], look: [0, 1.58, 0], fov: 40},
]);
// через плечо героя на дальнюю стену с фонарём
const rackCam = flyCam([
	{t: 0, pos: [0.85, 1.75, 1.2], look: [-1.6, 2.1, -6.5], fov: 44},
	{t: 3, pos: [0.75, 1.72, 1.0], look: [-1.8, 2.2, -6.5], fov: 44},
]);
const wideCam = flyCam([
	{t: 0, pos: [3.6, 2.6, 5.6], look: [0, 1.3, -1.5], fov: 50},
	{t: 2, pos: [2.8, 2.4, 5.0], look: [0, 1.3, -1.5], fov: 50},
]);
const shockCam = (ts: number, t: number) => shake(lookCam([0.12, 1.62, 0.95], [0, 1.6, 0], 34 - 4 * smooth(prog(ts, 0, 0.25))), 0.06 * impulse(t, BEATS.shock, 6), t);
const presetCam = flyCam([
	{t: 0, pos: [2.2, 1.9, 3.0], look: [0, 1.4, -0.5], fov: 46},
	{t: 2, pos: [2.2, 1.9, 3.0], look: [0, 1.4, -0.5], fov: 46},
	{t: 8, pos: [1.6, 1.8, 2.6], look: [0, 1.45, -0.5], fov: 46},
]);
const whipCam = (ts: number): CameraState => {
	const k = smooth(prog(ts, 0.25, 0.5));
	const a = -0.4 + k * 2.2;
	return lookCam([0, 1.7, 2.5], [Math.sin(a) * 6, 1.6, 2.5 - Math.cos(a) * 6], 50);
};

const camera = shots([
	{from: BEATS.close, cam: (ts) => closeCam(ts)},
	{from: BEATS.rack, cam: (ts) => rackCam(ts)},
	{from: BEATS.wide, cam: (ts) => wideCam(ts)},
	{from: BEATS.shock, cam: shockCam},
	{from: BEATS.presets, cam: (ts) => presetCam(ts)},
	{from: BEATS.whip, cam: (ts) => whipCam(ts)},
]);

const presetAt = (t: number) => Math.min(PRESETS.length - 1, Math.max(0, Math.floor(t - BEATS.presets)));

const postAt = (t: number, cam: CameraState): PostSettings | null => {
	if (t < BEATS.rack) return {...POST.closeUp, focus: focusDist(cam, HEAD)};
	if (t < BEATS.wide) {
		const k = smooth(prog(t, BEATS.rackFrom, BEATS.rackTo - BEATS.rackFrom));
		return {...POST.closeUp, dof: 16, focus: rackFocus(cam, [0.05, 1.7, 0.1], LANTERNS[0], k)};
	}
	if (t < BEATS.shock) return {...POST.warmInterior, focus: focusDist(cam, HEAD)};
	if (t < BEATS.presets) {
		const s = mixPost(POST.closeUp, POST.shock, smooth(prog(t, BEATS.shock, 0.15)));
		return {...s, focus: focusDist(cam, HEAD), flash: impulse(t, BEATS.shock, 9)};
	}
	if (t < BEATS.whip) {
		const s = PRESETS[presetAt(t)][1];
		return s ? {...s, focus: focusDist(cam, HEAD)} : null;
	}
	// ВРЕМЕННО: замеры по частям
	if (t >= 19 && t < 20) return {...POST.none, dof: 18, focus: focusDist(cam, HEAD), focusRange: 0.5};
	if (t >= 20 && t < 21) return {...POST.none, bloom: 0.8, bloomThreshold: 0.6};
	if (t >= 21 && t < 22) return {...POST.none, grain: 0.3, vignette: 0.4, contrast: 1.1, split: 0.3};
	if (t >= 22 && t < 23) return {...POST.none, dof: 18, focus: focusDist(cam, HEAD), focusRange: 0.5, chroma: 1.5};
	if (t >= 23 && t < 24) return null;
	const ts = t - BEATS.whip;
	const speed = Math.sin(Math.PI * Math.min(1, Math.max(0, (ts - 0.25) / 0.5)));
	return post({...POST.warmInterior, focus: 5, smear: 70 * speed, smearAngle: 0, chroma: 2 * speed});
};

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const meshes = getRoom();
	const env = {...ENV.dungeon, lightColor: '#ffc890', ambient: 0.42, sun: 0.5, fill: 0.35, fogNear: 30, fogFar: 90};
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={meshes} tint="#ffffff" />
			{LANTERNS.map((p, i) => (
				<React.Fragment key={i}>
					<Lantern position={p} t={t} seed={i} />
					<Glow position={[p[0], p[1] + 0.3, p[2]]} size={1.6} color="#ffb25a" opacity={0.5} />
				</React.Fragment>
			))}
			<BlobShadow x={HERO[0]} z={HERO[2]} y={0.06} />
			<Player skin={assets.skin} position={HERO} rotationY={0} pose={idle(t)} />
		</>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => {
	if (t < BEATS.presets || t >= BEATS.whip) return null;
	return (
		<PixelText x={960} y={1000} size={40} color="#ffffff" outlineColor="#000000">
			{`POST.${PRESETS[presetAt(t)][0]}`}
		</PixelText>
	);
};

export const scene: SceneDef = {id: 'look', duration: BEATS.end, camera, World, Overlay, post: postAt};
