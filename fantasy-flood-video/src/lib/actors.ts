import {clamp01, easeInOutCubic, easeOutBack, lerp, prog, smooth, track} from './anim';
import {T} from './timeline';
import {PLAYER_POS, waterTopAt} from './world';

// Что делает игрок и лодка в каждый момент времени.
// Углы в радианах. Рука вверх — поворот по X на -PI.

export type ActorState = {
	visible: boolean;
	position: [number, number, number];
	rotationY: number;
	squash: number;
	headYaw: number;
	headPitch: number;
	armR: [number, number];
	armL: [number, number];
	legR: [number, number];
	legL: [number, number];
	boat: {scale: number; position: [number, number, number]; rotationY: number; tilt: [number, number]; row: number};
	// высота макушки (для ника над головой)
	headTop: number;
	// игрок и лодка немного увеличиваются, когда камера отъезжает
	scale: number;
};

const PX = (1.25 * 0.9375) / 16;
const FALL_FROM = 24;

export const actorAt = (t: number, cameraAzimuth: number): ActorState => {
	const cellX = Math.floor(PLAYER_POS.x);
	const cellZ = Math.floor(PLAYER_POS.z);
	const water = waterTopAt(cellX, cellZ, t);

	// ---- лодка ----
	const boatScale = easeOutBack(prog(t, T.boatIn, 0.3));
	const bob = Math.sin(t * 2.3) * 0.06;
	const boatY = Math.max(0.05, water - 0.22) + (t > T.boatIn ? bob : 0);
	// пока вода поднимается, лодку относит в сторону от логотипа
	const drift = smooth(prog(t, T.riseStart, T.riseEnd - T.riseStart));
	const boatX = PLAYER_POS.x + drift * 1.1 + Math.sin(t * 0.45) * 0.25 * drift;
	const boatZ = PLAYER_POS.z + drift * 2.5 + Math.cos(t * 0.38) * 0.25 * drift;
	const scale = 1 + 0.35 * drift;
	const finale = smooth(prog(t, T.finale, 0.5));

	// ---- куда смотрит игрок ----
	// до лодки — прямо в камеру, в лодке — вполоборота
	const sit = easeInOutCubic(prog(t, T.sitStart, T.sitEnd - T.sitStart));
	const rotationY = cameraAzimuth - 0.12 - sit * 0.45 + Math.sin(t * 0.5) * 0.12 * sit;

	// ---- высота ----
	const fall = prog(t, T.playerFall, T.playerLand - T.playerFall);
	let y = FALL_FROM * (1 - fall * fall);
	// испуганный прыжок, когда вода дошла до ног
	const startle = prog(t, T.waterStart + 0.28, 0.4);
	y += Math.sin(startle * Math.PI) * 0.7;
	// запрыгивает в лодку
	const seatY = boatY - 7 * PX * scale;
	y = lerp(y, seatY, sit) + Math.sin(sit * Math.PI) * 1.1;

	const sinceLand = t - T.playerLand;
	const squash = sinceLand > 0 ? 1 - 0.24 * Math.exp(-sinceLand * 11) * Math.cos(sinceLand * 20) : 1;

	// ---- руки ----
	const landed = smooth(prog(t, T.playerLand, 0.25));
	const waving = smooth(prog(t, T.waveStart, 0.18)) * (1 - smooth(prog(t, T.waveEnd, 0.2)));
	const pointing = smooth(prog(t, T.armUp, 0.35)) * (1 - smooth(prog(t, T.strike + 0.15, 0.25)));
	const scared = smooth(prog(t, T.waterStart + 0.2, 0.15)) * (1 - sit);
	const rowing = sit * (1 - finale);
	const cheer = finale;

	// падение: руки вверх
	let armRx = lerp(-2.9, 0, landed);
	let armLx = lerp(-2.9, 0, landed);
	let armRz = lerp(-0.3, 0, landed);
	let armLz = lerp(0.3, 0, landed);
	// лёгкое покачивание в покое
	armRx += Math.sin(t * 2.2) * 0.05 * landed;
	armLx -= Math.sin(t * 2.2) * 0.05 * landed;
	// машет рукой
	armRz = lerp(armRz, -2.45 + Math.sin((t - T.waveStart) * 17) * 0.38, waving);
	// поднимает руку к логотипу
	armRx = lerp(armRx, -2.95 + Math.sin(t * 3) * 0.05, pointing);
	armRz = lerp(armRz, -0.12, pointing);
	// испуг: обе руки вверх и трясутся
	armRx = lerp(armRx, -2.7 + Math.sin(t * 30) * 0.2, scared);
	armLx = lerp(armLx, -2.7 + Math.cos(t * 30) * 0.2, scared);
	armRz = lerp(armRz, -0.45, scared);
	armLz = lerp(armLz, 0.45, scared);
	// гребёт
	const row = t * 3.2;
	armRx = lerp(armRx, -0.95 + Math.sin(row) * 0.3, rowing);
	armLx = lerp(armLx, -0.95 + Math.sin(row + Math.PI) * 0.3, rowing);
	armRz = lerp(armRz, -0.3, rowing);
	armLz = lerp(armLz, 0.3, rowing);
	// финал: радуется, обе руки вверх
	armRx = lerp(armRx, -2.85 + Math.sin(t * 9) * 0.22, cheer);
	armLx = lerp(armLx, -2.85 + Math.sin(t * 9 + 1.6) * 0.22, cheer);
	armRz = lerp(armRz, -0.4, cheer);
	armLz = lerp(armLz, 0.4, cheer);

	// ---- ноги ----
	const air = 1 - landed;
	let legRx = 0.35 * air;
	let legLx = -0.35 * air;
	legRx = lerp(legRx, -0.5, Math.sin(startle * Math.PI));
	legLx = lerp(legLx, 0.4, Math.sin(startle * Math.PI));
	legRx = lerp(legRx, -1.45, sit);
	legLx = lerp(legLx, -1.45, sit);
	const legSplay = 0.22 * sit;

	// ---- голова ----
	const headPitch = track(t, [
		[T.playerLand, 0.25],
		[T.playerLand + 0.3, 0],
		[T.armUp, 0],
		[T.armUp + 0.4, -0.62],
		[T.strike + 0.1, -0.62],
		[T.waterStart + 0.35, 0.5],
		[T.sitEnd, 0.1],
		[T.riseStart, -0.05],
		[T.finale, -0.05],
		[T.finale + 0.5, -0.3],
	]);
	const headYaw =
		Math.sin((t - T.waveStart) * 3) * 0.18 * waving +
		Math.sin(t * 1.4) * 0.45 * rowing +
		Math.sin(t * 2.4) * 0.15 * cheer;

	return {
		visible: t >= T.playerFall,
		position: [lerp(PLAYER_POS.x, boatX, sit), y, lerp(PLAYER_POS.z, boatZ, sit)],
		rotationY,
		squash,
		headYaw,
		headPitch,
		armR: [armRx, armRz],
		armL: [armLx, armLz],
		legR: [legRx, -legSplay],
		legL: [legLx, legSplay],
		boat: {
			scale: boatScale,
			position: [boatX, boatY, boatZ],
			rotationY: cameraAzimuth - 0.57 + Math.sin(t * 0.5) * 0.12,
			tilt: [Math.sin(t * 1.9) * 0.035, Math.cos(t * 1.6) * 0.045],
			row: rowing > 0.5 ? row : 0,
		},
		headTop: y + 32 * PX * scale * clamp01(squash),
		scale,
	};
};
