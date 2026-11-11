"""Звуки для ролика «Не свети» — синтезированы кодом, без чужих ассетов.

Запуск: python3 scripts/make-sunflower-sfx.py
Результат: public/sunflower/*.wav (потом конвертируются в .ogg через ffmpeg).
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sunflower'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def t_of(sec):
    return np.arange(int(SR * sec)) / SR


def band(x, lo, hi):
    """Полосовой фильтр через FFT."""
    f = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    mask = ((freqs >= lo) & (freqs <= hi)).astype(float)
    f *= mask
    y = np.fft.irfft(f, len(x))
    return y


def env(n, a, d, sustain=0.0):
    """Атака a и спад d в секундах."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4))
    return e * (1 - sustain) + sustain


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def save(name, x, stereo_width=0.0):
    x = np.clip(x, -1, 1)
    if stereo_width > 0:
        d = int(SR * 0.012)
        left = x
        right = np.concatenate([np.zeros(d), x[:-d]]) * (1 - stereo_width * 0.3) + x * stereo_width * 0.3
        data = np.stack([left, right], 1)
    else:
        data = np.stack([x, x], 1)
    pcm = (data * 32767).astype('<i2')
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('  ', name, f'{len(x) / SR:.1f}s')


def noise(sec):
    return rng.standard_normal(int(SR * sec))


# ---------- фоновые дорожки ----------

def crickets(sec=24):
    t = t_of(sec)
    out = np.zeros_like(t)
    for k in range(9):
        f = 4200 + rng.uniform(-500, 700)
        rate = rng.uniform(2.5, 4.5)  # трелей в секунду
        phase = rng.uniform(0, 1)
        gate = ((t * rate + phase) % 1) < 0.22
        # внутри трели быстрые щелчки ~ 30 Гц
        chirp = (np.sin(2 * np.pi * 32 * t) > 0.2) * gate
        amp = rng.uniform(0.2, 1) * (0.6 + 0.4 * np.sin(2 * np.pi * t / rng.uniform(5, 11) + k))
        out += np.sin(2 * np.pi * f * t) * chirp * amp
    out = band(out, 3000, 7000)
    return norm(out, 0.5)


def wind(sec=24):
    x = band(noise(sec), 80, 900)
    t = t_of(sec)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 7.3) * np.sin(2 * np.pi * t / 3.1 + 1)
    return norm(x * swell, 0.6)


def drone(sec):
    t = t_of(sec)
    x = (
        np.sin(2 * np.pi * 49 * t)
        + 0.7 * np.sin(2 * np.pi * 51.8 * t)
        + 0.25 * np.sin(2 * np.pi * 98.5 * t + np.sin(2 * np.pi * 0.07 * t) * 3)
        + 0.3 * band(noise(sec), 40, 220)
    )
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * t / 9)
    fade = np.minimum(1, t / 3) * np.minimum(1, (sec - t) / 3)
    return norm(x * fade, 0.55)


# ---------- отдельные звуки ----------

def hit():
    t = t_of(2.5)
    f = 60 * np.exp(-t * 1.5) + 32
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.005, 0.9)
    x += band(noise(2.5), 30, 400) * env(len(t), 0.002, 0.25) * 0.6
    return norm(x)


def stinger():
    t = t_of(3.0)
    x = np.zeros_like(t)
    for f in (233, 247, 311, 466, 494):
        x += np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 5 * t) * 0.6)
    x *= env(len(t), 0.05, 1.2)
    h = hit()
    x[: len(h)] += h * 0.7
    x += band(noise(3.0), 2000, 8000) * env(len(t), 0.01, 0.4) * 0.3
    return norm(x)


def coin():
    t = t_of(0.8)
    x = (np.sin(2 * np.pi * 1975 * t) + 0.6 * np.sin(2 * np.pi * 2637 * t)) * env(len(t), 0.002, 0.18)
    x[int(0.08 * SR):] += (np.sin(2 * np.pi * 2637 * t) * env(len(t), 0.002, 0.25))[: len(x) - int(0.08 * SR)]
    return norm(x, 0.6)


def pop():
    t = t_of(0.25)
    f = 700 * np.exp(-t * 18) + 220
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.06)
    return norm(x, 0.7)


def click():
    t = t_of(0.12)
    x = band(noise(0.12), 1500, 6000) * env(len(t), 0.0005, 0.012)
    x += np.sin(2 * np.pi * 900 * t) * env(len(t), 0.0005, 0.02) * 0.5
    return norm(x, 0.8)


def step_one():
    t = t_of(0.35)
    x = band(noise(0.35), 150, 2500) * env(len(t), 0.004, 0.06)
    x += np.sin(2 * np.pi * 70 * t) * env(len(t), 0.003, 0.05) * 0.8
    return x


def steps(n=6, gap=0.62):
    total = int(SR * (n * gap + 0.5))
    out = np.zeros(total)
    for i in range(n):
        s = step_one() * rng.uniform(0.7, 1)
        a = max(0, int(SR * (i * gap + rng.uniform(-0.03, 0.03))))
        n = min(len(s), total - a)
        out[a:a + n] += s[:n]
    return norm(out, 0.7)


def rustle(sec=1.6):
    t = t_of(sec)
    x = band(noise(sec), 1200, 7000)
    flutter = np.abs(band(noise(sec), 4, 30))
    flutter = flutter / (flutter.max() or 1)
    shape = np.sin(np.pi * np.minimum(1, t / sec))
    return norm(x * (0.3 + flutter) * shape, 0.6)


def whisper(sec=2.2):
    """Неразборчивый шёпот: полосовой шум с «слогами»."""
    t = t_of(sec)
    x = np.zeros_like(t)
    for lo, hi in ((700, 1300), (1500, 2600), (3000, 5200)):
        x += band(noise(sec), lo, hi)
    syl = np.zeros_like(t)
    p = 0.05
    while p < sec - 0.2:
        d = rng.uniform(0.12, 0.28)
        a, b = int(p * SR), int((p + d) * SR)
        syl[a:b] += np.sin(np.linspace(0, np.pi, b - a)) * rng.uniform(0.5, 1)
        p += d + rng.uniform(0.03, 0.12)
    tail = np.minimum(1, (sec - t) / 0.4)
    return norm(x * syl * tail, 0.75)


def grab():
    t = t_of(0.5)
    x = band(noise(0.5), 200, 3000) * env(len(t), 0.003, 0.08)
    x += np.sin(2 * np.pi * 90 * t) * env(len(t), 0.002, 0.07)
    return norm(x, 0.7)


def heart(beats=4, gap=0.85):
    total = int(SR * (beats * gap + 0.6))
    out = np.zeros(total)
    t = t_of(0.3)
    thump = np.sin(2 * np.pi * 52 * t) * env(len(t), 0.004, 0.07)
    for i in range(beats):
        for off, amp in ((0, 1), (0.22, 0.7)):
            a = int(SR * (i * gap + off))
            n = min(len(thump), total - a)
            out[a:a + n] += thump[:n] * amp
    return norm(out, 0.9)


def birds(sec=6):
    t = t_of(sec)
    out = np.zeros_like(t)
    for k in range(10):
        st = rng.uniform(0, sec - 0.6)
        d = rng.uniform(0.08, 0.25)
        a, b = int(st * SR), int((st + d) * SR)
        tt = np.arange(b - a) / SR
        f0 = rng.uniform(2800, 4200)
        sweep = f0 + rng.uniform(-900, 900) * tt / d
        out[a:b] += np.sin(2 * np.pi * np.cumsum(sweep) / SR) * np.sin(np.pi * tt / d)
    return norm(out, 0.45)


def seeds(sec=2.0):
    total = int(SR * sec)
    out = np.zeros(total)
    tick = band(noise(0.03), 2500, 9000) * env(int(SR * 0.03), 0.0005, 0.005)
    for i in range(140):
        st = (rng.uniform(0, 1) ** 1.3) * (sec - 0.1)
        a = int(st * SR)
        n = min(len(tick), total - a)
        out[a:a + n] += tick[:n] * rng.uniform(0.2, 1)
    return norm(out, 0.7)


def main():
    total = float(sys.argv[1]) if len(sys.argv) > 1 else 152
    print('Генерирую звуки «Не свети»:')
    save('crickets', crickets(), 0.8)
    save('wind', wind(), 0.8)
    save('drone', drone(total), 0.5)
    save('hit', hit())
    save('stinger', stinger(), 0.6)
    save('coin', coin())
    save('pop', pop())
    save('click', click())
    save('steps', steps(), 0.4)
    save('rustle', rustle(), 0.9)
    save('whisper', whisper(), 0.9)
    save('grab', grab())
    save('heart', heart())
    save('birds', birds(), 0.9)
    save('seeds', seeds(), 0.6)


if __name__ == '__main__':
    main()
