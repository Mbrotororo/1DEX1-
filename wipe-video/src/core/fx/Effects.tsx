import React, {useMemo} from 'react';
import * as THREE from 'three';
import {clamp01, easeOutCubic, type Vec3} from '../anim';
import {Glow} from '../chars/extras';
import {TEX} from '../textures';
import {Burst} from './Particles';

// Готовые эффекты: дымок, ударная волна, столб света, салют.

const SMOKE = ['#f2f2f2', '#d8d8d8', '#b8b8b8', '#ffffff'];

// Облачко дыма (моб лопнул, что-то исчезло)
export const Poof: React.FC<{t: number; at: number; origin: Vec3; count?: number; colors?: string[]; size?: number; seed?: number}> = ({t, at, origin, count = 18, colors = SMOKE, size = 1, seed = 21}) => (
	<Burst t={t} at={at} origin={origin} count={count} seed={seed} colors={colors} speed={[0.8, 2.6]} shape="sphere" gravity={1.6} drag={2.6} life={[0.4, 0.9]} size={[0.14 * size, 0.34 * size]} spawn={0.6 * size} />
);

// Ударная волна по земле: расходящееся кольцо + выбитые кубики
export const Shockwave: React.FC<{
	t: number;
	at: number;
	// центр на земле
	origin: Vec3;
	// до какого радиуса расходится
	radius?: number;
	duration?: number;
	color?: THREE.ColorRepresentation;
	// цвета выбитых кубиков (снег, земля, лёд); пусто — без кубиков
	debris?: string[];
	count?: number;
	seed?: number;
}> = ({t, at, origin, radius = 5, duration = 0.6, color = '#ffffff', debris = ['#ffffff', '#e6f0fa', '#cfe0f0'], count = 40, seed = 31}) => {
	const k = (t - at) / duration;
	const ring =
		k > 0 && k < 1 ? (
			<mesh position={[origin[0], origin[1] + 0.06, origin[2]]} rotation={[-Math.PI / 2, 0, 0]} scale={easeOutCubic(k) * radius * 2.4} renderOrder={3}>
				<planeGeometry args={[1, 1]} />
				<meshBasicMaterial map={TEX.ring()} color={color} transparent opacity={(1 - k) * 0.9} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
			</mesh>
		) : null;
	return (
		<>
			{ring}
			{debris.length > 0 ? (
				<Burst t={t} at={at} origin={[origin[0], origin[1] + 0.1, origin[2]]} count={count} seed={seed} colors={debris} speed={[radius * 0.9, radius * 2.2]} shape="ring" gravity={-16} drag={2.2} life={[0.4, 0.9]} size={[0.12, 0.3]} />
			) : null}
		</>
	);
};

// Столб света (сундук открылся, луч с неба). amount 0..1 — яркость и толщина.
export const LightBeam: React.FC<{position: Vec3; height?: number; width?: number; color?: THREE.ColorRepresentation; amount?: number; t?: number}> = ({position, height = 12, width = 0.9, color = '#ffe08a', amount = 1, t = 0}) => {
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	if (amount <= 0.01) return null;
	const pulse = 1 + Math.sin(t * 6) * 0.05;
	const layer = (w: number, op: number, key: string) => (
		<mesh key={key} geometry={geo} position={[position[0], position[1] + height / 2, position[2]]} scale={[w * pulse, height, w * pulse]} renderOrder={4}>
			<meshBasicMaterial color={color} transparent opacity={op * amount} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
		</mesh>
	);
	return (
		<>
			{layer(width * amount, 0.5, 'a')}
			{layer(width * 0.55 * amount, 0.55, 'b')}
			<Glow position={[position[0], position[1] + 0.3, position[2]]} color={color} size={width * 6 * amount} opacity={0.7 * amount} />
		</>
	);
};

// Ракета салюта: яркая точка со шлейфом, взлетает к месту взрыва за 0.62 с до него
const TRAIL = 12;
export const Rocket: React.FC<{t: number; at: number; origin: Vec3; color?: string; climb?: number}> = ({t, at, origin, color = '#ffffff', climb = 26}) => {
	const mat = useMemo(() => new THREE.MeshBasicMaterial({transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false}), []);
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	mat.color.set(color);
	const start = at - 0.62;
	if (t < start || t >= at) return null;
	const cubes = [];
	for (let i = 0; i < TRAIL; i++) {
		const tau = (t - start - i * 0.018) / 0.62;
		if (tau <= 0) continue;
		// взлёт с замедлением + лёгкое покачивание
		const e = 1 - Math.pow(1 - tau, 2);
		const y = origin[1] - climb * (1 - e);
		const wobble = Math.sin(tau * 22) * 0.25 * (1 - tau);
		cubes.push(<mesh key={i} geometry={geo} material={mat} position={[origin[0] + wobble, y, origin[2] + wobble]} scale={0.42 * (1 - i / TRAIL)} />);
	}
	return <>{cubes}</>;
};

// Залп салюта целиком: ракета, вспышка и разлетающиеся огни. origin — точка взрыва.
export const Firework: React.FC<{t: number; at: number; origin: Vec3; colors: string[]; seed?: number; size?: number; count?: number}> = ({t, at, origin, colors, seed = 71, size = 1, count = 130}) => {
	const flash = clamp01((t - at) / 0.35);
	return (
		<>
			<Rocket t={t} at={at} origin={origin} color={colors[0]} />
			{t >= at && flash < 1 ? <Glow position={origin} color={colors[0]} size={(8 + flash * 26) * size} opacity={Math.pow(1 - flash, 1.5)} onTop /> : null}
			<Burst t={t} at={at} origin={origin} count={count} seed={seed} colors={colors} speed={[9 * size, 21 * size]} shape="sphere" gravity={-4} drag={2.4} life={[0.8, 1.6]} size={[0.2 * size, 0.46 * size]} additive />
		</>
	);
};
