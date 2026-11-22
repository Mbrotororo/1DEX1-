"""Озвучка ролика нейросетевым голосом Piper (работает офлайн, на CPU).

Читает src/script.json, для каждой реплики пишет public/voice/<id>.wav
и сохраняет длительности в src/voice.json (по ним строится таймлайн).

Запуск:  pip install piper-tts  &&  npm run voice
Голос по умолчанию — ru_RU-denis-medium, скачивается сам в scripts/.voices/.
Другой голос: VOICE=ru_RU-dmitri-medium npm run voice
Скорость речи: SPEED=1.15 npm run voice  (больше — быстрее)
"""

import json
import os
import urllib.request
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
VOICE = os.environ.get("VOICE", "ru_RU-denis-medium")
SPEED = float(os.environ.get("SPEED", "1.12"))
VOICES_DIR = ROOT / "scripts" / ".voices"
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU"


def ensure_voice() -> Path:
    model = VOICES_DIR / f"{VOICE}.onnx"
    if model.exists():
        return model
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    name = VOICE.split("-")[1]
    quality = VOICE.split("-")[2]
    for ext in (".onnx", ".onnx.json"):
        url = f"{HF}/{name}/{quality}/{VOICE}{ext}"
        print(f"Скачиваю {url}")
        urllib.request.urlretrieve(url, VOICES_DIR / f"{VOICE}{ext}")
    return model


def main() -> None:
    script = json.loads((ROOT / "src" / "script.json").read_text(encoding="utf-8"))
    voice = PiperVoice.load(str(ensure_voice()))
    config = SynthesisConfig(length_scale=1 / SPEED, noise_scale=0.6, noise_w_scale=0.7)
    out_dir = ROOT / "public" / "voice"
    out_dir.mkdir(parents=True, exist_ok=True)

    timings = {}
    for line in script["lines"]:
        path = out_dir / f"{line['id']}.wav"
        with wave.open(str(path), "wb") as wav:
            voice.synthesize_wav(line["tts"], wav, syn_config=config)
        with wave.open(str(path), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        timings[line["id"]] = round(duration, 3)
        print(f"{line['id']:<12} {duration:5.2f} c  {line['text']}")

    (ROOT / "src" / "voice.json").write_text(
        json.dumps({"voice": VOICE, "speed": SPEED, "durations": timings}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Итого речи: {sum(timings.values()):.1f} c")


if __name__ == "__main__":
    main()
