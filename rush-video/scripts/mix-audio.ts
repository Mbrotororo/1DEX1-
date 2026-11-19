// Сводит всю звуковую дорожку ролика в один файл public/audio/soundtrack.wav (48 кГц, стерео, 16 бит):
// звуки всех сцен (локальное время + начало сцены; хвосты звучат поверх стыков) и музыку из нотных блоков.
//
//   npm run mix                      весь ролик
//   npm run mix -- --scene=s3-wipe   только одна сцена -> out/audio/s3-wipe.wav
//   npm run mix -- --lenient         не падать, если каких-то звуков нет (вместо них тишина)
//   npm run mix -- --out=/tmp/x.wav  записать в другой файл (проверка громкости, не трогая soundtrack.wav)
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import type {SfxEvent} from '../src/core/sfx';
import {DURATION_S} from '../src/timeline';
import {OUT, PUBLIC, ROOT, ffmpeg, parseArgs, runFfmpeg} from './lib';
import {collect, soundFile, type Collected} from './sounds-lib';

const SR = 48000;
// потолок пиков: -1 дБ
const CEILING = Math.pow(10, -1 / 20);
// Общее усиление перед ограничителем, дБ. YouTube не поднимает тихие ролики: без него мастер был −20.4 LUFS
// (на ~6 дБ тише соседних видео); с ним — около −16 LUFS. Сцены и музыка сводятся как раньше, громче — только итог.
const MASTER_GAIN_DB = 4.85;
// Конец ролика: звук гаснет за последние END_FADE с (картинка — 29.65–30.0, SPEC §3 B7) по равномощной кривой,
// чтобы финальный аккорд на 29.6 вступал в полную силу
const END_FADE = 0.36;

type Pcm = {l: Float32Array; r: Float32Array};
const cache = new Map<string, Pcm | null>();

// Один .ogg -> стерео float 48 кГц (декодируем каждый файл один раз)
const decode = (name: string): Pcm | null => {
	if (cache.has(name)) return cache.get(name)!;
	const file = soundFile(name);
	let pcm: Pcm | null = null;
	if (existsSync(file)) {
		const raw = runFfmpeg(['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), 'pipe:1']);
		const data = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
		const n = Math.floor(data.length / 2);
		pcm = {l: new Float32Array(n), r: new Float32Array(n)};
		for (let i = 0; i < n; i++) {
			pcm.l[i] = data[i * 2];
			pcm.r[i] = data[i * 2 + 1];
		}
	}
	cache.set(name, pcm);
	return pcm;
};

type Bus = {l: Float32Array; r: Float32Array};
const makeBus = (seconds: number): Bus => ({l: new Float32Array(Math.ceil(seconds * SR)), r: new Float32Array(Math.ceil(seconds * SR))});

// Положить одно событие в шины (сухую и реверберации)
const addEvent = (e: SfxEvent, shift: number, dry: Bus, wet: Bus): boolean => {
	const src = decode(e.src);
	if (!src) return false;
	const rate = Math.max(0.05, e.rate ?? 1);
	const volume = e.volume ?? 0.5;
	const offset = Math.max(0, (e.offset ?? 0) * SR);
	const natural = Math.max(0, (src.l.length - offset) / rate);
	const len = Math.floor(Math.min(natural, e.dur !== undefined ? e.dur * SR : Infinity));
	if (len <= 0) return true;
	const start = Math.round((e.at + shift) * SR);
	const fadeIn = Math.max(0, (e.fadeIn ?? 0) * SR);
	// если звук обрезан по dur без затухания — всё равно короткий спад, чтобы не щёлкало
	const fadeOut = e.fade !== undefined ? e.fade * SR : e.dur !== undefined && len < natural - 1 ? 0.008 * SR : 0;
	const pan = Math.max(-1, Math.min(1, e.pan ?? 0));
	// равномощная панорама; в центре оба канала = 1
	const gl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2 * volume;
	const gr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2 * volume;
	const send = Math.max(0, e.reverb ?? 0);
	const lp = e.lowpass !== undefined ? 1 - Math.exp((-2 * Math.PI * e.lowpass) / SR) : 1;
	let yl = 0;
	let yr = 0;
	for (let i = 0; i < len; i++) {
		const o = start + i;
		if (o >= dry.l.length) break;
		// линейная интерполяция при смене скорости
		const p = offset + i * rate;
		const i0 = Math.floor(p);
		const f = p - i0;
		const i1 = Math.min(i0 + 1, src.l.length - 1);
		let sl = src.l[i0] + (src.l[i1] - src.l[i0]) * f;
		let sr = src.r[i0] + (src.r[i1] - src.r[i0]) * f;
		if (lp < 1) {
			yl += lp * (sl - yl);
			yr += lp * (sr - yr);
			sl = yl;
			sr = yr;
		}
		let env = 1;
		if (fadeIn > 0 && i < fadeIn) env *= i / fadeIn;
		if (fadeOut > 0 && i > len - fadeOut) env *= Math.max(0, (len - i) / fadeOut);
		if (o < 0) continue;
		const a = sl * gl * env;
		const b = sr * gr * env;
		dry.l[o] += a;
		dry.r[o] += b;
		if (send > 0) {
			wet.l[o] += a * send;
			wet.r[o] += b * send;
		}
	}
	return true;
};

// Простая реверберация (гребенчатые фильтры + всепропускающие): эхо подземелья
const reverb = (input: Float32Array, spread: number): Float32Array => {
	const out = new Float32Array(input.length);
	const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round(((d + spread) * SR) / 44100));
	const feedback = 0.82;
	const damp = 0.25;
	for (const d of combs) {
		const buf = new Float32Array(d);
		let idx = 0;
		let store = 0;
		for (let i = 0; i < input.length; i++) {
			const y = buf[idx];
			store = y * (1 - damp) + store * damp;
			buf[idx] = input[i] + store * feedback;
			out[i] += y;
			if (++idx >= d) idx = 0;
		}
	}
	for (const d0 of [556, 441, 341, 225]) {
		const d = Math.round(((d0 + spread) * SR) / 44100);
		const buf = new Float32Array(d);
		let idx = 0;
		for (let i = 0; i < out.length; i++) {
			const b = buf[idx];
			const x = out[i];
			out[i] = b - x;
			buf[idx] = x + b * 0.5;
			if (++idx >= d) idx = 0;
		}
	}
	const gain = 0.045;
	for (let i = 0; i < out.length; i++) out[i] *= gain;
	return out;
};

const db = (v: number) => (v <= 1e-9 ? '-inf' : (20 * Math.log10(v)).toFixed(1));
const stats = (bus: Bus, from: number, to: number) => {
	const a = Math.max(0, Math.floor(from * SR));
	const b = Math.min(bus.l.length, Math.ceil(to * SR));
	let peak = 0;
	let sum = 0;
	for (let i = a; i < b; i++) {
		const l = Math.abs(bus.l[i]);
		const r = Math.abs(bus.r[i]);
		if (l > peak) peak = l;
		if (r > peak) peak = r;
		sum += l * l + r * r;
	}
	return {peak, rms: Math.sqrt(sum / Math.max(1, (b - a) * 2))};
};

// Мягкий ограничитель с заглядыванием вперёд: пики не выше CEILING, без искажений формы
export const limiter = (bus: Bus) => {
	const n = bus.l.length;
	const look = Math.round(0.005 * SR);
	const want = new Float32Array(n);
	let maxReduction = 1;
	for (let i = 0; i < n; i++) {
		const p = Math.max(Math.abs(bus.l[i]), Math.abs(bus.r[i]));
		want[i] = p > CEILING ? CEILING / p : 1;
		if (want[i] < maxReduction) maxReduction = want[i];
	}
	if (maxReduction >= 1) return 1;
	// минимум в окне [i, i + look] (монотонная очередь)
	const win = new Float32Array(n);
	const dq = new Int32Array(n);
	let head = 0;
	let tail = 0;
	let j = 0;
	for (let i = 0; i < n; i++) {
		while (j < n && j <= i + look) {
			while (tail > head && want[dq[tail - 1]] >= want[j]) tail--;
			dq[tail++] = j++;
		}
		while (dq[head] < i) head++;
		win[i] = want[dq[head]];
	}
	// плавное отпускание (80 мс) и сглаживание атаки средним по окну
	const rel = 1 - Math.exp(-1 / (0.08 * SR));
	let g = 1;
	const g1 = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		g = Math.min(win[i], g + (1 - g) * rel);
		g1[i] = g;
	}
	let acc = 0;
	for (let i = 0; i < n; i++) {
		acc += g1[i];
		if (i >= look) acc -= g1[i - look];
		const avg = acc / Math.min(i + 1, look);
		const gain = Math.min(avg, want[i]);
		bus.l[i] *= gain;
		bus.r[i] *= gain;
	}
	return maxReduction;
};

const writeWav = (file: string, bus: Bus) => {
	const n = bus.l.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(bus.l[i] * 32767))), 44 + i * 4);
		buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(bus.r[i] * 32767))), 46 + i * 4);
	}
	mkdirSync(dirname(file), {recursive: true});
	writeFileSync(file, buf);
};

// Интегральная громкость по EBU R128 (если у ffmpeg есть фильтр ebur128)
const loudness = (file: string): string | null => {
	const [cmd, ...pre] = ffmpeg();
	const res = spawnSync(cmd, [...pre, '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], {encoding: 'utf8', cwd: ROOT});
	const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(res.stderr ?? '');
	return m ? `${m[1]} LUFS` : null;
};

export type MixResult = {file: string; missing: string[]; events: number};

// Свести дорожку. only — id одной сцены (тогда время локальное и файл out/audio/<id>.wav)
export const mix = async (opts: {only?: string; lenient?: boolean; quiet?: boolean; out?: string} = {}): Promise<MixResult> => {
	const log = (s: string) => {
		if (!opts.quiet) console.log(s);
	};
	const collected: Collected = await collect(opts.only);
	for (const b of collected.broken) console.error(`ОШИБКА в звуках "${b.id}": ${b.error}`);
	const single = opts.only !== undefined;
	const base = single ? collected.scenes[0].start : 0;
	const length = single ? collected.scenes[0].duration : DURATION_S;
	// у одной сцены оставляем хвост в 2 с, чтобы услышать, как звуки доигрывают
	const total = single ? length + 2 : length;
	const dry = makeBus(total);
	const wet = makeBus(total);
	const missing = new Set<string>();
	let count = 0;

	const perScene: {id: string; start: number; duration: number; events: number}[] = [];
	for (const scene of collected.scenes) {
		const shift = single ? 0 : scene.start;
		for (const e of scene.events) {
			if (addEvent(e, shift, dry, wet)) count++;
			else missing.add(e.src);
		}
		perScene.push({id: scene.id, start: single ? 0 : scene.start, duration: scene.duration, events: scene.events.length});
	}
	let notes = 0;
	for (const e of collected.music) {
		// музыка — в глобальном времени; для одной сцены берём её отрезок
		const at = e.at - base;
		if (at < -0.001 || at > total) continue;
		if (addEvent({...e, at}, 0, dry, wet)) notes++;
		else missing.add(e.src);
	}

	if (missing.size > 0) {
		console.error(`НЕТ ФАЙЛОВ ЗВУКОВ (${missing.size}): ${[...missing].join(', ')}`);
		console.error('Сначала скачай их: npm run sounds');
		if (!opts.lenient) throw new Error('Не хватает звуков — дорожка не сведена (или запусти с --lenient)');
	}

	// реверберация: левый и правый каналы с чуть разными задержками — объёмнее
	let wetUsed = false;
	for (let i = 0; i < wet.l.length; i += 97) {
		if (wet.l[i] !== 0 || wet.r[i] !== 0) {
			wetUsed = true;
			break;
		}
	}
	if (wetUsed) {
		const rl = reverb(wet.l, 0);
		const rr = reverb(wet.r, 23);
		for (let i = 0; i < dry.l.length; i++) {
			dry.l[i] += rl[i];
			dry.r[i] += rr[i];
		}
	}

	// в самом конце ролика звук плавно затухает (последние END_FADE с, равномощно: cos)
	if (!single) {
		const fade = Math.round(END_FADE * SR);
		for (let i = 0; i < fade; i++) {
			const g = Math.cos(((i + 1) / fade) * (Math.PI / 2));
			const o = dry.l.length - fade + i;
			dry.l[o] *= g;
			dry.r[o] *= g;
		}
	}

	// общее усиление мастера (и в дорожке сцены — чтобы превью сцены звучало как итог)
	const master = Math.pow(10, MASTER_GAIN_DB / 20);
	for (let i = 0; i < dry.l.length; i++) {
		dry.l[i] *= master;
		dry.r[i] *= master;
	}

	const before = stats(dry, 0, total);
	const reduction = limiter(dry);
	const after = stats(dry, 0, total);

	const file = opts.out ?? (single ? join(OUT, 'audio', `${collected.scenes[0].id.replace(/^_/, '')}.wav`) : join(PUBLIC, 'audio', 'soundtrack.wav'));
	writeWav(file, dry);

	log(`\nДорожка: ${relative(ROOT, file)}  (${total.toFixed(1)} с, 48 кГц, стерео, 16 бит)`);
	log(`Событий: ${count}${notes ? ` + нот: ${notes}` : ''}; разных звуков: ${cache.size}; не найдено файлов: ${missing.size}`);
	log(`Усиление мастера: +${MASTER_GAIN_DB.toFixed(2)} дБ`);
	log(`Пик до ограничителя: ${db(before.peak)} дБ; после: ${db(after.peak)} дБ (потолок -1.0); макс. снижение: ${db(reduction)} дБ`);
	log(`RMS: ${db(after.rms)} дБ${reduction < 0.5 ? '   ВНИМАНИЕ: ограничитель давит больше 6 дБ — убавь громкости' : ''}`);
	const lufs = loudness(file);
	if (lufs) log(`Громкость (EBU R128): ${lufs}`);
	log('\nПо сценам:   событий    пик, дБ   RMS, дБ');
	for (const s of perScene) {
		const st = stats(dry, s.start, s.start + s.duration);
		log(`  ${s.id.padEnd(12)} ${String(s.events).padStart(6)}   ${db(st.peak).padStart(8)}  ${db(st.rms).padStart(8)}`);
	}
	if (collected.broken.length > 0 && !opts.lenient) throw new Error(`Сломаны списки звуков: ${collected.broken.map((b) => b.id).join(', ')}`);
	return {file, missing: [...missing], events: count + notes};
};

// запуск из командной строки
if (process.argv[1] && /mix-audio\.ts$/.test(process.argv[1])) {
	const {flags} = parseArgs(process.argv.slice(2));
	mix({only: typeof flags.scene === 'string' ? flags.scene : undefined, lenient: flags.lenient === true, out: typeof flags.out === 'string' ? flags.out : undefined}).catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
