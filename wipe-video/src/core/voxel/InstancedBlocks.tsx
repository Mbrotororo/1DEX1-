import React, {useEffect, useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {ATLAS_COLS, getAtlas} from './atlas';
import {BLOCKS} from './blocks';
import {FACE_SHADES} from './mesher';
import type {BlockInst} from './world';

// Много отдельных блоков одним вызовом отрисовки. Каждому блоку каждый кадр
// задаётся смещение, поворот, масштаб и «подмес» цвета — чистой функцией от t.

const VERT = /* glsl */ `
attribute vec3 aTilesA;
attribute vec3 aTilesB;
attribute float aFace;
attribute vec2 aMix;
varying vec2 vLocal;
varying vec2 vTile;
varying vec3 vColor;
varying float vMix;
#include <fog_pars_vertex>
void main() {
	vLocal = uv;
	float tile = aFace < 0.5 ? aTilesA.x : aFace < 1.5 ? aTilesA.y : aFace < 2.5 ? aTilesA.z : aFace < 3.5 ? aTilesB.x : aFace < 4.5 ? aTilesB.y : aTilesB.z;
	vTile = vec2(mod(tile, ${ATLAS_COLS}.0), floor(tile / ${ATLAS_COLS}.0));
	vColor = color * aMix.y;
	vMix = aMix.x;
	vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 uAtlas;
uniform vec3 uTint;
uniform vec3 uMixColor;
varying vec2 vLocal;
varying vec2 vTile;
varying vec3 vColor;
varying float vMix;
#include <fog_pars_fragment>
void main() {
	vec2 local = clamp(vLocal, 0.001, 0.999);
	vec4 tex = texture2D(map, (floor(vTile + 0.5) + local) * uAtlas);
	if (tex.a < 0.5) discard;
	vec3 col = mix(tex.rgb, uMixColor, clamp(vMix, 0.0, 1.0)) * vColor * uTint;
	gl_FragColor = vec4(col, 1.0);
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

// Куб 1x1x1 с центром в нуле; грани в порядке +x, -x, +y, -y, +z, -z (как у BoxGeometry)
const makeCube = () => {
	const geo = new THREE.BoxGeometry(1, 1, 1);
	const colors = new Float32Array(24 * 3);
	const faces = new Float32Array(24);
	for (let f = 0; f < 6; f++) {
		for (let v = 0; v < 4; v++) {
			const i = f * 4 + v;
			colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = FACE_SHADES[f];
			faces[i] = f;
		}
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	geo.setAttribute('aFace', new THREE.BufferAttribute(faces, 1));
	return geo;
};

// Что можно менять у блока на кадре. Перед вызовом animate всё сброшено в значения по умолчанию.
export type BlockAnim = {
	// смещение от «домашней» позиции блока, в блоках
	x: number;
	y: number;
	z: number;
	// поворот вокруг центра блока, радианы
	rx: number;
	ry: number;
	rz: number;
	// масштаб (0 — блок не виден)
	s: number;
	// подмес цвета mixColor: 0 — родная текстура, 1 — сплошной цвет
	mix: number;
	// яркость (1 — как есть)
	shade: number;
};

export type InstancedBlocksProps = {
	// какие блоки рисовать; список может меняться от кадра к кадру
	blocks: BlockInst[];
	// анимация: вызывается для каждого блока каждый кадр, меняет поля out
	animate?: (block: BlockInst, index: number, out: BlockAnim) => void;
	// цвет, к которому блок «уходит» при mix → 1 (снег, лёд)
	mixColor?: THREE.ColorRepresentation;
	tint?: THREE.ColorRepresentation;
	// от чего зависит анимация: если deps не изменились с прошлого кадра, матрицы не пересчитываются
	// (по умолчанию пересчёт каждый кадр)
	deps?: unknown;
	position?: [number, number, number];
	scale?: number;
	visible?: boolean;
};

const dummy = new THREE.Object3D();
const anim: BlockAnim = {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, mix: 0, shade: 1};

export const InstancedBlocks: React.FC<InstancedBlocksProps> = ({blocks, animate, mixColor = '#ffffff', tint = '#ffffff', deps, position, scale, visible = true}) => {
	// вместимость растёт степенями двойки, чтобы не пересоздавать меш на каждый новый блок
	const capacity = useMemo(() => {
		let c = 64;
		while (c < blocks.length) c *= 2;
		return c;
	}, [blocks.length]);

	const {mesh, material} = useMemo(() => {
		const atlas = getAtlas();
		const geo = makeCube();
		geo.setAttribute('aTilesA', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
		geo.setAttribute('aTilesB', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
		const mix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
		mix.setUsage(THREE.DynamicDrawUsage);
		geo.setAttribute('aMix', mix);
		const mat = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([
				THREE.UniformsLib.fog,
				{
					map: {value: null},
					uAtlas: {value: new THREE.Vector2(1 / atlas.cols, 1 / atlas.rows)},
					uTint: {value: new THREE.Color(1, 1, 1)},
					uMixColor: {value: new THREE.Color(1, 1, 1)},
				},
			]),
			vertexShader: VERT,
			fragmentShader: FRAG,
			vertexColors: true,
			fog: true,
		});
		mat.uniforms.map.value = atlas.texture;
		mat.toneMapped = false;
		const m = new THREE.InstancedMesh(geo, mat, capacity);
		m.frustumCulled = false;
		m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		m.count = 0;
		return {mesh: m, material: mat};
	}, [capacity]);

	useEffect(
		() => () => {
			mesh.geometry.dispose();
			material.dispose();
		},
		[mesh, material],
	);

	(material.uniforms.uTint.value as THREE.Color).set(tint);
	(material.uniforms.uMixColor.value as THREE.Color).set(mixColor);

	const lastBlocks = useRef<BlockInst[] | null>(null);
	const lastDeps = useRef<unknown>(Symbol('never'));
	const lastMesh = useRef<THREE.InstancedMesh | null>(null);

	useLayoutEffect(() => {
		const fresh = lastMesh.current !== mesh;
		lastMesh.current = mesh;
		// тайлы граней — только когда сменился список блоков
		if (fresh || lastBlocks.current !== blocks) {
			const a = mesh.geometry.getAttribute('aTilesA') as THREE.InstancedBufferAttribute;
			const b = mesh.geometry.getAttribute('aTilesB') as THREE.InstancedBufferAttribute;
			const aa = a.array as Float32Array;
			const ba = b.array as Float32Array;
			for (let i = 0; i < blocks.length; i++) {
				const f = BLOCKS[blocks[i].id].faces;
				aa[i * 3] = f[0];
				aa[i * 3 + 1] = f[1];
				aa[i * 3 + 2] = f[2];
				ba[i * 3] = f[3];
				ba[i * 3 + 1] = f[4];
				ba[i * 3 + 2] = f[5];
			}
			a.needsUpdate = true;
			b.needsUpdate = true;
		} else if (deps !== undefined && lastDeps.current === deps) {
			return;
		}
		lastBlocks.current = blocks;
		lastDeps.current = deps;

		const mix = mesh.geometry.getAttribute('aMix') as THREE.InstancedBufferAttribute;
		const ma = mix.array as Float32Array;
		const mat4 = mesh.instanceMatrix.array as Float32Array;
		for (let i = 0; i < blocks.length; i++) {
			const blk = blocks[i];
			anim.x = anim.y = anim.z = anim.rx = anim.ry = anim.rz = 0;
			anim.s = 1;
			anim.mix = 0;
			anim.shade = blk.shade ?? 1;
			if (animate) animate(blk, i, anim);
			if (anim.s <= 0.0001) {
				// невидимый блок: нулевая матрица
				mat4.fill(0, i * 16, i * 16 + 16);
			} else {
				dummy.position.set(blk.x + 0.5 + anim.x, blk.y + 0.5 + anim.y, blk.z + 0.5 + anim.z);
				dummy.rotation.set(anim.rx, anim.ry, anim.rz);
				dummy.scale.setScalar(anim.s);
				dummy.updateMatrix();
				dummy.matrix.toArray(mat4, i * 16);
			}
			ma[i * 2] = anim.mix;
			ma[i * 2 + 1] = anim.shade;
		}
		mesh.count = blocks.length;
		mesh.instanceMatrix.needsUpdate = true;
		mix.needsUpdate = true;
	});

	return <primitive object={mesh} position={position} scale={scale} visible={visible && blocks.length > 0} />;
};
