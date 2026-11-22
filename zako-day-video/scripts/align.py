"""Тайминги слов для субтитров.

Распознаёт каждую реплику из public/voice/ через faster-whisper (с меткой
времени на каждое слово), сопоставляет распознанные слова со словами из
src/script.json и пишет src/words.json: для каждого слова сценария — начало
и конец в секундах от начала реплики. Слова, которые не распознались
(«/sorry», «FPS», цифры), получают время по соседям.

Запуск:  pip install faster-whisper  &&  python3 scripts/align.py
Вызывается после npm run voice (npm run voice делает это сам). Если записал
реплики своим голосом в public/voice/<id>.wav — запусти только этот скрипт:
он же обновит длительности в src/voice.json.
"""

import difflib
import json
import re
import wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent


def norm(word: str) -> str:
    return re.sub(r"[^a-zа-я0-9]", "", word.lower().replace("ё", "е"))


def load_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    # whisper ждёт 16 кГц
    idx = np.arange(0, len(a), sr / 16000)
    return np.interp(idx, np.arange(len(a)), a).astype(np.float32)


def align(words: list[str], heard: list[dict], total: float) -> list[dict]:
    a = [norm(w) for w in words]
    b = [norm(h["w"]) for h in heard]
    times: list[tuple[float, float] | None] = [None] * len(words)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for block in sm.get_opcodes():
        tag, i1, i2, j1, j2 = block
        if tag == "equal":
            for k in range(i2 - i1):
                h = heard[j1 + k]
                times[i1 + k] = (h["s"], h["e"])
        elif tag == "replace" and j2 > j1:
            # кусок сценария произнесён иначе (цифры, латиница) — растягиваем
            # его на время распознанного куска пропорционально длине слов
            s, e = heard[j1]["s"], heard[j2 - 1]["e"]
            lens = [max(1, len(w)) for w in words[i1:i2]]
            acc = s
            for k, ln in enumerate(lens):
                d = (e - s) * ln / sum(lens)
                times[i1 + k] = (acc, acc + d)
                acc += d

    # оставшиеся дыры заполняем интерполяцией между соседями
    i = 0
    while i < len(words):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(words) and times[j] is None:
            j += 1
        s = times[i - 1][1] if i > 0 else 0.05
        e = times[j][0] if j < len(words) else total - 0.05
        lens = [max(1, len(w)) for w in words[i:j]]
        acc = s
        for k, ln in enumerate(lens):
            d = max(0.0, e - s) * ln / sum(lens)
            times[i + k] = (acc, acc + d)
            acc += d
        i = j

    return [{"w": w, "s": round(t[0], 3), "e": round(t[1], 3)} for w, t in zip(words, times)]


def main() -> None:
    script = json.loads((ROOT / "src" / "script.json").read_text(encoding="utf-8"))
    model = WhisperModel("small", device="cpu", compute_type="int8")
    out = {}
    voice_path = ROOT / "src" / "voice.json"
    voice = json.loads(voice_path.read_text(encoding="utf-8")) if voice_path.exists() else {"durations": {}}
    for line in script["lines"]:
        audio = load_wav(ROOT / "public" / "voice" / f"{line['id']}.wav")
        segs, _ = model.transcribe(
            audio, language="ru", word_timestamps=True, initial_prompt=line["text"], beam_size=5
        )
        heard = [{"w": w.word.strip(), "s": w.start, "e": w.end} for s in segs for w in s.words]
        words = line["text"].split()
        out[line["id"]] = align(words, heard, len(audio) / 16000)
        # длительность берём из самого файла: так работают и свои записи голоса
        voice["durations"][line["id"]] = round(len(audio) / 16000, 3)
        print(line["id"], " ".join(h["w"] for h in heard))
    voice_path.write_text(json.dumps(voice, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "src" / "words.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
