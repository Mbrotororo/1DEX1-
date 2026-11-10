import React from 'react';
import {Audio, Sequence, interpolate, staticFile} from 'remotion';
import {hash3} from './lib/rng';
import {DURATION_S, FPS, T} from './lib/timeline';

// Звуковая дорожка: только оригинальные звуки Minecraft (см. scripts/fetch-sounds.mjs).
type Sfx = {
	at: number;
	src: string;
	volume?: number;
	rate?: number;
	// обрезать звук до этой длины (сек) и плавно заглушить в конце
	dur?: number;
	fade?: number;
};

const events: Sfx[] = [];
const add = (at: number, src: string, volume = 0.5, rate = 1, dur?: number, fade?: number) =>
	events.push({at, src, volume, rate, dur, fade});

// --- 1. мир собирается из блоков ---
for (let i = 0; i < 17; i++) {
	const kind = i >= 11 || i % 4 === 3 ? 'grass' : 'stone';
	add(0.3 + i * 0.085, `dig/${kind}${(i % 4) + 1}`, 0.5 - i * 0.012, 0.85 + hash3(i, 1, 0) * 0.4);
}
[1.58, 1.7, 1.82, 1.94].forEach((at, i) => add(at, `dig/wood${i + 1}`, 0.5, 0.9 + i * 0.08));
[1.92, 2.04].forEach((at, i) => add(at, `dig/grass${i + 1}`, 0.32, 1.35));
[1.76, 1.9, 2.04, 2.16, 2.28, 2.4].forEach((at, i) => add(at, `dig/wood${((i + 2) % 4) + 1}`, 0.42, 0.8 + i * 0.07));
[2.3, 2.42, 2.54].forEach((at, i) => add(at, `dig/grass${i + 2}`, 0.28, 1.5));

// баннер сервера
add(T.bannerIn + 0.27, 'random/pop', 0.6, 0.9);
[0.45, 0.57, 0.69, 0.81, 0.93].forEach((d) => add(T.bannerIn + d, 'random/click', 0.22, 1.2));
add(T.bannerIn + 0.98, 'random/orb', 0.45);

// надпись «ОБЫЧНЫЙ МИР»
add(T.titleWorldIn, 'random/pop', 0.35, 1.2);
add(T.titleWorldIn + 0.35, 'random/pop', 0.5, 0.8);

// --- 2. игрок ---
add(T.playerLand, 'damage/fallsmall', 0.7);
add(T.playerLand + 0.02, 'step/grass1', 0.6);
add(T.nameIn, 'random/pop', 0.4, 1.4);
add(T.nameIn + 0.2, 'random/orb', 0.45, 0.9);
add(T.waveStart + 0.3, 'step/grass2', 0.3, 1.1);
add(T.waveStart + 0.6, 'step/grass3', 0.3, 1.2);

// --- 3. логотип FantasyVisual ---
add(T.logoPlate, 'block/beacon/activate', 0.55);
for (let i = 0; i < 12; i++) {
	const at = T.voxStart + 0.12 + i * 0.125;
	const src = i % 2 === 0 ? `block/amethyst/place${(i % 4) + 1}` : `block/amethyst/resonate${(i % 4) + 1}`;
	add(at, src, 0.5, 0.9 + i * 0.05);
}
add(T.titleLogoIn, 'random/pop', 0.35, 1.1);
add(T.voxEnd, 'block/amethyst/shimmer', 0.7);
add(T.voxEnd, 'random/orb', 0.5, 1.2);
add(T.voxEnd + 0.05, 'block/enchantment_table/enchant1', 0.5);

// --- 4. заряд и удар ---
add(T.charge, 'block/conduit/activate', 0.9, 1, 2.6, 0.6);
add(T.charge, 'block/beacon/power1', 0.45, 1, 1.3, 0.4);
add(T.strike, 'ambient/weather/thunder1', 0.75, 1, 3, 1.4);
add(T.strike, 'item/trident/thunder1', 0.45, 1, 2, 0.9);

// --- 5. вода ---
add(T.waterStart, 'item/bucket/empty1', 0.9);
add(T.waterStart, 'liquid/heavy_splash', 0.8);
add(T.waterStart + 0.05, 'liquid/splash', 0.6);
// журчание до конца ролика
add(8.5, 'liquid/water', 0.4);
add(11.0, 'liquid/water', 0.6);
add(13.5, 'liquid/water', 0.42, 1, DURATION_S - 13.5, 0.6);
[8.7, 8.95, 9.2, 9.45, 9.7].forEach((at, i) => add(at, `liquid/swim${(i % 4) + 1}`, 0.35));
// вода смывает цветы
[8.75, 8.92, 9.1, 9.3, 9.5].forEach((at, i) => add(at, 'random/pop', 0.3, 1.2 + i * 0.12));
// лодка
add(T.boatIn, 'dig/wood2', 0.6);
add(T.boatIn, 'random/pop', 0.4, 0.8);
add(T.sitEnd - 0.02, 'entity/boat/paddle_water1', 0.6);
add(9.05, 'liquid/splash2', 0.5);
add(T.titleFloodIn, 'item/bucket/empty2', 0.7, 0.8);

// --- 6. уровень воды растёт ---
add(T.riseStart, 'liquid/heavy_splash', 0.5, 0.8);
[10.3, 11.75, 13.2].forEach((at) => add(at, 'block/bubble_column/upwards_ambient1', 0.45));
add(10.9, 'ambient/underwater/enter1', 0.6);
add(11.7, 'ambient/underwater/enter2', 0.55);
add(12.4, 'ambient/underwater/enter3', 0.5);
[10.6, 11.2, 11.9, 12.5].forEach((at, i) => add(at, `block/bubble_column/bubble${(i % 3) + 1}`, 0.4));
add(10.8, 'entity/boat/paddle_water2', 0.35);
add(11.9, 'entity/boat/paddle_water3', 0.35);
add(T.titleAllIn, 'liquid/splash', 0.5, 0.9);
add(T.titleAllIn, 'random/pop', 0.4, 0.8);

// --- 7. финал ---
add(T.finale, 'ui/toast/challenge_complete', 0.75, 1, DURATION_S - T.finale, 0.8);
add(T.finale + 0.05, 'random/levelup', 0.45);
add(T.titleWithIn, 'random/orb', 0.5);
add(T.finale + 0.25, 'fireworks/launch1', 0.5);
add(T.finale + 0.9, 'fireworks/largeblast1', 0.7);
add(T.finale + 1.15, 'fireworks/twinkle1', 0.4);
add(T.finale + 0.85, 'fireworks/launch1', 0.4, 1.1);
add(T.finale + 1.5, 'fireworks/blast1', 0.65);
add(T.finale + 1.5, 'fireworks/launch1', 0.4, 0.95);
add(T.finale + 2.15, 'fireworks/largeblast1', 0.6, 1.1);
add(T.finale + 2.4, 'fireworks/twinkle1', 0.35, 1.1, DURATION_S - T.finale - 2.4, 0.4);
add(14.3, 'entity/boat/paddle_water3', 0.3);
add(15.2, 'entity/boat/paddle_water1', 0.3, 1, 0.8, 0.4);

export const Soundtrack: React.FC = () => {
	return (
		<>
			{events.map((e, i) => {
				const from = Math.round(e.at * FPS);
				const frames = e.dur ? Math.max(1, Math.round(e.dur * FPS)) : undefined;
				const fadeFrames = Math.round((e.fade ?? 0) * FPS);
				const base = e.volume ?? 0.5;
				return (
					<Sequence key={i} from={from} durationInFrames={frames} layout="none" name={e.src}>
						<Audio
							src={staticFile(`sounds/${e.src}.ogg`)}
							playbackRate={e.rate ?? 1}
							volume={(f) =>
								frames && fadeFrames > 0
									? base *
										interpolate(f, [frames - fadeFrames, frames], [1, 0], {
											extrapolateLeft: 'clamp',
											extrapolateRight: 'clamp',
										})
									: base
							}
						/>
					</Sequence>
				);
			})}
		</>
	);
};
