import React, {useMemo} from 'react';
import * as THREE from 'three';
import {getAtlas} from './atlas';
import type {VoxelMeshes} from './mesher';

// Материал мира: атлас + запечённый свет в вершинах + туман сцены.
// Умеет: общий оттенок (tint), снежный покров (snowCover), показ только части полос (bands),
// «выбеливание» всего меша (whiten).

const HASH_GLSL = /* glsl */ `
float vxHash(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
`;

const VERT = /* glsl */ `
attribute vec4 aUv;
attribute vec4 aFx;
uniform vec2 uBand;
varying vec2 vLocal;
varying vec2 vTile;
varying vec3 vColor;
varying vec2 vSnow;
#include <fog_pars_vertex>
void main() {
	vLocal = aUv.xy;
	vTile = aUv.zw;
	vColor = color;
	vSnow = aFx.xy;
	// полосы: грань видна, если её полоса в диапазоне; «шов» между полосами — только когда сосед скрыт
	bool vis = aFx.z >= uBand.x && aFx.z < uBand.y;
	if (aFx.w >= 0.0 && aFx.w >= uBand.x && aFx.w < uBand.y) vis = false;
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	gl_Position = vis ? projectionMatrix * mvPosition : vec4(2.0, 2.0, 2.0, 1.0);
	#include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 uAtlas;
uniform vec3 uTint;
uniform float uSnow;
uniform vec3 uSnowColor;
uniform vec3 uWhiten;
uniform float uWhitenK;
uniform float uOpacity;
varying vec2 vLocal;
varying vec2 vTile;
varying vec3 vColor;
varying vec2 vSnow;
#include <fog_pars_fragment>
${HASH_GLSL}
void main() {
	vec2 local = clamp(vLocal, 0.001, 0.999);
	vec4 tex = texture2D(map, (floor(vTile + 0.5) + local) * uAtlas);
	#ifdef VX_CUTOUT
	if (tex.a < 0.5) discard;
	#endif
	vec3 col = tex.rgb;
	if (uSnow > 0.0 && vSnow.y > 0.0) {
		vec2 px = floor(local * 16.0);
		// насколько засыпан этот блок (0..1)
		float p = clamp((uSnow * 1.3 - vSnow.x) / 0.3, 0.0, 1.0);
		float cover;
		if (vSnow.y > 0.75) {
			cover = step(vxHash(px + vSnow.x * 91.7) + 0.001, p);
		} else {
			// бок: неровная снежная шапка вдоль верхнего края
			float depth = p * (2.0 + floor(vxHash(vec2(px.x, vSnow.x * 57.0)) * 3.0));
			cover = step(15.5 - px.y, depth);
		}
		vec3 snow = uSnowColor * (0.94 + 0.06 * vxHash(px * 1.7 + 3.1));
		col = mix(col, snow, cover);
	}
	col *= vColor * uTint;
	col = mix(col, uWhiten, uWhitenK);
	gl_FragColor = vec4(col, tex.a * uOpacity);
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

export type VoxelMaterialKind = 'opaque' | 'cutout' | 'translucent';

export const makeVoxelMaterial = (kind: VoxelMaterialKind) => {
	const atlas = getAtlas();
	const mat = new THREE.ShaderMaterial({
		uniforms: THREE.UniformsUtils.merge([
			THREE.UniformsLib.fog,
			{
				map: {value: null},
				uAtlas: {value: new THREE.Vector2(1 / atlas.cols, 1 / atlas.rows)},
				uTint: {value: new THREE.Color(1, 1, 1)},
				uSnow: {value: 0},
				uSnowColor: {value: new THREE.Color(0.93, 0.96, 1)},
				uWhiten: {value: new THREE.Color(1, 1, 1)},
				uWhitenK: {value: 0},
				uOpacity: {value: 1},
				uBand: {value: new THREE.Vector2(-1e6, 1e6)},
			},
		]),
		vertexShader: VERT,
		fragmentShader: FRAG,
		vertexColors: true,
		fog: true,
		defines: kind === 'cutout' ? {VX_CUTOUT: ''} : {},
		side: kind === 'cutout' ? THREE.DoubleSide : THREE.FrontSide,
		transparent: kind === 'translucent',
		depthWrite: kind !== 'translucent',
	});
	mat.uniforms.map.value = atlas.texture;
	mat.toneMapped = false;
	return mat;
};

export type VoxelMeshProps = {
	// результат buildVoxelMeshes
	meshes: VoxelMeshes;
	// общий оттенок мира (множитель цвета): '#ffffff' — день, '#5a6a9a' — ночь
	tint?: THREE.ColorRepresentation;
	// снежный покров 0..1: верхние грани постепенно белеют
	snowCover?: number;
	snowColor?: THREE.ColorRepresentation;
	// показывать только полосы lo <= band < hi (см. makeBands)
	bands?: [number, number];
	// подмешать ко всему мешу цвет (0..1) — «всё белеет»
	whiten?: number;
	whitenColor?: THREE.ColorRepresentation;
	// прозрачность слоя воды 0..1
	waterOpacity?: number;
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: number | [number, number, number];
	visible?: boolean;
	renderOrder?: number;
};

// Лёгкая «обёртка» над общей геометрией: свои границы отрисовки у каждого VoxelMesh
const viewOf = (src: THREE.BufferGeometry) => {
	const geo = new THREE.BufferGeometry();
	for (const name of Object.keys(src.attributes)) geo.setAttribute(name, src.getAttribute(name));
	geo.setIndex(src.getIndex());
	return geo;
};

const LAYERS = ['opaque', 'cutout', 'translucent'] as const;

// Статичный мир одной слитой геометрией (до трёх слоёв: обычные блоки, «дырявые», вода)
export const VoxelMesh: React.FC<VoxelMeshProps> = ({
	meshes,
	tint = '#ffffff',
	snowCover = 0,
	snowColor,
	bands,
	whiten = 0,
	whitenColor = '#ffffff',
	waterOpacity = 1,
	position,
	rotation,
	scale,
	visible = true,
	renderOrder = 0,
}) => {
	const mats = useMemo(
		() => ({
			opaque: makeVoxelMaterial('opaque'),
			cutout: makeVoxelMaterial('cutout'),
			translucent: makeVoxelMaterial('translucent'),
		}),
		[],
	);
	const views = useMemo(
		() =>
			LAYERS.map((name) => {
				const layer = meshes[name];
				return layer ? {name, layer, main: viewOf(layer.main), seam: layer.seam ? viewOf(layer.seam) : null} : null;
			}),
		[meshes],
	);
	// униформы обновляются каждый кадр прямо тут: рендер three читает их позже
	for (const mat of [mats.opaque, mats.cutout, mats.translucent]) {
		const u = mat.uniforms;
		(u.uTint.value as THREE.Color).set(tint);
		u.uSnow.value = snowCover;
		if (snowColor !== undefined) (u.uSnowColor.value as THREE.Color).set(snowColor);
		(u.uWhiten.value as THREE.Color).set(whitenColor);
		u.uWhitenK.value = whiten;
		(u.uBand.value as THREE.Vector2).set(bands ? bands[0] : -1e6, bands ? bands[1] : 1e6);
	}
	mats.translucent.uniforms.uOpacity.value = waterOpacity;

	// какие полосы видны -> какой отрезок индексов рисовать
	const nb = meshes.bandMax - meshes.bandMin + 1;
	const lo = Math.min(nb, Math.max(0, Math.ceil((bands ? bands[0] : -Infinity) - meshes.bandMin)));
	const hi = Math.min(nb, Math.max(lo, Math.ceil((bands ? bands[1] : Infinity) - meshes.bandMin)));
	const all = lo === 0 && hi === nb;
	for (const v of views) {
		if (!v) continue;
		v.main.setDrawRange(v.layer.mainStart[lo], v.layer.mainStart[hi] - v.layer.mainStart[lo]);
		// швы нужны, только когда часть полос скрыта
		if (v.seam) v.seam.setDrawRange(v.layer.seamStart[lo], all ? 0 : v.layer.seamStart[hi] - v.layer.seamStart[lo]);
	}

	return (
		<group position={position} rotation={rotation} scale={scale} visible={visible}>
			{views.map((v) =>
				v ? (
					<React.Fragment key={v.name}>
						<mesh geometry={v.main} material={mats[v.name]} frustumCulled={false} renderOrder={renderOrder + (v.name === 'translucent' ? 1 : 0)} />
						{v.seam && !all ? <mesh geometry={v.seam} material={mats[v.name]} frustumCulled={false} renderOrder={renderOrder + (v.name === 'translucent' ? 1 : 0)} /> : null}
					</React.Fragment>
				) : null,
			)}
		</group>
	);
};
