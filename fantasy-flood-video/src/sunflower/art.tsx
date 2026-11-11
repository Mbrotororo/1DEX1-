// Плоская 2D-графика для «Не свети»: небо, поле подсолнухов, вышка, люди.
// Всё рисуется SVG-примитивами в координатах кадра 1080×1920.
import React from 'react';
import {hash3} from '../lib/rng';

// ---------- Цвета ----------

const hex = (c: string) => {
	const n = parseInt(c.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a: string, b: string, k: number) => {
	const A = hex(a);
	const B = hex(b);
	const kk = Math.min(1, Math.max(0, k));
	const r = A.map((v, i) => Math.round(v + (B[i] - v) * kk));
	return `#${r.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
// Ночное затемнение: цвет уходит в тёмно-синий
export const night = (c: string, k: number) => mix(c, '#0a1030', k * 0.72);

export type SkyMode = 'dusk' | 'night' | 'dawn' | 'day';
const SKY: Record<SkyMode, [string, string, string]> = {
	dusk: ['#24264f', '#7d5f97', '#f2a487'],
	night: ['#050918', '#101d4a', '#24346a'],
	dawn: ['#2f3768', '#a985ad', '#f7c99c'],
	day: ['#4f7fc4', '#8fb6e2', '#e7dcc0'],
};
const skyColors = (a: SkyMode, b: SkyMode, k: number) => SKY[a].map((c, i) => mix(c, SKY[b][i], k));

// ---------- Небо ----------

export const Sky: React.FC<{from: SkyMode; to?: SkyMode; k?: number; horizon: number; id: string}> = ({from, to, k = 0, horizon, id}) => {
	const [top, mid, low] = skyColors(from, to ?? from, k);
	return (
		<>
			<defs>
				<linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={top} />
					<stop offset="0.62" stopColor={mid} />
					<stop offset="1" stopColor={low} />
				</linearGradient>
			</defs>
			<rect x={0} y={0} width={1080} height={horizon + 40} fill={`url(#sky-${id})`} />
		</>
	);
};

export const Stars: React.FC<{t: number; k: number; maxY: number}> = ({t, k, maxY}) => {
	if (k <= 0) return null;
	const out: React.ReactNode[] = [];
	for (let i = 0; i < 90; i++) {
		const x = hash3(i, 1, 77) * 1080;
		const y = hash3(i, 2, 77) * maxY;
		const r = hash3(i, 3, 77) > 0.85 ? 2.6 : 1.5;
		const tw = 0.55 + 0.45 * Math.sin(t * (0.8 + hash3(i, 4, 77) * 2.5) + i);
		out.push(<circle key={i} cx={x} cy={y} r={r} fill="#e8ecff" opacity={k * tw * (1 - y / maxY) * 0.95} />);
	}
	return <>{out}</>;
};

export const Moon: React.FC<{x: number; y: number; r?: number; k?: number}> = ({x, y, r = 62, k = 1}) => (
	<g opacity={k}>
		<circle cx={x} cy={y} r={r * 2.6} fill="#c9d6ff" opacity={0.08} />
		<circle cx={x} cy={y} r={r * 1.6} fill="#c9d6ff" opacity={0.1} />
		<circle cx={x} cy={y} r={r} fill="#eef1fb" />
		<circle cx={x - r * 0.3} cy={y - r * 0.15} r={r * 0.18} fill="#d7dcec" />
		<circle cx={x + r * 0.28} cy={y + r * 0.3} r={r * 0.12} fill="#d7dcec" />
		<circle cx={x + r * 0.15} cy={y - r * 0.4} r={r * 0.08} fill="#d7dcec" />
	</g>
);

export const Sun: React.FC<{x: number; y: number; r?: number; color?: string; k?: number}> = ({x, y, r = 90, color = '#fff4d6', k = 1}) => (
	<g opacity={k}>
		<circle cx={x} cy={y} r={r * 4} fill={color} opacity={0.1} />
		<circle cx={x} cy={y} r={r * 2.2} fill={color} opacity={0.18} />
		<circle cx={x} cy={y} r={r} fill={color} />
	</g>
);

// Линия деревьев на горизонте (круглые кроны, как в референсе)
export const TreeLine: React.FC<{y: number; color: string; seed?: number; dense?: number; scale?: number}> = ({y, color, seed = 1, dense = 11, scale = 1}) => {
	const out: React.ReactNode[] = [];
	for (let i = 0; i < dense; i++) {
		const x = (i / (dense - 1)) * 1160 - 40 + (hash3(i, 0, seed) - 0.5) * 50;
		const s = (0.75 + hash3(i, 1, seed) * 0.5) * scale;
		const h = 46 * s;
		out.push(
			<g key={i}>
				<rect x={x - 5 * s} y={y - h} width={10 * s} height={h} fill={color} />
				<circle cx={x} cy={y - h - 30 * s} r={38 * s} fill={color} />
				<circle cx={x - 26 * s} cy={y - h - 8 * s} r={26 * s} fill={color} />
				<circle cx={x + 26 * s} cy={y - h - 10 * s} r={28 * s} fill={color} />
			</g>,
		);
	}
	return <>{out}</>;
};

// Густой лес (для сцены «там лес»)
export const Forest: React.FC<{y: number; color: string; seed?: number}> = ({y, color, seed = 9}) => {
	const out: React.ReactNode[] = [];
	for (let i = 0; i < 26; i++) {
		const x = (i / 25) * 1180 - 50;
		const h = 120 + hash3(i, 2, seed) * 120;
		const w = 70 + hash3(i, 3, seed) * 40;
		out.push(<path key={i} d={`M ${x - w / 2} ${y} L ${x} ${y - h} L ${x + w / 2} ${y} Z`} fill={color} />);
	}
	return (
		<>
			{out}
			<rect x={0} y={y - 2} width={1080} height={40} fill={color} />
		</>
	);
};

export const Ground: React.FC<{y: number; top: string; bottom: string; id: string}> = ({y, top, bottom, id}) => (
	<>
		<defs>
			<linearGradient id={`gr-${id}`} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stopColor={top} />
				<stop offset="1" stopColor={bottom} />
			</linearGradient>
		</defs>
		<rect x={0} y={y} width={1080} height={1920 - y} fill={`url(#gr-${id})`} />
	</>
);

// ---------- Подсолнух ----------

export type FlowerProps = {
	x: number;
	y: number; // земля
	h: number; // высота стебля
	s: number; // радиус головы
	droop?: number; // 0 — смотрит на нас, 1 — голова опущена
	lean?: number; // наклон стебля в градусах (+ вправо)
	eyes?: number; // «глаза» в семечках
	dark?: number; // ночное затемнение
	gap?: boolean; // пустое место: только сломанный стебель
	wear?: 'knit' | 'hood'; // вязаная шапка Серёги или синий капюшон героя
};

export const Sunflower: React.FC<FlowerProps> = ({x, y, h, s, droop = 0, lean = 0, eyes = 0, dark = 0, gap = false, wear}) => {
	const a = (lean * Math.PI) / 180;
	const tx = x + Math.sin(a) * h;
	const ty = y - Math.cos(a) * h;
	const stem = night('#4f7a2e', dark);
	const leaf = night('#5f8f35', dark);
	const petal = night('#f3b51b', dark);
	const petal2 = night('#e39a12', dark);
	const disc = night('#5b3a1c', dark);
	const back = night('#4b6e2a', dark);
	const cx1 = x + Math.sin(a) * h * 0.4;
	const cy1 = y - h * 0.55;
	if (gap) {
		return (
			<g>
				<path d={`M ${x} ${y} Q ${x + 6} ${y - h * 0.2} ${x - 4} ${y - h * 0.32}`} stroke={stem} strokeWidth={s * 0.16} fill="none" strokeLinecap="round" />
			</g>
		);
	}
	const d = Math.min(1, Math.max(0, droop));
	// голова: при опускании сплющивается по вертикали и уходит вниз, видна зелёная «спинка»
	const hx = tx + Math.sin(a) * s * 0.2;
	const hy = ty + d * s * 0.95;
	const squash = Math.max(0.12, 1 - d * 0.88);
	const petals: React.ReactNode[] = [];
	const N = 16;
	for (let i = 0; i < N; i++) {
		const ang = (i / N) * 360;
		petals.push(
			<ellipse key={i} cx={0} cy={-s * 0.78} rx={s * 0.2} ry={s * 0.42} fill={i % 2 ? petal : petal2} transform={`rotate(${ang})`} />,
		);
	}
	return (
		<g>
			<path d={`M ${x} ${y} Q ${cx1} ${cy1} ${tx} ${ty + d * s * 0.3}`} stroke={stem} strokeWidth={s * 0.16} fill="none" strokeLinecap="round" />
			<ellipse cx={x + Math.sin(a) * h * 0.35 - s * 0.45} cy={y - h * 0.42} rx={s * 0.55} ry={s * 0.22} fill={leaf} transform={`rotate(-25 ${x + Math.sin(a) * h * 0.35 - s * 0.45} ${y - h * 0.42})`} />
			<ellipse cx={x + Math.sin(a) * h * 0.25 + s * 0.45} cy={y - h * 0.28} rx={s * 0.5} ry={s * 0.2} fill={leaf} transform={`rotate(25 ${x + Math.sin(a) * h * 0.25 + s * 0.45} ${y - h * 0.28})`} />
			<g transform={`translate(${hx} ${hy}) rotate(${lean * 0.6}) scale(1 ${squash})`}>
				{petals}
				{wear === 'hood' ? (
					<path
						d={`M ${-s * 1.3} ${s * 0.7} Q ${-s * 1.5} ${-s * 1.55} 0 ${-s * 1.6} Q ${s * 1.5} ${-s * 1.55} ${s * 1.3} ${s * 0.7} L ${s * 0.92} ${s * 0.75} Q ${s * 1.0} ${-s * 0.95} 0 ${-s * 1.0} Q ${-s * 1.0} ${-s * 0.95} ${-s * 0.92} ${s * 0.75} Z`}
						fill={night('#2f4b7c', dark)}
					/>
				) : null}
				<circle r={s * 0.58} fill={disc} />
				<circle r={s * 0.4} fill={night('#3f2712', dark)} />
				{wear === 'knit' ? (
					<>
						<path d={`M ${-s * 0.92} ${-s * 0.22} Q ${-s * 0.9} ${-s * 1.45} 0 ${-s * 1.45} Q ${s * 0.9} ${-s * 1.45} ${s * 0.92} ${-s * 0.22} Z`} fill={night('#b4572d', dark)} />
						<rect x={-s * 0.98} y={-s * 0.48} width={s * 1.96} height={s * 0.3} rx={s * 0.08} fill={night('#8e4021', dark)} />
					</>
				) : null}
				{eyes > 0 ? (
					<g opacity={eyes}>
						<ellipse cx={-s * 0.2} cy={-s * 0.08} rx={s * 0.1} ry={s * 0.07} fill="#f2ead2" />
						<ellipse cx={s * 0.2} cy={-s * 0.08} rx={s * 0.1} ry={s * 0.07} fill="#f2ead2" />
						<circle cx={-s * 0.2} cy={-s * 0.07} r={s * 0.04} fill="#111" />
						<circle cx={s * 0.2} cy={-s * 0.07} r={s * 0.04} fill="#111" />
					</g>
				) : null}
			</g>
			{d > 0.05 ? (
				<g opacity={Math.min(1, d * 1.4)} transform={`translate(${hx} ${hy + s * 0.15 * d})`}>
					<ellipse rx={s * 0.95} ry={s * 0.62 * Math.max(0.3, d)} fill={back} />
					<ellipse rx={s * 0.7} ry={s * 0.42 * Math.max(0.3, d)} fill={night('#3d5c22', dark)} />
				</g>
			) : null}
		</g>
	);
};

// Ряды подсолнухов с перспективой. rowFn позволяет менять каждый цветок.
export type FieldRow = {y: number; s: number; count: number; offset?: number};
export const Field: React.FC<{
	rows: FieldRow[];
	dark?: number;
	flower?: (row: number, i: number, x: number) => Partial<FlowerProps> | null;
}> = ({rows, dark = 0, flower}) => (
	<>
		{rows.map((r, ri) => {
			const items: React.ReactNode[] = [];
			const step = 1180 / r.count;
			for (let i = 0; i < r.count; i++) {
				const x = -50 + step * (i + 0.5) + (r.offset ?? 0) + (hash3(i, ri, 5) - 0.5) * step * 0.25;
				const over = flower?.(ri, i, x);
				if (over === null) continue;
				items.push(
					<Sunflower
						key={i}
						x={x}
						y={r.y}
						h={r.s * 4.2 * (0.92 + hash3(i, ri, 6) * 0.16)}
						s={r.s}
						dark={dark}
						lean={(hash3(i, ri, 7) - 0.5) * 6}
						{...over}
					/>,
				);
			}
			return <g key={ri}>{items}</g>;
		})}
	</>
);

// ---------- Вышка ----------

export const TOWER_TOP = (baseY: number, k: number) => baseY - 430 * k;

export const Tower: React.FC<{x: number; y: number; k?: number; dark?: number; lamp?: number}> = ({x, y, k = 1, dark = 0, lamp = 0}) => {
	const wood = night('#7b5534', dark);
	const woodD = night('#5a3c22', dark);
	const top = y - 430 * k;
	const w = 210 * k;
	return (
		<g>
			{/* ноги */}
			<path d={`M ${x - w * 0.62} ${y} L ${x - w * 0.42} ${top}`} stroke={woodD} strokeWidth={16 * k} />
			<path d={`M ${x + w * 0.62} ${y} L ${x + w * 0.42} ${top}`} stroke={woodD} strokeWidth={16 * k} />
			<path d={`M ${x - w * 0.36} ${y} L ${x - w * 0.3} ${top}`} stroke={wood} strokeWidth={14 * k} />
			<path d={`M ${x + w * 0.36} ${y} L ${x + w * 0.3} ${top}`} stroke={wood} strokeWidth={14 * k} />
			{/* раскосы */}
			<path d={`M ${x - w * 0.57} ${y - 110 * k} L ${x + w * 0.52} ${y - 250 * k} M ${x + w * 0.57} ${y - 110 * k} L ${x - w * 0.52} ${y - 250 * k}`} stroke={woodD} strokeWidth={8 * k} />
			{/* лестница */}
			<path d={`M ${x - 26 * k} ${y} L ${x - 20 * k} ${top} M ${x + 26 * k} ${y} L ${x + 20 * k} ${top}`} stroke={wood} strokeWidth={7 * k} />
			{Array.from({length: 11}, (_, i) => (
				<path key={i} d={`M ${x - 24 * k} ${y - (i + 0.5) * 38 * k} L ${x + 24 * k} ${y - (i + 0.5) * 38 * k}`} stroke={wood} strokeWidth={5 * k} />
			))}
			{/* площадка, перила, крыша */}
			<rect x={x - w * 0.55} y={top - 10 * k} width={w * 1.1} height={22 * k} fill={wood} />
			<rect x={x - w * 0.55} y={top - 80 * k} width={w * 1.1} height={10 * k} fill={wood} />
			<path d={`M ${x - w * 0.52} ${top - 80 * k} L ${x - w * 0.52} ${top} M ${x + w * 0.52} ${top - 80 * k} L ${x + w * 0.52} ${top}`} stroke={wood} strokeWidth={9 * k} />
			<path d={`M ${x - w * 0.5} ${top - 80 * k} L ${x - w * 0.5} ${top - 170 * k} M ${x + w * 0.5} ${top - 80 * k} L ${x + w * 0.5} ${top - 170 * k}`} stroke={woodD} strokeWidth={8 * k} />
			<path d={`M ${x - w * 0.72} ${top - 165 * k} L ${x} ${top - 235 * k} L ${x + w * 0.72} ${top - 165 * k} Z`} fill={night('#59402d', dark)} />
			{lamp > 0 ? (
				<g opacity={lamp}>
					<circle cx={x + w * 0.42} cy={top - 140 * k} r={60 * k} fill="#ffd27a" opacity={0.18} />
					<circle cx={x + w * 0.42} cy={top - 140 * k} r={9 * k} fill="#ffe2a0" />
				</g>
			) : null}
		</g>
	);
};

// ---------- Люди ----------

export type Look = {
	skin: string;
	hair: string;
	top: string;
	pants: string;
	hat?: 'cap' | 'knit' | 'none';
	hatColor?: string;
	moustache?: string;
};

export const HERO: Look = {skin: '#e9bb92', hair: '#3a2a1f', top: '#2f4b7c', pants: '#2a2b36', hat: 'none'};
export const FARMER: Look = {skin: '#d7a378', hair: '#bdb7ad', top: '#8e3b2d', pants: '#4b4134', hat: 'cap', hatColor: '#5a5e66', moustache: '#a8a29a'};
export const SERYOGA: Look = {skin: '#e2ae86', hair: '#6a4a2f', top: '#6c7a3c', pants: '#34353d', hat: 'knit', hatColor: '#b4572d'};

const tint = (look: Look, dark: number): Look => ({
	...look,
	skin: night(look.skin, dark * 0.9),
	hair: night(look.hair, dark),
	top: night(look.top, dark),
	pants: night(look.pants, dark),
	hatColor: look.hatColor ? night(look.hatColor, dark) : undefined,
	moustache: look.moustache ? night(look.moustache, dark) : undefined,
});

// Человек в полный рост. (x, y) — точка между ступнями, h — рост.
export const Person: React.FC<{
	x: number;
	y: number;
	h: number;
	look: Look;
	dark?: number;
	face?: number; // -1 влево, 0 прямо, 1 вправо
	walk?: number; // фаза шага (0 — стоит)
	arm?: 'down' | 'hold' | 'give';
	item?: 'thermos' | 'none';
	sit?: boolean;
	headShake?: number; // поворот головы в градусах
}> = ({x, y, h, look: raw, dark = 0, face = 0, walk = 0, arm = 'down', item = 'none', sit = false, headShake = 0}) => {
	const L = tint(raw, dark);
	const u = h / 100;
	const hipY = y - (sit ? 22 * u : 44 * u);
	const shY = hipY - 32 * u;
	const headR = 9 * u;
	const headY = shY - headR - 2 * u;
	const sw = Math.sin(walk) * 9 * u;
	const legW = 6.5 * u;
	const eyeDx = face * 3 * u;
	const armDown = (side: number) => {
		const sx = x + side * 9 * u;
		if (arm === 'hold' && side === 1) return `M ${sx} ${shY + 3 * u} L ${sx + 4 * u} ${shY + 18 * u} L ${sx + 10 * u} ${shY + 22 * u}`;
		if (arm === 'give' && side === face) return `M ${sx} ${shY + 3 * u} L ${sx + side * 16 * u} ${shY + 14 * u} L ${sx + side * 26 * u} ${shY + 12 * u}`;
		return `M ${sx} ${shY + 3 * u} L ${sx + side * 3 * u - sw * 0.3 * side} ${shY + 30 * u}`;
	};
	return (
		<g>
			{/* ноги */}
			{sit ? (
				<>
					<path d={`M ${x - 4 * u} ${hipY} L ${x - 4 * u + face * 16 * u} ${hipY + 2 * u} L ${x - 4 * u + face * 18 * u} ${y}`} stroke={L.pants} strokeWidth={legW} fill="none" strokeLinecap="round" strokeLinejoin="round" />
					<path d={`M ${x + 4 * u} ${hipY} L ${x + 4 * u + face * 16 * u} ${hipY + 2 * u} L ${x + 4 * u + face * 18 * u} ${y}`} stroke={L.pants} strokeWidth={legW} fill="none" strokeLinecap="round" strokeLinejoin="round" />
				</>
			) : (
				<>
					<path d={`M ${x - 4 * u} ${hipY} L ${x - 4 * u + sw} ${y - 3 * u}`} stroke={L.pants} strokeWidth={legW} strokeLinecap="round" />
					<path d={`M ${x + 4 * u} ${hipY} L ${x + 4 * u - sw} ${y - 3 * u}`} stroke={L.pants} strokeWidth={legW} strokeLinecap="round" />
					<ellipse cx={x - 4 * u + sw + face * 2 * u} cy={y - 2 * u} rx={5 * u} ry={2.6 * u} fill={night('#1d1a18', dark)} />
					<ellipse cx={x + 4 * u - sw + face * 2 * u} cy={y - 2 * u} rx={5 * u} ry={2.6 * u} fill={night('#1d1a18', dark)} />
				</>
			)}
			{/* туловище */}
			<rect x={x - 11 * u} y={shY} width={22 * u} height={34 * u} rx={7 * u} fill={L.top} />
			{/* руки */}
			<path d={armDown(-1)} stroke={L.top} strokeWidth={5.5 * u} fill="none" strokeLinecap="round" strokeLinejoin="round" />
			<path d={armDown(1)} stroke={L.top} strokeWidth={5.5 * u} fill="none" strokeLinecap="round" strokeLinejoin="round" />
			{item === 'thermos' ? <Thermos x={x + 14 * u} y={shY + 18 * u} h={16 * u} dark={dark} /> : null}
			{/* голова */}
			<g transform={`rotate(${headShake} ${x} ${headY + headR})`}>
				<rect x={x - 3 * u} y={headY + headR - 2 * u} width={6 * u} height={5 * u} fill={L.skin} />
				<circle cx={x} cy={headY} r={headR} fill={L.skin} />
				<path d={`M ${x - headR} ${headY - 1 * u} A ${headR} ${headR} 0 0 1 ${x + headR} ${headY - 1 * u} L ${x + headR} ${headY - 4 * u} Q ${x} ${headY - headR * 1.6} ${x - headR} ${headY - 4 * u} Z`} fill={L.hair} />
				{L.hat === 'cap' ? (
					<>
						<path d={`M ${x - headR * 1.02} ${headY - 2 * u} A ${headR * 1.02} ${headR * 1.02} 0 0 1 ${x + headR * 1.02} ${headY - 2 * u} Z`} fill={L.hatColor} />
						<rect x={x + (face >= 0 ? 0 : -headR * 1.5)} y={headY - 3 * u} width={headR * 1.5} height={2.4 * u} rx={u} fill={L.hatColor} />
					</>
				) : null}
				{L.hat === 'knit' ? (
					<>
						<path d={`M ${x - headR * 1.05} ${headY - 1 * u} Q ${x} ${headY - headR * 2.1} ${x + headR * 1.05} ${headY - 1 * u} Z`} fill={L.hatColor} />
						<rect x={x - headR * 1.08} y={headY - 3.2 * u} width={headR * 2.16} height={3.4 * u} rx={u} fill={night('#8e4021', dark)} />
					</>
				) : null}
				<circle cx={x - 3.2 * u + eyeDx} cy={headY + 1 * u} r={1.2 * u} fill={night('#1a1410', dark * 0.5)} />
				<circle cx={x + 3.2 * u + eyeDx} cy={headY + 1 * u} r={1.2 * u} fill={night('#1a1410', dark * 0.5)} />
				{L.moustache ? <rect x={x - 3.5 * u + eyeDx} y={headY + 4 * u} width={7 * u} height={1.8 * u} rx={0.9 * u} fill={L.moustache} /> : <path d={`M ${x - 2 * u + eyeDx} ${headY + 5 * u} L ${x + 2 * u + eyeDx} ${headY + 5 * u}`} stroke={night('#7a4a3a', dark)} strokeWidth={0.9 * u} strokeLinecap="round" />}
			</g>
		</g>
	);
};

// Крупный план лица с плечами. (cx, cy) — центр головы, r — радиус головы.
export type Expr = 'neutral' | 'smile' | 'serious' | 'scared' | 'stern';
export const Face: React.FC<{
	cx: number;
	cy: number;
	r: number;
	look: Look;
	expr?: Expr;
	lookX?: number;
	lookY?: number;
	blink?: number;
	turn?: number; // поворот головы, градусы
	dark?: number;
}> = ({cx, cy, r, look: raw, expr = 'neutral', lookX = 0, lookY = 0, blink = 0, turn = 0, dark = 0}) => {
	const L = tint(raw, dark);
	const eyeY = cy - r * 0.02;
	const eyeDx = r * 0.36;
	const ew = r * 0.17;
	const eh = r * (expr === 'scared' ? 0.17 : 0.12) * (1 - blink);
	const px = lookX * ew * 0.45;
	const py = lookY * eh * 0.4;
	const brow = (side: number) => {
		const bx = cx + side * eyeDx;
		const by = eyeY - r * 0.27;
		const tilt = expr === 'stern' || expr === 'serious' ? r * 0.06 : expr === 'scared' ? -r * 0.07 : 0;
		const lift = expr === 'scared' ? -r * 0.06 : 0;
		return `M ${bx - side * r * 0.18} ${by + lift - tilt} L ${bx + side * r * 0.16} ${by + lift + tilt * 0.4}`;
	};
	const mouth = () => {
		const my = cy + r * 0.48;
		switch (expr) {
			case 'smile':
				return `M ${cx - r * 0.24} ${my - r * 0.03} Q ${cx} ${my + r * 0.16} ${cx + r * 0.24} ${my - r * 0.03}`;
			case 'scared':
				return `M ${cx - r * 0.1} ${my} Q ${cx} ${my - r * 0.12} ${cx + r * 0.1} ${my} Q ${cx} ${my + r * 0.14} ${cx - r * 0.1} ${my}`;
			case 'stern':
			case 'serious':
				return `M ${cx - r * 0.2} ${my + r * 0.03} Q ${cx} ${my - r * 0.04} ${cx + r * 0.2} ${my + r * 0.03}`;
			default:
				return `M ${cx - r * 0.18} ${my} L ${cx + r * 0.18} ${my}`;
		}
	};
	return (
		<g transform={`rotate(${turn * 0.3} ${cx} ${cy + r * 1.2}) translate(${turn * r * 0.012} 0)`}>
			{/* плечи */}
			<path d={`M ${cx - r * 2.2} ${cy + r * 3.4} Q ${cx - r * 2.1} ${cy + r * 1.5} ${cx - r * 0.6} ${cy + r * 1.25} L ${cx + r * 0.6} ${cy + r * 1.25} Q ${cx + r * 2.1} ${cy + r * 1.5} ${cx + r * 2.2} ${cy + r * 3.4} Z`} fill={L.top} />
			<rect x={cx - r * 0.32} y={cy + r * 0.7} width={r * 0.64} height={r * 0.65} fill={L.skin} />
			{/* уши, голова */}
			<ellipse cx={cx - r * 0.95} cy={cy + r * 0.05} rx={r * 0.14} ry={r * 0.22} fill={L.skin} />
			<ellipse cx={cx + r * 0.95} cy={cy + r * 0.05} rx={r * 0.14} ry={r * 0.22} fill={L.skin} />
			<ellipse cx={cx} cy={cy} rx={r * 0.95} ry={r * 1.05} fill={L.skin} />
			{/* волосы / шапка */}
			{L.hat === 'knit' ? (
				<>
					<path d={`M ${cx - r * 1.02} ${cy - r * 0.32} Q ${cx - r} ${cy - r * 1.55} ${cx} ${cy - r * 1.55} Q ${cx + r} ${cy - r * 1.55} ${cx + r * 1.02} ${cy - r * 0.32} Z`} fill={L.hatColor} />
					<rect x={cx - r * 1.06} y={cy - r * 0.55} width={r * 2.12} height={r * 0.32} rx={r * 0.08} fill={night('#8e4021', dark)} />
				</>
			) : L.hat === 'cap' ? (
				<>
					<path d={`M ${cx - r * 0.98} ${cy - r * 0.38} Q ${cx - r * 0.9} ${cy - r * 1.35} ${cx} ${cy - r * 1.38} Q ${cx + r * 0.9} ${cy - r * 1.35} ${cx + r * 0.98} ${cy - r * 0.38} Z`} fill={L.hatColor} />
					<path d={`M ${cx - r * 0.9} ${cy - r * 0.42} Q ${cx} ${cy - r * 0.62} ${cx + r * 1.15} ${cy - r * 0.32} L ${cx + r * 1.1} ${cy - r * 0.2} Q ${cx} ${cy - r * 0.45} ${cx - r * 0.9} ${cy - r * 0.3} Z`} fill={night('#44474e', dark)} />
					<path d={`M ${cx - r * 0.98} ${cy - r * 0.3} Q ${cx - r * 1.02} ${cy + r * 0.1} ${cx - r * 0.9} ${cy + r * 0.25} L ${cx - r * 0.84} ${cy - r * 0.3} Z`} fill={L.hair} />
					<path d={`M ${cx + r * 0.98} ${cy - r * 0.3} Q ${cx + r * 1.02} ${cy + r * 0.1} ${cx + r * 0.9} ${cy + r * 0.25} L ${cx + r * 0.84} ${cy - r * 0.3} Z`} fill={L.hair} />
				</>
			) : (
				<path d={`M ${cx - r * 0.98} ${cy - r * 0.05} Q ${cx - r * 1.05} ${cy - r * 1.2} ${cx} ${cy - r * 1.18} Q ${cx + r * 1.1} ${cy - r * 1.2} ${cx + r * 0.98} ${cy - r * 0.05} Q ${cx + r * 0.6} ${cy - r * 0.7} ${cx - r * 0.2} ${cy - r * 0.62} Q ${cx - r * 0.7} ${cy - r * 0.55} ${cx - r * 0.98} ${cy - r * 0.05} Z`} fill={L.hair} />
			)}
			{/* глаза */}
			{[-1, 1].map((side) => (
				<g key={side}>
					<ellipse cx={cx + side * eyeDx} cy={eyeY} rx={ew} ry={Math.max(0.6, eh)} fill={night('#f6f1e8', dark * 0.6)} />
					{eh > r * 0.03 ? <circle cx={cx + side * eyeDx + px} cy={eyeY + py} r={Math.min(ew, eh) * 0.62} fill={night('#2a1d14', dark * 0.3)} /> : null}
					<path d={brow(side)} stroke={L.hair === '#bdb7ad' ? night('#9a948b', dark) : night('#2b1f17', dark)} strokeWidth={r * 0.07} strokeLinecap="round" />
				</g>
			))}
			{/* нос, усы, рот */}
			<path d={`M ${cx + r * 0.02} ${cy + r * 0.05} Q ${cx + r * 0.12} ${cy + r * 0.25} ${cx - r * 0.05} ${cy + r * 0.28}`} stroke={night('#b07f5c', dark)} strokeWidth={r * 0.05} fill="none" strokeLinecap="round" />
			{L.moustache ? <path d={`M ${cx - r * 0.32} ${cy + r * 0.42} Q ${cx} ${cy + r * 0.3} ${cx + r * 0.32} ${cy + r * 0.42} Q ${cx} ${cy + r * 0.38} ${cx - r * 0.32} ${cy + r * 0.42} Z`} fill={L.moustache} stroke={L.moustache} strokeWidth={r * 0.07} /> : null}
			<path d={mouth()} stroke={night('#6e3b2e', dark)} strokeWidth={r * 0.055} fill={expr === 'scared' ? night('#3a1a14', dark) : 'none'} strokeLinecap="round" />
		</g>
	);
};

// ---------- Оно ----------

export const Thing: React.FC<{x: number; y: number; h: number; eyes?: number; sway?: number; opacity?: number}> = ({x, y, h, eyes = 0.8, sway = 0, opacity = 1}) => {
	const u = h / 100;
	const c = '#04060d';
	const headY = y - 92 * u;
	return (
		<g opacity={opacity} transform={`rotate(${sway} ${x} ${y})`}>
			<path d={`M ${x - 2 * u} ${y} L ${x - 1.5 * u} ${y - 46 * u} M ${x + 2 * u} ${y} L ${x + 1.5 * u} ${y - 46 * u}`} stroke={c} strokeWidth={1.8 * u} strokeLinecap="round" />
			<path d={`M ${x - 4 * u} ${y - 46 * u} Q ${x - 5 * u} ${y - 70 * u} ${x - 3.5 * u} ${y - 84 * u} L ${x + 3.5 * u} ${y - 84 * u} Q ${x + 5 * u} ${y - 70 * u} ${x + 4 * u} ${y - 46 * u} Z`} fill={c} />
			<path d={`M ${x - 3.5 * u} ${y - 82 * u} Q ${x - 10 * u} ${y - 60 * u} ${x - 8 * u} ${y - 30 * u} L ${x - 9 * u} ${y - 24 * u}`} stroke={c} strokeWidth={1.4 * u} fill="none" strokeLinecap="round" />
			<path d={`M ${x + 3.5 * u} ${y - 82 * u} Q ${x + 10 * u} ${y - 60 * u} ${x + 8 * u} ${y - 30 * u} L ${x + 9.5 * u} ${y - 24 * u}`} stroke={c} strokeWidth={1.4 * u} fill="none" strokeLinecap="round" />
			<ellipse cx={x} cy={headY} rx={4.2 * u} ry={5.4 * u} fill={c} />
			<circle cx={x - 1.6 * u} cy={headY - 0.4 * u} r={0.75 * u} fill="#dfe6ff" opacity={eyes} />
			<circle cx={x + 1.6 * u} cy={headY - 0.4 * u} r={0.75 * u} fill="#dfe6ff" opacity={eyes} />
		</g>
	);
};

// ---------- Предметы ----------

export const Thermos: React.FC<{x: number; y: number; h: number; dark?: number}> = ({x, y, h, dark = 0}) => (
	<g>
		<rect x={x - h * 0.2} y={y - h * 0.5} width={h * 0.4} height={h} rx={h * 0.08} fill={night('#3e7d78', dark)} />
		<rect x={x - h * 0.2} y={y - h * 0.5} width={h * 0.4} height={h * 0.2} rx={h * 0.06} fill={night('#2b5b57', dark)} />
		<rect x={x - h * 0.12} y={y - h * 0.18} width={h * 0.08} height={h * 0.55} rx={h * 0.03} fill={night('#9cd3cc', dark)} opacity={0.6} />
	</g>
);

export const Flashlight: React.FC<{x: number; y: number; s: number; on?: number; angle?: number}> = ({x, y, s, on = 0, angle = 0}) => (
	<g transform={`rotate(${angle} ${x} ${y})`}>
		{on > 0 ? <path d={`M ${x + s * 1.1} ${y - s * 0.22} L ${x + s * 6} ${y - s * 1.6} L ${x + s * 6} ${y + s * 1.6} L ${x + s * 1.1} ${y + s * 0.22} Z`} fill="#fff3c4" opacity={0.35 * on} /> : null}
		<rect x={x - s} y={y - s * 0.18} width={s * 1.5} height={s * 0.36} rx={s * 0.08} fill="#2d2f36" />
		<path d={`M ${x + s * 0.5} ${y - s * 0.18} L ${x + s * 1.1} ${y - s * 0.3} L ${x + s * 1.1} ${y + s * 0.3} L ${x + s * 0.5} ${y + s * 0.18} Z`} fill="#3c3f48" />
		<rect x={x + s * 1.05} y={y - s * 0.3} width={s * 0.08} height={s * 0.6} fill={on > 0 ? '#fff6d0' : '#8d93a3'} />
		<rect x={x - s * 0.3} y={y - s * 0.26} width={s * 0.22} height={s * 0.1} rx={s * 0.03} fill="#c83d3d" />
	</g>
);

export const Radio: React.FC<{x: number; y: number; s: number}> = ({x, y, s}) => (
	<g>
		<rect x={x + s * 0.18} y={y - s * 1.05} width={s * 0.09} height={s * 0.6} rx={s * 0.04} fill="#222" />
		<rect x={x - s * 0.32} y={y - s * 0.5} width={s * 0.64} height={s * 1.1} rx={s * 0.1} fill="#2e3a2c" />
		<rect x={x - s * 0.22} y={y - s * 0.38} width={s * 0.44} height={s * 0.26} rx={s * 0.04} fill="#9fbf6a" />
		{[0, 1, 2].map((i) => (
			<rect key={i} x={x - s * 0.2} y={y + s * (0.0 + i * 0.13)} width={s * 0.4} height={s * 0.05} rx={s * 0.02} fill="#1b231a" />
		))}
	</g>
);
