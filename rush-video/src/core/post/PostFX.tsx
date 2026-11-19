import {useFrame, useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useRef} from 'react';
import {getPipeline} from './pipeline';
import {postIsNeutral, type PostSettings} from './settings';

// Постобработка внутри общего ThreeCanvas. Берёт на себя отрисовку кадра (useFrame с приоритетом 1 —
// R3F тогда сам не рисует): один вызов advance() Remotion = один проход конвейера.
// Анимации тут нет: настройки приходят пропсами и зависят только от времени кадра.
// Нейтральные настройки (POST.none) — кадр рисуется напрямую, как без постобработки.
export const PostFX: React.FC<{settings: PostSettings; time: number; antialias?: boolean}> = ({settings, time, antialias = true}) => {
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);
	const camera = useThree((s) => s.camera);
	const cur = useRef({settings, time});
	useLayoutEffect(() => {
		cur.current = {settings, time};
	});
	// при выключении вернуть экранный слой на обычный слой three
	useLayoutEffect(() => () => getPipeline(gl, antialias).restoreHud(), [gl, antialias]);
	useFrame(() => {
		const p = getPipeline(gl, antialias);
		const s = cur.current.settings;
		if (postIsNeutral(s)) {
			p.restoreHud();
			gl.setRenderTarget(null);
			gl.render(scene, camera);
			return;
		}
		p.render(scene, camera, s, cur.current.time);
	}, 1);
	return null;
};
