import React, {useMemo} from 'react';
import * as THREE from 'three';
import {hash3} from '../rng';
import {paintTexture} from '../textures';
import {PX} from './Humanoid';

// Свинка и «вихрь» — ветряной моб для мини-босса.

const PINK_DARK = '#e08a86';
let pigSkin: THREE.DataTexture | null = null;
const getPigSkin = () =>
	(pigSkin ??= paintTexture(16, 16, (x, y) => {
		const r = hash3(x, y, 19, 50);
		const k = r < 0.15 ? 0.92 : r > 0.85 ? 1.05 : 1;
		return [Math.round(240 * k), Math.round(168 * k), Math.round(164 * k)];
	}));

export type PigProps = {
	// точка под животом на земле
	position: [number, number, number];
	rotationY?: number;
	scale?: number;
	// фаза шага (радианы); 0 — стоит
	legSwing?: number;
	headYaw?: number;
	// наклон вперёд/назад (испуг, прыжок)
	tilt?: number;
	// кувырок вокруг оси взгляда (закручивает вихрем)
	roll?: number;
	hurt?: number;
	// подмешать белый (превращается в снег) 0..1
	whiten?: number;
};

export const Pig: React.FC<PigProps> = ({position, rotationY = 0, scale = 1, legSwing = 0, headYaw = 0, tilt = 0, roll = 0, hurt = 0, whiten = 0}) => {
	const pink = useMemo(() => new THREE.MeshLambertMaterial({map: getPigSkin()}), []);
	const snout = useMemo(() => new THREE.MeshLambertMaterial({color: PINK_DARK}), []);
	const white = useMemo(() => new THREE.MeshLambertMaterial({color: '#ffffff'}), []);
	const black = useMemo(() => new THREE.MeshLambertMaterial({color: '#1b1414'}), []);
	const nostril = useMemo(() => new THREE.MeshLambertMaterial({color: '#8f5050'}), []);
	pink.color.set('#ffffff').lerp(new THREE.Color('#ff5a5a'), hurt * 0.7);
	pink.emissive.setRGB(whiten * 0.8 + hurt * 0.3, whiten * 0.85, whiten * 0.9);
	snout.emissive.copy(pink.emissive);
	if (scale <= 0.0001) return null;
	const k = PX * scale;

	const leg = (x: number, z: number, phase: number) => (
		<group position={[x, 6, z]} rotation={[legSwing === 0 ? 0 : Math.sin(legSwing + phase) * 0.6, 0, 0]}>
			<mesh material={pink} position={[0, -3, 0]}>
				<boxGeometry args={[4, 6, 4]} />
			</mesh>
		</group>
	);

	return (
		<group position={position} rotation={[tilt, rotationY, roll, 'YXZ']} scale={k}>
			{leg(-3, 5, 0)}
			{leg(3, 5, Math.PI)}
			{leg(-3, -6, Math.PI)}
			{leg(3, -6, 0)}
			<mesh material={pink} position={[0, 10, 0]}>
				<boxGeometry args={[10, 8, 16]} />
			</mesh>
			<group position={[0, 12, 7]} rotation={[0, headYaw, 0]}>
				<mesh material={pink} position={[0, 0, 4]}>
					<boxGeometry args={[8, 8, 8]} />
				</mesh>
				<mesh material={snout} position={[0, -1.5, 8.5]}>
					<boxGeometry args={[4, 3, 1]} />
				</mesh>
				{[-1, 1].map((s) => (
					<React.Fragment key={s}>
						<mesh material={white} position={[s * 3.5, 1.5, 8.05]}>
							<boxGeometry args={[1, 1, 0.2]} />
						</mesh>
						<mesh material={black} position={[s * 2.5, 1.5, 8.05]}>
							<boxGeometry args={[1, 1, 0.2]} />
						</mesh>
						<mesh material={nostril} position={[s * 1.5, -1.5, 9.05]}>
							<boxGeometry args={[1, 1, 0.2]} />
						</mesh>
					</React.Fragment>
				))}
			</group>
		</group>
	);
};

// ---------- вихрь: парящая голова с глазами над столбом вращающегося ветра ----------
export type BreezeProps = {
	// точка на полу под мобом
	position: [number, number, number];
	t: number;
	rotationY?: number;
	scale?: number;
	// высота парения над полом, блоки
	hover?: number;
	// заряд перед выстрелом 0..1: кольца ускоряются, глаза и ядро светятся
	charge?: number;
	hurt?: number;
	// 0..1: рассыпается (кольца разлетаются, тает)
	dissolve?: number;
	// наклон тела (рывок, отдача)
	tilt?: [number, number];
};

const RING_LEVELS = [
	{y: 0.25, r: 0.34, n: 6, speed: 5.2, h: 0.22},
	{y: 0.62, r: 0.5, n: 7, speed: -3.6, h: 0.3},
	{y: 1.02, r: 0.4, n: 6, speed: 4.4, h: 0.26},
];

export const Breeze: React.FC<BreezeProps> = ({position, t, rotationY = 0, scale = 1, hover = 0.35, charge = 0, hurt = 0, dissolve = 0, tilt = [0, 0]}) => {
	const mats = useMemo(
		() => ({
			head: new THREE.MeshLambertMaterial({color: '#a9c4ee'}),
			headDark: new THREE.MeshLambertMaterial({color: '#6f8fc8'}),
			eye: new THREE.MeshBasicMaterial({color: '#eaf6ff', fog: false}),
			pupil: new THREE.MeshBasicMaterial({color: '#2b3f8f'}),
			rod: new THREE.MeshLambertMaterial({color: '#dbe9ff', emissive: '#6f8fc8', emissiveIntensity: 0.35}),
			wind: new THREE.MeshBasicMaterial({color: '#cfe4ff', transparent: true, opacity: 0.4, depthWrite: false}),
		}),
		[],
	);
	const fade = Math.max(0, 1 - dissolve);
	if (fade <= 0.001 || scale <= 0.0001) return null;
	mats.head.color.set('#a9c4ee').lerp(new THREE.Color('#ff5a5a'), hurt * 0.7);
	mats.head.emissive.setRGB(0.25 * charge + hurt * 0.3, 0.45 * charge, 0.8 * charge);
	mats.eye.color.set('#eaf6ff').lerp(new THREE.Color('#7fe0ff'), charge);
	mats.wind.opacity = 0.4 * fade * (0.8 + 0.2 * Math.sin(t * 9));
	const bob = Math.sin(t * 2.6) * 0.08;
	const spin = 1 + charge * 2.2;
	const spread = 1 + dissolve * 2.4;

	return (
		<group position={[position[0], position[1] + hover + bob, position[2]]} rotation={[tilt[0], rotationY, tilt[1], 'YXZ']} scale={scale}>
			{/* столб ветра: три яруса стержней и полупрозрачных лент */}
			{RING_LEVELS.map((lvl, li) => (
				<group key={li} position={[0, lvl.y - dissolve * 0.3, 0]} rotation={[0, t * lvl.speed * spin + li, 0]}>
					{Array.from({length: lvl.n}, (_, i) => {
						const a = (i / lvl.n) * Math.PI * 2;
						const r = lvl.r * spread * (1 + 0.08 * Math.sin(t * 7 + i));
						return (
							<mesh key={i} material={i % 2 === 0 ? mats.rod : mats.wind} position={[Math.cos(a) * r, Math.sin(t * 5 + i * 1.7) * 0.05, Math.sin(a) * r]} rotation={[0, -a, 0.35]} scale={fade}>
								<boxGeometry args={[0.07, lvl.h, i % 2 === 0 ? 0.07 : 0.3]} />
							</mesh>
						);
					})}
				</group>
			))}
			{/* голова */}
			<group position={[0, 1.55 + dissolve * 0.5, 0]} rotation={[Math.sin(t * 1.7) * 0.06, Math.sin(t * 1.1) * 0.12, 0]} scale={fade}>
				<mesh material={mats.head}>
					<boxGeometry args={[0.56, 0.5, 0.56]} />
				</mesh>
				<mesh material={mats.headDark} position={[0, 0.3, 0]}>
					<boxGeometry args={[0.42, 0.12, 0.42]} />
				</mesh>
				{/* «брови» ветра по бокам */}
				{[-1, 1].map((s) => (
					<mesh key={s} material={mats.headDark} position={[s * 0.33, 0.05, 0]} rotation={[0, 0, s * -0.3]}>
						<boxGeometry args={[0.1, 0.36, 0.4]} />
					</mesh>
				))}
				{[-1, 1].map((s) => (
					<React.Fragment key={`e${s}`}>
						<mesh material={mats.eye} position={[s * 0.14, 0.03, 0.285]}>
							<boxGeometry args={[0.14, 0.12, 0.02]} />
						</mesh>
						<mesh material={mats.pupil} position={[s * 0.14, 0.02, 0.297]}>
							<boxGeometry args={[0.06, 0.07, 0.01]} />
						</mesh>
					</React.Fragment>
				))}
			</group>
		</group>
	);
};
