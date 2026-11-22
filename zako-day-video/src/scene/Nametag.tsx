import React, {useMemo} from 'react';
import * as THREE from 'three';

// Ник над головой как в Minecraft: полупрозрачная плашка и белый текст.
const makeTag = (text: string, color: string) => {
	const c = document.createElement('canvas');
	const g = c.getContext('2d')!;
	const font = '700 64px Rubik';
	g.font = font;
	const w = Math.ceil(g.measureText(text).width) + 40;
	c.width = w;
	c.height = 88;
	g.font = font;
	g.fillStyle = 'rgba(0,0,0,0.42)';
	g.fillRect(0, 0, w, 88);
	g.fillStyle = color;
	g.textBaseline = 'middle';
	g.textAlign = 'center';
	g.fillText(text, w / 2, 47);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	return {tex, aspect: w / 88};
};

export const Nametag: React.FC<{
	text: string;
	position: [number, number, number];
	quaternion: THREE.Quaternion;
	color?: string;
	height?: number;
	visible?: boolean;
}> = ({text, position, quaternion, color = '#ffffff', height = 0.26, visible = true}) => {
	const {tex, aspect} = useMemo(() => makeTag(text, color), [text, color]);
	return (
		<mesh position={position} quaternion={quaternion} visible={visible} renderOrder={10}>
			<planeGeometry args={[height * aspect, height]} />
			<meshBasicMaterial map={tex} transparent depthTest={false} depthWrite={false} />
		</mesh>
	);
};
