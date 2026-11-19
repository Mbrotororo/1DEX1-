import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

// Звуки демо-сцены (локальное время). Имена — пути в ассетах Minecraft.
const s = sfx();

// сборка острова: стук блоков
s.every(BEATS.assembleFrom, BEATS.assembleTo, 0.12, (i) => `dig/${i % 3 === 0 ? 'grass' : 'stone'}${(i % 4) + 1}`, 0.5, (i) => ({rate: 0.85 + (i % 5) * 0.08, pan: Math.sin(i) * 0.6}));
s.add(BEATS.title, 'random/pop', 0.7, {rate: 1.2});
s.add(2.6, 'random/drink', 0.6, {dur: 1.2, fade: 0.2});
s.add(3.6, 'random/orb', 0.6);
// метель и распад
s.loop(BEATS.shot2, BEATS.shot3, 'ambient/weather/rain1', 2.5, 0.2, {lowpass: 1800});
s.steps(4.3, 7.5, 'snow', 0.26, 0.4);
s.every(BEATS.countdownFrom, BEATS.dissolveTo, 1 / 3, 'random/click', 0.5, (i) => ({rate: 1 + i * 0.03}));
s.add(6, 'damage/hit1', 0.7);
s.add(BEATS.stamp, 'random/anvil_land', 0.5, {rate: 1.2});
s.add(6.85, 'mob/pig/say1', 0.6, {rate: 1.2});
// подземелье: эхо
const cave = {reverb: 0.5};
s.add(BEATS.spawner, 'block/trial_spawner/ambient1', 0.5, cave);
s.add(BEATS.keyFly, 'block/vault/insert_item', 0.8, cave);
s.add(BEATS.lidOpen, 'block/vault/open_shutter', 0.8, cave);
s.add(BEATS.gate, 'block/copper_door/toggle1', 0.7, cave);
s.add(BEATS.shock, 'item/mace/smash_ground1', 0.8, cave);
s.add(BEATS.firework, 'fireworks/blast1', 0.6, cave);
s.add(BEATS.teleport, 'mob/endermen/portal', 0.6, cave);
s.add(10.3, 'mob/zombie/death', 0.5, cave);

export const events = s.events;
