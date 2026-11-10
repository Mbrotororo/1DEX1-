import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {clamp01, easeInOutCubic, easeOutBack, easeOutCubic, prog, track} from '../lib/anim';
import {mulberry32} from '../lib/rng';
import type {WorldTextures} from '../lib/textures';
import {T, WATER_MAX} from '../lib/timeline';
import {SOURCE_POS, waterTopAt} from '../lib/world';

// 3D-логотип FantasyVisual: белая скруглённая плашка и лавандовая «снежинка»,
// собранная из вокселей. Размеры ниже — в пикселях исходной картинки (195x195).

const SIZE = 195;
export const LOGO_WORLD = 7.5; // размер логотипа в блоках
const K = LOGO_WORLD / SIZE;
const LAVENDER = '#9692ee';
const PLATE_DEPTH = 14;
const VOXEL_DEPTH = 26;
const FLY = 0.7;

// Колонки и строки сетки логотипа
const COL = {
	A: [16.5, 40.5],
	B: [40.5, 64.5],
	C: [64.5, 88.5],
	M: [88.5, 106.5], // центральная колонка
	c: [106.5, 130.5],
	b: [130.5, 154.5],
	a: [154.5, 178.5],
} as const;
const ROWS: {y: [number, number]; cols: (keyof typeof COL)[]}[] = [
	{y: [15.75, 39.75], cols: ['M']},
	{y: [39.75, 56.25], cols: ['A', 'M', 'a']},
	{y: [56.25, 72.75], cols: ['B', 'M', 'b']},
	{y: [72.75, 89.25], cols: ['C', 'c']},
	{y: [89.25, 105.75], cols: ['M']},
	{y: [105.75, 122.25], cols: ['C', 'c']},
	{y: [122.25, 138.75], cols: ['B', 'M', 'b']},
	{y: [138.75, 155.25], cols: ['A', 'M', 'a']},
	{y: [155.25, 179.25], cols: ['M']},
];

type Voxel = {
	x: number;
	y: number;
	w: number;
	h: number;
	at: number;
	dirX: number;
	dirY: number;
	radius: number;
	swirl: number;
	z: number;
};

const buildVoxels = (): Voxel[] => {
	const rnd = mulberry32(2026);
	const list: Voxel[] = [];
	for (const row of ROWS) {
		for (const name of row.cols) {
			const [x0, x1] = COL[name];
			const [y0, y1] = row.y;
			const nx = Math.round((x1 - x0) / 6);
			const ny = Math.round((y1 - y0) / 6);
			const w = (x1 - x0) / nx;
			const h = (y1 - y0) / ny;
			for (let i = 0; i < nx; i++) {
				for (let j = 0; j < ny; j++) {
					const x = x0 + (i + 0.5) * w - SIZE / 2;
					const y = SIZE / 2 - (y0 + (j + 0.5) * h);
					const angle = rnd() * Math.PI * 2;
					list.push({
						x,
						y,
						w,
						h,
						at: 0,
						dirX: Math.cos(angle),
						dirY: Math.sin(angle),
						radius: 240 + rnd() * 220,
						swirl: (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 1.6),
						z: (rnd() - 0.5) * 420,
					});
				}
			}
		}
	}
	// воксели прилетают от центра к краям
	const maxD = Math.max(...list.map((v) => Math.hypot(v.x, v.y)));
	const span = T.voxEnd - T.voxStart - FLY;
	for (const v of list) {
		v.at = T.voxStart + (Math.hypot(v.x, v.y) / maxD) * span * 0.9 + rnd() * span * 0.1;
	}
	return list;
};

const plateGeometry = () => {
	const r = 28;
	const s = SIZE / 2;
	const shape = new THREE.Shape();
	shape.moveTo(-s + r, -s);
	shape.lineTo(s - r, -s);
	shape.quadraticCurveTo(s, -s, s, -s + r);
	shape.lineTo(s, s - r);
	shape.quadraticCurveTo(s, s, s - r, s);
	shape.lineTo(-s + r, s);
	shape.quadraticCurveTo(-s, s, -s, s - r);
	shape.lineTo(-s, -s + r);
	shape.quadraticCurveTo(-s, -s, -s + r, -s);
	const geo = new THREE.ExtrudeGeometry(shape, {depth: PLATE_DEPTH, bevelEnabled: false, curveSegments: 8});
	geo.translate(0, 0, -PLATE_DEPTH / 2);
	return geo;
};

const dummy = new THREE.Object3D();

// высота, на которой висит логотип
export const logoHeight = (t: number) =>
	track(t, [
		[T.riseStart, 11.5],
		[T.riseEnd, WATER_MAX + 4.8],
	]) +
	Math.sin(t * 1.7) * 0.16;

export const FantasyLogo: React.FC<{
	t: number;
	tex: WorldTextures;
	azimuth: number;
	// направление взгляда камеры — свечение ставим позади логотипа
	forward: THREE.Vector3;
}> = ({t, tex, azimuth, forward}) => {
	const voxels = useMemo(() => buildVoxels(), []);
	const plateGeo = useMemo(() => plateGeometry(), []);
	const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const plateMat = useMemo(
		() => new THREE.MeshLambertMaterial({color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.22}),
		[],
	);
	const voxelMat = useMemo(() => new THREE.MeshLambertMaterial({color: LAVENDER, emissive: LAVENDER}), []);
	const flowTex = useMemo(() => {
		const c = tex.waterFlow.clone();
		c.needsUpdate = true;
		return c;
	}, [tex]);

	const ref = useRef<THREE.InstancedMesh>(null);
	const settled = useRef(false);

	const y = logoHeight(t);
	// к финалу логотип чуть уменьшается, чтобы не закрывать игрока в лодке
	const shrink = track(t, [
		[T.riseStart, 1],
		[T.riseEnd, 0.75],
	]);
	const assembled = prog(t, T.voxStart, T.voxEnd - T.voxStart);
	const charge =
		t < T.strike ? Math.pow(prog(t, T.charge, T.strike - T.charge), 2) : Math.exp(-(t - T.strike) * 3.5);

	voxelMat.emissiveIntensity = 0.1 + charge * 1.6;

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) {
			settled.current = false;
			return;
		}
		const done = t >= T.voxEnd + 0.1;
		if (done && settled.current) return;
		settled.current = done;
		for (let i = 0; i < voxels.length; i++) {
			const v = voxels[i];
			const p = prog(t, v.at, FLY);
			if (p <= 0) {
				dummy.scale.setScalar(0);
				dummy.position.set(0, 0, 0);
			} else {
				// воксель летит по спирали и встаёт на своё место
				const e = easeOutCubic(p);
				const r = (1 - e) * v.radius;
				const a = (1 - e) * v.swirl;
				const ox = v.dirX * r;
				const oy = v.dirY * r;
				dummy.position.set(
					v.x + ox * Math.cos(a) - oy * Math.sin(a),
					v.y + ox * Math.sin(a) + oy * Math.cos(a),
					(1 - e) * v.z,
				);
				const pop = 1 + 0.45 * Math.sin(Math.PI * clamp01((p - 0.82) / 0.18));
				const grow = Math.min(1, p * 4);
				dummy.scale.set(v.w * grow * pop, v.h * grow * pop, VOXEL_DEPTH * grow);
				dummy.rotation.set(0, 0, (1 - e) * 4);
			}
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		dummy.rotation.set(0, 0, 0);
		mesh.instanceMatrix.needsUpdate = true;
	}, [t, voxels]);

	if (t < T.logoPlate) return null;

	// --- повороты и «дыхание» ---
	const spinIn = (1 - easeOutCubic(prog(t, T.logoPlate, 0.9))) * -Math.PI * 2;
	const spinDone = easeInOutCubic(prog(t, T.voxEnd, 0.6)) * Math.PI * 2;
	const spinFinale = easeInOutCubic(prog(t, T.finale + 0.1, 1.0)) * Math.PI * 2;
	const sway = Math.sin(t * 0.9) * 0.2 * assembled;
	const rotY = azimuth + spinIn + spinDone + spinFinale + sway;

	const plateScale = easeOutBack(prog(t, T.logoPlate, 0.55));
	const punch =
		1 +
		0.14 * Math.sin(Math.PI * prog(t, T.voxEnd, 0.35)) +
		(t >= T.strike ? 0.4 * Math.exp(-(t - T.strike) * 6) : 0) +
		charge * (t < T.strike ? 0.06 * Math.sin(t * 46) : 0);
	const jitter = t < T.strike ? charge * 0.12 : 0;
	const jx = Math.sin(t * 91) * jitter;
	const jy = Math.cos(t * 77) * jitter;

	// --- вспышка, луч и струя воды ---
	const flash = prog(t, T.strike, 0.5);
	const beam = t >= T.strike ? Math.sin(Math.PI * prog(t, T.strike, 0.55)) : 0;
	const surface = waterTopAt(-1, -1, t);
	const streamTop = y - (LOGO_WORLD * shrink) / 2 + 0.3;
	const streamIn = prog(t, T.waterStart - 0.05, 0.2);
	const streamOut = 1 - prog(t, T.riseEnd - 0.5, 0.5);
	const streamW = 1.0 * streamIn * streamOut;
	const streamLen = Math.max(0.01, streamTop - surface);
	flowTex.repeat.set(1, streamLen / 2);
	flowTex.offset.set(0, t * 4.5);

	const glowOpacity = 0.22 * plateScale + 0.25 * assembled + 0.5 * charge;

	return (
		<>
			<group
				position={[SOURCE_POS.x + jx, y + jy, SOURCE_POS.z]}
				rotation={[0, rotY, 0]}
				scale={K * plateScale * punch * shrink}
			>
				<mesh geometry={plateGeo} material={plateMat} />
				<instancedMesh ref={ref} args={[boxGeo, voxelMat, voxels.length]} frustumCulled={false} />
			</group>

			{/* мягкое свечение вокруг логотипа */}
			<sprite
				position={[SOURCE_POS.x + forward.x * 2.2, y + forward.y * 2.2, SOURCE_POS.z + forward.z * 2.2]}
				scale={21 + charge * 12}
				renderOrder={-1}
			>
				<spriteMaterial
					map={tex.glow}
					color={LAVENDER}
					transparent
					opacity={Math.min(1, glowOpacity)}
					depthWrite={false}
					blending={THREE.AdditiveBlending}
				/>
			</sprite>

			{/* вспышка в момент удара */}
			{flash > 0 && flash < 1 ? (
				<sprite
					position={[SOURCE_POS.x - forward.x * 4.5, y - forward.y * 4.5, SOURCE_POS.z - forward.z * 4.5]}
					scale={16 + flash * 80}
					renderOrder={6}
				>
					<spriteMaterial
						map={tex.glow}
						color="#ffffff"
						transparent
						opacity={Math.pow(1 - flash, 1.6)}
						depthWrite={false}
						blending={THREE.AdditiveBlending}
					/>
				</sprite>
			) : null}

			{/* луч от логотипа в землю */}
			{beam > 0.01 ? (
				<mesh position={[SOURCE_POS.x, streamTop / 2, SOURCE_POS.z]} scale={[beam * 2.2, streamTop, beam * 2.2]} renderOrder={4}>
					<boxGeometry args={[1, 1, 1]} />
					<meshBasicMaterial
						color="#d6d4ff"
						transparent
						opacity={0.75 * beam}
						depthWrite={false}
						blending={THREE.AdditiveBlending}
					/>
				</mesh>
			) : null}

			{/* струя воды из логотипа */}
			{streamW > 0.01 && t >= T.waterStart - 0.05 ? (
				<mesh
					position={[SOURCE_POS.x, surface + streamLen / 2, SOURCE_POS.z]}
					scale={[streamW, streamLen, streamW]}
					renderOrder={3}
				>
					<boxGeometry args={[1, 1, 1]} />
					<meshBasicMaterial map={flowTex} transparent opacity={0.85} depthWrite={false} />
				</mesh>
			) : null}
		</>
	);
};
