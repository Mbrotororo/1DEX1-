import React, {useMemo} from 'react';
import type * as THREE from 'three';
import {clamp01} from '../anim';
import {hash3} from '../rng';
import {InstancedBlocks, type BlockAnim} from './InstancedBlocks';
import type {VoxelMeshes} from './mesher';
import {VoxelMesh, type VoxelMeshProps} from './VoxelMesh';
import type {BlockInst} from './world';

// Волна по полосам: мир собирается (assemble) или рассыпается (dissolve) полоса за полосой.
// Полосы «позади» волны рисует VoxelMesh одной геометрией, а те, по которым волна идёт
// прямо сейчас, — InstancedBlocks, каждый блок со своей анимацией.

export type WaveMode = 'assemble' | 'dissolve';

// Чистая арифметика волны. front — положение фронта в номерах полос (дробное), span — ширина
// волны в полосах (сколько полос анимируется одновременно).
//  assemble: front растёт 0 → max+span+1. Полоса b: p = (front - b) / span: 0 — ещё нет, 1 — встала на место.
//  dissolve: front убывает max+1 → -span. Полоса b: p = (b - front) / span: 0 — цела, 1 — исчезла.
export const waveSplit = (front: number, span: number, mode: WaveMode, maxBand: number) => {
	let meshHi: number;
	let from: number;
	let to: number;
	if (mode === 'assemble') {
		meshHi = Math.floor(front - span) + 1;
		from = meshHi;
		to = Math.ceil(front) - 1;
	} else {
		meshHi = Math.floor(front) + 1;
		from = meshHi;
		to = Math.ceil(front + span) - 1;
	}
	meshHi = Math.max(0, Math.min(maxBand + 1, meshHi));
	from = Math.max(0, from);
	to = Math.min(maxBand, to);
	const active: number[] = [];
	for (let b = from; b <= to; b++) active.push(b);
	const progress = (band: number) => clamp01(mode === 'assemble' ? (front - band) / span : (band - front) / span);
	return {
		// диапазон полос для VoxelMesh: [0, meshHi)
		meshBands: [0, meshHi] as [number, number],
		// полосы, которые сейчас анимируются
		active,
		// прогресс полосы 0..1 (смысл зависит от режима, см. выше)
		progress,
	};
};

// Прогресс отдельного блока: блоки одной полосы стартуют вразнобой (stagger 0..1+),
// но все успевают закончить к концу прогресса полосы.
export const blockProgress = (bandProgress: number, block: BlockInst, stagger = 0.6) =>
	clamp01(bandProgress * (1 + stagger) - hash3(block.x, block.y, block.z, 733) * stagger);

export type BandWaveProps = Omit<VoxelMeshProps, 'bands' | 'meshes'> & {
	meshes: VoxelMeshes;
	// блоки по полосам из bandBlocks(bands)
	shell: BlockInst[][];
	mode: WaveMode;
	front: number;
	span?: number;
	// разброс старта блоков внутри полосы
	stagger?: number;
	// анимация блока: p — его прогресс 0..1 (assemble: 0 — нет, 1 — на месте; dissolve: 0 — цел, 1 — исчез)
	animate: (block: BlockInst, p: number, out: BlockAnim, index: number) => void;
	mixColor?: THREE.ColorRepresentation;
};

export const BandWave: React.FC<BandWaveProps> = ({meshes, shell, mode, front, span = 3, stagger = 0.6, animate, mixColor, ...meshProps}) => {
	const split = waveSplit(front, span, mode, shell.length - 1);
	const key = split.active.length > 0 ? `${split.active[0]}:${split.active[split.active.length - 1]}` : '';
	// список блоков пересобирается, только когда меняется набор активных полос
	const blocks = useMemo(() => {
		const out: BlockInst[] = [];
		for (const b of split.active) {
			const list = shell[b];
			if (list) for (const blk of list) out.push(blk);
		}
		return out;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, shell]);

	return (
		<>
			<VoxelMesh meshes={meshes} bands={split.meshBands} {...meshProps} />
			<InstancedBlocks
				blocks={blocks}
				tint={meshProps.tint}
				mixColor={mixColor}
				position={meshProps.position}
				animate={(blk, i, out) => animate(blk, blockProgress(split.progress(blk.band ?? 0), blk, stagger), out, i)}
			/>
		</>
	);
};
