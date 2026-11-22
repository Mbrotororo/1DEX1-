import type {PlayerPose} from '../scene/Player';
import {prog, smooth} from './anim';

// Готовые позы и движения персонажей. t — время сцены в секундах.
// Вращение руки вбок (второе число): у правой руки «наружу» — минус, у левой — плюс.

// Стоит и «дышит»: руки чуть качаются, как у игрока в игре
export const idle = (t: number, seed = 0): PlayerPose => {
	const s = Math.sin(t * 1.8 + seed) * 0.05;
	return {
		headYaw: Math.sin(t * 0.7 + seed) * 0.12,
		headPitch: Math.sin(t * 0.9 + seed) * 0.04,
		armR: [s, -0.06 - Math.abs(s) * 0.5],
		armL: [-s, 0.06 + Math.abs(s) * 0.5],
		legR: [0, 0],
		legL: [0, 0],
	};
};

// Машет правой рукой между start и start+dur
export const withWave = (p: PlayerPose, t: number, start: number, dur: number): PlayerPose => {
	const up = smooth(prog(t, start, 0.25)) * (1 - smooth(prog(t, start + dur - 0.25, 0.25)));
	if (up <= 0) return p;
	return {
		...p,
		armR: [p.armR[0] * (1 - up) - 2.6 * up, p.armR[1] * (1 - up) - (0.5 + Math.sin(t * 14) * 0.35) * up],
	};
};

// Обе руки вверх (паника/радость)
export const withHandsUp = (p: PlayerPose, k: number, t: number): PlayerPose => {
	if (k <= 0) return p;
	const shake = Math.sin(t * 22) * 0.2 * k;
	return {
		...p,
		armR: [p.armR[0] * (1 - k) - 2.9 * k + shake, p.armR[1] * (1 - k) - 0.5 * k],
		armL: [p.armL[0] * (1 - k) - 2.9 * k - shake, p.armL[1] * (1 - k) + 0.5 * k],
	};
};

// Ходьба: phase растёт со скоростью шага
export const walk = (p: PlayerPose, phase: number, amount = 1): PlayerPose => {
	const s = Math.sin(phase) * 0.7 * amount;
	return {
		...p,
		armR: [p.armR[0] - s, p.armR[1]],
		armL: [p.armL[0] + s, p.armL[1]],
		legR: [s, 0],
		legL: [-s, 0],
	};
};

// Печатает на клавиатуре: руки вперёд и быстро дёргаются
export const typing = (p: PlayerPose, t: number, k = 1): PlayerPose => ({
	...p,
	headPitch: p.headPitch * (1 - k) + 0.15 * k,
	armR: [p.armR[0] * (1 - k) + (-1.25 + Math.sin(t * 31) * 0.08) * k, p.armR[1] * (1 - k) + 0.15 * k],
	armL: [p.armL[0] * (1 - k) + (-1.25 + Math.sin(t * 27 + 1) * 0.08) * k, p.armL[1] * (1 - k) - 0.15 * k],
});
