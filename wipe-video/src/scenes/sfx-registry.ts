import type {SfxEvent} from '../core/sfx';
import {events as s1} from './s1-hook/sfx';
import {events as s2} from './s2-oldworld/sfx';
import {events as s3} from './s3-wipe/sfx';
import {events as s4} from './s4-newworld/sfx';
import {events as s5} from './s5-dungeon/sfx';
import {events as s6} from './s6-reward/sfx';
import {events as s7} from './s7-pvp/sfx';
import {events as s8} from './s8-pearl/sfx';
import {events as s9} from './s9-finale/sfx';
import {events as demo} from './_demo/sfx';

// Звуки всех сцен (локальное время каждой). ЧИСТЫЙ модуль: его читают Node-скрипты.
export const SCENE_SFX: Record<string, SfxEvent[]> = {
	's1-hook': s1,
	's2-oldworld': s2,
	's3-wipe': s3,
	's4-newworld': s4,
	's5-dungeon': s5,
	's6-reward': s6,
	's7-pvp': s7,
	's8-pearl': s8,
	's9-finale': s9,
};

// Сцены вне таймлайна (в общий микс не идут; сводятся только через --scene=<id>)
export const EXTRA_SFX: Record<string, {events: SfxEvent[]; duration: number}> = {
	demo: {events: demo, duration: 15.5},
};
