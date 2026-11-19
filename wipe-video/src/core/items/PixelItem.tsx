import React, {useMemo} from 'react';
import * as THREE from 'three';
import {dataTexture, paintTexture} from '../textures';
import {artPixels, resolveArt, type ItemArt, type ItemName} from './art';

// Предмет как в руке у игрока: пиксельный спрайт, «выдавленный» в объём толщиной в 1 пиксель.
// По умолчанию рисунок стоит в плоскости XY с центром в нуле (смотрит на +z), размер — size блоков.

type Built = {geo: THREE.BufferGeometry; tex: THREE.DataTexture; w: number; h: number};
const cache = new WeakMap<ItemArt, Built>();

const build = (art: ItemArt): Built => {
	const hit = cache.get(art);
	if (hit) return hit;
	const {data, w, h} = artPixels(art);
	const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
	const pos: number[] = [];
	const nor: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];
	const quad = (p: number[][], n: number[], uvs: number[][]) => {
		const base = pos.length / 3;
		for (let i = 0; i < 4; i++) {
			pos.push(...p[i]);
			nor.push(...n);
			uv.push(...uvs[i]);
		}
		idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
	};
	// единицы — пиксели рисунка; центр рисунка в нуле; толщина 1 (z от -0.5 до 0.5)
	const X = (x: number) => x - w / 2;
	const Y = (y: number) => h / 2 - y;
	// лицо и изнанка: по одному прямоугольнику с текстурой
	quad(
		[
			[X(0), Y(h), 0.5],
			[X(w), Y(h), 0.5],
			[X(w), Y(0), 0.5],
			[X(0), Y(0), 0.5],
		],
		[0, 0, 1],
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		],
	);
	quad(
		[
			[X(w), Y(h), -0.5],
			[X(0), Y(h), -0.5],
			[X(0), Y(0), -0.5],
			[X(w), Y(0), -0.5],
		],
		[0, 0, -1],
		[
			[1, 0],
			[0, 0],
			[0, 1],
			[1, 1],
		],
	);
	// торцы: у каждого пикселя — стенка там, где сосед прозрачный; цвет берётся из центра пикселя
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (!solid(x, y)) continue;
			const c = [(x + 0.5) / w, 1 - (y + 0.5) / h];
			const uvs = [c, c, c, c];
			const x0 = X(x);
			const x1 = X(x + 1);
			const y0 = Y(y + 1);
			const y1 = Y(y);
			if (!solid(x - 1, y)) quad([[x0, y0, -0.5], [x0, y0, 0.5], [x0, y1, 0.5], [x0, y1, -0.5]], [-1, 0, 0], uvs);
			if (!solid(x + 1, y)) quad([[x1, y0, 0.5], [x1, y0, -0.5], [x1, y1, -0.5], [x1, y1, 0.5]], [1, 0, 0], uvs);
			if (!solid(x, y - 1)) quad([[x0, y1, 0.5], [x1, y1, 0.5], [x1, y1, -0.5], [x0, y1, -0.5]], [0, 1, 0], uvs);
			if (!solid(x, y + 1)) quad([[x0, y0, -0.5], [x1, y0, -0.5], [x1, y0, 0.5], [x0, y0, 0.5]], [0, -1, 0], uvs);
		}
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
	geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
	geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
	geo.setIndex(idx);
	const built = {geo, tex: dataTexture(data, w, h, true), w, h};
	cache.set(art, built);
	return built;
};

// Текстура рисунка предмета (для спрайтов и частиц)
export const itemTexture = (art: ItemName | ItemArt) => build(resolveArt(art)).tex;

// бегущие полосы зачарования
let glintTex: THREE.DataTexture | null = null;
const getGlint = () => {
	if (!glintTex) {
		glintTex = paintTexture(16, 16, (x, y) => {
			const v = (x + y * 2) % 8;
			const a = v === 0 ? 255 : v === 1 || v === 7 ? 120 : 0;
			return [255, 255, 255, a];
		});
		glintTex.wrapS = THREE.RepeatWrapping;
		glintTex.wrapT = THREE.RepeatWrapping;
	}
	return glintTex;
};

export type PixelItemProps = {
	// имя из библиотеки ('mace', 'snowball', ...) или свой рисунок (например potionArt('#33ccff'))
	art: ItemName | ItemArt;
	// размер рисунка в блоках (16 пикселей по большей стороне); по умолчанию 0.85 — как в руке у игрока
	size?: number;
	// предмет в руке: передаётся в handR/handL персонажа, сам встаёт в кулак как в игре
	held?: boolean;
	position?: [number, number, number];
	rotation?: [number, number, number];
	scale?: number;
	// перелив зачарования: время t включает анимацию (фиолетовые бегущие полосы)
	glint?: number;
	glintColor?: THREE.ColorRepresentation;
	// собственное свечение 0..1 (предмет не темнеет в подземелье)
	glow?: number;
	// подмешать цвет (0..1) — «превращается в снег»
	mix?: number;
	mixColor?: THREE.ColorRepresentation;
	opacity?: number;
	visible?: boolean;
};

const WHITE = new THREE.Color('#ffffff');

export const PixelItem: React.FC<PixelItemProps> = ({
	art,
	size = 0.85,
	held = false,
	position,
	rotation,
	scale = 1,
	glint,
	glintColor = '#b060ff',
	glow = 0,
	mix = 0,
	mixColor = '#ffffff',
	opacity = 1,
	visible = true,
}) => {
	const def = resolveArt(art);
	const b = build(def);
	const mat = useMemo(() => new THREE.MeshLambertMaterial({map: b.tex, alphaTest: 0.5}), [b]);
	const glintMat = useMemo(() => {
		const map = getGlint().clone();
		map.needsUpdate = true;
		return new THREE.MeshBasicMaterial({map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
	}, []);

	// «подмес» делаем цветом и свечением: текстура уходит в сплошной цвет
	mat.color.copy(WHITE).lerp(new THREE.Color(mixColor), mix * 0.6);
	mat.emissive.set(mixColor).multiplyScalar(mix * 0.75);
	mat.emissiveMap = glow > 0 && mix === 0 ? b.tex : null;
	if (glow > 0 && mix === 0) mat.emissive.setRGB(glow, glow, glow);
	const ghost = opacity < 0.999;
	if (mat.transparent !== ghost) {
		mat.transparent = ghost;
		mat.needsUpdate = true;
	}
	mat.opacity = opacity;

	if (!visible || scale <= 0.0001 || opacity <= 0.001) return null;
	const k = (size / Math.max(b.w, b.h)) * scale;

	if (glint !== undefined) {
		// бегущие полосы зачарования
		glintMat.color.set(glintColor);
		glintMat.opacity = 0.55 + 0.25 * Math.sin(glint * 5);
		if (glintMat.map) {
			glintMat.map.offset.set(glint * 0.35, glint * 0.22);
			glintMat.map.repeat.set(1.5, 1.5);
		}
	}
	const mesh = (
		<>
			<mesh geometry={b.geo} material={mat} />
			{glint !== undefined ? <mesh geometry={b.geo} material={glintMat} scale={[1.03, 1.03, 1.35]} /> : null}
		</>
	);

	if (held) {
		// В руке: плоскость рисунка — вдоль руки и «вперёд» (нормаль вбок), точка хвата — в кулаке.
		// Инструмент торчит вперёд и чуть вверх, как меч в игре; обычный предмет стоит в ладони.
		const [gx, gy] = def.grip ?? [b.w / 2, b.h / 2];
		const ox = -(gx - b.w / 2);
		const oy = -(gy - b.h / 2);
		const tilt = def.tool ? Math.PI * 0.19 : Math.PI * 0.42;
		return (
			<group position={position} rotation={rotation}>
				<group position={[0, -0.02, 0.07]} rotation={[tilt, 0, 0]}>
					<group rotation={[0, -Math.PI / 2, 0]} scale={k}>
						<group position={[ox, oy, 0]}>{mesh}</group>
					</group>
				</group>
			</group>
		);
	}
	return (
		<group position={position} rotation={rotation} scale={k}>
			{mesh}
		</group>
	);
};
