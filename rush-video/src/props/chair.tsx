import React from 'react';
import {Bx, boxGeometry, cachedGeo, P16, vcMat} from './kit';

// Игровое кресло (чёрное с фиолетовым). Начало — центр крестовины на полу, сиденье смотрит в локальный +z.
// Верх подушки сиденья — 0.5 блока над полом (SEAT_HEIGHT). Поворот верхней части (spin) не крутит крестовину.

export const SEAT_HEIGHT = 0.5;
// где стоит персонаж в позе sit() относительно кресла (локально, до поворота): чуть позади центра сиденья
export const SEAT_HIP: [number, number, number] = [0, SEAT_HEIGHT, -0.16];

const BLK = '#17171c';
const BLK2 = '#222229';
const PUR = '#6a46b8';
const PUR_D = '#4a3088';
const CHROME = '#9aa0aa';

const baseGeo = () =>
	cachedGeo('chair-base', () => {
		const b: Bx[] = [
			[-0.7, 1.6, -0.7, 0.7, 6.2, 0.7, CHROME],
			[-1.1, 1.0, -1.1, 1.1, 2.6, 1.1, BLK2],
		];
		return boxGeometry(b, P16);
	});
// луч крестовины с колёсиком (вдоль +z), копии поворачиваются
const spokeGeo = () =>
	cachedGeo('chair-spoke', () =>
		boxGeometry(
			[
				[-0.6, 1.0, 0, 0.6, 1.8, 5.8, BLK2],
				[-0.7, 0, 5.0, 0.7, 1.3, 6.4, '#0c0c10'],
			],
			P16,
		),
	);
const seatGeo = () =>
	cachedGeo('chair-seat', () => {
		const b: Bx[] = [
			[-3.5, 6.0, -3.5, 3.5, 6.6, 3.5, '#2a2a30'],
			// подушка сиденья с фиолетовыми боковыми валиками
			[-5.4, 6.5, -5.2, 5.4, 7.6, 5.2, BLK, 0.04],
			[-4.2, 7.6, -4.6, 4.2, 8.0, 4.6, BLK],
			[-5.6, 6.6, -5.0, -4.2, 8.2, 5.0, PUR],
			[4.2, 6.6, -5.0, 5.6, 8.2, 5.0, PUR],
			[-0.4, 7.62, -4.4, 0.4, 8.02, 4.4, PUR_D],
			// подлокотники
			[-8.0, 6.6, -1.0, -7.2, 11.0, 0.0, BLK2],
			[7.2, 6.6, -1.0, 8.0, 11.0, 0.0, BLK2],
			[-8.3, 11.0, -3.0, -6.9, 11.8, 2.4, BLK],
			[6.9, 11.0, -3.0, 8.3, 11.8, 2.4, BLK],
			[-7.2, 6.6, -1.0, -5.4, 7.2, 0.0, BLK2],
			[5.4, 6.6, -1.0, 7.2, 7.2, 0.0, BLK2],
		];
		return boxGeometry(b, P16, 51);
	});
const backGeo = () =>
	cachedGeo('chair-back', () => {
		// спинка: начало — нижний край спинки у сиденья (y = 0, z = 0), идёт вверх
		const b: Bx[] = [
			[-5.0, 0, -1.8, 5.0, 17.5, 0, BLK, 0.04],
			[-4.0, 17.5, -1.8, 4.0, 18.6, 0, BLK],
			// крылья
			[-6.0, 0.5, -2.2, -4.4, 16.5, 0.8, PUR],
			[4.4, 0.5, -2.2, 6.0, 16.5, 0.8, PUR],
			[-6.1, 9, -2.2, -4.3, 16.8, 1.2, PUR],
			[4.3, 9, -2.2, 6.1, 16.8, 1.2, PUR],
			// фиолетовая полоса по центру и вырезы под ремни
			[-0.6, 1.5, 0, 0.6, 15, 0.25, PUR_D],
			[-2.6, 14.6, -1.9, -1.4, 16.2, 0.1, '#060608'],
			[1.4, 14.6, -1.9, 2.6, 16.2, 0.1, '#060608'],
			// подушки: поясничная и под шею
			[-3.0, 2.5, 0, 3.0, 5.2, 1.2, BLK2],
			[-2.6, 12.4, 0, 2.6, 14.4, 1.1, BLK2],
			[-1.2, 12.9, 1.1, 1.2, 13.9, 1.2, PUR],
		];
		return boxGeometry(b, P16, 52);
	});

export type GamingChairProps = {
	position: [number, number, number];
	// поворот всего кресла (смотрит в +z при 0)
	rotationY?: number;
	// поворот сиденья относительно крестовины (кресло крутится), рад
	spin?: number;
	// качание всего сиденья назад (+) / вперёд (−), рад
	tilt?: number;
	// откинутая спинка, рад
	recline?: number;
	// поворот колёсиков (катится): угол разворота роликов, рад
	casters?: number;
	scale?: number;
};

export const GamingChair: React.FC<GamingChairProps> = ({position, rotationY = 0, spin = 0, tilt = 0, recline = 0, casters = 0, scale = 1}) => (
	<group position={position} rotation={[0, rotationY, 0]} scale={scale}>
		<mesh geometry={baseGeo()} material={vcMat()} />
		{[0, 1, 2, 3, 4].map((i) => (
			<group key={i} rotation={[0, (i / 5) * Math.PI * 2 + 0.3, 0]}>
				<mesh geometry={spokeGeo()} material={vcMat()} />
				<mesh geometry={cachedGeo('chair-caster', () => boxGeometry([[-0.25, 0.2, -0.6, 0.25, 1.0, 0.6, '#3a3a44']], P16))} material={vcMat()} position={[0, 0, 5.7 * P16]} rotation={[0, casters, 0]} />
			</group>
		))}
		<group position={[0, 6 * P16, 0]} rotation={[0, spin, 0]}>
			<group rotation={[-tilt, 0, 0]}>
				<group position={[0, -6 * P16, 0]}>
					<mesh geometry={seatGeo()} material={vcMat()} />
					<group position={[0, 7.8 * P16, -4.4 * P16]} rotation={[-0.12 - recline, 0, 0]}>
						<mesh geometry={backGeo()} material={vcMat()} />
					</group>
				</group>
			</group>
		</group>
	</group>
);

// Куда поставить героя в позе sit() для кресла в position/rotationY (spin — поворот сиденья):
// <Player position={s.position} rotationY={s.rotationY} pose={sit()} />
export const chairSeat = (position: [number, number, number], rotationY = 0, spin = 0): {position: [number, number, number]; rotationY: number} => {
	const a = rotationY + spin;
	const [lx, ly, lz] = SEAT_HIP;
	return {
		position: [position[0] + lx * Math.cos(a) + lz * Math.sin(a), position[1] + ly, position[2] - lx * Math.sin(a) + lz * Math.cos(a)],
		rotationY: a,
	};
};
