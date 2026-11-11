"""Распознаёт озвучку с таймингами слов (faster-whisper).

Запуск: python transcribe.py voice.raw words.json medium
voice.raw — моно 16 кГц s16le: ffmpeg -i voice.ogg -ac 1 -ar 16000 -f s16le voice.raw
"""
import json, sys
from faster_whisper import WhisperModel
src, out, size = sys.argv[1], sys.argv[2], sys.argv[3]
m = WhisperModel(size, device='cpu', compute_type='int8')
import numpy as np
audio = np.fromfile(src, dtype='<i2').astype(np.float32) / 32768.0
segs, info = m.transcribe(audio, language='ru', word_timestamps=True, vad_filter=False, beam_size=5)
words = []
for s in segs:
    print(f'[{s.start:6.2f}-{s.end:6.2f}] {s.text}', flush=True)
    for w in s.words:
        words.append({'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)})
json.dump(words, open(out, 'w'), ensure_ascii=False)
print('WORDS', len(words))
