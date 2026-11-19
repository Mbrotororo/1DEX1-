import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Общие помощники скриптов.

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC = join(ROOT, 'public');
export const SOUNDS = join(PUBLIC, 'sounds');
export const OUT = join(ROOT, 'out');
export const TMP = join(ROOT, '.tmp');

// Разбор аргументов: --key=value, --flag и позиционные
export const parseArgs = (argv: string[]) => {
	const flags: Record<string, string | true> = {};
	const rest: string[] = [];
	for (const a of argv) {
		const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
		if (m) flags[m[1]] = m[2] ?? true;
		else rest.push(a);
	}
	return {flags, rest};
};

// Папка сцены по id: 'demo' -> src/scenes/_demo
export const sceneFolder = (id: string): string => {
	for (const name of [id, `_${id}`, id.replace(/^_/, '')]) {
		if (existsSync(join(ROOT, 'src', 'scenes', name, 'index.tsx'))) return name;
	}
	throw new Error(`Нет сцены "${id}" (ожидается src/scenes/${id}/index.tsx)`);
};

let ffmpegCmd: string[] | null = null;
// ffmpeg из системы, а если его нет — тот, что идёт вместе с Remotion
export const ffmpeg = (): string[] => {
	if (ffmpegCmd) return ffmpegCmd;
	const probe = spawnSync('ffmpeg', ['-version'], {stdio: 'ignore'});
	ffmpegCmd = probe.status === 0 ? ['ffmpeg'] : ['npx', 'remotion', 'ffmpeg'];
	return ffmpegCmd;
};

export const runFfmpeg = (args: string[], opts: {input?: Buffer; maxBuffer?: number} = {}): Buffer => {
	const [cmd, ...pre] = ffmpeg();
	return execFileSync(cmd, [...pre, ...args], {input: opts.input, maxBuffer: opts.maxBuffer ?? 1 << 30, stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT});
};
