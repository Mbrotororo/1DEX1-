import React from 'react';
import {
	BlobShadow,
	Environment,
	Player,
	clamp01,
	flyCam,
	idle,
	mixPose,
	orbitCam,
	prog,
	shotAt,
	sit,
	smooth,
	withPose,
	type CameraState,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {POST, focusDist, type PostSettings} from '../../core/post';
import {House} from '../../sets/house/House';
import {
	BACKPACK_LAND,
	BEDROOM_WIDE,
	CHAIR,
	CLOCK,
	COAT_HOOKS,
	CORK,
	PC,
	TRIPOD,
	TRIPOD_VIEW,
} from '../../sets/house/anchors';
import {HOUSE_ENV} from '../../sets/house/env';
import {slamOpen} from '../../props/doors';
import {Backpack, Beanie, Book, Headphones} from '../../props/wear';
import {chairSeat} from '../../props/chair';
import {placeholderScreen} from '../../props/screen';
import {BEATS, SHOT, SHOTS, type ShotName} from './beats';

// Галерея дома: обход декораций по раскадровке, по 2 с на план.
// Смотреть: npm run shots -- --scene=house --sheet --step=1  (кадр в середине каждого плана: 1, 3, 5 ...)

type ShotDef = {
	cam: (ts: number) => CameraState;
	env: keyof typeof HOUSE_ENV;
	post: PostSettings;
	// куда наводить фокус
	focus: Vec3;
};

const HERO_HALL: Vec3 = [3.1, 0, 3.7];
const seat = (spin: number) => chairSeat(CHAIR.position, CHAIR.rotationY, spin);

const SHOT_DEFS: Record<ShotName, ShotDef> = {
	// прихожая от двери, низко
	hallWide: {
		cam: flyCam([
			{t: 0, pos: [1.2, 0.9, 6.4], look: [9, 1.6, 1.2], fov: 62},
			{t: SHOT, pos: [1.5, 1.0, 5.9], look: [9, 1.7, 1.2], fov: 62},
		]),
		env: 'hallway',
		post: POST.warmInterior,
		focus: [5, 1.5, 3],
	},
	// входная дверь открывается: камера у пола в прихожей
	frontDoor: {
		cam: flyCam([
			{t: 0, pos: [3.9, 0.45, 3.0], look: [2.5, 1.1, 7.2], fov: 58},
			{t: SHOT, pos: [3.8, 0.42, 3.4], look: [2.5, 1.1, 7.2], fov: 58},
		]),
		env: 'hallway',
		post: POST.coldDay,
		focus: [2.5, 1, 7],
	},
	// крупно: часы
	clock: {
		cam: flyCam([
			{t: 0, pos: [CLOCK.center[0] + 0.05, CLOCK.center[1] - 0.06, 1.25], look: CLOCK.center, fov: 40},
			{t: SHOT, pos: [CLOCK.center[0], CLOCK.center[1] - 0.03, 0.95], look: CLOCK.center, fov: 40},
		]),
		env: 'hallway',
		post: POST.closeUp,
		focus: CLOCK.center,
	},
	// крупно: записка, круг рисуется
	cork: {
		cam: flyCam([
			{t: 0, pos: [CORK.time[0] - 0.05, CORK.time[1] + 0.1, 1.0], look: [CORK.time[0] - 0.05, CORK.time[1] + 0.08, 0], fov: 40},
			{t: SHOT, pos: [CORK.time[0] - 0.08, CORK.time[1] + 0.05, 0.8], look: [CORK.time[0] - 0.08, CORK.time[1] + 0.05, 0], fov: 40},
		]),
		env: 'hallway',
		post: POST.closeUp,
		focus: CORK.center,
	},
	// вешалка с шапкой и обувница
	hooks: {
		cam: flyCam([
			{t: 0, pos: [1.9, 1.45, 3.7], look: [0.1, 1.2, 5.2], fov: 50},
			{t: SHOT, pos: [1.75, 1.5, 3.9], look: [0.1, 1.25, 5.2], fov: 50},
		]),
		env: 'hallway',
		post: POST.warmInterior,
		focus: COAT_HOOKS.center,
	},
	// лестница снизу, у первой ступени
	stairs: {
		cam: flyCam([
			{t: 0, pos: [3.6, 0.45, 1.3], look: [12, 4.0, 1.4], fov: 60},
			{t: SHOT, pos: [3.9, 0.5, 1.35], look: [12, 4.4, 1.4], fov: 60},
		]),
		env: 'hallway',
		post: POST.warmInterior,
		focus: [8, 2, 1.5],
	},
	// коридор наверху: камера едет задом перед бегущим (к двери комнаты)
	corridor: {
		cam: flyCam([
			{t: 0, pos: [16.6, 6.35, 1.5], look: [11, 5.5, 1.5], fov: 64},
			{t: SHOT, pos: [19.3, 6.35, 1.5], look: [13, 5.6, 1.5], fov: 64},
		]),
		env: 'upstairs',
		post: POST.warmInterior,
		focus: [15, 5.8, 1.5],
	},
	// дверь комнаты распахивается
	bedroomDoor: {
		cam: flyCam([
			{t: 0, pos: [17.2, 6.1, 2.2], look: [21.5, 6.0, 1.4], fov: 58},
			{t: SHOT, pos: [17.6, 6.1, 2.1], look: [21.5, 6.0, 1.4], fov: 58},
		]),
		env: 'upstairs',
		post: POST.warmInterior,
		focus: [20.9, 6, 1.5],
	},
	// комната общим планом
	bedroomWide: {
		cam: flyCam([
			{t: 0, pos: BEDROOM_WIDE.pos, look: BEDROOM_WIDE.look, fov: BEDROOM_WIDE.fov},
			{t: SHOT, pos: [BEDROOM_WIDE.pos[0] + 0.3, BEDROOM_WIDE.pos[1] - 0.1, BEDROOM_WIDE.pos[2] + 0.2], look: BEDROOM_WIDE.look, fov: BEDROOM_WIDE.fov},
		]),
		env: 'bedroom',
		post: POST.warmInterior,
		focus: [27, 6, 5],
	},
	// стол: RGB бежит волной, монитор загорается
	desk: {
		cam: flyCam([
			{t: 0, pos: [28.3, 6.55, 3.3], look: [30.4, 6.05, 5.7], fov: 50},
			{t: SHOT, pos: [28.5, 6.5, 3.5], look: [30.4, 6.05, 5.8], fov: 50},
		]),
		env: 'bedroom',
		post: POST.warmInterior,
		focus: PC.position,
	},
	// крупно: кнопка питания (нажимается) и RGB внутри
	pcButton: {
		cam: flyCam([
			{t: 0, pos: [PC.button[0] - 0.55, PC.button[1] + 0.32, PC.button[2] + 0.5], look: PC.button, fov: 40},
			{t: SHOT, pos: [PC.button[0] - 0.45, PC.button[1] + 0.26, PC.button[2] + 0.42], look: PC.button, fov: 40},
		]),
		env: 'bedroom',
		post: POST.closeUp,
		focus: PC.button,
	},
	// лицо в свете монитора (камера у монитора смотрит на сидящего)
	faceMonitor: {
		cam: flyCam([
			{t: 0, pos: [29.8, 6.5, 5.45], look: [28.3, 6.25, 4.95], fov: 50},
			{t: SHOT, pos: [29.75, 6.45, 5.4], look: [28.3, 6.25, 4.95], fov: 48},
		]),
		env: 'desk',
		post: POST.closeUp,
		focus: [28.3, 6.45, 5.0],
	},
	// кресло крутится
	chair: {
		cam: flyCam([
			{t: 0, pos: [25.6, 6.7, 7.4], look: [27.6, 6.0, 2.0], fov: 56},
			{t: SHOT, pos: [25.9, 6.6, 7.2], look: [27.8, 6.0, 2.0], fov: 56},
		]),
		env: 'bedroom',
		post: POST.warmInterior,
		focus: CHAIR.position,
	},
	// камера на штативе, лампа REC
	tripod: {
		cam: flyCam([
			{t: 0, pos: [28.1, 6.75, 6.7], look: [TRIPOD.lens[0], TRIPOD.lens[1] - 0.1, TRIPOD.lens[2]], fov: 42},
			{t: SHOT, pos: [28.0, 6.7, 6.9], look: [TRIPOD.lens[0], TRIPOD.lens[1] - 0.1, TRIPOD.lens[2]], fov: 42},
		]),
		env: 'bedroom',
		post: POST.closeUp,
		focus: TRIPOD.lens,
	},
	// герой в прихожей: шапка в снегу и рюкзак (облёт со спины к лицу)
	heroHall: {
		cam: orbitCam([
			{t: 0, az: 20, el: 10, dist: 2.5, target: [HERO_HALL[0], 1.2, HERO_HALL[2]], fov: 48},
			{t: SHOT, az: 150, el: 4, dist: 2.2, target: [HERO_HALL[0], 1.4, HERO_HALL[2]], fov: 48},
		]),
		env: 'hallway',
		post: POST.closeUp,
		focus: [HERO_HALL[0], 1.4, HERO_HALL[2]],
	},
	// герой в кресле через камеру на штативе
	heroSeated: {
		cam: flyCam([
			{t: 0, pos: TRIPOD_VIEW.pos, look: TRIPOD_VIEW.look, fov: TRIPOD_VIEW.fov},
			{t: SHOT, pos: TRIPOD_VIEW.pos, look: TRIPOD_VIEW.look, fov: TRIPOD_VIEW.fov - 3},
		]),
		env: 'bedroom',
		post: POST.happy,
		focus: CHAIR.sitPosition,
	},
	// камера на полу: рюкзак упал, книги рассыпались
	floorBag: {
		cam: flyCam([
			{t: 0, pos: [BACKPACK_LAND[0] - 2.2, 0.22, BACKPACK_LAND[2] + 0.4], look: [BACKPACK_LAND[0] + 1, 0.3, BACKPACK_LAND[2] - 0.4], fov: 56},
			{t: SHOT, pos: [BACKPACK_LAND[0] - 1.9, 0.2, BACKPACK_LAND[2] + 0.5], look: [BACKPACK_LAND[0] + 1, 0.3, BACKPACK_LAND[2] - 0.4], fov: 56},
		]),
		env: 'hallway',
		post: POST.closeUp,
		focus: BACKPACK_LAND,
	},
};

const LIST = SHOTS.map((name, i) => ({from: i * SHOT, cam: (ts: number) => SHOT_DEFS[name].cam(ts)}));
const current = (t: number) => {
	const {index, tShot} = shotAt(LIST, t);
	return {name: SHOTS[index], def: SHOT_DEFS[SHOTS[index]], ts: tShot};
};

const camera = (t: number) => {
	const c = current(t);
	return c.def.cam(c.ts);
};

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const {name, def, ts} = current(t);
	const env = HOUSE_ENV[def.env];
	const up = def.env !== 'hallway';
	// по плану: что движется
	const frontDoorOpen = name === 'frontDoor' ? smooth(prog(ts, 0.3, 1.1)) : 0;
	const noteCircle = name === 'cork' ? prog(ts, 0.3, 1.0) : 1;
	const bedroomDoorOpen = name === 'bedroomDoor' ? slamOpen(ts, 0.5, 0.72) : name === 'corridor' ? 0 : 1;
	const deskWave = name === 'desk' ? prog(ts, 0.2, 0.7) : 1;
	const monitorOn =
		name === 'desk' ? smooth(prog(ts, 0.9, 0.4)) : name === 'faceMonitor' ? smooth(prog(ts, 0.5, 0.4)) : name === 'heroSeated' || name === 'chair' || name === 'tripod' || name === 'bedroomWide' ? 1 : 0;
	const chairSpin = name === 'chair' ? ts * 2.4 : name === 'heroSeated' ? -smooth(prog(ts, 0.6, 1.0)) * 1.2 : 0;
	const seated = seat(chairSpin);
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<House
				t={t}
				env={env}
				area={up ? 'up' : 'hall'}
				poster={assets.holyworld}
				frontDoorOpen={frontDoorOpen}
				noteCircle={noteCircle}
				beanieOnHook={name === 'hooks'}
				bedroomDoorOpen={bedroomDoorOpen}
				monitorOn={monitorOn}
				monitorScreen={placeholderScreen()}
				pcPower={name === 'pcButton' ? (ts > 0.9 ? 1 : 0) : monitorOn > 0 || name === 'desk' ? 1 : 0}
				pcRgb={name === 'desk' ? deskWave : name === 'pcButton' ? prog(ts, 1.0, 0.7) : up ? 1 : 0}
				pcPress={name === 'pcButton' ? Math.max(0, 1 - Math.abs(ts - 0.85) / 0.12) : 0}
				pcHighlight={name === 'pcButton' ? 1 - smooth(prog(ts, 0.9, 0.4)) : 0}
				headphonesOnStand={name !== 'heroSeated'}
				chairSpin={chairSpin}
				tripodRec={1}
				windowLight={name === 'faceMonitor' ? 0.3 : 1}
			/>
			{name === 'heroHall' ? (
				<>
					<BlobShadow x={HERO_HALL[0]} z={HERO_HALL[2]} y={0.01} size={1.2} opacity={0.45} />
					<Player
						skin={assets.skin}
						position={HERO_HALL}
						rotationY={Math.PI + 0.35}
						pose={withPose(idle(t), {headPitch: 0.28, lean: 0.08})}
						face={{tired: 1}}
						headSlot={<Beanie snow={0.7} />}
						backSlot={<Backpack />}
					/>
				</>
			) : null}
			{name === 'faceMonitor' ? (
				<Player
					skin={assets.skin}
					position={seat(0).position}
					rotationY={seat(0).rotationY}
					pose={withPose(sit(), {armR: [-1.15, -0.1], armL: [-1.15, 0.1], headPitch: 0.05})}
					face={{focus: smooth(prog(ts, 0.6, 0.4)), shock: 0}}
				/>
			) : null}
			{name === 'heroSeated' ? (
				<Player
					skin={assets.skin}
					position={seated.position}
					rotationY={seated.rotationY}
					pose={mixPose(sit(), withPose(sit(), {armR: [-1.1, -0.15], armL: [-1.1, 0.15], headPitch: -0.05}), clamp01(1 - ts))}
					face={{joy: smooth(prog(ts, 0.8, 0.5))}}
					headSlot={<Headphones glow={0.8} />}
				/>
			) : null}
			{name === 'floorBag' ? (
				<>
					<Backpack mode="loose" position={[BACKPACK_LAND[0], 0.27, BACKPACK_LAND[2]]} rotation={[-1.45, 0.4, 0]} open={0.9} />
					<Book position={[BACKPACK_LAND[0] - 0.5, 0.03, BACKPACK_LAND[2] + 0.35]} rotation={[-Math.PI / 2, 0, 0.6]} seed={1} />
					<Book position={[BACKPACK_LAND[0] - 0.9, 0.02, BACKPACK_LAND[2] - 0.2]} rotation={[-Math.PI / 2, 0, -0.4]} seed={2} notebook />
					<Book position={[BACKPACK_LAND[0] - 0.2, 0.05, BACKPACK_LAND[2] - 0.55]} rotation={[-Math.PI / 2, 0, 1.9]} seed={3} open={0.6} />
				</>
			) : null}
		</>
	);
};

const post = (t: number, cam: CameraState): PostSettings => {
	const {def} = current(t);
	// chroma выключена: в текущем шейдере постобработки она конфликтует с цветокоррекцией
	return {...def.post, chroma: 0, focus: focusDist(cam, def.focus)};
};

export const scene: SceneDef = {id: 'house', duration: BEATS.end, camera, World, post};
