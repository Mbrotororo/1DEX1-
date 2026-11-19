import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

// Подземелье — с эхом
const d = sfx({reverb: 0.4});
d.loop(0, BEATS.cutDusk, 'ambient/cave/cave1', 4, 0.15, {lowpass: 1800});
d.steps(BEATS.walkFrom, BEATS.walkTo + 0.5, 'stone', 0.3, 0.4);
d.add(BEATS.title, 'random/pop', 0.7, {rate: 1.2});
d.add(BEATS.spawnerOn, 'block/trial_spawner/spawn1', 0.7);
d.seq([BEATS.spawnerOn + 0.1, BEATS.spawnerOn + 0.4], (i) => `mob/zombie/say${i + 1}`, 0.5, (i) => ({pan: i ? 0.4 : -0.4}));
d.seq([BEATS.swing1, BEATS.swing2], 'entity/player/attack/sweep1', 0.6);
d.seq([BEATS.hit1, BEATS.hit2], (i) => `mob/zombie/hurt${i + 1}`, 0.6);
d.seq([BEATS.die1, BEATS.die2], 'mob/zombie/death', 0.6);
d.add(BEATS.arrowShot, 'random/bow', 0.7, {pan: 0.5});
d.add(BEATS.arrowHit, 'random/bowhit1', 0.7);
d.add(BEATS.arrowHit, 'damage/hit1', 0.8);
d.add(BEATS.breezeCharge, 'mob/breeze/charge1', 0.6);
d.add(BEATS.breezeShot, 'mob/breeze/shoot', 0.7);
d.add(BEATS.windHit, 'entity/wind_charge/wind_burst1', 0.8);
d.add(BEATS.breezeDie, 'mob/breeze/death1', 0.7);
d.add(BEATS.keyTo, 'random/orb', 0.6);
d.add(BEATS.gateOpen, 'block/copper_door/toggle1', 0.8, {rate: 0.7});
d.every(BEATS.gateOpen, BEATS.gateDone, 0.2, 'block/copper_grate/step1', 0.4, (i) => ({rate: 0.8 + i * 0.05}));
d.add(BEATS.lid, 'block/vault/open_shutter', 0.8);
d.add(BEATS.beam, 'block/vault/eject1', 0.6);
d.add(BEATS.maceRise, 'random/levelup', 0.5);
d.add(BEATS.smashHit, 'item/mace/smash_ground1', 1, {reverb: 0.6});
export const dungeon = d.events;

// Улица — без эха
const o = sfx();
o.loop(BEATS.cutDusk, BEATS.cutLab, 'ambient/weather/rain1', 2, 0.12, {lowpass: 1500});
o.add(BEATS.snowThrow, 'random/bow', 0.5, {rate: 0.6});
o.add(BEATS.snowHit, 'random/glass1', 0.8);
o.add(BEATS.snowHit, 'block/powder_snow/break1', 0.7);
o.add(BEATS.pearlThrow, 'random/bow', 0.5, {rate: 0.5});
o.add(BEATS.pearlLand, 'mob/endermen/portal', 0.8);
o.seq([BEATS.salute1, BEATS.salute2, BEATS.salute3], (i) => (i % 2 ? 'fireworks/largeblast1' : 'fireworks/blast1'), 0.8, (i) => ({pan: [-0.5, 0.5, 0][i]}));
o.seq([BEATS.salute1 + 0.35, BEATS.salute2 + 0.35, BEATS.salute3 + 0.35], 'fireworks/twinkle1', 0.4);
o.seq([BEATS.cutNight + 0.9, BEATS.cutNight + 1.2], 'random/pop', 0.7, (i) => ({rate: 1 + i * 0.2}));

d.merge(o.events, 0);
export const events = d.events;
