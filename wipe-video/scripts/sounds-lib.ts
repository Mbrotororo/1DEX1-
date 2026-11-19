import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {NOTE_SAMPLES, noteToSfx, type NoteEvent, type SfxEvent} from '../src/core/sfx';
import {SCENES} from '../src/timeline';
import {SOUNDS, TMP, sceneFolder} from './lib';

// Сбор звуковых событий из сцен и музыки + работа с индексом ассетов Mojang.

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
// Запасной индекс ассетов, если манифест версий недоступен
const FALLBACK_INDEX = 'https://piston-meta.mojang.com/v1/packages/331e5c80937c9cd79647ab34bdc1cbb5ef09f456/34.json';
export const CDN = 'https://resources.download.minecraft.net';
const INDEX_CACHE = join(TMP, 'mojang-index.json');

export type AssetIndex = {objects: Record<string, {hash: string; size: number}>};

const getJson = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
};

// Индекс ассетов последнего релиза игры (кэшируется в .tmp на сутки)
export const loadIndex = async (): Promise<AssetIndex> => {
	if (existsSync(INDEX_CACHE)) {
		try {
			const cached = JSON.parse(readFileSync(INDEX_CACHE, 'utf8')) as {at: number; index: AssetIndex};
			if (Date.now() - cached.at < 24 * 3600 * 1000) return cached.index;
		} catch {
			// битый кэш — скачаем заново
		}
	}
	let index: AssetIndex;
	try {
		const manifest = await getJson(MANIFEST);
		const release = manifest.versions.find((v: {id: string}) => v.id === manifest.latest.release);
		const version = await getJson(release.url);
		index = await getJson(version.assetIndex.url);
	} catch (err) {
		console.warn('Манифест версий недоступен, беру запасной индекс:', (err as Error).message);
		index = await getJson(FALLBACK_INDEX);
	}
	mkdirSync(TMP, {recursive: true});
	writeFileSync(INDEX_CACHE, JSON.stringify({at: Date.now(), index}));
	return index;
};

// Все имена звуков в индексе: 'random/pop', 'mob/zombie/say1', ...
export const soundNames = (index: AssetIndex) =>
	Object.keys(index.objects)
		.filter((k) => k.startsWith('minecraft/sounds/') && k.endsWith('.ogg'))
		.map((k) => k.slice('minecraft/sounds/'.length, -'.ogg'.length))
		.sort();

export const soundFile = (name: string) => join(SOUNDS, `${name}.ogg`);

export type SceneSounds = {id: string; start: number; duration: number; events: SfxEvent[]};
export type Collected = {
	scenes: SceneSounds[];
	music: SfxEvent[];
	// сцены, чей sfx.ts не загрузился
	broken: {id: string; error: string}[];
};

const importEvents = async (id: string): Promise<SfxEvent[]> => {
	const mod = await import(`../src/scenes/${sceneFolder(id)}/sfx`);
	if (!Array.isArray(mod.events)) throw new Error(`src/scenes/${id}/sfx.ts должен экспортировать массив events`);
	return mod.events as SfxEvent[];
};

const validate = (id: string, events: SfxEvent[]) => {
	events.forEach((e, i) => {
		if (typeof e.src !== 'string' || !Number.isFinite(e.at)) throw new Error(`${id}: событие №${i} — нужны at (число) и src (строка)`);
		if (/\.ogg$|^\/|^sounds\//.test(e.src)) throw new Error(`${id}: "${e.src}" — имя звука пишется без расширения и без папки sounds/`);
	});
};

// Музыка: ноты из src/music/score.ts, приведённые к обычным событиям
export const loadMusic = async (): Promise<SfxEvent[]> => {
	const mod = await import('../src/music/score');
	const gain = typeof mod.MUSIC_GAIN === 'number' ? mod.MUSIC_GAIN : 1;
	return (mod.SCORE as NoteEvent[]).map((n) => {
		if (!NOTE_SAMPLES[n.inst]) throw new Error(`score.ts: неизвестный инструмент "${n.inst}"`);
		const e = noteToSfx(n);
		return {...e, volume: (e.volume ?? 0.5) * gain};
	});
};

// Звуки всех сцен таймлайна (или одной сцены) + музыка.
// Весь ролик: списки берутся из src/scenes/sfx-registry.ts; если чей-то sfx.ts сломан и реестр
// не загружается, сцены читаются по одной — рабочие собираются, сломанные попадают в broken.
export const collect = async (only?: string): Promise<Collected> => {
	const out: Collected = {scenes: [], music: [], broken: []};
	if (only) {
		const slot = SCENES.find((s) => s.id === only);
		const events = await importEvents(only);
		validate(only, events);
		// сцена вне таймлайна (демо, пример): длительность — по последнему событию
		const duration = slot?.duration ?? Math.max(1, ...events.map((e) => e.at + (e.dur ?? 1)));
		out.scenes.push({id: only, start: slot?.start ?? 0, duration, events});
	} else {
		let registry: Record<string, SfxEvent[]> | null = null;
		try {
			registry = (await import('../src/scenes/sfx-registry')).SCENE_SFX;
		} catch {
			registry = null;
		}
		for (const slot of SCENES) {
			try {
				const events = registry?.[slot.id] ?? (await importEvents(slot.id));
				validate(slot.id, events);
				out.scenes.push({...slot, events});
			} catch (err) {
				out.broken.push({id: slot.id, error: (err as Error).message});
				out.scenes.push({...slot, events: []});
			}
		}
	}
	try {
		out.music = await loadMusic();
	} catch (err) {
		out.broken.push({id: 'music', error: (err as Error).message});
	}
	return out;
};

// Имена всех нужных звуков
export const neededSounds = (c: Collected): string[] => {
	const set = new Set<string>();
	for (const s of c.scenes) for (const e of s.events) set.add(e.src);
	for (const e of c.music) set.add(e.src);
	return [...set].sort();
};
