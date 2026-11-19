import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Glow} from '../core/chars/extras';
import {clamp01} from '../core/anim';
import {flicker} from '../core/props';
import {hash3, mulberry32} from '../core/rng';
import {Bx, boxGeometry, cachedGeo, cachedTex, canvasTexture, drawPixelText, P16, pixelTextWidth, vcMat} from './kit';

// Реквизит на стенах: электронные часы, пробковая доска с запиской, вешалка, обувница, постер, картина, свеча.
// У настенных вещей начало координат — центр задней стороны (на плоскости стены), лицом в локальный +z.

// ---------- электронные часы ----------

const LED_ON = '#ff3a22';
const LED_GHOST = '#3a0c0a';

// Табло: пиксельные цифры шрифта ядра, каждый пиксель — «светодиод» с зазором; под цифрами — тусклые «88:88»
const clockTexture = (text: string, colon: boolean) =>
	cachedTex(`clock-${text}-${colon ? 1 : 0}`, () => {
		const W = 1024;
		const H = 432;
		return canvasTexture(W, H, (ctx) => {
			const g = ctx.createLinearGradient(0, 0, 0, H);
			g.addColorStop(0, '#120706');
			g.addColorStop(1, '#070303');
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, W, H);
			const s = 32;
			const ghost = text.replace(/[0-9]/g, '8');
			const width = pixelTextWidth(ghost);
			const x0 = (W / s - width) / 2;
			const base = (H / s + 7) / 2;
			drawPixelText(ctx, {text: ghost, x: x0, y: base, color: LED_GHOST, gap: 5}, s);
			const lit = colon ? text : text.replace(':', ' ');
			ctx.save();
			ctx.shadowColor = '#ff2010';
			ctx.shadowBlur = 28;
			drawPixelText(ctx, {text: lit, x: x0, y: base, color: LED_ON, gap: 5}, s);
			ctx.restore();
			drawPixelText(ctx, {text: lit, x: x0, y: base, color: '#ff6a48', gap: 12}, s);
			// блик на стекле
			const gl = ctx.createLinearGradient(0, 0, W, H);
			gl.addColorStop(0, 'rgba(255,255,255,0.07)');
			gl.addColorStop(0.35, 'rgba(255,255,255,0.0)');
			ctx.fillStyle = gl;
			ctx.fillRect(0, 0, W, H);
		});
	});

const clockBody = () =>
	cachedGeo('clock-body', () => {
		const W = 14.4;
		const H = 7;
		const b: Bx[] = [
			// корпус
			[-W / 2, -H / 2, 0, W / 2, H / 2, 1.2, '#1b1c21'],
			// рамка вокруг табло (чуть светлее)
			[-W / 2, H / 2 - 0.7, 1.2, W / 2, H / 2, 1.5, '#2b2d34'],
			[-W / 2, -H / 2, 1.2, W / 2, -H / 2 + 0.7, 1.5, '#2b2d34'],
			[-W / 2, -H / 2, 1.2, -W / 2 + 0.7, H / 2, 1.5, '#2b2d34'],
			[W / 2 - 0.7, -H / 2, 1.2, W / 2, H / 2, 1.5, '#2b2d34'],
			// кнопки сверху
			[3.2, H / 2, 0.4, 4.4, H / 2 + 0.35, 1.0, '#3a3c44'],
			[4.9, H / 2, 0.4, 6.1, H / 2 + 0.35, 1.0, '#3a3c44'],
			// ножка-подставка (часы на стене, но с «полочкой»)
			[-W / 2 + 0.6, -H / 2 - 0.3, 0.2, W / 2 - 0.6, -H / 2, 1.3, '#141519'],
		];
		return boxGeometry(b);
	});

export type WallClockProps = {
	position: [number, number, number];
	rotationY?: number;
	// что показывает табло (по умолчанию '16:00')
	text?: string;
	// двоеточие горит (мигание: colon={Math.floor(t * 2) % 2 === 0})
	colon?: boolean;
	// свечение цифр 0..1 (ореол и красный отсвет)
	glow?: number;
	scale?: number;
};

export const WallClock: React.FC<WallClockProps> = ({position, rotationY = 0, text = '16:00', colon = true, glow = 1, scale = 1}) => {
	const screen = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false}), []);
	screen.map = clockTexture(text, colon);
	return (
		<group position={position} rotation={[0, rotationY, 0]} scale={scale}>
			<mesh geometry={clockBody()} material={vcMat()} />
			<mesh material={screen} position={[0, 0, 1.3 * P16]}>
				<planeGeometry args={[13 * P16, 5.6 * P16]} />
			</mesh>
			{glow > 0.01 ? (
				<>
					<Glow position={[0, 0, 0.12]} color="#ff2a10" size={1.25 * glow} opacity={0.32 * glow} />
					<Glow position={[0, 0, 0.05]} color="#ff4020" size={0.6 * glow} opacity={0.25 * glow} />
				</>
			) : null}
		</group>
	);
};

// ---------- пробковая доска и записка ----------

const corkTexture = () =>
	cachedTex('cork', () =>
		canvasTexture(
			128,
			104,
			(ctx) => {
				const rnd = mulberry32(17);
				ctx.fillStyle = '#9a6a3c';
				ctx.fillRect(0, 0, 128, 104);
				for (let i = 0; i < 2400; i++) {
					const x = Math.floor(rnd() * 128);
					const y = Math.floor(rnd() * 104);
					const r = rnd();
					ctx.fillStyle = r < 0.33 ? '#7c512a' : r < 0.66 ? '#b07e4a' : r < 0.85 ? '#6a4322' : '#c4925a';
					ctx.fillRect(x, y, 1, 1);
				}
			},
			true,
		),
	);

// Записка: страница из тетради (неровный верхний край, линейки), текст пиксельным шрифтом от руки.
// Размер в «пикселях шрифта»: 124×104; масштаб холста — 16.
const NOTE_W = 124;
const NOTE_H = 104;
const NOTE_S = 16;
const INK = '#1a2148';
const INK_DARK = '#151515';
const noteLines = () => {
	const date = '21 НОЯБРЯ';
	const wipe = 'ВАЙП HOLYWORLD';
	const time = '13:00';
	return {
		date: {text: date, px: 1.7, x: 10, y: 24},
		wipe: {text: wipe, px: 1.25, x: (NOTE_W - pixelTextWidth(wipe, 1.25)) / 2, y: 50},
		time: {text: time, px: 3.4, x: (NOTE_W - pixelTextWidth(time, 3.4)) / 2, y: 88},
	};
};
// где на записке «13:00» (центр и полуразмеры, в долях листа: x 0..1 слева, y 0..1 сверху)
const timeBox = () => {
	const l = noteLines().time;
	const w = pixelTextWidth(l.text, l.px);
	return {cx: (l.x + w / 2) / NOTE_W, cy: (l.y - 3.5 * l.px) / NOTE_H, hw: w / 2 / NOTE_W, hh: (3.5 * l.px) / NOTE_H};
};

const noteTexture = () =>
	cachedTex('note', () =>
		canvasTexture(NOTE_W * NOTE_S, NOTE_H * NOTE_S, (ctx) => {
			const s = NOTE_S;
			const W = NOTE_W * s;
			const H = NOTE_H * s;
			ctx.clearRect(0, 0, W, H);
			// бумага с рваным верхним краем
			ctx.fillStyle = '#f2ead8';
			ctx.beginPath();
			ctx.moveTo(0, H);
			ctx.lineTo(0, 3 * s);
			for (let x = 0; x <= NOTE_W; x += 2) ctx.lineTo(x * s, (1.2 + hash3(x, 0, 0, 91) * 2.2) * s);
			ctx.lineTo(W, H);
			ctx.closePath();
			ctx.fill();
			// лёгкая неровность бумаги
			const rnd = mulberry32(5);
			for (let i = 0; i < 900; i++) {
				ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.12)';
				ctx.fillRect(rnd() * W, rnd() * H, s * (1 + rnd() * 3), s * 0.6);
			}
			// линейки и поле
			ctx.fillStyle = 'rgba(90,140,200,0.35)';
			for (let y = 30; y < NOTE_H; y += 13) ctx.fillRect(0, y * s, W, s * 0.45);
			ctx.fillStyle = 'rgba(210,70,70,0.35)';
			ctx.fillRect(6 * s, 3 * s, s * 0.45, H);
			// текст
			const L = noteLines();
			drawPixelText(ctx, {...L.date, color: INK, wobble: 0.6}, s);
			drawPixelText(ctx, {...L.wipe, color: INK_DARK, wobble: 0.5, bold: false}, s);
			drawPixelText(ctx, {...L.time, color: INK_DARK, wobble: 0.3}, s);
			// подчёркивание даты
			ctx.fillStyle = INK;
			ctx.fillRect(L.date.x * s, (L.date.y + 2.2) * s, pixelTextWidth(L.date.text, L.date.px) * s, s * 0.9);
		}),
	);

// Красный круг маркером: мазки вдоль неровного эллипса (1.15 оборота), рисуется по progress через drawRange
const circleGeometry = (rx: number, ry: number, n: number) => {
	const pos: number[] = [];
	const idx: number[] = [];
	const nor: number[] = [];
	const turns = 1.12;
	const w = 0.011;
	for (let i = 0; i < n; i++) {
		const k = i / (n - 1);
		const a = -2.4 + k * turns * Math.PI * 2;
		// рука ведёт не идеально: радиус гуляет, конец чуть заходит наружу
		const wob = 1 + Math.sin(k * 9.1) * 0.035 + Math.sin(k * 23) * 0.015 + k * 0.07;
		const x = Math.cos(a) * rx * wob;
		const y = Math.sin(a) * ry * wob;
		const dx = -Math.sin(a) * rx;
		const dy = Math.cos(a) * ry;
		const len = Math.hypot(dx, dy) || 1;
		const tx = dx / len;
		const ty = dy / len;
		const seg = ((Math.PI * 2 * turns) / n) * Math.max(rx, ry) * 1.6;
		const nx = -ty * w;
		const ny = tx * w;
		const b = pos.length / 3;
		pos.push(x - tx * seg - nx, y - ty * seg - ny, 0, x + tx * seg - nx, y + ty * seg - ny, 0, x + tx * seg + nx, y + ty * seg + ny, 0, x - tx * seg + nx, y - ty * seg + ny, 0);
		nor.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
		idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
	geo.setIndex(idx);
	return geo;
};

const corkFrame = () =>
	cachedGeo('cork-frame', () => {
		const W = 16;
		const H = 12.8;
		const c = '#6b4a2a';
		const b: Bx[] = [
			[-W / 2, -H / 2, 0, W / 2, H / 2, 0.5, '#3a2818'],
			[-W / 2, H / 2 - 1, 0.5, W / 2, H / 2, 1.3, c, 0.12],
			[-W / 2, -H / 2, 0.5, W / 2, -H / 2 + 1, 1.3, c, 0.12],
			[-W / 2, -H / 2 + 1, 0.5, -W / 2 + 1, H / 2 - 1, 1.3, c, 0.12],
			[W / 2 - 1, -H / 2 + 1, 0.5, W / 2, H / 2 - 1, 1.3, c, 0.12],
		];
		return boxGeometry(b, P16, 3);
	});

// мелочь на доске: жёлтый стикер (без надписей), фото со снежным пейзажем, кнопки
const photoTexture = () =>
	cachedTex('cork-photo', () =>
		canvasTexture(
			20,
			16,
			(ctx) => {
				ctx.fillStyle = '#f4f4f0';
				ctx.fillRect(0, 0, 20, 16);
				const g = ctx.createLinearGradient(0, 1, 0, 11);
				g.addColorStop(0, '#6f9ad8');
				g.addColorStop(1, '#f2c49a');
				ctx.fillStyle = g;
				ctx.fillRect(1, 1, 18, 10);
				ctx.fillStyle = '#eef4fb';
				ctx.fillRect(1, 8, 18, 3);
				ctx.fillStyle = '#2d5a3c';
				for (const [x, h] of [
					[3, 5],
					[7, 4],
					[14, 6],
				]) {
					for (let i = 0; i < h; i++) ctx.fillRect(x - Math.floor(i / 2), 10 - h + i, 1 + Math.floor(i / 2) * 2, 1);
				}
			},
			true,
		),
	);

export type CorkNoteProps = {
	position: [number, number, number];
	rotationY?: number;
	// красный круг вокруг «13:00»: 0 — нет, 1 — обведён полностью
	circle?: number;
	scale?: number;
};

export const CorkNote: React.FC<CorkNoteProps> = ({position, rotationY = 0, circle = 0, scale = 1}) => {
	const paperW = 0.62;
	const paperH = (paperW * NOTE_H) / NOTE_W;
	const box = timeBox();
	const mats = useMemo(
		() => ({
			cork: new THREE.MeshLambertMaterial({map: corkTexture()}),
			paper: new THREE.MeshLambertMaterial({map: noteTexture(), transparent: true, alphaTest: 0.3}),
			marker: new THREE.MeshLambertMaterial({color: '#d4141a', emissive: '#3a0000', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
			pin: new THREE.MeshLambertMaterial({color: '#d02a2a'}),
			pin2: new THREE.MeshLambertMaterial({color: '#2a6ad0'}),
			sticky: new THREE.MeshLambertMaterial({color: '#f5dd62'}),
			photo: new THREE.MeshLambertMaterial({map: photoTexture()}),
			shadow: new THREE.MeshBasicMaterial({color: '#000000', transparent: true, opacity: 0.25, depthWrite: false}),
		}),
		[],
	);
	const circleGeo = useMemo(() => circleGeometry((box.hw + 0.07) * paperW, (box.hh + 0.075) * paperH, 120), [box.hw, box.hh, paperH]);
	const n = Math.floor(clamp01(circle) * 120);
	circleGeo.setDrawRange(0, n * 6);
	const px = (box.cx - 0.5) * paperW;
	const py = (0.5 - box.cy) * paperH;
	return (
		<group position={position} rotation={[0, rotationY, 0]} scale={scale}>
			<mesh geometry={corkFrame()} material={vcMat()} />
			<mesh material={mats.cork} position={[0, 0, 0.55 * P16]}>
				<planeGeometry args={[14 * P16, 10.8 * P16]} />
			</mesh>
			{/* фото и стикер */}
			<group position={[0.3, 0.17, 0.6 * P16]} rotation={[0, 0, 0.09]}>
				<mesh material={mats.photo}>
					<planeGeometry args={[0.26, 0.21]} />
				</mesh>
				<mesh material={mats.pin2} position={[0, 0.09, 0.012]}>
					<boxGeometry args={[0.03, 0.03, 0.025]} />
				</mesh>
			</group>
			<mesh material={mats.sticky} position={[0.33, -0.18, 0.62 * P16]} rotation={[0, 0, -0.06]}>
				<planeGeometry args={[0.2, 0.2]} />
			</mesh>
			{/* записка */}
			<group position={[-0.1, -0.02, 0.75 * P16]} rotation={[0, 0, -0.035]}>
				<mesh material={mats.shadow} position={[0.012, -0.014, -0.002]}>
					<planeGeometry args={[paperW, paperH]} />
				</mesh>
				<mesh material={mats.paper}>
					<planeGeometry args={[paperW, paperH]} />
				</mesh>
				<mesh geometry={circleGeo} material={mats.marker} position={[px, py, 0.002]} />
				<mesh material={mats.pin} position={[0, paperH / 2 - 0.05, 0.015]}>
					<boxGeometry args={[0.04, 0.04, 0.03]} />
				</mesh>
				<mesh material={mats.pin} position={[0, paperH / 2 - 0.05, 0.035]}>
					<boxGeometry args={[0.022, 0.022, 0.02]} />
				</mesh>
			</group>
		</group>
	);
};

// ---------- вешалка: планка с четырьмя крючками, на крайних — куртка и шарф ----------
const hooksGeo = (coat: boolean, scarf: boolean) =>
	cachedGeo(`hooks-${coat}-${scarf}`, () => {
		const b: Bx[] = [[-12, -1.5, 0, 12, 1.5, 1, '#4a3220', 0.1]];
		const xs = [-9.6, -3.2, 3.2, 9.6];
		for (const x of xs) {
			b.push([x - 0.5, -1.2, 1, x + 0.5, -0.2, 3.8, '#2d2d33']);
			b.push([x - 0.5, -1.2, 3.0, x + 0.5, 0.6, 3.8, '#2d2d33']);
			b.push([x - 0.6, 0.4, 2.9, x + 0.6, 1.0, 3.9, '#b08a4a']);
		}
		if (coat) {
			// куртка на первом крючке: капюшон, плечи, спина, рукав, молния, меховая опушка
			const x = xs[0];
			const C = '#34405a';
			const C2 = '#2a3449';
			b.push([x - 2.6, -3.6, 1.0, x + 2.6, 0.4, 3.6, C2, 0.06]);
			b.push([x - 4.4, -6, 1.2, x + 4.4, -3, 3.6, C, 0.06]);
			b.push([x - 4.8, -17, 1.0, x + 4.8, -6, 3.4, C, 0.06]);
			b.push([x - 5.4, -15.5, 1.6, x - 4.2, -5, 3.8, C2]);
			b.push([x + 4.2, -15.5, 1.6, x + 5.4, -5, 3.8, C2]);
			b.push([x - 0.3, -17, 3.35, x + 0.3, -6, 3.6, '#5a6274']);
			b.push([x - 2.8, -3.9, 3.3, x + 2.8, -3.1, 4.0, '#bfb4a2']);
			b.push([x - 4.8, -11.5, 3.35, x + 4.8, -10.8, 3.55, C2]);
		}
		if (scarf) {
			// шарф в полоску на последнем крючке
			const x = xs[3];
			for (let i = 0; i < 9; i++) {
				const c = i % 2 === 0 ? '#b8302a' : '#e9e2d6';
				b.push([x - 1.6, -1.5 - (i + 1) * 1.5, 2.2, x - 0.2, -1.5 - i * 1.5, 3.4, c]);
				if (i < 7) b.push([x + 0.2, -1.5 - (i + 1) * 1.5, 2.6, x + 1.6, -1.5 - i * 1.5, 3.8, c]);
			}
		}
		return boxGeometry(b, P16, 5);
	});

export type CoatHooksProps = {position: [number, number, number]; rotationY?: number; coat?: boolean; scarf?: boolean};
// Начало — центр планки на стене. Крючки на локальных x = −0.6, −0.2, 0.2, 0.6 (кончик на z = 0.24, y = −0.06).
export const CoatHooks: React.FC<CoatHooksProps> = ({position, rotationY = 0, coat = true, scarf = true}) => (
	<group position={position} rotation={[0, rotationY, 0]}>
		<mesh geometry={hooksGeo(coat, scarf)} material={vcMat()} />
	</group>
);

// ---------- обувница с сапогами ----------
const benchGeo = () =>
	cachedGeo('shoe-bench', () => {
		const w = '#6e4c2c';
		const d = '#4a3220';
		const b: Bx[] = [
			[-9.5, 6.5, -4.4, 9.5, 8, 4.4, w, 0.1],
			[-9, 0, -4, -7.5, 6.5, -2.5, d],
			[7.5, 0, -4, 9, 6.5, -2.5, d],
			[-9, 0, 2.5, -7.5, 6.5, 4, d],
			[7.5, 0, 2.5, 9, 6.5, 4, d],
			[-8, 2, -3.8, 8, 3, 3.8, w, 0.1],
			// сапоги на полке и под ней
			[-6.5, 3, -2.5, -4, 7.5 - 1.5, 2.5, '#3a2a22'],
			[-3.5, 3, -2.5, -1, 6, 2.5, '#3a2a22'],
			[-6.5, 3, 1.5, -4, 4, 3.6, '#3a2a22'],
			[-3.5, 3, 1.5, -1, 4, 3.6, '#3a2a22'],
			[-6.6, 5.4, -2.6, -3.9, 6.1, 2.6, '#d8cfc0'],
			[-3.6, 5.4, -2.6, -0.9, 6.1, 2.6, '#d8cfc0'],
			[2, 0, -2, 4.5, 4, 2, '#7a2a28'],
			[5, 0, -2, 7.5, 4, 2, '#7a2a28'],
			[2, 0, 2, 4.5, 1.2, 3.5, '#7a2a28'],
			[5, 0, 2, 7.5, 1.2, 3.5, '#7a2a28'],
		];
		return boxGeometry(b, P16, 7);
	});
export const ShoeBench: React.FC<{position: [number, number, number]; rotationY?: number}> = ({position, rotationY = 0}) => (
	<group position={position} rotation={[0, rotationY, 0]}>
		<mesh geometry={benchGeo()} material={vcMat()} />
	</group>
);

// ---------- свеча ----------
export type CandleProps = {position: [number, number, number]; t: number; height?: number; lit?: number; seed?: number; color?: string};
export const Candle: React.FC<CandleProps> = ({position, t, height = 4, lit = 1, seed = 0, color = '#efe4c8'}) => {
	const mats = useMemo(
		() => ({
			wax: new THREE.MeshLambertMaterial({color, emissive: '#3a2a10'}),
			wick: new THREE.MeshBasicMaterial({color: '#2a2018'}),
			flame: new THREE.MeshBasicMaterial({color: '#ffe08a', toneMapped: false, fog: false}),
			core: new THREE.MeshBasicMaterial({color: '#fff6d8', toneMapped: false, fog: false}),
		}),
		[color],
	);
	const f = flicker(t, seed + 11);
	const h = height * P16;
	return (
		<group position={position}>
			<mesh material={mats.wax} position={[0, h / 2, 0]}>
				<boxGeometry args={[2 * P16, h, 2 * P16]} />
			</mesh>
			<mesh material={mats.wick} position={[0, h + 0.4 * P16, 0]}>
				<boxGeometry args={[0.35 * P16, 0.8 * P16, 0.35 * P16]} />
			</mesh>
			{lit > 0.02 ? (
				<>
					<mesh material={mats.flame} position={[f * 0.004, h + 1.4 * P16, 0]} scale={lit * (1 + f * 0.12)}>
						<boxGeometry args={[0.9 * P16, 1.8 * P16, 0.9 * P16]} />
					</mesh>
					<mesh material={mats.core} position={[0, h + 1.1 * P16, 0]} scale={lit}>
						<boxGeometry args={[0.45 * P16, 0.8 * P16, 0.45 * P16]} />
					</mesh>
					<Glow position={[0, h + 1.5 * P16, 0]} color="#ffb04a" size={(1.1 + f * 0.12) * lit} opacity={0.42 * lit} />
				</>
			) : null}
		</group>
	);
};

// ---------- постер HolyWorld ----------
const posterBack = () =>
	cachedTex('poster-back', () =>
		canvasTexture(
			48,
			48,
			(ctx) => {
				const g = ctx.createLinearGradient(0, 0, 0, 48);
				g.addColorStop(0, '#2a1b4a');
				g.addColorStop(1, '#120c22');
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, 48, 48);
				const rnd = mulberry32(9);
				for (let i = 0; i < 40; i++) {
					ctx.fillStyle = rnd() < 0.7 ? '#6c5aa8' : '#d8c8ff';
					ctx.fillRect(Math.floor(rnd() * 48), Math.floor(rnd() * 48), 1, 1);
				}
				// снежная кромка внизу
				ctx.fillStyle = '#d9e4f5';
				for (let x = 0; x < 48; x++) ctx.fillRect(x, 44 - Math.floor(hash3(x >> 2, 0, 0, 3) * 3), 1, 4);
				ctx.fillStyle = '#9fb2d0';
				ctx.fillRect(0, 47, 48, 1);
			},
			true,
		),
	);

export type PosterProps = {position: [number, number, number]; rotationY?: number; texture: THREE.Texture; width?: number; height?: number; logoAspect?: number};
// Постер: тёмно-фиолетовый фон со «звёздами» и снегом, по центру — логотип (texture), рамка из тёмного дерева
export const Poster: React.FC<PosterProps> = ({position, rotationY = 0, texture, width = 1.5, height = 1.5, logoAspect = 359 / 332}) => {
	const mats = useMemo(
		() => ({
			back: new THREE.MeshLambertMaterial({map: posterBack()}),
			logo: new THREE.MeshLambertMaterial({map: texture, transparent: true, alphaTest: 0.05, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.25}),
		}),
		[texture],
	);
	const frame = useMemo(() => {
		const W = width * 16;
		const H = height * 16;
		const c = '#3a2616';
		return boxGeometry([
			[-W / 2, -H / 2, 0, W / 2, H / 2, 0.3, '#1a1020'],
			[-W / 2, H / 2 - 0.8, 0.3, W / 2, H / 2, 1.1, c],
			[-W / 2, -H / 2, 0.3, W / 2, -H / 2 + 0.8, 1.1, c],
			[-W / 2, -H / 2, 0.3, -W / 2 + 0.8, H / 2, 1.1, c],
			[W / 2 - 0.8, -H / 2, 0.3, W / 2, H / 2, 1.1, c],
		]);
	}, [width, height]);
	const lw = width * 0.78;
	const lh = lw / logoAspect;
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={frame} material={vcMat()} />
			<mesh material={mats.back} position={[0, 0, 0.35 * P16]}>
				<planeGeometry args={[width - 1.6 * P16, height - 1.6 * P16]} />
			</mesh>
			<mesh material={mats.logo} position={[0, 0.03, 0.45 * P16]}>
				<planeGeometry args={[lw, lh]} />
			</mesh>
		</group>
	);
};

// ---------- картина: зимний пейзаж (без надписей) ----------
const paintingTex = (seed: number) =>
	cachedTex(`painting-${seed}`, () =>
		canvasTexture(
			32,
			20,
			(ctx) => {
				const g = ctx.createLinearGradient(0, 0, 0, 14);
				g.addColorStop(0, seed % 2 ? '#2a3a6e' : '#5a7ab8');
				g.addColorStop(1, seed % 2 ? '#c87a5a' : '#f0c8a0');
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, 32, 20);
				const rnd = mulberry32(seed + 3);
				ctx.fillStyle = '#e8eef8';
				for (let x = 0; x < 32; x++) ctx.fillRect(x, 13 + Math.round(Math.sin(x * 0.3 + seed) * 1.5), 1, 8);
				ctx.fillStyle = '#ffe2a0';
				ctx.fillRect(22, 5, 3, 3);
				for (let i = 0; i < 5; i++) {
					const x = Math.floor(rnd() * 30) + 1;
					const h = 4 + Math.floor(rnd() * 5);
					ctx.fillStyle = '#1e3a2a';
					for (let k = 0; k < h; k++) ctx.fillRect(x - Math.floor(k / 2), 14 - h + k, 1 + Math.floor(k / 2) * 2, 1);
				}
			},
			true,
		),
	);
export const Painting: React.FC<{position: [number, number, number]; rotationY?: number; width?: number; height?: number; seed?: number}> = ({position, rotationY = 0, width = 1.2, height = 0.75, seed = 1}) => {
	const mat = useMemo(() => new THREE.MeshLambertMaterial({map: paintingTex(seed)}), [seed]);
	const frame = useMemo(() => {
		const W = width * 16;
		const H = height * 16;
		const c = '#7a5a2a';
		return boxGeometry([
			[-W / 2, H / 2 - 1, 0, W / 2, H / 2, 1.2, c, 0.1],
			[-W / 2, -H / 2, 0, W / 2, -H / 2 + 1, 1.2, c, 0.1],
			[-W / 2, -H / 2, 0, -W / 2 + 1, H / 2, 1.2, c, 0.1],
			[W / 2 - 1, -H / 2, 0, W / 2, H / 2, 1.2, c, 0.1],
		]);
	}, [width, height]);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={frame} material={vcMat()} />
			<mesh material={mat} position={[0, 0, 0.5 * P16]}>
				<planeGeometry args={[width - 2 * P16, height - 2 * P16]} />
			</mesh>
		</group>
	);
};
