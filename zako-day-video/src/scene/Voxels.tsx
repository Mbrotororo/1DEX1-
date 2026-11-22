import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import type {BlockMaterials, BlockType} from '../lib/blocks';
import {shadedBox} from '../lib/textures';

export type Block = {
	x: number;
	y: number;
	z: number;
	type: BlockType;
	// размер блока (для плит, ковров, кровати); по умолчанию 1x1x1
	size?: [number, number, number];
};

// Функция анимации блока: возвращает смещение по y и масштаб (0 — блока нет)
export type BlockAnim = (b: Block, i: number) => {dy?: number; scale?: number; spin?: number};

const dummy = new THREE.Object3D();

const Group: React.FC<{
	blocks: Block[];
	material: THREE.Material | THREE.Material[];
	geometry: THREE.BufferGeometry;
	anim?: BlockAnim;
	t: number;
}> = ({blocks, material, geometry, anim, t}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		blocks.forEach((b, i) => {
			const a = anim ? anim(b, i) : {};
			const sz = b.size ?? [1, 1, 1];
			const k = a.scale ?? 1;
			// блок стоит на своей клетке: (x, y, z) — левый нижний угол
			dummy.position.set(b.x + sz[0] / 2, b.y + sz[1] / 2 + (a.dy ?? 0), b.z + sz[2] / 2);
			dummy.rotation.set(0, a.spin ?? 0, 0);
			dummy.scale.set(sz[0] * k, sz[1] * k, sz[2] * k);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		});
		dummy.rotation.set(0, 0, 0);
		mesh.instanceMatrix.needsUpdate = true;
	}, [blocks, anim, t]);
	return <instancedMesh ref={ref} args={[geometry, material, blocks.length]} frustumCulled={false} />;
};

// Набор блоков: группирует по типу и рисует инстансами (быстро даже на CPU-рендере)
export const Voxels: React.FC<{
	blocks: Block[];
	materials: BlockMaterials;
	anim?: BlockAnim;
	t?: number;
}> = ({blocks, materials, anim, t = 0}) => {
	const geometry = useMemo(() => shadedBox(), []);
	const groups = useMemo(() => {
		const map = new Map<BlockType, Block[]>();
		for (const b of blocks) {
			const list = map.get(b.type) ?? [];
			list.push(b);
			map.set(b.type, list);
		}
		return [...map.entries()];
	}, [blocks]);
	return (
		<>
			{groups.map(([type, list]) => (
				<Group key={type} blocks={list} material={materials[type]} geometry={geometry} anim={anim} t={t} />
			))}
		</>
	);
};

// Помощники для построек
export const fill = (
	type: BlockType,
	x0: number,
	y0: number,
	z0: number,
	x1: number,
	y1: number,
	z1: number,
): Block[] => {
	const out: Block[] = [];
	for (let x = x0; x <= x1; x++)
		for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) out.push({x, y, z, type});
	return out;
};
