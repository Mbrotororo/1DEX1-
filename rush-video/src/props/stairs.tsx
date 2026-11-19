import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Bx, boxGeometry, cachedGeo, P16, vcMat} from './kit';

// Перила лестницы: столбики на ступенях, наклонный поручень и толстый столб внизу.
// Ступени: x0 + k, верх ступени — y0 + rise·(k+1); перила стоят вдоль линии z (у открытого края лестницы).

export type BanisterProps = {
	// x первой ступени, высота пола, z линии перил
	x0?: number;
	y0?: number;
	z?: number;
	// сколько ступеней с перилами, подъём ступени
	steps?: number;
	rise?: number;
	// высота поручня над носком ступени, блоки
	height?: number;
};

export const Banister: React.FC<BanisterProps> = ({x0 = 5, y0 = 0, z = 2.86, steps = 7, rise = 0.5, height = 1.0}) => {
	const geo = useMemo(
		() =>
			cachedGeo(`banister-${x0}-${y0}-${z}-${steps}-${rise}-${height}`, () => {
				const b: Bx[] = [];
				const H = height * 16;
				const zc = z * 16;
				for (let k = 0; k < steps; k++) {
					const x = (x0 + k + 0.5) * 16;
					const top = (y0 + rise * (k + 1)) * 16;
					// столбик стоит на ступени, верх — под поручнем
					const railY = top + H - (0.5 * rise * 16) / 1;
					b.push([x - 0.6, top, zc - 0.6, x + 0.6, railY, zc + 0.6, '#5a3a20']);
					b.push([x - 0.9, top, zc - 0.9, x + 0.9, top + 1, zc + 0.9, '#4a2e18']);
				}
				// столб внизу
				const nx = (x0 - 0.35) * 16;
				const ny = y0 * 16;
				b.push([nx - 1.4, ny, zc - 1.4, nx + 1.4, ny + H * 16 * 0 + 19, zc + 1.4, '#4a2e18', 0.06]);
				b.push([nx - 1.8, ny + 19, zc - 1.8, nx + 1.8, ny + 20.5, zc + 1.8, '#3a2412']);
				b.push([nx - 1.0, ny + 20.5, zc - 1.0, nx + 1.0, ny + 21.5, zc + 1.0, '#3a2412']);
				return boxGeometry(b, P16, 71);
			}),
		[x0, y0, z, steps, rise, height],
	);
	// поручень: от столба вверх по линии носков
	const rail = useMemo(() => {
		const xa = x0 - 0.35;
		const ya = y0 + height * 0.92 + 0.12;
		const xb = x0 + steps + 0.2;
		const yb = y0 + rise * (steps + 0.7) + height - rise * 0.5;
		const len = Math.hypot(xb - xa, yb - ya);
		const ang = Math.atan2(yb - ya, xb - xa);
		return {mid: [(xa + xb) / 2, (ya + yb) / 2, z] as [number, number, number], len, ang};
	}, [x0, y0, z, steps, rise, height]);
	const mat = useMemo(() => new THREE.MeshLambertMaterial({color: '#4a2e18'}), []);
	return (
		<>
			<mesh geometry={geo} material={vcMat()} />
			<mesh material={mat} position={rail.mid} rotation={[0, 0, rail.ang]}>
				<boxGeometry args={[rail.len, 2.2 * P16, 2.2 * P16]} />
			</mesh>
		</>
	);
};
