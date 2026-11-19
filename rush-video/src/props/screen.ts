import * as THREE from 'three';
import {cachedTex, canvasTexture} from './kit';

// Заглушка экрана 16:9 (зимние обои и три значка без подписей) — для галереи и черновиков.
// Настоящий рабочий стол рисует сцена b-room.
export const placeholderScreen = (): THREE.Texture =>
	cachedTex('screen-placeholder', () =>
		canvasTexture(
			160,
			90,
			(ctx) => {
				const g = ctx.createLinearGradient(0, 0, 0, 90);
				g.addColorStop(0, '#3a5aa8');
				g.addColorStop(0.55, '#c88ab0');
				g.addColorStop(1, '#f6c79a');
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, 160, 90);
				// холмы со снегом и ели
				ctx.fillStyle = '#eef4ff';
				for (let x = 0; x < 160; x++) ctx.fillRect(x, 62 + Math.round(Math.sin(x * 0.05) * 4 + Math.sin(x * 0.13) * 2), 1, 40);
				ctx.fillStyle = '#1f3b2c';
				for (const [x, h] of [
					[18, 14],
					[30, 10],
					[112, 16],
					[128, 11],
					[140, 13],
				]) {
					for (let i = 0; i < h; i++) ctx.fillRect(x - Math.floor(i / 2), 64 - h + i, 1 + Math.floor(i / 2) * 2, 1);
				}
				// значки слева
				const icon = (y: number, c1: string, c2: string) => {
					ctx.fillStyle = 'rgba(0,0,0,0.35)';
					ctx.fillRect(7, y + 1, 12, 12);
					ctx.fillStyle = c1;
					ctx.fillRect(6, y, 12, 12);
					ctx.fillStyle = c2;
					ctx.fillRect(6, y, 12, 4);
				};
				icon(6, '#7a5a3a', '#5aa83a');
				icon(24, '#5865f2', '#7a86ff');
				icon(42, '#2a2a30', '#44444c');
				// панель задач
				ctx.fillStyle = 'rgba(14,16,24,0.85)';
				ctx.fillRect(0, 84, 160, 6);
				ctx.fillStyle = '#7aa8ff';
				ctx.fillRect(3, 85, 4, 4);
			},
			true,
		),
	);
