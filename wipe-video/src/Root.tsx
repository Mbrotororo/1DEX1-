import React from 'react';
import {sceneComposition} from './core/player';
import {scene as demo} from './scenes/_demo';
import {ALL_SCENES} from './scenes/registry';
import {wipeVideoComposition} from './WipeVideo';

// «WipeVideo» — весь ролик; плюс по композиции на каждую сцену (id = id сцены, время локальное)
// и «demo» — испытательный стенд ядра.
export const RemotionRoot: React.FC = () => {
	return (
		<>
			{wipeVideoComposition()}
			{ALL_SCENES.map((s) => sceneComposition(s))}
			{sceneComposition(demo)}
		</>
	);
};
