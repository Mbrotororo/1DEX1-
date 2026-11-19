import React from 'react';
import {
	BlobShadow,
	Environment,
	Fade,
	Flash,
	PixelText,
	POST,
	Player,
	SansText,
	Viewfinder,
	clamp01,
	easeOutBack,
	easeOutCubic,
	easeOutQuad,
	mixHex,
	focusDist,
	impulse,
	mixPost,
	pixelTextWidth,
	prog,
	shotAt,
	shots,
	smooth,
	type CameraState,
	type EnvState,
	type PostSettings,
	type SceneDef,
	type SceneProps,
	type Vec3,
} from '../../core';
import {House, type HidePart} from '../../sets/house/House';
import {HOUSE_ENV} from '../../sets/house/env';
import {HEADPHONE_STAND} from '../../sets/house/anchors';
import {Headphones} from '../../props/wear';
import {HeadphoneStand} from '../../props/pc';
import {PC_TIMING, SH, SW, ScreenPOV, drawPC, pcGlowColor, pcPOV, useScreenTexture, type ScreenDraw} from '../../screens';
import {BEATS, SHOT_LIST, type ShotName} from './beats';
import {POV_SHOTS, SHOT_CAMS} from './cams';
import {EyeGlints} from './glints';
import {HeroArm} from './arm';
import {BUTTON_CENTER, PowerDecal, TowerGlow} from './btn';
import {HP_STAND, btnArmAt, chairAt, heroAt, pcPressAt} from './hero';

// Сцена b-room (глобально 16–30): прыжок в кресло, включение ПК, Minecraft, Discord, наушники, OBS,
// финал через видоискатель камеры. Тайминг — beats.ts, звуки — sfx.ts, раскадровка — SPEC.md §3.

// ---------- планы ----------
const LIST = SHOT_LIST.map((s) => ({from: s.from, cam: (ts: number, t: number) => SHOT_CAMS[s.name](ts, t)}));
const camera = shots(LIST);
const shotOf = (t: number): {name: ShotName; ts: number} => {
	const {index, tShot} = shotAt(LIST, t);
	return {name: SHOT_LIST[index].name, ts: tShot};
};
const isPov = (name: ShotName) => POV_SHOTS.includes(name);

// ---------- ПК: питание, подсветка, монитор ----------
const pcPowerAt = (t: number) => smooth(prog(t, BEATS.power, 0.12));
// волна 2.0–2.6, быстрее в начале: на плане корпуса (до 2.4) она почти доходит до верха
const pcRgbAt = (t: number) => easeOutQuad(prog(t, BEATS.rgbFrom, BEATS.rgbDur));
const monitorOnAt = (t: number) => smooth(prog(t, BEATS.monitorOn, 0.12));

// окружение и свет по планам
const envFor = (name: ShotName, t: number): EnvState => {
	if (name === 'b1' || name === 'b2btn' || name === 'b2pc') return HOUSE_ENV.bedroom;
	if (name === 'b7') return HOUSE_ENV.bedroom;
	return t < BEATS.monitorOn ? HOUSE_ENV.bedroom : HOUSE_ENV.desk;
};
const windowFor = (name: ShotName) => (name === 'b1' ? 1 : name === 'b7' ? 0.55 : name === 'b2btn' || name === 'b2pc' ? 0.7 : name === 'b5' ? 0.6 : 0.3);
// что прячем в плане: на крупном плане кнопки — кресло (тело тоже не рисуем: в кадре только рука),
// на лицах у монитора — кресло (его фиолетовое «крыло» у уха читалось как наушник);
// у подставки — настоящую подставку (на этих планах она стоит ближе, см. HP_STAND)
const hideFor = (name: ShotName): HidePart[] => (name === 'b2btn' || name === 'b2face' || name === 'b3face' ? ['chair'] : name === 'b5' || name === 'b5face' ? ['headphones'] : []);

// экран монитора в B7: тот же сценарий, но приглушён (белый снег игры не спорит с героем)
const drawDim: ScreenDraw = (ctx, t) => {
	drawPC(ctx, t);
	ctx.fillStyle = 'rgba(8,10,20,0.32)';
	ctx.fillRect(0, 0, SW, SH);
};

// ---------- 3D ----------
const Room: React.FC<SceneProps & {name: ShotName}> = ({t, cam, assets, name}) => {
	const env = envFor(name, t);
	const hero = heroAt(name, t);
	const chair = name === 'b1' || name === 'b5' || name === 'b5face' || name === 'b7' ? chairAt(t) : {offset: [0, 0, 0] as Vec3, spin: 0, tilt: 0};
	// картинка на мониторе нужна только там, где он в кадре (B7); в остальных планах экран либо выключен,
	// либо за камерой — время замораживаем, чтобы не перерисовывать холст
	const screen = useScreenTexture(drawDim, name === 'b7' ? t : 0, {width: 960, height: 540});
	const monitorOn = monitorOnAt(t);
	// на крупных планах лица свет экрана — холоднее и сильнее; в загрузке Minecraft — красный
	const face = name === 'b2face' || name === 'b3face' || name === 'b5face';
	const glow = name === 'b3face' ? mixHex(pcGlowColor(t), '#ff3040', 0.65) : face ? mixHex(pcGlowColor(t), '#4f7dff', 0.55) : pcGlowColor(t);
	const rgb = pcRgbAt(t);
	const power = pcPowerAt(t);
	const press = name === 'b2btn' ? pcPressAt(t) : 0;
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<House
				t={t}
				env={env}
				area="up"
				poster={assets.holyworld}
				bedroomDoorOpen={1}
				monitorOn={monitorOn}
				monitorScreen={screen}
				monitorGlowColor={glow}
				monitorLight={name === 'b7' ? 0.6 : face ? 1.7 : 1}
				pcPower={power}
				pcRgb={rgb}
				pcPress={press}
				pcHighlight={0}
				typing={hero.typing}
				mouseClick={hero.mouseClick}
				headphonesOnStand={hero.hp === 'stand'}
				chairOffset={chair.offset}
				chairSpin={chair.spin}
				chairTilt={chair.tilt}
				tripodRec={t >= BEATS.b7 ? 1 : 0}
				windowLight={windowFor(name)}
				hide={hideFor(name)}
			/>
			{name === 'b2btn' ? (
				<>
					<PowerDecal press={press} power={power} />
					<HeroArm skin={assets.skin} {...btnArmAt(t)} />
					{/* тёплая подсветка руки и рёбер корпуса (от лампы), голубой отсвет кнопки снизу */}
					<pointLight position={[BUTTON_CENTER[0] + 0.3, BUTTON_CENTER[1] + 0.45, BUTTON_CENTER[2] + 0.35]} color="#ffb070" intensity={1.6} distance={1.6} decay={1.2} />
					<pointLight position={[BUTTON_CENTER[0], BUTTON_CENTER[1] + 0.06, BUTTON_CENTER[2]]} color="#5fe8ff" intensity={1.4 * power} distance={0.7} decay={1.5} />
				</>
			) : null}
			{name === 'b2pc' ? <TowerGlow t={t} rgb={rgb} /> : null}
			{name === 'b2face' ? (
				// пока монитор тёмный — слабый тёплый свет на лицо (глаза и моргание читаются до синей вспышки)
				<pointLight position={[29.0, 6.75, 5.55]} color="#ff9a52" intensity={1.1 * (1 - smooth(prog(t, BEATS.monitorOn, 0.15)))} distance={1.6} decay={1.3} />
			) : null}
			{name === 'b5' || name === 'b5face' ? <HeadphoneStand position={HP_STAND} rotationY={HEADPHONE_STAND.rotationY} headphones={hero.hp === 'stand'} glow={0.85} /> : null}
			{hero.visible ? (
				<>
					{name === 'b1' ? <BlobShadow x={hero.pos[0]} z={hero.pos[2]} y={5.01} size={1.1} opacity={0.4 * clamp01(1 - (hero.pos[1] - 5) / 2)} /> : null}
					<Player
						skin={assets.skin}
						position={hero.pos}
						rotationY={hero.yaw}
						pose={hero.pose}
						tumble={hero.tumble}
						squash={hero.squash}
						face={hero.face}
						headSlot={
							hero.hp === 'head' ? (
								<group position={hero.hpLift ?? [0, 0, 0]}>
									<Headphones glow={0.55 + 0.35 * rgb} />
								</group>
							) : name === 'b2face' || name === 'b3face' ? (
								<EyeGlints t={t} on={name === 'b2face' ? monitorOn : 1} color={glow} />
							) : null
						}
					/>
					{hero.hp === 'loose' && hero.hpPos ? <Headphones position={hero.hpPos} rotation={hero.hpRot} glow={0.85} /> : null}
				</>
			) : null}
		</>
	);
};

const World: React.FC<SceneProps> = (props) => {
	const {name} = shotOf(props.t);
	// экран во весь кадр закрывает 3D целиком — мир не рисуем
	if (isPov(name)) return null;
	return <Room {...props} name={name} />;
};

// ---------- постобработка ----------
const NO_CHROMA = {chroma: 0};
const post = (t: number, cam: CameraState): PostSettings | null => {
	const {name} = shotOf(t);
	if (isPov(name)) return null;
	const hero = heroAt(name, t);
	switch (name) {
		case 'b1': {
			// общий план → средний: глубина резкости растёт, когда камера подлетает к креслу
			const near = smooth(prog(t, 0.3, 0.6));
			const s = {...POST.warmInterior, dof: 6 + 5 * near, focusRange: 2.2 - 1.2 * near, ...NO_CHROMA};
			return {...s, focus: focusDist(cam, [hero.pos[0], hero.pos[1] + 0.6, hero.pos[2]]), flash: 1 - easeOutCubic(prog(t, 0, BEATS.whiteDur + 0.08))};
		}
		case 'b2btn': {
			// фокус на кулаке, пока он над кнопкой; передний план не размываем сильнее фона
			const arm = btnArmAt(t).fist;
			const f = t < BEATS.release ? arm : BUTTON_CENTER;
			return {...POST.closeUp, ...NO_CHROMA, dof: 10, focusRange: 0.12, nearBlur: 0, focus: focusDist(cam, f), bloom: 1.1, bloomThreshold: 0.55};
		}
		case 'b2pc':
			return {...POST.closeUp, ...NO_CHROMA, dof: 12, focusRange: 0.4, focus: focusDist(cam, [30.1, 6.3, 6.95]), bloom: 1.4, bloomThreshold: 0.35};
		case 'b2face':
		case 'b3face': {
			const on = name === 'b2face' ? monitorOnAt(t) : 1;
			// монитор загорелся: холоднее и чуть ярче; загрузка Minecraft — тёплый красный
			return {
				...POST.closeUp,
				...NO_CHROMA,
				dof: name === 'b3face' ? 14 : 18,
				focusRange: name === 'b3face' ? 0.7 : 0.5,
				focus: focusDist(cam, hero.eyes),
				warmth: name === 'b2face' ? 0.3 - 0.62 * on : 0.22,
				tint: name === 'b3face' ? 0.08 : 0,
				exposure: 0.04 + 0.08 * on,
				flash: name === 'b2face' ? 0.18 * impulse(t, BEATS.monitorOn, 14) : 0,
				flashColor: '#bcd0ff',
			};
		}
		case 'b5':
			// у подставки: фокус на наушниках (на подставке, потом — в руке)
			return {...POST.closeUp, ...NO_CHROMA, dof: 12, focusRange: 0.6, focus: focusDist(cam, hero.hpPos ?? [HP_STAND[0], 6.25, HP_STAND[2]]), warmth: 0.18, exposure: 0.14};
		case 'b5face':
			return {...POST.closeUp, ...NO_CHROMA, dof: 15, focus: focusDist(cam, hero.eyes), warmth: 0.12};
		case 'b7': {
			const hit = smooth(prog(t, BEATS.pognali, 0.12));
			const s = mixPost({...POST.warmInterior, dof: 5, focusRange: 1.6}, POST.happy, hit);
			return {...s, ...NO_CHROMA, focus: focusDist(cam, hero.eyes), flash: 0.55 * impulse(t, BEATS.pognali, 16)};
		}
		default:
			return null;
	}
};

// ---------- надписи ----------
const TITLE = 'ПОГНАЛИ НА ВАЙП!';
const SUBTITLE = 'HolyWorld · Лайт Анархия';
// высота строк (1080p): под сиденьем, не на коленях; подпись — над «1080p 60fps» видоискателя
const TITLE_Y = 880;
const SUBTITLE_Y = 968;

// «ПОГНАЛИ НА ВАЙП!» влетает с ударом (из большого масштаба), потом чуть дышит
const Title: React.FC<{t: number}> = ({t}) => {
	if (t < BEATS.pognali) return null;
	const k = prog(t, BEATS.pognali, 0.16);
	const scale = 2.6 - 1.6 * easeOutBack(k, 1.8) + 0.04 * Math.sin((t - BEATS.pognali) * 5) * smooth(prog(t, BEATS.pognali + 0.3, 0.4));
	const opacity = clamp01(k * 4);
	const kick = impulse(t, BEATS.pognali + 0.12, 14);
	const size = 120;
	const w = pixelTextWidth(TITLE, size);
	return (
		<>
			<PixelText x={960 + kick * 6} y={TITLE_Y - kick * 4} size={size} color="#ffffff" color2="#ffd25a" outline={1} drop={1} scale={scale} opacity={opacity} rotate={-2 + 2 * (1 - smooth(k))}>
				{TITLE}
			</PixelText>
			{/* световая полоса за надписью */}
			<div style={{position: 'absolute', left: 960 - w * 0.6, top: TITLE_Y - 70, width: w * 1.2, height: 140, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,190,90,0.28), rgba(255,190,90,0) 70%)', opacity: opacity * (1 - 0.6 * smooth(prog(t, BEATS.pognali, 1.2))), pointerEvents: 'none'}} />
		</>
	);
};

const Subtitle: React.FC<{t: number}> = ({t}) => {
	if (t < BEATS.subtitle) return null;
	const k = prog(t, BEATS.subtitle, 0.22);
	return (
		<SansText x={960} y={SUBTITLE_Y + 18 * (1 - easeOutCubic(k))} size={54} weight={700} color="#e9ddff" outline={4} opacity={clamp01(k * 2.5)}>
			{SUBTITLE}
		</SansText>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => {
	const {name} = shotOf(t);
	const white = 1 - easeOutCubic(prog(t, 0, BEATS.whiteDur));
	const black = smooth(prog(t, BEATS.fadeFrom, BEATS.end - BEATS.fadeFrom));
	return (
		<>
			{isPov(name) ? <ScreenPOV draw={drawPC} t={t} {...pcPOV(t)} /> : null}
			{name === 'b7' ? (
				<>
					<Viewfinder t={t} start={BEATS.b7} label="1080p 60fps" />
					<Title t={t} />
					<Subtitle t={t} />
					<Flash t={t} at={BEATS.pognali} dur={0.2} color="#fff4dc" peak={0.3} />
				</>
			) : null}
			{white > 0 ? <Fade color="#ffffff" opacity={white} /> : null}
			{black > 0 ? <Fade color="#000000" opacity={black} /> : null}
		</>
	);
};

// сверка с готовым сценарием экранов (src/screens/sequence.ts): клики и склейки должны совпадать
const check = (a: number, b: number, what: string) => {
	if (Math.abs(a - b) > 1e-6) console.warn(`b-room: ${what} в beats.ts (${a}) не совпадает со сценарием экранов (${b})`);
};
check(BEATS.monitorOn, PC_TIMING.screenOn, 'monitorOn');
check(BEATS.mcClick, PC_TIMING.mcClick, 'mcClick');
check(BEATS.menuClick, PC_TIMING.menuClick, 'menuClick');
check(BEATS.rowClick, PC_TIMING.rowClick, 'rowClick');
check(BEATS.connectClick, PC_TIMING.connectClick, 'connectClick');
check(BEATS.b4, PC_TIMING.b4, 'b4');
check(BEATS.b6, PC_TIMING.b6, 'b6');
check(BEATS.voiceClick, PC_TIMING.voiceClick, 'voiceClick');
check(BEATS.recClick, PC_TIMING.recClick, 'recClick');
check(BEATS.b7, PC_TIMING.b7, 'b7');

export const scene: SceneDef = {id: 'b-room', camera, World, Overlay, post};
