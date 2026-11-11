import React from 'react';
import {clamp01, easeOutBack, easeOutCubic, smooth} from '../lib/anim';
import {hash3} from '../lib/rng';
import {
	FARMER,
	Face,
	Field,
	FieldRow,
	Flashlight,
	Forest,
	Ground,
	HERO,
	Moon,
	Person,
	Radio,
	SERYOGA,
	Sky,
	Stars,
	Sun,
	Sunflower,
	Thermos,
	Thing,
	Tower,
	TOWER_TOP,
	TreeLine,
	night,
} from './art';
import {SceneId, SceneSpan} from './story';

export type SceneCtx = {t: number; lt: number; dur: number; span: SceneSpan};
export type SceneOut = {svg: React.ReactNode; hud?: React.ReactNode; zoom?: [number, number, number, number]; shake?: number; tint?: string};

export const H = 1000; // горизонт для общих планов

// Номер текущей фразы внутри сцены и время от её начала
export const beatAt = (c: SceneCtx) => {
	let i = 0;
	c.span.beats.forEach((b, k) => {
		if (b.at <= c.t) i = k;
	});
	return {i, lt: c.t - c.span.beats[i].at};
};

export const wideRows = (h: number): FieldRow[] => [
	{y: h + 22, s: 9, count: 46},
	{y: h + 52, s: 12, count: 36, offset: 12},
	{y: h + 98, s: 17, count: 26},
	{y: h + 170, s: 25, count: 18, offset: 20},
	{y: h + 280, s: 36, count: 13},
	{y: h + 450, s: 54, count: 9, offset: 30},
	{y: h + 720, s: 82, count: 6},
];

// Ночной фон: небо, звёзды, луна, деревья, земля
export const NightBg: React.FC<{t: number; id: string; h?: number; moonX?: number; moonY?: number; dim?: number}> = ({t, id, h = H, moonX = 790, moonY = 300, dim = 0}) => (
	<>
		<Sky from="night" horizon={h} id={id} />
		<Stars t={t} k={1 - dim * 0.5} maxY={h - 60} />
		<Moon x={moonX} y={moonY} />
		<TreeLine y={h + 6} color="#060a1c" seed={3} />
		<Ground y={h} top="#0c1430" bottom="#05070f" id={id} />
	</>
);

export const DuskBg: React.FC<{id: string; h?: number; sunX?: number}> = ({id, h = H, sunX = 720}) => (
	<>
		<Sky from="dusk" horizon={h} id={id} />
		<Sun x={sunX} y={h - 30} r={80} color="#fff1d8" />
		<TreeLine y={h + 6} color="#2a2340" seed={3} />
		<Ground y={h} top="#5d5a3a" bottom="#1f2414" id={id} />
	</>
);

export const DawnBg: React.FC<{id: string; h?: number; k?: number}> = ({id, h = H, k = 1}) => (
	<>
		<Sky from="night" to="dawn" k={k} horizon={h} id={id} />
		<Sun x={300} y={h - 10} r={85} color="#fff0d2" k={k} />
		<TreeLine y={h + 6} color="#3a3150" seed={3} />
		<Ground y={h} top="#4c5235" bottom="#191d12" id={id} />
	</>
);

// Первый ряд: 40 подсолнухов по диагонали от зрителя вглубь поля
export const ROW_N = 40;
export const firstRowPos = (i: number) => {
	const k = i / (ROW_N - 1);
	const p = Math.pow(k, 0.55);
	return {x: -10 + p * 1010, y: 1680 - p * 650, s: 68 * Math.pow(1 - p, 1.5) + 7};
};
export const FirstRow: React.FC<{dark: number; droop: number; gapIndex?: number; counted?: number; lastUp?: number; eyes?: number; lastWear?: 'knit' | 'hood'}> = ({dark, droop, gapIndex = -1, counted = -1, lastUp = 0, eyes = 0, lastWear}) => {
	const out: React.ReactNode[] = [];
	for (let i = ROW_N - 1; i >= 0; i--) {
		const {x, y, s} = firstRowPos(i);
		const isLast = i === ROW_N - 1;
		out.push(
			<g key={i}>
				{i < counted ? <circle cx={x} cy={y - s * 4.3} r={s * 1.25} fill="#ffe08a" opacity={0.16} /> : null}
				<Sunflower x={x} y={y} h={s * 4.2} s={s} dark={dark} droop={isLast ? droop * (1 - lastUp) : droop} lean={(hash3(i, 1, 41) - 0.5) * 6} gap={i === gapIndex} eyes={eyes} wear={isLast ? lastWear : undefined} />
			</g>,
		);
	}
	return <>{out}</>;
};

export const Counter: React.FC<{n: number; color?: string; pulse?: number; caption?: string}> = ({n, color = '#fff', pulse = 0, caption = 'ПЕРВЫЙ РЯД'}) => (
	<div style={{position: 'absolute', left: 0, right: 0, top: 240, textAlign: 'center'}}>
		<div style={{fontSize: 46, letterSpacing: 6, color: 'rgba(255,255,255,0.55)', fontWeight: 800}}>{caption}</div>
		<div style={{fontSize: 230, fontWeight: 900, lineHeight: 1, color, transform: `scale(${1 + 0.2 * pulse})`, textShadow: '0 8px 30px rgba(0,0,0,0.6)'}}>{n}</div>
	</div>
);

// =================== Сцены ===================

const hook = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const eyes = b.i === 1 ? smooth((b.lt - 0.3) / 0.8) : 0;
	const rows: FieldRow[] = [
		{y: 1180, s: 40, count: 12, offset: 10},
		{y: 1420, s: 72, count: 7},
		{y: 1820, s: 120, count: 5, offset: 60},
	];
	return {
		svg: (
			<>
				<NightBg t={c.t} id="hook" h={900} moonY={250} />
				<Field rows={rows} dark={0.9} flower={(ri, i) => (ri === 1 && i === 3 ? {droop: 0, eyes, dark: 0.75} : {droop: 1})} />
			</>
		),
		zoom: [1, 1.4, 540, 1110],
	};
};

const offer = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<DuskBg id="offer" />
			<Field rows={wideRows(H)} dark={0.25} />
		</>
	),
	zoom: [1.05, 1, 540, 1000],
});

const field = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<DuskBg id="field" sunX={300} />
			<Field rows={wideRows(H).slice(0, 4)} dark={0.25} />
			<Tower x={800} y={H + 150} k={0.9} dark={0.25} />
			<Field rows={wideRows(H).slice(4)} dark={0.3} />
		</>
	),
	zoom: [1, 1.08, 800, 1000],
});

const farmer = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	return {
		svg: (
			<>
				<DuskBg id="farmer" sunX={560} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.25} />
				<Tower x={860} y={H + 140} k={0.8} dark={0.25} />
				<rect x={0} y={1180} width={1080} height={740} fill="#3a3a26" />
				<rect x={0} y={1180} width={1080} height={30} fill="#4d4b31" />
				<Person x={330} y={1560} h={640} look={FARMER} face={1} arm={b.i === 0 ? 'down' : 'give'} dark={0.2} />
				<Person x={750} y={1560} h={600} look={HERO} face={-1} dark={0.2} />
			</>
		),
		zoom: [1, 1.05, 540, 1100],
	};
};

const items = (c: SceneCtx): SceneOut => {
	const pop = (at: number) => easeOutBack((c.lt - at) / 0.3);
	const k1 = pop(0.3);
	const k2 = pop(0.9);
	const k3 = pop(1.4);
	return {
		svg: (
			<>
				<DuskBg id="items" sunX={540} />
				<rect x={0} y={0} width={1080} height={1920} fill="#0d0b16" opacity={0.6} />
				{[
					[260, k1],
					[560, k2],
					[840, k3],
				].map(([x, k]) => (
					<circle key={x} cx={x} cy={900} r={150 * Math.max(0, k)} fill="#f3dcae" opacity={0.18} />
				))}
				<g transform={`translate(260 900) scale(${k1}) translate(-260 -900)`}>
					<Flashlight x={250} y={900} s={120} on={0} />
				</g>
				<g transform={`translate(560 900) scale(${k2}) translate(-560 -900)`}>
					<Thermos x={560} y={900} h={300} />
				</g>
				<g transform={`translate(840 900) scale(${k3}) translate(-840 -900)`}>
					<Radio x={840} y={930} s={260} />
				</g>
			</>
		),
	};
};

const rule1 = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const down = b.i === 1 ? smooth(b.lt / 0.5) : 0;
	const cross = b.i === 0 ? clamp01((b.lt - 0.9) / 0.3) : 0;
	return {
		svg: (
			<>
				<NightBg t={c.t} id="r1" dim={0.5} />
				<Field rows={wideRows(H).slice(0, 5)} dark={0.85} flower={() => ({droop: 1})} />
				<Flashlight x={330} y={820} s={130} on={1} angle={10 + down * 62} />
				{cross > 0 ? (
					<g opacity={cross} stroke="#ff4747" strokeWidth={26} strokeLinecap="round">
						<path d="M 560 760 L 860 1060" />
						<path d="M 860 760 L 560 1060" />
					</g>
				) : null}
			</>
		),
	};
};

const rule2 = (c: SceneCtx): SceneOut => {
	const n = Math.min(40, Math.floor(clamp01((c.lt - 0.3) / 2.2) * 40));
	return {
		svg: (
			<>
				<DuskBg id="r2" sunX={880} />
				<FirstRow dark={0.3} droop={0} counted={n} />
			</>
		),
		hud: <Counter n={n} />,
	};
};

const rule3 = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const waves: React.ReactNode[] = [];
	for (let i = 0; i < 4; i++) {
		const p = ((c.lt * 0.6 + i / 4) % 1);
		waves.push(<circle key={i} cx={540} cy={1060} r={60 + p * 520} fill="none" stroke="#c9d3ff" strokeWidth={6} opacity={(1 - p) * 0.5} />);
	}
	const red = b.i === 1 ? clamp01(b.lt / 0.15) : 0;
	return {
		svg: (
			<>
				<NightBg t={c.t} id="r3" />
				{waves}
				<Field rows={wideRows(H)} dark={0.9} flower={() => ({droop: 1})} />
				{red > 0 ? (
					<g opacity={red}>
						<circle cx={540} cy={700} r={170} fill="none" stroke="#ff4747" strokeWidth={26} />
						<path d="M 420 820 L 660 580" stroke="#ff4747" strokeWidth={26} strokeLinecap="round" />
						<path d="M 470 700 Q 540 650 610 700" stroke="#fff" strokeWidth={14} fill="none" strokeLinecap="round" />
					</g>
				) : null}
			</>
		),
	};
};

const farmerFace = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	return {
		svg: (
			<>
				<DuskBg id="ff" sunX={850} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.25} />
				<rect x={0} y={0} width={1080} height={1920} fill="#100c18" opacity={0.25} />
				<Face cx={540} cy={820} r={260} look={FARMER} expr={b.i === 0 ? 'neutral' : 'stern'} dark={0.15} blink={Math.abs(c.lt - 1.6) < 0.06 ? 1 : 0} />
			</>
		),
		zoom: [1, 1.08, 540, 820],
	};
};

const towerDusk = (c: SceneCtx): SceneOut => {
	const k = smooth(c.lt / c.dur);
	const b = beatAt(c);
	const droopWave = (x: number) => (b.i === 1 ? smooth((b.lt * 1.2 - x / 1080) / 0.6) : 0);
	const top = TOWER_TOP(H + 300, 1);
	return {
		svg: (
			<>
				<Sky from="dusk" to="night" k={k} horizon={H} id="td" />
				<Stars t={c.t} k={k} maxY={H - 60} />
				<Sun x={300} y={H - 30 + k * 160} r={80} k={1 - k} />
				<Moon x={820} y={420 - k * 140} k={k} />
				<TreeLine y={H + 6} color={night('#2a2340', k)} seed={3} />
				<Ground y={H} top={night('#5d5a3a', k)} bottom="#06080f" id="td" />
				<Field rows={wideRows(H).slice(0, 5)} dark={k} flower={(ri, i, x) => ({droop: droopWave(x)})} />
				<Tower x={760} y={H + 300} k={1} dark={k} lamp={k} />
				<Person x={760} y={top - 4} h={150} look={HERO} sit face={-1} dark={k} />
				<Field rows={wideRows(H).slice(5)} dark={k} flower={(ri, i, x) => ({droop: droopWave(x)})} />
			</>
		),
		zoom: [1.06, 1, 700, 900],
	};
};

const countScene = (c: SceneCtx, target: number, gap: number, finalDay = false): SceneOut => {
	const b = beatAt(c);
	const n = b.i === 0 ? Math.min(target, Math.floor(clamp01((b.lt - 0.2) / Math.max(0.5, c.span.beats[0].end - c.span.beats[0].at - 0.4)) * target)) : target;
	const hit = b.i === 1 ? Math.max(0, 1 - b.lt / 0.3) : 0;
	const red = target !== 40;
	return {
		svg: (
			<>
				{finalDay ? <DawnBg id="cnt" /> : <NightBg t={c.t} id="cnt" />}
				<FirstRow dark={finalDay ? 0.2 : 0.85} droop={1} counted={n} gapIndex={gap} />
				{gap >= 0 && b.i >= 1 ? (() => {
					const p = firstRowPos(gap);
					return <circle cx={p.x} cy={p.y - p.s * 2.5} r={p.s * 2.4} fill="none" stroke="#ff4747" strokeWidth={6} opacity={0.5 + 0.5 * Math.sin(c.t * 8)} />;
				})() : null}
			</>
		),
		hud: <Counter n={n} color={red && b.i >= 1 ? '#ff4d4d' : '#fff'} pulse={hit} />,
		shake: red ? hit * 14 : 0,
	};
};

const seryoga = (c: SceneCtx): SceneOut => {
	const walkK = clamp01(c.lt / 2.6);
	const sx = 60 + easeOutCubic(walkK) * 520;
	const walking = walkK < 1;
	const top = TOWER_TOP(H + 330, 0.95);
	return {
		svg: (
			<>
				<NightBg t={c.t} id="sg" moonX={300} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.85} flower={() => ({droop: 1})} />
				<Tower x={800} y={H + 330} k={0.95} dark={0.8} lamp={1} />
				<Person x={800} y={top - 4} h={140} look={HERO} sit face={-1} dark={0.75} />
				<rect x={0} y={H + 330} width={1080} height={600} fill="#070a14" />
				<Person x={sx} y={H + 380} h={360} look={SERYOGA} face={1} walk={walking ? c.lt * 7 : 0} item="thermos" arm="hold" dark={0.6} />
			</>
		),
		zoom: [1, 1.06, 600, 1200],
	};
};

export const Steam: React.FC<{x: number; y: number; t: number}> = ({x, y, t}) => (
	<>
		{[0, 1, 2].map((i) => {
			const p = (t * 0.5 + i / 3) % 1;
			return (
				<path
					key={i}
					d={`M ${x} ${y - p * 160} q 18 -25 0 -50 q -18 -25 0 -50`}
					stroke="#e9eefc"
					strokeWidth={8}
					fill="none"
					strokeLinecap="round"
					opacity={(1 - p) * 0.35}
				/>
			);
		})}
	</>
);

export const Railing: React.FC<{dark: number}> = ({dark}) => (
	<>
		<rect x={0} y={1290} width={1080} height={36} fill={night('#6b4a2d', dark)} />
		<rect x={0} y={1460} width={1080} height={460} fill={night('#5a3d24', dark)} />
		{[80, 300, 520, 740, 960].map((x) => (
			<rect key={x} x={x} y={1290} width={34} height={200} fill={night('#5a3d24', dark)} />
		))}
	</>
);

export const Cup: React.FC<{x: number; y: number}> = ({x, y}) => (
	<g>
		<rect x={x - 34} y={y - 60} width={68} height={70} rx={10} fill="#2f6b67" />
		<rect x={x - 34} y={y - 60} width={68} height={14} rx={6} fill="#24524f" />
	</g>
);

const tea = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<NightBg t={c.t} id="tea" h={1100} moonX={540} moonY={330} />
			<Face cx={300} cy={980} r={150} look={HERO} expr="neutral" lookX={0.6} dark={0.55} blink={Math.abs((c.lt % 2.8) - 2.0) < 0.06 ? 1 : 0} />
			<Face cx={790} cy={990} r={150} look={SERYOGA} expr="neutral" lookX={-0.3} lookY={0.4} dark={0.55} />
			<Railing dark={0.7} />
			<Cup x={370} y={1290} />
			<Cup x={710} y={1290} />
			<Steam x={370} y={1220} t={c.t} />
			<Steam x={710} y={1220} t={c.t + 0.7} />
		</>
	),
	zoom: [1, 1.05, 540, 1100],
});

const seryogaFace = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<NightBg t={c.t} id="sf" moonX={850} moonY={260} />
			<Field rows={wideRows(H).slice(0, 4)} dark={0.9} flower={() => ({droop: 1})} />
			<rect x={0} y={0} width={1080} height={1920} fill="#04060d" opacity={0.35} />
			<Face cx={540} cy={820} r={270} look={SERYOGA} expr="serious" dark={0.45} blink={Math.abs(c.lt - 2.2) < 0.06 ? 1 : 0} />
		</>
	),
	zoom: [1, 1.12, 540, 800],
});

const call = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	if (b.i === 2) {
		return {
			svg: (
				<>
					<NightBg t={c.t} id="call2" />
					<rect x={0} y={0} width={1080} height={1920} fill="#02030a" opacity={0.5} />
					<Face cx={540} cy={820} r={280} look={HERO} expr="scared" lookX={-0.8} dark={0.5} />
				</>
			),
			zoom: [1.02, 1.1, 540, 820],
		};
	}
	const waves: React.ReactNode[] = [];
	for (let i = 0; i < 3; i++) {
		const p = (c.lt * 0.45 + i / 3) % 1;
		waves.push(<ellipse key={i} cx={320} cy={1080} rx={40 + p * 600} ry={14 + p * 200} fill="none" stroke="#b9c4ff" strokeWidth={4} opacity={(1 - p) * 0.45} />);
	}
	return {
		svg: (
			<>
				<NightBg t={c.t} id="call" dim={0.4} />
				{waves}
				<Field rows={wideRows(H)} dark={0.95} flower={() => ({droop: 1})} />
				<rect x={0} y={0} width={1080} height={1920} fill="#02030a" opacity={0.35} />
			</>
		),
		zoom: [1, 1.15, 320, 1080],
	};
};

const shoulder = (c: SceneCtx): SceneOut => {
	const grip = easeOutBack((c.lt - 0.2) / 0.3);
	const sleeve = night(SERYOGA.top, 0.5);
	const skin = night(SERYOGA.skin, 0.45);
	return {
		svg: (
			<>
				<NightBg t={c.t} id="sh" />
				<rect x={0} y={0} width={1080} height={1920} fill="#02030a" opacity={0.4} />
				<Face cx={460} cy={840} r={270} look={HERO} expr="scared" lookX={1} dark={0.5} />
				<g transform={`translate(${(1 - grip) * 300} 0)`}>
					<path d="M 1100 1050 Q 960 1080 860 1150 L 900 1230 Q 1000 1180 1100 1170 Z" fill={sleeve} />
					<ellipse cx={850} cy={1190} rx={70} ry={58} fill={skin} />
					{[0, 1, 2, 3].map((i) => (
						<rect key={i} x={760 - i * 6} y={1150 + i * 26} width={95} height={24} rx={12} fill={skin} transform={`rotate(-12 ${800} ${1160 + i * 26})`} />
					))}
				</g>
			</>
		),
		shake: grip > 0.9 ? 4 : 0,
	};
};

const bend = (c: SceneCtx): SceneOut => {
	const wave = (x: number, ri: number) => {
		const front = c.lt * 260 - 200 + ri * 30;
		return smooth((front - x) / 260);
	};
	return {
		svg: (
			<>
				<NightBg t={c.t} id="bend" moonX={250} />
				<Field rows={wideRows(H)} dark={0.9} flower={(ri, i, x) => ({droop: 1, lean: 22 * wave(x, ri) + Math.sin(c.t * 3 + i) * 1.5})} />
				<rect x={0} y={0} width={1080} height={1920} fill="#02030a" opacity={0.2} />
			</>
		),
		zoom: [1, 1.08, 540, 1100],
	};
};

const thing = (c: SceneCtx): SceneOut => {
	const x = 260 + c.lt * 40;
	const rows = wideRows(H);
	return {
		svg: (
			<>
				<NightBg t={c.t} id="th" moonX={800} />
				<Field rows={rows.slice(0, 3)} dark={0.92} flower={() => ({droop: 1})} />
				<Thing x={x} y={H + 120} h={560} eyes={0.4 + 0.3 * Math.sin(c.t * 2)} sway={Math.sin(c.t * 1.3) * 2} />
				<Field rows={rows.slice(3)} dark={0.92} flower={(ri, i, fx) => ({droop: 1, lean: Math.abs(fx - x) < 120 ? 12 * Math.sign(fx - x) : 0})} />
				<rect x={0} y={0} width={1080} height={1920} fill="#02030a" opacity={0.25} />
			</>
		),
		zoom: [1, 1.12, 360, 800],
	};
};

const thingSpeaks = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const quote = b.i === 2;
	const rows: FieldRow[] = [
		{y: 1250, s: 40, count: 12},
		{y: 1650, s: 85, count: 6, offset: 40},
	];
	return {
		svg: (
			<>
				<NightBg t={c.t} id="ts" h={1000} moonX={860} moonY={240} />
				<Field rows={rows.slice(0, 1)} dark={0.92} flower={() => ({droop: 1})} />
				<Thing x={540} y={1300} h={1150} eyes={quote ? 1 : 0.6} sway={Math.sin(c.t * 1.1) * 1.5} />
				<Field rows={rows.slice(1)} dark={0.95} flower={() => ({droop: 1})} />
				<rect x={0} y={0} width={1080} height={1920} fill="#02030a" opacity={0.2} />
			</>
		),
		zoom: [1, 1.1, 540, 500],
		shake: quote ? 3 : 0,
		tint: quote ? 'rgba(120,0,0,0.18)' : undefined,
	};
};

const lookRight = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const shakeHead = b.i === 2 ? Math.sin(b.lt * 9) * 14 : 0;
	return {
		svg: (
			<>
				<NightBg t={c.t} id="lr" h={1100} moonX={540} moonY={330} />
				<Face cx={300} cy={980} r={160} look={HERO} expr="scared" lookX={b.i >= 0 ? 1 : 0} dark={0.55} />
				<Face cx={790} cy={990} r={160} look={SERYOGA} expr="serious" lookX={-0.7} dark={0.55} turn={shakeHead} />
				<Railing dark={0.75} />
			</>
		),
		zoom: [1, 1.06, 540, 1000],
	};
};

const wait = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const light = b.i === 2 ? smooth(b.lt / 1.5) : 0;
	const shadowX = ((c.lt * 260) % 1600) - 260;
	return {
		svg: (
			<>
				<Sky from="night" to="dawn" k={light * 0.35} horizon={1000} id="wt" />
				<Stars t={c.t} k={1 - light * 0.5} maxY={900} />
				<TreeLine y={1006} color="#060a1c" seed={3} />
				<Ground y={1000} top="#0c1430" bottom="#05070f" id="wt" />
				<Field rows={wideRows(1000).slice(0, 4)} dark={0.92} flower={() => ({droop: 1})} />
				{b.i === 1 ? <Thing x={shadowX} y={1200} h={420} eyes={0.25} opacity={0.85} sway={Math.sin(c.t * 2) * 2} /> : null}
				<Railing dark={0.85} />
				<g transform="translate(0 -330)">
					<path d="M 300 1660 Q 420 1560 520 1580 L 560 1660 Q 450 1690 340 1780 Z" fill={night(HERO.skin, 0.5)} />
					<rect x={240} y={1640} width={140} height={160} rx={30} fill={night(HERO.top, 0.6)} transform="rotate(-35 300 1700)" />
					<Flashlight x={600} y={1560} s={150} on={0} angle={-8} />
				</g>
			</>
		),
		zoom: [1, 1.04, 540, 1500],
	};
};

export const Truck: React.FC<{x: number; y: number; k: number}> = ({x, y, k}) => (
	<g>
		<rect x={x} y={y - 120 * k} width={260 * k} height={80 * k} rx={10 * k} fill="#6d7f8f" />
		<path d={`M ${x + 160 * k} ${y - 120 * k} L ${x + 190 * k} ${y - 185 * k} L ${x + 260 * k} ${y - 185 * k} L ${x + 260 * k} ${y - 120 * k} Z`} fill="#5d6f7f" />
		<rect x={x + 200 * k} y={y - 175 * k} width={50 * k} height={45 * k} fill="#b9d3e8" opacity={0.7} />
		<circle cx={x + 60 * k} cy={y - 40 * k} r={30 * k} fill="#1e1e22" />
		<circle cx={x + 210 * k} cy={y - 40 * k} r={30 * k} fill="#1e1e22" />
	</g>
);

const dawn = (c: SceneCtx): SceneOut => {
	return {
		svg: (
			<>
				<DawnBg id="dw" k={Math.min(1, 0.6 + c.lt / 6)} />
				<Field rows={wideRows(H).slice(0, 4)} dark={0.25} flower={() => ({droop: 0.5})} />
				<Tower x={820} y={H + 300} k={0.9} dark={0.2} />
				<rect x={0} y={1300} width={1080} height={620} fill="#353822" />
				<Truck x={20} y={1420} k={1.1} />
				<Person x={430} y={1520} h={420} look={FARMER} face={1} arm="give" dark={0.1} />
				<Person x={650} y={1520} h={400} look={HERO} face={-1} dark={0.1} />
			</>
		),
		zoom: [1, 1.05, 540, 1300],
	};
};

const farmerDawnFace = (expr: (c: SceneCtx) => 'smile' | 'stern' | 'serious') => (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<DawnBg id="fd" />
			<Field rows={wideRows(H).slice(0, 4)} dark={0.2} flower={() => ({droop: 0.5})} />
			<rect x={0} y={0} width={1080} height={1920} fill="#1a1222" opacity={0.2} />
			<Face cx={540} cy={820} r={270} look={FARMER} expr={expr(c)} dark={0.05} />
		</>
	),
	zoom: [1, 1.1, 540, 820],
});

const forest = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<Sky from="night" to="dawn" k={0.9} horizon={H} id="fo" />
			<Forest y={H + 10} color="#16241a" />
			<Ground y={H} top="#3d4a2c" bottom="#151a10" id="fo" />
			<Field rows={wideRows(H).slice(2)} dark={0.25} flower={() => ({droop: 0.5})} />
		</>
	),
	zoom: [1.12, 1, 540, 1000],
});

const thermos = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const pour = b.i === 1 ? b.lt : 0;
	const seeds: React.ReactNode[] = [];
	if (pour > 0) {
		for (let i = 0; i < 60; i++) {
			const st = hash3(i, 1, 90) * 1.2;
			const p = pour - st;
			if (p <= 0) continue;
			const fall = Math.min(1, p / 0.6);
			const x = 640 + 40 + hash3(i, 2, 90) * 30 + fall * (60 + hash3(i, 3, 90) * 220);
			const y = 1090 + fall * fall * (380 - hash3(i, 4, 90) * 60);
			seeds.push(<ellipse key={i} cx={x} cy={y} rx={9} ry={15} fill={i % 3 ? '#2b2420' : '#e9e2d0'} transform={`rotate(${hash3(i, 5, 90) * 180} ${x} ${y})`} />);
		}
	}
	const tilt = pour > 0 ? Math.min(1, pour / 0.3) * 70 : 0;
	return {
		svg: (
			<>
				<DawnBg id="tm" />
				<rect x={0} y={0} width={1080} height={1920} fill="#1a1222" opacity={0.25} />
				{/* ступени лестницы крупно */}
				<rect x={120} y={600} width={46} height={1320} fill="#5a3d24" />
				<rect x={914} y={600} width={46} height={1320} fill="#5a3d24" />
				{[760, 1100, 1440, 1780].map((y) => (
					<rect key={y} x={120} y={y} width={840} height={48} fill="#7b5534" />
				))}
				<g transform={`rotate(${tilt} 640 1100)`}>
					<Thermos x={640} y={980} h={240} />
				</g>
				{seeds}
			</>
		),
		zoom: [1, 1.08, 640, 1000],
	};
};

const finalFace = (c: SceneCtx): SceneOut => {
	const b = beatAt(c);
	const up = b.i === 0 ? smooth(b.lt / 1.0) : 1;
	const eyes = b.i >= 1 ? smooth(b.lt / 1.2) : 0;
	return {
		svg: (
			<>
				<DawnBg id="fin" h={1150} />
				<rect x={0} y={0} width={1080} height={1920} fill="#1a1222" opacity={0.25} />
				<Sunflower x={540} y={1950} h={900} s={300} droop={1 - up} eyes={b.i >= 1 ? eyes : 0} dark={0.2} />
			</>
		),
		zoom: [1, 1.25, 540, 1000],
	};
};

const end = (c: SceneCtx): SceneOut => ({
	svg: (
		<>
			<rect x={0} y={0} width={1080} height={1920} fill="#000" />
			<g opacity={Math.max(0, 0.5 - c.lt * 0.15)}>
				<Sunflower x={540} y={1950} h={900} s={300} droop={0} eyes={1} dark={0.95} />
			</g>
		</>
	),
});

export type SceneFn = (c: SceneCtx) => SceneOut;
export const SCENES: Record<SceneId, SceneFn> = {
	hook,
	offer,
	field,
	farmer,
	items,
	rule1,
	rule2,
	rule3,
	farmerFace,
	towerDusk,
	count40: (c) => countScene(c, 40, -1),
	seryoga,
	tea,
	count39: (c) => countScene(c, 39, 17),
	seryogaFace,
	call,
	shoulder,
	bend,
	thing,
	thingSpeaks,
	lookRight,
	wait,
	dawn,
	farmerDawn: farmerDawnFace((c) => (c.lt < c.dur * 0.35 ? 'smile' : 'stern')),
	forest,
	farmerTruth: farmerDawnFace(() => 'serious'),
	thermos,
	finalCount: (c) => countScene(c, 40, -1, true),
	finalFace,
	end,
};
