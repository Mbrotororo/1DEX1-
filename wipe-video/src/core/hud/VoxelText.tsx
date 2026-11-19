import React, {createContext, useContext, useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {easeInCubic, easeOutBack, easeOutCubic, prog} from '../anim';
import {FACE_SHADES} from '../voxel/mesher';
import {layoutText} from './font';

// Объёмная пиксельная надпись: каждый пиксель буквы — отдельный кубик.
// Тёмное «тело» с обводкой + цветная лицевая сторона с градиентом.

// true внутри <HudLayer>: материалы рисуются поверх мира
export const HudContext = createContext(false);
export const HUD_ORDER = 1000;

const dummy = new THREE.Object3D();
const TEXT_SHADES = [0.55, 0.42, 0.82, 0.32, 1, 0.3];
const OUTLINE = 0.2;
const FACE_DEPTH = 0.4;

// Куб с запечённым затенением граней (порядок граней: +x, -x, +y, -y, +z, -z)
export const shadedBox = (w = 1, h = 1, d = 1, shades: number[] = FACE_SHADES) => {
	const geo = new THREE.BoxGeometry(w, h, d);
	const colors = new Float32Array(24 * 3);
	for (let face = 0; face < 6; face++) {
		for (let v = 0; v < 4; v++) {
			const i = (face * 4 + v) * 3;
			colors[i] = colors[i + 1] = colors[i + 2] = shades[face];
		}
	}
	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return geo;
};

export type VoxelTextProps = {
	text: string;
	// текущее время (сек)
	t: number;
	// размер одного пикселя буквы (в единицах родителя: блоки в мире, пиксели кадра в HudLayer)
	px: number;
	// толщина букв в пикселях шрифта
	depth?: number;
	// цвета лицевой стороны: градиент сверху вниз, и цвет «тела»
	top: string;
	bottom: string;
	body: string;
	// когда появиться; буквы выпадают по очереди с шагом stagger
	appearAt?: number;
	stagger?: number;
	// когда улететь (если не задано — остаётся)
	exitAt?: number;
	position?: [number, number, number];
	rotation?: [number, number, number];
	// покачивание букв после появления (в пикселях шрифта)
	wobble?: number;
	// выравнивание относительно position
	align?: 'center' | 'left' | 'right';
	// общий масштаб (для «удара»: 1 + impulse(...))
	scale?: number;
	// как появляются буквы: drop — падают сверху, pop — вырастают на месте, none — сразу стоят
	enter?: 'drop' | 'pop' | 'none';
	// подвержена ли надпись туману сцены (для надписей в мире)
	fog?: boolean;
};

export const VoxelText: React.FC<VoxelTextProps> = ({
	text,
	t,
	px,
	depth = 2.2,
	top,
	bottom,
	body,
	appearAt = -1e9,
	stagger = 0.045,
	exitAt,
	position = [0, 0, 0],
	rotation = [0, 0, 0],
	wobble = 0.22,
	align = 'center',
	scale = 1,
	enter = 'drop',
	fog = false,
}) => {
	const hud = useContext(HudContext);
	const layout = useMemo(() => layoutText(text), [text]);
	const faceRef = useRef<THREE.InstancedMesh>(null);
	const bodyRef = useRef<THREE.InstancedMesh>(null);
	const coloredFor = useRef<string>('');

	const faceGeo = useMemo(() => shadedBox(1, 1, FACE_DEPTH, TEXT_SHADES), []);
	const bodyGeo = useMemo(() => shadedBox(1 + OUTLINE * 2, 1 + OUTLINE * 2, depth, TEXT_SHADES), [depth]);
	const faceMat = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true, fog, transparent: hud}), [fog, hud]);
	const bodyMat = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true, fog, transparent: hud}), [fog, hud]);
	bodyMat.color.set(body);

	const count = Math.max(1, layout.pixels.length);
	const glyphs = layout.glyphCenters.length;
	const visible = layout.pixels.length > 0 && t >= appearAt && (exitAt === undefined || t < exitAt + 0.5 + glyphs * 0.02);
	const colorKey = `${top}|${bottom}|${text}`;

	useLayoutEffect(() => {
		const face = faceRef.current;
		const bodyMesh = bodyRef.current;
		if (!face || !bodyMesh) return;

		if (coloredFor.current !== colorKey) {
			const a = new THREE.Color(top);
			const b = new THREE.Color(bottom);
			const c = new THREE.Color();
			layout.pixels.forEach((p, i) => {
				c.copy(a).lerp(b, p.v);
				face.setColorAt(i, c);
			});
			if (face.instanceColor) face.instanceColor.needsUpdate = true;
			coloredFor.current = colorKey;
		}
		if (!visible) return;

		// анимация каждой буквы: падает сверху и пружинит, при выходе улетает вверх
		const scales: number[] = [];
		const offsets: number[] = [];
		for (let g = 0; g < glyphs; g++) {
			const start = appearAt + g * stagger;
			const p = enter === 'none' ? 1 : prog(t, start, 0.38);
			let s = p <= 0 ? 0 : easeOutBack(p, 2.2);
			let oy = enter === 'drop' ? (1 - easeOutCubic(p)) * 7 : 0;
			if (p >= 1 && wobble !== 0) oy += Math.sin((t - Math.max(start, -1e6)) * 2.4 + g * 0.7) * wobble;
			if (exitAt !== undefined) {
				const e = easeInCubic(prog(t, exitAt + g * 0.02, 0.28));
				s *= 1 - e;
				oy += e * 6;
			}
			scales.push(s);
			offsets.push(oy);
		}

		const shift = align === 'center' ? layout.width / 2 : align === 'right' ? layout.width : 0;
		for (let i = 0; i < layout.pixels.length; i++) {
			const p = layout.pixels[i];
			const s = scales[p.glyph];
			const cx = layout.glyphCenters[p.glyph];
			const x = cx + (p.x + 0.5 - cx) * s - shift;
			const y = 3.5 + (p.y + 0.5 - 3.5) * s + offsets[p.glyph];

			dummy.position.set(x, y, depth / 2);
			dummy.scale.setScalar(s);
			dummy.updateMatrix();
			bodyMesh.setMatrixAt(i, dummy.matrix);

			dummy.position.set(x, y, depth + FACE_DEPTH / 2);
			dummy.updateMatrix();
			face.setMatrixAt(i, dummy.matrix);
		}
		face.count = layout.pixels.length;
		bodyMesh.count = layout.pixels.length;
		face.instanceMatrix.needsUpdate = true;
		bodyMesh.instanceMatrix.needsUpdate = true;
	});

	const order = hud ? HUD_ORDER + 1 : 0;
	return (
		<group position={position} rotation={rotation} scale={px * scale} visible={visible}>
			<instancedMesh key={`b${count}`} ref={bodyRef} args={[bodyGeo, bodyMat, count]} frustumCulled={false} renderOrder={order} />
			<instancedMesh key={`f${count}`} ref={faceRef} args={[faceGeo, faceMat, count]} frustumCulled={false} renderOrder={order} />
		</group>
	);
};
