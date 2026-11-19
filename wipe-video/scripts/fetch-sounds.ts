// Скачивает оригинальные звуки Minecraft с официальных серверов Mojang в public/sounds/.
// Сами звуки в репозиторий не кладём (это ассеты Mojang). Список нужных звуков собирается
// автоматически из sfx.ts всех сцен и из музыки (src/music/score.ts).
//
//   npm run sounds                      скачать недостающее
//   npm run sounds -- --scene=s3-wipe   только звуки одной сцены
//   npm run sounds -- --find breeze     найти имена звуков по подстроке
import {existsSync, mkdirSync, renameSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseArgs} from './lib';
import {CDN, collect, loadIndex, neededSounds, soundFile, soundNames} from './sounds-lib';

const {flags, rest} = parseArgs(process.argv.slice(2));

const find = async (query: string) => {
	const names = soundNames(await loadIndex());
	const q = query.toLowerCase();
	const hits = names.filter((n) => n.toLowerCase().includes(q));
	if (hits.length === 0) {
		console.log(`Ничего не найдено по "${query}". Всего звуков в индексе: ${names.length}`);
		return;
	}
	// варианты с номерами сворачиваем: mob/breeze/hurt1..3
	const groups = new Map<string, string[]>();
	for (const h of hits) {
		const m = /^(.*?)(\d+)$/.exec(h);
		if (!m) groups.set(h, []);
		else groups.set(`${m[1]}#`, [...(groups.get(`${m[1]}#`) ?? []), m[2]]);
	}
	for (const [key, nums] of groups) {
		const base = key.replace(/#$/, '');
		if (nums.length === 0) console.log(base);
		else if (nums.length === 1) console.log(`${base}${nums[0]}`);
		else console.log(`${base}${nums[0]} … ${base}${nums[nums.length - 1]}   (${nums.length} шт.)`);
	}
	console.log(`\nНайдено: ${hits.length}. В sfx.ts имя пишется как есть, например s.add(1.5, '${hits[0]}', 0.6)`);
};

const main = async () => {
	if (flags.find !== undefined) {
		const query = typeof flags.find === 'string' ? flags.find : rest[0];
		if (!query) throw new Error('Что искать? Пример: npm run sounds -- --find breeze');
		await find(query);
		return;
	}
	const only = typeof flags.scene === 'string' ? flags.scene : undefined;
	const collected = await collect(only);
	for (const b of collected.broken) console.error(`ОШИБКА в звуках "${b.id}": ${b.error}`);
	const needed = neededSounds(collected);
	const missing = needed.filter((n) => !existsSync(soundFile(n)));
	if (missing.length === 0) {
		console.log(`Звуки Minecraft уже на месте (${needed.length} шт.)`);
	} else {
		console.log(`Скачиваю ${missing.length} звуков Minecraft с серверов Mojang (всего нужно ${needed.length})...`);
		const index = await loadIndex();
		const names = soundNames(index);
		const unknown: string[] = [];
		let failed = 0;
		let done = 0;
		const queue = [...missing];
		const worker = async () => {
			for (;;) {
				const name = queue.shift();
				if (name === undefined) return;
				const entry = index.objects[`minecraft/sounds/${name}.ogg`];
				if (!entry) {
					unknown.push(name);
					continue;
				}
				const res = await fetch(`${CDN}/${entry.hash.slice(0, 2)}/${entry.hash}`);
				if (!res.ok) {
					console.warn(`  ${res.status}: ${name}`);
					failed++;
					continue;
				}
				const file = soundFile(name);
				mkdirSync(dirname(file), {recursive: true});
				// сначала во временный файл, потом переименование: соседний запуск не прочитает половину файла
				const part = `${file}.${process.pid}.part`;
				writeFileSync(part, Buffer.from(await res.arrayBuffer()));
				renameSync(part, file);
				done++;
			}
		};
		await Promise.all(Array.from({length: 8}, worker));
		console.log(`Скачано: ${done}`);
		if (unknown.length > 0) {
			console.error(`\nНЕТ ТАКИХ ЗВУКОВ в ассетах Minecraft (${unknown.length}):`);
			for (const name of unknown) {
				// подсказка: похожие имена по последнему слову пути
				const dir = name.split('/').slice(0, -1).join('/') + '/';
				const last = name.split('/').pop()!.replace(/\d+$/, '');
				const sameDir = names.filter((n) => n.startsWith(dir));
				const hints = (sameDir.length > 0 ? sameDir : names.filter((n) => n.includes(last))).slice(0, 6);
				const users = collected.scenes.filter((s) => s.events.some((e) => e.src === name)).map((s) => s.id);
				console.error(`  ${name}   (сцены: ${users.join(', ') || 'музыка'})${hints.length ? `   похожие: ${hints.join(', ')}` : ''}`);
			}
			console.error('Поиск имён: npm run sounds -- --find <слово>');
		}
		if (unknown.length > 0 || failed > 0) throw new Error(`Не удалось получить ${unknown.length + failed} звук(ов)`);
		console.log('Готово: public/sounds/');
	}
	if (collected.broken.length > 0) throw new Error(`Сломаны списки звуков: ${collected.broken.map((b) => b.id).join(', ')}`);
};

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
