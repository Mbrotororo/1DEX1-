// Сцена a-home (0–16 с): пришёл из школы, 16:00, записка «вайп в 13:00», шок, бросил вещи, бегом наверх.
// Раскадровка — SPEC.md §3 (A1–A8), тайминг — beats.ts, звук — sfx.ts.
import React from 'react';
import {
	BlobShadow,
	Environment,
	Fade,
	Glow,
	PixelText,
	Player,
	SpeedLines,
	clamp01,
	easeInCubic,
	easeOutBack,
	easeOutCubic,
	impulse,
	noise1,
	prog,
	pulse,
	shadowFor,
	smooth,
	type SceneDef,
	type SceneProps,
} from '../../core';
import {House, HOUSE_ENV} from '../../sets/house';
import {slamOpen} from '../../props/doors';
import {Backpack, Beanie, Book} from '../../props/wear';
import {BEATS, BOOKS, RUN} from './beats';
import {camera, doorOpenAt, post, shotOf} from './cams';
import {Breath, DoorSnow, Dust, Flag, HatSnow} from './fx';
import {bagAt, bookAt, hatAt, hatSnow, heroAt} from './hero';

// ---------- 3D ----------
const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const {name} = shotOf(t);
	const up = name === 'corridor' || name === 'room';
	const env = name === 'room' ? HOUSE_ENV.bedroom : up ? HOUSE_ENV.upstairs : HOUSE_ENV.hallway;
	const area = up ? 'up' : name === 'stairs' ? 'all' : 'hall';
	// дверь: открылась в 1.2, сама закрылась к ~3.4
	const frontDoorOpen = doorOpenAt(t);
	// дверь комнаты: удар о стену ровно в BEATS.slam
	const bedroomDoorOpen = t < BEATS.slam - 0.2 ? 0 : slamOpen(t, BEATS.slam - 0.13, BEATS.slam, 0.14, 0.6);
	const h = heroAt(t);
	const hat = hatAt(t);
	const bag = bagAt(t);
	// где героя не видно (часы, записка) — не рисуем
	const heroVisible = name !== 'clock' && name !== 'note';
	// тень на полу; в прыжке — меньше и бледнее
	const sh = shadowFor(Math.max(0, h.pos[1] - h.ground));
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<House
				t={t}
				env={env}
				area={area}
				frontDoorOpen={frontDoorOpen}
				daylight={1}
				noteCircle={prog(t, BEATS.circle, BEATS.circleDur)}
				beanieOnHook={false}
				bedroomDoorOpen={bedroomDoorOpen}
				poster={assets.holyworld}
			/>
			{heroVisible ? (
				<>
					<BlobShadow x={h.pos[0]} z={h.pos[2]} y={h.ground + 0.01} size={1.15 * sh.size / shadowFor(0).size} opacity={0.42 * sh.opacity / shadowFor(0).opacity} />
					<Player
						skin={assets.skin}
						position={h.pos}
						rotationY={h.yaw}
						pose={h.pose}
						face={h.face}
						lean={h.lean}
						tumble={h.tumble}
						color={h.color}
						headSlot={
							hat.mode === 'worn' ? (
								<>
									<Beanie snow={0} />
									<HatSnow amount={hatSnow(t)} />
								</>
							) : null
						}
						backSlot={bag.mode === 'worn' ? <Backpack /> : null}
					/>
				</>
			) : null}
			{/* лестница и коридор: тёплый «киношный» подсвет, который бежит вместе с героем */}
			{name === 'stairs' || name === 'corridor' ? <pointLight position={[h.pos[0] + 1.2, h.pos[1] + 2.2, 1.9]} color="#ffb070" intensity={1.6} distance={4.5} decay={1.3} /> : null}
			{/* шапка в руке / в полёте / на крючке */}
			{hat.mode === 'loose' && !up ? (
				<group position={hat.pos} quaternion={hat.quat}>
					<Beanie mode="loose" snow={0} />
					<HatSnow amount={hat.snow} loose />
				</group>
			) : null}
			{/* рюкзак в руке / в полёте / на полу */}
			{bag.mode === 'loose' && !up ? (
				<group position={[bag.pos[0], 0, bag.pos[2]]} scale={[1 + bag.squash * 0.5, 1 - bag.squash, 1 + bag.squash * 0.5]}>
					<group position={[0, bag.pos[1], 0]} quaternion={bag.quat}>
						<Backpack mode="loose" open={clamp01(bag.open)} />
					</group>
				</group>
			) : null}
			{!up
				? BOOKS.map((b, i) => {
						const s = bookAt(b, i, t);
						return s.visible ? (
							<group key={i} position={s.pos} quaternion={s.quat}>
								<Book seed={b.seed} notebook={b.notebook} open={s.open} />
							</group>
						) : null;
					})
				: null}
			{/* комната: полоска тёплого света из коридора под закрытой дверью; тени ног пересекают её перед ударом */}
			{name === 'room' && bedroomDoorOpen < 0.02 ? <DoorLight t={t} /> : null}
			{/* дверь распахнулась: тёплый свет коридора за ним (контровой) */}
			{name === 'room' && bedroomDoorOpen >= 0.02 ? <Glow position={[20.5, 5.95, 1.6]} color="#ffb070" size={2.6} opacity={0.45 * Math.min(1, bedroomDoorOpen * 2) * (1 - smooth(prog(t, 15.6, 0.3)))} /> : null}
			{/* входная дверь открыта: низ перемычки освещён снегом (иначе — чёрная полоса над проёмом) */}
			{name === 'door' && frontDoorOpen > 0.01 ? (
				<mesh position={[2.5, 1.996, 7.5]} rotation={[Math.PI / 2, 0, 0]}>
					<planeGeometry args={[1.0, 1.0]} />
					<meshBasicMaterial color="#6f7a8c" transparent opacity={Math.min(1, frontDoorOpen * 3)} depthWrite={false} />
				</mesh>
			) : null}
			{name === 'door' ? (
				<>
					<DoorSnow t={t} />
					{/* тень на кирпичной стене и ковре: светло только у двери */}
					<Flag position={[2.5, 1.1, 6.97]} rotation={[0, Math.PI, 0]} size={[3.6, 2.9]} opacity={0.82} />
					<Flag position={[2.3, 0.075, 7.0]} rotation={[-Math.PI / 2, 0, 0]} size={[2.6, 3.4]} opacity={0.8} />
				</>
			) : null}
			{name === 'face' ? <Breath t={t} /> : null}
			{!up ? <Dust t={t} /> : null}
		</>
	);
};

// полоска света под дверью комнаты: яркая кромка + мягкий разлив по полу; тени ног (бег) перекрывают её
const DoorLight: React.FC<{t: number}> = ({t}) => {
	const st = RUN.at(t);
	const near = pulse(t, 14.94, 15.12, 0.05, 0.03);
	const sl = near * (0.5 + 0.5 * Math.sin(st.phase));
	const sr = near * (0.5 - 0.5 * Math.sin(st.phase));
	const flick = 1 - 0.35 * near;
	const strip = (x: number, w: number, op: number, color: string) => (
		<mesh position={[x, 5.003, 1.6]} rotation={[-Math.PI / 2, 0, 0]}>
			<planeGeometry args={[w, 0.92]} />
			<meshBasicMaterial color={color} transparent opacity={op} depthWrite={false} toneMapped={false} />
		</mesh>
	);
	const shadow = (z: number, op: number) =>
		op > 0.01 ? (
			<mesh position={[21.3, 5.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[0.62, 0.2]} />
				<meshBasicMaterial color="#000000" transparent opacity={0.9 * op} depthWrite={false} />
			</mesh>
		) : null;
	return (
		<>
			{/* светлая щель под полотном (видна и с низкой камеры) */}
			<mesh position={[21.006, 5.02, 1.6]} rotation={[0, Math.PI / 2, 0]}>
				<planeGeometry args={[0.92, 0.04]} />
				<meshBasicMaterial color="#ffe6b8" transparent opacity={flick * (1 - 0.6 * Math.max(sl, sr))} depthWrite={false} toneMapped={false} />
			</mesh>
			{strip(21.04, 0.08, flick, '#ffe0aa')}
			{strip(21.13, 0.26, 0.42 * flick, '#ffb468')}
			{strip(21.3, 0.6, 0.16 * flick, '#ff9a50')}
			{shadow(1.38, sl)}
			{shadow(1.78, sr)}
			<Glow position={[21.1, 5.08, 1.6]} color="#ffa860" size={1.8} opacity={0.8 * flick * (1 - 0.5 * Math.max(sl, sr))} />
		</>
	);
};

// ---------- титры и переходы ----------
const SHOCK_TEXT = 'Я ОПОЗДАЛ НА 3 ЧАСА?!';

const Overlay: React.FC<SceneProps> = ({t}) => {
	// A1: тихий титр слева внизу
	const cap = pulse(t, BEATS.captionFrom, BEATS.captionTo, 0.5, 0.5);
	// A5: надпись влетает с ударом в 8.25 и держится до ~9.5
	const ks = prog(t, BEATS.title, 0.11);
	const showTitle = t >= BEATS.title && t < BEATS.titleOut + 0.12;
	const out = easeInCubic(prog(t, BEATS.titleOut, 0.12));
	const slam = 1 + 1.6 * (1 - easeOutCubic(ks));
	const settle = 1 + 0.06 * Math.sin((t - BEATS.title - 0.11) * 30) * impulse(t, BEATS.title + 0.11, 9) + 0.02 * (t - BEATS.title);
	const jx = noise1(t * 30, 7) * 14 * impulse(t, BEATS.title + 0.08, 7) + noise1(t * 12, 8) * 2;
	const jy = noise1(t * 30, 9) * 10 * impulse(t, BEATS.title + 0.08, 7) + noise1(t * 12, 10) * 2;
	// A8: линии скорости
	const speed =
		0.35 * smooth(prog(t, BEATS.stairs + 0.1, 0.3)) * (1 - smooth(prog(t, BEATS.corridor - 0.1, 0.1))) +
		0.7 * smooth(prog(t, BEATS.corridor, 0.2)) * (1 - smooth(prog(t, BEATS.room - 0.02, 0.02))) +
		0.6 * smooth(prog(t, BEATS.slam, 0.06)) * (1 - smooth(prog(t, 15.55, 0.2)));
	// переходы: из черноты в начале, белая вспышка в конце (в b-room он уже в комнате)
	const black = 1 - easeOutCubic(prog(t, 0, BEATS.fadeIn));
	const white = 0.96 * easeInCubic(prog(t, BEATS.end - 0.16, 0.16));
	return (
		<>
			{speed > 0.01 ? <SpeedLines t={t} amount={speed} color="#fff1dc" count={40} /> : null}
			{cap > 0.003 ? (
				<>
					<div style={{position: 'absolute', left: 100, top: 932, width: 72 * cap + 8, height: 3, background: '#f0d9b5', opacity: 0.8 * cap}} />
					<PixelText x={100} y={980} size={50} align="left" color="#f6ecdd" color2="#e8cfa8" outlineColor="#120b06" opacity={cap} style={{transform: `translateY(${(1 - cap) * 8}px)`}}>
						СУББОТА · 21 НОЯБРЯ
					</PixelText>
				</>
			) : null}
			{showTitle ? (
				<PixelText
					x={960 + jx}
					y={936 + jy}
					size={140}
					color="#ffffff"
					color2="#ffb03a"
					outline={1}
					outlineColor="#1a0606"
					drop={1}
					style={{filter: 'drop-shadow(0 6px 0 rgba(0,0,0,0.5))'}}
					scale={slam * settle * (1 - out * 0.4)}
					opacity={clamp01(ks * 4) * (1 - out)}
					rotate={-3 + 2 * (1 - easeOutBack(ks, 2))}
				>
					{SHOCK_TEXT}
				</PixelText>
			) : null}
			{black > 0.002 ? <Fade color="#000000" opacity={black} /> : null}
			{white > 0.002 ? <Fade color="#ffffff" opacity={white} /> : null}
		</>
	);
};

export const scene: SceneDef = {id: 'a-home', camera, World, Overlay, post};
