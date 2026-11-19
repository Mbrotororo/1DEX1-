import React from 'react';
import * as THREE from 'three';
import {
	BlobShadow,
	Breeze,
	Burst,
	Caption,
	CooldownClock,
	CopperGate,
	Counter,
	ENV,
	Environment,
	Fade,
	Firework,
	Flash,
	Glow,
	Hearts,
	HudLayer,
	Humanoid,
	IceCube,
	InstancedBlocks,
	ItemIcon,
	Lantern,
	Letterbox,
	LightBeam,
	Mace,
	NameTag,
	PixelItem,
	PixelText,
	Player,
	Poof,
	PortalParticles,
	POSE_ZERO,
	Shockwave,
	Snowfall,
	Sparkles,
	SpeedLines,
	Torch,
	Trail,
	TreeLights,
	TrialSpawner,
	Vault,
	Vignette,
	VoxelMesh,
	VoxelText,
	WorldLabel,
	aimBow,
	cheer,
	clamp01,
	easeOutBack,
	easeOutCubic,
	fadeTo,
	flicker,
	flyCam,
	followCam,
	frozenPose,
	getSkin,
	headTop,
	hold,
	idle,
	impulse,
	lerp,
	lerpAngle,
	lookCam,
	makePath,
	mixPose,
	once,
	orbitCam,
	prog,
	projectToScreen,
	pulse,
	run,
	scared,
	screenToWorld,
	shadowFor,
	shake,
	shotAt,
	shots,
	shoulder,
	smash,
	smooth,
	swing,
	throwing,
	v3lerp,
	withPose,
	zombieArms,
	type CameraState,
	type Pose,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {BEATS} from './beats';
import {GATE, GRIEF_B, ICE_CENTER, ICE_RADIUS, LANTERNS, LEDGE, SPAWNER_POS, TORCHES, TREE_AT, VAULT_POS, getDungeon, getOutdoor} from './world';

// ---------- герои и маршруты ----------

const stairY = (z: number) => Math.min(8, Math.max(1, z - 18.5));
const heroPath = makePath(
	[
		{t: BEATS.walkFrom, pos: [-0.5, 0, 22.5]},
		{t: 0.9, pos: [-0.5, 0, 18.5]},
		{t: BEATS.walkTo, pos: [-0.5, 0, 8]},
		{t: 2.9, pos: [-0.5, 0, 5]},
	],
	{stride: 1.5},
);
const HF: Vec3 = [-0.5, 1, 5];
const SMASH_AT: Vec3 = [0, 1, 5];
const Z1_FROM: Vec3 = [-3.6, 1, 0.8];
const Z1_TO: Vec3 = [-1.9, 1, 3.7];
const Z2_FROM: Vec3 = [3.6, 1, 0];
const Z2_TO: Vec3 = [1.0, 1, 3.6];
const BREEZE_A: Vec3 = [4, 2.3, -3];
const BREEZE_B: Vec3 = [2.4, 2.4, 0.6];
const HERO_VAULT: Vec3 = [-1.6, 1, -15.8];
const HERO_DUSK: Vec3 = [-2.5, 1, 1.5];
const GRIEF_A: Vec3 = [5.5, 1, 0.5];
const LAB_AT: Vec3 = [2.5, 1, 7.5];

const yawTo = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2]);

// отбрасывание: смещение от точки удара
const knock = (t: number, at: number, dir: Vec3, dist = 2.2): Vec3 => {
	const dt = t - at;
	if (dt <= 0) return [0, 0, 0];
	const k = 1 - Math.exp(-5 * dt);
	const hop = Math.sin(Math.min(1, dt / 0.35) * Math.PI) * 0.5;
	return [dir[0] * dist * k, hop, dir[2] * dist * k];
};

// дуга броска
const arc = (a: Vec3, b: Vec3, k: number, h: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k) + 4 * h * k * (1 - k), lerp(a[2], b[2], k)];

// поворот, который кладёт диагональ рисунка (остриё вправо-вверх) вдоль направления
const aimRotation = (dir: Vec3): [number, number, number] => {
	const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 0).normalize(), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
	const e = new THREE.Euler().setFromQuaternion(q);
	return [e.x, e.y, e.z];
};

const pearlAt = (t: number): Vec3 => {
	getOutdoor();
	const k = prog(t, BEATS.pearlThrow, BEATS.pearlLand - BEATS.pearlThrow);
	return arc([GRIEF_A[0], 2.6, GRIEF_A[2]], [GRIEF_B[0], GRIEF_B[1] + 0.2, GRIEF_B[2]], k, 6);
};

// ---------- камера ----------

const camCorridor = flyCam([
	{t: 0, pos: [0.7, 3.2, 13.5], look: [-0.5, 4.2, 22], fov: 62},
	{t: 1.2, pos: [0.5, 2.7, 11], look: [-0.5, 2.3, 16.5], fov: 55},
	{t: 2.4, pos: [3.6, 2.9, 3.2], look: [-0.5, 2.0, 8.6], fov: 46},
]);
const camFight = orbitCam([
	{t: 0, az: -42, el: 13, dist: 12, target: [0.5, 2.2, 0.8], fov: 52},
	{t: 3.1, az: -18, el: 8, dist: 10, target: [0.5, 2.4, 0.5], fov: 44},
]);
const camKey = flyCam([
	{t: 0, pos: [-3.4, 3.2, 8.2], look: [0.6, 2.2, 0], fov: 52},
	{t: 0.7, pos: [-2.6, 3.0, 5], look: [0, 2.4, -6], fov: 46},
	{t: 1.5, pos: [-0.4, 2.7, -6.5], look: [0, 2.7, -14], fov: 36},
]);
const camVault = orbitCam([
	{t: 0, az: 22, el: 20, dist: 4.3, target: [0.5, 2.7, -18.5], fov: 64},
	{t: 2, az: 135, el: 9, dist: 4.0, target: [0.5, 3.4, -18.5], fov: 50},
]);
const camSmash = flyCam([
	{t: 0, pos: [3.6, 1.4, 9.6], look: [0, 3.6, 5], fov: 72},
	{t: 0.5, pos: [3.1, 1.6, 9.1], look: [0, 1.7, 5], fov: 54},
	{t: 1, pos: [2.6, 1.9, 8.6], look: [0, 1.9, 5], fov: 44},
]);
const camDusk = orbitCam([
	{t: 0, az: 8, el: 11, dist: 13, target: [1.5, 2, 0.5], fov: 40},
	{t: 2.2, az: 34, el: 22, dist: 12.5, target: [4, 1.6, 0.5], fov: 40},
]);
const camPearl = followCam((t) => pearlAt(t), {offset: [1.6, 1.0, 4.5], lookOffset: [0, 0, 2], lag: 0.15, heading: () => yawTo(GRIEF_A, GRIEF_B), fov: 62});
const getCamCooldown = once(() => {
	getOutdoor();
	return orbitCam([
		{t: 0, az: -70, el: 10, dist: 6.5, target: [GRIEF_B[0], GRIEF_B[1] + 1.2, GRIEF_B[2]], fov: 40, shift: 1.2},
		{t: 1.2, az: -50, el: 8, dist: 5.6, target: [GRIEF_B[0], GRIEF_B[1] + 1.2, GRIEF_B[2]], fov: 38, shift: 1.2},
	]);
});
const camNight = orbitCam([
	{t: 0, az: 25, el: -4, dist: 30, target: [TREE_AT[0], 9, TREE_AT[2]], fov: 46},
	{t: 2.5, az: 44, el: -8, dist: 25, target: [TREE_AT[0], 10, TREE_AT[2]], fov: 46},
]);

// стенд скина: ракурсы
const LAB_SHOTS: {az: number; el: number; dist: number; y: number; roll?: number; fov?: number; spread?: boolean}[] = [
	{az: 0, el: 0, dist: 4.6, y: 0.95},
	{az: 90, el: 0, dist: 4.6, y: 0.95},
	{az: 180, el: 0, dist: 4.6, y: 0.95},
	{az: 270, el: 0, dist: 4.6, y: 0.95},
	{az: 0, el: 0, dist: 1.9, y: 1.62},
	{az: 90, el: 0, dist: 1.9, y: 1.62},
	{az: 180, el: 0, dist: 1.9, y: 1.62},
	{az: 270, el: 0, dist: 1.9, y: 1.62},
	{az: 0, el: 80, dist: 2.6, y: 1.5},
	{az: 0, el: -70, dist: 3.4, y: 0.6},
	{az: 30, el: 10, dist: 4.6, y: 0.95, spread: true, roll: 0.3, fov: 55},
	{az: 210, el: 25, dist: 4.6, y: 0.95, spread: true, roll: -0.2, fov: 24},
];
const labIndex = (t: number) => Math.min(LAB_SHOTS.length - 1, Math.max(0, Math.floor((t - BEATS.cutLab) / BEATS.labStep)));
const camLab = (_ts: number, t: number): CameraState => {
	const s = LAB_SHOTS[labIndex(t)];
	const a = (s.az * Math.PI) / 180;
	const e = (s.el * Math.PI) / 180;
	const target: Vec3 = [LAB_AT[0], LAB_AT[1] + s.y, LAB_AT[2]];
	const pos: Vec3 = [target[0] + Math.sin(a) * Math.cos(e) * s.dist, target[1] + Math.sin(e) * s.dist, target[2] + Math.cos(a) * Math.cos(e) * s.dist];
	return lookCam(pos, target, s.fov ?? 30, s.roll ?? 0);
};

const SHOTS = [
	{from: 0, cam: (ts: number) => camCorridor(ts)},
	{from: BEATS.cutFight, cam: (ts: number, t: number) => shake(camFight(ts), 0.12 * impulse(t, BEATS.hit1, 6) + 0.12 * impulse(t, BEATS.hit2, 6) + 0.25 * impulse(t, BEATS.arrowHit, 5) + 0.3 * impulse(t, BEATS.windHit, 5), t)},
	{from: BEATS.cutKey, cam: (ts: number) => camKey(ts)},
	{from: BEATS.cutVault, cam: (ts: number) => camVault(ts)},
	{from: BEATS.cutSmash, cam: (ts: number, t: number) => shake(camSmash(ts), 0.35 * impulse(t, BEATS.smashHit, 5), t)},
	{from: BEATS.cutDusk, cam: (ts: number, t: number) => shake(camDusk(ts), 0.2 * impulse(t, BEATS.snowHit, 5), t)},
	{from: BEATS.pearlThrow, cam: (_ts: number, t: number) => camPearl(t)},
	{from: BEATS.cooldown, cam: (ts: number) => getCamCooldown()(ts)},
	{from: BEATS.cutNight, cam: (ts: number) => camNight(ts)},
	{from: BEATS.cutLab, cam: camLab},
];
const camera = shots(SHOTS);

// ---------- состояние героя (нужно и миру, и интерфейсу) ----------

type Actor = {pos: Vec3; yaw: number; pose: Pose; hurt: number; hand: 'sword' | 'mace' | 'none' | 'snowball'};

const heroAt = (t: number): Actor => {
	const {index} = shotAt(SHOTS, t);
	if (index <= 1) {
		const st = heroPath.at(t);
		let pos: Vec3 = [st.position[0], stairY(st.position[2]), st.position[2]];
		let pose = mixPose(idle(t), run(st.phase), st.moving);
		let yaw = st.heading;
		if (t > 2.9) {
			// бой: поворот к цели и удары
			const toZ1 = yawTo(HF, Z1_TO);
			const toZ2 = yawTo(HF, Z2_TO);
			yaw = lerpAngle(yaw, toZ1, smooth(prog(t, 2.85, 0.15)));
			yaw = lerpAngle(yaw, toZ2, smooth(prog(t, BEATS.swing2 - 0.15, 0.15)));
			yaw = lerpAngle(yaw, yawTo(HF, BREEZE_B), smooth(prog(t, BEATS.arrowHit + 0.1, 0.25)));
			const s1 = prog(t, BEATS.swing1, 0.4);
			const s2 = prog(t, BEATS.swing2, 0.4);
			pose = mixPose(pose, swing(s1), pulse(t, BEATS.swing1, BEATS.swing1 + 0.4, 0.04, 0.1));
			pose = mixPose(pose, swing(s2), pulse(t, BEATS.swing2, BEATS.swing2 + 0.4, 0.04, 0.1));
			// стрела: отшатнулся; заряд ветра: подбросило
			const kb = knock(t, BEATS.arrowHit, [0.35, 0, 0.94], 0.8);
			const up = prog(t, BEATS.windHit, 0.6);
			pos = [pos[0] + kb[0], pos[1] + kb[1] * 0.5 + 4 * 1.8 * up * (1 - up), pos[2] + kb[2]];
			pose = mixPose(pose, scared(t), pulse(t, BEATS.windHit, BEATS.windHit + 0.5, 0.1, 0.1));
		}
		return {pos, yaw, pose, hurt: impulse(t, BEATS.arrowHit, 5) + impulse(t, BEATS.windHit, 5), hand: 'sword'};
	}
	if (index === 2) {
		const k = smooth(prog(t, BEATS.keyTo - 0.2, 0.3));
		return {pos: HF, yaw: lerpAngle(yawTo(HF, BREEZE_B), Math.PI, smooth(prog(t, BEATS.keyTo, 0.4))), pose: mixPose(idle(t), cheer(t), k * (1 - smooth(prog(t, BEATS.gateOpen, 0.3)))), hurt: 0, hand: 'sword'};
	}
	if (index === 3) {
		const look = withPose(idle(t), {headPitch: -0.25, headYaw: -0.3});
		return {pos: HERO_VAULT, yaw: yawTo(HERO_VAULT, VAULT_POS), pose: mixPose(look, hold(prog(t, BEATS.maceRise, 0.5)), smooth(prog(t, BEATS.book, 0.4))), hurt: 0, hand: 'none'};
	}
	if (index === 4) {
		const k = prog(t, BEATS.cutSmash, BEATS.smashHit - BEATS.cutSmash);
		const y = SMASH_AT[1] + 4 * 2.6 * k * (1 - k) * 0.9 + (1 - k) * 0.6;
		return {pos: [SMASH_AT[0], Math.max(SMASH_AT[1], y), SMASH_AT[2]], yaw: 0.5, pose: smash(prog(t, BEATS.smashHit - 0.22, 0.22)), hurt: 0, hand: 'mace'};
	}
	if (index <= 7) {
		const k = prog(t, BEATS.snowThrow - 0.25, 0.55);
		const thr = pulse(t, BEATS.snowThrow - 0.25, BEATS.snowThrow + 0.3, 0.05, 0.15);
		return {pos: HERO_DUSK, yaw: yawTo(HERO_DUSK, GRIEF_A), pose: mixPose(shoulder(t), throwing(k), thr), hurt: 0, hand: t < BEATS.snowThrow ? 'snowball' : 'mace'};
	}
	if (index === 8) {
		const p: Vec3 = [TREE_AT[0] + 4.5, 1, TREE_AT[2] + 5.5];
		return {pos: p, yaw: 0.6, pose: cheer(t), hurt: 0, hand: 'mace'};
	}
	const s = LAB_SHOTS[labIndex(t)];
	const pose = s.spread ? withPose(POSE_ZERO, {armR: [0, -1.2], armL: [0, 1.2], legR: [0.5, 0], legL: [-0.5, 0]}) : POSE_ZERO;
	return {pos: LAB_AT, yaw: 0, pose, hurt: 0, hand: 'none'};
};

const snowballAt = (t: number): Vec3 => {
	const k = prog(t, BEATS.snowThrow, BEATS.snowHit - BEATS.snowThrow);
	return arc([HERO_DUSK[0] + 0.4, 2.7, HERO_DUSK[2]], [GRIEF_A[0] - 0.4, 1.1, GRIEF_A[2]], k, 1.6);
};

// маркер проверки проекции: маленький кубик в мире
const Marker: React.FC<{at: Vec3}> = ({at}) => (
	<mesh position={at} renderOrder={999}>
		<boxGeometry args={[0.07, 0.07, 0.07]} />
		<meshBasicMaterial color="#ff00ff" depthTest={false} fog={false} toneMapped={false} />
	</mesh>
);

// ---------- мир ----------

const Dungeon: React.FC<SceneProps & {index: number}> = ({t, cam, assets, index}) => {
	const set = getDungeon();
	const env = ENV.dungeon;
	const hero = heroAt(t);
	const skinZ = getSkin('zombie');
	const skinS = getSkin('skeleton');

	// зомби
	const zombie = (from: Vec3, to: Vec3, born: number, arrive: number, hit: number, die: number, seed: number) => {
		const k = smooth(prog(t, born, arrive - born));
		const base = v3lerp(from, to, k);
		const dir: Vec3 = [to[0] - HF[0], 0, to[2] - HF[2]];
		const len = Math.hypot(dir[0], dir[2]);
		const kb = knock(t, hit, [dir[0] / len, 0, dir[2] / len], 2.4);
		const pos: Vec3 = [base[0] + kb[0], base[1] + kb[1], base[2] + kb[2]];
		const fallen = smooth(prog(t, hit + 0.12, die - hit - 0.12));
		const grow = easeOutBack(prog(t, born, 0.25));
		const visible = t >= born && t < die;
		return (
			<React.Fragment key={seed}>
				<Burst t={t} at={born} origin={[from[0], 1.2, from[2]]} count={24} colors={['#ff9a2e', '#ffd86b', '#5ad0ff']} speed={[1.5, 4]} shape="up" life={[0.3, 0.7]} additive seed={seed} />
				{visible ? (
					<>
						<BlobShadow x={pos[0]} z={pos[2]} y={1} size={shadowFor(pos[1] - 1).size} opacity={shadowFor(pos[1] - 1).opacity} />
						<Humanoid skin={skinZ} position={pos} rotationY={yawTo(pos, HF)} pose={zombieArms(t * 7 + seed, 1 - fallen)} hurt={impulse(t, hit, 4)} lean={[-0.5 * impulse(t, hit, 6), fallen * 1.45]} scale={grow} />
					</>
				) : null}
				<Poof t={t} at={die} origin={[to[0] + (dir[0] / len) * 2.3, 1.6, to[2] + (dir[2] / len) * 2.3]} count={18} />
			</React.Fragment>
		);
	};

	// скелет-лучник и стрела
	const pull = smooth(prog(t, 3.5, BEATS.arrowShot - 3.5)) * (t < BEATS.arrowShot ? 1 : Math.max(0, 1 - (t - BEATS.arrowShot) * 6));
	const skYaw = yawTo(LEDGE, HF);
	const arrowFrom: Vec3 = [LEDGE[0] - 0.5, LEDGE[1] + 1.45, LEDGE[2] + 0.7];
	const arrowTo: Vec3 = [HF[0], HF[1] + 1.2, HF[2]];
	const ak = prog(t, BEATS.arrowShot, BEATS.arrowHit - BEATS.arrowShot);
	const arrowPos = v3lerp(arrowFrom, arrowTo, ak);
	const arrowDir: Vec3 = [arrowTo[0] - arrowFrom[0], arrowTo[1] - arrowFrom[1], arrowTo[2] - arrowFrom[2]];
	const skDie = BEATS.windHit;

	// вихрь и его заряд
	const bk = smooth(prog(t, BEATS.spawnerOn + 0.4, 1.6));
	const breezePos = v3lerp(BREEZE_A, BREEZE_B, bk);
	const charge = prog(t, BEATS.breezeCharge, BEATS.breezeShot - BEATS.breezeCharge) * (t < BEATS.breezeShot ? 1 : Math.max(0, 1 - (t - BEATS.breezeShot) * 4));
	const wk = prog(t, BEATS.breezeShot, BEATS.windHit - BEATS.breezeShot);
	const windPos = v3lerp([BREEZE_B[0], BREEZE_B[1] + 1, BREEZE_B[2]], [HF[0] + 0.2, 1.4, HF[2] + 0.4], wk);
	const dissolve = prog(t, BEATS.breezeDie, 0.2);

	// ключ
	const kk = prog(t, BEATS.keyFrom, BEATS.keyTo - BEATS.keyFrom);
	const keyPos = arc([BREEZE_B[0], 3.2, BREEZE_B[2]], [HF[0], 2.5, HF[2] - 0.3], easeOutCubic(kk), 1.6);

	// хранилище
	const lid = easeOutBack(prog(t, BEATS.lid, 0.5));
	const beam = smooth(prog(t, BEATS.beam, 0.4));
	const rise = easeOutCubic(prog(t, BEATS.maceRise, 0.9));
	const bookK = easeOutBack(prog(t, BEATS.book, 0.5));
	const gate = smooth(prog(t, BEATS.gateOpen, BEATS.gateDone - BEATS.gateOpen));
	const vaultTop: Vec3 = [VAULT_POS[0], VAULT_POS[1] + 1, VAULT_POS[2]];

	const heroY = hero.pos[1];
	const groundUnder = hero.pos[2] > 19 ? stairY(hero.pos[2]) : 1;
	const sh = shadowFor(heroY - groundUnder);
	const handR =
		hero.hand === 'sword' ? <PixelItem art="diamondSword" held /> : hero.hand === 'mace' ? <Mace held /> : index === 3 && t > BEATS.book + 0.6 ? <PixelItem art="trialKey" held size={0.6} /> : undefined;

	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint={env.tint} />
			{TORCHES.map((tc, i) => (
				<Torch key={i} position={tc.pos} t={t} wall={tc.wall} seed={i} />
			))}
			{LANTERNS.map((p, i) => (
				<Lantern key={i} position={p} t={t} hanging={1.2} seed={i + 10} />
			))}
			{/* мерцающие ореолы ламп (свои источники) */}
			{set.lights.slice(0, 40).map((l, i) => (
				<Glow key={i} position={l.pos} color={l.color ?? '#ffb468'} size={2.6 + flicker(t, i) * 0.25} opacity={0.32 + flicker(t, i + 50) * 0.06} />
			))}
			<TrialSpawner position={SPAWNER_POS} t={t} active={prog(t, BEATS.spawnerOn, 0.5)} />
			<CopperGate position={GATE} width={4} height={4} open={gate} axis="x" tint={env.tint} shake={impulse(t, BEATS.gateOpen, 4)} />

			{/* герой */}
			<BlobShadow x={hero.pos[0]} z={hero.pos[2]} y={groundUnder} size={sh.size} opacity={sh.opacity} />
			<Player skin={assets.skin} position={hero.pos} rotationY={hero.yaw} pose={hero.pose} hurt={hero.hurt} handR={handR} />
			<NameTag text="1DEX1" position={headTop(hero.pos)} cam={cam} />
			<Marker at={headTop(hero.pos)} />

			{index <= 2 ? (
				<>
					{zombie(Z1_FROM, Z1_TO, BEATS.spawnerOn + 0.1, 3.05, BEATS.hit1, BEATS.die1, 1)}
					{zombie(Z2_FROM, Z2_TO, BEATS.spawnerOn + 0.25, 3.7, BEATS.hit2, BEATS.die2, 2)}
					{t < skDie ? (
						<Humanoid skin={skinS} position={LEDGE} rotationY={skYaw} pose={aimBow(pull)} handL={<PixelItem art="bow" held />} />
					) : null}
					<Poof t={t} at={skDie} origin={[LEDGE[0], LEDGE[1] + 1, LEDGE[2]]} />
					{ak > 0 && ak < 1 ? <PixelItem art="arrow" size={0.9} position={arrowPos} rotation={aimRotation(arrowDir)} /> : null}
					<Burst t={t} at={BEATS.arrowHit} origin={arrowTo} count={10} colors={['#ffffff', '#c9c9c9']} speed={[1, 3]} shape="sphere" life={[0.2, 0.4]} />
					{dissolve < 1 ? <Breeze position={breezePos} t={t} rotationY={yawTo(breezePos, HF)} hover={0.35} charge={charge} hurt={impulse(t, BEATS.breezeDie, 5)} dissolve={dissolve} /> : null}
					{wk > 0 && wk < 1 ? (
						<>
							<Glow position={windPos} color="#bfe8ff" size={1.4} opacity={0.8} />
							<PixelItem art="snowball" size={0.45} position={windPos} billboard={cam} glow={1} />
						</>
					) : null}
					<Trail t={t} from={BEATS.breezeShot} to={BEATS.windHit} rate={60} origin={(time) => v3lerp([BREEZE_B[0], BREEZE_B[1] + 1, BREEZE_B[2]], [HF[0] + 0.2, 1.4, HF[2] + 0.4], prog(time, BEATS.breezeShot, BEATS.windHit - BEATS.breezeShot))} colors={['#dff4ff', '#9fd4ff']} life={[0.2, 0.4]} />
					<Shockwave t={t} at={BEATS.windHit} origin={[HF[0], 1.05, HF[2]]} radius={3} color="#cfeeff" debris={[]} />
					{kk > 0 && kk < 1 ? <PixelItem art="trialKey" size={0.7} position={keyPos} billboard={cam} glow={0.8} /> : null}
					<Trail t={t} from={BEATS.keyFrom} to={BEATS.keyTo} rate={50} origin={(time) => arc([BREEZE_B[0], 3.2, BREEZE_B[2]], [HF[0], 2.5, HF[2] - 0.3], easeOutCubic(prog(time, BEATS.keyFrom, BEATS.keyTo - BEATS.keyFrom)), 1.6)} colors={['#ffe9a0', '#ffb040']} life={[0.25, 0.5]} size={[0.05, 0.1]} additive />
					<Burst t={t} at={BEATS.keyTo} origin={[HF[0], 2.5, HF[2] - 0.3]} count={16} colors={['#ffe9a0', '#ffffff']} speed={[1, 3]} shape="sphere" life={[0.3, 0.6]} additive />
				</>
			) : null}

			{/* хранилище за воротами */}
			<Vault position={VAULT_POS} t={t} lid={lid} keys={t < BEATS.cutVault ? 0 : Math.min(3, Math.floor((t - BEATS.cutVault) / 0.06))} glow={beam} />
			<LightBeam position={vaultTop} height={4.2} width={0.9} color="#ffd86b" amount={beam} t={t} />
			<Sparkles t={t} center={[vaultTop[0], vaultTop[1] + 1.4, vaultTop[2]]} box={[3, 3, 3]} count={40} colors={['#ffe9a0', '#ffffff', '#ffb040']} amount={beam} />
			<Glow position={[vaultTop[0], vaultTop[1] + 0.3, vaultTop[2]]} color="#ffd070" size={5} opacity={0.5 * beam} />
			{rise > 0 ? (
				<>
					<Mace length={1.1} position={[vaultTop[0] - 0.9, vaultTop[1] + 0.2 + rise * 1.3, vaultTop[2]]} rotation={[0.3, t * 2.4, 0.5]} glow={0.5} scale={rise} />
					<PixelItem art="mace" size={1.1} position={[vaultTop[0], vaultTop[1] + 0.3 + rise * 1.5 + Math.sin(t * 3) * 0.06, vaultTop[2]]} rotation={[0, t * 2.4, 0]} glow={0.4} scale={rise} />
				</>
			) : null}
			{bookK > 0 ? <PixelItem art="enchantedBook" size={0.8} position={[vaultTop[0] + 1.0, vaultTop[1] + 1.2 + Math.sin(t * 2.6) * 0.08, vaultTop[2] + 0.2]} rotation={[0, cam.azimuth + Math.sin(t * 1.5) * 0.5, 0]} glint={t} glow={0.4} scale={bookK} /> : null}
			{index === 3 ? <VoxelText text="БУЛАВА" t={t} px={0.07} depth={2.2} top="#fff3c0" bottom="#ffb040" body="#5a2408" appearAt={BEATS.maceRise + 0.3} stagger={0.05} enter="pop" position={[vaultTop[0], vaultTop[1] + 2.9, vaultTop[2]]} rotation={[0, cam.azimuth, 0]} fog={false} /> : null}

			{/* удар булавой */}
			<Shockwave t={t} at={BEATS.smashHit} origin={[SMASH_AT[0], 1.05, SMASH_AT[2] + 0.8]} radius={5} color="#ffd9a0" debris={['#8a8f8c', '#c8643c', '#4fb39a']} />
			<Burst t={t} at={BEATS.smashHit} origin={[SMASH_AT[0], 1.1, SMASH_AT[2] + 0.8]} count={30} colors={['#d8d8d8', '#b9a08a']} speed={[2, 6]} shape="ring" gravity={-7} life={[0.35, 0.8]} />
		</>
	);
};

const Outdoor: React.FC<SceneProps & {index: number}> = ({t, cam, assets, index}) => {
	const set = getOutdoor();
	const night = index === 8;
	const lab = index === 9;
	const env = lab ? ENV.day : night ? ENV.night : ENV.sunset;
	const hero = heroAt(t);
	const grief = getSkin('griefer');

	// лёд: волна от центра
	const wave = (t - BEATS.snowHit) * 9;
	const frozen = clamp01((t - BEATS.snowHit) * 5);
	const teleported = t >= BEATS.pearlLand;
	const gPos = teleported ? GRIEF_B : GRIEF_A;
	const gFrozen = t < BEATS.pearlThrow - 0.5 ? frozen : 0;
	let gPose: Pose = mixPose(scared(t), frozenPose(), gFrozen);
	const thr = prog(t, BEATS.pearlThrow - 0.3, 0.6);
	if (thr > 0 && thr < 1) gPose = throwing(thr);
	const gYaw = teleported ? yawTo(GRIEF_B, HERO_DUSK) : t > BEATS.pearlThrow - 0.5 ? yawTo(GRIEF_A, GRIEF_B) : yawTo(GRIEF_A, HERO_DUSK);
	const pearl = pearlAt(t);
	const pk = prog(t, BEATS.pearlThrow, BEATS.pearlLand - BEATS.pearlThrow);
	const sk = prog(t, BEATS.snowThrow, BEATS.snowHit - BEATS.snowThrow);

	// салюты: точки «в кадре»
	const salutes = [
		{at: BEATS.salute1, sx: -0.5, sy: 0.45, colors: ['#ff5a5a', '#ffd0d0', '#ffffff']},
		{at: BEATS.salute2, sx: 0.55, sy: 0.55, colors: ['#5ad0ff', '#d0f0ff', '#ffffff']},
		{at: BEATS.salute3, sx: 0.1, sy: 0.7, colors: ['#ffd86b', '#fff3c0', '#8fff8f']},
	];

	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={night ? set.night : lab ? set.dusk : set.duskHoled} tint={env.tint} />
			{!night && !lab ? (
				<InstancedBlocks
					blocks={set.iceBlocks}
					tint={env.tint}
					mixColor="#9fd4ff"
					animate={(b, _i, out) => {
						const d = Math.hypot(b.x + 0.5 - ICE_CENTER[0], b.z + 0.5 - ICE_CENTER[2]);
						const k = clamp01((wave - d) / 1.2);
						out.mix = smooth(k) * 0.85;
						out.y = Math.sin(clamp01((wave - d) / 2) * Math.PI) * 0.25;
					}}
				/>
			) : null}
			<TreeLights lights={set.tree.lights} star={set.tree.star} t={t} on={night ? 1 : 0.3} blink={0.6} />
			<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={1500} density={night ? 0.5 : lab ? 0 : 0.25} />

			{/* герой */}
			<BlobShadow x={hero.pos[0]} z={hero.pos[2]} y={1} />
			<Player
				skin={assets.skin}
				position={hero.pos}
				rotationY={hero.yaw}
				pose={hero.pose}
				handR={hero.hand === 'mace' ? <Mace held /> : hero.hand === 'snowball' ? <PixelItem art="snowball" held size={0.5} /> : undefined}
			/>
			{!lab ? <NameTag text="1DEX1" position={headTop(hero.pos)} cam={cam} /> : null}
			<Marker at={headTop(hero.pos)} />

			{!night && !lab ? (
				<>
					<BlobShadow x={gPos[0]} z={gPos[2]} y={1} />
					{t >= BEATS.pearlLand - 0.001 && t < BEATS.pearlLand + 0.05 ? null : (
						<Humanoid skin={grief} position={gPos} rotationY={gYaw} pose={gPose} frozen={gFrozen * 0.8} handR={t > BEATS.pearlThrow - 0.5 && t < BEATS.pearlThrow ? <PixelItem art="enderPearl" held size={0.5} /> : undefined} hurt={impulse(t, BEATS.snowHit, 4) * 0.6} />
					)}
					<NameTag text="GRIEFER" position={headTop(gPos)} cam={cam} color="#ff4a3c" />
					<Marker at={headTop(gPos)} />
					{gFrozen > 0 ? <IceCube position={GRIEF_A} grow={easeOutBack(prog(t, BEATS.snowHit + 0.1, 0.35))} /> : null}
					{sk > 0 && sk < 1 ? <PixelItem art="snowball" size={0.5} position={snowballAt(t)} billboard={cam} /> : null}
					<Shockwave t={t} at={BEATS.snowHit} origin={[ICE_CENTER[0], 1.05, ICE_CENTER[2]]} radius={ICE_RADIUS} color="#bfe8ff" debris={['#ffffff', '#bfe8ff', '#7fc4f0']} />
					<Burst t={t} at={BEATS.snowHit} origin={[ICE_CENTER[0], 1.2, ICE_CENTER[2]]} count={40} colors={['#ffffff', '#dff4ff']} speed={[2, 7]} shape="up" life={[0.4, 0.9]} />
					<Sparkles t={t} center={[ICE_CENTER[0], 2, ICE_CENTER[2]]} box={[10, 2, 10]} count={50} colors={['#ffffff', '#bfe8ff']} amount={frozen * (1 - prog(t, BEATS.pearlThrow, 0.3))} />
					{pk > 0 && pk < 1 ? <PixelItem art="enderPearl" size={0.5} position={pearl} billboard={cam} /> : null}
					<Trail t={t} from={BEATS.pearlThrow} to={BEATS.pearlLand} rate={40} origin={(time) => pearlAt(time)} colors={['#b05cff', '#5a1e9e']} life={[0.3, 0.6]} size={[0.05, 0.1]} />
					<PortalParticles t={t} at={BEATS.pearlLand} origin={[GRIEF_A[0], 1, GRIEF_A[2]]} mode="out" />
					<PortalParticles t={t} at={BEATS.pearlLand} origin={[GRIEF_B[0], 1, GRIEF_B[2]]} mode="in" />
				</>
			) : null}

			{night
				? salutes.map((s, i) => {
						const p = screenToWorld(camera(s.at + 0.3), s.sx, s.sy, 34);
						return <Firework key={i} t={t} at={s.at} origin={[p.x, p.y, p.z]} colors={s.colors} seed={i + 1} />;
					})
				: null}
			{night ? (
				<HudLayer cam={cam}>
					<VoxelText text="НОВЫЙ ВАЙП" t={t} px={14} depth={2.4} top="#ffffff" bottom="#9fd0ff" body="#1b3a6e" appearAt={BEATS.cutNight + 0.25} stagger={0.045} wobble={0.2} position={[0, 300, 0]} rotation={[0.06, 0, 0]} scale={1 + impulse(t, BEATS.cutNight + 0.25, 8) * 0.15} />
					<VoxelText text="21 НОЯБРЯ · 13:00 МСК" t={t} px={7} top="#ffffff" bottom="#ffd86b" body="#5a2408" appearAt={BEATS.cutNight + 0.7} enter="pop" position={[0, 150, 0]} />
				</HudLayer>
			) : null}
		</>
	);
};

const World: React.FC<SceneProps> = (props) => {
	const {index} = shotAt(SHOTS, props.t);
	return index <= 4 ? <Dungeon {...props} index={index} /> : <Outdoor {...props} index={index} />;
};

// ---------- интерфейс ----------

// прицел проверки проекции (DOM)
const Cross: React.FC<{color?: string}> = ({color = '#00ffff'}) => (
	<>
		<div style={{position: 'absolute', left: -20, top: -1, width: 40, height: 2, background: color}} />
		<div style={{position: 'absolute', left: -1, top: -20, width: 2, height: 40, background: color}} />
	</>
);

const Overlay: React.FC<SceneProps> = ({t, cam}) => {
	const {index} = shotAt(SHOTS, t);
	const hero = heroAt(t);
	const blocks = Math.round(100 * prog(t, BEATS.pearlThrow, BEATS.pearlLand - BEATS.pearlThrow - 0.15));
	const gPos = t >= BEATS.pearlLand ? GRIEF_B : GRIEF_A;
	const vaultTop: Vec3 = [VAULT_POS[0], VAULT_POS[1] + 1, VAULT_POS[2]];
	const sp = projectToScreen(cam, headTop(hero.pos));
	return (
		<>
			<Vignette amount={index <= 4 ? 0.55 : index === 8 ? 0.4 : 0.15} />
			{index === 4 ? <Letterbox amount={1 - prog(t, BEATS.smashHit, 0.3)} /> : null}
			{index === 6 ? <SpeedLines t={t} amount={pulse(t, BEATS.pearlThrow, BEATS.pearlLand, 0.2, 0.2)} /> : null}

			{/* проверка проекции: прицел над головой героя + числа */}
			<WorldLabel cam={cam} at={headTop(hero.pos)} clamp={false}>
				<Cross />
			</WorldLabel>
			{index === 5 || index === 7 ? (
				<WorldLabel cam={cam} at={headTop(gPos)} clamp={false}>
					<Cross color="#ffff00" />
				</WorldLabel>
			) : null}
			{index === 9 ? (
				<PixelText x={960} y={1000} size={40} color="#ffffff">{`ЛАБ ${labIndex(t)} · ${Math.round(sp.x)},${Math.round(sp.y)} · ${sp.pxPerBlock.toFixed(1)}`}</PixelText>
			) : null}

			{/* А */}
			<Caption t={t} from={BEATS.title} to={2.2} x={960} y={900} size={80} color="#ffd9a0" color2="#e07a3c">
				МЕДНОЕ ПОДЗЕМЕЛЬЕ
			</Caption>
			{/* Б */}
			<Caption t={t} from={BEATS.cutFight + 0.2} to={4.3} x={960} y={170} size={70} color="#ffffff" color2="#8fe6c8">
				КОМНАТА ИСПЫТАНИЙ
			</Caption>
			{index >= 1 && index <= 5 ? <Hearts value={t < BEATS.arrowHit ? 10 : t < BEATS.windHit ? 7.5 : 5} t={t} shake={impulse(t, BEATS.arrowHit, 5) + impulse(t, BEATS.windHit, 5)} flash={impulse(t, BEATS.arrowHit, 8) + impulse(t, BEATS.windHit, 8)} /> : null}
			{/* В */}
			<Caption t={t} from={BEATS.keyTo} to={BEATS.cutVault - 0.05} x={1010} y={860} size={80} color="#ffe95a">
				{`КЛЮЧ ${1}/3`}
			</Caption>
			{t > BEATS.keyTo && t < BEATS.cutVault ? <ItemIcon art="trialKey" x={760} y={860} size={96} scale={easeOutBack(prog(t, BEATS.keyTo, 0.25))} /> : null}
			{/* Г */}
			<WorldLabel cam={cam} at={[vaultTop[0] + 1.0, vaultTop[1] + 1.9, vaultTop[2] + 0.2]} dy={-10}>
				<Caption t={t} from={BEATS.book + 0.3} to={BEATS.cutSmash - 0.05} x={0} y={0} size={50} color="#d7a8ff">
					ПОЧИНКА
				</Caption>
			</WorldLabel>
			<Caption t={t} from={BEATS.cutVault + 0.3} to={BEATS.cutSmash - 0.05} x={960} y={880} size={60} color="#ffffff" color2="#ffd86b">
				НАГРАДА ЗА ИСПЫТАНИЯ
			</Caption>
			{/* Д */}
			<Caption t={t} from={BEATS.smashHit} to={BEATS.cutDusk} x={960} y={220} size={90} color="#ff5a4a" wobble={0.3}>
				УРОН БУЛАВЫ −50%
			</Caption>
			<Caption t={t} from={BEATS.smashHit + 0.15} to={BEATS.cutDusk} x={960} y={320} size={50} color="#ffffff">
				ЕСЛИ ТЫ НЕ БЫЛ В PVP
			</Caption>
			<Flash t={t} at={BEATS.smashHit} dur={0.25} color="#ffffff" peak={0.6} />
			<Fade color="#fff1c4" opacity={fadeTo(t, BEATS.cutDusk, 0.3) * (t < BEATS.cutDusk ? 1 : 0) + (t >= BEATS.cutDusk ? 1 - prog(t, BEATS.cutDusk, 0.4) : 0)} />
			{/* Е */}
			<WorldLabel cam={cam} at={[HERO_DUSK[0], 3.2, HERO_DUSK[2]]} dy={-60}>
				<Caption t={t} from={BEATS.cutDusk + 0.1} to={BEATS.snowHit} x={0} y={0} size={50} color="#dff4ff">
					КОМ СНЕГА
				</Caption>
			</WorldLabel>
			<Caption t={t} from={BEATS.snowHit + 0.15} to={BEATS.pearlThrow} x={960} y={800} size={80} color="#ffffff" color2="#9fd4ff">
				ЗАМОРАЖИВАЕТ ВСЮ ОБЛАСТЬ
			</Caption>
			<Caption t={t} from={BEATS.snowHit + 0.5} to={BEATS.pearlThrow} x={960} y={890} size={50} color="#ff5a4a">
				+ УРОН
			</Caption>
			<Caption t={t} from={BEATS.pearlThrow} to={BEATS.cooldown} x={960} y={150} size={60} color="#d7a8ff">
				ЭНДЕР-ЖЕМЧУГ
			</Caption>
			{index === 6 ? <Counter value={blocks} suffix=" БЛОКОВ" x={960} y={250} size={90} color="#ffffff" pop={impulse(t, BEATS.pearlLand - 0.15, 6)} /> : null}
			<Caption t={t} from={BEATS.cooldown} to={BEATS.cutNight} x={960} y={170} size={80} color="#ff5a4a">
				МАКСИМУМ 100 БЛОКОВ
			</Caption>
			<Caption t={t} from={BEATS.cooldown + 0.2} to={BEATS.cutNight} x={1300} y={640} size={50} color="#ffffff">
				ПЕРЕЗАРЯДКА 5 СЕК
			</Caption>
			{index === 7 ? <CooldownClock x={1300} y={500} size={140} progress={prog(t, BEATS.cooldown, 5)} /> : null}
			{index === 7 ? <ItemIcon art="enderPearl" x={1300} y={500} size={72} /> : null}
			{/* Ж */}
			<Caption t={t} from={BEATS.cutNight + 0.9} to={BEATS.cutLab} x={960} y={760} size={110} color="#ffffff" color2="#ffd86b">
				mc.holyworld.ru
			</Caption>
			<Caption t={t} from={BEATS.cutNight + 1.2} to={BEATS.cutLab} x={960} y={900} size={70} color="#7fd4ff">
				ТГК: ЖИЗНЬ 1DEX1
			</Caption>
			<Fade color="#000000" opacity={t < BEATS.cutLab ? fadeTo(t, BEATS.cutLab, BEATS.cutLab - BEATS.fadeOut) : 0} />
		</>
	);
};

export const scene: SceneDef = {id: 'probe-b', duration: BEATS.end, camera, World, Overlay};
