import React from 'react';
import {useCurrentFrame} from 'remotion';
import {easeOutBack, prog} from '../lib/anim';
import {FPS, LINES, type Word} from '../lib/timeline';

// Субтитры в стиле TikTok: по 2–3 слова, текущее слово подсвечено.
type Chunk = {words: Word[]; s: number; e: number};

const MAX_CHARS = 17;

const chunkLine = (words: Word[]): Chunk[] => {
	// тире не живёт отдельно — приклеиваем к предыдущему слову
	const merged: Word[] = [];
	for (const w of words) {
		if (/^[—–-]$/.test(w.w) && merged.length) merged[merged.length - 1] = {...merged[merged.length - 1], w: `${merged[merged.length - 1].w} —`};
		else merged.push({...w});
	}
	const chunks: Chunk[] = [];
	let cur: Word[] = [];
	const flush = () => {
		if (cur.length) chunks.push({words: cur, s: cur[0].s, e: cur[cur.length - 1].e});
		cur = [];
	};
	for (const w of merged) {
		const len = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
		if (cur.length >= 3 || (cur.length > 0 && len > MAX_CHARS)) flush();
		cur.push(w);
		if (/[.,!?:»]$/.test(w.w)) flush();
	}
	flush();
	// фраза держится на экране до начала следующей
	for (let i = 0; i < chunks.length - 1; i++) chunks[i].e = Math.max(chunks[i].e, chunks[i + 1].s);
	if (chunks.length) chunks[chunks.length - 1].e += 0.35;
	return chunks;
};

const ALL = LINES.flatMap((l) =>
	chunkLine(l.words).map((c) => ({
		words: c.words.map((w) => ({...w, s: w.s + l.start + l.voiceAt, e: w.e + l.start + l.voiceAt})),
		s: c.s + l.start + l.voiceAt,
		e: c.e + l.start + l.voiceAt,
	})),
);

const STROKE = 14;

export const Subtitles: React.FC = () => {
	const t = useCurrentFrame() / FPS;
	const chunk = ALL.find((c) => t >= c.s && t < c.e);
	if (!chunk) return null;
	const pop = easeOutBack(prog(t, chunk.s, 0.14), 2.2);
	return (
		<div
			style={{
				position: 'absolute',
				left: 70,
				right: 70,
				top: 1215,
				display: 'flex',
				flexWrap: 'wrap',
				justifyContent: 'center',
				gap: '0 36px',
				transform: `scale(${0.75 + 0.25 * pop})`,
				fontFamily: 'Rubik',
				fontWeight: 900,
				fontSize: 92,
				lineHeight: 1.08,
				textAlign: 'center',
				textTransform: 'uppercase',
			}}
		>
			{chunk.words.map((w, i) => {
				const active = t >= w.s - 0.03 && t < (chunk.words[i + 1]?.s ?? chunk.e);
				return (
					<span
						key={i}
						style={{
							color: active ? '#ffd23a' : '#ffffff',
							WebkitTextStroke: `${STROKE}px #000`,
							paintOrder: 'stroke fill',
							textShadow: '0 8px 0 rgba(0,0,0,0.45)',
							display: 'inline-block',
							transform: active ? 'scale(1.08) rotate(-2deg)' : 'none',
						}}
					>
						{w.w}
					</span>
				);
			})}
		</div>
	);
};
