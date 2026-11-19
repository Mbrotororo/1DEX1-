import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

const s = sfx();
// ветер: тихо с начала, метель громче
s.loop(0, BEATS.blizzard, 'ambient/nether/soulsand_valley/wind1', 3, 0.12, {lowpass: 1800});
s.loop(BEATS.blizzard - 0.5, BEATS.end, 'ambient/nether/soulsand_valley/wind2', 3, 0.24);
// надписи
s.add(BEATS.title1, 'random/pop', 0.7);
s.add(BEATS.title2, 'random/pop', 0.8, {rate: 0.8});
s.add(BEATS.removed, 'random/pop', 0.7, {rate: 1.2});
s.add(BEATS.stamp, 'random/wood_click', 0.8);
s.add(BEATS.newGen, 'random/orb', 0.6);
// зелье
s.add(BEATS.drink + 0.2, 'random/drink', 0.6);
// бег: трава, потом снег
s.steps(BEATS.sprint, BEATS.blizzard, 'grass', 0.22, 0.38);
s.steps(BEATS.blizzard, BEATS.arrive, 'snow', 0.22, 0.4);
// таймер: тик раз в секунду, последние три — громче
s.every(0, 6.5, 1, 'random/click', 0.35);
s.seq([7, 8, 9], 'random/click', 0.8, (i) => ({rate: 1 + i * 0.1}));
s.add(BEATS.zero, 'random/explode1', 0.9, {lowpass: 900});

export const events = s.events;
