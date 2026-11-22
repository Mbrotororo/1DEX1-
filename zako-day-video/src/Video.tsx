import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {useAssets, type Assets} from './assets';
import {FPS, LINES, type Line} from './lib/timeline';
import {BedroomScene} from './scenes/BedroomScene';
import {PlaceholderScene} from './scenes/PlaceholderScene';
import {TitleScene} from './scenes/TitleScene';
import {Subtitles} from './ui/Subtitles';

// Какая сцена рисует какую реплику (ключ — поле scene в script.json)
const SCENES: Record<string, React.FC<{line: Line; assets: Assets}>> = {
	title: TitleScene,
	bedroom: BedroomScene,
};

export const ZakoDay: React.FC = () => {
	const assets = useAssets();
	return (
		<AbsoluteFill style={{backgroundColor: '#101418'}}>
			{assets
				? LINES.map((line) => {
						const Scene = SCENES[line.scene] ?? PlaceholderScene;
						return (
							<Sequence
								key={line.id}
								from={Math.round(line.start * FPS)}
								durationInFrames={Math.round((line.start + line.dur) * FPS) - Math.round(line.start * FPS)}
								name={line.id}
							>
								<Scene line={line} assets={assets} />
								<Sequence from={Math.round(line.voiceAt * FPS)} layout="none" name={`voice ${line.id}`}>
									<Audio src={staticFile(`voice/${line.id}.wav`)} volume={1} />
								</Sequence>
							</Sequence>
						);
					})
				: null}
			<Subtitles />
		</AbsoluteFill>
	);
};
