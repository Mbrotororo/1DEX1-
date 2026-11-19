// Частицы сцены a-home: снег в проёме двери, пар изо рта, пыль, снежная пыль с шапки.
import React from 'react';
import * as THREE from 'three';
import {Burst, Particles, clamp01, type Vec3} from '../../core';
import {BEANIE_ON_HOOK} from '../../sets/house/anchors';
import {ACT, BAG_REST, BEATS} from './beats';
import {headFrame, heroAt} from './hero';

// ---------- снег на шапке: свои неосвещаемые кусочки (у общего Beanie снег в тёплом свете становится бежевым) ----------
// координаты — пиксели скина от центра головы (как у надетой шапки), у брошенной — от центра шапки (−4.2 px)
const PXB = 1.875 / 32;
const HAT_SNOW: [number, number, number, number, number, number][] = [
	[-2.6, 6.45, -2.0, 0.2, 6.85, 0.6],
	[-1.3, 9.0, -1.2, 1.1, 9.35, 1.1],
	[0.6, 6.45, -1.0, 2.8, 6.8, 1.8],
	[-4.0, 6.2, 1.0, -2.2, 6.5, 3.4],
	[2.2, 6.2, -3.6, 3.9, 6.45, -1.6],
	[-4.9, 2.9, -1.5, -3.3, 3.15, 2.0],
	[1.4, 2.9, 4.4, 4.0, 3.12, 4.95],
];
// снег не освещается: в тёплом свете фонарей освещаемый белый становится бежевым
const snowMat = new THREE.MeshBasicMaterial({color: '#dbe3f0'});
// помпон перекрываем вязкой в цвет шапки: светлый лавандовый помпон в тёплом свете читался как кожа (лысина)
const pomMat = new THREE.MeshLambertMaterial({color: '#6e58a8'});
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const box = (b: [number, number, number, number, number, number], mat: THREE.Material, key: number) => {
	const [x0, y0, z0, x1, y1, z1] = b;
	return <mesh key={key} geometry={unitBox} material={mat} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} scale={[x1 - x0, y1 - y0, z1 - z0]} />;
};
export const HatSnow: React.FC<{amount: number; loose?: boolean}> = ({amount, loose = false}) => {
	const n = Math.round(clamp01(amount) * HAT_SNOW.length);
	return (
		<group scale={PXB} position={[0, loose ? -4.2 * PXB : 0, 0]}>
			{box([-1.8, 6.6, -1.8, 1.8, 9.1, 1.8], pomMat, 99)}
			{HAT_SNOW.slice(0, n).map((b, i) => box(b, snowMat, i))}
		</group>
	);
};

// ---------- A1: «флаги» — мягкая тень на стене и полу вокруг светлого пятна у двери ----------
// Тёмная полупрозрачная плоскость с радиальным вырезом: кирпич и ковёр уходят в тень, свет — только у двери.
let flagTex: THREE.Texture | null = null;
const flagTexture = (): THREE.Texture => {
	if (flagTex) return flagTex;
	const c = document.createElement('canvas');
	c.width = 128;
	c.height = 128;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
	grad.addColorStop(0, 'rgba(0,0,0,0)');
	grad.addColorStop(0.45, 'rgba(0,0,0,0.25)');
	grad.addColorStop(1, 'rgba(0,0,0,1)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	flagTex = new THREE.CanvasTexture(c);
	return flagTex;
};
// center — светлое пятно (мир), size — полуоси эллипса, opacity — глубина тени по краям
export const Flag: React.FC<{position: Vec3; rotation: [number, number, number]; size: [number, number]; opacity: number}> = ({position, rotation, size, opacity}) => (
	<mesh position={position} rotation={rotation} renderOrder={2}>
		<planeGeometry args={[size[0] * 2, size[1] * 2]} />
		<meshBasicMaterial map={flagTexture()} color="#000000" transparent opacity={opacity} depthWrite={false} />
	</mesh>
);

// ---------- A1: снегопад за дверью и порыв снега внутрь ----------
export const DoorSnow: React.FC<{t: number}> = ({t}) => {
	if (t < 1.0 || t > BEATS.a2 + 0.05) return null;
	return (
		<>
			{/* снегопад во дворе (видно только в проёме) */}
			<Particles
				count={260}
				seed={7}
				colors={['#ffffff', '#eaf1ff', '#dfe9fa']}
				fn={(_i, r, out) => {
					const v = 0.7 + r[3] * 0.7;
					const h = 4.6;
					const y = h - ((t * v + r[1] * h) % h);
					out.x = 0.4 + r[0] * 4.4 + Math.sin(t * 1.3 + r[4] * 6.3) * 0.18;
					out.y = y;
					// ветер к дому (−z): хлопья сносит к двери
					const zr = 6.0;
					out.z = 7.7 + ((r[2] * zr - t * (0.35 + r[5] * 0.4)) % zr + zr) % zr;
					out.s = 0.012 + r[6] * 0.018;
					out.ry = t * 1.7 + r[4] * 6;
				}}
			/>
			{/* порыв: хлопья влетают в открытую дверь и оседают на коврике */}
			<Particles
				count={85}
				seed={9}
				colors={['#e9f0fb', '#dfe8f5', '#cdd9ea']}
				fn={(_i, r, out) => {
					// рождаются, пока дверь открыта; больше всего — в первый момент
					const tb = BEATS.doorOpen + 0.08 + Math.pow(r[0], 1.7) * 1.75;
					const age = t - tb;
					const life = 0.9 + r[1] * 0.9;
					if (age < 0 || age > life) return;
					const k = 2.2;
					const vz = 2.0 + r[4] * 3.0;
					const dz = (vz * (1 - Math.exp(-k * age))) / k;
					const dx = ((r[5] - 0.5) * 1.6 * (1 - Math.exp(-k * age))) / k + Math.sin(age * 5 + r[6] * 6) * 0.05;
					const y0 = 0.15 + r[3] * 1.9;
					const y = y0 + (0.35 - r[6] * 0.6) * age - 0.55 * age * age;
					out.x = 2.05 + r[2] * 0.95 + dx;
					out.y = Math.max(0.012, y);
					out.z = 7.3 - dz;
					out.s = (0.01 + r[7] * 0.015) * (1 - clamp01((age - life + 0.25) / 0.25));
					out.rx = age * 6 + r[1] * 6;
					out.rz = age * 4;
				}}
			/>
		</>
	);
};

// ---------- A2: облачко пара на выдохе ----------
export const Breath: React.FC<{t: number}> = ({t}) => {
	const from = BEATS.exhale;
	if (t < from || t > from + 1.0) return null;
	const h = heroAt(t);
	const m = headFrame(h);
	const mouth = new THREE.Vector3(0, -0.16, 0.27).applyMatrix4(m);
	const fwd = new THREE.Vector3(0, -0.12, 1).transformDirection(m);
	return (
		<Particles
			count={46}
			seed={13}
			colors={['#ffffff', '#f1f1f4', '#e4e6ec']}
			opacity={0.33}
			fn={(_i, r, out) => {
				const tb = from + r[0] * 0.42;
				const age = t - tb;
				const life = 0.4 + r[1] * 0.45;
				if (age < 0 || age > life) return;
				const q = age / life;
				const d = 0.42 * (1 - Math.exp(-3.2 * age));
				const spread = 0.05 + q * 0.16;
				out.x = mouth.x + fwd.x * d + (r[2] - 0.5) * spread;
				out.y = mouth.y + fwd.y * d + (r[3] - 0.5) * spread + q * 0.14;
				out.z = mouth.z + fwd.z * d + (r[4] - 0.5) * spread;
				out.s = (0.02 + r[5] * 0.022) * (0.6 + q * 1.2) * (1 - q * q);
				out.ry = r[6] * 3;
			}}
		/>
	);
};

// ---------- пыль, снег с шапки, удар рюкзака ----------
export const Dust: React.FC<{t: number}> = ({t}) => (
	<>
		{/* шапка ударилась о крючок: снежная пыль */}
		{t > BEATS.hatLand - 0.01 && t < BEATS.hatLand + 0.8 ? (
			<Burst t={t} at={BEATS.hatLand} origin={BEANIE_ON_HOOK.position} count={14} colors={['#ffffff', '#e9f0fa']} speed={[0.4, 1.4]} shape="sphere" gravity={-3} drag={2.5} life={[0.35, 0.7]} size={[0.025, 0.05]} seed={3} />
		) : null}
		{/* рюкзак ударился о пол */}
		{t > BEATS.bagLand - 0.01 && t < BEATS.bagLand + 1.0 ? (
			<Burst t={t} at={BEATS.bagLand} origin={[BAG_REST[0], 0.05, BAG_REST[2]] as Vec3} count={22} colors={['#8a7458', '#a89276', '#6e5a44', '#c4b49c']} speed={[0.8, 2.4]} shape="ring" gravity={-2.5} drag={3} life={[0.4, 0.8]} size={[0.04, 0.09]} seed={5} />
		) : null}
		{/* рывок к лестнице: облачко пыли из-под ног */}
		{t > BEATS.turn && t < BEATS.turn + 1.0 ? (
			<>
				<Burst t={t} at={BEATS.turn + 0.06} origin={[ACT[0] - 0.05, 0.06, ACT[2] + 0.1]} count={26} colors={['#8a7458', '#a89276', '#6e5a44', '#c4b49c']} speed={[0.9, 2.6]} shape="ring" gravity={-1.5} drag={3.2} life={[0.45, 0.9]} size={[0.05, 0.12]} seed={8} />
				<Burst t={t} at={BEATS.turn + 0.1} origin={[ACT[0] + 0.1, 0.1, ACT[2]]} count={14} colors={['#9a8466', '#b8a488']} speed={[0.6, 1.6]} shape="cone" dir={[-0.2, 0.5, 1]} angle={0.7} gravity={-1.2} drag={2.5} life={[0.4, 0.8]} size={[0.05, 0.1]} seed={9} />
			</>
		) : null}
	</>
);
