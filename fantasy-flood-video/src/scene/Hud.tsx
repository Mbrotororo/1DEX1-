import React from 'react';
import * as THREE from 'three';
import {easeOutBounce, prog} from '../lib/anim';
import {T} from '../lib/timeline';
import {VoxelText} from './VoxelText';

// Всё, что «приклеено» к экрану: баннер сервера сверху и надписи справа.
// Координаты здесь в пикселях кадра 1920x1080: (0, 0) — центр, y вверх.
// При этом всё настоящее 3D — объёмные буквы стоят прямо перед камерой.

const LOGO_H = 150;

export const Banner: React.FC<{t: number; logo: THREE.Texture}> = ({t, logo}) => {
	const img = logo.image as {width: number; height: number};
	const logoW = (LOGO_H * img.width) / img.height;
	const px = 7;
	const textW = 75 * px; // ширина «mc.holyworld.ru» в пикселях шрифта
	const gap = 18;
	const total = logoW + gap + textW;
	const left = -total / 2;

	// баннер падает сверху и подпрыгивает
	const drop = (1 - easeOutBounce(prog(t, T.bannerIn, 0.75))) * 320;
	const y = 540 - 16 - LOGO_H / 2 + drop;
	const sway = Math.sin(t * 1.5) * 0.035;
	const turn = Math.sin(t * 1.1 + 1) * 0.22;
	const pulse = 1 + Math.sin(t * 2.6) * 0.02;

	return (
		<group position={[0, y, 0]} visible={t >= T.bannerIn}>
			<group position={[left + logoW / 2, 0, 0]} rotation={[0, turn, sway]} scale={pulse}>
				{/* тень */}
				<mesh position={[7, -7, -8]} renderOrder={20}>
					<planeGeometry args={[logoW, LOGO_H]} />
					<meshBasicMaterial map={logo} color="#000000" transparent opacity={0.4} depthWrite={false} />
				</mesh>
				<mesh renderOrder={21}>
					<planeGeometry args={[logoW, LOGO_H]} />
					<meshBasicMaterial map={logo} transparent depthWrite={false} toneMapped={false} />
				</mesh>
			</group>
			<VoxelText
				text="mc.holyworld.ru"
				t={t}
				px={px}
				depth={2.4}
				top="#ffffff"
				bottom="#ffd86b"
				body="#5a2408"
				appearAt={T.bannerIn + 0.4}
				stagger={0.035}
				position={[left + logoW + gap + textW / 2, -px * 3.6, 0]}
				rotation={[0.05, -0.1, 0]}
				wobble={0.12}
			/>
		</group>
	);
};

const COLUMN_X = 470;

export const Titles: React.FC<{t: number}> = ({t}) => {
	const sway = Math.sin(t * 0.9) * 0.035;
	return (
		<group position={[COLUMN_X, -30, 0]} rotation={[0.05, -0.34 + sway, 0]}>
			{/* 1. Обычный мир */}
			<VoxelText
				text="ОБЫЧНЫЙ"
				t={t}
				px={15}
				top="#ffffff"
				bottom="#b9c2ff"
				body="#23264f"
				appearAt={T.titleWorldIn}
				exitAt={T.titleWorldOut}
				position={[0, 40, 0]}
			/>
			<VoxelText
				text="МИР"
				t={t}
				px={27}
				top="#a6f25c"
				bottom="#3f9e2a"
				body="#143a12"
				appearAt={T.titleWorldIn + 0.35}
				exitAt={T.titleWorldOut + 0.05}
				position={[0, -190, 0]}
			/>

			{/* 3. FantasyVisual */}
			<VoxelText
				text="FantasyVisual"
				t={t}
				px={11}
				top="#ffffff"
				bottom="#9a94f2"
				body="#2c2670"
				appearAt={T.titleLogoIn}
				exitAt={T.titleLogoOut}
				position={[0, -40, 0]}
			/>

			{/* 4. Затопил весь мир с FantasyVisual */}
			<VoxelText
				text="ЗАТОПИЛ"
				t={t}
				px={18}
				top="#b8ecff"
				bottom="#2f7be8"
				body="#0d2a6b"
				appearAt={T.titleFloodIn}
				position={[0, 110, 0]}
			/>
			<VoxelText
				text="ВЕСЬ МИР"
				t={t}
				px={15}
				top="#ffffff"
				bottom="#bcd8ff"
				body="#1b2c5e"
				appearAt={T.titleAllIn}
				position={[0, -45, 0]}
			/>
			<VoxelText
				text="с FantasyVisual"
				t={t}
				px={9.5}
				top="#ffffff"
				bottom="#9a94f2"
				body="#2c2670"
				appearAt={T.titleWithIn}
				stagger={0.03}
				position={[0, -165, 0]}
			/>
		</group>
	);
};
