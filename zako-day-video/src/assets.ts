import {useEffect, useState} from 'react';
import {staticFile, useDelayRender} from 'remotion';
import {createTextures, makeBlockMaterials, type BlockMaterials, type Textures} from './lib/blocks';
import {makeSkinSet, type SkinSet} from './lib/faces';

export type Assets = {
	zako: SkinSet;
	idex: SkinSet;
	tex: Textures;
	mat: BlockMaterials;
};

const loadImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
		img.src = src;
	});

// Скины, шрифты и текстуры грузим один раз до первого кадра
export const useAssets = () => {
	const [assets, setAssets] = useState<Assets | null>(null);
	const {delayRender, continueRender, cancelRender} = useDelayRender();
	const [handle] = useState(() => delayRender('Загрузка скинов и шрифтов'));

	useEffect(() => {
		Promise.all([
			loadImage(staticFile('skins/zako.png')),
			loadImage(staticFile('skins/1dex1.png')),
			document.fonts.load('900 64px Rubik', 'АБВ abc'),
			document.fonts.load('700 64px Rubik', 'АБВ abc'),
			document.fonts.load('500 64px Rubik', 'АБВ abc'),
		])
			.then(([zako, idex]) => {
				const tex = createTextures();
				setAssets({
					zako: makeSkinSet(zako, 'zako'),
					idex: makeSkinSet(idex, 'idex'),
					tex,
					mat: makeBlockMaterials(tex),
				});
			})
			.catch((err) => cancelRender(err));
	}, [cancelRender]);

	useEffect(() => {
		if (assets) continueRender(handle);
	}, [assets, continueRender, handle]);

	return assets;
};
