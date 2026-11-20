"""Кадры анимаций, которые бот «проигрывает», редактируя одно сообщение кадр за кадром.

• .love    — сетка сердечек 7×5 с текстом посередине (как на скрине);
• .rose    — сетка роз 7×5, волна цветения, текст посередине;
• .fire    — пламя поднимается снизу, искры, текст посередине;
• .heart   — большое пиксельное сердце, радужные круги и сердцебиение;
• .type    — печатная машинка с мигающим курсором;
• .glitch  — «битый» текст, который собирается в чистый;
• .loading — полоска загрузки 0…100%;
• mock_text — «пЕрЕдРаЗнИлКа» для .mock (это не анимация, а просто текст).

Правила для всех генераторов кадров (их проверяют тесты):
• 6…25 кадров, каждый — непустой обычный текст (без HTML) не длиннее 4096 символов;
• соседние кадры всегда различаются (иначе Telegram ответит «message is not modified»),
  в том числе после того, как Telegram обрежет пробелы по краям;
• всё детерминировано: одинаковый ввод → одинаковые кадры (никакого глобального random);
• текст пользователя: пробелы схлопываются, длина обрезается (сетки — 40 символов,
  .type/.glitch/.mock/.loading — 300), эмодзи при обрезке и печати не разрываются.
"""

from __future__ import annotations

import random
import unicodedata
from collections.abc import Callable

COLS = 7
ROWS = 5
MID = ROWS // 2
RED = "❤️"
RAINBOW = ("❤️", "🧡", "💛", "💚", "💙", "💜")
DEFAULT_LOVE_TEXT = "сладких снов"
MAX_LOVE_TEXT = 40


def _row(heart: str = RED) -> str:
    return heart * COLS


def _text_row(text: str, left: str = RED, right: str = RED) -> str:
    return f"{left} {text} {right}" if text else f"{left}   {right}"


def _grid(rows: list[str]) -> str:
    return "\n".join(rows)


def love_frames(text: str | None = None) -> list[str]:
    """Возвращает список кадров. Соседние кадры всегда различаются,
    последний кадр — финальная картинка (красная сетка + текст)."""
    text = " ".join((text or DEFAULT_LOVE_TEXT).split())[:MAX_LOVE_TEXT] or DEFAULT_LOVE_TEXT

    frames: list[str] = []

    # 1) сердечко появляется и растягивается в ряд
    frames.append(RED)
    frames.append(RED * 4)
    frames.append(_row())

    # 2) ряды «вырастают» сверху вниз
    for count in range(2, ROWS + 1):
        frames.append(_grid([_row() for _ in range(count)]))

    # 3) радужная волна по диагонали
    for shift in range(len(RAINBOW)):
        rows = []
        for r in range(ROWS):
            rows.append("".join(RAINBOW[(r + c + shift) % len(RAINBOW)] for c in range(COLS)))
        frames.append(_grid(rows))

    # 4) середина «раскрывается» и печатается текст
    full_rows = [_row() for _ in range(ROWS)]
    steps = _typing_steps(text)
    for part in [""] + steps:
        rows = list(full_rows)
        rows[MID] = _text_row(part)
        frames.append(_grid(rows))

    # 5) сердцебиение и финальный кадр
    pulse = [_row("💗") for _ in range(ROWS)]
    pulse[MID] = _text_row(text, "💗", "💗")
    frames.append(_grid(pulse))

    final = [_row() for _ in range(ROWS)]
    final[MID] = _text_row(text)
    frames.append(_grid(final))

    # подстраховка: убираем подряд идущие одинаковые кадры
    deduped: list[str] = []
    for frame in frames:
        if not deduped or deduped[-1] != frame:
            deduped.append(frame)
    return deduped


def _typing_steps(text: str, max_steps: int = 5) -> list[str]:
    """Печатаем текст кусками, чтобы не делать слишком много правок."""
    n = len(text)
    if n == 0:
        return []
    steps = min(max_steps, n)
    out = []
    for i in range(1, steps + 1):
        end = round(n * i / steps)
        part = text[:end].rstrip()
        if part and (not out or out[-1] != part):
            out.append(part)
    if out[-1] != text:
        out.append(text)
    return out


# =================================================================== общие помощники

MAX_GRID_TEXT = 40    # текст внутри сеток (.rose, .fire, .heart)
MAX_LONG_TEXT = 300   # .type, .glitch, .mock, .loading
MAX_FRAMES = 25
MAX_FRAME_LEN = 4096

ZWJ = "‍"
# Telegram сам вырезает эти символы из любого места текста — из-за них два «разных»
# кадра могли бы оказаться одинаковыми после отправки
_TG_REMOVED = frozenset("  ‪‫‬‭‮̳̿")
# ...а эти Telegram обрезает по краям сообщения (вместе с обычными пробелами)
_TG_EDGE = (
    " \t\n\r\x0b\x0c\x1c\x1d\x1e\x1f\x85\xa0 ᠎"
    + "".join(chr(c) for c in range(0x2000, 0x2010))
    + "    ⁠⠀　﻿￼"
)


def _keep_char(ch: str) -> bool:
    """Управляющие символы (кроме пробельных) и то, что вырежет Telegram, — выбрасываем."""
    if ch in _TG_REMOVED:
        return False
    return ch.isspace() or unicodedata.category(ch) != "Cc"


def _is_extender(ch: str) -> bool:
    """Символ «прилипает» к предыдущему: диакритика, VS16, ZWJ, тон кожи, теги флагов."""
    code = ord(ch)
    return (
        unicodedata.category(ch) in ("Mn", "Me", "Mc")
        or ch == ZWJ
        or 0xFE00 <= code <= 0xFE0F
        or 0x1F3FB <= code <= 0x1F3FF
        or 0xE0020 <= code <= 0xE007F
    )


def _is_regional(ch: str) -> bool:
    return 0x1F1E6 <= ord(ch) <= 0x1F1FF


def _graphemes(text: str) -> list[str]:
    """Делит строку на «видимые символы»: эмодзи с ZWJ, флаги и буквы с диакритикой
    остаются целыми (упрощённый UAX #29, без внешних библиотек)."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        j = i + 1
        if _is_regional(text[i]) and j < n and _is_regional(text[j]):
            j += 1  # флаг страны = две «региональные буквы»
        while j < n and (text[j - 1] == ZWJ or _is_extender(text[j])):
            j += 1
        out.append(text[i:j])
        i = j
    return out


def _clamp(text: str, limit: int) -> str:
    """Обрезает до limit символов (code points), не разрывая эмодзи и буквы с диакритикой."""
    if len(text) <= limit:
        return text
    out: list[str] = []
    size = 0
    for cell in _graphemes(text):
        if size + len(cell) > limit:
            break
        out.append(cell)
        size += len(cell)
    return ("".join(out) or text[:limit]).rstrip(_TG_EDGE)


def _normalize(text: str | None, limit: int, default: str = "") -> str:
    """Схлопывает пробелы, чистит мусор и обрезает текст пользователя."""
    raw = "".join(ch for ch in (text or "") if _keep_char(ch))
    clean = _clamp(" ".join(raw.split()).strip(_TG_EDGE), limit)
    return clean or default


def _typing_parts(text: str, max_steps: int) -> list[str]:
    """Префиксы текста для «печати» в сетке: не больше max_steps штук, последний — весь текст."""
    cells = _graphemes(text)
    steps = min(max_steps, len(cells))
    out: list[str] = []
    for i in range(1, steps + 1):
        part = "".join(cells[: len(cells) * i // steps]).rstrip(_TG_EDGE)
        if part and (not out or out[-1] != part):
            out.append(part)
    return out or [text]


def _dedupe(frames: list[str]) -> list[str]:
    """Подстраховка: убираем подряд идущие одинаковые кадры."""
    out: list[str] = []
    for frame in frames:
        if not out or out[-1] != frame:
            out.append(frame)
    return out


def _grid_with_text(cell: str, part: str, left: str | None = None, right: str | None = None) -> list[str]:
    """Строки сетки 7×5 из cell, в средней строке — part (пустой part = «раскрытая» середина)."""
    rows = [_row(cell) for _ in range(ROWS)]
    rows[MID] = _text_row(part, left or cell, right or cell)
    return rows


# =================================================================== .rose

ROSE = "🌹"
ROSE_GROWTH = ("🌱", "🌷", ROSE)              # росток → бутон → роза (крупные одиночные эмодзи)
ROSE_BLOOM = ("🌷", "🌸", "💐", "🌸", "🌷")    # гребень волны цветения
ROSE_PULSE = "🌸"
DEFAULT_ROSE_TEXT = "для тебя"


def _bloom_cell(diagonal: int, front: int) -> str:
    offset = front - diagonal
    return ROSE_BLOOM[offset] if 0 <= offset < len(ROSE_BLOOM) else ROSE


def rose_frames(text: str | None = None) -> list[str]:
    """Розы: росток вырастает в розу, сетка 7×5 собирается по рядам, по ней проходит
    волна цветения, середина раскрывается и печатается текст. Последний кадр —
    сетка 🌹 со строкой «🌹 текст 🌹» посередине."""
    text = _normalize(text, MAX_GRID_TEXT, DEFAULT_ROSE_TEXT)
    frames: list[str] = list(ROSE_GROWTH)

    # 1) сетка собирается по рядам
    for count in range(1, ROWS + 1):
        frames.append(_grid([_row(ROSE) for _ in range(count)]))

    # 2) волна цветения идёт по диагонали из левого верхнего угла в правый нижний
    last_diagonal = ROWS + COLS - 2
    for front in range(2, last_diagonal + len(ROSE_BLOOM), 2):
        frames.append(_grid([
            "".join(_bloom_cell(r + c, front) for c in range(COLS)) for r in range(ROWS)
        ]))

    # 3) середина раскрывается и печатается текст
    for part in [""] + _typing_parts(text, 5):
        frames.append(_grid(_grid_with_text(ROSE, part)))

    # 4) лепестки вспыхивают и финальный кадр
    frames.append(_grid(_grid_with_text(ROSE_PULSE, text)))
    frames.append(_grid(_grid_with_text(ROSE, text)))
    return _dedupe(frames)


# =================================================================== .fire

FIRE = "🔥"
SPARKS = ("✨", "💥")
FIRE_FLASH = "💥"
DEFAULT_FIRE_TEXT = "ты огонь"
_FIRE_SEED = 1337


def _spark_row(rng: random.Random, sparks: int) -> str:
    """Ряд огня, в котором `sparks` случайных клеток — искры."""
    places = set(rng.sample(range(COLS), sparks))
    return "".join(rng.choice(SPARKS) if c in places else FIRE for c in range(COLS))


def fire_frames(text: str | None = None) -> list[str]:
    """Огонь: искра вспыхивает, пламя поднимается снизу вверх, искры мерцают, в середине
    печатается текст. Последний кадр — сетка 🔥 7×5 со строкой «🔥 текст 🔥» посередине."""
    text = _normalize(text, MAX_GRID_TEXT, DEFAULT_FIRE_TEXT)
    rng = random.Random(_FIRE_SEED)
    frames: list[str] = ["✨", FIRE, _row(FIRE)]

    # 1) пламя растёт вверх: новые ряды появляются сверху, на макушке — искры
    for height in range(2, ROWS + 1):
        frames.append(_grid([_spark_row(rng, 3)] + [_row(FIRE) for _ in range(height - 1)]))

    # 2) полная сетка, искры мерцают в верхних рядах
    for _ in range(3):
        rows = [_row(FIRE) for _ in range(ROWS)]
        rows[0] = _spark_row(rng, 3)
        rows[1] = _spark_row(rng, 1)
        frames.append(_grid(rows))

    # 3) середина раскрывается и печатается текст, сверху продолжают лететь искры
    for part in [""] + _typing_parts(text, 5):
        rows = _grid_with_text(FIRE, part)
        rows[0] = _spark_row(rng, 2)
        frames.append(_grid(rows))

    # 4) вспышка и финальный кадр
    frames.append(_grid(_grid_with_text(FIRE_FLASH, text)))
    frames.append(_grid(_grid_with_text(FIRE, text)))
    return _dedupe(frames)


# =================================================================== .heart

HEART_RED = "❤️"
HEART_BG = "🤍"
HEART_BEAT = ("💗", "💖")  # цвет «сжатого» и «расправленного» сердца при ударе
# Большое сердце 9×7 и «сжатое» при ударе — той же ширины и высоты, чтобы сетка не прыгала
HEART_BIG = (
    ".XXX.XXX.",
    "XXXXXXXXX",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    "...XXX...",
    "....X....",
)
HEART_SMALL = (
    ".........",
    "..XX.XX..",
    ".XXXXXXX.",
    ".XXXXXXX.",
    "..XXXXX..",
    "...XXX...",
    "....X....",
)
HEART_COLS = len(HEART_BIG[0])
HEART_ROWS = len(HEART_BIG)


def _heart(mask: tuple[str, ...], paint: Callable[[int, int], str], upto: int | None = None) -> str:
    """Рисует маску: клетки 'X' — paint(r, c), остальное — белый фон. upto — сколько рядов уже нарисовано."""
    lines = []
    for r, line in enumerate(mask):
        drawn = upto is None or r < upto
        lines.append("".join(
            paint(r, c) if ch == "X" and drawn else HEART_BG for c, ch in enumerate(line)
        ))
    return "\n".join(lines)


def _ring(r: int, c: int) -> int:
    """Номер «кольца»-ромба вокруг центра сердца (ряды 2–3, средняя колонка) — для радужных кругов."""
    return abs(c - HEART_COLS // 2) + abs(2 * r - 5) // 2


def heart_frames(text: str | None = None) -> list[str]:
    """Большое пиксельное сердце ❤️ на белом фоне 🤍: рисуется по рядам, от центра расходятся
    радужные круги, потом два удара сердца. Последний кадр — красное сердце; если передан
    текст, он печатается отдельной строкой под сердцем."""
    text = _normalize(text, MAX_GRID_TEXT)

    def red(_r: int, _c: int) -> str:
        return HEART_RED

    frames: list[str] = []
    # 1) пустой холст и сердце рисуется сверху вниз
    for upto in range(HEART_ROWS + 1):
        frames.append(_heart(HEART_BIG, red, upto))

    # 2) радужные круги расходятся от центра
    for shift in range(len(RAINBOW)):
        frames.append(_heart(HEART_BIG, lambda r, c, s=shift: RAINBOW[(_ring(r, c) - s) % len(RAINBOW)]))

    # 3) сердцебиение: сжалось — расправилось, сжалось — расправилось
    small, bright = HEART_BEAT
    frames.append(_heart(HEART_SMALL, lambda r, c: small))
    frames.append(_heart(HEART_BIG, lambda r, c: bright))
    frames.append(_heart(HEART_SMALL, lambda r, c: small))
    final = _heart(HEART_BIG, red)
    frames.append(final)

    # 4) подпись под сердцем
    if text:
        for part in _typing_parts(text, 4):
            frames.append(f"{final}\n{part}")
    return _dedupe(frames)


# =================================================================== .type

CURSOR = "▌"
DEFAULT_TYPE_TEXT = "печатаю..."
MAX_TYPE_STEPS = 14  # 1 кадр курсора + до 14 кадров печати + 5 кадров мигания = максимум 20


def type_frames(text: str) -> list[str]:
    """Печатная машинка: текст появляется кусками с курсором ▌, в конце курсор мигает
    два раза. Последний кадр — ровно текст, без курсора. Всего не больше 20 кадров."""
    text = _normalize(text, MAX_LONG_TEXT, DEFAULT_TYPE_TEXT)
    cells = _graphemes(text)
    steps = min(len(cells), MAX_TYPE_STEPS)
    frames = [CURSOR]
    for i in range(1, steps + 1):
        frames.append("".join(cells[: len(cells) * i // steps]) + CURSOR)
    frames += [text, text + CURSOR, text, text + CURSOR, text]
    return frames


# =================================================================== .glitch

DEFAULT_GLITCH_TEXT = "ERROR 404"
GLITCH_STEPS = 12  # кадров «шума», потом: чистый текст → короткий сбой → чистый текст
GLITCH_BLOCKS = "█▓▒░"
GLITCH_GLYPHS = "#%$@*?!§¤¥ΞΔΨЖЯ/|=+~^"
GLITCH_LEET = {
    "a": "4@", "b": "8", "e": "3", "g": "9", "i": "1!", "l": "1|", "o": "0", "s": "5$", "t": "7", "z": "2",
    "а": "@4", "б": "6", "в": "8", "е": "3", "з": "3", "о": "0", "ч": "4", "т": "7", "я": "R", "и": "u",
}
# Комбинируемые диакритики («залго»), кроме тех, что Telegram вырезает, и невидимой U+034F
ZALGO = tuple(chr(c) for c in range(0x0300, 0x0370) if c not in (0x0333, 0x033F, 0x034F))


def _noise(cell: str, chaos: float, rng: random.Random) -> str:
    """«Испорченная» версия символа. Всегда отличается от исходного."""
    if not cell[0].isalnum():
        # эмодзи и знаки препинания с «залго» выглядят как мусорные кружки — только блоки и символы
        out = rng.choice(GLITCH_BLOCKS if rng.random() < 0.5 + 0.4 * chaos else GLITCH_GLYPHS)
    elif rng.random() < 0.15 + 0.6 * chaos:
        out = rng.choice(GLITCH_BLOCKS)
    else:
        low = cell.lower()
        roll = rng.random()
        if low in GLITCH_LEET and roll < 0.45:
            base = rng.choice(GLITCH_LEET[low])
        elif roll < 0.7 and len(cell.swapcase()) == len(cell):
            base = cell.swapcase()
        elif roll < 0.85:
            base = rng.choice(GLITCH_GLYPHS)
        else:
            base = cell
        marks = rng.randint(1, 1 + round(2 * chaos))
        out = base + "".join(rng.choice(ZALGO) for _ in range(marks))
    return out if out != cell else cell + rng.choice(ZALGO)


def glitch_frames(text: str, seed: int = 0) -> list[str]:
    """Глитч: текст сначала забит блоками █▓▒░, «залго» и перепутанными буквами,
    потом символы по очереди встают на место. Последний кадр — чистый текст."""
    clean = _normalize(text, MAX_LONG_TEXT, DEFAULT_GLITCH_TEXT)
    cells = _graphemes(clean)
    rng = random.Random(f"glitch:{seed}:{clean}")
    letters = [i for i, cell in enumerate(cells) if not cell.isspace()]

    # шаг, на котором символ «встаёт на место»: в целом слева направо, но с разбросом
    # (шаги 2…GLITCH_STEPS-1, так что первые два кадра — сплошной шум, а последний ещё «искрит»)
    lock: dict[int, int] = {}
    for rank, i in enumerate(letters):
        lock[i] = 2 + int((rank + rng.random()) / len(letters) * (GLITCH_STEPS - 3))

    def force(out: list[str]) -> None:
        i = rng.choice(letters)
        out[i] += rng.choice(ZALGO)

    frames: list[str] = []
    for step in range(GLITCH_STEPS):
        chaos = 1 - step / GLITCH_STEPS
        out = list(cells)
        for i in letters:
            if lock[i] > step:
                out[i] = _noise(cells[i], chaos, rng)
            elif rng.random() < 0.15 * chaos:
                out[i] = cells[i] + rng.choice(ZALGO)  # остаточные помехи
        # пара соседних символов меняется местами
        if 0 < step < GLITCH_STEPS - 1 and len(letters) > 1 and rng.random() < 0.6:
            j = rng.randrange(len(letters) - 1)
            a, b = letters[j], letters[j + 1]
            out[a], out[b] = out[b], out[a]
        if "".join(out) == clean:
            force(out)  # шумовой кадр не должен случайно совпасть с чистым текстом
        if frames and "".join(out) == frames[-1]:
            force(out)
        frames.append("".join(out))

    # чистый текст → короткий «сбой» → снова чистый текст
    shock = list(cells)
    for i in rng.sample(letters, min(len(letters), max(2, len(letters) // 5))):
        shock[i] = _noise(cells[i], 0.7, rng)
    frames += [clean, "".join(shock), clean]
    return frames


# =================================================================== .loading

LOADING_BAR_WIDTH = 10
LOADING_FULL = "▰"
LOADING_EMPTY = "▱"
LOADING_SPINNER = ("⏳", "⌛")  # песочные часы переворачиваются каждый кадр
LOADING_PERCENTS = (0, 9, 18, 27, 41, 53, 64, 72, 86, 94, 99, 99, 100)  # «залипание» на 99% — классика
DEFAULT_LOADING_DONE = "✅ Загрузка завершена!"


def loading_bar(percent: int) -> str:
    filled = max(0, min(100, percent)) * LOADING_BAR_WIDTH // 100
    return LOADING_FULL * filled + LOADING_EMPTY * (LOADING_BAR_WIDTH - filled)


def loading_frames(text: str | None = None) -> list[str]:
    """Загрузка 0…100% с полоской из 10 делений и песочными часами. Последний кадр —
    текст пользователя, если он есть, иначе «✅ Загрузка завершена!»."""
    final = _normalize(text, MAX_LONG_TEXT, DEFAULT_LOADING_DONE)
    frames = []
    for i, percent in enumerate(LOADING_PERCENTS):
        spinner = LOADING_SPINNER[i % len(LOADING_SPINNER)]
        frames.append(f"{spinner} Загрузка…\n{loading_bar(percent)} {percent}%")
    frames.append(final)
    return frames


# =================================================================== .mock

def _mockable(ch: str) -> bool:
    """Буква латиницы или кириллицы, у которой есть обе формы (строчная и заглавная)."""
    if not ch.isalpha() or len(ch.lower()) != 1 or len(ch.upper()) != 1 or ch.lower() == ch.upper():
        return False
    name = unicodedata.name(ch, "")
    return name.startswith(("LATIN ", "CYRILLIC "))


def mock_text(text: str) -> str:
    """«sPoNgEbOb»: буквы латиницы и кириллицы по очереди строчная/заглавная, начиная со
    строчной. Остальные символы стоят на месте и очередь не сдвигают.
    Пустой ввод → пустая строка (что делать в этом случае, решает обработчик)."""
    upper = False
    out = []
    for ch in _normalize(text, MAX_LONG_TEXT):
        if _mockable(ch):
            out.append(ch.upper() if upper else ch.lower())
            upper = not upper
        else:
            out.append(ch)
    return "".join(out)


# =================================================================== реестр

ANIMATIONS: dict[str, Callable[[str | None], list[str]]] = {
    "love": lambda text: love_frames(text or None),
    "rose": lambda text: rose_frames(text or None),
    "fire": lambda text: fire_frames(text or None),
    "heart": lambda text: heart_frames(text or None),
    "type": lambda text: type_frames(text or DEFAULT_TYPE_TEXT),
    "glitch": lambda text: glitch_frames(text or DEFAULT_GLITCH_TEXT),
    "loading": lambda text: loading_frames(text or None),
}
