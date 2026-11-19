// Кадры и контактные листы сцен.
//
//   npm run shots -- --scene=s3-wipe 0.5 2 7.25       кадры в моменты локального времени сцены (960x540)
//   npm run shots -- --scene=s3-wipe --full 12         то же в 1920x1080
//   npm run shots -- --scene=s3-wipe --sheet           контактный лист всей сцены (кадр в секунду)
//   npm run shots -- --scene=s3-wipe --sheet --step=0.5 --from=10 --to=16
//   npm run shots -- --scene=s3-wipe --bench 12        замер: 6 кадров подряд в 1920x1080, мс на кадр
//   npm run shots -- --global 31 52.5                  кадры всего ролика по глобальному времени
//   npm run shots -- --global --sheet --step=5
//
// Для сцены собирается ТОЛЬКО она (временная точка входа), поэтому чужой сломанный файл не мешает.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderFrames, renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync, readdirSync, rmSync, writeFileSync, copyFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {OUT, PUBLIC, ROOT, TMP, parseArgs, runFfmpeg, sceneFolder} from './lib';

const {flags, rest} = parseArgs(process.argv.slice(2));
const isGlobal = flags.global === true;
const sceneArg = typeof flags.scene === 'string' ? flags.scene : null;
if (!isGlobal && !sceneArg) {
	console.error('Укажи сцену: --scene=<id> (или --global для всего ролика)');
	process.exit(1);
}
const full = flags.full === true;
const sheet = flags.sheet === true;
const bench = flags.bench === true;
const jobs = Math.max(1, Number(flags.jobs ?? 2));
const times = rest.map(Number).filter((n) => Number.isFinite(n));
const chromiumOptions = {gl: 'swangle' as const};
const logLevel = 'error' as const;

const log = (msg: string) => console.log(msg);

const main = async () => {
	mkdirSync(TMP, {recursive: true});
	let entryPoint: string;
	let compId: string;
	let name: string;
	if (isGlobal) {
		entryPoint = join(ROOT, 'src', 'index.ts');
		compId = 'WipeVideo';
		name = 'global';
	} else {
		const folder = sceneFolder(sceneArg!);
		name = folder.replace(/^_/, '');
		entryPoint = join(TMP, `entry-${name}.tsx`);
		// точка входа только с этой сценой
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
		compId = '';
	}
	const outDir = join(OUT, 'shots', name);
	mkdirSync(outDir, {recursive: true});

	const t0 = Date.now();
	const serveUrl = await bundle({
		entryPoint,
		publicDir: PUBLIC,
		symlinkPublicDir: true,
		// у каждой сцены свой кэш сборки, чтобы параллельные запуски не мешали друг другу
		webpackOverride: (config) => ({...config, cache: config.cache && typeof config.cache === 'object' ? {...config.cache, name: `shots-${name}`} : config.cache}),
	});
	log(`Сборка: ${((Date.now() - t0) / 1000).toFixed(1)} с`);

	const browser = await openBrowser('chrome', {chromiumOptions, logLevel});
	const seen = new Set<string>();
	const onBrowserLog = (l: {type: string; text: string}) => {
		if (l.type !== 'error' && l.type !== 'warning' && l.type !== 'log') return;
		if (/Download the React DevTools|GPU stall|WebGL.*deprecated|GL Driver Message|THREE\.Clock/i.test(l.text)) return;
		const key = `${l.type}:${l.text}`;
		if (seen.has(key)) return;
		seen.add(key);
		log(`  [браузер ${l.type}] ${l.text}`);
	};

	try {
		const inputProps = {audio: false, stamp: sheet};
		if (!compId) {
			// id композиции = id сцены из её SceneDef
			const {getCompositions} = await import('@remotion/renderer');
			const comps = await getCompositions(serveUrl, {inputProps, puppeteerInstance: browser, chromiumOptions, logLevel});
			compId = comps[0].id;
		}
		const composition = await selectComposition({serveUrl, id: compId, inputProps, puppeteerInstance: browser, chromiumOptions, logLevel});
		const fps = composition.fps;
		const last = composition.durationInFrames - 1;
		const seconds = composition.durationInFrames / fps;
		const toFrame = (t: number) => Math.min(last, Math.max(0, Math.round(t * fps)));

		if (bench) {
			// замер: несколько кадров подряд в одной вкладке, полный размер
			const start = toFrame(times[0] ?? 0);
			const count = Number(flags.frames ?? 6);
			const dir = join(TMP, `bench-${name}`);
			rmSync(dir, {recursive: true, force: true});
			mkdirSync(dir, {recursive: true});
			const ms: number[] = [];
			await renderFrames({
				composition,
				serveUrl,
				inputProps,
				outputDir: dir,
				frameRange: [start, Math.min(last, start + count - 1)],
				imageFormat: 'jpeg',
				concurrency: 1,
				puppeteerInstance: browser,
				chromiumOptions,
				logLevel,
				onBrowserLog,
				onStart: () => undefined,
				onFrameUpdate: (_n, _frame, time) => ms.push(time),
			});
			const warm = ms.slice(1);
			const avg = warm.length ? warm.reduce((a, b) => a + b, 0) / warm.length : ms[0];
			log(`Замер ${name} с t=${(start / fps).toFixed(2)} (1920x1080, одна вкладка):`);
			log(`  первый кадр (с постройкой мира): ${Math.round(ms[0])} мс`);
			log(`  следующие: ${warm.map((m) => Math.round(m)).join(', ')} мс; среднее ${Math.round(avg)} мс`);
			return;
		}

		if (sheet) {
			const step = Number(flags.step ?? (isGlobal ? 5 : 1));
			const from = Number(flags.from ?? 0);
			const to = Math.min(seconds, Number(flags.to ?? seconds));
			const nth = Math.max(1, Math.round(step * fps));
			const first = toFrame(from);
			const end = Math.min(last, Math.max(first, Math.ceil(to * fps) - 1));
			const dir = join(TMP, `sheet-${name}`);
			rmSync(dir, {recursive: true, force: true});
			mkdirSync(dir, {recursive: true});
			const t1 = Date.now();
			let done = 0;
			await renderFrames({
				composition,
				serveUrl,
				inputProps,
				outputDir: dir,
				frameRange: [first, end],
				everyNthFrame: nth,
				imageFormat: 'png',
				scale: 0.25,
				concurrency: Math.max(jobs, 3),
				puppeteerInstance: browser,
				chromiumOptions,
				logLevel,
				onBrowserLog,
				onStart: ({frameCount}) => log(`Лист: ${frameCount} кадров, шаг ${step} с`),
				onFrameUpdate: () => {
					done++;
				},
			});
			const files = readdirSync(dir)
				.filter((f) => f.endsWith('.png'))
				.sort();
			log(`Кадры: ${done} шт. за ${((Date.now() - t1) / 1000).toFixed(1)} с`);
			// раскладываем по 16 на лист (4x4)
			const sheets: string[] = [];
			for (let i = 0; i < files.length; i += 16) {
				const chunk = files.slice(i, i + 16);
				const part = join(dir, `part-${i}`);
				mkdirSync(part, {recursive: true});
				chunk.forEach((f, j) => copyFileSync(join(dir, f), join(part, `${String(j).padStart(3, '0')}.png`)));
				const cols = Math.min(4, chunk.length);
				const rows = Math.ceil(chunk.length / cols);
				const suffix = flags.from !== undefined || flags.to !== undefined ? `-${from}-${to}` : '';
				const file = join(outDir, `sheet${suffix}-${String(i / 16 + 1).padStart(2, '0')}.png`);
				runFfmpeg(['-y', '-loglevel', 'error', '-framerate', '1', '-i', join(part, '%03d.png'), '-vf', `tile=${cols}x${rows}:padding=4:margin=4:color=0x202020`, '-frames:v', '1', file]);
				sheets.push(file);
			}
			log('Контактные листы:');
			for (const s of sheets) log(`  ${relative(ROOT, s)}  (${s})`);
			return;
		}

		if (times.length === 0) {
			console.error('Нет моментов времени. Пример: npm run shots -- --scene=s3-wipe 0.5 2 7.25  (или --sheet)');
			process.exitCode = 1;
			return;
		}
		// отдельные кадры: по jobs штук одновременно
		const queue = [...times];
		const results: {t: number; file: string; ms: number}[] = [];
		const worker = async () => {
			for (;;) {
				const t = queue.shift();
				if (t === undefined) return;
				const file = join(outDir, `t${t.toFixed(2).padStart(6, '0')}${full ? '-full' : ''}.png`);
				const started = Date.now();
				await renderStill({
					composition,
					serveUrl,
					inputProps: {audio: false, stamp: flags.stamp === true},
					output: file,
					frame: toFrame(t),
					imageFormat: 'png',
					scale: full ? 1 : 0.5,
					puppeteerInstance: browser,
					chromiumOptions,
					logLevel,
					onBrowserLog,
				});
				results.push({t, file, ms: Date.now() - started});
			}
		};
		await Promise.all(Array.from({length: Math.min(jobs, times.length)}, worker));
		results.sort((a, b) => a.t - b.t);
		log(`Кадры (${full ? '1920x1080' : '960x540'}; время включает загрузку страницы и постройку мира):`);
		for (const r of results) log(`  t=${r.t.toFixed(2)}  ${String(r.ms).padStart(5)} мс  ${relative(ROOT, r.file)}`);
	} finally {
		await browser.close({silent: true});
		rmSync(serveUrl, {recursive: true, force: true});
	}
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
