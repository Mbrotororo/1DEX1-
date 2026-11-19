import React from 'react';
import {
	B,
	BlobShadow,
	ENV,
	Environment,
	Fade,
	Glow,
	HudLayer,
	Lantern,
	Player,
	PixelText,
	VoxelMesh,
	VoxelText,
	VoxelWorld,
	buildVoxelMeshes,
	flyCam,
	idle,
	impulse,
	lookCam,
	mixPose,
	once,
	prog,
	shake,
	shots,
	smooth,
	wave,
	type CameraState,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {Viewfinder} from '../../core/hud/rec';
import {POST, mixPost, rackFocus, withFocus, whipSmear, type PostSettings} from '../../core/post';

// Служебная сцена «look»: проверка постобработки и видоискателя. Своя маленькая тёплая комната
// (без src/sets), герой, фонари.
//  0–3     крупный план, сильная глубина резкости (POST.closeUp, фокус на глазах)
//  3–6     перевод фокуса с героя на фонарь у дальней стены (rackFocus)
//  6–8     общий план: свечение фонарей и окна (POST.warmInterior)
//  8–9.6   шок: резкий наезд, белая вспышка 2–3 кадра, тряска (POST.shock + flash)
//  9.6–18.6 пресеты по секунде на одном и том же кадре (время мира заморожено):
//          OFF (постобработка выключена) / NONE (должен совпасть с OFF) / PIPE (нейтрально, но через конвейер) /
//          warmInterior / closeUp / screenPOV / coldDay / shock / happy
//  18.6–20 «вжух»-панорама со смазом (whipSmear)
//  20–24   вид через видоискатель камеры (Viewfinder): герой машет в камеру

const BEATS = {
	close: 0,
	rack: 3,
	rackFrom: 3.5,
	rackTo: 5.1,
	wide: 6,
	shock: 8,
	presets: 9.6,
	whip: 18.6,
	rec: 20,
	recWave: 21.2,
	end: 24,
};

// null — постобработка выключена (эталон для сравнения с POST.none)
const PRESETS: [string, PostSettings | null][] = [
	['OFF', null],
	['NONE', POST.none],
	['PIPE', {...POST.none, vignette: 0.0011}],
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
	[1.2, 1.15, -6.5],
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
	w.fill(-2, 0, -7, 0, 2, -7, B.bookshelf);
	w.fill(5, 0, -7, 7, 2, -7, B.bookshelf);
	w.fill(-7, 0, -6, -7, 1, -3, B.bookshelf);
	// тумба под фонарём у задней стены
	w.fill(1, 0, -7, 2, 0, -7, B.sprucePlanks);
	// окно слева и сундук, верстак
	w.fill(-8, 2, -2, -8, 3, -1, B.windowLit);
	w.set(6, 0, -5, B.chest);
	w.set(7, 0, -5, B.craftingTable);
	// ковёр под героем
	w.fill(-2, 0, -2, 2, 0, 2, B.redCarpet);
	// кирпичная колонна-камин справа
	w.fill(6, 0, 1, 7, 5, 2, B.stoneBricks);
	const lights = LANTERNS.map((p) => ({pos: p, radius: 8, color: '#ffa04a', intensity: 1.2}));
	lights.push({pos: [-7.2, 2.5, -1.5] as Vec3, radius: 6, color: '#9fc4ff', intensity: 0.6});
	return buildVoxelMeshes(w, {ambient: 0.2, ambientColor: '#a89a8a', lights, cull: {bottom: true}});
});

const HERO: Vec3 = [0, 0, 0];
// глаза героя (строка глаз скина)
const EYES: Vec3 = [0, 1.53, 0.26];

// крупный план 3/4, чуть снизу; за спиной — полки и фонари
const closeCam = flyCam([
	{t: 0, pos: [0.62, 1.42, 1.3], look: [-0.05, 1.6, 0], fov: 36},
	{t: 3, pos: [0.5, 1.44, 1.12], look: [-0.05, 1.6, 0], fov: 36},
]);
// через плечо героя на дальнюю стену с фонарём
const rackCam = flyCam([
	{t: 0, pos: [0.75, 1.62, 1.05], look: [0.9, 1.35, -6.5], fov: 42},
	{t: 3, pos: [0.68, 1.6, 0.95], look: [0.9, 1.35, -6.5], fov: 42},
]);
const wideCam = flyCam([
	{t: 0, pos: [3.6, 2.6, 5.6], look: [0, 1.3, -1.5], fov: 50},
	{t: 2, pos: [2.8, 2.4, 5.0], look: [0, 1.3, -1.5], fov: 50},
]);
// шок: резкий наезд и тряска
const shockCam = (ts: number, t: number) =>
	shake(lookCam([0.28 - 0.1 * smooth(prog(ts, 0, 0.2)), 1.6, 1.45 - 0.3 * smooth(prog(ts, 0, 0.2))], [0, 1.6, 0], 38), 0.05 * impulse(t, BEATS.shock, 5), t);
const presetCam = (): CameraState => lookCam([1.35, 1.55, 2.3], [-0.2, 1.45, -0.5], 40);
// «вжух»: поворот камеры на месте вправо за 0.5 с
const WHIP = {from: 0.4, dur: 0.5, a0: 0.3, a1: -1.9};
const whipAngle = (ts: number) => WHIP.a0 + (WHIP.a1 - WHIP.a0) * smooth(prog(ts, WHIP.from, WHIP.dur));
const whipCam = (ts: number): CameraState => {
	const a = whipAngle(ts);
	return lookCam([0.4, 1.6, 3.2], [0.4 + Math.sin(a) * 6, 1.5, 3.2 - Math.cos(a) * 6], 46);
};
// камера на штативе для видоискателя: средний план, лёгкий «ручной» дрейф
const recCam = (ts: number): CameraState => shake(lookCam([0.5, 1.45, 3.6], [0, 1.15, 0], 42), 0.01, ts, 7, 1.3);

const camera = shots([
	{from: BEATS.close, cam: (ts) => closeCam(ts)},
	{from: BEATS.rack, cam: (ts) => rackCam(ts)},
	{from: BEATS.wide, cam: (ts) => wideCam(ts)},
	{from: BEATS.shock, cam: shockCam},
	{from: BEATS.presets, cam: () => presetCam()},
	{from: BEATS.whip, cam: (ts) => whipCam(ts)},
	{from: BEATS.rec, cam: (ts) => recCam(ts)},
]);

const presetAt = (t: number) => Math.min(PRESETS.length - 1, Math.max(0, Math.floor(t - BEATS.presets)));
const inPresets = (t: number) => t >= BEATS.presets && t < BEATS.whip;

const postAt = (t: number, cam: CameraState): PostSettings | null => {
	if (t < BEATS.rack) return withFocus(POST.closeUp, cam, EYES);
	if (t < BEATS.wide) {
		const k = smooth(prog(t, BEATS.rackFrom, BEATS.rackTo - BEATS.rackFrom));
		return {...POST.closeUp, dof: 16, focus: rackFocus(cam, [0.1, 1.6, 0.1], LANTERNS[4], k)};
	}
	if (t < BEATS.shock) return withFocus(POST.warmInterior, cam, [0, 1.4, 0]);
	if (t < BEATS.presets) {
		const s = mixPost(POST.closeUp, POST.shock, smooth(prog(t, BEATS.shock, 0.12)));
		return {...withFocus(s, cam, EYES), flash: impulse(t, BEATS.shock, 22)};
	}
	if (t < BEATS.whip) {
		const s = PRESETS[presetAt(t)][1];
		return s ? withFocus(s, cam, EYES) : null;
	}
	if (t < BEATS.rec) {
		const ts = t - BEATS.whip;
		// длина смаза — от поворота камеры за кадр
		const sm = whipSmear(whipAngle(ts + 1 / 120) - whipAngle(ts - 1 / 120), cam.fov);
		return {...POST.warmInterior, focus: 4, smear: sm, chroma: Math.min(3, sm / 30)};
	}
	return withFocus({...POST.happy, dof: 7}, cam, [0, 1.3, 0]);
};

const World: React.FC<SceneProps> = ({t: tScene, cam, assets}) => {
	const meshes = getRoom();
	// в окне пресетов мир стоит (сравнение кадров между пресетами)
	const t = inPresets(tScene) ? BEATS.presets : tScene;
	const env = {...ENV.dungeon, lightColor: '#ffc890', ambient: 0.42, sun: 0.5, fill: 0.35, fogNear: 30, fogFar: 90};
	const waving = smooth(prog(t, BEATS.recWave, 0.3)) * (1 - smooth(prog(t, BEATS.end - 0.8, 0.4)));
	const pose = t >= BEATS.rec ? mixPose(idle(t), wave(t), waving) : idle(t);
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
			<Player skin={assets.skin} position={HERO} rotationY={0} pose={pose} />
			{/* экранный 3D-слой поверх постобработки: резкий, без вспышки и зерна */}
			{t >= BEATS.shock && t < BEATS.presets ? (
				<HudLayer cam={cam}>
					<VoxelText text="Я ОПОЗДАЛ НА 3 ЧАСА?!" t={t} px={9} depth={2.2} top="#ffffff" bottom="#ffd86b" body="#5a2408" appearAt={BEATS.shock + 0.25} stagger={0.02} enter="pop" position={[0, -330, 0]} />
				</HudLayer>
			) : null}
		</>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => {
	if (inPresets(t)) {
		return (
			<PixelText x={960} y={1010} size={40} color="#ffffff" outlineColor="#000000">
				{`POST.${PRESETS[presetAt(t)][0]}`}
			</PixelText>
		);
	}
	if (t >= BEATS.rec) {
		return (
			<>
				<Viewfinder t={t} start={BEATS.rec} opacity={smooth(prog(t, BEATS.rec, 0.15))} />
				<Fade color="#000000" opacity={smooth(prog(t, BEATS.end - 0.35, 0.35))} />
			</>
		);
	}
	return null;
};

export const scene: SceneDef = {id: 'look', duration: BEATS.end, camera, World, Overlay, post: postAt};
