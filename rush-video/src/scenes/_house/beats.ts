// Галерея дома (не входит в ролик): планы по 2 с. Время локальное, секунды.
export const SHOT = 2;
export const SHOTS = [
	'hallWide',
	'frontDoor',
	'clock',
	'cork',
	'hooks',
	'stairs',
	'corridor',
	'bedroomDoor',
	'bedroomWide',
	'desk',
	'pcButton',
	'faceMonitor',
	'chair',
	'tripod',
	'heroHall',
	'heroSeated',
	'floorBag',
] as const;
export type ShotName = (typeof SHOTS)[number];
export const shotStart = (name: ShotName) => SHOTS.indexOf(name) * SHOT;
export const BEATS = {
	end: SHOTS.length * SHOT,
};
