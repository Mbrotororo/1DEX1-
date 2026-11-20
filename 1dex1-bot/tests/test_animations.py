"""Тесты кадров анимаций (.rose, .fire, .heart, .type, .glitch, .loading, .rain, .firework,
.rainbow, .wave), поздравления с днём рождения и mock_text."""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import unicodedata
from collections.abc import Callable
from pathlib import Path

import pytest

from bot.animations import (
    ANIMATIONS,
    BIRTHDAY_WISHES,
    CANDLE_COLS,
    COLS,
    CURSOR,
    DEFAULT_BIRTHDAY_NAME,
    DEFAULT_FIRE_TEXT,
    DEFAULT_FIREWORK_TEXT,
    DEFAULT_GLITCH_TEXT,
    DEFAULT_LOADING_DONE,
    DEFAULT_RAIN_TEXT,
    DEFAULT_RAINBOW_TEXT,
    DEFAULT_ROSE_TEXT,
    DEFAULT_TYPE_TEXT,
    DEFAULT_WAVE_TEXT,
    FW_MID,
    FW_ROWS,
    HEART_BIG,
    HEART_COLS,
    HEART_ROWS,
    LOADING_BAR_WIDTH,
    MAX_FRAME_LEN,
    MAX_FRAMES,
    MID,
    MIN_FRAMES,
    ROWS,
    RAINBOW_BAND_MAX,
    SQUARES,
    WAVE_STEPS,
    ZALGO,
    _graphemes,
    birthday_frames,
    fire_frames,
    firework_frames,
    loading_bar,
    glitch_frames,
    heart_frames,
    loading_frames,
    love_frames,
    mock_text,
    rainbow_frames,
    rain_frames,
    rose_frames,
    type_frames,
    wave_frames,
)

FAMILY = "👨\u200d👩\u200d👧\u200d👦"  # 7 code points, один видимый символ
FLAG_RU = "🇷🇺"

# Что делает с текстом Telegram: вырезает эти символы везде...
TG_REMOVED = set("\u2028\u2029\u202a\u202b\u202c\u202d\u202e\u0333\u033f")
# ...и обрезает такие по краям сообщения
TG_EDGE = (
    " \t\n\r\x0b\x0c\x1c\x1d\x1e\x1f\x85\xa0\u1680\u180e"
    + "".join(chr(c) for c in range(0x2000, 0x2010))
    + "\u2028\u2029\u202f\u205f\u2060\u2800\u3000\ufeff\ufffc"
)

SAMPLES: list[str | None] = [
    None,
    "",
    "   \n\t ",
    "a",
    "я",
    "привет",
    "Привет, мир!",
    "x" * 500,
    "я" * 500,
    "🌹" * 50,
    FAMILY * 30,
    (FLAG_RU + "🇺🇦") * 20,
    "  много   пробелов \n\t тут  ",
    "\u200bневидимка\u200b",
    "a\u202eb\u2028c\u0333d",
    "z\u0334\u0321\u031ba\u0337l\u0338g\u0335o\u0336 текст",
    "<b>не html</b> & co",
    "\x00\x07ctrl\x1b",
    "\u2800",
    "\u2800 \u200b",
    "e\u0301 и\u0306",
    "x" * 39 + FAMILY,
    "█▓▒░",
    "▌",
]

GENERATORS: dict[str, Callable[[str | None], list[str]]] = {
    "rose": rose_frames,
    "fire": fire_frames,
    "heart": heart_frames,
    "type": lambda t: type_frames(t or ""),
    "glitch": lambda t: glitch_frames(t or ""),
    "glitch7": lambda t: glitch_frames(t or "", seed=7),
    "loading": loading_frames,
    "rain": rain_frames,
    "firework": firework_frames,
    "rainbow": lambda t: rainbow_frames(t or ""),
    "wave": lambda t: wave_frames(t or ""),
    "birthday": lambda t: birthday_frames(t or ""),
}


def tg(text: str) -> str:
    """Приблизительно то, что Telegram сделает с текстом сообщения."""
    kept = "".join(
        ch for ch in text
        if ch not in TG_REMOVED and (ch in "\n\t" or unicodedata.category(ch) != "Cc")
    )
    return kept.strip(TG_EDGE)


def utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def check_frames(frames: list[str]) -> None:
    """Общие инварианты всех анимаций."""
    assert isinstance(frames, list)
    assert MIN_FRAMES == 6 and MAX_FRAMES == 25 and MAX_FRAME_LEN == 4096
    assert MIN_FRAMES <= len(frames) <= MAX_FRAMES, len(frames)
    for frame in frames:
        assert isinstance(frame, str)
        assert frame, "пустой кадр"
        assert utf16_len(frame) <= MAX_FRAME_LEN
        # Telegram не должен ничего менять в кадре — иначе соседние кадры могут совпасть
        assert tg(frame) == frame, repr(frame)
    for a, b in zip(frames, frames[1:]):
        assert a != b, f"соседние кадры совпадают: {a!r}"


def lines(frame: str) -> list[str]:
    return frame.split("\n")


# ------------------------------------------------------------------ общие инварианты

@pytest.mark.parametrize("name", list(GENERATORS))
@pytest.mark.parametrize("text", SAMPLES, ids=lambda t: repr(t)[:24])
def test_invariants(name: str, text: str | None) -> None:
    gen = GENERATORS[name]
    frames = gen(text)
    check_frames(frames)
    assert gen(text) == frames  # детерминизм


@pytest.mark.parametrize("name", list(GENERATORS))
def test_invariants_fuzz(name: str) -> None:
    pool = list("abcXYZ абвЁё 019,.!?-_<>&") + ["🌹", "❤️", FAMILY, FLAG_RU, "\u200b", "\u0301", "\n", "\t",
                                               "\u202e", "\u2800", "e\u0301", "👍🏽", "#️⃣"]
    rng = random.Random(42)
    gen = GENERATORS[name]
    for _ in range(60):
        text = "".join(rng.choice(pool) for _ in range(rng.randint(0, 120)))
        check_frames(gen(text))


@pytest.mark.parametrize("name", list(ANIMATIONS))
@pytest.mark.parametrize("text", [None, "", "привет 🌹", "x" * 400])
def test_registry(name: str, text: str | None) -> None:
    check_frames(ANIMATIONS[name](text))


def test_registry_contents() -> None:
    assert set(ANIMATIONS) == {"love", "rose", "fire", "heart", "type", "glitch", "loading",
                               "rain", "firework", "rainbow", "wave"}
    assert "birthday" not in ANIMATIONS  # поздравление — не команда чата
    assert ANIMATIONS["love"](None) == love_frames()
    assert ANIMATIONS["love"]("") == love_frames()
    assert ANIMATIONS["love"]("споки") == love_frames("споки")
    assert ANIMATIONS["rose"]("") == rose_frames()
    assert ANIMATIONS["fire"]("жара") == fire_frames("жара")
    assert ANIMATIONS["heart"]("") == heart_frames()
    assert ANIMATIONS["type"](None)[-1] == DEFAULT_TYPE_TEXT
    assert ANIMATIONS["type"]("") == type_frames(DEFAULT_TYPE_TEXT)
    assert ANIMATIONS["glitch"](None)[-1] == DEFAULT_GLITCH_TEXT
    assert ANIMATIONS["loading"](None)[-1] == DEFAULT_LOADING_DONE
    assert ANIMATIONS["loading"]("готово") == loading_frames("готово")
    assert ANIMATIONS["rain"](None) == rain_frames() == ANIMATIONS["rain"]("")
    assert ANIMATIONS["rain"]("лужи") == rain_frames("лужи")
    assert ANIMATIONS["firework"](None) == firework_frames() == ANIMATIONS["firework"]("")
    assert ANIMATIONS["firework"]("салют") == firework_frames("салют")
    assert ANIMATIONS["rainbow"](None) == rainbow_frames("") == rainbow_frames(DEFAULT_RAINBOW_TEXT)
    assert ANIMATIONS["rainbow"]("цвет") == rainbow_frames("цвет")
    assert ANIMATIONS["wave"](None) == wave_frames("") == wave_frames(DEFAULT_WAVE_TEXT)
    assert ANIMATIONS["wave"]("море") == wave_frames("море")


def test_determinism_across_processes() -> None:
    """Никакого hash()/глобального random: в другом процессе с другим PYTHONHASHSEED — те же кадры."""
    code = (
        "import json; from bot.animations import ANIMATIONS, birthday_frames, glitch_frames;"
        "print(json.dumps([ANIMATIONS[n]('тест 🌹') for n in sorted(ANIMATIONS)]"
        " + [glitch_frames('abc', seed=3), birthday_frames('Тест 🌹')]))"
    )
    root = Path(__file__).resolve().parent.parent
    outputs = []
    for hash_seed in ("1", "2"):
        env = dict(os.environ, PYTHONHASHSEED=hash_seed)
        res = subprocess.run([sys.executable, "-c", code], cwd=root, env=env,
                             capture_output=True, text=True, check=True, encoding="utf-8")
        outputs.append(json.loads(res.stdout))
    assert outputs[0] == outputs[1]
    here = [ANIMATIONS[n]("тест 🌹") for n in sorted(ANIMATIONS)] + [
        glitch_frames("abc", seed=3), birthday_frames("Тест 🌹")]
    assert outputs[0] == here


# ------------------------------------------------------------------ сетки .rose / .fire

def assert_grid_final(frame: str, cell: str, text: str) -> None:
    rows = lines(frame)
    assert len(rows) == ROWS
    for i, row in enumerate(rows):
        if i == MID:
            assert row == f"{cell} {text} {cell}"
        else:
            assert row == cell * COLS


def test_rose_default() -> None:
    frames = rose_frames()
    assert_grid_final(frames[-1], "🌹", DEFAULT_ROSE_TEXT)
    assert frames[-1].split("\n")[MID] == "🌹 для тебя 🌹"
    # сетка собирается по рядам: 1, 2, …, 5 рядов роз
    counts = [len(lines(f)) for f in frames]
    assert counts[:8] == [1, 1, 1, 1, 2, 3, 4, 5]
    # волна цветения использует всю палитру
    joined = "".join(frames)
    for flower in ("🌷", "🌸", "💐"):
        assert flower in joined
    # текст печатается постепенно
    middles = [lines(f)[MID] for f in frames if len(lines(f)) == ROWS and " " in lines(f)[MID]]
    assert "🌹   🌹" in middles
    assert len({m for m in middles}) >= 4


def test_rose_custom_text_and_clamp() -> None:
    assert_grid_final(rose_frames("  я   тебя  люблю ")[-1], "🌹", "я тебя люблю")
    long = rose_frames("x" * 500)[-1]
    assert "x" * 40 in long and "x" * 41 not in long
    # эмодзи не разрываются при обрезке: 40 // 7 = 5 целых «семей»
    assert_grid_final(rose_frames(FAMILY * 30)[-1], "🌹", FAMILY * 5)
    # если обрезка попала на пробел — он не остаётся в конце
    assert_grid_final(rose_frames("y" * 39 + " zzz")[-1], "🌹", "y" * 39)


def test_fire_default() -> None:
    frames = fire_frames()
    assert_grid_final(frames[-1], "🔥", DEFAULT_FIRE_TEXT)
    assert lines(frames[-1])[MID] == "🔥 ты огонь 🔥"
    # пламя поднимается снизу: число рядов растёт 1 → 5
    counts = [len(lines(f)) for f in frames]
    assert counts[:7] == [1, 1, 1, 2, 3, 4, 5]
    # нижний ряд в фазе подъёма — всегда сплошной огонь, искры только сверху
    for frame in frames[2:7]:
        assert lines(frame)[-1] == "🔥" * COLS
    joined = "".join(frames[:-1])
    assert "✨" in joined and "💥" in joined
    assert "✨" not in frames[-1] and "💥" not in frames[-1]


def test_fire_custom_text_and_clamp() -> None:
    assert_grid_final(fire_frames("горячо")[-1], "🔥", "горячо")
    long = fire_frames("я" * 500)[-1]
    assert "я" * 40 in long and "я" * 41 not in long


# ------------------------------------------------------------------ .heart

BIG_RED = "\n".join("".join("❤️" if ch == "X" else "🤍" for ch in row) for row in HEART_BIG)


def test_heart_default() -> None:
    frames = heart_frames()
    assert frames[-1] == BIG_RED
    assert HEART_ROWS == 7 and HEART_COLS == 9
    for frame in frames:
        rows = lines(frame)
        assert len(rows) == HEART_ROWS
        # каждая строка — ровно 9 эмодзи-сердечек
        for row in rows:
            assert len(_graphemes(row)) == HEART_COLS
    # пустой холст, затем рисуется по рядам
    assert "❤️" not in frames[0]
    reds = [frames[i].count("❤️") for i in range(HEART_ROWS + 1)]
    assert reds == sorted(reds) and reds[-1] == BIG_RED.count("❤️")
    joined = "".join(frames)
    for color in ("🧡", "💛", "💚", "💙", "💜", "💗", "💖"):
        assert color in joined
    # перед финалом — сердцебиение
    assert "💗" in frames[-2] and "💖" in frames[-3]


def test_heart_with_text() -> None:
    frames = heart_frames("  люблю   тебя ")
    check_frames(frames)
    assert frames[-1] == BIG_RED + "\nлюблю тебя"
    # сначала та же анимация, что и без текста, потом текст печатается строкой под сердцем
    plain = heart_frames()
    assert frames[: len(plain)] == plain
    typed = frames[len(plain):]
    assert 1 <= len(typed) <= 4
    for frame in typed:
        heart, _, caption = frame.rpartition("\n")
        assert heart == BIG_RED and "люблю тебя".startswith(caption) and caption
    long = heart_frames("q" * 100)[-1]
    assert lines(long)[-1] == "q" * 40


# ------------------------------------------------------------------ .type

@pytest.mark.parametrize("length", [1, 2, 5, 13, 14, 15, 16, 50, 299, 300, 301, 1000])
def test_type_lengths(length: int) -> None:
    text = "".join("абв гд"[i % 6] for i in range(length)).strip() or "а"
    frames = type_frames(text)
    check_frames(frames)
    assert len(frames) <= 20
    final = " ".join(text.split())[:300].rstrip()
    assert frames[-1] == final
    assert CURSOR not in frames[-1]


def test_type_structure() -> None:
    frames = type_frames("привет мир")
    assert frames[0] == CURSOR
    assert frames[-1] == "привет мир"
    # мигание курсора в конце
    assert frames[-5:] == ["привет мир", "привет мир▌", "привет мир", "привет мир▌", "привет мир"]
    typing = frames[1:-5]
    assert all(f.endswith(CURSOR) for f in typing)
    prefixes = [f[:-1] for f in typing]
    assert all("привет мир".startswith(p) for p in prefixes)
    assert [len(p) for p in prefixes] == sorted({len(p) for p in prefixes})  # строго растут
    assert prefixes[-1] == "привет мир"


def test_type_does_not_split_emoji() -> None:
    text = (FAMILY + FLAG_RU + "e\u0301" + "👍🏽") * 6
    frames = type_frames(text)
    whole = set()
    acc = ""
    for cell in _graphemes(text):
        acc += cell
        whole.add(acc)
    for frame in frames[1:]:
        assert frame.removesuffix(CURSOR) in whole


def test_type_default_and_short() -> None:
    assert type_frames("")[-1] == DEFAULT_TYPE_TEXT
    assert type_frames("   ")[-1] == DEFAULT_TYPE_TEXT
    one = type_frames("a")
    assert one == [CURSOR, "a▌", "a", "a▌", "a", "a▌", "a"]


# ------------------------------------------------------------------ .glitch

def test_glitch_resolves() -> None:
    frames = glitch_frames("Привет, это 1DEX1")
    assert frames[-1] == "Привет, это 1DEX1"
    # чистый текст → короткий сбой → чистый текст
    assert frames[-3] == frames[-1] != frames[-2]
    # до развязки текст всегда «битый»
    assert all(f != frames[-1] for f in frames[:-3])
    # первый кадр — почти сплошные блоки
    assert sum(ch in "█▓▒░" for ch in frames[0]) >= len("ПриветэтоDEX") // 2
    joined = "".join(frames)
    assert any(ch in joined for ch in ZALGO)


def test_glitch_defaults_and_seeds() -> None:
    assert glitch_frames("")[-1] == DEFAULT_GLITCH_TEXT == "ERROR 404"
    assert glitch_frames("  \n ")[-1] == "ERROR 404"
    assert glitch_frames("abc", seed=1) == glitch_frames("abc", seed=1)
    assert glitch_frames("abc", seed=1) != glitch_frames("abc", seed=2)
    assert glitch_frames("  a   b  ")[-1] == "a b"


def test_glitch_long_and_emoji() -> None:
    frames = glitch_frames("ы" * 1000)
    check_frames(frames)
    assert frames[-1] == "ы" * 300
    frames = glitch_frames("🌹" * 20 + " ok")
    assert frames[-1] == "🌹" * 20 + " ok"
    # «залго» не вешается на эмодзи — иначе вместо глитча видны кружки-заглушки
    for frame in frames:
        for cell in _graphemes(frame):
            if cell.startswith("🌹"):
                assert cell == "🌹"


def test_glitch_spaces_stay() -> None:
    frames = glitch_frames("aa bb cc")
    for frame in frames:
        assert frame.count(" ") == 2


# ------------------------------------------------------------------ .loading

def test_loading_default() -> None:
    frames = loading_frames()
    assert frames[-1] == DEFAULT_LOADING_DONE == "✅ Загрузка завершена!"
    percents = []
    for frame in frames[:-1]:
        head, bar_line = lines(frame)
        assert head in ("⏳ Загрузка…", "⌛ Загрузка…")
        bar, pct = bar_line.split(" ")
        assert len(bar) == LOADING_BAR_WIDTH and set(bar) <= {"▰", "▱"}
        assert bar == "▰" * bar.count("▰") + "▱" * bar.count("▱")  # заполнение слева
        value = int(pct.removesuffix("%"))
        assert bar.count("▰") == value * LOADING_BAR_WIDTH // 100
        percents.append(value)
    assert percents[0] == 0 and percents[-1] == 100
    assert percents == sorted(percents)
    # песочные часы переворачиваются каждый кадр
    heads = [lines(f)[0] for f in frames[:-1]]
    assert all(a != b for a, b in zip(heads, heads[1:]))
    assert "⏳ Загрузка…\n▰▰▰▱▱▱▱▱▱▱ 30%".split("\n")[0] in heads


def test_loading_bar() -> None:
    assert loading_bar(0) == "▱" * 10
    assert loading_bar(30) == "▰▰▰▱▱▱▱▱▱▱"
    assert loading_bar(99) == "▰" * 9 + "▱"
    assert loading_bar(100) == "▰" * 10
    assert loading_bar(150) == "▰" * 10 and loading_bar(-5) == "▱" * 10


def test_loading_custom_text() -> None:
    assert loading_frames("взлом завершён 😈")[-1] == "взлом завершён 😈"
    assert loading_frames("  a \n b ")[-1] == "a b"
    assert loading_frames("")[-1] == DEFAULT_LOADING_DONE
    assert len(loading_frames("z" * 1000)[-1]) == 300


# ------------------------------------------------------------------ mock_text

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("привет мир", "пРиВеТ мИр"),
        ("Hello, World!", "hElLo, WoRlD!"),  # очередь не сбрасывается между словами
        ("HELLO", "hElLo"),
        ("ab12cd", "aB12cD"),
        ("abвг", "aBвГ"),
        ("ёжик Ёж", "ёЖиК ёЖ"),
        ("a, b. c! d?", "a, B. c! D?"),
        ("😎 ok 😎 да", "😎 oK 😎 дА"),
        ("aßb", "aßB"),
        ("αβγ abc", "αβγ aBc"),
        ("  много   пробелов \n тут ", "мНоГо ПрОбЕлОв ТуТ"),
        ("", ""),
        ("   ", ""),
        ("123 !!!", "123 !!!"),
    ],
)
def test_mock_text(raw: str, expected: str) -> None:
    assert mock_text(raw) == expected


def test_mock_text_rules() -> None:
    text = "Съешь же ещё этих мягких французских булок, да выпей чаю. The quick brown fox!"
    mocked = mock_text(text)
    assert mocked.lower() == text.lower()
    letters = [ch for ch in mocked if ch.isalpha()]
    assert all(ch.islower() for ch in letters[0::2])
    assert all(ch.isupper() for ch in letters[1::2])
    assert mock_text(mocked) == mocked
    assert len(mock_text("a" * 1000)) == 300


# ------------------------------------------------------------------ помощники

def test_graphemes() -> None:
    text = FAMILY + FLAG_RU + "e\u0301" + "x" + "👍🏽" + "#️⃣" + "❤️"
    assert _graphemes(text) == [FAMILY, FLAG_RU, "e\u0301", "x", "👍🏽", "#️⃣", "❤️"]
    assert "".join(_graphemes("любой текст 🌹")) == "любой текст 🌹"
    assert _graphemes("") == []


# ------------------------------------------------------------------ сетки из эмодзи (.rain, .firework, торт)

def is_emoji_cell(cell: str) -> bool:
    """Клетка сетки — эмодзи-картинка (все одной ширины), а не буква или пробел."""
    return not cell.isspace() and ("️" in cell or unicodedata.east_asian_width(cell[0]) == "W")


def check_grid(frame: str, text_row: int | None) -> None:
    """Каждый ряд без текста — ровно 7 эмодзи; текст (ряд с пробелами) — только в text_row."""
    for i, row in enumerate(lines(frame)):
        if " " in row:
            assert i == text_row, (i, frame)
            continue
        cells = _graphemes(row)
        assert len(cells) == COLS, row
        assert all(is_emoji_cell(cell) for cell in cells), row


def cells_of(frame: str) -> list[list[str]]:
    return [_graphemes(row) for row in lines(frame)]


def positions(frame: str, emoji: str) -> set[tuple[int, int]]:
    return {(r, c) for r, row in enumerate(cells_of(frame)) for c, cell in enumerate(row) if cell == emoji}


def typed_middles(frames: list[str], row: int, left: str, right: str) -> list[str]:
    """Тексты из строки «left текст right» в кадрах, где она есть."""
    out = []
    for frame in frames:
        rows = lines(frame)
        if len(rows) > row and rows[row].startswith(left + " ") and rows[row].endswith(" " + right):
            out.append(rows[row][len(left) + 1: -len(right) - 1].strip())
    return out


# ------------------------------------------------------------------ .rain

RAIN_SCENE = 17  # кадров до появления текста: тучи (5) + ливень (7) + прояснение (5)


def test_rain_default() -> None:
    frames = rain_frames()
    assert DEFAULT_RAIN_TEXT == "после дождя всегда солнце"
    assert lines(frames[-1]) == [
        "🌈🟦🟦☀️🟦🟦🌈",
        "🟦" * COLS,
        "☀️ после дождя всегда солнце ☀️",
        "🌷🌼🌷🌻🌷🌼🌷",
        "🟩" * COLS,
    ]
    for frame in frames:
        assert len(lines(frame)) == ROWS
        check_grid(frame, MID)
        assert lines(frame)[-1] == "🟩" * COLS  # трава всегда внизу
    # сначала солнечно, тучи собираются с краёв и закрывают солнце
    tops = [lines(f)[0] for f in frames]
    assert "☁️" not in tops[0] and "☀️" in tops[0]
    clouds = [top.count("☁️") for top in tops[:5]]
    assert clouds == sorted(clouds) and tops[4] == "☁️" * COLS
    joined = "".join(frames)
    for emoji in ("💧", "🌧️", "⛈️", "⚡", "⛅", "🌈", "🌱"):
        assert emoji in joined, emoji


def test_rain_drops_fall_down() -> None:
    frames = rain_frames()
    rainy = [i for i, f in enumerate(frames) if "💧" in f]
    assert rainy == list(range(rainy[0], rainy[-1] + 1)) and len(rainy) >= 5  # ливень идёт подряд
    for i in rainy:
        drops = positions(frames[i], "💧")
        below = positions(frames[i + 1], "💧") | positions(frames[i + 1], "⚡")
        for r, c in drops:
            assert 1 <= r <= 3  # капли только в «воздухе» между тучами и травой
            if r < 3:
                assert (r + 1, c) in below, (i, r, c)  # через кадр капля на ряд ниже
    # после ливня — ни капель, ни молний, небо снова голубое
    after = frames[rainy[-1] + 1:]
    assert all("💧" not in f and "⚡" not in f for f in after)
    assert "⬛" not in frames[-1] and "☁️" not in frames[-1]


def test_rain_text_appears_after_rain() -> None:
    a, b = rain_frames("a"), rain_frames("совсем другой текст")
    assert a[:RAIN_SCENE] == b[:RAIN_SCENE]  # сцена не зависит от текста
    assert all(" " not in f for f in a[:RAIN_SCENE])
    middles = typed_middles(b, MID, "☀️", "☀️")
    assert middles[0] == "" and middles[-1] == "совсем другой текст"
    assert all("совсем другой текст".startswith(m) for m in middles)
    assert 3 <= len(set(middles)) <= 6


def test_rain_custom_text_and_clamp() -> None:
    assert lines(rain_frames("  солнышко \n выглянуло ")[-1])[MID] == "☀️ солнышко выглянуло ☀️"
    long = lines(rain_frames("x" * 500)[-1])[MID]
    assert long == "☀️ " + "x" * 40 + " ☀️"
    assert lines(rain_frames(FAMILY * 30)[-1])[MID] == f"☀️ {FAMILY * 5} ☀️"
    assert lines(rain_frames(FLAG_RU + " ура")[-1])[MID] == f"☀️ {FLAG_RU} ура ☀️"
    assert rain_frames("   ") == rain_frames() == rain_frames(None)


# ------------------------------------------------------------------ .firework

def test_firework_default() -> None:
    frames = firework_frames()
    assert DEFAULT_FIREWORK_TEXT == "УРА!"
    final = lines(frames[-1])
    assert len(final) == FW_ROWS == 7 and FW_MID == 3
    assert final[FW_MID] == "🎆 УРА! 🎆"
    assert final[-1] == "🌃" * COLS
    for i, row in enumerate(final[:-1]):
        if i != FW_MID:
            assert set(_graphemes(row)) == {"🎆", "🎇"}
    for frame in frames:
        assert len(lines(frame)) == FW_ROWS
        assert lines(frame)[-1] == "🌃" * COLS  # ночной город внизу
        check_grid(frame, FW_MID)
    assert "🚀" not in frames[-1] and "💥" not in frames[-1]


def test_firework_rockets_and_bursts() -> None:
    frames = firework_frames()
    # первая ракета взлетает снизу вверх по одной колонке, за ней след ✨
    rockets = [positions(f, "🚀") for f in frames[:3]]
    assert [min(p)[0] for p in rockets] == [5, 4, 3]
    assert len({c for p in rockets for _, c in p}) == 1
    assert (5, 2) in positions(frames[1], "✨")
    # взрыв: 💥 в точке взрыва, потом кольца 🎆 расходятся всё дальше
    boom = positions(frames[3], "💥")
    assert boom == {(2, 2)}
    (r0, c0), = boom

    def reach(frame: str, emoji: str) -> int:
        return max(max(abs(r - r0), abs(c - c0)) for r, c in positions(frame, emoji))

    assert reach(frames[4], "🎆") == 1 and reach(frames[5], "🎆") == 2
    # вторая ракета другого цвета: «золотой» салют 🎇🌟 в другом месте неба
    gold = [i for i, f in enumerate(frames) if "🌟" in f]
    assert gold and gold[0] > 3
    second_boom = [positions(f, "💥") for f in frames[4:11] if "💥" in f]
    assert second_boom and second_boom[0] != boom
    assert any("🔥" in f for f in frames[:8])  # след второй ракеты
    # перед текстом — финальный залп на всё небо
    assert any(set(_graphemes("".join(lines(f)[:-1]))) == {"🎆", "🎇"} for f in frames[:-1])


def test_firework_custom_text_and_clamp() -> None:
    frames = firework_frames("  с новым   годом ")
    assert lines(frames[-1])[FW_MID] == "🎆 с новым годом 🎆"
    middles = typed_middles(frames, FW_MID, "🎆", "🎆")
    assert middles[0] == "" and middles[-1] == "с новым годом"
    assert all("с новым годом".startswith(m) for m in middles)
    assert lines(firework_frames("я" * 500)[-1])[FW_MID] == "🎆 " + "я" * 40 + " 🎆"
    assert lines(firework_frames("🌹" * 50)[-1])[FW_MID] == "🎆 " + "🌹" * 40 + " 🎆"
    # сцена с ракетами не зависит от текста
    assert firework_frames("a")[:13] == firework_frames("bbb")[:13]


# ------------------------------------------------------------------ .rainbow

def canonical_band(width: int) -> str:
    return "".join(SQUARES[i % len(SQUARES)] for i in range(width))


def test_rainbow_default() -> None:
    frames = rainbow_frames("")
    assert DEFAULT_RAINBOW_TEXT == "радуга"
    assert frames[-1] == "🟥🟧🟨🟩🟦🟪\n🌈 радуга 🌈\n🟥🟧🟨🟩🟦🟪"
    assert rainbow_frames("   ") == frames == rainbow_frames(None)  # type: ignore[arg-type]
    for frame in frames:
        top, middle, bottom = lines(frame)
        assert set(_graphemes(top)) <= set(SQUARES) and set(_graphemes(bottom)) <= set(SQUARES)
        assert len(_graphemes(top)) == len(_graphemes(bottom))
        assert " " in middle
    # по бокам переливаются сердечки всех цветов радуги
    joined = "".join(frames[:-1])
    for heart in ("❤️", "🧡", "💛", "💚", "💙", "💜"):
        assert heart in joined


def test_rainbow_paint_and_flow() -> None:
    frames = rainbow_frames("привет мир")
    width = len(_graphemes(lines(frames[-1])[0]))
    assert lines(frames[-1]) == [canonical_band(width), "🌈 привет мир 🌈", canonical_band(width)]
    # 1) краска идёт слева направо: полоса растёт, текст проявляется
    paint = [f for f in frames if len(_graphemes(lines(f)[0])) < width]
    assert paint == frames[: len(paint)] and len(paint) >= 3
    widths = [len(_graphemes(lines(f)[0])) for f in paint]
    assert widths == sorted(widths) and widths[0] == 1
    for frame in paint:
        top, middle, _ = lines(frame)
        assert top == canonical_band(len(_graphemes(top)))
        heart = _graphemes(middle)[0]
        assert "привет мир".startswith(middle.removeprefix(heart + " ").removesuffix(" " + heart))
    # 2) цвета бегут: верхняя полоса сдвигается вправо, нижняя влево
    flow = [f for f in frames[len(paint):-1] if "привет мир" in f]
    assert len(flow) >= 6
    for a, b in zip(flow, flow[1:]):
        ta, tb = _graphemes(lines(a)[0]), _graphemes(lines(b)[0])
        assert tb[1:] == ta[:-1]
        ba, bb = _graphemes(lines(a)[2]), _graphemes(lines(b)[2])
        assert bb[:-1] == ba[1:]


def test_rainbow_band_fits_text_and_clamp() -> None:
    sizes = [len(_graphemes(lines(rainbow_frames(t)[-1])[0]))
             for t in ("a", "радуга", "привет мир", "после дождя всегда солнце", "x" * 40)]
    assert sizes == sorted(sizes)
    assert sizes[0] == 6 and sizes[-1] == RAINBOW_BAND_MAX == 12
    assert lines(rainbow_frames("я" * 500)[-1])[1] == "🌈 " + "я" * 40 + " 🌈"
    assert lines(rainbow_frames("  да   нет ")[-1])[1] == "🌈 да нет 🌈"
    emoji = rainbow_frames("🌹" * 50)
    assert lines(emoji[-1])[1] == "🌈 " + "🌹" * 40 + " 🌈"
    assert len(_graphemes(lines(emoji[-1])[0])) == RAINBOW_BAND_MAX
    assert lines(rainbow_frames(FAMILY * 30)[-1])[1] == f"🌈 {FAMILY * 5} 🌈"


# ------------------------------------------------------------------ .wave

def test_wave_default_and_final() -> None:
    assert wave_frames("")[-1] == DEFAULT_WAVE_TEXT == "волна"
    assert wave_frames("  \n ")[-1] == "волна"
    assert wave_frames("  привет   мир ")[-1] == "привет мир"
    assert wave_frames("ы" * 1000)[-1] == "ы" * 300
    assert wave_frames("🌹 роза 🌹")[-1] == "🌹 роза 🌹"
    for text in ("a", "волна", "привет мир", "x" * 300):
        frames = wave_frames(text)
        assert 12 <= len(frames) <= 18
        assert len(frames) == WAVE_STEPS + 1


def test_wave_structure() -> None:
    frames = wave_frames("привет мир")
    for frame in frames[:-1]:
        text, sea = lines(frame)
        assert text.lower() == "привет мир" and text != "привет мир"
        assert len(_graphemes(sea)) == COLS and set(_graphemes(sea)) == {"〰️", "🌊"}
    seas = [lines(f)[1] for f in frames[:-1]]
    assert all(a != b for a, b in zip(seas, seas[1:]))  # море катится каждый кадр


def test_wave_crest_moves_left_to_right() -> None:
    text = "абвгдежзийклмнопрстуфхцчшщъыэюя"
    frames = wave_frames(text)
    firsts, lasts = [], []
    for frame in frames[:-1]:
        waved = lines(frame)[0]
        upper = [i for i, ch in enumerate(waved) if ch.isupper()]
        assert upper == list(range(upper[0], upper[-1] + 1))  # гребень — сплошной кусок
        assert 1 <= len(upper) <= 6
        firsts.append(upper[0])
        lasts.append(upper[-1])
    assert firsts == sorted(firsts) and lasts == sorted(lasts)
    assert firsts[0] == 0 and lasts[-1] == len(text) - 1  # гребень заходит слева и уходит справа


def test_wave_unicode() -> None:
    frames = wave_frames(FAMILY + " ok " + FLAG_RU + " é")
    for frame in frames:
        assert FAMILY in frame and FLAG_RU in frame  # эмодзи не разрываются
    assert frames[-1] == FAMILY + " ok " + FLAG_RU + " é"
    no_letters = wave_frames("123 🌹 !!!")
    check_frames(no_letters)  # кадры различаются за счёт моря
    assert all(lines(f)[0] == "123 🌹 !!!" for f in no_letters[:-1])


# ------------------------------------------------------------------ день рождения

def test_birthday_final() -> None:
    frames = birthday_frames()
    assert DEFAULT_BIRTHDAY_NAME == "1DEX1"
    final = frames[-1]
    assert final.startswith("🎉🎈🎊🎈🎉\n🎂 С днём рождения, 1DEX1! 🎂\n")
    for wish in BIRTHDAY_WISHES:
        assert wish in final
    assert "💎" in final and "⛏" in final
    assert frames[0] == "🎂"  # первый кадр виден в уведомлении
    assert birthday_frames("") == frames == birthday_frames("   ")
    assert len(frames) <= MAX_FRAMES


def test_birthday_cake_story() -> None:
    frames = birthday_frames()
    text_start = next(i for i, f in enumerate(frames) if "С днём" in f)
    cake = frames[1:text_start]
    for frame in cake:
        check_grid(frame, None)
    # торт растёт по слоям, потом свечи зажигаются по одной
    heights = [len(lines(f)) for f in cake]
    assert heights[:4] == [1, 2, 3, 4] and heights == sorted(heights)
    flames = [f.count("🔥") for f in cake]
    assert flames == sorted(flames) and flames[-1] == len(CANDLE_COLS) == 3
    assert {1, 2, 3} <= set(flames)
    assert all(f.count("🕯️") == 3 for f in cake if "🔥" in f)
    # шарики взлетают: самый верхний шарик всё выше (считаем высоту от низа торта)
    balloon_heights = [len(lines(f)) - 1 - min(r for r, _ in positions(f, "🎈")) for f in cake if "🎈" in f]
    assert len(set(balloon_heights)) >= 3 and balloon_heights == sorted(balloon_heights)
    joined = "".join(cake)
    assert "🎉" in joined and "🎊" in joined
    # поздравление печатается, пожелания добавляются по одному
    text_frames = frames[text_start:]
    assert all(f.startswith(("🎉🎈🎊🎈🎉\n🎂 ", "🎊🎈🎉🎈🎊\n🎂 ")) for f in text_frames)
    sizes = [len(f) for f in text_frames]
    assert sizes == sorted(sizes)


def test_birthday_name_clamp_and_unicode() -> None:
    assert "С днём рождения, Илья!" in birthday_frames("  Илья  ")[-1]
    long = birthday_frames("x" * 100)[-1]
    assert "x" * 40 + "!" in long and "x" * 41 not in long
    assert f"С днём рождения, {FAMILY * 5}!" in birthday_frames(FAMILY * 30)[-1]
    assert "С днём рождения, Дима 🌹!" in birthday_frames("Дима 🌹")[-1]
    # торт не зависит от имени
    a, b = birthday_frames("a"), birthday_frames("bbb")
    start = next(i for i, f in enumerate(a) if "С днём" in f)
    assert a[:start] == b[:start]
