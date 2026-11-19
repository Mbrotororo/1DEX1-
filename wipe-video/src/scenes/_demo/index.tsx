import React, {useMemo} from 'react';
import {
	B,
	BandWave,
	BlobShadow,
	Breeze,
	Burst,
	Caption,
	CooldownClock,
	CopperGate,
	Countdown,
	Counter,
	ENV,
	Environment,
	ExtrudedLogo,
	Fade,
	Firework,
	FlakeStream,
	Flash,
	Glow,
	Hearts,
	HudLayer,
	Humanoid,
	InstancedBlocks,
	ItemIcon,
	Lantern,
	Letterbox,
	LightBeam,
	NameTag,
	Pig,
	PixelItem,
	SansText,
	Player,
	Poof,
	PortalParticles,
	PotionSwirl,
	SPEED_POTION,
	Shockwave,
	Snowfall,
	Sparkles,
	SpeedLines,
	Stamp,
	Torch,
	Trail,
	TreeLights,
	TrialSpawner,
	Vault,
	Vignette,
	VoxelMesh,
	VoxelText,
	VoxelWorld,
	WaterSurface,
	WorldLabel,
	aimBow,
	buildVoxelMeshes,
	cheer,
	clamp01,
	drink,
	easeInOutCubic,
	easeOutBack,
	easeOutCubic,
	envTrack,
	fadeFrom,
	fadeTo,
	flyCam,
	getSkin,
	hash3,
	headTop,
	idle,
	impulse,
	lerp,
	lookAround,
	hold,
	shoulder,
	throwing,
	makePath,
	mixPose,
	newYearTree,
	orbitCam,
	potionArt,
	prog,
	run,
	scared,
	shake,
	shotAt,
	shots,
	smash,
	smooth,
	swing,
	wave,
	zombieArms,
	type BlockAnim,
	type BlockInst,
	type FlakeSource,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {BEATS} from './beats';
import {DUNGEON, getDungeon, getIsland} from './world';

// Демо-сцена: испытательный стенд ядра и образец для авторов. Три плана:
//  1) остров собирается из снега (BandWave assemble), герой пьёт зелье;
//  2) метель, снежный покров, остров рассыпается с краёв (BandWave dissolve + FlakeStream);
//  3) подземелье: запечённый свет, мобы, хранилище с ключами, эффекты и интерфейс.

const SPAN = 5;
const WIND: Vec3 = [7, 1.6, 2.5];
const SHOTS = [{from: 0}, {from: BEATS.shot2}, {from: BEATS.shot3}, {from: BEATS.shot4}];

// ---------- камера ----------
const cam1 = orbitCam([
	{t: 0, az: 30, el: 28, dist: 96, target: [0, 2, 0]},
	{t: 2.6, az: 52, el: 22, dist: 70, target: [0, 3, 0]},
	{t: 4, az: 64, el: 12, dist: 17, target: [-1, 2.2, 0], fov: 34},
]);
const cam2 = orbitCam([
	{t: 0, az: 150, el: 16, dist: 30, target: [0, 3, 0]},
	{t: 2, az: 175, el: 22, dist: 58, target: [0, 2, 0]},
	{t: 4, az: 200, el: 30, dist: 40, target: [0, 2, 0], fov: 44},
]);
const cam3 = flyCam([
	{t: 0, pos: [0.5, 2.9, -5.7], look: [0.5, 1.5, 0.5], fov: 64},
	{t: 1.6, pos: [2.2, 3.1, -5.7], look: [0.3, 1.4, 0.6], fov: 60},
	{t: 4, pos: [-3.4, 3.5, -5.6], look: [0.8, 1.3, 1.2], fov: 58},
]);
const cam4 = orbitCam([
	{t: 0, az: -28, el: 6, dist: 12.5, target: [-1, 1.5, 0], fov: 46},
	{t: 3.5, az: 26, el: 12, dist: 13.5, target: [1, 1.8, 0], fov: 46},
]);
const camera = shots([
	{from: 0, cam: (ts) => cam1(ts)},
	{from: BEATS.shot2, cam: (ts, t) => shake(cam2(ts), 0.12 * prog(t, BEATS.dissolveFrom, 1.5), t, 3)},
	{from: BEATS.shot3, cam: (ts, t) => shake(cam3(ts), impulse(t, BEATS.shock, 5) * 0.25, t, 5)},
	{from: BEATS.shot4, cam: (ts) => cam4(ts)},
]);

// ---------- анимации блоков для волны ----------
// сборка: блок прилетает сверху белым «снежком» и встаёт на место
const assembleAnim = (b: BlockInst, p: number, out: BlockAnim) => {
	const e = easeOutBack(p, 1.2);
	const h = hash3(b.x, b.y, b.z, 5);
	out.y = (1 - easeOutCubic(p)) * (7 + h * 8);
	out.x = (1 - easeOutCubic(p)) * (h - 0.5) * 6;
	out.s = p <= 0 ? 0 : e;
	out.ry = (1 - p) * (h * 6 - 3);
	out.mix = 1 - smooth((p - 0.55) / 0.45);
};
// распад: блок белеет, съёживается и улетает по ветру
const dissolveAnim = (b: BlockInst, p: number, out: BlockAnim) => {
	const h = hash3(b.x, b.y, b.z, 6);
	const fly = smooth((p - 0.3) / 0.7);
	out.mix = clamp01(p * 3.2);
	out.s = 1 - fly * 0.86 - (p >= 1 ? 1 : 0);
	out.x = WIND[0] * fly * fly * (0.5 + h);
	out.y = WIND[1] * fly * fly * 2 + Math.sin(p * 9 + h * 6) * 0.12 * fly;
	out.z = WIND[2] * fly * fly * (0.5 + h);
	out.rx = fly * (h * 5 - 2);
	out.rz = fly * (3 - h * 4);
	// перед отрывом блок чуть дрожит
	out.x += Math.sin(p * 60 + h * 9) * 0.03 * (1 - fly) * clamp01(p * 4);
};

// ---------- план 1 и 2: остров ----------
const IslandShot: React.FC<SceneProps> = ({t, cam, assets}) => {
	const island = getIsland();
	const max = island.bands.max;
	const env = envTrack(t, [
		[0, ENV.frostyMorning],
		[BEATS.shot2, ENV.day],
		[BEATS.snowTo, ENV.blizzard],
		[BEATS.dissolveTo - 0.6, ENV.blizzard],
		[BEATS.shot3, ENV.whiteout],
	]);
	const dissolving = t >= BEATS.dissolveFrom;
	const front = dissolving
		? lerp(max + 1, -SPAN, prog(t, BEATS.dissolveFrom, BEATS.dissolveTo - BEATS.dissolveFrom))
		: lerp(-1, max + SPAN + 1, easeInOutCubic(prog(t, BEATS.assembleFrom, BEATS.assembleTo - BEATS.assembleFrom)));
	const snowCover = prog(t, BEATS.snowFrom, BEATS.snowTo - BEATS.snowFrom);

	// снежинки из рассыпающихся блоков: каждый третий блок оболочки, момент — когда волна дошла до его полосы
	const flakes = useMemo(() => {
		const out: FlakeSource[] = [];
		const dur = BEATS.dissolveTo - BEATS.dissolveFrom;
		island.shell.forEach((list, band) => {
			const at = BEATS.dissolveFrom + ((max + 1 - band) / (max + 1 + SPAN)) * dur;
			list.forEach((blk, i) => {
				if (i % 3 === 0) out.push({pos: [blk.x + 0.5, blk.y + 0.5, blk.z + 0.5], at: at + hash3(blk.x, blk.y, blk.z, 7) * 0.5});
			});
		});
		return out;
	}, [island, max]);

	// герой: стоит в центре, пьёт зелье; во втором плане бежит по кругу
	const path = useMemo(
		() =>
			makePath(
				[
					{t: 4.2, pos: [0, 0, 0]},
					{t: 5.2, pos: [3, 0, 2]},
					{t: 6.0, pos: [2, 0, 5]},
					{t: 6.8, pos: [-2, 0, 4]},
					{t: 7.6, pos: [-1, 0, 0.5]},
				],
				{stride: 1.5},
			),
		[],
	);
	const st = path.at(t);
	const gy = island.ground(st.position[0], st.position[2]);
	const hero: Vec3 = [st.position[0], gy, st.position[2]];
	const drinkK = prog(t, 2.6, 1.2);
	let pose = mixPose(idle(t), wave(t), smooth(prog(t, 1.4, 0.2)) * (1 - smooth(prog(t, 2.3, 0.2))));
	pose = mixPose(pose, drink(drinkK), drinkK > 0 && drinkK < 1 ? 1 : 0);
	pose = mixPose(pose, run(st.phase), st.moving);
	if (t > 7.4) pose = mixPose(pose, scared(t), prog(t, 7.4, 0.2));
	const yaw = t < BEATS.shot2 ? cam.azimuth - 0.2 : st.heading;
	const heroOn = t > 0.9 && t < BEATS.dissolveTo + 0.05;
	const heroScale = easeOutBack(prog(t, 0.9, 0.3));
	const potion = t > 2.2 && t < 4;

	const pigPos: Vec3 = [5 + Math.sin(t * 0.8) * 1.2, island.ground(5, -1), -1 + Math.cos(t * 0.8) * 1.2];
	const [hx, hy, hz] = island.house;

	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<BandWave
				meshes={island.meshes}
				shell={island.shell}
				mode={dissolving ? 'dissolve' : 'assemble'}
				front={front}
				span={SPAN}
				animate={dissolving ? dissolveAnim : assembleAnim}
				tint={env.tint}
				snowCover={snowCover}
				mixColor="#ffffff"
			/>
			{dissolving ? <FlakeStream t={t} sources={flakes} wind={WIND} life={1.8} size={0.16} /> : null}
			<Snowfall
				t={t}
				center={[cam.position.x, cam.position.y, cam.position.z]}
				count={3000}
				box={[50, 30, 50]}
				density={0.25 + 0.75 * prog(t, BEATS.shot2, 1.2)}
				wind={[1 + 8 * prog(t, BEATS.shot2, 1.5), -3.2, 0.5 + 2 * prog(t, BEATS.shot2, 1.5)]}
			/>

			{heroOn ? (
				<>
					<BlobShadow x={hero[0]} z={hero[2]} y={hero[1]} />
					<Player
						skin={assets.skin}
						position={hero}
						rotationY={yaw}
						pose={pose}
						scale={heroScale}
						lean={[0, 0]}
						handR={potion ? <PixelItem art={potionArt(SPEED_POTION)} held /> : undefined}
					/>
					<NameTag text="1DEX1" position={headTop(hero)} cam={cam} opacity={heroScale} />
					<PotionSwirl t={t} center={hero} amount={smooth(prog(t, 3.4, 0.3)) * (1 - prog(t, 5.2, 0.6))} />
					<Trail t={t} from={4.3} to={7.5} rate={40} origin={(time) => { const s = path.at(time); return [s.position[0], island.ground(s.position[0], s.position[2]) + 0.1, s.position[2]]; }} colors={['#ffffff', '#e6eef6', '#cfd9e4']} />
				</>
			) : null}

			{t > 1.6 && t < 7 ? (
				<>
					<Pig position={pigPos} rotationY={t * 0.8 + Math.PI / 2} legSwing={t * 9} headYaw={Math.sin(t * 1.3) * 0.3} whiten={prog(t, 6.2, 0.6)} scale={(1 - prog(t, 6.6, 0.3)) * easeOutBack(prog(t, 1.6, 0.3))} />
					<Poof t={t} at={6.85} origin={[pigPos[0], pigPos[1] + 0.5, pigPos[2]]} />
				</>
			) : null}

			{t > 3 && t < 6.2 ? (
				<>
					<Torch position={[hx + 2.5 + 1, hy + 1.2, hz + 3 + 0.5 + 0.5]} t={t} wall={[0, 1]} lit={1 - prog(t, 5.5, 0.3)} />
					<Lantern position={[hx + 6.5, hy + 1, hz + 1.5]} t={t} />
				</>
			) : null}

			{/* объёмная надпись в мире + экранный 3D-слой */}
			<VoxelText text="ДЕМО ЯДРА" t={t} px={0.5} top="#ffffff" bottom="#9fd0ff" body="#1b3a6e" appearAt={BEATS.title} exitAt={3.4} position={[0, 17, 0]} rotation={[0, cam.azimuth, 0]} />
			<HudLayer cam={cam}>
				<VoxelText text="21 НОЯБРЯ · 13:00 МСК" t={t} px={7} top="#ffffff" bottom="#ffd86b" body="#5a2408" appearAt={4.6} exitAt={6.2} position={[0, -300, 0]} rotation={[0.05, 0, 0]} />
				<ExtrudedLogo texture={assets.holyworld} height={150} position={[760, 380, 0]} rotation={[Math.sin(t * 0.8) * 0.12, Math.sin(t * 1.1) * 0.42, 0]} scale={easeOutBack(prog(t, 0.6, 0.4)) * (1 - prog(t, 3.5, 0.3))} />
			</HudLayer>
		</>
	);
};

// ---------- план 3: подземелье ----------

const DungeonShot: React.FC<SceneProps> = ({t, cam, assets}) => {
	const d = getDungeon();
	const ts = t - BEATS.shot3;
	const env = ENV.dungeon;
	const keys = clamp01((t - BEATS.keyFly) / 0.5) * 3;
	const lid = easeOutBack(prog(t, BEATS.lidOpen, 0.5), 1.1);
	const glow = prog(t, BEATS.lidOpen, 0.4);
	const rise = easeOutCubic(prog(t, BEATS.lidOpen + 0.2, 0.8));
	const vault: Vec3 = [0.5, 1, 0.5];

	// маленькая ёлка в углу — проверка гирлянды
	const tree = useMemo(() => {
		const w = new VoxelWorld([4, 0, -6], [8, 8, -2]);
		const info = newYearTree(w, 6, 0, -4, {height: 6, radius: 2, snowy: false});
		return {meshes: buildVoxelMeshes(w, {ambient: 0.5}), info};
	}, []);

	const swingK = (ts * 0.9) % 1;
	const hero: Vec3 = [-3.2, 0, -1.4];
	const griefer: Vec3 = [3.4, 0, -1.2];
	const zombie: Vec3 = [-4.6 + Math.sin(ts) * 0.4, 0, 3.6];
	const skeleton: Vec3 = [4.5, 0, 0.6];
	const breeze: Vec3 = [-0.5, 0, 4.2];
	const hurt = impulse(t, BEATS.shock, 5);

	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={d.meshes} tint={env.tint} />
			<VoxelMesh meshes={tree.meshes} />
			<TreeLights lights={tree.info.lights} star={tree.info.star} t={t} glow={0.7} />
			<WaterSurface t={t} x0={3} z0={2} x1={5} z1={4} y={-0.12} tint="#9fd8ff" />
			<CopperGate position={[-1, 0, DUNGEON.z1 + 1]} width={3} height={3} open={easeInOutCubic(prog(t, BEATS.gate, 1.2))} />
			{d.lights.slice(0, 4).map((l, i) => (
				<Torch key={i} position={[l.pos[0], l.pos[1] - 0.6, l.pos[2]]} t={t} seed={i} glow={0.8} />
			))}
			<Lantern position={[0.5, DUNGEON.h, 0.5]} t={t} hanging={1.2} />

			<TrialSpawner position={[-4.5, 0, 0.5]} t={t} active={prog(t, BEATS.spawner, 0.6)} />
			<Vault position={vault} t={t} lid={lid} keys={keys} glow={glow} rotationY={Math.PI} />
			<LightBeam position={[0.5, 1.6, 0.5]} height={4.2} width={0.7} amount={glow * (1 - prog(t, 11.4, 0.5))} t={t} />
			<Sparkles t={t} center={[0.5, 2.6, 0.5]} box={[2, 2.4, 2]} amount={glow} count={40} />
			{/* три ключа кружат и влетают в скважины */}
			{[0, 1, 2].map((i) => {
				const k = clamp01((t - BEATS.keyFly + 0.6 - i * 0.12) / 0.7);
				const a = ts * 4 + (i * Math.PI * 2) / 3;
				const orbit: Vec3 = [0.5 + Math.cos(a) * 1.6, 2.2 + Math.sin(ts * 3 + i) * 0.2, 0.5 + Math.sin(a) * 1.6];
				const slot: Vec3 = [0.5 - (i - 1) * 0.22, 1.28, 0.5 - 0.5];
				const e = easeInOutCubic(k);
				return k < 1 ? (
					<PixelItem key={i} art="trialKey" size={0.55} position={[lerp(orbit[0], slot[0], e), lerp(orbit[1], slot[1], e), lerp(orbit[2], slot[2], e)]} rotation={[0, a + Math.PI / 2, 0]} glow={0.6} />
				) : null;
			})}
			{/* награда: булава и книга поднимаются из сундука */}
			<PixelItem art="mace" size={1.1} position={[0.5 - 0.5 * rise, 1.6 + rise * 1.3, 0.5]} rotation={[0, ts * 2, 0]} scale={rise} glow={0.5} />
			<PixelItem art="enchantedBook" size={0.8} position={[0.5 + 0.7 * rise, 1.6 + rise * 1.1, 0.5]} rotation={[0, -ts * 1.6, 0]} scale={rise} glint={t} glow={0.4} />

			{/* персонажи */}
			<BlobShadow x={hero[0]} z={hero[2]} opacity={0.4} />
			<Player skin={assets.skin} position={hero} rotationY={0.9} pose={swing(swingK)} handR={<PixelItem art="diamondSword" held />} hurt={hurt} />
			{/* послеобразы скорости */}
			{[1, 2].map((i) => (
				<Player key={i} skin={assets.skin} position={[hero[0] - i * 0.35, 0, hero[2] - i * 0.3]} rotationY={0.9} pose={swing((swingK + 1 - i * 0.06) % 1)} opacity={0.3 / i} />
			))}
			<NameTag text="1DEX1" position={headTop(hero)} cam={cam} />

			<Humanoid skin={getSkin('griefer')} position={griefer} rotationY={-0.9} pose={ts < 2 ? smash(clamp01((ts - 1.5) / 0.3)) : cheer(t)} handR={<PixelItem art="mace" held />} frozen={prog(t, 11, 0.5)} />
			<NameTag text="GRIEFER" position={headTop(griefer)} cam={cam} color="#ff4a3c" />
			<Humanoid skin={getSkin('zombie')} position={zombie} rotationY={2.2} pose={zombieArms(ts * 5)} />
			<Humanoid skin={getSkin('skeleton')} position={skeleton} rotationY={-1.9} pose={aimBow()} handL={<PixelItem art="bow" held />} />
			<Breeze position={breeze} t={t} rotationY={Math.PI} charge={0.5 + 0.5 * Math.sin(ts * 2)} dissolve={prog(t, 11.2, 0.6)} />

			{/* эффекты */}
			<Shockwave t={t} at={BEATS.shock} origin={[griefer[0], 0, griefer[2] + 1]} radius={3} debris={['#7fe0c8', '#c9783f', '#e8f4ff']} />
			<Poof t={t} at={10.3} origin={[zombie[0], 1, zombie[2]]} />
			<PortalParticles t={t} at={BEATS.teleport} origin={skeleton} mode="in" />
			<Firework t={t} at={BEATS.firework} origin={[0.5, 4.4, 3]} colors={['#ffb02e', '#ff6a1f', '#fff1a8']} size={0.22} count={60} />
			<Burst t={t} at={BEATS.shock} origin={[griefer[0], 0.2, griefer[2] + 1]} count={30} seed={9} colors={['#bfe8ff', '#ffffff']} speed={[2, 6]} shape="cone" dir={[0, 1, 0.3]} angle={0.5} life={[0.4, 0.8]} />
			<InstancedBlocks
				blocks={ICE}
				mixColor="#9fd4ff"
				animate={(b, _i, out) => {
					// ледяные шипы вырастают волной от центра
					const k = easeOutBack(prog(t, BEATS.shock + 0.05 + Math.hypot(b.x - 2, b.z + 1) * 0.08, 0.25));
					out.s = k;
					out.y = -(1 - k) * 0.5;
					out.mix = 0.25;
				}}
			/>
			<Glow position={[0.5, 2.2, 0.5]} color="#ffd060" size={5} opacity={0.35 * glow} />
		</>
	);
};

// ледяные блоки вокруг точки удара
const ICE: BlockInst[] = [
	{x: 2, y: 0, z: -1, id: B.ice},
	{x: 3, y: 0, z: 0, id: B.packedIce},
	{x: 1, y: 0, z: 0, id: B.blueIce},
	{x: 3, y: 0, z: -2, id: B.blueIce},
	{x: 2, y: 1, z: -1, id: B.ice},
];

// ---------- план 4: ночной парад ----------
const ParadeShot: React.FC<SceneProps> = ({t, cam, assets}) => {
	const ts = t - BEATS.shot4;
	const env = ENV.night;
	const set = useMemo(() => {
		const w = new VoxelWorld([-14, -2, -12], [14, 16, 8]);
		w.heightmap((x, z) => (z < -4 ? 0 : -1) + (Math.hypot(x, z + 8) < 3 ? 0 : 0), {block: (_x, y, _z, top) => (y === top ? B.snow : B.stoneBricks)});
		const tree = newYearTree(w, 0, 1, -8, {height: 11, radius: 4});
		for (const x of [-9, 9]) {
			w.fill(x - 1, 1, -9, x + 1, 5, -7, B.stoneBricks);
			w.set(x, 3, -6, B.windowLit).set(x, 2, -6, B.stoneBricks).set(x, 4, -6, B.stoneBricks);
			w.fill(x - 1, 6, -9, x + 1, 6, -7, B.stoneBrickSlab);
			w.set(x - 1, 6, -6, B.redWool).set(x + 1, 6, -6, B.blueWool);
		}
		// ночной свет запечён: синеватый общий + тёплые окна и гирлянда
		const lights = [
			...[-9, 9].map((x) => ({pos: [x + 0.5, 3.5, -5.2] as Vec3, radius: 7, color: '#ffc46a', intensity: 1.2})),
			{pos: [0.5, 5, -5.5] as Vec3, radius: 10, color: '#ffd9a0', intensity: 0.7},
		];
		return {meshes: buildVoxelMeshes(w, {ambient: 0.42, ambientColor: '#8d9cff', lights, cull: {bottom: true}}), tree};
	}, []);
	const hero = imageHero(assets);
	const k = (ts * 0.7) % 1;
	const actors: {x: number; node: (pos: Vec3) => React.ReactNode; name?: string; color?: string}[] = [
		{x: -6, name: 'ЗЕЛЬЕ', node: (pos) => <Player skin={hero} position={pos} pose={drink(k)} handR={<PixelItem art={potionArt(SPEED_POTION)} held />} />},
		{x: -4, name: 'СНЕЖОК', node: (pos) => <Player skin={hero} position={pos} pose={throwing(k)} handR={k < 0.5 ? <PixelItem art="snowball" held /> : undefined} />},
		{x: -2, name: 'БУЛАВА', node: (pos) => <Player skin={hero} position={pos} pose={mixPose(shoulder(t), smash(clamp01((k - 0.5) / 0.25)), k > 0.4 ? 1 : 0)} handR={<PixelItem art="mace" held />} />},
		{x: 0, name: '1DEX1', node: (pos) => <Player skin={hero} position={pos} pose={hold()} handR={<PixelItem art="enderPearl" held />} handL={<PixelItem art="trialKey" held />} />},
		{x: 2, name: 'GRIEFER', color: '#ff4a3c', node: (pos) => <Humanoid skin={getSkin('griefer')} position={pos} pose={lookAround(t, k)} handR={<PixelItem art="ironSword" held />} />},
		{x: 4, name: 'ЗОМБИ', node: (pos) => <Humanoid skin={getSkin('zombie')} position={pos} pose={zombieArms(ts * 5)} />},
		{x: 6, name: 'СКЕЛЕТ', node: (pos) => <Humanoid skin={getSkin('skeleton')} position={pos} pose={aimBow()} handL={<PixelItem art="bow" held />} />},
	];
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint="#ffffff" />
			<TreeLights lights={set.tree.lights} star={set.tree.star} t={t} />
			<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={900} density={0.5} wind={[0.4, -1.6, 0.2]} />
			{actors.map((a) => {
				const pos: Vec3 = [a.x + 0.5, 0, 0.5];
				return (
					<React.Fragment key={a.x}>
						<BlobShadow x={pos[0]} z={pos[2]} opacity={0.35} />
						{a.node(pos)}
						{a.name ? <NameTag text={a.name} position={headTop(pos)} cam={cam} color={a.color} /> : null}
					</React.Fragment>
				);
			})}
			<Pig position={[8.6, 0, 1]} rotationY={-0.6} headYaw={Math.sin(t * 2) * 0.4} />
			<Breeze position={[-8.4, 0, 0.5]} t={t} rotationY={0.5} charge={0.5 + 0.5 * Math.sin(ts * 3)} />
			<TrialSpawner position={[-10.5, 0, -2.5]} t={t} active={prog(ts, 1, 1)} />
			<Vault position={[10.5, 0, -2.5]} t={t} lid={smooth(prog(ts, 1, 0.8))} keys={ts * 1.5} glow={prog(ts, 1, 0.8)} />
			<Lantern position={[-3.5, 0, -3.5]} t={t} />
			<Torch position={[3.5, 0, -3.5]} t={t} />
			<Firework t={t} at={BEATS.salute1} origin={[-7, 15, -16]} colors={['#ff5a5a', '#ffd0d0', '#ffffff']} seed={1} />
			<Firework t={t} at={BEATS.salute2} origin={[8, 17, -18]} colors={['#35c6f0', '#9eeaff', '#ffffff']} seed={2} />
		</>
	);
};

const imageHero = (assets: SceneProps['assets']) => assets.skin;

const World: React.FC<SceneProps> = (props) => {
	const {index} = shotAt(SHOTS, props.t);
	return index < 2 ? <IslandShot {...props} /> : index === 2 ? <DungeonShot {...props} /> : <ParadeShot {...props} />;
};

// ---------- плоский интерфейс ----------
const CANON = ['21 НОЯБРЯ · 13:00 МСК', 'УРОН БУЛАВЫ −50%', 'ТГК: ЖИЗНЬ 1DEX1', 'СКОРОСТЬ III — УДАЛЕНО', 'ОБНОВЛЁННЫЙ ЗАМОК · mc.holyworld.ru'];

const Overlay: React.FC<SceneProps> = ({t, cam}) => {
	const {index} = shotAt(SHOTS, t);
	const hp = t < 6 ? 10 : 5;
	return (
		<>
			{index === 0 ? (
				<>
					<Caption t={t} from={BEATS.title} to={3.8} x={960} y={930} size={80} color="#ffffff" color2="#9fd0ff">
						НОВАЯ ГЕНЕРАЦИЯ МИРА
					</Caption>
					{CANON.map((line, i) => (
						<Caption key={line} t={t} from={0.5 + i * 0.15} to={3.6} x={1840} y={420 + i * 62} align="right" size={40} color={i % 2 ? '#ffe95a' : '#bfe8ff'}>
							{line}
						</Caption>
					))}
					<WorldLabel cam={cam} at={[0, 3.2, 0]} dy={-70}>
						<Caption t={t} from={2.4} to={3.9} x={0} y={0} size={50} color={SPEED_POTION}>
							СКОРОСТЬ III
						</Caption>
					</WorldLabel>
				</>
			) : null}
			{index === 1 ? (
				<>
					<Vignette amount={0.5 * prog(t, 4.4, 1)} color="#eaf4ff" />
					<SpeedLines t={t} amount={0.8 * prog(t, 4.6, 0.4) * (1 - prog(t, 6.2, 0.4))} />
					<Letterbox amount={prog(t, 4.2, 0.5) * (1 - prog(t, 7.2, 0.4))} />
					<Countdown label="ДО ВАЙПА" remaining={Math.max(0, 10 - (t - BEATS.countdownFrom) * 3)} urgent={prog(t, 6.4, 0.8)} y={210} />
					<Hearts value={hp} t={t} shake={impulse(t, 6, 5)} flash={impulse(t, 6, 8)} />
					<Stamp t={t} at={BEATS.stamp} strikeAt={BEATS.stamp + 0.35} x={960} y={520} size={90} color="#ffffff">
						СКОРОСТЬ III
					</Stamp>
					<Caption t={t} from={BEATS.stamp + 0.5} to={7.7} x={960} y={640} size={50} color="#ffe95a">
						МАКСИМУМ — СКОРОСТЬ II
					</Caption>
					<Fade color="#ffffff" opacity={fadeTo(t, BEATS.shot3, 0.4)} />
				</>
			) : null}
			{index === 2 ? (
				<>
					<Vignette amount={0.45} />
					<Caption t={t} from={8.3} to={11.6} x={960} y={150} size={70} color="#ffe2b0" color2="#ff9a4a">
						МЕДНОЕ ПОДЗЕМЕЛЬЕ
					</Caption>
					<ItemIcon art="trialKey" x={150} y={930} size={96} scale={easeOutBack(prog(t, 9.2, 0.3))} />
					<Caption t={t} from={9.2} to={11.6} x={220} y={934} align="left" size={60} color="#ffb347">
						КЛЮЧ 3/3
					</Caption>
					<Counter value={lerp(12, 100, easeOutCubic(prog(t, 9.4, 1.6)))} suffix=" БЛОКОВ" x={1780} y={934} align="right" size={60} color="#d9a6ff" pop={impulse(t, 11, 8)} />
					<CooldownClock x={1720} y={800} size={110} progress={prog(t, 9, 3)} />
					{(['mace', 'enchantedBook', 'snowball', 'enderPearl', 'ironSword', 'bow', 'arrow', 'fireworkRocket', 'diamond', 'goldIngot', 'emptyBottle'] as const).map((a, i) => (
						<ItemIcon key={a} art={a} x={640 + i * 64} y={1010} size={52} />
					))}
					<SansText x={960} y={1010 - 56} size={30} color="#9fb2c4" weight={500}>
						ItemIcon: тот же рисунок, что и у 3D-предметов (это SansText)
					</SansText>
					<Flash t={t} at={BEATS.firework} color="#fff1a8" peak={0.35} />
					<Fade color="#ffffff" opacity={fadeFrom(t - BEATS.shot3, 0.4)} />
					<Fade opacity={fadeTo(t, BEATS.shot4, 0.3)} />
				</>
			) : null}
			{index === 3 ? (
				<>
					<Caption t={t} from={BEATS.shot4 + 0.3} to={BEATS.end - 0.2} x={960} y={150} size={70} color="#ffffff" color2="#ffd86b">
						ПЕРСОНАЖИ И ПРЕДМЕТЫ
					</Caption>
					<Flash t={t} at={BEATS.salute1} color="#ff8a8a" peak={0.2} />
					<Flash t={t} at={BEATS.salute2} color="#8ad8ff" peak={0.2} />
					<Fade opacity={fadeFrom(t - BEATS.shot4, 0.3) + fadeTo(t, BEATS.end, 0.4)} />
				</>
			) : null}
		</>
	);
};

export const scene: SceneDef = {id: 'demo', duration: BEATS.end, camera, World, Overlay};
