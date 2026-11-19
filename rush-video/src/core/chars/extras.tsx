import React, {useMemo} from 'react';
import * as THREE from 'three';
import {projectToScreen, type CameraState} from '../camera';
import {layoutText} from '../hud/font';
import {dataTexture, TEX} from '../textures';

// Ник над головой и мягкая тень под ногами.

const tagCache = new Map<string, {tex: THREE.DataTexture; w: number; h: number}>();
const tagTexture = (text: string) => {
	let hit = tagCache.get(text);
	if (hit) return hit;
	const layout = layoutText(text);
	const w = Math.max(1, layout.width);
	// 7 строк букв + 2 строки под «хвостики» + 2 над (Ё)
	const h = 11;
	const data = new Uint8Array(w * h * 4);
	for (const p of layout.pixels) {
		const row = 8 - p.y;
		if (row < 0 || row >= h || p.x < 0 || p.x >= w) continue;
		const i = (row * w + p.x) * 4;
		data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
	}
	hit = {tex: dataTexture(data, w, h, true), w, h};
	tagCache.set(text, hit);
	return hit;
};

export type NameTagProps = {
	text: string;
	// точка, над которой висит ник (обычно headTop(...) персонажа)
	position: [number, number, number];
	cam: CameraState;
	color?: THREE.ColorRepresentation;
	// размер пикселя шрифта в блоках (в игре ≈ 0.03)
	size?: number;
	// не давать нику стать мельче стольких экранных пикселей на пиксель шрифта (читаемость на общих планах)
	minPx?: number;
	// насколько выше точки position висит табличка, блоки
	lift?: number;
	opacity?: number;
	// рисовать поверх блоков (ник видно сквозь стены, как в игре)
	onTop?: boolean;
	visible?: boolean;
};

// Ник как в игре: тёмная полупрозрачная плашка и пиксельный текст, всегда лицом к камере
export const NameTag: React.FC<NameTagProps> = ({text, position, cam, color = '#ffffff', size = 0.032, minPx = 3, lift = 0.32, opacity = 1, onTop = false, visible = true}) => {
	const tag = tagTexture(text);
	const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
	if (!visible || opacity <= 0.001) return null;
	const at: [number, number, number] = [position[0], position[1] + lift, position[2]];
	const screen = projectToScreen(cam, at);
	// на дальних планах увеличиваем, чтобы ник оставался читаемым
	const px = screen.behind ? size : Math.max(size, minPx / screen.pxPerBlock);
	return (
		<group position={[at[0], at[1] + px * 5.5, at[2]]} quaternion={cam.quaternion.clone()} scale={px} renderOrder={onTop ? 50 : 0}>
			<mesh geometry={plane} position={[0, 0, -0.5]} scale={[tag.w + 4, 11, 1]} renderOrder={onTop ? 50 : 3}>
				<meshBasicMaterial color="#000000" transparent opacity={0.5 * opacity} depthWrite={false} depthTest={!onTop} fog={false} />
			</mesh>
			{/* тень букв: читается и на снегу */}
			<mesh geometry={plane} position={[0.8, -0.8, -0.25]} scale={[tag.w, tag.h, 1]} renderOrder={onTop ? 50 : 3}>
				<meshBasicMaterial map={tag.tex} color="#000000" transparent opacity={0.7 * opacity} alphaTest={0.3} depthWrite={false} depthTest={!onTop} fog={false} />
			</mesh>
			<mesh geometry={plane} position={[0, 0, 0]} scale={[tag.w, tag.h, 1]} renderOrder={onTop ? 51 : 4}>
				<meshBasicMaterial map={tag.tex} color={color} transparent opacity={opacity} alphaTest={0.3} depthWrite={false} depthTest={!onTop} fog={false} toneMapped={false} />
			</mesh>
		</group>
	);
};

// Мягкая круглая тень на земле. y — высота поверхности под персонажем.
export const BlobShadow: React.FC<{x: number; z: number; y?: number; size?: number; opacity?: number}> = ({x, z, y = 0, size = 1.7, opacity = 0.5}) => {
	if (opacity <= 0.01 || size <= 0.01) return null;
	return (
		<mesh position={[x, y + 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} scale={size} renderOrder={1}>
			<planeGeometry args={[1, 1]} />
			<meshBasicMaterial map={TEX.glow()} color="#000000" transparent opacity={opacity} depthWrite={false} />
		</mesh>
	);
};

// Тень, которая слабеет и расплывается с высотой персонажа над землёй
export const shadowFor = (height: number, base = 1.7) => ({
	size: base + Math.max(0, height) * 0.25,
	opacity: 0.55 * Math.max(0, 1 - Math.max(0, height) / 12),
});

// Аддитивное пятно света (факел, лампа, вспышка). size — диаметр в блоках.
export const Glow: React.FC<{
	position: [number, number, number];
	color?: THREE.ColorRepresentation;
	size?: number;
	opacity?: number;
	// поверх всего (не прячется за блоками)
	onTop?: boolean;
}> = ({position, color = '#ff9a2e', size = 3.4, opacity = 0.5, onTop = false}) => {
	if (opacity <= 0.005 || size <= 0.001) return null;
	return (
		<sprite position={position} scale={size} renderOrder={onTop ? 40 : 2}>
			<spriteMaterial map={TEX.glow()} color={color} transparent opacity={Math.min(1, opacity)} depthWrite={false} depthTest={!onTop} blending={THREE.AdditiveBlending} fog={false} />
		</sprite>
	);
};
