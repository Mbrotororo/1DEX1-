import React from 'react';
import {sceneComposition} from './core/player';
import {scene as bench} from './scenes/_bench';
import {scene as blocks} from './scenes/_blocks';
import {scene as envs} from './scenes/_envs';
import {scene as example} from './scenes/_example';
import {scene as glyphs} from './scenes/_glyphs';
import {scene as poses} from './scenes/_poses';
import {ALL_SCENES} from './scenes/registry';
import {rushVideoComposition} from './RushVideo';

// «RushVideo» — весь ролик; плюс по композиции на каждую сцену (id = id сцены, время локальное).
// Служебные сцены ядра (в ролик не входят): example — минимальный образец,
// envs — окружения, poses — позы, blocks — витрина блоков, glyphs — шрифт, bench — замер скорости.
export const RemotionRoot: React.FC = () => {
	return (
		<>
			{rushVideoComposition()}
			{ALL_SCENES.map((s) => sceneComposition(s))}
			{[example, envs, poses, blocks, glyphs, bench].map((s) => sceneComposition(s))}
		</>
	);
};
