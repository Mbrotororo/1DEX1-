import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Glow} from './chars/extras';
import {noise1} from './rng';
import {dataTexture} from './textures';
import {B} from './voxel/blocks';
import {tileData} from './voxel/tiles';
import type {TreeLight} from './voxel/builders';
import {InstancedBlocks} from './voxel/InstancedBlocks';
import type {BlockInst} from './voxel/world';

// Реквизит: факел, фонарь, спавнер испытаний, хранилище с ключами, медная решётка, гирлянда ёлки.
// Везде position — в блоках; у «блочных» предметов это центр нижней грани клетки (x+0.5, y, z+0.5).

const PXB = 1 / 16;

// плавное мерцание огня -1..1
export const flicker = (t: number, seed = 0) => noise1(t * 9, seed) * 0.6 + noise1(t * 23, seed + 5) * 0.4;

// Факел: палочка с огоньком и тёплым свечением. lit 0..1 — горит ли (0 — потух).
// wall — если факел висит на стене: направление ОТ стены [dx, dz] (он наклонится и сдвинется к стене).
export const Torch: React.FC<{position: [number, number, number]; t: number; lit?: number; wall?: [number, number]; seed?: number; glow?: number; scale?: number}> = ({
	position,
	t,
	lit = 1,
	wall,
	seed = 0,
	glow = 1,
	scale = 1,
}) => {
	const stick = useMemo(() => new THREE.MeshBasicMaterial({color: '#6b4a25'}), []);
	const flame = useMemo(() => new THREE.MeshBasicMaterial({color: '#ffe27a', fog: false}), []);
	const core = useMemo(() => new THREE.MeshBasicMaterial({color: '#ff9a2e', fog: false}), []);
	const f = flicker(t, seed);
	const tilt = wall ? 0.42 : 0;
	const yaw = wall ? Math.atan2(wall[0], wall[1]) : 0;
	const off = wall ? 0.34 : 0;
	return (
		<group position={[position[0] - (wall ? wall[0] * off : 0), position[1] + (wall ? 0.2 : 0), position[2] - (wall ? wall[1] * off : 0)]} rotation={[0, yaw, 0]} scale={scale}>
			<group rotation={[tilt, 0, 0]}>
				<mesh material={stick} position={[0, 0.31, 0]}>
					<boxGeometry args={[0.125, 0.62, 0.125]} />
				</mesh>
				{lit > 0.02 ? (
					<>
						<mesh material={core} position={[0, 0.66, 0]} scale={lit}>
							<boxGeometry args={[0.16, 0.16, 0.16]} />
						</mesh>
						<mesh material={flame} position={[0, 0.7 + f * 0.012, 0]} scale={lit * (0.9 + f * 0.12)}>
							<boxGeometry args={[0.09, 0.14, 0.09]} />
						</mesh>
						<Glow position={[0, 0.7, 0]} size={(3.4 + f * 0.5) * glow} opacity={(0.5 + f * 0.12) * lit} />
					</>
				) : null}
			</group>
		</group>
	);
};

// Фонарь: стоит на блоке или висит на цепочке (hanging — длина цепи в блоках)
export const Lantern: React.FC<{position: [number, number, number]; t: number; hanging?: number; lit?: number; color?: string; seed?: number; glow?: number}> = ({
	position,
	t,
	hanging = 0,
	lit = 1,
	color = '#ffb74a',
	seed = 0,
	glow = 1,
}) => {
	const iron = useMemo(() => new THREE.MeshBasicMaterial({color: '#3a3d46'}), []);
	const light = useMemo(() => new THREE.MeshBasicMaterial({fog: false}), []);
	light.color.set(color).lerp(new THREE.Color('#fff4d0'), 0.45).multiplyScalar(0.25 + 0.75 * lit);
	const f = flicker(t, seed);
	const sway = hanging > 0 ? Math.sin(t * 1.3 + seed) * 0.05 : 0;
	const y0 = hanging > 0 ? -hanging - 9 * PXB : 0;
	return (
		<group position={position} rotation={[sway, 0, sway * 0.6]}>
			{hanging > 0 ? (
				<mesh material={iron} position={[0, -hanging / 2, 0]}>
					<boxGeometry args={[PXB, hanging, PXB]} />
				</mesh>
			) : null}
			<group position={[0, y0, 0]}>
				<mesh material={iron} position={[0, 0.5 * PXB, 0]}>
					<boxGeometry args={[6 * PXB, PXB, 6 * PXB]} />
				</mesh>
				<mesh material={light} position={[0, 4 * PXB, 0]}>
					<boxGeometry args={[5 * PXB, 6 * PXB, 5 * PXB]} />
				</mesh>
				{[-1, 1].flatMap((sx) =>
					[-1, 1].map((sz) => (
						<mesh key={`${sx}${sz}`} material={iron} position={[sx * 2.5 * PXB, 4 * PXB, sz * 2.5 * PXB]}>
							<boxGeometry args={[PXB, 7 * PXB, PXB]} />
						</mesh>
					)),
				)}
				<mesh material={iron} position={[0, 7.5 * PXB, 0]}>
					<boxGeometry args={[6 * PXB, PXB, 6 * PXB]} />
				</mesh>
				<mesh material={iron} position={[0, 8.5 * PXB, 0]}>
					<boxGeometry args={[2 * PXB, PXB, 2 * PXB]} />
				</mesh>
				<Glow position={[0, 4 * PXB, 0]} color={color} size={(3 + f * 0.35) * glow} opacity={(0.5 + f * 0.08) * lit} />
			</group>
		</group>
	);
};

// Спавнер испытаний: клетка размером в блок, внутри крутится огонь.
// active 0..1 — разгорается (оранжевый огонь, искры по углам); 0 — тлеет синим.
export const TrialSpawner: React.FC<{position: [number, number, number]; t: number; active?: number; scale?: number}> = ({position, t, active = 0, scale = 1}) => {
	const mats = useMemo(
		() => ({
			frame: new THREE.MeshLambertMaterial({color: '#4c5560'}),
			plate: new THREE.MeshLambertMaterial({color: '#39404a'}),
			trim: new THREE.MeshLambertMaterial({color: '#c9783f'}),
			flame: new THREE.MeshBasicMaterial({fog: false}),
			core: new THREE.MeshBasicMaterial({fog: false}),
		}),
		[],
	);
	const a = Math.min(1, Math.max(0, active));
	mats.flame.color.set('#3b6fd0').lerp(new THREE.Color('#ff8a1e'), a);
	mats.core.color.set('#9cc4ff').lerp(new THREE.Color('#ffe9a0'), a);
	mats.trim.emissive.set('#ff7a1e').multiplyScalar(a * 0.8);
	const f = flicker(t, 3);
	const spin = t * (1.2 + a * 5);
	const size = 0.2 + a * 0.2 + f * 0.02;
	const bar = 2 * PXB;
	const edges: [number, number, number, number, number, number][] = [];
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) edges.push([sx * (0.5 - bar / 2), 0.5, sz * (0.5 - bar / 2), bar, 1, bar]);
	for (const sy of [0, 1]) {
		for (const s of [-1, 1]) {
			edges.push([s * (0.5 - bar / 2), sy === 0 ? bar / 2 : 1 - bar / 2, 0, bar, bar, 1 - bar * 2]);
			edges.push([0, sy === 0 ? bar / 2 : 1 - bar / 2, s * (0.5 - bar / 2), 1 - bar * 2, bar, bar]);
		}
	}
	return (
		<group position={position} scale={scale}>
			{edges.map((e, i) => (
				<mesh key={i} material={i < 4 ? mats.frame : mats.trim} position={[e[0], e[1], e[2]]}>
					<boxGeometry args={[e[3], e[4], e[5]]} />
				</mesh>
			))}
			<mesh material={mats.plate} position={[0, PXB * 1.5, 0]}>
				<boxGeometry args={[1 - bar * 2, PXB, 1 - bar * 2]} />
			</mesh>
			<mesh material={mats.plate} position={[0, 1 - PXB * 1.5, 0]}>
				<boxGeometry args={[1 - bar * 2, PXB, 1 - bar * 2]} />
			</mesh>
			{/* огонь: два вложенных кубика, крутятся навстречу */}
			<mesh material={mats.flame} position={[0, 0.5 + Math.sin(t * 3) * 0.03, 0]} rotation={[spin * 0.7, spin, 0.6]} scale={size * 1.5}>
				<boxGeometry args={[1, 1, 1]} />
			</mesh>
			<mesh material={mats.core} position={[0, 0.5 + Math.sin(t * 3) * 0.03, 0]} rotation={[-spin, spin * 0.6, 0.3]} scale={size * 0.9}>
				<boxGeometry args={[1, 1, 1]} />
			</mesh>
			<Glow position={[0, 0.5, 0]} color={a > 0.5 ? '#ff8a1e' : '#4f86e8'} size={2.2 + a * 2.4 + f * 0.3} opacity={0.3 + a * 0.4} />
		</group>
	);
};

// Хранилище-сундук с тремя замочными скважинами. lid 0..1 — открытие крышки;
// keys — сколько ключей вставлено (0..3, дробное — ключ «поворачивается»); glow 0..1 — свет изнутри.
// Передняя сторона смотрит на +z (поверни rotationY). Размер — чуть меньше блока.
export const Vault: React.FC<{position: [number, number, number]; t: number; lid?: number; keys?: number; glow?: number; rotationY?: number; scale?: number}> = ({
	position,
	t,
	lid = 0,
	keys = 0,
	glow = 0,
	rotationY = 0,
	scale = 1,
}) => {
	const mats = useMemo(
		() => ({
			body: new THREE.MeshLambertMaterial({color: '#3f565c'}),
			dark: new THREE.MeshLambertMaterial({color: '#27383d'}),
			copper: new THREE.MeshLambertMaterial({color: '#c9783f'}),
			gold: new THREE.MeshLambertMaterial({color: '#f6c544'}),
			hole: [0, 1, 2].map(() => new THREE.MeshBasicMaterial({color: '#0b0d10', fog: false})),
			inside: new THREE.MeshBasicMaterial({color: '#ffe38a', fog: false}),
		}),
		[],
	);
	mats.hole.forEach((m, i) => {
		const k = Math.min(1, Math.max(0, keys - i));
		m.color.set('#0b0d10').lerp(new THREE.Color('#ffb347'), k);
	});
	mats.gold.emissive.set('#ffb000').multiplyScalar(0.15 + glow * 0.5);
	const open = Math.min(1, Math.max(0, lid));
	const u = PXB;
	return (
		<group position={position} rotation={[0, rotationY, 0]} scale={scale}>
			{/* корпус */}
			<mesh material={mats.body} position={[0, 4.5 * u, 0]}>
				<boxGeometry args={[14 * u, 9 * u, 14 * u]} />
			</mesh>
			<mesh material={mats.dark} position={[0, 0.5 * u, 0]}>
				<boxGeometry args={[15 * u, 1 * u, 15 * u]} />
			</mesh>
			{[-1, 1].map((s) => (
				<mesh key={s} material={mats.copper} position={[s * 6.6 * u, 4.5 * u, 6.6 * u]}>
					<boxGeometry args={[1.4 * u, 9.2 * u, 1.4 * u]} />
				</mesh>
			))}
			<mesh material={mats.copper} position={[0, 8.6 * u, 7.05 * u]}>
				<boxGeometry args={[14.2 * u, 1 * u, 0.4 * u]} />
			</mesh>
			{/* три скважины с золотой рамкой */}
			{[-1, 0, 1].map((s, i) => (
				<group key={s} position={[s * 3.6 * u, 4.4 * u, 7.05 * u]}>
					<mesh material={mats.gold}>
						<boxGeometry args={[2.6 * u, 3.6 * u, 0.3 * u]} />
					</mesh>
					<mesh material={mats.hole[i]} position={[0, 0.3 * u, 0.12 * u]}>
						<boxGeometry args={[1.2 * u, 1.2 * u, 0.2 * u]} />
					</mesh>
					<mesh material={mats.hole[i]} position={[0, -0.7 * u, 0.12 * u]}>
						<boxGeometry args={[0.6 * u, 1.4 * u, 0.2 * u]} />
					</mesh>
				</group>
			))}
			{/* свет изнутри */}
			{open > 0.02 ? (
				<mesh material={mats.inside} position={[0, 8.9 * u, 0]} rotation={[-Math.PI / 2, 0, 0]}>
					<planeGeometry args={[12 * u, 12 * u]} />
				</mesh>
			) : null}
			{/* крышка на петле сзади */}
			<group position={[0, 9 * u, -7 * u]} rotation={[-open * 1.35, 0, 0]}>
				<mesh material={mats.body} position={[0, 2.5 * u, 7 * u]}>
					<boxGeometry args={[14 * u, 5 * u, 14 * u]} />
				</mesh>
				<mesh material={mats.copper} position={[0, 5.2 * u, 7 * u]}>
					<boxGeometry args={[10 * u, 0.6 * u, 10 * u]} />
				</mesh>
				<mesh material={mats.gold} position={[0, 1.2 * u, 14.2 * u]}>
					<boxGeometry args={[2.4 * u, 2.4 * u, 0.6 * u]} />
				</mesh>
			</group>
			{glow > 0.01 ? <Glow position={[0, 12 * u, 0]} color="#ffd060" size={3 + glow * 4 + Math.sin(t * 7) * 0.2} opacity={0.65 * glow} /> : null}
		</group>
	);
};

// Медная решётка-ворота из блоков: width × height блоков, стоит в плоскости XY (axis 'x') или ZY (axis 'z').
// position — нижний угол проёма (целые координаты блока). open 0..1 — уезжает вверх.
export const CopperGate: React.FC<{position: [number, number, number]; width: number; height: number; open?: number; axis?: 'x' | 'z'; block?: number; tint?: THREE.ColorRepresentation; shake?: number}> = ({
	position,
	width,
	height,
	open = 0,
	axis = 'x',
	block = B.copperGrate,
	tint,
	shake = 0,
}) => {
	const blocks = useMemo(() => {
		const out: BlockInst[] = [];
		for (let i = 0; i < width; i++) {
			for (let j = 0; j < height; j++) out.push({x: position[0] + (axis === 'x' ? i : 0), y: position[1] + j, z: position[2] + (axis === 'z' ? i : 0), id: block});
		}
		return out;
	}, [position[0], position[1], position[2], width, height, axis, block]);
	const lift = Math.min(1, Math.max(0, open)) * height;
	return (
		<InstancedBlocks
			blocks={blocks}
			tint={tint}
			animate={(_b, _i, out) => {
				out.y = lift + shake;
			}}
		/>
	);
};

// Огоньки гирлянды и звезда новогодней ёлки (см. newYearTree). on 0..1 — общая яркость, blink — мигание 0..1.
export const TreeLights: React.FC<{lights: TreeLight[]; star?: [number, number, number]; t: number; on?: number; blink?: number; glow?: number}> = ({lights, star, t, on = 1, blink = 0.6, glow = 1}) => {
	const geo = useMemo(() => new THREE.BoxGeometry(0.2, 0.2, 0.2), []);
	const starMat = useMemo(() => new THREE.MeshBasicMaterial({color: '#ffe066', fog: false}), []);
	if (on <= 0.01) return null;
	return (
		<>
			{lights.map((l, i) => {
				// каждый огонёк мигает в своей фазе
				const k = on * (1 - blink * (0.5 + 0.5 * Math.sin(t * 5.5 + l.phase * 6.28 + Math.floor(l.phase * 3) * 2.1)));
				return (
					<group key={i} position={l.pos}>
						<mesh geometry={geo} scale={0.7 + k * 0.4}>
							<meshBasicMaterial color={l.color} fog={false} />
						</mesh>
						<Glow position={[0, 0, 0]} color={l.color} size={1.5 * glow} opacity={0.75 * k} />
					</group>
				);
			})}
			{star ? (
				<group position={star} rotation={[0, t * 1.2, 0]} scale={on}>
					<mesh material={starMat} rotation={[0, 0, Math.PI / 4]}>
						<boxGeometry args={[0.62, 0.62, 0.16]} />
					</mesh>
					<mesh material={starMat}>
						<boxGeometry args={[0.62, 0.62, 0.16]} />
					</mesh>
					<Glow position={[0, 0, 0]} color="#ffd84a" size={(3.6 + Math.sin(t * 4) * 0.4) * glow} opacity={0.8 * on} />
				</group>
			) : null}
		</>
	);
};

// Булава — настоящая объёмная модель (главный предмет ролика, должна читаться с любого ракурса).
// held — в руке персонажа (handR/handL): рукоять в кулаке, навершие вперёд и чуть вверх; добавь rotation,
// чтобы поднять её над головой: rotation={[-1.3, 0, 0]} — навершием вдоль руки.
// Без held начало координат — центр булавы, ось — вдоль Y (навершие вверху); length — длина в блоках.
export const Mace: React.FC<{
	held?: boolean;
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: number;
	length?: number;
	// собственное свечение 0..1 (в тёмном подземелье, в луче света)
	glow?: number;
	// подмешать цвет 0..1 (вспышка удара, иней)
	mix?: number;
	mixColor?: THREE.ColorRepresentation;
}> = ({held = false, position, rotation, scale = 1, length = 1, glow = 0, mix = 0, mixColor = '#ffffff'}) => {
	const mats = useMemo(
		() => ({
			head: new THREE.MeshLambertMaterial({color: '#59626e'}),
			edge: new THREE.MeshLambertMaterial({color: '#9aa6b4'}),
			dark: new THREE.MeshLambertMaterial({color: '#373e47'}),
			rod: new THREE.MeshLambertMaterial({color: '#bcd6ec'}),
			gem: new THREE.MeshLambertMaterial({color: '#9a6cf0', emissive: '#6a3cd0', emissiveIntensity: 0.6}),
		}),
		[],
	);
	const tint = new THREE.Color(mixColor);
	const base: Record<string, string> = {head: '#59626e', edge: '#9aa6b4', dark: '#373e47', rod: '#bcd6ec'};
	for (const key of ['head', 'edge', 'dark', 'rod'] as const) {
		mats[key].color.set(base[key]).lerp(tint, mix);
		mats[key].emissive.set(base[key]).multiplyScalar(glow * 0.6);
	}
	if (scale <= 0.0001) return null;
	// модель в пикселях (1/16 блока): рукоять 13, навершие 6 — всего 18 в длину
	const u = (length / 18) * scale;
	const model = (
		<>
			<mesh material={mats.dark} position={[0, 0.9, 0]}>
				<boxGeometry args={[2.4, 1.8, 2.4]} />
			</mesh>
			<mesh material={mats.rod} position={[0, 7, 0]}>
				<boxGeometry args={[1.5, 11, 1.5]} />
			</mesh>
			<mesh material={mats.dark} position={[0, 12.2, 0]}>
				<boxGeometry args={[3, 1, 3]} />
			</mesh>
			{/* навершие: тяжёлый куб с рёбрами по четырём сторонам */}
			<mesh material={mats.head} position={[0, 15.2, 0]}>
				<boxGeometry args={[5, 5.4, 5]} />
			</mesh>
			{[0, 1, 2, 3].map((i) => (
				<group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
					<mesh material={mats.edge} position={[0, 15.2, 3]}>
						<boxGeometry args={[1.4, 4.2, 1.6]} />
					</mesh>
					<mesh material={mats.gem} position={[1.7, 15.2, 2.55]}>
						<boxGeometry args={[0.9, 1.2, 0.3]} />
					</mesh>
				</group>
			))}
			<mesh material={mats.edge} position={[0, 18.2, 0]}>
				<boxGeometry args={[3, 0.9, 3]} />
			</mesh>
		</>
	);
	if (held) {
		// хват на четверти рукояти; ось булавы — вперёд и чуть вверх от кулака
		return (
			<group position={position} rotation={rotation}>
				<group position={[0, -0.02, 0.05]} rotation={[1.36, 0, 0]} scale={u}>
					<group position={[0, -3.2, 0]}>{model}</group>
				</group>
			</group>
		);
	}
	return (
		<group position={position} rotation={rotation} scale={u}>
			<group position={[0, -9.4, 0]}>{model}</group>
		</group>
	);
};

// Полупрозрачная ледяная глыба (персонаж вмёрз в лёд — его видно сквозь неё).
// position — центр нижней грани; size — [ширина, высота, глубина] в блоках. grow 0..1 — глыба вырастает снизу.
let iceTex: THREE.DataTexture | null = null;
export const IceCube: React.FC<{position: [number, number, number]; size?: [number, number, number]; opacity?: number; grow?: number; color?: THREE.ColorRepresentation; rotationY?: number}> = ({
	position,
	size = [1.4, 2.3, 1.4],
	opacity = 0.55,
	grow = 1,
	color = '#dff2ff',
	rotationY = 0,
}) => {
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const mat = useMemo(() => {
		if (!iceTex) {
			iceTex = dataTexture(tileData('ice'), 16, 16, true);
			iceTex.wrapS = THREE.RepeatWrapping;
			iceTex.wrapT = THREE.RepeatWrapping;
		}
		return new THREE.MeshBasicMaterial({map: iceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide});
	}, []);
	mat.opacity = opacity;
	mat.color.set(color);
	const g = Math.min(1, Math.max(0, grow));
	if (g <= 0.001 || opacity <= 0.003) return null;
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={geo} material={mat} position={[0, (size[1] * g) / 2, 0]} scale={[size[0], size[1] * g, size[2]]} renderOrder={6} />
		</group>
	);
};

// текстура одного тайла блока (для моделей реквизита)
const tileTextures = new Map<string, THREE.DataTexture>();
const tileTexture = (name: string) => {
	let tex = tileTextures.get(name);
	if (!tex) {
		tex = dataTexture(tileData(name), 16, 16, true);
		tileTextures.set(name, tex);
	}
	return tex;
};

// Деревянный сундук с откидной крышкой. lid 0..1 — открытие. Лицо (замок) смотрит в +z; поверни rotationY.
// glow 0..1 — свет изнутри (блеск сокровищ). Занимает чуть меньше блока.
export const Chest: React.FC<{position: [number, number, number]; lid?: number; rotationY?: number; glow?: number; glowColor?: string; scale?: number}> = ({position, lid = 0, rotationY = 0, glow = 0, glowColor = '#8ff4ea', scale = 1}) => {
	const mats = useMemo(
		() => ({
			side: new THREE.MeshLambertMaterial({map: tileTexture('chest_side')}),
			top: new THREE.MeshLambertMaterial({map: tileTexture('chest_top')}),
			latch: new THREE.MeshLambertMaterial({color: '#c8c8d2'}),
			dark: new THREE.MeshLambertMaterial({color: '#2a1a08'}),
			inside: new THREE.MeshBasicMaterial({fog: false}),
		}),
		[],
	);
	mats.inside.color.set('#2a1a08').lerp(new THREE.Color(glowColor), glow);
	const open = Math.min(1, Math.max(0, lid));
	const u = PXB;
	return (
		<group position={position} rotation={[0, rotationY, 0]} scale={scale}>
			<mesh material={mats.side} position={[0, 5 * u, 0]}>
				<boxGeometry args={[14 * u, 10 * u, 14 * u]} />
			</mesh>
			<mesh material={mats.inside} position={[0, 10.05 * u, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[12 * u, 12 * u]} />
			</mesh>
			{/* крышка на петле сзади */}
			<group position={[0, 10 * u, -7 * u]} rotation={[-open * 1.4, 0, 0]}>
				<mesh material={mats.top} position={[0, 2 * u, 7 * u]}>
					<boxGeometry args={[14 * u, 4 * u, 14 * u]} />
				</mesh>
				<mesh material={mats.dark} position={[0, 0.02 * u, 7 * u]} rotation={[Math.PI / 2, 0, 0]}>
					<planeGeometry args={[12 * u, 12 * u]} />
				</mesh>
				<mesh material={mats.latch} position={[0, 0.2 * u, 14.4 * u]}>
					<boxGeometry args={[2 * u, 4 * u, 1 * u]} />
				</mesh>
			</group>
			{glow > 0.01 && open > 0.1 ? <Glow position={[0, 12 * u, 0]} color={glowColor} size={2.2 + glow * 1.6} opacity={0.6 * glow * open} /> : null}
		</group>
	);
};

// Дверь на петлях (проём 1x2 блока). position — нижний угол проёма со стороны петли (целые координаты блока),
// дверь в закрытом виде тянется от петли вдоль +x. open 0..1 — распахивается (на 100° в сторону +z;
// отрицательное значение — в сторону -z). rotationY поворачивает всю дверь вокруг петли.
export const Door: React.FC<{position: [number, number, number]; open?: number; rotationY?: number; tint?: THREE.ColorRepresentation}> = ({position, open = 0, rotationY = 0, tint = '#ffffff'}) => {
	const mats = useMemo(() => ({top: new THREE.MeshLambertMaterial({map: tileTexture('door_top')}), bottom: new THREE.MeshLambertMaterial({map: tileTexture('door_bottom')})}), []);
	mats.top.color.set(tint);
	mats.bottom.color.set(tint);
	const t = 3 * PXB;
	return (
		<group position={[position[0], position[1], position[2] + t / 2]} rotation={[0, rotationY - open * 1.75, 0]}>
			<mesh material={mats.bottom} position={[0.5, 0.5, 0]}>
				<boxGeometry args={[1, 1, t]} />
			</mesh>
			<mesh material={mats.top} position={[0.5, 1.5, 0]}>
				<boxGeometry args={[1, 1, t]} />
			</mesh>
		</group>
	);
};
