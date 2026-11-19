import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Glow, clamp01, mixHex} from '../../core';
import {DESK, PC} from '../../sets/house/anchors';

// Крупный план кнопки питания (B2): значок ⏻ на кнопке и голубое кольцо-свечение при включении.
// Кладётся поверх кнопки PcTower (у неё самой — только тёмная коробочка 1.3 px).

// ⏻ 9×9 пикселей
const GLYPH = ['....#....', '.##.#.##.', '#...#...#', '#...#...#', '#.......#', '#.......#', '#.......#', '.#.....#.', '..#####..'];

let glyphTex: THREE.DataTexture | null = null;
const glyph = () => {
	if (glyphTex) return glyphTex;
	const n = GLYPH.length;
	const data = new Uint8Array(n * n * 4);
	GLYPH.forEach((row, y) => {
		for (let x = 0; x < n; x++) {
			const i = ((n - 1 - y) * n + x) * 4;
			const on = row[x] === '#';
			data[i] = 255;
			data[i + 1] = 255;
			data[i + 2] = 255;
			data[i + 3] = on ? 255 : 0;
		}
	});
	glyphTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
	glyphTex.magFilter = THREE.NearestFilter;
	glyphTex.minFilter = THREE.NearestFilter;
	glyphTex.needsUpdate = true;
	return glyphTex;
};

const P16 = 1 / 16;
// Крышка корпуса для крупного плана: у PcTower лопасти верхнего переднего вентилятора на ~1 px
// пробивают крышку прямо у кнопки (на общих планах не видно). Кладём поверх свою крышку 1.2 px
// с кнопкой, значком ⏻ и кольцом; настоящая кнопка остаётся под ней.
const CAP = 1.2 * P16;
const TOP = DESK.top + 15 * P16;
const CENTER: [number, number, number] = [PC.position[0], TOP + CAP, PC.position[2] + (7 - 1.6) * P16];

export const PowerDecal: React.FC<{press: number; power: number}> = ({press, power}) => {
	const mats = useMemo(
		() => ({
			cap: new THREE.MeshLambertMaterial({color: '#1c1d24'}),
			button: new THREE.MeshLambertMaterial({color: '#2e3038'}),
			glyph: new THREE.MeshBasicMaterial({map: glyph(), transparent: true, alphaTest: 0.5, toneMapped: false}),
			ring: new THREE.MeshBasicMaterial({toneMapped: false}),
		}),
		[],
	);
	const p = clamp01(power);
	// до питания значок серый, потом — ярко-голубой
	mats.glyph.color.set(mixHex('#9aa2b4', '#8ff6ff', p));
	mats.ring.color.set(mixHex('#14161c', '#3fe0ff', p));
	// кнопка 1.3 px, высота 0.5 px, утапливается на 0.25 px
	const h = (0.5 - 0.25 * clamp01(press)) * P16;
	const r = 1.0 * P16;
	const w = 0.24 * P16;
	return (
		<>
			<mesh material={mats.cap} position={[PC.position[0], TOP + CAP / 2, PC.position[2]]}>
				<boxGeometry args={[7 * P16, CAP, 14 * P16]} />
			</mesh>
			<group position={CENTER}>
				<mesh material={mats.button} position={[0, h / 2, 0]}>
					<boxGeometry args={[1.3 * P16, h, 1.3 * P16]} />
				</mesh>
				<mesh material={mats.glyph} position={[0, h + 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
					<planeGeometry args={[1.0 * P16, 1.0 * P16]} />
				</mesh>
				{/* кольцо вокруг кнопки */}
				{[
					[0, r, 2 * r + w, w],
					[0, -r, 2 * r + w, w],
					[r, 0, w, 2 * r + w],
					[-r, 0, w, 2 * r + w],
				].map(([x, z, sx, sz], i) => (
					<mesh key={i} material={mats.ring} position={[x, 0.0015, z]} rotation={[-Math.PI / 2, 0, 0]}>
						<planeGeometry args={[sx, sz]} />
					</mesh>
				))}
				{p > 0.02 ? (
					<>
						<Glow position={[0, 0.03, 0]} color="#5fe8ff" size={0.34 * (0.6 + 0.4 * p)} opacity={0.75 * p} />
						<Glow position={[0, 0.02, 0]} color="#bff8ff" size={0.12} opacity={0.9 * p} />
					</>
				) : null}
			</group>
		</>
	);
};

export const BUTTON_CENTER = CENTER;

// План корпуса (B2): ореолы колец передних вентиляторов (видны сквозь стекло) и цветной свет внутри,
// чтобы волна RGB читалась, а корпус не был чёрной дырой. Цвета — как у ленты PcTower (rgbHue).
const FAN_Y = [3.4, 7.6, 11.8];
const hue = (t: number, i: number) => new THREE.Color().setHSL((((t * 0.22 + i) % 1) + 1) % 1, 1, 0.55);
export const TowerGlow: React.FC<{t: number; rgb: number}> = ({t, rgb}) => {
	if (rgb <= 0.01) return null;
	const z = PC.position[2] + (7 - 0.85) * P16;
	return (
		<group>
			{FAN_Y.map((fy, i) => {
				const lit = clamp01((rgb * 1.25 - (fy - 1) / 13) / 0.25);
				const c = hue(t, i * 0.15 + (fy / 15) * 0.35);
				return <Glow key={i} position={[PC.position[0] - 0.05, DESK.top + fy * P16, z]} color={c} size={0.6 * lit} opacity={0.6 * lit} />;
			})}
			<pointLight position={[PC.position[0] - 0.08, DESK.top + 0.45, PC.position[2] + 0.1]} color={hue(t, 0.4)} intensity={4 * rgb} distance={1.3} decay={1.3} />
			{/* отсвет на стол и коврик перед стеклом */}
			<pointLight position={[PC.position[0] - 0.4, DESK.top + 0.3, PC.position[2] - 0.1]} color={hue(t, 0.1)} intensity={1.6 * rgb} distance={1.4} decay={1.3} />
		</group>
	);
};
