import {useEffect, useState} from 'react';
import {staticFile, useDelayRender} from 'remotion';

// Ресурсы экранов ПК: шрифт Inter (интерфейсы Discord/OBS/рабочего стола), логотип HolyWorld и скин героя
// (аватар 1DEX1). Грузятся один раз на вкладку; пока не загружены — кадр не снимается (delayRender).

// Семейство шрифта интерфейсов. В canvas: ctx.font = `600 16px ${UI_FONT}`
export const UI_FONT = 'Inter';

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const WEIGHTS = [300, 400, 500, 600, 700];

export type ScreenAssets = {
	holyworld: HTMLImageElement;
	skin: HTMLImageElement;
};

let ready: ScreenAssets | null = null;
let pending: Promise<ScreenAssets> | null = null;

const loadImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
		img.src = src;
	});

const loadInter = async () => {
	const faces: FontFace[] = [];
	for (const w of WEIGHTS) {
		faces.push(new FontFace(UI_FONT, `url(${staticFile(`fonts/inter-latin-${w}-normal.woff2`)}) format('woff2')`, {weight: String(w), style: 'normal', unicodeRange: LATIN}));
		faces.push(new FontFace(UI_FONT, `url(${staticFile(`fonts/inter-cyrillic-${w}-normal.woff2`)}) format('woff2')`, {weight: String(w), style: 'normal', unicodeRange: CYRILLIC}));
	}
	const loaded = await Promise.all(faces.map((f) => f.load()));
	for (const f of loaded) (document.fonts as unknown as {add: (face: FontFace) => void}).add(f);
};

// Загрузить всё (повторный вызов вернёт тот же промис)
export const loadScreenAssets = (): Promise<ScreenAssets> => {
	if (!pending) {
		pending = Promise.all([loadImage(staticFile('holyworld.png')), loadImage(staticFile('skin.png')), loadInter()]).then(([holyworld, skin]) => {
			ready = {holyworld, skin};
			return ready;
		});
	}
	return pending;
};

// Уже загруженные ресурсы (null — ещё нет; функции рисования тогда пропускают картинки)
export const screenAssets = (): ScreenAssets | null => ready;

// Хук: держит кадр (delayRender), пока шрифт и картинки не загрузятся. true — можно рисовать.
export const useScreenAssets = (): boolean => {
	const [ok, setOk] = useState(ready !== null);
	const {delayRender, continueRender, cancelRender} = useDelayRender();
	const [handle] = useState(() => (ready ? null : delayRender('Экраны ПК: шрифт Inter и картинки')));
	useEffect(() => {
		if (handle === null) return;
		loadScreenAssets()
			.then(() => setOk(true))
			.catch((err) => cancelRender(err));
	}, [handle, cancelRender]);
	// отпускаем кадр только после того, как React перерисовал экран с загруженными ресурсами
	useEffect(() => {
		if (ok && handle !== null) continueRender(handle);
	}, [ok, handle, continueRender]);
	return ok;
};
