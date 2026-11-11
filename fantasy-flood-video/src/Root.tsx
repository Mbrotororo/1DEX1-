import React from 'react';
import {Composition} from 'remotion';
import {FloodVideo} from './FloodVideo';
import {DURATION_S, FPS, HEIGHT, WIDTH} from './lib/timeline';
import {AdminChat} from './admin-chat/AdminChat';
import * as AC from './admin-chat/script';
import {NeSveti} from './sunflower/NeSveti';
import * as NS from './sunflower/story';

export const RemotionRoot: React.FC = () => {
	return (
		<>
		<Composition
			id="FloodVideo"
			component={FloodVideo}
			durationInFrames={DURATION_S * FPS}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
		/>
		<Composition
			id="AdminChat"
			component={AdminChat}
			durationInFrames={AC.DURATION_S * AC.FPS}
			fps={AC.FPS}
			width={AC.WIDTH}
			height={AC.HEIGHT}
		/>
		<Composition
			id="NeSveti"
			component={NeSveti}
			durationInFrames={NS.DURATION_S * NS.FPS}
			fps={NS.FPS}
			width={NS.WIDTH}
			height={NS.HEIGHT}
		/>
		</>
	);
};
