// Дом для сцен a-home и b-room: всё, что нужно сцене, одним импортом.
// import {House, HOUSE_ENV, CLOCK, STAIRS_PATH, ...} from '../../sets/house';
export * from './anchors';
export {HOUSE_ENV, type HouseEnvName} from './env';
export {getHouse, BAKED_LIGHTS, INTERIOR_AMBIENT, INTERIOR_AMBIENT_COLOR, type HouseSet} from './world';
export {House, CHAR_LIGHTS, type HouseProps, type HidePart} from './House';
export {HB} from './blocks';
