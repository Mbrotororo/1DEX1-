import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {clamp01} from '../lib/anim';
import {mulberry32} from '../lib/rng';
import {T, WATER_MAX} from '../lib/timeline';
import {HALF, waterLevel} from '../lib/world';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

type Particle = {
	vx: number;
	vy: number;
	vz: number;
	life: number;
	size: number;
	color: string;
	delay: number;
	spin: number;
};

export type BurstProps = {
	t: number;
	at: number;
	origin: [number, number, number];
	count: number;
	seed: number;
	colors: string[];
	speed: [number, number];
	// 'sphere' — во все стороны, 'up' — фонтаном вверх, 'ring' — кольцом по земле
	shape: 'sphere' | 'up' | 'ring';
	gravity?: number;
	drag?: number;
	life?: [number, number];
	size?: [number, number];
	spreadDelay?: number;
	additive?: boolean;
};

// Разлетающиеся кубики (брызги, пыль, салют). Положение каждой частицы
// считается формулой от времени — никакой «живой» физики.
export const Burst: React.FC<BurstProps> = ({
	t,
	at,
	origin,
	count,
	seed,
	colors,
	speed,
	shape,
	gravity = -14,
	drag = 1.2,
	life = [0.5, 1],
	size = [0.12, 0.26],
	spreadDelay = 0,
	additive = false,
}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const colored = useRef(false);
	const parts = useMemo(() => {
		const rnd = mulberry32(seed);
		const list: Particle[] = [];
		for (let i = 0; i < count; i++) {
			const a = rnd() * Math.PI * 2;
			const v = speed[0] + rnd() * (speed[1] - speed[0]);
			let dx = 0;
			let dy = 0;
			let dz = 0;
			if (shape === 'sphere') {
				const y = rnd() * 2 - 1;
				const r = Math.sqrt(1 - y * y);
				dx = Math.cos(a) * r;
				dy = y;
				dz = Math.sin(a) * r;
			} else if (shape === 'up') {
				const r = 0.15 + rnd() * 0.55;
				dx = Math.cos(a) * r;
				dy = 1;
				dz = Math.sin(a) * r;
			} else {
				dx = Math.cos(a);
				dy = 0.15 + rnd() * 0.35;
				dz = Math.sin(a);
			}
			list.push({
				vx: dx * v,
				vy: dy * v,
				vz: dz * v,
				life: life[0] + rnd() * (life[1] - life[0]),
				size: size[0] + rnd() * (size[1] - size[0]),
				color: colors[Math.floor(rnd() * colors.length)],
				delay: rnd() * spreadDelay,
				spin: (rnd() - 0.5) * 8,
			});
		}
		return list;
	}, [count, seed, colors, speed, shape, life, size, spreadDelay]);

	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const mat = useMemo(
		() =>
			new THREE.MeshBasicMaterial({
				transparent: additive,
				blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
				depthWrite: !additive,
			}),
		[additive],
	);

	const maxLife = life[1] + spreadDelay;
	const active = t >= at && t <= at + maxLife;

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		if (!colored.current) {
			parts.forEach((p, i) => mesh.setColorAt(i, tmpColor.set(p.color)));
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
			colored.current = true;
		}
		if (!active) return;
		for (let i = 0; i < parts.length; i++) {
			const p = parts[i];
			const tau = t - at - p.delay;
			const k = tau / p.life;
			if (tau <= 0 || k >= 1) {
				dummy.scale.setScalar(0);
			} else {
				// торможение об воздух + гравитация
				const d = drag > 0 ? (1 - Math.exp(-drag * tau)) / drag : tau;
				dummy.position.set(
					origin[0] + p.vx * d,
					origin[1] + p.vy * d + 0.5 * gravity * tau * tau,
					origin[2] + p.vz * d,
				);
				dummy.rotation.set(tau * p.spin, tau * p.spin * 0.7, 0);
				dummy.scale.setScalar(p.size * Math.sqrt(1 - k));
			}
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		dummy.rotation.set(0, 0, 0);
		mesh.instanceMatrix.needsUpdate = true;
	}, [t, at, active, parts, origin, gravity, drag]);

	return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} visible={active} />;
};

// Пузырьки, поднимающиеся со дна, пока мир уходит под воду
const BUBBLES = 90;

export const Bubbles: React.FC<{t: number}> = ({t}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const seeds = useMemo(() => {
		const rnd = mulberry32(909);
		return Array.from({length: BUBBLES}, () => ({
			x: (rnd() * 2 - 1) * (HALF - 0.6),
			z: (rnd() * 2 - 1) * (HALF - 0.6),
			start: T.riseStart + rnd() * (T.riseEnd - T.riseStart + 2.4),
			speed: 2.6 + rnd() * 2.2,
			size: 0.1 + rnd() * 0.14,
			phase: rnd() * 6.28,
		}));
	}, []);
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const mat = useMemo(() => new THREE.MeshBasicMaterial({color: '#dff1ff', transparent: true, opacity: 0.85}), []);
	const active = t >= T.riseStart;

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh || !active) return;
		const level = waterLevel(t);
		for (let i = 0; i < seeds.length; i++) {
			const b = seeds[i];
			// каждый пузырёк всплывает, лопается у поверхности и стартует заново
			const period = WATER_MAX / b.speed + 0.3;
			const tau = t - b.start;
			const local = tau - Math.floor(tau / period) * period;
			const y = 0.2 + local * b.speed;
			if (tau < 0 || y > level - 0.15) {
				dummy.scale.setScalar(0);
			} else {
				dummy.position.set(
					b.x + Math.sin(local * 5 + b.phase) * 0.14,
					y,
					b.z + Math.cos(local * 4 + b.phase) * 0.14,
				);
				dummy.scale.setScalar(b.size * (0.6 + 0.4 * clamp01(local * 3)));
			}
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}, [t, active, seeds]);

	return <instancedMesh ref={ref} args={[geo, mat, BUBBLES]} frustumCulled={false} visible={active} />;
};
