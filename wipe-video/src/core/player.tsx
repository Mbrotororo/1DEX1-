import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useLayoutEffect} from 'react';
import {AbsoluteFill, Audio, Composition, Img, getRemotionEnvironment, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import * as THREE from 'three';
import {useAssets} from './assets';
import type {CameraState} from './camera';
import {PixelText} from './hud/dom';
import type {Assets, SceneDef} from './scene';
import {BADGE_FROM, BADGE_TO, DURATION_S, FPS, HEIGHT, SCENES, WIDTH, sceneAt} from '../timeline';

// Проигрыватель сцен: ОДИН ThreeCanvas на весь ролик. Маршрутизатор по времени выбирает
// сцену, ставит её камеру, рисует её 3D-мир и плоский слой поверх.

export type VideoProps = {
	// частота кадров (по умолчанию 60); для быстрых черновиков: --props='{"fps":30}'
	fps?: number;
	// выключить звуковую дорожку (кадры и превью без сведённого звука)
	audio?: boolean;
	// впечатать время в кадр (для контактных листов)
	stamp?: boolean;
};

export const sceneLength = (scene: SceneDef): number => {
	if (scene.duration !== undefined) return scene.duration;
	const slot = SCENES.find((s) => s.id === scene.id);
	if (!slot) throw new Error(`Сцена "${scene.id}": нет в timeline.ts и не задана duration`);
	return slot.duration;
};

// Ставит камеру кадра
const CameraRig: React.FC<{cam: CameraState}> = ({cam}) => {
	const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
	useLayoutEffect(() => {
		camera.position.copy(cam.position);
		camera.quaternion.copy(cam.quaternion);
		if (camera.fov !== cam.fov) {
			camera.fov = cam.fov;
			camera.updateProjectionMatrix();
		}
		camera.updateMatrixWorld();
	});
	return null;
};

// Угловой значок сервера: логотип HolyWorld и адрес (маленький, слева сверху).
// BADGE_AREA — место, которое он занимает: надписи сцен сюда не ставить.
export const BADGE_AREA = {x: 36, y: 26, width: 470, height: 84};
const ServerBadge: React.FC<{assets: Assets; opacity: number}> = ({assets, opacity}) => {
	if (opacity <= 0.003) return null;
	return (
		<div style={{position: 'absolute', left: 0, top: 0, opacity}}>
			<Img src={assets.holyworldUrl} style={{position: 'absolute', left: BADGE_AREA.x, top: BADGE_AREA.y, height: BADGE_AREA.height, filter: 'drop-shadow(0 3px 0 rgba(0,0,0,0.35))'}} />
			<PixelText x={BADGE_AREA.x + 104} y={BADGE_AREA.y + BADGE_AREA.height / 2 + 2} align="left" size={40} color="#ffffff" color2="#ffd86b" outlineColor="#3a1a08">
				mc.holyworld.ru
			</PixelText>
		</div>
	);
};

const TimeStamp: React.FC<{text: string}> = ({text}) => (
	<div
		style={{
			position: 'absolute',
			left: 24,
			bottom: 20,
			padding: '6px 22px',
			background: 'rgba(0,0,0,0.78)',
			color: '#ffe95a',
			fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
			fontWeight: 700,
			fontSize: 110,
			lineHeight: 1.1,
			borderRadius: 10,
		}}
	>
		{text}
	</div>
);

type PlayerProps = VideoProps & {
	scenes: SceneDef[];
	// timeline — весь ролик по timeline.ts; single — одна сцена с локальным временем
	mode: 'timeline' | 'single';
};

export const ScenePlayer: React.FC<PlayerProps> = ({scenes, mode, audio = true, stamp = false}) => {
	const assets = useAssets();
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const time = frame / fps;

	let scene: SceneDef | undefined;
	let t = time;
	let badge = 0;
	let label = `${time.toFixed(2)}s`;
	if (mode === 'single') {
		scene = scenes[0];
		const slot = SCENES.find((s) => s.id === scene!.id);
		const g = slot ? slot.start + t : -1;
		badge = g >= BADGE_FROM && g < BADGE_TO ? 1 : 0;
	} else {
		const at = sceneAt(time);
		scene = scenes.find((s) => s.id === at.slot.id);
		t = at.t;
		// значок сервера плавно появляется в начале s2 и гаснет к концу s8
		badge = Math.min(1, Math.max(0, (time - BADGE_FROM) / 0.5)) * Math.min(1, Math.max(0, (BADGE_TO - time) / 0.4));
		label = `${time.toFixed(1)}s ${at.slot.id.slice(0, 2)} ${t.toFixed(1)}`;
	}
	if (!scene) throw new Error('ScenePlayer: нет сцены для этого момента времени');
	const duration = sceneLength(scene);
	const cam = scene.camera(t);
	const dpr = typeof window === 'undefined' ? 1 : getRemotionEnvironment().isRendering ? window.devicePixelRatio : Math.min(1, window.devicePixelRatio);
	const World = scene.World;
	const Overlay = scene.Overlay;

	return (
		<AbsoluteFill style={{backgroundColor: '#05081e', overflow: 'hidden'}}>
			{assets ? (
				<>
					<ThreeCanvas width={WIDTH} height={HEIGHT} flat dpr={dpr} camera={{fov: cam.fov, near: 0.1, far: 2000}} gl={{antialias: true}}>
						<CameraRig cam={cam} />
						<World key={scene.id} t={t} cam={cam} assets={assets} duration={duration} />
					</ThreeCanvas>
					<AbsoluteFill style={{overflow: 'hidden'}}>
						<ServerBadge assets={assets} opacity={badge} />
						{Overlay ? <Overlay key={scene.id} t={t} cam={cam} assets={assets} duration={duration} /> : null}
						{stamp ? <TimeStamp text={label} /> : null}
					</AbsoluteFill>
				</>
			) : null}
			{mode === 'timeline' && audio ? <Audio src={staticFile('audio/soundtrack.wav')} /> : null}
		</AbsoluteFill>
	);
};

const metadata =
	(seconds: number): CalculateMetadataFunction<VideoProps> =>
	({props}) => {
		const fps = props.fps ?? FPS;
		return {fps, durationInFrames: Math.max(1, Math.round(seconds * fps)), width: WIDTH, height: HEIGHT};
	};

// Композиция одной сцены (id композиции = id сцены, время локальное) — для превью и кадров
export const sceneComposition = (scene: SceneDef) => {
	const Comp: React.FC<VideoProps> = (props) => <ScenePlayer {...props} scenes={[scene]} mode="single" />;
	const seconds = sceneLength(scene);
	return (
		<Composition
			key={scene.id}
			id={scene.id}
			component={Comp}
			durationInFrames={Math.round(seconds * FPS)}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
			defaultProps={{}}
			calculateMetadata={metadata(seconds)}
		/>
	);
};

// Композиция всего ролика
export const timelineComposition = (id: string, scenes: SceneDef[]) => {
	const Comp: React.FC<VideoProps> = (props) => <ScenePlayer {...props} scenes={scenes} mode="timeline" />;
	return (
		<Composition
			key={id}
			id={id}
			component={Comp}
			durationInFrames={DURATION_S * FPS}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
			defaultProps={{}}
			calculateMetadata={metadata(DURATION_S)}
		/>
	);
};
