import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Glow} from '../core/chars/extras';
import {clamp01} from '../core/anim';
import {Bx, boxGeometry, cachedGeo, P16, vcMat} from './kit';

// Видеокамера на штативе. Начало — центр штатива на полу, объектив смотрит в локальный +z.
// Центр объектива — LENS (локально): по нему ставится кадр «через видоискатель».

export const LENS: [number, number, number] = [0, 25.2 * P16, 8.6 * P16];

const LEG_TOP: [number, number, number] = [0, 20.5, 0];
const FEET: [number, number, number][] = [0, 1, 2].map((i) => {
	const a = (i / 3) * Math.PI * 2 + Math.PI;
	return [Math.sin(a) * 8.5, 0, Math.cos(a) * 8.5];
});

const headGeo = () =>
	cachedGeo('tripod-head', () => {
		const b: Bx[] = [
			// центральная колонна, головка, ручка панорамы
			[-0.6, 13, -0.6, 0.6, 21.5, 0.6, '#2a2b30'],
			[-1.6, 20.5, -1.6, 1.6, 22.0, 1.6, '#1c1d22'],
			[-1.0, 22.0, -1.0, 1.0, 22.6, 1.0, '#3a3b42'],
			[-0.35, 21.4, -8.0, 0.35, 22.0, -1.6, '#2a2b30'],
			[-0.5, 21.2, -9.6, 0.5, 22.2, -7.8, '#141418'],
			// растяжка ног
			[-3.6, 7.6, -0.3, 3.6, 8.0, 0.3, '#3a3b42'],
		];
		return boxGeometry(b, P16);
	});
const bodyGeo = () =>
	cachedGeo('tripod-cam', () => {
		const b: Bx[] = [
			// корпус камеры
			[-2.4, 22.6, -4.2, 2.4, 27.4, 4.0, '#1b1c21', 0.04],
			[-2.5, 22.6, -4.4, 2.5, 23.4, 4.2, '#26272e'],
			// объектив: бленда и кольца
			[-1.8, 23.4, 4.0, 1.8, 27.0, 7.6, '#141418'],
			[-1.95, 23.25, 5.2, 1.95, 27.15, 5.8, '#2e3038'],
			[-2.2, 23.0, 7.6, 2.2, 27.4, 9.0, '#101013'],
			// верхняя ручка и микрофон
			[-0.5, 27.4, -3.0, 0.5, 29.0, -2.2, '#26272e'],
			[-0.5, 28.4, -3.0, 0.5, 29.2, 2.6, '#26272e'],
			[-0.5, 27.4, 1.8, 0.5, 29.0, 2.6, '#26272e'],
			[-0.7, 29.2, 0.2, 0.7, 30.2, 4.4, '#3a3b42'],
			// откидной экран слева (сторона −x), видоискатель сзади
			[-3.0, 23.8, -3.4, -2.4, 26.8, 1.4, '#202128'],
			[-1.0, 25.4, -5.6, 1.0, 26.8, -4.2, '#26272e'],
			// аккумулятор сзади
			[-1.8, 23.2, -5.4, 1.8, 25.6, -4.2, '#333540'],
		];
		return boxGeometry(b, P16, 61);
	});

export type CameraTripodProps = {
	position: [number, number, number];
	rotationY?: number;
	t: number;
	// идёт запись 0..1 (красная лампа REC мигает раз в секунду)
	rec?: number;
	// поворот камеры на головке (панорама/наклон), рад
	pan?: number;
	tiltCam?: number;
};

export const CameraTripod: React.FC<CameraTripodProps> = ({position, rotationY = 0, t, rec = 1, pan = 0, tiltCam = 0}) => {
	const mats = useMemo(
		() => ({
			leg: new THREE.MeshLambertMaterial({color: '#2a2b31'}),
			foot: new THREE.MeshLambertMaterial({color: '#111114'}),
			ring: new THREE.MeshLambertMaterial({color: '#2c2e36'}),
			glass: new THREE.MeshBasicMaterial({color: '#0c1220'}),
			iris: new THREE.MeshBasicMaterial({color: '#1c2a48'}),
			glint: new THREE.MeshBasicMaterial({color: '#c8d8ff', toneMapped: false}),
			glint2: new THREE.MeshBasicMaterial({color: '#8aa0d8'}),
			lamp: new THREE.MeshBasicMaterial({toneMapped: false}),
			screen: new THREE.MeshBasicMaterial({color: '#2a3a5a', toneMapped: false}),
		}),
		[],
	);
	const legs = useMemo(
		() =>
			FEET.map((f) => {
				const top = new THREE.Vector3(...LEG_TOP).multiplyScalar(P16);
				const foot = new THREE.Vector3(...f).multiplyScalar(P16);
				const dir = top.clone().sub(foot);
				const len = dir.length();
				const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
				return {mid: foot.clone().add(top).multiplyScalar(0.5), len, q};
			}),
		[],
	);
	const blink = clamp01(rec) * (Math.floor(t * 2) % 2 === 0 ? 1 : 0.15);
	mats.lamp.color.set('#3a0606').lerp(new THREE.Color('#ff2a1a'), blink);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			{legs.map((l, i) => (
				<group key={i}>
					<mesh material={mats.leg} position={[l.mid.x, l.mid.y, l.mid.z]} quaternion={l.q}>
						<boxGeometry args={[0.8 * P16, l.len, 0.8 * P16]} />
					</mesh>
					<mesh material={mats.foot} position={[FEET[i][0] * P16, 0.3 * P16, FEET[i][2] * P16]}>
						<boxGeometry args={[1.4 * P16, 0.6 * P16, 1.4 * P16]} />
					</mesh>
				</group>
			))}
			<mesh geometry={headGeo()} material={vcMat()} />
			<group position={[0, 22.3 * P16, 0]} rotation={[-tiltCam, pan, 0]}>
				<group position={[0, -22.3 * P16, 0]}>
					<mesh geometry={bodyGeo()} material={vcMat()} />
					{/* объектив: тёмное стекло, кольцо и два блика */}
					<mesh material={mats.ring} position={[0, 25.2 * P16, 9.02 * P16]}>
						<planeGeometry args={[3.8 * P16, 3.8 * P16]} />
					</mesh>
					<mesh material={mats.glass} position={[0, 25.2 * P16, 9.04 * P16]}>
						<planeGeometry args={[2.8 * P16, 2.8 * P16]} />
					</mesh>
					<mesh material={mats.iris} position={[0, 25.2 * P16, 9.05 * P16]}>
						<planeGeometry args={[1.4 * P16, 1.4 * P16]} />
					</mesh>
					<mesh material={mats.glint} position={[0.75 * P16, 25.95 * P16, 9.07 * P16]}>
						<planeGeometry args={[0.6 * P16, 0.6 * P16]} />
					</mesh>
					<mesh material={mats.glint2} position={[-0.6 * P16, 24.6 * P16, 9.07 * P16]}>
						<planeGeometry args={[0.35 * P16, 0.35 * P16]} />
					</mesh>
					{/* лампа REC спереди сверху */}
					<mesh material={mats.lamp} position={[1.6 * P16, 27.0 * P16, 4.05 * P16]}>
						<boxGeometry args={[0.7 * P16, 0.7 * P16, 0.3 * P16]} />
					</mesh>
					{blink > 0.5 ? <Glow position={[1.6 * P16, 27.0 * P16, 4.3 * P16]} color="#ff2a1a" size={0.35} opacity={0.7 * blink} /> : null}
					{/* экранчик сбоку светится */}
					<mesh material={mats.screen} position={[-3.02 * P16, 25.3 * P16, -1.0 * P16]} rotation={[0, -Math.PI / 2, 0]}>
						<planeGeometry args={[4.2 * P16, 2.6 * P16]} />
					</mesh>
				</group>
			</group>
		</group>
	);
};

// Центр объектива в мире для штатива в position/rotationY
export const tripodLens = (position: [number, number, number], rotationY = 0): [number, number, number] => {
	const [lx, ly, lz] = LENS;
	return [position[0] + lx * Math.cos(rotationY) + lz * Math.sin(rotationY), position[1] + ly, position[2] - lx * Math.sin(rotationY) + lz * Math.cos(rotationY)];
};
