import React, {useMemo} from 'react';
import * as THREE from 'three';
import {hash1, hash3} from '../core/rng';
import {Bx, boxGeometry, cachedGeo, cachedTex, canvasTexture, P16, vcMat} from './kit';

// Мелкий уют: стопка книг, кружка, цветок в горшке. Начало — центр низа, единица модели — 1/16 блока.

const COVERS = ['#8a2a26', '#2a4a8a', '#2e6a3a', '#b08a2a', '#5a2e7a', '#1e5a6a', '#6a3a1e'];

export type BookStackProps = {position: [number, number, number]; rotationY?: number; count?: number; seed?: number};
// Стопка книг (лежат плашмя, каждая чуть повёрнута)
export const BookStack: React.FC<BookStackProps> = ({position, rotationY = 0, count = 3, seed = 0}) => {
	const geo = cachedGeo(`bookstack-${count}-${seed}`, () => {
		const b: Bx[] = [];
		let y = 0;
		for (let i = 0; i < count; i++) {
			const w = 4.5 + hash1(i, seed + 1) * 2;
			const d = 3.2 + hash1(i, seed + 2) * 1.2;
			const h = 0.9 + hash1(i, seed + 3) * 0.8;
			const ox = (hash1(i, seed + 4) - 0.5) * 1.4;
			const c = COVERS[Math.floor(hash1(i, seed + 5) * COVERS.length)];
			b.push([ox - w / 2, y, -d / 2, ox + w / 2, y + h, d / 2, c, 0.06]);
			// страницы видны с трёх сторон
			b.push([ox - w / 2 + 0.3, y + 0.15, -d / 2 - 0.02, ox + w / 2 - 0.05, y + h - 0.15, d / 2 + 0.02, '#e6dcc4']);
			b.push([ox - w / 2 - 0.02, y + 0.15, -d / 2 + 0.3, ox + w / 2 + 0.02, y + h - 0.15, d / 2 - 0.3, '#e6dcc4']);
			y += h;
		}
		return boxGeometry(b, P16, seed);
	});
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={geo} material={vcMat()} />
		</group>
	);
};

// Кружка с чаем
export const Mug: React.FC<{position: [number, number, number]; rotationY?: number; color?: string}> = ({position, rotationY = 0, color = '#6a4aa8'}) => {
	const geo = cachedGeo(`mug-${color}`, () =>
		boxGeometry(
			[
				[-1.2, 0, -1.2, 1.2, 3, 1.2, color, 0.04],
				[-0.9, 2.4, -0.9, 0.9, 2.95, 0.9, '#5a3218'],
				[1.2, 0.7, -0.3, 2.0, 1.0, 0.3, color],
				[1.2, 2.0, -0.3, 2.0, 2.3, 0.3, color],
				[1.7, 0.7, -0.3, 2.0, 2.3, 0.3, color],
			],
			P16,
		),
	);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={geo} material={vcMat()} />
		</group>
	);
};

// Цветок в горшке (фикус из кубиков); листья чуть качаются
export const Plant: React.FC<{position: [number, number, number]; t?: number; scale?: number}> = ({position, t = 0, scale = 1}) => {
	const pot = cachedGeo('plant-pot', () =>
		boxGeometry(
			[
				[-3, 0, -3, 3, 5, 3, '#8a4a2e', 0.06],
				[-3.4, 4.4, -3.4, 3.4, 5.4, 3.4, '#9a5634'],
				[-2.6, 5.0, -2.6, 2.6, 5.3, 2.6, '#3a2616'],
				[-0.5, 5, -0.5, 0.5, 11, 0.5, '#4a5a22'],
			],
			P16,
		),
	);
	const leaves = cachedGeo('plant-leaves', () => {
		const b: Bx[] = [];
		for (let i = 0; i < 9; i++) {
			const a = i * 2.4;
			const r = 1.5 + hash1(i, 31) * 2.2;
			const y = 7 + i * 0.9;
			const x = Math.cos(a) * r;
			const z = Math.sin(a) * r;
			b.push([x - 1.4, y, z - 1.4, x + 1.4, y + 1.1, z + 1.4, i % 2 ? '#3f7a2e' : '#2f6224', 0.1]);
		}
		b.push([-1.6, 15, -1.6, 1.6, 16.6, 1.6, '#4a8a34']);
		return boxGeometry(b, P16, 9);
	});
	return (
		<group position={position} scale={scale}>
			<mesh geometry={pot} material={vcMat()} />
			<group position={[0, 5 * P16, 0]} rotation={[Math.sin(t * 0.9) * 0.02, 0, Math.sin(t * 0.7 + 1) * 0.02]}>
				<mesh geometry={leaves} material={vcMat()} position={[0, -5 * P16, 0]} />
			</group>
		</group>
	);
};

// ---------- кровать ----------
// Плед в фиолетовую клетку (как рубашка героя)
const plaidTex = () =>
	cachedTex('bed-plaid', () =>
		canvasTexture(
			32,
			32,
			(ctx) => {
				for (let y = 0; y < 32; y++) {
					for (let x = 0; x < 32; x++) {
						const a = (x & 7) < 2;
						const b = (y & 7) < 2;
						let c = a && b ? [52, 40, 92] : a || b ? [84, 68, 124] : [112, 94, 152];
						if ((x & 7) === 5 || (y & 7) === 5) c = c.map((v) => v * 0.6 + 150 * 0.4);
						const k = 0.94 + hash3(x, y, 1, 41) * 0.1;
						ctx.fillStyle = `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
						ctx.fillRect(x, y, 1, 1);
					}
				}
			},
			true,
		),
	);

export type BedProps = {
	// центр низа кровати; изголовье — в локальном +z
	position: [number, number, number];
	rotationY?: number;
	// ширина и длина, блоки
	width?: number;
	length?: number;
	// плед откинут 0..1 (0 — застелено)
	turned?: number;
};

// Кровать: рама тёмного дерева на ножках, матрас, плед в клетку со свесами, две подушки, изголовье с фиолетовой вставкой.
// Верх матраса — BED_TOP над полом.
export const BED_TOP = 10 * P16;
export const Bed: React.FC<BedProps> = ({position, rotationY = 0, width = 2, length = 2.9, turned = 0}) => {
	const W = width * 16;
	const L = length * 16;
	const wood = cachedGeo(`bed-${W}-${L}`, () => {
		const d = '#3e2716';
		const m = '#5a3a22';
		const b: Bx[] = [
			// ножки
			[-W / 2, 0, -L / 2, -W / 2 + 2, 3, -L / 2 + 2, d],
			[W / 2 - 2, 0, -L / 2, W / 2, 3, -L / 2 + 2, d],
			// рама
			[-W / 2, 3, -L / 2, W / 2, 6, L / 2, m, 0.06],
			// изнанка рамы чуть темнее по низу
			[-W / 2 + 0.2, 2.6, -L / 2 + 0.2, W / 2 - 0.2, 3, L / 2 - 0.2, d],
			// матрас
			[-W / 2 + 0.6, 6, -L / 2 + 0.6, W / 2 - 0.6, 10, L / 2 - 1.5, '#e8e2d6'],
			// изнанка: изножье
			[-W / 2, 3, -L / 2 - 0.6, W / 2, 9, -L / 2, d, 0.05],
			[-W / 2, 9, -L / 2 - 0.8, W / 2, 10, -L / 2 + 0.2, m],
			// изголовье
			[-W / 2 - 0.4, 0, L / 2 - 1.5, W / 2 + 0.4, 22, L / 2, d, 0.05],
			[-W / 2 - 0.8, 22, L / 2 - 1.9, W / 2 + 0.8, 23.2, L / 2 + 0.2, m],
			[-W / 2 + 2.5, 11, L / 2 - 1.7, W / 2 - 2.5, 20, L / 2 - 1.5, '#5a3e8e'],
			// подушки
			[-W / 2 + 1.6, 10, L / 2 - 7.5, -0.8, 12.6, L / 2 - 2, '#f2eee8', 0.04],
			[0.8, 10, L / 2 - 7.5, W / 2 - 1.6, 12.6, L / 2 - 2, '#ece6f2', 0.04],
			[-W / 2 + 2, 12.6, L / 2 - 7, -1.2, 13.0, L / 2 - 2.5, '#f8f6f2'],
			[1.2, 12.6, L / 2 - 7, W / 2 - 2, 13.0, L / 2 - 2.5, '#f4f0f8'],
		];
		return boxGeometry(b, P16, 81);
	});
	const mats = useMemo(() => {
		const tex = plaidTex().clone();
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(width * 1.2, length * 0.9);
		tex.needsUpdate = true;
		return {plaid: new THREE.MeshLambertMaterial({map: tex}), sheet: new THREE.MeshLambertMaterial({color: '#efe9de'})};
	}, [width, length]);
	// плед: от изножья до подушек, свисает по бокам; отогнутый край простыни
	const k = Math.max(0, Math.min(1, turned));
	const bl = (L - 10) * (1 - k * 0.45);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={wood} material={vcMat()} />
			<mesh material={mats.plaid} position={[0, 7.25 * P16, (-L / 2 + bl / 2 - 0.4) * P16]}>
				<boxGeometry args={[(W + 1.2) * P16, 6.1 * P16, (bl + 0.8) * P16]} />
			</mesh>
			<mesh material={mats.sheet} position={[0, 10.15 * P16, (-L / 2 + bl + 0.6) * P16]}>
				<boxGeometry args={[(W + 0.6) * P16, 0.5 * P16, 2.4 * P16]} />
			</mesh>
		</group>
	);
};
