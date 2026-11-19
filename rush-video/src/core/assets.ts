import {useEffect, useState} from 'react';
import {staticFile, useDelayRender} from 'remotion';
import {imageSkin} from './chars/skins';
import type {Assets} from './scene';
import {imageTexture} from './textures';
import {getAtlas} from './voxel/atlas';

const loadImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
		img.src = src;
	});

// Pixelify Sans с починенной кириллицей (см. scripts/patch-font.py): два статических начертания
const FONT_FILES: [file: string, weight: string][] = [
	['fonts/pixelify-sans-ru-500.woff2', '400 599'],
	['fonts/pixelify-sans-ru-700.woff2', '600 700'],
];

const loadFonts = async () => {
	const faces = FONT_FILES.map(([file, weight]) => new FontFace('Pixelify Sans', `url(${staticFile(file)}) format('woff2')`, {weight, style: 'normal'}));
	const loaded = await Promise.all(faces.map((f) => f.load()));
	for (const f of loaded) (document.fonts as unknown as {add: (face: FontFace) => void}).add(f);
};

// Скин, логотип и шрифт грузим до создания 3D-сцены, чтобы уже на первом кадре всё было на месте.
export const useAssets = (): Assets | null => {
	const [assets, setAssets] = useState<Assets | null>(null);
	const {delayRender, continueRender, cancelRender} = useDelayRender();
	const [handle] = useState(() => delayRender('Загрузка скина, логотипа и шрифта'));

	useEffect(() => {
		const holyworldUrl = staticFile('holyworld.png');
		Promise.all([loadImage(staticFile('skin.png')), loadImage(holyworldUrl), loadFonts()])
			.then(([skin, holyworld]) => {
				// атлас блоков собираем заранее, а не посреди первого кадра
				getAtlas();
				setAssets({
					skin: imageSkin(imageTexture(skin, true), 'slim'),
					holyworld: imageTexture(holyworld, false),
					holyworldUrl,
				});
			})
			.catch((err) => cancelRender(err));
	}, [cancelRender]);

	useEffect(() => {
		if (assets) continueRender(handle);
	}, [assets, continueRender, handle]);

	return assets;
};
