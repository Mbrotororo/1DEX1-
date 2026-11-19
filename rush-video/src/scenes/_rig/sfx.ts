import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

// Служебная сцена: только пара отметок, чтобы превью было не немым
const s = sfx();
s.add(BEATS.dive + 0.55, 'random/pop', 0.5);
s.add(BEATS.reach + 0.5, 'random/click', 0.6);
export const events = s.events;
