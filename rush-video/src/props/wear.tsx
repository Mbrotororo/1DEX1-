import React, {useMemo} from 'react';
import * as THREE from 'three';
import {PX} from '../core/chars/Humanoid';
import {Glow} from '../core/chars/extras';
import {clamp01} from '../core/anim';
import {hash1} from '../core/rng';
import {Bx, boxGeometry, cachedGeo, P16, vcMat} from './kit';

// То, что носит герой: шапка, рюкзак, наушники; и то, что вылетает из рюкзака: книги и тетради.
// Шапка/рюкзак/наушники построены в пикселях СКИНА (PX = 1.875/32 блока), чтобы сесть ровно на модель игрока:
//  - headSlot (Humanoid): начало — центр головы, единицы — блоки, голова 8×8×8 px (±4 px от центра);
//  - backSlot (Humanoid): начало — центр задней стороны торса, оси персонажа (x — влево, y — вверх, z — вперёд),
//    торс 8×12×4 px: спина — z = 0, грудь — z = +4, плечи — y = +6.

// ---------- шапка ----------
const CUFF = '#34265a';
const RIB = '#271c46';
const KNIT = '#5b4592';
const KNIT_L = '#7a63b8';
const TOP = '#4c3884';
const POM = '#e4dcf4';

const beanieGeo = () =>
	cachedGeo('beanie', () => {
		const b: Bx[] = [
			// отворот с рубчиком
			[-4.95, 0.7, -4.95, 4.95, 2.9, 4.95, CUFF],
			// тулья, полоска, макушка
			[-4.7, 2.9, -4.7, 4.7, 3.8, 4.7, KNIT, 0.06],
			[-4.72, 3.8, -4.72, 4.72, 4.4, 4.72, KNIT_L],
			[-4.7, 4.4, -4.7, 4.7, 5.5, 4.7, KNIT, 0.06],
			[-4.1, 5.5, -4.1, 4.1, 6.2, 4.1, TOP],
			[-3.0, 6.2, -3.0, 3.0, 6.5, 3.0, TOP],
			// помпон
			[-1.7, 6.4, -1.7, 1.7, 9.0, 1.7, POM, 0.08],
			[-2.1, 6.9, -1.2, 2.1, 8.5, 1.2, POM],
			[-1.2, 6.9, -2.1, 1.2, 8.5, 2.1, POM],
		];
		// рубчик по отвороту: выступающие полоски на четырёх сторонах
		for (let i = -4; i <= 4; i += 1.6) {
			b.push([i - 0.35, 0.7, 4.95, i + 0.35, 2.9, 5.1, RIB]);
			b.push([i - 0.35, 0.7, -5.1, i + 0.35, 2.9, -4.95, RIB]);
			b.push([4.95, 0.7, i - 0.35, 5.1, 2.9, i + 0.35, RIB]);
			b.push([-5.1, 0.7, i - 0.35, -4.95, 2.9, i + 0.35, RIB]);
		}
		return boxGeometry(b, 1, 21);
	});

// снег на шапке: кусочки на макушке, помпоне и отвороте; показываются по порогу snow
const SNOW_BITS: Bx[] = [
	[-3.8, 6.2, -3.6, 0.4, 6.6, 0.8, '#f4f8ff'],
	[0.6, 6.2, -1.2, 3.6, 6.7, 3.0, '#ffffff'],
	[-3.2, 6.2, 1.4, -0.4, 6.55, 3.8, '#eef4fc'],
	[-1.6, 9.0, -1.6, 1.4, 9.5, 1.5, '#ffffff'],
	[-4.5, 5.5, 2.2, -2.2, 5.85, 4.5, '#f4f8ff'],
	[2.4, 5.5, -4.5, 4.4, 5.8, -2.0, '#eef4fc'],
	[-4.9, 2.9, -2.0, -2.5, 3.2, 2.6, '#ffffff'],
	[1.0, 2.9, 4.2, 4.6, 3.15, 4.95, '#f4f8ff'],
	[-1.4, 5.5, -4.5, 1.2, 5.8, -3.6, '#ffffff'],
	[3.6, 2.9, -4.9, 4.95, 3.2, -1.5, '#eef4fc'],
];
const snowGeo = (count: number) => cachedGeo(`beanie-snow-${count}`, () => boxGeometry(SNOW_BITS.slice(0, count), 1));

export type BeanieProps = {
	// 'worn' — внутри headSlot (начало — центр головы); 'loose' — отдельный предмет, начало — центр шапки
	mode?: 'worn' | 'loose';
	position?: [number, number, number];
	rotation?: [number, number, number];
	// снег на шапке 0..1
	snow?: number;
	scale?: number;
};

export const Beanie: React.FC<BeanieProps> = ({mode = 'worn', position, rotation, snow = 0, scale = 1}) => {
	const n = Math.round(clamp01(snow) * SNOW_BITS.length);
	const inner = (
		<>
			<mesh geometry={beanieGeo()} material={vcMat()} />
			{n > 0 ? <mesh geometry={snowGeo(n)} material={vcMat()} /> : null}
		</>
	);
	return (
		<group position={position} rotation={rotation} scale={PX * scale}>
			{mode === 'loose' ? <group position={[0, -4.2, 0]}>{inner}</group> : inner}
		</group>
	);
};

// ---------- рюкзак ----------
// синий рюкзак: читается и на фиолетовой рубашке, и на тёмном полу
const BAG = '#2f5378';
const BAG_D = '#22405e';
const ACC = '#1c2c40';
const ZIP = '#d8dce4';
const STRAP = '#16202c';

const bagGeo = () =>
	cachedGeo('backpack', () => {
		const b: Bx[] = [
			// корпус
			[-3.6, -5.0, -3.7, 3.6, 3.9, -0.3, BAG, 0.05],
			[-3.3, 3.9, -3.4, 3.3, 4.2, -0.6, BAG_D],
			// канты
			[-3.7, -5.1, -3.8, 3.7, -4.6, -0.2, BAG_D],
			[-3.75, -5.0, -3.75, -3.5, 3.9, -3.5, ACC],
			[3.5, -5.0, -3.75, 3.75, 3.9, -3.5, ACC],
			// передний карман с молнией
			[-2.7, -4.6, -4.7, 2.7, -0.4, -3.7, ACC, 0.04],
			[-2.75, -0.7, -4.8, 2.75, -0.35, -3.7, ZIP],
			[1.4, -1.6, -4.95, 2.1, -0.6, -4.7, '#e08a30'],
			// боковые карманы
			[3.6, -4.6, -3.0, 4.4, -1.4, -1.0, BAG_D],
			[-4.4, -4.6, -3.0, -3.6, -1.4, -1.0, BAG_D],
			// ручка сверху
			[-1.1, 4.2, -2.4, -0.6, 5.1, -1.6, STRAP],
			[0.6, 4.2, -2.4, 1.1, 5.1, -1.6, STRAP],
			[-1.1, 4.8, -2.4, 1.1, 5.2, -1.6, STRAP],
			// тёмная горловина (видна, когда клапан открыт)
			[-3.0, 4.15, -3.2, 3.0, 4.3, -0.8, '#0c0d12'],
		];
		return boxGeometry(b, 1, 23);
	});
const flapGeo = () =>
	cachedGeo('backpack-flap', () =>
		boxGeometry(
			[
				// клапан: шарнир у спины (z = 0 в своей группе), свисает к переду
				[-3.75, -0.6, -3.65, 3.75, 0.5, 0, BAG],
				[-3.75, -2.4, -3.95, 3.75, 0.5, -3.65, BAG],
				[-3.8, -2.6, -4.0, 3.8, -2.2, -3.6, ACC],
				[-0.5, -3.0, -4.15, 0.5, -1.8, -3.9, ZIP],
			],
			1,
		),
	);
// лямки на плечах — только в носке
const strapsGeo = () =>
	cachedGeo('backpack-straps', () => {
		const b: Bx[] = [];
		for (const s of [-1, 1]) {
			const x0 = s * 1.6 - 0.6;
			const x1 = s * 1.6 + 0.6;
			b.push([x0, 2.0, -0.65, x1, 6.65, -0.28, STRAP]);
			b.push([x0, 6.28, -0.65, x1, 6.68, 4.65, STRAP]);
			b.push([x0, -2.2, 4.28, x1, 6.68, 4.68, STRAP]);
			b.push([x0 - 0.1, -0.6, 4.6, x1 + 0.1, 0.1, 4.8, ZIP]);
		}
		return boxGeometry(b, 1);
	});

export type BackpackProps = {
	// 'worn' — внутри backSlot (начало — центр спины торса, рюкзак уходит в −z); 'loose' — начало — центр рюкзака
	mode?: 'worn' | 'loose';
	position?: [number, number, number];
	rotation?: [number, number, number];
	// открытие клапана 0..1
	open?: number;
	scale?: number;
};

export const Backpack: React.FC<BackpackProps> = ({mode = 'worn', position, rotation, open = 0, scale = 1}) => {
	const inner = (
		<>
			<mesh geometry={bagGeo()} material={vcMat()} />
			<group position={[0, 4.2, -0.4]} rotation={[clamp01(open) * 2.1, 0, 0]}>
				<mesh geometry={flapGeo()} material={vcMat()} />
			</group>
			{mode === 'worn' ? <mesh geometry={strapsGeo()} material={vcMat()} /> : null}
		</>
	);
	return (
		<group position={position} rotation={rotation} scale={PX * scale}>
			{mode === 'loose' ? <group position={[0, 0.4, 2.0]}>{inner}</group> : inner}
		</group>
	);
};

// ---------- наушники ----------
const HP = '#1c1c24';
const HP_L = '#2e2e3a';
const HP_ACC = '#7a52c8';

const headphonesGeo = () =>
	cachedGeo('headphones', () => {
		const b: Bx[] = [
			// оголовье над головой (поверх волос-шляпы ±4.5)
			[-3.6, 4.65, -0.9, 3.6, 5.45, 0.9, HP],
			[-3.4, 4.6, -0.6, 3.4, 4.7, 0.6, '#3a3a48'],
			[-4.8, 4.25, -0.9, -3.4, 5.25, 0.9, HP],
			[3.4, 4.25, -0.9, 4.8, 5.25, 0.9, HP],
			[-5.3, 1.6, -0.8, -4.55, 4.6, 0.8, HP_L],
			[4.55, 1.6, -0.8, 5.3, 4.6, 0.8, HP_L],
		];
		for (const s of [-1, 1]) {
			const x0 = s > 0 ? 4.55 : -6.3;
			const x1 = s > 0 ? 6.3 : -4.55;
			// чашка, амбушюра, фиолетовая накладка
			b.push([x0, -2.8, -2.1, x1, 1.8, 2.1, HP, 0.04]);
			b.push([s > 0 ? 4.5 : -4.75, -2.5, -1.8, s > 0 ? 4.75 : -4.5, 1.5, 1.8, '#2a2a30']);
			b.push([s > 0 ? 6.3 : -6.7, -2.2, -1.6, s > 0 ? 6.7 : -6.3, 1.2, 1.6, HP_ACC]);
		}
		// микрофон слева
		b.push([4.9, -2.6, 1.9, 5.5, -2.0, 4.8, HP_L]);
		b.push([4.6, -2.9, 4.6, 5.6, -1.8, 5.4, HP]);
		return boxGeometry(b, 1, 31);
	});
// светящиеся кольца на чашках
const ringGeo = () =>
	cachedGeo('headphones-ring', () => {
		const b: Bx[] = [];
		for (const s of [-1, 1]) {
			const x0 = s > 0 ? 6.68 : -6.78;
			const x1 = s > 0 ? 6.78 : -6.68;
			b.push([x0, 0.8, -1.4, x1, 1.1, 1.4, '#b088ff']);
			b.push([x0, -2.1, -1.4, x1, -1.8, 1.4, '#b088ff']);
			b.push([x0, -1.8, -1.4, x1, 0.8, -1.1, '#b088ff']);
			b.push([x0, -1.8, 1.1, x1, 0.8, 1.4, '#b088ff']);
		}
		return boxGeometry(b, 1);
	});

export type HeadphonesProps = {
	// начало — центр головы (как headSlot); вне персонажа — тоже «центр головы» (см. HEADPHONES_ON_STAND)
	position?: [number, number, number];
	rotation?: [number, number, number];
	// подсветка колец 0..1
	glow?: number;
	scale?: number;
};

export const Headphones: React.FC<HeadphonesProps> = ({position, rotation, glow = 0.6, scale = 1}) => {
	const ring = useMemo(() => new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}), []);
	ring.color.setScalar(0.35 + glow * 0.65);
	return (
		<group position={position} rotation={rotation} scale={PX * scale}>
			<mesh geometry={headphonesGeo()} material={vcMat()} />
			<mesh geometry={ringGeo()} material={ring} />
			{glow > 0.05
				? [-1, 1].map((s) => <Glow key={s} position={[s * 7.2, -0.5, 0]} color="#9a6aff" size={9 * glow} opacity={0.35 * glow} />)
				: null}
		</group>
	);
};

// ---------- книги и тетради ----------
const BOOK_COLORS = ['#8a2a26', '#2a4a8a', '#2e6a3a', '#b08a2a', '#5a2e7a', '#1e5a6a'];

export type BookProps = {
	position?: [number, number, number];
	rotation?: [number, number, number];
	// цвет обложки (по умолчанию — из набора по seed)
	color?: string;
	seed?: number;
	// раскрытие обложки 0..1 (книга «хлопает» в полёте)
	open?: number;
	// тетрадь (тонкая, на пружине) вместо книги
	notebook?: boolean;
	scale?: number;
};

// Книга/тетрадь: начало — центр. Размер ~0.31×0.44 блока (как в руке героя), лежит в плоскости XY, корешок слева (−x).
export const Book: React.FC<BookProps> = ({position, rotation, color, seed = 0, open = 0, notebook = false, scale = 1}) => {
	const cover = color ?? BOOK_COLORS[Math.floor(hash1(seed, 13) * BOOK_COLORS.length)];
	const th = notebook ? 0.7 : 1.5;
	const key = `book-${cover}-${notebook}`;
	const body = cachedGeo(key, () => {
		const b: Bx[] = [
			[-2.5, -3.5, -th / 2, 2.5, 3.5, -th / 2 + 0.25, cover],
			[-2.35, -3.3, -th / 2 + 0.25, 2.4, 3.3, th / 2 - 0.1, '#ece4d2'],
			[-2.55, -3.5, -th / 2, -2.3, 3.5, th / 2, cover],
		];
		if (notebook) for (let y = -3; y <= 3; y += 0.8) b.push([-2.85, y - 0.2, -0.45, -2.45, y + 0.2, 0.45, '#9aa0a8']);
		else b.push([-2.6, 2.2, -th / 2, -2.25, 2.6, th / 2, '#d8b860']);
		return boxGeometry(b, 1);
	});
	const lid = cachedGeo(`${key}-lid`, () => {
		const b: Bx[] = [[0, -3.5, 0, 5, 3.5, 0.25, cover]];
		if (!notebook) b.push([1.2, 0.5, 0.25, 3.8, 1.2, 0.32, '#d8b860']);
		else b.push([1.0, 1.5, 0.25, 4.0, 2.6, 0.3, '#f0ece0']);
		return boxGeometry(b, 1);
	});
	return (
		<group position={position} rotation={rotation} scale={P16 * scale}>
			<mesh geometry={body} material={vcMat()} />
			<group position={[-2.5, 0, th / 2 - 0.25]} rotation={[0, -clamp01(open) * 2.4, 0]}>
				<mesh geometry={lid} material={vcMat()} />
			</group>
		</group>
	);
};
