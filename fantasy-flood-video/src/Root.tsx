import React from 'react';
import {Composition} from 'remotion';
import {FloodVideo} from './FloodVideo';
import {DURATION_S, FPS, HEIGHT, WIDTH} from './lib/timeline';

export const RemotionRoot: React.FC = () => {
	return (
		<Composition
			id="FloodVideo"
			component={FloodVideo}
			durationInFrames={DURATION_S * FPS}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
		/>
	);
};
