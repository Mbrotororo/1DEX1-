import {ThreeCanvas} from '@remotion/three';
import React, {useEffect, useState} from 'react';
import {AbsoluteFill, staticFile, useDelayRender} from 'remotion';
import {CAMERA_FOV} from './lib/camera';
import {createWorldTextures, imageTexture} from './lib/textures';
import {HEIGHT, WIDTH} from './lib/timeline';
import {Scene, type Assets} from './Scene';
import {Soundtrack} from './Soundtrack';

const loadImage = (src: string) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
		img.src = src;
	});

// Скин и логотип сервера грузим до создания 3D-сцены,
// чтобы уже на первом кадре всё было на месте.
const useAssets = () => {
	const [assets, setAssets] = useState<Assets | null>(null);
	const {delayRender, continueRender, cancelRender} = useDelayRender();
	const [handle] = useState(() => delayRender('Загрузка скина и логотипа'));

	useEffect(() => {
		Promise.all([loadImage(staticFile('skin.png')), loadImage(staticFile('holyworld.png'))])
			.then(([skin, holyworld]) => {
				setAssets({
					skin: imageTexture(skin, true),
					holyworld: imageTexture(holyworld, false),
					tex: createWorldTextures(),
				});
			})
			.catch((err) => cancelRender(err));
	}, [cancelRender]);

	useEffect(() => {
		if (assets) continueRender(handle);
	}, [assets, continueRender, handle]);

	return assets;
};

export const FloodVideo: React.FC = () => {
	const assets = useAssets();
	return (
		<AbsoluteFill style={{backgroundColor: '#05081e'}}>
			{assets ? (
				<ThreeCanvas
					width={WIDTH}
					height={HEIGHT}
					flat
					camera={{fov: CAMERA_FOV, near: 0.1, far: 1500}}
					gl={{antialias: true}}
				>
					<Scene assets={assets} />
				</ThreeCanvas>
			) : null}
			<Soundtrack />
		</AbsoluteFill>
	);
};
