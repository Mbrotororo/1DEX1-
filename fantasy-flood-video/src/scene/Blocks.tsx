import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {easeOutBack, easeOutCubic, prog} from '../lib/anim';
import {shadedBox, type WorldTextures} from '../lib/textures';
import {WORLD, type Block, type BlockType, type Plant, type PlantKind} from '../lib/world';

const dummy = new THREE.Object3D();
const APPEAR = 0.34;

const basic = (map: THREE.Texture) => new THREE.MeshBasicMaterial({map, vertexColors: true});

const makeMaterials = (tex: WorldTextures): Record<BlockType, THREE.Material | THREE.Material[]> => {
	const grassSide = basic(tex.grassSide);
	const logSide = basic(tex.logSide);
	const logTop = basic(tex.logTop);
	return {
		// порядок граней куба: +x, -x, +y (верх), -y (низ), +z, -z
		grass: [grassSide, grassSide, basic(tex.grassTop), basic(tex.dirt), grassSide, grassSide],
		dirt: basic(tex.dirt),
		stone: basic(tex.stone),
		coal: basic(tex.ores.coal),
		iron: basic(tex.ores.iron),
		gold: basic(tex.ores.gold),
		diamond: basic(tex.ores.diamond),
		redstone: basic(tex.ores.redstone),
		log: [logSide, logSide, logTop, logTop, logSide, logSide],
		leaves: basic(tex.leaves),
		planks: basic(tex.planks),
		darkPlanks: basic(tex.darkPlanks),
		cobble: basic(tex.cobble),
		glass: basic(tex.glass),
		doorTop: basic(tex.doorTop),
		doorBottom: basic(tex.doorBottom),
	};
};

const BlockGroup: React.FC<{
	blocks: Block[];
	geometry: THREE.BufferGeometry;
	material: THREE.Material | THREE.Material[];
	t: number;
}> = ({blocks, geometry, material, t}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const settled = useRef(false);
	const end = useMemo(() => Math.max(...blocks.map((b) => b.appearAt)) + APPEAR, [blocks]);

	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		const done = t >= end;
		if (done && settled.current) return;
		settled.current = done;
		for (let i = 0; i < blocks.length; i++) {
			const b = blocks[i];
			// блок вылетает снизу и «щёлкает» на место
			const p = prog(t, b.appearAt, APPEAR);
			const s = p <= 0 ? 0 : easeOutBack(p, 1.3);
			dummy.position.set(b.x + 0.5, b.y + 0.5 - (1 - easeOutCubic(p)) * 2.6, b.z + 0.5);
			dummy.scale.setScalar(s);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}, [t, blocks, end]);

	return <instancedMesh ref={ref} args={[geometry, material, blocks.length]} frustumCulled={false} />;
};

export const Blocks: React.FC<{t: number; tex: WorldTextures}> = ({t, tex}) => {
	const geometry = useMemo(() => shadedBox(), []);
	const materials = useMemo(() => makeMaterials(tex), [tex]);
	const groups = useMemo(() => {
		const map = new Map<BlockType, Block[]>();
		for (const b of WORLD.blocks) {
			const list = map.get(b.type) ?? [];
			list.push(b);
			map.set(b.type, list);
		}
		return [...map.entries()];
	}, []);

	return (
		<>
			{groups.map(([type, blocks]) => (
				<BlockGroup key={type} blocks={blocks} geometry={geometry} material={materials[type]} t={t} />
			))}
		</>
	);
};

// ---------------- цветы и трава (две скрещённые плоскости) ----------------
const crossGeometry = () => {
	const geo = new THREE.BufferGeometry();
	const h = 0.5;
	const pos = new Float32Array([
		-h, 0, -h,  h, 0, h,  h, 1, h,  -h, 1, -h,
		-h, 0, h,  h, 0, -h,  h, 1, -h,  -h, 1, h,
	]);
	const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
	return geo;
};

const PlantGroup: React.FC<{plants: Plant[]; geometry: THREE.BufferGeometry; map: THREE.Texture; t: number}> = ({
	plants,
	geometry,
	map,
	t,
}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	const material = useMemo(
		() => new THREE.MeshBasicMaterial({map, alphaTest: 0.5, side: THREE.DoubleSide, color: '#e6e6e6'}),
		[map],
	);
	useLayoutEffect(() => {
		const mesh = ref.current;
		if (!mesh) return;
		for (let i = 0; i < plants.length; i++) {
			const p = plants[i];
			const grow = easeOutBack(prog(t, p.appearAt, 0.3));
			// вода смывает растение: оно подпрыгивает и исчезает
			const wash = prog(t, p.washAt, 0.22);
			const s = (t < p.appearAt ? 0 : grow) * (1 - wash);
			dummy.position.set(p.x + 0.5, Math.sin(wash * Math.PI) * 0.9 + wash * 0.6, p.z + 0.5);
			dummy.rotation.set(0, wash * 3, 0);
			dummy.scale.setScalar(s * 0.95);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		dummy.rotation.set(0, 0, 0);
		mesh.instanceMatrix.needsUpdate = true;
	}, [t, plants]);
	return <instancedMesh ref={ref} args={[geometry, material, plants.length]} frustumCulled={false} />;
};

export const Plants: React.FC<{t: number; tex: WorldTextures}> = ({t, tex}) => {
	const geometry = useMemo(() => crossGeometry(), []);
	const groups = useMemo(() => {
		const kinds: PlantKind[] = ['tallGrass', 'poppy', 'dandelion', 'cornflower'];
		return kinds
			.map((kind) => ({kind, plants: WORLD.plants.filter((p) => p.kind === kind)}))
			.filter((g) => g.plants.length > 0);
	}, []);
	return (
		<>
			{groups.map((g) => (
				<PlantGroup key={g.kind} plants={g.plants} geometry={geometry} map={tex[g.kind]} t={t} />
			))}
		</>
	);
};
