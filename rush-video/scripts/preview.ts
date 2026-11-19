// Быстрое превью: mp4 960x540, 30 кадров/с, со звуком (если звуки скачаны).
//
//   npm run preview -- --scene=s3-wipe            одна сцена -> out/preview/s3-wipe.mp4
//   npm run preview -- --scene=s3-wipe --from=10 --to=14
//   npm run preview -- --global                   весь ролик -> out/preview/global.mp4
//   ... --fps=60 --full                           полная частота / полный размер
import {getCompositions, openBrowser, renderMedia, selectComposition} from '@remotion/renderer';
import {existsSync, mkdirSync, renameSync, rmSync} from 'node:fs';
import {join, relative} from 'node:path';
import {OUT, PUBLIC, ROOT, parseArgs, runFfmpeg} from './lib';
import {mix} from './mix-audio';
import {bundleTarget, chromiumOptions, logLevel, makeBrowserLog} from './render-lib';

const {flags} = parseArgs(process.argv.slice(2));
const isGlobal = flags.global === true;
const sceneArg = typeof flags.scene === 'string' ? flags.scene : null;
if (!isGlobal && !sceneArg) {
	console.error('Укажи сцену: --scene=<id> (или --global для всего ролика)');
	process.exit(1);
}

const main = async () => {
	const fps = Number(flags.fps ?? 30);
	// звук: сводим заранее; если звуков нет — превью будет немым
	let audio: string | null = null;
	try {
		if (isGlobal) {
			audio = join(PUBLIC, 'audio', 'soundtrack.wav');
			if (!existsSync(audio)) audio = (await mix({quiet: true})).file;
		} else {
			audio = (await mix({only: sceneArg!, quiet: true, lenient: true})).file;
		}
	} catch (err) {
		console.warn(`Звук не сведён (${(err as Error).message}) — превью без звука. Скачать звуки: npm run sounds`);
		audio = null;
	}

	const target = await bundleTarget(isGlobal ? null : sceneArg);
	const browser = await openBrowser('chrome', {chromiumOptions, logLevel});
	const outDir = join(OUT, 'preview');
	mkdirSync(outDir, {recursive: true});
	const silent = join(outDir, `${target.name}.silent.mp4`);
	const final = join(outDir, `${target.name}.mp4`);
	try {
		const inputProps = {fps, audio: false};
		const compId = target.compId ?? (await getCompositions(target.serveUrl, {inputProps, puppeteerInstance: browser, chromiumOptions, logLevel}))[0].id;
		const composition = await selectComposition({serveUrl: target.serveUrl, id: compId, inputProps, puppeteerInstance: browser, chromiumOptions, logLevel});
		const from = Number(flags.from ?? 0);
		const seconds = composition.durationInFrames / composition.fps;
		const to = Math.min(seconds, Number(flags.to ?? seconds));
		const range: [number, number] = [Math.round(from * composition.fps), Math.max(Math.round(from * composition.fps), Math.round(to * composition.fps) - 1)];
		const started = Date.now();
		let lastPrint = 0;
		await renderMedia({
			composition,
			serveUrl: target.serveUrl,
			inputProps,
			codec: 'h264',
			outputLocation: silent,
			frameRange: range,
			scale: flags.full === true ? 1 : 0.5,
			crf: 21,
			imageFormat: 'jpeg',
			jpegQuality: 90,
			muted: true,
			concurrency: Number(flags.jobs ?? 4),
			puppeteerInstance: browser,
			chromiumOptions,
			logLevel,
			onBrowserLog: makeBrowserLog(),
			onProgress: ({renderedFrames}) => {
				if (Date.now() - lastPrint > 5000) {
					lastPrint = Date.now();
					console.log(`  кадров: ${renderedFrames}/${range[1] - range[0] + 1}`);
				}
			},
		});
		const took = (Date.now() - started) / 1000;
		console.log(`Рендер: ${took.toFixed(1)} с (${((range[1] - range[0] + 1) / took).toFixed(1)} кадров/с)`);
		if (audio && existsSync(audio)) {
			// подкладываем сведённый звук (со сдвигом, если превью не с начала)
			runFfmpeg(['-y', '-v', 'error', '-i', silent, '-ss', String(from), '-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', final]);
			rmSync(silent, {force: true});
		} else {
			renameSync(silent, final);
		}
		console.log(`Превью: ${relative(ROOT, final)}  (${final})`);
	} finally {
		// даём вкладкам закрыться самим, иначе браузер ругается на уже закрытые
		await new Promise((r) => setTimeout(r, 400));
		await browser.close({silent: true});
		rmSync(target.serveUrl, {recursive: true, force: true});
	}
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
