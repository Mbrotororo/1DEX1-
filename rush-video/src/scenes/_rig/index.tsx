import React from 'react';
import {
	B,
	BlobShadow,
	ENV,
	Environment,
	Humanoid,
	PixelText,
	VoxelMesh,
	VoxelWorld,
	autoBlink,
	blinkAt,
	buildVoxelMeshes,
	clamp01,
	diveArc,
	diveIntoChair,
	doorShove,
	flingHat,
	handAnchor,
	headphonesLift,
	headphonesOn,
	hurlBackpack,
	idle,
	lerp,
	flyCam,
	lookCam,
	lookUp,
	mixFace,
	mixPose,
	once,
	projectToScreen,
	prog,
	shockPose,
	sigh,
	sit,
	sitCheer,
	sitIdle,
	sitMouse,
	sitReach,
	sitTyping,
	sitWave,
	slump,
	smooth,
	sprint,
	sprintStairs,
	tiredWalk,
	withPose,
	worldPoint,
	type CameraState,
	type FaceState,
	type Pose,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {BEATS} from './beats';

// Галерея риггинга героя (id 'rig', в ролик не входит):
// 0–9 — мимика крупно и средним планом, 9–21 — новые позы (4 страницы по 3 с),
// 21–29 — посадка за компьютер: прыжок в кресло → печатает → кнопка ПК → наушники → машет.
// Смотреть: npm run shots -- --scene=rig --sheet --step=0.5

const FLOOR = 1;
const SEAT = 0.52; // высота верха сиденья над полом
const DESK = SEAT + 0.36; // верх стола над полом

// ---------- комната ----------
const getSet = once(() => {
	const w = new VoxelWorld([-14, -1, -10], [13, 7, 9]);
	for (let x = -14; x <= 13; x++) for (let z = -10; z <= 9; z++) w.set(x, 0, z, B.darkPlanks);
	// задняя стена: книжные полки и доски; боковые стены — чтобы за героем не было пустоты
	for (let x = -14; x <= 13; x++) {
		for (let y = 1; y <= 6; y++) w.set(x, y, -5, y <= 3 && x % 5 !== 0 ? B.bookshelf : B.sprucePlanks);
	}
	for (const x of [-7, 7]) {
		for (let z = -4; z <= 9; z++) for (let y = 1; y <= 6; y++) w.set(x, y, z, y <= 3 && z % 4 !== 0 ? B.bookshelf : B.sprucePlanks);
	}
	const lights = [
		{pos: [-6, 4, -3] as Vec3, radius: 11, color: '#ffae5a'},
		{pos: [6, 4, -3] as Vec3, radius: 11, color: '#ffae5a'},
		{pos: [0, 5, 3] as Vec3, radius: 12, color: '#ffc27a'},
	];
	return {meshes: buildVoxelMeshes(w, {ambient: 0.4, ambientColor: '#a88a70', lights, cull: {bottom: true}})};
});

// ---------- простые заглушки реквизита (только для галереи) ----------
const Box: React.FC<{p: Vec3; s: Vec3; c: string; r?: Vec3}> = ({p, s, c, r}) => (
	<mesh position={p} rotation={r}>
		<boxGeometry args={s} />
		<meshLambertMaterial color={c} />
	</mesh>
);

// кресло: верх сиденья — y = SEAT над полом, центр — под бёдрами героя
const Chair: React.FC<{p: Vec3; rot?: number}> = ({p, rot = 0}) => (
	<group position={p} rotation={[0, rot, 0]}>
		<Box p={[0, SEAT - 0.05, -0.04]} s={[0.78, 0.1, 0.72]} c="#3a2a4e" />
		<Box p={[0, SEAT + 0.42, -0.42]} s={[0.74, 0.86, 0.1]} c="#4a3462" />
		<Box p={[0, (SEAT - 0.1) / 2, -0.04]} s={[0.08, SEAT - 0.1, 0.08]} c="#202020" />
		<Box p={[0, 0.03, -0.04]} s={[0.7, 0.06, 0.1]} c="#202020" />
		<Box p={[0, 0.03, -0.04]} s={[0.1, 0.06, 0.7]} c="#202020" />
	</group>
);

// стол: передний край — 0.3 перед героем, верх — DESK
const Desk: React.FC<{p: Vec3; full?: boolean}> = ({p, full}) => (
	<group position={p}>
		<Box p={[0, DESK - 0.04, 0.68]} s={[1.7, 0.08, 0.76]} c="#6b4a2c" />
		<Box p={[0.04, DESK + 0.015, 0.5]} s={[0.56, 0.03, 0.18]} c="#1c1c22" />
		<Box p={[-0.44, DESK + 0.02, 0.49]} s={[0.1, 0.04, 0.15]} c="#26262c" />
		{full ? (
			<>
				<Box p={[0.78, (DESK - 0.08) / 2, 0.68]} s={[0.08, DESK - 0.08, 0.7]} c="#5a3d24" />
				<Box p={[0.02, DESK + 0.42, 0.95]} s={[0.95, 0.56, 0.05]} c="#101016" />
				<Box p={[0.02, DESK + 0.42, 0.92]} s={[0.88, 0.49, 0.01]} c="#2a4f8a" />
				<Box p={[0.02, DESK + 0.08, 0.97]} s={[0.08, 0.16, 0.06]} c="#101016" />
			</>
		) : null}
	</group>
);

// корпус ПК справа под столом; кнопка — там, куда дотягивается sitReach(0.5)
const BUTTON = handAnchor(sitReach(0.5), 'R');
const Tower: React.FC<{p: Vec3; on: number}> = ({p, on}) => (
	<group position={p}>
		<Box p={[BUTTON[0] - 0.08, (BUTTON[1] + SEAT + 0.12) / 2, BUTTON[2] + 0.36]} s={[0.36, BUTTON[1] + SEAT + 0.12, 0.6]} c="#1a1a20" />
		<Box p={[BUTTON[0] - 0.08, BUTTON[1] + SEAT, BUTTON[2] + 0.055]} s={[0.07, 0.07, 0.02]} c={on > 0 ? '#5cf0ff' : '#5a5a66'} />
	</group>
);

const Hat: React.FC = () => (
	<group>
		<Box p={[0, 0.06, 0]} s={[0.55, 0.2, 0.55]} c="#2f5d9a" />
		<Box p={[0, -0.03, 0]} s={[0.58, 0.08, 0.58]} c="#e8e8e8" />
		<Box p={[0, 0.22, 0]} s={[0.14, 0.12, 0.14]} c="#e8e8e8" />
	</group>
);

const Pack: React.FC = () => (
	<group>
		<Box p={[0, 0, -0.12]} s={[0.44, 0.52, 0.22]} c="#3d6b3a" />
		<Box p={[0, -0.08, -0.25]} s={[0.32, 0.24, 0.06]} c="#335c31" />
	</group>
);

const Phones: React.FC = () => (
	<group>
		<Box p={[0, 0.27, 0]} s={[0.56, 0.06, 0.1]} c="#1e1e24" />
		<Box p={[-0.27, 0.12, 0]} s={[0.06, 0.24, 0.08]} c="#1e1e24" />
		<Box p={[0.27, 0.12, 0]} s={[0.06, 0.24, 0.08]} c="#1e1e24" />
		<Box p={[-0.29, 0, 0]} s={[0.08, 0.2, 0.18]} c="#7a3cff" />
		<Box p={[0.29, 0, 0]} s={[0.08, 0.2, 0.18]} c="#7a3cff" />
	</group>
);

// ---------- 0–9: лицо ----------
type FaceKey = {t: number; name: string; f: Partial<FaceState>};
const FACES: FaceKey[] = [
	{t: 0, name: 'обычное', f: {}},
	{t: 1.0, name: 'устал', f: {tired: 1}},
	{t: 2.3, name: 'шок', f: {shock: 1}},
	{t: 3.5, name: 'решимость', f: {focus: 1}},
	{t: 4.7, name: 'радость', f: {joy: 1}},
	{t: 5.4, name: 'радость + рот', f: {joy: 1, mouth: 1}},
	{t: 5.9, name: 'взгляд', f: {}},
];
const faceAt = (t: number): {f: FaceState; name: string} => {
	let i = 0;
	while (i + 1 < FACES.length && t >= FACES[i + 1].t) i++;
	const prev = i > 0 ? FACES[i - 1].f : {};
	const cur = FACES[i];
	let f = mixFace(prev, cur.f, smooth((t - cur.t) / (cur.name === 'шок' ? 0.08 : 0.25)));
	// моргания: обычное, усталое (медленное)
	f = {...f, blink: Math.max(blinkAt(t, 0.55), blinkAt(t, 1.9, 0.4), blinkAt(t, 4.2))};
	if (cur.name === 'взгляд') {
		const q = (t - cur.t) / 0.7;
		f = {...f, lookX: Math.sin(q * Math.PI * 1.5) , lookY: Math.cos(q * Math.PI) * 0.6};
	}
	if (cur.name === 'шок') f = {...f, lookX: Math.sin((t - cur.t) * 9) * 0.35};
	return {f, name: cur.name};
};
// средний план: усталость → шок → решимость → радость по кругу
const mediumFace = (t: number): Partial<FaceState> => {
	const q = (t - BEATS.medium) / BEATS.mediumStep;
	const seq: Partial<FaceState>[] = [{tired: 1}, {shock: 1}, {focus: 1}, {joy: 1, mouth: 0.6}];
	const i = Math.max(0, Math.min(seq.length - 1, Math.floor(q)));
	return {...seq[i], blink: autoBlink(t, 3, 1.1)};
};

// ---------- 9–21: страницы поз ----------
type Slot = {
	name: string;
	pose: (ts: number, k: number) => Pose;
	face?: (ts: number, k: number) => Partial<FaceState>;
	chair?: boolean;
	desk?: boolean;
	// покачивается ±45° / полный оборот (виден рюкзак на спине)
	spin?: boolean;
	turn?: boolean;
};
const P = BEATS.page;
const kOf = (ts: number) => clamp01((ts - 0.25) / (P - 0.6));
const PAGES: Slot[][] = [
	[
		{name: 'tiredWalk', pose: (ts) => tiredWalk(ts * 5), face: (ts) => ({tired: 1, blink: autoBlink(ts, 2)}), turn: true},
		{name: 'slump', pose: (ts) => slump(ts), face: () => ({tired: 0.8}), turn: true},
		{name: 'sigh', pose: (ts, k) => mixPose(slump(ts), sigh(k), smooth(k * 8)), face: (_ts, k) => ({tired: 1, mouth: Math.sin(clamp01((k - 0.45) / 0.4) * Math.PI) * 0.5})},
		{name: 'lookUp', pose: (_ts, k) => lookUp(k), face: (_ts, k) => ({tired: 1 - k * 0.6, lookY: k})},
		{name: 'shockPose', pose: (_ts, k) => shockPose(k), face: (_ts, k) => ({shock: smooth(k * 10)})},
	],
	[
		{name: 'flingHat', pose: (_ts, k) => flingHat(k), face: () => ({focus: 0.8})},
		{name: 'hurlBackpack', pose: (_ts, k) => hurlBackpack(k), face: () => ({focus: 1})},
		{name: 'diveIntoChair', pose: (_ts, k) => diveIntoChair(k), chair: true},
		{name: 'doorShove', pose: (ts, k) => doorShove(k, sprint(ts * 12)), face: () => ({focus: 1})},
		{name: 'sprintStairs', pose: (ts) => sprintStairs(ts * 12), face: () => ({focus: 0.6}), spin: true},
	],
	[
		{name: 'sitIdle', pose: (ts) => sitIdle(ts), chair: true, spin: true},
		{name: 'sitTyping', pose: (ts) => sitTyping(ts), chair: true, desk: true, face: () => ({focus: 0.6})},
		{name: 'sitMouse', pose: (ts) => sitMouse(ts, [0.8, 1.6, 1.8]), chair: true, desk: true},
		{name: 'sitReach', pose: (_ts, k) => sitReach(k), chair: true},
		{name: 'headphonesOn', pose: (_ts, k) => headphonesOn(k), chair: true},
	],
	[
		{name: 'sitCheer', pose: (ts) => sitCheer(ts, 0.4), chair: true, face: () => ({joy: 1, mouth: 0.7})},
		{name: 'sitWave', pose: (ts) => sitWave(ts, 0.4), chair: true, face: () => ({joy: 1})},
		{name: 'slump + tired', pose: (ts) => slump(ts), face: (ts) => ({tired: 1, blink: autoBlink(ts, 5, 1.2)})},
		{name: 'shock (лицо)', pose: (_ts, k) => shockPose(k), face: (ts) => ({shock: 1, lookX: Math.sin(ts * 7) * 0.5})},
		{name: 'joy (лицо)', pose: (ts) => sitIdle(ts), chair: true, face: () => ({joy: 1, mouth: 0.6})},
	],
];
const SLOT_X = [-3.2, -1.6, 0, 1.6, 3.2];
const pageAt = (t: number) => {
	const i = Math.min(PAGES.length - 1, Math.max(0, Math.floor((t - BEATS.posesFrom) / P)));
	return {i, ts: t - BEATS.posesFrom - i * P};
};

// шапка/рюкзак в позах броска: где они сейчас
const throwState = (k: number, grab: number, release: number) => (k < grab ? 'body' : k < release ? 'hand' : 'free');

// ---------- 21–29: посадка ----------
const SEQ_FROM: Vec3 = [1.45, FLOOR, -0.15];
const SEQ_SEAT: Vec3 = [0, FLOOR + SEAT, 0];
const seqPose = (t: number): {pose: Pose; face: Partial<FaceState>; pos: Vec3; rot: number; name: string; phones: number} => {
	const kd = prog(t, BEATS.dive, 1.0);
	const blink = autoBlink(t, 9, 2.1);
	if (t < BEATS.typing) {
		const pos = diveArc(kd, SEQ_FROM, SEQ_SEAT, 0.65);
		// подбегает сбоку (лицом к −x), в полёте разворачивается к столу
		const rot = lerp(-Math.PI / 2, 0, smooth((kd - 0.15) / 0.55));
		return {pose: diveIntoChair(kd), face: {focus: 0.7, blink}, pos, rot, name: 'diveIntoChair', phones: 0};
	}
	const base = sitTyping(t);
	if (t < BEATS.reach) {
		return {pose: mixPose(sit(), base, smooth((t - BEATS.typing) / 0.3)), face: {focus: 1, blink}, pos: SEQ_SEAT, rot: 0, name: 'sitTyping', phones: 0};
	}
	if (t < BEATS.phones) {
		const k = prog(t, BEATS.reach, 1.1);
		return {pose: mixPose(base, sitReach(k), smooth(k * 6) * (1 - smooth((k - 0.85) * 6))), face: {focus: 0.6, lookY: -0.6, blink}, pos: SEQ_SEAT, rot: 0, name: 'sitReach', phones: 0};
	}
	if (t < BEATS.wave) {
		const k = prog(t, BEATS.phones, 1.2);
		return {pose: headphonesOn(k, base), face: {joy: smooth((k - 0.6) * 3) * 0.6, blink}, pos: SEQ_SEAT, rot: 0, name: 'headphonesOn', phones: k};
	}
	// кресло доворачивается к камере, корпус — ещё немного (turn у sitWave)
	const turn = smooth((t - BEATS.wave) / 0.6);
	return {
		pose: mixPose(base, sitWave(t, 0.5), turn),
		face: {joy: 1, mouth: 0.5, blink},
		pos: SEQ_SEAT,
		rot: turn * 0.6,
		name: 'sitWave',
		phones: 1,
	};
};

// ---------- камера ----------
const HEAD: Vec3 = [0, FLOOR + 1.64, 0];
const camera = (t: number): CameraState => {
	if (t < BEATS.medium) {
		// экстремально крупно: лицо на весь кадр, медленно обходит от 3/4 до 3/4
		const az = lerp(-28, 30, smooth(t / BEATS.medium)) * (Math.PI / 180);
		const d = 1.25;
		return lookCam([HEAD[0] + Math.sin(az) * d, HEAD[1] - 0.06, HEAD[2] + Math.cos(az) * d], [HEAD[0], HEAD[1] - 0.09, HEAD[2]], 30);
	}
	if (t < BEATS.posesFrom) {
		return lookCam([1.1, FLOOR + 1.55, 2.9], [0, FLOOR + 1.25, 0], 34);
	}
	if (t < BEATS.seatFrom) {
		const {i, ts} = pageAt(t);
		const seated = i === 2;
		const az = (seated ? 14 : 0) + Math.sin(ts * 0.9) * 5;
		const el = seated ? 16 : 7;
		const d = 7.4;
		const a = (az * Math.PI) / 180;
		const e = (el * Math.PI) / 180;
		const target: Vec3 = [0, FLOOR + 0.85, 0];
		return lookCam([target[0] + Math.sin(a) * Math.cos(e) * d, target[1] + Math.sin(e) * d, target[2] + Math.cos(a) * Math.cos(e) * d], target, 38);
	}
	return seatCam(t);
};
// посадка: прыжок — спереди-справа; печатает — профиль справа; кнопка — профиль слева, ниже;
// наушники — 3/4 слева (мимо монитора); машет — в камеру, к которой он развернулся
const seatCam = flyCam([
	{t: BEATS.seatFrom, pos: [3.9, FLOOR + 2.0, 2.5], look: [0.6, FLOOR + 1.0, 0], fov: 44},
	{t: BEATS.dive + 0.9, pos: [3.6, FLOOR + 1.9, 2.2], look: [0.3, FLOOR + 1.05, 0.1], fov: 42},
	{t: BEATS.typing + 0.3, pos: [2.6, FLOOR + 1.75, 0.5], look: [0, FLOOR + 1.15, 0.4], fov: 42},
	{t: BEATS.reach - 0.25, pos: [2.5, FLOOR + 1.7, 0.5], look: [0, FLOOR + 1.12, 0.4], fov: 42},
	{t: BEATS.reach + 0.2, pos: [-2.5, FLOOR + 1.3, 0.22], look: [-0.2, FLOOR + 0.85, 0.42], fov: 44},
	{t: BEATS.phones - 0.2, pos: [-2.5, FLOOR + 1.35, 0.22], look: [-0.2, FLOOR + 0.9, 0.42], fov: 44},
	{t: BEATS.phones + 0.15, pos: [-1.9, FLOOR + 2.25, 2.0], look: [0, FLOOR + 1.55, 0], fov: 40},
	{t: BEATS.wave, pos: [-1.8, FLOOR + 2.2, 1.9], look: [0, FLOOR + 1.55, 0], fov: 40},
	{t: BEATS.wave + 0.6, pos: [1.95, FLOOR + 1.9, 1.45], look: [0, FLOOR + 1.4, 0.05], fov: 40},
	{t: BEATS.end, pos: [1.85, FLOOR + 1.88, 1.4], look: [0, FLOOR + 1.4, 0.05], fov: 40},
]);

// ---------- мир ----------
const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const set = getSet();
	const env = ENV.dungeon;
	const room = (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint={env.tint} />
		</>
	);
	if (t < BEATS.posesFrom) {
		const medium = t >= BEATS.medium;
		const face = medium ? mediumFace(t) : faceAt(t).f;
		const pose = medium ? withPose(idle(t), {headPitch: -0.05}) : {...slump(0.6), headPitch: 0, bend: 0, headYaw: 0};
		return (
			<>
				{room}
				<BlobShadow x={0} z={0} y={FLOOR} />
				<Humanoid skin={assets.skin} position={[0, FLOOR, 0]} pose={pose} face={face} />
			</>
		);
	}
	if (t < BEATS.seatFrom) {
		const {i, ts} = pageAt(t);
		const k = kOf(ts);
		return (
			<>
				{room}
				{PAGES[i].map((slot, j) => {
					const x = SLOT_X[j];
					// поворот: turn — полный оборот, spin — качается ±45°, остальные — 3/4 с лёгким покачиванием
					const rot = slot.turn ? (ts / P) * Math.PI * 2 : slot.spin ? Math.sin(ts * 1.4) * 0.8 : 0.75 + Math.sin(ts * 1.2 + j) * 0.4;
					let pose = slot.pose(ts, k);
					let pos: Vec3 = [x, FLOOR + (slot.chair ? SEAT : 0), 0];
					let rotY = rot;
					if (slot.name === 'diveIntoChair') {
						pos = diveArc(k, [x + 0.1, FLOOR, 1.25], [x, FLOOR + SEAT, 0], 0.65);
						rotY = lerp(Math.PI, 0.25, smooth((k - 0.15) / 0.55));
						pose = diveIntoChair(k);
					}
					const hatAt = slot.name === 'flingHat' ? throwState(k, 0.22, 0.6) : null;
					const packAt = slot.name === 'hurlBackpack' ? throwState(k, 0.3, 0.6) : slot.name === 'tiredWalk' || slot.name === 'slump' ? 'body' : null;
					// полёт после выпуска: из точки кулака в момент выпуска, вперёд-вправо и вниз
					const fly = (rel: number, side: Pose, vel: Vec3) => {
						const p0 = worldPoint(handAnchor(side, 'R'), pos, rotY);
						const dt = ((k - rel) * (P - 0.6)) as number;
						const c = Math.cos(rotY);
						const s = Math.sin(rotY);
						const v: Vec3 = [vel[0] * c + vel[2] * s, vel[1], -vel[0] * s + vel[2] * c];
						return [p0[0] + v[0] * dt, Math.max(FLOOR + 0.12, p0[1] + v[1] * dt - 9 * dt * dt), p0[2] + v[2] * dt] as Vec3;
					};
					return (
						<React.Fragment key={slot.name}>
							{/* кресло и стол поворачиваются вместе с сидящим */}
							<group position={[x, FLOOR, 0]} rotation={[0, slot.name === 'diveIntoChair' ? 0.25 : rotY, 0]}>
								{slot.chair ? <Chair p={[0, 0, 0]} /> : null}
								{slot.desk ? <Desk p={[0, 0, 0]} /> : null}
							</group>
							<BlobShadow x={pos[0]} z={pos[2]} y={FLOOR} size={1.2} opacity={0.4} />
							<Humanoid
								skin={assets.skin}
								position={pos}
								rotationY={rotY}
								pose={pose}
								face={slot.face ? slot.face(ts, k) : {blink: autoBlink(ts, j + 1)}}
								headSlot={hatAt === 'body' ? <group position={[0, 0.26, 0]}><Hat /></group> : undefined}
								handR={hatAt === 'hand' ? <group position={[0, -0.12, 0]}><Hat /></group> : packAt === 'hand' ? <group position={[0, -0.2, 0.1]}><Pack /></group> : undefined}
								backSlot={packAt === 'body' ? <Pack /> : undefined}
							/>
							{hatAt === 'free' ? (
								<group position={fly(0.6, flingHat(0.6), [-2.5, 2.5, 3])} rotation={[k * 20, k * 14, 0]}>
									<Hat />
								</group>
							) : null}
							{packAt === 'free' ? (
								<group position={fly(0.6, hurlBackpack(0.6), [-1.5, 2.2, 4])} rotation={[k * 12, 0, k * 6]}>
									<Pack />
								</group>
							) : null}
						</React.Fragment>
					);
				})}
			</>
		);
	}
	const s = seqPose(t);
	const lift = headphonesLift(s.phones);
	return (
		<>
			{room}
			<Chair p={[0, FLOOR, 0]} rot={s.rot * (t >= BEATS.typing ? 1 : 0)} />
			<Desk p={[0, FLOOR, 0]} full />
			<Tower p={[0, FLOOR, 0]} on={t > BEATS.reach + 0.55 ? 1 : 0} />
			<BlobShadow x={s.pos[0]} z={s.pos[2]} y={FLOOR} size={1.3} opacity={0.45} />
			<Humanoid
				skin={assets.skin}
				position={s.pos}
				rotationY={s.rot}
				pose={s.pose}
				face={s.face}
				headSlot={s.phones > 0.08 ? <group position={lift}><Phones /></group> : undefined}
			/>
		</>
	);
};

// ---------- подписи ----------
const Overlay: React.FC<SceneProps> = ({t, cam}) => {
	if (t < BEATS.posesFrom) {
		const name = t >= BEATS.medium ? 'средний план' : faceAt(t).name;
		return (
			<PixelText x={960} y={70} size={50} color="#ffffff" color2="#ffd86b" align="center">
				{`лицо: ${name}`}
			</PixelText>
		);
	}
	if (t < BEATS.seatFrom) {
		const {i} = pageAt(t);
		return (
			<>
				{PAGES[i].map((slot, j) => {
					const p = projectToScreen(cam, [SLOT_X[j], FLOOR - 0.15, 0.3]);
					return (
						<PixelText key={slot.name} x={p.x} y={Math.min(1040, p.y + 40)} size={30} color="#ffffff" align="center">
							{slot.name}
						</PixelText>
					);
				})}
			</>
		);
	}
	return (
		<PixelText x={960} y={1000} size={50} color="#ffffff" color2="#9fd0ff" align="center">
			{seqPose(t).name}
		</PixelText>
	);
};

export const scene: SceneDef = {id: 'rig', duration: BEATS.end, camera, World, Overlay};
