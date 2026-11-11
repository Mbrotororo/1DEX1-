// Сцены второй части «Обмен». Общие куски (фон, ряд, счётчик) — из scenes.tsx.
import React from 'react';
import {clamp01, smooth} from '../lib/anim';
import {FARMER, Field, FieldRow, HERO, Moon, Person, SERYOGA, Sunflower, Thermos, night} from './art';
import {
	Counter,
	DawnBg,
	DuskBg,
	FirstRow,
	H,
	NightBg,
	SCENES,
	SceneCtx,
	SceneFn,
	SceneOut,
	Truck,
	beatAt,
	firstRowPos,
	wideRows,
} from './scenes';

// Луч фонаря: из точки (x, y) в сторону angle (градусы, 0 — вправо)
const Beam: React.FC<{x: number; y: number; angle: number; len?: number; spread?: number; k?: number; id: string}> = ({x, y, angle, len = 800, spread = 16, k = 1, id}) => {
	if (k <= 0) return null;
	const a1 = ((angle - spread) * Math.PI) / 180;
	const a2 = ((angle + spread) * Math.PI) / 180;
	return (
		<>
			<defs>
				<radialGradient id={`beam-${id}`} cx={x} cy={y} r={len} gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor="#fff4c8" stopOpacity={0.55 * k} />
					<stop offset="1" stopColor="#fff4c8" stopOpacity={0} />
				</radialGradient>
			</defs>
			<path d={`M ${x} ${y} L ${x + Math.cos(a1) * len} ${y + Math.sin(a1) * len} L ${x + Math.cos(a2) * len} ${y + Math.sin(a2) * len} Z`} fill={`url(#beam-${id})`} />
		</>
	);
};

// Точка руки, вытянутой в сторону face (как в Person с arm='give')
const handOf = (x: number, y: number, h: number, face: number) => {
	const u = h / 100;
	const shY = y - 76 * u;
	return {x: x + face * 9 * u + face * 26 * u, y: shY + 12 * u};
};

const ClockHud: React.FC<{text: string; caption: string; color?: string}> = ({text, caption, color = '#fff'}) => (
	<div style={{position: 'absolute', left: 0, right: 0, top: 240, textAlign: 'center'}}>
		<div style={{fontSize: 46, letterSpacing: 6, color: 'rgba(255,255,255,0.55)', fontWeight: 800}}>{caption}</div>
		<div style={{fontSize: 200, fontWeight: 900, lineHeight: 1, color, textShadow: '0 8px 30px rgba(0,0,0,0.6)'}}>{text}</div>
	</div>
);

const CLOSE_ROWS: FieldRow[] = [
	{y: 1180, s: 40, count: 12, offset: 10},
	{y: 1420, s: 72, count: 7},
	{y: 1820, s: 120, count: 5, offset: 60},
];

// ---------- сцены ----------

const hook2 = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const on = b.i === 1 ? clamp01((b.lt - 0.1) / 0.08) : 0;
	const hx = 760;
	const hy = 1420;
	const hh = 520;
	const hand = handOf(hx, hy, hh, -1);
	return {
		svg: (
			<>
				<NightBg t={c.t} id="h2" moonX={250} />
				<Field rows={wideRows(H).slice(0, 5)} dark={0.9} flower={() => ({droop: 1})} />
				<Beam x={hand.x} y={hand.y} angle={190} len={900} spread={14} k={on} id="h2" />
				<Person x={hx} y={hy} h={hh} look={HERO} face={-1} arm="give" dark={0.6} />
			</>
		),
		zoom: [1, 1.12, 620, 1100],
	};
};

const dream = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const facing = b.i >= 1 ? smooth(b.lt / 0.8) : 0;
	const glow = b.i === 2 ? smooth(b.lt / 0.6) : 0;
	const W = {x: 240, y: 300, w: 600, h: 600};
	const sc = W.w / 1080;
	return {
		svg: (
			<>
				<rect x={0} y={0} width={1080} height={1920} fill="#121831" />
				<rect x={0} y={1380} width={1080} height={540} fill="#0c1022" />
				<defs>
					<clipPath id="win">
						<rect x={W.x} y={W.y} width={W.w} height={W.h} />
					</clipPath>
				</defs>
				<g clipPath="url(#win)">
					<g transform={`translate(${W.x} ${W.y - 380 * sc}) scale(${sc})`}>
						<NightBg t={c.t} id="dr" moonX={800} moonY={560} />
						<Field rows={wideRows(H)} dark={0.85} flower={(ri, i) => (ri === 4 && i === 6 ? {droop: 1 - facing, eyes: facing, dark: 0.6} : {droop: 1})} />
					</g>
				</g>
				{/* лунный свет на полу */}
				<path d={`M ${W.x} ${W.y + W.h} L ${W.x + W.w} ${W.y + W.h} L ${W.x + W.w + 160} 1920 L ${W.x - 40} 1920 Z`} fill="#c9d6ff" opacity={0.05} />
				<rect x={W.x - 22} y={W.y - 22} width={W.w + 44} height={W.h + 44} fill="none" stroke="#3a3326" strokeWidth={30} />
				<rect x={W.x + W.w / 2 - 9} y={W.y} width={18} height={W.h} fill="#3a3326" />
				<rect x={W.x} y={W.y + W.h / 2 - 9} width={W.w} height={18} fill="#3a3326" />
				{/* полка с термосом */}
				<rect x={330} y={1180} width={420} height={22} fill="#4a3826" />
				<circle cx={540} cy={1110} r={140} fill="#9cd3cc" opacity={0.05 + 0.12 * glow} />
				<Thermos x={540} y={1105} h={150} dark={0.45 - glow * 0.3} />
				{/* кровать */}
				<rect x={-40} y={1500} width={600} height={120} rx={20} fill="#1d2443" />
				<rect x={-40} y={1460} width={180} height={70} rx={24} fill="#2a3256" />
			</>
		),
		zoom: [1, 1.1, 540, 800],
	};
};

const truth = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const pulse = b.i === 1 ? 0.5 + 0.5 * Math.sin(c.t * 7) : 0;
	const p = firstRowPos(6);
	return {
		svg: (
			<>
				<DuskBg id="tr" sunX={880} />
				<FirstRow dark={0.45} droop={0.3} counted={40} />
				{b.i === 1 ? <circle cx={p.x} cy={p.y - p.s * 4.2} r={p.s * 1.9} fill="none" stroke="#ff4747" strokeWidth={8} opacity={0.4 + 0.6 * pulse} /> : null}
			</>
		),
		hud: <Counter n={40} caption="ПОЛЕ ДЕРЖИТ" pulse={b.i === 1 ? Math.max(0, 1 - b.lt / 0.3) : 0} />,
	};
};

const rule1b = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<NightBg t={c.t} id="r1b" />
			<Field rows={wideRows(H)} dark={0.9} flower={() => ({droop: 1})} />
		</>
	),
	hud: <ClockHud text="02:00" caption="НАЙДИ ДО" color="#ffc94a" />,
	zoom: [1, 1.05, 540, 1000],
});

const rule3b = (c: SceneCtx): SceneOut => {
	const x = 300 + smooth(c.lt / c.dur) * 380;
	const cross = clamp01((c.lt - 1.0) / 0.3);
	const hy = 1300;
	return {
		svg: (
			<>
				<NightBg t={c.t} id="r3b" moonX={820} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.9} flower={() => ({droop: 1})} />
				<Person x={x} y={hy} h={520} look={SERYOGA} face={1} walk={c.lt * 6} dark={0.55} />
				{/* стрелка «обернуться» над головой */}
				<g transform={`translate(${x} ${hy - 600})`}>
					<path d="M -90 30 A 90 90 0 1 1 90 30" fill="none" stroke="#e8ecff" strokeWidth={16} strokeLinecap="round" />
					<path d="M 60 10 L 92 40 L 112 2" fill="none" stroke="#e8ecff" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
					{cross > 0 ? (
						<g opacity={cross} stroke="#ff4747" strokeWidth={20} strokeLinecap="round">
							<path d="M -110 -110 L 110 110" />
							<path d="M 110 -110 L -110 110" />
						</g>
					) : null}
				</g>
			</>
		),
	};
};

const walkIn = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const on = b.i === 0 ? clamp01((b.lt - 0.3) / 0.08) : 1;
	const x = 900 - smooth(c.lt / c.dur) * 330;
	const y = 1310;
	const h = 420;
	const hand = handOf(x, y, h, -1);
	const rows = wideRows(H);
	return {
		svg: (
			<>
				<NightBg t={c.t} id="wi" moonX={230} />
				<Field rows={rows.slice(0, 5)} dark={0.9} flower={() => ({droop: 1})} />
				<Beam x={hand.x} y={hand.y} angle={200} len={800} spread={15} k={on} id="wi" />
				<Person x={x} y={y} h={h} look={HERO} face={-1} arm="give" walk={c.lt * 6} dark={0.6} />
				<Field rows={rows.slice(5)} dark={0.92} flower={(ri, i, fx) => ({droop: 1, lean: Math.abs(fx - x) < 140 ? 10 * Math.sign(fx - x) : 0})} />
			</>
		),
		zoom: [1, 1.08, 600, 1100],
	};
};

const faces = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const idx = Math.min(39, c.lt * 7);
	const tgt = firstRowPos(Math.floor(idx));
	const ang = (Math.atan2(tgt.y - tgt.s * 4.2 - 1900, tgt.x - 1000) * 180) / Math.PI;
	const eyes = b.i === 1 ? 1 : 0.85;
	return {
		svg: (
			<>
				<NightBg t={c.t} id="fc" />
				<FirstRow dark={0.85} droop={0} eyes={eyes} />
				<Beam x={1000} y={1900} angle={ang} len={1300} spread={7} id="fc" />
			</>
		),
		zoom: [1, 1.1, 300, 1300],
		tint: b.i === 1 ? 'rgba(100,0,0,0.12)' : undefined,
	};
};

const found = (c: SceneCtx): SceneOut => (
	{
		svg: (
			<>
				<NightBg t={c.t} id="fd2" h={900} moonY={250} />
				<Field rows={CLOSE_ROWS.slice(0, 2)} dark={0.9} flower={(ri, i) => (ri === 1 && i === 3 ? {droop: 1, wear: 'knit', dark: 0.35} : {droop: 1})} />
				<ellipse cx={540} cy={1150} rx={260} ry={200} fill="#fff4c8" opacity={0.12} />
				<Field rows={CLOSE_ROWS.slice(2)} dark={0.92} flower={() => ({droop: 1})} />
			</>
		),
		hud: <ClockHud text="01:52" caption="ВРЕМЯ" />,
		zoom: [1, 1.25, 540, 1110],
	}
);

const knitFace = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const up = b.i === 0 ? 0 : b.i === 1 ? smooth(b.lt / 1.0) : 1;
	const eyes = b.i === 2 ? smooth(b.lt / 0.8) : 0;
	return {
		svg: (
			<>
				<NightBg t={c.t} id="kf" h={1150} moonX={860} moonY={260} />
				<ellipse cx={540} cy={1150} rx={520} ry={600} fill="#fff4c8" opacity={0.08} />
				<Sunflower x={540} y={1950} h={900} s={280} droop={1 - up} eyes={eyes} wear="knit" dark={0.35} />
			</>
		),
		zoom: [1, 1.15, 540, 1000],
	};
};

const exchange = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const roots = smooth(c.lt / 2.2);
	const petals = b.i >= 1 ? smooth((b.i === 1 ? b.lt : 2) / 2) : 0;
	const hx = 400;
	const hy = 1330;
	const hh = 560;
	const u = hh / 100;
	const headY = hy - 87 * u;
	const sIn = b.i >= 2 ? smooth((b.i === 2 ? b.lt : 2) / 1.2) : 0;
	const walkAway = b.i === 3 ? smooth(b.lt / 2.5) : 0;
	const sx = 780 + walkAway * 260;
	const ring: React.ReactNode[] = [];
	for (let i = 0; i < 14; i++) {
		ring.push(
			<ellipse
				key={i}
				cx={hx}
				cy={headY - 9 * u * 1.9 * petals}
				rx={9 * u * 0.35}
				ry={9 * u * 0.8 * petals}
				fill={night('#f3b51b', 0.55)}
				transform={`rotate(${(i / 14) * 360} ${hx} ${headY})`}
			/>,
		);
	}
	const vines: React.ReactNode[] = [];
	for (const side of [-1, 1]) {
		const top = hy - 44 * u * roots;
		vines.push(
			<path
				key={side}
				d={`M ${hx + side * 4 * u} ${hy} C ${hx + side * 10 * u} ${hy - 15 * u * roots} ${hx - side * 2 * u} ${hy - 30 * u * roots} ${hx + side * 5 * u} ${top}`}
				stroke={night('#4f7a2e', 0.5)}
				strokeWidth={2.2 * u}
				fill="none"
				strokeLinecap="round"
			/>,
		);
		if (roots > 0.5) {
			vines.push(<ellipse key={`l${side}`} cx={hx + side * 9 * u} cy={hy - 26 * u} rx={5 * u * roots} ry={2 * u * roots} fill={night('#5f8f35', 0.5)} transform={`rotate(${side * -25} ${hx + side * 9 * u} ${hy - 26 * u})`} />);
		}
	}
	return {
		svg: (
			<>
				<NightBg t={c.t} id="ex" moonX={820} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.9} flower={() => ({droop: 1})} />
				{ring}
				<Person x={hx} y={hy} h={hh} look={HERO} face={1} dark={0.55} />
				{vines}
				<ellipse cx={hx} cy={hy} rx={18 * u} ry={4 * u} fill="#141a10" />
				{sIn > 0 ? (
					<g opacity={sIn}>
						<Person x={sx} y={hy} h={hh * (0.92 + 0.08 * sIn)} look={SERYOGA} face={b.i === 3 ? 1 : -1} walk={walkAway > 0 ? c.lt * 6 : 0} dark={0.55} />
					</g>
				) : null}
			</>
		),
		zoom: [1, 1.06, 540, 1100],
	};
};

const dawn2 = (c: SceneCtx): SceneOut => {
	const k = smooth(c.lt / c.dur);
	const x = 120 + k * 520;
	const fade = 1 - clamp01((c.lt - (c.dur - 1.2)) / 0.8);
	return {
		svg: (
			<>
				<DawnBg id="d2" k={Math.min(1, 0.6 + c.lt / 6)} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.25} flower={() => ({droop: 0.5})} />
				<rect x={0} y={1300} width={1080} height={620} fill="#353822" />
				<Truck x={700} y={1420} k={1.1} />
				<Person x={880} y={1520} h={420} look={FARMER} face={-1} dark={0.1} />
				<g opacity={fade}>
					<Person x={x} y={1540} h={420} look={SERYOGA} face={1} walk={c.lt * 6} item="thermos" arm="hold" dark={0.1} />
				</g>
			</>
		),
		zoom: [1, 1.05, 540, 1300],
	};
};

const hoodFace = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const up = b.i === 0 ? smooth(b.lt / 1.0) : 1;
	const eyes = b.i === 1 ? smooth(b.lt / 0.6) : 0;
	return {
		svg: (
			<>
				<DawnBg id="hf" h={1150} />
				<rect x={0} y={0} width={1080} height={1920} fill="#1a1222" opacity={0.25} />
				<Sunflower x={540} y={1950} h={900} s={280} droop={1 - up} eyes={eyes} wear="hood" dark={0.2} />
			</>
		),
		zoom: [1, 1.2, 540, 1000],
	};
};

const end2 = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<rect x={0} y={0} width={1080} height={1920} fill="#000" />
			<g opacity={Math.max(0, 0.45 - c.lt * 0.08)}>
				<Moon x={820} y={300} k={0.6} />
				<Sunflower x={540} y={1950} h={900} s={280} droop={0} eyes={1} wear="hood" dark={0.95} />
			</g>
		</>
	),
});

export const SCENES2: Record<string, SceneFn> = {
	hook2,
	dream,
	farmer: SCENES.farmer,
	farmerFace: SCENES.farmerFace,
	truth,
	rule1b,
	rule2b: SCENES.rule3,
	rule3b,
	walkIn,
	faces,
	thing: SCENES.thing,
	found,
	knitFace,
	exchange,
	dawn2,
	finalCount: SCENES.finalCount,
	hoodFace,
	end2,
};
