import React, {useMemo} from 'react';
import * as THREE from 'three';
import {POSE_ZERO, type Pose} from './poses';
import type {Skin, SkinBuild} from './skins';

// 3D-модель игрока Minecraft со скином 64x64. Все размеры внутри модели — в пикселях скина,
// персонаж смотрит в сторону +z, position — точка между ступнями.

// Настоящий масштаб игры: 32 пикселя роста = 1.875 блока
export const PX = 1.875 / 32;
export const PLAYER_HEIGHT = 1.875;
// высота глаз над ступнями, блоки
export const EYE_HEIGHT = 28 * PX;
const TEX = 64;

// Раскладка UV как в игре: (u, v) — левый верхний угол развёртки части тела
export const skinBox = (w: number, h: number, d: number, u: number, v: number, inflate = 0) => {
	const geo = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
	const rect = (x: number, y: number, rw: number, rh: number, flipY = false) => {
		const x1 = x / TEX;
		const x2 = (x + rw) / TEX;
		const y1 = 1 - y / TEX;
		const y2 = 1 - (y + rh) / TEX;
		// порядок вершин грани: левый верх, правый верх, левый низ, правый низ
		return flipY ? [x1, y2, x2, y2, x1, y1, x2, y1] : [x1, y1, x2, y1, x1, y2, x2, y2];
	};
	const faces = [
		rect(u + d + w, v + d, d, h), // +x — левая сторона персонажа
		rect(u, v + d, d, h), // -x — правая сторона
		rect(u + d, v, w, d), // верх
		rect(u + d + w, v, w, d, true), // низ
		rect(u + d, v + d, w, h), // перед
		rect(u + d + w + d, v + d, w, h), // спина
	];
	geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(faces.flat()), 2));
	return geo;
};

type Geos = Record<'head' | 'hat' | 'body' | 'jacket' | 'armR' | 'sleeveR' | 'armL' | 'sleeveL' | 'legR' | 'pantsR' | 'legL' | 'pantsL', THREE.BufferGeometry>;
const DIMS: Record<SkinBuild, {arm: number; limbD: number; leg: number}> = {
	classic: {arm: 4, limbD: 4, leg: 4},
	slim: {arm: 3, limbD: 4, leg: 4},
	skeleton: {arm: 2, limbD: 2, leg: 2},
};
const geoCache = new Map<SkinBuild, Geos>();
const geosFor = (build: SkinBuild): Geos => {
	let g = geoCache.get(build);
	if (g) return g;
	const {arm, limbD, leg} = DIMS[build];
	g = {
		head: skinBox(8, 8, 8, 0, 0),
		hat: skinBox(8, 8, 8, 32, 0, 0.5),
		body: skinBox(8, 12, 4, 16, 16),
		jacket: skinBox(8, 12, 4, 16, 32, 0.26),
		armR: skinBox(arm, 12, limbD, 40, 16),
		sleeveR: skinBox(arm, 12, limbD, 40, 32, 0.26),
		armL: skinBox(arm, 12, limbD, 32, 48),
		sleeveL: skinBox(arm, 12, limbD, 48, 48, 0.26),
		legR: skinBox(leg, 12, limbD, 0, 16),
		pantsR: skinBox(leg, 12, limbD, 0, 32, 0.26),
		legL: skinBox(leg, 12, limbD, 16, 48),
		pantsL: skinBox(leg, 12, limbD, 0, 48, 0.26),
	};
	geoCache.set(build, g);
	return g;
};

export type HumanoidProps = {
	skin: Skin;
	// точка между ступнями, блоки
	position: [number, number, number];
	// поворот вокруг вертикали: 0 — лицом к +z; cam.azimuth — лицом в камеру
	rotationY?: number;
	pose?: Pose;
	// наклон всего тела вокруг ступней: [вперёд, вбок], радианы (бег, ветер)
	lean?: [number, number];
	// кувырок вокруг центра тела: [тангаж (вперёд), крен (вбок)], радианы
	tumble?: [number, number];
	// сплющивание по высоте (приземление: 0.8; 1 — обычный)
	squash?: number;
	scale?: number;
	// предметы в руках: рисуются в «кулаке», единицы внутри — блоки (см. PixelItem held)
	handR?: React.ReactNode;
	handL?: React.ReactNode;
	// то, что надето на голову / висит над ней (единицы — блоки, центр — центр головы)
	headSlot?: React.ReactNode;
	// красная вспышка урона 0..1
	hurt?: number;
	// ледяной оттенок 0..1
	frozen?: number;
	// прозрачность 0..1 (послеобразы скорости)
	opacity?: number;
	// свой оттенок поверх скина (множитель)
	color?: THREE.ColorRepresentation;
	visible?: boolean;
};

const WHITE = new THREE.Color('#ffffff');
const HURT = new THREE.Color('#ff3b3b');
const ICE = new THREE.Color('#9fd4ff');
const tmp = new THREE.Color();

export const Humanoid: React.FC<HumanoidProps> = ({
	skin,
	position,
	rotationY = 0,
	pose = POSE_ZERO,
	lean = [0, 0],
	tumble = [0, 0],
	squash = 1,
	scale = 1,
	handR,
	handL,
	headSlot,
	hurt = 0,
	frozen = 0,
	opacity = 1,
	color,
	visible = true,
}) => {
	const geo = geosFor(skin.build);
	const {base, overlay} = useMemo(() => {
		const base = new THREE.MeshLambertMaterial({map: skin.map});
		const overlay = new THREE.MeshLambertMaterial({map: skin.map, alphaTest: 0.5, side: THREE.DoubleSide});
		if (skin.emissive) {
			base.emissiveMap = skin.emissive;
			overlay.emissiveMap = skin.emissive;
		}
		return {base, overlay};
	}, [skin]);

	// оттенки урона/льда и прозрачность — прямо в материалы (свои у каждого персонажа)
	tmp.copy(WHITE);
	if (color !== undefined) tmp.set(color);
	tmp.lerp(ICE, frozen * 0.75).lerp(HURT, hurt * 0.7);
	for (const m of [base, overlay]) {
		m.color.copy(tmp);
		if (skin.emissive) {
			m.emissive.setRGB(1, 1, 1);
			m.emissiveIntensity = 1.6;
		} else {
			m.emissive.setRGB(hurt * 0.45 + frozen * 0.1, frozen * 0.2, frozen * 0.32);
			m.emissiveIntensity = 1;
		}
		const ghost = opacity < 0.999;
		if (m.transparent !== ghost) {
			m.transparent = ghost;
			m.needsUpdate = true;
		}
		m.opacity = opacity;
		m.depthWrite = !ghost;
	}

	if (!visible || opacity <= 0.001 || scale <= 0.0001) return null;

	const k = PX * scale;
	const {arm} = DIMS[skin.build];
	const armX = 4 + arm / 2;
	const legX = skin.build === 'skeleton' ? 2 : 1.99;
	const dy = pose.dy ?? 0;
	const leanX = lean[0] + (pose.lean ?? 0);
	const hat = skin.overlay;
	const inv = 1 / PX;

	return (
		<group position={[position[0], position[1] + dy * scale, position[2]]} rotation={[0, rotationY, 0]}>
			<group rotation={[leanX, 0, lean[1]]}>
				<group position={[0, 16 * k, 0]} rotation={[tumble[0], 0, tumble[1]]}>
					<group position={[0, -16 * k, 0]} scale={[k, k * squash, k]}>
						{/* голова */}
						<group position={[0, 24, 0]} rotation={[pose.headPitch, pose.headYaw, 0, 'YXZ']}>
							<mesh geometry={geo.head} material={base} position={[0, 4, 0]} />
							{hat ? <mesh geometry={geo.hat} material={overlay} position={[0, 4, 0]} /> : null}
							{headSlot ? (
								<group position={[0, 4, 0]} scale={inv}>
									{headSlot}
								</group>
							) : null}
						</group>
						{/* тело */}
						<mesh geometry={geo.body} material={base} position={[0, 18, 0]} />
						{hat ? <mesh geometry={geo.jacket} material={overlay} position={[0, 18, 0]} /> : null}
						{/* правая рука */}
						<group position={[-armX, 22, 0]} rotation={[pose.armR[0], 0, pose.armR[1]]}>
							<mesh geometry={geo.armR} material={base} position={[0, -4, 0]} />
							{hat ? <mesh geometry={geo.sleeveR} material={overlay} position={[0, -4, 0]} /> : null}
							{handR ? (
								<group position={[0, -9, 0]} scale={inv}>
									{handR}
								</group>
							) : null}
						</group>
						{/* левая рука */}
						<group position={[armX, 22, 0]} rotation={[pose.armL[0], 0, pose.armL[1]]}>
							<mesh geometry={geo.armL} material={base} position={[0, -4, 0]} />
							{hat ? <mesh geometry={geo.sleeveL} material={overlay} position={[0, -4, 0]} /> : null}
							{handL ? (
								<group position={[0, -9, 0]} scale={inv}>
									{handL}
								</group>
							) : null}
						</group>
						{/* правая нога */}
						<group position={[-legX, 12, 0]} rotation={[pose.legR[0], pose.legR[1], 0, 'YXZ']}>
							<mesh geometry={geo.legR} material={base} position={[0, -6, 0]} />
							{hat ? <mesh geometry={geo.pantsR} material={overlay} position={[0, -6, 0]} /> : null}
						</group>
						{/* левая нога */}
						<group position={[legX, 12, 0]} rotation={[pose.legL[0], pose.legL[1], 0, 'YXZ']}>
							<mesh geometry={geo.legL} material={base} position={[0, -6, 0]} />
							{hat ? <mesh geometry={geo.pantsL} material={overlay} position={[0, -6, 0]} /> : null}
						</group>
					</group>
				</group>
			</group>
		</group>
	);
};

// Положение макушки персонажа (для ника): position + высота с учётом squash/scale
export const headTop = (position: [number, number, number], scale = 1, squash = 1, pose?: Pose): [number, number, number] => [
	position[0],
	position[1] + (PLAYER_HEIGHT * squash + (pose?.dy ?? 0)) * scale,
	position[2],
];
