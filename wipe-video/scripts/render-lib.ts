import {bundle} from '@remotion/bundler';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PUBLIC, ROOT, TMP, sceneFolder} from './lib';

// Сборка бандла для рендера: либо весь ролик, либо ТОЛЬКО одна сцена (временная точка входа),
// чтобы чужой сломанный файл в соседней папке не мешал.

export const chromiumOptions = {gl: 'swangle' as const};
export const logLevel = 'error' as const;

export type Target = {
	// имя для папок вывода: 's3-wipe', 'demo', 'global'
	name: string;
	// id композиции (для сцены определяется после сборки — он один)
	compId: string | null;
	serveUrl: string;
};

export const bundleTarget = async (scene: string | null): Promise<Target> => {
	mkdirSync(TMP, {recursive: true});
	let entryPoint: string;
	let name: string;
	if (scene === null) {
		entryPoint = join(ROOT, 'src', 'index.ts');
		name = 'global';
	} else {
		const folder = sceneFolder(scene);
		name = folder.replace(/^_/, '');
		entryPoint = join(TMP, `entry-${name}.tsx`);
		writeFileSync(
			entryPoint,
			[
				`import React from 'react';`,
				`import {registerRoot} from 'remotion';`,
				`import {sceneComposition} from '../src/core/player';`,
				`import {scene} from '../src/scenes/${folder}';`,
				`registerRoot(() => <>{sceneComposition(scene)}</>);`,
				``,
			].join('\n'),
		);
	}
	const started = Date.now();
	const serveUrl = await bundle({
		entryPoint,
		publicDir: PUBLIC,
		symlinkPublicDir: true,
		// у каждой сцены свой кэш сборки, чтобы параллельные запуски не мешали друг другу
		webpackOverride: (config) => ({...config, cache: config.cache && typeof config.cache === 'object' ? {...config.cache, name: `wipe-${name}`} : config.cache}),
	});
	console.log(`Сборка (${name}): ${((Date.now() - started) / 1000).toFixed(1)} с`);
	return {name, compId: scene === null ? 'WipeVideo' : null, serveUrl};
};

// Сообщения из браузера: печатаем ошибки и console.log сцены, без повторов и шума three
export const makeBrowserLog = () => {
	const seen = new Set<string>();
	return (l: {type: string; text: string}) => {
		if (l.type !== 'error' && l.type !== 'warning' && l.type !== 'log') return;
		if (/Download the React DevTools|GPU stall|WebGL.*deprecated|GL Driver Message|THREE\.Clock/i.test(l.text)) return;
		const key = `${l.type}:${l.text}`;
		if (seen.has(key)) return;
		seen.add(key);
		console.log(`  [браузер ${l.type}] ${l.text}`);
	};
};
