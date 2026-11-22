// Скачивает оригинальные звуки Minecraft с официальных серверов Mojang
// в папку public/sounds/. Сами звуки в репозиторий не кладём (это ассеты Mojang),
// поэтому они подтягиваются этим скриптом перед предпросмотром/рендером.
//
// Запуск: npm run sounds
import {mkdir, writeFile, access} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'sounds');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
// Запасной индекс ассетов, если манифест версий недоступен
const FALLBACK_INDEX =
	'https://piston-meta.mojang.com/v1/packages/331e5c80937c9cd79647ab34bdc1cbb5ef09f456/34.json';
const CDN = 'https://resources.download.minecraft.net';

// Список звуков, которые использует ролик (пути как в ассетах игры)
export const SOUNDS = [
	'random/pop',
	'random/orb',
	'random/levelup',
	'random/click',
	'random/fuse',
	'random/explode1',
	'random/chestopen',
	'note/pling',
	'note/bell',
	'note/hat',
	'note/bass',
	'mob/villager/no1',
	'mob/villager/yes1',
	'mob/villager/haggle1',
	'damage/fallsmall',
	'step/wood1',
	'step/wood2',
	'step/snow1',
	'dig/snow1',
	'ui/toast/in',
	'ui/toast/challenge_complete',
];

const exists = (p) =>
	access(p).then(
		() => true,
		() => false,
	);

const getJson = async (url) => {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
};

const loadIndex = async () => {
	try {
		const manifest = await getJson(MANIFEST);
		const release = manifest.versions.find((v) => v.id === manifest.latest.release);
		const version = await getJson(release.url);
		return await getJson(version.assetIndex.url);
	} catch (err) {
		console.warn('Манифест версий недоступен, беру запасной индекс:', err.message);
		return getJson(FALLBACK_INDEX);
	}
};

const main = async () => {
	const missing = [];
	for (const name of SOUNDS) {
		if (!(await exists(join(OUT, `${name}.ogg`)))) missing.push(name);
	}
	if (missing.length === 0) {
		console.log(`Звуки Minecraft уже на месте (${SOUNDS.length} шт.)`);
		return;
	}

	console.log(`Скачиваю ${missing.length} звуков Minecraft с серверов Mojang...`);
	const index = await loadIndex();
	let failed = 0;
	for (const name of missing) {
		const entry = index.objects[`minecraft/sounds/${name}.ogg`];
		if (!entry) {
			console.warn(`  нет в индексе: ${name}`);
			failed++;
			continue;
		}
		const url = `${CDN}/${entry.hash.slice(0, 2)}/${entry.hash}`;
		const res = await fetch(url);
		if (!res.ok) {
			console.warn(`  ${res.status}: ${name}`);
			failed++;
			continue;
		}
		const file = join(OUT, `${name}.ogg`);
		await mkdir(dirname(file), {recursive: true});
		await writeFile(file, Buffer.from(await res.arrayBuffer()));
	}
	if (failed > 0) {
		throw new Error(`Не удалось скачать ${failed} звук(ов)`);
	}
	console.log('Готово: public/sounds/');
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
