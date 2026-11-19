import * as THREE from 'three';
import type {Vec3} from '../anim';
import type {Pose} from './poses';
import type {SkinBuild} from './skins';

// Точки персонажа для данной позы — в его собственных координатах, блоки: относительно position,
// до поворота rotationY (x — к левому плечу, y — вверх, z — вперёд). Учитываются dy, lean, bend,
// twist, tilt и shrug позы; lean/tumble/squash пропсов Humanoid — нет. ЧИСТЫЙ модуль.
// В мир: повернуть на rotationY вокруг y и прибавить position (worldPoint ниже).

const PXB = 1.875 / 32;
const ARM_W: Record<SkinBuild, number> = {classic: 4, slim: 3, skeleton: 2};

const m = new THREE.Matrix4();
const e = new THREE.Euler();
const v = new THREE.Vector3();

// матрица корпуса (пиксели скина): ступни → наклон → бёдра → bend/twist/tilt
const torsoMatrix = (pose: Pose, out: THREE.Matrix4) => {
	out.makeTranslation(0, (pose.dy ?? 0) / PXB, 0);
	out.multiply(m.makeRotationX(pose.lean ?? 0));
	out.multiply(m.makeTranslation(0, 12, 0));
	out.multiply(m.makeRotationFromEuler(e.set(pose.bend ?? 0, pose.twist ?? 0, pose.tilt ?? 0, 'YXZ')));
	return out;
};

const toBlocks = (p: THREE.Vector3): Vec3 => [p.x * PXB, p.y * PXB, p.z * PXB];

// Точка «кулака» (куда крепится handR/handL): 9 px от плеча вдоль руки
export const handAnchor = (pose: Pose, side: 'R' | 'L', build: SkinBuild = 'slim'): Vec3 => {
	const t = torsoMatrix(pose, new THREE.Matrix4());
	const armX = 4 + ARM_W[build] / 2;
	const a = side === 'R' ? pose.armR : pose.armL;
	t.multiply(m.makeTranslation(side === 'R' ? -armX : armX, 10 + (pose.shrug ?? 0), 0));
	t.multiply(m.makeRotationFromEuler(e.set(a[0], 0, a[1], 'XYZ')));
	return toBlocks(v.set(0, -9, 0).applyMatrix4(t));
};

// Начало backSlot: центр задней поверхности туловища
export const backAnchor = (pose: Pose): Vec3 => {
	const t = torsoMatrix(pose, new THREE.Matrix4());
	return toBlocks(v.set(0, 6, -2.26).applyMatrix4(t));
};

// Центр головы (начало headSlot)
export const headAnchor = (pose: Pose): Vec3 => {
	const t = torsoMatrix(pose, new THREE.Matrix4());
	t.multiply(m.makeTranslation(0, 12, 0));
	t.multiply(m.makeRotationFromEuler(e.set(pose.headPitch, pose.headYaw, 0, 'YXZ')));
	return toBlocks(v.set(0, 4, 0).applyMatrix4(t));
};

// Точка в координатах персонажа → мир (scale — как у Humanoid)
export const worldPoint = (local: Vec3, position: Vec3, rotationY = 0, scale = 1): Vec3 => {
	const c = Math.cos(rotationY);
	const s = Math.sin(rotationY);
	const x = local[0] * scale;
	const z = local[2] * scale;
	return [position[0] + x * c + z * s, position[1] + local[1] * scale, position[2] - x * s + z * c];
};
