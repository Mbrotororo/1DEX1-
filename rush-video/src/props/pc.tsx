import React, {useMemo} from 'react';
import * as THREE from 'three';
import {Glow} from '../core/chars/extras';
import {clamp01} from '../core/anim';
import {hash3} from '../core/rng';
import {Headphones} from './wear';
import {Bx, boxGeometry, cachedGeo, hueColor, P16, recolorBoxes, vcMat} from './kit';

// Рабочее место: стол, монитор, системный блок с RGB, клавиатура, мышь, коврик, микрофон, лампа, подставка для наушников.
// У всего: начало — центр низа (на полу/столе), «лицо» (сторона пользователя) — локальный +z. Единица моделей — 1/16 блока.

// RGB по времени: общий тон бежит по кругу, i — сдвиг (для «волны» по ленте)
export const rgbHue = (t: number, i = 0) => (t * 0.22 + i) % 1;

// ---------- стол ----------
export const DESK_TOP = 14 * P16;

const deskGeo = (w: number, d: number) =>
	cachedGeo(`desk-${w}-${d}`, () => {
		const W = w * 16;
		const D = d * 16;
		const top = '#5a3a22';
		const edge = '#3c2616';
		const metal = '#1c1d22';
		const b: Bx[] = [
			[-W / 2, 12.4, -D / 2, W / 2, 14, D / 2, top, 0.08],
			[-W / 2, 12.2, D / 2 - 0.4, W / 2, 14, D / 2 + 0.1, edge],
			// ножки-рамы (металл)
			[-W / 2 + 0.8, 0, -D / 2 + 1, -W / 2 + 2.2, 12.4, -D / 2 + 2.4, metal],
			[-W / 2 + 0.8, 0, D / 2 - 2.4, -W / 2 + 2.2, 12.4, D / 2 - 1, metal],
			[W / 2 - 2.2, 0, -D / 2 + 1, W / 2 - 0.8, 12.4, -D / 2 + 2.4, metal],
			[W / 2 - 2.2, 0, D / 2 - 2.4, W / 2 - 0.8, 12.4, D / 2 - 1, metal],
			[-W / 2 + 0.8, 0, -D / 2 + 1, -W / 2 + 2.2, 1, D / 2 - 1, metal],
			[W / 2 - 2.2, 0, -D / 2 + 1, W / 2 - 0.8, 1, D / 2 - 1, metal],
			// задняя панель
			[-W / 2 + 2.2, 5, -D / 2 + 1.2, W / 2 - 2.2, 12.4, -D / 2 + 2, edge],
			// тумба с ящиками слева
			[-W / 2 + 2.4, 0.2, -D / 2 + 2.2, -W / 2 + 13, 12.4, D / 2 - 1.4, '#4a2f1c', 0.06],
			[-W / 2 + 2.9, 8.4, D / 2 - 1.4, -W / 2 + 12.5, 11.8, D / 2 - 1.0, top],
			[-W / 2 + 2.9, 4.6, D / 2 - 1.4, -W / 2 + 12.5, 8.0, D / 2 - 1.0, top],
			[-W / 2 + 2.9, 0.8, D / 2 - 1.4, -W / 2 + 12.5, 4.2, D / 2 - 1.0, top],
			[-W / 2 + 6.5, 10.0, D / 2 - 1.0, -W / 2 + 8.9, 10.5, D / 2 - 0.6, '#b8a070'],
			[-W / 2 + 6.5, 6.2, D / 2 - 1.0, -W / 2 + 8.9, 6.7, D / 2 - 0.6, '#b8a070'],
			[-W / 2 + 6.5, 2.4, D / 2 - 1.0, -W / 2 + 8.9, 2.9, D / 2 - 0.6, '#b8a070'],
		];
		return boxGeometry(b, P16, 41);
	});

// лента RGB под передним краем столешницы (вершинные цвета, перекрашиваются каждый кадр)
const stripGeo = (n: number, x0: number, x1: number, y: number, z: number, thick = 0.5) => {
	const b: Bx[] = [];
	for (let i = 0; i < n; i++) {
		const a = x0 + ((x1 - x0) * i) / n;
		const c = x0 + ((x1 - x0) * (i + 1)) / n;
		b.push([a, y, z, c - 0.05, y + thick, z + thick, '#ffffff']);
	}
	return boxGeometry(b, P16);
};

export type DeskProps = {position: [number, number, number]; rotationY?: number; width?: number; depth?: number; t?: number; rgb?: number};
export const Desk: React.FC<DeskProps> = ({position, rotationY = 0, width = 4.5, depth = 1.4, t = 0, rgb = 0}) => {
	const strip = useMemo(() => stripGeo(36, -width * 8 + 3, width * 8 - 3, 11.6, depth * 8 - 1.2), [width, depth]);
	const mat = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}), []);
	if (rgb > 0.01) recolorBoxes(strip, 36, (i, c) => (hueColor(rgbHue(t, i / 36), 1, 0.55, c).multiplyScalar(clamp01(rgb * 1.2 - (i / 36) * 0.2)), true));
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={deskGeo(width, depth)} material={vcMat()} />
			{rgb > 0.01 ? <mesh geometry={strip} material={mat} /> : null}
		</group>
	);
};

// ---------- монитор ----------
export const SCREEN_W = 1.2;
export const SCREEN_H = 0.675;
// центр экрана над столом и вынос плоскости экрана вперёд от центра ножки (блоки)
export const SCREEN_Y = 4.8 * P16 + SCREEN_H / 2;
export const SCREEN_Z = 1.2 * P16;

const monitorGeo = () =>
	cachedGeo('monitor', () => {
		const W = SCREEN_W * 16;
		const H = SCREEN_H * 16;
		const y0 = 4.8;
		const c = '#16171c';
		const b: Bx[] = [
			// подставка
			[-3.6, 0, -3.4, 3.6, 0.5, 1.4, '#202128'],
			[-0.9, 0.5, -2.6, 0.9, y0 + 4, -1.4, '#2a2b33'],
			// корпус экрана и рамка
			[-W / 2 - 0.4, y0 - 0.5, -0.2, W / 2 + 0.4, y0 + H + 0.4, 1.1, c],
			[-W / 2 + 2, y0 + 1, -1.4, W / 2 - 2, y0 + H - 1.5, -0.2, '#1e1f26'],
			// нижняя планка с логотипом-точкой
			[-1.2, y0 - 0.45, 1.1, 1.2, y0 - 0.15, 1.2, '#2c2d36'],
		];
		return boxGeometry(b, P16);
	});

export type MonitorProps = {
	position: [number, number, number];
	rotationY?: number;
	// включён 0..1 (яркость картинки и подсветки)
	on?: number;
	// картинка 16:9 на весь экран (CanvasTexture и т.п.); без неё — ровный цвет glowColor
	screen?: THREE.Texture | null;
	// цвет свечения (отсвет на лице и столе)
	glowColor?: string;
	// точечный свет перед экраном (освещает героя): сила 0..; 0 — без света
	light?: number;
	// фиолетовая подсветка стены за монитором 0..1
	backlight?: number;
};

export const Monitor: React.FC<MonitorProps> = ({position, rotationY = 0, on = 1, screen = null, glowColor = '#86b0ff', light = 1, backlight = 0}) => {
	const mats = useMemo(
		() => ({
			screen: new THREE.MeshBasicMaterial({toneMapped: false}),
			glass: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.05, depthWrite: false}),
			led: new THREE.MeshBasicMaterial({toneMapped: false}),
		}),
		[],
	);
	const k = clamp01(on);
	if (mats.screen.map !== screen) {
		mats.screen.map = screen;
		mats.screen.needsUpdate = true;
	}
	if (screen) mats.screen.color.set('#07080b').lerp(new THREE.Color('#ffffff'), k);
	else mats.screen.color.set('#07080b').lerp(new THREE.Color(glowColor), k * 0.85);
	mats.led.color.set(k > 0.05 ? '#5ad0ff' : '#ff8a2a');
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={monitorGeo()} material={vcMat()} />
			<mesh material={mats.screen} position={[0, SCREEN_Y, SCREEN_Z]}>
				<planeGeometry args={[SCREEN_W, SCREEN_H]} />
			</mesh>
			{/* блик на стекле (виден и на выключенном) */}
			<mesh material={mats.glass} position={[0.1, SCREEN_Y + 0.1, SCREEN_Z + 0.002]} rotation={[0, 0, 0.5]}>
				<planeGeometry args={[0.18, SCREEN_H * 1.3]} />
			</mesh>
			<mesh material={mats.led} position={[SCREEN_W / 2 - 0.06, 4.8 * P16 - 0.018, SCREEN_Z - 0.005]}>
				<boxGeometry args={[0.025, 0.012, 0.012]} />
			</mesh>
			{k > 0.01 ? <Glow position={[0, SCREEN_Y, SCREEN_Z + 0.15]} color={glowColor} size={2.4} opacity={0.22 * k} /> : null}
			{k > 0.01 && light > 0 ? <pointLight position={[0, SCREEN_Y, SCREEN_Z + 0.5]} color={glowColor} intensity={k * light * 4.5} distance={3.6} decay={1.3} /> : null}
			{backlight > 0.01 ? <Glow position={[0, SCREEN_Y + 0.1, -0.25]} color="#8a4aff" size={2.6} opacity={0.4 * backlight} /> : null}
		</group>
	);
};

// ---------- системный блок ----------
const PC_W = 7;
const PC_H = 15;
const PC_D = 14;

const caseGeo = () =>
	cachedGeo('pc-case', () => {
		const W = PC_W / 2;
		const D = PC_D / 2;
		const c = '#141519';
		const c2 = '#1d1e24';
		const b: Bx[] = [
			[-W, 0, -D, W, 0.8, D, c],
			[-W, PC_H - 0.6, -D, W, PC_H, D, c],
			[W - 0.5, 0.8, -D, W, PC_H - 0.6, D, c2],
			[-W, 0.8, -D, W, PC_H - 0.6, -D + 0.5, c],
			// стойка стекла спереди и сзади
			[-W, 0.8, D - 0.6, -W + 0.4, PC_H - 0.6, D, c],
			[-W, 0.8, -D, -W + 0.4, PC_H - 0.6, -D + 0.6, c],
			// передняя сетка
			[-W + 0.4, 0.8, D - 0.35, W - 0.5, PC_H - 0.6, D, '#22232a'],
			// ножки
			[-W + 0.3, -0.3, -D + 0.5, -W + 1.5, 0, -D + 1.7, '#0c0c0e'],
			[W - 1.5, -0.3, -D + 0.5, W - 0.3, 0, -D + 1.7, '#0c0c0e'],
			[-W + 0.3, -0.3, D - 1.7, -W + 1.5, 0, D - 0.5, '#0c0c0e'],
			[W - 1.5, -0.3, D - 1.7, W - 0.3, 0, D - 0.5, '#0c0c0e'],
			// внутри: материнская плата, кожух БП, видеокарта, кулер, память
			[W - 0.9, 3.5, -D + 1, W - 0.5, PC_H - 1.2, D - 2.5, '#1a2a22'],
			[-W + 0.4, 0.8, -D + 0.5, W - 0.5, 3.3, D - 0.4, '#18191e'],
			[-W + 1.4, 5.8, -D + 1.2, W - 0.9, 7.2, D - 3.2, '#22242c'],
			[-W + 1.2, 5.6, -D + 1.2, -W + 1.4, 7.4, D - 3.2, '#3a3c48'],
			[-W + 2.6, 9.0, -1.6, W - 0.9, 12.4, 1.6, '#2a2c34'],
			[W - 2.6, 9.4, 2.2, W - 0.9, 13.6, 2.6, '#202228'],
			[W - 2.6, 9.4, 2.9, W - 0.9, 13.6, 3.3, '#202228'],
		];
		return boxGeometry(b, P16);
	});

// RGB-элементы: кольца трёх передних вентиляторов, вертикальная лента у стекла, верх памяти, кант видеокарты.
// Для каждой коробки — «высота» 0..1 (волна включения идёт снизу вверх).
const RGB_FAN_Y = [3.4, 7.6, 11.8];
type RgbModel = {geo: THREE.BufferGeometry; count: number; level: number[]; phase: number[]};
const rgbModel = (): RgbModel => {
	const b: Bx[] = [];
	const level: number[] = [];
	const phase: number[] = [];
	const D = PC_D / 2;
	const W = PC_W / 2;
	RGB_FAN_Y.forEach((fy, f) => {
		const n = 12;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const x = Math.cos(a) * 2.2;
			const y = fy + Math.sin(a) * 2.2;
			b.push([x - 0.35, y - 0.35, D - 1.1, x + 0.35, y + 0.35, D - 0.6, '#ffffff']);
			level.push((y - 1) / (PC_H - 2));
			phase.push(f * 0.15 + i / n);
		}
	});
	for (let i = 0; i < 14; i++) {
		const y = 1.2 + i;
		b.push([-W + 0.42, y, D - 0.75, -W + 0.75, y + 0.9, D - 0.6, '#ffffff']);
		level.push(i / 14);
		phase.push(i * 0.05);
	}
	for (let i = 0; i < 2; i++) {
		b.push([W - 2.6, 13.6, 2.2 + i * 0.7, W - 0.9, 13.9, 2.6 + i * 0.7, '#ffffff']);
		level.push(0.95);
		phase.push(0.3 + i * 0.1);
	}
	for (let i = 0; i < 8; i++) {
		const z = -D + 1.2 + ((PC_D - 4.4) * i) / 8;
		b.push([-W + 1.3, 5.45, z, -W + 1.45, 5.65, z + (PC_D - 4.4) / 8 - 0.05, '#ffffff']);
		level.push(0.35);
		phase.push(0.5 + i * 0.04);
	}
	return {geo: boxGeometry(b, P16), count: b.length, level, phase};
};

// радиусы вентиляторов, px: передние — внутри своих RGB-колец (r = 2.2), задний — в ширину корпуса
const FRONT_FAN_R = 2.05;
const REAR_FAN_R = 3.0;
// вентилятор башенного кулера (смотрит в стекло): размером с сам кулер
const COOLER_FAN_R = 2.0;
// быстрее этого лопасти не рисуем — только «размытый» диск (иначе сквозь стекло, с ребра,
// крутящиеся коробки выглядят кучей пересекающихся палок)
const FAN_BLUR_SPEED = 0.3;

// лопасти вентилятора (в плоскости XY), вращаются вокруг z
const bladesGeo = (r: number) =>
	cachedGeo(`blades-${r}`, () => {
		const b: Bx[] = [[-0.5, -0.5, -0.1, 0.5, 0.5, 0.1, '#1a1a1e']];
		for (let i = 0; i < 4; i++) {
			// лопасть — смещённая коробка, повернём копии вручную
			const a = (i / 4) * Math.PI * 2;
			const cx = Math.cos(a) * r * 0.55;
			const cy = Math.sin(a) * r * 0.55;
			const hw = Math.abs(Math.cos(a)) > 0.5 ? r * 0.45 : 0.45;
			const hh = Math.abs(Math.cos(a)) > 0.5 ? 0.45 : r * 0.45;
			b.push([cx - hw, cy - hh, -0.08, cx + hw, cy + hh, 0.08, '#2a2b32']);
		}
		return boxGeometry(b, P16);
	});

// «Размытый» крутящийся вентилятор: гладкий тонкий диск (0.16 px) с призраками лопастей на обеих гранях
// и ступицей. С ребра — одна чистая линия, под углом — ровный эллипс, анфас — тёмный круг,
// по которому бегут едва заметные светлые лопасти (так выглядит настоящий вентилятор на ходу).
const fanBlurGeo = (r: number) =>
	cachedGeo(`fan-blur-${r}`, () => {
		const pos: number[] = [];
		const nor: number[] = [];
		const col: number[] = [];
		const c = new THREE.Color();
		const tri = (p: number[][], n: number[], hex: string) => {
			c.set(hex);
			for (const v of p) {
				pos.push(v[0] * P16, v[1] * P16, v[2] * P16);
				nor.push(...n);
				col.push(c.r, c.g, c.b);
			}
		};
		const h = 0.08;
		const N = 28;
		const at = (rr: number, a: number, z: number) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
		for (let i = 0; i < N; i++) {
			const a0 = (i / N) * Math.PI * 2;
			const a1 = ((i + 1) / N) * Math.PI * 2;
			// грани (+z и −z) и обод
			tri([[0, 0, h], at(r, a0, h), at(r, a1, h)], [0, 0, 1], DISC);
			tri([[0, 0, -h], at(r, a1, -h), at(r, a0, -h)], [0, 0, -1], DISC);
			const m = (a0 + a1) / 2;
			const rn = [Math.cos(m), Math.sin(m), 0];
			tri([at(r, a0, h), at(r, a0, -h), at(r, a1, h)], rn, DISC);
			tri([at(r, a0, -h), at(r, a1, -h), at(r, a1, h)], rn, DISC);
		}
		// призраки лопастей: изогнутые светлые полосы (закручены по ходу вращения)
		const n = 5;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const q = [at(0.55, a, 0), at(r * 0.9, a + 0.35, 0), at(r * 0.9, a + 0.8, 0), at(0.55, a + 0.42, 0)];
			for (const f of [1, -1]) {
				const z = f * (h + 0.012);
				const v = q.map((p) => [p[0], p[1], z]);
				if (f > 0) {
					tri([v[0], v[1], v[2]], [0, 0, 1], GHOST);
					tri([v[0], v[2], v[3]], [0, 0, 1], GHOST);
				} else {
					tri([v[0], v[2], v[1]], [0, 0, -1], GHOST);
					tri([v[0], v[3], v[2]], [0, 0, -1], GHOST);
				}
			}
		}
		// ступица
		const hub = boxGeometry([[-0.5, -0.5, -0.14, 0.5, 0.5, 0.14, '#18181c']], P16);
		const hp = hub.getAttribute('position');
		const hn = hub.getAttribute('normal');
		const hc = hub.getAttribute('color');
		const idx = hub.getIndex()!;
		for (let k = 0; k < idx.count; k++) {
			const j = idx.getX(k);
			pos.push(hp.getX(j), hp.getY(j), hp.getZ(j));
			nor.push(hn.getX(j), hn.getY(j), hn.getZ(j));
			col.push(hc.getX(j), hc.getY(j), hc.getZ(j));
		}
		hub.dispose();
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
		geo.computeBoundingSphere();
		return geo;
	});
const DISC = '#25262d';
const GHOST = '#3b3c48';

export type PcTowerProps = {
	position: [number, number, number];
	rotationY?: number;
	t: number;
	// питание 0..1 (индикатор кнопки, вентиляторы)
	power?: number;
	// волна RGB 0..1: подсветка загорается снизу вверх
	rgb?: number;
	// скорость вентиляторов 0..1
	fans?: number;
	// нажатие кнопки 0..1 (кнопка утоплена при 1)
	press?: number;
	// подсветка кнопки для крупного плана 0..1 (ореол)
	highlight?: number;
};

// Системный блок: стекло — сторона локального −x, перед — локальный +z, кнопка — сверху у переднего края.
// Размер 7×15×14 пикселей (0.44×0.94×0.875 блока).
export const PcTower: React.FC<PcTowerProps> = ({position, rotationY = 0, t, power = 1, rgb = 1, fans, press = 0, highlight = 0}) => {
	const model = useMemo(rgbModel, []);
	const mats = useMemo(
		() => ({
			rgb: new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}),
			glass: new THREE.MeshBasicMaterial({color: '#0c0f18', transparent: true, opacity: 0.32, depthWrite: false}),
			sheen: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.05, depthWrite: false}),
			button: new THREE.MeshLambertMaterial({color: '#2a2b33'}),
			ring: new THREE.MeshBasicMaterial({toneMapped: false}),
		}),
		[],
	);
	const w = clamp01(rgb);
	recolorBoxes(model.geo, model.count, (i, c) => {
		// волна: коробка загорается, когда фронт (с мягким краем) прошёл её высоту
		const lit = clamp01((w * 1.25 - model.level[i]) / 0.25);
		hueColor(rgbHue(t, model.phase[i] * 0.6 + model.level[i] * 0.35), 1, 0.55, c).multiplyScalar(lit);
		return true;
	});
	const p = clamp01(power);
	mats.ring.color.set('#0a0a0e').lerp(new THREE.Color('#e8f4ff'), p);
	const speed = fans ?? p;
	const spin = t * speed * 7.5;
	const blur = speed > FAN_BLUR_SPEED;
	const D = PC_D / 2;
	const W = PC_W / 2;
	const glowHue = hueColor(rgbHue(t, 0.4), 1, 0.6);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={caseGeo()} material={vcMat()} />
			<mesh geometry={model.geo} material={mats.rgb} />
			{/* вентиляторы: три спереди, на кулере и сзади */}
			{RGB_FAN_Y.map((fy, i) => (
				<mesh key={i} geometry={blur ? fanBlurGeo(FRONT_FAN_R) : bladesGeo(FRONT_FAN_R)} material={vcMat()} position={[0, fy * P16, (D - 1.3) * P16]} rotation={[0, 0, spin + i]} />
			))}
			<mesh geometry={blur ? fanBlurGeo(COOLER_FAN_R) : bladesGeo(COOLER_FAN_R)} material={vcMat()} position={[(-W + 2.4) * P16, 10.7 * P16, 0]} rotation={[0, Math.PI / 2, spin * 1.1]} />
			<mesh geometry={blur ? fanBlurGeo(REAR_FAN_R) : bladesGeo(REAR_FAN_R)} material={vcMat()} position={[0, 11 * P16, (-D + 0.8) * P16]} rotation={[0, 0, -spin]} />
			{/* стекло */}
			<mesh material={mats.glass} position={[(-W + 0.2) * P16, (PC_H / 2) * P16, 0]} rotation={[0, -Math.PI / 2, 0]} renderOrder={5}>
				<planeGeometry args={[(PC_D - 1.2) * P16, (PC_H - 1.4) * P16]} />
			</mesh>
			<mesh material={mats.sheen} position={[(-W + 0.15) * P16, (PC_H / 2 + 2) * P16, 2 * P16]} rotation={[0, -Math.PI / 2, 0.6]} renderOrder={6}>
				<planeGeometry args={[2 * P16, PC_H * P16]} />
			</mesh>
			{/* кнопка питания сверху у переднего края */}
			<group position={[0, PC_H * P16, (D - 1.6) * P16]}>
				<mesh material={mats.button} position={[0, (0.25 - clamp01(press) * 0.2) * P16, 0]}>
					<boxGeometry args={[1.3 * P16, 0.5 * P16, 1.3 * P16]} />
				</mesh>
				<mesh material={mats.ring} position={[0, 0.05 * P16, 0]}>
					<boxGeometry args={[1.7 * P16, 0.12 * P16, 1.7 * P16]} />
				</mesh>
				{highlight > 0.01 ? <Glow position={[0, 0.06, 0]} color="#bfe4ff" size={0.45 * highlight} opacity={0.6 * highlight} /> : null}
				{p > 0.05 ? <Glow position={[0, 0.02, 0]} color="#bfe4ff" size={0.18} opacity={0.5 * p} /> : null}
			</group>
			{w > 0.02 ? (
				<>
					<Glow position={[(-W - 0.5) * P16, 8 * P16, 0]} color={glowHue} size={1.6} opacity={0.3 * w} />
					<Glow position={[0, 7 * P16, (D + 1) * P16]} color={glowHue} size={1.3} opacity={0.22 * w} />
				</>
			) : null}
		</group>
	);
};

// ---------- клавиатура ----------
const KB_COLS = 15;
const KB_ROWS = 5;
const kbBase = () =>
	cachedGeo('kb-base', () =>
		boxGeometry(
			[
				[-7.2, 0, -2.6, 7.2, 0.5, 2.6, '#121318'],
				[-7.2, 0.5, -2.6, 7.2, 0.7, -2.3, '#1a1b22'],
			],
			P16,
		),
	);
const kbKeys = () => {
	const b: Bx[] = [];
	for (let r = 0; r < KB_ROWS; r++) {
		for (let c = 0; c < KB_COLS; c++) {
			// пробел — длинная клавиша в нижнем ряду
			if (r === 0 && c > 4 && c < 10) {
				if (c === 5) b.push([-7 + 5 * 0.93 + 0.08, 0.55, 2.1 - 0.93 + 0.08, -7 + 10 * 0.93 - 0.08, 0.95, 2.1 - 0.08, '#202128']);
				else b.push([0, 0, 0, 0, 0, 0, '#202128']);
				continue;
			}
			const x = -7 + c * 0.93;
			const z = 2.1 - (r + 1) * 0.93;
			b.push([x + 0.08, 0.55, z + 0.08, x + 0.85, 0.95, z + 0.85, '#202128']);
		}
	}
	return {geo: boxGeometry(b, P16), count: b.length};
};
const kbGlow = () =>
	cachedGeo('kb-glow', () => {
		const b: Bx[] = [];
		for (let i = 0; i < 16; i++) b.push([-7 + i * 0.875, 0.5, -2.2, -7 + (i + 1) * 0.875, 0.56, 2.2, '#ffffff']);
		return boxGeometry(b, P16);
	});

export type KeyboardProps = {
	position: [number, number, number];
	rotationY?: number;
	t: number;
	// подсветка 0..1
	rgb?: number;
	// «печатает»: 0..1 — сколько клавиш вспыхивает (вспышки — функция t)
	typing?: number;
};
export const Keyboard: React.FC<KeyboardProps> = ({position, rotationY = 0, t, rgb = 1, typing = 0}) => {
	const keys = useMemo(kbKeys, []);
	const glowGeo = useMemo(() => kbGlow().clone(), []);
	const glowMat = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}), []);
	const keyMat = useMemo(() => new THREE.MeshLambertMaterial({vertexColors: true}), []);
	const k = clamp01(rgb);
	recolorBoxes(glowGeo, 16, (i, c) => (hueColor(rgbHue(t, i / 16), 1, 0.55, c).multiplyScalar(k), true));
	const step = Math.floor(t * 14);
	recolorBoxes(keys.geo, keys.count, (i, c) => {
		const hit = typing > 0 && hash3(i, step, 0, 61) < typing * 0.12;
		c.set(hit ? '#d8e8ff' : '#202128');
		if (!hit && k > 0) c.lerp(hueColor(rgbHue(t, (i % KB_COLS) / KB_COLS)), 0.12 * k);
		return true;
	});
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={kbBase()} material={vcMat()} />
			<mesh geometry={glowGeo} material={glowMat} />
			<mesh geometry={keys.geo} material={keyMat} />
		</group>
	);
};

// ---------- мышь и коврик ----------
export const Mouse: React.FC<{position: [number, number, number]; rotationY?: number; t?: number; rgb?: number; click?: number}> = ({position, rotationY = 0, t = 0, rgb = 1, click = 0}) => {
	const glow = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false}), []);
	hueColor(rgbHue(t, 0.5), 1, 0.55, glow.color).multiplyScalar(clamp01(rgb));
	const geo = cachedGeo('mouse', () =>
		boxGeometry(
			[
				[-1.1, 0, -1.9, 1.1, 0.9, 1.6, '#16171c'],
				[-0.9, 0.9, -1.5, 0.9, 1.25, 1.0, '#1c1d24'],
				[-0.15, 0.95, 0.4, 0.15, 1.3, 1.5, '#3a3b44'],
			],
			P16,
		),
	);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={geo} material={vcMat()} position={[0, -clamp01(click) * 0.1 * P16, 0]} />
			<mesh material={glow} position={[0, 0.5 * P16, -1.95 * P16]}>
				<boxGeometry args={[1.4 * P16, 0.3 * P16, 0.1 * P16]} />
			</mesh>
		</group>
	);
};

export const Mousepad: React.FC<{position: [number, number, number]; rotationY?: number; t?: number; rgb?: number}> = ({position, rotationY = 0, t = 0, rgb = 1}) => {
	const glow = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false}), []);
	hueColor(rgbHue(t, 0.7), 0.8, 0.5, glow.color).multiplyScalar(0.4 + 0.6 * clamp01(rgb));
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh material={vcMat()} geometry={cachedGeo('pad', () => boxGeometry([[-5, 0, -3.8, 5, 0.18, 3.8, '#15151b']], P16))} />
			<mesh material={glow} position={[0, 0.1 * P16, 3.85 * P16]}>
				<boxGeometry args={[10 * P16, 0.16 * P16, 0.12 * P16]} />
			</mesh>
			<mesh material={glow} position={[5.05 * P16, 0.1 * P16, 0]}>
				<boxGeometry args={[0.12 * P16, 0.16 * P16, 7.6 * P16]} />
			</mesh>
		</group>
	);
};

// ---------- микрофон, лампа, подставка для наушников ----------
export const Microphone: React.FC<{position: [number, number, number]; rotationY?: number; glow?: number}> = ({position, rotationY = 0, glow = 0.5}) => {
	const ring = useMemo(() => new THREE.MeshBasicMaterial({color: '#9a6aff', toneMapped: false}), []);
	ring.color.set('#30204a').lerp(new THREE.Color('#b08aff'), clamp01(glow));
	const geo = cachedGeo('mic', () =>
		boxGeometry(
			[
				[-1.4, 0, -1.4, 1.4, 0.4, 1.4, '#1a1b20'],
				[-0.25, 0.4, -0.25, 0.25, 3.2, 0.25, '#3a3b44'],
				[-0.9, 3.0, -0.9, 0.9, 6.6, 0.9, '#22232a'],
				[-0.95, 3.6, -0.95, 0.95, 6.0, 0.95, '#3c3e48'],
			],
			P16,
		),
	);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<group rotation={[0.25, 0, 0]}>
				<mesh geometry={geo} material={vcMat()} />
				<mesh material={ring} position={[0, 3.3 * P16, 0]}>
					<boxGeometry args={[2.0 * P16, 0.25 * P16, 2.0 * P16]} />
				</mesh>
			</group>
		</group>
	);
};

export const DeskLamp: React.FC<{position: [number, number, number]; rotationY?: number; on?: number}> = ({position, rotationY = 0, on = 1}) => {
	const bulb = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false}), []);
	const k = clamp01(on);
	bulb.color.set('#3a3020').lerp(new THREE.Color('#fff0c8'), k);
	const base = cachedGeo('lamp-base', () =>
		boxGeometry(
			[
				[-1.6, 0, -1.6, 1.6, 0.6, 1.6, '#24252c'],
				[-0.3, 0.6, -0.3, 0.3, 1.4, 0.3, '#b08a4a'],
			],
			P16,
		),
	);
	const arm = cachedGeo('lamp-arm', () => boxGeometry([[-0.25, 0, -0.25, 0.25, 6.5, 0.25, '#2a2b33']], P16));
	const shade = cachedGeo('lamp-shade', () =>
		boxGeometry(
			[
				[-1.4, -1.2, -1.4, 1.4, 0.4, 1.4, '#3a3d48'],
				[-0.9, 0.4, -0.9, 0.9, 0.9, 0.9, '#3a3d48'],
			],
			P16,
		),
	);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={base} material={vcMat()} />
			<group position={[0, 1.3 * P16, 0]} rotation={[0.45, 0, 0]}>
				<mesh geometry={arm} material={vcMat()} />
				<group position={[0, 6.4 * P16, 0]} rotation={[-1.25, 0, 0]}>
					<mesh geometry={arm} material={vcMat()} scale={[1, 0.85, 1]} />
					<group position={[0, 5.6 * P16, 0]} rotation={[1.9, 0, 0]}>
						<mesh geometry={shade} material={vcMat()} />
						<mesh material={bulb} position={[0, -1.15 * P16, 0]}>
							<boxGeometry args={[1.6 * P16, 0.2 * P16, 1.6 * P16]} />
						</mesh>
						{k > 0.01 ? <Glow position={[0, -0.12, 0]} color="#ffcf80" size={1.3} opacity={0.4 * k} /> : null}
					</group>
				</group>
			</group>
		</group>
	);
};

// высота верха подставки (крючок для оголовья), блоки
export const STAND_TOP = 10.5 * P16;
// центр «головы» наушников, висящих на подставке, относительно низа подставки
export const STAND_HEADPHONES_Y = STAND_TOP - 5.2 * (1.875 / 32);

export const HeadphoneStand: React.FC<{position: [number, number, number]; rotationY?: number; headphones?: boolean; glow?: number}> = ({position, rotationY = 0, headphones = true, glow = 0.5}) => {
	const geo = cachedGeo('hp-stand', () =>
		boxGeometry(
			[
				[-2, 0, -1.6, 2, 0.5, 1.6, '#1a1b20'],
				[-0.4, 0.5, -0.4, 0.4, 10, 0.4, '#2a2b33'],
				[-2.2, 10, -0.6, 2.2, 10.5, 0.6, '#2a2b33'],
				[-1.2, 0.5, -0.9, 1.2, 0.7, 0.9, '#7a52c8'],
			],
			P16,
		),
	);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={geo} material={vcMat()} />
			{headphones ? <Headphones position={[0, STAND_HEADPHONES_Y, 0]} glow={glow} /> : null}
		</group>
	);
};
