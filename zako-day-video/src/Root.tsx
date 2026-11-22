import React from 'react';
import {Composition} from 'remotion';
import {DURATION_S, FPS, HEIGHT, WIDTH} from './lib/timeline';
import {ZakoDay} from './Video';

export const RemotionRoot: React.FC = () => (
	<Composition
		id="ZakoDay"
		component={ZakoDay}
		durationInFrames={Math.ceil(DURATION_S * FPS)}
		fps={FPS}
		width={WIDTH}
		height={HEIGHT}
	/>
);
