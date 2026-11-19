import {sfx} from '../../core/sfx';
import {BEATS, CLICKS} from './beats';

// Звуки сцены b-room: локальное время (глобальное − 16), имена — пути в ассетах Minecraft.
// Все моменты — из beats.ts (те же, что у картинки). Эффекты громче музыки (припев 16–19.2 плотный).
const s = sfx();

// ---- B1: долетает до кресла (прыжок начался в a-home), плюхнулся, кресло катится и крутится ----
s.add(0.04, 'entity/player/attack/sweep1', 0.6, {rate: 0.8});
s.add(BEATS.twistFrom, 'entity/player/attack/sweep5', 0.6, {rate: 1.2});
s.add(BEATS.land, 'dig/cloth1', 1.3, {rate: 0.8});
s.add(BEATS.land, 'step/wood3', 0.9, {rate: 0.7});
// перекат колёсиков — тише и глуше: припев 16.8–18.6 не закрывать
s.add(BEATS.land + 0.02, 'minecart/base', 0.4, {dur: BEATS.spinEnd - BEATS.land + 0.1, fadeIn: 0.03, fade: 0.35, rate: 1.25, lowpass: 2500});

// ---- B2: щелчок кнопки, ПК запускается (удар + гул), монитор загорается ----
s.add(BEATS.press, 'block/cherrywood_button/cherrywood_click', 0.85, {rate: 1.15});
s.add(BEATS.power, 'block/respawn_anchor/charge1', 0.9, {rate: 1.25, dur: 0.7, fade: 0.3});
s.add(BEATS.power, 'block/beacon/activate', 1.1, {rate: 1.15, dur: 1.2, fade: 0.5});
s.add(BEATS.monitorOn, 'block/beacon/power1', 0.6, {rate: 1.4, dur: 0.6, fade: 0.25});

// ПК работает: ровный гул блока питания и шум вентиляторов под всей работой за компьютером (до B7).
// Между кликами музыка почти молчит — без этой подложки на маленьких динамиках «клик… тишина… клик».
// Гул маяка — со стабильного участка (1.0–4.2 с файла), чуть выше (1.11: основной тон ≈ 55 Гц, ля — в тональности);
// воздух вентиляторов — элитра, глухо (одним куском, без стыков); нарастает вместе с раскруткой вентиляторов.
s.loop(BEATS.power + 0.15, BEATS.b7 + 0.4, 'block/beacon/ambient', 2.8, 0.5, {offset: 1.0, rate: 1.11, lowpass: 1600, edge: 0.4, cross: 0.6});
s.loop(BEATS.power + 0.3, BEATS.b7 + 0.4, 'item/elytra/elytra_loop', 10, 0.28, {lowpass: 1800, edge: 0.5});

// ---- B3–B6: клики мыши, «вжух» окон ----
// у random/click ~60 мс тишины в начале: пропускаем её, щелчок звучит ровно в момент клика
// (громкости с запасом под усиление мастера +4.5 дБ: щелчок острый, но ограничитель его не трогает)
const click = (at: number, vol = 0.65) => s.add(at, 'random/click', vol, {rate: 1.15, offset: 0.06});
CLICKS.mcDouble.forEach((at) => click(at, 0.65));
// клик меню: на 20 мс раньше картинки — чтобы не слипся с бочкой 20.8 (глобально)
click(CLICKS.menu - 0.02, 0.68);
click(CLICKS.row, 0.6);
click(CLICKS.connect, 0.7);
click(CLICKS.voice, 0.7);
// окна открываются
s.add(BEATS.mcClick + 0.12, 'entity/player/attack/sweep2', 0.4, {rate: 1.35});
s.add(BEATS.b4, 'entity/player/attack/sweep3', 0.42, {rate: 1.45});
s.add(BEATS.b6, 'entity/player/attack/sweep4', 0.6, {rate: 1.45});
// мир загрузился
s.add(BEATS.connectClick + 0.24, 'note/pling', 0.42, {rate: 2, dur: 0.4, fade: 0.2});
// Discord: вход в голосовой канал — два коротких тона вверх
s.add(BEATS.voiceClick + 0.08, 'note/pling', 0.65, {rate: 1.26, dur: 0.22, fade: 0.1});
s.add(BEATS.voiceClick + 0.2, 'note/pling', 0.65, {rate: 1.68, dur: 0.3, fade: 0.15});

// ---- B5: кресло подкатилось, схватил наушники, надел (кожаная броня — на долю, без медленной атаки) ----
s.add(BEATS.b5, 'minecart/base', 0.35, {dur: BEATS.hpRollTo - BEATS.b5 + 0.06, fadeIn: 0.02, fade: 0.08, rate: 1.4});
s.add(BEATS.hpGrab, 'item/armor/equip_generic1', 0.7);
s.add(BEATS.hpOn, 'item/armor/equip_leather1', 1.5, {offset: 0.14});

// ---- B6: «Начать запись» — клик и яркий «пинг» ----
click(CLICKS.rec, 0.7);
s.add(BEATS.recClick, 'random/orb', 0.85, {rate: 1.2});
s.add(BEATS.recClick + 0.02, 'note/bell', 0.8, {rate: 2, dur: 0.6, fade: 0.3});

// ---- B7: камера пишет, клик мышью, разворот кресла, «ПОГНАЛИ» — удар и левел-ап ----
// «бип-бип» камеры: второй — уже после удара музыки 26.4, где он слышен
s.add(BEATS.b7, 'note/bit', 1.3, {rate: 2, dur: 0.07, fade: 0.03});
s.add(BEATS.b7 + 0.09, 'note/bit', 1.3, {rate: 2, dur: 0.1, fade: 0.04});
click(CLICKS.final, 0.7);
s.add(BEATS.turnFrom, 'minecart/base', 0.4, {dur: BEATS.turnTo - BEATS.turnFrom + 0.1, fadeIn: 0.05, fade: 0.2, rate: 1.4});
s.add(BEATS.pognali, 'item/mace/smash_ground1', 0.72);
s.add(BEATS.pognali, 'fireworks/largeblast1', 0.5);
s.add(BEATS.pognali + 0.02, 'random/levelup', 0.75);
s.add(BEATS.subtitle, 'random/pop', 0.5, {rate: 1.2});

export const events = s.events;
