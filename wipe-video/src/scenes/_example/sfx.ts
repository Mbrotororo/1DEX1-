import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

// Звуки сцены: локальное время, имена — пути в ассетах Minecraft без расширения.
const s = sfx();
s.steps(BEATS.walkFrom, BEATS.walkTo, 'snow', 0.42, 0.4);
s.add(BEATS.caption, 'random/pop', 0.7, {rate: 1.2});
s.add(BEATS.wave, 'random/orb', 0.5);
s.loop(BEATS.snow, BEATS.end, 'ambient/weather/rain1', 2, 0.15, {lowpass: 1500});

export const events = s.events;
