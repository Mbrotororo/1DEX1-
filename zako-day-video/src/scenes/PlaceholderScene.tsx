import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Line} from '../lib/timeline';
import {Outline} from '../ui/kit';

// Заглушка для сцен, которые ещё не нарисованы
export const PlaceholderScene: React.FC<{line: Line}> = ({line}) => (
	<AbsoluteFill style={{background: 'linear-gradient(#2b2140, #121018)', alignItems: 'center', paddingTop: 420}}>
		<Outline size={64}>сцена «{line.scene}»</Outline>
		<Outline size={44} weight={500} style={{marginTop: 24, opacity: 0.7}}>
			в работе
		</Outline>
	</AbsoluteFill>
);
