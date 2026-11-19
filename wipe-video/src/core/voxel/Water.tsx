import React, {useMemo} from 'react';
import * as THREE from 'three';
import {hash3} from '../rng';
import {paintTexture} from '../textures';

// Поверхность воды: плоскость с зацикленной пиксельной «рябью» (32 кадра, как в старом ролике).
// Кладётся на уровень воды поверх чаши в рельефе: суша выше уровня сама закрывает плоскость.

const S = 16;
const FRAMES = 32;
let framesCache: THREE.DataTexture[] | null = null;

const waterFrames = () => {
	if (framesCache) return framesCache;
	const W = (2 * Math.PI) / S;
	framesCache = [];
	for (let f = 0; f < FRAMES; f++) {
		const ph = (2 * Math.PI * f) / FRAMES;
		const tex = paintTexture(S, S, (x, y) => {
			const v = Math.sin(W * (x + 2 * y) + ph) + Math.sin(W * (2 * x - y) - ph * 2) + Math.sin(W * (3 * x + y) + ph) * 0.6 + (hash3(x, y, 16, 40) - 0.5) * 0.5;
			if (v > 2.0) return [112, 168, 250];
			if (v > 1.1) return [84, 140, 240];
			if (v > -1.2) return [63, 118, 228];
			return [55, 106, 216];
		});
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		framesCache.push(tex);
	}
	return framesCache;
};

export type WaterSurfaceProps = {
	t: number;
	// прямоугольник в координатах блоков (границы включительно) и высота поверхности
	x0: number;
	z0: number;
	x1: number;
	z1: number;
	// высота поверхности (обычно верх блока минус 0.12, как в игре)
	y: number;
	opacity?: number;
	// оттенок (день/ночь); можно env.tint
	tint?: THREE.ColorRepresentation;
	// свой цвет воды вместо синего (умножается на рябь) — например, '#bfe8ff' для ледяной
	color?: THREE.ColorRepresentation;
	// скорость ряби (кадров текстуры в секунду)
	speed?: number;
	renderOrder?: number;
};

export const WaterSurface: React.FC<WaterSurfaceProps> = ({t, x0, z0, x1, z1, y, opacity = 0.72, tint = '#ffffff', color, speed = 15, renderOrder = 2}) => {
	const frames = waterFrames();
	const w = Math.abs(x1 - x0) + 1;
	const d = Math.abs(z1 - z0) + 1;
	const geo = useMemo(() => {
		const g = new THREE.PlaneGeometry(w, d);
		g.rotateX(-Math.PI / 2);
		// UV в блоках: один тайл ряби на блок
		const uv = g.getAttribute('uv') as THREE.BufferAttribute;
		for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
		return g;
	}, [w, d]);
	const mat = useMemo(() => new THREE.MeshBasicMaterial({transparent: true, depthWrite: false}), []);
	const frame = ((Math.floor(t * speed) % FRAMES) + FRAMES) % FRAMES;
	mat.map = frames[frame];
	mat.opacity = opacity;
	mat.color.set(tint);
	if (color !== undefined) mat.color.multiply(new THREE.Color(color));
	return <mesh geometry={geo} material={mat} position={[Math.min(x0, x1) + w / 2, y, Math.min(z0, z1) + d / 2]} renderOrder={renderOrder} />;
};
