import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Glow} from '../core/chars/extras';
import {clamp01, easeInQuad} from '../core/anim';
import {hash3} from '../core/rng';
import {TEX} from '../core/textures';
import {canvasTexture, cachedTex, P16} from './kit';

// Двери на петлях: полотно 1×2 блока толщиной 3 пикселя, рисунок — пиксельная текстура 16×32.
// position — низ оси петли (мир). Закрытое полотно идёт от петли вдоль локального +x,
// yaw — поворот закрытого полотна, open 0..1 — доля угла angle (положительный угол — полотно уходит в −z локально).

type DoorStyle = 'front' | 'bedroom';

// Рисунок полотна 16×32 (строка 0 — верх). '.' в окне — прозрачное стекло.
const paintDoor = (style: DoorStyle) => (ctx: CanvasRenderingContext2D) => {
	const base = style === 'front' ? [118, 84, 48] : [74, 50, 32];
	const dark = style === 'front' ? [74, 50, 28] : [44, 28, 18];
	const light = style === 'front' ? [146, 108, 64] : [98, 68, 42];
	for (let y = 0; y < 32; y++) {
		for (let x = 0; x < 16; x++) {
			let c = base.map((v) => v * (0.92 + hash3(x >> 2, y, 3, style === 'front' ? 31 : 32) * 0.12 + hash3(x, y, 4, 33) * 0.04));
			let a = 255;
			const edge = x === 0 || x === 15 || y === 0 || y === 31;
			// филёнки
			const inPanel = (x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
			const rim = (x0: number, y0: number, x1: number, y1: number) => inPanel(x0, y0, x1, y1) && (x === x0 || x === x1 || y === y0 || y === y1);
			if (style === 'front') {
				// окошко 2×2 сверху с инеем
				if (inPanel(4, 3, 11, 10)) {
					if (x === 4 || x === 11 || y === 3 || y === 10 || x === 7 || x === 8 || y === 6 || y === 7) c = dark;
					else {
						const cx = x < 8 ? (x < 6 ? 5 : 6) : x < 10 ? 9 : 10;
						const frost = hash3(x, y, 5, 34) < 0.35 && (x === 5 || x === 10 || y === 4 || y === 9);
						if (frost) c = [228, 238, 248];
						else a = 0;
						void cx;
					}
				} else if (rim(3, 13, 12, 20) || rim(3, 23, 12, 29)) c = dark;
				else if (inPanel(4, 14, 11, 19) || inPanel(4, 24, 11, 28)) c = c.map((v, i) => v * 0.9 + light[i] * 0.1);
			} else {
				if (rim(3, 3, 12, 14) || rim(3, 17, 12, 28)) c = dark;
				else if (inPanel(4, 4, 11, 13) || inPanel(4, 18, 11, 27)) c = c.map((v, i) => v * 0.85 + light[i] * 0.15);
			}
			if (edge) c = dark;
			ctx.fillStyle = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a / 255})`;
			ctx.fillRect(x, y, 1, 1);
		}
	}
};

const doorTex = (style: DoorStyle) => cachedTex(`door-${style}`, () => canvasTexture(16, 32, paintDoor(style), true));

export type SwingDoorProps = {
	position: [number, number, number];
	yaw?: number;
	open?: number;
	// угол при open = 1, рад (знак — сторона)
	angle?: number;
	style?: DoorStyle;
	// оттенок полотна (множитель)
	tint?: THREE.ColorRepresentation;
};

export const SwingDoor: React.FC<SwingDoorProps> = ({position, yaw = 0, open = 0, angle = 1.6, style = 'front', tint = '#ffffff'}) => {
	const mats = useMemo(() => {
		const map = doorTex(style);
		const face = new THREE.MeshLambertMaterial({map, alphaTest: 0.5, side: THREE.DoubleSide});
		const edge = new THREE.MeshLambertMaterial({color: style === 'front' ? '#5a3d22' : '#3a2616'});
		const metal = new THREE.MeshLambertMaterial({color: '#c9a45a', emissive: '#2a1c08'});
		const iron = new THREE.MeshLambertMaterial({color: '#3a3a40'});
		const glass = new THREE.MeshBasicMaterial({color: '#cfe2f5', transparent: true, opacity: 0.18, depthWrite: false});
		return {face, edge, metal, iron, glass};
	}, [style]);
	mats.face.color.set(tint);
	const th = 3 * P16;
	const rot = yaw + open * angle;
	return (
		<group position={position} rotation={[0, rot, 0]}>
			{/* полотно: лицевые стороны с рисунком, торцы однотонные */}
			<mesh position={[0.5, 1, 0]} material={[mats.edge, mats.edge, mats.edge, mats.edge, mats.face, mats.face]}>
				<boxGeometry args={[1 - 0.02, 2 - 0.03, th]} />
			</mesh>
			{style === 'front' ? (
				<mesh position={[0.5, 2 - 6.5 / 16, 0]} material={mats.glass}>
					<boxGeometry args={[7 / 16, 7 / 16, th * 0.4]} />
				</mesh>
			) : null}
			{/* ручки с обеих сторон и петли */}
			{[1, -1].map((s) => (
				<group key={s} position={[13.5 * P16, 15.5 * P16, s * (th / 2 + 0.5 * P16)]}>
					<mesh material={mats.metal}>
						<boxGeometry args={[1 * P16, 3 * P16, 1 * P16]} />
					</mesh>
					<mesh material={mats.metal} position={[-0.8 * P16, 0.6 * P16, s * 0.7 * P16]}>
						<boxGeometry args={[2.5 * P16, 0.8 * P16, 0.8 * P16]} />
					</mesh>
				</group>
			))}
			{[5, 26].map((y) => (
				<mesh key={y} material={mats.iron} position={[0.6 * P16, y * P16, 0]}>
					<boxGeometry args={[1.6 * P16, 2 * P16, th + 0.6 * P16]} />
				</mesh>
			))}
		</group>
	);
};

// ---------- входная дверь со светом под ней и пятном дневного света ----------

// мягкое пятно (для света на полу): трапеция, яркая у двери и тающая в глубину
const pool = () =>
	cachedTex('door-pool', () =>
		canvasTexture(64, 64, (ctx) => {
			const img = ctx.createImageData(64, 64);
			for (let y = 0; y < 64; y++) {
				for (let x = 0; x < 64; x++) {
					// y = 0 — у двери
					const v = y / 63;
					const half = 0.32 + v * 0.22;
					const dx = Math.abs(x / 63 - 0.5);
					const side = clamp01((half - dx) / 0.12);
					const a = side * Math.pow(1 - v, 1.6);
					const i = (y * 64 + x) * 4;
					img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
					img.data[i + 3] = Math.round(a * 255);
				}
			}
			ctx.putImageData(img, 0, 0);
		}),
	);

export type FrontDoorProps = {
	position: [number, number, number];
	yaw?: number;
	open?: number;
	angle?: number;
	// дневной свет снаружи 0..1: полоска под дверью, пятно на полу, свет в проёме
	daylight?: number;
	daylightColor?: string;
	t?: number;
};

// Входная дверь. Пол дома — на высоте position[1]; проём 1×2 блока начинается от петли вдоль +x (локально),
// дом — в локальном −z (туда дверь открывается).
export const FrontDoor: React.FC<FrontDoorProps> = ({position, yaw = 0, open = 0, angle = 1.75, daylight = 1, daylightColor = '#d7e6ff', t = 0}) => {
	const k = clamp01(open);
	const poolMat = useMemo(() => new THREE.MeshBasicMaterial({map: pool(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false}), []);
	const leakMat = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false, fog: false}), []);
	leakMat.color.set(daylightColor).multiplyScalar(0.55 + 0.45 * daylight);
	// пятно на полу: узкая полоска у закрытой двери -> вытянутый «ковёр» света в открытой
	const spread = 0.12 + easeInQuad(k) * 0.88;
	const len = 0.35 + spread * 2.6;
	poolMat.color.set(daylightColor).multiplyScalar(daylight * (0.35 + 0.4 * spread) * (1 + Math.sin(t * 1.3) * 0.02));
	return (
		<group position={position} rotation={[0, yaw, 0]}>
			<SwingDoor position={[0, 0.03, 0]} open={k} angle={angle} style="front" />
			{/* щель под дверью */}
			{daylight > 0.01 ? (
				<>
					<mesh material={leakMat} position={[0.5, 0.015, 0.06]}>
						<boxGeometry args={[0.96, 0.03, 0.08]} />
					</mesh>
					<mesh material={poolMat} position={[0.5, 0.012, -len / 2]} rotation={[-Math.PI / 2, 0, Math.PI]} renderOrder={3}>
						<planeGeometry args={[1.1 + spread * 0.5, len]} />
					</mesh>
					<Glow position={[0.5, 0.05, -0.05]} color={daylightColor} size={0.9 + spread * 1.6} opacity={0.22 * daylight} />
					{/* свет в проёме, когда дверь открыта */}
					{k > 0.02 ? (
						<sprite position={[0.5, 1.0, 0.3]} scale={[1.6, 2.6, 1]} renderOrder={4}>
							<spriteMaterial map={TEX.glow()} color={daylightColor} transparent opacity={0.28 * daylight * k} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
						</sprite>
					) : null}
				</>
			) : null}
		</group>
	);
};

// ---------- дверь комнаты ----------
export type BedroomDoorProps = {position: [number, number, number]; yaw?: number; open?: number; angle?: number};
export const BedroomDoor: React.FC<BedroomDoorProps> = ({position, yaw = 0, open = 0, angle = Math.PI / 2}) => <SwingDoor position={position} yaw={yaw} open={open} angle={angle} style="bedroom" />;

// Удар двери: распахивается от start до impact (разгон), бьётся о стену и отскакивает затухающими колебаниями.
// Возвращает open 0..1 (никогда не больше 1 — за стену не проходит). bounce — доля отскока (0.12 — заметный).
export const slamOpen = (t: number, start: number, impact: number, bounce = 0.12, settle = 0.7) => {
	if (t <= start) return 0;
	if (t < impact) {
		const x = (t - start) / (impact - start);
		return x * x * (1.6 - 0.6 * x);
	}
	const dt = t - impact;
	const env = Math.exp(-dt * (5 / settle));
	return 1 - bounce * Math.abs(Math.sin(dt * 14)) * env;
};
