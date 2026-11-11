"""Привязка кусков субтитров к словам из распознанной озвучки."""
import difflib, json, re, sys

chunks_path, words_path, out_path = sys.argv[1:4]
beats = json.load(open(chunks_path))
words = json.load(open(words_path))

norm = lambda w: re.sub(r'[^а-яa-z0-9]', '', w.lower().replace('ё', 'е'))

story = []  # (beat, chunk, word)
for bi, chunks in enumerate(beats):
    for ci, c in enumerate(chunks):
        for w in c.replace('*', '').replace('^', '').split():
            n = norm(w)
            if n:
                story.append((bi, ci, n))
asr = [norm(w['w']) for w in words]
sm = difflib.SequenceMatcher(a=[s[2] for s in story], b=asr, autojunk=False)
match = {}
for a, b, size in sm.get_matching_blocks():
    for k in range(size):
        match[a + k] = b + k
print('совпало слов', len(match), 'из', len(story))

# время для каждого слова сюжета: совпавшее или интерполированное по соседям
times = [None] * len(story)
for i in range(len(story)):
    if i in match:
        w = words[match[i]]
        times[i] = (w['s'], w['e'])
for i in range(len(story)):
    if times[i] is None:
        prev = next((times[j] for j in range(i - 1, -1, -1) if times[j]), (0, 0))
        nxt = next((times[j] for j in range(i + 1, len(story)) if times[j]), (prev[1] + 0.4, prev[1] + 0.8))
        times[i] = (prev[1], max(prev[1] + 0.1, nxt[0]))

out = []
for bi, chunks in enumerate(beats):
    row = []
    for ci in range(len(chunks)):
        idx = [i for i, s in enumerate(story) if s[0] == bi and s[1] == ci]
        if not idx:
            row.append(None)
            continue
        row.append({'at': round(times[idx[0]][0], 3), 'end': round(times[idx[-1]][1], 3)})
    out.append(row)
json.dump(out, open(out_path, 'w'), ensure_ascii=False, indent=0)
for bi, row in enumerate(out):
    print(bi, ' | '.join(f"{c['at']:.2f}-{c['end']:.2f} {t}" for c, t in zip(row, beats[bi])))
