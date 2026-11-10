import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {easeInCubic, easeOutBack, easeOutCubic, prog} from '../lib/anim';
import {layoutText} from '../lib/font';
import {shadedBox} from '../lib/textures';

// Объёмная пиксельная надпись: каждый пиксель буквы — отдельный кубик.
// Тёмное «тело» с обводкой + цветная лицевая сторона с градиентом.

const dummy = new THREE.Object3D();
const TEXT_SHADES = [0.55, 0.42, 0.82, 0.32, 1, 0.3];
const OUTLINE = 0.2;
const FACE_DEPTH = 0.4;

export type VoxelTextProps = {
	text: string;
	t: number;
	// размер одного пикселя буквы
	px: number;
	depth?: number;
	top: string;
	bottom: string;
	body: string;
	appearAt: number;
	stagger?: number;
	exitAt?: number;
	position?: [number, number, number];
	rotation?: [number, number, number];
	wobble?: number;
};

export const VoxelText: React.FC<VoxelTextProps> = ({
	text,
	t,
	px,
	depth = 2.2,
	top,
	bottom,
	body,
	appearAt,
	stagger = 0.045,
	exitAt,
	position = [0, 0, 0],
	rotation = [0, 0, 0],
	wobble = 0.22,
}) => {
	const layout = useMemo(() => layoutText(text), [text]);
	const faceRef = useRef<THREE.InstancedMesh>(null);
	const bodyRef = useRef<THREE.InstancedMesh>(null);
	const colored = useRef(false);

	const faceGeo = useMemo(() => shadedBox(1, 1, FACE_DEPTH, TEXT_SHADES), []);
	const bodyGeo = useMemo(() => shadedBox(1 + OUTLINE * 2, 1 + OUTLINE * 2, depth, TEXT_SHADES), [depth]);
	const faceMat = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true}), []);
	const bodyMat = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true, color: body}), [body]);

	const count = layout.pixels.length;
	const glyphs = layout.glyphCenters.length;
	const visible = t >= appearAt && (exitAt === undefined || t < exitAt + 0.5 + glyphs * 0.02);

	useLayoutEffect(() => {
		const face = faceRef.current;
		const bodyMesh = bodyRef.current;
		if (!face || !bodyMesh) return;

		if (!colored.current) {
			const a = new THREE.Color(top);
			const b = new THREE.Color(bottom);
			const c = new THREE.Color();
			layout.pixels.forEach((p, i) => {
				c.copy(a).lerp(b, p.v);
				face.setColorAt(i, c);
			});
			if (face.instanceColor) face.instanceColor.needsUpdate = true;
			colored.current = true;
		}
		if (!visible) return;

		// анимация каждой буквы: падает сверху и пружинит, при выходе улетает вверх
		const scales: number[] = [];
		const offsets: number[] = [];
		for (let g = 0; g < glyphs; g++) {
			const start = appearAt + g * stagger;
			const p = prog(t, start, 0.38);
			let s = p <= 0 ? 0 : easeOutBack(p, 2.2);
			let oy = (1 - easeOutCubic(p)) * 7;
			if (p >= 1) oy += Math.sin((t - start) * 2.4 + g * 0.7) * wobble;
			if (exitAt !== undefined) {
				const e = easeInCubic(prog(t, exitAt + g * 0.02, 0.28));
				s *= 1 - e;
				oy += e * 6;
			}
			scales.push(s);
			offsets.push(oy);
		}

		const half = layout.width / 2;
		for (let i = 0; i < count; i++) {
			const p = layout.pixels[i];
			const s = scales[p.glyph];
			const cx = layout.glyphCenters[p.glyph];
			const x = cx + (p.x + 0.5 - cx) * s - half;
			const y = 3.5 + (p.y + 0.5 - 3.5) * s + offsets[p.glyph];

			dummy.position.set(x, y, depth / 2);
			dummy.scale.setScalar(s);
			dummy.updateMatrix();
			bodyMesh.setMatrixAt(i, dummy.matrix);

			dummy.position.set(x, y, depth + FACE_DEPTH / 2);
			dummy.updateMatrix();
			face.setMatrixAt(i, dummy.matrix);
		}
		face.instanceMatrix.needsUpdate = true;
		bodyMesh.instanceMatrix.needsUpdate = true;
	}, [t, layout, count, glyphs, appearAt, stagger, exitAt, depth, top, bottom, wobble, visible]);

	return (
		<group position={position} rotation={rotation} scale={px} visible={visible}>
			<instancedMesh ref={bodyRef} args={[bodyGeo, bodyMat, count]} frustumCulled={false} />
			<instancedMesh ref={faceRef} args={[faceGeo, faceMat, count]} frustumCulled={false} />
		</group>
	);
};
