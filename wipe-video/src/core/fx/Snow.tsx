import {useThree} from '@react-three/fiber';
import React, {useMemo} from 'react';
import * as THREE from 'three';
import type {Vec3} from '../anim';
import {mulberry32} from '../rng';

// Снег на видеокарте: тысячи хлопьев одной командой, положение считается в шейдере от времени.

const SNOW_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uCenter;
uniform vec3 uWind;
uniform float uSize;
uniform float uBufH;
uniform float uSway;
uniform float uMaxPx;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
	float speed = 0.7 + 0.6 * aSeed.w;
	vec3 base = aSeed.xyz * uBox + uWind * uTime * speed;
	// покачивание хлопьев
	base.x += sin(uTime * (1.3 + aSeed.w * 1.7) + aSeed.y * 40.0) * uSway;
	base.z += cos(uTime * (1.1 + aSeed.x * 1.9) + aSeed.z * 40.0) * uSway;
	// объём «ездит» вместе с камерой: хлопья заворачиваются через границы
	vec3 rel = mod(base - uCenter, uBox) - uBox * 0.5;
	vec4 mvPosition = modelViewMatrix * vec4(uCenter + rel, 1.0);
	gl_Position = projectionMatrix * mvPosition;
	float px = uSize * (0.6 + 0.8 * fract(aSeed.w * 7.31)) * projectionMatrix[1][1] * uBufH * 0.5 / max(gl_Position.w, 0.001);
	gl_PointSize = min(px, uMaxPx);
	// у границ объёма хлопья тают, чтобы не «выскакивали»; совсем близкие к камере — тоже
	vec3 edge = abs(rel) / (uBox * 0.5);
	float e = max(edge.x, max(edge.y, edge.z));
	vAlpha = (1.0 - smoothstep(0.82, 1.0, e)) * smoothstep(0.25, 1.2, -mvPosition.z) * min(1.0, px / 1.2);
	#include <fog_vertex>
}
`;
const POINT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
	gl_FragColor = vec4(uColor, uOpacity * vAlpha);
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

const useBufferHeight = () => {
	// высота буфера в настоящих пикселях (зависит от масштаба рендера)
	const size = useThree((s) => s.size);
	const dpr = useThree((s) => s.viewport.dpr);
	return size.height * dpr;
};

export type SnowfallProps = {
	t: number;
	// центр объёма — обычно положение камеры: [cam.position.x, cam.position.y, cam.position.z]
	center: Vec3;
	// сколько хлопьев в объёме
	count?: number;
	// размеры объёма вокруг центра, блоки
	box?: Vec3;
	// скорость ветра вместе с падением: [x, y, z] блоков в секунду (y < 0 — вниз)
	wind?: Vec3;
	// размер хлопа в блоках
	size?: number;
	// плотность 0..1: доля видимых хлопьев (плавно включает/выключает снег)
	density?: number;
	opacity?: number;
	color?: THREE.ColorRepresentation;
	// амплитуда покачивания, блоки
	sway?: number;
	seed?: number;
	// потолок размера хлопа на экране, пиксели (у самой камеры)
	maxPx?: number;
	fog?: boolean;
};

// Снегопад в объёме, который следует за камерой. Меняя wind и density, получаем
// от редких снежинок до вьюги. Тысячи хлопьев почти ничего не стоят.
export const Snowfall: React.FC<SnowfallProps> = ({
	t,
	center,
	count = 2000,
	box = [40, 26, 40],
	wind = [1.2, -3.2, 0.4],
	size = 0.09,
	density = 1,
	opacity = 0.95,
	color = '#ffffff',
	sway = 0.25,
	seed = 7,
	maxPx = 34,
	fog = true,
}) => {
	const bufH = useBufferHeight();
	const geo = useMemo(() => {
		const rnd = mulberry32(seed);
		const seeds = new Float32Array(count * 4);
		for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
		return g;
	}, [count, seed]);
	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: THREE.UniformsUtils.merge([
					THREE.UniformsLib.fog,
					{
						uTime: {value: 0},
						uBox: {value: new THREE.Vector3()},
						uCenter: {value: new THREE.Vector3()},
						uWind: {value: new THREE.Vector3()},
						uSize: {value: 0.1},
						uBufH: {value: 1080},
						uSway: {value: 0.2},
						uMaxPx: {value: 34},
						uColor: {value: new THREE.Color()},
						uOpacity: {value: 1},
					},
				]),
				vertexShader: SNOW_VERT,
				fragmentShader: POINT_FRAG,
				transparent: true,
				depthWrite: false,
				fog,
				toneMapped: false,
			}),
		[fog],
	);
	const u = mat.uniforms;
	u.uTime.value = t;
	(u.uBox.value as THREE.Vector3).set(box[0], box[1], box[2]);
	(u.uCenter.value as THREE.Vector3).set(center[0], center[1], center[2]);
	(u.uWind.value as THREE.Vector3).set(wind[0], wind[1], wind[2]);
	u.uSize.value = size;
	u.uBufH.value = bufH;
	u.uSway.value = sway;
	u.uMaxPx.value = (maxPx * bufH) / 1080;
	(u.uColor.value as THREE.Color).set(color);
	u.uOpacity.value = opacity;
	const shown = Math.round(count * Math.min(1, Math.max(0, density)));
	geo.setDrawRange(0, shown);
	if (shown === 0) return null;
	return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
};

// ---------- поток снежинок из заданных точек ----------
const STREAM_VERT = /* glsl */ `
attribute vec4 aSeed;
attribute float aStart;
uniform float uTime;
uniform vec3 uWind;
uniform float uLife;
uniform float uSize;
uniform float uBufH;
uniform float uSpread;
uniform float uGravity;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
	float life = uLife * (0.55 + 0.45 * aSeed.w);
	float tau = uTime - aStart - aSeed.x * 0.25;
	float k = tau / life;
	vec3 p = position + (aSeed.xyz - 0.5) * 0.9;
	// разгон по ветру + завихрения
	float sp = 0.5 + aSeed.y;
	p += uWind * tau * sp * (0.35 + 0.65 * min(1.0, tau * 1.5));
	p.x += sin(tau * (2.0 + aSeed.z * 3.0) + aSeed.x * 6.28) * uSpread * tau;
	p.y += cos(tau * (1.7 + aSeed.x * 3.0) + aSeed.y * 6.28) * uSpread * tau * 0.7 + uGravity * tau * tau;
	p.z += sin(tau * (2.3 + aSeed.y * 3.0) + aSeed.z * 6.28) * uSpread * tau;
	vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
	bool on = tau > 0.0 && k < 1.0;
	gl_Position = on ? projectionMatrix * mvPosition : vec4(2.0, 2.0, 2.0, 1.0);
	float px = uSize * (0.6 + 0.8 * aSeed.z) * (1.0 - k * 0.6) * projectionMatrix[1][1] * uBufH * 0.5 / max(gl_Position.w, 0.001);
	gl_PointSize = on ? min(px, uBufH * 0.04) : 0.0;
	vAlpha = on ? smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.6, 1.0, k)) : 0.0;
	#include <fog_vertex>
}
`;

export type FlakeSource = {pos: Vec3; at: number};

export type FlakeStreamProps = {
	t: number;
	// откуда и когда вылетают снежинки (список неизменный — строй его один раз в useMemo)
	sources: FlakeSource[];
	// снежинок на источник
	perSource?: number;
	// ветер, блоков в секунду
	wind?: Vec3;
	// время жизни снежинки, секунды
	life?: number;
	size?: number;
	// сила завихрений
	spread?: number;
	gravity?: number;
	color?: THREE.ColorRepresentation;
	opacity?: number;
	seed?: number;
};

// Снежинки, вылетающие из точек в заданные моменты (блок рассыпался — полетел снег по ветру).
// Для сборки мира «наоборот» передай time = конец − t и ветер к себе.
export const FlakeStream: React.FC<FlakeStreamProps> = ({t, sources, perSource = 3, wind = [6, 1.5, 2], life = 1.6, size = 0.12, spread = 0.5, gravity = 0, color = '#ffffff', opacity = 0.95, seed = 11}) => {
	const bufH = useBufferHeight();
	const {geo, starts} = useMemo(() => {
		// источники по порядку времени: каждый кадр рисуется только отрезок «живых»
		const sorted = [...sources].sort((a, b) => a.at - b.at);
		const n = sorted.length * perSource;
		const rnd = mulberry32(seed);
		const pos = new Float32Array(n * 3);
		const start = new Float32Array(n);
		const seeds = new Float32Array(n * 4);
		for (let i = 0; i < sorted.length; i++) {
			for (let j = 0; j < perSource; j++) {
				const o = i * perSource + j;
				pos[o * 3] = sorted[i].pos[0];
				pos[o * 3 + 1] = sorted[i].pos[1];
				pos[o * 3 + 2] = sorted[i].pos[2];
				start[o] = sorted[i].at;
				for (let q = 0; q < 4; q++) seeds[o * 4 + q] = rnd();
			}
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		g.setAttribute('aStart', new THREE.BufferAttribute(start, 1));
		g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
		return {geo: g, starts: sorted.map((s) => s.at)};
	}, [sources, perSource, seed]);
	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: THREE.UniformsUtils.merge([
					THREE.UniformsLib.fog,
					{
						uTime: {value: 0},
						uWind: {value: new THREE.Vector3()},
						uLife: {value: 1},
						uSize: {value: 0.1},
						uBufH: {value: 1080},
						uSpread: {value: 0.5},
						uGravity: {value: 0},
						uColor: {value: new THREE.Color()},
						uOpacity: {value: 1},
					},
				]),
				vertexShader: STREAM_VERT,
				fragmentShader: POINT_FRAG,
				transparent: true,
				depthWrite: false,
				fog: true,
				toneMapped: false,
			}),
		[],
	);
	const u = mat.uniforms;
	u.uTime.value = t;
	(u.uWind.value as THREE.Vector3).set(wind[0], wind[1], wind[2]);
	u.uLife.value = life;
	u.uSize.value = size;
	u.uBufH.value = bufH;
	u.uSpread.value = spread;
	u.uGravity.value = gravity;
	(u.uColor.value as THREE.Color).set(color);
	u.uOpacity.value = opacity;
	// первый ещё не «умерший» источник и первый ещё не родившийся
	const lowerBound = (v: number) => {
		let a = 0;
		let b = starts.length;
		while (a < b) {
			const m = (a + b) >> 1;
			if (starts[m] < v) a = m + 1;
			else b = m;
		}
		return a;
	};
	const first = lowerBound(t - life - 0.3);
	const last = lowerBound(t + 0.001);
	geo.setDrawRange(first * perSource, Math.max(0, last - first) * perSource);
	if (last <= first) return null;
	return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
};
