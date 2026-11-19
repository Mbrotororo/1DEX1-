import React from 'react';
import * as THREE from 'three';
import {Lantern, VoxelMesh, type EnvState} from '../../core';
import {Banister} from '../../props/stairs';
import {BedroomDoor, FrontDoor} from '../../props/doors';
import {Candle, CoatHooks, CorkNote, Painting, Poster, ShoeBench, WallClock} from '../../props/wall';
import {Beanie} from '../../props/wear';
import {DeskLamp, Desk, HeadphoneStand, Keyboard, Microphone, Monitor, Mouse, Mousepad, PcTower} from '../../props/pc';
import {GamingChair} from '../../props/chair';
import {CameraTripod} from '../../props/camera';
import {Bed, BookStack, Mug, Plant} from '../../props/decor';
import {
	BEANIE_ON_HOOK,
	BED,
	BEDROOM_DOOR,
	CANDLES,
	CHAIR,
	CLOCK,
	COAT_HOOKS,
	CORK,
	DECOR,
	DESK,
	DESK_LAMP,
	FRONT_DOOR,
	HANGING_LANTERNS,
	HEADPHONE_STAND,
	KEYBOARD,
	MICROPHONE,
	MONITOR,
	MOUSE,
	MOUSEPAD,
	PAINTINGS,
	PC,
	POSTER,
	SHOE_BENCH,
	STAIRS,
	STANDING_LANTERNS,
	TRIPOD,
	type V3,
} from './anchors';
import {getHouse} from './world';

// Дом целиком: статичные меши (интерьер + улица) и весь реквизит на своих местах.
// Всё, что двигается, управляется пропсами (значения по умолчанию — «как в начале ролика»).
// Сцена может спрятать любой предмет (hide) и нарисовать свою копию (например, летящую шапку).

export type HidePart =
	| 'frontDoor'
	| 'bedroomDoor'
	| 'clock'
	| 'cork'
	| 'hooks'
	| 'shoeBench'
	| 'banister'
	| 'lanterns'
	| 'candles'
	| 'desk'
	| 'monitor'
	| 'pc'
	| 'keyboard'
	| 'mouse'
	| 'headphones'
	| 'lamp'
	| 'mic'
	| 'chair'
	| 'tripod'
	| 'poster'
	| 'decor'
	| 'bed'
	| 'paintings'
	| 'exterior';

export type HouseProps = {
	t: number;
	// окружение сцены: его tint красит улицу за окнами (интерьер запечён и не красится)
	env: EnvState;
	// что строить: 'all' — весь дом; 'hall' — первый этаж и лестница; 'up' — коридор и комната (реквизит другой зоны не рисуется)
	area?: 'all' | 'hall' | 'up';
	hide?: HidePart[];
	// ---- прихожая ----
	// входная дверь 0..1 (1 — открыта внутрь на FRONT_DOOR.angle)
	frontDoorOpen?: number;
	// дневной свет снаружи 0..1: полоска под дверью и световое пятно в проёме
	daylight?: number;
	// табло часов и мигание двоеточия (по умолчанию мигает раз в секунду от t)
	clockText?: string;
	clockColon?: boolean;
	clockGlow?: number;
	// красный круг вокруг «13:00» 0..1
	noteCircle?: number;
	// шапка висит на крючке (после броска A6)
	beanieOnHook?: boolean;
	// ---- комната ----
	// дверь комнаты 0..1 (используй slamOpen для удара о стену)
	bedroomDoorOpen?: number;
	// монитор: включён 0..1, картинка 16:9, сила света на лицо
	monitorOn?: number;
	monitorScreen?: THREE.Texture | null;
	monitorLight?: number;
	monitorGlowColor?: string;
	// системный блок: питание 0..1, волна RGB 0..1, нажатие кнопки 0..1, подсветка кнопки 0..1
	pcPower?: number;
	pcRgb?: number;
	pcPress?: number;
	pcHighlight?: number;
	// клавиатура/мышь/коврик/лента стола: подсветка 0..1, «печатает» 0..1, клик мыши 0..1
	peripheralsRgb?: number;
	typing?: number;
	mouseClick?: number;
	// наушники на подставке (false — герой их уже надел)
	headphonesOnStand?: boolean;
	// кресло: смещение от места (блоки, мир), поворот сиденья (рад), качание назад (рад)
	chairOffset?: V3;
	chairSpin?: number;
	chairTilt?: number;
	// камера на штативе: идёт запись 0..1 (лампа мигает)
	tripodRec?: number;
	// настольная лампа 0..1
	lampOn?: number;
	// живые источники света для персонажей и реквизита (тёплые фонари, лампа, закат из окна)
	charLights?: boolean;
	// сила закатного света из окна комнаты для персонажей 0..1 (убавь на крупных планах у монитора)
	windowLight?: number;
	// логотип для постера (assets.holyworld); без него постера нет
	poster?: THREE.Texture | null;
};

// Цвет фонаря и свечей
const FIRE = '#ffa452';

export const House: React.FC<HouseProps> = ({
	t,
	env,
	area = 'all',
	hide = [],
	frontDoorOpen = 0,
	daylight = 1,
	clockText = '16:00',
	clockColon,
	clockGlow = 1,
	noteCircle = 1,
	beanieOnHook = false,
	bedroomDoorOpen = 0,
	monitorOn = 0,
	monitorScreen = null,
	monitorLight = 1,
	monitorGlowColor = '#86b0ff',
	pcPower = 0,
	pcRgb = 0,
	pcPress = 0,
	pcHighlight = 0,
	peripheralsRgb,
	typing = 0,
	mouseClick = 0,
	headphonesOnStand = true,
	chairOffset = [0, 0, 0],
	chairSpin = 0,
	chairTilt = 0,
	tripodRec = 1,
	lampOn = 1,
	charLights = true,
	windowLight = 1,
	poster = null,
}) => {
	const set = getHouse();
	const show = (p: HidePart) => !hide.includes(p);
	const hall = area !== 'up';
	const up = area !== 'hall';
	const colon = clockColon ?? Math.floor(t * 2) % 2 === 0;
	const rgbP = peripheralsRgb ?? pcRgb;
	// фонари и свечи: зона по высоте (второй этаж — y >= 5)
	const inArea = (p: V3) => (p[1] >= 4.9 ? up : hall);
	return (
		<>
			<VoxelMesh meshes={set.meshes} tint="#ffffff" />
			{show('exterior') ? <VoxelMesh meshes={set.extMeshes} tint={env.tint} /> : null}

			{/* ---------- свет и огонь ---------- */}
			{show('lanterns')
				? HANGING_LANTERNS.map((l, i) => (inArea([l.mount[0], l.mount[1] - 1, l.mount[2]]) ? <Lantern key={`h${i}`} position={l.mount} hanging={l.chain} t={t} seed={i} color={FIRE} glow={0.8} /> : null))
				: null}
			{show('lanterns') ? STANDING_LANTERNS.map((p, i) => (inArea(p) ? <Lantern key={`s${i}`} position={p} t={t} seed={10 + i} color={FIRE} glow={0.7} /> : null)) : null}
			{show('candles') ? CANDLES.map((p, i) => (inArea(p) ? <Candle key={`c${i}`} position={p} t={t} seed={i} height={3 + (i % 3)} /> : null)) : null}
			{charLights ? <HouseLights area={area} t={t} lampOn={lampOn} windowLight={windowLight} /> : null}
			{show('paintings') ? PAINTINGS.map((p, i) => (inArea(p.position) ? <Painting key={`p${i}`} position={p.position} rotationY={p.rotationY} width={p.width} height={p.height} seed={p.seed} /> : null)) : null}

			{/* ---------- первый этаж ---------- */}
			{hall ? (
				<>
					{show('frontDoor') ? <FrontDoor position={FRONT_DOOR.hinge} yaw={FRONT_DOOR.yaw} open={frontDoorOpen} angle={FRONT_DOOR.angle} daylight={daylight} t={t} /> : null}
					{show('clock') ? <WallClock position={CLOCK.center} rotationY={CLOCK.rotationY} text={clockText} colon={colon} glow={clockGlow} /> : null}
					{show('cork') ? <CorkNote position={CORK.center} rotationY={CORK.rotationY} circle={noteCircle} /> : null}
					{show('hooks') ? <CoatHooks position={COAT_HOOKS.center} rotationY={COAT_HOOKS.rotationY} /> : null}
					{show('hooks') && beanieOnHook ? <Beanie mode="loose" position={BEANIE_ON_HOOK.position} rotation={BEANIE_ON_HOOK.rotation} snow={0.3} /> : null}
					{show('shoeBench') ? <ShoeBench position={SHOE_BENCH.position} rotationY={SHOE_BENCH.rotationY} /> : null}
					{show('banister') ? <Banister x0={STAIRS.x0} y0={0} z={2.86} steps={STAIRS.steps} rise={STAIRS.rise} /> : null}
					{show('decor') ? (
						<>
							<BookStack position={DECOR.hallBooks} rotationY={0.3} seed={2} count={3} />
							<Plant position={DECOR.hallPlant} t={t} />
						</>
					) : null}
				</>
			) : null}

			{/* ---------- коридор и комната ---------- */}
			{up ? (
				<>
					{show('bedroomDoor') ? <BedroomDoor position={BEDROOM_DOOR.hinge} yaw={BEDROOM_DOOR.yaw} open={bedroomDoorOpen} angle={BEDROOM_DOOR.angle} /> : null}
					{show('desk') ? <Desk position={DESK.position} rotationY={DESK.rotationY} width={DESK.width} depth={DESK.depth} t={t} rgb={rgbP} /> : null}
					{show('monitor') ? (
						<Monitor position={MONITOR.position} rotationY={MONITOR.rotationY} on={monitorOn} screen={monitorScreen} light={charLights ? monitorLight : 0} glowColor={monitorGlowColor} backlight={rgbP * 0.8} />
					) : null}
					{show('pc') ? <PcTower position={PC.position} rotationY={PC.rotationY} t={t} power={pcPower} rgb={pcRgb} press={pcPress} highlight={pcHighlight} /> : null}
					{show('keyboard') ? <Keyboard position={KEYBOARD.position} rotationY={KEYBOARD.rotationY} t={t} rgb={rgbP} typing={typing} /> : null}
					{show('mouse') ? (
						<>
							<Mousepad position={MOUSEPAD.position} rotationY={MOUSEPAD.rotationY} t={t} rgb={rgbP} />
							<Mouse position={MOUSE.position} rotationY={MOUSE.rotationY} t={t} rgb={rgbP} click={mouseClick} />
						</>
					) : null}
					{show('headphones') ? <HeadphoneStand position={HEADPHONE_STAND.position} rotationY={HEADPHONE_STAND.rotationY} headphones={headphonesOnStand} glow={0.25 + 0.6 * rgbP} /> : null}
					{show('lamp') ? <DeskLamp position={DESK_LAMP.position} rotationY={DESK_LAMP.rotationY} on={lampOn} /> : null}
					{show('mic') ? <Microphone position={MICROPHONE.position} rotationY={MICROPHONE.rotationY} glow={0.2 + 0.7 * rgbP} /> : null}
					{show('chair') ? (
						<GamingChair position={[CHAIR.position[0] + chairOffset[0], CHAIR.position[1] + chairOffset[1], CHAIR.position[2] + chairOffset[2]]} rotationY={CHAIR.rotationY} spin={chairSpin} tilt={chairTilt} />
					) : null}
					{show('tripod') ? <CameraTripod position={TRIPOD.position} rotationY={TRIPOD.rotationY} t={t} rec={tripodRec} /> : null}
					{show('poster') && poster ? <Poster position={POSTER.center} rotationY={POSTER.rotationY} texture={poster} width={POSTER.width} height={POSTER.height} /> : null}
					{show('bed') ? <Bed position={BED.position} rotationY={BED.rotationY} width={BED.width} length={BED.length} /> : null}
					{show('decor') ? (
						<>
							<BookStack position={DECOR.nightBooks} rotationY={-0.2} seed={5} count={3} />
							<Mug position={DECOR.mug} rotationY={0.6} />
							<Plant position={DECOR.roomPlant} t={t} />
						</>
					) : null}
				</>
			) : null}
		</>
	);
};

// ---------- живой свет для персонажей ----------
// Блоки освещены запечённым светом, а герой и реквизит — этими точечными источниками (плюс Environment).
export const CHAR_LIGHTS: {pos: V3; color: string; intensity: number; distance: number; area: 'hall' | 'up'}[] = [
	// прихожая: два подвесных фонаря
	{pos: [2.5, 2.9, 4.5], color: '#ffa05a', intensity: 2.6, distance: 7, area: 'hall'},
	{pos: [9.5, 2.9, 4.6], color: '#ffa05a', intensity: 2.2, distance: 7, area: 'hall'},
	// лестница/коридор: фонарь над пролётом
	{pos: [17.0, 7.9, 1.5], color: '#ffa05a', intensity: 2.2, distance: 7, area: 'up'},
	// комната: фонарь под потолком и закат из окна (его сила — пропс windowLight)
	{pos: [25.5, 7.6, 5.0], color: '#ffa860', intensity: 2.0, distance: 7.5, area: 'up'},
	{pos: [30.6, 7.4, 5.5], color: '#ff8a46', intensity: 2.2, distance: 8, area: 'up'},
];
// номер источника «закат из окна» в CHAR_LIGHTS
const WINDOW_LIGHT = 4;

const HouseLights: React.FC<{area: 'all' | 'hall' | 'up'; t: number; lampOn: number; windowLight: number}> = ({area, t, lampOn, windowLight}) => (
	<>
		{CHAR_LIGHTS.map((l, i) =>
			(area === 'all' || area === l.area) && (i !== WINDOW_LIGHT || windowLight > 0.01) ? (
				<pointLight key={i} position={l.pos} color={l.color} intensity={l.intensity * (i === WINDOW_LIGHT ? windowLight : 1 + Math.sin(t * 7.3 + i * 2.1) * 0.02)} distance={l.distance} decay={1.3} />
			) : null,
		)}
		{area !== 'hall' && lampOn > 0.01 ? <pointLight position={DESK_LAMP.bulb} color="#ffc070" intensity={1.4 * lampOn} distance={3.5} decay={1.3} /> : null}
	</>
);
