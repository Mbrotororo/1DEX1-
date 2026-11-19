import {useThree} from '@react-three/fiber';
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import * as THREE from 'three';
import {noise1} from '../core/rng';
import {useScreenAssets} from './assets';
import {SH, SW, paintScreen, type ScreenDraw} from './draw';

// React-обёртки экранов: текстура для 3D-монитора и «экран во весь кадр» (POV) для DOM-слоя.

// ---------- 1. Текстура для монитора в 3D ----------
export type ScreenTextureOpts = {
	// размер холста, px (16:9). 1280x720 — чётко на крупном плане; на общем плане хватит 960x540
	width?: number;
	height?: number;
	// анизотропная фильтрация (монитор под углом)
	anisotropy?: number;
};

// Холст + THREE.CanvasTexture (один на компонент), перерисовывается каждый кадр функцией draw(t).
// Отдай результат в <Monitor screen={tex} /> или в map своего материала (toneMapped: false).
// Вызывать ВНУТРИ 3D-сцены (World): хук сам перерисует 3D-кадр, когда догрузятся шрифт и картинки.
export const useScreenTexture = (draw: ScreenDraw, t: number, opts: ScreenTextureOpts = {}): THREE.CanvasTexture => {
	const {width = 1280, height = 720, anisotropy = 4} = opts;
	const ok = useScreenAssets();
	const advance = useThree((s) => s.advance);
	const [readyAtMount] = useState(ok);
	const res = useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d')!;
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.anisotropy = anisotropy;
		tex.generateMipmaps = true;
		tex.minFilter = THREE.LinearMipmapLinearFilter;
		tex.magFilter = THREE.LinearFilter;
		return {canvas, ctx, tex};
	}, [width, height, anisotropy]);
	useLayoutEffect(() => () => res.tex.dispose(), [res]);
	// рисуем во время рендера: к моменту отрисовки 3D-кадра текстура уже готова
	useMemo(() => {
		if (!ok) return;
		paintScreen(res.ctx, draw, t);
		res.tex.needsUpdate = true;
	}, [ok, res, draw, t]);
	// 3D-холст рисуется только при смене кадра: если ресурсы догрузились позже первого кадра вкладки,
	// перерисовываем его сами, иначе на снимке останется пустой экран
	useEffect(() => {
		if (ok && !readyAtMount) advance(performance.now());
	}, [ok, readyAtMount, advance]);
	return res.tex;
};

// Простой экран-плоскость 16:9 (для проверок; в сцене ролика — Monitor из src/props/pc.tsx)
export const ScreenQuad: React.FC<{texture: THREE.Texture; width?: number; position?: [number, number, number]; rotation?: [number, number, number]; brightness?: number}> = ({
	texture,
	width = 1.2,
	position = [0, 0, 0],
	rotation = [0, 0, 0],
	brightness = 1,
}) => {
	const mat = useMemo(() => new THREE.MeshBasicMaterial({toneMapped: false}), []);
	if (mat.map !== texture) {
		mat.map = texture;
		mat.needsUpdate = true;
	}
	mat.color.setScalar(brightness);
	return (
		<mesh material={mat} position={position} rotation={rotation}>
			<planeGeometry args={[width, (width * 9) / 16]} />
		</mesh>
	);
};

// ---------- 2. Экран во весь кадр (DOM, Overlay) ----------
export type ScreenPOVProps = {
	draw: ScreenDraw;
	// время, которое получит draw (обычно локальное время сцены)
	t: number;
	// 1 — экран с рамкой почти во весь кадр; больше — наезд (до ~2)
	zoom?: number;
	// точка экрана, к которой едет камера при наезде (логические px 1280x720)
	focus?: [number, number];
	// наклон монитора, градусы: [поворот вбок, наклон вперёд]
	tilt?: [number, number];
	// «ручная» камера: амплитуда дрожания, px кадра
	shake?: number;
	// свечение экрана 0..1 (ореол на рамке и вокруг)
	glow?: number;
	// строки/пиксельная сетка 0..1
	scanlines?: number;
	// яркость экрана 0..1 (0 — выключен)
	brightness?: number;
	// прозрачность всего слоя
	opacity?: number;
	// ширина холста экрана, px (по умолчанию 1920 — как кадр)
	resolution?: number;
	// цвет фона вокруг монитора (комната)
	background?: string;
};

// Доля ширины кадра под экран при zoom = 1 и толщина рамки (px кадра)
const SCREEN_FRAC = 0.84;
const BEZEL = 18;

export const ScreenPOV: React.FC<ScreenPOVProps> = ({
	draw,
	t,
	zoom = 1,
	focus = [SW / 2, SH / 2],
	tilt = [2.5, 1.5],
	shake = 1,
	glow = 1,
	scanlines = 1,
	brightness = 1,
	opacity = 1,
	resolution = 1920,
	background = '#0b0705',
}) => {
	const ok = useScreenAssets();
	const screenRef = useRef<HTMLCanvasElement>(null);
	const glowRef = useRef<HTMLCanvasElement>(null);
	const glow2Ref = useRef<HTMLCanvasElement>(null);
	const mid = useMemo(() => {
		const c = document.createElement('canvas');
		c.width = 320;
		c.height = 180;
		return c;
	}, []);
	const W = Math.round(resolution);
	const H = Math.round((resolution * 9) / 16);
	useLayoutEffect(() => {
		if (!ok || !screenRef.current || !glowRef.current || !glow2Ref.current) return;
		const c = screenRef.current;
		paintScreen(c.getContext('2d')!, draw, t);
		// ореол: уменьшаем в два шага (дёшево и мягко), растягивает уже браузер
		const m = mid.getContext('2d')!;
		m.imageSmoothingEnabled = true;
		m.imageSmoothingQuality = 'high';
		m.drawImage(c, 0, 0, mid.width, mid.height);
		for (const el of [glowRef.current, glow2Ref.current]) {
			const g = el.getContext('2d')!;
			g.imageSmoothingEnabled = true;
			g.imageSmoothingQuality = 'high';
			g.clearRect(0, 0, el.width, el.height);
			g.drawImage(mid, 0, 0, el.width, el.height);
		}
	});

	// геометрия кадра 1920x1080
	const sw = 1920 * SCREEN_FRAC;
	const sh = (sw * 9) / 16;
	// точка фокуса относительно центра экрана, px кадра; при наезде она подтягивается к центру кадра
	const fx = (focus[0] / SW - 0.5) * sw;
	const fy = (focus[1] / SH - 0.5) * sh;
	const pull = Math.min(1, Math.max(0, (1 - 1 / zoom) * 1.6));
	const jx = noise1(t * 0.9, 151) * 3 * shake;
	const jy = noise1(t * 0.8, 152) * 2.2 * shake;
	const dx = -fx * zoom * pull + jx;
	const dy = -fy * zoom * pull + jy;
	const br = Math.max(0, Math.min(1, brightness));
	const transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) perspective(2600px) rotateY(${tilt[0].toFixed(3)}deg) rotateX(${tilt[1].toFixed(3)}deg) scale(${zoom.toFixed(4)})`;
	const abs: React.CSSProperties = {position: 'absolute', left: 0, top: 0, width: '100%', height: '100%'};

	return (
		<div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'hidden', background, opacity}}>
			{/* тёплый полумрак комнаты */}
			<div style={{...abs, background: 'radial-gradient(ellipse 70% 60% at 50% 55%, rgba(90,60,40,0.35), rgba(0,0,0,0) 70%)'}} />
			<div style={{position: 'absolute', left: (1920 - sw) / 2, top: (1080 - sh) / 2, width: sw, height: sh, transform, transformOrigin: '50% 50%'}}>
				{/* отсвет экрана вокруг монитора */}
				<canvas
					ref={glowRef}
					width={80}
					height={45}
					style={{position: 'absolute', left: -sw * 0.18, top: -sh * 0.2, width: sw * 1.36, height: sh * 1.4, opacity: 0.55 * glow * br, filter: 'blur(40px)'}}
				/>
				{/* корпус-рамка */}
				<div
					style={{
						position: 'absolute',
						left: -BEZEL,
						top: -BEZEL,
						width: sw + BEZEL * 2,
						height: sh + BEZEL * 2,
						borderRadius: 16,
						background: 'linear-gradient(160deg, #26262c 0%, #111114 45%, #0a0a0c 100%)',
						boxShadow: '0 30px 90px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
					}}
				/>
				{/* сам экран */}
				<canvas ref={screenRef} width={W} height={H} style={{position: 'absolute', left: 0, top: 0, width: sw, height: sh, borderRadius: 3, filter: br < 1 ? `brightness(${br})` : undefined}} />
				{/* свечение ярких мест поверх экрана */}
				<canvas
					ref={glow2Ref}
					width={80}
					height={45}
					style={{position: 'absolute', left: 0, top: 0, width: sw, height: sh, mixBlendMode: 'screen', opacity: 0.22 * glow * br, filter: 'blur(14px)'}}
				/>
				{/* строки и пиксельная сетка */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: sw,
						height: sh,
						opacity: 0.55 * scanlines,
						backgroundImage:
							'repeating-linear-gradient(to bottom, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px), repeating-linear-gradient(to right, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)',
					}}
				/>
				{/* стекло: блик и затемнение к краям */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: sw,
						height: sh,
						background:
							'linear-gradient(118deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.015) 32%, rgba(255,255,255,0) 55%, rgba(255,255,255,0.03) 100%), radial-gradient(ellipse 75% 75% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.28) 100%)',
					}}
				/>
			</div>
			{/* виньетка кадра */}
			<div style={{...abs, background: 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'}} />
		</div>
	);
};
