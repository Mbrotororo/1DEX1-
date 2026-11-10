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
	'dig/stone1',
	'dig/stone2',
	'dig/stone3',
	'dig/stone4',
	'dig/grass1',
	'dig/grass2',
	'dig/grass3',
	'dig/grass4',
	'dig/wood1',
	'dig/wood2',
	'dig/wood3',
	'dig/wood4',
	'step/grass1',
	'step/grass2',
	'step/grass3',
	'random/pop',
	'random/orb',
	'random/levelup',
	'random/click',
	'damage/fallsmall',
	'block/amethyst/place1',
	'block/amethyst/place2',
	'block/amethyst/place3',
	'block/amethyst/place4',
	'block/amethyst/resonate1',
	'block/amethyst/resonate2',
	'block/amethyst/resonate3',
	'block/amethyst/resonate4',
	'block/amethyst/shimmer',
	'block/beacon/activate',
	'block/beacon/power1',
	'block/beacon/power2',
	'block/conduit/activate',
	'block/conduit/attack1',
	'block/enchantment_table/enchant1',
	'ambient/weather/thunder1',
	'item/trident/thunder1',
	'item/trident/riptide1',
	'item/bucket/empty1',
	'item/bucket/empty2',
	'item/bucket/empty3',
	'liquid/water',
	'liquid/splash',
	'liquid/splash2',
	'liquid/heavy_splash',
	'liquid/swim1',
	'liquid/swim2',
	'liquid/swim3',
	'liquid/swim4',
	'random/splash',
	'ambient/underwater/enter1',
	'ambient/underwater/enter2',
	'ambient/underwater/enter3',
	'block/bubble_column/bubble1',
	'block/bubble_column/bubble2',
	'block/bubble_column/bubble3',
	'block/bubble_column/upwards_ambient1',
	'entity/boat/paddle_water1',
	'entity/boat/paddle_water2',
	'entity/boat/paddle_water3',
	'ui/toast/challenge_complete',
	'fireworks/launch1',
	'fireworks/blast1',
	'fireworks/largeblast1',
	'fireworks/twinkle1',
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
