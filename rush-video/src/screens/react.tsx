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
	// мип-уровни: нужны, когда экран на кадре мельче холста (общий план) — без них текст «рябит».
	// Стоят ~60 мс на кадр при 1280x720; на крупном плане можно выключить
	mipmaps?: boolean;
};

// Холст + THREE.CanvasTexture (один на компонент), перерисовывается каждый кадр функцией draw(t).
// Отдай результат в <Monitor screen={tex} /> или в map своего материала (toneMapped: false).
// Вызывать ВНУТРИ 3D-сцены (World): хук сам перерисует 3D-кадр, когда догрузятся шрифт и картинки.
export const useScreenTexture = (draw: ScreenDraw, t: number, opts: ScreenTextureOpts = {}): THREE.CanvasTexture => {
	const {width = 1280, height = 720, anisotropy = 4, mipmaps = true} = opts;
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
		tex.generateMipmaps = mipmaps;
		tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		return {canvas, ctx, tex};
	}, [width, height, anisotropy, mipmaps]);
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

// Узор строк развёртки (1x3 px: тёмная строка + две прозрачные)
const scanPattern = (ctx: CanvasRenderingContext2D) => {
	const c = document.createElement('canvas');
	c.width = 3;
	c.height = 3;
	const g = c.getContext('2d')!;
	g.fillStyle = 'rgba(0,0,0,0.16)';
	g.fillRect(0, 0, 3, 1);
	g.fillStyle = 'rgba(255,255,255,0.03)';
	g.fillRect(0, 1, 1, 2);
	return ctx.createPattern(c, 'repeat')!;
};

// Эффекты стекла поверх картинки экрана (всё в том же холсте — дешевле слоёв DOM):
// свечение ярких мест, строки, блик и затемнение к краям
const screenFx = (ctx: CanvasRenderingContext2D, small: HTMLCanvasElement, pattern: CanvasPattern, glow: number, scan: number) => {
	const {width: w, height: h} = ctx.canvas;
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	if (glow > 0) {
		ctx.globalCompositeOperation = 'screen';
		ctx.globalAlpha = 0.28 * glow;
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(small, 0, 0, w, h);
	}
	ctx.globalCompositeOperation = 'source-over';
	if (scan > 0) {
		ctx.globalAlpha = Math.min(1, scan);
		ctx.fillStyle = pattern;
		ctx.fillRect(0, 0, w, h);
	}
	ctx.globalAlpha = 1;
	const glass = ctx.createLinearGradient(0, 0, w, h * 0.9);
	glass.addColorStop(0, 'rgba(255,255,255,0.07)');
	glass.addColorStop(0.3, 'rgba(255,255,255,0.015)');
	glass.addColorStop(0.55, 'rgba(255,255,255,0)');
	glass.addColorStop(1, 'rgba(255,255,255,0.03)');
	ctx.fillStyle = glass;
	ctx.fillRect(0, 0, w, h);
	const edge = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, w * 0.62);
	edge.addColorStop(0, 'rgba(0,0,0,0)');
	edge.addColorStop(1, 'rgba(0,0,0,0.3)');
	ctx.fillStyle = edge;
	ctx.fillRect(0, 0, w, h);
	ctx.restore();
};

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
	const spillRef = useRef<HTMLCanvasElement>(null);
	// промежуточные холсты для ореола: 320x180 -> 40x22
	const aux = useMemo(() => {
		const mid = document.createElement('canvas');
		mid.width = 320;
		mid.height = 180;
		const small = document.createElement('canvas');
		small.width = 40;
		small.height = 22;
		return {mid, small, pattern: null as CanvasPattern | null};
	}, []);
	const W = Math.round(resolution);
	const H = Math.round((resolution * 9) / 16);
	useLayoutEffect(() => {
		if (!ok || !screenRef.current || !spillRef.current) return;
		const c = screenRef.current;
		const ctx = c.getContext('2d')!;
		paintScreen(ctx, draw, t);
		// уменьшаем в два шага (мягко и дёшево); растягивает уже браузер/холст
		const m = aux.mid.getContext('2d')!;
		m.imageSmoothingEnabled = true;
		m.imageSmoothingQuality = 'high';
		m.drawImage(c, 0, 0, aux.mid.width, aux.mid.height);
		const s = aux.small.getContext('2d')!;
		s.imageSmoothingEnabled = true;
		s.imageSmoothingQuality = 'high';
		s.clearRect(0, 0, aux.small.width, aux.small.height);
		s.drawImage(aux.mid, 0, 0, aux.small.width, aux.small.height);
		const sp = spillRef.current.getContext('2d')!;
		sp.clearRect(0, 0, spillRef.current.width, spillRef.current.height);
		sp.drawImage(aux.small, 0, 0);
		if (!aux.pattern) aux.pattern = scanPattern(ctx);
		screenFx(ctx, aux.small, aux.pattern, glow, scanlines);
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
	const flat = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${zoom.toFixed(4)})`;
	const tilted = tilt[0] === 0 && tilt[1] === 0 ? flat : `${flat} perspective(${(2600 / zoom).toFixed(1)}px) rotateY(${tilt[0].toFixed(3)}deg) rotateX(${tilt[1].toFixed(3)}deg)`;
	const box: React.CSSProperties = {position: 'absolute', left: (1920 - sw) / 2, top: (1080 - sh) / 2, width: sw, height: sh, transformOrigin: '50% 50%'};

	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: 1920,
				height: 1080,
				overflow: 'hidden',
				opacity,
				backgroundColor: background,
				// тёплый полумрак комнаты
				backgroundImage: 'radial-gradient(ellipse 70% 60% at 50% 55%, rgba(90,60,40,0.35), rgba(0,0,0,0) 70%)',
			}}
		>
			{/* отсвет экрана вокруг монитора: крошечная картинка экрана, растянутая браузером */}
			<div style={{...box, transform: flat}}>
				<canvas ref={spillRef} width={40} height={22} style={{position: 'absolute', left: -sw * 0.2, top: -sh * 0.24, width: sw * 1.4, height: sh * 1.48, opacity: 0.5 * glow * br}} />
			</div>
			<div style={{...box, transform: tilted}}>
				{/* корпус-рамка */}
				<div
					style={{
						position: 'absolute',
						left: -BEZEL,
						top: -BEZEL,
						width: sw + BEZEL * 2,
						height: sh + BEZEL * 2,
						borderRadius: 16,
						background: 'linear-gradient(160deg, #2a2a30 0%, #131316 45%, #0a0a0c 100%)',
					}}
				/>
				{/* экран со всеми эффектами стекла */}
				<canvas ref={screenRef} width={W} height={H} style={{position: 'absolute', left: 0, top: 0, width: sw, height: sh, filter: br < 1 ? `brightness(${br})` : undefined}} />
			</div>
			{/* виньетка кадра */}
			<div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, background: 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'}} />
		</div>
	);
};
