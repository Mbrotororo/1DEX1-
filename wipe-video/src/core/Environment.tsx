import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import type {CameraState} from './camera';
import type {EnvState} from './env';
import {hash3, mulberry32, noise2} from './rng';
import {TEX} from './textures';

// Рисует окружение: градиентное небо, солнце/луну, звёзды, облака; ставит туман и свет.
// Всё небо привязано к положению камеры, поэтому до него нельзя «долететь».

const SKY_R = 900;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
	float h = normalize(vDir).y;
	// у горизонта широкая светлая полоса, выше — плавно к цвету зенита
	float k = pow(smoothstep(-0.05, 0.85, h), 0.62);
	gl_FragColor = vec4(mix(uHorizon, uTop, k), 1.0);
	#include <colorspace_fragment>
}
`;

const starGeometry = (seed: number, count: number) => {
	const rnd = mulberry32(seed);
	const pos = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const y = rnd() * 1.1 - 0.1;
		const a = rnd() * Math.PI * 2;
		const r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
		pos[i * 3] = Math.cos(a) * r * SKY_R * 0.95;
		pos[i * 3 + 1] = Math.min(1, y) * SKY_R * 0.95;
		pos[i * 3 + 2] = Math.sin(a) * r * SKY_R * 0.95;
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	return geo;
};

const STAR_LAYERS = [
	{seed: 1, count: 300, size: 2.5, color: '#aab4ff', speed: 1.3, phase: 0},
	{seed: 2, count: 190, size: 3.5, color: '#ffffff', speed: 2.1, phase: 2},
	{seed: 3, count: 80, size: 5, color: '#dcd6ff', speed: 0.9, phase: 4},
];

// ---------- облака ----------
const CLOUD_CELL = 12;
const CLOUD_RANGE = 16;
const CLOUD_MAX = (CLOUD_RANGE * 2 + 1) ** 2;
const dummy = new THREE.Object3D();

const CloudLayer: React.FC<{t: number; cam: CameraState; amount: number; color: string; height: number; speed: number}> = ({t, cam, amount, color, height, speed}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const mat = useMemo(() => new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, fog: false}), []);
	mat.color.set(color);
	mat.opacity = Math.min(1, amount * 1.6) * 0.9;

	const cx = Math.floor(cam.position.x / CLOUD_CELL);
	const cz = Math.floor(cam.position.z / CLOUD_CELL);
	const drift = t * speed;
	const driftCells = Math.floor(drift / CLOUD_CELL);
	const driftFrac = drift - driftCells * CLOUD_CELL;

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		let n = 0;
		if (amount > 0.01) {
			// чем больше amount, тем ниже порог шума — облаков больше
			const threshold = 0.74 - amount * 0.3;
			for (let i = -CLOUD_RANGE; i <= CLOUD_RANGE; i++) {
				for (let j = -CLOUD_RANGE; j <= CLOUD_RANGE; j++) {
					const gx = cx + i - driftCells;
					const gz = cz + j;
					const v = noise2(gx * 0.19, gz * 0.26, 501) * 0.75 + hash3(gx, 0, gz, 502) * 0.25;
					if (v < threshold) continue;
					// к краю поля облака сходят на нет, чтобы не было видно границы
					const edge = Math.max(Math.abs(i), Math.abs(j)) / CLOUD_RANGE;
					const s = edge > 0.8 ? 1 - (edge - 0.8) / 0.2 : 1;
					if (s <= 0.02) continue;
					dummy.position.set((cx + i) * CLOUD_CELL + driftFrac + CLOUD_CELL / 2, height + hash3(gx, 1, gz, 503) * 3, (cz + j) * CLOUD_CELL + CLOUD_CELL / 2);
					dummy.scale.set(CLOUD_CELL * s, 4 * s, CLOUD_CELL * s);
					dummy.updateMatrix();
					mesh.setMatrixAt(n++, dummy.matrix);
				}
			}
		}
		mesh.count = n;
		mesh.instanceMatrix.needsUpdate = true;
	}, [amount, cx, cz, driftCells, driftFrac, height]);

	return <instancedMesh ref={ref} args={[geo, mat, CLOUD_MAX]} frustumCulled={false} renderOrder={-5} visible={amount > 0.01} />;
};

export type EnvironmentProps = {
	env: EnvState;
	cam: CameraState;
	t: number;
	// высота слоя облаков и скорость их дрейфа (блоков в секунду)
	cloudHeight?: number;
	cloudSpeed?: number;
	// не ставить свет (если сцена освещает персонажей сама)
	noLights?: boolean;
};

export const Environment: React.FC<EnvironmentProps> = ({env, cam, t, cloudHeight = 96, cloudSpeed = 1.2, noLights = false}) => {
	const skyGeo = useMemo(() => new THREE.SphereGeometry(SKY_R, 24, 12), []);
	const skyMat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: {uTop: {value: new THREE.Color()}, uHorizon: {value: new THREE.Color()}},
				vertexShader: SKY_VERT,
				fragmentShader: SKY_FRAG,
				side: THREE.BackSide,
				depthTest: false,
				depthWrite: false,
				fog: false,
				toneMapped: false,
			}),
		[],
	);
	(skyMat.uniforms.uTop.value as THREE.Color).set(env.skyTop);
	(skyMat.uniforms.uHorizon.value as THREE.Color).set(env.skyHorizon);

	const starGeos = useMemo(() => STAR_LAYERS.map((l) => starGeometry(l.seed, l.count)), []);

	const sun = new THREE.Vector3(...env.sunDir).normalize();
	const sunPos = sun.clone().multiplyScalar(SKY_R * 0.9);
	// луна стоит там же, где «солнце» ночного окружения
	const moonPos = sunPos;
	const camPos: [number, number, number] = [cam.position.x, cam.position.y, cam.position.z];
	const PI = Math.PI;

	return (
		<>
			<fog attach="fog" args={[env.fogColor, env.fogNear, env.fogFar]} />
			{noLights ? null : (
				<>
					<ambientLight color={env.lightColor} intensity={env.ambient * PI} />
					<directionalLight color={env.lightColor} position={[sun.x, sun.y, sun.z]} intensity={env.sun * PI} />
					{/* мягкий свет «от камеры», чтобы персонажи не темнели при облёте */}
					<directionalLight color={env.lightColor} position={[-cam.forward.x, -cam.forward.y, -cam.forward.z]} intensity={env.fill * PI} />
				</>
			)}
			<group position={camPos}>
				<mesh geometry={skyGeo} material={skyMat} frustumCulled={false} renderOrder={-100} />
				{env.stars > 0.01
					? STAR_LAYERS.map((l, i) => (
							<points key={l.seed} geometry={starGeos[i]} frustumCulled={false} renderOrder={-90} rotation={[0, t * 0.004, 0]}>
								<pointsMaterial
									size={l.size}
									sizeAttenuation={false}
									color={l.color}
									transparent
									opacity={env.stars * (0.55 + 0.4 * Math.sin(t * l.speed + l.phase))}
									depthWrite={false}
									depthTest={false}
									fog={false}
								/>
							</points>
						))
					: null}
				{env.sunDisc > 0.01 ? (
					<>
						<sprite position={sunPos} scale={330} renderOrder={-80}>
							<spriteMaterial map={TEX.glow()} color="#fff1c4" transparent opacity={0.55 * env.sunDisc} depthWrite={false} depthTest={false} fog={false} blending={THREE.AdditiveBlending} />
						</sprite>
						<sprite position={sunPos} scale={74} renderOrder={-79}>
							<spriteMaterial map={TEX.sun()} transparent opacity={env.sunDisc} depthWrite={false} depthTest={false} fog={false} />
						</sprite>
					</>
				) : null}
				{env.moonDisc > 0.01 ? (
					<>
						<sprite position={moonPos} scale={240} renderOrder={-80}>
							<spriteMaterial map={TEX.glow()} color="#8f9cff" transparent opacity={0.3 * env.moonDisc} depthWrite={false} depthTest={false} fog={false} />
						</sprite>
						<sprite position={moonPos} scale={66} renderOrder={-79}>
							<spriteMaterial map={TEX.moon()} transparent opacity={env.moonDisc} depthWrite={false} depthTest={false} fog={false} />
						</sprite>
					</>
				) : null}
			</group>
			<CloudLayer t={t} cam={cam} amount={env.clouds} color={env.cloudColor} height={cloudHeight} speed={cloudSpeed} />
		</>
	);
};
