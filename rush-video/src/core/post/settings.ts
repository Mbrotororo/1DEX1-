// Настройки «киношного» вида (постобработка). ЧИСТЫЙ модуль: только данные и арифметика.
// Сцена задаёт их функцией времени: scene.post = (t, cam) => PostSettings.

import {clamp01, lerp, mixHex, type Vec3} from '../anim';
import type {CameraState} from '../camera';

export type PostSettings = {
	// --- глубина резкости ---
	// расстояние до плоскости фокуса, блоки (по оси взгляда камеры); см. focusDist()
	focus: number;
	// размытие фона на бесконечности, пиксели при 1080p (0 — без размытия). 8 — мягко, 16 — сильно, 24 — максимум
	dof: number;
	// ширина зоны полной резкости вокруг фокуса, блоки
	focusRange: number;
	// размытие переднего плана относительно фона (0..1.5): 1 — физично, 0 — передний план всегда резкий
	nearBlur: number;

	// --- свечение ярких мест (линейная яркость 0..1+) ---
	// сила свечения (0 — выкл.; 0.6 — заметно; 1.2 — сильно)
	bloom: number;
	// порог яркости: светится то, что ярче (0.55..0.85 для тёмных интерьеров)
	bloomThreshold: number;
	// ширина ореола 0..1
	bloomRadius: number;

	// --- кадр ---
	// затемнение краёв 0..1 и мягкость перехода 0..1
	vignette: number;
	vignetteSoft: number;
	// плёночное зерно 0..1 (детерминированное, от времени кадра)
	grain: number;
	// хроматическая аберрация по краям кадра, пиксели при 1080p (0 — выкл.)
	chroma: number;
	// смаз движения (вжух-панорама): длина, пиксели при 1080p; направление, радианы (0 — по горизонтали)
	smear: number;
	smearAngle: number;

	// --- цвет ---
	// экспозиция, ступени (EV): +1 — вдвое ярче
	exposure: number;
	// контраст (1 — как есть), насыщенность (1 — как есть)
	contrast: number;
	saturation: number;
	// баланс белого: тепло (+) / холод (−), −1..1; оттенок: пурпур (+) / зелень (−)
	warmth: number;
	tint: number;
	// «тил-оранж»: тени в бирюзу, света в оранжевый, 0..1
	split: number;
	// подъём теней (−0.1..0.1), гамма средних (1 — как есть, >1 светлее), усиление светов (1 — как есть)
	lift: number;
	gamma: number;
	gain: number;

	// --- вспышка ---
	// 0..1: заливка цветом поверх всего 3D (склейки, шок)
	flash: number;
	flashColor: string;
};

// Нейтральные значения: с ними картинка совпадает с картинкой без постобработки
export const POST_NEUTRAL: PostSettings = {
	focus: 6,
	dof: 0,
	focusRange: 1,
	nearBlur: 1,
	bloom: 0,
	bloomThreshold: 0.8,
	bloomRadius: 0.6,
	vignette: 0,
	vignetteSoft: 0.6,
	grain: 0,
	chroma: 0,
	smear: 0,
	smearAngle: 0,
	exposure: 0,
	contrast: 1,
	saturation: 1,
	warmth: 0,
	tint: 0,
	split: 0,
	lift: 0,
	gamma: 1,
	gain: 1,
	flash: 0,
	flashColor: '#ffffff',
};

// Собрать настройки: нейтральные + переопределения
export const post = (over: Partial<PostSettings> = {}): PostSettings => ({...POST_NEUTRAL, ...over});

// Готовые пресеты. Свои — {...POST.warmInterior, dof: 12}
export const POST = {
	// ничего (картинка как без постобработки)
	none: POST_NEUTRAL,
	// тёплый тёмный интерьер, общий/средний план: лёгкая резкость по глубине, свечение фонарей, виньетка, зерно
	warmInterior: post({
		focus: 7,
		dof: 6,
		focusRange: 2.5,
		bloom: 0.75,
		bloomThreshold: 0.62,
		bloomRadius: 0.65,
		vignette: 0.42,
		vignetteSoft: 0.7,
		grain: 0.28,
		exposure: 0.05,
		contrast: 1.12,
		saturation: 1.06,
		warmth: 0.32,
		split: 0.35,
		lift: -0.015,
		gamma: 1.02,
		gain: 1.02,
	}),
	// крупный план: сильно размытый фон, мягкое свечение, плотная виньетка
	closeUp: post({
		focus: 1.6,
		dof: 18,
		focusRange: 0.5,
		nearBlur: 0.8,
		bloom: 0.85,
		bloomThreshold: 0.55,
		bloomRadius: 0.75,
		vignette: 0.5,
		vignetteSoft: 0.75,
		grain: 0.3,
		chroma: 1.2,
		exposure: 0.08,
		contrast: 1.14,
		saturation: 1.05,
		warmth: 0.3,
		split: 0.4,
		lift: -0.01,
		gamma: 1.03,
		gain: 1.02,
	}),
	// экран ПК во весь кадр: холоднее, свечение экрана, лёгкая аберрация
	screenPOV: post({
		focus: 1,
		dof: 0,
		bloom: 0.55,
		bloomThreshold: 0.7,
		bloomRadius: 0.5,
		vignette: 0.35,
		vignetteSoft: 0.8,
		grain: 0.22,
		chroma: 1.6,
		contrast: 1.06,
		saturation: 1.04,
		warmth: -0.08,
		split: 0.15,
	}),
	// холодный дневной свет / улица в проёме двери
	coldDay: post({
		focus: 8,
		dof: 4,
		focusRange: 4,
		bloom: 0.5,
		bloomThreshold: 0.75,
		bloomRadius: 0.6,
		vignette: 0.3,
		grain: 0.22,
		contrast: 1.08,
		saturation: 0.92,
		warmth: -0.35,
		split: 0.25,
	}),
	// шок: жёсткий контраст, холоднее, сильная виньетка (флеш добавляет сцена: flash: impulse(...))
	shock: post({
		focus: 1.2,
		dof: 20,
		focusRange: 0.4,
		bloom: 1,
		bloomThreshold: 0.5,
		bloomRadius: 0.8,
		vignette: 0.65,
		vignetteSoft: 0.6,
		grain: 0.38,
		chroma: 3,
		exposure: 0.1,
		contrast: 1.28,
		saturation: 0.82,
		warmth: -0.1,
		split: 0.3,
		lift: -0.02,
	}),
	// радостный финал: теплее, ярче, насыщеннее
	happy: post({
		focus: 3,
		dof: 9,
		focusRange: 1.5,
		bloom: 0.9,
		bloomThreshold: 0.58,
		bloomRadius: 0.7,
		vignette: 0.35,
		grain: 0.24,
		exposure: 0.15,
		contrast: 1.1,
		saturation: 1.18,
		warmth: 0.38,
		split: 0.3,
		gamma: 1.04,
	}),
} satisfies Record<string, PostSettings>;

export type PostPresetName = keyof typeof POST;

// Смешать два набора настроек (k = 0 — a, 1 — b). Фокус смешивается в обратных расстояниях —
// перевод фокуса (rack focus) выглядит как у объектива.
export const mixPost = (a: PostSettings, b: PostSettings, k: number): PostSettings => {
	const t = clamp01(k);
	if (t <= 0) return a;
	if (t >= 1) return b;
	const out = {...a} as Record<string, number | string>;
	const A = a as unknown as Record<string, number | string>;
	const Bv = b as unknown as Record<string, number | string>;
	for (const key of Object.keys(A)) {
		const va = A[key];
		const vb = Bv[key];
		if (typeof va === 'number' && typeof vb === 'number') out[key] = lerp(va, vb, t);
		else if (typeof va === 'string' && typeof vb === 'string') out[key] = mixHex(va, vb, t);
	}
	out.focus = 1 / lerp(1 / Math.max(0.05, a.focus), 1 / Math.max(0.05, b.focus), t);
	return out as unknown as PostSettings;
};

// Настройки по ключам времени: postTrack(t, [[0, POST.warmInterior], [3, POST.closeUp]])
export const postTrack = (t: number, keys: [number, PostSettings][]): PostSettings => {
	if (keys.length === 0) return POST_NEUTRAL;
	if (t <= keys[0][0]) return keys[0][1];
	for (let i = 1; i < keys.length; i++) {
		if (t <= keys[i][0]) {
			const [t0, a] = keys[i - 1];
			const [t1, b] = keys[i];
			const k = (t - t0) / Math.max(1e-6, t1 - t0);
			return mixPost(a, b, k * k * (3 - 2 * k));
		}
	}
	return keys[keys.length - 1][1];
};

// Расстояние от камеры до точки по оси взгляда (то, что нужно в focus)
export const focusDist = (cam: CameraState, p: Vec3): number => {
	const f = cam.forward;
	const d = (p[0] - cam.position.x) * f.x + (p[1] - cam.position.y) * f.y + (p[2] - cam.position.z) * f.z;
	return Math.max(0.1, d);
};

// Перевод фокуса между двумя точками (k 0..1) — в обратных расстояниях, как у объектива
export const rackFocus = (cam: CameraState, from: Vec3, to: Vec3, k: number): number => {
	const a = 1 / focusDist(cam, from);
	const b = 1 / focusDist(cam, to);
	return 1 / lerp(a, b, clamp01(k));
};

// Размытие (пиксели при 1080p) у точки на расстоянии z — для подбора dof/focusRange
export const cocAt = (s: PostSettings, z: number): number => {
	const d = Math.max(0, Math.abs(z - s.focus) - s.focusRange * 0.5) / Math.max(0.05, z);
	return s.dof * Math.min(1, d) * (z < s.focus ? s.nearBlur : 1);
};
