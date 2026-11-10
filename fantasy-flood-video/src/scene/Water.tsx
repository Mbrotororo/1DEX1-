import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import type {WorldTextures} from '../lib/textures';
import {FPS, T} from '../lib/timeline';
import {HALF, waterArrival, waterTopAt} from '../lib/world';

// Вода. Сетка 16x16 клеток: остров 14x14 и кольцо в 1 клетку вокруг него,
// по которому вода стекает вниз водопадами. Геометрия пересобирается
// каждый кадр: видны только внешние грани, как в Minecraft.

const G = HALF * 2 + 2;
const MAX_TOP = G * G;
const MAX_SIDE = G * G * 8;
// водопады плавно растворяются в пустоте
const FADE_TOP = -9;
const FADE_BOTTOM = -34;

const fallDepth = (tau: number) => Math.min(60, 5 * tau + 30 * tau * tau);

type Cell = {wet: boolean; top: number; bottom: number; island: boolean};

const makeBuffers = (quads: number, withColor: boolean) => {
	const geo = new THREE.BufferGeometry();
	const pos = new THREE.BufferAttribute(new Float32Array(quads * 12), 3);
	const uv = new THREE.BufferAttribute(new Float32Array(quads * 8), 2);
	pos.setUsage(THREE.DynamicDrawUsage);
	uv.setUsage(THREE.DynamicDrawUsage);
	geo.setAttribute('position', pos);
	geo.setAttribute('uv', uv);
	if (withColor) {
		const col = new THREE.BufferAttribute(new Float32Array(quads * 16), 4);
		col.setUsage(THREE.DynamicDrawUsage);
		geo.setAttribute('color', col);
	}
	const index = new Uint32Array(quads * 6);
	for (let q = 0; q < quads; q++) {
		index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
	}
	geo.setIndex(new THREE.BufferAttribute(index, 1));
	geo.setDrawRange(0, 0);
	return geo;
};

const alphaAt = (y: number) => Math.min(1, Math.max(0, (y - FADE_BOTTOM) / (FADE_TOP - FADE_BOTTOM)));

export const Water: React.FC<{t: number; tex: WorldTextures}> = ({t, tex}) => {
	const topGeo = useMemo(() => makeBuffers(MAX_TOP, false), []);
	const sideGeo = useMemo(() => makeBuffers(MAX_SIDE, true), []);
	const topMat = useRef<THREE.MeshBasicMaterial>(null);

	const frame = Math.floor(t * FPS);
	// рябь меняется 15 раз в секунду
	const still = tex.waterStill[Math.floor(frame / 4) % tex.waterStill.length];

	useLayoutEffect(() => {
		if (t < T.waterStart) {
			topGeo.setDrawRange(0, 0);
			sideGeo.setDrawRange(0, 0);
			return;
		}
		const cells: Cell[] = [];
		for (let i = 0; i < G; i++) {
			for (let j = 0; j < G; j++) {
				const x = i - HALF - 1;
				const z = j - HALF - 1;
				const island = x >= -HALF && x < HALF && z >= -HALF && z < HALF;
				const top = waterTopAt(x, z, t);
				const tau = t - waterArrival(x, z);
				cells.push({wet: top > 0, top, bottom: island ? 0 : -fallDepth(Math.max(0, tau)), island});
			}
		}
		const cellAt = (i: number, j: number) => (i < 0 || j < 0 || i >= G || j >= G ? null : cells[i * G + j]);

		const tp = topGeo.attributes.position.array as Float32Array;
		const tuv = topGeo.attributes.uv.array as Float32Array;
		const sp = sideGeo.attributes.position.array as Float32Array;
		const suv = sideGeo.attributes.uv.array as Float32Array;
		const sc = sideGeo.attributes.color.array as Float32Array;
		let nt = 0;
		let ns = 0;
		const scroll = t * 3.2;

		// одна боковая грань (с плавным исчезновением внизу)
		const side = (
			ax: number,
			az: number,
			bx: number,
			bz: number,
			y0: number,
			y1: number,
			shade: number,
			seed: number,
		) => {
			const lo = Math.max(y0, FADE_BOTTOM);
			if (y1 - lo < 0.001 || ns >= MAX_SIDE - 2) return;
			const cuts = lo < FADE_TOP && y1 > FADE_TOP ? [lo, FADE_TOP, y1] : [lo, y1];
			for (let s = 0; s < cuts.length - 1; s++) {
				const a = cuts[s];
				const b = cuts[s + 1];
				const p = ns * 12;
				sp.set([ax, a, az, bx, a, bz, bx, b, bz, ax, b, az], p);
				const u0 = seed * 0.37;
				const va = (a + scroll) / 2;
				const vb = (b + scroll) / 2;
				suv.set([u0, va, u0 + 1, va, u0 + 1, vb, u0, vb], ns * 8);
				const aa = alphaAt(a);
				const ab = alphaAt(b);
				sc.set([shade, shade, shade, aa, shade, shade, shade, aa, shade, shade, shade, ab, shade, shade, shade, ab], ns * 16);
				ns++;
			}
		};

		for (let i = 0; i < G; i++) {
			for (let j = 0; j < G; j++) {
				const c = cells[i * G + j];
				if (!c.wet) continue;
				const x0 = i - HALF - 1;
				const z0 = j - HALF - 1;
				const x1 = x0 + 1;
				const z1 = z0 + 1;

				// верхняя грань
				tp.set([x0, c.top, z1, x1, c.top, z1, x1, c.top, z0, x0, c.top, z0], nt * 12);
				tuv.set([x0, -z1, x1, -z1, x1, -z0, x0, -z0], nt * 8);
				nt++;

				// боковые грани: рисуем только там, где сосед ниже или воды нет
				const dirs: [number, number, number, number, number, number, number][] = [
					// di, dj, ax, az, bx, bz, затенение
					[1, 0, x1, z1, x1, z0, 0.78],
					[-1, 0, x0, z0, x0, z1, 0.7],
					[0, 1, x0, z1, x1, z1, 0.92],
					[0, -1, x1, z0, x0, z0, 0.74],
				];
				for (const [di, dj, ax, az, bx, bz, shade] of dirs) {
					const n = cellAt(i + di, j + dj);
					const seed = i * 7 + j * 13 + di * 3 + dj * 5;
					if (!n) {
						side(ax, az, bx, bz, c.bottom, c.top, shade, seed);
					} else if (!n.wet) {
						side(ax, az, bx, bz, n.island ? Math.max(c.bottom, 0) : c.bottom, c.top, shade, seed);
					} else {
						if (c.top > n.top + 0.001) side(ax, az, bx, bz, Math.max(n.top, c.bottom), c.top, shade, seed);
						if (!n.island && n.bottom > c.bottom + 0.001) {
							side(ax, az, bx, bz, c.bottom, Math.min(n.bottom, c.top), shade, seed);
						}
					}
				}
			}
		}

		topGeo.attributes.position.needsUpdate = true;
		topGeo.attributes.uv.needsUpdate = true;
		topGeo.setDrawRange(0, nt * 6);
		sideGeo.attributes.position.needsUpdate = true;
		sideGeo.attributes.uv.needsUpdate = true;
		sideGeo.attributes.color.needsUpdate = true;
		sideGeo.setDrawRange(0, ns * 6);
	}, [t, topGeo, sideGeo]);

	if (t < T.waterStart) return null;

	return (
		<>
			<mesh geometry={sideGeo} frustumCulled={false} renderOrder={1}>
				<meshBasicMaterial
					map={tex.waterFlow}
					vertexColors
					transparent
					opacity={0.66}
					depthWrite={false}
				/>
			</mesh>
			<mesh geometry={topGeo} frustumCulled={false} renderOrder={2}>
				<meshBasicMaterial ref={topMat} map={still} transparent opacity={0.72} depthWrite={false} />
			</mesh>
		</>
	);
};
